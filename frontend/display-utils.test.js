import assert from "node:assert/strict";
import test from "node:test";

import {readdir, readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

import {displayUser, normalizeUserProfile, profileDisplayName, setProfileDisplay, setUserDisplay} from "./display-utils.js";

const sub = "12345678-1234-1234-1234-123456789abc";
const cognitoSub = "d7e43ae8-1021-7059-2016-9886ec5da042";

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

test("実際のCognito subをOIDC User形式で短縮し、表示名を優先する", () => {
    assert.equal(profileDisplayName({profile: {sub: cognitoSub}}), "ユーザー（d7e43ae8…）");
    assert.equal(displayUser(cognitoSub, {profile: {sub: cognitoSub, name: "山田 太郎"}}), "山田 太郎");
});

test("実際のCognito subをプロフィール直接形式で短縮し、大文字にも対応する", () => {
    const upperCaseSub = cognitoSub.toUpperCase();
    assert.equal(profileDisplayName({sub: cognitoSub}), "ユーザー（d7e43ae8…）");
    assert.equal(displayUser(upperCaseSub, {sub: cognitoSub}), "ユーザー（D7E43AE8…）");
    assert.equal(displayUser(cognitoSub, {sub: cognitoSub, email: "taro@example.com"}), "taro");
});

test("表示名の優先順とemailのローカル部へのフォールバック", () => {
    assert.equal(profileDisplayName({sub, preferred_username: "preferred", "cognito:username": "cognito", username: "user", email: "mail@example.com"}), "preferred");
    assert.equal(profileDisplayName({sub, "cognito:username": "cognito", username: "user", email: "mail@example.com"}), "cognito");
    assert.equal(profileDisplayName({sub, username: "user", email: "mail@example.com"}), "user");
    assert.equal(profileDisplayName({sub, email: "mail@example.com"}), "mail");
});

test("UUID形式のCognito usernameを除外してemailを表示する", () => {
    const user = {
        profile: {
            sub: cognitoSub,
            "cognito:username": cognitoSub,
            email: "sample@example.com"
        }
    };

    assert.equal(profileDisplayName(user), "sample");
    assert.equal(displayUser(cognitoSub, user), "sample");
    assert.equal(profileDisplayName(user.profile), "sample");
    assert.equal(displayUser(cognitoSub, user.profile), "sample");
});

test("通常のCognito usernameは従来どおり表示する", () => {
    assert.equal(profileDisplayName({sub: cognitoSub, "cognito:username": "山田 太郎", email: "sample@example.com"}), "山田 太郎");
});

test("UUID形式のCognito usernameだけならsubを短縮表示する", () => {
    assert.equal(profileDisplayName({sub: cognitoSub, "cognito:username": cognitoSub}), "ユーザー（d7e43ae8…）");
});

test("通常のnameをemailより優先し、UUID形式のnameは除外する", () => {
    assert.equal(profileDisplayName({sub: cognitoSub, name: "表示名", email: "sample@example.com"}), "表示名");
    assert.equal(profileDisplayName({sub: cognitoSub, name: cognitoSub, email: "sample@example.com"}), "sample");
});

test("すべてのユーザー名クレームからUUIDを除外する", () => {
    assert.equal(profileDisplayName({
        sub: cognitoSub,
        name: cognitoSub,
        preferred_username: cognitoSub,
        "cognito:username": cognitoSub,
        username: cognitoSub
    }), "ユーザー（d7e43ae8…）");
});

test("subだけの場合と他人のUUIDは完全なUUIDを表示しない", () => {
    assert.equal(profileDisplayName({profile: {sub}}), "ユーザー（12345678…）");
    assert.equal(displayUser("abcdefab-1234-1234-1234-abcdefabcdef", {profile: {sub}}), "ユーザー（abcdefab…）");
});

test("UUID以外の保存済みユーザー名は変更しない", () => {
    assert.equal(displayUser("承認担当者", {profile: {sub}}), "承認担当者");
    assert.equal(displayUser("person@example.com", {profile: {sub}}), "person@example.com");
});

test("画面初期化後のヘッダーと登録者に完全なCognito subを残さない", () => {
    const header = {textContent: ""};
    const registeredBy = {textContent: ""};
    const user = {profile: {sub: cognitoSub}};

    setProfileDisplay(header, user, "ログイン中：");
    setUserDisplay(registeredBy, cognitoSub, user);

    assert.equal(header.textContent, "ログイン中：ユーザー（d7e43ae8…）");
    assert.equal(registeredBy.textContent, "ユーザー（d7e43ae8…）");
    assert.equal(header.textContent.includes(cognitoSub), false);
    assert.equal(registeredBy.textContent.includes(cognitoSub), false);
});

test("同じ要素への後続のユーザー表示も必ず短縮する", () => {
    const element = {textContent: ""};
    const user = {profile: {sub: cognitoSub}};

    setProfileDisplay(element, user, "ログイン中：");
    setUserDisplay(element, cognitoSub, user, "登録者 ");

    assert.equal(element.textContent, "登録者 ユーザー（d7e43ae8…）");
    assert.equal(element.textContent.includes(cognitoSub), false);
});

test("画面スクリプトはユーザー識別子をDOMへ直接設定しない", async () => {
    const directory = fileURLToPath(new URL(".", import.meta.url));
    const files = (await readdir(directory)).filter(file => file.endsWith(".js") && !file.endsWith(".test.js") && file !== "display-utils.js");
    const identityField = "(?:profile\\.sub|created_by|registered_by|updated_by|requested_by|approved_by|operated_by)";
    const directDomWrite = new RegExp(`(?:textContent|innerHTML)\\s*=\\s*[^;\\n]*${identityField}`);

    for (const file of files) {
        const source = await readFile(new URL(file, import.meta.url), "utf8");
        assert.doesNotMatch(source, directDomWrite, `${file} にユーザー識別子の直接表示があります`);
    }
});
