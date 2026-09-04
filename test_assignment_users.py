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

    def test_partial_update_keeps_assignment(self):
        with patch.object(lambda_function,"get_task_by_id",return_value={"task_id":"t","assignee_id":"u","assignee":"名前","title":"old"}), patch.object(lambda_function,"update_task",return_value={"task_id":"t"}) as update:
            response=lambda_function.handle_task_update("t",{"title":"new"},event())
        self.assertEqual(response["statusCode"],200)
        self.assertNotIn("assignee",update.call_args.args[1])
