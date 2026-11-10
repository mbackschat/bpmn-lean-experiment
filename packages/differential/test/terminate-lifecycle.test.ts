/**
 * PC-TERMINATE-01's public lifecycle: the journal of a Terminate End in a Sub-Process, checked against the publication
 * semantics' Terminate rule. The End starts and completes; every occurrence begun in the terminated region and still
 * open is cancelled exactly once, in the End's own transition, an occurrence of a deeper scope occurrence before one of
 * a shallower, and within one scope occurrence in issue order; the terminated Sub-Process then completes; and no open
 * occurrence outside the region ends. The CIB projection carries no lifecycle, so the oracle is this rule, not CIB
 * evidence. The witnesses are `scenarios/open-rows/terminate-containing-region/inner-scope-terminate`, which terminates
 * the nested `SubProcess_Child` and later `SubProcess_Region`, and `region-terminate-with-incident`, which terminates
 * `SubProcess_Region` around a live Event Sub-Process handler, a nested scope and an incident.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

import { readCaseKernelProgram } from "./kernel-program.ts";
import { projectRoot } from "./pipeline-target-support.ts";

type Transition = State["journal"][number];
type Key = Transition["started"][number]["occurrence"];

/** An open occurrence: its owning scope occurrence and its issue position among the run's starts. */
type Open = Readonly<{ owner: number; issued: number }>;

const keyOf = (key: Key): string => `${key.element}#${key.activation}/${key.role}`;

/** One Terminate End's transition and what it is checked against, as seen when its input ran. */
type Termination = Readonly<{
  end: string;
  transitions: readonly Transition[];
  at: number;
  /** The occurrences open just before the End's transition. */
  open: ReadonlyMap<string, Open>;
  /** Each scope occurrence ever issued in the run, with its parent. */
  parents: ReadonlyMap<number, number | null>;
}>;

