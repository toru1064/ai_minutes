import test from "node:test";
import assert from "node:assert/strict";
import {canApproveMinutes, canEditMinutes} from "./minutes-permissions.js";

test("承認者IDが一致する本人だけが承認でき、表示名は判定に使わない", () => {
    const minutes = {approver_id: "approver", approver: "同じ名前", registered_by_id: "owner", assignee_id: "assignee"};
    assert.equal(canApproveMinutes(minutes, {profile: {sub: "approver", name: "別名"}}), true);
    assert.equal(canApproveMinutes(minutes, {profile: {sub: "owner", name: "同じ名前"}}), false);
    assert.equal(canApproveMinutes({approver: "同じ名前"}, {profile: {sub: "approver", name: "同じ名前"}}), false);
});

test("編集は変更不可能な所有者・登録者IDで判定する", () => {
    assert.equal(canEditMinutes({registered_by_id: "owner"}, {profile: {sub: "owner"}}), true);
    assert.equal(canEditMinutes({demo_owner_id: "demo"}, {profile: {sub: "demo"}}), true);
    assert.equal(canEditMinutes({registered_by: "同じ名前"}, {profile: {sub: "other", name: "同じ名前"}}), false);
});

test("非公開のDemo所有者IDはサーバー判定結果で補助表示できる", () => {
    const user = {profile: {sub: "demo"}};
    assert.equal(canEditMinutes({permissions: {can_edit: true}}, user), true);
    assert.equal(canApproveMinutes({permissions: {can_approve: false}, approver_id: "demo"}, user), false);
});
