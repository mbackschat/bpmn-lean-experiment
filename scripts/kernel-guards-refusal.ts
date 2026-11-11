/**
 * Admission refusal tests (guard 12), refusal parity (guard 20) and shape sufficiency (guard 21) of
 * docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation.
 *
 * Guard 21 has two halves. {@link rowFixtureFindings} needs no build and runs in the fast suite; the decoders of
 * {@link shapeSufficiencyFindings} are parameters because a TypeScript decode needs the built kernel and a Lean decode
 * `kernelRun --decode`, so `packages/differential/test/row-fixtures.integration-test.ts` runs them in the oracle's lane.
 * The fixtures are generated (`scripts/row-fixtures.ts`).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  emptyInputFinding,
  finding,
  isJustified,
  TokenKind,
  typeScriptEnums,
  type KernelTree,
  type Source,
} from "./kernel-guard-scan.ts";

type RefusalCode = Readonly<{ code: string; source: Source; line: number }>;

function isAdmissionModule(file: string): boolean {
  return /^Kernel\/Admission\//u.test(file) || /^packages\/kernel\/src\/admission\//u.test(file);
}

/** Every stable code a Lean or TypeScript admission module, or the modules `scanned` selects, can return. */
export function admissionCodes(tree: KernelTree, scanned: (file: string) => boolean = isAdmissionModule): RefusalCode[] {
  const codes: RefusalCode[] = [];
  for (const source of [...tree.lean, ...tree.typeScript]) {
    if (!scanned(source.file)) continue;
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token?.kind !== TokenKind.String || !/^[a-zA-Z][\w-]*(?:[.-][\w-]+)+$/u.test(token.text)) continue;
      codes.push({ code: token.text, source, line: token.line });
    }
  }
  return codes;
}

export function readerCodes(tree: KernelTree): RefusalCode[] {
  const refusal = typeScriptEnums(tree.reader).get("ReadRefusalCode");
  if (refusal === undefined) return [];
  const source = tree.reader.find((candidate) => candidate.file === refusal.file);
  if (source === undefined) return [];
  return [...refusal.members.values()].map((code) => ({ code, source, line: refusal.line }));
}

export const codecFiles: ReadonlyArray<string> = ["Kernel/IL/Codec.lean", "packages/kernel/src/il/codec.ts"];

/** The strict-decoding codes (`codec.*`) the Lean and TypeScript IL codecs declare. */
export function codecCodes(tree: KernelTree): RefusalCode[] {
  return [...tree.lean, ...tree.typeScript].filter((source) => codecFiles.includes(source.file)).flatMap((source) =>
    source.tokens.flatMap((token) =>
      token.kind === TokenKind.String && /^codec\.[A-Za-z]+$/u.test(token.text) ? [{ code: token.text, source, line: token.line }] : []));
}

/** Guard 12: every admission, reader and strict-decoding refusal code appears, quoted, in a test or test fixture. */
export function refusalTestFindings(tree: KernelTree): string[] {
  const codes = [...admissionCodes(tree), ...readerCodes(tree), ...codecCodes(tree)];
  if (codes.length === 0) return [emptyInputFinding(12, "admission or reader refusal codes")];
  if (tree.testFiles.length === 0) return [emptyInputFinding(12, "test files")];
  const corpus = tree.testFiles.map(({ text }) => text).join("\n");
  const seen = new Set<string>();
  return codes.flatMap(({ code, source, line }) => {
    if (seen.has(code)) return [];
    seen.add(code);
    return corpus.includes(`"${code}"`) || isJustified(source, line, 12) ? [] : [finding(12, source, line, `refusal code ${code} has no refusal test`)];
  });
}

type RuntimeRefusal = Readonly<{ code: string; source: Source; line: number }>;

