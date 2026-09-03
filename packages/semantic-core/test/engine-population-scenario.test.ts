import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CorrelationScalarPathLanguage,
  EnginePopulationPublicationOutcomeKind,
  MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
  MessageChannelKind,
  ProcessStatus,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  runEnginePopulationScenario,
} from "@bpmn-lean/semantic-core";
import type {
  BpmnResource,
  EnginePopulationScenario,
  SemanticProcessProgram,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

const sourceShaA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sourceShaB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const processId = "Process_SettlementCorrelation";
const channel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_Settlement",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_Settlement",
} as const);

function bpmn(id = "settlement-correlation", sha256 = sourceShaA): BpmnResource {
  return {
    id,
    relativePath: "scenarios/message-key-correlation/process.bpmn",
    sha256,
    sourceOverlay: null,
  };
}

function correlationProgram(
  definition: BpmnResource = bpmn(),
): SemanticProcessProgram {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
      sourceId: definition.id,
      sourceSha256: definition.sha256,
      sourceOverlay: definition.sourceOverlay,
    },
    processId,
    controlPlaces: [
      controlPlace("Flow_Correlated_Review"),
      controlPlace("Flow_Initial_Correlated"),
      controlPlace("Flow_Review_End"),
      controlPlace("Flow_Start_Initial"),
    ],
    operations: [
      {
        ...operationBase("Start_SettlementCorrelation"),
        kind: SemanticOperationKind.Initiate,
        output: "place:Flow_Start_Initial",
      },
      {
        ...operationBase("MessageCatch_InitialSettlement"),
        kind: SemanticOperationKind.AwaitPayloadMessage,
        input: "place:Flow_Start_Initial",
        output: "place:Flow_Initial_Correlated",
        message: {
          elementId: "MessageCatch_InitialSettlement",
          channel,
        },
        directOutput: {
          associationId: "DataOutputAssociation_SettlementReference",
          sourceDataOutputId: "DataOutput_SettlementReference",
          sourceDataOutputName: "Settlement reference",
          targetPropertyId: "Property_SettlementReference",
        },
      },
      {
        ...operationBase("MessageCatch_CorrelatedSettlement"),
        kind: SemanticOperationKind.AwaitCorrelatedPayloadMessage,
        input: "place:Flow_Initial_Correlated",
        output: "place:Flow_Correlated_Review",
        message: {
          elementId: "MessageCatch_CorrelatedSettlement",
          channel,
        },
        correlationKeyId: "CorrelationKey_SettlementReference",
        correlationPropertyId: "CorrelationProperty_SettlementReference",
        payloadSelector: {
          language: CorrelationScalarPathLanguage,
          body: "payload",
        },
        processPropertySelector: {
          language: CorrelationScalarPathLanguage,
          body: "property:Property_SettlementReference",
          propertyId: "Property_SettlementReference",
        },
      },
      {
        ...operationBase("UserTask_ReviewSettlement"),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_Correlated_Review",
        output: "place:Flow_Review_End",
        task: {
          elementId: "UserTask_ReviewSettlement",
          name: "Review settlement",
        },
      },
      {
        ...operationBase("End_SettlementReviewed"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_Review_End",
      },
    ],
  });
}

function initializedInstance(
  definitionId: string,
  instanceId: string,
  key: string,
) {
  return {
    definitionId,
    stimuli: [{
      kind: StimulusKind.StartProcess,
      commandId: `start-${instanceId}`,
      processId,
      instanceId,
      initialVariables: [],
    }, {
      kind: StimulusKind.DeliverPayloadMessage,
      commandId: `initialize-${instanceId}`,
      subscriptionId: {
        processInstanceId: instanceId,
        elementId: "MessageCatch_InitialSettlement",
        activation: 1,
      },
      channel,
      payload: { kind: VariableValueKind.String, value: key },
    }],
  } as const;
}

function publicationAddress(definition = bpmn()) {
  return {
    definition: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
      sourceId: definition.id,
      sourceSha256: definition.sha256,
      sourceOverlay: definition.sourceOverlay,
    },
    processId,
    channel,
    correlationKeyId: "CorrelationKey_SettlementReference",
  } as const;
}

