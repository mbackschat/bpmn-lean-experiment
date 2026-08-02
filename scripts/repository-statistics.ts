import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  analyzeLeanSource,
  worktreeLeanSourceFiles,
} from "./lean-source-analysis.ts";

export type LeanDeclarationStatistics = Readonly<{
  publicTheorems: number;
  supportingLemmas: number;
  declarationCommands: number;
}>;

export type LanguageStatistics = Readonly<{
  language: "Java" | "Kotlin" | "TypeScript" | "Lean";
  files: number;
  code: number;
  comments: number;
  blanks: number;
}>;

const selectedLanguages = ["Java", "Kotlin", "TypeScript", "Lean"] as const;
const declarationCommands = new Set([
  "theorem",
  "lemma",
  "def",
  "abbrev",
  "opaque",
  "axiom",
  "constant",
  "inductive",
  "structure",
  "class",
  "instance",
]);
const declarationModifiers = new Set([
  "private",
  "protected",
  "noncomputable",
  "unsafe",
  "partial",
  "local",
  "scoped",
]);
const statisticsStart = "<!-- repository-statistics:start -->";
const statisticsEnd = "<!-- repository-statistics:end -->";

function removeLeadingAttributes(line: string): string {
  let remaining = line.trimStart();
  while (remaining.startsWith("@[")) {
    const end = remaining.indexOf("]");
    if (end === -1) {
      return remaining;
    }
    remaining = remaining.slice(end + 1).trimStart();
  }
  return remaining;
}

