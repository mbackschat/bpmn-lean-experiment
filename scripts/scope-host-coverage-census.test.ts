import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Declaration,
  key,
  leanConstructorDigests,
  leanDeclarations,
  leanProductionDeclarations,
  leanWildcard,
  nonExhaustive,
  siteDeclaration,
  staleEntries,
  typeScriptDeclarations,
  typeScriptProductionDeclarations,
} from "./host-coverage-census-support.ts";

/*
 * The host-coverage census of the scope host
 * (docs/capsules/SCOPE-HOST-FLOW-LISTS-PROPOSAL.md#host-coverage-census-extended).
 *
 * Compilation cannot see a wildcard arm or a non-exhaustive `kind` comparison that silently absorbs the appended
 * `scope` and `scopeExit` operations. Every declaration that decides something about a None Start initiation, a scope
 * entry, a scope completion or a token split without an exhaustive match must name the host, or carry a reviewed
 * reason below. The allowlists name declarations, never files.
 */

const profile = "profile shape admits no host outside the nested scope-data profile (SCPH-PROFILE-01)";
const catalog = "exact catalog shapes count a host apart and admit none (SCPH-PROFILE-01)";
const multiInstance = "a Multi-Instance body is no ordinary embedded Sub-Process, so it never holds a host (SCPH-ADMIT-01)";
const single = "a host or exit is never applied by owning occurrence or prepared as a commutation member (SCPH-SINGLE-01); the wildcard refuses it";
const snapshot = "compensation snapshot declarations exist only under compensation profiles, which admit no host (SCPH-PROFILE-01)";
const legacyStep = "evaluates the legacy operation it is given; a host or exit reaches it only as its legacy step (SCPH-HOST-01)";
const widening = "the nested scope-data accounts admit no host before the widening commit, which names it here (SCPH-ADMIT-01)";
const lowering = "no lowering emits a host before the widening commit; every one-flow node keeps its legacy lowering (SCPH-ONE-01)";
const selection = "keys an Inclusive selection record, which a host never creates (SCPH-HOST-01)";
const noWait = "matches a wait or effect, which a host never declares (SCPH-HOST-01)";

