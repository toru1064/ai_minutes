import json
from datetime import date, datetime, timezone

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


# API Gatewayへ返すレスポンスを作成
def create_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json; charset=utf-8"
        },
        "body": json.dumps(body, ensure_ascii=False)
    }


def lambda_handler(event, context):
    # API Gateway経由の場合はbodyをJSONに変換
    if "body" in event:
        body = json.loads(event["body"] or "{}")
    else:
        body = event

    route_key = event.get("routeKey", "")
    path_parameters = event.get("pathParameters") or {}

    # チケットAPI
    if route_key == "GET /tasks":
        return handle_task_list(event.get("queryStringParameters") or {})
    if route_key == "POST /tasks":
        return handle_task_save(body, event)
    if route_key == "GET /tasks/{task_id}":
        return handle_task_detail(path_parameters.get("task_id"))
    if route_key == "PATCH /tasks/{task_id}":
        return handle_task_update(path_parameters.get("task_id"), body, event)

    # プロジェクトを1件取得
    if route_key == "GET /projects/{project_id}":
        project_id = path_parameters.get("project_id")
        return handle_project_detail(project_id)
    if route_key == "PATCH /projects/{project_id}":
        return handle_project_update(path_parameters.get("project_id"), body, event)

    # プロジェクト一覧を取得
    if route_key == "GET /projects":
        return handle_project_list()

    # プロジェクトを登録
    if route_key == "POST /projects":
        return handle_project_save(body, event)

    # 保存済みの原文からAI議事録を生成
    if route_key == "POST /minutes/{minutes_id}/generate":
        minutes_id = path_parameters.get("minutes_id")
        return handle_generate_saved(minutes_id)

    # 議事録の状態を更新
    if route_key == "PATCH /minutes/{minutes_id}/status":
        minutes_id = path_parameters.get("minutes_id")

        return handle_update_status(minutes_id, body, event)
    if route_key == "PATCH /minutes/{minutes_id}":
        return handle_minutes_update(minutes_id, body, event)

    # IDを指定して議事録を1件取得
    if route_key == "GET /minutes/{minutes_id}":
        minutes_id = path_parameters.get("minutes_id")
        return handle_detail(minutes_id)

    # GET /minutesは議事録一覧を取得
    if route_key == "GET /minutes":
        return handle_list()

    # POST /minutesはDynamoDBへの保存
    if route_key == "POST /minutes":
        return handle_save(body, event)

    # 従来の動作確認用AI生成API
    if route_key == "POST /minutes/generate":
        return handle_generate(body)

    return create_response(
        404,
        {"message": "APIルートが見つかりません"}
    )


# 議事録を1件取得
def handle_detail(minutes_id):
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

    minutes["task_progress"] = _task_progress(minutes_id)
    return create_response(
        200,
        {"minutes": minutes}
    )


# DynamoDBから議事録一覧を取得
def handle_list():
    items = get_minutes()
    tasks = get_tasks()
    for item in items:
        item["task_progress"] = _task_progress(item["minutes_id"], tasks)

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

    minutes = generate_minutes(meeting_text)

    return create_response(200, minutes)


# 保存済みの原文からAI議事録を生成して保存
def handle_generate_saved(minutes_id):
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

    ai_minutes = generate_minutes(meeting_text)

    updated_minutes = update_ai_minutes(
        minutes_id,
        ai_minutes
    )

    return create_response(
        200,
        {
            "message": "AI議事録を作成しました",
            "minutes": updated_minutes
        }
    )


# DynamoDBへ議事録を保存
def handle_save(body, event):
    required_fields = [
        "project_id",
        "meeting_name",
        "meeting_date",
        "assignee",
        "approver",
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

    # CognitoのJWTから登録者を取得
    claims = (
        event
        .get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )

    registered_by = (
        claims.get("email")
        or claims.get("sub")
    )

    project = get_project_by_id(body["project_id"])

    if not project:
        return create_response(
            400,
            {"message": "指定されたプロジェクトが見つかりません"}
        )

    # 表示用のプロジェクト名はサーバー側で設定する
    body["project_name"] = project["project_name"]

    item = save_minutes(body, registered_by)

    return create_response(
        201,
        {
            "message": "議事録を保存しました",
            "minutes": item
        }
    )


# プロジェクト一覧を取得
def handle_project_list():
    return create_response(
        200,
        {"projects": get_projects()}
    )


# プロジェクトを1件取得
def handle_project_detail(project_id):
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
            "project": project,
            "minutes": related_minutes
        }
    )


# プロジェクトを登録
def handle_project_save(body, event):
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

    created_by = claims.get("email") or claims.get("sub")
    project = save_project(body, created_by)

    return create_response(
        201,
        {
            "message": "プロジェクトを登録しました",
            "project": project
        }
    )


def _history(current, updates, user, raw_field=None):
    changed = {}
    for key, value in updates.items():
        if current.get(key, "") != value:
            changed[key] = ({"before": "（会議内容の原文）", "after": "会議内容の原文を変更"}
                            if key == raw_field else {"before": current.get(key, ""), "after": value})
    return changed, {"action": "edited", "operated_by": user,
                     "operated_at": datetime.now(timezone.utc).isoformat(),
                     "changed_fields": changed}


