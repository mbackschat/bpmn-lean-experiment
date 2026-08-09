import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  EffectExecutionResultKind,
  MappingExpressionKind,
  ObservationRequestKind,
  ScenarioDocumentKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  isWellFormedSemanticProcessProgram,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  EffectExecutionResult,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import { lastStateObservation } from "./canonical-observations.ts";
import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile:
      "cibseven-2.0.0-mapped-boundary-error-service-task-draft",
    sourceId: "mapped-boundary-error-service-task",
    sourceOverlay: null,
    sourceSha256:
      "0102c7af3c934157dc235485e956f49ec166c16ea2d503bb2ab5a14ad1714386",
  },
  processId: "Process_MappedBoundaryError",
  controlPlaces: [
    controlPlace("Flow_ErrorToReviewMappedError"),
    controlPlace("Flow_MappedBoundaryEffectToEnd"),
    controlPlace("Flow_ReviewMappedErrorToEnd"),
    controlPlace("Flow_StartToMappedBoundaryEffect"),
  ],
  operations: [
    {
      ...operationBase("MappedBoundaryEffectTask"),
      kind: SemanticOperationKind.AwaitEffect,
      input: "place:Flow_StartToMappedBoundaryEffect",
      output: "place:Flow_MappedBoundaryEffectToEnd",
      effect: {
        elementId: "MappedBoundaryEffectTask",
        descriptor: {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation:
            "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1",
        },
        inputMappings: [
          {
            target: "requestValue",
            expression: {
              kind: MappingExpressionKind.StringLiteral,
              value: "example-input",
            },
          },
        ],
        outputMappings: [
          {
            target: "resultValue",
            expression: {
              kind: MappingExpressionKind.LocalVariable,
              name: "result",
            },
          },
        ],
      },
      bpmnErrorRoute: {
        code: "MappedBusinessError",
        output: "place:Flow_ErrorToReviewMappedError",
        origin: {
          kind: SemanticOriginKind.BpmnElement,
          boundaryEventId: "BoundaryEvent_MappedBusinessError",
          errorDefinitionId: "ErrorEventDefinition_MappedBusinessError",
          errorElementId: "Error_MappedBusinessError",
          sequenceFlowId: "Flow_ErrorToReviewMappedError",
        },
      },
    },
    {
      ...operationBase("EndEvent_AfterMappedError"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_ReviewMappedErrorToEnd",
    },
    {
      ...operationBase("EndEvent_Normal"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_MappedBoundaryEffectToEnd",
    },
    {
      ...operationBase("ReviewMappedError"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_ErrorToReviewMappedError",
      output: "place:Flow_ReviewMappedErrorToEnd",
      task: {
        elementId: "ReviewMappedError",
        name: "Review Mapped Error",
      },
    },
    {
      ...operationBase("StartEvent_MappedBoundaryError"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToMappedBoundaryEffect",
    },
  ],
});

const effectId = Object.freeze({
  processInstanceId: "Instance_1",
  elementId: "MappedBoundaryEffectTask",
  activation: 1,
});

const start: StartProcessStimulus = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-mapped-boundary-error",
  processId: program.processId,
  instanceId: effectId.processInstanceId,
  initialVariables: [],
});

const result = Object.freeze({
  kind: EffectExecutionResultKind.BpmnError,
  code: "MappedBusinessError",
  message: "mapped business error",
  localPatch: [
    {
      name: "result",
      value: { kind: VariableValueKind.Null },
    },
  ],
} as const) satisfies EffectExecutionResult;

const scenario = {
  kind: ScenarioDocumentKind.Scenario,
  id: "mapped-boundary-error-caught",
  profile: program.identity.semanticProfile,
  bpmn: {
    id: program.identity.sourceId,
    relativePath: "test-only/mapped-boundary-error-service-task.bpmn",
    sha256: program.identity.sourceSha256,
    sourceOverlay: null,
  },
  stimuli: [
    start,
    {
      kind: StimulusKind.CompleteEffect,
      commandId: "complete-mapped-boundary-effect",
      effectId,
      result,
    },
    {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: "complete-mapped-error-review",
      taskId: {
        processInstanceId: "Instance_1",
        elementId: "ReviewMappedError",
        activation: 1,
      },
      submittedValues: [],
    },
  ],
  observations: Object.values(ObservationRequestKind),
  provenance: {
    normativeRefs: ["BPMN 2.0.2 §13.5.3"],
    cibRevision: "57ed69550f1c9c2619b9711d8877418bb084a371",
    cibRefs: ["test-only-neutral-mapped-boundary-error"],
  },
} as const satisfies Scenario;

