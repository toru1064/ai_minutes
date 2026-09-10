import json
import logging
from datetime import date, datetime, timezone
from decimal import Decimal

from botocore.exceptions import ClientError

from bedrock_service import generate_minutes
from dynamodb_service import (
    get_minutes,
    get_minutes_by_id,
    save_minutes,
    update_ai_minutes,
    update_minutes_status, update_minutes
)
from task_service import (
    get_task_by_id,
    get_ai_task,
    get_tasks,
    save_task,
    update_task, sync_tasks_project
)
from project_service import (
    get_project_by_id,
    get_projects,
    save_project, update_project, sync_project_name
)
from user_service import ensure_demo_user, get_user, list_users, save_user
from attachment_service import (
    AttachmentError, complete_upload, delete_attachment, presign_download,
    presign_upload,
)
from demo_access import (QuotaExceeded, can_demo_mutate, consume_quota,
                         demo_metadata, is_demo_user, public_item)

LOGGER = logging.getLogger(__name__)


# API Gatewayへ返すレスポンスを作成
def _json_default(value):
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)

    raise TypeError(
        f"Object of type {type(value).__name__} is not JSON serializable"
    )


def create_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json; charset=utf-8"
        },
        "body": json.dumps(body, ensure_ascii=False, default=_json_default)
    }


def lambda_handler(event, context):
    try:
        return _dispatch(event)
    except json.JSONDecodeError:
        return create_response(400, {"message": "リクエストの形式が正しくありません"})
    except Exception:
        # Do not include the event, request body, claims, identifiers, or the
        # exception text: those can contain credentials or personal data.
        LOGGER.exception("Unhandled Lambda request failure")
        return create_response(500, {"message": "サーバー内部でエラーが発生しました"})


def _dispatch(event):
    # API Gateway経由の場合はbodyをJSONに変換
    if "body" in event:
        body = json.loads(event["body"] or "{}")
    else:
        body = event

    route_key = event.get("routeKey", "")
    path_parameters = event.get("pathParameters") or {}
    minutes_id = path_parameters.get("minutes_id")
    project_id = path_parameters.get("project_id")
    task_id = path_parameters.get("task_id")

    # ユーザーAPI（固定パスを完全一致させ、/users/meを一覧より先に判定）
    if route_key == "GET /users/me":
        return handle_user_me(event)
    if route_key == "PUT /users/me":
        return handle_user_save(body, event)
    if route_key == "GET /users":
        return handle_user_list(event)

    # チケットAPI
    if route_key == "GET /tasks":
        return handle_task_list(event.get("queryStringParameters") or {}, event)
    if route_key == "POST /tasks":
        return handle_task_save(body, event)
    if route_key == "GET /tasks/{task_id}":
        return handle_task_detail(task_id, event)
    if route_key == "PATCH /tasks/{task_id}":
        return handle_task_update(task_id, body, event)
    if route_key == "POST /tasks/{task_id}/attachments/presign":
        return handle_attachment_presign(task_id, body, event)
    if route_key == "POST /tasks/{task_id}/attachments/complete":
        return handle_attachment_complete(task_id, body, event)
    if route_key == "GET /tasks/{task_id}/attachments/{attachment_id}/download":
        return handle_attachment_download(task_id, path_parameters.get("attachment_id"), event)
    if route_key == "DELETE /tasks/{task_id}/attachments/{attachment_id}":
        return handle_attachment_delete(task_id, path_parameters.get("attachment_id"), event)

    # プロジェクトを1件取得
    if route_key == "GET /projects/{project_id}":
        return handle_project_detail(project_id, event)
    if route_key == "PATCH /projects/{project_id}":
        return handle_project_update(project_id, body, event)

    # プロジェクト一覧を取得
    if route_key == "GET /projects":
        return handle_project_list(event)

    # プロジェクトを登録
    if route_key == "POST /projects":
        return handle_project_save(body, event)

    # 保存済みの原文からAI議事録を生成
    if route_key == "POST /minutes/{minutes_id}/generate":
        return handle_generate_saved(minutes_id, event)

    # 議事録の状態を更新
    if route_key == "PATCH /minutes/{minutes_id}/status":
        return handle_update_status(minutes_id, body, event)
    if route_key == "PATCH /minutes/{minutes_id}":
        return handle_minutes_update(minutes_id, body, event)

    # IDを指定して議事録を1件取得
    if route_key == "GET /minutes/{minutes_id}":
        return handle_detail(minutes_id, event)

    # GET /minutesは議事録一覧を取得
    if route_key == "GET /minutes":
        return handle_list(event)

    # POST /minutesはDynamoDBへの保存
    if route_key == "POST /minutes":
        return handle_save(body, event)

    # 従来の動作確認用AI生成API
    if route_key == "POST /minutes/generate":
        return create_response(403, {"message": "デモモードでは保存前のAI生成は利用できません"}) if is_demo_user(event) else handle_generate(body)

    return create_response(
        404,
        {"message": "APIルートが見つかりません"}
    )


