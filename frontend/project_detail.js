import {
    getCurrentUser,
    logout
} from "./auth.js";


const baseApiUrl =
    "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/projects";

const projectId = new URLSearchParams(window.location.search).get("id");
const userStatus = document.getElementById("user-status");
const logoutButton = document.getElementById("logout-button");
const detailMessage = document.getElementById("detail-message");
const detailContent = document.getElementById("detail-content");
const tableBody = document.getElementById("minutes-table-body");
const minutesMessage = document.getElementById("minutes-message");


async function initialize() {
    if (!projectId) {
        detailMessage.textContent = "プロジェクトIDが指定されていません";
        return;
    }

    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.expired) {
            window.location.href = "projects.html";
            return;
        }

        userStatus.textContent =
            `ログイン中：${currentUser.profile.email}`;

        const response = await fetch(
            `${baseApiUrl}/${encodeURIComponent(projectId)}`,
            {
                headers: {
                    "Authorization": `Bearer ${currentUser.access_token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "プロジェクトの取得に失敗しました");
        }

        displayProject(data.project);
        displayMinutes(data.minutes || []);
        detailMessage.textContent = "";
        detailContent.hidden = false;
    } catch (error) {
        console.error(error);
        detailMessage.textContent = error.message;
    }
}


function displayProject(project) {
    document.getElementById("project-name").textContent = project.project_name;
    document.getElementById("project-number").textContent =
        `プロジェクト #${project.project_number || "-"}`;
    document.getElementById("project-manager").textContent = project.manager || "-";
    document.getElementById("project-start-date").textContent = project.start_date || "-";
    document.getElementById("project-end-date").textContent = project.end_date || "未設定";
    document.getElementById("project-description").textContent =
        project.description || "説明は登録されていません。";

    const status = document.getElementById("project-status");
    status.textContent = formatProjectStatus(project.status);
    status.className = `status-badge project-status-${project.status}`;

    document.getElementById("minutes-register-link").href =
        `register.html?project_id=${encodeURIComponent(project.project_id)}`;
}


function displayMinutes(minutes) {
    tableBody.innerHTML = "";

    if (minutes.length === 0) {
        minutesMessage.textContent = "関連する議事録はまだありません";
        return;
    }

    minutesMessage.textContent = `${minutes.length}件の議事録`;

    for (const minutesItem of minutes) {
        const row = document.createElement("tr");
        addTextCell(row, `#${minutesItem.minutes_number || "-"}`);
        addTextCell(row, minutesItem.meeting_name);
        addTextCell(row, minutesItem.meeting_date);
        addTextCell(row, minutesItem.assignee);
        addTextCell(row, formatMinutesStatus(minutesItem.status));

        const actionCell = document.createElement("td");
        const link = document.createElement("a");
        link.href = `detail.html?id=${encodeURIComponent(minutesItem.minutes_id)}#ai-section`;
        link.textContent = "表示";
        link.className = "table-action link-button";
        actionCell.appendChild(link);
        row.appendChild(actionCell);

        tableBody.appendChild(row);
    }
}


function addTextCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value || "-";
    row.appendChild(cell);
}


function formatProjectStatus(status) {
    return {
        active: "進行中",
        on_hold: "保留",
        completed: "完了"
    }[status] || "-";
}


function formatMinutesStatus(status) {
    return {
        draft: "下書き",
        pending: "承認待ち",
        approved: "承認済み",
        rejected: "差し戻し"
    }[status] || "-";
}


logoutButton.addEventListener("click", logout);
initialize();