/** Lean `def`s in a scope population, with the reason each may omit the host. */
const leanAllowlist: Readonly<Record<string, string>> = {
  "BpmnSemantics/ParallelScopeReservationMain.lean::enteredReservationState?": multiInstance,
  "BpmnSemantics/ParallelScopeReservationMain.lean::retirementFrontierJson": multiInstance,
  "BpmnSemantics/SemanticProcess/CallDataAdmission.lean::program?": profile,
  "BpmnSemantics/SemanticProcess/ContinuationMarking.lean::bodyConsumedPorts": multiInstance,
  "BpmnSemantics/SemanticProcess/ContinuationMarking.lean::bodyProducedPorts": multiInstance,
  "BpmnSemantics/SemanticProcess/EffectDataAdmission.lean::operationVertex?": profile,
  "BpmnSemantics/SemanticProcess/EffectDataAdmission.lean::programAnalysis": profile,
  "BpmnSemantics/SemanticProcess/GraphValidation.lean::messageHandlerEdges": profile,
  "BpmnSemantics/SemanticProcess/GraphValidation.lean::rootCompletionIds":
    "an exit completes an embedded Sub-Process, never the root (SCPH-HOST-01 Program rules)",
  "BpmnSemantics/SemanticProcess/InclusiveRegionAdmission.lean::programGraph": widening,
  "BpmnSemantics/SemanticProcess/InclusiveRegionAdmission.lean::programInputs": widening,
  "BpmnSemantics/SemanticProcess/InclusiveRegionAdmission.lean::programVertexKind": widening,
  "BpmnSemantics/SemanticProcess/InternalLocalControlPreparation.lean::internalLocalControlOrigin?": single,
  "BpmnSemantics/SemanticProcess/InternalLocalControlSelection.lean::InternalLocalControlSelection.censusReads": single,
  "BpmnSemantics/SemanticProcess/InternalLocalControlSelection.lean::selectInternalLocalControl?": single,
  "BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean::applyInternalOperationOccurrence?": single,
  "BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean::internalOperationOccurrenceOffers?": single,
  "BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean::prepareOccurrenceTokenPatch?": single,
  "BpmnSemantics/SemanticProcess/InternalPreparedTransition.lean::prepareInternalTransition?": single,
  "BpmnSemantics/SemanticProcess/InternalRegionalFootprint.lean::regionalBaseFootprint?": single,
  "BpmnSemantics/SemanticProcess/InternalRegionalPublication.lean::regionalLifecycleTemplate?": single,
  "BpmnSemantics/SemanticProcess/InternalRegionalPublication.lean::regionalPositionDelta?": single,
  "BpmnSemantics/SemanticProcess/InternalRegionalSelection.lean::selectInternalRegional?": single,
  "BpmnSemantics/SemanticProcess/InternalScopeCreationPreparation.lean::internalScopeCreationDefinitionMatches": single,
  "BpmnSemantics/SemanticProcess/InternalScopeCreationPreparation.lean::internalScopeCreationOrigin?": single,
  "BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean::internalScopeCreationRetentionUnchanged": single,
  "BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean::internalScopeCreationUndeclared": single,
  "BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean::selectInternalScopeCreation?": single,
  "BpmnSemantics/SemanticProcess/InternalSnapshotArmingExecution.lean::SnapshotRefusableDisabled": snapshot,
  "BpmnSemantics/SemanticProcess/InterruptingMessageEventSubProcessProgramAdmission.lean::flowNodeOrigins": profile,
  "BpmnSemantics/SemanticProcess/InterruptingMessageEventSubProcessProgramAdmission.lean::withdrawalProgramTopology": profile,
  "BpmnSemantics/SemanticProcess/Lowering.lean::lowerNode": lowering,
  "BpmnSemantics/SemanticProcess/Lowering.lean::lowerOrdinaryScopeCompletions": lowering,
  "BpmnSemantics/SemanticProcess/MergeTargetOperations.lean::isMergeTargetOperation": profile,
  "BpmnSemantics/SemanticProcess/MergeTargetOperations.lean::mergeTargetEntry": profile,
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean::operationOrigin?": profile,
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean::operationOutputs": profile,
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean::operationVertex?": profile,
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean::programAnalysis": profile,
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowDataProofs.lean::OperationAllowed": profile,
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowLifecycleProofs.lean::FirePhase": profile,
  "BpmnSemantics/SemanticProcess/MonitoredScope.lean::monitoredScopeCandidate?": profile,
  "BpmnSemantics/SemanticProcess/MonitoredScope.lean::monitoredScopeCompletionOperations": profile,
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::controlParentOutput?": widening,
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::operationInputs": widening,
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::operationVertex?": widening,
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::programBodies": widening,
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::programModel": widening,
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::programRestrictionsHold": widening,
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::splits": widening,
  "BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean::childCompletion?": widening,
  "BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean::operationVertex?": widening,
  "BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean::programEnvelope?": widening,
  "BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean::programActivityBoundaryMessageTopologyValid": catalog,
  "BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean::programParallelTopologyValid": catalog,
  "BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean::inclusiveOperationsPaired":
    "pairs each Inclusive split with its join; a host is no Inclusive split (SCPH-HOST-01)",
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::completion?": profile,
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::programBindings": profile,
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::programEntryVertex?": profile,
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::programInput": profile,
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::programProduced": profile,
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::programVertex?": profile,
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::repeatableSubscriptionChildScope?": profile,
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::repeatableSubscriptionOperationAllowed": profile,
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::repeatableSubscriptionProgramGraph": profile,
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::repeatableSubscriptionProgramShape": profile,
  "BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean::hiddenRecordDeclarationsValid": selection,
  "BpmnSemantics/SemanticProcess/SequentialScopeControlAdmission.lean::bodyVertex?": multiInstance,
  "BpmnSemantics/SemanticProcess/SequentialScopeControlAdmission.lean::parentWaits?": multiInstance,
  "BpmnSemantics/SemanticProcess/SequentialScopeProgramAdmission.lean::operationAllowed": multiInstance,
  "BpmnSemantics/SemanticProcess/SequentialScopeProgramAdmission.lean::sourceNode?": multiInstance,
  "BpmnSemantics/SemanticProcess/SerialBusinessTaskAdmission.lean::operationVertex?": profile,
  "BpmnSemantics/SemanticProcess/SerialBusinessTaskAdmission.lean::programAnalysis": profile,
  "BpmnSemantics/SemanticProcess/SerialBusinessTaskDataProofs.lean::OperationAllowed": profile,
  "BpmnSemantics/SemanticProcess/StructuredCompositionAdmission.lean::isScopeCompletion": profile,
  "BpmnSemantics/SemanticProcess/StructuredCompositionAdmission.lean::operationVertex?": profile,
  "BpmnSemantics/SemanticProcess/StructuredCompositionAdmission.lean::programAnalysis": profile,
  "BpmnSemantics/SemanticProcess/StructuredCompositionAdmission.lean::programIdentitiesValid": profile,
  "BpmnSemantics/SemanticProcess/StructuredCompositionAdmissionProofs.lean::OperationAllowed": profile,
  "BpmnSemantics/SemanticProcess/StructuredHumanWorkAdmission.lean::programStructuredHumanWorkTopology": profile,
  "BpmnSemantics/SemanticProcess/TransactionScopePhases.lean::leafCompletion": profile,
  "BpmnSemantics/SemanticProcess/TransactionSourceAdmission.lean::canonicalOperation": profile,
  "BpmnSemantics/SemanticProcess/TransactionSourceAdmission.lean::input?": profile,
  "BpmnSemantics/SemanticProcess/TransactionSourceAdmission.lean::transactionCancellationProgramGraph": profile,
  "BpmnSemantics/SemanticProcess/Transition.lean::attemptInternalOperation": snapshot,
};

