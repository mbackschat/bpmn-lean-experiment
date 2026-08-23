/**
 * The sequential Multi-Instance User Task program, with the outer lifetime Timer.
 *
 * Hand-built to the shape `@bpmn-lean/bpmn-source` lowers, so consumers depend on no compiler. The
 * collection arrives as one Process-scope initial variable named by the input DataObject, which is the
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
        durationMs: 1000,
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

function startWith(commandId: string, collection: ReadonlyArray<string>) {
  const initialVariables: ReadonlyArray<VariableBinding> = [
    {
      name: reviewData.input.dataObjectId,
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

export const start = startWith("start-review", items);
export const startEmpty = startWith("start-empty-review", []);

/**
 * The state a committed `StartProcess` would leave, built directly.
 *
 * `applyStimulus` cannot reach these transitions yet and that is deliberate rather than a gap in this
 * fixture: command admission refuses any stimulus whose program names an unregistered profile, and
 * this profile stays unregistered until its capacity budget owner closes. Registering it early to
 * make a test green would flip the supported set, the capability table, the differential catalog, and
 * the corpus obligation all at once, which is the atomic change the capsule orders last.
 *
 * So the transitions are exercised from this state through `applyInternalOperation`, which is the
 * dispatcher a committed start would run, and end-to-end command evidence arrives with registration.
 * What this state asserts is only what `StartProcess` admission itself produces: a running control
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
  logicalTimeMs: 1000,
});
