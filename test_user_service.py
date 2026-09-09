import unittest
from unittest.mock import Mock, patch

import user_service
from botocore.exceptions import ClientError


class UserServiceTest(unittest.TestCase):
    @patch.object(user_service, "table")
    def test_demo_profile_is_created_once_without_client_fields(self, table):
        with patch.object(user_service, "datetime") as clock:
            clock.now.return_value.isoformat.return_value = "created"
            item = user_service.ensure_demo_user("jwt-sub")
        self.assertEqual(item, {"user_id": "jwt-sub", "display_name": "デモユーザー",
                                "created_at": "created", "updated_at": "created"})
        table.put_item.assert_called_once_with(
            Item=item, ConditionExpression="attribute_not_exists(user_id)")

    @patch.object(user_service, "get_user", return_value={"user_id": "jwt-sub", "display_name": "既存名"})
    @patch.object(user_service, "table")
    def test_demo_profile_does_not_overwrite_existing_profile(self, table, get_user):
        table.put_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException", "Message": "exists"}}, "PutItem")
        self.assertEqual(user_service.ensure_demo_user("jwt-sub")["display_name"], "既存名")
        get_user.assert_called_once_with("jwt-sub")

    @patch.object(user_service, "get_user")
    @patch.object(user_service, "table")
    def test_created_at_is_preserved_on_update(self, table, get_user):
        get_user.return_value = {"created_at": "original", "email": "old@example.com"}
        with patch.object(user_service, "datetime") as clock:
            clock.now.return_value.isoformat.return_value = "updated"
            item = user_service.save_user("sub", "中野", {})
        self.assertEqual(item["created_at"], "original")
        self.assertEqual(item["updated_at"], "updated")
        table.put_item.assert_called_once_with(Item=item)

    @patch.object(user_service, "get_user", return_value=None)
    @patch.object(user_service, "table")
    def test_new_user_gets_created_at(self, table, _):
        with patch.object(user_service, "datetime") as clock:
            clock.now.return_value.isoformat.return_value = "created"
            item = user_service.save_user("sub", "中野", {})
        self.assertEqual(item["created_at"], "created")


if __name__ == "__main__":
    unittest.main()
