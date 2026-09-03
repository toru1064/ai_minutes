const operators = {
    text: [["eq","等しい"],["ne","等しくない"],["contains","含む"],["not_contains","含まない"],["empty","未設定"],["set","設定済み"]],
    select: [["eq","等しい"],["ne","等しくない"]],
    number: [["eq","等しい"],["gte","以上"],["lte","以下"]],
    date: [["eq","等しい"],["lte","以前"],["gte","以後"],["between","期間指定"],["empty","未設定"],["set","設定済み"]]
};
const normalized = value => String(value ?? "").trim().toLocaleLowerCase("ja");

export function matchesFilter(actual, row) {
    const a = normalized(actual), v = normalized(row.value);
    if (row.operator === "empty") return !a;
    if (row.operator === "set") return Boolean(a);
    if (row.type === "number") {
        const an = Number(a.replace(/^#/, "")), vn = Number(v.replace(/^#/, ""));
        return row.operator === "eq" ? an === vn : row.operator === "gte" ? an >= vn : an <= vn;
    }
    if (row.type === "date") {
        if (row.operator === "between") return a >= v && a <= normalized(row.valueTo);
        return row.operator === "eq" ? a === v : row.operator === "gte" ? a >= v : a <= v;
    }
    if (row.operator === "contains") return a.includes(v);
    if (row.operator === "not_contains") return !a.includes(v);
    return row.operator === "eq" ? a === v : a !== v;
}

export function createDynamicFilters({fields, sorts, defaultSort, onApply}) {
    const panel = document.getElementById("dynamic-filter-panel"), rows = document.getElementById("filter-rows");
    const add = document.getElementById("filter-add"), query = document.getElementById("free-query"), sort = document.getElementById("sort");
    const filterDetails = document.getElementById("filter-details"), optionDetails = document.getElementById("option-details");
    sorts.forEach(([value,label]) => sort.add(new Option(label,value)));
    const params = new URLSearchParams(location.search);
    let applied = [];
    try { applied = JSON.parse(params.get("filters") || "[]").filter(row => fields[row.field]); } catch { applied = []; }
    query.value = params.get("q") || ""; sort.value = sorts.some(([v]) => v === params.get("sort")) ? params.get("sort") : defaultSort;
    filterDetails.open = params.get("filtersOpen") !== "0"; optionDetails.open = params.get("optionsOpen") === "1";

    const refreshAdd = () => {
        const used = new Set([...rows.children].map(row => row.dataset.field));
        add.innerHTML = '<option value="">フィルタ追加 ▼</option>';
        Object.entries(fields).filter(([key]) => !used.has(key)).forEach(([key,field]) => add.add(new Option(field.label,key)));
    };
    const addRow = state => {
        const field = fields[state.field]; if (!field) return;
        const row = document.createElement("div"); row.className = "filter-row"; row.dataset.field = state.field;
        const enabled = document.createElement("input"); enabled.type="checkbox"; enabled.checked=state.enabled !== false; enabled.title="この条件を有効にする";
        const name = document.createElement("strong"); name.textContent=field.label;
        const operator=document.createElement("select"); operators[field.type].forEach(([v,l])=>operator.add(new Option(l,v))); operator.value=operators[field.type].some(([v])=>v===state.operator)?state.operator:operators[field.type][0][0];
        const value=field.options?document.createElement("select"):document.createElement("input"); value.className="filter-value";
        if(field.options){field.options.forEach(([v,l])=>value.add(new Option(l,v)));} else value.type=field.type==="date"?"date":field.type==="number"?"number":"text";
        value.value=state.value||"";
        const valueTo=document.createElement("input");valueTo.type="date";valueTo.className="filter-value-to";valueTo.value=state.valueTo||"";
        const remove=document.createElement("button");remove.type="button";remove.className="filter-remove";remove.textContent="削除";
        const visibility=()=>{const noValue=["empty","set"].includes(operator.value);value.hidden=noValue;valueTo.hidden=operator.value!=="between";};
        operator.addEventListener("change",visibility);remove.addEventListener("click",()=>{row.remove();refreshAdd();});
        row.append(enabled,name,operator,value,valueTo,remove);rows.appendChild(row);visibility();refreshAdd();
    };
    applied.forEach(addRow); refreshAdd();
    add.addEventListener("change",()=>{if(add.value)addRow({field:add.value,enabled:true});add.value="";});
    const readRows=()=>[...rows.children].map(row=>({field:row.dataset.field,type:fields[row.dataset.field].type,enabled:row.querySelector('input[type="checkbox"]').checked,operator:row.querySelector("select").value,value:row.querySelector(".filter-value").value,valueTo:row.querySelector(".filter-value-to").value}));
    const apply=()=>{applied=readRows();const next=new URLSearchParams();if(query.value.trim())next.set("q",query.value.trim());if(applied.length)next.set("filters",JSON.stringify(applied));if(sort.value!==defaultSort)next.set("sort",sort.value);next.set("filtersOpen",filterDetails.open?"1":"0");if(optionDetails.open)next.set("optionsOpen","1");history.replaceState(null,"",`${location.pathname}?${next}`);onApply({query:query.value.trim(),filters:applied.filter(r=>r.enabled),sort:sort.value});};
    document.getElementById("apply-filters").addEventListener("click",apply);
    document.getElementById("clear-filters").addEventListener("click",()=>{query.value="";rows.innerHTML="";sort.value=defaultSort;applied=[];history.replaceState(null,"",location.pathname);refreshAdd();onApply({query:"",filters:[],sort:defaultSort});});
    panel.hidden=false; apply();
}
