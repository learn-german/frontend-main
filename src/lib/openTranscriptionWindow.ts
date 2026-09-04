/** Open plain-text transcription in a new browser tab (escaped HTML). */
export function openTranscriptionWindow(text: string): void {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>Transcription</title>` +
      `<style>body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.6;color:#0f172a}` +
      `pre{white-space:pre-wrap;word-break:break-word;margin:0;font:inherit}</style></head>` +
      `<body><h1 style="font-size:1.125rem;margin:0 0 1rem">Transcription</h1>` +
      `<pre>${escaped}</pre></body></html>`,
  );
  win.document.close();
}
