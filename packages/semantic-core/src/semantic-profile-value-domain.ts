import {
  StimulusKind,
  VariableValueKind,
} from "./contract.js";
import type {
  Stimulus,
  VariableBinding,
} from "./contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { isVariablePatch } from "./variable-value.js";

export enum VariableWriteSurface {
  ProcessStart = "processStart",
  UserTaskCompletion = "userTaskCompletion",
  EffectCompletion = "effectCompletion",
}

type SemanticProfile =
  typeof SemanticProfileId[keyof typeof SemanticProfileId];

const emptyValueDomain: ReadonlyArray<VariableValueKind> = Object.freeze([]);
const stringValueDomain = Object.freeze([VariableValueKind.String]);
const stringListValueDomain = Object.freeze([VariableValueKind.StringList]);
const parallelMultiInstanceStartValueDomain = Object.freeze([
  VariableValueKind.String,
  VariableValueKind.StringList,
]);
const stringNullValueDomain = Object.freeze([
  VariableValueKind.String,
  VariableValueKind.Null,
]);
const stringNullBooleanValueDomain = Object.freeze([
  ...stringNullValueDomain,
  VariableValueKind.Boolean,
]);
const structuredHumanWorkValueDomain = Object.freeze([
  ...stringNullBooleanValueDomain,
  VariableValueKind.Integer,
  VariableValueKind.StringList,
]);

const registeredSemanticProfiles: ReadonlySet<string> = new Set(
  Object.values(SemanticProfileId),
);

/** Selects which typed Process-data values one profile admits at one external write surface. */
export function profileAllowsVariableBindings(
  semanticProfile: string,
  surface: VariableWriteSurface,
  bindings: ReadonlyArray<VariableBinding>,
): boolean {
  if (
    !isVariablePatch(bindings) ||
    !isRegisteredSemanticProfile(semanticProfile)
  ) {
    return false;
  }
  const allowedKinds = profileValueDomain(semanticProfile, surface);
  return allowedKinds !== null &&
    bindings.every(({ value }) => allowedKinds.includes(value.kind));
}

function isRegisteredSemanticProfile(
  semanticProfile: string,
): semanticProfile is SemanticProfile {
  return registeredSemanticProfiles.has(semanticProfile);
}

function surfaceValueDomain(
  surface: VariableWriteSurface,
  processStart: ReadonlyArray<VariableValueKind> = emptyValueDomain,
  userTaskCompletion: ReadonlyArray<VariableValueKind> = emptyValueDomain,
  effectCompletion: ReadonlyArray<VariableValueKind> = emptyValueDomain,
): ReadonlyArray<VariableValueKind> | null {
  switch (surface) {
    case VariableWriteSurface.ProcessStart:
      return processStart;
    case VariableWriteSurface.UserTaskCompletion:
      return userTaskCompletion;
    case VariableWriteSurface.EffectCompletion:
      return effectCompletion;
    default:
      return null;
  }
}

/**
 * This switch is the closed value-domain account. A new registered profile cannot compile until its
 * three external write surfaces are classified here, even when all three intentionally stay empty.
 */
