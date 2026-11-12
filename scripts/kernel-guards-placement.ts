/**
 * Source scans for bounded wire numbers (guard 11), proof placement (guard 6), shape (guard 9), single entry (guard 13),
 * discovery by convention (guard 14), the kernel's option and derivation limits (guard 15) and justified rules (guard 24) of
 * docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation, plus the size reports of guard 10.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  closeOf,
  emptyInputFinding,
  finding,
  isJustified,
  isLeanExecutable,
  leanDeclarations,
  leanInductives,
  TokenKind,
  tokenizeTypeScript,
  type KernelTree,
  type LeanDeclaration,
  type Source,
  type Token,
} from "./kernel-guard-scan.ts";

const kernelPrefix = "packages/kernel/src/";

const reductionTactics = new Set(["decide", "native_decide", "cbv"]);
const engineWord = /^(?:Kernel\.)?(?:Step|Run|Registry|AdmissionRegistry)\./u;

function featureFamily(file: string): string | null {
  return /^Kernel\/Feature\/([^/.]+)/u.exec(file)?.[1] ?? null;
}

/** `Kernel/Laws/Flow.lean` to `Flow`: the only module allowed to open that feature's bodies. */
function lawsFamily(file: string): string | null {
  return /^Kernel\/Laws\/([^/.]+)/u.exec(file)?.[1] ?? null;
}

function bodyMentionsEngine(tokens: readonly Token[], declaration: LeanDeclaration): boolean {
  return tokens.slice(declaration.tokenStart, declaration.tokenEnd).some((token) => token.kind === TokenKind.Word && engineWord.test(token.text));
}

/** Guard 6: proofs stay in `Laws` and `Proofs`, and nothing reduces the engine. */
export function proofPlacementFindings(tree: KernelTree): string[] {
  if (tree.lean.length === 0) return [emptyInputFinding(6, "Lean kernel modules")];
  const findings: string[] = [];
  const featureBodies = new Map<string, string>();
  for (const source of tree.lean) {
    const family = featureFamily(source.file);
    if (family === null) continue;
    for (const declaration of leanDeclarations(source.tokens)) {
      if (declaration.kind === "def" && declaration.name !== "") featureBodies.set(declaration.name, family);
    }
  }
  if (featureBodies.size === 0) findings.push(emptyInputFinding(6, "feature declarations under Kernel/Feature"));
  for (const source of tree.lean) {
    const { tokens } = source;
    const executable = isLeanExecutable(source.file);
    const ownLaws = lawsFamily(source.file);
    const report = (line: number, message: string): void => {
      if (!isJustified(source, line, 6)) findings.push(finding(6, source, line, message));
    };
    for (const declaration of leanDeclarations(tokens)) {
      if (executable && (declaration.kind === "theorem" || declaration.kind === "lemma")) {
        report(declaration.line, `${declaration.kind} ${declaration.name} in an executable module`);
      }
      const body = tokens.slice(declaration.tokenStart, declaration.tokenEnd);
      const engine = bodyMentionsEngine(tokens, declaration);
      for (const [index, token] of body.entries()) {
        if (token.kind !== TokenKind.Word) continue;
        // `decide (a < b)` is the Bool coercion an executable may use; only the argumentless tactic reduces.
        if (token.text === "decide" && (body[index + 1]?.text === "(" || body[index + 1]?.text === "<|")) continue;
        if (reductionTactics.has(token.text) && executable) report(token.line, `${token.text} in an executable module`);
        if ((reductionTactics.has(token.text) || token.text === "rfl") && engine) {
          report(token.line, `${token.text} reduces Step, Run or a registry in ${declaration.name}`);
        }
      }
    }
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined) continue;
      const opensFeature = (name: string): void => {
        const bare = name.split(".").at(-1) ?? name;
        const family = featureBodies.get(bare);
        if (family !== undefined && family !== ownLaws) report(token.line, `opens feature body ${bare} of ${family} outside Laws.${family}`);
      };
      if (token.text === "unfold") {
        for (let k = i + 1; tokens[k]?.line === token.line && tokens[k]?.kind === TokenKind.Word; k += 1) opensFeature(tokens[k]?.text ?? "");
      }
      if (token.text === "simp" || token.text === "simp_all") {
        let open = i + 1;
        if (tokens[open]?.text === "only") open += 1;
        if (tokens[open]?.text === "[") {
          const close = closeOf(tokens, open);
          for (const inner of tokens.slice(open + 1, close - 1)) if (inner.kind === TokenKind.Word) opensFeature(inner.text);
        }
      }
      if (token.kind === TokenKind.Punct && (token.text === "{" || token.text === "[")) {
        const close = closeOf(tokens, i);
        const lastLine = tokens[close - 1]?.line ?? token.line;
        if (lastLine - token.line + 1 > 50) report(token.line, `literal spans ${lastLine - token.line + 1} lines, above 50; finite examples run in the runner`);
      }
    }
  }
  return findings;
}