def _claims(event):
    return event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})


def _authenticated_claims(event):
    claims = _claims(event)
    return claims if claims.get("sub") else None


def _forbidden_demo(event, item=None):
    if is_demo_user(event) and (item is None or not can_demo_mutate(event, item)):
        return create_response(403, {"message": "デモモードではこのデータを変更できません"})
    return None


def _charge(event, kind):
    try:
        quota = consume_quota(event, kind)
        return None, quota
    except QuotaExceeded as error:
        return create_response(429, {"message": "デモモードの本日の利用上限に達しました",
                                     "limit": error.limit, "remaining": 0}), None


def _ensure_demo_profile(event, current=None):
    """Provision DemoUser from the trusted JWT sub; this is not a mutation quota."""
    if current is not None or not is_demo_user(event):
        return current
    claims = _authenticated_claims(event)
    return ensure_demo_user(claims["sub"]) if claims else None


def _attachment_response(event, operation):
    claims = _authenticated_claims(event)
    if not claims:
        return create_response(401, {"message": "認証情報にsubがありません"})
    try:
        return operation(claims)
    except AttachmentError as error:
        return create_response(error.status, {"message": error.message})
    except Exception:
        LOGGER.exception("attachment API failed")
        return create_response(500, {"message": "添付ファイルの処理に失敗しました"})


def handle_attachment_presign(task_id, body, event):
    if is_demo_user(event):
        return create_response(403, {"message": "デモモードでは添付ファイルを追加できません"})
    return _attachment_response(event, lambda claims: create_response(200, presign_upload(task_id, body)))


def handle_attachment_complete(task_id, body, event):
    if is_demo_user(event):
        return create_response(403, {"message": "デモモードでは添付ファイルを追加できません"})
    def operation(claims):
        profile = get_user(claims["sub"])
        display = profile.get("display_name") if profile else _current_user(event)
        attachments = complete_upload(task_id, body, claims["sub"], display)
        return create_response(201, {"message": "ファイルを添付しました", "attachments": attachments})
    return _attachment_response(event, operation)


def handle_attachment_download(task_id, attachment_id, event):
    return _attachment_response(event, lambda claims: create_response(200, presign_download(task_id, attachment_id)))


def handle_attachment_delete(task_id, attachment_id, event):
    if is_demo_user(event):
        return create_response(403, {"message": "デモモードでは添付ファイルを削除できません"})
    def operation(claims):
        profile = get_user(claims["sub"])
        display = profile.get("display_name") if profile else _current_user(event)
        attachments = delete_attachment(task_id, attachment_id, display)
        return create_response(200, {"message": "ファイルを削除しました", "attachments": attachments})
    return _attachment_response(event, operation)


