import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import { CheckedNodeKind } from "@bpmn-lean/semantic-core";
import type { CheckedCompensation } from "@bpmn-lean/semantic-core";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

const compensation = {
  triggerElementId: "Throw_Compensate",
  subjects: [
    {
      kind: "boundaryActivity",
      subjectElementId: "Task_ReserveHotel",
      boundaryEventElementId: "Boundary_ReserveHotel_Compensation",
      body: {
        kind: "singleEffect",
        handlerElementId: "Task_UndoReserveHotel",
        effectElementId: "Task_UndoReserveHotel",
        descriptor: {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:compensation-single-effect-v1",
        },
        input: { kind: "empty" },
      },
    },
    {
      kind: "eventSubProcess",
      parentElementId: "SubProcess_ArrangeGroundTravel",
      parentScopeId: "scope:SubProcess_ArrangeGroundTravel",
      handlerScopeId: "scope:EventSubProcess_UndoGroundTravel",
      body: {
        kind: "singleEffect",
        handlerElementId: "EventSubProcess_UndoGroundTravel",
        effectElementId: "Task_UndoGroundTravel",
        descriptor: {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:compensation-single-effect-v1",
        },
        input: {
          kind: "directRestoredProcessBinding",
          sourcePropertyId: "Property_TravelDetails",
          targetDataInputId: "DataInput_TravelDetails",
        },
      },
    },
    {
      kind: "boundaryActivity",
      subjectElementId: "Task_IssueInsurance",
      boundaryEventElementId: "Boundary_IssueInsurance_Compensation",
      body: {
        kind: "singleEffect",
        handlerElementId: "Task_UndoInsurance",
        effectElementId: "Task_UndoInsurance",
        descriptor: {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:compensation-single-effect-v1",
        },
        input: { kind: "empty" },
      },
    },
  ],
  dependencies: [{
    predecessorElementId: "Task_ReserveHotel",
    successorElementId: "SubProcess_ArrangeGroundTravel",
    reason: "sequenceFlow",
  }],
  retentionLimits: { maxRecords: 2, maxCanonicalBytes: 4096 },
  snapshotLimits: { maxRecords: 1, maxCanonicalBytes: 8192 },
  executionLimits: {
    maxTriggers: 1,
    maxHandlers: 3,
    maxCanonicalBytes: 20480,
  },
} as const satisfies CheckedCompensation;

const exactCheckedArtifact = {
  kind: "checkedProcess",
  identity: {
    semanticProfile: "bpmn-2.0.2-compensation-source-checkpoint-draft",
    sourceOverlay: null,
    sourceId: "compensation-source-checkpoint",
    sourceSha256: "1".repeat(64),
  },
  processId: "Process_Compensation",
  definitionScopes: [{
    id: "scope:Process_Compensation",
    parentScopeId: null,
    originElementId: "Process_Compensation",
  }],
  nodeScopes: [{
    nodeId: "Throw_Compensate",
    scopeId: "scope:Process_Compensation",
  }],
  sequenceFlowScopes: [{
    sequenceFlowId: "Flow_Throw_End",
    scopeId: "scope:Process_Compensation",
  }],
  nodes: [{
    kind: "globalSynchronousCompensationThrowEvent",
    id: "Throw_Compensate",
  }],
  sequenceFlows: [{
    id: "Flow_Throw_End",
    sourceId: "Throw_Compensate",
    targetId: "End_Done",
    condition: null,
  }],
  compensation,
} as const;

test("admits the exact checked Compensation declaration and global throw node", async () => {
  assert.equal(
    CheckedNodeKind.GlobalSynchronousCompensationThrowEvent,
    "globalSynchronousCompensationThrowEvent",
  );
  const { process, node, declaration } = await validators();
  assert.equal(node(exactCheckedArtifact.nodes[0]), true, JSON.stringify(node.errors));
  assert.equal(declaration(compensation), true, JSON.stringify(declaration.errors));
  assert.equal(process(exactCheckedArtifact), true, JSON.stringify(process.errors));
});

test("keeps the optional declaration physically absent from old checked artifacts", async () => {
  const { compensation: _compensation, ...withoutCompensation } = exactCheckedArtifact;
  const oldCheckedArtifact = {
    ...withoutCompensation,
    nodes: [{ kind: "noneStartEvent", id: "Start_None" }],
    nodeScopes: [{
      nodeId: "Start_None",
      scopeId: "scope:Process_Compensation",
    }],
  } as const;
  const { process } = await validators();

  assert.equal(Object.hasOwn(oldCheckedArtifact, "compensation"), false);
  assert.equal(process(oldCheckedArtifact), true, JSON.stringify(process.errors));
  assert.equal(
    Object.hasOwn(JSON.parse(JSON.stringify(oldCheckedArtifact)), "compensation"),
    false,
  );
});

