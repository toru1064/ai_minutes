import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {arrangeFilterRow} from "./dynamic-filters.js";

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
    assert.match(mobile, /\.filter-heading \{[\s\S]*?display: flex;/);
    assert.match(mobile, /\.filter-name \{[\s\S]*?font-size: 14px;[\s\S]*?white-space: nowrap;/);
    assert.match(mobile, /\.filter-controls \{[\s\S]*?grid-row: 2;/);
    assert.match(mobile, /\.filter-operator \{[\s\S]*?grid-column: 1;/);
    assert.match(mobile, /\.filter-value-group \{[\s\S]*?grid-column: 2;/);
    assert.match(mobile, /\.filter-remove \{[\s\S]*?width: 40px;[\s\S]*?min-height: 40px;[\s\S]*?font-size: 20px;/);
    assert.match(mobile, /\.filter-remove::after[\s\S]*?content: none;/);
});

test("フィルター行は見出し・比較条件・削除の3グループを直接の子にする", () => {
    const makeNode = className => ({className, children: [], append(...children) { this.children.push(...children); }});
    const row = makeNode("filter-row");
    row.ownerDocument = {createElement: () => makeNode("")};
    const heading = makeNode("filter-heading");
    const operator = makeNode("filter-operator");
    const valueGroup = makeNode("filter-value-group");
    const remove = makeNode("filter-remove");

    const controls = arrangeFilterRow(row, heading, operator, valueGroup, remove);

    assert.deepEqual(row.children, [heading, controls, remove]);
    assert.equal(controls.className, "filter-controls");
    assert.deepEqual(controls.children, [operator, valueGroup]);
});

test("PC とモバイルのフィルター配置を専用メディアクエリに分離する", async () => {
    const css = await readFile(new URL("style.css", import.meta.url), "utf8");
    const desktopStart = css.indexOf("@media (min-width: 769px)");
    const mobileStart = css.indexOf("@media (max-width: 768px)");
    const desktop = css.slice(desktopStart, mobileStart);
    const mobile = css.slice(mobileStart);

    assert.ok(desktopStart >= 0);
    assert.ok(mobileStart > desktopStart);
    assert.match(desktop, /\.dynamic-filters \{[\s\S]*?width: 100%;[\s\S]*?max-width: none;[\s\S]*?box-sizing: border-box;/);
    assert.match(desktop, /grid-template-columns: 200px 464px 32px;/);
    assert.match(desktop, /\.filter-row \{[\s\S]*?grid-template-rows: auto;[\s\S]*?row-gap: 0;[\s\S]*?width: max-content;/);
    assert.match(desktop, /\.filter-value-group \{[\s\S]*?width: 320px;/);
    assert.match(desktop, /\.filter-controls \{[\s\S]*?grid-template-columns: 136px 320px;/);
    assert.doesNotMatch(desktop, /grid-template-columns: minmax\(0, 38fr\)/);
    assert.match(mobile, /\.filter-controls \{[\s\S]*?grid-template-columns: minmax\(0, 38fr\) minmax\(0, 62fr\);/);
    assert.match(mobile, /\.filter-row \{[\s\S]*?padding: 6px;/);
    assert.doesNotMatch(mobile, /grid-template-columns: 200px 464px 32px;/);
});

test("並べ替えだけをPCでは固定幅、モバイルでは全幅にする", async () => {
    const css = await readFile(new URL("style.css", import.meta.url), "utf8");
    const desktopStart = css.indexOf("@media (min-width: 769px)");
    const mobileStart = css.indexOf("@media (max-width: 768px)");
    const desktop = css.slice(desktopStart, mobileStart);
    const mobile = css.slice(mobileStart);

    assert.match(desktop, /#option-details > label \{[\s\S]*?flex-direction: column;/);
    assert.match(desktop, /#sort \{[\s\S]*?width: 360px;[\s\S]*?max-width: 100%;/);
    assert.match(mobile, /#sort \{ width: 100%; \}/);
});

test("モバイルの共通文字サイズと入力欄の自動ズーム対策を維持する", async () => {
    const css = await readFile(new URL("style.css", import.meta.url), "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 768px)"));
    assert.match(mobile, /--mobile-page-title-size: 22px;/);
    assert.match(mobile, /--mobile-section-title-size: 16px;/);
    assert.match(mobile, /--mobile-body-size: 14px;/);
    assert.match(mobile, /:is\(\.list-page, \.register-page, \.detail-page, \.dashboard-page\) input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),[\s\S]*?font-size: 16px;/);
});
