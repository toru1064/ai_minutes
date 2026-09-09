import { UserManager } from "oidc-client-ts";
import {initializeNavigationOnce} from "./navigation.js";

if (typeof document !== "undefined") initializeNavigationOnce();


// Cognitoのログイン画面用ドメイン
const cognitoDomain =
    "https://ap-northeast-1idepomshu.auth.ap-northeast-1.amazoncognito.com";


// Cognitoの接続設定
const cognitoConfig = {
    authority:
        "https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_IdePomShU",

    client_id:
        "47v94275ovlr8s83d8ihehgapi",

    redirect_uri:
        "http://localhost:5500/",

    response_type:
        "code",

    scope:
        "openid email profile"
};


// ログイン状態を管理
export const userManager = new UserManager(cognitoConfig);

export function cognitoGroups(user) {
    let groups = user?.profile?.["cognito:groups"] ?? [];
    if (typeof groups === "string") {
        try { groups = JSON.parse(groups); } catch { groups = groups.replace(/^\[|\]$/g, "").split(","); }
    }
    return Array.isArray(groups) ? groups.map(value => String(value).trim()) : [];
}

export function isDemoUser(user) {
    return cognitoGroups(user).includes("DemoUser");
}

export function applyDemoMode(user, item) {
    if (typeof document === "undefined" || !isDemoUser(user)) return false;
    document.body.classList.add("demo-mode");
    document.body.classList.toggle("demo-editable", item?.can_demo_edit === true);
    if (!document.getElementById("demo-mode-notice")) {
        const mainContent = document.querySelector(".main-content");
        if (!mainContent) return false;
        const notice = document.createElement("div");
        notice.id = "demo-mode-notice";
        notice.className = "demo-mode-notice";
        notice.setAttribute("role", "status");
        notice.textContent = "デモモード：サンプルデータは閲覧のみです。作成したデモデータは24時間後に削除されます。";
        mainContent.prepend(notice);
    }
    return item?.can_demo_edit === true;
}


// Cognitoのログイン画面へ移動
export async function login() {
    await userManager.signinRedirect();
}


// 現在ログインしているユーザーを取得
export async function getCurrentUser() {
    const user = await userManager.getUser();
    if (!user || user.expired || user._profileLoaded) {
        if (user) applyDemoMode(user);
        return user;
    }
    user._profileLoaded = true;
    try {
        const response = await fetch("https://ba2lg9ckm9.execute-api.ap-northeast-1.amazonaws.com/users/me", {
            headers: {Authorization: `Bearer ${user.access_token}`}
        });
        if (response.ok) {
            const data = await response.json();
            if (data.user?.display_name) user.profile.display_name = data.user.display_name;
        }
    } catch {
        // プロフィールAPIの障害時もOIDCクレームによる従来表示を維持する。
    }
    applyDemoMode(user);
    return user;
}


// Cognitoから戻ってきた認可コードを処理
export async function handleSigninCallback() {
    const params = new URLSearchParams(window.location.search);

    if (params.has("code") && params.has("state")) {
        await userManager.signinRedirectCallback();

        // URLからcodeとstateを削除
        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );
    }
}


// Cognitoからログアウト
export async function logout() {
    // ブラウザに保存されたログイン情報を削除
    await userManager.removeUser();

    const logoutUrl = new URL(`${cognitoDomain}/logout`);

    logoutUrl.searchParams.set(
        "client_id",
        cognitoConfig.client_id
    );

    logoutUrl.searchParams.set(
        "logout_uri",
        "http://localhost:5500/"
    );

    window.location.href = logoutUrl.toString();
}
