import assert from "node:assert/strict";
import { CallDataKind, EffectExecutionResultKind, MessageChannelKind, SemanticOperationKind, SemanticProfileId, StimulusKind, VariableValueKind,
  structuredScopeDataProgramStartNames } from "@bpmn-lean/semantic-core";
import type { Scenario, StartProcessStimulus, Stimulus, VariableBinding, VariableValue } from "@bpmn-lean/semantic-core";
import { pipelineCases } from "./pipeline-cases.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import type { PipelineContext } from "./pipeline-types.ts";
import { loadMessageKeyCorrelationPopulationCases } from "./message-key-correlation-population-cases.ts";
import { assertProfilesEnrolled, correlatedPayloadProfile, dataBearingEmbeddedCompletionDomains, expectedDomainsOf, incidentCommandProfiles,
  singletonBusinessItem } from "./scenario-value-domain-expectations.ts";
import type { ProfileValueDomains } from "./scenario-value-domain-expectations.ts";

type DomainContext = Pick<PipelineContext, "scenario" | "checkedProcess" | "semanticProcess">;
export type DomainCase = Readonly<{ context: DomainContext; scenario: Scenario; supported: boolean }>;
type AddCase = (context: DomainContext, suffix: string, stimuli: readonly Stimulus[], supported: boolean) => void;

export const values: readonly VariableValue[] = [
  { kind: VariableValueKind.String, value: "candidate" }, { kind: VariableValueKind.Null },
  { kind: VariableValueKind.Boolean, value: true }, { kind: VariableValueKind.Integer, value: 7 },
  { kind: VariableValueKind.StringList, value: ["candidate"] },
  // Portable arms recognized by both readers; only the portable handoff selects them (PBV-INGRESS-01).
  { kind: VariableValueKind.Decimal, coefficient: "-125", scale: 2 },
  { kind: VariableValueKind.List, value: [{ kind: VariableValueKind.Integer, value: 1 }, { kind: VariableValueKind.Integer, value: 1 }] },
  { kind: VariableValueKind.Map, value: [
    { name: "address", value: { kind: VariableValueKind.Map, value: [{ name: "line2", value: { kind: VariableValueKind.Null } }] } },
    { name: "total", value: { kind: VariableValueKind.Decimal, coefficient: "12345", scale: 2 } }] },
];

/**
 * Scenario Starts that must carry their declared bindings (Call request, Compensation restored binding, business-task
 * required inputs), so a kind probe replaces one declared value instead of appending an unrelated binding. Every other
 * profile accepts an unrelated canonical Start binding, which keeps the probe on the value kind alone.
 */
const declaredStartData: ReadonlySet<string> = new Set([SemanticProfileId.CallActivityDataBoundaries, SemanticProfileId.Compensation,
  SemanticProfileId.SerialBusinessTaskComposition, SemanticProfileId.MixedTaskControlFlow, SemanticProfileId.MixedTaskBusinessError,
  SemanticProfileId.PortableBusinessEffectData]);

export function changedScenario(context: DomainContext, suffix: string, stimuli: readonly Stimulus[]): Scenario {
  return { ...context.scenario, id: `${context.scenario.id}-${suffix}`, stimuli };
}

/**
 * The schedules whose shape a profile-specific builder below reads. Without a pin, the first registered case of the
 * profile is its representative, so registering another case of the profile earlier silently re-selected the schedule
 * a builder relies on (the guarantor loan displaced the purchase order on 2026-10-24).
 */
const pinnedRepresentatives: ReadonlyArray<readonly [string, string]> = [
  [SemanticProfileId.MessagePayloadCatch, "message-payload-catch-supplied-scalar"],
  [SemanticProfileId.CallActivityDataBoundaries, "call-data-supplier-string"],
  [SemanticProfileId.Compensation, "compensation-success-b-c-a"],
  [SemanticProfileId.PortableBusinessValuesHandoff, "portable-handoff-order-nested"],
  [SemanticProfileId.PortableBusinessEffectData, "effect-data-credit-assessed"],
  [SemanticProfileId.PortableBusinessMessagePayload, "portable-message-payload-manifest-delivered"],
  [SemanticProfileId.NestedEmbeddedScopeData, "nested-scope-data-order-approved"],
  [SemanticProfileId.MappedSuccessServiceTask, "mapped-success-service-task"],
  [SemanticProfileId.EmbeddedSubProcessCompletion, "embedded-subprocess-completion-a-then-b"],
];

