import {resolve} from "node:path";
import {defineConfig} from "vite";

const pages = [
    "index", "dashboard", "projects", "project_detail", "project_register",
    "register", "detail", "tasks", "task_register", "task_detail",
    "todo_to_tasks", "profile"
];

export default defineConfig({
    root: "frontend",
    // Relative asset URLs work from every top-level HTML document on CloudFront.
    base: "./",
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        rollupOptions: {
            input: Object.fromEntries(
                pages.map(page => [page, resolve(import.meta.dirname, "frontend", `${page}.html`)])
            )
        }
    }
});
