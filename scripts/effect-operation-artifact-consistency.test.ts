/**
 * Characterizes the exact checked-source to neutral effect-operation binding.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  requireAwaitEffect,
  requireServiceTask,
  serviceTaskDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";
import {
  verifyEffectOperationBindings,
} from "./effect-operation-artifact-consistency.ts";
import type {
  CheckedNodeKind,
  MappingExpressionKind,
  SemanticOriginKind,
} from "../packages/semantic-core/src/index.ts";

test("accepts the exact Service Task effect binding", () => {
  const artifacts = serviceTaskDefinitionArtifacts();
  assert.doesNotThrow(() =>
    verifyEffectOperationBindings(
      artifacts.checkedProcess,
      artifacts.semanticProcess,
    )
  );
});

test("rejects every Service Task effect binding drift", () => {
  const mutations = [
    () => {
      const artifacts = serviceTaskDefinitionArtifacts();
      requireServiceTask(artifacts.checkedProcess.nodes[1]).descriptor.protocol =
        "urn:bpmn-lean:effect-protocol:other-v1";
      return artifacts;
    },
    () => {
      const artifacts = serviceTaskDefinitionArtifacts();
      requireAwaitEffect(
        artifacts.semanticProcess.operations[1],
      ).effect.elementId = "Other_ServiceTask";
      return artifacts;
    },
    () => {
      const artifacts = serviceTaskDefinitionArtifacts();
      requireServiceTask(
        artifacts.checkedProcess.nodes[1],
      ).inputMappings.push({
        target: "request",
        expression: {
          kind: "stringLiteral" as MappingExpressionKind.StringLiteral,
          value: "value",
        },
      });
      return artifacts;
    },
    () => {
      const artifacts = serviceTaskDefinitionArtifacts();
      requireAwaitEffect(
        artifacts.semanticProcess.operations[1],
      ).effect.outputMappings.push({
        target: "result",
        expression: {
          kind: "localVariable" as MappingExpressionKind.LocalVariable,
          name: "result",
        },
      });
      return artifacts;
    },
    () => {
      const artifacts = serviceTaskDefinitionArtifacts();
      requireAwaitEffect(
        artifacts.semanticProcess.operations[1],
      ).bpmnErrorRoute = {
        code: "ERR",
        output: "place:Flow_Error",
        origin: {
          kind: "bpmnElement" as SemanticOriginKind.BpmnElement,
          boundaryEventId: "Boundary_Error",
          errorDefinitionId: "ErrorDefinition_1",
          errorElementId: "Error_1",
          sequenceFlowId: "Flow_Error",
        },
      };
      return artifacts;
    },
  ] as const;

  for (const mutate of mutations) {
    const artifacts = mutate();
    assert.throws(
      () =>
        verifyEffectOperationBindings(
          artifacts.checkedProcess,
          artifacts.semanticProcess,
        ),
      /effect identity|effect descriptor|input mappings|output mappings|BPMN Error route/u,
    );
  }
});

test("binds a Configured Task only to the neutral empty effect specialization", () => {
  const artifacts = serviceTaskDefinitionArtifacts();
  artifacts.checkedProcess.nodes[1] = {
    kind: "configuredTask" as CheckedNodeKind.ConfiguredTask,
    id: "ServiceTask_Record",
    descriptor: {
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
    },
  };
  assert.doesNotThrow(() =>
    verifyEffectOperationBindings(
      artifacts.checkedProcess,
      artifacts.semanticProcess,
    )
  );

  requireAwaitEffect(
    artifacts.semanticProcess.operations[1],
  ).effect.inputMappings.push({
    target: "forbidden",
    expression: {
      kind: "stringLiteral" as MappingExpressionKind.StringLiteral,
      value: "forbidden",
    },
  });
  assert.throws(
    () =>
      verifyEffectOperationBindings(
        artifacts.checkedProcess,
        artifacts.semanticProcess,
      ),
    /input mappings/u,
  );
});
