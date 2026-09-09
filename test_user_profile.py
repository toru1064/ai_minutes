import json
import unittest
from unittest.mock import patch

import lambda_function


def event(sub="jwt-sub", **claims):
    values = {"sub": sub, "email": "nakano@example.com", **claims}
    if sub is None:
        values.pop("sub")
    return {"requestContext": {"authorizer": {"jwt": {"claims": values}}}}


class UserApiTest(unittest.TestCase):
    def body(self, response):
        return json.loads(response["body"])

    @patch("lambda_function.ensure_demo_user")
    @patch("lambda_function.get_user", return_value=None)
    def test_unregistered_demo_user_is_auto_created_from_jwt_sub(self, _, ensure):
        ensure.return_value = {"user_id": "jwt-sub", "display_name": "デモユーザー"}
        response = lambda_function.handle_user_me(event(**{"cognito:groups": '["DemoUser"]'}))
        self.assertEqual(response["statusCode"], 200)
        self.assertTrue(self.body(response)["registered"])
        ensure.assert_called_once_with("jwt-sub")

    @patch("lambda_function.list_users", return_value=[{"user_id": "jwt-sub", "display_name": "デモユーザー"}])
    @patch("lambda_function.ensure_demo_user", return_value={"user_id": "jwt-sub", "display_name": "デモユーザー"})
    @patch("lambda_function.get_user", return_value=None)
    def test_users_list_provisions_demo_for_assignment_options(self, _, ensure, __):
        response = lambda_function.handle_user_list(event(**{"cognito:groups": ["DemoUser"]}))
        self.assertEqual(self.body(response)["users"][0]["display_name"], "デモユーザー")
        ensure.assert_called_once_with("jwt-sub")

    @patch("lambda_function.consume_quota")
    @patch("lambda_function.ensure_demo_user", return_value={"user_id": "jwt-sub", "display_name": "デモユーザー"})
    @patch("lambda_function.get_user", return_value=None)
    def test_auto_profile_does_not_consume_write_quota(self, _, __, consume):
        lambda_function.handle_user_me(event(**{"cognito:groups": ["DemoUser"]}))
        consume.assert_not_called()

    @patch("lambda_function.get_task_by_id", return_value={"task_id": "task-1", "title": "閲覧対象"})
    def test_unregistered_demo_user_can_view_detail(self, _):
        response = lambda_function.handle_task_detail(
            "task-1", event(**{"cognito:groups": ["DemoUser"]}))
        self.assertEqual(response["statusCode"], 200)

    @patch("lambda_function.save_task")
    @patch("lambda_function.consume_quota", return_value={"limit": 30, "remaining": 29})
    @patch("lambda_function.get_minutes_by_id", return_value={
        "minutes_id": "minutes-1", "project_id": "project-1", "project_name": "デモPJ"})
    @patch("lambda_function.get_user", return_value={"user_id": "jwt-sub", "display_name": "デモユーザー"})
    def test_unregistered_demo_user_can_create_owned_demo_data(self, _, __, ___, save_task):
        save_task.side_effect = lambda data, created_by: {"task_id": "task-1", **data}
        response = lambda_function.handle_task_save({
            "source_minutes_id": "minutes-1", "title": "デモチケット",
            "assignee_id": "jwt-sub", "assignee": "クライアント値",
            "due_date": "2026-09-10"}, event(**{"cognito:groups": ["DemoUser"]}))
        self.assertEqual(response["statusCode"], 201)
        saved = save_task.call_args.args[0]
        self.assertIs(saved["demo_data"], True)
        self.assertEqual(saved["demo_owner_id"], "jwt-sub")
        self.assertEqual(saved["assignee"], "デモユーザー")

    @patch("lambda_function.save_user")
    def test_client_user_id_cannot_be_used(self, save):
        response = lambda_function.handle_user_save(
            {"display_name": "中野", "user_id": "attacker"}, event())
        self.assertEqual(response["statusCode"], 400)
        save.assert_not_called()

    def test_display_name_validation(self):
        for value in ("", "   ", "あ" * 51, None):
            self.assertEqual(lambda_function.handle_user_save(
                {"display_name": value}, event())["statusCode"], 400)

    @patch("lambda_function.save_user")
    def test_sub_is_passed_to_service(self, save):
        save.return_value = {"user_id": "jwt-sub", "display_name": "中野"}
        response = lambda_function.handle_user_save({"display_name": " 中野 "}, event())
        self.assertEqual(response["statusCode"], 200)
        save.assert_called_once_with("jwt-sub", "中野", unittest.mock.ANY)

    def test_missing_sub_is_unauthorized(self):
        self.assertEqual(lambda_function.handle_user_list(event(None))["statusCode"], 401)

    @patch("lambda_function.list_users", return_value=[])
    def test_empty_user_list_is_safe(self, _):
        response = lambda_function.handle_user_list(event())
        self.assertEqual(self.body(response), {"users": []})

    @patch("lambda_function.list_users", return_value=[{"user_id": "a", "display_name": "中野"}])
    def test_user_list_does_not_return_email(self, _):
        self.assertNotIn("email", self.body(lambda_function.handle_user_list(event()))["users"][0])


if __name__ == "__main__":
    unittest.main()