/** TypeScript functions in a scope population, with the reason each may omit the host. */
const typeScriptAllowlist: Readonly<Record<string, string>> = {
  "packages/bpmn-source/src/call-activity-lowering.ts::callForestDefinitionBindingValid":
    "a Program with a root Call refuses a splitting root Start (SCPH-ADMIT-01 routing), so a Call forest keeps `initiate`",
  "packages/bpmn-source/src/semantic-process-lowering.ts::lowerNode": lowering,
  "packages/bpmn-source/src/semantic-process-lowering.ts::lowerScopeCompletion": lowering,
  "packages/semantic-core/src/call-data-program-admission.ts::callDataProgramGraph": profile,
  "packages/semantic-core/src/call-data-state-validation.ts::callDataStateIsValid": profile,
  "packages/semantic-core/src/compensation-event-sub-process-snapshot-state-validation.ts::compensationEventSubProcessSnapshotProgramDefects": snapshot,
  "packages/semantic-core/src/flow-node-occurrence-open-set.ts::waitMatchesEffect": noWait,
  "packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts::operationOwnsElement":
    "a host owns its origin element, which the non-effect branch reads (SCPH-HOST-01)",
  "packages/semantic-core/src/inclusive-gateway-admission.ts::inclusiveOperationsArePaired":
    "pairs each Inclusive split with its join; a host is no Inclusive split (SCPH-HOST-01)",
  "packages/semantic-core/src/inclusive-region-admission.ts::programRegionGraph": widening,
  "packages/semantic-core/src/inclusive-region-admission.ts::programVertexKind": widening,
  "packages/semantic-core/src/internal-occurrence-batch.ts::applyInternalOccurrenceBatch": single,
  "packages/semantic-core/src/internal-occurrence-batch.ts::deriveOccurrenceControlPatch": single,
  "packages/semantic-core/src/internal-occurrence-batch.ts::prepareInternalOccurrenceBatch": single,
  "packages/semantic-core/src/internal-operation-occurrence.ts::applyInternalOperationOccurrence": single,
  "packages/semantic-core/src/internal-operation-occurrence.ts::deriveInternalOccurrenceFrontier": single,
  "packages/semantic-core/src/internal-transition-attempt.ts::prepareCompensationSnapshotOperation": snapshot,
  "packages/semantic-core/src/internal-transition-batch.ts::deriveInternalTransitionPreparation":
    "a host or exit falls to the arming default, which prepares no arm for it, so it stays a singleton (SCPH-SINGLE-01)",
  "packages/semantic-core/src/internal-transition-declared-entry-preparation.ts::deriveInternalDeclaredScopeEntryPreparation": single,
  "packages/semantic-core/src/internal-transition-initiation-preparation.ts::isInitiationOperation": single,
  "packages/semantic-core/src/internal-transition-local-control-preparation.ts::deriveInternalDuplicatePreparation": single,
  "packages/semantic-core/src/internal-transition-local-control-preparation.ts::deriveInternalLocalControlPreparation": single,
  "packages/semantic-core/src/internal-transition-local-control-preparation.ts::deriveInternalSelectManyPreparation": single,
  "packages/semantic-core/src/internal-transition-regional-ownership.ts::deriveRegionalReferenceRetention": single,
  "packages/semantic-core/src/internal-transition-regional-preparation.ts::applyPreparedInternalRegionalTransition": single,
  "packages/semantic-core/src/internal-transition-regional-preparation.ts::regionalFootprint": single,
  "packages/semantic-core/src/internal-transition-regional-preparation.ts::selectRegionalTransition": single,
  "packages/semantic-core/src/internal-transition-regional-publication.ts::deriveInternalRegionalPublication": single,
  "packages/semantic-core/src/internal-transition-scope-completion-preparation.ts::deriveInternalCompleteScopeStateFootprint": single,
  "packages/semantic-core/src/internal-transition-scope-creation-preparation.ts::deriveInternalEnterScopeControl": single,
  "packages/semantic-core/src/internal-transition-scope-creation-preparation.ts::deriveInternalEnterScopePreparation": single,
  "packages/semantic-core/src/internal-transition-scope-creation-preparation.ts::deriveInternalScopeCreationPreparation": single,
  "packages/semantic-core/src/internal-transition-scope-creation-preparation.ts::prepareScopeCreation": single,
  "packages/semantic-core/src/interrupting-message-event-subprocess-program-admission.ts::interruptingMessageEventSubProcessProgramGraph": profile,
  "packages/semantic-core/src/merge-target-operations.ts::isMergeTargetOperation": profile,
  "packages/semantic-core/src/mixed-task-control-flow-admission.ts::mixedTaskControlProgramShape": profile,
  "packages/semantic-core/src/mixed-task-control-flow-admission.ts::programAnalysis": profile,
  "packages/semantic-core/src/nested-scope-control-admission.ts::inputsOf": widening,
  "packages/semantic-core/src/nested-scope-control-admission.ts::nestedScopeControlProgramShape": widening,
  "packages/semantic-core/src/nested-scope-control-admission.ts::programBodies": widening,
  "packages/semantic-core/src/nested-scope-control-admission.ts::programModel": widening,
  "packages/semantic-core/src/nested-scope-data-admission.ts::nestedScopeProgramModel": widening,
  "packages/semantic-core/src/nested-scope-data-admission.ts::operationInputs": widening,
  "packages/semantic-core/src/nested-scope-data-admission.ts::operationVertex": widening,
  "packages/semantic-core/src/nested-scope-data-admission.ts::programHandlers":
    "collects handler names, which a host never carries (SCPH-HOST-01)",
  "packages/semantic-core/src/nested-scope-data.ts::completeDeclaredScope": legacyStep,
  "packages/semantic-core/src/nested-scope-data.ts::completeDeclaredScopeOccurrence": legacyStep,
  "packages/semantic-core/src/portable-handoff-admission.ts::portableHandoffProgramShape": profile,
  "packages/semantic-core/src/portable-handoff-admission.ts::programTasks": profile,
  "packages/semantic-core/src/portable-handoff-admission.ts::programVertices": profile,
  "packages/semantic-core/src/repeatable-subscription-admission.ts::isScopeEntry": profile,
  "packages/semantic-core/src/repeatable-subscription-admission.ts::repeatableSubscriptionProgramGraph": profile,
  "packages/semantic-core/src/repeatable-subscription-admission.ts::repeatableSubscriptionProgramShape": profile,
  "packages/semantic-core/src/runtime-state-well-formedness.ts::runtimeStateDefects": selection,
  "packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts::completeScopeWithdrawingDeadline":
    "completes a bounded scope, which only `enterBoundedScope` opens and no exit completes (SCPH-HOST-01 Program rules)",
  "packages/semantic-core/src/semantic-process-control-flow-runtime.ts::duplicate": legacyStep,
  "packages/semantic-core/src/semantic-process-graph-admission.ts::hasSelectedParallelTopology": profile,
  "packages/semantic-core/src/semantic-process-profile.ts::hasExactActivityBoundaryMessageProgram": catalog,
  "packages/semantic-core/src/semantic-process-profile.ts::hasExactStructuredHumanWorkProgram": catalog,
  "packages/semantic-core/src/semantic-process-profile.ts::profileAllowsProgramOperationDetails":
    "per-profile operation details of profiles that admit no host; a host carries no User Task (SCPH-PROFILE-01)",
  "packages/semantic-core/src/semantic-process-scope-runtime.ts::completeScope": legacyStep,
  "packages/semantic-core/src/semantic-process-scope-runtime.ts::completeScopeOccurrence": legacyStep,
  "packages/semantic-core/src/semantic-process-scope-runtime.ts::enterScope": legacyStep,
  "packages/semantic-core/src/semantic-process-scope-runtime.ts::selectQuiescentScopeCompletion": legacyStep,
  "packages/semantic-core/src/semantic-process-scope-runtime.ts::selectScopeCompletion": legacyStep,
  "packages/semantic-core/src/semantic-program-profile-shape.ts::requiredProgramShape": catalog,
  "packages/semantic-core/src/serial-business-task-admission.ts::programAnalysis": profile,
  "packages/semantic-core/src/serial-business-task-admission.ts::serialBusinessProgramShape": profile,
  "packages/semantic-core/src/structured-process-composition-admission.ts::programVertices": profile,
  "packages/semantic-core/src/structured-process-composition-admission.ts::structuredCompositionProgramShape": profile,
  "packages/semantic-core/src/structured-scope-data-routing.ts::programRestrictionsHold": widening,
  "packages/temporal-adapter/protocol/src/start-capacity-journey.ts::completionFor": noWait,
  "packages/temporal-adapter/testkit/src/branch-bypass-mutation-workflows.ts::mutateConditionalSelection":
    "testkit mutation of Inclusive fixtures, which hold no host",
  "packages/temporal-adapter/protocol/src/start-capacity-journey.ts::effectOutputMappings": noWait,
};

