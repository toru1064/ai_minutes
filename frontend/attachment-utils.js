export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = Object.freeze({
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    txt: "text/plain", csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
});

export function validateAttachment(file) {
    if (!file?.name || !Number.isFinite(file.size) || file.size <= 0) return "ファイルを選択してください";
    if (file.size > MAX_ATTACHMENT_SIZE) return "ファイルサイズは10MB以下にしてください";
    const extension = file.name.split(".").pop().toLowerCase();
    if (ATTACHMENT_TYPES[extension] !== file.type) return "対応していないファイル形式です";
    return "";
}

export function formatFileSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 ** 2).toFixed(1)} MB`;
}