def handle_user_me(event):
    claims = _authenticated_claims(event)
    if not claims:
        return create_response(401, {"message": "認証情報にsubがありません"})
    item = _ensure_demo_profile(event, get_user(claims["sub"]))
    if item:
        return create_response(200, {"user": item, "registered": True})
    username = claims.get("preferred_username") or claims.get("cognito:username") or claims.get("username", "")
    initial_name = claims.get("name") or (claims.get("email", "").split("@", 1)[0]) or username
    return create_response(200, {"user": {"user_id": claims["sub"], "display_name": initial_name,
        "email": claims.get("email", ""), "username": username}, "registered": False})


def handle_user_save(body, event):
    claims = _authenticated_claims(event)
    if not claims:
        return create_response(401, {"message": "認証情報にsubがありません"})
    if is_demo_user(event):
        return create_response(403, {"message": "デモモードではプロフィールを変更できません"})
    if set(body) - {"display_name"}:
        return create_response(400, {"message": "display_name以外は更新できません"})
    value = body.get("display_name")
    if not isinstance(value, str) or not value.strip():
        return create_response(400, {"message": "表示名を入力してください"})
    display_name = value.strip()
    if len(display_name) > 50:
        return create_response(400, {"message": "表示名は50文字以内で入力してください"})
    return create_response(200, {"message": "プロフィールを保存しました",
        "user": save_user(claims["sub"], display_name, claims), "registered": True})


def handle_user_list(event):
    claims = _authenticated_claims(event)
    if not claims:
        return create_response(401, {"message": "認証情報にsubがありません"})
    if is_demo_user(event):
        _ensure_demo_profile(event, get_user(claims["sub"]))
    return create_response(200, {"users": list_users()})


def _resolve_user(data, id_field, name_field):
    """Validate a Cognito sub and replace an untrusted display-name snapshot."""
    user_id = data.get(id_field)
    if not user_id:
        return None
    user = get_user(user_id)
    if not user:
        return create_response(400, {"message": "指定された登録ユーザーが見つかりません", "fields": [id_field]})
    data[name_field] = user["display_name"]
    return None


# 議事録を1件取得
def handle_detail(minutes_id, event=None):
    if not minutes_id:
        return create_response(
            400,
            {"message": "議事録IDが指定されていません"}
        )

    minutes = get_minutes_by_id(minutes_id)

    if not minutes:
        return create_response(
            404,
            {"message": "議事録が見つかりません"}
        )

    claims = _authenticated_claims(event or {})
    user_id = claims.get("sub") if claims else ""
    permissions = {
        "can_edit": _can_edit_minutes(minutes, user_id),
        "can_approve": bool(minutes.get("approver_id") and minutes.get("approver_id") == user_id),
    }
    minutes = public_item(event or {}, minutes)
    minutes["permissions"] = permissions
    minutes["task_progress"] = _task_progress(minutes_id)
    return create_response(
        200,
        {"minutes": minutes}
    )


# DynamoDBから議事録一覧を取得
def handle_list(event=None):
    items = get_minutes()
    tasks = get_tasks()
    for item in items:
        item["task_progress"] = _task_progress(item["minutes_id"], tasks)
    items = [public_item(event or {}, item) for item in items]

    return create_response(
        200,
        {"minutes": items}
    )


# BedrockでAI議事録を生成
def handle_generate(body):
    meeting_text = body.get("meeting_text", "").strip()

    if not meeting_text:
        return create_response(
            400,
            {"message": "会議内容を入力してください"}
        )

    minutes = generate_minutes(meeting_text, body.get("meeting_date"))

    return create_response(200, minutes)


