/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { AppState, Level, Lesson, UserStats } from "./lib/appTypes";
import { SAMPLE_MODULES } from "./data/mockData";
import { Navbar, Sidebar } from "./components/Navigation";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { LessonDetailPage } from "./pages/LessonDetailPage";
import { QuizPage } from "./pages/QuizPage";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
import { showToast, ToastType } from "./lib/toast";

// Local storage keys
const LOCAL_STORAGE_USER_KEY = "deutschpath_auth_user";
const LOCAL_STORAGE_STATS_KEY = "deutschpath_user_stats";

// Memory storage fallback in case localStorage is blocked in iframe/sandboxed environments
const memoryStorage: Record<string, string> = {};
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn("Storage access blocked/unavailable. Using memory fallback.", e);
      return memoryStorage[key] || null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn("Storage access blocked/unavailable. Using memory fallback.", e);
      memoryStorage[key] = value;
    }
  },
  removeItem: (key: string): void => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn("Storage access blocked/unavailable. Using memory fallback.", e);
      delete memoryStorage[key];
    }
  }
};

const DEFAULT_STATS: UserStats = {
  xp: 120, // start with some nice progression
  streak: 4, // 4-day streak to look active on first boot!
  completedLessons: ["a1-l1"], // Lesson 1 completed by default to showcase statistics
  quizScores: { "a1-l1": 100 }
};

