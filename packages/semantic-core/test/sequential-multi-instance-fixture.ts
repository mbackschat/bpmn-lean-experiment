/**
 * The sequential Multi-Instance User Task program, with the outer lifetime Timer.
 *
 * Hand-built to the shape `@bpmn-lean/bpmn-source` lowers, so consumers depend on no compiler. The
 * collection arrives as one Process-scope initial variable named by the input DataObjectReference, which is the
 * exact name the operation carries; nothing here reads a value by kind, because the output collection
 * is a second `StringList` and a kind-based lookup would become ambiguous the moment it is published.
 *
 * Three items is the smallest collection that separates the three interesting positions: a first
 * iteration with no predecessor, a middle iteration with both, and a last iteration whose completion
 * is the final one. The zero-item start is exported beside it because the empty collection is a
 * different arm of the same transition rather than a degenerate case of it.
 */
import {
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  initialState,
  sequentialMultiInstanceLimits,
  type CompleteUserTaskInstanceStimulus,
  type RuntimeState,
  type SemanticProcessProgram,
  type VariableBinding,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const sourceSha256 =
  "f1e2d3c4b5a60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
export const instanceId = "ReviewInstance_1";

/** The exact data-association identities the source fixture carries. */
export const reviewData = Object.freeze({
  input: {
    collectionItemDefinitionId: "ItemDefinition_StringList",
    scalarItemDefinitionId: "ItemDefinition_String",
    dataObjectId: "DataObject_InputItems",
    dataObjectReferenceId: "DataObjectReference_InputItems",
    loopDataInputId: "DataInput_Items",
    inputDataItemId: "DataInput_Item",
    taskDataInputId: "DataInput_TaskItem",
    collectionAssociationId: "DataInputAssociation_Collection",
    itemAssociationId: "DataInputAssociation_Item",
  },
  output: {
    dataObjectId: "DataObject_OutputResults",
    dataObjectReferenceId: "DataObjectReference_OutputResults",
    taskDataOutputId: "DataOutput_TaskResult",
    outputDataItemId: "DataOutput_Item",
    loopDataOutputId: "DataOutput_Results",
    itemAssociationId: "DataOutputAssociation_Item",
    collectionAssociationId: "DataOutputAssociation_Collection",
  },
});

export const reviewProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
    sourceId: "sequential-multi-instance-user-task",
    sourceOverlay: null,
    sourceSha256,
  },
  processId: "Process_SequentialMultiInstanceReview",
  controlPlaces: [
    controlPlace("Flow_Boundary"),
    controlPlace("Flow_Boundary_End"),
    controlPlace("Flow_Normal"),
    controlPlace("Flow_Start"),
  ],
  operations: [
    {
      ...operationBase("EscalationEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Boundary_End",
    },
    {
      ...operationBase("EscalationTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Boundary",
      output: "place:Flow_Boundary_End",
      task: { elementId: "EscalationTask", name: "Review escalated" },
    },
    {
      ...operationBase("NormalEnd"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Normal",
    },
    {
      ...operationBase("Review"),
      kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
      input: "place:Flow_Start",
      task: { elementId: "Review", name: "Review item" },
      data: reviewData,
      normalOutput: "place:Flow_Normal",
      boundaryTimer: {
        elementId: "Boundary_Timer",
        durationMs: 5000,
        output: "place:Flow_Boundary",
        origin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Boundary",
        },
      },
      limits: sequentialMultiInstanceLimits,
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start",
    },
  ],
});

export const owner = rootScopeOccurrence(reviewProgram.processId, instanceId);

/** The inner task occurrence of loop counter `counter`, which is its zero-based position. */
export function innerTaskId(counter: number) {
  return Object.freeze({
    processInstanceId: instanceId,
    elementId: "Review",
    activation: counter + 1,
  });
}

export const outerTimerId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "Boundary_Timer",
  activation: 1,
});

export const outerActivityId = Object.freeze({
  processInstanceId: instanceId,
  activityElementId: "Review",
  activation: 1,
});