/** One retained answer-free schedule per registered profile, plus the correlated population schedule for Message key correlation. */
export async function selectedProfileContexts(): Promise<ReadonlyMap<string, DomainContext>> {
  const contexts = await loadAndCompileCases(pipelineCases);
  const selected = new Map<string, DomainContext>();
  for (const context of contexts) if (!selected.has(context.scenario.profile)) selected.set(context.scenario.profile, context);
  for (const [profile, id] of pinnedRepresentatives) {
    const pinned = contexts.find(({ scenario }) => scenario.id === id);
    assert.ok(pinned !== undefined && pinned.scenario.profile === profile, `${id} must be registered under ${profile}`);
    selected.set(profile, pinned);
  }
  const population = (await loadMessageKeyCorrelationPopulationCases()).find(input => input.scenario.id === "message-key-correlation-unique")!;
  const definition = population.definitions[0]!;
  const source = population.scenario.definitions[0]!;
  const payloadContext = selected.get(SemanticProfileId.MessagePayloadCatch)!;
  const correlated: DomainContext = { ...definition, scenario: { ...payloadContext.scenario, id: "correlated-scenario-domain",
    profile: population.scenario.profile, bpmn: { id: source.id, sha256: source.sha256, sourceOverlay: source.sourceOverlay,
      relativePath: source.relativePath }, stimuli: population.scenario.instances[0]!.stimuli } };
  selected.set(population.scenario.profile, correlated);
  return selected;
}

/** A well-formed occurrence of no live wait, so a late command can only differ from a valid one by its value. */
function occurrenceOf(start: Stimulus) {
  assert.ok("instanceId" in start);
  return { processInstanceId: start.instanceId, elementId: "Unavailable", activation: 1 };
}