# 保存済みの原文からAI議事録を生成して保存
def handle_generate_saved(minutes_id, event):
    if not minutes_id:
        return create_response(
            400,
            {"message": "議事録IDが指定されていません"}
        )

    current_minutes = get_minutes_by_id(minutes_id)

    if not current_minutes:
        return create_response(
            404,
            {"message": "議事録が見つかりません"}
        )
    denied = _forbidden_demo(event, current_minutes)
    if denied:
        return denied

    # すでに生成済みならBedrockを再実行しない
    if current_minutes.get("ai_minutes"):
        return create_response(
            200,
            {
                "message": "保存済みのAI議事録を取得しました",
                "minutes": current_minutes
            }
        )

    meeting_text = (
        current_minutes
        .get("raw_minutes", "")
        .strip()
    )

    if not meeting_text:
        return create_response(
            400,
            {"message": "会議内容の原文がありません"}
        )

    limited, quota = _charge(event, "ai")
    if limited:
        return limited

    ai_minutes = generate_minutes(meeting_text, current_minutes.get("meeting_date"))

    previous_history = current_minutes.get("change_history", [])
    regenerated = any(
        entry.get("action") == "ai_cleared"
        or "raw_minutes" in entry.get("changed_fields", {})
        for entry in previous_history
        if isinstance(entry, dict)
    )
    history_entry = {
        "action": "ai_recreated" if regenerated else "ai_created",
        "operated_by": _current_user(event),
        "operated_at": datetime.now(timezone.utc).isoformat(),
        "changed_fields": {}
    }
    updated_minutes = update_ai_minutes(minutes_id, ai_minutes, history_entry)

    return create_response(
        200,
        {
            "message": "AI議事録を作成しました",
            "minutes": public_item(event, updated_minutes),
            **({"quota": quota} if quota else {})
        }
    )


# DynamoDBへ議事録を保存
def handle_save(body, event):
    body = dict(body)
    for field in ("demo_data", "demo_owner_id", "expires_at"):
        body.pop(field, None)
    claims = _authenticated_claims(event)
    if not claims:
        return create_response(401, {"message": "認証情報にsubがありません"})
    for id_field, name_field in (("assignee_id", "assignee"), ("approver_id", "approver")):
        error = _resolve_user(body, id_field, name_field)
        if error:
            return error
    required_fields = [
        "project_id",
        "meeting_name",
        "meeting_date",
        "assignee_id",
        "approver_id",
        "raw_minutes"
    ]

    # 必須項目が入力されているか確認
    missing_fields = [
        field
        for field in required_fields
        if not body.get(field)
    ]

    if missing_fields:
        return create_response(
            400,
            {
                "message": "必須項目が不足しています",
                "fields": missing_fields
            }
        )

    registered_by = _current_user(event)
    body["registered_by_id"] = claims["sub"]

    project = get_project_by_id(body["project_id"])

    if not project:
        return create_response(
            400,
            {"message": "指定されたプロジェクトが見つかりません"}
        )

    # 表示用のプロジェクト名はサーバー側で設定する
    body["project_name"] = project["project_name"]

    body.update(demo_metadata(event))
    limited, quota = _charge(event, "write")
    if limited:
        return limited
    item = save_minutes(body, registered_by)

    return create_response(
        201,
        {
            "message": "議事録を保存しました",
            "minutes": public_item(event, item), **({"quota": quota} if quota else {})
        }
    )


# プロジェクト一覧を取得
def handle_project_list(event=None):
    return create_response(
        200,
        {"projects": [public_item(event or {}, item) for item in get_projects()]}
    )


# プロジェクトを1件取得
def handle_project_detail(project_id, event=None):
    project = get_project_by_id(project_id)

    if not project:
        return create_response(
            404,
            {"message": "プロジェクトが見つかりません"}
        )

    related_minutes = [
        item
        for item in get_minutes()
        if item.get("project_id") == project_id
    ]

    return create_response(
        200,
        {
            "project": public_item(event or {}, project),
            "minutes": [public_item(event or {}, item) for item in related_minutes]
        }
    )