export const items = Object.freeze(["alpha", "beta", "gamma"]);

/**
 * A `StartProcess` carrying `collection` as the sole Process binding.
 *
 * `dataObjectReferenceId` names the input DataObjectReference that entry locates by exact
 * identity rather than by value kind. It varies only for {@link orderSeparatingProgram}.
 */
export function startWithCollection(
  commandId: string,
  collection: ReadonlyArray<string>,
  dataObjectReferenceId: string = reviewData.input.dataObjectReferenceId,
) {
  const initialVariables: ReadonlyArray<VariableBinding> = [
    {
      name: dataObjectReferenceId,
      value: {
        kind: VariableValueKind.StringList,
        value: [...collection],
      },
    },
  ];
  return Object.freeze({
    kind: StimulusKind.StartProcess,
    commandId,
    processId: reviewProgram.processId,
    instanceId,
    initialVariables,
  });
}

export const start = startWithCollection("start-review", items);
export const startEmpty = startWithCollection("start-empty-review", []);

/**
 * The input DataObjectReference identity that separates the two plausible canonical binding orders.
 *
 * Against the unchanged output identity `DataObject_OutputResults`, a locale collation places `_`
 * before `B` while code point places it after, so the two comparators return opposite signs for this
 * pair. The identities in {@link reviewData} agree under both, so publication order needs its own
 * program: any admitted model whose Process DataObject IDs differ across `_` or in case separates
 * them, and this is the smallest such pair.
 */
export const orderSeparatingInputDataObjectReferenceId =
  "DataObjectReferenceB_InputItems";

/** The review Process with that one input identity substituted, and nothing else changed. */
export const orderSeparatingProgram: SemanticProcessProgram = {
  ...reviewProgram,
  operations: reviewProgram.operations.map((operation) =>
    operation.kind ===
        SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
      ? {
        ...operation,
        data: {
          ...operation.data,
          input: {
            ...operation.data.input,
            dataObjectReferenceId: orderSeparatingInputDataObjectReferenceId,
          },
        },
      }
      : operation
  ),
};

export const startOrderSeparating = startWithCollection(
  "start-order-separating",
  items,
  orderSeparatingInputDataObjectReferenceId,
);

/**
 * The state a committed `StartProcess` leaves, built directly so transition-focused tests can begin
 * after command admission without coupling their oracle to the command dispatcher. End-to-end
 * registration tests separately drive the same program through `applyStimulus`. This fixture asserts
 * only what `StartProcess` admission itself produces: a running control
 * state, the root scope occurrence, its activation, the initiation still pending, and the initial
 * Process bindings.
 */
export function startedState(stimulus: { initialVariables: ReadonlyArray<VariableBinding> }) {
  return {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId } as const,
    initiationPending: true,
    scopeOccurrences: [{ id: owner, parent: null }],
    scopeActivations: [{ elementId: owner.definitionScopeId, count: 1 }],
    variables: {
      process: { bindings: [...stimulus.initialVariables] },
      activities: [],
    },
  };
}

/**
 * The published Process output collection, or `undefined` while it is still private.
 *
 * Keyed on the fixture's own output DataObjectReference identity, which is why it belongs here rather than in one
 * of the two files that read it.
 */
export function outputBinding(state: RuntimeState): VariableBinding | undefined {
  return state.variables.process.bindings.find(({ name }) =>
    name === reviewData.output.dataObjectReferenceId
  );
}

/** The completion of the iteration at `counter`, carrying its scalar result. */
export function completeIteration(
  counter: number,
  result: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-review-${counter}`,
    taskId: innerTaskId(counter),
    submittedValues: [
      {
        name: reviewData.output.taskDataOutputId,
        value: { kind: VariableValueKind.String, value: result },
      },
    ],
  };
}

export const fireOuterTimer = Object.freeze({
  kind: StimulusKind.FireTimer,
  commandId: "fire-outer-timer",
  timerId: outerTimerId,
  logicalTimeMs: 5000,
});
