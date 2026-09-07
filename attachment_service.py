"""Ticket attachment operations.

Only metadata is stored in DynamoDB. File bytes travel directly between the
browser and a private S3 bucket by way of short-lived signed requests.
"""
import logging
import os
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

import boto3
from botocore.exceptions import ClientError

from task_service import get_task_by_id, table


LOGGER = logging.getLogger(__name__)
MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_ATTACHMENTS = 10
URL_EXPIRY = 300
ALLOWED_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class AttachmentError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def _bucket_name():
    name = os.environ.get("ATTACHMENTS_BUCKET_NAME", "").strip()
    if not name:
        raise AttachmentError(500, "添付ファイルストレージが設定されていません")
    return name


def _s3():
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))


def safe_file_name(file_name):
    if not isinstance(file_name, str):
        raise AttachmentError(400, "ファイル名が正しくありません")
    original = unicodedata.normalize("NFC", file_name).strip()
    if not original or len(original) > 255:
        raise AttachmentError(400, "ファイル名は255文字以内で指定してください")
    # Keep the display name intact in metadata, but never use path separators,
    # traversal components, or control characters in an object key.
    cleaned = re.sub(r"[\\/\x00-\x1f\x7f]+", "_", original)
    cleaned = re.sub(r"\.{2,}", "_", cleaned).strip(" .")
    return cleaned or "attachment"


def validate_file(file_name, content_type, size=None):
    safe_name = safe_file_name(file_name)
    extension = os.path.splitext(file_name.strip())[1].lower()
    if ALLOWED_TYPES.get(extension) != content_type:
        raise AttachmentError(400, "対応していないファイル形式です")
    if size is not None:
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0:
            raise AttachmentError(400, "ファイルサイズが正しくありません")
        if size > MAX_FILE_SIZE:
            raise AttachmentError(400, "ファイルサイズは10MB以下にしてください")
    return safe_name


def task_or_404(task_id):
    try:
        uuid.UUID(task_id)
    except (ValueError, TypeError, AttributeError):
        raise AttachmentError(400, "チケットIDが正しくありません")
    task = get_task_by_id(task_id)
    if not task:
        raise AttachmentError(404, "チケットが見つかりません")
    task["attachments"] = task.get("attachments") if isinstance(task.get("attachments"), list) else []
    return task


def presign_upload(task_id, request):
    task = task_or_404(task_id)
    if len(task["attachments"]) >= MAX_ATTACHMENTS:
        raise AttachmentError(409, "添付ファイルは10件までです")
    file_name = request.get("file_name")
    content_type = request.get("content_type")
    size = request.get("size")
    safe_name = validate_file(file_name, content_type, size)
    attachment_id = str(uuid.uuid4())
    object_key = f"tasks/{task_id}/{attachment_id}/{safe_name}"
    fields = {"Content-Type": content_type, "x-amz-meta-attachment-id": attachment_id}
    result = _s3().generate_presigned_post(
        Bucket=_bucket_name(), Key=object_key, Fields=fields,
        Conditions=[{"Content-Type": content_type},
                    {"x-amz-meta-attachment-id": attachment_id},
                    ["content-length-range", 1, MAX_FILE_SIZE]],
        ExpiresIn=URL_EXPIRY,
    )
    return {"upload_url": result["url"], "fields": result["fields"],
            "attachment_id": attachment_id, "object_key": object_key,
            "expires_in": URL_EXPIRY}


def _validate_object_key(task_id, attachment_id, object_key, safe_name):
    try:
        uuid.UUID(attachment_id)
    except (ValueError, TypeError, AttributeError):
        raise AttachmentError(400, "添付ファイル情報が正しくありません")
    expected = f"tasks/{task_id}/{attachment_id}/{safe_name}"
    if object_key != expected:
        raise AttachmentError(400, "添付ファイル情報が正しくありません")


