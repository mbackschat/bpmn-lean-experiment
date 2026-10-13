import assert from "node:assert/strict";
import { SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";

/**
 * The external value kinds one profile admits at each scenario-visible write surface. An empty list admits only an empty
 * patch, so it is a stated fact about the profile rather than a default.
 */
export type ProfileValueDomains = Readonly<{
  start: readonly VariableValueKind[];
  human: readonly VariableValueKind[];
  effect: readonly VariableValueKind[];
  payload: readonly VariableValueKind[];
}>;

const none: readonly VariableValueKind[] = [];
const stringNull = [VariableValueKind.String, VariableValueKind.Null];
const stringNullBoolean = [...stringNull, VariableValueKind.Boolean];
// SingletonBusinessItem at kind level; the 1,024-byte root String bound is exercised by explicit cases in the case builder.
export const singletonBusinessItem = [...stringNullBoolean, VariableValueKind.Integer, VariableValueKind.Decimal, VariableValueKind.Map];
// Explicit rather than `Object.values`, so a newly recognized arm is never expected here until the profile selects it.
const structuredHumanWork = [...stringNullBoolean, VariableValueKind.Integer, VariableValueKind.StringList];
const messagePayloadScalars = [...stringNullBoolean, VariableValueKind.Integer];
const parallelMultiInstanceStart = [VariableValueKind.String, VariableValueKind.StringList];

/**
 * Independent expectations, written from each profile's reviewed artifact feature atoms (`profiles/<id>/profile.json`) and
 * its owning capsule, never from a target's output. One row per registered profile in catalog order: the enrollment check
 * rejects a missing or stale row, and every cell must be stated, so a new profile cannot inherit "admits nothing" by omission.
 */
const expectedDomains = new Map<string, ProfileValueDomains>([
  [SemanticProfileId.ActivityBoundaryMessage, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.ActivityBoundaryTimer, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.ActivityDataInputUserTask, { start: stringNull, human: none, effect: none, payload: none }],
  [SemanticProfileId.ActivityDataInputOutputUserTask, { start: stringNull, human: stringNull, effect: none, payload: none }],
  [SemanticProfileId.ActivityDataOutputUserTask, { start: none, human: stringNull, effect: none, payload: none }],
  [SemanticProfileId.SequentialMultiInstanceUserTask,
    { start: [VariableValueKind.StringList], human: [VariableValueKind.String], effect: none, payload: none }],
  [SemanticProfileId.ParallelMultiInstanceUserTask,
    { start: parallelMultiInstanceStart, human: [VariableValueKind.String], effect: none, payload: none }],
  [SemanticProfileId.MappedBoundaryErrorServiceTask, { start: none, human: none, effect: stringNull, payload: none }],
  [SemanticProfileId.CalledProcessCallActivity, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.CallActivityDataBoundaries, { start: stringNull, human: stringNull, effect: none, payload: none }],
  [SemanticProfileId.StructuredProcessComposition, { start: stringNull, human: stringNull, effect: none, payload: none }],
  [SemanticProfileId.PortableBusinessValuesHandoff,
    { start: singletonBusinessItem, human: singletonBusinessItem, effect: none, payload: none }],
  [SemanticProfileId.SerialBusinessTaskComposition, { start: stringNull, human: stringNull, effect: stringNull, payload: none }],
  [SemanticProfileId.MixedTaskControlFlow, { start: stringNull, human: stringNull, effect: stringNull, payload: none }],
  [SemanticProfileId.MixedTaskBusinessError, { start: stringNull, human: stringNull, effect: stringNull, payload: none }],
  [SemanticProfileId.Compensation, { start: [VariableValueKind.String], human: none, effect: none, payload: none }],
  [SemanticProfileId.TransactionCancellation, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.MappedSuccessServiceTask, { start: none, human: none, effect: [VariableValueKind.String], payload: none }],
  [SemanticProfileId.MessageStart, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.TimerStart, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.TerminateEnd, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.EmbeddedSubProcessCompletion, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.SubProcessBoundaryTimer, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.SubProcessErrorPropagation, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.ExclusiveGatewaySimpleBoolean, { start: stringNull, human: none, effect: none, payload: none }],
  [SemanticProfileId.InclusiveGatewaySelectedBranches, { start: stringNull, human: none, effect: none, payload: none }],
  [SemanticProfileId.EventBasedGatewayMessageTimer, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.IntermediateCatchTimer, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.IntermediateCatchMessage, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.MessagePayloadCatch, { start: none, human: none, effect: none, payload: messagePayloadScalars }],
  [SemanticProfileId.MessageKeyCorrelation, { start: none, human: none, effect: none, payload: messagePayloadScalars }],
  [SemanticProfileId.MessageAddressedReceiveTask, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.NonInterruptingBoundaryTimer, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.RepeatableEventSubscriptions, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.ParallelForkJoin, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.ServiceTaskEffect, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.ServiceTaskIncident, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.ServiceTaskIncidentCancellation,
    { start: [VariableValueKind.String], human: none, effect: none, payload: none }],
  [SemanticProfileId.TimerUserTaskComposition, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.UserTask, { start: stringNull, human: stringNull, effect: none, payload: none }],
  [SemanticProfileId.UserTaskCycle, { start: none, human: stringNull, effect: none, payload: none }],
  [SemanticProfileId.UserTaskPreservedNotation, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.UserTaskProcessDataPreservedNotation, { start: stringNull, human: stringNull, effect: none, payload: none }],
  [SemanticProfileId.ConfiguredTask, { start: none, human: none, effect: none, payload: none }],
  [SemanticProfileId.UserTaskBooleanCompletionData, { start: stringNull, human: stringNullBoolean, effect: none, payload: none }],
  [SemanticProfileId.UserTaskAssignmentFormMetadata, { start: stringNull, human: stringNullBoolean, effect: none, payload: none }],
  [SemanticProfileId.ParallelUserTaskAssignmentFormMetadata, { start: none, human: stringNullBoolean, effect: none, payload: none }],
  [SemanticProfileId.StructuredHumanWork, { start: stringNull, human: structuredHumanWork, effect: none, payload: none }],
]);

/** The profile whose correlated-payload delivery is admitted; the wire carries only a String payload there (MCORR-EXTRACT-01). */
export const correlatedPayloadProfile: string = SemanticProfileId.MessageKeyCorrelation;

/**
 * Profiles that select each incident command family: report and retry belong to the incident profiles, root cancellation
 * to the cancellation successor alone. Every other profile refuses the family.
 */
export const incidentCommandProfiles: Readonly<Record<
  StimulusKind.ReportEffectFailure | StimulusKind.RetryIncident | StimulusKind.CancelIncidentProcess, readonly string[]>> = {
  [StimulusKind.ReportEffectFailure]: [SemanticProfileId.ServiceTaskIncident, SemanticProfileId.ServiceTaskIncidentCancellation],
  [StimulusKind.RetryIncident]: [SemanticProfileId.ServiceTaskIncident, SemanticProfileId.ServiceTaskIncidentCancellation],
  [StimulusKind.CancelIncidentProcess]: [SemanticProfileId.ServiceTaskIncidentCancellation],
};

/** Fails with the exact missing, stale or unregistered profile ids when the table and the selected contexts disagree. */
export function assertProfilesEnrolled(selectedProfiles: Iterable<string>): void {
  const selected = new Set(selectedProfiles);
  const registered = new Set<string>(Object.values(SemanticProfileId));
  const gaps = {
    "selected profiles without expected domains": [...selected].filter(profile => !expectedDomains.has(profile)),
    "expected domains for no selected profile": [...expectedDomains.keys()].filter(profile => !selected.has(profile)),
    "registered profiles without a selected context": [...registered].filter(profile => !selected.has(profile)),
    "selected profiles that are not registered": [...selected].filter(profile => !registered.has(profile)),
  };
  assert.deepEqual(gaps, Object.fromEntries(Object.keys(gaps).map(key => [key, []])),
    "every registered profile must state its expected value domain on every surface");
}

export function expectedDomainsOf(profile: string): ProfileValueDomains {
  const domains = expectedDomains.get(profile);
  assert.ok(domains !== undefined, `${profile} has no expected value domains`);
  return domains;
}
