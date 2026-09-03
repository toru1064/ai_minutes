// ID は候補を明示的に選択した時だけ確定する、共通の検索選択 UI。
export function setupSearchSelect(input, hidden, items, {label, id, selectedId = ""}) {
    const datalist = document.getElementById(input.getAttribute("list"));
    if (datalist) datalist.hidden = true;
    input.removeAttribute("list");
    const host = document.createElement("div");
    host.className = "search-select";
    input.parentNode.insertBefore(host, input);
    host.appendChild(input);
    const popup = document.createElement("div");
    popup.className = "search-select-options";
    popup.hidden = true;
    popup.setAttribute("role", "listbox");
    host.appendChild(popup);
    const sorted = [...items].sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
    let active = -1;

    const choose = item => {
        input.value = label(item);
        hidden.value = id(item);
        popup.hidden = true;
        active = -1;
        input.dispatchEvent(new Event("change", {bubbles: true}));
    };
    const render = () => {
        const query = input.value.trim().toLocaleLowerCase("ja");
        const matches = sorted.filter(item => !query || label(item).toLocaleLowerCase("ja").includes(query));
        popup.innerHTML = "";
        matches.forEach((item, index) => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "search-select-option";
            option.setAttribute("role", "option");
            option.textContent = label(item);
            option.addEventListener("mousedown", event => { event.preventDefault(); choose(item); });
            popup.appendChild(option);
            if (index === active) option.classList.add("active");
        });
        popup.hidden = matches.length === 0;
        return matches;
    };
    const selected = sorted.find(item => id(item) === selectedId);
    hidden.value = selected ? selectedId : "";
    if (selected) input.value = label(selected);
    input.addEventListener("input", () => { hidden.value = ""; active = -1; render(); });
    input.addEventListener("focus", render);
    input.addEventListener("blur", () => setTimeout(() => { popup.hidden = true; }, 100));
    input.addEventListener("keydown", event => {
        const matches = [...popup.querySelectorAll(".search-select-option")];
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            active = Math.max(0, Math.min(matches.length - 1, active + (event.key === "ArrowDown" ? 1 : -1)));
            matches.forEach((option, index) => option.classList.toggle("active", index === active));
            matches[active]?.scrollIntoView({block: "nearest"});
        } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            matches[active]?.dispatchEvent(new MouseEvent("mousedown"));
        } else if (event.key === "Escape") popup.hidden = true;
    });
}
