import assert from "node:assert/strict";
import test from "node:test";

import {readdir, readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

import {displayUser, historyOperationLabels, minutesHistory, normalizeUserProfile, profileDisplayName, profileEmail, profileUsername, setProfileDisplay, setUserDisplay, sortChangeHistory, projectHistory, taskHistory} from "./display-utils.js";

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
    assert.equal(profileDisplayName({display_name: "中野", name: "別名"}), "中野");
    assert.equal(profileDisplayName({sub, preferred_username: "preferred", "cognito:username": "cognito", username: "user", email: "mail@example.com"}), "preferred");
    assert.equal(profileDisplayName({sub, "cognito:username": "cognito", username: "user", email: "mail@example.com"}), "cognito");
    assert.equal(profileDisplayName({sub, username: "user", email: "mail@example.com"}), "user");
    assert.equal(profileDisplayName({sub, email: "mail@example.com"}), "mail");
});

test("既存チケットの作成履歴を補完し、保存済みなら二重表示しない", () => {
    const legacy = taskHistory({created_at: "2026-01-01T00:00:00+00:00", created_by: sub});
    assert.equal(legacy.length, 1);
    assert.equal(legacy[0].action, "created");
    assert.equal(legacy[0].synthetic, true);
    const stored = {action: "created", operated_by: sub};
    assert.deepEqual(taskHistory({change_history: [stored]}), [stored]);
});

test("既存議事録の作成履歴を補完し、保存済みなら二重表示しない", () => {
    const legacy = minutesHistory({created_at: "2026-01-01T00:00:00+00:00", registered_by: "担当者"});
    assert.equal(legacy.length, 1);
    assert.deepEqual(legacy[0], {action:"created", entity_type:"minutes", operated_at:"2026-01-01T00:00:00+00:00", operated_by:"担当者", changed_fields:{}, synthetic:true});
    const stored = {action:"created", entity_type:"minutes", operated_by:"担当者"};
    assert.deepEqual(minutesHistory({change_history:[stored]}), [stored]);
});


test("変更履歴はISO日時の昇順で安定し、不正・日時なしを末尾にする", () => {
    const first={id:"first",operated_at:"2026-09-04T12:00:00+09:00"};
    const same={id:"same",operated_at:"2026-09-04T03:00:00Z"};
    const old={id:"old",operated_at:"2026-09-03T15:28:00Z"};
    const invalid={id:"invalid",operated_at:"not-a-date"};
    const missing={id:"missing"};
    assert.deepEqual(sortChangeHistory([first,invalid,old,same,missing]).map(x=>x.id),["old","first","same","invalid","missing"]);
});

test("補完した作成履歴と更新履歴を全エンティティで共通に古い順へ統合する", () => {
    for (const [factory,entityType] of [[taskHistory,"task"],[minutesHistory,"minutes"],[projectHistory,"project"]]) {
        const result=factory({created_at:"2026-09-03T10:37:00Z",change_history:[
            {action:"updated",operated_at:"2026-09-04T14:45:00Z"},
            {action:"updated",operated_at:"2026-09-03T15:28:00Z"}
        ]});
        assert.deepEqual(result.map(x=>x.operated_at),["2026-09-03T10:37:00Z","2026-09-03T15:28:00Z","2026-09-04T14:45:00Z"]);
        assert.equal(result[0].entity_type,entityType);
        assert.equal(result.filter(x=>x.action==="created").length,1);
    }
});

test("プロフィール連絡先はAPIを優先しOIDCへ安全にフォールバックする", () => {
    const oidc = {profile:{email:"oidc@example.com", username:"normal-user", "cognito:username":cognitoSub}};
    assert.equal(profileEmail({}, oidc), "oidc@example.com");
    assert.equal(profileEmail({email:"api@example.com"}, oidc), "api@example.com");
    assert.equal(profileUsername({}, oidc), "normal-user");
    assert.equal(profileUsername({username:cognitoSub}, {profile:{username:cognitoSub}}), "未取得");
});

test("原文とAI議事録の履歴を内容ではなく操作名へ変換する", () => {
    assert.deepEqual(historyOperationLabels({operations:["raw_minutes_changed","ai_minutes_cleared"]}), ["会議内容（原文）を変更", "AI議事録をクリア"]);
    assert.deepEqual(historyOperationLabels({action:"ai_created"}), ["AI議事録を作成"]);
    assert.deepEqual(historyOperationLabels({action:"ai_recreated"}), ["AI議事録を再作成"]);
    assert.deepEqual(historyOperationLabels({changed_fields:{ai_minutes:{before:{old:true},after:{new:true}}}}), ["AI議事録を更新"]);
    assert.deepEqual(historyOperationLabels({changed_fields:{ai_minutes:{before:{old:true},after:{}}}}), ["AI議事録をクリア"]);
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

test("プロフィール保存は表示名だけを送信し、成功後に編集状態を閉じる", async () => {
    const source = await readFile(new URL("profile.js", import.meta.url), "utf8");
    assert.match(source, /JSON\.stringify\(\{display_name:name\}\)/);
    assert.doesNotMatch(source, /JSON\.stringify\(\{[^}]*email/);
    assert.match(source, /dirty=false;editing\(false\);message\.textContent="プロフィールを保存しました。"/);
    assert.match(source, /save-button"\)\.disabled=true/);
    assert.match(source, /save-button"\)\.disabled=false/);
});