/** Runtime `unsupported` codes: Lean `.unsupported "x"` and TypeScript `failed(FailureTag.Unsupported, "x")`. */
export function runtimeUnsupportedCodes(tree: KernelTree): RuntimeRefusal[] {
  const refusals: RuntimeRefusal[] = [];
  for (const source of tree.lean) {
    const { tokens } = source;
    tokens.forEach((token, i) => {
      const next = tokens[i + 1];
      if ((token.text === ".unsupported" || token.text === "Failure.unsupported") && next?.kind === TokenKind.String) {
        refusals.push({ code: next.text, source, line: token.line });
      }
    });
  }
  for (const source of tree.typeScript) {
    const { tokens } = source;
    tokens.forEach((token, i) => {
      if (token.text === "Unsupported" && tokens[i - 2]?.text === "FailureTag" && tokens[i + 1]?.text === "," && tokens[i + 2]?.kind === TokenKind.String) {
        refusals.push({ code: tokens[i + 2]?.text ?? "", source, line: token.line });
      }
    });
  }
  return refusals;
}

/** `message.nameExpression` and `message-name-expression` are one shape: runtime and admission spell codes apart. */
function normalizeCode(code: string): string {
  return code.replace(/[-._]/gu, "").toLowerCase();
}

/** A site is marked `dynamic-only: <reason>` on its line or in the comment block directly above it. */
function isDynamicOnly(source: Source, line: number): boolean {
  let at = line;
  if (source.comments.has(at) && /dynamic-only:\s*\S/iu.test(source.comments.get(at) ?? "")) return true;
  at -= 1;
  while (source.comments.has(at)) {
    if (/dynamic-only:\s*\S/iu.test(source.comments.get(at) ?? "")) return true;
    at -= 1;
  }
  return false;
}

/** Guard 20: a static shape never fails mid-run; each runtime `unsupported` has an admission refusal or a marked reason. */
export function refusalParityFindings(tree: KernelTree): string[] {
  const runtime = runtimeUnsupportedCodes(tree);
  if (runtime.length === 0) return [emptyInputFinding(20, "runtime unsupported codes")];
  const admitted = new Set(admissionCodes(tree).map(({ code }) => normalizeCode(code)));
  if (admitted.size === 0) return [emptyInputFinding(20, "admission refusal codes")];
  return runtime.flatMap(({ code, source, line }) =>
    admitted.has(normalizeCode(code)) || isDynamicOnly(source, line)
      ? []
      : [finding(20, source, line, `runtime unsupported "${code}" has no admission refusal and no dynamic-only mark`)]);
}

/** The stable row IDs of the coverage target, discovered from its table rows. */
export function coverageRows(root: string): string[] {
  const file = path.join(root, "docs", "PRACTICAL-CIB7-COVERAGE-TARGET.md");
  if (!existsSync(file)) return [];
  return [...readFileSync(file, "utf8").matchAll(/^\| `(PC-[A-Z]+-\d+)` \|/gmu)].map((match) => match[1] ?? "");
}

export type TraceabilityEntry = Readonly<{
  /** A file name under `packages/kernel/test/fixtures/rows/`, or `n/a` for a row that reads no IL. */
  fixture: string;
  /** The IL members the row reads (`Type.member`, suffixes `+` and `~` dropped). */
  ilFields: ReadonlyArray<string>;
}>;

/** Row to traceability entry, from the row table's first three columns. */
export function traceabilityEntries(root: string): Map<string, TraceabilityEntry> {
  const file = path.join(root, "docs", "kernel", "ROW-TRACEABILITY-MAP.md");
  if (!existsSync(file)) return new Map();
  return new Map([...readFileSync(file, "utf8").matchAll(/^\| (PC-[A-Z]+-\d+) \| ([^|\s]+) \| ([^|]*)\|/gmu)]
    .map((match) => [match[1] ?? "", {
      fixture: match[2] ?? "",
      ilFields: (match[3] ?? "").split(",").map((token) => token.trim().replace(/[+~]+$/u, "")).filter((token) => /^\w+\.\w+$/u.test(token)),
    }]));
}

/** The absolute path of a row fixture named in the traceability table. */
export function rowFixturePath(root: string, fixture: string): string {
  return path.join(root, "packages", "kernel", "test", "fixtures", "rows", fixture);
}