/** Retained answer-free schedules provide valid starts; expectations follow each profile's reviewed external domain. */
export async function domainCases(): Promise<readonly DomainCase[]> {
  const selected = await selectedProfileContexts();
  assertProfilesEnrolled(selected.keys());
  const cases: DomainCase[] = [];
  const add: AddCase = (context, suffix, stimuli, supported) =>
    cases.push({ context, scenario: changedScenario(context, suffix, stimuli), supported });
  for (const context of selected.values()) {
    const profile = context.scenario.profile;
    const domains = expectedDomainsOf(profile);
    cases.push({ context, scenario: context.scenario, supported: true });
    const start = context.scenario.stimuli[0]!;
    assert.ok(start.kind === StimulusKind.StartProcess || start.kind === StimulusKind.TriggerMessageStart ||
      start.kind === StimulusKind.TriggerTimerStart);
    const differentProcessId = `${start.processId}_Other`;
    cases.push({ context, scenario: changedScenario(context, "wrong-start-process",
      [{ ...start, processId: differentProcessId }, ...context.scenario.stimuli.slice(1)]), supported: false });
    addLateValueCases(context, start, domains, add);
    // Message and Timer Starts carry no bindings, so they have no Start value surface.
    if (start.kind === StimulusKind.StartProcess && profile !== SemanticProfileId.PortableBusinessValuesHandoff) {
      addStartKindCases(context, start, domains.start, add);
    }
    addPayloadCases(context, start, domains.payload, add);
    addIncidentCommandCases(context, start, add);
  }
  for (const profile of [SemanticProfileId.CallActivityDataBoundaries, SemanticProfileId.Compensation]) {
    const context = selected.get(profile)!;
    const start = context.scenario.stimuli[0]!;
    assert.ok(start.kind === StimulusKind.StartProcess);
    const startCase = (suffix: string, initialVariables: readonly VariableBinding[], supported: boolean) =>
      add(context, suffix, [{ ...start, initialVariables }, ...context.scenario.stimuli.slice(1)], supported);
    const undeclared: VariableBinding = { name: "zzUndeclared", value: values[0]! };
    startCase("invalid-start-data-missing", [], false);
    startCase("invalid-start-data-undeclared", [undeclared], false);
    startCase("invalid-start-data-extra", [...start.initialVariables, undeclared], false);
    if (profile === SemanticProfileId.CallActivityDataBoundaries) {
      const request = callRequestProperty(context);
      const optional = start.initialVariables.filter(binding => binding.name !== request);
      assert.ok(optional.length > 0);
      startCase("invalid-start-data-required-input-missing", optional, false);
      startCase("valid-start-data-required-only", [{ name: request, value: values[0]! }], true);
      startCase("valid-start-data-null-request", [{ name: request, value: { kind: VariableValueKind.Null } }], true);
    } else {
      const snapshots = context.semanticProcess.compensationEventSubProcessSnapshots;
      assert.ok(snapshots !== undefined && start.initialVariables.length === 1);
      const binding = start.initialVariables[0]!;
      startCase("invalid-start-data-capacity-overflow", [{ ...binding,
        value: { kind: VariableValueKind.String, value: "x".repeat(snapshots.limits.maxCanonicalBytes + 1) } }], false);
    }
  }
  addPortableHandoffCases(selected.get(SemanticProfileId.PortableBusinessValuesHandoff)!, add);
  addEffectDataCases(selected.get(SemanticProfileId.PortableBusinessEffectData)!, add);
  addMessagePayloadCases(selected.get(SemanticProfileId.PortableBusinessMessagePayload)!, add);
  addNestedScopeDataCases(selected.get(SemanticProfileId.NestedEmbeddedScopeData)!, add);
  // The Call variable mapping shares the nested profile, so its loan application is not the profile's selected context.
  const loan = (await loadAndCompileCases(pipelineCases.filter(({ id }) => id === "call-variable-mapping-loan-approved")))[0];
  assert.ok(loan !== undefined, "the loan application schedule is registered");
  addCallVariableMappingCases(loan, add);
  const claim = (await loadAndCompileCases(pipelineCases.filter(({ id }) => id === "concurrent-scope-data-claim-fetch-one-first")))[0];
  assert.ok(claim !== undefined, "the claim damage assessment schedule is registered");
  addConcurrentScopeDataCases(claim, add);
  for (const id of ["concurrent-structured-scope-data-order-review-first", "concurrent-structured-scope-data-loan-credit-first",
    "root-parallel-forks-onboarding-documents-while-laptop-open", "pass-through-parallel-branches-relocation-packing-first",
    "pass-through-parallel-branches-invoice-settled", "none-intermediate-throw-onboarding-account-first",
    "link-events-onboarding-account-first",
    "pass-through-implicit-split-merge-dispatch-packed-first",
    "data-declaring-terminal-branches-expense-claim",
    "single-scope-models-purchase-approval-first", "send-task-claim-assessed-first", "terminal-forks-offboarding-equipment-first",
    "terminal-forks-office-move", "inclusive-gateway-regions-account-residency-only",
    "inclusive-gateway-regions-account-standard-only", "scope-host-split-onboarding-register-first",
    "activity-host-split-intake-archive-first"]) {
    const context = (await loadAndCompileCases(pipelineCases.filter(candidate => candidate.id === id)))[0];
    assert.ok(context !== undefined, `the ${id} schedule is registered`);
    addConcurrentStructuredScopeDataCases(context, add);
  }
  for (const id of ["scope-reentry-claim-rework-then-approve", "scope-reentry-contract-revise-then-sign",
    "exclusive-choice-arity-complaint-delivery", "none-end-fan-in-travel-booked", "single-scope-models-invoice-valid",
    "activity-host-merge-claim-expert"]) {
    const context = (await loadAndCompileCases(pipelineCases.filter(candidate => candidate.id === id)))[0];
    assert.ok(context !== undefined, `the ${id} schedule is registered`);
    addScopeReentryCases(context, add);
  }
  for (const id of ["pass-through-task-equipment-return", "pass-through-task-intake-illegible-twice-then-paper",
    "none-intermediate-throw-warranty-passed", "link-events-warranty-passed"]) {
    const context = (await loadAndCompileCases(pipelineCases.filter(candidate => candidate.id === id)))[0];
    assert.ok(context !== undefined, `the ${id} schedule is registered`);
    addPassThroughTaskCases(context, add);
  }
  const travel = (await loadAndCompileCases(pipelineCases.filter(({ id }) => id === "concurrent-mapped-calls-travel-request")))[0];
  assert.ok(travel !== undefined, "the travel request schedule is registered");
  addConcurrentMappedCallsCases(travel, add);
  const mapped = selected.get(SemanticProfileId.MappedSuccessServiceTask)!;
  const effectIndex = mapped.scenario.stimuli.findIndex(stimulus => stimulus.kind === StimulusKind.CompleteEffect);
  const effect = mapped.scenario.stimuli[effectIndex]!;
  assert.ok(effect.kind === StimulusKind.CompleteEffect && effect.result.kind === EffectExecutionResultKind.Success);
  for (const [label, localPatch] of [["missing", []], ["extra", [...effect.result.localPatch, { name: "zzExtra", value: values[0]! }]],
    ["wrong-name", [{ name: "wrong", value: values[0]! }]]] as const) {
    const negative = { ...effect, commandId: `refuse-${label}`, result: { ...effect.result, localPatch } };
    add(mapped, label, [...mapped.scenario.stimuli.slice(0, effectIndex), negative, ...mapped.scenario.stimuli.slice(effectIndex)], true);
  }
  const embedded = selected.get(SemanticProfileId.EmbeddedSubProcessCompletion)!;
  const start = embedded.scenario.stimuli[0]!;
  const human = embedded.scenario.stimuli.find(stimulus => stimulus.kind === StimulusKind.CompleteUserTaskInstance)!;
  add(embedded, "empty-sequence", [], false);
  add(embedded, "late-start", [...embedded.scenario.stimuli, { ...start, commandId: "second-start" }], false);
  add(embedded, "non-start-first", [human], false);
  assert.ok(start.kind === StimulusKind.StartProcess);
  for (const [label, patch] of [
    ["profile", { profile: SemanticProfileId.UserTask }],
    ["source-id", { bpmn: { ...embedded.scenario.bpmn, id: "other" } }],
    ["source-hash", { bpmn: { ...embedded.scenario.bpmn, sha256: "0".repeat(64) } }],
    ["source-overlay", { bpmn: { ...embedded.scenario.bpmn, sourceOverlay: { id: "other", sha256: "0".repeat(64) } } }],
    ["observations", { observations: embedded.scenario.observations.slice(1) }],
  ] as const) cases.push({ context: embedded, scenario: { ...changedScenario(embedded, label, embedded.scenario.stimuli), ...patch }, supported: false });
  return cases;
}

