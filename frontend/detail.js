import {
    getCurrentUser,
    logout
} from "./auth.js";
import {displayUser, renderChangeHistory} from "./display-utils.js";


// API GatewayのURL
const apiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/minutes";


// URLから議事録IDを取得
const urlParameters =
    new URLSearchParams(
        window.location.search
    );

const minutesId =
    urlParameters.get("id");


// HTMLの部品を取得
const detailUserStatus =
    document.getElementById(
        "detail-user-status"
    );

const detailLogoutButton =
    document.getElementById(
        "detail-logout-button"
    );

const detailMessage =
    document.getElementById(
        "detail-message"
    );

const detailContent =
    document.getElementById(
        "detail-content"
    );

const approvalArea =
    document.getElementById(
        "approval-area"
    );

const downloadButton =
    document.getElementById(
        "download-button"
    );

const detailStatus =
    document.getElementById(
        "detail-status"
    );

const statusMessage =
    document.getElementById(
        "status-message"
    );

const requestButton =
    document.getElementById(
        "request-button"
    );

const approveButton =
    document.getElementById(
        "approve-button"
    );

const rejectButton =
    document.getElementById(
        "reject-button"
    );
const rejectionArea = document.getElementById("rejection-area");
const rejectionReason = document.getElementById("rejection-reason");
const confirmRejectButton = document.getElementById("confirm-reject-button");
const cancelRejectButton = document.getElementById("cancel-reject-button");
const detailTabs = document.querySelectorAll(".detail-tab");


let currentUser = null;
let currentMinutes = null;
let relatedTasks = [];
let editInitial = "";
let editDirty = false;
let rawDirty = false;


// AI議事録が作成済みか確認
function hasAiMinutes(minutes) {
    return Boolean(
        minutes &&
        minutes.ai_minutes &&
        Object.keys(
            minutes.ai_minutes
        ).length > 0
    );
}


// 議事録の詳細を取得
async function initialize() {
    if (!minutesId) {
        detailMessage.textContent =
            "議事録IDが指定されていません";

        return;
    }

    try {
        currentUser =
            await getCurrentUser();

        if (
            !currentUser ||
            currentUser.expired
        ) {
            window.location.href =
                "index.html";

            return;
        }

        detailUserStatus.textContent =
            `ログイン中：${currentUser.profile.email}`;

        const response =
            await fetch(
                `${apiUrl}/${encodeURIComponent(minutesId)}`,
                {
                    method: "GET",

                    headers: {
                        "Authorization":
                            `Bearer ${currentUser.access_token}`
                    }
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "議事録の取得に失敗しました"
            );
        }

        currentMinutes =
            data.minutes;

        await loadRelatedTasks();
        displayMinutes(currentMinutes);

        detailMessage.textContent = "";
        detailContent.hidden = false;

        displaySelectedSection();
    } catch (error) {
        console.error(error);

        detailMessage.textContent =
            error.message;
    }
}



async function loadRelatedTasks() {
    document.getElementById("task-register-link").href = `task_register.html?minutes_id=${encodeURIComponent(minutesId)}`;
    const response=await fetch(`https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/tasks?source_minutes_id=${encodeURIComponent(minutesId)}`,{headers:{Authorization:`Bearer ${currentUser.access_token}`}}),data=await response.json();
    if(!response.ok)throw new Error(data.message||"関連チケットの取得に失敗しました");
    const tasks=data.tasks||[]; relatedTasks=tasks; const completed=tasks.filter(task=>task.status==="completed").length;
    document.getElementById("ticket-progress").textContent=tasks.length?`${completed} / ${tasks.length}件完了`:"チケットなし";
    document.getElementById("tasks-message").textContent=tasks.length?`全${tasks.length}件`:"関連するチケットはありません";
    const tbody=document.getElementById("tasks-table-body");tbody.innerHTML="";const labels={not_started:"未着手",in_progress:"進行中",completed:"完了",review_pending:"進行中（旧状態）",rejected:"進行中（旧状態）"};
    for(const task of tasks){const row=document.createElement("tr"),href=`task_detail.html?id=${encodeURIComponent(task.task_id)}&return_to=${encodeURIComponent(`detail.html?id=${minutesId}`)}`;for(const [value,linked] of [[`#${task.task_number}`,true],[task.title,true],[task.assignee],[task.due_date]]){const cell=document.createElement("td");if(linked){const link=document.createElement("a");link.href=href;link.textContent=value||"-";link.className="table-link";cell.appendChild(link);}else cell.textContent=value||"-";row.appendChild(cell);}const statusCell=document.createElement("td"),badge=document.createElement("span");badge.className=`status-badge task-status-${task.status==="completed"?"completed":task.status==="not_started"?"not_started":"in_progress"}`;badge.textContent=labels[task.status]||task.status;statusCell.appendChild(badge);row.appendChild(statusCell);tbody.appendChild(row);}
}

