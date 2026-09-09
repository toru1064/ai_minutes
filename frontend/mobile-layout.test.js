import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const files = ["tasks", "projects", "index"];

test("各一覧は PC 表とモバイルカードの描画先を持つ", async () => {
    for (const name of files) {
        const html = await readFile(new URL(`${name}.html`, import.meta.url), "utf8");
        assert.match(html, /class="table-wrapper desktop-list"/);
        assert.match(html, /class="mobile-card-list"/);
    }
});

test("768px 以下だけ PC 表を隠してカードを表示する", async () => {
    const css = await readFile(new URL("style.css", import.meta.url), "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 768px)"));
    assert.match(mobile, /\.desktop-list \{ display: none; \}/);
    assert.match(mobile, /\.mobile-card-list \{[\s\S]*?display: grid;/);
});

test("一覧カードは textContent と DOM API で組み立てる", async () => {
    const source = await readFile(new URL("mobile-cards.js", import.meta.url), "utf8");
    assert.match(source, /textContent/);
    assert.doesNotMatch(source, /innerHTML/);
});

test("モバイルの動的フィルターは二段の条件カードとして表示する", async () => {
    const source = await readFile(new URL("dynamic-filters.js", import.meta.url), "utf8");
    const css = await readFile(new URL("style.css", import.meta.url), "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 768px)"));

    assert.match(source, /heading\.className="filter-heading"/);
    assert.match(mobile, /\.filter-top \{[\s\S]*?display: flex;[\s\S]*?justify-content: space-between;/);
    assert.match(mobile, /\.filter-heading \{[\s\S]*?display: flex;/);
    assert.match(mobile, /\.filter-name \{[\s\S]*?font-size: 14px;[\s\S]*?white-space: nowrap;/);
    assert.match(mobile, /\.filter-operator \{[\s\S]*?grid-row: 2;/);
    assert.match(mobile, /\.filter-value-group \{[\s\S]*?grid-row: 2;/);
    assert.match(mobile, /\.filter-remove \{[\s\S]*?font-size: 0;/);
    assert.match(mobile, /\.filter-remove::after[\s\S]*?content: "削除";/);
});

test("モバイルの共通文字サイズと入力欄の自動ズーム対策を維持する", async () => {
    const css = await readFile(new URL("style.css", import.meta.url), "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 768px)"));
    assert.match(mobile, /--mobile-page-title-size: 22px;/);
    assert.match(mobile, /--mobile-section-title-size: 16px;/);
    assert.match(mobile, /--mobile-body-size: 14px;/);
    assert.match(mobile, /:is\(\.list-page, \.register-page, \.detail-page, \.dashboard-page\) input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),[\s\S]*?font-size: 16px;/);
});
