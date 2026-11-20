/**
 * TypeScript halves of one writer per effect (guard 17) and field liveness (guard 19) of
 * docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation; `scripts/kernel-effects.lean` is the Lean half.
 * Also the hook-defaults guard of KD7 (docs/REWRITE-2-PROPOSAL.md), in both languages.
 *
 * Dispatch guards see matches and miss effects: nine completers passed guards 1 and 2. So this scan reads who calls the
 * effect primitives, and which state fields a spread update writes. Liveness is by field name, which is coarser than the
 * Lean scan's per-structure reading, because a TypeScript property name is shared across interfaces.
 */
import {
  closeOf,
  emptyInputFinding,
  finding,
  isJustified,
  leanDeclarations,
  TokenKind,
  type KernelTree,
  type Source,
  type Token,
} from "./kernel-guard-scan.ts";

const kernelPrefix = "packages/kernel/src/";

/** An effect primitive and the modules that may call it (`state` always may, because it defines them). */
type CallRule = Readonly<{ name: string; callers: readonly string[]; label: string }>;

const callRules: readonly CallRule[] = [
  { name: "emit", callers: ["feature/flow"], label: "flow tokens are emitted only by Flow" },
  { name: "deferBegins", callers: ["feature/multi-instance"], label: "deferred begins are stacked only by MultiInstance" },
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
const pipelineHooks = new Set(["leave", "writeOutputs", "completed", "outflow", "instanceCompleted", "handlerCompleted", "handlerEnded",
  "completeScope", "completeCall", "completeBody", "cancelled", "written"]);

const stateFieldWriters: Readonly<Record<string, readonly string[]>> = {
  tokens: ["state", "step"],
  occurrences: ["state", "step"],
  activations: ["state", "step"],
  variables: ["state"],
  writes: ["state", "step"],
  draft: ["state", "step", "hooks"],
};

function moduleOf(source: Source): string {
  return source.file.slice(kernelPrefix.length).replace(/\.ts$/u, "");
}

/** Whether `module` is `writer` or one of its sub-modules, as the Lean rule's name prefix reads it (`allowedFor`). */
function within(module: string, writer: string): boolean {
  return module === writer || module.startsWith(`${writer}/`);
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
      if (within(module, "state") && tokens[i - 1]?.text === "function") declared.add(token.text);
      const rule = callRules.find((candidate) => candidate.name === token.text);
      if (rule !== undefined && isCall && tokens[i - 1]?.text !== "function") {
        if (rule.callers.some((writer) => within(module, writer))) called.add(rule.name);
        else if (!within(module, "state") && !isJustified(source, token.line, 17)) {
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
          if (depth === 0 && allowed !== undefined && tokens[k + 1]?.text === ":" && !allowed.some((writer) => within(module, writer)) && !isJustified(source, tokens[k]?.line ?? 0, 17)) {
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

function isCodec(file: string): boolean {
  return file.startsWith(`${kernelPrefix}il/codec`);
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

/**
 * Guard 19: every IL field is read by a non-codec module (an admission refusal reads it too). A helper in the IL type
 * modules reads a field as the Lean half counts a `Kernel.IL.Types` function, but there only a member access counts:
 * the declarations `readonly x:` and `{ x:` share the shorthand and destructuring tokens.
 */
export function fieldLivenessFindings(tree: KernelTree): string[] {
  const ilFiles = tree.typeScript.filter((source) => isIlTypes(source.file));
  if (!ilFiles.some((source) => source.file === `${kernelPrefix}il/types.ts`)) return [emptyInputFinding(19, "packages/kernel/src/il/types.ts")];
  const fields = ilFiles.flatMap((il) => [...ilFieldNames(il)].map(([field, line]) => [field, il, line] as const));
  if (fields.length === 0) return [emptyInputFinding(19, "IL interface fields")];
  const readers = tree.typeScript.filter((source) => !isCodec(source.file));
  const read = new Set<string>();
  for (const source of readers) {
    const { tokens } = source;
    const declares = isIlTypes(source.file);
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined || token.kind !== TokenKind.Word) continue;
      if (tokens[i - 1]?.text === "." || tokens[i - 1]?.text === "?.") read.add(token.text);
      if (!declares && (tokens[i - 1]?.text === "{" || tokens[i - 1]?.text === ",")) {
        const next = tokens[i + 1]?.text;
        if (next === "," || next === "}" || next === ":") read.add(token.text);
      }
    }
  }
  return fields.flatMap(([field, il, line]) => read.has(field) || isJustified(il, line, 19)
    ? []
    : [finding(19, il, line, `IL field ${field} is read by no non-codec module and refused by no admission module`)]);
}

type Field = Readonly<{ name: string; line: number; value: readonly Token[] }>;

/**
 * The fields of the record the bracket at `open` opens: each name at depth one that starts a line or follows `{` or `,`
 * and is followed by `separator` (`:` in a TypeScript object, `:=` in a Lean structure instance), with its value's tokens.
 */
function recordFields(tokens: readonly Token[], open: number, separator: string): Field[] {
  const close = closeOf(tokens, open);
  const starts: number[] = [];
  let depth = 0;
  for (let k = open + 1; k < close - 1; k += 1) {
    const token = tokens[k];
    if (token === undefined) break;
    const previous = tokens[k - 1];
    const leads = previous?.text === "{" || previous?.text === "," || previous?.line !== token.line;
    if (depth === 0 && token.kind === TokenKind.Word && tokens[k + 1]?.text === separator && leads) starts.push(k);
    if (token.kind === TokenKind.Punct && ["(", "[", "{", "⟨"].includes(token.text)) depth += 1;
    if (token.kind === TokenKind.Punct && [")", "]", "}", "⟩"].includes(token.text)) depth -= 1;
  }
  return starts.map((start, index) => ({
    name: tokens[start]?.text ?? "",
    line: tokens[start]?.line ?? 0,
    value: tokens.slice(start + 2, starts[index + 1] ?? close - 1),
  }));
}

/** The fields of the Lean `structure Hooks where` block: each name in the field column followed by `:`, with its
 * type and default value. */
function leanStructureFields(source: Source, name: string): Field[] | null {
  const declaration = leanDeclarations(source.tokens).find((candidate) => candidate.kind === "structure" && candidate.name === name);
  if (declaration === undefined) return null;
  const tokens = source.tokens.slice(declaration.tokenStart, declaration.tokenEnd);
  const column = tokens.find((token, index) => index > 0 && token.line > (tokens[0]?.line ?? 0))?.column;
  const starts = tokens.flatMap((token, index) =>
    token.column === column && token.kind === TokenKind.Word && tokens[index + 1]?.text === ":" ? [index] : []);
  return starts.map((start, index) => ({
    name: tokens[start]?.text ?? "",
    line: tokens[start]?.line ?? 0,
    value: tokens.slice(start + 2, starts[index + 1] ?? tokens.length),
  }));
}

/** The record a declaration binds: the first `{` after `binder` in `source`, read as a record literal. */
function boundRecord(source: Source, binder: (tokens: readonly Token[], index: number) => boolean, separator: string): Field[] | null {
  const { tokens } = source;
  const at = tokens.findIndex((_, index) => binder(tokens, index));
  if (at === -1) return null;
  const open = tokens.findIndex((token, index) => index > at && token.text === "{");
  return open === -1 ? null : recordFields(tokens, open, separator);
}

/** Whether a default fails as an unregistered mechanism: `refuse`, or the invariant failure `select`, `correlates` and
 * `delivered` return directly (`.invariant` in Lean, `SemanticCause.Invariant` in TypeScript). */
const fails = (field: Field): boolean => field.value.some((token, index, value) =>
  token.text === "refuse" || token.text === ".invariant" ||
  (token.text === "SemanticCause" && value[index + 1]?.text === "." && value[index + 2]?.text === "Invariant"));

/**
 * KD7's hook defaults: the registry fills every `Hooks` field whose default fails, the 34 transition and input hooks,
 * so no failing default runs in production. The notifications' no-op and the queries' absent-feature answers are
 * outside this guard; which defaults the architecture promises is owner item OD2 (1).
 */
export function hookDefaultFindings(tree: KernelTree): string[] {
  const label = "KD7 hook defaults";
  const lean = (file: string) => tree.lean.find((source) => source.file === file);
  const typeScript = (file: string) => tree.typeScript.find((source) => source.file === file);
  const leanHooks = lean("Kernel/Hooks.lean");
  const leanRegistry = lean("Kernel/Registry.lean");
  const tsHooks = typeScript(`${kernelPrefix}hooks.ts`);
  const tsRegistry = typeScript(`${kernelPrefix}registry.ts`);
  const pairs: ReadonlyArray<Readonly<{ defaults: Field[] | null; filled: Field[] | null; registry: Source | undefined; what: string }>> = [
    {
      defaults: leanHooks === undefined ? null : leanStructureFields(leanHooks, "Hooks"),
      filled: leanRegistry === undefined ? null : boundRecord(leanRegistry,
        (tokens, index) => tokens[index]?.text === "def" && tokens[index + 1]?.text === "hooks" && tokens[index]?.column === 0, ":="),
      registry: leanRegistry,
      what: "Lean `structure Hooks` and `Registry.hooks`",
    },
    {
      defaults: tsHooks === undefined ? null : boundRecord(tsHooks,
        (tokens, index) => tokens[index]?.text === "const" && tokens[index + 1]?.text === "defaultHooks", ":"),
      filled: tsRegistry === undefined ? null : boundRecord(tsRegistry,
        (tokens, index) => tokens[index]?.text === "const" && tokens[index + 1]?.text === "hooks", ":"),
      registry: tsRegistry,
      what: "TypeScript `defaultHooks` and `registry.ts#hooks`",
    },
  ];
  return pairs.flatMap(({ defaults, filled, registry, what }) => {
    const failing = (defaults ?? []).filter(fails);
    if (failing.length === 0 || filled === null || registry === undefined) return [`${label}: read no ${what}, so the guard read nothing`];
    const names = new Set(filled.map((field) => field.name));
    return failing.flatMap((field) => names.has(field.name)
      ? []
      : [`${label} ${registry.file}: the registry leaves ${field.name} to its failing default, which would run in production`]);
  });
}

/** The body of each top-level `function NAME` of `source`, as token ranges `[open, close)`. */
function functionBodies(source: Source): Map<string, readonly [number, number]> {
  const bodies = new Map<string, readonly [number, number]>();
  const { tokens } = source;
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (tokens[i]?.text !== "function" || tokens[i + 1]?.kind !== TokenKind.Word) continue;
    let open = closeOf(tokens, i + 2);
    while (open < tokens.length && tokens[open]?.text !== "{") open += 1;
    bodies.set(tokens[i + 1]?.text ?? "", [open, closeOf(tokens, open)]);
  }
  return bodies;
}

/** The member names `names` in the order `tokens[from, to)` first reads them, as `.name` or as a call `name(`. */
function firstReads(tokens: readonly Token[], [from, to]: readonly [number, number], names: readonly string[]): string[] {
  const seen: string[] = [];
  for (let i = from; i < to; i += 1) {
    const text = tokens[i]?.text ?? "";
    const read = tokens[i - 1]?.text === "." || tokens[i + 1]?.text === "(";
    if (read && names.includes(text) && !seen.includes(text)) seen.push(text);
  }
  return seen;
}

const unitKeyFile = `${kernelPrefix}state/key.ts`;

/** A unit key comparator of KD7's key-order contract: the cached reads it makes first, then the decisive ones. */
const unitKeyContracts: ReadonlyArray<Readonly<{ comparator: string; cached: readonly string[]; decisive: readonly string[] }>> = [
  { comparator: "compareUnitKey", cached: ["depth", "fingerprint"], decisive: ["compareUnitRoot", "comparePath"] },
  { comparator: "sameUnitKey", cached: [], decisive: ["compareUnitKey"] },
  { comparator: "breadthUnitKey", cached: ["depth"], decisive: ["compareUnitRoot", "sameNode", "meet"] },
];

/**
 * The TypeScript halves of KD7's spine rules for the closure's unit keys (DC4, DC20; `scripts/kernel-effects.lean` holds
 * the Lean halves): a unit key node, the only kernel value with a `jump` or a `fingerprint`, is built only by
 * `unitRoot` and `pushUnit`, so its cached depth and fingerprint are its path's by those two alone; and each unit key
 * comparator reads the fixed-size cached fields, in order, before the root or the path, which decide last.
 */
export function unitKeyFindings(tree: KernelTree): string[] {
  const label = "KD7 unit keys";
  const keys = tree.typeScript.find((source) => source.file === unitKeyFile);
  if (keys === undefined) return [`${label}: read no ${unitKeyFile}, so the guard read nothing`];
  const findings: string[] = [];
  const builders = functionBodies(keys);
  let built = 0;
  for (const source of tree.typeScript) {
    const { tokens } = source;
    for (let i = 1; i + 1 < tokens.length; i += 1) {
      const text = tokens[i]?.text;
      if ((text !== "jump" && text !== "fingerprint") || tokens[i + 1]?.text !== ":") continue;
      if (tokens[i - 1]?.text !== "{" && tokens[i - 1]?.text !== ",") continue;
      const inBuilder = source === keys && ["unitRoot", "pushUnit"].some((name) => {
        const body = builders.get(name);
        return body !== undefined && body[0] < i && i < body[1];
      });
      if (inBuilder) built += 1;
      else findings.push(`${label} ${source.file}:${tokens[i]?.line}: builds a unit key node outside unitRoot and pushUnit`);
    }
  }
  if (built === 0) findings.push(`${label}: unitRoot and pushUnit build no unit key node, so the builder rule read nothing`);
  for (const { comparator, cached, decisive } of unitKeyContracts) {
    const body = builders.get(comparator);
    if (body === undefined) {
      findings.push(`${label}: ${comparator} is not defined in ${unitKeyFile}, so its key-order contract read nothing`);
      continue;
    }
    const reads = firstReads(keys.tokens, body, [...cached, ...decisive]);
    if (cached.some((name, index) => reads[index] !== name)) {
      findings.push(`${label} ${comparator}: reads ${reads.join(", ")}, not its cached fields ${cached.join(", ")} first`);
    } else if (reads.length === cached.length) {
      findings.push(`${label} ${comparator}: reads none of ${decisive.join(", ")} last`);
    }
  }
  return findings;
}

/** A use of the run log or of a unit-keyed map's order that only the named functions of one module may make. */
type OwnedUse = Readonly<{ what: string; owners: Readonly<Record<string, readonly string[]>>; at: (tokens: readonly Token[], index: number) => boolean }>;

const ownedUses: readonly OwnedUse[] = [
  {
    what: "reads the run log through runPosition outside orderKey and byRun",
    owners: { "step/order": ["orderKey"], "step/commit": ["byRun"] },
    at: (tokens, index) => tokens[index]?.text === "runPosition" && tokens[index + 1]?.text === "(" &&
      tokens[index - 1]?.text !== "function",
  },
  {
    what: "reads the run log's positions outside runRecord and runPosition",
    owners: { "step/order": ["runRecord", "runPosition"] },
    at: (tokens, index) => tokens[index]?.text === "positions" && tokens[index - 1]?.text === ".",
  },
  {
    // `OrderedMap` holds only the closure's unit-keyed families, whose entry order is their key order, no order of entry.
    what: "reads the iteration order of a unit-keyed map outside the choices, the commit and allTokens",
    owners: { "step/order": ["earliest", "latest", "firstBreadth"], "step/commit": ["byRun"], state: ["allTokens"] },
    at: (tokens, index) => tokens[index]?.text === "orderedEntries" && tokens[index + 1]?.text === "(" &&
      tokens[index - 1]?.text !== "function",
  },
];

/** The innermost top-level function of `bodies` whose body holds token `index`. */
function enclosing(bodies: Map<string, readonly [number, number]>, index: number): string | undefined {
  let found: string | undefined;
  let width = Number.POSITIVE_INFINITY;
  for (const [name, [open, close]] of bodies) {
    if (open < index && index < close && close - open < width) {
      found = name;
      width = close - open;
    }
  }
  return found;
}

/**
 * The TypeScript halves of KD7's run-log rules (DC4; `scripts/kernel-effects.lean` holds the Lean halves): the run log is
 * read only through `runPosition`, which only the token order (`orderKey`) and the commit (`byRun`) call, and its
 * positions only by its reader and writer, so no unit's body reads when another ran; and no function but the choices
 * that break every tie by the key, the commit's sort by position then key and the queued tokens' multiset view reads
 * the iteration order of a unit-keyed map.
 */
export function runLogFindings(tree: KernelTree): string[] {
  const label = "KD7 run log";
  const findings: string[] = [];
  const owned = ownedUses.map(() => 0);
  for (const source of tree.typeScript) {
    if (!source.file.startsWith(kernelPrefix) || source.file === `${kernelPrefix}state/map.ts`) continue;
    const module = moduleOf(source);
    const bodies = functionBodies(source);
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      ownedUses.forEach((use, rule) => {
        if (!use.at(tokens, i)) return;
        const within = enclosing(bodies, i);
        if (within !== undefined && (use.owners[module] ?? []).includes(within)) owned[rule] = (owned[rule] ?? 0) + 1;
        else findings.push(`${label} ${source.file}:${tokens[i]?.line}: ${use.what}`);
      });
    }
  }
  ownedUses.forEach((use, rule) => {
    if (owned[rule] === 0) findings.push(`${label}: no owner ${use.what.replace(/ outside .*$/u, "")}, so the rule read nothing`);
  });
  return findings;
}
