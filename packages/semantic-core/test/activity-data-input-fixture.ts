/**
 * The bounded direct Activity data-input program.
 *
 * Hand-built to the shape `@bpmn-lean/bpmn-source` lowers, so consumers depend on no compiler. It is
 * the smallest program whose User Task readiness depends on Process *data* rather than only on a
 * control token: the same program and the same start command reach two different stable states
 * depending on whether `Property_ReviewContext` is bound, which is what separates an unavailable
 * source from an available one carrying explicit null.
 */
import {
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  DirectActivityDataInput,
  StartProcessStimulus,
  VariableBinding,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

// The registered scenario source's own digest, so the hand-built program names the same admitted
// source identity the compiler lane produces for it.
const sourceSha256 =
  "d495a656950873515d17b25f4dd8a45bd4edcaceea85a30695b3d217d37e779d";

export const instanceId = "ActivityDataInputInstance_1";
export const sourcePropertyId = "Property_ReviewContext";
export const targetDataInputId = "DataInput_ReviewContext";

export const directInput: DirectActivityDataInput = Object.freeze({
  associationId: "DataInputAssociation_ReviewContext",
  sourcePropertyId,
  targetDataInputId,
  targetDataInputName: "Review context",
});

export const dataInputProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: SemanticProfileId.ActivityDataInputUserTask,
    sourceId: "activity-data-input-user-task",
    sourceOverlay: null,
    sourceSha256,
  },
  processId: "Process_ActivityDataInputReview",
  controlPlaces: [
    controlPlace("Flow_Review_Completed"),
    controlPlace("Flow_Start_Review"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_Completed"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Review_Completed",
    },
    {
      ...operationBase("StartEvent_Review"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start_Review",
    },
    {
      ...operationBase("UserTask_Review"),
      kind: SemanticOperationKind.AwaitDataInputUserTask,
      input: "place:Flow_Start_Review",
      output: "place:Flow_Review_Completed",
      task: { elementId: "UserTask_Review", name: "Review invoice" },
      directInput,
    },
  ],
});

export const owner = rootScopeOccurrence(
  dataInputProgram.processId,
  instanceId,
);

export const taskId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "UserTask_Review",
  activation: 1,
});

export const activityId = Object.freeze({
  processInstanceId: instanceId,
  activityElementId: "UserTask_Review",
  activation: 1,
});

function start(
  commandId: string,
  initialVariables: ReadonlyArray<VariableBinding>,
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId,
    processId: dataInputProgram.processId,
    instanceId,
    initialVariables,
  };
}

/** The available-source start: one present nonempty string binding. */
export const startWithReviewContext = start("start-with-review-context", [
  {
    name: sourcePropertyId,
    value: { kind: VariableValueKind.String, value: "invoice-4711" },
  },
]);

/** The discriminator: a present binding whose value arm is explicit null. */
export const startWithNullReviewContext = start("start-with-null-context", [
  { name: sourcePropertyId, value: { kind: VariableValueKind.Null } },
]);

/** The primary negative: no binding at all, so the required source is unavailable. */
export const startWithoutReviewContext = start("start-without-context", []);

export const completeReview = Object.freeze({
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-review",
  taskId,
  submittedValues: [],
} as const);
