import { supabase } from "./supabase";

async function sessionToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Chưa đăng nhập");
  return session.access_token;
}

export async function uploadTicketImages(files: File[]): Promise<string[]> {
  const token = await sessionToken();
  return Promise.all(files.map(async (file) => {
    const fileExt = file.name.split(".").pop() ?? "";
    const res = await fetch("/api/ticket-image", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fileExt, contentType: file.type, fileSize: file.size }),
    });
    const payload = await res.json() as { uploadUrl?: string; objectKey?: string; error?: string };
    if (!res.ok || !payload.uploadUrl || !payload.objectKey) throw new Error(payload.error ?? "Không tải được ảnh");
    const upload = await fetch(payload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!upload.ok) throw new Error("Tải ảnh lên thất bại");
    return payload.objectKey;
  }));
}

export async function getTicketImageUrl(objectKey: string): Promise<string> {
  const token = await sessionToken();
  const res = await fetch(`/api/ticket-image?objectKey=${encodeURIComponent(objectKey)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json() as { url?: string; error?: string };
  if (!res.ok || !payload.url) throw new Error(payload.error ?? "Không tải được ảnh");
  return payload.url;
}