function populationScenario(
  firstKey: string,
  secondKey: string,
  publishedKey: string,
): EnginePopulationScenario {
  const definition = bpmn();
  return {
    kind: "enginePopulationScenario",
    id: "correlated-settlement-confirmation",
    profile: MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
    definitions: [definition],
    instances: [
      initializedInstance(definition.id, "ProcessInstance_A", firstKey),
      initializedInstance(definition.id, "ProcessInstance_B", secondKey),
    ],
    publications: [{
      kind: "publishCorrelatedPayloadMessage",
      commandId: "publish-correlated-settlement",
      address: publicationAddress(definition),
      payload: { kind: VariableValueKind.String, value: publishedKey },
    }],
    observations: ["publicationResults", "processStates", "ingressOrdinals"],
    executionTargets: {
      lean: true,
      typeScriptCore: true,
      temporal: true,
      cib: null,
    },
    provenance: {
      normativeRefs: ["BPMN20.xsd#tCorrelationKey"],
      cibRevision: "5a45b47ea22688d774de97277c3ff7013f54fdd2",
      cibRefs: [],
    },
  };
}

function programs(
  entries: ReadonlyArray<readonly [string, SemanticProcessProgram]> = [[
    "settlement-correlation",
    correlationProgram(),
  ]],
): ReadonlyMap<string, SemanticProcessProgram> {
  return new Map(entries);
}

function stateById(
  states: ReadonlyArray<StateObservation>,
  instanceId: string,
): StateObservation {
  const state = states.find((candidate) => candidate.instanceId === instanceId);
  assert.ok(state !== undefined);
  return state;
}

test("routes a unique publication only to the exact matching instance", () => {
  const result = runEnginePopulationScenario(
    populationScenario("settlement-42", "settlement-84", "settlement-42"),
    programs(),
  );
  assert.ok(result !== null);
  assert.deepEqual(result.publicationResults, [{
    commandId: "publish-correlated-settlement",
    ingressOrdinal: 1,
    outcome: {
      kind: EnginePopulationPublicationOutcomeKind.Committed,
      target: {
        processInstanceId: "ProcessInstance_A",
        subscriptionId: {
          processInstanceId: "ProcessInstance_A",
          elementId: "MessageCatch_CorrelatedSettlement",
          activation: 1,
        },
      },
    },
  }]);
  assert.deepEqual(result.ingressOrdinals, [{
    commandId: "publish-correlated-settlement",
    ingressOrdinal: 1,
  }]);
  assert.deepEqual(
    result.processStates.map(({ instanceId }) => instanceId),
    ["ProcessInstance_A", "ProcessInstance_B"],
  );
  const selected = stateById(result.processStates, "ProcessInstance_A");
  const untouched = stateById(result.processStates, "ProcessInstance_B");
  assert.equal(selected.status, ProcessStatus.Running);
  assert.deepEqual(selected.openMessageSubscriptions, []);
  assert.deepEqual(selected.openUserTasks.map(({ id }) => id), [{
    processInstanceId: "ProcessInstance_A",
    elementId: "UserTask_ReviewSettlement",
    activation: 1,
  }]);
  assert.deepEqual(selected.variables, [{
    name: "Property_SettlementReference",
    value: { kind: VariableValueKind.String, value: "settlement-42" },
  }]);
  assert.deepEqual(untouched.openUserTasks, []);
  assert.deepEqual(untouched.openMessageSubscriptions.map(({ id }) => id), [{
    processInstanceId: "ProcessInstance_B",
    elementId: "MessageCatch_CorrelatedSettlement",
    activation: 1,
  }]);
  assert.deepEqual(untouched.variables, [{
    name: "Property_SettlementReference",
    value: { kind: VariableValueKind.String, value: "settlement-84" },
  }]);
});

test("zero and ambiguous matches preserve every initialized wait", () => {
  for (const [scenario, outcome] of [[
    populationScenario("settlement-42", "settlement-84", "settlement-00"),
    EnginePopulationPublicationOutcomeKind.RejectedNoMatch,
  ], [
    populationScenario("settlement-42", "settlement-42", "settlement-42"),
    EnginePopulationPublicationOutcomeKind.RejectedAmbiguous,
  ]] as const) {
    const result = runEnginePopulationScenario(scenario, programs());
    assert.ok(result !== null);
    assert.deepEqual(result.publicationResults[0]?.outcome, { kind: outcome });
    for (const state of result.processStates) {
      assert.equal(state.kind, CanonicalObservationKind.State);
      assert.equal(state.status, ProcessStatus.Running);
      assert.deepEqual(state.openUserTasks, []);
      assert.equal(state.openMessageSubscriptions.length, 1);
      assert.equal(
        state.openMessageSubscriptions[0]?.id.processInstanceId,
        state.instanceId,
      );
    }
  }
});

