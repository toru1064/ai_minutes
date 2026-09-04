import uuid
from datetime import datetime, timezone

import boto3


# DynamoDBのai-minutesテーブルを取得
dynamodb = boto3.resource(
    "dynamodb",
    region_name="ap-northeast-1"
)

table = dynamodb.Table("ai-minutes")


# 議事録番号を管理する項目のID
COUNTER_ID = "SYSTEM#MINUTES_COUNTER"


# 次の議事録番号を取得
def get_next_minutes_number():
    response = table.update_item(
        Key={
            "minutes_id": COUNTER_ID
        },

        # current_numberを1増やす
        # 管理項目がない場合は自動的に1から作成される
        UpdateExpression=(
            "ADD current_number :increment"
        ),

        ExpressionAttributeValues={
            ":increment": 1
        },

        ReturnValues="UPDATED_NEW"
    )

    return int(
        response["Attributes"]["current_number"]
    )


# 議事録をDynamoDBへ保存
def save_minutes(minutes_data, registered_by):
    now = datetime.now(timezone.utc).isoformat()

    # 作成順の議事録番号を取得
    minutes_number = get_next_minutes_number()

    item = {
        # 内部処理で使用する重複しないID
        "minutes_id": str(uuid.uuid4()),

        # 一覧画面に表示する連番
        "minutes_number": str(minutes_number),

        "entity_type": "minutes",

        # 議事録が所属するプロジェクト
        "project_id": minutes_data["project_id"],
        "project_name": minutes_data["project_name"],

        "meeting_name": minutes_data["meeting_name"],
        "meeting_date": minutes_data["meeting_date"],
        "assignee": minutes_data["assignee"],
        "approver": minutes_data["approver"],
        "raw_minutes": minutes_data["raw_minutes"],
        # AI議事録は詳細画面で後から生成する
        "ai_minutes": {},

        # Cognitoでログインしているユーザー
        "registered_by": registered_by,

        "status": "draft",
        "created_at": now,
        "updated_at": now,
        # 新規データは作成操作も変更履歴へ保存する。既存データは画面側で補完する。
        "change_history": [{
            "action": "created",
            "entity_type": "minutes",
            "operated_by": registered_by,
            "operated_at": now,
            "changed_fields": {}
        }]
    }
    for field in ("assignee_id", "approver_id"):
        if minutes_data.get(field):
            item[field] = minutes_data[field]

    table.put_item(Item=item)

    return item


# 議事録一覧をDynamoDBから取得
def get_minutes():
    items = []
    scan_args = {}
    while True:
        response = table.scan(**scan_args)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        scan_args["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    # 番号管理用の項目を一覧から除外
    minutes_items = [
        item
        for item in items
        if (
            item.get("minutes_id") != COUNTER_ID
            and not item.get("minutes_id", "").startswith("SYSTEM#")
            and not item.get("minutes_id", "").startswith("PROJECT#")
            and item.get("entity_type") != "project"
        )
    ]

    # 更新日時に影響されず、議事録番号の数値昇順で並べる
    return sorted(
        minutes_items,
        key=lambda item: int(item.get("minutes_number", 0)),
    )


# IDを指定して議事録を1件取得
def get_minutes_by_id(minutes_id):
    response = table.get_item(
        Key={
            "minutes_id": minutes_id
        }
    )

    return response.get("Item")


# 議事録の状態を更新
def update_minutes_status(minutes_id, status, operated_by, rejection_reason=None, task_progress=None):
    updated_at = datetime.now(
        timezone.utc
    ).isoformat()

    history_entry = {
        "action": status,
        "operated_by": operated_by or "不明なユーザー",
        "operated_at": updated_at
    }

    if rejection_reason:
        history_entry["rejection_reason"] = rejection_reason
    if status == "approved" and task_progress:
        history_entry.update(task_progress)

    response = table.update_item(
        Key={
            "minutes_id": minutes_id
        },
        UpdateExpression=(
            "SET #status = :status, "
            "updated_at = :updated_at, "
            "approval_history = list_append("
            "if_not_exists(approval_history, :empty_list), :history)"
        ),
        ExpressionAttributeNames={
            "#status": "status"
        },
        ExpressionAttributeValues={
            ":status": status,
            ":updated_at": updated_at,
            ":empty_list": [],
            ":history": [history_entry]
        },
        ReturnValues="ALL_NEW"
    )

    return response.get("Attributes")


# 生成したAI議事録を保存
def update_ai_minutes(minutes_id, ai_minutes, history_entry=None):
    updated_at = datetime.now(
        timezone.utc
    ).isoformat()

    expression = "SET ai_minutes = :ai_minutes, updated_at = :updated_at"
    values = {
        ":ai_minutes": ai_minutes,
        ":updated_at": updated_at
    }
    if history_entry:
        expression += ", change_history = list_append(if_not_exists(change_history, :empty), :history)"
        values.update({":empty": [], ":history": [history_entry]})
    response = table.update_item(
        Key={
            "minutes_id": minutes_id
        },
        UpdateExpression=expression,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW"
    )

    return response.get("Attributes")


def update_minutes(minutes_id, updates, history_entry):
    now = datetime.now(timezone.utc).isoformat()
    names = {f"#{key}": key for key in updates}
    names["#updated_at"] = "updated_at"
    values = {f":{key}": value for key, value in updates.items()}
    values.update({":updated_at": now, ":empty": [], ":history": [history_entry]})
    expression = [f"#{key} = :{key}" for key in updates]
    expression += ["#updated_at = :updated_at", "change_history = list_append(if_not_exists(change_history, :empty), :history)"]
    response = table.update_item(Key={"minutes_id": minutes_id},
        UpdateExpression="SET " + ", ".join(expression),
        ExpressionAttributeNames=names, ExpressionAttributeValues=values,
        ConditionExpression="attribute_exists(minutes_id)", ReturnValues="ALL_NEW")
    return response.get("Attributes")