test("rejects open, incomplete, nullable, and unselected Compensation shapes", async () => {
  const { node, declaration } = await validators();
  const { triggerElementId: _triggerElementId, ...withoutTrigger } = compensation;
  const boundary = compensation.subjects[0];
  const eventSubProcess = compensation.subjects[1];

  assert.equal(declaration({ ...compensation, associationId: "Association_1" }), false);
  assert.equal(declaration(withoutTrigger), false);
  assert.equal(declaration(null), false);
  assert.equal(declaration({ ...compensation, subjects: null }), false);
  assert.equal(declaration({ ...compensation, dependencies: [{
    ...compensation.dependencies[0],
    reason: "association",
  }] }), false);
  assert.equal(declaration({ ...compensation, subjects: [{
    ...boundary,
    kind: "activity",
  }] }), false);
  assert.equal(declaration({ ...compensation, subjects: [{
    ...boundary,
    parentScopeId: "scope:Task_ReserveHotel",
  }] }), false);
  assert.equal(declaration({ ...compensation, subjects: [{
    ...eventSubProcess,
    boundaryEventElementId: "Boundary_WrongArm",
  }] }), false);
  assert.equal(declaration({ ...compensation, subjects: [{
    ...eventSubProcess,
    body: { ...eventSubProcess.body, input: { kind: "restoredProcessBinding" } },
  }] }), false);
  assert.equal(node({
    kind: "globalSynchronousCompensationThrowEvent",
    id: "Throw_Compensate",
    associationId: "Association_1",
  }), false);
  assert.equal(node({ kind: "globalCompensationThrowEvent", id: "Throw_Compensate" }), false);
});

test("retains distinct restored-binding endpoints and subject identities", async () => {
  const { declaration } = await validators();
  const eventSubProcess = compensation.subjects[1];
  const directInput = eventSubProcess.body.input;
  assert.equal(directInput.kind, "directRestoredProcessBinding");
  if (directInput.kind !== "directRestoredProcessBinding") {
    throw new TypeError("expected direct restored Process binding");
  }
  const swappedInput = {
    ...directInput,
    sourcePropertyId: directInput.targetDataInputId,
    targetDataInputId: directInput.sourcePropertyId,
  } as const;
  const swappedDeclaration = {
    ...compensation,
    subjects: compensation.subjects.map((subject) =>
      subject.kind === "eventSubProcess"
        ? { ...subject, body: { ...subject.body, input: swappedInput } }
        : subject
    ),
  };

  assert.notDeepEqual(swappedInput, directInput);
  assert.notEqual(JSON.stringify(swappedDeclaration), JSON.stringify(compensation));
  assert.equal(declaration(swappedDeclaration), true, JSON.stringify(declaration.errors));
  assert.deepEqual(Object.keys(compensation.subjects[0]).sort(), [
    "body",
    "boundaryEventElementId",
    "kind",
    "subjectElementId",
  ]);
  assert.deepEqual(Object.keys(eventSubProcess).sort(), [
    "body",
    "handlerScopeId",
    "kind",
    "parentElementId",
    "parentScopeId",
  ]);
});

test("fixes every checked Compensation collection limit to its selected value", async () => {
  const { declaration } = await validators();
  const mutations = [
    { ...compensation, retentionLimits: { ...compensation.retentionLimits, maxRecords: 3 } },
    { ...compensation, retentionLimits: { ...compensation.retentionLimits, maxCanonicalBytes: 4097 } },
    { ...compensation, snapshotLimits: { ...compensation.snapshotLimits, maxRecords: 2 } },
    { ...compensation, snapshotLimits: { ...compensation.snapshotLimits, maxCanonicalBytes: 8193 } },
    { ...compensation, executionLimits: { ...compensation.executionLimits, maxTriggers: 2 } },
    { ...compensation, executionLimits: { ...compensation.executionLimits, maxHandlers: 4 } },
    { ...compensation, executionLimits: { ...compensation.executionLimits, maxCanonicalBytes: 20481 } },
  ];

  for (const mutation of mutations) {
    assert.equal(declaration(mutation), false, JSON.stringify(mutation));
  }
});

async function validators() {
  const schema = JSON.parse(await readFile(
    `${projectRoot}/contracts/schemas/checked-process.schema.json`,
    "utf8",
  )) as {
    readonly $defs: Readonly<Record<string, unknown>>;
  };
  const ajv = new Ajv2020({ strict: true });
  const base = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
  } as const;
  return {
    process: ajv.compile({ ...schema }),
    node: ajv.compile({ ...base, $ref: "#/$defs/node" }),
    declaration: ajv.compile({ ...base, $ref: "#/$defs/checkedCompensation" }),
  };
}

function assertCheckedCompensationIsDeeplyReadonly(value: CheckedCompensation): void {
  // @ts-expect-error DeepReadonly makes fixed limit fields immutable.
  value.executionLimits.maxCanonicalBytes = 20481;
  // @ts-expect-error DeepReadonly makes subject arrays immutable.
  value.subjects.push(compensation.subjects[0]);
}

void assertCheckedCompensationIsDeeplyReadonly;
