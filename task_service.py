import uuid
from datetime import datetime, timezone

import boto3


dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
table = dynamodb.Table("ai-tasks")
COUNTER_ID = "SYSTEM#TASK_COUNTER"


def get_next_task_number():
    response = table.update_item(
        Key={"task_id": COUNTER_ID},
        UpdateExpression="ADD current_number :increment",
        ExpressionAttributeValues={":increment": 1},
        ReturnValues="UPDATED_NEW"
    )
    return int(response["Attributes"]["current_number"])


def save_task(task_data, created_by):
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "task_id": str(uuid.uuid4()),
        "task_number": str(get_next_task_number()),
        "project_id": task_data["project_id"],
        "project_name": task_data["project_name"],
        "title": task_data["title"].strip(),
        "description": task_data.get("description", "").strip(),
        "assignee": task_data["assignee"].strip(),
        "reviewer": task_data["reviewer"].strip(),
        "due_date": task_data["due_date"],
        "priority": task_data.get("priority", "normal"),
        "status": "not_started",
        "source_type": "manual",
        "source_minutes_id": "",
        "created_by": created_by,
        "created_at": now,
        "updated_at": now
    }
    table.put_item(Item=item)
    return item


def get_tasks(filters=None):
    items = []
    scan_args = {}
    while True:
        response = table.scan(**scan_args)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        scan_args["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    filters = filters or {}
    tasks = [item for item in items if item.get("task_id") != COUNTER_ID]
    for field in ("project_id", "assignee", "status"):
        if filters.get(field):
            tasks = [item for item in tasks if item.get(field) == filters[field]]
    return sorted(tasks, key=lambda item: int(item.get("task_number", 0)), reverse=True)


def get_task_by_id(task_id):
    if not task_id:
        return None
    return table.get_item(Key={"task_id": task_id}).get("Item")


def update_task(task_id, updates):
    updated = dict(updates)
    updated["updated_at"] = datetime.now(timezone.utc).isoformat()
    names = {f"#{key}": key for key in updated}
    values = {f":{key}": value for key, value in updated.items()}
    expression = "SET " + ", ".join(
        f"#{key} = :{key}" for key in updated
    )
    response = table.update_item(
        Key={"task_id": task_id},
        UpdateExpression=expression,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ConditionExpression="attribute_exists(task_id)",
        ReturnValues="ALL_NEW"
    )
    return response.get("Attributes")
