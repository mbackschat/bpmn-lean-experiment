import {
  StimulusKind,
  VariableValueKind,
} from "./contract.js";
import type {
  Stimulus,
  VariableBinding,
} from "./contract.js";
import type { RuntimeState } from "./semantic-process-state.js";
import {
  MIXED_TASK_BUSINESS_ERROR_CHECKPOINT_PROFILE_ID,
  MIXED_TASK_CONTROL_FLOW_CHECKPOINT_PROFILE_ID,
  SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID,
  SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID,
  INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID,
  TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
  REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
} from "./semantic-profile-catalog.js";
import { isVariablePatch } from "./variable-value.js";

export enum VariableWriteSurface {
  ProcessStart = "processStart",
  UserTaskCompletion = "userTaskCompletion",
  EffectCompletion = "effectCompletion",
}

type SemanticProfile =
  | typeof PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID
  | typeof SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID
  | typeof MIXED_TASK_BUSINESS_ERROR_CHECKPOINT_PROFILE_ID
  | typeof MIXED_TASK_CONTROL_FLOW_CHECKPOINT_PROFILE_ID
  | typeof SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID
  | typeof CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID
  | typeof INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID
  | typeof STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID
  | typeof SemanticProfileId[keyof typeof SemanticProfileId]
  | typeof TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID
  | typeof COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID
  | typeof MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID
  | typeof REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID;

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
const portableValueKinds: ReadonlyArray<VariableValueKind> = Object.freeze([
  VariableValueKind.Decimal,
  VariableValueKind.List,
  VariableValueKind.Map,
]);
const scalarValueDomain = Object.freeze([
  VariableValueKind.Boolean,
  VariableValueKind.Integer,
  VariableValueKind.String,
  VariableValueKind.Null,
]);

const admittedSemanticProfiles: ReadonlySet<string> = new Set(
  [
    ...Object.values(SemanticProfileId),
    MIXED_TASK_BUSINESS_ERROR_CHECKPOINT_PROFILE_ID,
    MIXED_TASK_CONTROL_FLOW_CHECKPOINT_PROFILE_ID,
    SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID,
  SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
    CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID,
    INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID,
    TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
    MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
    REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  ],
);

/** Selects which typed Process-data values one profile admits at one external write surface. */
export function profileAllowsVariableBindings(
  semanticProfile: string,
  surface: VariableWriteSurface,
  bindings: ReadonlyArray<VariableBinding>,
): boolean {
  if (
    !isVariablePatch(bindings) ||
    !isAdmissionProfile(semanticProfile)
  ) {
    return false;
  }
  const allowedKinds = profileValueDomain(semanticProfile, surface);
  return allowedKinds !== null &&
    bindings.every(({ value }) => allowedKinds.includes(value.kind));
}

function isAdmissionProfile(
  semanticProfile: string,
): semanticProfile is SemanticProfile {
  return admittedSemanticProfiles.has(semanticProfile);
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
    case PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID:
    case SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID:
      return surfaceValueDomain(surface, [...stringNullBooleanValueDomain, VariableValueKind.StringList], stringNullBooleanValueDomain, stringNullValueDomain);
    case MIXED_TASK_BUSINESS_ERROR_CHECKPOINT_PROFILE_ID:
    case MIXED_TASK_CONTROL_FLOW_CHECKPOINT_PROFILE_ID:
    case SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID: return surfaceValueDomain(surface, stringNullValueDomain, stringNullValueDomain, stringNullValueDomain);
    case INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID:
      return surfaceValueDomain(surface);
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
    case CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID:
    case STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID:
    case SemanticProfileId.ActivityDataInputOutputUserTask:
      return surfaceValueDomain(
        surface,
        stringNullValueDomain,
        stringNullValueDomain,
      );
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
    case TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID:
    case SemanticProfileId.ActivityBoundaryTimer:
    case SemanticProfileId.ActivityBoundaryMessage:
    case SemanticProfileId.CalledProcessCallActivity:
    case SemanticProfileId.ConfiguredTask:
    case SemanticProfileId.EmbeddedSubProcessCompletion:
    case SemanticProfileId.EventBasedGatewayMessageTimer:
    case SemanticProfileId.IntermediateCatchMessage:
    case SemanticProfileId.MessagePayloadCatch:
    case MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID:
    case REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID:
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
    case COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID:
      return surfaceValueDomain(surface, stringValueDomain);
    default:
      return assertNever(semanticProfile);
  }
}

/**
 * Whether a carried state holds a portable recursive value only under a profile that admits one.
 *
 * A portable value reaches state solely through an external write surface, so under a profile that
 * selects one at no surface, a carried or restored Decimal, List or Map was never committed
 * (PBV-INGRESS-01). Legacy scalar kinds are not profile-checked here.
 */
export function runtimeStateCarriesOnlyProfilePortableValues(
  semanticProfile: string,
  state: RuntimeState,
): boolean {
  if (profileSelectsPortableValue(semanticProfile)) {
    return true;
  }
  const { process, scopes, processInterfaces, activities } = state.variables;
  return [
    process.bindings,
    ...scopes.map(({ bindings }) => bindings),
    ...processInterfaces.flatMap(({ inputs, outputs }) => [inputs, outputs]),
    ...activities.map(({ bindings }) => bindings),
    ...state.effectWaits.map((wait) => wait.arguments),
    ...(state.compensationHandlerEffectWaits ?? []).map((wait) => wait.arguments),
  ].every((bindings) => bindings.every(({ value }) => !portableValueKinds.includes(value.kind)));
}

function profileSelectsPortableValue(semanticProfile: string): boolean {
  return isAdmissionProfile(semanticProfile) &&
    Object.values(VariableWriteSurface).some((surface) =>
      profileValueDomain(semanticProfile, surface)?.some((kind) => portableValueKinds.includes(kind)) ?? false);
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
    case StimulusKind.DeliverPayloadMessage:
      return (semanticProfile === SemanticProfileId.MessagePayloadCatch ||
        semanticProfile === MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID) &&
        scalarValueDomain.includes(stimulus.payload.kind);
    case StimulusKind.DeliverCorrelatedPayloadMessage:
      return semanticProfile === MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID &&
        stimulus.payload.kind === VariableValueKind.String;
    default:
      return assertNever(stimulus);
  }
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Process-data stimulus variant: ${JSON.stringify(value)}`,
  );
}
