import {
  hardCeiling,
  reviewTarget,
  type SourceMeasurement,
} from "./source-measure.ts";

/**
 * The exception mark a hand-written source above the review target carries at its own site, so the reason lives beside
 * the code it excuses and goes away with it (docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation: "a
 * justification comment at the exception site is the only allowed exception mark"). The mark sits in a line comment
 * of any project language and must carry a reason.
 */
const sizeExceptionMark = /^\s*(?:\/\/|--|\/\*+|\*|#)\s*size-exception:\s*(\S.*?)\s*(?:\*\/)?$/u;

/** The reason a source's own `size-exception:` comment records, or `null` when it records none. */
export function sizeExceptionReason(source: string): string | null {
  for (const line of source.split(/\r?\n/u)) {
    const mark = sizeExceptionMark.exec(line);
    if (mark?.[1] !== undefined) return mark[1];
  }
  return null;
}

export type SourceHygieneAssessment = Readonly<{
  hardViolations: ReadonlyArray<SourceMeasurement>;
  unreviewed: ReadonlyArray<SourceMeasurement>;
  invalidReviews: ReadonlyArray<string>;
}>;

/**
 * Applies the review target, hard ceiling, and exception-rationale validity rules. `reviews` maps each path whose
 * source carries a `size-exception:` mark to its reason.
 */
export function assessSourceHygiene(
  measurements: ReadonlyArray<SourceMeasurement>,
  reviews: ReadonlyMap<string, string>,
): SourceHygieneAssessment {
  const hardViolations = measurements.filter(({ lines }) => lines > hardCeiling);
  const unreviewed = measurements.filter(
    ({ path, lines }) => lines > reviewTarget && !reviews.has(path),
  );
  const invalidReviews: string[] = [];
  for (const [path, rationale] of reviews) {
    const measurement = measurements.find((candidate) => candidate.path === path);
    if (rationale.trim().length === 0) {
      invalidReviews.push(`${path}: empty rationale`);
    } else if (measurement === undefined) {
      invalidReviews.push(`${path}: stale or untracked path`);
    } else if (measurement.lines <= reviewTarget) {
      invalidReviews.push(`${path}: no longer exceeds the review target`);
    } else if (measurement.lines > hardCeiling) {
      invalidReviews.push(`${path}: cannot exempt the hard ceiling`);
    }
  }
  return { hardViolations, unreviewed, invalidReviews };
}
