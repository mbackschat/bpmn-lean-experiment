import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  compareCanonicalStrings,
  readAndVerifyArtifactSets,
  verifyArtifactSet,
  verifyDefinitionArtifacts,
} from "./contract-artifacts.ts";
import {
  bindScenarioBytes,
  checkedNodeKind,
  cloneArtifactSet,
  collectIntegerSchemas,
  collectPropertyNames,
  parallelDefinitionArtifacts,
  required,
  requiredAt,
  requireAwaitEffect,
  requireAwaitUserTask,
  requireCheckedUserTask,
  requireMutableState,
  requireServiceTask,
  requireUserTaskCompletion,
  semanticOperationKind,
  serviceTaskDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";
import type {
  MutableDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("keeps every MessageChannel schema on the same closed union", async () => {
  const values = [
    {
      kind: "operationMessage",
      interfaceId: "Interface_1",
      interfaceOperationId: "Operation_1",
      messageId: "Message_1",
    },
    {
      kind: "directMessage",
      messageId: "Message_1",
    },
  ] as const;
  const invalidValues = [
    { kind: "directMessage" },
    {
      kind: "directMessage",
      messageId: "Message_1",
      interfaceId: "Interface_1",
    },
    {
      kind: "operationMessage",
      interfaceId: "Interface_1",
      messageId: "Message_1",
    },
    { kind: "otherMessage", messageId: "Message_1" },
  ] as const;

  for (const schemaName of [
    "checked-process.schema.json",
    "semantic-process.schema.json",
    "scenario.schema.json",
  ]) {
    const schema = JSON.parse(
      await readFile(
        `${projectRoot}/contracts/schemas/${schemaName}`,
        "utf8",
      ),
    ) as { readonly $defs: Readonly<Record<string, unknown>> };
    const validate = new Ajv2020({ strict: true }).compile({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: schema.$defs,
      $ref: "#/$defs/messageChannel",
    });

    for (const value of values) {
      assert.equal(validate(value), true, schemaName);
    }
    for (const value of invalidValues) {
      assert.equal(validate(value), false, schemaName);
    }
  }
});

test("binds checked Message node kinds to their exact channel arms", async () => {
  const schema = JSON.parse(
    await readFile(
      `${projectRoot}/contracts/schemas/checked-process.schema.json`,
      "utf8",
    ),
  ) as { readonly $defs: Readonly<Record<string, unknown>> };
  const validate = new Ajv2020({ strict: true }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: "#/$defs/node",
  });
  const operationChannel = {
    kind: "operationMessage",
    interfaceId: "Interface_1",
    interfaceOperationId: "Operation_1",
    messageId: "Message_1",
  } as const;
  const directChannel = {
    kind: "directMessage",
    messageId: "Message_1",
  } as const;

  assert.equal(validate({
    kind: "intermediateCatchMessageEvent",
    id: "CatchEvent_1",
    channel: operationChannel,
  }), true);
  assert.equal(validate({
    kind: "receiveTask",
    id: "ReceiveTask_1",
    channel: directChannel,
  }), true);
  assert.equal(validate({
    kind: "intermediateCatchMessageEvent",
    id: "CatchEvent_1",
    channel: directChannel,
  }), false);
  assert.equal(validate({
    kind: "receiveTask",
    id: "ReceiveTask_1",
    channel: operationChannel,
  }), false);
});

test("accepts the canonical checked-process and Semantic Process contract shapes", async () => {
  for (const artifacts of [
    parallelDefinitionArtifacts(),
    serviceTaskDefinitionArtifacts(),
  ]) {
    assert.equal(
      await verifyDefinitionArtifacts(projectRoot, artifacts),
      artifacts,
    );
  }
});

test("rejects drift in the neutral Service Task effect identity", async () => {
  const mutations: ReadonlyArray<
    (artifacts: MutableDefinitionArtifacts) => void
  > = [
    (artifacts) => {
      const serviceTask = requireServiceTask(
        artifacts.checkedProcess.nodes[1],
      );
      serviceTask.descriptor.protocol =
        "urn:bpmn-lean:effect-protocol:other-v1";
    },
    (artifacts) => {
      const serviceTask = requireServiceTask(
        artifacts.checkedProcess.nodes[1],
      );
      serviceTask.descriptor.operation =
        "urn:bpmn-lean:effect-operation:other-v1";
    },
    (artifacts) => {
      const effectOperation = requireAwaitEffect(
        artifacts.semanticProcess.operations[1],
      );
      effectOperation.effect.elementId =
        "Other_ServiceTask";
    },
  ];
  for (const mutate of mutations) {
    const artifacts = serviceTaskDefinitionArtifacts();
    mutate(artifacts);
    await assert.rejects(
      verifyDefinitionArtifacts(projectRoot, artifacts),
      /schema validation failed|effect identity differs|effect descriptor differs/,
    );
  }
});

test("rejects checked and Semantic Process references outside their definition domains", async () => {
  const checkedMutation = parallelDefinitionArtifacts();
  requiredAt(
    checkedMutation.checkedProcess.sequenceFlows,
    0,
    "checked Sequence Flows",
  ).targetId = "Missing_Task";

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, checkedMutation),
    /checked process flow Flow_Fork_A references unknown target node Missing_Task/,
  );

  const programMutation = parallelDefinitionArtifacts();
  const duplicate = required(
    programMutation.semanticProcess.operations.find(
      ({ kind }) => kind === semanticOperationKind.Duplicate,
    ),
    "duplicate operation",
  );
  if (duplicate.kind !== semanticOperationKind.Duplicate) {
    throw new Error("expected a duplicate operation");
  }
  duplicate.outputs[0] = "place:Flow_Fork_A0";

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, programMutation),
    /operation operation:Gateway_Fork references unknown control place place:Flow_Fork_A0/,
  );
});

