import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type MediaType = "video" | "audio";

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
};

export function isAllowedExt(mediaType: MediaType, ext: string): boolean {
  return ALLOWED_EXT[mediaType].includes(ext.toLowerCase());
}

export function buildObjectKey(mediaType: MediaType, lessonId: string, ext: string): string {
  const folder = mediaType === "video" ? "videos" : "audio";
  return `${folder}/${lessonId}.${ext.toLowerCase()}`;
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

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
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

  const body = req.body as { lessonId?: string; mediaType?: string; fileExt?: string };
  const { lessonId, fileExt } = body;
  const mediaType = body.mediaType;

  if (!lessonId || (mediaType !== "video" && mediaType !== "audio") || !fileExt) {
    res.status(400).json({ error: "lessonId, mediaType (video|audio), fileExt required" });
    return;
  }
  if (!isAllowedExt(mediaType, fileExt)) {
    res.status(400).json({ error: `fileExt must be one of: ${ALLOWED_EXT[mediaType].join(", ")}` });
    return;
  }

  const objectKey = buildObjectKey(mediaType, lessonId, fileExt);

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
