import test from "node:test";
import assert from "node:assert/strict";
import {isCurrentNavigationItem} from "./navigation.js";

test("チケット一覧と自分のチケットを assignee=me で区別する", () => {
    assert.equal(isCurrentNavigationItem("tasks.html", "/tasks.html", ""), true);
    assert.equal(isCurrentNavigationItem("tasks.html?assignee=me", "/tasks.html", ""), false);
    assert.equal(isCurrentNavigationItem("tasks.html", "/tasks.html", "?assignee=me"), false);
    assert.equal(isCurrentNavigationItem("tasks.html?assignee=me", "/tasks.html", "?assignee=me&showCompleted=1"), true);
});

test("URL が異なるメニューは現在地にならない", () => {
    assert.equal(isCurrentNavigationItem("projects.html", "/index.html", ""), false);
    assert.equal(isCurrentNavigationItem("index.html", "/index.html", "?filter=pending"), true);
});
