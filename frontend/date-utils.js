const localIso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const validDate = (year, month, day) => {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? localIso(date) : "";
};

/** AIが抽出した期限のうち、日付が一意に決まる表現だけをHTML date値へ変換する。 */
export function clearDueDate(value, meetingDate) {
    const text = String(value || "").trim();
    if (!text || /(未定|未確定|なるべく早く|できるだけ早く|来週前半|上旬|中旬|下旬|後日|または|もしくは|か|[～〜])/u.test(text)) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const [year, month, day] = text.split("-").map(Number);
        return validDate(year, month, day);
    }
    const base = new Date(`${meetingDate}T00:00:00`);
    if (Number.isNaN(base.getTime())) return "";
    if (text === "明日") {
        base.setDate(base.getDate() + 1);
        return localIso(base);
    }
    let match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
    if (match) return validDate(+match[1], +match[2], +match[3]);
    match = text.match(/^(\d{1,2})月(\d{1,2})日$/);
    return match ? validDate(base.getFullYear(), +match[1], +match[2]) : "";
}
