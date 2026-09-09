"""Server-side authorization and quotas for the public portfolio demo."""
import json
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

DEMO_GROUP = "DemoUser"
DEMO_TTL_SECONDS = 24 * 60 * 60
AI_DAILY_LIMIT = 3
WRITE_DAILY_LIMIT = 30
_table = boto3.resource("dynamodb", region_name="ap-northeast-1").Table("ai-users")


def claims_from_event(event):
    claims = (event.get("requestContext", {}).get("authorizer", {})
              .get("jwt", {}).get("claims", {}))
    return claims if isinstance(claims, dict) else {}


def _groups(value):
    if isinstance(value, list):
        return value
    if not isinstance(value, str):
        return []
    value = value.strip()
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, str):
            value = parsed
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    # Cognito/API Gateway commonly serializes groups as "[a, b]" or CSV.
    return [part.strip(" \t\"'") for part in value.strip("[]").split(",")]


def is_demo_user(event):
    return DEMO_GROUP in _groups(claims_from_event(event).get("cognito:groups"))


def demo_identity(event):
    claims = claims_from_event(event)
    return claims.get("sub") if is_demo_user(event) else None


def demo_metadata(event, now=None):
    owner = demo_identity(event)
    if not owner:
        return {}
    now = now or datetime.now(timezone.utc)
    return {"demo_data": True, "demo_owner_id": owner,
            "expires_at": int(now.timestamp()) + DEMO_TTL_SECONDS}


def can_demo_mutate(event, item):
    owner = demo_identity(event)
    return not owner or (item.get("demo_data") is True and
                         item.get("demo_owner_id") == owner)


def public_item(event, item):
    """Return a copy without exposing the stable Cognito subject."""
    result = dict(item)
    result.pop("demo_owner_id", None)
    if is_demo_user(event):
        result["can_demo_edit"] = can_demo_mutate(event, item)
    return result


class QuotaExceeded(Exception):
    def __init__(self, limit):
        self.limit = limit
        super().__init__("daily demo quota exceeded")


def consume_quota(event, kind, now=None, table=None):
    """Atomically consume one quota unit. Bedrock failures remain charged."""
    owner = demo_identity(event)
    if not owner:
        return None
    if kind not in {"ai", "write"}:
        raise ValueError("unknown quota")
    table = table or _table
    today = (now or datetime.now(timezone.utc)).date().isoformat()
    date_name, count_name = f"demo_{kind}_date", f"demo_{kind}_count"
    limit = AI_DAILY_LIMIT if kind == "ai" else WRITE_DAILY_LIMIT
    names = {"#date": date_name, "#count": count_name}
    increment_values = {":today": today, ":zero": 0, ":one": 1, ":limit": limit}
    try:
        response = table.update_item(
            Key={"user_id": owner},
            UpdateExpression="SET #date = :today, #count = if_not_exists(#count, :zero) + :one",
            ConditionExpression="#date = :today AND (attribute_not_exists(#count) OR #count < :limit)",
            ExpressionAttributeNames=names, ExpressionAttributeValues=increment_values,
            ReturnValues="UPDATED_NEW")
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        try:
            response = table.update_item(
                Key={"user_id": owner}, UpdateExpression="SET #date = :today, #count = :one",
                ConditionExpression="attribute_not_exists(#date) OR #date <> :today",
                # DynamoDB rejects expression values that are not referenced by
                # this request.  In particular, :zero and :limit belong only to
                # the increment request above, not to the UTC-day reset.
                ExpressionAttributeNames=names,
                ExpressionAttributeValues={":today": today, ":one": 1},
                ReturnValues="UPDATED_NEW")
        except ClientError as retry_error:
            if retry_error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                # Another request won the UTC-day reset. Join that new counter;
                # the same upper-bound condition still prevents overrun.
                try:
                    response = table.update_item(
                        Key={"user_id": owner},
                        UpdateExpression="SET #date = :today, #count = if_not_exists(#count, :zero) + :one",
                        ConditionExpression="#date = :today AND #count < :limit",
                        ExpressionAttributeNames=names,
                        ExpressionAttributeValues=increment_values,
                        ReturnValues="UPDATED_NEW")
                except ClientError as final_error:
                    if final_error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                        raise QuotaExceeded(limit) from None
                    raise
            else:
                raise
    count = int(response["Attributes"][count_name])
    return {"limit": limit, "remaining": max(0, limit - count)}
