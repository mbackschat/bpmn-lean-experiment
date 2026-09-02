import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compareCanonicalStrings } from "../packages/semantic-core/src/wire.ts";
import {
  analyzeLeanSource,
  worktreeLeanSourceFiles,
} from "./lean-source-analysis.ts";
import {
  readWorktreeSource,
  readWorktreeSources,
} from "./worktree-source-read.ts";

export type SourceViolation = Readonly<{
  path: string;
  line: number;
  message: string;
}>;

function lineStartOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function moduleContractViolation(
  sourcePath: string,
  source: string,
): SourceViolation | null {
  const analysis = analyzeLeanSource(source);
  const lines = analysis.code.split(/\r?\n/u);
  const offsets = lineStartOffsets(source);
  let importPreludeEnd = 0;
  let firstDeclarationOffset = source.length;

  for (const [lineIndex, line] of lines.entries()) {
    const lineOffset = offsets[lineIndex];
    if (lineOffset === undefined) {
      throw new RangeError("Lean source line offset is missing");
    }
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (/^import\s+[A-Za-z0-9_.]+\s*$/u.test(trimmed)) {
      importPreludeEnd = lineOffset + line.length;
      continue;
    }
    firstDeclarationOffset = lineOffset;
    break;
  }

  const moduleDocument = analysis.moduleDocuments[0];
  if (moduleDocument === undefined) {
    return {
      path: sourcePath,
      line: 1,
      message: "missing module document after imports and before the first declaration",
    };
  }
  if (
    moduleDocument.offset < importPreludeEnd ||
    moduleDocument.offset > firstDeclarationOffset
  ) {
    return {
      path: sourcePath,
      line: moduleDocument.line,
      message: "module document must follow imports and precede the first declaration",
    };
  }
  return null;
}

function isMaintainedConformancePath(sourcePath: string): boolean {
  const normalized = sourcePath.replaceAll(path.sep, "/");
  return (
    path.posix.basename(normalized).endsWith("Conformance.lean") &&
    !normalized.startsWith("BpmnSemantics/Experiments/")
  );
}