# プロジェクトを登録
def handle_project_save(body, event):
    body = dict(body)
    for field in ("demo_data", "demo_owner_id", "expires_at"):
        body.pop(field, None)
    error = _resolve_user(body, "manager_id", "manager")
    if error:
        return error
    required_fields = [
        "project_name",
        "manager",
        "start_date"
    ]

    missing_fields = [
        field
        for field in required_fields
        if not body.get(field)
    ]

    if missing_fields:
        return create_response(
            400,
            {
                "message": "必須項目が不足しています",
                "fields": missing_fields
            }
        )

    allowed_statuses = [
        "active",
        "on_hold",
        "completed"
    ]

    if body.get("status", "active") not in allowed_statuses:
        return create_response(
            400,
            {"message": "プロジェクトの状態が正しくありません"}
        )

    end_date = body.get("end_date")

    if end_date and end_date < body["start_date"]:
        return create_response(
            400,
            {"message": "終了予定日は開始日以降にしてください"}
        )

    claims = (
        event
        .get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )

    created_by = _current_user(event)
    body.update(demo_metadata(event))
    limited, quota = _charge(event, "write")
    if limited:
        return limited
    project = save_project(body, created_by)

    return create_response(
        201,
        {
            "message": "プロジェクトを登録しました",
            "project": public_item(event, project), **({"quota": quota} if quota else {})
        }
    )


def _history(current, updates, user, raw_field=None):
    changed = {}
    for key, value in updates.items():
        if current.get(key, "") != value:
            if key.endswith("_id"):
                changed[key] = {"changed": True}
                name_key = key[:-3]
                changed.setdefault(name_key, {"before": current.get(name_key, ""),
                                              "after": updates.get(name_key, current.get(name_key, ""))})
                continue
            # 原文とAI生成結果は機密性・サイズの面から内容を履歴へ保存しない。
            changed[key] = ({"changed": True} if key in {raw_field, "ai_minutes"}
                            else {"before": current.get(key, ""), "after": value})
    history_fields = {key: value for key, value in changed.items() if not key.endswith("_id")}
    return changed, {"action": "edited", "operated_by": user,
                     "operated_at": datetime.now(timezone.utc).isoformat(),
                     "changed_fields": history_fields}


def _normalize_newlines(value):
    """Compare multiline text consistently without changing stored content."""
    return value.replace("\r\n", "\n").replace("\r", "\n") if isinstance(value, str) else value


def handle_project_update(project_id, body, event):
    current = get_project_by_id(project_id)
    if not current:
        return create_response(404, {"message": "プロジェクトが見つかりません"})
    denied = _forbidden_demo(event, current)
    if denied:
        return denied
    allowed = {"project_name", "manager", "manager_id", "status", "start_date", "end_date", "description"}
    if set(body) - allowed:
        return create_response(400, {"message": "更新できない項目が含まれています"})
    updates = {key: (value.strip() if isinstance(value, str) else value) for key, value in body.items()}
    error = _resolve_user(updates, "manager_id", "manager")
    if error:
        return error
    if any(not updates.get(key) for key in ("project_name", "manager", "start_date")):
        return create_response(400, {"message": "必須項目を入力してください"})
    if updates.get("status") not in {"active", "on_hold", "completed"}:
        return create_response(400, {"message": "プロジェクトの状態が正しくありません"})
    if not _valid_date(updates.get("start_date")) or (updates.get("end_date") and not _valid_date(updates["end_date"])):
        return create_response(400, {"message": "日付が正しくありません"})
    if updates.get("end_date") and updates["end_date"] < updates["start_date"]:
        return create_response(400, {"message": "終了予定日は開始日以降にしてください"})
    changed, history = _history(current, updates, _current_user(event))
    if not changed:
        return create_response(200, {"message": "変更はありません", "project": current})
    limited, quota = _charge(event, "write")
    if limited:
        return limited
    try:
        project = update_project(project_id, {k: updates[k] for k in changed}, history)
        if "project_name" in changed and not is_demo_user(event):
            sync_project_name(project_id, project["project_name"])
            sync_tasks_project(project_id, project["project_name"])
    except ClientError:
        LOGGER.exception("Project related-data update failed")
        return create_response(500, {"message": "関連データの更新中に失敗しました。再度お試しください"})
    return create_response(200, {"message": "更新しました", "project": public_item(event, project), **({"quota": quota} if quota else {})})


