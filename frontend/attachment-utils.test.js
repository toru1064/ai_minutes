import test from "node:test";
import assert from "node:assert/strict";
import {MAX_ATTACHMENT_SIZE, uploadSignedPost, validateAttachment} from "./attachment-utils.js";

test("attachment size is checked before an API request", () => {
    assert.match(validateAttachment({name:"large.pdf",type:"application/pdf",size:MAX_ATTACHMENT_SIZE+1}), /10MB/);
});

test("署名付きPOSTは署名フィールドとファイルを送信する", async () => {
    let request;
    await uploadSignedPost({upload_url: "https://bucket.example", fields: {key: "object", "Content-Type": "text/plain"}},
        new Blob(["data"], {type: "text/plain"}), async (url, options) => { request = {url, options}; return {ok: true}; });
    assert.equal(request.url, "https://bucket.example");
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.headers, undefined);
    assert.equal(request.options.body.get("key"), "object");
    assert.ok(request.options.body.get("file") instanceof Blob);
});

test("S3のfetch失敗は署名URLを含めずCORS確認を案内する", async () => {
    await assert.rejects(() => uploadSignedPost({upload_url: "https://secret.example/signed", fields: {}},
        new Blob(["x"]), async () => { throw new TypeError("Failed to fetch"); }), error => {
        assert.match(error.message, /CORS/);
        assert.doesNotMatch(error.message, /secret|signed/);
        return true;
    });
});

test("both extension and content type must be supported", () => {
    assert.equal(validateAttachment({name:"image.png",type:"image/jpeg",size:100}), "対応していないファイル形式です");
    assert.equal(validateAttachment({name:"report.docx",type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",size:100}), "");
});
