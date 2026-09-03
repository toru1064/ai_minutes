const FIELD_LABELS = {
    project_name: "プロジェクト名", meeting_name: "会議名", name: "会議名",
    meeting_date: "会議日", manager: "責任者", assignee: "担当者", approver: "承認者",
    description: "概要・説明", start_date: "開始日", end_date: "終了予定日",
    status: "状態", title: "件名", due_date: "期限", priority: "優先度",
    resolution: "処置結果", raw_minutes: "会議内容（原文）", ai_minutes: "AI議事録", project_id: "プロジェクト"
};
const STATUS_LABELS = {draft:"下書き",pending:"承認待ち",approved:"承認済み",rejected:"差し戻し",active:"進行中",on_hold:"保留",completed:"完了",not_started:"未着手",in_progress:"進行中"};

export function displayUser(value, profile = {}) {
    if (!value) return "不明なユーザー";
    if (value === profile.sub || value === profile.email || value === profile["cognito:username"] || value === profile.username) {
        return profile.name || profile.display_name || profile.preferred_username || profile["cognito:username"] || profile.username || abbreviatedUser(profile.email || value);
    }
    return abbreviatedUser(value);
}

export function profileDisplayName(profile = {}) {
    return profile.name || profile.display_name || profile.preferred_username || profile["cognito:username"] || profile.username || abbreviatedUser(profile.email || profile.sub || "");
}

function abbreviatedUser(value) {
    const text = String(value);
    if (text.includes("@")) return text.split("@")[0];
    return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text) ? `ユーザー（…${text.slice(-4)}）` : text;
}

function displayValue(field, value) {
    if (value === undefined || value === null || value === "") return "未設定";
    if (field === "raw_minutes") return "（原文は履歴に表示しません）";
    return STATUS_LABELS[value] || String(value);
}

export function renderChangeHistory(container, history = [], profile = {}) {
    container.innerHTML = "";
    const outer = document.createElement("details"); outer.className = "change-history";
    const summary = document.createElement("summary"); summary.textContent = `変更履歴（${history.length}件）`; outer.appendChild(summary);
    if (!history.length) { const p=document.createElement("p"); p.textContent="変更履歴はありません"; outer.appendChild(p); container.appendChild(outer); return; }
    [...history].reverse().forEach(entry => {
        const item=document.createElement("details"), heading=document.createElement("summary");
        heading.textContent=`${entry.operated_at ? new Date(entry.operated_at).toLocaleString("ja-JP") : "日時不明"}　${displayUser(entry.operated_by, profile)}`;
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
