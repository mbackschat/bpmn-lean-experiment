import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CheckedProcess,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";
import {
  verifyActivityBoundaryMessageBindings,
} from "./activity-boundary-message-artifact-consistency.ts";

type NodeFixture = {
  kind: string;
  id: string;
  name?: string | null;
  attachedToRef?: string;
  interruption?: string;
  channel?: typeof channel;
  outputFlowId?: string;
};

type OperationFixture = {
  id: string;
  kind: string;
  origin: { kind: string; elementId: string };
  input: string;
  task: { elementId: string; name: string | null; output: string };
  boundaryMessage: {
    elementId: string;
    channel: typeof channel;
    output: string;
    origin: { kind: string; elementId: string };
  };
};

type ChannelFixture = {
  readonly kind: "operationMessage";
  readonly interfaceId: string;
  readonly interfaceOperationId: string;
  readonly messageId: string;
};

type ArtifactFixture = {
  checkedProcess: {
    nodes: NodeFixture[];
    sequenceFlows: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      condition: null;
    }>;
  };
  semanticProcess: {
    operations: OperationFixture[];
    controlPlaces: Array<{
      id: string;
      origin: { kind: string; elementId: string };
    }>;
  };
};

const channel: ChannelFixture = {
  kind: "operationMessage",
  interfaceId: "Interface_ApplicationMessages",
  interfaceOperationId: "Operation_ReceiveApplicationWithdrawal",
  messageId: "Message_ApplicationWithdrawal",
};

function artifacts(): ArtifactFixture {
  return {
    checkedProcess: {
      nodes: [
        {
          kind: "userTask",
          id: "ReviewApplication",
          name: "Review application",
        },
        {
          kind: "messageBoundaryEvent",
          id: "Withdrawal",
          attachedToRef: "ReviewApplication",
          interruption: "interrupting",
          channel,
          outputFlowId: "Flow_Boundary",
        },
        {
          kind: "userTask",
          id: "RecordReviewCompletion",
          name: "Record review completion",
        },
      ],
      sequenceFlows: [
        {
          id: "Flow_Start",
          sourceId: "Start",
          targetId: "ReviewApplication",
          condition: null,
        },
        {
          id: "Flow_Normal",
          sourceId: "ReviewApplication",
          targetId: "RecordReviewCompletion",
          condition: null,
        },
        {
          id: "Flow_Boundary",
          sourceId: "Withdrawal",
          targetId: "HandleWithdrawal",
          condition: null,
        },
      ],
    },
    semanticProcess: {
      operations: [{
        id: "operation:ReviewApplication",
        kind: "awaitMessageBoundedUserTask",
        origin: { kind: "bpmnElement", elementId: "ReviewApplication" },
        input: "place:Flow_Start",
        task: {
          elementId: "ReviewApplication",
          name: "Review application",
          output: "place:Flow_Normal",
        },
        boundaryMessage: {
          elementId: "Withdrawal",
          channel,
          output: "place:Flow_Boundary",
          origin: {
            kind: "bpmnSequenceFlow",
            elementId: "Flow_Boundary",
          },
        },
      }],
      controlPlaces: [
        {
          id: "place:Flow_Start",
          origin: { kind: "bpmnSequenceFlow", elementId: "Flow_Start" },
        },
        {
          id: "place:Flow_Normal",
          origin: { kind: "bpmnSequenceFlow", elementId: "Flow_Normal" },
        },
        {
          id: "place:Flow_Boundary",
          origin: { kind: "bpmnSequenceFlow", elementId: "Flow_Boundary" },
        },
      ],
    },
  };
}

function verify(candidate: ArtifactFixture): void {
  verifyActivityBoundaryMessageBindings(
    candidate.checkedProcess as unknown as CheckedProcess,
    candidate.semanticProcess as unknown as SemanticProcessProgram,
  );
}

function requireOperation(candidate: ArtifactFixture): OperationFixture {
  const operation = candidate.semanticProcess.operations[0];
  assert.ok(operation !== undefined);
  return operation;
}

test("binds one checked boundary Message and its User Task to one exact IL operation", () => {
  assert.doesNotThrow(() => verify(artifacts()));
});

test("rejects checked boundary, host, and IL identity drift", () => {
  const mutations: ReadonlyArray<(candidate: ArtifactFixture) => void> = [
    (candidate) => {
      requireOperation(candidate).origin.elementId = "OtherHost";
    },
    (candidate) => {
      requireOperation(candidate).origin.kind = "bpmnSequenceFlow";
    },
    (candidate) => {
      requireOperation(candidate).task.elementId = "OtherHost";
    },
    (candidate) => {
      requireOperation(candidate).task.name = "Other name";
    },
    (candidate) => {
      requireOperation(candidate).boundaryMessage.elementId = "OtherBoundary";
    },
    (candidate) => {
      requireOperation(candidate).boundaryMessage.channel = {
        ...channel,
        messageId: "Message_Other",
      };
    },
    (candidate) => {
      requireOperation(candidate).boundaryMessage.output = "place:Flow_Other";
    },
    (candidate) => {
      requireOperation(candidate).boundaryMessage.origin.elementId = "Flow_Other";
    },
    (candidate) => {
      requireOperation(candidate).boundaryMessage.origin.kind = "bpmnElement";
    },
    (candidate) => {
      const boundary = candidate.checkedProcess.nodes[1];
      assert.ok(boundary !== undefined);
      boundary.attachedToRef = "MissingHost";
    },
    (candidate) => {
      const boundary = candidate.checkedProcess.nodes[1];
      assert.ok(boundary !== undefined);
      boundary.outputFlowId = "Flow_Other";
    },
  ];

  for (const mutate of mutations) {
    const candidate = artifacts();
    mutate(candidate);
    assert.throws(() => verify(candidate), /Activity boundary Message/u);
  }
});

