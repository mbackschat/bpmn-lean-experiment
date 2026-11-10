/**
 * TypeScript halves of closed dispatch and no catch-all (guards 1 and 2), mirror enumerations in both languages
 * (guard 3) and the seam fan-out budget (guard 18) of docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation.
 *
 * The owner table is read from `scripts/kernel-dispatch.lean`, the Lean guard's one copy of it, so the two languages
 * cannot drift (and guard 3 forbids a second copy). A Lean type maps to the TypeScript enum of the same name plus an
 * optional `Tag` suffix; a Lean owner module `Kernel.Feature.MultiInstance` maps to `feature/multi-instance.ts`.
 * The match-site constants of guard 18 live in `tsSiteBudget` below and move only by owner decision.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  allowedByOwner,
  closeOf,
  emptyInputFinding,
  finding,
  isJustified,
  leanDeclarations,
  leanInductives,
  leanModuleToTypeScriptPath,
  pairKeyOf,
  TokenKind,
  typeScriptEnums,
  type KernelTree,
  type Source,
  type TypeScriptEnum,
} from "./kernel-guard-scan.ts";

const kernelPrefix = "packages/kernel/src/";

/**
 * Guard 18: maximum match sites per guarded TypeScript enum across the kernel, codecs excluded. Values are the counts
 * measured 2026-11-08 on the transcription of the committed Lean kernel, each at most the Lean budget of its type in
 * `scripts/kernel-effects.lean`; they move only by owner decision.
 */
export const tsSiteBudget: Readonly<Record<string, number>> = {
  ElementTag: 12,
  EventRoleTag: 6,
  InputTag: 1,
  SignalTag: 1,
  ContinuationTag: 3,
  RaisedTag: 5,
  OpenKindTag: 1,
  TriggerTag: 10,
  WorkTag: 10,
  GatewayKindTag: 3,
  ScopeKindTag: 6,
  ThrowTag: 3,
  MultiInstanceMode: 2,
  // The JUEL types (M2), measured 2026-11-10; the Lean budgets add one each for a derived `Repr`.
  JuelNodeTag: 2, // admission, evaluator
  JuelBinary: 2, // admission `juelOperator`, evaluator `operate`; re-measured 2026-11-10 once guard 2's owner clause ran
  JuelUnary: 1, // evaluator `unary`
  JuelCallTag: 2, // admission, evaluator
  JuelMethod: 4, // the String, List and Map methods, and the argument-count table
};

export type GuardedType = Readonly<{ lean: string; enumName: string | null; owners: readonly string[]; leanOwners: readonly string[] }>;

/** `Kernel.Element` and the owners the Lean guard lists, read from that guard's own table. */
export function guardedTypes(tree: KernelTree): { types: GuardedType[]; findings: string[] } {
  let text = "";
  try {
    text = readFileSync(path.join(tree.root, "scripts", "kernel-dispatch.lean"), "utf8");
  } catch {
    return { types: [], findings: [emptyInputFinding(1, "guarded types (scripts/kernel-dispatch.lean)")] };
  }
  const entries = [...text.matchAll(/\(`Kernel\.(\w+),\s*\[([^\]]*)\]\)/gu)];
  if (entries.length === 0) return { types: [], findings: [emptyInputFinding(1, "guarded types in kernel-dispatch.lean's owners table")] };
  const enums = typeScriptEnums(tree.typeScript);
  const types = entries.map((entry) => {
    const lean = entry[1] ?? "";
    const leanOwners = [...(entry[2] ?? "").matchAll(/`([\w.]+)/gu)].map((owner) => owner[1] ?? "");
    const owners = leanOwners.map(leanModuleToTypeScriptPath);
    const enumName = enums.has(`${lean}Tag`) ? `${lean}Tag` : enums.has(lean) ? lean : null;
    return { lean, enumName, owners, leanOwners };
  });
  return { types, findings: [] };
}

