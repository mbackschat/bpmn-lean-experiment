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

test("keeps executable and scenario MessageChannel schemas on the same closed union", async () => {
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

test("binds Inclusive Gateway node directions and operation tuple arities", async () => {
  const checkedSchema = JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/checked-process.schema.json`, "utf8"),
  ) as { readonly $defs: Readonly<Record<string, unknown>> };
  const semanticSchema = JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/semantic-process.schema.json`, "utf8"),
  ) as { readonly $defs: Readonly<Record<string, unknown>> };
  const ajv = new Ajv2020({ strict: true });
  const node = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: checkedSchema.$defs,
    $ref: "#/$defs/node",
  });
  const operation = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: semanticSchema.$defs,
    $ref: "#/$defs/operation",
  });
  const split = {
    kind: "inclusiveGateway",
    id: "Split",
    direction: "diverging",
    candidateFlowIds: ["Flow_A", "Flow_B"],
    defaultFlowId: "Flow_Default",
  };
  const join = {
    kind: "inclusiveGateway",
    id: "Join",
    direction: "converging",
    pairedGatewayId: "Split",
  };
  assert.equal(node(split), true);
  assert.equal(node(join), true);
  assert.equal(node({ ...split, direction: "converging" }), false);
  assert.equal(node({ ...join, direction: "diverging" }), false);

  const origin = { kind: "bpmnElement", elementId: "Split" };
  const flowOrigin = (elementId: string) => ({ kind: "bpmnSequenceFlow", elementId });
  const selectMany = {
    id: "operation:Split",
    kind: "selectMany",
    origin,
    input: "place:Flow_Start",
    candidates: ["A", "B"].map((suffix) => ({
      condition: { kind: "isPresent", variable: `take${suffix}` },
      output: `place:Flow_${suffix}`,
      expectedJoinInput: `place:Flow_${suffix}_Join`,
      origin: flowOrigin(`Flow_${suffix}`),
    })),
    defaultBranch: {
      output: "place:Flow_Default",
      expectedJoinInput: "place:Flow_Default_Join",
      origin: flowOrigin("Flow_Default"),
    },
    selectionKey: "Split",
  };
  const synchronizeSelected = {
    id: "operation:Join",
    kind: "synchronizeSelected",
    origin: { kind: "bpmnElement", elementId: "Join" },
    inputs: ["place:Flow_A_Join", "place:Flow_B_Join", "place:Flow_Default_Join"],
    output: "place:Flow_End",
    selectionKey: "Split",
  };
  assert.equal(operation(selectMany), true);
  assert.equal(operation(synchronizeSelected), true);
  assert.equal(operation({ ...selectMany, candidates: selectMany.candidates.slice(0, 1) }), false);
  assert.equal(operation({ ...synchronizeSelected, inputs: synchronizeSelected.inputs.slice(0, 2) }), false);
});

test("binds the Event-Based Gateway node and complete heterogeneous race operation", async () => {
  const checkedSchema = JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/checked-process.schema.json`, "utf8"),
  ) as { readonly $defs: Readonly<Record<string, unknown>> };
  const semanticSchema = JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/semantic-process.schema.json`, "utf8"),
  ) as { readonly $defs: Readonly<Record<string, unknown>> };
  const ajv = new Ajv2020({ strict: true });
  const node = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: checkedSchema.$defs,
    $ref: "#/$defs/node",
  });
  const operation = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: semanticSchema.$defs,
    $ref: "#/$defs/operation",
  });
  const race = {
    id: "operation:Race",
    kind: "awaitEventRace",
    origin: { kind: "bpmnElement", elementId: "Race" },
    input: "place:Flow_Start",
    message: {
      configurationOrigin: { kind: "bpmnSequenceFlow", elementId: "Flow_Message_Config" },
      elementId: "MessageCatch",
      channel: {
        kind: "operationMessage",
        interfaceId: "Interface_1",
        interfaceOperationId: "Operation_1",
        messageId: "Message_1",
      },
      output: "place:Flow_Message_Task",
    },
    timer: {
      configurationOrigin: { kind: "bpmnSequenceFlow", elementId: "Flow_Timer_Config" },
      elementId: "TimerCatch",
      durationMs: 1000,
      output: "place:Flow_Timer_Task",
    },
  };

  assert.equal(node({ kind: "eventBasedGateway", id: "Race", direction: "diverging" }), true);
  assert.equal(node({ kind: "eventBasedGateway", id: "Race", direction: "converging" }), false);
  assert.equal(operation(race), true);
  assert.equal(operation({
    ...race,
    message: {
      ...race.message,
      channel: { kind: "directMessage", messageId: "Message_1" },
    },
  }), false);
  assert.equal(operation({ ...race, timer: { ...race.timer, durationMs: 2000 } }), false);
  assert.equal(operation({ ...race, unexpected: true }), false);
});

test("keeps every checked-process schema definition reachable", async () => {
  const schema = JSON.parse(
    await readFile(
      `${projectRoot}/contracts/schemas/checked-process.schema.json`,
      "utf8",
    ),
  ) as Readonly<Record<string, unknown>>;
  const definitions = schema.$defs;
  assert.ok(isRecord(definitions));

  const root = Object.fromEntries(
    Object.entries(schema).filter(([key]) => key !== "$defs"),
  );
  const reachable = new Set<string>();
  const pending = [...localDefinitionReferences(root)];
  while (pending.length > 0) {
    const name = pending.pop();
    assert.ok(name !== undefined);
    if (reachable.has(name)) {
      continue;
    }
    const definition = definitions[name];
    assert.notEqual(definition, undefined, `missing $defs.${name}`);
    reachable.add(name);
    pending.push(...localDefinitionReferences(definition));
  }

  assert.deepEqual(
    [...reachable].sort(compareCanonicalStrings),
    Object.keys(definitions).sort(compareCanonicalStrings),
  );
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

function localDefinitionReferences(value: unknown): Set<string> {
  const references = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value) {
      for (const reference of localDefinitionReferences(item)) {
        references.add(reference);
      }
    }
    return references;
  }
  if (!isRecord(value)) {
    return references;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string") {
      const match = /^#\/\$defs\/(.+)$/u.exec(child);
      if (match?.[1] !== undefined) {
        references.add(match[1]);
      }
      continue;
    }
    for (const reference of localDefinitionReferences(child)) {
      references.add(reference);
    }
  }
  return references;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
