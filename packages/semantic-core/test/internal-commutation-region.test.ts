import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ControlStateKind,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  CalledProcessOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "@bpmn-lean/semantic-core";

type RegionModule = typeof import("../src/internal-transition-region.ts");

const regionModule = await import(
  new URL("../dist/internal-transition-region.js", import.meta.url).href
) as RegionModule;

const {
  deriveInternalOccurrenceRegion,
  internalOccurrenceRegionContains,
  internalOccurrenceRegionOwnsCall,
  internalOccurrenceRegionOwnsInsertion,
  internalOccurrenceRegionsOverlap,
} = regionModule;

const root = scope("Instance_Region", "Process_Region", 1);
const left = scope("Instance_Region", "Scope_Left", 1);
const leftChild = scope("Instance_Region", "Scope_LeftChild", 1);
const right = scope("Instance_Region", "Scope_Right", 1);
const calledRoot = scope("Instance_Called", "Process_Called", 1);
const calledChild = scope("Instance_Called", "Scope_CalledChild", 1);

const callRecord: CalledProcessOccurrence = {
  id: {
    processInstanceId: left.processInstanceId,
    elementId: "Call_Left",
    activation: 1,
  },
  caller: leftChild,
  calledProcessId: "Process_Called",
  calledRoot,
  returnOperationId: "operation:Return_Left",
};

const state: RuntimeState = {
  ...initialState,
  control: {
    kind: ControlStateKind.Running,
    instanceId: root.processInstanceId,
  },
  scopeOccurrences: [
    { id: root, parent: null },
    { id: left, parent: root },
    { id: leftChild, parent: left },
    { id: right, parent: root },
    { id: calledRoot, parent: null },
    { id: calledChild, parent: calledRoot },
  ],
  calledProcessOccurrences: [callRecord],
};

test("closes occurrence ownership through scope-parent and Call edges", () => {
  const region = deriveInternalOccurrenceRegion(state, left);
  assert.notEqual(region, null);
  assert.deepEqual(region, {
    root: left,
    members: [calledRoot, calledChild, left, leftChild],
  });
  assert.equal(internalOccurrenceRegionContains(region!, calledChild), true);
  assert.equal(internalOccurrenceRegionContains(region!, right), false);
});

test("separates siblings and rejects ancestor-descendant overlap", () => {
  const rootRegion = deriveInternalOccurrenceRegion(state, root);
  const leftRegion = deriveInternalOccurrenceRegion(state, left);
  const rightRegion = deriveInternalOccurrenceRegion(state, right);
  assert.notEqual(rootRegion, null);
  assert.notEqual(leftRegion, null);
  assert.notEqual(rightRegion, null);
  assert.equal(internalOccurrenceRegionsOverlap(leftRegion!, rightRegion!), false);
  assert.equal(internalOccurrenceRegionsOverlap(rootRegion!, leftRegion!), true);
});

test("treats Call ownership and child insertion as region conflicts", () => {
  const callerRegion = deriveInternalOccurrenceRegion(state, left);
  const calledRegion = deriveInternalOccurrenceRegion(state, calledRoot);
  const siblingRegion = deriveInternalOccurrenceRegion(state, right);
  assert.notEqual(callerRegion, null);
  assert.notEqual(calledRegion, null);
  assert.notEqual(siblingRegion, null);
  assert.equal(internalOccurrenceRegionOwnsCall(callerRegion!, callRecord), true);
  assert.equal(internalOccurrenceRegionOwnsCall(calledRegion!, callRecord), true);
  assert.equal(internalOccurrenceRegionOwnsCall(siblingRegion!, callRecord), false);
  assert.equal(internalOccurrenceRegionOwnsInsertion(callerRegion!, leftChild), true);
  assert.equal(internalOccurrenceRegionOwnsInsertion(siblingRegion!, leftChild), false);
});

test("fails closed when an owned Call edge has no exact called root", () => {
  const malformed: RuntimeState = {
    ...state,
    scopeOccurrences: state.scopeOccurrences.filter(({ id }) =>
      id.processInstanceId !== calledRoot.processInstanceId
    ),
  };
  assert.equal(deriveInternalOccurrenceRegion(malformed, left), null);
});

test("fails closed when a scope names itself as parent", () => {
  const malformed: RuntimeState = {
    ...state,
    scopeOccurrences: state.scopeOccurrences.map((occurrence) =>
      occurrence.id === left
        ? { ...occurrence, parent: occurrence.id }
        : occurrence
    ),
  };
  assert.equal(deriveInternalOccurrenceRegion(malformed, left), null);
});

function scope(
  processInstanceId: string,
  definitionScopeId: string,
  activation: number,
): ScopeOccurrenceId {
  return { processInstanceId, definitionScopeId, activation };
}