function moduleKey(source: Source): string {
  return source.file.startsWith(kernelPrefix) ? source.file.slice(kernelPrefix.length).replace(/\.ts$/u, "") : `reader:${source.file}`;
}

function allowed(source: Source, type: GuardedType, definition: TypeScriptEnum | undefined): boolean {
  const key = moduleKey(source);
  const defining = definition === undefined ? "" : definition.file.slice(kernelPrefix.length).replace(/\.ts$/u, "");
  return allowedByOwner(key, ["il/codec", defining, ...type.owners]);
}

type SwitchSite = Readonly<{ line: number; enums: ReadonlySet<string>; hasDefault: boolean; endsAssertNever: boolean }>;

export function switchSites(source: Source, enumNames: ReadonlySet<string>): SwitchSite[] {
  const { tokens } = source;
  const sites: SwitchSite[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i]?.text !== "switch" || tokens[i + 1]?.text !== "(") continue;
    const open = closeOf(tokens, i + 1);
    if (tokens[open]?.text !== "{") continue;
    const close = closeOf(tokens, open);
    const enums = new Set<string>();
    let hasDefault = false;
    let depth = 0;
    for (let k = open + 1; k < close - 1; k += 1) {
      const text = tokens[k]?.text ?? "";
      if (tokens[k]?.kind === TokenKind.Punct && (text === "{" || text === "(" || text === "[")) depth += 1;
      if (tokens[k]?.kind === TokenKind.Punct && (text === "}" || text === ")" || text === "]")) depth -= 1;
      if (depth !== 0) continue;
      if (text === "case" && enumNames.has(tokens[k + 1]?.text ?? "") && tokens[k + 2]?.text === ".") enums.add(tokens[k + 1]?.text ?? "");
      if (text === "default" && tokens[k + 1]?.text === ":") hasDefault = true;
    }
    const [next, afterNext] = [tokens[close]?.text, tokens[close + 1]?.text];
    const endsAssertNever = (next === "assertNever") || ((next === "return" || next === "throw") && afterNext === "assertNever");
    sites.push({ line: tokens[i]?.line ?? 0, enums, hasDefault, endsAssertNever });
  }
  return sites;
}

