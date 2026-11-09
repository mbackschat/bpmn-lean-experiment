/**
 * TypeScript halves of one writer per effect (guard 17) and field liveness (guard 19) of
 * docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#guardrails-against-degradation; `scripts/kernel-effects.lean` is the Lean half.
 *
 * Dispatch guards see matches and miss effects: nine completers passed guards 1 and 2. So this scan reads who calls the
 * effect primitives, and which state fields a spread update writes. Liveness is by field name, which is coarser than the
 * Lean scan's per-structure reading, because a TypeScript property name is shared across interfaces.
 */
import { closeOf, emptyInputFinding, finding, isJustified, TokenKind, type KernelTree, type Source } from "./kernel-guard-scan.ts";

const kernelPrefix = "packages/kernel/src/";

/** An effect primitive and the modules that may call it (`state` always may, because it defines them). */
type CallRule = Readonly<{ name: string; callers: readonly string[]; label: string }>;

const callRules: readonly CallRule[] = [
  { name: "emit", callers: ["feature/flow"], label: "tokens are emitted only by Flow" },
  { name: "setVariable", callers: ["feature/data"], label: "variables are written only by Data" },
  { name: "beginOccurrence", callers: ["step"], label: "occurrences are created only by Step and State" },
  { name: "startReserved", callers: ["step"], label: "occurrences are created only by Step and State" },
  { name: "reserve", callers: ["step"], label: "occurrences are created only by Step and State" },
  { name: "removeOccurrence", callers: ["step"], label: "occurrences are removed only by Step and State" },
  { name: "cancelOccurrence", callers: ["step"], label: "occurrences are removed only by Step and State" },
  // `Kernel.State.activate` lists State among its callers too (scripts/kernel-effects.lean): only State's own
  // `reserve` and `beginOccurrence` count activations, so a State call is what keeps the rule from reading nothing.
  { name: "activate", callers: ["step", "state"], label: "activations are counted only by Step and State" },
];

/** The completion pipeline, idle completion and the lifecycle notifications: only `Step` calls these hooks. */
const pipelineHooks = new Set(["leave", "writeOutputs", "completed", "outflow", "instanceCompleted", "handlerCompleted",
  "completeScope", "completeCall", "completeBody", "cancelled", "written"]);

const stateFieldWriters: Readonly<Record<string, readonly string[]>> = {
  tokens: ["state", "step"],
  occurrences: ["state", "step"],
  activations: ["state", "step"],
  variables: ["state"],
  writes: ["state", "step"],
};

function moduleOf(source: Source): string {
  return source.file.slice(kernelPrefix.length).replace(/\.ts$/u, "");
}

/** Guard 17: each effect primitive is called only from its writer, and `State`'s effect fields are spread-updated only there. */
export function effectWriterFindings(tree: KernelTree): string[] {
  if (tree.typeScript.length === 0) return [emptyInputFinding(17, "TypeScript kernel modules")];
  const findings: string[] = [];
  const declared = new Set<string>();
  const called = new Set<string>();
  for (const source of tree.typeScript) {
    const module = moduleOf(source);
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined) continue;
      const isCall = tokens[i + 1]?.text === "(" && tokens[i - 1]?.text !== ".";
      if (module === "state" && tokens[i - 1]?.text === "function") declared.add(token.text);
      const rule = callRules.find((candidate) => candidate.name === token.text);
      if (rule !== undefined && isCall && tokens[i - 1]?.text !== "function") {
        if (rule.callers.includes(module)) called.add(rule.name);
        else if (module !== "state" && !isJustified(source, token.line, 17)) {
          findings.push(finding(17, source, token.line, `${rule.name} called outside its writer (${rule.label})`));
        }
      }
      if (token.text === "hooks" && tokens[i + 1]?.text === "." && tokens[i + 3]?.text === "(" && pipelineHooks.has(tokens[i + 2]?.text ?? "") &&
        module !== "step" && !isJustified(source, token.line, 17)) {
        findings.push(finding(17, source, token.line, `pipeline hook ${tokens[i + 2]?.text} called outside Step's one pipeline`));
      }
      if (token.text === "..." && tokens[i + 1]?.text === "state") {
        let depth = 0;
        for (let k = i + 2; k < tokens.length; k += 1) {
          const text = tokens[k]?.text ?? "";
          if (tokens[k]?.kind === TokenKind.Punct && (text === "{" || text === "(" || text === "[")) depth += 1;
          if (tokens[k]?.kind === TokenKind.Punct && (text === "}" || text === ")" || text === "]")) {
            if (depth === 0) break;
            depth -= 1;
          }
          const allowed = stateFieldWriters[text];
          if (depth === 0 && allowed !== undefined && tokens[k + 1]?.text === ":" && !allowed.includes(module) && !isJustified(source, tokens[k]?.line ?? 0, 17)) {
            findings.push(finding(17, source, tokens[k]?.line ?? 0, `spread update writes State.${text} outside ${allowed.join(" and ")}`));
          }
        }
      }
    }
  }
  for (const rule of callRules) {
    if (declared.has(rule.name) && !called.has(rule.name)) findings.push(`G17: ${rule.name} is declared but no allowed writer calls it, so the rule read nothing`);
  }
  if (declared.size === 0 || !callRules.some((rule) => declared.has(rule.name))) findings.push(emptyInputFinding(17, "effect primitives in state.ts"));
  return findings;
}

