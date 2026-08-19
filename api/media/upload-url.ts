import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

type MediaType = "video" | "audio" | "image";

interface VercelRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}
interface VercelResponseLike {
  status(code: number): VercelResponseLike;
  json(body: unknown): void;
}

const ALLOWED_EXT: Record<MediaType, string[]> = {
  video: ["mp4"],
  audio: ["mp3", "m4a", "wav"],
  image: ["jpg", "jpeg", "png", "webp"],
};

export function isAllowedExt(mediaType: MediaType, ext: string): boolean {
  return ALLOWED_EXT[mediaType].includes(ext.toLowerCase());
}

const MAX_FILE_NAME_LENGTH = 100;

/**
 * Giữ lại tên file gốc để admin nhận ra clip (audio_19_3, audio_6_2, ...).
 * Trả về "" khi tên không dùng được — lúc đó key quay về dạng phẳng theo clipId.
 */
export function sanitizeFileName(fileName: string | undefined): string {
  const baseName = (fileName ?? "").split(/[/\\]/).pop() ?? "";
  const withoutExt = baseName.replace(/\.[^.]+$/, "");
  const safe = withoutExt.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, MAX_FILE_NAME_LENGTH);
  return /[A-Za-z0-9]/.test(safe) ? safe : "";
}

export function buildObjectKey(
  mediaType: MediaType,
  lessonId: string,
  ext: string,
  clipId?: string,
  randomId?: string,
  fileName?: string,
): string {
  if (mediaType === "video") {
    return `videos/${lessonId}.${ext.toLowerCase()}`;
  }
  if (mediaType === "image") {
    return `images/${lessonId}/${randomId}.${ext.toLowerCase()}`;
  }
  const safeName = sanitizeFileName(fileName);
  // Thư mục riêng theo clipId nên hai file trùng tên vẫn không đè nhau.
  return safeName
    ? `audio/${lessonId}/${clipId}/${safeName}.${ext.toLowerCase()}`
    : `audio/${lessonId}/${clipId}.${ext.toLowerCase()}`;
}

interface AuthUser {
  id: string;
  app_metadata?: { role?: string };
}

async function getAuthenticatedUser(token: string): Promise<AuthUser | null> {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_ANON_KEY!,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as AuthUser;
}

const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
] as const;

function findMissingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter(name => !process.env[name]);
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const missingEnvVars = findMissingEnvVars();
  if (missingEnvVars.length > 0) {
    res.status(500).json({ error: `Server misconfigured: missing env var(s): ${missingEnvVars.join(", ")}` });
    return;
  }

  const authHeader = req.headers["authorization"];
  const token = typeof authHeader === "string" ? authHeader.replace("Bearer ", "") : undefined;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await getAuthenticatedUser(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.app_metadata?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const body = req.body as { lessonId?: string; mediaType?: string; fileExt?: string; clipId?: string; fileName?: string };
  const { lessonId, fileExt, clipId, fileName } = body;
  const mediaType = body.mediaType;

  if (!lessonId || (mediaType !== "video" && mediaType !== "audio" && mediaType !== "image") || !fileExt) {
    res.status(400).json({ error: "lessonId, mediaType (video|audio|image), fileExt required" });
    return;
  }
  if (mediaType === "audio" && !clipId) {
    res.status(400).json({ error: "clipId required for audio uploads" });
    return;
  }
  if (!isAllowedExt(mediaType, fileExt)) {
    res.status(400).json({ error: `fileExt must be one of: ${ALLOWED_EXT[mediaType].join(", ")}` });
    return;
  }

  const objectKey = buildObjectKey(mediaType, lessonId, fileExt, clipId, mediaType === "image" ? randomUUID() : undefined, fileName);

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: objectKey }),
    { expiresIn: 600 }
  );

  res.status(200).json({ uploadUrl, objectKey });
}
