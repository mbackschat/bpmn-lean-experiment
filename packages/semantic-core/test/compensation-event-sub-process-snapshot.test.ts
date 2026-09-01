import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compensationEventSubProcessSnapshotProgramDefects,
  isWellFormedSemanticProcessGraph,
  isWellFormedSemanticProcessProgram,
  type SemanticProcessGraph,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  boundedScopeProgram,
  childScopeId,
  rootScopeId,
} from "./bounded-scope-fixture.ts";

const handlerScopeId = "scope:Compensation_Handler";

const program = {
  ...boundedScopeProgram,
  definitionScopes: [
    {
      id: handlerScopeId,
      parentScopeId: childScopeId,
      originElementId: "Compensation_Handler",
    },
    ...boundedScopeProgram.definitionScopes,
  ],
  compensationEventSubProcessSnapshots: {
    targets: [{ parentScopeId: childScopeId, handlerScopeId }],
    limits: { maxRecords: 8, maxCanonicalBytes: 65_536 },
  },
} as const satisfies SemanticProcessProgram;

function rawGraph(candidate: SemanticProcessProgram): SemanticProcessGraph {
  return {
    semanticProfile: candidate.identity.semanticProfile,
    processId: candidate.processId,
    definitionScopes: candidate.definitionScopes,
    operationScopes: candidate.operationScopes,
    controlPlaceScopes: candidate.controlPlaceScopes,
    controlPlaceIds: candidate.controlPlaces.map(({ id }) => id),
    operations: candidate.operations,
  };
}

test("strict Program admission alone admits its exact declared dormant handler", () => {
  const graph = rawGraph(program);

  assert.equal(isWellFormedSemanticProcessGraph(graph), false);
  assert.deepEqual(compensationEventSubProcessSnapshotProgramDefects(program), []);
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
});

test("does not widen the dormant-handler exception", () => {
  const extraDormantScope = {
    ...program,
    definitionScopes: [
      {
        id: "scope:Undeclared_Handler",
        parentScopeId: rootScopeId,
        originElementId: "Undeclared_Handler",
      },
      ...program.definitionScopes,
    ],
  } satisfies SemanticProcessProgram;
  const mismatchedParent = {
    ...program,
    compensationEventSubProcessSnapshots: {
      ...program.compensationEventSubProcessSnapshots,
      targets: [{ parentScopeId: rootScopeId, handlerScopeId }],
    },
  } satisfies SemanticProcessProgram;
  const nonEmptyHandler = {
    ...program,
    compensationEventSubProcessSnapshots: {
      ...program.compensationEventSubProcessSnapshots,
      targets: [{ parentScopeId: rootScopeId, handlerScopeId: childScopeId }],
    },
  } satisfies SemanticProcessProgram;

  assert.equal(isWellFormedSemanticProcessProgram(extraDormantScope), false);
  assert.equal(isWellFormedSemanticProcessProgram(mismatchedParent), false);
  assert.equal(isWellFormedSemanticProcessProgram(nonEmptyHandler), false);
});

test("the exported raw validator accepts no caller-supplied exemption", () => {
  const graph = rawGraph(program);

  // @ts-expect-error The declaration-derived exception belongs only to strict Program admission.
  assert.equal(isWellFormedSemanticProcessGraph(graph, [handlerScopeId]), false);
});
