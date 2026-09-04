import { UserManager } from "oidc-client-ts";


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


// Cognitoのログイン画面へ移動
export async function login() {
    await userManager.signinRedirect();
}


// 現在ログインしているユーザーを取得
export async function getCurrentUser() {
    const user = await userManager.getUser();
    if (!user || user.expired || user._profileLoaded) return user;
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
