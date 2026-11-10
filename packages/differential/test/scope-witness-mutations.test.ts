/**
 * Seeded mutations of scope completion, interruption and Terminate that the retained CIB witnesses of PC-SCOPE-01,
 * PC-SCOPE-07 and PC-TERMINATE-01 must notice (ENGINEERING-POLICY "Red/green semantic workflow", step 6). Each test
 * runs one witness twice through `step`: with the registered hooks, which must agree with the retained evidence, and
 * with one realistic wrong account, which must disagree with it. A mutant either wraps one hook or rewrites the state a
 * committed input left, so it stays outside the kernel's modules.
 *
 * The rows' acceptance names the mutants: a first End completing its Sub-Process and a child continuing in the wrong
 * parent (PC-SCOPE-01); interruption that removes only the host's own work or deletes beyond it (PC-SCOPE-07); a
 * Terminate that clears the whole instance or leaves waits of its region open (PC-TERMINATE-01).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  ComparisonKind,
  DifferentialTarget,
  compareTargetResults,
  foldSynchronousEffects,
} from "@bpmn-lean/differential";
import {
  FailureTag, decodeProgram, elementHeader, failureCode, failureName, hooks, observationJson, step, stimulusFromJson,
} from "@bpmn-lean/kernel";
import type { Program, State } from "@bpmn-lean/kernel";

import { projectRoot } from "./pipeline-target-support.ts";
import { readSourceFor } from "./scenario-discovery.ts";
import type { CanonicalResult, ScenarioDocument } from "./scenario-discovery.ts";

type Hooks = typeof hooks;
type Json = Record<string, any>;
/** Rewrites the state a committed input left; `before` is the state the input started from. */
type Surgery = (commandId: string, before: State | null, after: State) => State;
type Mutant = Readonly<{ hooks?: Hooks; surgery?: Surgery }>;

type Witness = Readonly<{
  program: Program;
  stimuli: ReadonlyArray<readonly [string, unknown]>;
  evidence: CanonicalResult;
  synchronousAfter: ReadonlySet<string>;
  effectInputs: ReadonlySet<string>;
}>;

