/** Locks exact checked-to-IL binding for one operation-addressed Message Start. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
} from "@bpmn-lean/bpmn-source";

import { verifyDefinitionArtifacts } from "../../../scripts/contract-artifacts.ts";
import type { DeepMutable } from "../../../scripts/contract-artifact-test-fixtures.ts";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sourceUrl = new URL(
  "./fixtures/message-start-event.bpmn",
  import.meta.url,
);

test("rejects every checked-to-IL Message Start binding drift", async () => {
  const accepted = await compileAccepted();
  const artifacts = {
    checkedProcess: accepted.checkedProcess,
    semanticProcess: accepted.semanticProcess,
  };
  await assert.doesNotReject(
    verifyDefinitionArtifacts(projectRoot, artifacts),
  );

  const mutations = [
    ["checked Interface Operation", (value: MutableArtifacts) => {
      const start = requireCheckedStart(value);
      start.channel = {
        ...start.channel,
        interfaceOperationId: "Operation_Other",
      };
    }],
    ["lowered Message", (value: MutableArtifacts) => {
      const initiation = requireInitiation(value);
      initiation.channel = {
        ...initiation.channel,
        messageId: "Message_Other",
      };
    }],
    ["lowered origin", (value: MutableArtifacts) => {
      requireInitiation(value).origin.elementId = "UserTask_Approve";
    }],
    ["lowered output", (value: MutableArtifacts) => {
      requireInitiation(value).outputs = ["place:Flow_TaskToEnd"];
    }],
  ] as const;

  for (const [name, mutate] of mutations) {
    const changed = structuredClone(artifacts) as MutableArtifacts;
    mutate(changed);
    await assert.rejects(
      verifyDefinitionArtifacts(projectRoot, changed),
      /Message Start/,
      name,
    );
  }
});

async function compileAccepted(): Promise<AcceptedBpmnCompilation> {
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(sourceUrl),
    sourceId: "message-start-event",
    expectedSha256: undefined,
    semanticProfile: "bpmn-2.0.2-message-start-event-draft",
    sourceOverlay: null,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("Message Start fixture was not accepted");
  }
  return result;
}

type MutableArtifacts = DeepMutable<{
  checkedProcess: AcceptedBpmnCompilation["checkedProcess"];
  semanticProcess: AcceptedBpmnCompilation["semanticProcess"];
}>;

function requireCheckedStart(value: MutableArtifacts) {
  const start = value.checkedProcess.nodes.find(
    ({ kind }) => kind === CheckedNodeKind.MessageStartEvent,
  );
  if (start?.kind !== CheckedNodeKind.MessageStartEvent) {
    throw new TypeError("Checked Message Start is missing");
  }
  return start;
}

function requireInitiation(value: MutableArtifacts) {
  const initiation = value.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.InitiateMessage,
  );
  if (initiation?.kind !== SemanticOperationKind.InitiateMessage) {
    throw new TypeError("Message initiation is missing");
  }
  return initiation;
}
