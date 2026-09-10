import json
from unittest.mock import patch
import lambda_function
import unittest

def event(sub="me"):
    return {"requestContext":{"authorizer":{"jwt":{"claims":{"sub":sub}}}}}

def body(response): return json.loads(response["body"])

class AssignmentUserTest(unittest.TestCase):
    def test_invalid_assignee_is_rejected(self):
        with patch.object(lambda_function,"get_user",return_value=None):
            response=lambda_function.handle_task_save({"source_minutes_id":"m","title":"t","assignee_id":"bad","assignee":"偽名","due_date":"2026-09-05"},event())
        self.assertEqual(response["statusCode"],400)

    def test_server_display_name_wins(self):
        task={"task_id":"t"}
        with patch.object(lambda_function,"get_user",return_value={"user_id":"u","display_name":"正しい名前"}), patch.object(lambda_function,"get_minutes_by_id",return_value={"project_id":"p","project_name":"P"}), patch.object(lambda_function,"save_task",return_value=task) as save:
            response=lambda_function.handle_task_save({"source_minutes_id":"m","title":"t","assignee_id":"u","assignee":"偽名","due_date":"2026-09-05"},event())
        self.assertEqual(response["statusCode"],201)
        self.assertEqual(save.call_args.args[0]["assignee"],"正しい名前")

    def test_forged_assignee_name_without_id_is_rejected(self):
        response = lambda_function.handle_task_save(
            {"source_minutes_id":"m", "title":"t", "assignee":"偽名", "due_date":"2026-09-05"},
            event())
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("assignee_id", body(response)["fields"])

    def test_project_manager_id_is_validated_and_server_name_wins(self):
        project = {"project_id":"p"}
        request = {"project_name":"P", "manager_id":"u", "manager":"偽名", "start_date":"2026-09-05"}
        with patch.object(lambda_function,"get_user",return_value={"user_id":"u","display_name":"正しい名前"}), patch.object(lambda_function,"save_project",return_value=project) as save, patch.object(lambda_function,"_charge",return_value=(None,None)):
            response = lambda_function.handle_project_save(request, event())
        self.assertEqual(response["statusCode"], 201)
        self.assertEqual(save.call_args.args[0]["manager"], "正しい名前")

    def test_unknown_project_manager_id_is_rejected(self):
        with patch.object(lambda_function, "get_user", return_value=None):
            response = lambda_function.handle_project_save(
                {"project_name":"P", "manager_id":"unknown", "manager":"偽名", "start_date":"2026-09-05"},
                event())
        self.assertEqual(response["statusCode"], 400)

    def test_forged_project_manager_name_without_id_is_rejected(self):
        response = lambda_function.handle_project_save(
            {"project_name":"P", "manager":"偽名", "start_date":"2026-09-05"}, event())
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("manager_id", body(response)["fields"])

    def test_partial_update_keeps_assignment(self):
        with patch.object(lambda_function,"get_task_by_id",return_value={"task_id":"t","assignee_id":"u","assignee":"名前","title":"old"}), patch.object(lambda_function,"update_task",return_value={"task_id":"t"}) as update:
            response=lambda_function.handle_task_update("t",{"title":"new"},event())
        self.assertEqual(response["statusCode"],200)
        self.assertNotIn("assignee",update.call_args.args[1])