function profileValueDomain(
  semanticProfile: SemanticProfile,
  surface: VariableWriteSurface,
): ReadonlyArray<VariableValueKind> | null {
  switch (semanticProfile) {
    case SemanticProfileId.SequentialMultiInstanceUserTask:
      // This table closes the kind-level surface. Command admission separately binds exact input
      // and output names, cardinality, and the review-versus-escalation task-local domains.
      return surfaceValueDomain(
        surface,
        stringListValueDomain,
        stringValueDomain,
      );
    case SemanticProfileId.ParallelMultiInstanceUserTask:
      return surfaceValueDomain(
        surface,
        parallelMultiInstanceStartValueDomain,
        stringValueDomain,
      );
    case SemanticProfileId.MappedSuccessServiceTask:
      return surfaceValueDomain(
        surface,
        emptyValueDomain,
        emptyValueDomain,
        stringValueDomain,
      );
    case SemanticProfileId.MappedBoundaryErrorServiceTask:
      return surfaceValueDomain(
        surface,
        emptyValueDomain,
        emptyValueDomain,
        stringNullValueDomain,
      );
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
    case SemanticProfileId.InclusiveGatewaySelectedBranches:
      return surfaceValueDomain(surface, stringNullValueDomain);
    case SemanticProfileId.ActivityDataInputUserTask:
      // Explicit null is admitted at the start surface because absence and null are different
      // pre-states here, and the completion surface stays empty because this profile's OutputSet is
      // empty: it selects no output mediation at all.
      return surfaceValueDomain(surface, stringNullValueDomain);
    case SemanticProfileId.ActivityDataOutputUserTask:
      // The mirror of the input profile's table. The start surface stays empty because this model
      // declares no input mediation at all, and the completion surface admits explicit null because
      // a supplied null makes the required output available exactly as a supplied string does.
      return surfaceValueDomain(surface, emptyValueDomain, stringNullValueDomain);
    case SemanticProfileId.ServiceTaskIncidentCancellation:
      return surfaceValueDomain(surface, stringValueDomain);
    case SemanticProfileId.UserTask:
    case SemanticProfileId.UserTaskProcessDataPreservedNotation:
      return surfaceValueDomain(
        surface,
        stringNullValueDomain,
        stringNullValueDomain,
      );
    case SemanticProfileId.UserTaskCycle:
      return surfaceValueDomain(
        surface,
        emptyValueDomain,
        stringNullValueDomain,
      );
    case SemanticProfileId.UserTaskBooleanCompletionData:
    case SemanticProfileId.UserTaskAssignmentFormMetadata:
      return surfaceValueDomain(
        surface,
        stringNullValueDomain,
        stringNullBooleanValueDomain,
      );
    case SemanticProfileId.ParallelUserTaskAssignmentFormMetadata:
      return surfaceValueDomain(
        surface,
        emptyValueDomain,
        stringNullBooleanValueDomain,
      );
    case SemanticProfileId.StructuredHumanWork:
      return surfaceValueDomain(
        surface,
        stringNullValueDomain,
        structuredHumanWorkValueDomain,
      );
    case SemanticProfileId.ActivityBoundaryTimer:
    case SemanticProfileId.CalledProcessCallActivity:
    case SemanticProfileId.ConfiguredTask:
    case SemanticProfileId.EmbeddedSubProcessCompletion:
    case SemanticProfileId.EventBasedGatewayMessageTimer:
    case SemanticProfileId.IntermediateCatchMessage:
    case SemanticProfileId.IntermediateCatchTimer:
    case SemanticProfileId.MessageAddressedReceiveTask:
    case SemanticProfileId.MessageStart:
    case SemanticProfileId.NonInterruptingBoundaryTimer:
    case SemanticProfileId.ParallelForkJoin:
    case SemanticProfileId.ServiceTaskEffect:
    case SemanticProfileId.ServiceTaskIncident:
    case SemanticProfileId.SubProcessBoundaryTimer:
    case SemanticProfileId.SubProcessErrorPropagation:
    case SemanticProfileId.TerminateEnd:
    case SemanticProfileId.TimerStart:
    case SemanticProfileId.TimerUserTaskComposition:
    case SemanticProfileId.UserTaskPreservedNotation:
      return surfaceValueDomain(surface);
    default:
      return assertNever(semanticProfile);
  }
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
    case StimulusKind.ReportEffectFailure:
    case StimulusKind.RetryIncident:
      return semanticProfile === SemanticProfileId.ServiceTaskIncident ||
        semanticProfile ===
          SemanticProfileId.ServiceTaskIncidentCancellation;
    case StimulusKind.CancelIncidentProcess:
      return semanticProfile ===
        SemanticProfileId.ServiceTaskIncidentCancellation;
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
