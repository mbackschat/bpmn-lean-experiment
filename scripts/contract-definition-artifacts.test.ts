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
  requireAwaitUserTask,
  requireCheckedUserTask,
  requireMutableState,
  requireUserTaskCompletion,
  semanticOperationKind,
  serviceTaskDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";

import {
  isRecord,
  localDefinitionReferences,
} from "./schema-structure.ts";
import { verifyTerminateScopeBindings } from "./end-operation-artifact-consistency.ts";
import type {
  CheckedProcess,
  SemanticProcessProgram,
  TerminateScopeOperation,
} from "../packages/semantic-core/src/index.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("rejects every checked-to-IL Terminate End binding drift", () => {
  const checkedProcess = {
    nodes: [{ kind: "terminateEndEvent", id: "End_Terminate" }],
    nodeScopes: [{ nodeId: "End_Terminate", scopeId: "Scope_Child" }],
    sequenceFlows: [{
      id: "Flow_Trigger_Terminate",
      sourceId: "Task_Trigger",
      targetId: "End_Terminate",
      condition: null,
    }],
  } as unknown as CheckedProcess;
  const operation = {
    kind: "terminateScope",
    id: "operation:End_Terminate",
    origin: { kind: "bpmnElement", elementId: "End_Terminate" },
    input: "place:Flow_Trigger_Terminate",
    scopeId: "Scope_Child",
  } as unknown as TerminateScopeOperation;
  const semanticProcess = {
    operations: [operation],
    operationScopes: [{
      operationId: operation.id,
      scopeId: "Scope_Child",
    }],
    controlPlaces: [{
      id: operation.input,
      origin: {
        kind: "bpmnSequenceFlow",
        elementId: "Flow_Trigger_Terminate",
      },
    }],
    controlPlaceScopes: [{
      controlPlaceId: operation.input,
      scopeId: "Scope_Child",
    }],
  } as unknown as SemanticProcessProgram;

  assert.doesNotThrow(() =>
    verifyTerminateScopeBindings(checkedProcess, semanticProcess)
  );
  const mutations: ReadonlyArray<TerminateScopeOperation> = [
    {
      ...operation,
      origin: { kind: "bpmnElement", elementId: "End_Other" },
    } as unknown as TerminateScopeOperation,
    { ...operation, input: "place:Flow_Other" },
    { ...operation, scopeId: "Scope_Parent" },
  ];
  for (const mutatedOperation of mutations) {
    assert.throws(
      () =>
        verifyTerminateScopeBindings(checkedProcess, {
          ...semanticProcess,
          operations: [mutatedOperation],
        }),
      /Terminate End/u,
    );
  }
});

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