test("a same-local-id candidate under another source digest is outside the population address", () => {
  const definitionA = bpmn();
  const definitionB = bpmn("settlement-correlation-shadow", sourceShaB);
  const scenario = {
    ...populationScenario("settlement-42", "settlement-84", "settlement-42"),
    definitions: [definitionA, definitionB],
    instances: [
      initializedInstance(definitionA.id, "ProcessInstance_A", "settlement-42"),
      initializedInstance(definitionB.id, "ProcessInstance_B", "settlement-42"),
    ],
    publications: [{
      kind: "publishCorrelatedPayloadMessage",
      commandId: "publish-correlated-settlement",
      address: publicationAddress(definitionA),
      payload: { kind: VariableValueKind.String, value: "settlement-42" },
    }],
  } as const satisfies EnginePopulationScenario;
  const result = runEnginePopulationScenario(scenario, programs([
    [definitionA.id, correlationProgram(definitionA)],
    [definitionB.id, correlationProgram(definitionB)],
  ]));
  assert.ok(result !== null);
  assert.equal(
    result.publicationResults[0]?.outcome.kind,
    EnginePopulationPublicationOutcomeKind.Committed,
  );
  assert.equal(
    stateById(result.processStates, "ProcessInstance_B")
      .openMessageSubscriptions.length,
    1,
  );
});

test("result is invariant under instance and program-binding insertion order", () => {
  const definitionA = bpmn();
  const definitionB = bpmn("settlement-correlation-shadow", sourceShaB);
  const scenario = {
    ...populationScenario("settlement-42", "settlement-84", "settlement-42"),
    definitions: [definitionA, definitionB],
    instances: [
      initializedInstance(definitionA.id, "ProcessInstance_A", "settlement-42"),
      initializedInstance(definitionB.id, "ProcessInstance_B", "settlement-84"),
    ],
  } as const satisfies EnginePopulationScenario;
  const programA = correlationProgram(definitionA);
  const programB = correlationProgram(definitionB);
  const forward = runEnginePopulationScenario(scenario, programs([
    [definitionA.id, programA],
    [definitionB.id, programB],
  ]));
  const reverse = runEnginePopulationScenario({
    ...scenario,
    definitions: [scenario.definitions[1], scenario.definitions[0]],
    instances: [scenario.instances[1], scenario.instances[0]],
  }, programs([
    [definitionB.id, programB],
    [definitionA.id, programA],
  ]));
  assert.deepEqual(reverse, forward);
});

test("refuses incomplete or mismatched definition-program bindings", () => {
  const scenario = populationScenario(
    "settlement-42",
    "settlement-84",
    "settlement-42",
  );
  const drifted = correlationProgram({
    ...bpmn(),
    sha256: sourceShaB,
  });
  const wrongProfile = {
    ...correlationProgram(),
    identity: {
      ...correlationProgram().identity,
      semanticProfile: "bpmn-2.0.2-message-payload-catch-draft",
    },
  } as SemanticProcessProgram;
  const wrongSource = {
    ...correlationProgram(),
    identity: {
      ...correlationProgram().identity,
      sourceId: "other-source",
    },
  } as SemanticProcessProgram;
  const wrongOverlay = {
    ...correlationProgram(),
    identity: {
      ...correlationProgram().identity,
      sourceOverlay: {
        id: "unexpected-overlay",
        sha256: sourceShaB,
      },
    },
  } as SemanticProcessProgram;
  for (const bindings of [
    new Map<string, SemanticProcessProgram>(),
    programs([["settlement-correlation", drifted]]),
    programs([["settlement-correlation", wrongProfile]]),
    programs([["settlement-correlation", wrongSource]]),
    programs([["settlement-correlation", wrongOverlay]]),
    programs([["wrong-definition-id", correlationProgram()]]),
    programs([
      ["settlement-correlation", correlationProgram()],
      ["unexpected", correlationProgram()],
    ]),
  ]) {
    assert.equal(runEnginePopulationScenario(scenario, bindings), null);
  }
});

test("refuses a failed initialization instead of manufacturing a candidate", () => {
  const scenario = populationScenario(
    "settlement-42",
    "settlement-84",
    "settlement-42",
  );
  const first = scenario.instances[0];
  const failedInitialization = {
    ...scenario,
    instances: [{
      ...first,
      stimuli: [first.stimuli[0], {
        ...first.stimuli[1],
        subscriptionId: {
          ...first.stimuli[1].subscriptionId,
          activation: 2,
        },
      }],
    }, scenario.instances[1]],
  } as const satisfies EnginePopulationScenario;

  assert.equal(
    runEnginePopulationScenario(failedInitialization, programs()),
    null,
  );
});