function callRequestProperty(context: DomainContext): string {
  const invoke = context.semanticProcess.operations.find(operation => operation.kind === SemanticOperationKind.InvokeProcess);
  assert.ok(invoke?.kind === SemanticOperationKind.InvokeProcess && invoke.data.kind === CallDataKind.Scalar &&
    invoke.data.directInput.source.kind === "property");
  return invoke.data.directInput.source.propertyId;
}

/** Human completion and both effect result arms receive the same profile-selected kind check. */
function addLateValueCases(context: DomainContext, start: Stimulus, domains: ProfileValueDomains, add: AddCase): void {
  const occurrence = occurrenceOf(start);
  for (const surface of ["human", EffectExecutionResultKind.Success, EffectExecutionResultKind.BpmnError] as const) {
    const admitted = surface === "human" ? domains.human : domains.effect;
    for (const value of values) {
      const bindings: VariableBinding[] = [...(admitted.length === 0 ? [] : [{ name: "candidate", value: values.find(v => v.kind === admitted[0])! }]),
        { name: "zzLater", value }];
      const stimulus: Stimulus = surface === "human"
        ? { kind: StimulusKind.CompleteUserTaskInstance, commandId: `late-${surface}-${value.kind}`, taskId: occurrence, submittedValues: bindings }
        : { kind: StimulusKind.CompleteEffect, commandId: `late-${surface}-${value.kind}`, effectId: occurrence,
          result: surface === EffectExecutionResultKind.Success ? { kind: surface, localPatch: bindings }
            : { kind: surface, code: "BUSINESS", message: null, localPatch: bindings } };
      add(context, `${surface}-${value.kind}`, [...context.scenario.stimuli, stimulus], admitted.includes(value.kind));
    }
  }
}

/**
 * Probes each value kind at the Start surface. A declared-data profile gets one declared binding replaced; every other
 * profile gets an unrelated binding appended, which keeps the probe on the value kind alone.
 */
function addStartKindCases(context: DomainContext, start: StartProcessStimulus, admitted: readonly VariableValueKind[], add: AddCase): void {
  const declared = declaredStartBinding(context, start);
  for (const value of values) {
    const initialVariables = declared === undefined ? [...start.initialVariables, { name: "zzLater", value }]
      : start.initialVariables.map(binding => binding.name === declared ? { ...binding, value } : binding);
    add(context, `start-${value.kind}`, [{ ...start, initialVariables }], admitted.includes(value.kind));
  }
}

function declaredStartBinding(context: DomainContext, start: StartProcessStimulus): string | undefined {
  const profile = context.scenario.profile;
  if (!declaredStartData.has(profile)) return undefined;
  if (profile === SemanticProfileId.CallActivityDataBoundaries) return callRequestProperty(context);
  const first = start.initialVariables[0];
  assert.ok(first !== undefined, `${profile} retains a declared Start binding to replace`);
  return first.name;
}

/** A well-formed channel for a late delivery to no live subscription, so only the payload value can move the expectation. */
const lateDeliveryChannel = { kind: MessageChannelKind.OperationMessage, interfaceId: "Interface", interfaceOperationId: "Operation", messageId: "Message" } as const;

