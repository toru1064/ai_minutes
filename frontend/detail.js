import {
    getCurrentUser
} from "./auth.js";


// API GatewayのURL
const apiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/minutes";

// URLから議事録IDを取得
const urlParameters =
    new URLSearchParams(window.location.search);
const minutesId =
    urlParameters.get("id");

// HTMLの部品を取得
const detailMessage =
    document.getElementById("detail-message");
const detailContent =
    document.getElementById("detail-content");
const downloadButton =
    document.getElementById("download-button");

let currentMinutes = null;


// 議事録の詳細を取得
async function initialize() {
    if (!minutesId) {
        detailMessage.textContent =
            "議事録IDが指定されていません";
        return;
    }

    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.expired) {
            window.location.href = "index.html";
            return;
        }

        const response = await fetch(
            `${apiUrl}/${encodeURIComponent(minutesId)}`,
            {
                method: "GET",
                headers: {
                    "Authorization":
                        `Bearer ${currentUser.access_token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "議事録の取得に失敗しました"
            );
        }

        currentMinutes = data.minutes;
        displayMinutes(currentMinutes);

        detailMessage.textContent = "";
        detailContent.hidden = false;

        // 選択された内容だけを表示
        const sectionId =
            window.location.hash.slice(1);

        const aiSection =
            document.getElementById("ai-section");
        const rawSection =
            document.getElementById("raw-section");

        if (sectionId === "ai-section") {
            aiSection.hidden = false;
            rawSection.hidden = true;
        } else if (sectionId === "raw-section") {
            aiSection.hidden = true;
            rawSection.hidden = false;
        }
    } catch (error) {
        console.error(error);
        detailMessage.textContent = error.message;
    }
}


// 議事録を画面へ表示
function displayMinutes(minutes) {
    const aiMinutes = minutes.ai_minutes || {};

    document.getElementById("meeting-name").textContent =
        minutes.meeting_name || "議事録詳細";

    document.getElementById("summary").textContent =
        aiMinutes.summary || "記載なし";

    displayDecisions(aiMinutes.decisions || []);
    displayTodos(aiMinutes.todos || []);

    document.getElementById("raw-minutes").textContent =
        minutes.raw_minutes || "記載なし";
}


// 決定事項を一覧表示
function displayDecisions(decisions) {
    const decisionsList =
        document.getElementById("decisions");

    decisionsList.innerHTML = "";

    if (decisions.length === 0) {
        addListItem(decisionsList, "記載なし");
        return;
    }

    for (const decision of decisions) {
        addListItem(decisionsList, decision);
    }
}


// TODOを一覧表示
function displayTodos(todos) {
    const todosList =
        document.getElementById("todos");

    todosList.innerHTML = "";

    if (todos.length === 0) {
        addListItem(todosList, "記載なし");
        return;
    }

    for (const todo of todos) {
        const text =
            `${todo.task}` +
            `（担当：${todo.assignee || "未定"}、` +
            `期限：${todo.deadline || "未定"}）`;

        addListItem(todosList, text);
    }
}


// リストへ項目を追加
function addListItem(list, text) {
    const listItem = document.createElement("li");
    listItem.textContent = text;
    list.appendChild(listItem);
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


// 原文をTXTファイルとして保存
downloadButton.addEventListener("click", () => {
    if (!currentMinutes) {
        return;
    }

    const textFile = new Blob(
        [currentMinutes.raw_minutes || ""],
        {
            type: "text/plain;charset=utf-8"
        }
    );

    const downloadUrl =
        URL.createObjectURL(textFile);

    const link = document.createElement("a");

    const safeMeetingName =
        (currentMinutes.meeting_name || "議事録")
            .replace(/[\\/:*?"<>|]/g, "_");

    link.href = downloadUrl;
    link.download = `${safeMeetingName}_原文.txt`;
    link.click();

    URL.revokeObjectURL(downloadUrl);
});


// 画面を開いたときに実行
initialize();