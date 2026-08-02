import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const ReviewBoundaryCategory = Object.freeze({
  Account: "account",
  Contract: "contract",
  Exclusions: "exclusions",
  Evidence: "evidence",
} as const);

type ReviewBoundaryCategory =
  (typeof ReviewBoundaryCategory)[keyof typeof ReviewBoundaryCategory];

const boundaryCategories = Object.values(ReviewBoundaryCategory);

export type ReviewSectionSelections = Readonly<
  Record<ReviewBoundaryCategory, ReadonlyArray<string>>
>;

export type ReviewSectionFingerprint = Readonly<{
  category: ReviewBoundaryCategory;
  heading: string;
  baselineSha256: string;
  targetSha256: string;
  unchanged: boolean;
}>;

export type ReviewSectionManifest = Readonly<{
  sections: ReadonlyArray<ReviewSectionFingerprint>;
  eligibleForWarmClosure: boolean;
  manifestSha256: string;
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactSecondLevelSection(document: string, heading: string): string {
  const marker = `## ${heading}`;
  const lines = document.split("\n");
  const starts = lines.flatMap((line, index) => line === marker ? [index] : []);
  if (starts.length !== 1) {
    throw new Error(`${heading} heading must occur exactly once`);
  }
  const start = starts[0];
  if (start === undefined) {
    throw new Error(`${heading} heading is absent`);
  }
  const following = lines.findIndex(
    (line, index) => index > start && line.startsWith("## "),
  );
  const end = following === -1 ? lines.length : following;
  return `${lines.slice(start, end).join("\n").trimEnd()}\n`;
}

/** Fingerprints the four governed semantic boundaries selected for closure. */
export function fingerprintReviewSections(
  baselineDocument: string,
  targetDocument: string,
  selections: ReviewSectionSelections,
): ReviewSectionManifest {
  const sections: ReviewSectionFingerprint[] = [];
  for (const category of boundaryCategories) {
    const headings = selections[category];
    if (headings.length === 0) {
      throw new Error(`${category} needs at least one section`);
    }
    if (new Set(headings).size !== headings.length) {
      throw new Error(`${category} repeats a section heading`);
    }
    for (const heading of headings) {
      const baselineSha256 = sha256(
        exactSecondLevelSection(baselineDocument, heading),
      );
      const targetSha256 = sha256(
        exactSecondLevelSection(targetDocument, heading),
      );
      sections.push({
        category,
        heading,
        baselineSha256,
        targetSha256,
        unchanged: baselineSha256 === targetSha256,
      });
    }
  }
  const eligibleForWarmClosure = sections.every(({ unchanged }) => unchanged);
  const manifestBody = { sections, eligibleForWarmClosure };
  return {
    ...manifestBody,
    manifestSha256: sha256(JSON.stringify(manifestBody)),
  };
}

type CliArguments = Readonly<{
  baseline: string;
  target: string;
  capsule: string;
  selections: ReviewSectionSelections;
}>;

function parseCliArguments(arguments_: ReadonlyArray<string>): CliArguments {
  let baseline: string | undefined;
  let target: string | undefined;
  let capsule: string | undefined;
  const mutableSelections: Record<ReviewBoundaryCategory, string[]> = {
    account: [],
    contract: [],
    exclusions: [],
    evidence: [],
  };
  const valueFlags = new Map<string, (value: string) => void>([
    ["--baseline", (value) => { baseline = value; }],
    ["--target", (value) => { target = value; }],
    ["--capsule", (value) => { capsule = value; }],
    ["--account", (value) => { mutableSelections.account.push(value); }],
    ["--contract", (value) => { mutableSelections.contract.push(value); }],
    ["--exclusions", (value) => { mutableSelections.exclusions.push(value); }],
    ["--evidence", (value) => { mutableSelections.evidence.push(value); }],
  ]);

  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    const assign = flag === undefined ? undefined : valueFlags.get(flag);
    if (assign === undefined || value === undefined || value.length === 0) {
      throw new Error(`unknown or valueless review-manifest argument: ${flag ?? "<missing>"}`);
    }
    assign(value);
  }
  if (baseline === undefined || target === undefined || capsule === undefined) {
    throw new Error("--baseline, --target, and --capsule are required");
  }
  if (path.isAbsolute(capsule) || capsule.startsWith("../")) {
    throw new Error("--capsule must be a repository-relative path");
  }
  return {
    baseline,
    target,
    capsule,
    selections: mutableSelections,
  };
}

function gitText(arguments_: ReadonlyArray<string>): string {
  const result = spawnSync("git", arguments_, {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function exactCommit(revision: string): string {
  return gitText(["rev-parse", "--verify", `${revision}^{commit}`]).trim();
}

function runCli(arguments_: ReadonlyArray<string>): void {
  const parsed = parseCliArguments(arguments_);
  const baseline = exactCommit(parsed.baseline);
  const target = exactCommit(parsed.target);
  const baselineDocument = gitText(["show", `${baseline}:${parsed.capsule}`]);
  const targetDocument = gitText(["show", `${target}:${parsed.capsule}`]);
  const sectionManifest = fingerprintReviewSections(
    baselineDocument,
    targetDocument,
    parsed.selections,
  );
  const changedFiles = gitText([
    "diff",
    "--name-only",
    baseline,
    target,
  ]).split("\n").filter(Boolean);
  const body = {
    kind: "semanticReviewManifest",
    baseline,
    target,
    capsule: parsed.capsule,
    baselineCapsuleSha256: sha256(baselineDocument),
    targetCapsuleSha256: sha256(targetDocument),
    changedFiles,
    sections: sectionManifest.sections,
    eligibleForWarmClosure: sectionManifest.eligibleForWarmClosure,
  };
  const output = {
    ...body,
    manifestSha256: sha256(JSON.stringify(body)),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.eligibleForWarmClosure) {
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  path.resolve(invokedPath) === fileURLToPath(import.meta.url)
) {
  try {
    runCli(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`SEMANTIC_REVIEW_MANIFEST_ERROR ${message}\n`);
    process.exitCode = 1;
  }
}
