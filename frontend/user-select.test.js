import test from "node:test";
import assert from "node:assert/strict";
import {initializeMinutesUsers, populateUserSelect} from "./user-select.js";

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
