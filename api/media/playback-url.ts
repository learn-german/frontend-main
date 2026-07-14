import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface VercelRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}
interface VercelResponseLike {
  status(code: number): VercelResponseLike;
  json(body: unknown): void;
}

interface AuthUser {
  id: string;
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
  if (req.method !== "GET") {
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

  const lessonId = typeof req.query.lessonId === "string" ? req.query.lessonId : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;

  if (!lessonId || (type !== "video" && type !== "audio")) {
    res.status(400).json({ error: "lessonId and type (video|audio) required" });
    return;
  }

  const column = type === "video" ? "video_r2_key" : "audio_r2_key";
  const restRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&select=${column}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_ANON_KEY!,
      },
    }
  );
  if (!restRes.ok) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const rows = (await restRes.json()) as Record<string, string | null>[];
  const objectKey = rows[0]?.[column];
  if (!objectKey) {
    res.status(404).json({ error: "Media not found for this lesson" });
    return;
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: objectKey }),
    { expiresIn: 14400 }
  );

  res.status(200).json({ url });
}
