import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CompensationExecutionStateDefect,
  ControlStateKind,
  EffectOperation,
  EffectProtocol,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  VariableValueKind,
  canonicalCompensationExecutionStateUtf8Bytes,
  compensationExecutionStateDefects,
  initialState,
  isCompensationTriggerExecution,
  projectCompensationEffectTransportMaterial,
  type CompensationHandlerEffectWait,
  type CompensationTriggerExecution,
  type RuntimeState,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

const processInstanceId = "Instance_Compensation_Runtime";
const triggerId = { processInstanceId, elementId: "operation:Trigger", activation: 1 } as const;
const handlerId = { processInstanceId, elementId: "Undo_B", activation: 1 } as const;
const effectId = { processInstanceId, elementId: "Effect_Undo_B", activation: 1 } as const;
const owner = { processInstanceId, definitionScopeId: "scope:Process", activation: 1 } as const;
const subject = {
  kind: "eventSubProcess",
  parent: { processInstanceId, definitionScopeId: "scope:B", activation: 1 },
} as const;
const descriptor = {
  protocol: EffectProtocol.Activity,
  operation: EffectOperation.CompensationSingleEffect,
} as const;
const frozenValue = { kind: VariableValueKind.String, value: "frozen" } as const;
const restoredContext = {
  frames: [{
    owner,
    bindings: [{ name: "completionContext", value: frozenValue }],
  }, { owner: subject.parent, bindings: [] }],
} as const;

const program = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "compensation-runtime-contract",
    sourceId: "compensation-runtime-contract",
    sourceSha256: "1".repeat(64),
    sourceOverlay: null,
  },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  processId: "Process",
  definitionScopes: [
    { id: "scope:Process", parentScopeId: null, originElementId: "Process" },
    { id: "scope:B", parentScopeId: "scope:Process", originElementId: "B" },
    { id: "scope:Undo_B", parentScopeId: "scope:B", originElementId: "Undo_B" },
  ],
  operationScopes: [],
  controlPlaceScopes: [],
  controlPlaces: [],
  operations: [{
    id: "operation:Trigger",
    kind: SemanticOperationKind.TriggerCompensation,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Trigger" },
    definitionScopeId: "scope:Process",
    input: "place:Trigger_In",
    output: "place:Trigger_Out",
  }],
  compensationExecution: {
    definitionScopeId: "scope:Process",
    triggerOperationId: "operation:Trigger",
    subjects: [{
      kind: "eventSubProcess",
      parentScopeId: "scope:B",
      handlerScopeId: "scope:Undo_B",
      body: {
        kind: "singleEffect",
        handlerElementId: "Undo_B",
        effectElementId: "Effect_Undo_B",
        descriptor,
        input: {
          kind: "restoredProcessBinding",
          sourceName: "completionContext",
          argumentName: "archivedContext",
        },
      },
    }],
    dependencies: [],
    limits: { maxTriggers: 2, maxHandlers: 2, maxCanonicalBytes: 65_536 },
  },
} as const satisfies SemanticProcessProgram;

const trigger = {
  id: triggerId,
  owner,
  output: "place:Trigger_Out",
  lifecycle: "active",
  handlers: [{
    id: handlerId,
    subject,
    handlerElementId: "Undo_B",
    lifecycle: "compensating",
    restoredContext,
    effectId,
  }],
  dependencies: [],
} as const satisfies CompensationTriggerExecution;

const wait = {
  id: effectId,
  triggerId,
  handlerId,
  descriptor,
  arguments: [{ name: "archivedContext", value: frozenValue }],
} as const satisfies CompensationHandlerEffectWait;

test("projects compensation effect transport material from admitted definition and committed wait", () => {
  assert.deepEqual(
    projectCompensationEffectTransportMaterial(program, wait),
    {
      definition: {
        semanticProfile: program.identity.semanticProfile,
        sourceId: program.identity.sourceId,
        sourceSha256: program.identity.sourceSha256,
        sourceOverlay: program.identity.sourceOverlay,
        processId: program.processId,
      },
      triggerId,
      handlerId,
      effectId,
      descriptor,
      arguments: wait.arguments,
    },
  );
});

test("sizes the canonical ordered execution pair independently of object insertion order", () => {
  const reordered = {
    dependencies: trigger.dependencies,
    handlers: trigger.handlers,
    lifecycle: trigger.lifecycle,
    output: trigger.output,
    owner: trigger.owner,
    id: trigger.id,
  } as const satisfies CompensationTriggerExecution;
  assert.equal(
    canonicalCompensationExecutionStateUtf8Bytes([trigger], [wait]),
    canonicalCompensationExecutionStateUtf8Bytes([reordered], [wait]),
  );
});

test("binds the compensation argument to the frozen restored Process value", () => {
  const state = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: processInstanceId },
    compensationTriggers: [trigger],
    compensationHandlerEffectWaits: [wait],
  } as const satisfies RuntimeState;
  assert.equal(
    compensationExecutionStateDefects(program, state).includes(
      CompensationExecutionStateDefect.InvalidHandlerEffectWait,
    ),
    false,
  );
  assert.equal(
    compensationExecutionStateDefects(program, {
      ...state,
      compensationHandlerEffectWaits: [{
        ...wait,
        arguments: [{
          name: "archivedContext",
          value: { kind: VariableValueKind.String, value: "current-not-frozen" },
        }],
      }],
    }).includes(CompensationExecutionStateDefect.InvalidHandlerEffectWait),
    true,
  );
});

