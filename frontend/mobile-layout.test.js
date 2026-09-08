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

test("モバイルの動的フィルターは見出しと横並びの入力欄を持つ", async () => {
    const source = await readFile(new URL("dynamic-filters.js", import.meta.url), "utf8");
    const css = await readFile(new URL("style.css", import.meta.url), "utf8");
    assert.match(source, /filter-row-header/);
    assert.match(source, /filter-row-controls/);
    assert.match(source, /remove\.textContent="削除"/);
    assert.match(css, /grid-template-columns: minmax\(0, 37fr\) minmax\(0, 63fr\)/);
    assert.match(css, /\.filter-row-values \{[\s\S]*?min-width: 0;/);
    assert.match(css, /@media \(max-width: 260px\)/);
});
