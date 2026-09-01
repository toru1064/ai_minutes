import {
    getCurrentUser,
    handleSigninCallback,
    login,
    logout
} from "./auth.js";


// 議事録一覧を取得するAPI
const listApiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/minutes";

// HTMLの部品を取得
const userStatus = document.getElementById("user-status");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const minutesSection = document.getElementById("minutes-section");
const listMessage = document.getElementById("list-message");
const tableBody = document.getElementById("minutes-table-body");
const minutesDialog = document.getElementById("minutes-dialog");
const dialogTitle = document.getElementById("dialog-title");
const dialogContent = document.getElementById("dialog-content");
const dialogCloseButton = document.getElementById("dialog-close-button");

let currentUser = null;


// 画面を開いたときの処理
async function initialize() {
    try {
        await handleSigninCallback();

        currentUser = await getCurrentUser();

        if (!currentUser || currentUser.expired) {
            userStatus.textContent = "ログインしていません";

            loginButton.hidden = false;
            logoutButton.hidden = true;
            minutesSection.hidden = true;
            return;
        }

        userStatus.textContent =
            `ログイン中：${currentUser.profile.email}`;

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
                data.message || "一覧の取得に失敗しました"
            );
        }

        displayMinutesList(data.minutes || []);
    } catch (error) {
        listMessage.textContent = error.message;
    }
}


// 議事録を表に表示
function displayMinutesList(minutes) {
    tableBody.innerHTML = "";

    if (minutes.length === 0) {
        listMessage.textContent =
            "登録された議事録はありません";
        return;
    }

    listMessage.textContent =
        `${minutes.length}件の議事録`;

    for (const minutesItem of minutes) {
        const row = document.createElement("tr");

        addTextCell(
            row,
            minutesItem.minutes_id?.slice(0, 8)
        );
        addTextCell(row, minutesItem.meeting_name);
        addTextCell(row, minutesItem.meeting_date);
        addTextCell(row, minutesItem.assignee);
        addTextCell(row, minutesItem.approver);
        addTextCell(
            row,
            formatDate(minutesItem.updated_at)
        );
        addTextCell(
            row,
            formatStatus(minutesItem.status)
        );

        addViewButton(
            row,
            "見る",
            minutesItem.minutes_id,
            "raw-section"
        );

        addViewButton(
            row,
            "見る",
            minutesItem.minutes_id,
            "ai-section"
        );

        tableBody.appendChild(row);
    }
}


// 文字を表示する列を作成
function addTextCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value || "-";
    row.appendChild(cell);
}


// 詳細ページへ移動するボタンを作成
function addViewButton(
    row,
    label,
    minutesId,
    sectionId
) {
    const cell = document.createElement("td");
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;

    button.addEventListener("click", () => {
        window.location.href =
            `detail.html?id=${encodeURIComponent(minutesId)}` +
            `#${sectionId}`;
    });

    cell.appendChild(button);
    row.appendChild(cell);
}


// 詳細ウィンドウを開く
function openDialog(title, content) {
    dialogTitle.textContent = title;
    dialogContent.textContent = content;
    minutesDialog.showModal();
}


// AI議事録を読みやすい文章に変換
function formatAiMinutes(minutes) {
    if (!minutes) {
        return "記載なし";
    }

    const decisions = (minutes.decisions || [])
        .map(decision => `・${decision}`)
        .join("\n");

    const todos = (minutes.todos || [])
        .map(todo =>
            `・${todo.task}` +
            `（担当：${todo.assignee || "未定"}、` +
            `期限：${todo.deadline || "未定"}）`
        )
        .join("\n");

    return [
        "【会議の要約】",
        minutes.summary || "記載なし",
        "",
        "【決定事項】",
        decisions || "記載なし",
        "",
        "【TODO】",
        todos || "記載なし",
    ].join("\n");
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

    return new Date(value).toLocaleString("ja-JP");
}


// ログインボタン
loginButton.addEventListener("click", async () => {
    await login();
});


// ログアウトボタン
logoutButton.addEventListener("click", async () => {
    await logout();
});


// 詳細ウィンドウを閉じる
dialogCloseButton.addEventListener("click", () => {
    minutesDialog.close();
});


// 画面を開いたときに実行
initialize();