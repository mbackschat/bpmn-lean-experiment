/**
 * The bounded direct Activity data-output program.
 *
 * Hand-built to the shape `@bpmn-lean/bpmn-source` lowers, so consumers depend on no compiler. It is
 * the mirror of the data-input fixture and deliberately starts with *no* Process binding at all:
 * under `ADOUTPUT-ENTRY-01` the task must still activate, which is exactly the state in which the
 * input family would stay ready and create nothing.
 *
 * The declared `DataOutput` id and the target `Property` id differ on purpose. That inequality is the
 * capsule's separating witness for `ADOUTPUT-ROUTE-01`: an implementation that merged the two names
 * would satisfy every routed expectation here by coincidence.
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
  CompleteUserTaskInstanceStimulus,
  DirectActivityDataOutput,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

// The registered scenario source's own digest, so the hand-built program names the same admitted
// source identity the compiler lane produces for it.
const sourceSha256 =
  "de5a4f547f30a2137f8836130f2bbf6156bed14ca8d172d4effd80de2dac0b1b";

export const instanceId = "ActivityDataOutputInstance_1";
export const sourceDataOutputId = "DataOutput_Decision";
export const targetPropertyId = "Property_UnderwritingOutcome";

export const directOutput: DirectActivityDataOutput = Object.freeze({
  associationId: "DataOutputAssociation_Decision",
  sourceDataOutputId,
  sourceDataOutputName: "Underwriting decision",
  targetPropertyId,
});

export const dataOutputProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: SemanticProfileId.ActivityDataOutputUserTask,
    sourceId: "activity-data-output-user-task",
    sourceOverlay: null,
    sourceSha256,
  },
  processId: "Process_ActivityDataOutputUnderwriting",
  controlPlaces: [
    controlPlace("Flow_Application_Decide"),
    controlPlace("Flow_Decide_Recorded"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_Recorded"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Decide_Recorded",
    },
    {
      ...operationBase("StartEvent_Application"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Application_Decide",
    },
    {
      ...operationBase("UserTask_Decide"),
      kind: SemanticOperationKind.AwaitDataOutputUserTask,
      input: "place:Flow_Application_Decide",
      output: "place:Flow_Decide_Recorded",
      task: { elementId: "UserTask_Decide", name: "Decide credit application" },
      directOutput,
    },
  ],
});

export const owner = rootScopeOccurrence(
  dataOutputProgram.processId,
  instanceId,
);

export const taskId = Object.freeze({
  processInstanceId: instanceId,
  elementId: "UserTask_Decide",
  activation: 1,
});

export const activityId = Object.freeze({
  processInstanceId: instanceId,
  activityElementId: "UserTask_Decide",
  activation: 1,
});

/** The only start this capsule needs: the Activity's entry may not depend on Process data. */
export const startUnderwriting: StartProcessStimulus = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-underwriting",
  processId: dataOutputProgram.processId,
  instanceId,
  initialVariables: [],
});

function complete(
  commandId: string,
  submittedValues: CompleteUserTaskInstanceStimulus["submittedValues"],
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId,
    submittedValues,
  };
}

/** The accepted completion: the single required output named by its exact declared id. */
export const decideApproved = complete("decide-approved", [
  {
    name: sourceDataOutputId,
    value: { kind: VariableValueKind.String, value: "approved" },
  },
]);

/** A supplied explicit null makes the required output available exactly as a supplied string does. */
export const decideNull = complete("decide-null", [
  { name: sourceDataOutputId, value: { kind: VariableValueKind.Null } },
]);

/**
 * The routed-versus-named discriminator. Submitting the association's *target* name is a name the
 * OutputSet never declares, so it must be refused rather than written straight into Process scope.
 */
export const decideUnderTargetName = complete("decide-under-target-name", [
  {
    name: targetPropertyId,
    value: { kind: VariableValueKind.String, value: "approved" },
  },
]);

/** `ADOUTPUT-REQUIRE-01`: the required output is not made available at all. */
export const decideWithoutOutput = complete("decide-without-output", []);

/** A declared output plus one undeclared name; the OutputSet admits exactly one member. */
export const decideWithExtraOutput = complete("decide-with-extra-output", [
  {
    name: sourceDataOutputId,
    value: { kind: VariableValueKind.String, value: "approved" },
  },
  {
    name: "DataOutput_Unadmitted",
    value: { kind: VariableValueKind.String, value: "second" },
  },
]);
