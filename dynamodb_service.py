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
        "updated_at": now
    }

    table.put_item(Item=item)

    return item


# 議事録一覧をDynamoDBから取得
def get_minutes():
    response = table.scan()
    items = response.get("Items", [])

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

    # 更新日時が新しい順に並べる
    return sorted(
        minutes_items,
        key=lambda item: item.get("updated_at", ""),
        reverse=True
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
def update_minutes_status(minutes_id, status, operated_by, rejection_reason=None):
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
def update_ai_minutes(minutes_id, ai_minutes):
    updated_at = datetime.now(
        timezone.utc
    ).isoformat()

    response = table.update_item(
        Key={
            "minutes_id": minutes_id
        },
        UpdateExpression=(
            "SET ai_minutes = :ai_minutes, "
            "updated_at = :updated_at"
        ),
        ExpressionAttributeValues={
            ":ai_minutes": ai_minutes,
            ":updated_at": updated_at
        },
        ReturnValues="ALL_NEW"
    )

    return response.get("Attributes")
