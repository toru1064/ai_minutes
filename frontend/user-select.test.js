import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {initializeCurrentUserSelect, initializeMinutesUsers, populateUserSelect, uniqueUserIdForDisplayName} from "./user-select.js";

global.Option = class Option {
    constructor(text, value) { this.text = text; this.value = value; this.dataset = {}; }
};
function select() {
    return {options: [], value: "", replaceChildren() { this.options = []; this.value = ""; },
        add(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; }};
}

test("新規議事録は配列順でなくCognito subの担当者を選び、承認者は未選択", () => {
    const users = [{user_id: "demo", display_name: "デモユーザー"}, {user_id: "me", display_name: "本人"}];
    const assignee = select(), approver = select();
    assert.equal(initializeMinutesUsers(assignee, approver, users, "me"), true);
    assert.equal(assignee.value, "me");
    assert.equal(approver.value, "");
    assert.equal(approver.options[0].text, "選択してください");
});

test("編集時は既存IDを保持し、legacy表示名も勝手に別IDへ割り当てない", () => {
    const users = [{user_id: "first", display_name: "同名"}, {user_id: "existing", display_name: "担当"}];
    const existing = select(), legacy = select();
    populateUserSelect(existing, users, {selectedId: "existing", legacyName: "担当"});
    populateUserSelect(legacy, users, {legacyName: "同名"});
    assert.equal(existing.value, "existing");
    assert.equal(legacy.value, "__legacy__");
});

test("プロジェクト責任者とチケット担当者は一覧順に関係なくログイン中ユーザーになる", () => {
    for (const users of [
        [{user_id: "demo", display_name: "デモ"}, {user_id: "me", display_name: "本人"}],
        [{user_id: "me", display_name: "本人"}, {user_id: "demo", display_name: "デモ"}],
    ]) {
        const manager = select(), assignee = select();
        assert.equal(initializeCurrentUserSelect(manager, users, "me"), true);
        assert.equal(initializeCurrentUserSelect(assignee, users, "me"), true);
        assert.equal(manager.value, "me");
        assert.equal(assignee.value, "me");
    }
});

test("ログイン中ユーザーが一覧にいない場合は先頭ユーザーを選択しない", () => {
    const element = select();
    assert.equal(initializeCurrentUserSelect(element,
        [{user_id: "demo", display_name: "デモユーザー"}], "missing"), false);
    assert.equal(element.value, "");
});

test("AI TODO担当者は一意な登録名だけ保持し、不明・同名なら未選択にする", () => {
    const users = [{user_id: "demo", display_name: "デモユーザー"},
        {user_id: "valid", display_name: "田中"}, {user_id: "same-1", display_name: "同名"},
        {user_id: "same-2", display_name: "同名"}];
    assert.equal(uniqueUserIdForDisplayName(users, "田中"), "valid");
    assert.equal(uniqueUserIdForDisplayName(users, "不明"), "");
    assert.equal(uniqueUserIdForDisplayName(users, "同名"), "");
    assert.equal(uniqueUserIdForDisplayName(users, null), "");
});

test("プロジェクト・チケット編集画面は既存IDを選択値として渡す", async () => {
    const [projectDetail, taskDetail] = await Promise.all([
        readFile(new URL("project_detail.js", import.meta.url), "utf8"),
        readFile(new URL("task_detail.js", import.meta.url), "utf8"),
    ]);
    assert.match(projectDetail, /selectedId:project\.manager_id/);
    assert.match(taskDetail, /selectedId:task\.assignee_id/);
});
