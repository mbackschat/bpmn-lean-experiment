import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  SemanticOperationKind,
  SemanticTransitionKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  AppliedInternalOperationStep,
  AwaitPayloadMessageOperation,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  InternalTransitionCandidate,
} from "../src/internal-transition-footprint.ts";

import {
  configuredTaskProgram,
  receiveTaskProgram,
  startFor,
} from "./flow-node-occurrence-lifecycle-fixture.ts";
import {
  InternalTransitionStateAtomKind,
  enabledOperations,
  frontier,
  program,
  unsupportedFrontier,
  unsupportedProgram,
} from "./internal-commutation-fixture.ts";

type OrdinaryArmingPreparationModule =
  typeof import("../src/internal-transition-ordinary-arming-preparation.ts");
type PublicationTemplateModule =
  typeof import("../src/internal-publication-template.ts");
type OrdinaryArmingPatchModule =
  typeof import("../src/internal-transition-ordinary-arming-patch.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-ordinary-arming-preparation.js",
    import.meta.url,
  ).href
) as OrdinaryArmingPreparationModule;
const publicationTemplateModule = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as PublicationTemplateModule;
const patchModule = await import(
  new URL(
    "../dist/internal-transition-ordinary-arming-patch.js",
    import.meta.url,
  ).href
) as OrdinaryArmingPatchModule;

const { deriveInternalOrdinaryArmingPreparation } = preparationModule;
const {
  InternalPublicationTemplateAnchorKind,
  instantiateInternalPublicationBatch,
} = publicationTemplateModule;
const { applyInternalOrdinaryArmingPatch } = patchModule;

test("prepares every ordinary wait family with publication-time and an exact wait lifecycle", () => {
  const cases = [
    ...enabledOperations(program, frontier).map((candidate) => ({
      program,
      state: frontier,
      candidate,
    })),
    armedCandidate(receiveTaskProgram, "receive-preparation"),
    armedCandidate(configuredTaskProgram, "effect-preparation"),
    payloadMessageArmingCase(),
  ];

  assert.deepEqual(
    new Set(cases.map(({ candidate }) => candidate.operation.kind)),
    new Set([
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.AwaitMessage,
      SemanticOperationKind.AwaitPayloadMessage,
      SemanticOperationKind.AwaitTimer,
      SemanticOperationKind.AwaitEffect,
    ]),
  );

  for (const { program: candidateProgram, state, candidate } of cases) {
    const prepared = requirePrepared(deriveInternalOrdinaryArmingPreparation(
      candidateProgram,
      state,
      candidate,
    ), candidate.operation.kind);
    assert.equal(prepared.footprint.reads.some(({ kind }) =>
      kind === InternalTransitionStateAtomKind.LogicalTime
    ), true, candidate.operation.kind);
    assert.equal(prepared.alternative.operationId, candidate.operation.id);
    const input = "input" in candidate.operation
      ? candidate.operation.input
      : null;
    const inputPlace = candidateProgram.controlPlaces.find(({ id }) =>
      id === input
    );
    assert.ok(inputPlace !== undefined);
    assert.deepEqual(prepared.publicationTemplate.record, {
      logicalTimeMs: state.logicalTimeMs,
      transition: {
        kind: SemanticTransitionKind.InternalOperation,
        operationId: candidate.operation.id,
        operationKind: candidate.operation.kind,
        origin: candidate.operation.origin,
        owner: candidate.owner,
      },
      positionDelta: {
        consumedTokens: [{
          sequenceFlowId: inputPlace.origin.elementId,
          owner: candidate.owner,
          multiplicity: 1,
        }],
        producedTokens: [],
        enteredScopes: [],
        exitedScopes: [],
      },
    });
    assert.deepEqual(prepared.publicationTemplate.lifecycle.ended, []);
    assert.equal(prepared.publicationTemplate.lifecycle.started.length, 1);
    const started = prepared.publicationTemplate.lifecycle.started[0];
    assert.equal(
      started?.anchor.kind,
      InternalPublicationTemplateAnchorKind.Wait,
    );
    assert.equal(started?.processId, candidateProgram.processId);
    assert.equal(started?.elementId, started?.anchor.kind ===
        InternalPublicationTemplateAnchorKind.Wait
      ? started.anchor.id.elementId
      : null);
    assert.deepEqual(started?.owner, candidate.owner);
    assert.deepEqual(
      applyInternalOrdinaryArmingPatch(state, prepared.patch),
      candidate.successor,
      candidate.operation.kind,
    );
  }
});

