export interface ExistingAttempt {
  best_score: number;
  attempt_count: number;
}

export interface AttemptUpdate {
  best_score: number;
  attempt_count: number;
  xp_earned: number;
}

/**
 * Decides the persisted state after one submission. XP is awarded the first
 * time the learner reaches the pass threshold, regardless of how many failed
 * attempts came before, and best_score never goes down.
 */
export function computeAttemptUpdate(
  existing: ExistingAttempt | null,
  score: number,
  xpReward: number,
  passThreshold: number,
): AttemptUpdate {
  const previousBest = existing?.best_score ?? 0;
  const reachedPassNow = score >= passThreshold && previousBest < passThreshold;

  return {
    best_score: Math.max(score, previousBest),
    attempt_count: (existing?.attempt_count ?? 0) + 1,
    xp_earned: reachedPassNow ? xpReward : 0,
  };
}