function anonymousExampleViolations(
  sourcePath: string,
  source: string,
): SourceViolation[] {
  if (!isMaintainedConformancePath(sourcePath)) {
    return [];
  }
  return analyzeLeanSource(source).code
    .split(/\r?\n/u)
    .flatMap((line, lineIndex) =>
      /^\s*(?:@\[[^\]\r\n]*\]\s*)*example(?=\s|:|\{|\(|$)/u.test(line)
        ? [
            {
              path: sourcePath,
              line: lineIndex + 1,
              message: "anonymous maintained conformance fact; use a descriptive public theorem",
            },
          ]
        : [],
    );
}

const flowNodeLifecyclePath =
  "BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean";
const flowNodeBoundaryStartsPath =
  "BpmnSemantics/SemanticProcess/FlowNodeOccurrenceBoundaryStarts.lean";
const openProjectionHelpers = [
  "processIdForOwner?",
  "waitStart?",
  "scopeStart?",
  "callStart?",
] as const;

function candidateProjectionReuseViolations(
  sourcePath: string,
  source: string,
): SourceViolation[] {
  const normalized = sourcePath.replaceAll(path.sep, "/");
  const lines = analyzeLeanSource(source).code.split(/\r?\n/u);
  const firstCandidateLine =
    normalized === flowNodeLifecyclePath
      ? lines.findIndex((line) =>
          /^def\s+instantaneousFlowNodeOccurrenceDelta\b/u.test(line.trim()),
        )
      : normalized === flowNodeBoundaryStartsPath
        ? 0
        : -1;
  if (firstCandidateLine < 0) {
    return [];
  }
  return lines.slice(firstCandidateLine).flatMap((line, lineOffset) =>
    openProjectionHelpers.flatMap((helper) => {
      const escaped = helper.replace(/[?]/gu, "\\?");
      const call = new RegExp(
        `(?:^|[^A-Za-z0-9_])${escaped}(?![A-Za-z0-9_?'])`,
        "u",
      );
      return call.test(line)
        ? [
            {
              path: sourcePath,
              line: firstCandidateLine + lineOffset + 1,
              message: `candidate lifecycle construction reuses open-projection helper \`${helper}\``,
            },
          ]
        : [];
    }),
  );
}

const evaluatorIndependentRelations = Object.freeze([
  Object.freeze({
    path: "BpmnSemantics/SemanticProcess/CompensationTriggerHandlerFrontier.lean",
    relation: "CompensationFrontierStep",
    evaluator: "activateCompensationFrontier",
  }),
  Object.freeze({
    path: "BpmnSemantics/SemanticProcess/CompensationTriggerHandlerFrontier.lean",
    relation: "CompensationFrontierRefusalStep",
    evaluator: "activateCompensationFrontier",
  }),
]);

function evaluatorDelegationViolations(
  sourcePath: string,
  source: string,
): SourceViolation[] {
  const normalized = sourcePath.replaceAll(path.sep, "/");
  const contracts = evaluatorIndependentRelations.filter(
    (contract) => contract.path === normalized,
  );
  if (contracts.length === 0) {
    return [];
  }

  const lines = analyzeLeanSource(source).code.split(/\r?\n/u);
  return contracts.flatMap(({ relation, evaluator }) => {
    const start = lines.findIndex((line) =>
      new RegExp(`^inductive\\s+${relation}(?=\\s|$)`, "u").test(line),
    );
    if (start < 0) {
      throw new Error(`${relation} is absent; the guard must be retargeted`);
    }
    const rest = lines.slice(start + 1);
    const relativeEnd = rest.findIndex((line) =>
      /^(?:@\[|\/-|private\s+)?(?:def|theorem|structure|inductive|abbrev|end)\b/u
        .test(line),
    );
    const end = relativeEnd < 0 ? lines.length : start + relativeEnd + 1;
    const escapedEvaluator = evaluator.replace(/[?]/gu, "\\?");
    const evaluatorReference = new RegExp(
      `(?:^|[^A-Za-z0-9_])${escapedEvaluator}(?![A-Za-z0-9_?'])`,
      "u",
    );
    const delegatedLine = lines
      .slice(start, end)
      .findIndex((line) => evaluatorReference.test(line));
    return delegatedLine < 0
      ? []
      : [
          {
            path: sourcePath,
            line: start + delegatedLine + 1,
            message: `declarative relation \`${relation}\` delegates its meaning to evaluator \`${evaluator}\``,
          },
        ];
  });
}

export function leanSourceViolations(
  sourcePath: string,
  source: string,
): SourceViolation[] {
  const moduleViolation = moduleContractViolation(sourcePath, source);
  return [
    ...(moduleViolation === null ? [] : [moduleViolation]),
    ...anonymousExampleViolations(sourcePath, source),
    ...candidateProjectionReuseViolations(sourcePath, source),
    ...evaluatorDelegationViolations(sourcePath, source),
  ];
}

function formatViolation(violation: SourceViolation): string {
  return `${violation.path}:${violation.line}: ${violation.message}`;
}

test("module contracts reject absence and late placement", () => {
  assert.equal(
    formatViolation(
      moduleContractViolation("Missing.lean", "def value := 1\n")!,
    ),
    "Missing.lean:1: missing module document after imports and before the first declaration",
  );
  assert.equal(
    formatViolation(
      moduleContractViolation(
        "Late.lean",
        "import Example.Core\n\ndef value := 1\n\n/-! Too late. -/\n",
      )!,
    ),
    "Late.lean:5: module document must follow imports and precede the first declaration",
  );
});

test("module contracts accept declarations and import-only umbrellas", () => {
  assert.equal(
    moduleContractViolation(
      "Declared.lean",
      "import Example.Core\n\n/-! Contract. -/\n\ndef value := 1\n",
    ),
    null,
  );
  assert.equal(
    moduleContractViolation(
      "Umbrella.lean",
      "import Example.Core\nimport Example.Laws\n\n/-! Public imports. -/\n",
    ),
    null,
  );
});

test("anonymous conformance examples report exact paths and lines", () => {
  assert.deepEqual(
    leanSourceViolations(
      "BpmnSemantics/Conformance.lean",
      [
        "/-! Contract. -/",
        "",
        "namespace BpmnSemantics",
        "",
        "example : True := by trivial",
        "  example : True := by trivial",
        "@[simp] example : True := by trivial",
        "example(h : True) : True := by exact h",
        "",
      ].join("\n"),
    ).map(formatViolation),
    [
      "BpmnSemantics/Conformance.lean:5: anonymous maintained conformance fact; use a descriptive public theorem",
      "BpmnSemantics/Conformance.lean:6: anonymous maintained conformance fact; use a descriptive public theorem",
      "BpmnSemantics/Conformance.lean:7: anonymous maintained conformance fact; use a descriptive public theorem",
      "BpmnSemantics/Conformance.lean:8: anonymous maintained conformance fact; use a descriptive public theorem",
    ],
  );
});

test("comments, literals, named theorems, and experiments do not create findings", () => {
  const source = String.raw`/-! Contract with the Worker's \"quoted\" boundary. -/

-- an author's "example : False" note
/- outer
   /- example : False := by contradiction -/
-/
@[simp]
theorem named_fact : True := by trivial
def literal := "-- /- -/ example : False escaped \\\" quote"
`;
  assert.deepEqual(
    anonymousExampleViolations(
      "BpmnSemantics/NamedConformance.lean",
      source,
    ),
    [],
  );
  assert.deepEqual(
    anonymousExampleViolations(
      "BpmnSemantics/Experiments/FrozenConformance.lean",
      "/-! Frozen. -/\n\nexample : True := by trivial\n",
    ),
    [],
  );
});

test("candidate lifecycle construction cannot reuse open-projection helpers", () => {
  const lifecycleSource = `/-! Lifecycle contract. -/

namespace BpmnSemantics.SemanticProcess

private def processIdForOwner? := none
private def waitStart? := none

def instantaneousFlowNodeOccurrenceDelta := none

def candidateIdentity? := processIdForOwner?
`;
  assert.deepEqual(
    leanSourceViolations(
      "BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean",
      lifecycleSource,
    ).map(formatViolation),
    [
      "BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean:10: candidate lifecycle construction reuses open-projection helper `processIdForOwner?`",
    ],
  );

  const boundarySource = `/-! Boundary candidate contract. -/

namespace BpmnSemantics.SemanticProcess

def candidateWaitStart? := waitStart?
`;
  assert.deepEqual(
    leanSourceViolations(
      "BpmnSemantics/SemanticProcess/FlowNodeOccurrenceBoundaryStarts.lean",
      boundarySource,
    ).map(formatViolation),
    [
      "BpmnSemantics/SemanticProcess/FlowNodeOccurrenceBoundaryStarts.lean:5: candidate lifecycle construction reuses open-projection helper `waitStart?`",
    ],
  );
});

test("declarative compensation relations cannot delegate meaning to their evaluators", () => {
  const path =
    "BpmnSemantics/SemanticProcess/CompensationTriggerHandlerFrontier.lean";
  const delegated = `/-! Compensation frontier. -/

inductive CompensationFrontierStep : Nat \u2192 Prop where
  | activate (selected : activateCompensationFrontier = some 1) :
      CompensationFrontierStep 1

inductive CompensationFrontierRefusalStep : Prop where
  | refused : CompensationFrontierRefusalStep
`;
  assert.deepEqual(
    leanSourceViolations(path, delegated).map(formatViolation),
    [
      `${path}:4: declarative relation \`CompensationFrontierStep\` delegates its meaning to evaluator \`activateCompensationFrontier\``,
    ],
  );

  const independent = `/-! Compensation frontier. -/

inductive CompensationFrontierStep : Nat \u2192 Prop where
  | activate (selected : activateHandlers = some 1) :
      CompensationFrontierStep 1

inductive CompensationFrontierRefusalStep : Prop where
  | refused : CompensationFrontierRefusalStep
`;
  assert.deepEqual(leanSourceViolations(path, independent), []);
});

test("Lean literals preserve delimiters, primes, and exact character tokens", () => {
  const source = String.raw`/-! An author's "literal" contract. -/
def delimiters := "-- /- -/ escaped \\\" quote and \\\\ slash"
def Bool.not_eq_true' := true
def quote : Char := '"'
def apostrophe : Char := '\''
def backspace : Char := '\x08'
-- the token's "quoted" target is data
theorem after_literals : True := by trivial
`;
  const analysis = analyzeLeanSource(source);
  assert.match(analysis.code, /def Bool\.not_eq_true' := true/u);
  assert.match(analysis.code, /theorem after_literals : True := by trivial/u);
  assert.equal(analysis.moduleDocuments.length, 1);
});

test("a worktree scan survives a source deleted between enumeration and read", () => {
  const vanished = ".worktree-source-read-vanishing-probe.lean";
  assert.equal(existsSync(vanished), false);

  // The enumerate-then-read split is what makes this reachable: guards list paths in one step and
  // read them in a later one, while sibling guard processes create and delete probes in the same
  // tree. Reading a path that is already gone must drop it, not fail the scan.
  assert.equal(readWorktreeSource(vanished), null);
  assert.deepEqual(readWorktreeSources([vanished]), []);

  writeFileSync(vanished, "/-! Present. -/\n", "utf8");
  try {
    assert.deepEqual(readWorktreeSources([vanished]), [
      { path: vanished, source: "/-! Present. -/\n" },
    ]);
  } finally {
    unlinkSync(vanished);
  }

  assert.deepEqual(readWorktreeSources([vanished]), []);
});

test("maintained Lean discovery includes a non-ignored pending source", () => {
  const pendingSource = ".lean-source-contract-pending-probe.lean";
  assert.equal(existsSync(pendingSource), false);
  writeFileSync(pendingSource, "/-! Pending contract. -/\n", "utf8");
  try {
    assert.equal(worktreeLeanSourceFiles().includes(pendingSource), true);
  } finally {
    unlinkSync(pendingSource);
  }
});

test("a ratio-discriminating sparse module remains valid", () => {
  const declarations = Array.from(
    { length: 30 },
    (_, index) => `def value${index + 1} := ${index + 1}`,
  );
  const source = ["/-! Sparse contract. -/", ...declarations, ""].join("\n");
  assert.deepEqual(
    leanSourceViolations("BpmnSemantics/SparseConformance.lean", source),
    [],
  );
  assert.equal((source.match(/\/-!/gu) ?? []).length, 1);
  assert.equal((source.match(/\/--/gu) ?? []).length, 0);
  assert.equal(source.split("\n").filter((line) => line.length > 0).length, 31);
});

test("maintained Lean sources satisfy structural comment contracts", () => {
  const violations = readWorktreeSources(worktreeLeanSourceFiles()).flatMap(
    ({ path, source }) => leanSourceViolations(path, source),
  );
  assert.deepEqual(
    violations.map(formatViolation),
    [],
    "Lean module contracts and maintained conformance facts must remain locally identifiable",
  );
});

/**
 * `native_decide` sites, recorded exactly because they widen the trusted path.
 *
 * A `native_decide` proof compiles the decision procedure and trusts the result, so it adds a
 * `native_decide` axiom to its theorem's footprint; `#print axioms` on
 * `string_equals_expression_parses_exactly` reports one beside `propext`, `Classical.choice`, and
 * `Quot.sound`. The kernel-decide policy in [CLAUDE.md](../CLAUDE.md) prefers `decide +kernel`,
 * which adds no axiom.
 *
 * This inventory is a ratchet rather than a permission: a new site, or any new module, fails here
 * instead of silently enlarging what the project trusts. Removing sites is always admissible and
 * only requires lowering a figure; raising one is an owner decision about the trusted path. The
 * guard exists because prose alone did not hold — a repository-wide "`native_decide` remains
 * excluded" sentence was written while 56 sites in six modules were live.
 *
 * Forty of those 56 are now converted, and every module was measured before its conversion because
 * kernel cost follows a proposition's reduction depth rather than a module's site count. The
 * remaining four rows are **not** a cost decision and cannot be lowered by spending more CPU: each
 * decides a fact that reaches parsing of a `String` literal, and the kernel does not reduce `String`
 * operations, so `decide +kernel` fails to elaborate rather than running slowly. `parseRejected
 * "{\"id\":1,\"id\":1}" = true` and `parseSimpleBooleanExpression "stringEquals(route,\"review\")"`
 * and `exact_structured_human_work_topology_is_preserved` all reach the same reduction boundary.
 * The compensation Program row groups its exact strict-decoder and declaration-admission facts into
 * one proposition because both reach concrete `String` operations.
 * Their `Decidable` instances do not reduce to `isTrue` or `isFalse` in the kernel.
 * `native_decide` decides them because compiled code walks the string. Removing these four rows requires
 * restating the propositions over a non-`String` representation, which is a semantic change to what
 * the fixtures lock, not a tactic swap.
 *
 * Exact null, present, missing, and malformed source-overlay JSON shapes are grouped into one
 * decision per wire owner. Grouping keeps the compiler-trusted boundary at the three parsers that
 * own the contract instead of creating one site per example.
 */
const recordedNativeDecideSites = Object.freeze([
  Object.freeze({ path: "BpmnSemantics/SemanticProcessJsonConformance.lean", sites: 18 }),
  Object.freeze({
    path: "BpmnSemantics/CompensationTriggerHandlerProgramContractConformance.lean",
    sites: 1,
  }),
  Object.freeze({
    path: "BpmnSemantics/ExclusiveGatewaySimpleBooleanConformance.lean",
    sites: 1,
  }),
  Object.freeze({
    path: "BpmnSemantics/StructuredHumanWorkConformance.lean",
    sites: 1,
  }),
]);

/**
 * Counts tactic-position sites only, so a comment explaining why a module avoids `native_decide`
 * cannot inflate a recorded figure and turn this ratchet into a false alarm.
 */
export function nativeDecideSites(source: string): number {
  const tacticPosition =
    /(?:^|\bby|<;>|·|;|\btry|\brepeat|\ball_goals|\bfirst|[|⟨,])\s*$/u;
  const tacticTerminator = /^\s*(?:[,⟩)\]]|--|$)/u;

  return source.split(/\r?\n/u).reduce((total, line) => {
    let sites = 0;
    for (const match of line.matchAll(/(?<![\w.])native_decide(?![\w])/gu)) {
      const before = line.slice(0, match.index);
      const after = line.slice(match.index + "native_decide".length);
      if (tacticPosition.test(before) && tacticTerminator.test(after)) {
        sites += 1;
      }
    }
    return total + sites;
  }, 0);
}

test("native_decide stays inside its exactly recorded exception set", () => {
  const recorded = new Map(
    recordedNativeDecideSites.map(({ path: p, sites }) => [p, sites]),
  );
  const measured = readWorktreeSources(worktreeLeanSourceFiles())
    .map(({ path, source }) => ({
      path,
      sites: nativeDecideSites(source),
    }))
    .filter(({ sites }) => sites > 0)
    .sort(
      (left, right) =>
        right.sites - left.sites || compareCanonicalStrings(left.path, right.path),
    );

  assert.deepEqual(
    measured,
    [...recorded]
      .map(([p, sites]) => ({ path: p, sites }))
      .sort(
        (left, right) =>
          right.sites - left.sites || compareCanonicalStrings(left.path, right.path),
      ),
    "a new native_decide site trusts the compiler for a proposition the kernel could decide; use `decide +kernel` or move the recorded figure deliberately",
  );
});

test("the native_decide inventory counts tactic sites and not prose", () => {
  assert.equal(nativeDecideSites("  native_decide\n  exact ⟨by native_decide, rfl⟩"), 2);
  assert.equal(nativeDecideSites("/-- Why this avoids native_decide entirely. -/"), 0);
  assert.equal(nativeDecideSites("  decide +kernel\n  Decidable.decide (a = b)"), 0);
});

/**
 * Declarations whose result is a *collection contribution* over a semantic variant, where a
 * wildcard arm silently returns "contributes nothing" for a variant nobody considered.
 *
 * Every entry here decides either a public observation or a graph edge set, so an unnoticed
 * absence is wrong rather than conservative. Three separate families were made invisible this
 * way before these matches were required to be exhaustive: a boundary Event unreachable because
 * its Activity edge was keyed on trigger kind, and a composite family's task and timer waits
 * missing from every projection. The compiler is the guard; this test keeps the wildcard from
 * coming back.
 */
const exhaustiveVariantInventories = Object.freeze([
  Object.freeze({
    path: "BpmnSemantics/SemanticProcess/Scenario.lean",
    declaration: "ownedWaitDefinitions",
  }),
  Object.freeze({
    path: "BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean",
    declaration: "attachedBoundaryHost?",
  }),
]);

function declarationBody(source: string, declaration: string): string {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) =>
    new RegExp(
      `^(?:private\\s+)?def\\s+${declaration.replace(/[?]/gu, "\\?")}(?=\\s|:|$)`,
      "u",
    ).test(line)
  );
  if (start < 0) {
    throw new Error(`${declaration} is absent; the guard must be retargeted`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) =>
    /^(?:@\[|\/-|private\s+)?(?:def|theorem|structure|inductive|abbrev|end)\b/u
      .test(line)
  );
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join("\n");
}

