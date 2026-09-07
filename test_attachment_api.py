import json
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-1")
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")

import lambda_function


class AttachmentApiAuthenticationTest(unittest.TestCase):
    @patch.object(lambda_function, "presign_upload")
    def test_unauthenticated_and_missing_sub_are_rejected(self, presign):
        base={"routeKey":"POST /tasks/{task_id}/attachments/presign","pathParameters":{"task_id":"one"},"body":json.dumps({})}
        for context in ({}, {"authorizer":{"jwt":{"claims":{}}}}):
            event={**base,"requestContext":context}
            self.assertEqual(lambda_function.lambda_handler(event,None)["statusCode"],401)
        presign.assert_not_called()


if __name__ == "__main__": unittest.main()
