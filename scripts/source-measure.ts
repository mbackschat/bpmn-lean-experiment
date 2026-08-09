/**
 * Module-size measurement shared by the hygiene gate and the change-planning enumerator.
 *
 * The counting rule and the two boundaries are one fact with two consumers: the gate that fails on a
 * violation and the enumerator that reports remaining capacity before an edit begins. Keeping them in
 * one owner prevents a planning report from measuring a file differently than the gate that will
 * judge it.
 */

/** Nonblank lines above which a hand-written source file needs a recorded narrow justification. */
export const reviewTarget = 600;

/** Nonblank lines no hand-written source file may exceed under any justification. */
export const hardCeiling = 1_000;

/** Files this close to the review target are effectively full for planning purposes. */
export const headroomWarningLines = 40;

const handWrittenSourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".java",
  ".js",
  ".jsx",
  ".lean",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const javaScriptSourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs"]);
const typeScriptSourceExtensions = new Set([".cts", ".mts", ".ts", ".tsx"]);

export type SourceMeasurement = Readonly<{
  path: string;
  lines: number;
}>;

/** True for every hand-written source language governed by the module-size boundary. */
export function isHandWrittenSourcePath(candidate: string): boolean {
  const extension = candidate.slice(candidate.lastIndexOf("."));
  return handWrittenSourceExtensions.has(extension);
}

export function isJavaScriptSourcePath(candidate: string): boolean {
  const extension = candidate.slice(candidate.lastIndexOf("."));
  return javaScriptSourceExtensions.has(extension);
}

export function isTypeScriptSourcePath(candidate: string): boolean {
  const extension = candidate.slice(candidate.lastIndexOf("."));
  return typeScriptSourceExtensions.has(extension);
}

export function nonblankLines(source: string): number {
  return source
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0).length;
}

/** Remaining lines before the review target; negative once a file is already above it. */
export function headroom(lines: number): number {
  return reviewTarget - lines;
}

export function headroomDescription(lines: number): string {
  return `${lines}/${reviewTarget} nonblank, ${headroom(lines)} lines before the review target`;
}

/**
 * Reports which owners are nearly full instead of only naming one once it overflows.
 *
 * A passing size gate says nothing about remaining capacity, so an implementation plan can name a
 * module as a change site while that module has no room left, and the constraint surfaces only after
 * editing begins. Being near the target is not a defect, so this returns lines to print and never
 * decides an outcome.
 */
export function headroomReportLines(
  measurements: ReadonlyArray<SourceMeasurement>,
): ReadonlyArray<string> {
  return measurements
    .filter(({ lines }) =>
      lines <= reviewTarget && headroom(lines) <= headroomWarningLines
    )
    .slice()
    .sort((left, right) => left.lines - right.lines)
    .map(({ path, lines }) =>
      `SOURCE_HEADROOM ${path} ${headroomDescription(lines)}`
    );
}