test("rejects missing, duplicate, and unmatched boundaries, hosts, and operations", () => {
  const missingBoundary = artifacts();
  missingBoundary.checkedProcess.nodes.splice(1, 1);
  assert.throws(() => verify(missingBoundary), /Activity boundary Message/u);

  const duplicateBoundary = artifacts();
  const boundary = duplicateBoundary.checkedProcess.nodes[1];
  assert.ok(boundary !== undefined);
  duplicateBoundary.checkedProcess.nodes.push({ ...boundary });
  assert.throws(() => verify(duplicateBoundary), /Activity boundary Message/u);

  const missingOperation = artifacts();
  missingOperation.semanticProcess.operations = [];
  assert.throws(() => verify(missingOperation), /Activity boundary Message/u);

  const duplicateOperation = artifacts();
  duplicateOperation.semanticProcess.operations.push({
    ...requireOperation(duplicateOperation),
    id: "operation:duplicate",
  });
  assert.throws(() => verify(duplicateOperation), /Activity boundary Message/u);

  const missingHost = artifacts();
  missingHost.checkedProcess.nodes.splice(0, 1);
  assert.throws(() => verify(missingHost), /Activity boundary Message/u);

  const duplicateHost = artifacts();
  const host = duplicateHost.checkedProcess.nodes[0];
  assert.ok(host !== undefined);
  duplicateHost.checkedProcess.nodes.push({ ...host });
  assert.throws(() => verify(duplicateHost), /Activity boundary Message/u);

  const reusedHost = artifacts();
  const secondOperation = structuredClone(requireOperation(reusedHost));
  secondOperation.id = "operation:ReviewApplication:second";
  secondOperation.boundaryMessage.elementId = "Escalation";
  secondOperation.boundaryMessage.output = "place:Flow_Escalation";
  secondOperation.boundaryMessage.origin.elementId = "Flow_Escalation";
  reusedHost.checkedProcess.nodes.push({
    kind: "messageBoundaryEvent",
    id: "Escalation",
    attachedToRef: "ReviewApplication",
    interruption: "interrupting",
    channel,
    outputFlowId: "Flow_Escalation",
  });
  reusedHost.checkedProcess.sequenceFlows.push({
    id: "Flow_Escalation",
    sourceId: "Escalation",
    targetId: "HandleEscalation",
    condition: null,
  });
  reusedHost.semanticProcess.operations.push(secondOperation);
  reusedHost.semanticProcess.controlPlaces.push({
    id: "place:Flow_Escalation",
    origin: { kind: "bpmnSequenceFlow", elementId: "Flow_Escalation" },
  });
  assert.throws(() => verify(reusedHost), /Activity boundary Message/u);
});

test("rejects absent or duplicate exact host flows and control places", () => {
  for (const flowId of ["Flow_Start", "Flow_Normal", "Flow_Boundary"] as const) {
    const missing = artifacts();
    missing.checkedProcess.sequenceFlows = missing.checkedProcess.sequenceFlows
      .filter(({ id }) => id !== flowId);
    assert.throws(() => verify(missing), /Activity boundary Message/u);

    const duplicate = artifacts();
    const flow = duplicate.checkedProcess.sequenceFlows.find(({ id }) => id === flowId);
    assert.ok(flow !== undefined);
    duplicate.checkedProcess.sequenceFlows.push({
      ...flow,
      id: `${flow.id}:duplicate`,
    });
    assert.throws(() => verify(duplicate), /Activity boundary Message/u);
  }

  for (const placeId of [
    "place:Flow_Start",
    "place:Flow_Normal",
    "place:Flow_Boundary",
  ] as const) {
    const missing = artifacts();
    missing.semanticProcess.controlPlaces = missing.semanticProcess.controlPlaces
      .filter(({ id }) => id !== placeId);
    assert.throws(() => verify(missing), /Activity boundary Message/u);

    const duplicate = artifacts();
    const place = duplicate.semanticProcess.controlPlaces.find(({ id }) => id === placeId);
    assert.ok(place !== undefined);
    duplicate.semanticProcess.controlPlaces.push({ ...place });
    assert.throws(() => verify(duplicate), /Activity boundary Message/u);

    const wrongOrigin = artifacts();
    const drifted = wrongOrigin.semanticProcess.controlPlaces.find(
      ({ id }) => id === placeId,
    );
    assert.ok(drifted !== undefined);
    drifted.origin.elementId = "Flow_Other";
    assert.throws(() => verify(wrongOrigin), /Activity boundary Message/u);
  }
});