test("retains and accounts for a deferred Event Sub-Process handler context", () => {
  const pendingTrigger = {
    ...trigger,
    handlers: [{
      id: handlerId,
      subject,
      handlerElementId: "Undo_B",
      lifecycle: "pending",
      restoredContext,
    }],
  } as const;
  const pendingState = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: processInstanceId },
    compensationTriggers: [pendingTrigger],
    compensationHandlerEffectWaits: [],
  } as unknown as RuntimeState;

  assert.equal(isCompensationTriggerExecution(pendingTrigger), true);
  assert.equal(
    compensationExecutionStateDefects(program, pendingState).includes(
      CompensationExecutionStateDefect.InvalidTrigger,
    ),
    false,
  );

  const { restoredContext: _context, ...handlerWithoutContext } = pendingTrigger.handlers[0];
  void _context;
  const missingContextTrigger = {
    ...pendingTrigger,
    handlers: [handlerWithoutContext],
  };
  assert.equal(isCompensationTriggerExecution(missingContextTrigger), false);

  const nullContextTrigger = {
    ...pendingTrigger,
    handlers: [{ ...pendingTrigger.handlers[0], restoredContext: null }],
  } as const;
  assert.equal(isCompensationTriggerExecution(nullContextTrigger), true);
  assert.equal(
    compensationExecutionStateDefects(program, {
      ...pendingState,
      compensationTriggers: [nullContextTrigger],
    } as RuntimeState).includes(CompensationExecutionStateDefect.InvalidTrigger),
    true,
  );

  const observedBytes = canonicalCompensationExecutionStateUtf8Bytes(
    [pendingTrigger as CompensationTriggerExecution],
    [],
  );
  const omittedContextBytes = canonicalCompensationExecutionStateUtf8Bytes(
    [missingContextTrigger as unknown as CompensationTriggerExecution],
    [],
  );
  assert.ok(observedBytes > omittedContextBytes);
  const boundedProgram = {
    ...program,
    compensationExecution: {
      ...program.compensationExecution,
      limits: {
        ...program.compensationExecution.limits,
        maxCanonicalBytes: observedBytes - 1,
      },
    },
  } satisfies SemanticProcessProgram;
  assert.equal(
    compensationExecutionStateDefects(boundedProgram, pendingState).includes(
      CompensationExecutionStateDefect.CapacityExceeded,
    ),
    true,
  );
});

test("rejects two active triggers owned by the same root", () => {
  const first = pendingTrigger(1);
  const second = pendingTrigger(2);
  const state = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: processInstanceId },
    compensationTriggers: [first, second],
    compensationHandlerEffectWaits: [],
  } as const satisfies RuntimeState;

  assert.equal(
    compensationExecutionStateDefects(program, state).includes(
      CompensationExecutionStateDefect.InvalidTrigger,
    ),
    true,
  );
});

test("rejects a retained trigger that selected no compensation subject", () => {
  const emptySucceededTrigger = {
    ...terminalTrigger(1, "succeeded"),
    handlers: [],
    dependencies: [],
  } as const satisfies CompensationTriggerExecution;
  const state = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: processInstanceId },
    compensationTriggers: [emptySucceededTrigger],
    compensationHandlerEffectWaits: [],
  } as const satisfies RuntimeState;

  assert.equal(
    compensationExecutionStateDefects(program, state).includes(
      CompensationExecutionStateDefect.InvalidTrigger,
    ),
    true,
  );
});

test("requires exactly one failed trigger and only succeeded trigger tombstones beside it", () => {
  const firstFailed = terminalTrigger(1, "failed");
  const secondFailed = terminalTrigger(2, "failed");
  const twiceFailed = failedState([firstFailed, secondFailed], 1);
  assert.equal(
    compensationExecutionStateDefects(program, twiceFailed).includes(
      CompensationExecutionStateDefect.FailedLifecycleMismatch,
    ),
    true,
  );

  const succeededThenFailed = failedState([
    terminalTrigger(1, "succeeded"),
    secondFailed,
  ], 2);
  assert.equal(
    compensationExecutionStateDefects(program, succeededThenFailed).includes(
      CompensationExecutionStateDefect.FailedLifecycleMismatch,
    ),
    false,
  );
});

function pendingTrigger(activation: number): CompensationTriggerExecution {
  return {
    ...trigger,
    id: { ...trigger.id, activation },
    handlers: [{
      id: { ...handlerId, activation },
      subject,
      handlerElementId: "Undo_B",
      lifecycle: "pending",
      restoredContext,
    }],
  };
}

function terminalTrigger(
  activation: number,
  lifecycle: "succeeded" | "failed",
): CompensationTriggerExecution {
  return {
    ...trigger,
    id: { ...trigger.id, activation },
    lifecycle,
    handlers: [{
      id: { ...handlerId, activation },
      subject,
      handlerElementId: "Undo_B",
      lifecycle: lifecycle === "succeeded" ? "compensated" : "failed",
    }],
  };
}

function failedState(
  triggers: CompensationTriggerExecution[],
  failureActivation: number,
): RuntimeState {
  return {
    ...initialState,
    control: {
      kind: ControlStateKind.Failed,
      instanceId: processInstanceId,
      failure: {
        kind: "compensationHandlerFailure",
        triggerId: { ...triggerId, activation: failureActivation },
        handlerId: { ...handlerId, activation: failureActivation },
        effectId: { ...effectId, activation: failureActivation },
        code: "compensation-failed",
        message: null,
      },
    },
    compensationTriggers: triggers,
    compensationHandlerEffectWaits: [],
    effectActivations: [{
      elementId: effectId.elementId,
      count: failureActivation,
    }],
  };
}
