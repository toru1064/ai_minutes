import {
    getCurrentUser,
    logout
} from "./auth.js";


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
    const response = await fetch(`https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/tasks?source_minutes_id=${encodeURIComponent(minutesId)}`, {headers: {Authorization: `Bearer ${currentUser.access_token}`}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "関連チケットの取得に失敗しました");
    const tasks = data.tasks || []; relatedTasks = tasks; const completed = tasks.filter(task => task.status === "completed").length;
    document.getElementById("ticket-progress").textContent = tasks.length ? `${completed} / ${tasks.length}件完了` : "チケットなし";
    document.getElementById("tasks-message").textContent = tasks.length ? `全${tasks.length}件（完了${completed}件）` : "関連するチケットはありません";
    const tbody = document.getElementById("tasks-table-body"); tbody.innerHTML = "";
    const labels = {not_started:"未着手", in_progress:"進行中", completed:"完了", review_pending:"進行中（旧状態）", rejected:"進行中（旧状態）"};
    for (const task of tasks) { const row=document.createElement("tr"); for(const value of [`#${task.task_number}`,task.title,task.assignee,task.due_date]) {const cell=document.createElement("td");cell.textContent=value||"-";row.appendChild(cell);} const statusCell=document.createElement("td"), badge=document.createElement("span");badge.className=`status-badge task-status-${task.status === "completed" ? "completed" : task.status === "not_started" ? "not_started" : "in_progress"}`;badge.textContent=labels[task.status]||task.status;statusCell.appendChild(badge);row.appendChild(statusCell);const action=document.createElement("td"),link=document.createElement("a");link.href=`task_detail.html?id=${encodeURIComponent(task.task_id)}`;link.textContent="表示";action.appendChild(link);row.appendChild(action);tbody.appendChild(row); }
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
    document.getElementById("registered-by").textContent = minutes.registered_by || "-";
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
        details.textContent = `${entry.operated_by || "不明なユーザー"}・${formatDateTime(entry.operated_at)}`;
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
    const list = document.getElementById("todos");
    const bulk = document.getElementById("create-selected-todos");
    list.innerHTML = "";
    bulk.hidden = todos.length === 0;
    if (!todos.length) { addListItem(list, "記載なし"); return; }
    todos.forEach((todo, index) => {
        const made = relatedTasks.find(task => task.source_type === "ai" && String(task.source_todo_index) === String(index));
        const li=document.createElement("li");li.className=`todo-card${made?" is-created":""}`;li.dataset.index=index;
        const header=document.createElement("div");header.className="todo-card-header";
        const check=document.createElement("input");check.type="checkbox";check.checked=!made;check.disabled=Boolean(made);check.className="todo-select";check.setAttribute("aria-label",`TODO候補 #${index+1}を選択`);
        const heading=document.createElement("strong");heading.textContent=`TODO候補 #${index+1}`;
        const status=document.createElement("span");status.className="todo-status";status.textContent=made?"チケット作成済み":"未登録";header.append(check,heading,status);li.appendChild(header);
        const original=document.createElement("p");original.className="todo-original";original.textContent=todo.task||todo.description||"（本文なし）";li.appendChild(original);
        const meta=document.createElement("div");meta.className="todo-meta";meta.textContent=`担当：${todo.assignee||"未設定"}　期限：${todo.deadline||"未設定"}　優先度：通常`;li.appendChild(meta);
        if(made){const a=document.createElement("a");a.href=`task_detail.html?id=${encodeURIComponent(made.task_id)}`;a.textContent=`チケット #${made.task_number} の詳細`;li.appendChild(a);list.appendChild(li);return;}
        const fields=[['title','件名',todo.task||'',true],['description','説明',todo.description||'',false],['assignee','担当者',todo.assignee||'',true],['due_date','期限',todo.deadline||'',true]];
        const editor=document.createElement("div");editor.className="todo-edit-fields";editor.hidden=true;
        for(const [name,label,value,required] of fields){const l=document.createElement("label");l.textContent=label;const input=name==='description'?document.createElement("textarea"):document.createElement("input");input.name=name;input.value=value;input.required=required;if(name==='due_date')input.type='date';l.appendChild(input);editor.appendChild(l);}
        const label=document.createElement("label");label.textContent="優先度";const select=document.createElement("select");select.name="priority";for(const [value,text] of [['low','低'],['normal','通常'],['high','高'],['urgent','緊急']]){const o=document.createElement('option');o.value=value;o.textContent=text;if(value==='normal')o.selected=true;select.appendChild(o);}label.appendChild(select);li.appendChild(label);
        editor.appendChild(label);li.appendChild(editor);const actions=document.createElement("div");actions.className="todo-actions";
        const edit=document.createElement("button");edit.type="button";edit.textContent="内容を編集";edit.addEventListener("click",()=>{editor.hidden=!editor.hidden;edit.textContent=editor.hidden?"内容を編集":"編集を閉じる";});
        const button=document.createElement("button");button.type="button";button.className="todo-register";button.textContent="チケットに登録";button.addEventListener("click",()=>createTodoTickets([li]));actions.append(edit,button);li.appendChild(actions);list.appendChild(li);
    });
}
async function createTodoTickets(items){const message=document.getElementById("todo-message"),bulk=document.getElementById("create-selected-todos"),results=[];bulk.disabled=true;for(const li of items){const buttons=li.querySelectorAll("button");buttons.forEach(b=>b.disabled=true);const payload={source_minutes_id:minutesId,source_type:"ai",source_todo_index:Number(li.dataset.index)};for(const input of li.querySelectorAll('[name]'))payload[input.name]=input.value;if(!payload.title||!payload.assignee||!payload.due_date){results.push(`#${Number(li.dataset.index)+1}: 失敗（必須項目を入力してください）`);buttons.forEach(b=>b.disabled=false);continue;}try{const response=await fetch("https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/tasks",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${currentUser.access_token}`},body:JSON.stringify(payload)}),data=await response.json();if(!response.ok)throw new Error(data.message);results.push(`候補 #${Number(li.dataset.index)+1}: 成功（チケット #${data.task.task_number}）`);}catch(error){results.push(`候補 #${Number(li.dataset.index)+1}: 失敗（${error.message}）`);buttons.forEach(b=>b.disabled=false);}}message.textContent=results.join(" / ");bulk.disabled=false;await loadRelatedTasks();displayTodos(currentMinutes.ai_minutes.todos||[]);}
document.getElementById("create-selected-todos").addEventListener("click",()=>createTodoTickets([...document.querySelectorAll(".todo-card:not(.is-created)")].filter(li=>li.querySelector(".todo-select")?.checked)));


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


// ログアウト
detailLogoutButton.addEventListener(
    "click",
    async () => {
        await logout();
    }
);


// 画面を開いたときに実行
initialize();
