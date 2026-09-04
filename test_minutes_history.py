import unittest
from unittest.mock import patch

import dynamodb_service
from lambda_function import _history, _normalize_newlines


class MinutesHistoryTest(unittest.TestCase):
    @patch.object(dynamodb_service, "get_next_minutes_number", return_value=12)
    @patch.object(dynamodb_service.table, "put_item")
    def test_new_minutes_stores_created_history(self, put_item, _counter):
        item = dynamodb_service.save_minutes({
            "project_id": "p1", "project_name": "案件", "meeting_name": "定例",
            "meeting_date": "2026-09-04", "assignee": "担当", "approver": "承認者",
            "raw_minutes": "非公開の原文",
        }, "creator")

        created = item["change_history"]
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["action"], "created")
        self.assertEqual(created[0]["entity_type"], "minutes")
        self.assertEqual(created[0]["operated_by"], "creator")
        self.assertNotIn("raw_minutes", created[0])
        put_item.assert_called_once_with(Item=item)

    def test_sensitive_minutes_content_is_not_copied_to_history(self):
        current = {"raw_minutes": "古い原文", "ai_minutes": {"summary": "巨大な旧データ"}}
        changed, history = _history(current, {
            "raw_minutes": "新しい原文", "ai_minutes": {"summary": "巨大な新データ"}
        }, "editor", "raw_minutes")

        self.assertEqual(changed["raw_minutes"], {"changed": True})
        self.assertEqual(changed["ai_minutes"], {"changed": True})
        self.assertNotIn("古い原文", str(history))
        self.assertNotIn("巨大な新データ", str(history))

    def test_newline_normalization_ignores_crlf_only_changes(self):
        self.assertEqual(_normalize_newlines("a\r\nb\r"), _normalize_newlines("a\nb\n"))


if __name__ == "__main__":
    unittest.main()