def handle_minutes_update(minutes_id, body, event):
    current = get_minutes_by_id(minutes_id)
    if not current:
        return create_response(404, {"message": "議事録が見つかりません"})
    denied = _forbidden_demo(event, current)
    if denied:
        return denied
    claims = _authenticated_claims(event)
    if not claims:
        return create_response(401, {"message": "認証情報にsubがありません"})
    if not _can_edit_minutes(current, claims["sub"]):
        return create_response(403, {"message": "この議事録を編集する権限がありません"})
    allowed = {"project_id", "meeting_name", "meeting_date", "assignee", "assignee_id", "approver", "approver_id", "raw_minutes"}
    if set(body) - allowed:
        return create_response(400, {"message": "更新できない項目が含まれています"})
    updates = {key: (value.strip() if isinstance(value, str) and key != "raw_minutes" else value) for key, value in body.items()}
    for id_field, name_field in (("assignee_id", "assignee"), ("approver_id", "approver")):
        error = _resolve_user(updates, id_field, name_field)
        if error:
            return error
    if not updates:
        return create_response(200, {"message": "変更はありません", "minutes": current})
    if any(not updates.get(key) for key in updates):
        return create_response(400, {"message": "必須項目を入力してください"})
    if "meeting_date" in updates and not _valid_date(updates["meeting_date"]):
        return create_response(400, {"message": "会議日が正しくありません"})
    project = None
    if "project_id" in updates:
        project = get_project_by_id(updates["project_id"])
        if not project:
            return create_response(400, {"message": "指定されたプロジェクトが見つかりません"})
        updates["project_name"] = project["project_name"]
    raw_changed = ("raw_minutes" in updates and
                   _normalize_newlines(updates["raw_minutes"]) !=
                   _normalize_newlines(current.get("raw_minutes", "")))
    if "raw_minutes" in updates and not raw_changed:
        updates.pop("raw_minutes")
    if raw_changed:
        updates["ai_minutes"] = {}
    # An approved/pending record returns to draft only when an actual user field changed.
    user_changed = any(current.get(key, "") != value for key, value in updates.items())
    if user_changed and (raw_changed or current.get("status") in {"pending", "approved"}):
        updates["status"] = "draft"
    changed, history = _history(current, updates, _current_user(event), "raw_minutes")
    if not changed:
        return create_response(200, {"message": "変更はありません", "minutes": current})
    limited, quota = _charge(event, "write")
    if limited:
        return limited
    if raw_changed:
        history["operations"] = ["raw_minutes_changed"]
        if current.get("ai_minutes"):
            history["operations"].append("ai_minutes_cleared")
    if "status" in changed:
        history["system_changed_fields"] = ["status"]
    updated = update_minutes(minutes_id, {k: updates[k] for k in changed}, history)
    if "project_id" in changed and not is_demo_user(event):
        sync_tasks_project(project["project_id"], project["project_name"], minutes_id)
    return create_response(200, {"message": "更新しました", "minutes": public_item(event, updated), **({"quota": quota} if quota else {})})


