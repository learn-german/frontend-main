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

export const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "nguphapthenchot", label: "Grammatik", Icon: GraduationCap },
  { id: "tuvung", label: "Wortschatz", Icon: BookOpen },
  { id: "quiz", label: "Grammatikübungen", Icon: HelpCircle },
  { id: "doc", label: "Lesen", Icon: FileText },
  { id: "nghe", label: "Hören", Icon: Headphones },
  { id: "viet", label: "Schreiben", Icon: PenLine },
  { id: "noi", label: "Sprechen", Icon: Mic },
];
