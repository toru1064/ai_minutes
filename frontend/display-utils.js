const FIELD_LABELS = {
    project_name: "プロジェクト名", meeting_name: "会議名", name: "会議名",
    meeting_date: "会議日", manager: "責任者", assignee: "担当者", approver: "承認者",
    description: "概要・説明", start_date: "開始日", end_date: "終了予定日",
    status: "状態", title: "件名", due_date: "期限", priority: "優先度",
    resolution: "処置結果", raw_minutes: "会議内容（原文）", ai_minutes: "AI議事録", project_id: "プロジェクト"
};
const STATUS_LABELS = {draft:"下書き",pending:"承認待ち",approved:"承認済み",rejected:"差し戻し",active:"進行中",on_hold:"保留",completed:"完了",not_started:"未着手",in_progress:"進行中"};
// Cognito の sub は UUID のバージョンに限定せず、表示用途では形式だけを確認する。
const UUID_FORMAT = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function normalizeUserProfile(userOrProfile = {}) {
    if (!userOrProfile || typeof userOrProfile !== "object") return {};
    const profile = userOrProfile.profile;
    return profile && typeof profile === "object" ? profile : userOrProfile;
}

export function displayUser(value, userOrProfile = {}) {
    if (!value) return "不明なユーザー";
    const profile = normalizeUserProfile(userOrProfile);
    // sub は本人判定にだけ使い、表示名を識別子として扱わない。
    if (profile.sub && String(value) === String(profile.sub)) {
        return profileDisplayName(profile);
    }
    return abbreviatedUser(value);
}

export function profileDisplayName(userOrProfile = {}) {
    const profile = normalizeUserProfile(userOrProfile);
    return firstText(
        humanReadableName(profile.name),
        humanReadableName(profile.preferred_username),
        humanReadableName(profile["cognito:username"]),
        humanReadableName(profile.username),
        humanReadableName(emailLocalPart(profile.email)),
        abbreviatedUser(profile.sub),
        "ユーザー"
    );
}

/**
 * ユーザー識別子を DOM に表示する唯一の入口。
 * 値を直接 textContent に渡さず、必ず表示用の名前へ変換してから設定する。
 */
export function setUserDisplay(element, value, userOrProfile = {}, prefix = "") {
    if (!element) return;
    element.textContent = `${prefix}${displayUser(value, userOrProfile)}`;
}

/** ログイン中ユーザーをヘッダーへ表示する。 */
export function setProfileDisplay(element, userOrProfile = {}, prefix = "") {
    if (!element) return;
    element.textContent = `${prefix}${profileDisplayName(userOrProfile)}`;
}

function abbreviatedUser(value) {
    const text = String(value || "").trim();
    if (!text) return "不明なユーザー";
    return isUuid(text) ? `ユーザー（${text.slice(0, 8)}…）` : text;
}

function emailLocalPart(value) {
    const text = String(value || "").trim();
    return text.includes("@") ? text.slice(0, text.indexOf("@")) : text;
}

// 認証用の UUID は profile/sub に保持したまま、表示名の候補からだけ除外する。
function humanReadableName(value) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    return text && !isUuid(text) ? text : "";
}

function firstText(...values) {
    return values.find(value => typeof value === "string" && value.trim())?.trim() || "ユーザー";
}

function isUuid(value) {
    return UUID_FORMAT.test(value);
}

function displayValue(field, value) {
    if (value === undefined || value === null || value === "") return "未設定";
    if (field === "raw_minutes") return "（原文は履歴に表示しません）";
    return STATUS_LABELS[value] || String(value);
}

export function renderChangeHistory(container, history = [], userOrProfile = {}) {
    container.innerHTML = "";
    const outer = document.createElement("details"); outer.className = "change-history";
    const summary = document.createElement("summary"); summary.textContent = `変更履歴（${history.length}件）`; outer.appendChild(summary);
    if (!history.length) { const p=document.createElement("p"); p.textContent="変更履歴はありません"; outer.appendChild(p); container.appendChild(outer); return; }
    [...history].reverse().forEach(entry => {
        const item=document.createElement("details"), heading=document.createElement("summary");
        setUserDisplay(heading, entry.operated_by, userOrProfile, `${entry.operated_at ? new Date(entry.operated_at).toLocaleString("ja-JP") : "日時不明"}　`);
        item.appendChild(heading);
        Object.entries(entry.changed_fields || {}).forEach(([field, change]) => {
            const row=document.createElement("div"); row.className="history-change";
            const label=document.createElement("strong"); label.textContent=FIELD_LABELS[field] || field;
            const values=document.createElement("span"); values.textContent=`${displayValue(field, change?.before)} → ${displayValue(field, change?.after)}`;
            if (field === "status") { const note=document.createElement("em"); note.textContent="システム変更"; label.append(" ",note); }
            row.append(label,values); item.appendChild(row);
        });
        outer.appendChild(item);
    });
    container.appendChild(outer);
}