const patternPrefixes = new Set(["|", "fun", "λ", "let", "have", "obtain", "with", "intro", "rintro", "rcases"]);

function binders(tokens: readonly Token[], open: number): number {
  const close = closeOf(tokens, open);
  let count = 1;
  let depth = 0;
  for (let k = open + 1; k < close - 1; k += 1) {
    const text = tokens[k]?.text ?? "";
    if (tokens[k]?.kind === TokenKind.Punct && (text === "(" || text === "[" || text === "{" || text === "⟨")) depth += 1;
    if (tokens[k]?.kind === TokenKind.Punct && (text === ")" || text === "]" || text === "}" || text === "⟩")) depth -= 1;
    if (depth === 0 && text === ",") count += 1;
  }
  return count;
}

/** Guard 9: no anonymous-constructor pattern above four binders; no IL constructor beyond a header and a payload. */
export function shapeLimitFindings(tree: KernelTree): string[] {
  if (tree.lean.length === 0) return [emptyInputFinding(9, "Lean kernel modules")];
  const findings: string[] = [];
  for (const source of tree.lean) {
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i]?.text !== "⟨") continue;
      const previous = tokens[i - 1]?.text ?? "";
      if (!patternPrefixes.has(previous)) continue;
      const count = binders(tokens, i);
      const line = tokens[i]?.line ?? 0;
      if (count > 4 && !isJustified(source, line, 9)) findings.push(finding(9, source, line, `anonymous-constructor pattern with ${count} binders, above 4`));
    }
  }
  const ilFiles = tree.lean.filter((source) => source.file === "Kernel/IL/Types.lean" || source.file.startsWith("Kernel/IL/Types/"));
  if (!ilFiles.some((source) => source.file === "Kernel/IL/Types.lean")) return [...findings, emptyInputFinding(9, "Kernel/IL/Types.lean")];
  const shapes = ilFiles.map((il) => [il, leanInductives(il)] as const);
  if (shapes.every(([, inductives]) => inductives.size === 0)) findings.push(emptyInputFinding(9, "inductives in Kernel/IL/Types.lean"));
  for (const [il, inductives] of shapes) {
    for (const [name, constructors] of inductives) {
      for (const constructor of constructors) {
        if (constructor.fields > 2 && !isJustified(il, constructor.line, 9)) {
          findings.push(finding(9, il, constructor.line, `constructor ${name}.${constructor.name} has ${constructor.fields} fields, more than a header and a payload`));
        }
      }
    }
  }
  return findings;
}

export type FunctionSpan = Readonly<{ file: string; name: string; line: number; lines: number }>;