# 議事録の状態を更新
def handle_update_status(minutes_id, body, event):
    if not minutes_id:
        return create_response(
            400,
            {"message": "議事録IDが指定されていません"}
        )

    current_minutes = get_minutes_by_id(minutes_id)

    if not current_minutes:
        return create_response(
            404,
            {"message": "議事録が見つかりません"}
        )
    denied = _forbidden_demo(event, current_minutes)
    if denied:
        return denied

    claims = _authenticated_claims(event)
    if not claims:
        return create_response(401, {"message": "認証情報にsubがありません"})

    new_status = body.get("status")
    rejection_reason = body.get("rejection_reason", "").strip()

    # AI議事録の作成前は承認申請できない
    if (
        new_status == "pending"
        and not current_minutes.get("ai_minutes")
    ):
        return create_response(
            400,
            {"message": "先にAI議事録を作成してください"}
        )

    allowed_statuses = [
        "pending",
        "approved",
        "rejected"
    ]

    if new_status not in allowed_statuses:
        return create_response(
            400,
            {"message": "指定された状態が正しくありません"}
        )

    allowed_transitions = {
        "draft": ["pending"],
        "rejected": ["pending"],
        "pending": ["approved", "rejected"]
    }

    if new_status not in allowed_transitions.get(
        current_minutes.get("status", "draft"), []
    ):
        return create_response(
            400,
            {"message": "現在の状態ではこの操作を実行できません"}
        )

    if new_status in {"approved", "rejected"}:
        # Legacy rows without approver_id deliberately remain unapprovable until
        # an owner selects and saves an approver. Display names are not identity.
        if not current_minutes.get("approver_id") or current_minutes["approver_id"] != claims["sub"]:
            return create_response(403, {"message": "指定された承認者本人だけが承認・差し戻しできます"})
    elif not _can_edit_minutes(current_minutes, claims["sub"]):
        return create_response(403, {"message": "この議事録を承認申請する権限がありません"})

    if new_status == "rejected" and not rejection_reason:
        return create_response(
            400,
            {"message": "差し戻し理由を入力してください"}
        )
    limited, quota = _charge(event, "write")
    if limited:
        return limited

    operated_by = _current_user(event)

    updated_minutes = update_minutes_status(
        minutes_id,
        new_status,
        operated_by,
        rejection_reason or None,
        _task_progress(minutes_id) if new_status == "approved" else None
    )

    return create_response(
        200,
        {
            "message": "状態を更新しました",
            "minutes": public_item(event, updated_minutes), **({"quota": quota} if quota else {})
        }
    )


def _can_edit_minutes(minutes, user_id):
    """Use immutable IDs only; never grant legacy display-name ownership."""
    return bool(user_id) and user_id in {
        minutes.get("registered_by_id"), minutes.get("owner_id"),
        minutes.get("demo_owner_id"),
    }


TASK_STATUSES = {"not_started", "in_progress", "completed"}
LEGACY_TASK_STATUSES = {"review_pending", "rejected"}
TASK_PRIORITIES = {"low", "normal", "high", "urgent"}
TASK_REQUIRED_FIELDS = ("source_minutes_id", "title", "assignee", "due_date")
TASK_EDITABLE_FIELDS = {"source_minutes_id", "title", "description", "assignee", "assignee_id", "due_date", "priority", "status", "resolution"}

def _task_progress(minutes_id, tasks=None):
    related = [task for task in (tasks if tasks is not None else get_tasks({"source_minutes_id": minutes_id})) if task.get("source_minutes_id") == minutes_id]
    completed = sum(task.get("status") == "completed" for task in related)
    in_progress = sum(task.get("status") in {"in_progress", "review_pending", "rejected"} for task in related)
    not_started = sum(task.get("status") == "not_started" for task in related)
    total = len(related)
    return {
        "total_tasks": total,
        "not_started_tasks": not_started,
        "in_progress_tasks": in_progress,
        "completed_tasks": completed,
        "incomplete_tasks": total - completed,
        "approved_with_incomplete_tasks": total > completed,
    }

def _current_user(event):
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    # 表示名を保存できる場合は優先する。既存のメールアドレスやsubの履歴は
    # フロント側で短縮表示し、保存済みデータそのものは変更しない。
    email = claims.get("email", "")
    email_name = email.split("@", 1)[0] if "@" in email else email
    return (claims.get("name") or claims.get("preferred_username") or
            claims.get("cognito:username") or claims.get("username") or
            email_name or claims.get("sub") or "不明なユーザー")

def _valid_date(value):
    try:
        date.fromisoformat(value)
        return True
    except (TypeError, ValueError):
        return False

def _validate_task(data, require_all=True):
    if require_all:
        missing = [field for field in TASK_REQUIRED_FIELDS if not str(data.get(field, "")).strip()]
        if missing:
            return "必須項目が不足しています", missing
    for field in TASK_REQUIRED_FIELDS:
        if field in data and not str(data[field]).strip():
            return f"{field}は空欄にできません", [field]
    if "due_date" in data and not _valid_date(data["due_date"]):
        return "期限はYYYY-MM-DD形式で指定してください", ["due_date"]
    if "status" in data and data["status"] not in TASK_STATUSES:
        return "チケットの状態が正しくありません", ["status"]
    if data.get("priority", "normal") not in TASK_PRIORITIES:
        return "優先度が正しくありません", ["priority"]
    return None, []

