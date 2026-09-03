import React, { useState } from "react";
import { AdminGrammarExerciseSection } from "./AdminGrammarExerciseSection";
import { AdminListeningExerciseSection } from "./AdminListeningExerciseSection";
import { AdminReadingExerciseSection } from "./AdminReadingExerciseSection";

export const AdminQuizSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 border-b border-slate-200">
        {(["nguphap", "nghe", "doc"] as const).map((val) => (
          <button
            key={val}
            onClick={() => setActiveTab(val)}
            className={`px-4 py-2.5 text-sm font-display font-bold border-b-2 transition-colors ${
              activeTab === val ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {val === "nguphap" ? "Ngữ pháp" : val === "nghe" ? "Nghe" : "Đọc"}
          </button>
        ))}
      </div>

      {activeTab === "doc" ? (
        <AdminReadingExerciseSection />
      ) : activeTab === "nghe" ? (
        <AdminListeningExerciseSection />
      ) : (
        <AdminGrammarExerciseSection />
      )}
    </div>
  );
};
