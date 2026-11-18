/**
 * The value-bound guards of HD7 (`docs/REWRITE-2-PROPOSAL.md`; guard 8, one rule in one place, for figures): Lean's
 * `Bounds` defaults in `Kernel/IL/Types/Options.lean` are the one owner of the value domain's bounds.
 *
 * - Agreement: every copy a package that may not import the kernel keeps (the reader's wire form, the scenario schema,
 *   the platform decoders, the CIB runner) and TypeScript's `defaultBounds` equal those defaults, so changing a default
 *   fails here until every copy follows.
 * - Stray literal: no kernel module, Lean or TypeScript and its laws and proofs included, writes the figure of a bound
 *   as a numeric literal outside the two `Bounds` definitions; it reads the bound from the program's options instead.
 *   Only the three figures that are distinctive in kernel code (256, 1,024 and 16,384) are scanned: 4 and 32 are
 *   ordinary numbers there.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { emptyInputFinding, TokenKind, type KernelTree } from "./kernel-guard-scan.ts";

export type BoundName = "containerLevels" | "containerMembers" | "valueNodes" | "canonicalBytes" | "textBytes";

const boundNames: readonly BoundName[] = ["containerLevels", "containerMembers", "valueNodes", "canonicalBytes", "textBytes"];
const leanOwner = "Kernel/IL/Types/Options.lean";
const typeScriptPair = "packages/kernel/src/il/types/options.ts";

/** A copy of one bound: the file and a pattern whose first group is the figure. */
type Copy = Readonly<{ file: string; bound: BoundName; pattern: RegExp }>;

const constant = (file: string, bound: BoundName, name: string): Copy =>
  ({ file, bound, pattern: new RegExp(`\\b${name}\\s*=\\s*([\\d_]+)\\s*;`, "u") });
const schemaLimit = (pointer: string, bound: BoundName): Copy =>
  ({ file: "contracts/schemas/scenario.schema.json", bound, pattern: new RegExp(pointer, "u") });

/** The copies outside the kernel, by the bound each restates. A wire-form record names every bound in one object. */
export const boundCopies: readonly Copy[] = [
  ...boundNames.map((bound) => ({ file: "packages/bpmn-source/src/kernel-reader/wire.ts", bound,
    pattern: new RegExp(`const valueBounds: KernelBounds = \\{[^}]*\\b${bound}: ([\\d_]+)`, "u") })),
  schemaLimit(`"portableStringValue":[\\s\\S]*?"maxLength": (\\d+)`, "textBytes"),
  schemaLimit(`"listValue":[\\s\\S]*?"maxItems": (\\d+)`, "containerMembers"),
  schemaLimit(`"mapValue":[\\s\\S]*?"maxItems": (\\d+)`, "containerMembers"),
  schemaLimit(`"mapValue":[\\s\\S]*?"name":[\\s\\S]*?"maxLength": (\\d+)`, "textBytes"),
  schemaLimit(`"variableValue":[\\s\\S]*?"maxItems": (\\d+)`, "containerMembers"),
  schemaLimit(`"variableValue":[\\s\\S]*?"maxItems": \\d+,[\\s\\S]*?"maxLength": (\\d+)`, "textBytes"),
  constant("platform/contracts/src/execution-publication-variable-value-decoder.ts", "containerMembers", "maximumStringListLength"),
  constant("platform/contracts/src/execution-publication-variable-value-decoder.ts", "textBytes", "maximumStringListMemberBytes"),
  constant("platform/contracts/src/execution-publication-variable-value-decoder.ts", "canonicalBytes", "maximumStringListValueBytes"),
  constant("platform/contracts/src/work-task-form-decoders.ts", "containerMembers", "maximumStringListMembers"),
  constant("platform/contracts/src/work-task-form-decoders.ts", "textBytes", "maximumStringListMemberBytes"),
  constant("platform/contracts/src/work-task-form-decoders.ts", "canonicalBytes", "maximumTaggedValueBytes"),
  { file: "platform/modules/work/src/work-repository-values.ts", bound: "canonicalBytes",
    pattern: /workCompletionCanonicalJsonByteLength\(value\) > ([\d_]+)/u },
  constant("platform/modules/work/src/structured-form-computation.ts", "canonicalBytes", "publicValueByteLimit"),
  { file: "platform/modules/work/src/structured-form-computation.ts", bound: "textBytes",
    pattern: /!item\.isWellFormed\(\) \|\| utf8Bytes\(item\) > ([\d_]+)/u },
  constant("runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioVariableValueProjection.java", "canonicalBytes",
    "MAX_VALUE_BYTES"),
];

