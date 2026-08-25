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
以下の会議内容を整理してください。

出力項目：
・会議の要約
・決定事項
・TODO
・担当者
・期限
・次回会議

記載されていない情報は推測しないでください。

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
print(result)