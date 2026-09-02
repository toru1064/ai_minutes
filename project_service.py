import uuid
from datetime import datetime, timezone

import boto3


dynamodb = boto3.resource(
    "dynamodb",
    region_name="ap-northeast-1"
)

table = dynamodb.Table("ai-minutes")

PROJECT_PREFIX = "PROJECT#"
PROJECT_COUNTER_ID = "SYSTEM#PROJECT_COUNTER"


def get_next_project_number():
    response = table.update_item(
        Key={"minutes_id": PROJECT_COUNTER_ID},
        UpdateExpression="ADD current_number :increment",
        ExpressionAttributeValues={":increment": 1},
        ReturnValues="UPDATED_NEW"
    )

    return int(response["Attributes"]["current_number"])


def save_project(project_data, created_by):
    now = datetime.now(timezone.utc).isoformat()
    project_uuid = str(uuid.uuid4())

    item = {
        # 既存テーブルのパーティションキーを共用する
        "minutes_id": f"{PROJECT_PREFIX}{project_uuid}",
        "entity_type": "project",
        "project_id": project_uuid,
        "project_number": str(get_next_project_number()),
        "project_name": project_data["project_name"].strip(),
        "description": project_data.get("description", "").strip(),
        "manager": project_data["manager"].strip(),
        "start_date": project_data["start_date"],
        "end_date": project_data.get("end_date", ""),
        "status": project_data.get("status", "active"),
        "created_by": created_by,
        "created_at": now,
        "updated_at": now
    }

    table.put_item(Item=item)
    return item


def get_projects():
    response = table.scan(
        FilterExpression="entity_type = :entity_type",
        ExpressionAttributeValues={
            ":entity_type": "project"
        }
    )

    return sorted(
        response.get("Items", []),
        key=lambda item: int(item.get("project_number", 0))
    )


def get_project_by_id(project_id):
    if not project_id:
        return None

    response = table.get_item(
        Key={
            "minutes_id": f"{PROJECT_PREFIX}{project_id}"
        }
    )

    item = response.get("Item")

    if not item or item.get("entity_type") != "project":
        return None

    return item