/** Direct payload delivery checks the profile's payload kinds; correlated delivery is wire-restricted to String. */
function addPayloadCases(context: DomainContext, start: Stimulus, admitted: readonly VariableValueKind[], add: AddCase): void {
  const occurrence = occurrenceOf(start);
  const channel = lateDeliveryChannel;
  for (const value of values) {
    const payload: Stimulus = { kind: StimulusKind.DeliverPayloadMessage, commandId: `late-payload-${value.kind}`,
      subscriptionId: occurrence, channel, payload: value };
    add(context, `payload-${value.kind}`, [...context.scenario.stimuli, payload], admitted.includes(value.kind));
    // Strict wire decoding rejects a non-String correlated payload before support (see the strict-wire test), so no support case exists for it.
    if (value.kind !== VariableValueKind.String) continue;
    const delivery: Stimulus = { kind: StimulusKind.DeliverCorrelatedPayloadMessage, commandId: `late-correlated-${value.kind}`,
      subscriptionId: occurrence, address: { definition: context.semanticProcess.identity, processId: context.semanticProcess.processId,
        channel, correlationKeyId: "Key" }, ingressOrdinal: 1, correlationPropertyId: "Correlation", processPropertyId: "Property", payload: value };
    add(context, `correlated-${value.kind}`, [...context.scenario.stimuli, delivery], context.scenario.profile === correlatedPayloadProfile);
  }
}

/** Incident commands carry no value; their support is a profile fact per command family. */
function addIncidentCommandCases(context: DomainContext, start: Stimulus, add: AddCase): void {
  const occurrence = occurrenceOf(start);
  const profile = context.scenario.profile;
  for (const stimulus of [
    { kind: StimulusKind.ReportEffectFailure, commandId: "late-failure", effectId: occurrence, generation: 1 },
    { kind: StimulusKind.RetryIncident, commandId: "late-retry", incidentId: { effectId: occurrence, generation: 1 } },
    { kind: StimulusKind.CancelIncidentProcess, commandId: "late-cancel", processInstanceId: occurrence.processInstanceId,
      incidentId: { effectId: occurrence, generation: 1 } },
  ] as const satisfies readonly Stimulus[]) add(context, stimulus.kind, [...context.scenario.stimuli, stimulus],
    incidentCommandProfiles[stimulus.kind].includes(profile));
}

/**
 * The serial portable handoff selects Process Start and User Task completion only, with exactly one P_in binding and a
 * 1,024-byte root String bound. Each case changes one fact of the retained answer-free Start, so only that fact can move
 * the expectation.
 */
function addPortableHandoffCases(context: DomainContext, add: AddCase): void {
  const start = context.scenario.stimuli[0]!;
  assert.ok(start.kind === StimulusKind.StartProcess && start.initialVariables.length === 1);
  const pin = start.initialVariables[0]!.name;
  const rest = context.scenario.stimuli.slice(1);
  const startWith = (suffix: string, initialVariables: readonly VariableBinding[], supported: boolean) =>
    add(context, suffix, [{ ...start, initialVariables }, ...rest], supported);
  const string = (bytes: number): VariableValue => ({ kind: VariableValueKind.String, value: "a".repeat(bytes) });
  for (const value of values) startWith(`start-${value.kind}`, [{ name: pin, value }], singletonBusinessItem.includes(value.kind));
  startWith("start-string-exact-bound", [{ name: pin, value: string(1024) }], true);
  startWith("start-string-over-bound", [{ name: pin, value: string(1025) }], false);
  startWith("invalid-start-data-missing", [], false);
  startWith("invalid-start-data-undeclared", [{ name: "zzUndeclared", value: values[0]! }], false);
  startWith("invalid-start-data-extra", [...start.initialVariables, { name: "zzUndeclared", value: values[0]! }], false);
  const occurrence = { processInstanceId: start.instanceId, elementId: "Unavailable", activation: 1 };
  for (const [label, value, supported] of [["exact-bound", string(1024), true], ["over-bound", string(1025), false]] as const) {
    const stimulus: Stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: `late-human-${label}`,
      taskId: occurrence, submittedValues: [{ name: "candidate", value: values[0]! }, { name: "zzLater", value }] };
    add(context, `human-string-${label}`, [...context.scenario.stimuli, stimulus], supported);
  }
}

/**
 * The structured effect-data profile keeps String/Null at Start and admits a SingletonBusinessItem result, both with the
 * 1,024-byte root String bound that the kind table cannot express. Each case changes one fact of the retained answer-free
 * Start or appends one late result, so only that fact can move the expectation.
 */
function addEffectDataCases(context: DomainContext, add: AddCase): void {
  const start = context.scenario.stimuli[0]!;
  assert.ok(start.kind === StimulusKind.StartProcess && start.initialVariables.length > 0);
  const declared = start.initialVariables[0]!;
  const string = (bytes: number): VariableValue => ({ kind: VariableValueKind.String, value: "a".repeat(bytes) });
  for (const [label, value, supported] of [["exact-bound", string(1024), true], ["over-bound", string(1025), false]] as const) {
    add(context, `start-string-${label}`, [{ ...start, initialVariables: start.initialVariables.map(binding =>
      binding.name === declared.name ? { ...binding, value } : binding) }, ...context.scenario.stimuli.slice(1)], supported);
    const stimulus: Stimulus = { kind: StimulusKind.CompleteEffect, commandId: `late-effect-${label}`, effectId: occurrenceOf(start),
      result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "zzLater", value }] } };
    add(context, `effect-string-${label}`, [...context.scenario.stimuli, stimulus], supported);
  }
}

