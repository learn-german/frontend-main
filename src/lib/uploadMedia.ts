import { supabase } from "./supabase";

export async function uploadMedia(
  file: File,
  lessonId: string,
  mediaType: "video" | "audio" | "image",
  onProgress: (pct: number) => void,
  clipId?: string,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Chưa đăng nhập");

  const fileExt = file.name.split(".").pop() ?? "";
  const res = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ lessonId, mediaType, fileExt, clipId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(body.error ?? "Không lấy được upload URL");
  }
  const { uploadUrl, objectKey } = (await res.json()) as { uploadUrl: string; objectKey: string };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload thất bại (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload thất bại (lỗi mạng)"));
    xhr.send(file);
  });

  return objectKey;
}
