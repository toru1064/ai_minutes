import json
import boto3


bedrock = boto3.client(
    "bedrock-runtime",
    region_name="ap-northeast-1"
)

meeting_text = """
8月25日に新しい社内システムについて会議を行った。
9月からAI議事録機能の開発を開始することに決定した。
田中さんは8月30日までに画面案を作成する。
佐藤さんは9月2日までにAWS構成案を作成する。
次回会議は9月3日の10時から行う。
"""

prompt = f"""
以下の会議内容を整理し、JSON形式だけで回答してください。
JSON以外の説明やマークダウンは付けないでください。
記載されていない情報は推測せず、nullにしてください。

以下の形式にしてください。
{{
    "summary": "会議の要約",
    "decisions": ["決定事項"],
    "todos": [
        {{
            "task": "TODOの内容",
            "assignee": "担当者",
            "deadline": "期限"
        }}
    ],
    "next_meeting": "次回会議"
}}

会議内容：
{meeting_text}
"""

response = bedrock.converse(
    modelId="apac.amazon.nova-micro-v1:0",
    messages=[
        {
            "role": "user",
            "content": [{"text": prompt}]
        }
    ],
    inferenceConfig={
        "maxTokens": 500,
        "temperature": 0
    }
)

result = response["output"]["message"]["content"][0]["text"]
minutes = json.loads(result)

print(json.dumps(minutes, ensure_ascii=False, indent=2))