/**
 * The structured Message-payload profile admits a SingletonBusinessItem payload with the 1,024-byte root String bound
 * that the kind table cannot express. Each case appends one late delivery to the retained answer-free schedule, so only
 * the payload String can move the expectation.
 */
function addMessagePayloadCases(context: DomainContext, add: AddCase): void {
  const start = context.scenario.stimuli[0]!;
  for (const [label, bytes, supported] of [["exact-bound", 1024, true], ["over-bound", 1025, false]] as const) {
    const stimulus: Stimulus = { kind: StimulusKind.DeliverPayloadMessage, commandId: `late-payload-string-${label}`,
      subscriptionId: occurrenceOf(start), channel: lateDeliveryChannel, payload: { kind: VariableValueKind.String, value: "a".repeat(bytes) } };
    add(context, `payload-string-${label}`, [...context.scenario.stimuli, stimulus], supported);
  }
}

/**
 * The nested scope-data profile selects a SingletonBusinessItem at Start, User Task completion and effect result, each
 * with the 1,024-byte root String bound, and derives its required Start names from the scope chain (NSD-AVAILABLE-01).
 * Each case changes one fact of the retained answer-free Start or appends one late command, so only that fact can move
 * the expectation; a present null satisfies a required name and an absent one does not.
 */
function addNestedScopeDataCases(context: DomainContext, add: AddCase): void {
  const start = context.scenario.stimuli[0]!;
  assert.ok(start.kind === StimulusKind.StartProcess);
  const required = start.initialVariables.find(binding => binding.name === "riskClass");
  assert.ok(required !== undefined, "the retained purchase-order Start carries the scope-chain-required riskClass");
  const startWith = (suffix: string, initialVariables: readonly VariableBinding[], supported: boolean) =>
    add(context, suffix, [{ ...start, initialVariables }, ...context.scenario.stimuli.slice(1)], supported);
  const replaced = (value: VariableValue) => start.initialVariables.map(binding => binding.name === "riskClass" ? { ...binding, value } : binding);
  const string = (bytes: number): VariableValue => ({ kind: VariableValueKind.String, value: "a".repeat(bytes) });
  startWith("invalid-start-data-missing-required", start.initialVariables.filter(binding => binding.name !== "riskClass"), false);
  startWith("valid-start-data-present-null", replaced({ kind: VariableValueKind.Null }), true);
  for (const [label, value, supported] of [["exact-bound", string(1024), true], ["over-bound", string(1025), false]] as const) {
    startWith(`start-string-${label}`, replaced(value), supported);
    for (const surface of ["human", "effect"] as const) {
      const occurrence = occurrenceOf(start);
      const bindings = [{ name: "zzLater", value }];
      const stimulus: Stimulus = surface === "human"
        ? { kind: StimulusKind.CompleteUserTaskInstance, commandId: `late-${surface}-${label}`, taskId: occurrence, submittedValues: bindings }
        : { kind: StimulusKind.CompleteEffect, commandId: `late-${surface}-${label}`, effectId: occurrence,
          result: { kind: EffectExecutionResultKind.Success, localPatch: bindings } };
      add(context, `${surface}-string-${label}`, [...context.scenario.stimuli, stimulus], supported);
    }
  }
}

/**
 * The claim damage assessment is a data-bearing Program of the embedded completion profile, whose separate row admits a
 * String of at most 1,024 UTF-8 bytes or a present null on every write surface (CSD-VALUE-01) and derives its required
 * Start names from the occurrence chain (CSD-AVAILABLE-01): Price damage's input reads `noAdjuster`, which no enclosing
 * input declares. Each case changes one fact of the retained answer-free Start or appends one late command.
 */
