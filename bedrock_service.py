import json
import boto3


bedrock = boto3.client(
    "bedrock-runtime",
    region_name="ap-northeast-1"
)


def generate_minutes(meeting_text):
    prompt = f"""
以下は会議中の発言を記録した文章です。
内容を読み取り、議事録として整理してください。

必ず次のルールを守ってください。

・summaryには、会議の議題と結論を実際の内容に基づいて
  1～2文で記載する
・summaryに「会議の要約」という文字だけを出力しない
・decisionsには、会議で明確に決まった方針だけを入れる
・担当者が行う作業はdecisionsではなくtodosへ入れる
・次回会議の日時は、summary、decisions、todosのどこにも含めない
・decisionsは1項目につき、1つの決定事項だけを記載する
・decisionsには、会議で合意したすべての方針を漏れなく抽出する
・todosには、作業内容、担当者、期限を入れる
・担当者や期限が不明な場合はnullにする
・同じ内容をdecisionsとtodosの両方へ入れない
・記載されていない内容を推測しない
・該当する内容がない配列は空の配列にする
・JSON以外の説明やマークダウンは出力しない

次のJSON構造だけで回答してください。

{{
    "summary": "会議全体の内容を表す具体的な要約文",
    "decisions": [
        "会議で決定した方針"
    ],
    "todos": [
        {{
            "task": "実施する作業",
            "assignee": "担当者名またはnull",
            "deadline": "期限またはnull"
        }}
    ]
}}

会議内容：
{meeting_text}
"""

    response = bedrock.converse(
        modelId="apac.amazon.nova-micro-v1:0",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        inferenceConfig={
            "maxTokens": 700,
            "temperature": 0
        }
    )

    result = (
        response["output"]["message"]
        ["content"][0]["text"]
    )

    return json.loads(result)


if __name__ == "__main__":
    sample_text = """
新しい社内システムについて会議を行った。
9月からAI議事録機能の開発を開始することに決定した。
田中さんは8月30日までに画面案を作成する。
佐藤さんは9月2日までにAWS構成案を作成する。
"""

    minutes = generate_minutes(sample_text)

    print(
        json.dumps(
            minutes,
            ensure_ascii=False,
            indent=2
        )
    )