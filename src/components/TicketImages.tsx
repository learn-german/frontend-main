import React, { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { validateTicketImages } from "../lib/supportMappers";
import { getTicketImageUrl } from "../lib/ticketImages";
import { showToast } from "../lib/toast";

export function TicketImagePicker({ files, onChange, disabled = false }: {
  files: File[]; onChange: (files: File[]) => void; disabled?: boolean;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map(URL.createObjectURL);
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  const add = (selected: File[]) => {
    const next = [...files, ...selected];
    const error = validateTicketImages(next);
    if (error) return showToast(error, "warning");
    onChange(next);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {previews.map((src, index) => (
        <div key={src} className="relative">
          <img src={src} alt={files[index].name} className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
          <button type="button" aria-label="Xóa ảnh" onClick={() => onChange(files.filter((_, i) => i !== index))}
            className="absolute -top-1.5 -right-1.5 rounded-full bg-slate-800 text-white p-0.5">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      {files.length < 3 && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-orange-600">
          <ImagePlus className="w-4 h-4" /> Đính kèm ảnh ({files.length}/3)
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled}
            className="sr-only" onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}

function TicketImage({ objectKey }: { objectKey: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { void getTicketImageUrl(objectKey).then(setUrl).catch(() => {}); }, [objectKey]);
  if (!url) return <div className="w-28 h-20 rounded-lg bg-slate-100 animate-pulse" />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Ảnh đính kèm" className="max-w-48 max-h-48 rounded-lg object-cover border border-slate-200" /></a>;
}

export function TicketMessageImages({ imageKeys }: { imageKeys: string[] }) {
  if (!imageKeys.length) return null;
  return <div className="flex flex-wrap gap-2 mt-2">{imageKeys.map((key) => <TicketImage key={key} objectKey={key} />)}</div>;
}