function addConcurrentScopeDataCases(context: DomainContext, add: AddCase): void {
  const start = context.scenario.stimuli[0]!;
  assert.ok(start.kind === StimulusKind.StartProcess);
  assert.ok(start.initialVariables.some(binding => binding.name === "noAdjuster"),
    "the retained claim Start carries the occurrence-chain-required noAdjuster");
  const domains = dataBearingEmbeddedCompletionDomains;
  addLateValueCases(context, start, domains, add);
  addStartKindCases(context, start, domains.start, add);
  const startWith = (suffix: string, initialVariables: readonly VariableBinding[], supported: boolean) =>
    add(context, suffix, [{ ...start, initialVariables }, ...context.scenario.stimuli.slice(1)], supported);
  const string = (bytes: number): VariableValue => ({ kind: VariableValueKind.String, value: "a".repeat(bytes) });
  startWith("invalid-start-data-missing-required", start.initialVariables.filter(binding => binding.name !== "noAdjuster"), false);
  for (const [label, value, supported] of [["exact-bound", string(1024), true], ["over-bound", string(1025), false]] as const) {
    startWith(`start-string-${label}`, start.initialVariables.map(binding =>
      binding.name === "noAdjuster" ? { ...binding, value } : binding), supported);
    for (const surface of ["human", "effect"] as const) {
      const occurrence = occurrenceOf(start);
      const bindings = [{ name: "zzLater", value }];
      const stimulus: Stimulus = surface === "human"
        ? { kind: StimulusKind.CompleteUserTaskInstance, commandId: `late-${surface}-${label}`, taskId: occurrence, submittedValues: bindings }
        : { kind: StimulusKind.CompleteEffect, commandId: `late-${surface}-${label}`, effectId: occurrence,
          result: { kind: EffectExecutionResultKind.Success, localPatch: bindings } };
      add(context, `${surface}-string-${label}`, [...context.scenario.stimuli, stimulus], supported);
    }
  }
}

/**
 * The cases every one-name Start of the nested scope-data profile shares: one late value command per kind, each value
 * kind replacing the required business object, which keeps a Call's Start rule from refusing an appended unknown name,
 * the missing name refused and a present null admitted. Returns the retained Start and a builder replacing it.
 */
function addRequiredStartNameCases(context: DomainContext, add: AddCase) {
  const start = context.scenario.stimuli[0]!;
  assert.ok(start.kind === StimulusKind.StartProcess && start.initialVariables.length === 1);
  const domains = expectedDomainsOf(context.scenario.profile);
  addLateValueCases(context, start, domains, add);
  const startWith = (suffix: string, initialVariables: readonly VariableBinding[], supported: boolean) =>
    add(context, suffix, [{ ...start, initialVariables }, ...context.scenario.stimuli.slice(1)], supported);
  for (const value of values) {
    add(context, `start-${value.kind}`, [{ ...start, initialVariables: [{ ...start.initialVariables[0]!, value }] }],
      domains.start.includes(value.kind));
  }
  startWith("invalid-start-data-missing-required", [], false);
  startWith("valid-start-data-present-null", [{ ...start.initialVariables[0]!, value: { kind: VariableValueKind.Null } }], true);
  return { start, startWith };
}

/**
 * The order fulfilment, loan assessment, root-forking employee onboarding (RPF-VALUE-01), the office relocation and
 * invoice settlement whose branches hold pass-through Tasks (PTPB-ADMIT-01), the onboarding milestones whose branch
 * holds a None Throw (NIT-ADMIT-01), the purchase request forking at its only scope (SSM-ADMIT-01) and the claim
 * acknowledgement whose Sub-Process forks into a Send Task (SEND-ADMIT-01) are concurrent Programs of the nested
 * scope-data profile, which keep its SingletonBusinessItem domain on every surface (CSSD-VALUE-01) and derive
 * their required Start names from the occurrence chain (CSD-AVAILABLE-01, CMCALL-START-01): each requires only its
 * business object, a present null satisfies it, and the loan refuses a Start naming a declared local or a name only the called Process knows. Each case changes one fact of the
 * retained answer-free Start or appends one late command.
 */
function addConcurrentStructuredScopeDataCases(context: DomainContext, add: AddCase): void {
  const { start, startWith } = addRequiredStartNameCases(context, add);
  // Only the loan's Call refuses these names (CMCALL-START-01); the account opening also starts with `application`.
  if (context.scenario.id === "concurrent-structured-scope-data-loan-credit-first") {
    // Appended names sort after the retained `application`, which keeps the canonical name order.
    for (const name of ["case", "dossier"]) {
      startWith(`invalid-start-data-${name}-name`, [...start.initialVariables, { name, value: values[0]! }], false);
    }
  }
}

/**
 * The claim rework and contract revision re-enter a Sub-Process, the contract also a Call, the complaint handling
 * chooses among three conditions (XCA-ADMIT-01), the travel request ends three flows at one End (NEF-ADMIT-01) and the
 * invoice clearing re-enters its only scope (SSM-ADMIT-01), all under the nested scope-data profile's SingletonBusinessItem
 * domain; SRE-AVAILABLE-01 derives their Start names by the barrier rule: each requires only its retained value, and a
 * present null satisfies it. The Call-free claim, complaint, travel request and invoice admit their own Process outputs
 * `assessment`, `category`, `decision` and `verdict`; the
 * contract, whose Call restricts Start to required and optional names (CMCALL-START-01), admits the
 * returned `legalVerdict` and refuses the frame local `draft` and the called-only `verdict`. Each case changes one fact
 * of the retained answer-free Start or appends one late command.
 */
