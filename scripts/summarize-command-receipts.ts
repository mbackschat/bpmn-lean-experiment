/** Measures completed receipt intervals; neither idle time nor lane labels identify engineering effort. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InvalidCommandReceiptError, readCommandReceipt } from "./assert-command-receipt.ts";

type Interval = { start: number; end: number };
type FamilyTotal = { family: string; count: number; failedCount: number; summedCommandMs: number };

function commandFamily(command: string): string {
  if (/^\.\/scripts\/lake\.sh(?: |$)/u.test(command)) return "lean";
  if (/^node --test(?: |$)/u.test(command)) return "node:test";
  const pnpmGate = command.match(/^\.\/scripts\/pnpm\.sh run ([A-Za-z0-9:_-]+)(?: |$)/u);
  if (pnpmGate !== null) return `pnpm:${pnpmGate[1]}`;
  if (/^\.\/scripts\/pnpm\.sh(?: |$)/u.test(command)) return "pnpm";
  return "other";
}

function intervalUnion(intervals: ReadonlyArray<Interval>): number {
  let total = 0;
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const { start, end } of [...intervals].sort((a, b) => a.start - b.start)) {
    total += Math.max(0, end - Math.max(start, previousEnd));
    previousEnd = Math.max(previousEnd, end);
  }
  return total;
}

/** Reads direct child receipts, exposing invalid candidates and leaving historical missing labels unknown. */
export function summarizeCommandReceipts(receiptRoot: string) {
  const root = path.resolve(receiptRoot);
  const intervals: Interval[] = [];
  const families = new Map<string, FamilyTotal>();
  const lanes = new Set<string>();
  const invalidReceipts: { receipt: string; reason: string }[] = [];
  let failedCount = 0;
  let unlabeledCount = 0;
  let ignoredDirectories = 0;
  const children = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const child of children) {
    const directory = path.join(root, child);
    if (!["command.txt", "git-head", "output.log", "exit-status"]
      .some((file) => existsSync(path.join(directory, file)))) {
      ignoredDirectories += 1;
      continue;
    }
    try {
      const receipt = readCommandReceipt(directory);
      const start = statSync(path.join(directory, "command.txt")).mtimeMs;
      const end = statSync(path.join(directory, "exit-status")).mtimeMs;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        throw new InvalidCommandReceiptError(directory, "invalid-interval");
      }
      const command = readFileSync(path.join(directory, "command.txt"), "utf8")
        .split("\n").find((line) => line.startsWith("command="))?.slice("command=".length).trim();
      if (command === undefined || command.length === 0) {
        throw new InvalidCommandReceiptError(directory, "missing-command-line");
      }
      const lanePath = path.join(directory, "lane");
      const lane = existsSync(lanePath) ? readFileSync(lanePath, "utf8") : undefined;
      if (lane !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}\n$/u.test(lane)) {
        throw new InvalidCommandReceiptError(directory, "invalid-lane");
      }
      if (lane === undefined) unlabeledCount += 1;
      else lanes.add(lane.trim());
      intervals.push({ start, end });
      const failed = receipt.exitStatus === 0 ? 0 : 1;
      failedCount += failed;
      const family = commandFamily(command);
      const total = families.get(family) ?? { family, count: 0, failedCount: 0, summedCommandMs: 0 };
      total.count += 1;
      total.failedCount += failed;
      total.summedCommandMs += end - start;
      families.set(family, total);
    } catch (error) {
      invalidReceipts.push({ receipt: directory,
        reason: error instanceof InvalidCommandReceiptError ? error.reason : "unreadable-evidence" });
    }
  }
  const start = intervals.length === 0 ? null : Math.min(...intervals.map((interval) => interval.start));
  const end = intervals.length === 0 ? null : Math.max(...intervals.map((interval) => interval.end));
  return {
    root,
    timingBasis: "command.txt and exit-status modification times" as const,
    receiptCount: intervals.length,
    failedCount,
    startedAt: start === null ? null : new Date(start).toISOString(),
    endedAt: end === null ? null : new Date(end).toISOString(),
    spanMs: start === null || end === null ? null : end - start,
    busyMs: intervalUnion(intervals),
    summedCommandMs: intervals.reduce((total, interval) => total + interval.end - interval.start, 0),
    unlabeledCount,
    lanes: [...lanes].sort(),
    families: [...families.values()].sort((a, b) => a.family < b.family ? -1 : a.family > b.family ? 1 : 0),
    invalidReceipts,
    ignoredDirectories,
  };
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (root === undefined || process.argv.length !== 3) {
    process.stderr.write("usage: node scripts/summarize-command-receipts.ts <receipt-root>\n");
    process.exitCode = 2;
  } else {
    try {
      const summary = summarizeCommandReceipts(root);
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      if (summary.invalidReceipts.length > 0) process.exitCode = 2;
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    }
  }
}
