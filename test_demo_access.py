import json
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock
from botocore.exceptions import ClientError
import demo_access as demo


def event(groups=None, sub="demo-sub"):
    claims = {"sub": sub}
    if groups is not None:
        claims["cognito:groups"] = groups
    return {"requestContext": {"authorizer": {"jwt": {"claims": claims}}}}


class DemoAccessTests(unittest.TestCase):
    def test_group_formats(self):
        for groups in (["Users", "DemoUser"], '["Users", "DemoUser"]', "[Users, DemoUser]", "DemoUser"):
            self.assertTrue(demo.is_demo_user(event(groups)), groups)
        self.assertFalse(demo.is_demo_user(event("DemoUsers")))

    def test_metadata_and_owner_are_server_values(self):
        now = datetime(2026, 9, 9, tzinfo=timezone.utc)
        data = demo.demo_metadata(event(["DemoUser"]), now)
        self.assertIs(data["demo_data"], True)
        self.assertEqual(data["demo_owner_id"], "demo-sub")
        self.assertIsInstance(data["expires_at"], int)
        self.assertEqual(data["expires_at"], int(now.timestamp()) + 86400)

    def test_mutation_requires_exact_owner_and_true(self):
        e = event(["DemoUser"])
        self.assertTrue(demo.can_demo_mutate(e, {"demo_data": True, "demo_owner_id": "demo-sub"}))
        self.assertFalse(demo.can_demo_mutate(e, {"demo_data": 1, "demo_owner_id": "demo-sub"}))
        self.assertFalse(demo.can_demo_mutate(e, {"demo_data": True, "demo_owner_id": "other"}))
        self.assertTrue(demo.can_demo_mutate(event(["Users"]), {}))

    def test_public_response_hides_owner(self):
        item = demo.public_item(event(["DemoUser"]), {"demo_data": True, "demo_owner_id": "demo-sub"})
        self.assertNotIn("demo_owner_id", item)
        self.assertTrue(item["can_demo_edit"])

    def test_normal_user_has_no_quota(self):
        table = Mock()
        self.assertIsNone(demo.consume_quota(event(["Users"]), "ai", table=table))
        table.update_item.assert_not_called()

    def test_quota_limit_condition_is_atomic_and_raises(self):
        error = ClientError({"Error": {"Code": "ConditionalCheckFailedException", "Message": "no"}}, "UpdateItem")
        table = Mock(); table.update_item.side_effect = [error, error, error]
        with self.assertRaises(demo.QuotaExceeded):
            demo.consume_quota(event(["DemoUser"]), "ai", table=table)
        first = table.update_item.call_args_list[0].kwargs
        self.assertIn("#count < :limit", first["ConditionExpression"])
        self.assertEqual(first["ExpressionAttributeValues"][":limit"], 3)
