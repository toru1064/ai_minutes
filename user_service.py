import os
from datetime import datetime, timezone

import boto3


dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
table = dynamodb.Table(os.environ.get("USERS_TABLE_NAME", "ai-users"))


def get_user(user_id):
    return table.get_item(Key={"user_id": user_id}).get("Item")


def list_users():
    items = []
    args = {}
    while True:
        response = table.scan(**args)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        args["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return sorted(
        ({"user_id": item["user_id"], "display_name": item["display_name"]}
         for item in items if item.get("user_id") and item.get("display_name")),
        key=lambda item: item["display_name"].casefold()
    )


def save_user(user_id, display_name, claims):
    current = get_user(user_id)
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "user_id": user_id,
        "display_name": display_name,
        "email": claims.get("email", current.get("email", "") if current else ""),
        "username": (claims.get("preferred_username") or claims.get("cognito:username") or
                     claims.get("username") or (current.get("username", "") if current else "")),
        "created_at": current.get("created_at", now) if current else now,
        "updated_at": now,
    }
    table.put_item(Item=item)
    return item