// 選択された内容だけを表示
function displaySelectedSection(sectionId = window.location.hash.slice(1)) {

    const aiSection =
        document.getElementById(
            "ai-section"
        );

    const rawSection =
        document.getElementById(
            "raw-section"
        );

    if (sectionId === "raw-section") {
        aiSection.hidden = true;
        rawSection.hidden = false;
    } else {
        aiSection.hidden = false;
        rawSection.hidden = true;

    }

    const selectedId = sectionId === "raw-section" ? "raw-section" : "ai-section";
    for (const tab of detailTabs) {
        const selected = tab.dataset.section === selectedId;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
    }
}


// 議事録を画面へ表示
function displayMinutes(minutes) {
    const aiMinutes =
        minutes.ai_minutes || {};

    document
        .getElementById("meeting-name")
        .textContent =
            minutes.meeting_name ||
                "議事録詳細";

    displayProject(minutes);

    document.getElementById("minutes-number").textContent =
        minutes.minutes_number ? `#${minutes.minutes_number}` : "-";
    document.getElementById("meeting-date").textContent = minutes.meeting_date || "-";
    document.getElementById("registered-by").textContent = displayUser(minutes.registered_by, currentUser?.profile || {});
    document.getElementById("assignee").textContent = minutes.assignee || "-";
    document.getElementById("approver").textContent = minutes.approver || "-";

    document
        .getElementById("summary")
        .textContent =
            aiMinutes.summary ||
            "記載なし";

    displayDecisions(
        aiMinutes.decisions || []
    );

    displayTodos(
        aiMinutes.todos || []
    );

    displayAiGenerationArea(
        minutes
    );

    document
        .getElementById("raw-minutes")
        .textContent =
            minutes.raw_minutes ||
            "記載なし";

    displayStatus(
        minutes.status
    );

    displayStatusButtons(
        minutes.status
    );

    displayApprovalHistory(minutes.approval_history || []);
    renderChangeHistory(document.getElementById("minutes-change-history"), minutes.change_history || [], currentUser?.profile || {});
}


// 所属プロジェクトを表示
function displayProject(minutes) {
    const projectElement =
        document.getElementById("meeting-project");

    projectElement.innerHTML = "";

    if (!minutes.project_id) {
        projectElement.textContent =
            "プロジェクト：未設定";
        return;
    }

    const link = document.createElement("a");

    link.href =
        `project_detail.html?id=${encodeURIComponent(minutes.project_id)}`;
    link.textContent =
        minutes.project_name || "プロジェクト";

    projectElement.appendChild(link);
}


// 未生成の場合だけAI議事録作成ボタンを表示
function displayAiGenerationArea(minutes) {
    const aiSection =
        document.getElementById(
            "ai-section"
        );

    const summaryElement =
        document.getElementById(
            "summary"
        );

    const decisionsElement =
        document.getElementById(
            "decisions"
        );

    const todosElement =
        document.getElementById(
            "todos"
        );

    // 現在のHTMLで使用しているカードを取得
    const resultElements = [
        summaryElement.closest(
            ".result-card, .result-item"
        ),

        decisionsElement.closest(
            ".result-card, .result-item"
        ),

        todosElement.closest(
            ".result-card, .result-item"
        )
    ].filter(Boolean);

    // 前回作成した未生成表示があれば削除
    const oldEmptyArea =
        document.getElementById(
            "ai-empty-area"
        );

    if (oldEmptyArea) {
        oldEmptyArea.remove();
    }

    // AI議事録があれば通常の結果を表示
    if (hasAiMinutes(minutes)) {
        for (
            const element
            of resultElements
        ) {
            element.hidden = false;
        }

        return;
    }

    // 未生成なら結果のカードを隠す
    for (
        const element
        of resultElements
    ) {
        element.hidden = true;
    }

    const emptyArea =
        document.createElement("div");

    emptyArea.id =
        "ai-empty-area";

    emptyArea.className =
        "result-card";

    const message =
        document.createElement("p");

    message.textContent =
        "AI議事録はまだ作成されていません。";

    const generateButton =
        document.createElement("button");

    generateButton.type =
        "button";

    generateButton.textContent =
        "AI議事録を作成";

    const generateMessage =
        document.createElement("p");


    // AI議事録作成ボタンを押したとき
    generateButton.addEventListener(
        "click",
        async () => {
            generateButton.disabled =
                true;

            generateMessage.textContent =
                "AI議事録を作成しています...";

            try {
                const response =
                    await fetch(
                        `${apiUrl}/${encodeURIComponent(minutesId)}/generate`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json",

                                "Authorization":
                                    `Bearer ${currentUser.access_token}`
                            }
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.message ||
                        "AI議事録の作成に失敗しました"
                    );
                }

                currentMinutes =
                    data.minutes;

                displayMinutes(
                    currentMinutes
                );

                displaySelectedSection();

                statusMessage.textContent =
                    data.message;
            } catch (error) {
                console.error(error);

                generateMessage.textContent =
                    error.message;

                generateButton.disabled =
                    false;
            }
        }
    );

    emptyArea.appendChild(
        message
    );

    emptyArea.appendChild(
        generateButton
    );

    emptyArea.appendChild(
        generateMessage
    );

    const firstResult =
        resultElements[0];

    if (firstResult) {
        firstResult.before(
            emptyArea
        );
    } else {
        aiSection.appendChild(
            emptyArea
        );
    }
}