function inductiveConstructors(source: string, inductive: string): string[] {
  const lines = analyzeLeanSource(source).code.split(/\r?\n/u);
  const start = lines.findIndex((line) =>
    new RegExp(`^inductive\\s+${inductive}(?=\\s|$)`, "u").test(line)
  );
  if (start < 0) {
    throw new Error(`${inductive} is absent; the guard must be retargeted`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) =>
    /^(?:@\[|\/-|private\s+)?(?:def|theorem|structure|inductive|abbrev|end)\b/u
      .test(line)
  );
  const body = end < 0 ? rest : rest.slice(0, end);
  return body.flatMap((line) => {
    const match = /^\s*\|\s+([A-Za-z][A-Za-z0-9_']*)\b/u.exec(line);
    return match?.[1] === undefined ? [] : [match[1]];
  });
}

const checkedNodeWireKindAliases = new Map<string, string>([
  ["inclusiveGatewayDiverging", "inclusiveGateway"],
  ["inclusiveGatewayConverging", "inclusiveGateway"],
]);

test("checked-node wire decoding covers every semantic variant", () => {
  const contract = readFileSync(
    fileURLToPath(new URL("../BpmnSemantics/SemanticProcessContract.lean", import.meta.url)),
    "utf8",
  );
  const decoder = readFileSync(
    fileURLToPath(
      new URL("../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean", import.meta.url),
    ),
    "utf8",
  );
  const expectedWireKinds = new Set(
    inductiveConstructors(contract, "CheckedNode").map(
      (constructor) => checkedNodeWireKindAliases.get(constructor) ?? constructor,
    ),
  );
  const decodedWireKinds = new Set(
    declarationBody(decoder, "decodeCheckedNode")
      .split(/\r?\n/u)
      .flatMap((line) => {
        const match = /^  \| "([^"]+)" =>/u.exec(line);
        return match?.[1] === undefined ? [] : [match[1]];
      }),
  );

  assert.deepEqual(
    [...decodedWireKinds].sort(compareCanonicalStrings),
    [...expectedWireKinds].sort(compareCanonicalStrings),
    "every CheckedNode constructor must have an exact checked-process wire decoder arm",
  );
});

test("Semantic-operation wire decoding covers every semantic variant", () => {
  const contract = readFileSync(
    fileURLToPath(new URL("../BpmnSemantics/SemanticProcessContract.lean", import.meta.url)),
    "utf8",
  );
  const decoder = readFileSync(
    fileURLToPath(
      new URL("../BpmnSemantics/SemanticProcessJson/Program.lean", import.meta.url),
    ),
    "utf8",
  );
  const expectedWireKinds = new Set(
    inductiveConstructors(contract, "SemanticOperation"),
  );
  const decodedWireKinds = new Set(
    declarationBody(decoder, "decodeOperation")
      .split(/\r?\n/u)
      .flatMap((line) => {
        const match = /^  \| "([^"]+)" =>/u.exec(line);
        return match?.[1] === undefined ? [] : [match[1]];
      }),
  );

  assert.deepEqual(
    [...decodedWireKinds].sort(compareCanonicalStrings),
    [...expectedWireKinds].sort(compareCanonicalStrings),
    "every SemanticOperation constructor must have an exact Program wire decoder arm",
  );
});

