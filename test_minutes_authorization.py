import json
import unittest
from unittest.mock import patch

import lambda_function


def event(sub="user-1", groups=None):
    claims = {"sub": sub, "name": "同じ表示名"}
    if groups:
        claims["cognito:groups"] = groups
    return {"requestContext": {"authorizer": {"jwt": {"claims": claims}}}}


def body(response):
    return json.loads(response["body"])


class MinutesAuthorizationTests(unittest.TestCase):
    def minutes(self, **updates):
        value = {"minutes_id": "m1", "status": "pending", "approver_id": "approver",
                 "registered_by_id": "owner", "assignee_id": "assignee", "ai_minutes": {"summary": "x"}}
        value.update(updates)
        return value

    @patch.object(lambda_function, "update_minutes_status", return_value={})
    @patch.object(lambda_function, "_task_progress", return_value={})
    @patch.object(lambda_function, "get_minutes_by_id")
    def test_only_approver_can_approve_and_reject(self, get_minutes, _progress, update):
        get_minutes.return_value = self.minutes()
        for status, extra in (("approved", {}), ("rejected", {"rejection_reason": "修正してください"})):
            response = lambda_function.handle_update_status("m1", {"status": status, **extra}, event("approver"))
            self.assertEqual(response["statusCode"], 200)
        self.assertEqual(update.call_count, 2)

    @patch.object(lambda_function, "get_minutes_by_id")
    def test_owner_assignee_same_name_and_spoofed_body_are_forbidden(self, get_minutes):
        get_minutes.return_value = self.minutes()
        for sub in ("owner", "assignee", "another-user"):
            response = lambda_function.handle_update_status(
                "m1", {"status": "approved", "approver_id": sub, "operated_by": "同じ表示名"}, event(sub))
            self.assertEqual(response["statusCode"], 403)

    @patch.object(lambda_function, "get_minutes_by_id")
    def test_demo_user_has_same_approver_check(self, get_minutes):
        get_minutes.return_value = self.minutes(demo_data=True, demo_owner_id="demo")
        response = lambda_function.handle_update_status("m1", {"status": "approved"}, event("demo", ["DemoUser"]))
        self.assertEqual(response["statusCode"], 403)

    @patch.object(lambda_function, "update_minutes_status", return_value={})
    @patch.object(lambda_function, "get_minutes_by_id")
    def test_owner_can_resubmit_rejected_but_other_user_cannot(self, get_minutes, update):
        get_minutes.return_value = self.minutes(status="rejected")
        self.assertEqual(lambda_function.handle_update_status("m1", {"status": "pending"}, event("owner"))["statusCode"], 200)
        self.assertEqual(lambda_function.handle_update_status("m1", {"status": "pending"}, event("other"))["statusCode"], 403)

    @patch.object(lambda_function, "get_minutes_by_id")
    def test_only_owner_can_edit_after_rejection(self, get_minutes):
        get_minutes.return_value = self.minutes(status="rejected")
        with patch.object(lambda_function, "update_minutes", return_value={}) as update:
            allowed = lambda_function.handle_minutes_update("m1", {"meeting_name": "更新"}, event("owner"))
            denied = lambda_function.handle_minutes_update("m1", {"meeting_name": "偽装"}, event("other"))
        self.assertEqual(allowed["statusCode"], 200)
        self.assertEqual(denied["statusCode"], 403)
        update.assert_called_once()

    @patch.object(lambda_function, "get_minutes_by_id")
    def test_legacy_approver_name_never_authorizes(self, get_minutes):
        get_minutes.return_value = self.minutes(approver_id=None, approver="同じ表示名")
        self.assertEqual(lambda_function.handle_update_status("m1", {"status": "approved"}, event("approver"))["statusCode"], 403)


if __name__ == "__main__":
    unittest.main()