// 状態を色付きで表示
function displayStatus(status) {
    detailStatus.textContent =
        formatStatus(status);

    detailStatus.className =
        "status-badge";

    detailStatus.classList.add(
        `status-${status || "unknown"}`
    );
}


// 状態に応じて操作ボタンを表示
function displayStatusButtons(status) {
    requestButton.hidden = true;
    approveButton.hidden = true;
    rejectButton.hidden = true;
    document.getElementById("approved-message").hidden = true;

    requestButton.disabled = false;
    approveButton.disabled = false;
    rejectButton.disabled = false;

    // AI議事録がない間は承認操作を表示しない
    if (
        !hasAiMinutes(
            currentMinutes
        )
    ) {
        return;
    }

    if (
        status === "draft" ||
        status === "rejected"
    ) {
        requestButton.hidden = false;
    } else if (status === "pending") {
        approveButton.hidden = false;
        rejectButton.hidden = false;
    } else if (status === "approved") {
        document.getElementById("approved-message").hidden = false;
    }
}


// 操作中はボタンを無効にする
function disableStatusButtons() {
    requestButton.disabled = true;
    approveButton.disabled = true;
    rejectButton.disabled = true;
}


// 議事録の状態を更新
async function updateStatus(newStatus, reason = "") {
    statusMessage.textContent =
        "状態を更新しています...";

    disableStatusButtons();

    try {
        const response =
            await fetch(
                `${apiUrl}/${encodeURIComponent(minutesId)}/status`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${currentUser.access_token}`
                    },

                    body: JSON.stringify({
                        status: newStatus,
                        rejection_reason: reason
                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "状態の更新に失敗しました"
            );
        }

        currentMinutes =
            data.minutes;

        displayMinutes(currentMinutes);
        rejectionArea.hidden = true;
        rejectionReason.value = "";

        statusMessage.textContent =
            data.message;
    } catch (error) {
        console.error(error);

        statusMessage.textContent =
            error.message;

        displayStatusButtons(
            currentMinutes.status
        );
    }
}

// 申請・承認・差し戻しの履歴を古い順に表示
function displayApprovalHistory(history) {
    const historyList = document.getElementById("approval-history");
    historyList.innerHTML = "";
    if (history.length === 0) {
        addListItem(historyList, "承認履歴はありません");
        return;
    }
    for (const entry of history) {
        const actionLabels = {pending: "承認申請", approved: "承認", rejected: "差し戻し"};
        const item = document.createElement("li");
        const heading = document.createElement("strong");
        heading.textContent = actionLabels[entry.action] || entry.action || "操作";
        const details = document.createElement("span");
        details.textContent = `${displayUser(entry.operated_by, currentUser?.profile || {})}・${formatDateTime(entry.operated_at)}`;
        item.append(heading, details);
        if (entry.rejection_reason) {
            const reason = document.createElement("p");
            reason.textContent = `理由：${entry.rejection_reason}`;
            item.appendChild(reason);
        }
        historyList.appendChild(item);
    }
}

function formatDateTime(value) {
    return value ? new Date(value).toLocaleString("ja-JP") : "日時不明";
}


// 決定事項を一覧表示
function displayDecisions(decisions) {
    const decisionsList =
        document.getElementById(
            "decisions"
        );

    decisionsList.innerHTML = "";

    if (decisions.length === 0) {
        addListItem(
            decisionsList,
            "記載なし"
        );

        return;
    }

    for (
        const decision
        of decisions
    ) {
        addListItem(
            decisionsList,
            decision
        );
    }
}


// TODOを一覧表示
function displayTodos(todos) {
    const list=document.getElementById("todos"), link=document.getElementById("todo-ticket-link"); list.innerHTML="";
    link.hidden=!todos.length;
    if(!todos.length){addListItem(list,hasAiMinutes(currentMinutes)?"AI抽出TODOはありません":"AI議事録を作成するとTODOが表示されます");return;}
    const unregistered=todos.filter((_,i)=>!relatedTasks.some(t=>t.source_type==="ai"&&String(t.source_todo_index)===String(i))).length;
    link.href=`todo_to_tasks.html?id=${encodeURIComponent(minutesId)}`; link.textContent=`AI抽出TODOからチケットを作成（未登録 ${unregistered}件）`;
    todos.forEach((todo,index)=>{const made=relatedTasks.find(t=>t.source_type==="ai"&&String(t.source_todo_index)===String(index)),li=document.createElement("li"),title=document.createElement("strong"),meta=document.createElement("div");title.textContent=todo.task||todo.description||"（本文なし）";meta.className="todo-meta";meta.textContent=`担当：${todo.assignee||"未設定"}　期限：${todo.deadline||"未設定"}`;li.append(title,meta);if(made){const a=document.createElement("a");a.href=`task_detail.html?id=${encodeURIComponent(made.task_id)}`;a.textContent=`チケット作成済み：#${made.task_number}`;li.appendChild(a);}list.appendChild(li);});
}

// リストへ項目を追加
function addListItem(list, text) {
    const listItem =
        document.createElement("li");

    listItem.textContent = text;

    list.appendChild(
        listItem
    );
}


// 状態を日本語に変換
function formatStatus(status) {
    const statusLabels = {
        draft: "下書き",
        pending: "承認待ち",
        approved: "承認済み",
        rejected: "差し戻し"
    };

    return (
        statusLabels[status] ||
        status ||
        "-"
    );
}


// 原文をTXTファイルとして保存
downloadButton.addEventListener(
    "click",
    () => {
        if (!currentMinutes) {
            return;
        }

        const textFile =
            new Blob(
                [
                    currentMinutes
                        .raw_minutes || ""
                ],
                {
                    type:
                        "text/plain;charset=utf-8"
                }
            );

        const downloadUrl =
            URL.createObjectURL(
                textFile
            );

        const link =
            document.createElement("a");

        const safeMeetingName =
            (
                currentMinutes.meeting_name ||
                "議事録"
            ).replace(
                /[\\/:*?"<>|]/g,
                "_"
            );

        link.href =
            downloadUrl;

        link.download =
            `${safeMeetingName}_原文.txt`;

        link.click();

        URL.revokeObjectURL(
            downloadUrl
        );
    }
);


// 承認申請
requestButton.addEventListener(
    "click",
    async () => {
        await updateStatus(
            "pending"
        );
    }
);


// 承認
approveButton.addEventListener(
    "click",
    async () => {
        const incomplete = currentMinutes.task_progress?.incomplete_tasks || 0;
        if (incomplete && !window.confirm(`未完了のチケットが${incomplete}件あります。このまま議事録を承認しますか？`)) return;
        await updateStatus(
            "approved"
        );
    }
);


// 差し戻し
rejectButton.addEventListener(
    "click",
    () => {
        rejectionArea.hidden = false;
        rejectionReason.focus();
    }
);

confirmRejectButton.addEventListener("click", async () => {
    const reason = rejectionReason.value.trim();
    if (!reason) {
        statusMessage.textContent = "差し戻し理由を入力してください";
        rejectionReason.focus();
        return;
    }
    await updateStatus("rejected", reason);
});

cancelRejectButton.addEventListener("click", () => {
    rejectionArea.hidden = true;
    rejectionReason.value = "";
});

for (const tab of detailTabs) {
    tab.addEventListener("click", () => {
        window.history.replaceState(null, "", `#${tab.dataset.section}`);
        displaySelectedSection(tab.dataset.section);
    });
}



const editForm=document.getElementById("minutes-edit-form");
const rawForm=document.getElementById("raw-edit-form");
const editValues=()=>({project_id:document.getElementById("edit-project").value,meeting_name:document.getElementById("edit-meeting-name").value.trim(),meeting_date:document.getElementById("edit-meeting-date").value,assignee:document.getElementById("edit-assignee").value.trim(),approver:document.getElementById("edit-approver").value.trim()});
const normalizeNewlines=value=>String(value||"").replace(/\r\n?/g,"\n");
document.getElementById("minutes-edit-button").addEventListener("click",async()=>{try{const response=await fetch("https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/projects",{headers:{Authorization:`Bearer ${currentUser.access_token}`}}),data=await response.json();if(!response.ok)throw new Error(data.message);const select=document.getElementById("edit-project");select.innerHTML="";(data.projects||[]).forEach(p=>select.add(new Option(`#${p.project_number} ${p.project_name}`,p.project_id)));select.value=currentMinutes.project_id;document.getElementById("edit-meeting-name").value=currentMinutes.meeting_name||"";document.getElementById("edit-meeting-date").value=currentMinutes.meeting_date||"";document.getElementById("edit-assignee").value=currentMinutes.assignee||"";document.getElementById("edit-approver").value=currentMinutes.approver||"";editInitial=JSON.stringify(editValues());editDirty=false;editForm.hidden=false;document.getElementById("minutes-edit-button").hidden=true;}catch(error){detailMessage.textContent=error.message;}});
editForm.addEventListener("input",()=>editDirty=JSON.stringify(editValues())!==editInitial);
document.getElementById("minutes-cancel-button").addEventListener("click",()=>{if(editDirty&&!confirm("未保存の変更を破棄しますか？"))return;editDirty=false;editForm.hidden=true;document.getElementById("minutes-edit-button").hidden=false;});
editForm.addEventListener("submit",async event=>{event.preventDefault();const payload=editValues();if(JSON.stringify(payload)===editInitial)return;if(["pending","approved"].includes(currentMinutes.status)&&!confirm("保存すると承認状態が下書きへ戻ります。続けますか？"))return;await saveMinutes(payload,document.getElementById("minutes-save-button"),()=>{editDirty=false;editForm.hidden=true;document.getElementById("minutes-edit-button").hidden=false;});});
document.getElementById("raw-edit-button").addEventListener("click",()=>{document.getElementById("edit-raw").value=currentMinutes.raw_minutes||"";rawDirty=false;rawForm.hidden=false;document.getElementById("raw-minutes").hidden=true;document.getElementById("raw-edit-button").hidden=true;});
document.getElementById("edit-raw").addEventListener("input",event=>rawDirty=normalizeNewlines(event.target.value)!==normalizeNewlines(currentMinutes.raw_minutes));
document.getElementById("raw-cancel-button").addEventListener("click",()=>{if(rawDirty&&!confirm("未保存の変更を破棄しますか？"))return;closeRawEdit();});
rawForm.addEventListener("submit",async event=>{event.preventDefault();const raw=document.getElementById("edit-raw").value;if(normalizeNewlines(raw)===normalizeNewlines(currentMinutes.raw_minutes)){closeRawEdit();detailMessage.textContent="変更はありません";return;}if(!confirm("原文を変更すると現在のAI議事録が削除され、承認状態が下書きに戻ります。保存しますか？"))return;await saveMinutes({raw_minutes:raw},document.getElementById("raw-save-button"),closeRawEdit);});
function closeRawEdit(){rawDirty=false;rawForm.hidden=true;document.getElementById("raw-minutes").hidden=false;document.getElementById("raw-edit-button").hidden=false;}
async function saveMinutes(payload,button,onSuccess){if(button.disabled)return;button.disabled=true;try{const response=await fetch(`${apiUrl}/${encodeURIComponent(minutesId)}`,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${currentUser.access_token}`},body:JSON.stringify(payload)}),data=await response.json();if(!response.ok)throw new Error(data.message);currentMinutes=data.minutes;onSuccess();displayMinutes(currentMinutes);detailMessage.textContent=data.message||"更新しました";}catch(error){detailMessage.textContent=error.message;}finally{button.disabled=false;}}
window.addEventListener("beforeunload",event=>{if(editDirty||rawDirty){event.preventDefault();event.returnValue="";}});

// ログアウト
detailLogoutButton.addEventListener(
    "click",
    async () => {
        await logout();
    }
);


// 画面を開いたときに実行
initialize();