test("runs the neutral caught-Error scenario", () => {
  const execution = runScenario(scenario, program);

  assert.deepEqual(execution.outcome, {
    kind: "semantic",
    outcome: CommandOutcome.Committed,
  });
  assert.deepEqual(execution.trace[4], {
    kind: "state",
    instanceId: "Instance_1",
    status: "running",
    activeWaits: [{
      elementId: "ReviewMappedError",
      kind: "userTask",
      multiplicity: 1,
    }],
    openUserTasks: [{
      id: {
        processInstanceId: "Instance_1",
        elementId: "ReviewMappedError",
        activation: 1,
      },
      name: "Review Mapped Error",
      state: "active",
    }],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    variables: [{
      name: "resultValue",
      value: { kind: "null" },
    }],
    enabledInteractions: [{
      kind: "completeUserTaskInstance",
      taskId: {
        processInstanceId: "Instance_1",
        elementId: "ReviewMappedError",
        activation: 1,
      },
    }],
    logicalTimeMs: 0,
  });
  assert.equal(lastStateObservation(execution.trace).status, "completed");
});

test("applies the validated null patch and opens only the boundary route", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const caught = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "complete-mapped-boundary-error",
    effectId,
    result,
  });

  assert.equal(caught.outcome, CommandOutcome.Committed);
  assert.deepEqual(caught.state.effectWaits, []);
  assert.deepEqual(caught.state.userTaskWaits, [
    {
      id: {
        processInstanceId: "Instance_1",
        elementId: "ReviewMappedError",
        activation: 1,
      },
      owner: rootScopeOccurrence(program.processId, "Instance_1"),
      name: "Review Mapped Error",
      output: "place:Flow_ReviewMappedErrorToEnd",
    },
  ]);
  assert.deepEqual(caught.state.variables, {
    process: { bindings: [
    {
      name: "resultValue",
      value: { kind: "null" },
    },
    ] },
    activities: [],
  });
  assert.equal(caught.state.endOccurrences, 0);
});

test("rejects mismatched codes and undeclared locals with exact state preservation", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const mutations: ReadonlyArray<EffectExecutionResult> = [
    { ...result, code: "OtherMappedBusinessError" },
    {
      ...result,
      localPatch: [
        {
          name: "undeclaredLocal",
          value: { kind: VariableValueKind.Null },
        },
      ],
    },
  ];

  for (const [index, mutation] of mutations.entries()) {
    const rejected = applyStimulus(program, waiting, {
      kind: StimulusKind.CompleteEffect,
      commandId: `reject-error-${index}`,
      effectId,
      result: mutation,
    });
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, waiting);
  }
});

test("keeps absence, null, and empty string semantically distinct", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const absent = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "absent-error-patch",
    effectId,
    result: { ...result, localPatch: [] },
  });
  const empty = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "empty-string-error-patch",
    effectId,
    result: {
      ...result,
      localPatch: [{
        name: "result",
        value: { kind: VariableValueKind.String, value: "" },
      }],
    },
  });
  const nullValue = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "null-error-patch",
    effectId,
    result,
  });

  assert.equal(absent.outcome, CommandOutcome.Rejected);
  assert.equal(empty.outcome, CommandOutcome.Committed);
  assert.equal(nullValue.outcome, CommandOutcome.Committed);
  assert.notDeepEqual(
    empty.state.variables.process.bindings,
    nullValue.state.variables.process.bindings,
  );
});

test("contrasts the real Error branch with treating the result as success", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const caught = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "caught-result",
    effectId,
    result,
  });
  const wrongAccount = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "wrong-success-result",
    effectId,
    result: {
      kind: EffectExecutionResultKind.Success,
      localPatch: [{
        name: "result",
        value: { kind: VariableValueKind.String, value: "normal" },
      }],
    },
  });

  assert.equal(caught.state.userTaskWaits.length, 1);
  assert.equal(caught.state.endOccurrences, 0);
  assert.equal(wrongAccount.state.userTaskWaits.length, 0);
  assert.equal(wrongAccount.state.endOccurrences, 1);
});

test("keeps closure single-enabled and stable at both external waits", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);

  const beforeEffectWait = applyStimulus(program, initialState, start, 1);
  assert.equal(beforeEffectWait.internalStepBoundExceeded, true);
  assert.equal(
    enabledInternalOperationCount(program, beforeEffectWait.state),
    1,
  );

  const effectWait = applyStimulus(program, initialState, start);
  assert.equal(effectWait.internalStepBoundExceeded, false);
  assert.equal(enabledInternalOperationCount(program, effectWait.state), 0);
  assert.equal(isStableStateResumable(effectWait.state), true);

  const beforeReviewWait = applyStimulus(
    program,
    effectWait.state,
    {
      kind: StimulusKind.CompleteEffect,
      commandId: "before-review-wait",
      effectId,
      result,
    },
    0,
  );
  assert.equal(beforeReviewWait.internalStepBoundExceeded, true);
  assert.equal(
    enabledInternalOperationCount(program, beforeReviewWait.state),
    1,
  );

  const reviewWait = applyStimulus(program, effectWait.state, {
    kind: StimulusKind.CompleteEffect,
    commandId: "reach-review-wait",
    effectId,
    result,
  });
  assert.equal(reviewWait.internalStepBoundExceeded, false);
  assert.equal(enabledInternalOperationCount(program, reviewWait.state), 0);
  assert.equal(isStableStateResumable(reviewWait.state), true);
});
