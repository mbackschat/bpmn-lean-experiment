import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome,
  RuntimeStateDefect,
  applyStimulus,
  initialState,
  projectCurrentControlPositions,
  runtimeStateDefects,
  type RuntimeState,
} from "@bpmn-lean/semantic-core";
import type { ControlPlaceTokens } from "../src/semantic-process-state.ts";
import { frontier, program } from "./internal-commutation-fixture.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import {
  completionStimulus,
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";

const { addToken, removeToken } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

const owner = frontier.scopeOccurrences[0]!.id;

test("reversed token places fail only storage order beside a position-valid canonical control", () => {
  assert.deepEqual(runtimeStateDefects(program, owner.processInstanceId, frontier), []);
  assert.notEqual(projectCurrentControlPositions(program, frontier), null);
  const reversed = { ...frontier, controlTokens: [...frontier.controlTokens].reverse() };
  assert.notEqual(projectCurrentControlPositions(program, reversed), null);
  assert.deepEqual(runtimeStateDefects(program, owner.processInstanceId, reversed), [
    RuntimeStateDefect.UnorderedCollection,
  ]);
});

test("same-place token owners require numeric activation order beside a position-valid control", () => {
  const scopeId = "scope:Child";
  const placeId = "place:Flow_TaskInput";
  const child2 = { ...owner, definitionScopeId: scopeId, activation: 2 };
  const child10 = { ...owner, definitionScopeId: scopeId, activation: 10 };
  const childProgram = {
    ...program,
    definitionScopes: [...program.definitionScopes, {
      id: scopeId, parentScopeId: owner.definitionScopeId, originElementId: "Child",
    }],
    controlPlaceScopes: program.controlPlaceScopes.map((binding) =>
      binding.controlPlaceId === placeId ? { ...binding, scopeId } : binding),
  };
  const canonical: RuntimeState = {
    ...frontier,
    scopeOccurrences: [{ id: child2, parent: owner }, { id: child10, parent: owner },
      ...frontier.scopeOccurrences],
    controlTokens: [
      { placeId, owner: child2, multiplicity: 1 },
      { placeId, owner: child10, multiplicity: 1 },
    ],
  };
  assert.deepEqual(runtimeStateDefects(childProgram, owner.processInstanceId, canonical), []);
  assert.notEqual(projectCurrentControlPositions(childProgram, canonical), null);
  const reversed = { ...canonical, controlTokens: [...canonical.controlTokens].reverse() };
  assert.notEqual(projectCurrentControlPositions(childProgram, reversed), null);
  assert.deepEqual(runtimeStateDefects(childProgram, owner.processInstanceId, reversed), [
    RuntimeStateDefect.UnorderedCollection,
  ]);
});

test("position projection separately refuses duplicate buckets and nonpositive multiplicity", () => {
  const token = frontier.controlTokens[0]!;
  const canonical = { ...frontier, controlTokens: [{ ...token, multiplicity: 2 }] };
  assert.deepEqual(runtimeStateDefects(program, owner.processInstanceId, canonical), []);
  assert.notEqual(projectCurrentControlPositions(program, canonical), null);
  for (const controlTokens of [[token, token], [{ ...token, multiplicity: 0 }]]) {
    const malformed = { ...frontier, controlTokens };
    assert.equal(projectCurrentControlPositions(program, malformed), null);
  }
});

