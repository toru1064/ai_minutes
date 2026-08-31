import {
    getCurrentUser,
    handleSigninCallback,
    login,
    logout
} from "./auth.js";


// API GatewayのURL
const generateApiUrl  =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/minutes/generate";

const saveApiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/minutes";

// HTMLの部品を取得
const form = document.getElementById("minutes-form");
const meetingText = document.getElementById("meeting-text");
const generateButton = document.getElementById("generate-button");
const statusMessage = document.getElementById("status-message");
const resultSection = document.getElementById("result");
const userStatus = document.getElementById("user-status");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const meetingName = document.getElementById("meeting-name");
const meetingDate = document.getElementById("meeting-date");
const assignee = document.getElementById("assignee");
const approver = document.getElementById("approver");
const saveButton = document.getElementById("save-button");
const saveMessage = document.getElementById("save-message");

let currentUser = null;

// AIが生成した議事録を一時的に保持
let generatedMinutes = null;


// ログイン状態を確認
async function initializeAuth() {
    try {
        // Cognitoから戻った直後なら認可コードを処理
        await handleSigninCallback();

        currentUser = await getCurrentUser();

        if (currentUser && !currentUser.expired) {
            userStatus.textContent =
                `ログイン中：${currentUser.profile.email}`;

            loginButton.hidden = true;
            logoutButton.hidden = false;
            form.hidden = false;
        } else {
            userStatus.textContent = "ログインしていません";

            loginButton.hidden = false;
            logoutButton.hidden = true;
            form.hidden = true;
        }
    } catch (error) {
        console.error(error);

        userStatus.textContent =
            "ログイン情報を確認できませんでした";

        loginButton.hidden = false;
        logoutButton.hidden = true;
        form.hidden = true;
    }
}


// ログインボタンを押したとき
loginButton.addEventListener("click", async () => {
    await login();
});


// ログアウトボタンを押したとき
logoutButton.addEventListener("click", async () => {
    await logout();
});


// フォームが送信されたとき
form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser || currentUser.expired) {
        statusMessage.textContent = "ログインしてください";
        return;
    }

    statusMessage.textContent = "議事録を作成しています...";
    resultSection.hidden = true;
    generateButton.disabled = true;

    try {
        // JWTトークン付きでAPIを呼び出す
        const response = await fetch(generateApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization":
                    `Bearer ${currentUser.access_token}`
            },
            body: JSON.stringify({
                meeting_text: meetingText.value
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "議事録の作成に失敗しました"
            );
        }

        // 保存ボタンで利用するため生成結果を保持
        generatedMinutes = data;
        saveMessage.textContent = "";

        displayMinutes(data);

        statusMessage.textContent = "";
        resultSection.hidden = false;
    } catch (error) {
        statusMessage.textContent = error.message;
    } finally {
        generateButton.disabled = false;
    }
});

// 議事録保存ボタンを押したとき
saveButton.addEventListener("click", async () => {
    if (!currentUser || currentUser.expired) {
        saveMessage.textContent = "ログインしてください";
        return;
    }

    if (!generatedMinutes) {
        saveMessage.textContent =
            "先にAI議事録を作成してください";
        return;
    }

    saveButton.disabled = true;
    saveMessage.textContent = "保存しています...";

    try {
        // 基本情報・原文・AI生成結果を送信
        const response = await fetch(saveApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization":
                    `Bearer ${currentUser.access_token}`
            },
            body: JSON.stringify({
                meeting_name: meetingName.value,
                meeting_date: meetingDate.value,
                assignee: assignee.value,
                approver: approver.value,
                raw_minutes: meetingText.value,
                ai_minutes: generatedMinutes
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "保存に失敗しました"
            );
        }

        saveMessage.textContent =
            "議事録を保存しました";
    } catch (error) {
        saveMessage.textContent = error.message;
    } finally {
        saveButton.disabled = false;
    }
});

// 議事録を項目ごとに表示
function displayMinutes(minutes) {
    document.getElementById("summary").textContent =
        minutes.summary || "記載なし";

    document.getElementById("next-meeting").textContent =
        minutes.next_meeting || "記載なし";

    // 決定事項を一覧表示
    const decisionsList = document.getElementById("decisions");
    decisionsList.innerHTML = "";

    for (const decision of minutes.decisions || []) {
        const listItem = document.createElement("li");
        listItem.textContent = decision;
        decisionsList.appendChild(listItem);
    }

    // TODOを一覧表示
    const todosList = document.getElementById("todos");
    todosList.innerHTML = "";

    for (const todo of minutes.todos || []) {
        const listItem = document.createElement("li");

        listItem.textContent =
            `${todo.task}（担当：${todo.assignee || "未定"}、期限：${todo.deadline || "未定"}）`;

        todosList.appendChild(listItem);
    }
}


// 画面を開いたときに認証状態を確認
initializeAuth();