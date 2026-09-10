const ROOT = "https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com";

export async function loadUsers(accessToken) {
    const headers = {Authorization: `Bearer ${accessToken}`};
    const [usersResponse, meResponse] = await Promise.all([
        fetch(`${ROOT}/users`, {headers}), fetch(`${ROOT}/users/me`, {headers})
    ]);
    const me = await meResponse.json();
    if (meResponse.ok && !me.registered) {
        throw new Error("先にプロフィールを登録してください（プロフィール画面で表示名を保存します）");
    }
    const data = await usersResponse.json();
    if (!usersResponse.ok) throw new Error(data.message || "ユーザー一覧を取得できませんでした");
    return data.users || [];
}

export function populateUserSelect(select, users, {selectedId = "", legacyName = "", optional = false, emptyLabel = "未設定"} = {}) {
    select.replaceChildren();
    if (optional) select.add(new Option(emptyLabel, ""));
    if (!users.length) select.add(new Option("登録ユーザーがいません", ""));
    for (const user of users) select.add(new Option(user.display_name, user.user_id));
    if (selectedId && users.some(user => user.user_id === selectedId)) select.value = selectedId;
    else if (legacyName) {
        const option = new Option(`既存：${legacyName}`, "__legacy__");
        option.dataset.legacyName = legacyName;
        select.add(option);
        select.value = "__legacy__";
    }
}

export function initializeMinutesUsers(assigneeSelect, approverSelect, users, currentUserId) {
    const available = initializeCurrentUserSelect(assigneeSelect, users, currentUserId);
    populateUserSelect(approverSelect, users, {optional: true, emptyLabel: "選択してください"});
    approverSelect.value = "";
    return available;
}

export function initializeCurrentUserSelect(select, users, currentUserId) {
    populateUserSelect(select, users, {selectedId: currentUserId, optional: true,
        emptyLabel: "選択してください"});
    const available = Boolean(currentUserId && users.some(user => user.user_id === currentUserId));
    if (!available) select.value = "";
    return available;
}

export function uniqueUserIdForDisplayName(users, displayName) {
    const name = String(displayName || "").trim();
    if (!name) return "";
    const matches = users.filter(user => user.display_name === name);
    return matches.length === 1 ? matches[0].user_id : "";
}

export function selectedUser(select, users, idField, nameField) {
    if (select.value === "__legacy__") return {[nameField]: select.selectedOptions[0].dataset.legacyName};
    if (!select.value) return {[idField]: "", [nameField]: ""};
    const user = users.find(item => item.user_id === select.value);
    if (!user) throw new Error("有効な登録ユーザーを選択してください");
    return {[idField]: user.user_id, [nameField]: user.display_name};
}

export function currentName(record, users, idField, nameField) {
    return users.find(user => user.user_id === record?.[idField])?.display_name || record?.[nameField] || "未設定";
}
