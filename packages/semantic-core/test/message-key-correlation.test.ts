import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  CorrelatedMessageInteractionKind,
  CorrelatedMessageMatchKind,
  CorrelationScalarPathLanguage,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticProfileId,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  applyInternalOperationStep,
  initialState,
  isWellFormedSemanticProcessProgram,
  observeStableState,
  matchCorrelatedMessageCandidates,
  projectCorrelatedMessageCandidate,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitCorrelatedPayloadMessageOperation,
  CorrelatedMessageAddress,
  CorrelatedMessageCandidate,
  DeliverCorrelatedPayloadMessageStimulus,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

type FootprintModule =
  typeof import("../src/internal-transition-footprint.ts");
type FootprintOrderingModule =
  typeof import("../src/internal-transition-footprint-ordering.ts");

const {
  deriveInternalTransitionFootprint,
  internalTransitionStateFootprintsAreIndependent,
  InternalTransitionPublicationAtomKind,
  InternalTransitionStateAtomKind,
} = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const { publicationSetsAreDisjoint } = await import(
  new URL(
    "../dist/internal-transition-footprint-ordering.js",
    import.meta.url,
  ).href
) as FootprintOrderingModule;

const channel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_Settlement",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_Settlement",
} as const);

function address(
  sourceSha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
): CorrelatedMessageAddress {
  return {
    definition: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "bpmn-2.0.2-message-key-correlation-draft",
      sourceId: "settlement-correlation",
      sourceSha256,
      sourceOverlay: null,
    },
    processId: "Process_SettlementCorrelation",
    channel,
    correlationKeyId: "CorrelationKey_SettlementReference",
  };
}

const processId = "Process_SettlementCorrelation";
const instanceId = "ProcessInstance_Selected";
const firstSubscriptionId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "MessageCatch_InitialSettlement",
  activation: 1,
});
const correlatedSubscriptionId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "MessageCatch_CorrelatedSettlement",
  activation: 1,
});

function correlatedOperation(): AwaitCorrelatedPayloadMessageOperation {
  return {
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
  };
}