function addScopeReentryCases(context: DomainContext, add: AddCase): void {
  const { start, startWith } = addRequiredStartNameCases(context, add);
  const retained = start.initialVariables[0]!.name;
  const names = retained === "claimSummary" ? [["assessment", true]] as const
    : retained === "orderNumber" ? [["category", true]] as const
    : retained === "traveller" ? [["decision", true]] as const
    : retained === "invoice" ? [["verdict", true]] as const
    : [["draft", false], ["legalVerdict", true], ["verdict", false]] as const;
  for (const [name, supported] of names) {
    // Kept in the canonical name order the Start contract requires.
    const bindings = [...start.initialVariables, { name, value: values[0]! }].toSorted((left, right) =>
      left.name < right.name ? -1 : 1);
    startWith(`${supported ? "valid" : "invalid"}-start-data-${name}-name`, bindings, supported);
  }
}

/**
 * The equipment return and document intake hold pass-through Tasks, and the warranty repair None Throws, under the nested
 * scope-data profile, which add no value surface: no model requires a Start name, so every value kind is probed on an
 * appended Start binding, after the warranty's unrequired `device`, and on one late command per write surface, and the
 * profile's SingletonBusinessItem domain alone decides each expectation.
 */
function addPassThroughTaskCases(context: DomainContext, add: AddCase): void {
  const start = context.scenario.stimuli[0]!;
  assert.ok(start.kind === StimulusKind.StartProcess &&
    structuredScopeDataProgramStartNames(context.semanticProcess)?.required.length === 0);
  const domains = expectedDomainsOf(context.scenario.profile);
  addLateValueCases(context, start, domains, add);
  addStartKindCases(context, start, domains.start, add);
}

/**
 * The travel request's Start names under CMCALL-START-01 and CMCALL-AVAILABLE-01: Booking reads `approvedBudget`, a
 * sibling Call's output, at its entry, so it is required; the Calls' input source `traveller` and the output target
 * `visaStatus` land at the Process and are optional; Booking's own `budget` and the called-only `confirmedBudget` exist in
 * no caller scope. Each case changes one fact of the retained answer-free Start, so only that fact can move the expectation.
 */
function addConcurrentMappedCallsCases(context: DomainContext, add: AddCase): void {
  const start = context.scenario.stimuli[0]!;
  assert.ok(start.kind === StimulusKind.StartProcess);
  const startWith = (suffix: string, initialVariables: readonly VariableBinding[], supported: boolean) =>
    add(context, suffix, [{ ...start, initialVariables }, ...context.scenario.stimuli.slice(1)], supported);
  // Appended names sort after the retained `approvedBudget`, which keeps the canonical name order.
  const appended = (...names: string[]) => [...start.initialVariables, ...names.map(name => ({ name, value: values[0]! }))];
  startWith("invalid-start-data-missing-required", [], false);
  startWith("invalid-start-data-declared-local-name", appended("budget"), false);
  startWith("invalid-start-data-called-only-name", appended("confirmedBudget"), false);
  startWith("valid-start-data-call-source-and-output-target", appended("traveller", "visaStatus"), true);
}

/**
 * The loan application's Start names are derived from the Call (CVM-START-01): `amount` is read by the caller's effect and
 * Call input, `applicant` is a Call source whose absence or present null is a valid Start (CVM-IN-01), `decision` is an
 * output target the Process may already bind, and the called-only `customer` and output source `verdict` exist in no
 * caller scope. Each case changes one fact of the retained answer-free Start, so only that fact can move the expectation.
 */
function addCallVariableMappingCases(context: DomainContext, add: AddCase): void {
  const start = context.scenario.stimuli[0]!;
  assert.ok(start.kind === StimulusKind.StartProcess);
  const startWith = (suffix: string, initialVariables: readonly VariableBinding[], supported: boolean) =>
    add(context, suffix, [{ ...start, initialVariables }, ...context.scenario.stimuli.slice(1)], supported);
  const without = (name: string) => start.initialVariables.filter(binding => binding.name !== name);
  // Appended names sort after every retained one, which keeps the canonical name order.
  const appended = (name: string) => [...start.initialVariables, { name, value: values[0]! }];
  startWith("invalid-start-data-missing-required", without("amount"), false);
  startWith("invalid-start-data-called-only-name", appended("customer"), false);
  startWith("invalid-start-data-output-source-name", appended("verdict"), false);
  startWith("valid-start-data-absent-call-source", without("applicant"), true);
  startWith("valid-start-data-present-null-call-source", start.initialVariables.map(binding =>
    binding.name === "applicant" ? { ...binding, value: { kind: VariableValueKind.Null } } : binding), true);
  startWith("valid-start-data-output-target", appended("decision"), true);
}