/** Declarations keyed on entry or output multiplicity, which must name the host explicitly. */
const multiplicitySites: ReadonlyArray<Readonly<{ path: string; name: string }>> = [
  { path: "BpmnSemantics/SemanticProcess/InternalCommutationCore.lean", name: "prepareInternalArm?" },
  { path: "BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean", name: "semanticOperationInternalFamily" },
  { path: "packages/semantic-core/src/internal-commutation-census.ts", name: "semanticOperationInternalFamily" },
  { path: "packages/temporal-adapter/protocol/src/host-admission.ts", name: "hostOperationClass" },
];

/**
 * The legacy declarations the host shares or mirrors, frozen until the family that switches None Starts and embedded
 * Sub-Processes onto the host (the proposal's retirement rule). A behaviour-preserving edit re-baselines a digest only
 * as a reviewed Rule 2 bound change.
 */
const frozenLeanDeclarations: Readonly<Record<string, string>> = {
  "constructor initiate": "337c9697f4874735ab89686d6f8ca1467b310174e1f0a15c4c1bcd7f8b961460",
  "constructor enterScope": "27ec63c2b78734fda2b8b0db460b1f348591d8c8038195255419954449a3b16f",
  "constructor completeScope": "ea730f8960b715af0ffd9bdb95e005100a884868ec118a506a869717efb3b27b",
};