function correlationProgram(
  operation: AwaitCorrelatedPayloadMessageOperation = correlatedOperation(),
): SemanticProcessProgram {
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: SemanticProfileId.MessageKeyCorrelation,
      sourceId: "settlement-correlation",
      sourceSha256:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceOverlay: null,
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
      operation,
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

function candidate(
  processInstanceId: string,
  key: string,
  selectedAddress: CorrelatedMessageAddress = address(),
): CorrelatedMessageCandidate {
  return {
    address: selectedAddress,
    processInstanceId,
    subscriptionId: {
      processInstanceId,
      elementId: "MessageCatch_CorrelatedSettlement",
      activation: 1,
    },
    correlationPropertyId: "CorrelationProperty_SettlementReference",
    processPropertyId: "Property_SettlementReference",
    key: { kind: VariableValueKind.String, value: key },
  };
}

test("matches exact cardinality without using candidate order as a winner", () => {
  const selectedAddress = address();
  const payload = {
    kind: VariableValueKind.String,
    value: "settlement-42",
  } as const;

  assert.deepEqual(
    matchCorrelatedMessageCandidates(selectedAddress, payload, []),
    { kind: CorrelatedMessageMatchKind.NoMatch },
  );
  assert.deepEqual(
    matchCorrelatedMessageCandidates(selectedAddress, payload, [
      candidate("ProcessInstance_A", "settlement-42"),
    ]),
    {
      kind: CorrelatedMessageMatchKind.Unique,
      candidate: candidate("ProcessInstance_A", "settlement-42"),
    },
  );
  assert.deepEqual(
    matchCorrelatedMessageCandidates(selectedAddress, payload, [
      candidate("ProcessInstance_B", "settlement-42"),
      candidate("ProcessInstance_A", "settlement-42"),
    ]),
    { kind: CorrelatedMessageMatchKind.Ambiguous },
  );
  assert.deepEqual(
    matchCorrelatedMessageCandidates(selectedAddress, payload, [
      candidate("ProcessInstance_A", "settlement-42"),
      candidate("ProcessInstance_B", "settlement-42"),
    ]),
    { kind: CorrelatedMessageMatchKind.Ambiguous },
  );
});

test("excludes an equal-local-id candidate from a different immutable definition", () => {
  const selectedAddress = address();
  const otherDefinition = address(
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  );

  assert.deepEqual(
    matchCorrelatedMessageCandidates(
      selectedAddress,
      { kind: VariableValueKind.String, value: "settlement-42" },
      [
        candidate("ProcessInstance_Other", "settlement-42", otherDefinition),
        candidate("ProcessInstance_Selected", "settlement-42"),
      ],
    ),
    {
      kind: CorrelatedMessageMatchKind.Unique,
      candidate: candidate("ProcessInstance_Selected", "settlement-42"),
    },
  );
});

test("refuses incomplete candidate facts instead of manufacturing uniqueness", () => {
  const malformed = {
    ...candidate("ProcessInstance_Malformed", "settlement-42"),
    correlationPropertyId: "",
  } as CorrelatedMessageCandidate;

  assert.equal(
    matchCorrelatedMessageCandidates(
      address(),
      { kind: VariableValueKind.String, value: "settlement-42" },
      [malformed],
    ),
    null,
  );
});

test("admits the exact correlated wait selectors and rejects a mismatched property path", () => {
  assert.equal(isWellFormedSemanticProcessProgram(correlationProgram()), true);
  for (const operation of [
    {
      ...correlatedOperation(),
      payloadSelector: {
        ...correlatedOperation().payloadSelector,
        body: " payload",
      },
    },
    {
      ...correlatedOperation(),
      payloadSelector: {
        language: "urn:alternate-path-language",
        body: "payload",
      },
    },
    {
      ...correlatedOperation(),
      processPropertySelector: {
        ...correlatedOperation().processPropertySelector,
        body: "property:OtherProperty",
      },
    },
    {
      ...correlatedOperation(),
      processPropertySelector: {
        ...correlatedOperation().processPropertySelector,
        body: "property:Property_SettlementReference ",
      },
    },
    {
      ...correlatedOperation(),
      processPropertySelector: {
        language: "urn:alternate-path-language",
        body: "property:Property_SettlementReference",
        propertyId: "Property_SettlementReference",
      },
    },
    {
      ...correlatedOperation(),
      processPropertySelector: {
        ...correlatedOperation().processPropertySelector,
        body: "property:",
        propertyId: "",
      },
    },
  ] as ReadonlyArray<AwaitCorrelatedPayloadMessageOperation>) {
    assert.equal(
      isWellFormedSemanticProcessProgram(correlationProgram(operation)),
      false,
    );
  }
});

test("matches only non-empty String keys with exact scalar-value sequences", () => {
  const selectedAddress = address();

  assert.equal(
    matchCorrelatedMessageCandidates(
      selectedAddress,
      { kind: VariableValueKind.String, value: "" },
      [],
    ),
    null,
  );
  assert.equal(
    matchCorrelatedMessageCandidates(
      selectedAddress,
      { kind: VariableValueKind.Boolean, value: true },
      [],
    ),
    null,
  );
  assert.deepEqual(
    matchCorrelatedMessageCandidates(
      selectedAddress,
      { kind: VariableValueKind.String, value: "e\u0301" },
      [candidate("ProcessInstance_Composed", "é")],
    ),
    { kind: CorrelatedMessageMatchKind.NoMatch },
  );
  assert.deepEqual(
    matchCorrelatedMessageCandidates(
      selectedAddress,
      { kind: VariableValueKind.String, value: "SETTLEMENT-42" },
      [candidate("ProcessInstance_Case", "settlement-42")],
    ),
    { kind: CorrelatedMessageMatchKind.NoMatch },
  );
});

test("projects one exact candidate and commits only content-bound target delivery", () => {
  const program = correlationProgram();
  const started = applyStimulus(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start-correlation",
    processId,
    instanceId,
    initialVariables: [],
  });
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.deepEqual(started.state.messageWaits.map(({ id }) => id), [
    firstSubscriptionId,
  ]);

  const initialized = applyStimulus(program, started.state, {
    kind: StimulusKind.DeliverPayloadMessage,
    commandId: "initialize-correlation",
    subscriptionId: firstSubscriptionId,
    channel,
    payload: { kind: VariableValueKind.String, value: "settlement-42" },
  });
  assert.equal(initialized.outcome, CommandOutcome.Committed);
  assert.deepEqual(initialized.state.messageWaits.map(({ id }) => id), [
    correlatedSubscriptionId,
  ]);

  const expectedAddress = address();
  const expectedCandidate = candidate(instanceId, "settlement-42");
  assert.deepEqual(
    projectCorrelatedMessageCandidate(program, initialized.state),
    expectedCandidate,
  );
  assert.deepEqual(
    observeStableState(program, initialized.state)?.enabledInteractions,
    [{
      kind: CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage,
      address: expectedAddress,
    }],
  );

  const delivery = {
    kind: StimulusKind.DeliverCorrelatedPayloadMessage,
    commandId: "deliver-correlated-settlement",
    address: expectedAddress,
    ingressOrdinal: 1,
    subscriptionId: correlatedSubscriptionId,
    correlationPropertyId: expectedCandidate.correlationPropertyId,
    processPropertyId: expectedCandidate.processPropertyId,
    payload: { kind: VariableValueKind.String, value: "settlement-42" },
  } as const satisfies DeliverCorrelatedPayloadMessageStimulus;
  const delivered = applyStimulus(program, initialized.state, delivery);
  assert.equal(delivered.outcome, CommandOutcome.Committed);
  assert.deepEqual(delivered.state.messageWaits, []);
  assert.deepEqual(delivered.state.variables.process.bindings, [{
    name: "Property_SettlementReference",
    value: { kind: VariableValueKind.String, value: "settlement-42" },
  }]);
  assert.deepEqual(delivered.state.userTaskWaits.map(({ id }) => id), [{
    processInstanceId: instanceId,
    elementId: "UserTask_ReviewSettlement",
    activation: 1,
  }]);

  for (const [index, mutation] of [
    { address: address("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") },
    { correlationPropertyId: "OtherCorrelationProperty" },
    { processPropertyId: "OtherProperty" },
    { payload: { kind: VariableValueKind.String, value: "different" } },
    { subscriptionId: { ...correlatedSubscriptionId, activation: 2 } },
  ].entries()) {
    const refused = applyStimulus(program, initialized.state, {
      ...delivery,
      ...mutation,
      commandId: `refuse-correlated-${index}`,
    } as DeliverCorrelatedPayloadMessageStimulus);
    assert.equal(refused.outcome, CommandOutcome.Rejected);
    assert.deepEqual(refused.state, initialized.state);
  }
});

