import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MarkdownBlock } from "../components/MarkdownBlock";
import { getPublishedPostBySlug, listPublishedPosts, type Post } from "../lib/posts";
import { showToast } from "../lib/toast";

const PostBody: React.FC<{ post: Post }> = ({ post }) => (
  <article className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
    <h1 className="text-xl font-display font-black text-slate-900">{post.title}</h1>
    {post.publishedAt && (
      <p className="text-[11px] text-slate-400">{new Date(post.publishedAt).toLocaleDateString("vi-VN")}</p>
    )}
    <MarkdownBlock content={post.bodyMd} />
  </article>
);

export const PostsPage: React.FC<{ slug?: string }> = ({ slug }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    const load = slug
      ? getPublishedPostBySlug(slug).then((row) => {
          if (cancelled) return;
          setPost(row);
          setMissing(!row);
        })
      : listPublishedPosts().then((data) => {
          if (!cancelled) setPosts(data);
        });
    load
      .catch(() => showToast("Không tải được bài viết.", "warning"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;

  if (slug) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <a href="/posts" className="text-xs font-bold text-slate-500 hover:text-slate-800">← Tất cả bài viết</a>
        {missing || !post
          ? <p className="text-sm text-slate-400 italic">Không tìm thấy bài viết.</p>
          : <PostBody post={post} />}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-display font-black text-slate-900">Bài viết</h1>
      {posts.length === 0 && <p className="text-sm text-slate-400 italic">Chưa có bài viết nào.</p>}
      {posts.map((item) => (
        <a
          key={item.id}
          href={`/posts/${item.slug}`}
          className="block bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 hover:border-orange-200"
        >
          <h2 className="text-base font-display font-bold text-slate-900">{item.title}</h2>
          {item.publishedAt && (
            <p className="text-[11px] text-slate-400 mt-1">
              {new Date(item.publishedAt).toLocaleDateString("vi-VN")}
            </p>
          )}
        </a>
      ))}
    </div>
  );
};
