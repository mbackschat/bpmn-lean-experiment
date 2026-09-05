/** Locks the generic checked-process identity boundary for one composed Activity-data User Task. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CheckedNodeKind } from "@bpmn-lean/semantic-core";

import {
  hasValidDataInputOutputUserTaskIdentities,
} from "../src/activity-data-input-output-checked-admission.ts";
import type { CheckedProcessGraph } from "../src/checked-process-graph-admission.ts";

const scopeId = "scope:Process";

const distinctIdentities = {
  taskId: "Task_AssessClaim",
  inputAssociationId: "InputAssociation_ClaimSummary",
  inputSourcePropertyId: "Property_ClaimSummary",
  inputTargetDataInputId: "DataInput_ClaimSummary",
  outputAssociationId: "OutputAssociation_ClaimDecision",
  outputSourceDataOutputId: "DataOutput_ClaimDecision",
  outputTargetPropertyId: "Property_ClaimDecision",
} as const;

type ActivityDataIdentities = {
  [Key in keyof typeof distinctIdentities]: string;
};

const identityFields = Object.keys(distinctIdentities) as ReadonlyArray<
  keyof ActivityDataIdentities
>;

function composedGraph(
  overrides: Partial<ActivityDataIdentities> = {},
): CheckedProcessGraph {
  const identities: ActivityDataIdentities = {
    ...distinctIdentities,
    ...overrides,
  };
  const nodes = [
    { kind: CheckedNodeKind.NoneStartEvent, id: "Start" },
    {
      kind: CheckedNodeKind.DataInputOutputUserTask,
      id: identities.taskId,
      name: "Assess claim",
      directInput: {
        associationId: identities.inputAssociationId,
        sourcePropertyId: identities.inputSourcePropertyId,
        targetDataInputId: identities.inputTargetDataInputId,
        targetDataInputName: "Claim summary",
      },
      directOutput: {
        associationId: identities.outputAssociationId,
        sourceDataOutputId: identities.outputSourceDataOutputId,
        sourceDataOutputName: "Claim decision",
        targetPropertyId: identities.outputTargetPropertyId,
      },
    },
    { kind: CheckedNodeKind.NoneEndEvent, id: "End" },
  ] as const satisfies CheckedProcessGraph["nodes"];
  const flows = [
    {
      id: "Flow_Start_Assess",
      sourceId: "Start",
      targetId: identities.taskId,
      condition: null,
    },
    {
      id: "Flow_Assess_End",
      sourceId: identities.taskId,
      targetId: "End",
      condition: null,
    },
  ] as const satisfies CheckedProcessGraph["flows"];
  return {
    processId: "Process",
    definitionScopes: [{
      id: scopeId,
      parentScopeId: null,
      originElementId: "Process",
    }],
    nodeScopes: nodes.map(({ id }) => ({ nodeId: id, scopeId })),
    sequenceFlowScopes: flows.map(({ id }) => ({
      sequenceFlowId: id,
      scopeId,
    })),
    nodes,
    flows,
  };
}

function hasValidIdentities(graph: CheckedProcessGraph): boolean {
  const node = graph.nodes.find(
    (candidate): candidate is Extract<
      CheckedProcessGraph["nodes"][number],
      { kind: CheckedNodeKind.DataInputOutputUserTask }
    > => candidate.kind === CheckedNodeKind.DataInputOutputUserTask,
  );
  if (node === undefined) {
    throw new Error("composed Activity-data test graph has no User Task");
  }
  return hasValidDataInputOutputUserTaskIdentities(node);
}

test("admits a composed Activity-data node with exactly seven distinct nonempty identities", () => {
  assert.equal(hasValidIdentities(composedGraph()), true);
});

test("rejects an empty identity in every composed Activity-data position", () => {
  const rejectedFields = identityFields.filter((field) =>
    !hasValidIdentities(composedGraph({ [field]: "" }))
  );
  assert.deepEqual(rejectedFields, identityFields);
});

test("rejects every within-half and cross-half composed Activity-data identity alias", () => {
  const aliases: Array<Readonly<{
    original: keyof ActivityDataIdentities;
    duplicate: keyof ActivityDataIdentities;
  }>> = [];
  for (let originalIndex = 0; originalIndex < identityFields.length; originalIndex += 1) {
    const original = identityFields[originalIndex];
    if (original === undefined) {
      throw new Error("identity table index is missing");
    }
    for (
      let duplicateIndex = originalIndex + 1;
      duplicateIndex < identityFields.length;
      duplicateIndex += 1
    ) {
      const duplicate = identityFields[duplicateIndex];
      if (duplicate === undefined) {
        throw new Error("identity table index is missing");
      }
      aliases.push({ original, duplicate });
    }
  }
  const rejectedAliases = aliases.filter(({ original, duplicate }) =>
    !hasValidIdentities(composedGraph({
      [duplicate]: distinctIdentities[original],
    }))
  );
  assert.deepEqual(rejectedAliases, aliases);
});