test("footprints the Process-property read and exact candidate publication", () => {
  const program = correlationProgram();
  const started = applyStimulus(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start-footprint",
    processId,
    instanceId,
    initialVariables: [],
  });
  const beforeArming = applyStimulus(program, started.state, {
    kind: StimulusKind.DeliverPayloadMessage,
    commandId: "initialize-footprint",
    subscriptionId: firstSubscriptionId,
    channel,
    payload: { kind: VariableValueKind.String, value: "settlement-42" },
  }, 0);
  assert.equal(beforeArming.outcome, CommandOutcome.Committed);
  const operation = program.operations.find(
    ({ kind }) => kind ===
      SemanticOperationKind.AwaitCorrelatedPayloadMessage,
  );
  assert.ok(operation !== undefined);
  if (operation === undefined) {
    return;
  }
  const step = applyInternalOperationStep(program, operation, beforeArming.state);
  assert.ok(step?.owner !== null && step?.owner !== undefined);
  if (step?.owner === null || step?.owner === undefined) {
    return;
  }
  const footprint = deriveInternalTransitionFootprint(
    program,
    beforeArming.state,
    { operation, owner: step.owner },
  );
  assert.ok(footprint !== null);
  if (footprint === null) {
    return;
  }
  const processVariableRead = footprint.reads.find((atom) =>
    atom.kind === InternalTransitionStateAtomKind.ProcessVariable &&
    atom.name === "Property_SettlementReference"
  );
  assert.ok(processVariableRead !== undefined);
  if (processVariableRead === undefined) {
    return;
  }
  assert.equal(internalTransitionStateFootprintsAreIndependent(
    { reads: [processVariableRead], writes: [] },
    { reads: [processVariableRead], writes: [] },
  ), true);
  assert.equal(internalTransitionStateFootprintsAreIndependent(
    { reads: [processVariableRead], writes: [] },
    { reads: [], writes: [processVariableRead] },
  ), false);
  const publication = footprint.publications.find((atom) =>
    atom.kind === InternalTransitionPublicationAtomKind.CorrelationCandidate
  );
  assert.deepEqual(publication, {
    kind: InternalTransitionPublicationAtomKind.CorrelationCandidate,
    address: address(),
    subscriptionOccurrence: correlatedSubscriptionId,
    correlationPropertyId: "CorrelationProperty_SettlementReference",
    processPropertyId: "Property_SettlementReference",
  });
  if (
    publication?.kind !==
      InternalTransitionPublicationAtomKind.CorrelationCandidate
  ) {
    return;
  }
  const samePublication = publication;
  assert.equal(
    publicationSetsAreDisjoint([samePublication], [samePublication]),
    false,
  );
  assert.equal(publicationSetsAreDisjoint([samePublication], [{
    ...samePublication,
    subscriptionOccurrence: {
      ...correlatedSubscriptionId,
      activation: 2,
    },
  }]), true);
});