const leanScopeHost = /\.scope\b/u;
const leanScopeExit = /\.scopeExit\b/u;
const typeScriptScopeHost = /SemanticOperationKind\.Scope\b|ScopeWorkKind\./u;
const typeScriptScopeExit = /SemanticOperationKind\.ScopeExit\b/u;

type Population = Readonly<{ reads: RegExp; names: (body: string) => boolean }>;

/** Entries, completions and token splits; a split reader must name both the host and the exit. */
const leanPopulations: ReadonlyArray<Population> = [
  { reads: /\.(initiate|enterScope)\b/u, names: (body) => leanScopeHost.test(body) },
  { reads: /\.completeScope\b/u, names: (body) => leanScopeExit.test(body) },
  { reads: /\.(duplicate|selectMany)\b/u, names: (body) => leanScopeHost.test(body) && leanScopeExit.test(body) },
];

const typeScriptPopulations: ReadonlyArray<Population> = [
  { reads: /SemanticOperationKind\.(Initiate|EnterScope)\b/u, names: (body) => typeScriptScopeHost.test(body) },
  { reads: /SemanticOperationKind\.CompleteScope\b/u, names: (body) => typeScriptScopeExit.test(body) },
  {
    reads: /SemanticOperationKind\.(Duplicate|SelectMany)\b/u,
    names: (body) => typeScriptScopeHost.test(body) && typeScriptScopeExit.test(body),
  },
];

