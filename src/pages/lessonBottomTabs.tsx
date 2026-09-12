import React from "react";
import {
  BookOpen,
  FileText,
  GraduationCap,
  Headphones,
  HelpCircle,
  Mic,
  PenLine,
} from "lucide-react";

export type BottomTab = "nguphapthenchot" | "quiz" | "nghe" | "doc" | "tuvung" | "noi" | "viet";

export const BOTTOM_TABS: {
  id: BottomTab;
  label: string;
  labelVi: string;
  Icon: React.FC<{ className?: string }>;
}[] = [
  { id: "nguphapthenchot", label: "Grammatik", labelVi: "Ngữ pháp", Icon: GraduationCap },
  { id: "tuvung", label: "Wortschatz", labelVi: "Từ vựng", Icon: BookOpen },
  { id: "quiz", label: "Grammatikübungen", labelVi: "Bài tập ngữ pháp", Icon: HelpCircle },
  { id: "doc", label: "Lesen", labelVi: "Bài đọc", Icon: FileText },
  { id: "nghe", label: "Hören", labelVi: "Bài nghe", Icon: Headphones },
  { id: "viet", label: "Schreiben", labelVi: "Bài viết", Icon: PenLine },
  { id: "noi", label: "Sprechen", labelVi: "Bài nói", Icon: Mic },
];