def handle_project_update(project_id, body, event):
    current = get_project_by_id(project_id)
    if not current:
        return create_response(404, {"message": "プロジェクトが見つかりません"})
    allowed = {"project_name", "manager", "status", "start_date", "end_date", "description"}
    if set(body) - allowed:
        return create_response(400, {"message": "更新できない項目が含まれています"})
    updates = {key: (value.strip() if isinstance(value, str) else value) for key, value in body.items()}
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
    try:
        project = update_project(project_id, {k: updates[k] for k in changed}, history)
        if "project_name" in changed:
            sync_project_name(project_id, project["project_name"])
            sync_tasks_project(project_id, project["project_name"])
    except ClientError:
        return create_response(500, {"message": "関連データの更新中に失敗しました。再度お試しください"})
    return create_response(200, {"message": "更新しました", "project": project})


def handle_minutes_update(minutes_id, body, event):
    current = get_minutes_by_id(minutes_id)
    if not current:
        return create_response(404, {"message": "議事録が見つかりません"})
    allowed = {"project_id", "meeting_name", "meeting_date", "assignee", "approver", "raw_minutes"}
    if set(body) - allowed:
        return create_response(400, {"message": "更新できない項目が含まれています"})
    updates = {key: (value.strip() if isinstance(value, str) else value) for key, value in body.items()}
    if any(not updates.get(key) for key in allowed):
        return create_response(400, {"message": "必須項目を入力してください"})
    if not _valid_date(updates["meeting_date"]):
        return create_response(400, {"message": "会議日が正しくありません"})
    project = get_project_by_id(updates["project_id"])
    if not project:
        return create_response(400, {"message": "指定されたプロジェクトが見つかりません"})
    updates["project_name"] = project["project_name"]
    raw_changed = updates["raw_minutes"] != current.get("raw_minutes", "")
    if raw_changed:
        updates["ai_minutes"] = {}
    if raw_changed or current.get("status") in {"pending", "approved"}:
        updates["status"] = "draft"
    changed, history = _history(current, updates, _current_user(event), "raw_minutes")
    if not changed:
        return create_response(200, {"message": "変更はありません", "minutes": current})
    updated = update_minutes(minutes_id, {k: updates[k] for k in changed}, history)
    if "project_id" in changed:
        sync_tasks_project(project["project_id"], project["project_name"], minutes_id)
    return create_response(200, {"message": "更新しました", "minutes": updated})


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

    if new_status == "rejected" and not rejection_reason:
        return create_response(
            400,
            {"message": "差し戻し理由を入力してください"}
        )

    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )
    operated_by = claims.get("email") or claims.get("sub")

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
            "minutes": updated_minutes
        }
    )


TASK_STATUSES = {"not_started", "in_progress", "completed"}
LEGACY_TASK_STATUSES = {"review_pending", "rejected"}
TASK_PRIORITIES = {"low", "normal", "high", "urgent"}
TASK_REQUIRED_FIELDS = ("source_minutes_id", "title", "assignee", "due_date")
TASK_EDITABLE_FIELDS = {"source_minutes_id", "title", "description", "assignee", "due_date", "priority", "status", "resolution"}

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
    return claims.get("email") or claims.get("sub") or "不明なユーザー"

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

def handle_task_list(filters):
    allowed = {key: filters[key] for key in ("project_id", "assignee", "status", "source_minutes_id") if filters.get(key)}
    if allowed.get("status") and allowed["status"] not in TASK_STATUSES | LEGACY_TASK_STATUSES:
        return create_response(400, {"message": "チケットの状態が正しくありません"})
    return create_response(200, {"tasks": get_tasks(allowed)})

def handle_task_detail(task_id):
    task = get_task_by_id(task_id)
    if not task:
        return create_response(404, {"message": "チケットが見つかりません"})
    return create_response(200, {"task": task})

def handle_task_save(body, event):
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
    task = save_task(data, _current_user(event))
    return create_response(201, {"message": "チケットを登録しました", "task": task})

def handle_task_update(task_id, body, event):
    current = get_task_by_id(task_id)
    if not current:
        return create_response(404, {"message": "チケットが見つかりません"})
    unknown = set(body) - TASK_EDITABLE_FIELDS
    if unknown:
        return create_response(400, {"message": "更新できない項目が含まれています", "fields": sorted(unknown)})
    if not body:
        return create_response(400, {"message": "更新内容を指定してください"})
    message, fields = _validate_task(body, False)
    if message:
        return create_response(400, {"message": message, "fields": fields})
    updates = dict(body)
    if "source_minutes_id" in updates:
        minutes = get_minutes_by_id(updates["source_minutes_id"])
        if not minutes:
            return create_response(400, {"message": "指定された関連議事録が見つかりません"})
        updates["project_id"] = minutes["project_id"]
        updates["project_name"] = minutes["project_name"]
    changed, history = _history(current, updates, _current_user(event))
    if not changed:
        return create_response(200, {"message": "変更はありません", "task": current})
    try:
        task = update_task(task_id, {k: updates[k] for k in changed}, history)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return create_response(404, {"message": "チケットが見つかりません"})
        raise
    return create_response(200, {"message": "チケットを更新しました", "task": task})
