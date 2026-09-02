import {
    getCurrentUser,
    handleSigninCallback,
    login,
    logout
} from "./auth.js";


// API Gatewayの議事録登録URL
const saveApiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/minutes";

const projectsApiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/projects";


// HTMLの部品を取得
const form =
    document.getElementById("minutes-form");

const meetingText =
    document.getElementById("meeting-text");

const registerButton =
    document.getElementById("register-button");

const statusMessage =
    document.getElementById("status-message");

const userStatus =
    document.getElementById("user-status");

const loginButton =
    document.getElementById("login-button");

const logoutButton =
    document.getElementById("logout-button");

const meetingName =
    document.getElementById("meeting-name");

const meetingDate =
    document.getElementById("meeting-date");

const assignee =
    document.getElementById("assignee");

const approver =
    document.getElementById("approver");

const meetingFile =
    document.getElementById("meeting-file");

const projectSelect =
    document.getElementById("project-id");


let currentUser = null;


// ログイン状態を確認
async function initializeAuth() {
    try {
        // Cognitoから戻った直後なら認可コードを処理
        await handleSigninCallback();

        currentUser = await getCurrentUser();

        if (
            currentUser &&
            !currentUser.expired
        ) {
            userStatus.textContent =
                `ログイン中：${currentUser.profile.email}`;

            loginButton.hidden = true;
            logoutButton.hidden = false;
            form.hidden = false;

            await loadProjects();
        } else {
            userStatus.textContent =
                "ログインしていません";

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


// 選択できるプロジェクト一覧を取得
async function loadProjects() {
    const response = await fetch(
        projectsApiUrl,
        {
            headers: {
                "Authorization":
                    `Bearer ${currentUser.access_token}`
            }
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.message ||
            "プロジェクトの取得に失敗しました"
        );
    }

    const projects = data.projects || [];

    for (const project of projects) {
        const option = document.createElement("option");
        option.value = project.project_id;
        option.textContent =
            `#${project.project_number} ${project.project_name}`;
        projectSelect.appendChild(option);
    }

    const selectedProjectId =
        new URLSearchParams(window.location.search)
            .get("project_id");

    if (selectedProjectId) {
        projectSelect.value = selectedProjectId;
    }

    if (projects.length === 0) {
        statusMessage.textContent =
            "先にプロジェクトを登録してください";
        registerButton.disabled = true;
    }
}


// ログインボタンを押したとき
loginButton.addEventListener(
    "click",
    async () => {
        await login();
    }
);


// ログアウトボタンを押したとき
logoutButton.addEventListener(
    "click",
    async () => {
        await logout();
    }
);


// 選択したTXTファイルを会議内容へ読み込む
meetingFile.addEventListener(
    "change",
    async () => {
        const selectedFile =
            meetingFile.files[0];

        if (!selectedFile) {
            return;
        }

        try {
            const fileData =
                await selectedFile.arrayBuffer();

            // 最初にUTF-8として読み込む
            let meetingContent =
                new TextDecoder("utf-8")
                    .decode(fileData);

            // 文字化けがあればShift-JISとして読み直す
            if (
                meetingContent.includes("\uFFFD")
            ) {
                meetingContent =
                    new TextDecoder("shift-jis")
                        .decode(fileData);
            }

            meetingText.value =
                meetingContent;

            statusMessage.textContent =
                "TXTファイルを読み込みました";
        } catch (error) {
            console.error(error);

            statusMessage.textContent =
                "TXTファイルの読み込みに失敗しました";
        }
    }
);


// 原文をAI生成せずに登録
form.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (
            !currentUser ||
            currentUser.expired
        ) {
            statusMessage.textContent =
                "ログインしてください";

            return;
        }

        registerButton.disabled = true;

        statusMessage.textContent =
            "議事録を登録しています...";

        try {
            const response =
                await fetch(
                    saveApiUrl,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Bearer ${currentUser.access_token}`
                        },

                        body: JSON.stringify({
                            project_id:
                                projectSelect.value,

                            meeting_name:
                                meetingName.value,

                            meeting_date:
                                meetingDate.value,

                            assignee:
                                assignee.value,

                            approver:
                                approver.value,

                            raw_minutes:
                                meetingText.value
                        })
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                const missingFields =
                    data.fields?.join(", ");

                throw new Error(
                    missingFields
                        ? `${data.message}：${missingFields}`
                        : (
                            data.message ||
                            "議事録の登録に失敗しました"
                        )
                );
            }

            statusMessage.textContent =
                "議事録を登録しました";

            // 登録後は議事録一覧へ移動
            window.location.href =
                "index.html";
                
        } catch (error) {
            console.error(error);

            statusMessage.textContent =
                error.message;
        } finally {
            registerButton.disabled = false;
        }
    }
);


// 画面を開いたときに認証状態を確認
initializeAuth();
