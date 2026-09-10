import json
import re
from copy import deepcopy
from datetime import date
import boto3


bedrock = boto3.client(
    "bedrock-runtime",
    region_name="ap-northeast-1"
)


def _reference_date(meeting_date):
    try:
        return date.fromisoformat(meeting_date)
    except (TypeError, ValueError):
        return None


def _date_mentions(text):
    explicit = set()
    yearless = set()
    for match in re.finditer(r"(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日", text or ""):
        year, month, day = match.groups()
        try:
            if year:
                explicit.add(date(int(year), int(month), int(day)))
            else:
                yearless.add((int(month), int(day)))
        except ValueError:
            continue
    return explicit, yearless


def normalize_deadlines(ai_minutes, meeting_text, meeting_date):
    """Keep only dates supported by the source, completing omitted years safely."""
    if not isinstance(ai_minutes, dict):
        return {"summary": "", "decisions": [], "todos": []}
    result = deepcopy(ai_minutes)
    if not isinstance(result.get("summary"), str):
        result["summary"] = ""
    if not isinstance(result.get("decisions"), list):
        result["decisions"] = []
    todos = result.get("todos")
    if not isinstance(todos, list):
        result["todos"] = []
        return result
    reference = _reference_date(meeting_date)
    explicit, yearless = _date_mentions(meeting_text)
    safe_todos = []
    for todo in todos:
        if not isinstance(todo, dict):
            continue
        item = dict(todo)
        raw = item.get("deadline")
        try:
            parsed = date.fromisoformat(raw) if isinstance(raw, str) else None
        except ValueError:
            parsed = None
        if parsed in explicit:
            item["deadline"] = parsed.isoformat()
        elif parsed and (parsed.month, parsed.day) in yearless and reference:
            try:
                item["deadline"] = date(reference.year, parsed.month, parsed.day).isoformat()
            except ValueError:
                item["deadline"] = None
        else:
            item["deadline"] = None
        safe_todos.append(item)
    result["todos"] = safe_todos
    return result


def generate_minutes(meeting_text, meeting_date=None):
    reference = _reference_date(meeting_date)
    reference_instruction = (
        f"会議開催日は{reference.isoformat()}です。年が省略された月日は{reference.year}年として解釈してください。"
        if reference else
        "会議開催日を取得できません。年が省略された期限はdeadlineをnullにしてください。"
    )
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
・todosには、作業内容、担当者、期限を入れる
・担当者や期限が不明な場合はnullにする
・期限の年月日を明確に特定できる場合はdeadlineをYYYY-MM-DD形式にする
・{reference_instruction}
・原文に年が明記された期限はその年を保持する
・基準日でも年を特定できない期限や曖昧な期限はdeadlineをnullにする
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

    try:
        parsed = json.loads(result)
    except (json.JSONDecodeError, TypeError):
        parsed = {}
    return normalize_deadlines(parsed, meeting_text, meeting_date)


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
