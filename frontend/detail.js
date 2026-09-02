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


let currentUser = null;
let currentMinutes = null;


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

        displayMinutes(
            currentMinutes
        );

        detailMessage.textContent = "";
        detailContent.hidden = false;

        displaySelectedSection();
    } catch (error) {
        console.error(error);

        detailMessage.textContent =
            error.message;
    }
}


// 選択された内容だけを表示
function displaySelectedSection() {
    const sectionId =
        window.location.hash.slice(1);

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
        approvalArea.hidden = true;
    } else {
        aiSection.hidden = false;
        rawSection.hidden = true;

        // AI議事録が未生成なら承認欄も非表示
        approvalArea.hidden =
            !hasAiMinutes(
                currentMinutes
            );
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

    const label = document.createTextNode(
        "プロジェクト："
    );
    const link = document.createElement("a");

    link.href =
        `project_detail.html?id=${encodeURIComponent(minutes.project_id)}`;
    link.textContent =
        minutes.project_name || "プロジェクト";

    projectElement.appendChild(label);
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
    } else if (
        status === "pending"
    ) {
        approveButton.hidden = false;
        rejectButton.hidden = false;
    }
}


// 操作中はボタンを無効にする
function disableStatusButtons() {
    requestButton.disabled = true;
    approveButton.disabled = true;
    rejectButton.disabled = true;
}


// 議事録の状態を更新
async function updateStatus(newStatus) {
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
                        status: newStatus
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

        displayStatus(
            currentMinutes.status
        );

        displayStatusButtons(
            currentMinutes.status
        );

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
    const todosList =
        document.getElementById(
            "todos"
        );

    todosList.innerHTML = "";

    if (todos.length === 0) {
        addListItem(
            todosList,
            "記載なし"
        );

        return;
    }

    for (
        const todo
        of todos
    ) {
        const text =
            `${todo.task}` +
            `（担当：${todo.assignee || "未定"}、` +
            `期限：${todo.deadline || "未定"}）`;

        addListItem(
            todosList,
            text
        );
    }
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
        await updateStatus(
            "approved"
        );
    }
);


// 差し戻し
rejectButton.addEventListener(
    "click",
    async () => {
        await updateStatus(
            "rejected"
        );
    }
);


// ログアウト
detailLogoutButton.addEventListener(
    "click",
    async () => {
        await logout();
    }
);


// 画面を開いたときに実行
initialize();
