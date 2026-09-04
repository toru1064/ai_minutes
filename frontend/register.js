import {
    getCurrentUser,
    handleSigninCallback,
    login,
    logout
} from "./auth.js";
import {setProfileDisplay} from "./display-utils.js";
import {setupSearchSelect} from "./search-select.js";
import {loadUsers, populateUserSelect, selectedUser} from "./user-select.js";


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

const projectSelect = document.getElementById("project-id");
const projectSearch = document.getElementById("project-search");


let currentUser = null;
let users = [];


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
            setProfileDisplay(userStatus, currentUser, "ログイン中：");

            loginButton.hidden = true;
            logoutButton.hidden = false;
            form.hidden = false;

            await loadProjects();
            try {
                users = await loadUsers(currentUser.access_token);
                populateUserSelect(assignee, users);
                populateUserSelect(approver, users);
                if (!users.length) registerButton.disabled = true;
            } catch (error) {
                statusMessage.textContent = error.message;
                assignee.disabled = approver.disabled = registerButton.disabled = true;
            }
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

    const selectedProjectId =
        new URLSearchParams(window.location.search).get("project_id") || "";

    setupSearchSelect(
        projectSearch,
        projectSelect,
        projects.map(project => ({...project, number: project.project_number})),
        {
            id: project => project.project_id,
            label: project =>
                `#${project.project_number} ${project.project_name}` +
                `（責任者：${project.manager || "未設定"}）`,
            selectedId: selectedProjectId
        }
    );

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

                            ...selectedUser(assignee, users, "assignee_id", "assignee"),
                            ...selectedUser(approver, users, "approver_id", "approver"),

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