function typeScriptFunctions(source: Source): FunctionSpan[] {
  const { tokens } = source;
  const spans: FunctionSpan[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i]?.text !== "function" || tokens[i + 1]?.kind !== TokenKind.Word) continue;
    let k = i + 2;
    while (k < tokens.length && tokens[k]?.text !== "(") k += 1;
    k = closeOf(tokens, k);
    while (k < tokens.length && tokens[k]?.text !== "{" && tokens[k]?.text !== ";") {
      if (tokens[k]?.text === "(" || tokens[k]?.text === "[") k = closeOf(tokens, k);
      else k += 1;
    }
    if (tokens[k]?.text !== "{") continue;
    const close = closeOf(tokens, k);
    spans.push({ file: source.file, name: tokens[i + 1]?.text ?? "", line: tokens[i]?.line ?? 0, lines: (tokens[close - 1]?.line ?? 0) - (tokens[i]?.line ?? 0) + 1 });
  }
  return spans;
}

/** Guard 10's reports: every Lean declaration and TypeScript function above the given line count. */
export function longFunctions(tree: KernelTree, limit = 80): FunctionSpan[] {
  const lean = tree.lean.flatMap((source) => leanDeclarations(source.tokens)
    .filter((declaration) => declaration.kind === "def")
    .map((declaration) => ({ file: source.file, name: declaration.qualified, line: declaration.line, lines: declaration.endLine - declaration.line + 1 })));
  return [...lean, ...tree.typeScript.flatMap(typeScriptFunctions)].filter((span) => span.lines > limit);
}

const secondEvaluatorNames = /^(?:step|evaluate|evaluator|interpret|interpreter)$/u;
const programModeNames = /^(?:is|has|uses?)\w*(?:Mode|Definitions?|Profile)$|programMode|executionMode|modeOf/iu;

/** Guard 13: one step function, called by `Population`; no program-mode predicate; no second evaluator. */
export function singleEntryFindings(tree: KernelTree): string[] {
  const findings: string[] = [];
  if (tree.lean.length === 0 || tree.typeScript.length === 0) return [emptyInputFinding(13, "kernel modules")];
  const expectEntry = (source: Source | undefined, label: string, declared: (source: Source) => number, calls: (source: Source) => boolean, population: Source | undefined): void => {
    if (source === undefined || declared(source) !== 1) findings.push(`G13: ${label} does not declare exactly one step function`);
    if (population === undefined || !calls(population)) findings.push(`G13: ${label} population does not call the step function`);
  };
  const leanStep = tree.lean.find((source) => source.file === "Kernel/Step.lean");
  const leanPopulation = tree.lean.find((source) => source.file === "Kernel/Population.lean");
  expectEntry(leanStep, "Kernel.Step", (source) => leanDeclarations(source.tokens).filter((declaration) => declaration.name === "step").length,
    (source) => source.tokens.some((token) => token.text === "Step.step"), leanPopulation);
  const tsStep = tree.typeScript.find((source) => source.file === `${kernelPrefix}step.ts`);
  const tsPopulation = tree.typeScript.find((source) => source.file === `${kernelPrefix}population.ts`);
  expectEntry(tsStep, "step.ts", (source) => source.tokens.filter((token, index) => token.text === "step" && source.tokens[index - 1]?.text === "function").length,
    (source) => source.tokens.some((token, index) => token.text === "step" && source.tokens[index + 1]?.text === "("), tsPopulation);
  const secondEvaluatorHome = (file: string, name: string): boolean => {
    if (name === "step") return file === "Kernel/Step.lean" || file === `${kernelPrefix}step.ts`;
    return file === "Kernel/Feature/Data.lean" || file === `${kernelPrefix}feature/data.ts`;
  };
  for (const source of tree.lean) {
    for (const declaration of leanDeclarations(source.tokens)) {
      const bare = declaration.name.split(".").at(-1) ?? declaration.name;
      if (declaration.kind !== "def" && declaration.kind !== "abbrev") continue;
      if (secondEvaluatorNames.test(bare) && !secondEvaluatorHome(source.file, bare) && !isJustified(source, declaration.line, 13)) {
        findings.push(finding(13, source, declaration.line, `second entry or evaluator ${declaration.name}`));
      }
      if (programModeNames.test(bare) && !isJustified(source, declaration.line, 13)) {
        findings.push(finding(13, source, declaration.line, `program-mode predicate ${declaration.name}`));
      }
    }
  }
  for (const source of tree.typeScript) {
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i]?.text !== "function" || tokens[i + 1]?.kind !== TokenKind.Word) continue;
      const name = tokens[i + 1]?.text ?? "";
      const line = tokens[i]?.line ?? 0;
      if (secondEvaluatorNames.test(name) && !secondEvaluatorHome(source.file, name) && !isJustified(source, line, 13)) {
        findings.push(finding(13, source, line, `second entry or evaluator ${name}`));
      }
      if (programModeNames.test(name) && !isJustified(source, line, 13)) findings.push(finding(13, source, line, `program-mode predicate ${name}`));
    }
  }
  return findings;
}

