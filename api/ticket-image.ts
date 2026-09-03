import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

interface RequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
}
interface ResponseLike {
  status(code: number): ResponseLike;
  json(body: unknown): void;
}
interface AuthUser { id: string }

const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};
const MAX_BYTES = 5 * 1024 * 1024;

export function buildTicketImageKey(userId: string, ext: string, id = randomUUID()): string {
  return `ticket-images/${userId}/${id}.${ext.toLowerCase()}`;
}

export function validateTicketImageRequest(ext: string, contentType: string, size: number): string | null {
  if (TYPES[ext.toLowerCase()] !== contentType) return "Unsupported image type";
  if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) return "Image too large";
  return null;
}

const requiredEnv = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];

async function authenticatedUser(token: string): Promise<AuthUser | null> {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY! },
  });
  return res.ok ? await res.json() as AuthUser : null;
}

function tokenFrom(req: RequestLike): string | null {
  const value = req.headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7) : null;
}

function s3Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length) return res.status(500).json({ error: `Server misconfigured: missing ${missing.join(", ")}` });
  const token = tokenFrom(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const user = await authenticatedUser(token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "POST") {
    const { fileExt = "", contentType = "", fileSize = 0 } = req.body as Record<string, string | number>;
    const error = validateTicketImageRequest(String(fileExt), String(contentType), Number(fileSize));
    if (error) return res.status(400).json({ error });
    const objectKey = buildTicketImageKey(user.id, String(fileExt));
    const uploadUrl = await getSignedUrl(s3Client(), new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!, Key: objectKey,
      ContentType: String(contentType), ContentLength: Number(fileSize),
    }), { expiresIn: 600 });
    return res.status(200).json({ uploadUrl, objectKey });
  }

  if (req.method === "GET") {
    const objectKey = typeof req.query.objectKey === "string" ? req.query.objectKey : "";
    if (!/^ticket-images\/[0-9a-f-]+\/[0-9a-f-]+\.(jpg|jpeg|png|webp)$/i.test(objectKey)) {
      return res.status(400).json({ error: "Invalid objectKey" });
    }
    const check = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/support_ticket_messages?image_keys=cs.${encodeURIComponent(`{${objectKey}}`)}&select=id&limit=1`,
      { headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY! } },
    );
    const rows = check.ok ? await check.json() as unknown[] : [];
    if (!rows.length) return res.status(404).json({ error: "Image not found" });
    const url = await getSignedUrl(s3Client(), new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!, Key: objectKey,
    }), { expiresIn: 14400 });
    return res.status(200).json({ url });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
