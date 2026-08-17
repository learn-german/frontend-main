import { BOTTOM_TABS, type BottomTab } from "../pages/lessonBottomTabs";
import type { QuizCategory } from "./completion";

export type AppPage =
  | "landing"
  | "login"
  | "dashboard"
  | "roadmap"
  | "leaderboard"
  | "packages"
  | "help"
  | "lesson-detail"
  | "quiz";

export type AppRoute =
  | { page: "landing" | "login" | "dashboard" | "roadmap" | "leaderboard" | "packages" | "help" }
  | { page: "lesson-detail"; lessonId: string; tab?: BottomTab }
  | { page: "quiz"; lessonId: string; category: QuizCategory };

const PROTECTED_PAGES: AppPage[] = [
  "dashboard",
  "roadmap",
  "leaderboard",
  "packages",
  "help",
  "lesson-detail",
  "quiz",
];

export function isProtectedPage(page: AppPage): boolean {
  return PROTECTED_PAGES.includes(page);
}

function toBottomTab(segment: string | undefined): BottomTab | undefined {
  return BOTTOM_TABS.find((t) => t.id === segment)?.id;
}

function toQuizCategory(segment: string | undefined): QuizCategory | undefined {
  return segment === "nguphap" || segment === "nghe" || segment === "doc" ? segment : undefined;
}

/** Anything unrecognised falls back to landing rather than throwing. */
export function parseRoute(pathname: string): AppRoute {
  const [first, second, third] = pathname.split("/").filter(Boolean);

  switch (first) {
    case undefined:
      return { page: "landing" };
    case "login":
      // Supabase's password-recovery link points here; no dedicated screen
      // exists yet, so keep the pre-router behaviour of showing login.
      return { page: "login" };
    case "reset-password":
      return { page: "login" };
    case "dashboard":
      return { page: "dashboard" };
    case "roadmap":
      return { page: "roadmap" };
    case "leaderboard":
      return { page: "leaderboard" };
    case "packages":
      return { page: "packages" };
    case "help":
      return { page: "help" };
    case "lesson": {
      if (!second) return { page: "landing" };
      const tab = toBottomTab(third);
      return tab
        ? { page: "lesson-detail", lessonId: second, tab }
        : { page: "lesson-detail", lessonId: second };
    }
    case "quiz": {
      const category = toQuizCategory(third);
      if (!second || !category) return { page: "landing" };
      return { page: "quiz", lessonId: second, category };
    }
    default:
      return { page: "landing" };
  }
}

export function serializeRoute(route: AppRoute): string {
  switch (route.page) {
    case "landing":
      return "/";
    case "lesson-detail":
      return route.tab ? `/lesson/${route.lessonId}/${route.tab}` : `/lesson/${route.lessonId}`;
    case "quiz":
      return `/quiz/${route.lessonId}/${route.category}`;
    default:
      return `/${route.page}`;
  }
}
