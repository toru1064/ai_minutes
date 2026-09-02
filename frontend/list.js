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
const searchInput =
    document.getElementById("minutes-search");
const statusTabs =
    document.querySelectorAll(".status-tab");

let currentUser = null;
let allMinutes = [];
let selectedStatus = "all";


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
                data.message ||
                "一覧の取得に失敗しました"
            );
        }

        allMinutes = data.minutes || [];

        applyFilters();
    } catch (error) {
        console.error(error);
        listMessage.textContent = error.message;
    }
}


// 検索条件と状態で絞り込む
function applyFilters() {
    const keyword =
        searchInput.value.trim().toLowerCase();

    const filteredMinutes = allMinutes.filter(
        minutesItem => {
            const matchesStatus =
                selectedStatus === "all" ||
                minutesItem.status === selectedStatus;

            const searchableText = [
                minutesItem.minutes_id,
                minutesItem.project_name,
                minutesItem.meeting_name,
                minutesItem.meeting_date,
                minutesItem.assignee,
                minutesItem.approver
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesKeyword =
                !keyword ||
                searchableText.includes(keyword);

            return matchesStatus && matchesKeyword;
        }
    );

    displayMinutesList(filteredMinutes);
}


// 議事録を表に表示
function displayMinutesList(minutes) {
    tableBody.innerHTML = "";

    if (allMinutes.length === 0) {
        listMessage.textContent =
            "登録された議事録はありません";
        return;
    }

    if (minutes.length === 0) {
        listMessage.textContent =
            "条件に一致する議事録はありません";
        return;
    }

    listMessage.textContent =
        `${minutes.length}件を表示`;

    for (const minutesItem of minutes) {
        const row = document.createElement("tr");

        addNumberCell(
            row,
            minutesItem.minutes_number,
            minutesItem.minutes_id
        );

        addProjectCell(
            row,
            minutesItem.project_name,
            minutesItem.project_id
        );

        addTextCell(
            row,
            minutesItem.meeting_name,
            "meeting-name-cell"
        );

        addTextCell(
            row,
            minutesItem.meeting_date
        );

        addTextCell(
            row,
            minutesItem.assignee
        );

        addTextCell(
            row,
            minutesItem.approver
        );

        addTextCell(
            row,
            formatDate(minutesItem.updated_at)
        );

        addStatusCell(
            row,
            minutesItem.status
        );

        addViewButton(
            row,
            "表示",
            minutesItem.minutes_id,
            "raw-section"
        );

        addViewButton(
            row,
            "表示",
            minutesItem.minutes_id,
            "ai-section"
        );

        tableBody.appendChild(row);
    }
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
            ? `#${minutesNumber}`
            : "-";

    link.href =
        `detail.html?id=${encodeURIComponent(minutesId)}` +
        "#ai-section";

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
    button.classList.add("table-action");

    button.addEventListener("click", () => {
        window.location.href =
            `detail.html?id=${encodeURIComponent(minutesId)}` +
            `#${sectionId}`;
    });

    cell.appendChild(button);
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


// 検索欄へ入力したとき
searchInput.addEventListener("input", () => {
    applyFilters();
});


// 状態タブを押したとき
for (const tab of statusTabs) {
    tab.addEventListener("click", () => {
        selectedStatus = tab.dataset.status;

        for (const otherTab of statusTabs) {
            otherTab.classList.remove("active");
        }

        tab.classList.add("active");

        applyFilters();
    });
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
