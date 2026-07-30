/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { AppState, Lesson, Module } from "./lib/appTypes";
import { useModules } from "./lib/hooks/useModules";
import { useLessonPositions } from "./lib/hooks/useLessonPositions";
import { useUserStats } from "./lib/hooks/useUserStats";
import { buildRoadmapItems } from "./lib/lessonOrder";
import { computeLessonStatuses } from "./lib/completion";
import { AppLoadingSkeleton } from "./components/Skeleton";
import { Navbar, Sidebar } from "./components/Navigation";
import { Button } from "./components/DesignSystem";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { LessonDetailPage } from "./pages/LessonDetailPage";
import { QuizPage } from "./pages/QuizPage";
import { GrammarExercisePage } from "./pages/GrammarExercisePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
import { showToast, ToastType } from "./lib/toast";
import { supabase } from "./lib/supabase";
import { signOut } from "./lib/auth";
import { BottomTab } from "./pages/lessonBottomTabs";
import type { AppNotification } from "./lib/hooks/useNotifications";
import { parseRoute, serializeRoute, isProtectedPage, type AppRoute } from "./lib/router";

export default function App() {
  // Authentication states
  const [user, setUser] = useState<{ id: string; email: string; fullName: string; role: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { modules, loading: modulesLoading } = useModules(user?.id ?? null);
  const { positions } = useLessonPositions(user?.id ?? null);
  const flatLessons = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const { stats, applyLessonCompleteReward, applyQuizResult } = useUserStats(user?.id ?? null, flatLessons);

  // Đúng thứ tự người học thấy trên Lộ trình: đã lọc level chưa mở khóa,
  // sort theo orderIndex, và bỏ các bài draft.
  const { orderedLessons } = useMemo(
    () => buildRoadmapItems(modules, positions, stats.unlockedLevels),
    [modules, positions, stats.unlockedLevels],
  );

  const lessonStatuses = useMemo(
    () => computeLessonStatuses(orderedLessons, stats.completedLessons),
    [orderedLessons, stats.completedLessons],
  );

  // URL là hình chiếu của 4 state dưới đây, không phải nguồn sự thật —
  // nhưng lần đầu load thì đọc ngược từ URL để refresh/deep-link giữ đúng trang.
  const initialRoute = useMemo(() => parseRoute(window.location.pathname), []);
  const [currentPage, setCurrentPage] = useState<AppState["currentPage"]>(initialRoute.page);
  const [selectedLessonId, setSelectedLessonId] = useState<string>(
    "lessonId" in initialRoute ? initialRoute.lessonId : "a1-l1",
  );
  const [initialLessonTab, setInitialLessonTab] = useState<BottomTab | undefined>(
    initialRoute.page === "lesson-detail" ? initialRoute.tab : undefined,
  );
  const [activeExerciseCategory, setActiveExerciseCategory] = useState<"nguphap" | "nghe" | "doc">(
    initialRoute.page === "quiz" ? initialRoute.category : "nguphap",
  );

  // Deep-link vào bài chưa mở khóa thì đẩy về Lộ trình. Chỉ xét sau khi
  // modules đã tải xong, nếu không sẽ chặn nhầm lúc dữ liệu chưa về.
  //
  // lessonStatuses chỉ được build từ orderedLessons (đã lọc level mở khóa,
  // bỏ draft), còn activeLessonObject tra cứu trên flatLessons (mọi level).
  // Một bài thuộc level CHƯA mở khóa (hoặc draft) sẽ không có mặt trong
  // lessonStatuses -> id undefined, khác với "locked" -> phải tự suy ra là
  // bị khóa nếu bài đó vẫn tồn tại trong flatLessons, nếu không thì để lọt
  // xuống nhánh "Bài học không khả dụng" (bài đã bị xoá/chuyển về draft).
  useEffect(() => {
    if (!user || modulesLoading) return;
    if (currentPage !== "lesson-detail" && currentPage !== "quiz") return;
    const status = lessonStatuses[selectedLessonId];
    const existsInFlatLessons = flatLessons.some((l) => l.id === selectedLessonId);
    const isLocked = status === "locked" || (status === undefined && existsInFlatLessons);
    if (!isLocked) return;
    showToast("Hãy hoàn thành bài học trước để mở bài này.", "warning");
    setCurrentPage("roadmap");
  }, [user, modulesLoading, currentPage, selectedLessonId, lessonStatuses, flatLessons]);

  const currentRoute: AppRoute = useMemo(() => {
    if (currentPage === "lesson-detail") {
      return { page: "lesson-detail", lessonId: selectedLessonId, tab: initialLessonTab };
    }
    if (currentPage === "quiz") {
      return { page: "quiz", lessonId: selectedLessonId, category: activeExerciseCategory };
    }
    return { page: currentPage as "landing" | "login" | "dashboard" | "roadmap" | "leaderboard" };
  }, [currentPage, selectedLessonId, initialLessonTab, activeExerciseCategory]);

  // State -> URL. So sánh trước khi push để popstate không kích hoạt vòng lặp:
  // sau khi popstate set lại state, serializeRoute đã bằng đúng pathname.
  useEffect(() => {
    const path = serializeRoute(currentRoute);
    if (path !== window.location.pathname) {
      window.history.pushState(null, "", path);
    }
  }, [currentRoute]);

  // URL -> state, cho nút Back/Forward của trình duyệt.
  useEffect(() => {
    const handlePopState = () => {
      const route = parseRoute(window.location.pathname);
      setCurrentPage(route.page);
      if ("lessonId" in route) setSelectedLessonId(route.lessonId);
      setInitialLessonTab(route.page === "lesson-detail" ? route.tab : undefined);
      if (route.page === "quiz") setActiveExerciseCategory(route.category);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Custom Toast state
  const [activeToast, setActiveToast] = useState<{ message: string; type: ToastType; id: number } | null>(null);

  // Set up event listener for the custom toast
  useEffect(() => {
    const handleAppToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type: ToastType }>;
      if (customEvent.detail) {
        const { message, type } = customEvent.detail;
        setActiveToast({
          message,
          type,
          id: Date.now()
        });
      }
    };

    window.addEventListener("app-toast", handleAppToast);
    return () => {
      window.removeEventListener("app-toast", handleAppToast);
    };
  }, []);

  // Auto-dismiss current active toast
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => {
        setActiveToast(prev => prev && prev.id === activeToast.id ? null : prev);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  // Supabase auth state — handles initial session + OAuth callback redirect
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? "",
          fullName: session.user.user_metadata?.full_name ?? session.user.email ?? "",
          role: (session.user.app_metadata?.role as string) ?? "user",
        });
        // Chỉ đưa về dashboard khi URL không trỏ tới trang cụ thể nào.
        // replaceState (không phải push) để nút Back không kẹt vòng lặp.
        const route = parseRoute(window.location.pathname);
        if (route.page === "landing" || route.page === "login") {
          setCurrentPage("dashboard");
          window.history.replaceState(null, "", "/dashboard");
        }
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? "",
          fullName: session.user.user_metadata?.full_name ?? session.user.email ?? "",
          role: (session.user.app_metadata?.role as string) ?? "user",
        });
        // Only redirect to dashboard on first login, not on token refresh
        setCurrentPage(prev => (prev === "landing" || prev === "login") ? "dashboard" : prev);
      } else {
        setUser(null);
        setCurrentPage("landing");
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  const handleLogout = async () => {
    await signOut();
    // onAuthStateChange sẽ set user = null và chuyển về landing
  };

  // Không ép sang "login" nữa: URL đích được giữ nguyên và effectivePage lo
  // việc render màn hình đăng nhập, nhờ đó đăng nhập xong là vào thẳng đích.
  const handleNavigate = (page: AppState["currentPage"]) => {
    setCurrentPage(page);
  };

  // Select particular lesson to view
  const handleSelectLesson = (lessonId: string, initialTab?: BottomTab) => {
    setSelectedLessonId(lessonId);
    setInitialLessonTab(initialTab);
    setCurrentPage("lesson-detail");
  };

  const handleNotificationNavigate = (n: AppNotification) => {
    if (n.type === "writing_graded" && n.lessonId) {
      handleSelectLesson(n.lessonId, "viet");
    }
  };

  // Awards the "mark complete" bonus via Edge Function (server-side XP + streak).
  // completedLessons itself is no longer set here — it's fully derived from
  // quiz scores in useUserStats, so this only fires once that's already true
  // (see LessonDetailPage's gating on stats.completedLessons).
  const handleMarkComplete = async (lessonId: string) => {
    const { data, error } = await supabase.functions.invoke(`lesson-complete/${lessonId}`, {
      method: "POST",
    });

    if (error) {
      showToast("Không thể lưu tiến độ. Vui lòng thử lại.", "warning");
      return;
    }

    if (data?.alreadyCompleted) return;

    applyLessonCompleteReward(data?.xpAwarded ?? 15, data?.newStreak ?? stats.streak);
  };

  // Triggers after completing a quiz (XP is awarded server-side by quiz-submit EF).
  // Records the category-specific score; completedLessons re-derives automatically.
  const handleQuizFinished = (scorePercentage: number, xpEarned: number) => {
    applyQuizResult(selectedLessonId, activeExerciseCategory, scorePercentage, xpEarned);
  };

  // Find active Lesson detail item — no fallback to flatLessons[0]: if the
  // selected id isn't found (deleted, or just reverted to draft while the
  // learner was on it), we must show a "not available" message, not a
  // different lesson silently swapped in.
  const activeLessonObject: Lesson | undefined = flatLessons.find(l => l.id === selectedLessonId);

  // Logic to proceed to NEXT lesson
  const handleNextLesson = () => {
    const activeIdx = orderedLessons.findIndex(l => l.id === selectedLessonId);

    if (activeIdx !== -1 && activeIdx + 1 < orderedLessons.length) {
      const nextLesson = orderedLessons[activeIdx + 1];
      setSelectedLessonId(nextLesson.id);
      setInitialLessonTab(undefined);
      setCurrentPage("lesson-detail");
    } else {
      showToast("Đỉnh quá! Bạn đã hoàn thành toàn bộ kho bài học của DeutschPath.", "success");
      setCurrentPage("dashboard");
    }
  };

  // Trang thực sự được render. Khi chưa đăng nhập mà URL trỏ tới trang cần
  // quyền, ta render màn hình đăng nhập nhưng KHÔNG đổi URL — URL chính là
  // nơi ghi nhớ đích đến, sống sót qua cả lần reload của OAuth.
  const effectivePage: AppState["currentPage"] =
    !user && isProtectedPage(currentPage) ? "login" : currentPage;

  if (authLoading) {
    return <AppLoadingSkeleton />;
  }

  // Show loading overlay while fetching modules (only on authenticated pages)
  const showModulesLoader = user && modulesLoading && modules.length === 0 &&
    (effectivePage === "dashboard" || effectivePage === "roadmap" || effectivePage === "lesson-detail");

  // Layout check selectors
  const showNav = effectivePage !== "login";
  const showSidebar = user && (effectivePage === "dashboard" || effectivePage === "roadmap" || effectivePage === "lesson-detail");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-800 antialiased selection:bg-green-150 selection:text-green-900">
      
      {/* 1. Global Navigation Navbar */}
      {showNav && (
        <Navbar
          currentPage={effectivePage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          streak={stats.streak}
          xp={stats.xp}
          onNotificationNavigate={handleNotificationNavigate}
        />
      )}

      {/* 2. Responsive Side and Content Layout container */}
      <div className="flex-1 flex flex-col lg:flex-row w-full">
        
        {/* Sidebar on desktop portal pages */}
        {showSidebar && (
          <Sidebar
            currentPage={effectivePage}
            onNavigate={handleNavigate}
            streak={stats.streak}
          />
        )}

        {/* Content canvas panel */}
        <main className={`flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden ${!showSidebar ? "w-full" : ""}`}>
          {showModulesLoader && (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={effectivePage + (effectivePage === "lesson-detail" ? selectedLessonId : "")}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className=""
            >
              {effectivePage === "landing" && (
                <LandingPage
                  onStartLearning={() => handleNavigate("login")}
                  onViewRoadmap={() => {
                    if (user) {
                      setCurrentPage("roadmap");
                    } else {
                      setCurrentPage("login");
                    }
                  }}
                  onNavigateLogin={() => handleNavigate("login")}
                />
              )}

              {effectivePage === "login" && (
                <LoginPage
                  onNavigateHome={() => handleNavigate("landing")}
                />
              )}

              {effectivePage === "dashboard" && user && (
                <DashboardPage
                  user={user}
                  stats={stats}
                  modules={modules}
                  onNavigateLesson={handleSelectLesson}
                  onNavigateRoadmap={() => handleNavigate("roadmap")}
                />
              )}

              {effectivePage === "roadmap" && user && (
                <RoadmapPage
                  stats={stats}
                  modules={modules}
                  positions={positions}
                  onSelectLesson={handleSelectLesson}
                />
              )}

              {effectivePage === "lesson-detail" && user && activeLessonObject && (
                <LessonDetailPage
                  lesson={activeLessonObject}
                  stats={stats}
                  userId={user.id}
                  initialTab={initialLessonTab}
                  onTabChange={setInitialLessonTab}
                  onBack={() => handleNavigate("roadmap")}
                  onMarkComplete={handleMarkComplete}
                  onStartQuiz={(lessonId, category = "nguphap") => {
                    setSelectedLessonId(lessonId);
                    setActiveExerciseCategory(category);
                    setCurrentPage("quiz");
                  }}
                />
              )}

              {effectivePage === "lesson-detail" && user && !activeLessonObject && !modulesLoading && (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <p className="text-sm font-display font-bold text-slate-600">
                    Bài học không khả dụng, có thể đang được chỉnh sửa.
                  </p>
                  <p className="text-xs text-slate-400">Hãy quay lại sau.</p>
                  <Button variant="secondary" onClick={() => handleNavigate("roadmap")}>
                    Quay về Lộ trình học
                  </Button>
                </div>
              )}

              {effectivePage === "quiz" && user && activeLessonObject && (
                activeExerciseCategory === "nguphap" ? (
                  <GrammarExercisePage
                    key={activeLessonObject.id}
                    lesson={activeLessonObject}
                    onQuizFinished={handleQuizFinished}
                    onNavigateHome={() => handleNavigate("roadmap")}
                    onNextLesson={handleNextLesson}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                  />
                ) : (
                  <QuizPage
                    lesson={activeLessonObject}
                    category={activeExerciseCategory}
                    onQuizFinished={handleQuizFinished}
                    onNavigateHome={() => handleNavigate("roadmap")}
                    onNextLesson={handleNextLesson}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                  />
                )
              )}
              {effectivePage === "leaderboard" && user && (
                <LeaderboardPage currentUserId={user.id} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

      </div>

      {/* Floating Global Custom Toast Notification popup */}
      <AnimatePresence>
        {activeToast && (
          <motion.div
            id="app-toast-container"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[9999] max-w-sm w-[calc(100%-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-start gap-3 select-none"
          >
            {activeToast.type === "success" && (
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            )}
            {activeToast.type === "info" && (
              <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
            )}
            {activeToast.type === "warning" && (
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-xs font-sans font-medium text-slate-700 leading-normal">
                {activeToast.message}
              </p>
            </div>
            <button
              id="btn-close-toast"
              onClick={() => setActiveToast(null)}
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
