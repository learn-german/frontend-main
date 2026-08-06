import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import { ExerciseEntryFields } from "../../../src/pages/admin/AdminGrammarExerciseSection";
import { EMPTY_FORM, type EditForm } from "../../../src/lib/grammarExerciseForm";

// Dựng đúng cách modal thật nối ExerciseEntryFields vào state: một entry,
// cập nhật qua updater function. Đây là component THẬT của production,
// không phải bản sao chép — nếu code nguồn đổi mà quên cập nhật chỗ này,
// TypeScript sẽ báo lỗi biên dịch chứ không âm thầm test sai thứ khác.
const Harness = () => {
  const [entry, setEntry] = useState<EditForm>({
    ...EMPTY_FORM,
    type: "classification",
    classification_groups: ["Der", "Die"],
    classification_items: [{ item: "", group: "Der" }],
  });
  return (
    <div style={{ maxWidth: 520, padding: 24 }}>
      <ExerciseEntryFields entry={entry} onChange={(updater) => setEntry(updater)} />
    </div>
  );
};

createRoot(document.getElementById("root")!).render(<Harness />);