export default function App() {
  // Authentication states
  const [user, setUser] = useState<{ email: string; fullName: string } | null>(null);
  const [stats, setStats] = useState<UserStats>(DEFAULT_STATS);

  // Router page state
  const [currentPage, setCurrentPage] = useState<AppState["currentPage"]>("landing");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("a1-l1");

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

  // Load from local storage on mount
  useEffect(() => {
    const cachedUser = safeStorage.getItem(LOCAL_STORAGE_USER_KEY);
    const cachedStats = safeStorage.getItem(LOCAL_STORAGE_STATS_KEY);

    if (cachedUser) {
      try {
        const parsed = JSON.parse(cachedUser);
        setUser(parsed);
        // If logged in, go to dashboard
        setCurrentPage("dashboard");
      } catch (e) {
        console.error("Failed to parse cached user", e);
      }
    }

    if (cachedStats) {
      try {
        setStats(JSON.parse(cachedStats));
      } catch (e) {
        console.error("Failed to parse cached stats", e);
      }
    }
  }, []);

  // Save auth user state on update
  const handleLoginSuccess = (userData: { email: string; fullName: string }) => {
    setUser(userData);
    safeStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(userData));
    setCurrentPage("dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    safeStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    // Keep stats in local storage but reset to landing page
    setCurrentPage("landing");
  };

  const handleNavigate = (page: AppState["currentPage"]) => {
    // If not logged in and try to access restrict views, lock them and put them on login
    if (!user && (page === "dashboard" || page === "roadmap" || page === "lesson-detail" || page === "quiz")) {
      setCurrentPage("login");
    } else {
      setCurrentPage(page);
    }
  };

  // Select particular lesson to view
  const handleSelectLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setCurrentPage("lesson-detail");
  };

  // Marks a lesson completed from the detail view
  const handleMarkComplete = (lessonId: string) => {
    if (!stats.completedLessons.includes(lessonId)) {
      const updatedStats = {
        ...stats,
        completedLessons: [...stats.completedLessons, lessonId],
        xp: stats.xp + 15 // +15 XP for reading lesson lecture
      };
      setStats(updatedStats);
      safeStorage.setItem(LOCAL_STORAGE_STATS_KEY, JSON.stringify(updatedStats));
    }
  };

  // Triggers after completing a quiz
  const handleQuizFinished = (scorePercentage: number) => {
    const updatedScores = {
      ...stats.quizScores,
      [selectedLessonId]: scorePercentage
    };

    let updatedCompleted = [...stats.completedLessons];
    let xpGain = 0;
    let streakIncrement = 0;

    // Standard Goethe threshold of 80% to pass and lock in completion
    if (scorePercentage >= 80) {
      if (!updatedCompleted.includes(selectedLessonId)) {
        updatedCompleted.push(selectedLessonId);
        xpGain += 30; // +30 XP for passing test
        streakIncrement = 1; // reward streak progress!
      }
    }

    const updatedStats: UserStats = {
      ...stats,
      completedLessons: updatedCompleted,
      quizScores: updatedScores,
      xp: stats.xp + xpGain,
      streak: stats.streak + streakIncrement
    };

    setStats(updatedStats);
    safeStorage.setItem(LOCAL_STORAGE_STATS_KEY, JSON.stringify(updatedStats));
  };

  // Find active Lesson detail item
  const activeLessonObject = SAMPLE_MODULES.flatMap(m => m.lessons).find(l => l.id === selectedLessonId) || SAMPLE_MODULES[0].lessons[0];

  // Logic to proceed to NEXT lesson
  const handleNextLesson = () => {
    // Collect flat list of all lessons
    const flatLessons = SAMPLE_MODULES.flatMap(m => m.lessons);
    const activeIdx = flatLessons.findIndex(l => l.id === selectedLessonId);
    
    // Check if next lesson exists
    if (activeIdx !== -1 && activeIdx + 1 < flatLessons.length) {
      const nextLesson = flatLessons[activeIdx + 1];
      setSelectedLessonId(nextLesson.id);
      setCurrentPage("lesson-detail");
    } else {
      // Completed all available lessons
      showToast("Đỉnh quá! Bạn đã hoàn thành toàn bộ kho bài học của DeutschPath.", "success");
      setCurrentPage("dashboard");
    }
  };

  // Layout check selectors
  const showNav = currentPage !== "login";
  const showSidebar = user && (currentPage === "dashboard" || currentPage === "roadmap" || currentPage === "lesson-detail");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-800 antialiased selection:bg-green-150 selection:text-green-900">
      
      {/* 1. Global Navigation Navbar */}
      {showNav && (
        <Navbar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          streak={stats.streak}
          xp={stats.xp}
        />
      )}

      {/* 2. Responsive Side and Content Layout container */}
      <div className="flex-1 flex flex-col lg:flex-row w-full max-w-7xl mx-auto">
        
        {/* Sidebar on desktop portal pages */}
        {showSidebar && (
          <Sidebar
            currentPage={currentPage}
            onNavigate={handleNavigate}
            streak={stats.streak}
          />
        )}

        {/* Content canvas panel */}
        <main className={`flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden ${!showSidebar ? "w-full" : ""}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage + (currentPage === "lesson-detail" ? selectedLessonId : "")}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="h-full"
            >
              {currentPage === "landing" && (
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

              {currentPage === "login" && (
                <LoginPage
                  onLoginSuccess={handleLoginSuccess}
                  onNavigateHome={() => handleNavigate("landing")}
                />
              )}

              {currentPage === "dashboard" && user && (
                <DashboardPage
                  user={user}
                  stats={stats}
                  onNavigateLesson={handleSelectLesson}
                  onNavigateRoadmap={() => handleNavigate("roadmap")}
                />
              )}

              {currentPage === "roadmap" && user && (
                <RoadmapPage
                  stats={stats}
                  onSelectLesson={handleSelectLesson}
                />
              )}

              {currentPage === "lesson-detail" && user && (
                <LessonDetailPage
                  lesson={activeLessonObject}
                  stats={stats}
                  onBack={() => handleNavigate("roadmap")}
                  onMarkComplete={handleMarkComplete}
                  onStartQuiz={(lessonId) => {
                    setSelectedLessonId(lessonId);
                    setCurrentPage("quiz");
                  }}
                />
              )}

              {currentPage === "quiz" && user && (
                <QuizPage
                  lesson={activeLessonObject}
                  onQuizFinished={handleQuizFinished}
                  onNavigateHome={() => handleNavigate("roadmap")}
                  onNextLesson={handleNextLesson}
                />
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