async function witness(directory: string, name: string): Promise<Witness> {
  const base = path.join("scenarios/open-rows", directory, name);
  const scenario = JSON.parse(await readFile(path.join(projectRoot, `${base}.scenario.json`), "utf8")) as ScenarioDocument;
  const stimuli = scenario.stimuli as ReadonlyArray<Json>;
  const evidence = JSON.parse(await readFile(path.join(projectRoot, `${base}.cibseven-evidence.json`), "utf8")) as Json;
  const read = await readSourceFor(`${base}.scenario.json`, scenario.bpmn, scenario.profile);
  assert.equal(read.kind, "read", JSON.stringify(read));
  const decoded = decodeProgram((read as Extract<typeof read, { kind: "read" }>).program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return {
    program: decoded.value,
    stimuli: stimuli.map((stimulus) => {
      const parsed = stimulusFromJson(stimulus);
      assert.ok(parsed.ok, parsed.ok ? "" : parsed.refusal);
      return parsed.value;
    }),
    evidence: evidence["result"] as CanonicalResult,
    synchronousAfter: new Set(((evidence["producerObservations"]?.["mappingExecutions"] ?? []) as Json[])
      .map((run) => run["afterCommandId"] as string)),
    effectInputs: new Set(stimuli.filter((stimulus) => stimulus["kind"] === "effectResult")
      .map((stimulus) => stimulus["commandId"] as string)),
  };
}

/** The canonical result of `run.ts`'s scenario runner, under `mutant`. */
function run(subject: Witness, mutant: Mutant): CanonicalResult {
  const trace: Json[] = [{ kind: "deployment", outcome: "committed" }];
  let state: State | null = null;
  let outcome = "committed";
  for (const [index, [commandId, input]] of subject.stimuli.entries()) {
    const stepped = step(mutant.hooks ?? hooks, subject.program, state, input as Parameters<typeof step>[3]);
    if (stepped.ok) {
      state = mutant.surgery === undefined ? stepped.value : mutant.surgery(commandId, state, stepped.value);
      trace.push({ kind: "command", commandId, outcome: "committed" }, observationJson(subject.program, state) as Json);
      continue;
    }
    trace.push({ kind: "command", commandId, outcome: failureName(stepped.failure), code: failureCode(stepped.failure) });
    if (state !== null) trace.push(observationJson(subject.program, state) as Json);
    if (stepped.failure.tag !== FailureTag.Rejected || index === subject.stimuli.length - 1) {
      outcome = failureName(stepped.failure);
      break;
    }
  }
  return JSON.parse(JSON.stringify({ outcome: { kind: "semantic", outcome }, trace })) as CanonicalResult;
}

function agrees(subject: Witness, mutant: Mutant): boolean {
  const folded = foldSynchronousEffects(run(subject, mutant), subject.evidence, {
    synchronousAfter: subject.synchronousAfter,
    effectInputs: subject.effectInputs,
  });
  return compareTargetResults(
    { target: DifferentialTarget.RetainedCibEvidence, result: subject.evidence },
    [{ target: DifferentialTarget.KernelTs, result: folded }],
  ).kind === ComparisonKind.Agreement;
}

/** The registered kernel agrees with every witness and `mutant` disagrees with at least one. */
async function noticed(directory: string, names: readonly string[], mutant: Mutant): Promise<void> {
  const subjects = await Promise.all(names.map((name) => witness(directory, name)));
  assert.deepEqual(subjects.map((subject) => agrees(subject, {})), names.map(() => true));
  assert.ok(subjects.some((subject) => !agrees(subject, mutant)), `no witness of ${directory} notices the mutant`);
}

const parentOf = (state: State, scope: number): number | null =>
  state.scopes.find((candidate) => candidate.id === scope)?.parent ?? null;

type Thrown = Parameters<Hooks["arriveThrow"]>[3];

/** The throw record the kernel decoded for the End Event `id`, so that a mutant names a throw kind by a witness's own
 * element rather than by a vocabulary literal. */
function throwOf(program: Program, id: string): Thrown {
  const element = program.elements.find((entry) => elementHeader(entry).id === id) as Json | undefined;
  const record = element?.["payload"]?.["role"]?.["record"] as Thrown | undefined;
  assert.ok(record !== undefined, `${id} is no throw Event`);
  return record;
}

/** The Terminate throw of the nested `Child` scope's End in the review desk model. */
async function terminateThrow(): Promise<Thrown> {
  return throwOf((await witness("terminate-containing-region", "inner-scope-terminate")).program, "EndEvent_ChildTerminate");
}

/** An ordinary embedded Sub-Process's scope occurrence: one with an element, owned by an occurrence, not a called root. */
const embedded = (state: State, scope: number | null): boolean => {
  const found = state.scopes.find((candidate) => candidate.id === scope);
  return found !== undefined && found.element !== null && found.occurrence !== null && found.calledInstance === null;
};

/** The scope occurrences an input removed whose parent it kept: the occurrences it left or interrupted. */
function removedRoots(before: State, after: State): number[] {
  const kept = new Set(after.scopes.map((scope) => scope.id));
  return before.scopes.filter((scope) => !kept.has(scope.id) && scope.parent !== null && kept.has(scope.parent))
    .map((scope) => scope.id);
}

function subtreeOf(state: State, root: number): Set<number> {
  const inside = new Set([root]);
  for (let grown = true; grown;) {
    grown = false;
    for (const scope of state.scopes) {
      if (scope.parent !== null && inside.has(scope.parent) && !inside.has(scope.id)) {
        inside.add(scope.id);
        grown = true;
      }
    }
  }
  return inside;
}

/** `after` with the rows of `before` that sat in `scopes` put back. */
function restore(before: State, after: State, scopes: ReadonlySet<number>): State {
  const back = <T>(rows: readonly T[], kept: readonly T[], at: (row: T) => number): T[] =>
    [...kept, ...rows.filter((row) => scopes.has(at(row)) && !kept.includes(row))];
  return {
    ...after,
    scopes: back(before.scopes, after.scopes, (scope) => scope.id),
    occurrences: back(before.occurrences, after.occurrences, (occurrence) => occurrence.scope),
    tokens: back(before.tokens, after.tokens, (token) => token.scope),
    variables: back(before.variables, after.variables, (entry) => entry.scope),
    openItems: back(before.openItems, after.openItems, (item) => item.scope),
  };
}

const quiescence = ["stock-end-first", "verification-last-reverse", "inclusive-join-both-and-waiver", "default-branch-and-stale"];

test("PC-SCOPE-01: a first End that completes its Sub-Process is noticed", async () => {
  const terminate = await terminateThrow();
  const none = throwOf((await witness("nested-scope-quiescence", quiescence[0]!)).program, "EndEvent_Reserved");
  // A None End inside an embedded Sub-Process ends it as a Terminate End would.
  const firstEnd: Hooks = {
    ...hooks,
    arriveThrow: (ctx, header, payload, thrown, occurrence, state) =>
      hooks.arriveThrow(ctx, header, payload,
        thrown.tag === none.tag && embedded(state, occurrence.scope) ? terminate : thrown, occurrence, state),
  };
  await noticed("nested-scope-quiescence", quiescence, { hooks: firstEnd });
});

test("PC-SCOPE-01: a nested Sub-Process whose completion completes its parent is noticed", async () => {
  const wrongParent: Hooks = {
    ...hooks,
    completeScope: (ctx, header, payload, scope, owner, state) => {
      // A Sub-Process nested in another completes the outer one's occurrence instead of its own.
      const parent = state.scopes.find((candidate) => candidate.id === scope.parent);
      const parentOwner = state.occurrences.find((candidate) => candidate.id === parent?.occurrence);
      const nested = embedded(state, scope.parent) && parentOwner !== undefined;
      return hooks.completeScope(ctx, header, payload, scope, nested ? parentOwner : owner, state);
    },
  };
  await noticed("nested-scope-quiescence", quiescence, { hooks: wrongParent });
});

const interruption = ["abort-one-region-mid-work", "abort-both-regions-in-turn", "call-timeout-inside-region"];

test("PC-SCOPE-07: an interruption that removes only the host's own work is noticed", async () => {
  // Nested scope occurrences, a called instance among them, survive with their waits.
  const parentOnly: Surgery = (_, before, after) => {
    if (before === null) return after;
    const nested = new Set(removedRoots(before, after).flatMap((root) => [...subtreeOf(before, root)].filter((id) => id !== root)));
    return restore(before, after, nested);
  };
  await noticed("region-interruption-subtree", interruption, { surgery: parentOnly });
});

test("PC-SCOPE-07: an interruption that also deletes the host's siblings is noticed", async () => {
  // Every wait outside the interrupted host that was open before the input goes too.
  const broad: Surgery = (_, before, after) => {
    if (before === null || removedRoots(before, after).length === 0) return after;
    const earlier = new Set(before.openItems.map((item) => item.id));
    return { ...after, openItems: after.openItems.filter((item) => !earlier.has(item.id)) };
  };
  await noticed("region-interruption-subtree", interruption, { surgery: broad });
});

test("PC-TERMINATE-01: a nested Terminate that clears the whole instance is noticed", async () => {
  const terminate = await terminateThrow();
  const global: Hooks = {
    ...hooks,
    arriveThrow: (ctx, header, payload, thrown, occurrence, state) => {
      if (thrown.tag !== terminate.tag) return hooks.arriveThrow(ctx, header, payload, thrown, occurrence, state);
      let root = occurrence.scope;
      for (let parent = parentOf(state, root); parent !== null; parent = parentOf(state, root)) root = parent;
      return hooks.arriveThrow(ctx, header, payload, thrown, { ...occurrence, scope: root }, state);
    },
  };
  await noticed("terminate-containing-region", ["inner-scope-terminate"], { hooks: global });
});

test("PC-TERMINATE-01: a nested Terminate that leaves a wait of its region open is noticed", async () => {
  const terminate = await terminateThrow();
  // The Terminate's other waits in its own scope occurrence stay open.
  const incomplete: Hooks = {
    ...hooks,
    arriveThrow: (ctx, header, payload, thrown, occurrence, state) => {
      const outcome = hooks.arriveThrow(ctx, header, payload, thrown, occurrence, state);
      if (thrown.tag !== terminate.tag || !outcome.ok) return outcome;
      const left = state.openItems.filter((item) => item.scope === occurrence.scope && item.occurrence !== occurrence.id);
      const owners = state.occurrences.filter((candidate) => left.some((item) => item.occurrence === candidate.id));
      return { ...outcome, value: { ...outcome.value, openItems: [...outcome.value.openItems, ...left],
        occurrences: [...outcome.value.occurrences, ...owners] } };
    },
  };
  await noticed("terminate-containing-region", ["inner-scope-terminate"], { hooks: incomplete });
});
