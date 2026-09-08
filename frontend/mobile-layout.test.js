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
