import {
  StimulusKind,
  VariableValueKind,
} from "./contract.js";
import type {
  Stimulus,
  VariableBinding,
} from "./contract.js";
import { SemanticCheckpointProfileId } from "./semantic-profile-catalog.js";

export enum VariableWriteSurface {
  ProcessStart = "processStart",
  UserTaskCompletion = "userTaskCompletion",
  EffectCompletion = "effectCompletion",
}

/** Selects which typed Process-data values one profile admits at one external write surface. */
export function profileAllowsVariableBindings(
  semanticProfile: string,
  surface: VariableWriteSurface,
  bindings: ReadonlyArray<VariableBinding>,
): boolean {
  return bindings.every(({ value }) => {
    switch (value.kind) {
      case VariableValueKind.Boolean:
        return semanticProfile ===
            SemanticCheckpointProfileId.UserTaskBooleanCompletionData &&
          surface === VariableWriteSurface.UserTaskCompletion;
      case VariableValueKind.String:
      case VariableValueKind.Null:
        return true;
      default:
        return false;
    }
  });
}

/** Applies the profile value domain to every variable-bearing external stimulus. */
export function profileAllowsStimulusValueDomain(
  semanticProfile: string,
  stimulus: Stimulus,
): boolean {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      return profileAllowsVariableBindings(
        semanticProfile,
        VariableWriteSurface.ProcessStart,
        stimulus.initialVariables,
      );
    case StimulusKind.CompleteUserTaskInstance:
      return profileAllowsVariableBindings(
        semanticProfile,
        VariableWriteSurface.UserTaskCompletion,
        stimulus.submittedValues,
      );
    case StimulusKind.CompleteEffect:
      return profileAllowsVariableBindings(
        semanticProfile,
        VariableWriteSurface.EffectCompletion,
        stimulus.result.localPatch,
      );
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.DeliverMessage:
    case StimulusKind.FireTimer:
      return true;
    default:
      return assertNever(stimulus);
  }
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Process-data stimulus variant: ${JSON.stringify(value)}`,
  );
}