test("rejects duplicate and synchronize operations below their semantic arity", async () => {
  for (const operationId of [
    "operation:Gateway_Fork",
    "operation:Gateway_Join",
  ]) {
    const artifacts = parallelDefinitionArtifacts();
    const operationValue = required(
      artifacts.semanticProcess.operations.find(
        ({ id }) => id === operationId,
      ),
      `operation ${operationId}`,
    );
    if (operationValue.kind === semanticOperationKind.Duplicate) {
      operationValue.outputs = [
        requiredAt(operationValue.outputs, 0, "duplicate outputs"),
      ];
    } else if (
      operationValue.kind === semanticOperationKind.Synchronize
    ) {
      operationValue.inputs = [
        requiredAt(operationValue.inputs, 0, "synchronize inputs"),
      ];
    } else {
      throw new Error(
        `${operationId} is not a duplicate or synchronize operation`,
      );
    }

    await assert.rejects(
      verifyDefinitionArtifacts(projectRoot, artifacts),
      /semantic process schema validation failed/,
    );
  }
});

test("rejects source identity drift between checked and Semantic Process artifacts", async () => {
  const artifacts = parallelDefinitionArtifacts();
  artifacts.semanticProcess.identity.sourceSha256 =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, artifacts),
    /checked process and semantic process identities differ/,
  );
});

test("rejects non-canonical definition and unordered-reference order", async () => {
  const definitionOrderMutation = parallelDefinitionArtifacts();
  definitionOrderMutation.semanticProcess.operations.reverse();

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, definitionOrderMutation),
    /semantic process operations must be sorted by id/,
  );

  const referenceOrderMutation = parallelDefinitionArtifacts();
  const duplicateOperation = required(
    referenceOrderMutation.semanticProcess.operations.find(
      ({ kind }) => kind === semanticOperationKind.Duplicate,
    ),
    "duplicate operation",
  );
  if (duplicateOperation.kind !== semanticOperationKind.Duplicate) {
    throw new Error("expected duplicate operation");
  }
  duplicateOperation.outputs.reverse();

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, referenceOrderMutation),
    /operation operation:Gateway_Fork outputs must be sorted/,
  );
});
