import json
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock

import boto3
from botocore.exceptions import ClientError
from botocore.stub import Stubber
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

    def test_new_day_update_item_is_valid_after_resource_serialization(self):
        """Validate the exact wire request, not merely that update_item was called."""
        resource = boto3.resource(
            "dynamodb", region_name="ap-northeast-1",
            aws_access_key_id="test", aws_secret_access_key="test",
            endpoint_url="https://dynamodb.ap-northeast-1.amazonaws.com",
        )
        table = resource.Table("ai-users")
        client = resource.meta.client
        names = {"#date": "demo_write_date", "#count": "demo_write_count"}
        with Stubber(client) as stubber:
            stubber.add_client_error(
                "update_item", "ConditionalCheckFailedException",
                expected_params={
                    "TableName": "ai-users", "Key": {"user_id": "demo-sub"},
                    "UpdateExpression": "SET #date = :today, #count = if_not_exists(#count, :zero) + :one",
                    "ConditionExpression": "#date = :today AND (attribute_not_exists(#count) OR #count < :limit)",
                    "ExpressionAttributeNames": names,
                    "ExpressionAttributeValues": {":today": "2026-09-09", ":zero": 0,
                                                  ":one": 1, ":limit": 30},
                    "ReturnValues": "UPDATED_NEW",
                },
            )
            stubber.add_response(
                "update_item",
                {"Attributes": {"demo_write_date": {"S": "2026-09-09"},
                                "demo_write_count": {"N": "1"}}},
                {"TableName": "ai-users", "Key": {"user_id": "demo-sub"},
                 "UpdateExpression": "SET #date = :today, #count = :one",
                 "ConditionExpression": "attribute_not_exists(#date) OR #date <> :today",
                 "ExpressionAttributeNames": names,
                 "ExpressionAttributeValues": {":today": "2026-09-09", ":one": 1},
                 "ReturnValues": "UPDATED_NEW"},
            )
            result = demo.consume_quota(
                event(["DemoUser"]), "write",
                now=datetime(2026, 9, 9, tzinfo=timezone.utc), table=table,
            )
        self.assertEqual(result, {"limit": 30, "remaining": 29})