def handle_task_list(filters, event=None):
    allowed = {key: filters[key] for key in ("project_id", "assignee", "status", "source_minutes_id") if filters.get(key)}
    if allowed.get("status") and allowed["status"] not in TASK_STATUSES | LEGACY_TASK_STATUSES:
        return create_response(400, {"message": "チケットの状態が正しくありません"})
    return create_response(200, {"tasks": [public_item(event or {}, item) for item in get_tasks(allowed)]})

def handle_task_detail(task_id, event=None):
    task = get_task_by_id(task_id)
    if not task:
        return create_response(404, {"message": "チケットが見つかりません"})
    task["attachments"] = task.get("attachments") if isinstance(task.get("attachments"), list) else []
    return create_response(200, {"task": public_item(event or {}, task)})

def handle_task_save(body, event):
    body = dict(body)
    for field in ("demo_data", "demo_owner_id", "expires_at"):
        body.pop(field, None)
    error = _resolve_user(body, "assignee_id", "assignee")
    if error:
        return error
    message, fields = _validate_task(body)
    if message:
        return create_response(400, {"message": message, "fields": fields})
    minutes = get_minutes_by_id(body["source_minutes_id"])
    if not minutes:
        return create_response(400, {"message": "指定された関連議事録が見つかりません"})
    data = dict(body)
    if data.get("source_type") == "ai":
        if data.get("source_todo_index") is None:
            return create_response(400, {"message": "AI TODO候補番号が必要です"})
        duplicate = get_ai_task(body["source_minutes_id"], data["source_todo_index"])
        if duplicate:
            return create_response(409, {"message": "このAI TODO候補はチケット作成済みです", "task": duplicate})
    else:
        data["source_type"] = "manual"
    data["project_id"] = minutes["project_id"]
    data["project_name"] = minutes["project_name"]
    data.update(demo_metadata(event))
    limited, quota = _charge(event, "write")
    if limited:
        return limited
    task = save_task(data, _current_user(event))
    return create_response(201, {"message": "チケットを登録しました", "task": public_item(event, task), **({"quota": quota} if quota else {})})

def handle_task_update(task_id, body, event):
    current = get_task_by_id(task_id)
    if not current:
        return create_response(404, {"message": "チケットが見つかりません"})
    denied = _forbidden_demo(event, current)
    if denied:
        return denied
    unknown = set(body) - TASK_EDITABLE_FIELDS
    if unknown:
        return create_response(400, {"message": "更新できない項目が含まれています", "fields": sorted(unknown)})
    if not body:
        return create_response(400, {"message": "更新内容を指定してください"})
    message, fields = _validate_task(body, False)
    if message:
        return create_response(400, {"message": message, "fields": fields})
    updates = dict(body)
    error = _resolve_user(updates, "assignee_id", "assignee")
    if error:
        return error
    if "source_minutes_id" in updates:
        minutes = get_minutes_by_id(updates["source_minutes_id"])
        if not minutes:
            return create_response(400, {"message": "指定された関連議事録が見つかりません"})
        updates["project_id"] = minutes["project_id"]
        updates["project_name"] = minutes["project_name"]
    changed, history = _history(current, updates, _current_user(event))
    if not changed:
        return create_response(200, {"message": "変更はありません", "task": current})
    limited, quota = _charge(event, "write")
    if limited:
        return limited
    try:
        task = update_task(task_id, {k: updates[k] for k in changed}, history)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return create_response(404, {"message": "チケットが見つかりません"})
        raise
    return create_response(200, {"message": "チケットを更新しました", "task": public_item(event, task), **({"quota": quota} if quota else {})})
