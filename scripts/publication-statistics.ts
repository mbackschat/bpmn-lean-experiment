import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeLeanSource,
  worktreeLeanSourceFiles,
} from "./lean-source-analysis.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const readmePath = path.join(projectRoot, "README.md");
const languages = ["Java", "TypeScript", "Lean"] as const;
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

type LeanStatistics = {
  publicTheorems: number;
  supportingLemmas: number;
  declarationCommands: number;
};

type TokeiLanguage = {
  blanks: number;
  code: number;
  comments: number;
  reports: unknown[];
};

function formatInteger(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

function leadingDeclaration(line: string): { command: string; isPrivate: boolean } | null {
  let remaining = line.trimStart();
  while (remaining.startsWith("@[")) {
    const attributeEnd = remaining.indexOf("]");
    if (attributeEnd === -1) {
      return null;
    }
    remaining = remaining.slice(attributeEnd + 1).trimStart();
  }

  const tokens = remaining.split(/\s+/u);
  let index = 0;
  let isPrivate = false;
  while (declarationModifiers.has(tokens[index] ?? "")) {
    isPrivate ||= tokens[index] === "private";
    index += 1;
  }
  const command = tokens[index];
  return command === undefined || !declarationCommands.has(command)
    ? null
    : { command, isPrivate };
}

function leanStatistics(): LeanStatistics {
  const total = {
    publicTheorems: 0,
    supportingLemmas: 0,
    declarationCommands: 0,
  };
  for (const sourcePath of worktreeLeanSourceFiles()) {
    const source = readFileSync(path.join(projectRoot, sourcePath), "utf8");
    for (const line of analyzeLeanSource(source).code.split("\n")) {
      const declaration = leadingDeclaration(line);
      if (declaration === null) {
        continue;
      }
      total.declarationCommands += 1;
      if (
        declaration.command === "lemma" ||
        (declaration.command === "theorem" && declaration.isPrivate)
      ) {
        total.supportingLemmas += 1;
      } else if (declaration.command === "theorem") {
        total.publicTheorems += 1;
      }
    }
  }
  return total;
}

function tokeiStatistics(): Record<(typeof languages)[number], TokeiLanguage> {
  let output: string;
  try {
    output = execFileSync(
      "tokei",
      ["--output", "json", "--types", languages.join(","), "."],
      { cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (code === "ENOENT") {
      throw new Error("publication statistics require Tokei on the maintainer's machine");
    }
    throw error;
  }

  const parsed = JSON.parse(output) as Record<string, Partial<TokeiLanguage>>;
  return Object.fromEntries(
    languages.map((language) => {
      const value = parsed[language];
      if (
        value === undefined ||
        !Number.isSafeInteger(value.blanks) ||
        !Number.isSafeInteger(value.code) ||
        !Number.isSafeInteger(value.comments) ||
        !Array.isArray(value.reports)
      ) {
        throw new Error(`invalid Tokei statistics for ${language}`);
      }
      return [language, value as TokeiLanguage];
    }),
  ) as Record<(typeof languages)[number], TokeiLanguage>;
}

function replaceBlock(readme: string, name: string, content: string): string {
  const startMarker = `<!-- publication-statistics:${name}:start -->`;
  const endMarker = `<!-- publication-statistics:${name}:end -->`;
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (
    start === -1 ||
    end < start ||
    readme.indexOf(startMarker, start + startMarker.length) !== -1 ||
    readme.indexOf(endMarker, end + endMarker.length) !== -1
  ) {
    throw new Error(`README must contain exactly one ordered ${name} block`);
  }
  return `${readme.slice(0, start + startMarker.length)}\n${content}\n${readme.slice(end)}`;
}

function languageRow(language: (typeof languages)[number], value: TokeiLanguage): string {
  return `| ${language} | ${formatInteger(value.reports.length)} | ${formatInteger(value.code)} | ${formatInteger(value.comments)} | ${formatInteger(value.blanks)} |`;
}

function languageFootprintTable(
  statistics: Record<(typeof languages)[number], TokeiLanguage>,
): string {
  return [
    "| Language | Files | Code | Comments | Blanks |",
    "|---|---:|---:|---:|---:|",
    ...languages.map((language) => languageRow(language, statistics[language])),
  ].join("\n");
}

function expectedReadme(current: string): string {
  const lean = leanStatistics();
  const proofDeclarations = lean.publicTheorems + lean.supportingLemmas;
  const proofShare =
    lean.declarationCommands === 0
      ? "0.0"
      : ((proofDeclarations * 100) / lean.declarationCommands).toFixed(1);
  const tokei = tokeiStatistics();
  const leanBlock = [
    "| Metric | Count |",
    "|---|---:|",
    `| Public theorem declarations | ${formatInteger(lean.publicTheorems)} |`,
    `| Supporting lemma declarations | ${formatInteger(lean.supportingLemmas)} |`,
    `| All declaration commands | ${formatInteger(lean.declarationCommands)} |`,
    `| Proof declarations / all declaration commands | ${proofShare}% |`,
    "",
    "Supporting lemmas count `private theorem` and every explicit `lemma` command, matching the repository convention. All declaration commands count `theorem`, `lemma`, `def`, `abbrev`, `opaque`, `axiom`, `constant`, `inductive`, `structure`, `class`, and `instance` after masking Lean comments and literals.",
  ].join("\n");

  return replaceBlock(
    replaceBlock(current, "lean-declarations", leanBlock),
    "language-footprint",
    languageFootprintTable(tokei),
  );
}

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  throw new Error("usage: node scripts/publication-statistics.ts [--write|--check]");
}

const current = readFileSync(readmePath, "utf8");
const expected = expectedReadme(current);
if (expected === current) {
  process.stdout.write("PUBLICATION_STATISTICS_OK\n");
} else if (mode === "--write") {
  writeFileSync(readmePath, expected);
  process.stdout.write("PUBLICATION_STATISTICS_UPDATED\n");
} else {
  process.stderr.write(
    "PUBLICATION_STATISTICS_STALE run ./scripts/pnpm.sh run publication-stats:update\n",
  );
  process.exitCode = 1;
}
