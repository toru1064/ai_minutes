import {
    getCurrentUser,
    handleSigninCallback,
    login,
    logout
} from "./auth.js";
import {setProfileDisplay} from "./display-utils.js";
import {createDynamicFilters, matchesFilter} from "./dynamic-filters.js";


// 議事録一覧を取得するAPI
const listApiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/minutes";

// HTMLの部品を取得
const userStatus =
    document.getElementById("user-status");
const loginButton =
    document.getElementById("login-button");
const logoutButton =
    document.getElementById("logout-button");
const minutesSection =
    document.getElementById("minutes-section");
const listMessage =
    document.getElementById("list-message");
const tableBody =
    document.getElementById("minutes-table-body");
let currentUser = null;
let allMinutes = [];
const fields = {
    number:{label:"議事録番号",type:"number",get:m=>m.minutes_number}, meeting:{label:"会議名",type:"text",get:m=>m.meeting_name},
    project:{label:"プロジェクト",type:"select",get:m=>m.project_id}, assignee:{label:"担当者",type:"select",get:m=>m.assignee},
    approver:{label:"承認者",type:"select",get:m=>m.approver}, status:{label:"承認状態",type:"select",get:m=>m.status,options:[["draft","下書き"],["pending","承認待ち"],["approved","承認済み"],["rejected","差し戻し"]]},
    progress:{label:"チケット進捗",type:"select",get:ticketProgress,options:[["none","チケットなし"],["not_started","未着手"],["in_progress","進行中"],["completed","すべて完了"]]},
    ai:{label:"AI議事録の作成状況",type:"select",get:m=>m.ai_minutes?"created":"none",options:[["none","未作成"],["created","作成済み"]]}, date:{label:"会議日",type:"date",get:m=>m.meeting_date}
};
const sorts=[["number_asc","議事録番号：昇順"],["number_desc","議事録番号：降順"],["date_desc","会議日：新しい順"],["date_asc","会議日：古い順"],["updated_desc","更新日：新しい順"],["updated_asc","更新日：古い順"],["progress","チケット進捗"]];
function ticketProgress(m){const p=m.task_progress||{},total=Number(p.total_tasks||0),done=Number(p.completed_tasks||0),started=Number(p.in_progress_tasks||0);if(!total)return"none";if(done===total)return"completed";if(started>0||done>0)return"in_progress";return"not_started";}


// 画面を開いたときの処理
async function initialize() {
    try {
        await handleSigninCallback();

        currentUser = await getCurrentUser();

        if (!currentUser || currentUser.expired) {
            userStatus.textContent =
                "ログインしていません";

            loginButton.hidden = false;
            logoutButton.hidden = true;
            minutesSection.hidden = true;
            return;
        }

        setProfileDisplay(userStatus, currentUser, "ログイン中：");

        loginButton.hidden = true;
        logoutButton.hidden = false;
        minutesSection.hidden = false;

        await loadMinutes();
    } catch (error) {
        console.error(error);

        userStatus.textContent =
            "ログイン情報を確認できませんでした";

        loginButton.hidden = false;
        logoutButton.hidden = true;
        minutesSection.hidden = true;
    }
}