test("binds payload Message definitions to distinct exact output and channel schemas", async () => {
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
  const directOutput = {
    associationId: "Association_1",
    sourceDataOutputId: "DataOutput_1",
    sourceDataOutputName: null,
    targetPropertyId: "Property_1",
  } as const;
  const checkedNode = {
    kind: "payloadMessageCatchEvent",
    id: "CatchEvent_1",
    channel: operationChannel,
    directOutput,
  } as const;
  const semanticOperation = {
    id: "operation:CatchEvent_1",
    kind: "awaitPayloadMessage",
    origin: { kind: "bpmnElement", elementId: "CatchEvent_1" },
    input: "place:Flow_In",
    output: "place:Flow_Out",
    message: {
      elementId: "CatchEvent_1",
      channel: operationChannel,
    },
    directOutput,
  } as const;

  for (const definitions of [checkedSchema.$defs, semanticSchema.$defs]) {
    const payloadOutput = definitions.directCatchEventPayloadOutput;
    assert.ok(isRecord(payloadOutput));
    assert.deepEqual(payloadOutput.required, [
      "associationId",
      "sourceDataOutputId",
      "sourceDataOutputName",
      "targetPropertyId",
    ]);
    assert.ok(isRecord(payloadOutput.properties));
    assert.deepEqual(Object.keys(payloadOutput.properties), payloadOutput.required);
  }
  const checkedNodeDefinition = checkedSchema.$defs.node;
  assert.ok(isRecord(checkedNodeDefinition));
  assert.ok(Array.isArray(checkedNodeDefinition.oneOf));
  const payloadNodeDefinition = checkedNodeDefinition.oneOf.find((candidate) => {
    if (!isRecord(candidate) || !isRecord(candidate.properties)) {
      return false;
    }
    const kind = candidate.properties.kind;
    return isRecord(kind) && kind.const === "payloadMessageCatchEvent";
  });
  assert.ok(isRecord(payloadNodeDefinition));
  assert.ok(isRecord(payloadNodeDefinition.properties));
  assert.deepEqual(payloadNodeDefinition.required, [
    "kind",
    "id",
    "channel",
    "directOutput",
  ]);
  const checkedDirectOutput = payloadNodeDefinition.properties.directOutput;
  assert.ok(isRecord(checkedDirectOutput));
  assert.equal(checkedDirectOutput.$ref, "#/$defs/directCatchEventPayloadOutput");
  const payloadOperationDefinition = semanticSchema.$defs.awaitPayloadMessage;
  assert.ok(isRecord(payloadOperationDefinition));
  assert.ok(isRecord(payloadOperationDefinition.properties));
  const semanticDirectOutput = payloadOperationDefinition.properties.directOutput;
  assert.ok(isRecord(semanticDirectOutput));
  assert.equal(semanticDirectOutput.$ref, "#/$defs/directCatchEventPayloadOutput");

  assert.equal(node(checkedNode), true);
  assert.equal(operation(semanticOperation), true);
  assert.equal(node({ ...checkedNode, channel: directChannel }), false);
  assert.equal(operation({
    ...semanticOperation,
    message: { ...semanticOperation.message, channel: directChannel },
  }), false);
  assert.equal(node({
    ...checkedNode,
    directOutput: {
      associationId: directOutput.associationId,
      sourceDataOutputId: directOutput.sourceDataOutputId,
      sourceDataOutputName: directOutput.sourceDataOutputName,
    },
  }), false);
  assert.equal(operation({
    ...semanticOperation,
    directOutput: { ...directOutput, unexpected: true },
  }), false);
});

