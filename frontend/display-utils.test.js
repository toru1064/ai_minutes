import assert from "node:assert/strict";
import test from "node:test";

import {displayUser, normalizeUserProfile, profileDisplayName} from "./display-utils.js";

const sub = "12345678-1234-1234-1234-123456789abc";

test("OIDC Userオブジェクト内のprofileを参照する", () => {
    const user = {profile: {sub, name: "山田 太郎", email: "taro@example.com"}};
    assert.deepEqual(normalizeUserProfile(user), user.profile);
    assert.equal(profileDisplayName(user), "山田 太郎");
    assert.equal(displayUser(sub, user), "山田 太郎");
});

test("profileオブジェクトを直接受け取れる", () => {
    const profile = {sub, name: "山田 花子", email: "hanako@example.com"};
    assert.equal(profileDisplayName(profile), "山田 花子");
    assert.equal(displayUser(sub, profile), "山田 花子");
});

test("表示名の優先順とemailのローカル部へのフォールバック", () => {
    assert.equal(profileDisplayName({sub, preferred_username: "preferred", "cognito:username": "cognito", username: "user", email: "mail@example.com"}), "preferred");
    assert.equal(profileDisplayName({sub, "cognito:username": "cognito", username: "user", email: "mail@example.com"}), "cognito");
    assert.equal(profileDisplayName({sub, username: "user", email: "mail@example.com"}), "user");
    assert.equal(profileDisplayName({sub, email: "mail@example.com"}), "mail");
});

test("subだけの場合と他人のUUIDは完全なUUIDを表示しない", () => {
    assert.equal(profileDisplayName({profile: {sub}}), "ユーザー（12345678…）");
    assert.equal(displayUser("abcdefab-1234-1234-1234-abcdefabcdef", {profile: {sub}}), "ユーザー（abcdefab…）");
});

test("UUID以外の保存済みユーザー名は変更しない", () => {
    assert.equal(displayUser("承認担当者", {profile: {sub}}), "承認担当者");
    assert.equal(displayUser("person@example.com", {profile: {sub}}), "person@example.com");
});
