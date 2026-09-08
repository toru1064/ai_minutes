function valueOrDash(value) {
    return value === undefined || value === null || value === "" ? "-" : String(value);
}

export function createListCard({href, number, title, fields}, doc = document) {
    const article = doc.createElement("article");
    article.className = "mobile-list-card";

    const heading = doc.createElement("h2");
    heading.className = "mobile-card-title";
    const link = doc.createElement("a");
    link.href = href;
    link.textContent = `#${valueOrDash(number)}　${valueOrDash(title)}`;
    heading.append(link);
    article.append(heading);

    const details = doc.createElement("dl");
    details.className = "mobile-card-details";
    for (const field of fields) {
        const term = doc.createElement("dt");
        term.textContent = field.label;
        const description = doc.createElement("dd");
        if (field.node) description.append(field.node);
        else description.textContent = valueOrDash(field.value);
        if (field.className) description.classList.add(...field.className.split(" "));
        details.append(term, description);
    }
    article.append(details);
    return article;
}

export function replaceCards(container, cards) {
    container.replaceChildren(...cards);
}