/** Every object key and every string the JSON text holds: Lean's derived encoding writes a structure field as a key and a
 * constructor as a key or, when it has no arguments, as a string. */
function encodedNames(json: unknown, names: Set<string> = new Set()): Set<string> {
  if (typeof json === "string") names.add(json);
  else if (Array.isArray(json)) for (const item of json) encodedNames(item, names);
  else if (typeof json === "object" && json !== null) {
    for (const [key, value] of Object.entries(json)) {
      names.add(key);
      encodedNames(value, names);
    }
  }
  return names;
}

/**
 * The traced IL members a row fixture's JSON does not carry. A member counts as carried when its name is a key or a
 * string anywhere in the fixture, so the check is by name, not by type: it stops a generic program standing in for a
 * row, and the strict decoders stop a name the codec does not know. It proves no more. `Type.member` is not checked
 * against `Type`, since the encoding carries no type tags and a typed check would walk the IL schema; a generic member
 * name (`id`, `name`, `kind`, `mode`, `code`, `incoming`) is carried by almost any program, and an element identifier
 * that happens to equal a member name counts as that member.
 */
export function missingTracedFields(fixtureText: string, ilFields: ReadonlyArray<string>): string[] {
  const names = encodedNames(JSON.parse(fixtureText));
  return ilFields.filter((field) => !names.has(field.slice(field.lastIndexOf(".") + 1)));
}

export type RowDecoders = Readonly<{
  typeScript: (fixture: string) => string | null;
  lean: (fixture: string) => string | null;
}>;

/**
 * Guard 21 without a build: every coverage row has a traceability entry and, unless it reads no IL, a fixture that
 * parses as JSON and carries every IL member its entry traces.
 */
export function rowFixtureFindings(root: string): string[] {
  const rows = coverageRows(root);
  if (rows.length === 0) return [emptyInputFinding(21, "coverage target rows")];
  const entries = traceabilityEntries(root);
  if (entries.size === 0) return [emptyInputFinding(21, "traceability entries")];
  return rows.flatMap((row) => {
    const entry = entries.get(row);
    if (entry === undefined) return [`G21 ${row}: no traceability entry`];
    if (entry.fixture === "n/a") return [];
    const fixture = rowFixturePath(root, entry.fixture);
    if (!existsSync(fixture)) return [`G21 ${row}: fixture ${entry.fixture} is missing`];
    let missing: string[];
    try {
      missing = missingTracedFields(readFileSync(fixture, "utf8"), entry.ilFields);
    } catch (error) {
      return [`G21 ${row}: fixture ${entry.fixture} is not JSON: ${error instanceof Error ? error.message : String(error)}`];
    }
    return missing.length === 0 ? [] : [`G21 ${row}: fixture ${entry.fixture} carries no ${missing.join(", ")}`];
  });
}

/** The row fixtures guard 21 decodes: those its traceability entries name and the repository holds. */
export function existingRowFixtures(root: string): string[] {
  return [...new Set([...traceabilityEntries(root).values()]
    .filter(({ fixture }) => fixture !== "n/a")
    .map(({ fixture }) => rowFixturePath(root, fixture)))]
    .filter((fixture) => existsSync(fixture));
}

/** Guard 21: {@link rowFixtureFindings}, and every row fixture decodes strictly in both kernels. */
export function shapeSufficiencyFindings(root: string, decoders: RowDecoders): string[] {
  const entries = traceabilityEntries(root);
  const decodeFindings = coverageRows(root).flatMap((row) => {
    const entry = entries.get(row);
    if (entry === undefined || entry.fixture === "n/a") return [];
    const fixture = rowFixturePath(root, entry.fixture);
    if (!existsSync(fixture)) return [];
    return [["TypeScript", decoders.typeScript(fixture)], ["Lean", decoders.lean(fixture)]].flatMap(([kernel, error]) =>
      error === null ? [] : [`G21 ${row}: fixture ${entry.fixture} does not decode in the ${String(kernel)} kernel: ${String(error)}`]);
  });
  return [...rowFixtureFindings(root), ...decodeFindings];
}