def complete_upload(task_id, request, user_id, user_display):
    task = task_or_404(task_id)
    attachment_id = request.get("attachment_id")
    object_key = request.get("object_key")
    file_name = request.get("file_name")
    content_type = request.get("content_type")
    safe_name = validate_file(file_name, content_type)
    _validate_object_key(task_id, attachment_id, object_key, safe_name)
    if any(item.get("attachment_id") == attachment_id for item in task["attachments"]):
        raise AttachmentError(409, "この添付ファイルは登録済みです")
    if len(task["attachments"]) >= MAX_ATTACHMENTS:
        raise AttachmentError(409, "添付ファイルは10件までです")
    try:
        head = _s3().head_object(Bucket=_bucket_name(), Key=object_key)
    except ClientError:
        raise AttachmentError(400, "アップロード済みファイルを確認できません")
    actual_type = (head.get("ContentType") or "").split(";", 1)[0].strip().lower()
    size = head.get("ContentLength")
    validate_file(file_name, actual_type, size)
    if actual_type != content_type:
        raise AttachmentError(400, "アップロードしたファイル形式が一致しません")
    if (head.get("Metadata") or {}).get("attachment-id") != attachment_id:
        raise AttachmentError(400, "アップロードしたファイル情報が一致しません")
    now = datetime.now(timezone.utc).isoformat()
    metadata = {"attachment_id": attachment_id, "file_name": file_name,
                "object_key": object_key, "content_type": content_type,
                "size": size, "uploaded_at": now, "uploaded_by_id": user_id,
                "uploaded_by_display": user_display}
    history = {"action": "attachment_added", "operated_by": user_display,
               "operated_at": now, "file_name": file_name, "changed_fields": {}}
    try:
        response = table.update_item(
            Key={"task_id": task_id},
            UpdateExpression="SET attachments = list_append(if_not_exists(attachments, :empty), :item), updated_at = :now, change_history = list_append(if_not_exists(change_history, :empty), :history)",
            ConditionExpression="attribute_exists(task_id) AND (attribute_not_exists(attachments) OR size(attachments) < :maximum) AND NOT contains(attachments, :metadata)",
            ExpressionAttributeValues={":empty": [], ":item": [metadata], ":history": [history],
                                       ":now": now, ":maximum": MAX_ATTACHMENTS, ":metadata": metadata},
            ReturnValues="ALL_NEW")
    except ClientError:
        LOGGER.exception("attachment metadata registration failed task_id=%s attachment_id=%s", task_id, attachment_id)
        raise AttachmentError(409, "添付ファイルを登録できませんでした。再試行してください")
    return response.get("Attributes", {}).get("attachments", task["attachments"] + [metadata])


def _find_attachment(task, attachment_id):
    item = next((item for item in task["attachments"] if item.get("attachment_id") == attachment_id), None)
    if not item:
        raise AttachmentError(404, "添付ファイルが見つかりません")
    return item


def presign_download(task_id, attachment_id):
    item = _find_attachment(task_or_404(task_id), attachment_id)
    display = re.sub(r"[\r\n\x00-\x1f\x7f]", "_", item["file_name"])
    disposition = f"attachment; filename*=UTF-8''{quote(display, safe='')}"
    url = _s3().generate_presigned_url("get_object", Params={"Bucket": _bucket_name(),
        "Key": item["object_key"], "ResponseContentDisposition": disposition}, ExpiresIn=URL_EXPIRY)
    return {"download_url": url, "expires_in": URL_EXPIRY}


def delete_attachment(task_id, attachment_id, user_display):
    task = task_or_404(task_id)
    item = _find_attachment(task, attachment_id)
    try:
        _s3().delete_object(Bucket=_bucket_name(), Key=item["object_key"])
    except ClientError:
        LOGGER.exception("S3 delete failed task_id=%s attachment_id=%s", task_id, attachment_id)
        raise AttachmentError(500, "添付ファイルを削除できませんでした")
    remaining = [entry for entry in task["attachments"] if entry.get("attachment_id") != attachment_id]
    now = datetime.now(timezone.utc).isoformat()
    history = {"action": "attachment_deleted", "operated_by": user_display,
               "operated_at": now, "file_name": item["file_name"], "changed_fields": {}}
    try:
        response = table.update_item(Key={"task_id": task_id},
            UpdateExpression="SET attachments = :remaining, updated_at = :now, change_history = list_append(if_not_exists(change_history, :empty), :history)",
            ConditionExpression="attribute_exists(task_id) AND contains(attachments, :item)",
            ExpressionAttributeValues={":remaining": remaining, ":now": now, ":empty": [],
                                       ":history": [history], ":item": item}, ReturnValues="ALL_NEW")
    except ClientError:
        LOGGER.exception("partial delete: DynamoDB update failed after S3 delete task_id=%s attachment_id=%s", task_id, attachment_id)
        raise AttachmentError(500, "ファイルは削除されましたが、チケット更新に失敗しました。管理者へ連絡してください")
    return response.get("Attributes", {}).get("attachments", remaining)
