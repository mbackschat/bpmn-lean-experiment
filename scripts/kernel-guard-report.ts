/**
 * The non-blocking reports of the kernel guards (docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation):
 * shape edits per branch (guards 9 and 15), oversize files and functions (guard 10), and growth and modules changed per
 * delivered row (guards 15 and 18). A report prints as CI output and never blocks; run as
 * `node scripts/kernel-guard-report.ts`, and `kernel-build-budget.ts` prints it in the hosted Lean lane.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadTree, repositoryRoot, type KernelTree } from "./kernel-guard-scan.ts";
import { kernelModulesChanged, tsMatchSiteCounts, type Commit } from "./kernel-guards-dispatch.ts";
import { longFunctions } from "./kernel-guards-placement.ts";
import { ilRecordPaths, shapeEditReport } from "./kernel-rebuild-model.ts";

/**
 * The commit the commit-scope rule of guard 18 starts after: the last commit before the guards landed. Earlier history
 * cannot be re-cut, and the kernel-rewrite branch is not rebased.
 */
export const commitRuleEpoch = "4eac1769";

function commitsOutput(root: string, range: readonly string[]): string {
  return execFileSync("git", ["log", "--format=%x00%H%x09%s", "--name-only", ...range], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function parseCommits(output: string): Commit[] {
  return output.split("\0").slice(1).map((entry) => {
    const [header = "", ...files] = entry.split("\n");
    const [sha = "", subject = ""] = header.split("\t");
    return { sha, subject, files: files.filter((file) => file !== "") };
  });
}

/**
 * The commits after the epoch on HEAD that touch the kernel, with only their kernel files: guard 18 and the reports read
 * nothing else, and the full file lists of retained-evidence commits outgrow the history read's buffer. HEAD itself is
 * read when no commit touches the kernel, so the rule never runs over nothing.
 */
export function branchCommits(root: string = repositoryRoot, epoch: string = commitRuleEpoch): Commit[] {
  const commits = parseCommits(commitsOutput(root, [`${epoch}..HEAD`, "--", "Kernel", "packages/kernel/src"]));
  return commits.length > 0 ? commits : parseCommits(commitsOutput(root, ["-1", "HEAD"]));
}

/**
 * The commits after main's merge base that edit an IL record file, with only those files, for guard 9's failing half.
 * `mainRef` is `origin/main`, which a full clone and the hosted checkout (`fetch-depth: 0`) both hold; a base that cannot
 * be resolved throws, so the guard never runs over nothing.
 */
export function ilRecordCommits(root: string = repositoryRoot, mainRef = "origin/main"): Commit[] {
  const base = execFileSync("git", ["merge-base", "HEAD", mainRef], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  return parseCommits(commitsOutput(root, [`${base}..HEAD`, "--", ...ilRecordPaths.map((prefix) => prefix.replace(/\/$/u, ""))]));
}

function largestFile(tree: KernelTree): string {
  const sources = [...tree.lean, ...tree.typeScript];
  const largest = sources.reduce((best, source) => (source.nonblank > best.nonblank ? source : best));
  return `${largest.file} (${largest.nonblank} nonblank lines)`;
}

/** Every report, one line each. */
export function reportLines(tree: KernelTree, commits: readonly Commit[]): string[] {
  const sources = [...tree.lean, ...tree.typeScript, ...tree.reader];
  const siteTotal = [...tsMatchSiteCounts(tree).values()].reduce((sum, count) => sum + count, 0);
  const rowCommits = commits.filter((commit) => /PC-[A-Z]+-\d+/u.test(commit.subject));
  return [
    "== guard reports (never blocking) ==",
    ...shapeEditReport(commits),
    ...sources.filter((source) => source.nonblank > 800).map((source) => `file above 800 nonblank lines: ${source.file} (${source.nonblank})`),
    ...longFunctions(tree).map((span) => `function above 80 lines: ${span.file}:${span.line} ${span.name} (${span.lines})`),
    `growth: ${tree.lean.reduce((sum, source) => sum + source.nonblank, 0)} Lean kernel lines, ${tree.typeScript.reduce((sum, source) => sum + source.nonblank, 0)} TypeScript kernel lines, ${tree.lean.length + tree.typeScript.length} modules, largest ${largestFile(tree)}, ${siteTotal} TypeScript match sites`,
    ...rowCommits.map((commit) => `modules changed by ${commit.sha.slice(0, 8)} (${commit.subject}): ${kernelModulesChanged(commit.files).size}`),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(reportLines(loadTree(), branchCommits()).join("\n"));
}
