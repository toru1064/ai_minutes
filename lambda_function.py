import json
from bedrock_service import generate_minutes


def lambda_handler(event, context):
    # API Gateway経由の場合はbodyをJSONに変換
    if "body" in event:
        body = json.loads(event["body"] or "{}")
    else:
        body = event

    # 入力された会議内容を取得
    meeting_text = body.get("meeting_text", "").strip()

    # 未入力の場合はエラーを返す
    if not meeting_text:
        return {
            "statusCode": 400,
            "headers": {
                "Content-Type": "application/json; charset=utf-8"
            },
            "body": json.dumps(
                {"message": "会議内容を入力してください"},
                ensure_ascii=False
            )
        }

    # Bedrockで議事録を生成
    minutes = generate_minutes(meeting_text)

    # 生成結果をJSONで返す
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json; charset=utf-8"
        },
        "body": json.dumps(minutes, ensure_ascii=False)
    }