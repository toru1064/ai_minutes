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
    items = []
    scan_args = {"FilterExpression": "entity_type = :entity_type",
                 "ExpressionAttributeValues": {":entity_type": "project"}}
    while True:
        response = table.scan(**scan_args)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        scan_args["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    return sorted(
        items,
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


def update_project(project_id, updates, history_entry):
    now = datetime.now(timezone.utc).isoformat()
    names = {f"#{key}": key for key in updates}
    values = {f":{key}": value for key, value in updates.items()}
    names["#updated_at"] = "updated_at"
    parts = [f"#{key} = :{key}" for key in updates]
    parts += ["#updated_at = :updated_at",
              "change_history = list_append(if_not_exists(change_history, :empty), :history)"]
    values.update({":updated_at": now, ":empty": [], ":history": [history_entry]})
    response = table.update_item(
        Key={"minutes_id": f"{PROJECT_PREFIX}{project_id}"},
        UpdateExpression="SET " + ", ".join(parts),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ConditionExpression="attribute_exists(minutes_id)", ReturnValues="ALL_NEW")
    return response.get("Attributes")


def sync_project_name(project_id, project_name):
    """Denormalized names are updated across every paged scan result."""
    scan_args = {}
    while True:
        response = table.scan(**scan_args)
        for item in response.get("Items", []):
            if item.get("entity_type") == "minutes" and item.get("project_id") == project_id:
                table.update_item(Key={"minutes_id": item["minutes_id"]},
                                  UpdateExpression="SET project_name = :name",
                                  ExpressionAttributeValues={":name": project_name})
        if "LastEvaluatedKey" not in response:
            break
        scan_args["ExclusiveStartKey"] = response["LastEvaluatedKey"]