/** Guard 1 (TypeScript): only an owner switches on, compares, tables or filters a guarded type. */
export function closedDispatchFindings(tree: KernelTree): string[] {
  const { types, findings } = guardedTypes(tree);
  if (types.length === 0) return findings;
  if (tree.typeScript.length === 0) return [emptyInputFinding(1, "TypeScript kernel modules")];
  const enums = typeScriptEnums(tree.typeScript);
  for (const type of types) {
    if (type.enumName === null) findings.push(`G1: guarded type ${type.lean} has no TypeScript enum`);
  }
  const sources = [...tree.typeScript, ...tree.reader];
  let sawOwnerSwitch = false;
  const enumNames = new Set([...enums.keys()]);
  const ownerModules = new Set(types.flatMap((type) => {
    const definition = type.enumName === null ? undefined : enums.get(type.enumName);
    return [...type.owners, ...(definition === undefined ? [] : [definition.file.slice(kernelPrefix.length).replace(/\.ts$/u, "")]), "il/codec"];
  }));
  for (const source of sources) {
    const { tokens } = source;
    const isAnyOwner = allowedByOwner(moduleKey(source), [...ownerModules]);
    const sites = switchSites(source, enumNames);
    for (const type of types) {
      if (type.enumName === null) continue;
      const definition = enums.get(type.enumName);
      if (allowed(source, type, definition)) {
        if (type.enumName === "ElementTag" && moduleKey(source) === "step" && sites.some((site) => site.enums.has("ElementTag"))) sawOwnerSwitch = true;
        continue;
      }
      for (const site of sites) {
        if (site.enums.has(type.enumName) && !isJustified(source, site.line, 1)) {
          findings.push(finding(1, source, site.line, `switch on guarded ${type.enumName} outside its owner`));
        }
      }
      for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token?.text === type.enumName && tokens[i + 1]?.text === "." && tokens[i + 2]?.kind === TokenKind.Word) {
          const before = tokens[i - 1]?.text ?? "";
          const after = tokens[i + 3]?.text ?? "";
          const comparison = new Set(["===", "!==", "==", "!="]);
          if ((comparison.has(before) || comparison.has(after)) && !isJustified(source, token.line, 1)) {
            findings.push(finding(1, source, token.line, `compares guarded ${type.enumName} member outside its owner`));
          }
        }
        if (token?.text === "Record" && tokens[i + 1]?.text === "<" && tokens[i + 2]?.text === type.enumName && !isJustified(source, token.line, 1)) {
          findings.push(finding(1, source, token.line, `Record table over guarded ${type.enumName} outside its owner`));
        }
      }
    }
    // The reader's own kinds are BPMN source vocabulary, not guarded kernel kinds, so these two token shapes stop at the kernel.
    if (isAnyOwner || !source.file.startsWith(kernelPrefix)) continue;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined) continue;
      if (token.text === "in" && tokens[i - 1]?.kind === TokenKind.String && !isJustified(source, token.line, 1)) {
        findings.push(finding(1, source, token.line, `\`in\` narrowing on a discriminant outside a dispatch owner`));
      }
      if (token.text === "filter" && tokens[i + 1]?.text === "(") {
        const close = closeOf(tokens, i + 1);
        const body = tokens.slice(i + 2, close - 1);
        if (body.some((inner) => inner.text === "tag" || inner.text === "kind") && !isJustified(source, token.line, 1)) {
          findings.push(finding(1, source, token.line, "`filter` on a kind or tag outside a dispatch owner"));
        }
      }
    }
  }
  if (!sawOwnerSwitch) findings.push("G1: the scan saw no switch on ElementTag in step.ts, so it read nothing");
  return findings;
}

/** Guard 2 (TypeScript): every switch over a kernel or reader enum has no `default:` and ends in `assertNever`. */
export function noCatchAllFindings(tree: KernelTree): string[] {
  const sources = [...tree.typeScript, ...tree.reader];
  if (sources.length === 0) return [emptyInputFinding(2, "TypeScript kernel or reader modules")];
  const enumNames = new Set(typeScriptEnums(sources).keys());
  const findings: string[] = [];
  let sawEnumSwitch = false;
  for (const source of sources) {
    for (const site of switchSites(source, enumNames)) {
      if (site.enums.size === 0) continue;
      sawEnumSwitch = true;
      if (isJustified(source, site.line, 2)) continue;
      const names = [...site.enums].join(", ");
      if (site.hasDefault) findings.push(finding(2, source, site.line, `switch over ${names} has a default arm`));
      if (!site.endsAssertNever) findings.push(finding(2, source, site.line, `switch over ${names} does not end in assertNever`));
    }
  }
  if (!sawEnumSwitch) findings.push(emptyInputFinding(2, "switch over a kernel enum"));
  return [...findings, ...ownerEqualityFindings(tree)];
}

/** Guard 2's owner clause: an equality test on a guarded member is a hidden catch-all for every member it leaves out,
 * so an owner dispatches by an exhaustive `switch` or a `Record` table instead; guard 1 covers the non-owners. */
function ownerEqualityFindings(tree: KernelTree): string[] {
  const { types } = guardedTypes(tree);
  const enums = typeScriptEnums(tree.typeScript);
  const comparison = new Set(["===", "!==", "==", "!="]);
  const findings: string[] = [];
  for (const source of [...tree.typeScript, ...tree.reader]) {
    const { tokens } = source;
    for (const type of types) {
      if (type.enumName === null || !allowed(source, type, enums.get(type.enumName))) continue;
      for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token?.text !== type.enumName || tokens[i + 1]?.text !== "." || tokens[i + 2]?.kind !== TokenKind.Word) continue;
        if ((comparison.has(tokens[i - 1]?.text ?? "") || comparison.has(tokens[i + 3]?.text ?? "")) && !isJustified(source, token.line, 2)) {
          findings.push(finding(2, source, token.line, `equality test on guarded ${type.enumName} member inside its owner`));
        }
      }
    }
  }
  return findings;
}