/** The kernel's own tests, plus the differential modules that feed it: its targets and the scenario discovery. */
function isDiscoverySurface(file: string): boolean {
  return /^packages\/kernel\/test\/[^/]+\.ts$/u.test(file) ||
    /^packages\/differential\/test\/(?:kernel|scenario)-[^/]+\.ts$/u.test(file);
}

const countedCollection = /scenario|case|model|corpus|fixture/iu;

/** Guard 14: the kernel's test surfaces discover their inputs from directories and never write a count or a list. */
export function discoveryFindings(tree: KernelTree): string[] {
  const scenariosDirectory = path.join(tree.root, "scenarios");
  const scenarios = existsSync(scenariosDirectory) ? new Set(readdirSync(scenariosDirectory)) : new Set<string>();
  const surfaces = tree.testFiles.filter(({ file }) => isDiscoverySurface(file));
  if (surfaces.length === 0 || scenarios.size === 0) return [emptyInputFinding(14, "kernel test surfaces or scenario directories")];
  const findings: string[] = [];
  const parsed = surfaces.map(({ file, text }) => ({ file, text, ...tokenizeTypeScript(text), nonblank: 0 }));
  if (!parsed.some(({ text }) => /\breaddir(?:Sync)?\(/u.test(text))) {
    findings.push("G14: no kernel test surface discovers its cases from a directory");
  }
  for (const source of parsed) {
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined) continue;
      if (token.text === "[") {
        const close = closeOf(tokens, i);
        const named = tokens.slice(i + 1, close - 1).filter((inner) => inner.kind === TokenKind.String && scenarios.has(inner.text)).length;
        if (named >= 3 && !isJustified(source, token.line, 14)) findings.push(finding(14, source, token.line, `lists ${named} scenario names instead of discovering them`));
      }
      if (token.text === "length" && tokens[i - 1]?.text === ".") {
        const subject = tokens[i - 2]?.text ?? "";
        const literal = tokens[i + 1]?.text === "," ? tokens[i + 2] : (tokens[i + 1]?.text === "===" ? tokens[i + 2] : undefined);
        if (literal?.kind === TokenKind.Number && countedCollection.test(subject) && !isJustified(source, token.line, 14)) {
          findings.push(finding(14, source, token.line, `writes the count of ${subject} as ${literal.text} instead of deriving it`));
        }
      }
    }
  }
  return findings;
}

const forbiddenOptions = /^(?:maxHeartbeats|maxRecDepth|synthInstance(?:\..*)?)$/u;
const consumerBoundTypes = new Set(["State", "Program"]);

function declarationDerives(tokens: readonly Token[], declaration: LeanDeclaration): Token | null {
  return tokens.slice(declaration.tokenStart, declaration.tokenEnd).find((token) => token.text === "deriving") ?? null;
}