test("internal scheduling-mode wire decoding covers every closed variant", () => {
  const contract = readFileSync(
    fileURLToPath(new URL("../BpmnSemantics/SemanticProcessContract.lean", import.meta.url)),
    "utf8",
  );
  const decoder = readFileSync(
    fileURLToPath(
      new URL("../BpmnSemantics/SemanticProcessJson/Program.lean", import.meta.url),
    ),
    "utf8",
  );
  const expected = new Set(
    inductiveConstructors(contract, "InternalSchedulingMode"),
  );
  const decoded = new Set(
    declarationBody(decoder, "decodeInternalSchedulingMode")
      .split(/\r?\n/u)
      .flatMap((line) => {
        const match = /^  \| "([^"]+)" =>/u.exec(line);
        return match?.[1] === undefined ? [] : [match[1]];
      }),
  );

  assert.deepEqual(
    [...decoded].sort(compareCanonicalStrings),
    [...expected].sort(compareCanonicalStrings),
    "every InternalSchedulingMode constructor must have an exact Program decoder arm",
  );
});

test("public-projection and graph-edge inventories match every variant explicitly", () => {
  for (const { path: relativePath, declaration } of exhaustiveVariantInventories) {
    const source = readFileSync(
      fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
      "utf8",
    );
    const body = declarationBody(source, declaration);
    assert.equal(
      /^\s*\|\s*_\s*(?:,\s*_\s*)*=>/mu.test(body),
      false,
      `${relativePath}:${declaration} must not use a wildcard arm: a new semantic variant would silently contribute nothing to a public observation or a reachability edge`,
    );
  }
});
