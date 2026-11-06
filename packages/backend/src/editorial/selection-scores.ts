// Pure score rules shared by the worker, evaluation and the offline tutorial.
import { SELECTION } from "../../../../industry/selection.ts";
import type { AnalysisRun } from "./analyze.ts";

/** Independent score calls per article; their sum decides, their mean (floored) is shown. */
export const SCORE_CALLS = 2;

/**
 * The thresholds on the mean score, per source tier (industry/selection.ts): selected when
 * score1 + score2 >= 2 × threshold. Tiers without a threshold are not scored for 精选.
 */
export function tierThreshold(tier: string): number | null {
  return SELECTION.thresholds[tier] ?? null;
}

/** The two scores' sum; null when the scoring was refused or is incomplete. */
export function scoreSum(scores: AnalysisRun["scores"]): number | null {
  return scores && !scores.refused && scores.values.length === SCORE_CALLS ? scores.values.reduce((total, v) => total + v, 0) : null;
}

/** The score shown: the two scores' mean, floored (it never decides a half point on its own). */
export function shownScore(scores: AnalysisRun["scores"]): number | null {
  const sum = scoreSum(scores);
  return sum === null ? null : Math.floor(sum / SCORE_CALLS);
}

/**
 * The selection rule on the scores: they add up to twice the source tier's threshold (or `threshold`,
 * when an evaluation sweeps it). The item must also pass relevance (normalizeAnalysis).
 */
export function scoresSelect(scores: AnalysisRun["scores"], threshold = scores?.threshold ?? null): boolean {
  const sum = scoreSum(scores);
  return sum !== null && threshold !== null && sum >= threshold * SCORE_CALLS;
}
