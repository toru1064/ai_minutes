import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-1")
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
os.environ.setdefault("ATTACHMENTS_BUCKET_NAME", "private-test-bucket")

import attachment_service as service

TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

def task(attachments=None):
    return {"task_id": TASK_ID, "attachments": attachments or [], "change_history": []}


class AttachmentServiceTest(unittest.TestCase):
    def test_size_and_type_validation(self):
        with self.assertRaises(service.AttachmentError):
            service.validate_file("x.pdf", "application/pdf", service.MAX_FILE_SIZE + 1)
        with self.assertRaises(service.AttachmentError):
            service.validate_file("x.exe", "application/octet-stream", 1)

    def test_dangerous_name_is_sanitized(self):
        self.assertNotIn("..", service.safe_file_name("../bad\\name\x00.pdf"))
        self.assertNotIn("/", service.safe_file_name("../bad.pdf"))

    @patch.object(service, "get_task_by_id", return_value=None)
    def test_missing_task_is_rejected(self, _get):
        with self.assertRaises(service.AttachmentError) as caught:
            service.presign_upload(TASK_ID, {"file_name":"x.pdf","content_type":"application/pdf","size":1})
        self.assertEqual(caught.exception.status, 404)

    @patch.object(service, "_s3")
    @patch.object(service, "get_task_by_id", return_value=task())
    def test_presign_creates_key_and_size_policy(self, _get, s3_factory):
        s3_factory.return_value.generate_presigned_post.return_value={"url":"https://upload.invalid","fields":{}}
        result=service.presign_upload(TASK_ID, {"file_name":"../report.pdf","content_type":"application/pdf","size":2})
        self.assertTrue(result["object_key"].startswith(f"tasks/{TASK_ID}/{result['attachment_id']}/"))
        self.assertNotIn("../", result["object_key"])
        call=s3_factory.return_value.generate_presigned_post.call_args.kwargs
        self.assertIn(["content-length-range",1,service.MAX_FILE_SIZE],call["Conditions"])

    @patch.object(service, "get_task_by_id", return_value=task([{"attachment_id":str(i)} for i in range(10)]))
    def test_ten_attachments_are_rejected(self, _get):
        with self.assertRaises(service.AttachmentError):
            service.presign_upload(TASK_ID, {"file_name":"x.pdf","content_type":"application/pdf","size":1})

    @patch.object(service, "get_task_by_id", return_value=task())
    def test_complete_rejects_client_chosen_or_mismatched_key(self, _get):
        attachment_id="12345678-1234-4234-9234-123456789abc"
        with self.assertRaises(service.AttachmentError):
            service.complete_upload(TASK_ID,{"attachment_id":attachment_id,"object_key":"another/key","file_name":"report.pdf","content_type":"application/pdf"},"sub","name")

    @patch.object(service, "get_task_by_id")
    def test_complete_rejects_duplicate_before_s3(self, get):
        attachment_id="12345678-1234-4234-9234-123456789abc"
        get.return_value=task([{"attachment_id":attachment_id}])
        with self.assertRaises(service.AttachmentError) as caught:
            service.complete_upload(TASK_ID,{"attachment_id":attachment_id,"object_key":f"tasks/{TASK_ID}/{attachment_id}/report.pdf","file_name":"report.pdf","content_type":"application/pdf"},"sub","name")
        self.assertEqual(caught.exception.status,409)

    @patch.object(service.table, "update_item", return_value={"Attributes":{"attachments":[]}})
    @patch.object(service, "_s3")
    @patch.object(service, "get_task_by_id", return_value=task())
    @patch.object(service.uuid, "uuid4", return_value="ignored")
    def test_complete_heads_and_records_safe_history(self, _uuid, _get, s3_factory, update):
        attachment_id="12345678-1234-4234-9234-123456789abc"
        key=f"tasks/{TASK_ID}/{attachment_id}/report.pdf"
        s3_factory.return_value.head_object.return_value={"ContentType":"application/pdf","ContentLength":9,"Metadata":{"attachment-id":attachment_id}}
        service.complete_upload(TASK_ID,{"attachment_id":attachment_id,"object_key":key,"file_name":"report.pdf","content_type":"application/pdf"},"sub-1","表示名")
        s3_factory.return_value.head_object.assert_called_once_with(Bucket="private-test-bucket",Key=key)
        values=update.call_args.kwargs["ExpressionAttributeValues"]
        self.assertEqual(values[":history"][0]["file_name"],"report.pdf")
        self.assertNotIn("object_key",values[":history"][0])

    @patch.object(service, "_s3")
    @patch.object(service, "get_task_by_id")
    def test_download_uses_metadata_key_and_missing_id_fails(self, get, s3_factory):
        get.return_value=task([{"attachment_id":"right","file_name":"a.pdf","object_key":"stored/key"}])
        s3_factory.return_value.generate_presigned_url.return_value="signed"
        service.presign_download(TASK_ID,"right")
        self.assertEqual(s3_factory.return_value.generate_presigned_url.call_args.kwargs["Params"]["Key"],"stored/key")
        with self.assertRaises(service.AttachmentError): service.presign_download(TASK_ID,"wrong")

    @patch.object(service.table, "update_item", return_value={"Attributes":{"attachments":[]}})
    @patch.object(service, "_s3")
    @patch.object(service, "get_task_by_id")
    def test_delete_only_target_and_history_has_name(self, get, s3_factory, update):
        one={"attachment_id":"one","file_name":"one.pdf","object_key":"one/key"}; two={"attachment_id":"two","file_name":"two.pdf","object_key":"two/key"}
        get.return_value=task([one,two]); service.delete_attachment(TASK_ID,"one","表示名")
        s3_factory.return_value.delete_object.assert_called_once_with(Bucket="private-test-bucket",Key="one/key")
        values=update.call_args.kwargs["ExpressionAttributeValues"]
        self.assertEqual(values[":remaining"],[two]); self.assertNotIn("object_key",values[":history"][0])


if __name__ == "__main__": unittest.main()
