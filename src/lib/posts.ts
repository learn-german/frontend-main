import { supabase } from "./supabase";

export type PostStatus = "draft" | "published";

export interface Post {
  id: string;
  title: string;
  slug: string;
  bodyMd: string;
  status: PostStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostUpsertInput {
  id?: string;
  title: string;
  slug: string;
  bodyMd: string;
  status: PostStatus;
  publishedAt?: string | null;
}

interface PostRow {
  id: string;
  title: string;
  slug: string;
  body_md: string;
  status: PostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const POST_COLUMNS = "id, title, slug, body_md, status, published_at, created_at, updated_at";

const mapPostRow = (row: PostRow): Post => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  bodyMd: row.body_md,
  status: row.status,
  publishedAt: row.published_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listPublishedPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PostRow[]).map(mapPostRow);
}

export async function adminListPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PostRow[]).map(mapPostRow);
}

export async function adminUpsertPost(input: PostUpsertInput): Promise<void> {
  const now = new Date().toISOString();
  const payload = {
    title: input.title,
    slug: input.slug,
    body_md: input.bodyMd,
    status: input.status,
    published_at: input.status === "published" ? (input.publishedAt ?? now) : null,
    updated_at: now,
  };
  const { error } = input.id
    ? await supabase.from("posts").update(payload).eq("id", input.id)
    : await supabase.from("posts").insert(payload);
  if (error) throw error;
}

export async function adminDeletePost(id: string): Promise<void> {
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw error;
}