/** `il/types.ts` and the submodules it re-exports. */
function isIlTypes(file: string): boolean {
  return file === `${kernelPrefix}il/types.ts` || file.startsWith(`${kernelPrefix}il/types/`);
}

function isExcludedFromLiveness(file: string): boolean {
  return isIlTypes(file) || file.startsWith(`${kernelPrefix}il/codec`);
}

/** Field names of the interfaces in `il/types.ts`, with the line each is declared on. */
export function ilFieldNames(source: Source): Map<string, number> {
  const { tokens } = source;
  const fields = new Map<string, number>();
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i]?.text !== "interface") continue;
    let open = i + 2;
    while (open < tokens.length && tokens[open]?.text !== "{") open += 1;
    const close = closeOf(tokens, open);
    let depth = 0;
    for (let k = open + 1; k < close - 1; k += 1) {
      const text = tokens[k]?.text ?? "";
      if (tokens[k]?.kind === TokenKind.Punct && (text === "{" || text === "(" || text === "[" || text === "<")) depth += 1;
      if (tokens[k]?.kind === TokenKind.Punct && (text === "}" || text === ")" || text === "]" || text === ">")) depth -= 1;
      const atFieldStart = depth === 0 && tokens[k]?.kind === TokenKind.Word && tokens[k + 1]?.text === ":" &&
        (tokens[k - 1]?.text === "readonly" || tokens[k - 1]?.text === ";" || tokens[k - 1]?.text === "{" || k === open + 1);
      if (atFieldStart) fields.set(text, tokens[k]?.line ?? 0);
    }
  }
  return fields;
}

/** Guard 19: every IL field is read by a non-codec module (an admission refusal reads it too). */
export function fieldLivenessFindings(tree: KernelTree): string[] {
  const ilFiles = tree.typeScript.filter((source) => isIlTypes(source.file));
  if (!ilFiles.some((source) => source.file === `${kernelPrefix}il/types.ts`)) return [emptyInputFinding(19, "packages/kernel/src/il/types.ts")];
  const fields = ilFiles.flatMap((il) => [...ilFieldNames(il)].map(([field, line]) => [field, il, line] as const));
  if (fields.length === 0) return [emptyInputFinding(19, "IL interface fields")];
  const readers = tree.typeScript.filter((source) => !isExcludedFromLiveness(source.file));
  const read = new Set<string>();
  for (const source of readers) {
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined || token.kind !== TokenKind.Word) continue;
      if (tokens[i - 1]?.text === "." || tokens[i - 1]?.text === "?.") read.add(token.text);
      if (tokens[i - 1]?.text === "{" || tokens[i - 1]?.text === ",") {
        const next = tokens[i + 1]?.text;
        if (next === "," || next === "}" || next === ":") read.add(token.text);
      }
    }
  }
  return fields.flatMap(([field, il, line]) => read.has(field) || isJustified(il, line, 19)
    ? []
    : [finding(19, il, line, `IL field ${field} is read by no non-codec module and refused by no admission module`)]);
}
