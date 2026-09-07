import test from "node:test";
import assert from "node:assert/strict";
import {createAttachmentForm} from "./attachment-form.js";

const file={name:"report.pdf",type:"application/pdf",size:2048};
function setup({failPresign=false,failUpload=false,failComplete=0}={}) {
    const element=()=>({hidden:false,disabled:false,value:"chosen",textContent:"",className:"",files:[file],classList:{toggle(){}}});
    const elements={input:element(),confirmBox:element(),selected:element(),uploadButton:element(),cancelButton:element(),status:element(),picker:element()};
    const calls=[],completed=[];
    const attachmentApi=async(path,payload)=>{calls.push(path);if(path==="/presign"){if(failPresign)throw new Error("presign失敗");return {attachment_id:"a1",object_key:"key",fields:{},upload_url:"url"};}if(failComplete-- > 0)throw new Error("complete失敗");return {attachments:[{attachment_id:"a1"}]};};
    const controller=createAttachmentForm({elements,attachmentApi,uploadToS3:async()=>{calls.push("s3");if(failUpload)throw new Error("S3失敗");},onComplete:async data=>completed.push(data),successDuration:0});
    return {elements,calls,completed,controller};
}

test("選択後に名前とサイズを表示し、キャンセルですべて初期化して同じファイルを再選択できる",()=>{const x=setup();x.controller.selectFile(file);assert.equal(x.elements.selected.textContent,"report.pdf（2.0 KB）");assert.equal(x.elements.confirmBox.hidden,false);x.elements.status.textContent="前回のエラー";x.elements.cancelButton.onclick();assert.equal(x.elements.input.value,"");assert.equal(x.elements.selected.textContent,"");assert.equal(x.elements.confirmBox.hidden,true);assert.equal(x.elements.uploadButton.hidden,true);assert.equal(x.elements.cancelButton.hidden,true);assert.equal(x.elements.status.textContent,"");x.controller.selectFile(file);assert.equal(x.elements.confirmBox.hidden,false);});

test("成功後はフォームを完全に初期化し、一覧と履歴の再描画コールバックを呼ぶ",async()=>{const x=setup();x.controller.selectFile(file);await x.controller.upload();assert.deepEqual(x.calls,["/presign","s3","/complete"]);assert.equal(x.completed.length,1);assert.equal(x.elements.input.value,"");assert.equal(x.controller.getState().selectedFile,null);assert.equal(x.controller.getState().pendingComplete,null);assert.equal(x.elements.confirmBox.hidden,true);assert.equal(x.elements.uploadButton.hidden,true);assert.equal(x.elements.cancelButton.hidden,true);assert.match(x.elements.status.className,/success/);assert.match(x.elements.status.textContent,/アップロード/);});

for(const [name,options] of [["presign失敗",{failPresign:true}],["S3アップロード失敗",{failUpload:true}]])test(`${name}では選択ファイルを維持して再送信できる`,async()=>{const x=setup(options);x.controller.selectFile(file);await x.controller.upload();assert.equal(x.controller.getState().selectedFile,file);assert.equal(x.controller.getState().pendingComplete,null);assert.equal(x.elements.uploadButton.disabled,false);assert.equal(x.elements.uploadButton.hidden,false);assert.match(x.elements.status.className,/error/);});

test("complete失敗では再試行情報を維持し、再試行成功後はS3へ再送信せず初期化する",async()=>{const x=setup({failComplete:1});x.controller.selectFile(file);await x.controller.upload();assert.equal(x.controller.getState().pendingComplete.attachment_id,"a1");assert.equal(x.elements.uploadButton.textContent,"登録を再試行");await x.controller.upload();assert.deepEqual(x.calls,["/presign","s3","/complete","/complete"]);assert.equal(x.controller.getState().pendingComplete,null);assert.equal(x.elements.confirmBox.hidden,true);});

test("処理中の二重送信を防止する",async()=>{let release;const x=setup();const original=x.elements;const promise=new Promise(resolve=>release=resolve);let count=0;const controller=createAttachmentForm({elements:original,attachmentApi:async path=>{if(path==="/presign"){count++;await promise;return {attachment_id:"a",object_key:"k",fields:{}};}return {attachments:[]};},uploadToS3:async()=>{},onComplete:async()=>{},successDuration:0});controller.selectFile(file);const first=controller.upload();const second=controller.upload();assert.equal(count,1);assert.equal(original.uploadButton.disabled,true);release();await Promise.all([first,second]);});
