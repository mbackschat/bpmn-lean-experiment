import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const SourceLanguage = {
  Lean: "lean",
  TypeScript: "typescript",
} as const;

type SourceLanguage = typeof SourceLanguage[keyof typeof SourceLanguage];

const WriterClassification = {
  Initializer: "initializer",
  Issuer: "issuer",
  IdentityPreserving: "identity-preserving",
  IdentityRemoving: "identity-removing",
} as const;

type WriterClassification = typeof WriterClassification[keyof typeof WriterClassification];

type WriterSite = Readonly<{
  key: string;
  language: SourceLanguage;
  relativePath: string;
  owner: string;
  source: string;
  typeScriptExpression: ReadonlyArray<string> | undefined;
}>;

type Evidence = Readonly<{
  relativePath: string;
  markers: ReadonlyArray<string>;
}>;

type WriterRecord = Readonly<{
  classification: WriterClassification;
  evidence?: Evidence;
}>;

const writerRecords = new Map<string, WriterRecord>([
  ["BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean#replacedState@1", {
    classification: WriterClassification.IdentityPreserving,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem replacedState_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/BoundedScope.lean#BoundedScopeVictoryStep@1", {
    classification: WriterClassification.IdentityRemoving,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem boundedScopeVictoryStep_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/BoundedScope.lean#completeBoundedScope?@1", {
    classification: WriterClassification.IdentityRemoving,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem completeBoundedScope_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/BoundedScopeArming.lean#armScopeDeadline@1", {
    classification: WriterClassification.Issuer,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/BoundedScopeArming.lean",
      markers: ["theorem armScopeDeadline_issues_fresh_activity", "activityIdentityIssuingDiscipline state"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#closeSharedParallelRegion@1", {
    classification: WriterClassification.IdentityRemoving,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem closeSharedParallelRegion_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#completeSharedParallelMultiInstance?@1", {
    classification: WriterClassification.IdentityPreserving,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem replaceParallelRecordBody_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#enterSharedParallelMultiInstance?@1", {
    classification: WriterClassification.Issuer,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem enterSharedParallelMultiInstance_issues_fresh_activity"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#SharedParallelMultiInstanceCompletionStep@1", {
    classification: WriterClassification.IdentityPreserving,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem replaceParallelRecordBody_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean#SharedParallelMultiInstanceEntryStep@1", {
    classification: WriterClassification.Issuer,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/ParallelMultiInstanceTransition.lean",
      markers: ["theorem enterSharedParallelMultiInstance_issues_fresh_activity"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/RuntimeState.lean#initialState@1", {
    classification: WriterClassification.Initializer,
  }],
  ["BpmnSemantics/SemanticProcess/ScopeCancellation.lean#cancelScopeSubtree@1", {
    classification: WriterClassification.IdentityRemoving,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem cancelScopeSubtree_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/SequentialMultiInstanceRewrite.lean#finalCompletionState@1", {
    classification: WriterClassification.IdentityRemoving,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem finalCompletionState_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/SequentialMultiInstanceRewrite.lean#interruptionState@1", {
    classification: WriterClassification.IdentityRemoving,
    evidence: {
      relativePath: "BpmnSemantics/ActivityIssuingDisciplineConformance.lean",
      markers: ["theorem interruptionState_activity_identity_discipline"],
    },
  }],
  ["BpmnSemantics/SemanticProcess/WaitActivation.lean#activateBoundedUserTask@1", {
    classification: WriterClassification.Issuer,
    evidence: {
      relativePath: "BpmnSemantics/SemanticProcess/WaitActivation.lean",
      markers: ["theorem activateBoundedUserTask_issues_fresh_activity", "activityIdentityIssuingDiscipline state"],
    },
  }],
  ["packages/semantic-core/src/activity-body-turnover.ts#replaceActivityBodyTask@1", {
    classification: WriterClassification.IdentityPreserving,
    evidence: {
      relativePath: "packages/semantic-core/test/activity-body-turnover.test.ts",
      markers: ["runtimeStateRegressions(before, after)", "preserving the exact outer identity"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts#armBoundedScope@1", {
    classification: WriterClassification.Issuer,
    evidence: {
      relativePath: "packages/semantic-core/test/subprocess-boundary-timer.test.ts",
      markers: ["runtimeStateRegressions(pair.before, pair.after)", "RuntimeStateRegression.ActivityOccurrenceIssue"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts#withdrawBoundedScopeDeadline@1", {
    classification: WriterClassification.IdentityRemoving,
  }],
  ["packages/semantic-core/src/semantic-process-bounded-task-runtime.ts#armBoundedUserTask@1", {
    classification: WriterClassification.Issuer,
    evidence: {
      relativePath: "packages/semantic-core/test/activity-boundary-timer.test.ts",
      markers: ["runtimeStateRegressions(pair.before, pair.after)", "RuntimeStateRegression.ActivityOccurrenceIssue"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-bounded-task-runtime.ts#commitVictory@1", {
    classification: WriterClassification.IdentityRemoving,
  }],
  ["packages/semantic-core/src/semantic-process-call-runtime.ts#removeCalledProcessTree@1", {
    classification: WriterClassification.IdentityRemoving,
  }],
  ["packages/semantic-core/src/semantic-process-monitored-task-runtime.ts#armMonitoredUserTask@1", {
    classification: WriterClassification.Issuer,
    evidence: {
      relativePath: "packages/semantic-core/test/non-interrupting-boundary-timer.test.ts",
      markers: ["runtimeStateRegressions(pair.before, pair.after)", "RuntimeStateRegression.ActivityOccurrenceIssue"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-monitored-task-runtime.ts#completeMonitoredUserTask@1", {
    classification: WriterClassification.IdentityRemoving,
  }],
  ["packages/semantic-core/src/semantic-process-monitored-task-runtime.ts#spawnFromMonitoredUserTask@1", {
    classification: WriterClassification.IdentityPreserving,
    evidence: {
      relativePath: "packages/semantic-core/test/non-interrupting-boundary-timer.test.ts",
      markers: ["runtimeStateRegressions(state, spawned.state)", "preserves the exact host Activity identity"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-parallel-multi-instance-runtime.ts#closeParallelMultiInstance@1", {
    classification: WriterClassification.IdentityRemoving,
  }],
  ["packages/semantic-core/src/semantic-process-parallel-multi-instance-runtime.ts#completeParallelMultiInstanceChild@1", {
    classification: WriterClassification.IdentityPreserving,
    evidence: {
      relativePath: "packages/semantic-core/test/parallel-multi-instance-entry.test.ts",
      markers: [
        "runtimeStateRegressions(entered.state, third.state)",
        "parallel child turnover preserves the exact outer identity",
      ],
    },
  }],
  ["packages/semantic-core/src/semantic-process-parallel-multi-instance-runtime.ts#enterParallelMultiInstanceUserTask@1", {
    classification: WriterClassification.Issuer,
    evidence: {
      relativePath: "packages/semantic-core/test/parallel-multi-instance-entry.test.ts",
      markers: [
        "runtimeStateRegressions(before, entered.state)",
        "RuntimeStateRegression.ActivityOccurrenceIssue",
      ],
    },
  }],
  ["packages/semantic-core/src/semantic-process-scope-cancellation.ts#removeScopeOccurrenceRegion@1", {
    classification: WriterClassification.IdentityRemoving,
  }],
  ["packages/semantic-core/src/semantic-process-sequential-multi-instance-runtime.ts#completeSequentialMultiInstanceIteration@1", {
    classification: WriterClassification.IdentityRemoving,
  }],
  ["packages/semantic-core/src/semantic-process-sequential-multi-instance-runtime.ts#enterSequentialMultiInstanceUserTask@1", {
    classification: WriterClassification.Issuer,
    evidence: {
      relativePath: "packages/semantic-core/test/sequential-multi-instance-entry.test.ts",
      markers: ["runtimeStateRegressions(before, state)", "RuntimeStateRegression.ActivityOccurrenceIssue"],
    },
  }],
  ["packages/semantic-core/src/semantic-process-sequential-multi-instance-runtime.ts#interruptSequentialMultiInstance@1", {
    classification: WriterClassification.IdentityRemoving,
  }],
  ["packages/semantic-core/src/semantic-process-state.ts#initialState@1", {
    classification: WriterClassification.Initializer,
  }],
]);

function read(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function productionSources(pattern: string): ReadonlyArray<string> {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", pattern],
    { cwd: projectRoot, encoding: "utf8" },
  ).split("\n").filter((relativePath) => relativePath.length > 0).sort();
}

function withoutComments(source: string, language: SourceLanguage): string {
  const blockOpen = language === SourceLanguage.Lean ? "/-" : "/*";
  const blockClose = language === SourceLanguage.Lean ? "-/" : "*/";
  const lineOpen = language === SourceLanguage.Lean ? "--" : "//";
  let blockDepth = 0;
  let lineComment = false;
  let quote: string | null = null;
  let escaped = false;
  let result = "";
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index] ?? "";
    const pair = source.slice(index, index + 2);
    if (lineComment) {
      if (current === "\n") {
        lineComment = false;
        result += current;
      } else {
        result += " ";
      }
      continue;
    }
    if (blockDepth > 0) {
      if (language === SourceLanguage.Lean && pair === blockOpen) {
        blockDepth += 1;
        result += "  ";
        index += 1;
      } else if (pair === blockClose) {
        blockDepth -= 1;
        result += "  ";
        index += 1;
      } else {
        result += current === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (quote !== null) {
      result += current === "\n" ? "\n" : " ";
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === quote) {
        quote = null;
      }
      continue;
    }
    if (pair === lineOpen) {
      lineComment = true;
      result += "  ";
      index += 1;
    } else if (pair === blockOpen) {
      blockDepth = 1;
      result += "  ";
      index += 1;
    } else if (current === '"' || (language === SourceLanguage.TypeScript && (current === "'" || current === "`"))) {
      quote = current;
      result += " ";
    } else {
      result += current;
    }
  }
  return result;
}

function leanDeclaration(line: string): Readonly<{ owner: string; production: boolean }> | null {
  const match = /^(?:private\s+)?(def|inductive|structure|theorem|lemma|abbrev|class|instance|example)\b(?:\s+([^\s(:]+))?/u.exec(line);
  if (match === null) return null;
  const kind = match[1] ?? "";
  return { owner: match[2] ?? `<${kind}>`, production: kind === "def" || kind === "inductive" };
}

function typeScriptDeclaration(line: string): Readonly<{ owner: string; production: boolean }> | null {
  const match = /^(?:export\s+)?(?:async\s+)?(function|const|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/u.exec(line);
  if (match === null) return null;
  const kind = match[1] ?? "";
  return { owner: match[2] ?? `<${kind}>`, production: kind === "function" || kind === "const" || kind === "class" };
}

type Token = Readonly<{ value: string; line: number }>;

function typeScriptTokens(source: string): ReadonlyArray<Token> {
  const tokens: Token[] = [];
  let line = 0;
  for (let index = 0; index < source.length;) {
    const character = source[index] ?? "";
    if (character === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    const identifier = /^[A-Za-z_$][\w$]*/u.exec(source.slice(index));
    if (identifier?.[0] !== undefined) {
      tokens.push({ value: identifier[0], line });
      index += identifier[0].length;
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (pair === "=>") {
      tokens.push({ value: pair, line });
      index += 2;
      continue;
    }
    tokens.push({ value: character, line });
    index += 1;
  }
  return tokens;
}

function typeScriptObjectWriterLines(source: string): ReadonlySet<number> {
  const tokens = typeScriptTokens(source);
  const braceKinds: boolean[] = [];
  const writerLines = new Set<number>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.value === "{") {
      const previous = tokens[index - 1]?.value;
      const objectLiteral = previous === "return" || previous === "=" || previous === ":" ||
        previous === "[" || previous === "," || previous === "(";
      braceKinds.push(objectLiteral);
      continue;
    }
    if (token?.value === "}") {
      braceKinds.pop();
      continue;
    }
    if (token?.value !== "activityOccurrences" || braceKinds.at(-1) !== true) continue;
    const previous = tokens[index - 1]?.value;
    const next = tokens[index + 1]?.value;
    if ((previous === "{" || previous === ",") && (next === ":" || next === "," || next === "}")) {
      writerLines.add(token.line);
    }
  }
  return writerLines;
}

function typeScriptActivityOccurrenceExpression(source: string): ReadonlyArray<string> | undefined {
  const tokens = typeScriptTokens(source);
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.value !== "activityOccurrences") continue;
    const previous = tokens[index - 1]?.value;
    const next = tokens[index + 1]?.value;
    const objectProperty = (previous === undefined || previous === "{" || previous === ",") && next === ":";
    const directAssignment = previous === "." && next === "=";
    if (!objectProperty && !directAssignment) continue;
    const expression: string[] = [];
    const delimiters: string[] = [];
    for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
      const value = tokens[cursor]?.value;
      if (value === undefined) break;
      if (delimiters.length === 0 && (value === "," || value === ";" || value === "}")) break;
      expression.push(value);
      if (value === "(" || value === "[" || value === "{") {
        delimiters.push(value);
      } else if (value === ")" || value === "]" || value === "}") {
        delimiters.pop();
      }
    }
    return expression;
  }
  return undefined;
}

function writerSitesFromSource(
  relativePath: string,
  language: SourceLanguage,
  rawSource: string,
): ReadonlyArray<WriterSite> {
  const source = withoutComments(rawSource, language);
  const lines = source.split("\n");
  const typeScriptWriterLines = language === SourceLanguage.TypeScript
    ? typeScriptObjectWriterLines(source)
    : new Set<number>();
  let declaration: Readonly<{ owner: string; production: boolean }> | null = null;
  const ordinals = new Map<string, number>();
  const sites: WriterSite[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const nextDeclaration = language === SourceLanguage.Lean
      ? leanDeclaration(line)
      : typeScriptDeclaration(line);
    if (nextDeclaration !== null) declaration = nextDeclaration;
    const writesCollection = language === SourceLanguage.Lean
      ? /\bactivityOccurrences\s*:=/u.test(line)
      : typeScriptWriterLines.has(index) || /\.activityOccurrences\s*=/u.test(line);
    if (!writesCollection || declaration?.production !== true) continue;
    const ordinalKey = `${relativePath}#${declaration.owner}`;
    const ordinal = (ordinals.get(ordinalKey) ?? 0) + 1;
    ordinals.set(ordinalKey, ordinal);
    sites.push({
      key: `${ordinalKey}@${ordinal}`,
      language,
      relativePath,
      owner: declaration.owner,
      source: lines.slice(index, index + 6).join("\n"),
      typeScriptExpression: language === SourceLanguage.TypeScript
        ? typeScriptActivityOccurrenceExpression(lines.slice(index).join("\n"))
        : undefined,
    });
  }
  return sites;
}

function writerSites(relativePath: string, language: SourceLanguage): ReadonlyArray<WriterSite> {
  return writerSitesFromSource(relativePath, language, read(relativePath));
}

function currentWriterCensus(): ReadonlyArray<WriterSite> {
  return [
    ...productionSources("BpmnSemantics/SemanticProcess/*.lean").flatMap((relativePath) =>
      writerSites(relativePath, SourceLanguage.Lean)
    ),
    ...productionSources("packages/semantic-core/src/*.ts").flatMap((relativePath) =>
      writerSites(relativePath, SourceLanguage.TypeScript)
    ),
  ].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
}

function unclassifiedWriterKeys(
  census: ReadonlyArray<WriterSite>,
  records: ReadonlyMap<string, WriterRecord>,
): ReadonlyArray<string> {
  return census.map(({ key }) => key).filter((key) => !records.has(key));
}

function typeScriptMethodPipeline(expression: ReadonlyArray<string>): ReadonlyArray<string> | undefined {
  const identifier = /^[A-Za-z_$][\w$]*$/u;
  if (!identifier.test(expression[0] ?? "")) return undefined;
  const methods: string[] = [];
  let index = 1;
  while (index < expression.length) {
    if (expression[index] !== "." || !identifier.test(expression[index + 1] ?? "")) return undefined;
    const member = expression[index + 1] ?? "";
    if (expression[index + 2] !== "(") {
      index += 2;
      continue;
    }
    let depth = 0;
    let closingIndex: number | undefined;
    for (let cursor = index + 2; cursor < expression.length; cursor += 1) {
      if (expression[cursor] === "(") depth += 1;
      if (expression[cursor] === ")") depth -= 1;
      if (depth === 0) {
        closingIndex = cursor;
        break;
      }
    }
    if (closingIndex === undefined) return undefined;
    methods.push(member);
    index = closingIndex + 1;
  }
  return methods;
}

function isPureTypeScriptCollectionTransform(expression: ReadonlyArray<string>, transform: string): boolean {
  const pipeline = typeScriptMethodPipeline(expression);
  return pipeline?.[0] === transform && pipeline.slice(1).every((method) => method === "sort");
}

function isTypeScriptIssuingArray(expression: ReadonlyArray<string>): boolean {
  if (expression[0] !== "[") return false;
  let depth = 0;
  let closingIndex: number | undefined;
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] === "[") depth += 1;
    if (expression[index] === "]") depth -= 1;
    if (depth === 0) {
      closingIndex = index;
      break;
    }
  }
  if (closingIndex === undefined || closingIndex === 1) return false;
  const pipeline = typeScriptMethodPipeline(["array", ...expression.slice(closingIndex + 1)]);
  return pipeline?.every((method) => method === "sort") === true;
}

function writerMatchesClassification(site: WriterSite, classification: WriterClassification): boolean {
  if (site.language === SourceLanguage.TypeScript) {
    const expression = site.typeScriptExpression ?? [];
    switch (classification) {
      case WriterClassification.Initializer:
        return expression.length === 2 && expression[0] === "[" && expression[1] === "]";
      case WriterClassification.Issuer:
        return isTypeScriptIssuingArray(expression);
      case WriterClassification.IdentityPreserving:
        return isPureTypeScriptCollectionTransform(expression, "map");
      case WriterClassification.IdentityRemoving:
        return isPureTypeScriptCollectionTransform(expression, "filter");
    }
  }
  switch (classification) {
    case WriterClassification.Initializer:
      return /activityOccurrences\s*:=\s*\[\]/su.test(site.source);
    case WriterClassification.Issuer:
      return /activityOccurrences\s*:=\s*insertActivityOccurrence/su.test(site.source);
    case WriterClassification.IdentityPreserving:
      return /activityOccurrences\s*:=\s*(?:replaceBodyIn|replaceParallelRecordBody)/su.test(site.source);
    case WriterClassification.IdentityRemoving:
      return /activityOccurrences\s*:=.*(?:\.filter|filter\s|retainedByRegion|removeParallelRecord)/su.test(site.source);
  }
}

test("every production Activity-occurrence writer has one current classification", () => {
  const census = currentWriterCensus();
  assert.deepEqual(unclassifiedWriterKeys(census, writerRecords), []);
  assert.deepEqual(
    [...writerRecords.keys()].filter((key) => !census.some((site) => site.key === key)),
    [],
    "stale writer classifications",
  );
});

test("every classification still matches the writer shape and required evidence", () => {
  for (const site of currentWriterCensus()) {
    const record = writerRecords.get(site.key);
    assert.ok(record, site.key);
    assert.equal(writerMatchesClassification(site, record.classification), true, site.key);
    const needsEvidence = record.classification === WriterClassification.Issuer ||
      record.classification === WriterClassification.IdentityPreserving ||
      (site.language === SourceLanguage.Lean &&
        record.classification === WriterClassification.IdentityRemoving);
    if (needsEvidence) {
      assert.ok(record.evidence, `${site.key} has no issuing-discipline evidence`);
    }
    if (record.evidence !== undefined) {
      const evidenceSource = read(record.evidence.relativePath);
      for (const marker of record.evidence.markers) {
        assert.ok(evidenceSource.includes(marker), `${site.key} evidence is missing: ${marker}`);
      }
    }
  }
});

test("an added production writer is unclassified until its evidence record lands", () => {
  const census = currentWriterCensus();
  const first = census[0];
  assert.ok(first !== undefined, "writer census is unexpectedly empty");
  const seeded: WriterSite = { ...first, key: `${first.relativePath}#seededWriter@1` };
  assert.deepEqual(unclassifiedWriterKeys([...census, seeded], writerRecords), [seeded.key]);
});

test("an identity-removing classification rejects a mixed remove-and-issue rewrite", () => {
  const mixedSource = [
    "activityOccurrences: [",
    "  ...state.activityOccurrences.filter((candidate) => candidate.id !== removed.id),",
    "  issued,",
    "]",
  ].join("\n");
  const mixedRewrite: WriterSite = {
    key: "seeded.ts#mixedRewrite@1",
    language: SourceLanguage.TypeScript,
    relativePath: "seeded.ts",
    owner: "mixedRewrite",
    source: mixedSource,
    typeScriptExpression: typeScriptActivityOccurrenceExpression(mixedSource),
  };
  assert.equal(writerMatchesClassification(mixedRewrite, WriterClassification.IdentityRemoving), false);
  assert.equal(writerMatchesClassification(mixedRewrite, WriterClassification.Issuer), true);
});

test("the census parser sees independent writer forms without treating declarations as writers", () => {
  const typeScript = writerSitesFromSource("seeded.ts", SourceLanguage.TypeScript, [
    "export interface State {",
    "  activityOccurrences: string[];",
    "}",
    "export function seeded(state: State): State {",
    "  const activityOccurrences = state.activityOccurrences.filter(Boolean);",
    "  return { activityOccurrences, };",
    "}",
  ].join("\n"));
  const lean = writerSitesFromSource("Seeded.lean", SourceLanguage.Lean, [
    "structure State where",
    "  activityOccurrences : List Nat",
    "def seeded (state : State) : State :=",
    "  { state with activityOccurrences := state.activityOccurrences.filter (· > 0) }",
    "theorem proof_only (state : State) :",
    "    { state with activityOccurrences := [] } = state := by sorry",
  ].join("\n"));
  assert.deepEqual(typeScript.map(({ key }) => key), ["seeded.ts#seeded@1"]);
  assert.deepEqual(lean.map(({ key }) => key), ["Seeded.lean#seeded@1"]);
});
