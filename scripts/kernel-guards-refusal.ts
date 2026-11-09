/**
 * Admission refusal tests (guard 12), refusal parity (guard 20) and shape sufficiency (guard 21) of
 * docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation.
 *
 * Guard 21 is built but not wired to fail: `docs/kernel/ROW-TRACEABILITY-MAP.md` names the fixtures and they do not exist
 * yet (root direction, 2026-11-08). Its decoders are parameters because a TypeScript decode needs the built kernel
 * and a Lean decode needs `kernelRun`, neither of which the fast suite has.
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

/** Row to fixture cell of the traceability table: a file name, or `n/a` for a row that reads no IL. */
export function traceabilityFixtures(root: string): Map<string, string> {
  const file = path.join(root, "docs", "kernel", "ROW-TRACEABILITY-MAP.md");
  if (!existsSync(file)) return new Map();
  return new Map([...readFileSync(file, "utf8").matchAll(/^\| (PC-[A-Z]+-\d+) \| ([^|\s]+) \|/gmu)]
    .map((match) => [match[1] ?? "", match[2] ?? ""]));
}

export type RowDecoders = Readonly<{
  typeScript: (fixture: string) => string | null;
  lean: (fixture: string) => string | null;
}>;

/** Guard 21: every coverage row has a traceability entry and, unless it reads no IL, a fixture that decodes in both kernels. */
export function shapeSufficiencyFindings(root: string, decoders: RowDecoders): string[] {
  const rows = coverageRows(root);
  if (rows.length === 0) return [emptyInputFinding(21, "coverage target rows")];
  const fixtures = traceabilityFixtures(root);
  if (fixtures.size === 0) return [emptyInputFinding(21, "traceability entries")];
  return rows.flatMap((row) => {
    const cell = fixtures.get(row);
    if (cell === undefined) return [`G21 ${row}: no traceability entry`];
    if (cell === "n/a") return [];
    const fixture = path.join(root, "packages", "kernel", "test", "fixtures", "rows", cell);
    if (!existsSync(fixture)) return [`G21 ${row}: fixture ${cell} is missing`];
    return [["TypeScript", decoders.typeScript(fixture)], ["Lean", decoders.lean(fixture)]].flatMap(([kernel, error]) =>
      error === null ? [] : [`G21 ${row}: fixture ${cell} does not decode in the ${String(kernel)} kernel: ${String(error)}`]);
  });
}