// APIから議事録一覧を取得
async function loadMinutes() {
    listMessage.textContent =
        "議事録を読み込んでいます...";

    try {
        const response = await fetch(listApiUrl, {
            method: "GET",
            headers: {
                "Authorization":
                    `Bearer ${currentUser.access_token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                "一覧の取得に失敗しました"
            );
        }

        allMinutes = data.minutes || [];

        fields.project.options=[...new Map(allMinutes.filter(m=>m.project_id).map(m=>[m.project_id,[m.project_id,m.project_name]])).values()];
        for(const key of ["assignee","approver"])fields[key].options=[...new Set(allMinutes.map(m=>m[key]).filter(Boolean))].map(v=>[v,v]);
        createDynamicFilters({fields,sorts,defaultSort:"number_asc",onApply:applyFilters});
    } catch (error) {
        console.error(error);
        listMessage.textContent = error.message;
    }
}


// 検索条件と状態で絞り込む
export function filterAndSortMinutes(items, {query, filters, sort}) {
    const keyword = query.trim().toLocaleLowerCase("ja").replace(/^#/, "");
    const result = items.filter(minutesItem => {
            const number=String(minutesItem.minutes_number||"");
            const searchableText = [number,`#${number}`,
                minutesItem.project_name,
                minutesItem.meeting_name,
                minutesItem.meeting_date,
                minutesItem.assignee,
                minutesItem.approver
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return (!keyword || searchableText.includes(keyword)) && filters.every(row=>matchesFilter(fields[row.field].get(minutesItem),row));
        });
    const direction=sort.endsWith("desc")?-1:1;
    result.sort((a,b)=>{if(sort.startsWith("number"))return direction*(Number(a.minutes_number)-Number(b.minutes_number));if(sort.startsWith("date"))return direction*String(a.meeting_date||"").localeCompare(String(b.meeting_date||""));if(sort.startsWith("updated"))return direction*String(a.updated_at||"").localeCompare(String(b.updated_at||""));return ["none","not_started","in_progress","completed"].indexOf(ticketProgress(a))-["none","not_started","in_progress","completed"].indexOf(ticketProgress(b))||Number(a.minutes_number)-Number(b.minutes_number);});
    return result;
}
function applyFilters(state) {
    displayMinutesList(filterAndSortMinutes(allMinutes,state));
}


// 議事録を表に表示
function displayMinutesList(minutes) {
    tableBody.innerHTML = "";
    if (!allMinutes.length) { listMessage.textContent = "登録された議事録はありません"; return; }
    if (!minutes.length) { listMessage.textContent = "条件に一致する議事録はありません"; return; }
    listMessage.textContent = `${minutes.length}件を表示`;
    for (const item of minutes) {
        const row=document.createElement("tr"), progress=item.task_progress||{};
        addNumberCell(row,item.minutes_number,item.minutes_id);
        addMeetingNameCell(row,item.meeting_name,item.minutes_id,"meeting-name-cell");
        addTextCell(row,item.meeting_date); addStatusCell(row,item.status);
        addTextCell(row,progress.total_tasks?`${progress.completed_tasks} / ${progress.total_tasks}件完了`:"チケットなし");
        addTextCell(row,item.assignee); addTextCell(row,item.approver); addTextCell(row,formatDate(item.updated_at));
        addProjectCell(row,item.project_name,item.project_id); tableBody.appendChild(row);
    }
}

// 会議名から詳細ページへ移動できるリンクを作成
function addMeetingNameCell(row, value, minutesId, className) {
    const cell = document.createElement("td");
    const link = document.createElement("a");
    link.textContent = value || "-";
    link.href = `detail.html?id=${encodeURIComponent(minutesId)}`;
    link.classList.add("minutes-number-link");
    cell.classList.add(className);
    cell.appendChild(link);
    row.appendChild(cell);
}


// 所属プロジェクトへのリンクを作成
function addProjectCell(row, projectName, projectId) {
    const cell = document.createElement("td");

    if (!projectId) {
        cell.textContent = "未設定";
        row.appendChild(cell);
        return;
    }

    const link = document.createElement("a");
    link.textContent = projectName || "プロジェクト";
    link.href =
        `project_detail.html?id=${encodeURIComponent(projectId)}`;
    link.classList.add("project-link");

    cell.appendChild(link);
    row.appendChild(cell);
}


// 議事録番号のリンクを作成
function addNumberCell(
    row,
    minutesNumber,
    minutesId
) {
    const cell = document.createElement("td");
    const link = document.createElement("a");

    link.textContent =
        minutesNumber
            ? String(minutesNumber)
            : "-";

    link.href =
        `detail.html?id=${encodeURIComponent(minutesId)}`;

    link.classList.add(
        "minutes-number-link"
    );

    cell.appendChild(link);
    row.appendChild(cell);
}


// 文字を表示する列を作成
function addTextCell(row, value, className) {
    const cell = document.createElement("td");

    cell.textContent = value || "-";

    if (className) {
        cell.classList.add(className);
    }

    row.appendChild(cell);
}


// 状態を色付きで表示
function addStatusCell(row, status) {
    const cell = document.createElement("td");
    const statusBadge =
        document.createElement("span");

    statusBadge.textContent =
        formatStatus(status);

    statusBadge.classList.add(
        "status-badge",
        `status-${status || "unknown"}`
    );

    cell.appendChild(statusBadge);
    row.appendChild(cell);
}


// 状態を日本語に変換
function formatStatus(status) {
    const statusLabels = {
        draft: "下書き",
        pending: "承認待ち",
        approved: "承認済み",
        rejected: "差し戻し"
    };

    return statusLabels[status] || status || "-";
}


// 更新日時を日本語で表示
function formatDate(value) {
    if (!value) {
        return "-";
    }

    return new Date(value).toLocaleString(
        "ja-JP",
        {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


// ログインボタン
loginButton.addEventListener("click", async () => {
    await login();
});


// ログアウトボタン
logoutButton.addEventListener("click", async () => {
    await logout();
});


// 画面を開いたときに実行
initialize();
