export function isCurrentNavigationItem(href, pathname, search = "") {
    const url = new URL(href, "https://example.invalid/");
    const page = pathname.split("/").pop() || "index.html";
    const target = url.pathname.split("/").pop() || "index.html";
    if (target !== page) return false;
    if (page === "tasks.html") {
        return url.searchParams.get("assignee") === "me" ===
            (new URLSearchParams(search).get("assignee") === "me");
    }
    return true;
}

export function initializeNavigation(doc = document, win = window) {
    const links = [...doc.querySelectorAll(".sidebar-menu a")];
    const current = links.find(link =>
        isCurrentNavigationItem(link.getAttribute("href") || "", win.location.pathname, win.location.search)) ||
        links.find(link => link.classList.contains("active"));
    for (const link of links) {
        const active = link === current;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    }
    if (!current || !win.matchMedia("(max-width: 768px)").matches) return;
    const menu = current.closest(".sidebar-menu");
    if (!menu) return;
    // scrollIntoView はページの縦位置も変更し得るため、ナビゲーションだけを動かす。
    const left = current.offsetLeft - (menu.clientWidth - current.offsetWidth) / 2;
    menu.scrollTo({left: Math.max(0, left), behavior: "auto"});
}

export function initializeNavigationOnce(doc = document, win = window) {
    const run = () => initializeNavigation(doc, win);
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", run, {once: true});
    else run();
}
