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

export async function uploadSignedPost(signed, file, fetchImpl = fetch) {
    if (!signed?.upload_url || !signed.fields || typeof signed.fields !== "object") {
        throw new Error("アップロード情報が正しくありません");
    }
    const formData = new FormData();
    Object.entries(signed.fields).forEach(([key, value]) => formData.append(key, value));
    formData.append("file", file);
    let response;
    try {
        response = await fetchImpl(signed.upload_url, {method: "POST", body: formData});
    } catch {
        // Do not expose or log the presigned URL. A browser TypeError here most
        // commonly means that S3 CORS or connectivity blocked the direct POST.
        throw new Error("S3へ接続できませんでした。管理者は添付バケットのCORS設定を確認してください");
    }
    if (!response.ok) {
        throw new Error(`S3へのアップロードに失敗しました（HTTP ${response.status}）`);
    }
}
