export function setupSearchSelect(input, hidden, items, {label, id, selectedId = ""}) {
    const list = document.getElementById(input.getAttribute("list"));
    const sorted = [...items].sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
    const labels = new Map();
    list.innerHTML = "";
    for (const item of sorted) {
        const text = label(item);
        labels.set(text, id(item));
        const option = document.createElement("option");
        option.value = text;
        list.appendChild(option);
        if (id(item) === selectedId) input.value = text;
    }
    hidden.value = selectedId;
    const confirm = () => { hidden.value = labels.get(input.value) || ""; };
    input.addEventListener("input", confirm);
    input.addEventListener("change", confirm);
}