test("keeps payload-bearing Message stimulus and enabled interaction arms exact", async () => {
  const schemaDocument = JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/scenario.schema.json`, "utf8"),
  ) as Readonly<Record<string, unknown>> & {
    readonly $defs: Readonly<Record<string, unknown>>;
  };
  const schema = schemaDocument.$defs;
  const ajv = new Ajv2020({ strict: true });
  const deliverMessage = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema,
    $ref: "#/$defs/deliverMessage",
  });
  const deliverPayloadMessage = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema,
    $ref: "#/$defs/deliverPayloadMessage",
  });
  const enabledDeliverPayloadMessage = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema,
    $ref: "#/$defs/enabledDeliverPayloadMessage",
  });
  const base = {
    commandId: "command-1",
    subscriptionId: {
      processInstanceId: "instance-1",
      elementId: "CatchEvent_1",
      activation: 1,
    },
    channel: { kind: "directMessage", messageId: "Message_1" },
  } as const;
  const payloadDelivery = {
    ...base,
    kind: "deliverPayloadMessage",
    payload: { kind: "null" },
  } as const;

  assert.ok(isRecord(schemaDocument.properties));
  const stimuli = schemaDocument.properties.stimuli;
  assert.ok(isRecord(stimuli));
  assert.ok(isRecord(stimuli.items));
  assert.ok(Array.isArray(stimuli.items.oneOf));
  assert.equal(stimuli.items.oneOf.some((arm) =>
    isRecord(arm) && arm.$ref === "#/$defs/deliverPayloadMessage"
  ), true);
  const stateObservation = schema.stateObservation;
  assert.ok(isRecord(stateObservation));
  assert.ok(isRecord(stateObservation.properties));
  const enabledInteractions = stateObservation.properties.enabledInteractions;
  assert.ok(isRecord(enabledInteractions));
  assert.ok(isRecord(enabledInteractions.items));
  assert.ok(Array.isArray(enabledInteractions.items.oneOf));
  assert.equal(enabledInteractions.items.oneOf.some((arm) =>
    isRecord(arm) && arm.$ref === "#/$defs/enabledDeliverPayloadMessage"
  ), true);

  assert.equal(deliverPayloadMessage(payloadDelivery), true);
  assert.equal(deliverPayloadMessage({
    kind: payloadDelivery.kind,
    commandId: base.commandId,
    subscriptionId: base.subscriptionId,
    channel: base.channel,
  }), false);
  assert.equal(deliverMessage({
    ...base,
    kind: "deliverMessage",
    payload: payloadDelivery.payload,
  }), false);
  assert.equal(enabledDeliverPayloadMessage({
    kind: payloadDelivery.kind,
    subscriptionId: base.subscriptionId,
    channel: base.channel,
  }), true);
  assert.equal(enabledDeliverPayloadMessage({
    kind: payloadDelivery.kind,
    subscriptionId: base.subscriptionId,
    channel: base.channel,
    payload: payloadDelivery.payload,
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

test("binds the Call Activity node and exact invocation pair", async () => {
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
  const origin = { kind: "bpmnElement", elementId: "Call_CalledProcess" };
  const invoke = {
    id: "operation:Call_CalledProcess",
    kind: "invokeProcess",
    origin,
    input: "place:Flow_Caller_Start_Call",
    calledProcessId: "CalledProcess",
    calledRootScopeId: "scope:CalledProcess",
    calledEntry: "place:Flow_Called_Start_Task",
    returnOperationId: "operation:return-process:Call_CalledProcess",
  };
  const returned = {
    id: "operation:return-process:Call_CalledProcess",
    kind: "returnProcess",
    origin,
    calledProcessId: "CalledProcess",
    calledRootScopeId: "scope:CalledProcess",
    callerOutput: "place:Flow_Caller_Call_Task",
  };

  assert.equal(node({
    kind: "callActivity",
    id: "Call_CalledProcess",
    calledProcessId: "CalledProcess",
  }), true);
  assert.equal(node({ kind: "callActivity", id: "Call_CalledProcess" }), false);
  assert.equal(operation(invoke), true);
  assert.equal(operation(returned), true);
  assert.equal(operation({ ...invoke, calledEntry: undefined }), false);
  assert.equal(operation({ ...returned, returnOperationId: invoke.returnOperationId }), false);
});

/**
 * Covers both closed definition schemas, not only the checked graph.
 *
 * This is a second detector for an unreferenced `$defs` entry over the same reachability
 * traversal: it catches a forgotten union wiring by a different assertion, and additionally
 * rejects the orphaned arm definitions that wiring leaves behind, but it shares that
 * traversal's failure modes rather than being uncorrelated with the coverage guard.
 */
test("keeps every definition schema's entries reachable", async () => {
  for (const file of ["checked-process.schema.json", "semantic-process.schema.json"]) {
    const schema = JSON.parse(
      await readFile(`${projectRoot}/contracts/schemas/${file}`, "utf8"),
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
  }
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

test("requires one closed internal scheduling mode in definition artifacts", async () => {
  const scheduled = parallelDefinitionArtifacts();
  scheduled.semanticProcess.internalSchedulingMode =
    "requireChoiceSchedule" as SemanticProcessProgram["internalSchedulingMode"];
  assert.equal(
    await verifyDefinitionArtifacts(projectRoot, scheduled),
    scheduled,
  );

  const missing = parallelDefinitionArtifacts();
  delete (missing.semanticProcess as unknown as Record<string, unknown>)
    .internalSchedulingMode;
  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, missing),
    /semantic process schema validation failed/u,
  );

  const unknown = parallelDefinitionArtifacts();
  (unknown.semanticProcess as unknown as Record<string, unknown>)
    .internalSchedulingMode = "unknown";
  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, unknown),
    /semantic process schema validation failed/u,
  );
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