/** Runs the scenario and records, for every committed input, each transition that starts one of `ends`. */
async function terminations(name: string, ends: readonly string[]): Promise<Termination[]> {
  const scenarioPath = path.join(projectRoot, "scenarios/open-rows/terminate-containing-region", `${name}.scenario.json`);
  const scenario = JSON.parse(await readFile(scenarioPath, "utf8")) as { profile: string; bpmn: { relativePath: string }; stimuli: unknown[] };
  const bytes = await readFile(path.join(projectRoot, scenario.bpmn.relativePath));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const program = await readCaseKernelProgram({ relativePath: scenario.bpmn.relativePath, bytes, sha256, overlay: null }, scenario.profile);
  const decoded = decodeProgram(program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const open = new Map<string, Open>();
  const parents = new Map<number, number | null>();
  const found: Termination[] = [];
  let issued = 0;
  let state: State | null = null;
  for (const json of scenario.stimuli) {
    const stimulus = stimulusFromJson(json);
    assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
    const outcome = step(hooks, decoded.value, state, stimulus.value[1]);
    if (!outcome.ok) {
      assert.equal(outcome.failure.tag, "rejected", JSON.stringify(outcome.failure));
      continue;
    }
    state = outcome.value;
    for (const scope of state.scopes) parents.set(scope.id, scope.parent);
    state.journal.forEach((transition, at) => {
      const end = transition.started.find((fact) => ends.includes(fact.occurrence.element));
      if (end !== undefined) {
        found.push({ end: end.occurrence.element, transitions: state!.journal, at, open: new Map(open), parents: new Map(parents) });
      }
      for (const fact of transition.started) open.set(keyOf(fact.occurrence), { owner: fact.owner, issued: issued++ });
      for (const [key] of transition.ended) open.delete(keyOf(key));
    });
  }
  return found;
}

function depth(parents: ReadonlyMap<number, number | null>, scope: number): number {
  let levels = 0;
  for (let current = parents.get(scope) ?? null; current !== null; current = parents.get(current) ?? null) levels += 1;
  return levels;
}

function within(parents: ReadonlyMap<number, number | null>, region: number, scope: number): boolean {
  for (let current: number | null = scope; current !== null; current = parents.get(current) ?? null) {
    if (current === region) return true;
  }
  return false;
}

/** Checks one termination of the Sub-Process `scope` against the rule; returns the cancelled elements in order. */
function checkTermination(termination: Termination, scope: string): string[] {
  const { transitions, at, open, parents, end } = termination;
  const transition = transitions[at]!;
  const region = transition.owner;
  const endKey = transition.started.find((fact) => fact.occurrence.element === end)!.occurrence;
  assert.deepEqual(transition.ended.at(-1), [endKey, "completed"], "the Terminate End starts and completes in its transition");

  const expected = [...open].filter(([, entry]) => within(parents, region, entry.owner)).map(([key]) => key).sort();
  const cancelled = transition.ended.slice(0, -1);
  assert.ok(cancelled.every(([, terminal]) => terminal === "cancelled"), "every other end in the transition is a cancellation");
  const keys = cancelled.map(([key]) => keyOf(key));
  assert.equal(new Set(keys).size, keys.length, "each occurrence is cancelled once");
  assert.deepEqual([...keys].sort(), expected, "exactly the open occurrences of the region are cancelled");

  const placed = keys.map((key) => open.get(key)!);
  placed.slice(1).forEach((entry, index) => {
    const before = placed[index]!;
    const [deep, shallow] = [depth(parents, before.owner), depth(parents, entry.owner)];
    assert.ok(deep >= shallow, `${keys[index]} at depth ${deep} is cancelled before ${keys[index + 1]} at depth ${shallow}`);
    if (before.owner === entry.owner) assert.ok(before.issued < entry.issued, `${keys[index]} is cancelled in issue order`);
  });

  const later = transitions.slice(at + 1);
  const completion = later.find((step) => step.ended.some(([key]) => key.element === scope));
  assert.deepEqual(completion?.ended.map(([key, terminal]) => [key.element, terminal]), [[scope, "completed"]], `${scope} completes`);
  assert.equal(completion?.cause.tag, "idle", `${scope} completes as its scope occurrence goes idle`);

  const outside = [...open].filter(([key, entry]) => !within(parents, region, entry.owner) && !key.startsWith(`${scope}#`));
  const endedLater = new Set(later.flatMap((step) => step.ended.map(([key]) => keyOf(key))));
  for (const [key] of outside) assert.ok(!endedLater.has(key), `${key} outside the region stays open`);
  return cancelled.map(([key]) => key.element);
}

test("a Terminate End in a nested Sub-Process cancels its sibling, then the Sub-Process completes", async () => {
  const [child, region, ...rest] = await terminations("inner-scope-terminate", ["EndEvent_ChildTerminate", "EndEvent_RegionTerminate"]);
  assert.equal(rest.length, 0);
  assert.equal(child?.end, "EndEvent_ChildTerminate");
  assert.deepEqual(checkTermination(child!, "SubProcess_Child"), ["UserTask_ChildWork"]);
  assert.equal(region?.end, "EndEvent_RegionTerminate");
  assert.deepEqual(checkTermination(region!, "SubProcess_Region"),
    ["IntermediateCatch_Deadline", "ServiceTask_Notify", "ServiceTask_Archive", "UserTask_Raise"]);
});

test("a Terminate End around a live handler, a nested scope and an incident cancels the deepest occurrences first", async () => {
  const [region, ...rest] = await terminations("region-terminate-with-incident", ["EndEvent_RegionTerminate"]);
  assert.equal(rest.length, 0);
  assert.deepEqual(checkTermination(region!, "SubProcess_Region"), [
    "UserTask_Handle", "UserTask_ChildTrigger", "UserTask_ChildWork", "UserTask_Review", "ReceiveTask_Reply",
    "IntermediateCatch_Deadline", "ServiceTask_Notify", "ServiceTask_Archive", "SubProcess_Child", "Handler_Region_Alert",
  ]);
});