/** A settled read passes a scope host through unprojected, so its reader must name the host. */
const settledReads = /\bsettledOperations?\(/u;

function unnamed(declarations: ReadonlyArray<Declaration>, populations: ReadonlyArray<Population>): Declaration[] {
  return declarations.filter(({ body }) => populations.some(({ reads, names }) => reads.test(body) && !names(body)));
}

function leanPopulation(): Declaration[] {
  return unnamed(leanProductionDeclarations().filter(({ body }) => leanWildcard.test(body)), leanPopulations);
}

/**
 * An operation-kind comparison selects some kinds and skips the rest even beside an `assertNever` over another
 * discriminant, as `processStartMatchesProgram` filters operations while switching exhaustively on the stimulus.
 */
const kindComparison = /[!=]==\s*SemanticOperationKind\.\w+|SemanticOperationKind\.\w+\s*[!=]==/u;
const mayAbsorb = (declaration: Declaration): boolean => nonExhaustive(declaration) || kindComparison.test(declaration.body);

function typeScriptPopulation(): Declaration[] {
  const declarations = typeScriptProductionDeclarations();
  const settled = declarations.filter(({ body }) =>
    settledReads.test(body) && !/^export function settledOperations?\b/u.test(body) && !typeScriptScopeHost.test(body));
  return [...new Map([...unnamed(declarations.filter(mayAbsorb), typeScriptPopulations), ...settled]
    .map((declaration) => [key(declaration), declaration])).values()];
}

test("every Lean declaration that can absorb a scope host or exit through a wildcard names it or carries a reason", () => {
  const population = leanPopulation();
  assert.deepEqual(population.map(key).filter((entry) => !(entry in leanAllowlist)), []);
  assert.deepEqual(staleEntries(leanAllowlist, population), [], "stale Lean allowlist entries");
});

test("every non-exhaustive TypeScript reader of an entry, completion, split or settled operation names the host or carries a reason", () => {
  const population = typeScriptPopulation();
  assert.deepEqual(population.map(key).filter((entry) => !(entry in typeScriptAllowlist)), []);
  assert.deepEqual(staleEntries(typeScriptAllowlist, population), [], "stale TypeScript allowlist entries");
});

test("every multiplicity-keyed site names the scope host", () => {
  for (const site of multiplicitySites) {
    const declaration = siteDeclaration(site);
    assert.ok(declaration !== undefined, `absent ${key(site)}`);
    assert.ok(site.path.endsWith(".lean") ? leanScopeHost.test(declaration.body) : typeScriptScopeHost.test(declaration.body),
      `${key(site)} does not name the scope host`);
  }
});

test("the legacy initiation, scope entry and scope completion stay frozen until the switch", () => {
  const names = new Set(Object.keys(frozenLeanDeclarations).map((entry) => entry.replace(/^constructor /u, "")));
  assert.deepEqual(leanConstructorDigests((name) => names.has(name)), frozenLeanDeclarations);
});

test("rejects a wildcard declaration that omits the scope host", () => {
  const [declaration] = leanDeclarations("Probe.lean", "def probe : SemanticOperation → Bool\n  | .enterScope .. => true\n  | _ => false\n");
  assert.ok(declaration !== undefined && unnamed([declaration], leanPopulations).length === 1);
});

test("rejects a kind comparison that omits the scope host beside an exhaustive switch over another discriminant", () => {
  const [declaration] = typeScriptDeclarations("probe.ts", [
    "function probe(stimulus, program) {",
    "  const starts = program.operations.filter((operation) => operation.kind === SemanticOperationKind.Initiate);",
    "  switch (stimulus.kind) {",
    "    default:",
    "      return assertNever(stimulus);",
    "  }",
    "}",
  ].join("\n"));
  assert.ok(declaration !== undefined && mayAbsorb(declaration) &&
    unnamed([declaration], typeScriptPopulations).length === 1);
});