function payloadMessageArmingCase(): Readonly<{
  program: SemanticProcessProgram;
  state: RuntimeState;
  candidate: AppliedInternalOperationStep;
}> {
  const ordinary = armedCandidate(receiveTaskProgram, "payload-preparation");
  assert.ok(
    ordinary.candidate.operation.kind === SemanticOperationKind.AwaitMessage,
  );
  const operation = {
    ...ordinary.candidate.operation,
    kind: SemanticOperationKind.AwaitPayloadMessage,
    directOutput: {
      associationId: "DataOutputAssociation_Payload",
      sourceDataOutputId: "DataOutput_Payload",
      sourceDataOutputName: "Payload",
      targetPropertyId: "Property_Payload",
    },
  } as const satisfies AwaitPayloadMessageOperation;
  return {
    program: {
      ...ordinary.program,
      operations: ordinary.program.operations.map((candidate) =>
        candidate.id === operation.id ? operation : candidate
      ),
    },
    state: ordinary.state,
    candidate: { ...ordinary.candidate, operation },
  };
}

test("ordinary local patches preserve complete sibling preparation and commute in raw state", () => {
  const [leftCandidate, rightCandidate] = enabledOperations(program, frontier);
  assert.ok(leftCandidate !== undefined);
  assert.ok(rightCandidate !== undefined);
  const left = requirePrepared(deriveInternalOrdinaryArmingPreparation(
    program,
    frontier,
    leftCandidate,
  ));
  const right = requirePrepared(deriveInternalOrdinaryArmingPreparation(
    program,
    frontier,
    rightCandidate,
  ));
  const afterLeft = applyInternalOrdinaryArmingPatch(frontier, left.patch);
  const afterRight = applyInternalOrdinaryArmingPatch(frontier, right.patch);

  assert.deepEqual(
    deriveInternalOrdinaryArmingPreparation(program, afterLeft, rightCandidate),
    right,
  );
  assert.deepEqual(
    deriveInternalOrdinaryArmingPreparation(program, afterRight, leftCandidate),
    left,
  );
  assert.deepEqual(
    applyInternalOrdinaryArmingPatch(afterLeft, right.patch),
    applyInternalOrdinaryArmingPatch(afterRight, left.patch),
  );
});

test("sorts ordinary arming templates before assigning command and transition identity", () => {
  const candidates = enabledOperations(program, frontier);
  const templates = [...candidates].reverse().map((candidate) => {
    const prepared = deriveInternalOrdinaryArmingPreparation(
      program,
      frontier,
      candidate,
    );
    assert.notEqual(prepared, null);
    return prepared!.publicationTemplate;
  });
  const instantiated = instantiateInternalPublicationBatch(
    "command:ordinary-arming",
    4,
    templates,
  );

  assert.deepEqual(
    instantiated?.map(({ alternative, transitionIndex }) => ({
      operationId: alternative.operationId,
      transitionIndex,
    })),
    [
      { operationId: "operation:Task", transitionIndex: 4 },
      { operationId: "operation:Timer", transitionIndex: 5 },
    ],
  );
  const expectedAnchors = ["operation:Task", "operation:Timer"].map(
    (operationId) => templates.find(({ alternative }) =>
      alternative.operationId === operationId
    )?.lifecycle.started[0]?.anchor,
  );
  assert.deepEqual(
    instantiated?.map(({ lifecycle }) => lifecycle.started[0]?.anchor),
    expectedAnchors,
  );
});

test("refuses unsupported operations without consulting their successor", () => {
  const candidate = enabledOperations(
    unsupportedProgram,
    unsupportedFrontier,
  ).find(({ operation }) => operation.kind === SemanticOperationKind.Duplicate);
  assert.ok(candidate !== undefined);
  const poisoned = {
    ...candidate,
    successor: initialState,
  } as InternalTransitionCandidate;

  assert.equal(
    deriveInternalOrdinaryArmingPreparation(
      unsupportedProgram,
      unsupportedFrontier,
      poisoned,
    ),
    null,
  );
});

function armedCandidate(
  candidateProgram: SemanticProcessProgram,
  instanceId: string,
): Readonly<{
  program: SemanticProcessProgram;
  state: RuntimeState;
  candidate: AppliedInternalOperationStep;
}> {
  const started = applyStimulus(
    candidateProgram,
    initialState,
    startFor(candidateProgram, instanceId),
    1,
  );
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.equal(started.internalStepBoundExceeded, true);
  const candidates = enabledOperations(candidateProgram, started.state);
  assert.equal(candidates.length, 1);
  return { program: candidateProgram, state: started.state, candidate: candidates[0]! };
}

function requirePrepared(
  prepared: ReturnType<typeof deriveInternalOrdinaryArmingPreparation>,
  label: string = "ordinary arming",
): NonNullable<typeof prepared> {
  if (prepared === null) {
    throw new TypeError(`Expected prepared ${label}`);
  }
  return prepared;
}
