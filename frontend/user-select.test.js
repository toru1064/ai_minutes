import test from "node:test";
import assert from "node:assert/strict";
import {
    initializeAiTodoAssignee,
    initializeCurrentUserSelect,
    initializeMinutesUsers,
    populateUserSelect
} from "./user-select.js";

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

test("プロジェクト編集時は既存責任者IDをログイン中ユーザーで上書きしない", () => {
    const users = [{user_id: "login-sub", display_name: "本人"}, {user_id: "manager", display_name: "責任者"}];
    const manager = select();
    populateUserSelect(manager, users, {selectedId: "manager"});
    assert.equal(manager.value, "manager");
});

test("チケット編集時は既存担当者IDをログイン中ユーザーで上書きしない", () => {
    const users = [{user_id: "login-sub", display_name: "本人"}, {user_id: "assignee", display_name: "担当者"}];
    const assignee = select();
    populateUserSelect(assignee, users, {selectedId: "assignee"});
    assert.equal(assignee.value, "assignee");
});

test("プロジェクト新規登録の責任者は一覧順や同名ユーザーでなくCognito subで選ぶ", () => {
    const users = [
        {user_id: "demo", display_name: "本人"},
        {user_id: "other", display_name: "本人"},
        {user_id: "current-sub", display_name: "本人"}
    ];
    const manager = select();
    assert.equal(initializeCurrentUserSelect(manager, users, "current-sub"), true);
    assert.equal(manager.value, "current-sub");
    assert.equal(initializeCurrentUserSelect(manager, [...users].reverse(), "current-sub"), true);
    assert.equal(manager.value, "current-sub");
});

test("チケット新規登録の担当者はDemoUser本人のsubで選ぶ", () => {
    const users = [
        {user_id: "normal", display_name: "通常ユーザー"},
        {user_id: "demo-sub", display_name: "デモユーザー"}
    ];
    const assignee = select();
    assert.equal(initializeCurrentUserSelect(assignee, users, "demo-sub"), true);
    assert.equal(assignee.value, "demo-sub");
});

test("ログイン中ユーザーが候補にいない場合は先頭ユーザーを選ばない", () => {
    const users = [{user_id: "demo", display_name: "デモユーザー"}, {user_id: "other", display_name: "他ユーザー"}];
    const userSelect = select();
    assert.equal(initializeCurrentUserSelect(userSelect, users, "missing-sub"), false);
    assert.equal(userSelect.value, "");
});

test("AI TODOは登録済みの担当者IDだけを保持し表示名では割り当てない", () => {
    const users = [{user_id: "one", display_name: "同名"}, {user_id: "two", display_name: "同名"}];
    const valid = select(), nameOnly = select(), unknown = select();
    assert.equal(initializeAiTodoAssignee(valid, users, {assignee_id: "two", assignee: "同名"}), true);
    assert.equal(valid.value, "two");
    assert.equal(initializeAiTodoAssignee(nameOnly, users, {assignee: "同名"}), false);
    assert.equal(nameOnly.value, "");
    assert.equal(initializeAiTodoAssignee(unknown, users, {assignee_id: "missing", assignee: "同名"}), false);
    assert.equal(unknown.value, "");
});
