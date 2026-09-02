import {
    getCurrentUser,
    handleSigninCallback,
    login,
    logout
} from "./auth.js";


const apiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/projects";

const userStatus = document.getElementById("user-status");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const projectsSection = document.getElementById("projects-section");
const listMessage = document.getElementById("list-message");
const tableBody = document.getElementById("projects-table-body");
const searchInput = document.getElementById("project-search");
const statusTabs = document.querySelectorAll(".project-status-tab");

let currentUser = null;
let allProjects = [];
let selectedStatus = "all";


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
        projectsSection.hidden = false;

        await loadProjects();
    } catch (error) {
        console.error(error);
        userStatus.textContent = "ログイン情報を確認できませんでした";
    }
}


async function loadProjects() {
    try {
        const response = await fetch(apiUrl, {
            headers: {
                "Authorization": `Bearer ${currentUser.access_token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "プロジェクトの取得に失敗しました");
        }

        allProjects = data.projects || [];
        applyFilters();
    } catch (error) {
        console.error(error);
        listMessage.textContent = error.message;
    }
}


function applyFilters() {
    const keyword = searchInput.value.trim().toLowerCase();

    const projects = allProjects.filter(project => {
        const matchesStatus =
            selectedStatus === "all" || project.status === selectedStatus;

        const searchableText = [
            project.project_name,
            project.manager,
            project.description
        ].filter(Boolean).join(" ").toLowerCase();

        return matchesStatus && (!keyword || searchableText.includes(keyword));
    });

    displayProjects(projects);
}


function displayProjects(projects) {
    tableBody.innerHTML = "";

    if (allProjects.length === 0) {
        listMessage.textContent = "登録されたプロジェクトはありません";
        return;
    }

    if (projects.length === 0) {
        listMessage.textContent = "条件に一致するプロジェクトはありません";
        return;
    }

    listMessage.textContent = `${projects.length}件を表示`;

    for (const project of projects) {
        const row = document.createElement("tr");

        addTextCell(row, `#${project.project_number || "-"}`);
        addProjectLink(row, project);
        addTextCell(row, project.manager);
        addTextCell(row, project.start_date);
        addTextCell(row, project.end_date || "-");
        addStatusCell(row, project.status);
        addDetailButton(row, project.project_id);

        tableBody.appendChild(row);
    }
}


function addTextCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value || "-";
    row.appendChild(cell);
}


function addProjectLink(row, project) {
    const cell = document.createElement("td");
    const link = document.createElement("a");
    link.href = `project_detail.html?id=${encodeURIComponent(project.project_id)}`;
    link.textContent = project.project_name;
    link.className = "minutes-number-link";
    cell.appendChild(link);
    row.appendChild(cell);
}


function addStatusCell(row, status) {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    badge.textContent = formatStatus(status);
    badge.className = `status-badge project-status-${status}`;
    cell.appendChild(badge);
    row.appendChild(cell);
}


function addDetailButton(row, projectId) {
    const cell = document.createElement("td");
    const link = document.createElement("a");
    link.href = `project_detail.html?id=${encodeURIComponent(projectId)}`;
    link.textContent = "表示";
    link.className = "table-action link-button";
    cell.appendChild(link);
    row.appendChild(cell);
}


function formatStatus(status) {
    return {
        active: "進行中",
        on_hold: "保留",
        completed: "完了"
    }[status] || "-";
}


searchInput.addEventListener("input", applyFilters);

for (const tab of statusTabs) {
    tab.addEventListener("click", () => {
        selectedStatus = tab.dataset.status;
        for (const item of statusTabs) item.classList.remove("active");
        tab.classList.add("active");
        applyFilters();
    });
}

loginButton.addEventListener("click", login);
logoutButton.addEventListener("click", logout);

initialize();
