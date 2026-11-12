/**
 * Seeded mutations of joins, implicit merges and splits, and race ownership that the retained CIB witnesses of
 * PC-CF-03, PC-CF-04, PC-CF-07 and PC-CF-08 must notice (ENGINEERING-POLICY "Red/green semantic workflow", step 6). Each
 * test runs its witnesses through `step` twice: with the registered hooks, which must agree with the retained evidence,
 * and with one realistic wrong account, which must disagree with at least one of them. A mutant wraps one hook, so it
 * stays outside the kernel's modules.
 *
 * The rows' acceptance names the mutants: lost multiplicity and an early join (PC-CF-03); a premature Inclusive join
 * (PC-CF-04; its opposite, waiting forever, is CIB-DEV-0002's and `flow-inclusive-join-activation.test.ts`'s); an
 * accidental join, deduplication and exclusive choice at an Activity with several incoming or outgoing flows (PC-CF-07);
 * wrong branch order, wrong join population and stale region ownership across the composition matrix (PC-CF-08). The
 * matrix witnesses write no name two branches race on, so the branch-order cell is noticed by the composed splits of
 * `split-branch-order` (CIB-OP-0016), whose evidence fixes which write is left.
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
  FailureTag, LeaveTag, decodeProgram, elementActivity, failureCode, failureName, hooks, leaveFlows, observationJson,
  programElement, step, stimulusFromJson,
} from "@bpmn-lean/kernel";
import type { Program, State } from "@bpmn-lean/kernel";

import { projectRoot } from "./pipeline-target-support.ts";
import { readSourceFor } from "./scenario-discovery.ts";
import type { CanonicalResult, ScenarioDocument } from "./scenario-discovery.ts";

type Hooks = typeof hooks;
type Json = Record<string, any>;

type Witness = Readonly<{
  label: string;
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
    label: `${directory}/${name}`,
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

/** The canonical result of `run.ts`'s scenario runner under `mutant`. */
function run(subject: Witness, mutant: Hooks): CanonicalResult {
  const trace: Json[] = [{ kind: "deployment", outcome: "committed" }];
  let state: State | null = null;
  let outcome = "committed";
  for (const [index, [commandId, input]] of subject.stimuli.entries()) {
    const stepped = step(mutant, subject.program, state, input as Parameters<typeof step>[3]);
    if (stepped.ok) {
      state = stepped.value;
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

function agrees(subject: Witness, mutant: Hooks): boolean {
  const folded = foldSynchronousEffects(run(subject, mutant), subject.evidence, {
    synchronousAfter: subject.synchronousAfter,
    effectInputs: subject.effectInputs,
  });
  return compareTargetResults(
    { target: DifferentialTarget.RetainedCibEvidence, result: subject.evidence },
    [{ target: DifferentialTarget.KernelTs, result: folded }],
  ).kind === ComparisonKind.Agreement;
}

/** The registered kernel agrees with every witness, and `mutant` disagrees with at least one. */
async function noticed(witnesses: ReadonlyArray<readonly [string, string]>, mutant: Hooks): Promise<void> {
  const subjects = await Promise.all(witnesses.map(([directory, name]) => witness(directory, name)));
  assert.deepEqual(subjects.filter((subject) => !agrees(subject, hooks)).map((subject) => subject.label), []);
  assert.ok(subjects.some((subject) => !agrees(subject, mutant)), "no witness notices the mutant");
}

const isActivity = (program: Program, id: string): boolean => {
  const element = programElement(program, id);
  return element !== null && elementActivity(element) !== null;
};

/** A converging gateway that treats the flow an arrival came on as its only incoming flow, so every arrival fires it. */
const joinOnArrival: Hooks = {
  ...hooks,
  arriveGateway: (ctx, header, payload, occurrence, state) =>
    hooks.arriveGateway(ctx, header,
      occurrence.incoming === null ? payload : { ...payload, incoming: [occurrence.incoming] }, occurrence, state),
};

test("PC-CF-03: a Parallel join that fires before every incoming flow holds a token is noticed", async () => {
  await noticed([
    ["parallel-region-compositions", "three-way-join-reverse-order"],
    ["parallel-region-compositions", "order-fulfilment-pick-first"],
  ], joinOnArrival);
});

test("PC-CF-03: a join that loses the tokens beyond its arity is noticed", async () => {
  // A join that takes at most one arrival per incoming flow in its scope and drops every later one, so the excess token
  // of a flow that delivered twice never waits at the join.
  const lostMultiplicity: Hooks = {
    ...hooks,
    arriveGateway: (ctx, header, payload, occurrence, state) =>
      payload.incoming.length > 1 && occurrence.activation > payload.incoming.length
        ? hooks.arriveGateway(ctx, header, { ...payload, incoming: [], outgoing: [] }, occurrence, state)
        : hooks.arriveGateway(ctx, header, payload, occurrence, state),
  };
  await noticed([["parallel-region-compositions", "duplicate-arrival-join-right-first"]], lostMultiplicity);
});

test("PC-CF-04: an Inclusive join that fires while a selected branch can still reach it is noticed", async () => {
  await noticed([
    ["inclusive-join-compositions", "parallel-fed-join-a-then-b"],
    ["inclusive-join-compositions", "structured-regions-two-selected-credit-first"],
    ["inclusive-join-compositions", "scoped-join-counted-call-and-batch-reversed"],
  ], joinOnArrival);
});

const merges = [["activity-split-merge", "review-split-both-flows"], ["activity-split-merge", "embedded-split-both-flows"]] as const;

test("PC-CF-07: an Activity whose second arrival joins the first is noticed", async () => {
  // The first arrival at an Activity with several incoming flows begins nothing and waits for a second one, as a join
  // would; the mutant remembers arrivals per run.
  const waiting = new Set<string>();
  const accidentalJoin: Hooks = {
    ...hooks,
    arriveActivity: (ctx, header, payload, occurrence, state) => {
      const key = `${occurrence.scope}:${header.id}`;
      if (payload.envelope.incoming.length < 2 || waiting.delete(key)) {
        return hooks.arriveActivity(ctx, header, payload, occurrence, state);
      }
      waiting.add(key);
      return hooks.outflow(ctx, occurrence, leaveFlows([]), state);
    },
  };
  await noticed(merges, accidentalJoin);
});

test("PC-CF-07: an Activity that absorbs an arrival while it is already open is noticed", async () => {
  const deduplicated: Hooks = {
    ...hooks,
    arriveActivity: (ctx, header, payload, occurrence, state) =>
      state.openItems.some((item) => item.element === header.id && item.scope === occurrence.scope)
        ? hooks.outflow(ctx, occurrence, leaveFlows([]), state)
        : hooks.arriveActivity(ctx, header, payload, occurrence, state),
  };
  await noticed(merges, deduplicated);
});

test("PC-CF-07: an Activity that takes only its first holding outgoing flow is noticed", async () => {
  const exclusiveChoice: Hooks = {
    ...hooks,
    select: (ctx, occurrence, leave, state) => {
      const selected = hooks.select(ctx, occurrence, leave, state);
      if (!selected.ok || selected.value.tag !== LeaveTag.Flows || !isActivity(ctx.program, occurrence.element)) return selected;
      return { ok: true, value: leaveFlows(selected.value.selected.slice(0, 1)) };
    },
  };
  await noticed(merges, exclusiveChoice);
});

const matrix = [
  ["gateway-composition-matrix", "exclusive-in-parallel-express-pack-first"],
  ["gateway-composition-matrix", "exclusive-in-parallel-standard-print-first"],
  ["gateway-composition-matrix", "parallel-in-inclusive-gift-and-insured"],
  ["gateway-composition-matrix", "parallel-in-inclusive-gift-only"],
  ["inclusive-join-compositions", "scoped-join-counted-all-selected"],
  ["inclusive-join-compositions", "loop-reentry-both-then-a-only"],
  ["event-race-compositions", "parallel-race-message-then-payment-late-timer"],
] as const;

test("PC-CF-08: a matrix join with the wrong population is noticed", async () => {
  await noticed(matrix, joinOnArrival);
});

test("PC-CF-08: a split that runs its branches in reverse declaration order is noticed", async () => {
  const reversed: Hooks = {
    ...hooks,
    outflow: (ctx, occurrence, leave, state) =>
      hooks.outflow(ctx, occurrence, leave.tag === LeaveTag.Flows ? leaveFlows([...leave.selected].reverse()) : leave, state),
  };
  await noticed([
    ...matrix,
    ["split-branch-order", "inclusive-split-both-selected"],
    ["split-branch-order", "nested-fork-all-branches"],
  ], reversed);
});

test("PC-CF-08: a delivery to an earlier region's race that settles the current one is noticed", async () => {
  // A delivery naming an activation no longer open is redirected to the latest open activation of the same element.
  const staleOwner: Hooks = {
    ...hooks,
    delivered: (ctx, data, state) => {
      const found = hooks.delivered(ctx, data, state);
      if (found.ok) return found;
      const activations = state.openItems.filter((item) => item.element === data.occurrence.element)
        .flatMap((item) => state.occurrences.filter((occurrence) => occurrence.id === item.occurrence))
        .map((occurrence) => occurrence.activation);
      if (activations.length === 0) return found;
      return hooks.delivered(ctx, { ...data, occurrence: { ...data.occurrence, activation: Math.max(...activations) } }, state);
    },
  };
  await noticed([
    ["event-race-compositions", "scoped-race-retry-then-delivered"],
    ["event-race-compositions", "reply-race-repeated-previous-race-identity"],
  ], staleOwner);
});
