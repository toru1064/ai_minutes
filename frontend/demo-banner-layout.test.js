import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const auth = readFileSync(new URL("./auth.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

test("PC版では案内をメイン領域へ配置し、固定ヘッダーの位置計算へ影響させない", () => {
    assert.match(auth, /querySelector\("\.main-content"\)/);
    assert.match(auth, /mainContent\.prepend\(notice\)/);
    assert.doesNotMatch(auth, /document\.body\.prepend\(notice\)/);
    assert.match(css, /\.demo-mode-notice\s*\{[\s\S]*?position:\s*static;[\s\S]*?width:\s*100%;[\s\S]*?box-sizing:\s*border-box;/);
});

test("768px以下でも案内はメイン領域幅に収まり、ヘッダーとナビゲーションへ重ならない", () => {
    const mobileStart = css.lastIndexOf("@media (max-width: 768px)");
    const mobile = css.slice(mobileStart);
    assert.match(mobile, /width:\s*100%/);
    assert.match(mobile, /max-width:\s*100%/);
    assert.doesNotMatch(mobile, /position:\s*(fixed|absolute|sticky)/);
});
