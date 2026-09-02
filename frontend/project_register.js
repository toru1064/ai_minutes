import {
    getCurrentUser,
    handleSigninCallback,
    login,
    logout
} from "./auth.js";


const apiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/projects";

const form = document.getElementById("project-form");
const registerButton = document.getElementById("register-button");
const statusMessage = document.getElementById("status-message");
const userStatus = document.getElementById("user-status");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");

let currentUser = null;


async function initialize() {
    try {
        await handleSigninCallback();
        currentUser = await getCurrentUser();

        if (!currentUser || currentUser.expired) {
            userStatus.textContent = "ログインしていません";
            loginButton.hidden = false;
            logoutButton.hidden = true;
            return;
        }

        userStatus.textContent =
            `ログイン中：${currentUser.profile.email}`;
        loginButton.hidden = true;
        logoutButton.hidden = false;
        form.hidden = false;
    } catch (error) {
        console.error(error);
        userStatus.textContent = "ログイン情報を確認できませんでした";
    }
}


form.addEventListener("submit", async event => {
    event.preventDefault();
    registerButton.disabled = true;
    statusMessage.textContent = "プロジェクトを登録しています...";

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${currentUser.access_token}`
            },
            body: JSON.stringify({
                project_name: document.getElementById("project-name").value,
                manager: document.getElementById("manager").value,
                status: document.getElementById("project-status").value,
                start_date: document.getElementById("start-date").value,
                end_date: document.getElementById("end-date").value,
                description: document.getElementById("description").value
            })
        });

        const data = await response.json();

        if (!response.ok) {
            const fields = data.fields?.join(", ");
            throw new Error(fields ? `${data.message}：${fields}` : data.message);
        }

        window.location.href =
            `project_detail.html?id=${encodeURIComponent(data.project.project_id)}`;
    } catch (error) {
        console.error(error);
        statusMessage.textContent = error.message || "登録に失敗しました";
        registerButton.disabled = false;
    }
});

loginButton.addEventListener("click", login);
logoutButton.addEventListener("click", logout);

initialize();
