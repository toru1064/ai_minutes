import test from "node:test";
import assert from "node:assert/strict";
import {MAX_ATTACHMENT_SIZE, validateAttachment} from "./attachment-utils.js";

test("attachment size is checked before an API request", () => {
    assert.match(validateAttachment({name:"large.pdf",type:"application/pdf",size:MAX_ATTACHMENT_SIZE+1}), /10MB/);
});

test("both extension and content type must be supported", () => {
    assert.equal(validateAttachment({name:"image.png",type:"image/jpeg",size:100}), "対応していないファイル形式です");
    assert.equal(validateAttachment({name:"report.docx",type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",size:100}), "");
});
