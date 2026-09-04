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
