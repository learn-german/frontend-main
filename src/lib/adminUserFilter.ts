export interface FilterableUser {
  email: string;
  full_name: string | null;
  role: string;
  unlockedLevels: string[];
  created_at: string;
}

export interface UserFilterCriteria {
  search: string;
  role: "all" | "user" | "admin";
  levels: Set<string>;
  dateFrom: string;
  dateTo: string;
}

export function filterUsers<T extends FilterableUser>(users: T[], criteria: UserFilterCriteria): T[] {
  const searchLower = criteria.search.toLowerCase();
  const fromTime = criteria.dateFrom ? new Date(criteria.dateFrom).getTime() : null;
  const toTime = criteria.dateTo ? new Date(`${criteria.dateTo}T23:59:59Z`).getTime() : null;

  return users.filter((u) => {
    if (
      searchLower
      && !u.email.toLowerCase().includes(searchLower)
      && !(u.full_name ?? "").toLowerCase().includes(searchLower)
    ) {
      return false;
    }
    if (criteria.role !== "all" && u.role !== criteria.role) return false;
    if (criteria.levels.size > 0 && !u.unlockedLevels.some((l) => criteria.levels.has(l))) return false;
    const createdTime = new Date(u.created_at).getTime();
    if (fromTime !== null && createdTime < fromTime) return false;
    if (toTime !== null && createdTime > toTime) return false;
    return true;
  });
}
