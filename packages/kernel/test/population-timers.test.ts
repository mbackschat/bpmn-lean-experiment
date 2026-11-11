/**
 * `Population.timerStart` (PC-TIMER-04, M8-INT-A): a Timer-start occurrence is named by its due instant and fires at the
 * command's logical time. It commits iff its start is a root Timer start of the deployment, the due instant is one of
 * the schedule's counted from the deploy time, the firing is not before it, the deployment is current for its key and
 * the occurrence is unconsumed; the instance `timer:<len>:<deploymentId>:<len>:<startEvent>:<dueMs>` takes the firing
 * time.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runPopulation } from "@bpmn-lean/kernel";

import { activity, base, duration, replace, start, userWork, wired } from "./admission-refusal-support.ts";

type Json = Record<string, unknown>;

const hour = 3_600_000;

/** `key`'s process: a root Timer start on `trigger`, by default due one hour after its deployment, then a User Task. */
const timed = (key: string, trigger: Json = duration("PT1H")): Json => {
  const program = wired(replace(replace(base(), "S", start("S", trigger)), "T", activity("T", userWork())));
  return { ...program, identity: { ...(program.identity as Json), processId: key, sourceSha256: `${key}-sha` } };
};

const definition = (definitionRef: string, program: Json): Json => ({
  definitionRef,
  bpmn: {
    id: definitionRef, relativePath: `scenarios/${definitionRef}.bpmn`, sha256: (program.identity as Json).sourceSha256, sourceOverlay: null,
  },
});

/** Run `steps` over one definition deployed by its `deploy` steps, each step's digest its JSON text. */
function populate(program: Json, deployments: number, steps: readonly Json[]): Json {
  const scenario = { kind: "populationScenario", id: "population-timers", profile: "bpmn-2.0.2", definitions: [definition("d1", program)], steps };
  return runPopulation(Array.from({ length: deployments }, () => program), scenario, steps.map((step) => JSON.stringify(step))) as Json;
}

const fire = (commandId: string, deploymentId: number, dueMs: number, at: number, startEvent = "S"): Json =>
  ({ kind: "timerStart", commandId, deploymentId, startEvent, dueMs, at });
const deploy = (at: number): Json => ({ kind: "deploy", definitionRef: "d1", at });
const resolutions = (result: Json): unknown[] => (result.steps as Json[]).map((step) => step.resolution);
const started = (instanceId: string, deploymentId: number, version: number): Json =>
  ({ kind: "fanOut", entries: [{ kind: "started", instanceId, deploymentId, version, startEvent: "S" }] });
const rejected = (code: string): Json => ({ kind: "rejected", code });

test("a due occurrence fired late commits once and its instance takes the firing time", () => {
  const result = populate(timed("Batch"), 1, [
    deploy(0),
    fire("t1", 1, hour, hour + 60_000),
    fire("t2", 1, hour, hour + 120_000),
  ]);
  assert.deepEqual(resolutions(result), [started("timer:1:1:1:S:3600000", 1, 1), rejected("timer-start-occurrence-consumed")]);
  const states = result.processStates as Json[];
  assert.deepEqual(states.map((state) => [state.instanceId, state.logicalTimeMs]), [["timer:1:1:1:S:3600000", hour + 60_000]]);
});

test("an unknown, early, superseded or unaddressed occurrence is rejected and starts nothing", () => {
  const result = populate(timed("Batch"), 2, [
    deploy(0),
    fire("unknown", 1, 1_000, 5_000),
    fire("early", 1, hour, hour - 100_000),
    deploy(hour - 50_000),
    fire("superseded", 1, hour, hour),
    fire("current", 2, 2 * hour - 50_000, 2 * hour - 50_000),
    fire("not-a-timer", 2, 2 * hour - 50_000, 2 * hour - 50_000, "T"),
    fire("missing", 9, hour, 2 * hour),
  ]);
  assert.deepEqual(resolutions(result), [
    rejected("timer-occurrence-unknown"),
    rejected("timer-not-due"),
    rejected("timer-start-superseded"),
    started(`timer:1:2:1:S:${String(2 * hour - 50_000)}`, 2, 2),
    rejected("no-start-event"),
    rejected("definition-not-deployed"),
  ]);
  assert.equal((result.processStates as Json[]).length, 1);
});

test("a replayed Timer-start command answers its recorded resolution and starts nothing more", () => {
  const sent = fire("t1", 1, hour, hour);
  const result = populate(timed("Batch"), 1, [deploy(0), sent, sent]);
  assert.deepEqual(resolutions(result), [started("timer:1:1:1:S:3600000", 1, 1), started("timer:1:1:1:S:3600000", 1, 1)]);
  assert.equal((result.processStates as Json[]).length, 1);
});