/** Guard 18: match sites (enum switches and `Record` tables) per guarded enum, codec modules excluded. */
export function tsMatchSiteCounts(tree: KernelTree): Map<string, number> {
  const enums = typeScriptEnums(tree.typeScript);
  const { types } = guardedTypes(tree);
  const enumNames = new Set(enums.keys());
  const counts = new Map<string, number>(types.flatMap((type) => (type.enumName === null ? [] : [[type.enumName, 0] as const])));
  for (const source of tree.typeScript) {
    if (allowedByOwner(moduleKey(source), ["il/codec"])) continue;
    for (const site of switchSites(source, enumNames)) {
      for (const name of site.enums) if (counts.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i]?.text === "Record" && tokens[i + 1]?.text === "<" && counts.has(tokens[i + 2]?.text ?? "")) {
        const name = tokens[i + 2]?.text ?? "";
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Guard 18: fan-out above the constant budget; a new mechanism that needs another site changes the seam, not this. */
export function fanOutFindings(counts: ReadonlyMap<string, number>, budget: Readonly<Record<string, number>> = tsSiteBudget): string[] {
  if (counts.size === 0) return [emptyInputFinding(18, "guarded match sites")];
  const findings: string[] = [];
  for (const [name, count] of [...counts].sort(([left], [right]) => (left < right ? -1 : 1))) {
    const limit = budget[name];
    if (limit === undefined) findings.push(`G18: guarded ${name} has no site budget; adding one is an owner decision`);
    else if (count > limit) findings.push(`G18: ${count} match sites on ${name}, above its budget of ${limit}`);
  }
  return findings;
}

export type Commit = Readonly<{ sha: string; subject: string; files: readonly string[] }>;

/** The scope of a Conventional Commits subject, `null` when it has none. */
export function commitScope(subject: string): string | null {
  return /^\w+\(([^)]+)\)!?:/u.exec(subject)?.[1] ?? null;
}

/** The kernel executable modules a commit changes, a Lean and TypeScript pair counting once. */
export function kernelModulesChanged(files: readonly string[]): Set<string> {
  return new Set(files.flatMap((file) => {
    const key = pairKeyOf(file);
    return key === null ? [] : [key];
  }));
}

/** Guard 18: a commit not scoped `kernel-shape` changes at most eight kernel executable modules. */
export function commitScopeFindings(commits: readonly Commit[], maximum = 8): string[] {
  if (commits.length === 0) return [emptyInputFinding(18, "commits")];
  return commits.flatMap((commit) => {
    if (commitScope(commit.subject) === "kernel-shape") return [];
    const modules = kernelModulesChanged(commit.files);
    return modules.size > maximum
      ? [`G18 ${commit.sha.slice(0, 8)} ${commit.subject}: changes ${modules.size} kernel modules, above ${maximum}; only a kernel-shape commit may`]
      : [];
  });
}

/** The classifier shape guard 3 forbids: an `is*` predicate on a guarded union type outside its owner. */
function classifierFindings(tree: KernelTree, types: readonly GuardedType[], enums: ReadonlyMap<string, TypeScriptEnum>): string[] {
  const findings: string[] = [];
  const unionNames = new Map<string, GuardedType>();
  for (const type of types) {
    if (type.enumName !== null) unionNames.set(type.enumName.replace(/Tag$/u, ""), type);
  }
  for (const source of tree.typeScript) {
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      const isFunction = tokens[i]?.text === "function" && /^is[A-Z]/u.test(tokens[i + 1]?.text ?? "") && tokens[i + 2]?.text === "(";
      const isArrow = tokens[i]?.text === "const" && /^is[A-Z]/u.test(tokens[i + 1]?.text ?? "") && tokens[i + 2]?.text === "=" && tokens[i + 3]?.text === "(";
      if (!isFunction && !isArrow) continue;
      const open = isFunction ? i + 2 : i + 3;
      const close = closeOf(tokens, open);
      const parameterTypes = tokens.slice(open, close).filter((token) => unionNames.has(token.text));
      for (const parameter of parameterTypes) {
        const type = unionNames.get(parameter.text);
        if (type === undefined) continue;
        const definition = type.enumName === null ? undefined : enums.get(type.enumName);
        if (!allowed(source, type, definition) && !isJustified(source, tokens[i]?.line ?? 0, 3)) {
          findings.push(finding(3, source, tokens[i]?.line ?? 0, `classifier ${tokens[i + 1]?.text} over guarded ${parameter.text} outside its owner`));
        }
      }
    }
  }
  return findings;
}

/**
 * The share rule guard 3 uses for a second enumeration: three common members. Two is common vocabulary rather than a
 * copy: `Fired` and `DeliveryTrigger` share only `timer` and `message` with `Trigger` and carry their own payloads.
 */
function mirrors(shared: number): boolean {
  return shared >= 3;
}

function typeScriptMirrorFindings(tree: KernelTree, types: readonly GuardedType[]): string[] {
  const enums = typeScriptEnums(tree.typeScript);
  const findings = classifierFindings(tree, types, enums);
  const guardedEnums = types.flatMap((type) => (type.enumName === null ? [] : [type.enumName]));
  for (const candidate of enums.values()) {
    // A guarded type next to another guarded type is two owned vocabularies (Trigger, Throw and Raised share BPMN's event names).
    if (guardedEnums.includes(candidate.name)) continue;
    for (const guarded of guardedEnums) {
      const definition = enums.get(guarded);
      if (definition === undefined) continue;
      const guardedMembers = new Set([...definition.members].flatMap(([name, value]) => [name.toLowerCase(), value.toLowerCase()]));
      const shared = [...candidate.members].filter(([name, value]) => guardedMembers.has(name.toLowerCase()) || guardedMembers.has(value.toLowerCase())).length;
      if (mirrors(shared) && !isJustified(tree.typeScript.find((source) => source.file === candidate.file) as Source, candidate.line, 3)) {
        findings.push(`G3 ${candidate.file}:${candidate.line}: enum ${candidate.name} mirrors guarded ${guarded} (${shared} shared members)`);
      }
    }
  }
  for (const source of tree.typeScript) {
    const { tokens } = source;
    for (const guarded of types) {
      if (guarded.enumName === null) continue;
      const definition = enums.get(guarded.enumName);
      if (allowed(source, guarded, definition)) continue;
      for (let i = 0; i < tokens.length; i += 1) {
        if (tokens[i]?.text !== "[") continue;
        const close = closeOf(tokens, i);
        let members = 0;
        let depth = 0;
        for (let k = i + 1; k < close - 1; k += 1) {
          const text = tokens[k]?.text ?? "";
          if (text === "(" || text === "[" || text === "{") depth += 1;
          if (text === ")" || text === "]" || text === "}") depth -= 1;
          if (depth === 0 && text === guarded.enumName && tokens[k + 1]?.text === ".") members += 1;
        }
        if (members >= 2 && !isJustified(source, tokens[i]?.line ?? 0, 3)) {
          findings.push(finding(3, source, tokens[i]?.line ?? 0, `allowlist of ${members} ${guarded.enumName} members outside its owner`));
        }
      }
    }
  }
  return findings;
}

/** `Kernel.Feature.Work` as a module path in the Lean kernel, for owner lookups. */
function leanModuleOf(file: string): string {
  return file.replace(/\.lean$/u, "").split("/").join(".");
}

function leanMirrorFindings(tree: KernelTree, types: readonly GuardedType[]): string[] {
  const findings: string[] = [];
  const guardedCtors = new Map<string, Readonly<{ ctors: Set<string>; definer: string; owners: readonly string[] }>>();
  const inductivesBySource = tree.lean.map((source) => [source, leanInductives(source)] as const);
  for (const [source, inductives] of inductivesBySource) {
    for (const [name, constructors] of inductives) {
      const type = types.find((candidate) => candidate.lean === name);
      if (type !== undefined) {
        guardedCtors.set(name, { ctors: new Set(constructors.map((ctor) => ctor.name)), definer: leanModuleOf(source.file), owners: type.leanOwners });
      }
    }
  }
  const allowedLean = (file: string, owners: readonly string[], definer: string): boolean => {
    const module = leanModuleOf(file);
    return module === definer || module.startsWith("Kernel.IL.Codec") ||
      owners.some((owner) => module === owner || module.startsWith(`${owner}.`));
  };
  if (guardedCtors.size === 0) return [emptyInputFinding(3, "guarded Lean inductives")];
  for (const [source, inductives] of inductivesBySource) {
    for (const [name, constructors] of inductives) {
      if (guardedCtors.has(name)) continue;
      for (const [guarded, record] of guardedCtors) {
        // `InputTag` is `Input`'s own tag, the one the design's `WaitView.input` reads.
        if (name === `${guarded}Tag`) continue;
        const shared = constructors.filter((ctor) => record.ctors.has(ctor.name)).length;
        if (mirrors(shared) && !isJustified(source, constructors[0]?.line ?? 0, 3)) {
          findings.push(finding(3, source, constructors[0]?.line ?? 0, `inductive ${name} mirrors guarded ${guarded} (${shared} shared constructors)`));
        }
      }
    }
    const { tokens } = source;
    const ownersForGuarded = new Map([...guardedCtors].map(([name, record]) => [name, record]));
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i]?.text !== "[") continue;
      const close = closeOf(tokens, i);
      const words = tokens.slice(i + 1, close - 1).filter((token) => token.text.startsWith("."));
      if (words.length < 2 || words.some((word) => word.text.includes("." , 1))) continue;
      for (const [guarded, record] of ownersForGuarded) {
        const hits = words.filter((word) => record.ctors.has(word.text.slice(1))).length;
        if (hits === words.length && hits >= 2 && !allowedLean(source.file, record.owners, record.definer) && !isJustified(source, tokens[i]?.line ?? 0, 3)) {
          findings.push(finding(3, source, tokens[i]?.line ?? 0, `allowlist of ${hits} ${guarded} constructors outside its owner`));
        }
      }
    }
    for (const declaration of leanDeclarations(tokens)) {
      if (declaration.kind !== "def" || !/(?:^|\.)is[A-Z]/u.test(declaration.name)) continue;
      const header = tokens.slice(declaration.tokenStart, declaration.tokenEnd);
      const assign = header.findIndex((token) => token.text === ":=" || token.text === "|");
      const headerTypes = (assign === -1 ? header : header.slice(0, assign)).map((token) => token.text);
      for (const [guarded, record] of guardedCtors) {
        if (headerTypes.includes(guarded) &&
          !allowedLean(source.file, record.owners, record.definer) &&
          !isJustified(source, declaration.line, 3)) {
          findings.push(finding(3, source, declaration.line, `classifier ${declaration.name} over guarded ${guarded} outside its owner`));
        }
      }
    }
  }
  return findings;
}

/** Guard 3: no second enumeration, allowlist or classifier of a guarded kernel vocabulary type. */
export function mirrorEnumerationFindings(tree: KernelTree): string[] {
  const { types, findings } = guardedTypes(tree);
  if (types.length === 0) return findings;
  if (tree.lean.length === 0 || tree.typeScript.length === 0) return [emptyInputFinding(3, "kernel modules")];
  return [...findings, ...typeScriptMirrorFindings(tree, types), ...leanMirrorFindings(tree, types)];
}
