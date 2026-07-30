import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const HARNESS_ROOT = path.dirname(fileURLToPath(import.meta.url));
// Tailwind v4 (@tailwindcss/vite) chỉ quét class trong phạm vi Vite `root`.
// Nếu root là thư mục harness, các class dùng trong
// src/pages/admin/AdminGrammarExerciseSection.tsx (nằm ngoài root đó) không
// được quét tới — CSS build ra thiếu hẳn rule .w-28/.w-full/.flex-1, nên
// input/select render với kích thước mặc định của trình duyệt thay vì kích
// thước Tailwind thật, và bug không tái hiện (đã kiểm chứng: build với root
// harness cho CSS 4.47kB, không có 3 class trên; build với root là gốc repo
// cho CSS 69.44kB, đúng byte-for-byte thứ tự rule với bản production đã
// build bằng `npm run build`). Do đó root PHẢI là gốc repo.
const REPO_ROOT = path.resolve(HARNESS_ROOT, "../../..");
const HARNESS_PAGE = "/tests/e2e/classification-fields/index.html";

export interface Harness {
  url: string;
  close: () => Promise<void>;
}

// Dùng đúng Vite dev server thật (cùng plugin @tailwindcss/vite mà app dùng
// để build production), không phải bản mock CSS thủ công. Tailwind v4 quét
// toàn bộ project để sinh rule, nên CSS ở đây giống hệt CSS mà admin thật
// nhận được — bug do class nào thắng trong cascade sẽ tái hiện đúng.
export async function startHarnessServer(): Promise<Harness> {
  const server: ViteDevServer = await createServer({
    root: REPO_ROOT,
    envDir: HARNESS_ROOT,
    // File env giả của harness được đặt tên `.env.test` (thay vì `.env`) vì
    // `.gitignore` gốc của repo chặn pattern `.env` — commit thẳng `.env` sẽ
    // không được git track được. Vite mặc định chỉ đọc `.env`/`.env.local`
    // ở mode "development"; cần chỉ định mode "test" tường minh để nó nạp
    // đúng `.env.test`.
    mode: "test",
    configFile: false,
    logLevel: "error",
    plugins: [react(), tailwindcss()],
    server: { port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  if (!port) {
    throw new Error("Vite harness server không lấy được cổng đã lắng nghe");
  }
  return {
    url: `http://localhost:${port}${HARNESS_PAGE}`,
    close: () => server.close(),
  };
}