/** Classifies proof declarations using the repository's public-theorem/private-lemma convention. */
export function analyzeLeanDeclarations(
  source: string,
): LeanDeclarationStatistics {
  let publicTheorems = 0;
  let supportingLemmas = 0;
  let declarationCommandCount = 0;

  for (const sourceLine of analyzeLeanSource(source).code.split("\n")) {
    const tokens = removeLeadingAttributes(sourceLine).split(/\s+/u);
    let tokenIndex = 0;
    let isPrivate = false;
    while (declarationModifiers.has(tokens[tokenIndex] ?? "")) {
      isPrivate ||= tokens[tokenIndex] === "private";
      tokenIndex += 1;
    }
    const command = tokens[tokenIndex];
    if (command === undefined || !declarationCommands.has(command)) {
      continue;
    }

    declarationCommandCount += 1;
    if (command === "lemma" || (command === "theorem" && isPrivate)) {
      supportingLemmas += 1;
    } else if (command === "theorem") {
      publicTheorems += 1;
    }
  }

  return {
    publicTheorems,
    supportingLemmas,
    declarationCommands: declarationCommandCount,
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

export function parseTokeiReport(report: unknown): LanguageStatistics[] {
  const root = record(report, "Tokei report");
  return selectedLanguages.map((language) => {
    const rawLanguage = root[language];
    if (rawLanguage === undefined) {
      return { language, files: 0, code: 0, comments: 0, blanks: 0 };
    }
    const languageReport = record(rawLanguage, `Tokei ${language}`);
    const reports = languageReport.reports;
    if (!Array.isArray(reports)) {
      throw new TypeError(`Tokei ${language}.reports must be an array`);
    }
    return {
      language,
      files: reports.length,
      code: count(languageReport.code, `Tokei ${language}.code`),
      comments: count(languageReport.comments, `Tokei ${language}.comments`),
      blanks: count(languageReport.blanks, `Tokei ${language}.blanks`),
    };
  });
}

function formatInteger(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

export function renderRepositoryStatistics(
  lean: LeanDeclarationStatistics,
  languages: ReadonlyArray<LanguageStatistics>,
  tokeiVersion: string,
): string {
  const proofDeclarations = lean.publicTheorems + lean.supportingLemmas;
  const proofShare =
    lean.declarationCommands === 0
      ? "0.0"
      : ((proofDeclarations * 100) / lean.declarationCommands).toFixed(1);
  const languageRows = languages.map(
    ({ language, files, code, comments, blanks }) =>
      `| ${language} | ${formatInteger(files)} | ${formatInteger(code)} | ${formatInteger(comments)} | ${formatInteger(blanks)} |`,
  );

  return [
    "These worktree statistics are mechanically generated without a timestamp. Run `./scripts/pnpm.sh run stats:update` to refresh them; the tracked pre-push hook checks the same source and stops after regenerating a stale block so the result can be committed.",
    "",
    "### Lean declarations",
    "",
    "| Metric | Count |",
    "|---|---:|",
    `| Public theorem declarations | ${formatInteger(lean.publicTheorems)} |`,
    `| Supporting lemma declarations | ${formatInteger(lean.supportingLemmas)} |`,
    `| All declaration commands | ${formatInteger(lean.declarationCommands)} |`,
    `| Proof declarations / all declaration commands | ${proofShare}% |`,
    "",
    "Supporting lemmas count `private theorem` and every explicit `lemma` command, matching the repository convention. All declaration commands count `theorem`, `lemma`, `def`, `abbrev`, `opaque`, `axiom`, `constant`, `inductive`, `structure`, `class`, and `instance` after masking Lean comments and literals.",
    "",
    `### Language footprint (\`tokei ${tokeiVersion}\`)`,
    "",
    "| Language | Files | Code | Comments | Blanks |",
    "|---|---:|---:|---:|---:|",
    ...languageRows,
  ].join("\n");
}

export function replaceRepositoryStatistics(
  readme: string,
  generated: string,
): string {
  const start = readme.indexOf(statisticsStart);
  const end = readme.indexOf(statisticsEnd);
  if (
    start === -1 ||
    end === -1 ||
    end < start ||
    readme.indexOf(statisticsStart, start + statisticsStart.length) !== -1 ||
    readme.indexOf(statisticsEnd, end + statisticsEnd.length) !== -1
  ) {
    throw new Error("README must contain exactly one ordered pair of repository statistics markers");
  }

  return `${readme.slice(0, start + statisticsStart.length)}\n${generated}\n${readme.slice(end)}`;
}

function collectLeanStatistics(projectRoot: string): LeanDeclarationStatistics {
  const total = {
    publicTheorems: 0,
    supportingLemmas: 0,
    declarationCommands: 0,
  };
  for (const sourcePath of worktreeLeanSourceFiles()) {
    const statistics = analyzeLeanDeclarations(
      readFileSync(path.join(projectRoot, sourcePath), "utf8"),
    );
    total.publicTheorems += statistics.publicTheorems;
    total.supportingLemmas += statistics.supportingLemmas;
    total.declarationCommands += statistics.declarationCommands;
  }
  return total;
}

function tokeiOutput(projectRoot: string, arguments_: string[]): string {
  try {
    return execFileSync("tokei", arguments_, {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (code === "ENOENT") {
      throw new Error("tokei is required to update repository statistics; on macOS run: brew install tokei");
    }
    throw error;
  }
}

function generatedStatistics(projectRoot: string): string {
  const versionOutput = tokeiOutput(projectRoot, ["--version"]);
  const version = /^tokei\s+(\S+)/u.exec(versionOutput)?.[1];
  if (version === undefined) {
    throw new Error(`unexpected tokei version output: ${JSON.stringify(versionOutput.trim())}`);
  }
  const languageReport = JSON.parse(
    tokeiOutput(projectRoot, [
      "--output",
      "json",
      "--types",
      selectedLanguages.join(","),
      ".",
    ]),
  ) as unknown;
  return renderRepositoryStatistics(
    collectLeanStatistics(projectRoot),
    parseTokeiReport(languageReport),
    version,
  );
}

function updateReadme(
  projectRoot: string,
  mode: "--write" | "--check" | "--pre-push",
): boolean {
  const readmePath = path.join(projectRoot, "README.md");
  const current = readFileSync(readmePath, "utf8");
  const expected = replaceRepositoryStatistics(
    current,
    generatedStatistics(projectRoot),
  );
  if (expected === current) {
    process.stdout.write("README_STATISTICS_OK\n");
    return true;
  }
  if (mode === "--check") {
    process.stderr.write(
      "README_STATISTICS_STALE run ./scripts/pnpm.sh run stats:update\n",
    );
    return false;
  }

  writeFileSync(readmePath, expected);
  if (mode === "--pre-push") {
    process.stderr.write(
      "README_STATISTICS_UPDATED commit README.md and push again\n",
    );
    return false;
  }
  process.stdout.write("README_STATISTICS_UPDATED\n");
  return true;
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check" && mode !== "--pre-push") {
    throw new Error(
      "usage: node scripts/repository-statistics.ts [--write|--check|--pre-push]",
    );
  }
  if (!updateReadme(fileURLToPath(new URL("../", import.meta.url)), mode)) {
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1];
if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  main();
}
