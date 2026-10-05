import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MarkdownBlock } from "../components/MarkdownBlock";
import { listPublishedPosts, type Post } from "../lib/posts";
import { showToast } from "../lib/toast";

export const PostsPage: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPublishedPosts()
      .then((data) => { if (!cancelled) setPosts(data); })
      .catch(() => showToast("Không tải được bài viết.", "warning"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-display font-black text-slate-900">Bài viết</h1>
      {posts.length === 0 && <p className="text-sm text-slate-400 italic">Chưa có bài viết nào.</p>}
      {posts.map((post) => {
        const open = openId === post.id;
        return (
          <article key={post.id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : post.id)}
              className="w-full text-left p-5"
            >
              <h2 className="text-base font-display font-bold text-slate-900">{post.title}</h2>
              {post.publishedAt && (
                <p className="text-[11px] text-slate-400 mt-1">
                  {new Date(post.publishedAt).toLocaleDateString("vi-VN")}
                </p>
              )}
            </button>
            {open && (
              <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                <MarkdownBlock content={post.bodyMd} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
