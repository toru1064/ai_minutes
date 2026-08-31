import json

from bedrock_service import generate_minutes
from dynamodb_service import get_minutes, save_minutes


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

    # GET /minutesは議事録一覧を取得
    if route_key == "GET /minutes":
        return handle_list()

    # POST /minutesはDynamoDBへの保存
    if route_key == "POST /minutes":
        return handle_save(body, event)

    # POST /minutes/generateはAI議事録を生成
    return handle_generate(body)


# DynamoDBから議事録一覧を取得
def handle_list():
    items = get_minutes()

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


# DynamoDBへ議事録を保存
def handle_save(body, event):
    required_fields = [
        "meeting_name",
        "meeting_date",
        "assignee",
        "approver",
        "raw_minutes",
        "ai_minutes"
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

    item = save_minutes(body, registered_by)

    return create_response(
        201,
        {
            "message": "議事録を保存しました",
            "minutes": item
        }
    )