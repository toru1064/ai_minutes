import unittest
from unittest.mock import patch

import bedrock_service
from bedrock_service import normalize_deadlines


class DeadlineNormalizationTests(unittest.TestCase):
    def result(self, deadline):
        return {"summary": "要約", "decisions": [], "todos": [{"task": "作業", "deadline": deadline}]}

    def test_omitted_year_uses_meeting_year(self):
        value = normalize_deadlines(self.result("2023-09-15"), "9月15日まで", "2026-09-10")
        self.assertEqual(value["todos"][0]["deadline"], "2026-09-15")

    def test_explicit_year_is_kept(self):
        value = normalize_deadlines(self.result("2027-09-15"), "2027年9月15日まで", "2026-09-10")
        self.assertEqual(value["todos"][0]["deadline"], "2027-09-15")

    def test_unknown_year_without_meeting_date_is_not_guessed(self):
        value = normalize_deadlines(self.result("2023-09-15"), "9月15日まで", None)
        self.assertIsNone(value["todos"][0]["deadline"])

    def test_invalid_or_unsupported_output_is_safe(self):
        self.assertIsNone(normalize_deadlines(self.result("2026-02-30"), "2月30日", "2026-01-01")["todos"][0]["deadline"])
        self.assertEqual(normalize_deadlines({"todos": "invalid"}, "", "2026-01-01")["todos"], [])

    def test_timezone_boundary_does_not_change_meeting_year(self):
        value = normalize_deadlines(self.result("2025-01-02"), "1月2日まで", "2026-12-31")
        self.assertEqual(value["todos"][0]["deadline"], "2026-01-02")

    @patch.object(bedrock_service.bedrock, "converse")
    def test_malformed_bedrock_json_returns_safe_existing_shape(self, converse):
        converse.return_value = {"output": {"message": {"content": [{"text": "not-json"}]}}}
        self.assertEqual(bedrock_service.generate_minutes("判断できない期限", "2026-09-10"),
                         {"summary": "", "decisions": [], "todos": []})


if __name__ == "__main__":
    unittest.main()