test("admitted initiation, fork, completion, and join store canonical tokens without repair", () => {
  const start = startStimulus();
  const parallelOwner = {
    processInstanceId: start.instanceId,
    definitionScopeId: "scope:Process_ParallelForkJoin",
    activation: 1,
  };
  const check = (state: RuntimeState, controlTokens: ReadonlyArray<ControlPlaceTokens>) => {
    assert.deepEqual(state.controlTokens, controlTokens);
    assert.deepEqual(runtimeStateDefects(parallelProgram, start.instanceId, state), []);
    assert.notEqual(projectCurrentControlPositions(parallelProgram, state), null);
  };
  check(admittedInternalPrefix(parallelProgram, initialState, start,
    ["operation:StartEvent_1"], ["operation:Gateway_Fork"]), [
    { placeId: "place:Flow_StartToFork", owner: parallelOwner, multiplicity: 1 },
  ]);
  check(admittedInternalPrefix(parallelProgram, initialState, start,
    ["operation:StartEvent_1", "operation:Gateway_Fork"], ["operation:UserTask_A", "operation:UserTask_B"]), [
    { placeId: "place:Flow_ForkToA", owner: parallelOwner, multiplicity: 1 },
    { placeId: "place:Flow_ForkToB", owner: parallelOwner, multiplicity: 1 },
  ]);
  const started = applyStimulus(parallelProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  check(started.state, []);
  const joined: RuntimeState[] = [];
  for (const [firstTask, secondTask, firstOutput] of [
    ["UserTask_A", "UserTask_B", "place:Flow_AToJoin"],
    ["UserTask_B", "UserTask_A", "place:Flow_BToJoin"],
  ] as const) {
    const first = applyStimulus(parallelProgram, started.state, completionStimulus(firstTask));
    assert.equal(first.outcome, CommandOutcome.Committed);
    check(first.state, [{ placeId: firstOutput, owner: parallelOwner, multiplicity: 1 }]);
    const beforeJoin = admittedInternalPrefix(parallelProgram, first.state,
      completionStimulus(secondTask), [], ["operation:Gateway_Join"]);
    check(beforeJoin, [
      { placeId: "place:Flow_AToJoin", owner: parallelOwner, multiplicity: 1 },
      { placeId: "place:Flow_BToJoin", owner: parallelOwner, multiplicity: 1 },
    ]);
    const afterJoin = admittedInternalPrefix(parallelProgram, first.state,
      completionStimulus(secondTask), ["operation:Gateway_Join"], ["operation:EndEvent_1"]);
    check(afterJoin, [{ placeId: "place:Flow_JoinToEnd", owner: parallelOwner, multiplicity: 1 }]);
    joined.push(afterJoin);
  }
  assert.deepEqual(joined[0], joined[1]);
});

const rawOwner = { processInstanceId: "Instance", definitionScopeId: "Scope", activation: 2 };
const rawBucket = { placeId: "Place", owner: rawOwner, multiplicity: 1 };

// These raw helper fixtures do not claim Program binding or runtime scope validity.
const orderedPairs: ReadonlyArray<readonly [string, ControlPlaceTokens, ControlPlaceTokens]> = [
  ["place precedes owner", { ...rawBucket, placeId: "A", owner: { ...rawOwner, processInstanceId: "Z" } },
    { ...rawBucket, placeId: "Z", owner: { ...rawOwner, processInstanceId: "A" } }],
  ["instance precedes scope", { ...rawBucket, owner: { ...rawOwner, processInstanceId: "A", definitionScopeId: "Z" } },
    { ...rawBucket, owner: { ...rawOwner, processInstanceId: "Z", definitionScopeId: "A" } }],
  ["scope precedes activation", { ...rawBucket, owner: { ...rawOwner, definitionScopeId: "A", activation: 10 } },
    { ...rawBucket, owner: { ...rawOwner, definitionScopeId: "Z", activation: 2 } }],
  ["activation is numeric", rawBucket, { ...rawBucket, owner: { ...rawOwner, activation: 10 } }],
  ["place uses Unicode scalars", { ...rawBucket, placeId: "\uE000" }, { ...rawBucket, placeId: "\u{10000}" }],
  ["instance uses Unicode scalars", { ...rawBucket, owner: { ...rawOwner, processInstanceId: "\uE000" } },
    { ...rawBucket, owner: { ...rawOwner, processInstanceId: "\u{10000}" } }],
  ["scope uses Unicode scalars", { ...rawBucket, owner: { ...rawOwner, definitionScopeId: "\uE000" } },
    { ...rawBucket, owner: { ...rawOwner, definitionScopeId: "\u{10000}" } }],
];

for (const [name, first, second] of orderedPairs) {
  test(`opposite token insertions yield exact raw buckets: ${name}`, () => {
    const forward = addToken(addToken([], first.placeId, first.owner), second.placeId, second.owner);
    const backward = addToken(addToken([], second.placeId, second.owner), first.placeId, first.owner);
    const expected = [first, second];
    assert.deepEqual(forward, expected);
    assert.deepEqual(backward, expected);
    assert.deepEqual(forward, backward);
  });
}

test("identical-key insertions count one bucket and each removal consumes one unit", () => {
  const once = addToken([], rawBucket.placeId, rawOwner);
  const twice = addToken(once, rawBucket.placeId, rawOwner);
  assert.deepEqual(once, [rawBucket]);
  assert.deepEqual(twice, [{ ...rawBucket, multiplicity: 2 }]);
  const remaining = removeToken(twice, rawBucket.placeId, rawOwner);
  assert.deepEqual(remaining, [rawBucket]);
  assert.deepEqual(removeToken(remaining, rawBucket.placeId, rawOwner), []);
  assert.deepEqual(twice, [{ ...rawBucket, multiplicity: 2 }]);
});

for (const [name, first, second] of orderedPairs) {
  test(`token updates preserve the other complete key and raw order: ${name}`, () => {
    const before = [first, second];
    assert.deepEqual(addToken(before, first.placeId, first.owner), [{ ...first, multiplicity: 2 }, second]);
    assert.deepEqual(addToken(before, second.placeId, second.owner), [first, { ...second, multiplicity: 2 }]);
    assert.deepEqual(removeToken(before, first.placeId, first.owner), [second]);
    assert.deepEqual(removeToken(before, second.placeId, second.owner), [first]);
    const twice = [{ ...first, multiplicity: 2 }, { ...second, multiplicity: 2 }];
    const forward = removeToken(removeToken(twice, first.placeId, first.owner), second.placeId, second.owner);
    const backward = removeToken(removeToken(twice, second.placeId, second.owner), first.placeId, first.owner);
    assert.deepEqual(forward, before);
    assert.deepEqual(backward, before);
    assert.deepEqual(removeToken(before, "Absent", rawOwner), before);
    assert.deepEqual(before, [first, second]);
  });
}
