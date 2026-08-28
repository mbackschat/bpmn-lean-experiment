import type { OccurrenceId } from "./contract.js";
import {
  addActivityVariableScope,
  evaluateInputMappings,
} from "./semantic-process-data.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
} from "./semantic-process-contract.js";
import {
  compareEffectWaits,
  compareMessageWaits,
  compareTimerWaits,
  compareUserTaskWaits,
  ControlStateKind,
  nextActivation,
  removeToken,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export enum InternalOrdinaryArmingPatchKind {
  UserTask = "userTask",
  Message = "message",
  Timer = "timer",
  Effect = "effect",
}

type CommonPatch = Readonly<{
  owner: ScopeOccurrenceId;
  input: string;
}>;

export type InternalOrdinaryArmingPatch = Readonly<
  | CommonPatch & {
      kind: InternalOrdinaryArmingPatchKind.UserTask;
      wait: RuntimeState["userTaskWaits"][number];
    }
  | CommonPatch & {
      kind: InternalOrdinaryArmingPatchKind.Message;
      wait: RuntimeState["messageWaits"][number];
    }
  | CommonPatch & {
      kind: InternalOrdinaryArmingPatchKind.Timer;
      wait: RuntimeState["timerWaits"][number];
    }
  | CommonPatch & {
      kind: InternalOrdinaryArmingPatchKind.Effect;
      wait: RuntimeState["effectWaits"][number];
    }
>;

export type InternalOrdinaryArmingOperation = Extract<
  SemanticOperation,
  {
    kind:
      | SemanticOperationKind.AwaitUserTask
      | SemanticOperationKind.AwaitMessage
      | SemanticOperationKind.AwaitTimer
      | SemanticOperationKind.AwaitEffect;
  }
>;

/** Constructs one local-edit patch without applying it or reading a successor state. */
export function deriveInternalOrdinaryArmingPatch(
  operation: InternalOrdinaryArmingOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): InternalOrdinaryArmingPatch | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  switch (operation.kind) {
    case SemanticOperationKind.AwaitUserTask: {
      const activation = nextActivation(
        state.taskActivations,
        operation.task.elementId,
      );
      return {
        kind: InternalOrdinaryArmingPatchKind.UserTask,
        owner,
        input: operation.input,
        wait: {
          id: occurrence(owner, operation.task.elementId, activation),
          owner,
          name: operation.task.name,
          ...(operation.task.metadata === undefined
            ? {}
            : { metadata: operation.task.metadata }),
          output: operation.output,
        },
      };
    }
    case SemanticOperationKind.AwaitMessage: {
      const activation = nextActivation(
        state.messageActivations,
        operation.message.elementId,
      );
      return {
        kind: InternalOrdinaryArmingPatchKind.Message,
        owner,
        input: operation.input,
        wait: {
          id: occurrence(owner, operation.message.elementId, activation),
          owner,
          channel: operation.message.channel,
          output: operation.output,
        },
      };
    }
    case SemanticOperationKind.AwaitTimer: {
      const activation = nextActivation(
        state.timerActivations,
        operation.timer.elementId,
      );
      const deadlineMs = state.logicalTimeMs + operation.timer.durationMs;
      if (!Number.isSafeInteger(deadlineMs)) {
        throw new RangeError("Timer deadline exceeds the safe integer boundary");
      }
      return {
        kind: InternalOrdinaryArmingPatchKind.Timer,
        owner,
        input: operation.input,
        wait: {
          id: occurrence(owner, operation.timer.elementId, activation),
          owner,
          deadlineMs,
          output: operation.output,
        },
      };
    }
    case SemanticOperationKind.AwaitEffect: {
      const activation = nextActivation(
        state.effectActivations,
        operation.effect.elementId,
      );
      const arguments_ = evaluateInputMappings(operation.effect.inputMappings);
      return {
        kind: InternalOrdinaryArmingPatchKind.Effect,
        owner,
        input: operation.input,
        wait: {
          id: occurrence(owner, operation.effect.elementId, activation),
          owner,
          descriptor: operation.effect.descriptor,
          arguments: arguments_,
          outputMappings: operation.effect.outputMappings,
          bpmnErrorRoute: operation.bpmnErrorRoute,
          output: operation.output,
          incidentAlreadyRetried: false,
        },
      };
    }
    default:
      return assertNever(operation);
  }
}

/** Applies only the keyed edits carried by one prepared patch, preserving independent siblings. */
export function applyInternalOrdinaryArmingPatch(
  state: RuntimeState,
  patch: InternalOrdinaryArmingPatch,
): RuntimeState {
  const controlTokens = removeToken(
    state.controlTokens,
    patch.input,
    patch.owner,
  );
  switch (patch.kind) {
    case InternalOrdinaryArmingPatchKind.UserTask:
      return {
        ...state,
        controlTokens,
        userTaskWaits: [...state.userTaskWaits, patch.wait].sort(
          compareUserTaskWaits,
        ),
        taskActivations: setActivationCount(
          state.taskActivations,
          patch.wait.id.elementId,
          patch.wait.id.activation,
        ),
      };
    case InternalOrdinaryArmingPatchKind.Message:
      return {
        ...state,
        controlTokens,
        messageWaits: [...state.messageWaits, patch.wait].sort(
          compareMessageWaits,
        ),
        messageActivations: setActivationCount(
          state.messageActivations,
          patch.wait.id.elementId,
          patch.wait.id.activation,
        ),
      };
    case InternalOrdinaryArmingPatchKind.Timer:
      return {
        ...state,
        controlTokens,
        timerWaits: [...state.timerWaits, patch.wait].sort(compareTimerWaits),
        timerActivations: setActivationCount(
          state.timerActivations,
          patch.wait.id.elementId,
          patch.wait.id.activation,
        ),
      };
    case InternalOrdinaryArmingPatchKind.Effect:
      return {
        ...state,
        controlTokens,
        effectWaits: [...state.effectWaits, patch.wait].sort(compareEffectWaits),
        variables: addActivityVariableScope(
          state.variables,
          patch.wait.id,
          patch.wait.arguments,
        ),
        effectActivations: setActivationCount(
          state.effectActivations,
          patch.wait.id.elementId,
          patch.wait.id.activation,
        ),
      };
    default:
      return assertNever(patch);
  }
}

export function internalOrdinaryArmingPatchOccurrence(
  patch: InternalOrdinaryArmingPatch,
): OccurrenceId {
  return patch.wait.id;
}

function occurrence(
  owner: ScopeOccurrenceId,
  elementId: string,
  activation: number,
): OccurrenceId {
  return {
    processInstanceId: owner.processInstanceId,
    elementId,
    activation,
  };
}

function assertNever(value: never): never {
  throw new Error(`unhandled ordinary arming patch: ${JSON.stringify(value)}`);
}