const figure = (text: string): number => Number(text.replaceAll("_", ""));

function read(root: string, file: string): string | null {
  const full = path.join(root, file);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

/** Lean's `Bounds` defaults, `null` when the structure or one of its fields cannot be read. */
export function leanBoundDefaults(root: string): ReadonlyMap<BoundName, number> | null {
  const block = /^structure Bounds where\n([\s\S]*?)\n {2}deriving/mu.exec(read(root, leanOwner) ?? "")?.[1] ?? "";
  const defaults = new Map<BoundName, number>();
  for (const bound of boundNames) {
    const value = new RegExp(`^ {2}${bound} : Nat := (\\d+)$`, "mu").exec(block)?.[1];
    if (value === undefined) return null;
    defaults.set(bound, figure(value));
  }
  return defaults;
}

/** HD7 agreement: TypeScript's `defaultBounds` and every copy outside the kernel equal Lean's `Bounds` defaults. */
export function boundAgreementFindings(tree: KernelTree): string[] {
  const defaults = leanBoundDefaults(tree.root);
  if (defaults === null) return [emptyInputFinding(8, `the Bounds defaults in ${leanOwner}`)];
  const pairText = read(tree.root, typeScriptPair) ?? "";
  const pairRecord = /export const defaultBounds: Bounds = \{([^}]*)\}/u.exec(pairText)?.[1];
  const copies: Copy[] = boundNames.map((bound) => ({ file: typeScriptPair, bound,
    pattern: new RegExp(`\\b${bound}: ([\\d_]+)`, "u") }));
  const findings: string[] = pairRecord === undefined ? [`G8 ${typeScriptPair}: no readable defaultBounds record`] : [];
  for (const copy of [...copies, ...boundCopies]) {
    const text = copy.file === typeScriptPair ? pairRecord ?? "" : read(tree.root, copy.file);
    if (text === null) {
      findings.push(`G8 ${copy.file}: missing; its copy of ${copy.bound} cannot be checked`);
      continue;
    }
    const found = copy.pattern.exec(text)?.[1];
    if (found === undefined) findings.push(`G8 ${copy.file}: no readable copy of ${copy.bound}`);
    else if (figure(found) !== defaults.get(copy.bound)) {
      findings.push(`G8 ${copy.file}: ${copy.bound} is ${figure(found)}, Lean's Bounds default is ${defaults.get(copy.bound)}`);
    }
  }
  return findings;
}

/** HD7 stray literal: a kernel module writing a bound's figure outside the two `Bounds` definitions. */
export function strayBoundLiteralFindings(tree: KernelTree): string[] {
  const defaults = leanBoundDefaults(tree.root);
  if (defaults === null) return [emptyInputFinding(8, `the Bounds defaults in ${leanOwner}`)];
  if (tree.lean.length === 0 || tree.typeScript.length === 0) return [emptyInputFinding(8, "kernel modules")];
  const distinctive = new Map([...defaults].filter(([, value]) => value >= 100).map(([bound, value]) => [value, bound]));
  const findings: string[] = [];
  for (const source of [...tree.lean, ...tree.typeScript]) {
    if (source.file === leanOwner || source.file === typeScriptPair) continue;
    for (const token of source.tokens) {
      if (token.kind !== TokenKind.Number) continue;
      const bound = distinctive.get(figure(token.text));
      if (bound !== undefined) {
        findings.push(`G8 ${source.file}:${token.line}: literal ${token.text} restates the ${bound} bound; read it from the program's Bounds`);
      }
    }
  }
  return findings;
}
