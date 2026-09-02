import uuid
from datetime import datetime, timezone

import boto3


# DynamoDBのai-minutesテーブルを取得
dynamodb = boto3.resource(
    "dynamodb",
    region_name="ap-northeast-1"
)

table = dynamodb.Table("ai-minutes")


# 議事録をDynamoDBへ保存
def save_minutes(minutes_data, registered_by):
    now = datetime.now(timezone.utc).isoformat()

    item = {
        # 重複しない議事録IDを自動生成
        "minutes_id": str(uuid.uuid4()),

        "meeting_name": minutes_data["meeting_name"],
        "meeting_date": minutes_data["meeting_date"],
        "assignee": minutes_data["assignee"],
        "approver": minutes_data["approver"],
        "raw_minutes": minutes_data["raw_minutes"],
        "ai_minutes": minutes_data["ai_minutes"],

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

    # 更新日時が新しい順に並べる
    return sorted(
        items,
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
def update_minutes_status(minutes_id, status):
    updated_at = datetime.now(
        timezone.utc
    ).isoformat()

    response = table.update_item(
        Key={
            "minutes_id": minutes_id
        },
        UpdateExpression=(
            "SET #status = :status, "
            "updated_at = :updated_at"
        ),
        ExpressionAttributeNames={
            "#status": "status"
        },
        ExpressionAttributeValues={
            ":status": status,
            ":updated_at": updated_at
        },
        ReturnValues="ALL_NEW"
    )

    return response.get("Attributes")