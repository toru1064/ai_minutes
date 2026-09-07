import {formatFileSize, validateAttachment} from "./attachment-utils.js";

export function createAttachmentForm({elements, attachmentApi, uploadToS3, onComplete, successDuration=4000}) {
    const {input, confirmBox, selected, uploadButton, cancelButton, status, picker} = elements;
    let selectedFile=null, pendingComplete=null, busy=false, successTimer;
    function showMessage(text="",kind="") { clearTimeout(successTimer);status.textContent=text;status.className=`attachment-status${kind?` attachment-status-${kind}`:""}`;if(kind==="success"&&successDuration)successTimer=setTimeout(()=>showMessage(),successDuration); }
    function renderAttachmentSelectionState() {const active=Boolean(selectedFile||pendingComplete);confirmBox.hidden=!active;selected.textContent=selectedFile?`${selectedFile.name}（${formatFileSize(selectedFile.size)}）`:pendingComplete?.file_name||"";uploadButton.hidden=cancelButton.hidden=!active;uploadButton.textContent=pendingComplete?"登録を再試行":"アップロード";uploadButton.disabled=cancelButton.disabled=input.disabled=busy;picker.classList?.toggle("attachment-picker-disabled",busy);}
    function resetAttachmentForm({message="",kind=""}={}) {input.value="";selectedFile=null;pendingComplete=null;busy=false;selected.textContent="";renderAttachmentSelectionState();showMessage(message,kind);}
    function setBusy(value,message) {busy=value;renderAttachmentSelectionState();showMessage(message);}
    async function finishComplete() {const data=await attachmentApi("/complete",pendingComplete);await onComplete(data);resetAttachmentForm({message:"アップロードしました",kind:"success"});}
    async function upload() {if(busy)return;if(pendingComplete){setBusy(true,"登録を再試行しています...");try{await finishComplete();}catch(error){setBusy(false,`${error.message}。登録を再試行してください`);status.className="attachment-status attachment-status-error";}return;}const error=validateAttachment(selectedFile);if(error){showMessage(error,"error");return;}setBusy(true,"アップロード中...");try{const signed=await attachmentApi("/presign",{file_name:selectedFile.name,content_type:selectedFile.type,size:selectedFile.size});await uploadToS3(signed,selectedFile);pendingComplete={attachment_id:signed.attachment_id,object_key:signed.object_key,file_name:selectedFile.name,content_type:selectedFile.type};await finishComplete();}catch(error){setBusy(false,`${error.message}。再試行してください`);status.className="attachment-status attachment-status-error";}}
    function selectFile(file) {if(busy)return;showMessage();selectedFile=file||null;pendingComplete=null;const error=validateAttachment(selectedFile);if(error){resetAttachmentForm();showMessage(error,"error");return;}renderAttachmentSelectionState();}
    input.onchange=()=>selectFile(input.files[0]);uploadButton.onclick=upload;cancelButton.onclick=()=>{if(!busy)resetAttachmentForm();};resetAttachmentForm();
    return {upload,selectFile,resetAttachmentForm,getState:()=>({selectedFile,pendingComplete,busy})};
}