/** Guard 15: no elaboration budget option in the kernel, and no derived instance on `State` or `Program` without a consumer. */
export function kernelOptionFindings(tree: KernelTree): string[] {
  if (tree.lean.length === 0) return [emptyInputFinding(15, "Lean kernel modules")];
  const findings: string[] = [];
  let sawConsumerBound = false;
  for (const source of tree.lean) {
    const { tokens } = source;
    for (const token of tokens) {
      if (token.kind === TokenKind.Word && forbiddenOptions.test(token.text) && !isJustified(source, token.line, 15)) {
        findings.push(finding(15, source, token.line, `elaboration option ${token.text} in the kernel`));
      }
    }
    for (const declaration of leanDeclarations(tokens)) {
      if ((declaration.kind !== "structure" && declaration.kind !== "inductive") || !consumerBoundTypes.has(declaration.name)) continue;
      sawConsumerBound = true;
      const derived = declarationDerives(tokens, declaration);
      if (derived === null) continue;
      const named = [derived.line, derived.line - 1].some((line) => /consumer:\s*\S+/iu.test(source.comments.get(line) ?? ""));
      if (!named && !isJustified(source, derived.line, 15)) {
        findings.push(finding(15, source, derived.line, `derived instance on ${declaration.name} without a named consumer`));
      }
    }
  }
  if (!sawConsumerBound) findings.push(emptyInputFinding(15, "State or Program declaration"));
  return findings;
}

const pastAuthority = /\bbaselines?\b|frozen evaluator|old (?:evaluator|implementation)|previous implementation|legacy\b/iu;
const citedAuthority = /§\s?\d|BPMN 2\.0\.2|\bCIB-[A-Z]+-\d+\b/u;

/** The contiguous comment block holding `line`, so a citation on a neighbouring comment line still counts. */
function commentBlock(source: Source, line: number): string {
  let first = line;
  let last = line;
  while (source.comments.has(first - 1)) first -= 1;
  while (source.comments.has(last + 1)) last += 1;
  let text = "";
  for (let at = first; at <= last; at += 1) text += ` ${source.comments.get(at) ?? ""}`;
  return text;
}

/** Guard 24: a rule's comment cites a BPMN clause or a register identifier, never a baseline or an old implementation. */
export function justifiedRuleFindings(tree: KernelTree): string[] {
  const sources = [...tree.lean, ...tree.typeScript];
  if (sources.length === 0) return [emptyInputFinding(24, "kernel modules")];
  if (!sources.some((source) => source.comments.size > 0)) return [emptyInputFinding(24, "kernel comments")];
  const findings: string[] = [];
  for (const source of sources) {
    const seen = new Set<string>();
    for (const [line, comment] of source.comments) {
      const match = pastAuthority.exec(comment);
      if (match === null) continue;
      const block = commentBlock(source, line);
      if (citedAuthority.test(block) || isJustified(source, line, 24) || seen.has(block)) continue;
      seen.add(block);
      findings.push(finding(24, source, line, `rule justified by "${match[0]}" without a BPMN clause or register identifier`));
    }
  }
  return findings;
}

const rawNumberRead = /(?:^|\.)get(?:Nat|Int|Num)\?$/u;

/**
 * Guard 11, bounded wire numbers: a Lean decode reads a JSON number only through `FromJson`, whose `Nat` and `Int`
 * instances in `Kernel.IL.Codec.Value` refuse a magnitude past 2^53 − 1 as the TypeScript codec does. A raw
 * `getNat?`, `getInt?` or `getNum?` bypasses them, so it fails unless marked as the bounded decoder itself.
 */
export function boundedNumberFindings(tree: KernelTree): string[] {
  if (tree.lean.length === 0) return [emptyInputFinding(11, "Lean modules")];
  const findings: string[] = [];
  for (const source of tree.lean) {
    for (const token of source.tokens) {
      if (token.kind !== TokenKind.Word || !rawNumberRead.test(token.text) || isJustified(source, token.line, 11)) continue;
      findings.push(finding(11, source, token.line, `raw JSON number read ${token.text} bypasses the bounded FromJson Nat and Int`));
    }
  }
  return findings;
}
