import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button, Input, LessonStatusBadge } from "../../components/DesignSystem";
import { adminDeletePost, adminListPosts, adminUpsertPost, type Post, type PostStatus } from "../../lib/posts";
import { showToast } from "../../lib/toast";

interface PostForm {
  title: string;
  slug: string;
  bodyMd: string;
  status: PostStatus;
}

const EMPTY_FORM: PostForm = { title: "", slug: "", bodyMd: "", status: "draft" };

const inputClass =
  "w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500";

export const AdminPostsSection: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [form, setForm] = useState<PostForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPosts(await adminListPosts());
    } catch {
      showToast("Không tải được danh sách bài viết.", "warning");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = form.title.trim();
    const slug = form.slug.trim();
    if (!title || !slug) {
      showToast("Vui lòng nhập tiêu đề và slug.", "warning");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      showToast("Slug chỉ gồm chữ thường, số và dấu gạch ngang.", "warning");
      return;
    }
    setBusy(true);
    try {
      await adminUpsertPost({
        ...form,
        id: editing?.id,
        title,
        slug,
        publishedAt: editing?.publishedAt,
      });
      await refresh();
      showToast(editing ? "Đã cập nhật bài viết." : "Đã tạo bài viết.", "success");
      resetForm();
    } catch {
      showToast("Không lưu được bài viết (slug có thể đã tồn tại).", "warning");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (post: Post) => {
    setEditing(post);
    setForm({ title: post.title, slug: post.slug, bodyMd: post.bodyMd, status: post.status });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminDeletePost(deleteTarget.id);
      if (editing?.id === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await refresh();
      showToast("Đã xóa bài viết.", "success");
    } catch {
      showToast("Không xóa được bài viết.", "warning");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-display font-black text-slate-900">Bài viết</h1>
        <p className="text-sm text-slate-500 mt-1">Đăng bài viết (Markdown) cho học viên.</p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <aside className="w-full xl:w-96 shrink-0 bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
          <h2 className="text-base font-display font-extrabold text-slate-900 mb-5">
            {editing ? "Sửa bài viết" : "Tạo bài viết mới"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="post-title"
              label="Tiêu đề"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <Input
              id="post-slug"
              label="Slug"
              placeholder="vd: meo-hoc-tu-vung"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              required
            />
            <label className="block">
              <span className="block text-xs font-display font-semibold text-slate-700 mb-1.5">Nội dung (Markdown)</span>
              <textarea
                rows={10}
                value={form.bodyMd}
                onChange={(e) => setForm((f) => ({ ...f, bodyMd: e.target.value }))}
                className={`${inputClass} font-mono resize-y`}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-display font-semibold text-slate-700 mb-1.5">Trạng thái</span>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PostStatus }))}
                className={inputClass}
              >
                <option value="draft">Bản nháp</option>
                <option value="published">Đã đăng</option>
              </select>
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">
                {busy ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo bài viết"}
              </Button>
              {editing && (
                <Button type="button" variant="secondary" onClick={resetForm}>Hủy</Button>
              )}
            </div>
          </form>
        </aside>

        <section className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200/60 shadow-sm divide-y divide-slate-100">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-red-500" /></div>
          ) : posts.length === 0 ? (
            <p className="text-sm text-slate-400 italic p-5">Chưa có bài viết nào.</p>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-bold text-slate-800 truncate">{post.title}</p>
                  <p className="text-[11px] text-slate-400 truncate">/{post.slug}</p>
                </div>
                <LessonStatusBadge status={post.status} />
                <button onClick={() => startEdit(post)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 shrink-0" title="Sửa">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleteTarget(post)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 shrink-0" title="Xóa">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </section>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4">
            <p className="text-sm text-slate-700">Xóa bài viết "{deleteTarget.title}"?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg">Hủy</button>
              <button onClick={confirmDelete} disabled={busy} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
