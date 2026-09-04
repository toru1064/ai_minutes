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
        "source_minutes_id": task_data["source_minutes_id"],
        "title": task_data["title"].strip(),
        "description": task_data.get("description", "").strip(),
        "assignee": task_data["assignee"].strip(),
        "resolution": task_data.get("resolution", "").strip(),
        "due_date": task_data["due_date"],
        "priority": task_data.get("priority", "normal"),
        "status": "not_started",
        "source_type": task_data.get("source_type", "manual"),
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "change_history": [{
            "action": "created", "operated_by": created_by,
            "operated_at": now, "changed_fields": {}
        }]
    }
    if task_data.get("source_todo_index") is not None:
        item["source_todo_index"] = str(task_data["source_todo_index"])
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
    for field in ("project_id", "assignee", "status", "source_minutes_id"):
        if filters.get(field):
            tasks = [item for item in tasks if item.get(field) == filters[field]]
    return sorted(tasks, key=lambda item: int(item.get("task_number", 0)))


def get_task_by_id(task_id):
    if not task_id:
        return None
    return table.get_item(Key={"task_id": task_id}).get("Item")


def get_ai_task(minutes_id, todo_index):
    """正式チケットを基準に、AI TODO候補の登録済み状態を調べる。"""
    index = str(todo_index)
    return next((task for task in get_tasks({"source_minutes_id": minutes_id})
                 if task.get("source_type") == "ai"
                 and str(task.get("source_todo_index")) == index), None)


def update_task(task_id, updates, history_entry=None):
    updated = dict(updates)
    updated["updated_at"] = datetime.now(timezone.utc).isoformat()
    names = {f"#{key}": key for key in updated}
    values = {f":{key}": value for key, value in updated.items()}
    expression_parts = [
        f"#{key} = :{key}" for key in updated
    ]
    if history_entry:
        values.update({":empty": [], ":history": [history_entry]})
        expression_parts.append("change_history = list_append(if_not_exists(change_history, :empty), :history)")
    expression = "SET " + ", ".join(expression_parts)
    response = table.update_item(
        Key={"task_id": task_id},
        UpdateExpression=expression,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ConditionExpression="attribute_exists(task_id)",
        ReturnValues="ALL_NEW"
    )
    return response.get("Attributes")


def sync_tasks_project(project_id, project_name, source_minutes_id=None):
    for task in get_tasks():
        matches = task.get("source_minutes_id") == source_minutes_id if source_minutes_id else task.get("project_id") == project_id
        if matches:
            table.update_item(Key={"task_id": task["task_id"]},
                UpdateExpression="SET project_id = :id, project_name = :name",
                ExpressionAttributeValues={":id": project_id, ":name": project_name})
