import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/*
 * The host-coverage census of the Activity host specification
 * (docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#new-guard-the-host-coverage-census).
 *
 * Compilation cannot see a wildcard arm or a non-exhaustive `kind` comparison that silently absorbs the appended
 * `activity` operation, so every declaration that decides something about User Task or effect operations without an
 * exhaustive match must name the host, read it through its accessors, or carry a reviewed reason below.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

type Declaration = Readonly<{ path: string; name: string; body: string }>;

/** Lean `def`s that name a legacy User Task or effect operation beside a wildcard arm, with the reason each may omit the host. */
const leanAllowlist: Readonly<Record<string, string>> = {
  "BpmnSemantics/ParallelScopeReservationMain.lean::integrityJson":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/ParallelScopeReservationMain.lean::retirementFrontierJson":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/ActivityHostWork.lean::ActivityHost.projection?":
    "the accessor leaf; its wildcard is a host without exactly one output, which the host Program rules refuse",
  "BpmnSemantics/SemanticProcess/CompensationActivityRetentionDeclaration.lean::compensationActivityElementAndFamily?":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/ContinuationMarking.lean::bodyConsumedPorts":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/ContinuationMarking.lean::bodyProducedPorts":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/EffectCompletion.lean::serialRuntimeAssociationsValid":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/EffectDataAdmission.lean::operationVertex?":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/EffectDataAdmission.lean::programAnalysis":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/EffectDataCommandAdmission.lean::runtimeAssociationsValid":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/InclusiveRegionAdmission.lean::programGraph":
    "a merging Task belongs to the re-entry account, which no Inclusive region shares; the wildcard reads a host as another vertex",
  "BpmnSemantics/SemanticProcess/InclusiveRegionAdmission.lean::programInputs":
    "a merging Task belongs to the re-entry account, which no Inclusive region shares; the wildcard reads a host as another vertex",
  "BpmnSemantics/SemanticProcess/InclusiveRegionAdmission.lean::programVertexKind":
    "a merging Task belongs to the re-entry account, which no Inclusive region shares; the wildcard reads a host as another vertex",
  "BpmnSemantics/SemanticProcess/InternalCommutationCore.lean::footprintOfPatch":
    "a host has no arming input (`internalArmInput?`), so it never reaches an arming patch (ACTH-HOST-01)",
  "BpmnSemantics/SemanticProcess/InternalCommutationCore.lean::internalArmOrigin?":
    "a host has no arming input (`internalArmInput?`), so it never reaches an arming patch (ACTH-HOST-01)",
  "BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean::applyInternalOperationOccurrence?":
    "a host is never applied by owning occurrence (ACTH-HOST-01); the wildcard refuses it",
  "BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean::internalOperationOccurrenceOffers?":
    "a host is never applied by owning occurrence (ACTH-HOST-01); the wildcard refuses it",
  "BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean::occurrenceCounterBase?":
    "a host is never applied by owning occurrence (ACTH-HOST-01); the wildcard refuses it",
  "BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean::prepareReservedOccurrenceArm?":
    "a host is never applied by owning occurrence (ACTH-HOST-01); the wildcard refuses it",
  "BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean::reserveOccurrenceMembers?":
    "a host is never applied by owning occurrence (ACTH-HOST-01); the wildcard refuses it",
  "BpmnSemantics/SemanticProcess/InterruptingMessageEventSubProcessProgramAdmission.lean::flowNodeOrigins":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/InterruptingMessageEventSubProcessProgramAdmission.lean::taskPorts":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/Lowering.lean::lowerNode":
    "emits a host only through the host lowering leaf, for a merging Task; every other Task keeps its legacy operation (ACTH-ONE-01)",
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean::operationInputs":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean::operationOrigin?":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean::operationOutputs":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean::operationVertex?":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean::programRoutes":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/MixedTaskControlFlowDataProofs.lean::OperationAllowed":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::operationInputs":
    "a Program holding a host routes to the re-entry account and the concurrent account refuses it, so this reader never sees a host (ACTH-ADMIT-01)",
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::operationVertex?":
    "a Program holding a host routes to the re-entry account and the concurrent account refuses it, so this reader never sees a host (ACTH-ADMIT-01)",
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::programBodies":
    "a Program holding a host routes to the re-entry account and the concurrent account refuses it, so this reader never sees a host (ACTH-ADMIT-01)",
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::programData":
    "a Program holding a host routes to the re-entry account and the concurrent account refuses it, so this reader never sees a host (ACTH-ADMIT-01)",
  "BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean::programModel":
    "a Program holding a host routes to the re-entry account and the concurrent account refuses it, so this reader never sees a host (ACTH-ADMIT-01)",
  "BpmnSemantics/SemanticProcess/ParallelScopeData.lean::evaluateParallelScopeInputs?":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/ParallelScopeData.lean::writeParallelScopeValues?":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/ParallelScopeProgramCapacity.lean::analyzeProgram":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/ParallelScopeProgramCapacityProofs.lean::ParentSpineStep":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/ParallelScopeReservedAnchorProofs.lean::ReservedArmDeclared":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/ParallelScopeReservedArmingReplay.lean::ReservedArmWriteShape":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean::operationPayloadCapabilitiesValid":
    "exact catalog shapes count a host apart and admit none (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean::programActivityBoundaryMessageTopologyValid":
    "exact catalog shapes count a host apart and admit none (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean::programParallelTopologyValid":
    "exact catalog shapes count a host apart and admit none (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean::programUserTaskMetadataValid":
    "exact catalog shapes count a host apart and admit none (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::programInput":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::programProduced":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::programVertex?":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/RepeatableSubscriptionAdmission.lean::repeatableSubscriptionOperationAllowed":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/ScopeDataBearing.lean::mapsEffectData":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/SequentialScopeControlAdmission.lean::bodyVertex?":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/SequentialScopeControlAdmission.lean::parentPath":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/SequentialScopeDataAdmission.lean::requirementsFor":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/SequentialScopeExecutionCertificate.lean::sequentialScopeTaskWaitingCount":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/SequentialScopeProgramAdmission.lean::admitted":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/SequentialScopeProgramAdmission.lean::operationAllowed":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/SequentialScopeProgramAdmission.lean::sourceNode?":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/SequentialScopeRuntime.lean::sequentialScopeHandlerNames":
    "Multi-Instance bodies and their accounts never hold a host (ACTH-ADMIT-01 body refusal)",
  "BpmnSemantics/SemanticProcess/SerialBusinessTaskAdmission.lean::operationInputs":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/SerialBusinessTaskAdmission.lean::operationVertex?":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/SerialBusinessTaskAdmission.lean::programAnalysis":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/SerialBusinessTaskAdmission.lean::programHandlers":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/SerialBusinessTaskDataProofs.lean::OperationAllowed":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/StructuredCompositionAdmission.lean::operationInputs":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/StructuredCompositionAdmission.lean::operationVertex?":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/StructuredCompositionAdmission.lean::programIdentitiesValid":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/StructuredCompositionAdmissionProofs.lean::OperationAllowed":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/StructuredCompositionCommandAdmission.lean::structuredCompositionOrdinaryCompletionAdmitted":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/StructuredCompositionDataProofs.lean::WaitMatchesOperation":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/StructuredCompositionLifecycleProofs.lean::TaskLifetimeShape":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/StructuredHumanWorkAdmission.lean::programStructuredHumanWorkTopology":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/TransactionInitialValidity.lean::continuationOperationFamily":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/TransactionPhaseInduction.lean::continuationOperationFamily":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/TransactionScopePhases.lean::transactionBranchScopeFamily":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/TransactionSourceAdmission.lean::canonicalOperation":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/TransactionSourceAdmission.lean::input?":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/TransactionSourceAdmission.lean::programChain":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/TransactionSourceAdmission.lean::taskElementIds":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "BpmnSemantics/SemanticProcess/TransactionSourceAdmission.lean::transactionCancellationProgramGraph":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
};

/** TypeScript functions that compare or case on a legacy User Task or effect kind non-exhaustively, with the reason each may omit the host. */
const typeScriptAllowlist: Readonly<Record<string, string>> = {
  "packages/bpmn-source/src/configured-task-lowering.ts::lowerConfiguredTask":
    "a configured Task (`CheckedNodeKind.ConfiguredTask`) is never a merging Task, so it keeps its legacy effect wait (ACTH-ADMIT-01)",
  "packages/bpmn-source/src/semantic-process-lowering.ts::lowerNode":
    "emits a host only through the host lowering leaf, for a merging Task; every other Task keeps its legacy operation (ACTH-ONE-01)",
  "packages/bpmn-source/src/user-task-metadata-source.ts::userTaskMetadataBindingValid":
    "source metadata binding precedes lowering and never sees an operation",
  "packages/semantic-core/src/compensation-activity-retention-state-validation.ts::targetOperationMatches":
    "compensation retention exists only under compensation profiles; profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/compensation-activity-retention.ts::factsMatchTargetOperation":
    "compensation retention exists only under compensation profiles; profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/compensation-trigger-handler-program-admission.ts::compensationExecutionMatchesProgram":
    "compensation execution exists only under compensation profiles; profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/flow-node-occurrence-interrupting-message-event-subprocess-completeness.ts::expectedEventSubProcessMessageLifecycle":
    "interrupting Event Sub-Processes exist only under their profile; profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/internal-occurrence-batch.ts::prepareInternalOccurrenceBatch":
    "a host is never batched (ACTH-HOST-01); the default refuses it",
  "packages/semantic-core/src/internal-occurrence-batch.ts::applyInternalOccurrenceBatch":
    "a host is never batched (ACTH-HOST-01); the default refuses it",
  "packages/semantic-core/src/internal-operation-occurrence.ts::applyInternalOperationOccurrence":
    "a host is never applied by owning occurrence (ACTH-HOST-01); the default refuses it",
  "packages/semantic-core/src/internal-operation-occurrence.ts::deriveInternalOccurrenceFrontier":
    "a host is never applied by owning occurrence (ACTH-HOST-01); the default refuses it",
  "packages/semantic-core/src/internal-transition-arming-batch.ts::deriveInternalArmingPreparation":
    "a host has no prepared arm (ACTH-HOST-01); the default refuses it",
  "packages/semantic-core/src/internal-transition-footprint.ts::waitFootprint":
    "reached only from the exhaustive footprint switch, whose host arm returns no footprint",
  "packages/semantic-core/src/internal-transition-ordinary-arming-preparation.ts::ordinaryArmingOperation":
    "a host belongs to the composite family, never to ordinary arming (ACTH-HOST-01)",
  "packages/semantic-core/src/interrupting-message-event-subprocess-program-admission.ts::interruptingMessageEventSubProcessProgramGraph":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/mixed-task-control-flow-admission.ts::mixedTaskControlProgramShape":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/mixed-task-control-flow-admission.ts::programAnalysis":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/mixed-task-control-flow-admission.ts::mixedTaskControlStimulusDataAdmitted":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/multi-instance-scope-write.ts::writeBoundMultiInstanceScopeValues":
    "Multi-Instance bodies never hold a host (ACTH-ADMIT-01 body refusal)",
  "packages/semantic-core/src/parallel-scope-data.ts::evaluateParallelScopeInputs":
    "Multi-Instance bodies never hold a host (ACTH-ADMIT-01 body refusal)",
  "packages/semantic-core/src/repeatable-subscription-admission.ts::repeatableSubscriptionProgramShape":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/repeatable-subscription-admission.ts::repeatableSubscriptionProgramGraph":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/scope-data-bearing.ts::embeddedScopeDataBearing":
    "reads only the embedded completion profile; profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/semantic-process-graph-admission.ts::hasSelectedParallelTopology":
    "an exact parallel topology of another profile; profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/semantic-process-profile.ts::hasExactActivityBoundaryMessageProgram":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/semantic-process-profile.ts::hasExactStructuredHumanWorkProgram":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/semantic-process-wait-runtime.ts::createUserTaskWait":
    "called with a host's projection, never with the host itself",
  "packages/semantic-core/src/semantic-process-wait-runtime.ts::createEffectWait":
    "called with a host's projection, never with the host itself",
  "packages/semantic-core/src/semantic-program-profile-shape.ts::requiredProgramShape":
    "exact kind multisets of other profiles, none listing a host; profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/sequential-scope-data.ts::handlerNames":
    "Multi-Instance bodies never hold a host (ACTH-ADMIT-01 body refusal)",
  "packages/semantic-core/src/serial-business-task-admission.ts::serialBusinessProgramShape":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/serial-business-task-admission.ts::programAnalysis":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/serial-business-task-admission.ts::serialBusinessStimulusDataAdmitted":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/structured-process-composition-admission.ts::structuredCompositionProgramShape":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/structured-process-composition-admission.ts::programVertices":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/semantic-core/src/structured-process-composition-admission.ts::structuredCompositionStimulusDataAdmitted":
    "profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/temporal-adapter/protocol/src/sequential-scope-publication-validation.ts::isSequentialScopeProgress":
    "sequential Multi-Instance publications only; profile shape admits no host outside the nested scope-data profile (ACTH-PROFILE-01)",
  "packages/temporal-adapter/protocol/src/workflow-chain.ts::workflowChainPendingActivityLimit":
    "the host's profile takes the production or concurrent limit without counting effects",
  "packages/temporal-adapter/testkit/src/call-activity-mutation-workflows.ts::requireCallerTask":
    "testkit mutation of Call fixtures, which hold no host",
};

/** Declarations keyed on input multiplicity, which never name the legacy kinds and must name the host explicitly. */
const multiplicitySites: ReadonlyArray<Readonly<{ path: string; name: string }>> = [
  { path: "BpmnSemantics/SemanticProcess/InternalCommutationCore.lean", name: "internalArmInput?" },
  { path: "BpmnSemantics/SemanticProcess/InternalCommutationCore.lean", name: "prepareInternalArm?" },
  { path: "BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean", name: "semanticOperationInternalFamily" },
  { path: "packages/semantic-core/src/internal-commutation-census.ts", name: "semanticOperationInternalFamily" },
];

/**
 * The legacy declarations the host shares or mirrors, frozen until every User, Service and Send Task lowers onto the
 * host (the proposal's retirement rule). A behaviour-preserving edit re-baselines a digest only as a reviewed Rule 2
 * bound change.
 */
const frozenLeanDeclarations: Readonly<Record<string, string>> = {
  "constructor awaitUserTask":
    "7612f7247885498ea9cb9e62ae4a8f54bbfd54596e174a9b87d163283a1c69e4",
  "constructor awaitDataInputUserTask":
    "6793a364dd8e3fd5d4d12cbbd69db9f3573170313e53c799a9839c8f79352dfb",
  "constructor awaitDataInputOutputUserTask":
    "d2bb7ac17e1ffb024686c214018f54bd090ba04660f4fddc79fc9ac47ba1a066",
  "constructor awaitDataOutputUserTask":
    "08cbe66fcb45e49e6c6158c97ecc8413ab4824acb7ddffd72216cc281b345c8d",
  "constructor awaitSequentialMultiInstanceUserTask":
    "c8d1b7248dbfe840aa809365bd02ec46ed5f594ad3547e282dce08a725382196",
  "constructor awaitParallelMultiInstanceUserTask":
    "13ac41bbf666f14141c660463eef606c71469d0b4242c1f13ce6cb83c5d53286",
  "constructor awaitBoundedUserTask":
    "cbb2141b2808de94453fd72c97c620d71cb0d165e05a0329cb40043d08b23edd",
  "constructor awaitMessageBoundedUserTask":
    "9eeb8a9e6655b9d07c62eaea54beca7e55bf9b39a930e80ebea127dafea156cf",
  "constructor awaitMessageMonitoredUserTask":
    "c4ee6970dff6976d0238d9c46d17d5c01eb0ce1ecbe2825637e8e8ad1198a897",
  "constructor awaitMonitoredUserTask":
    "a0cde0ae79a29c7cf8c1822aeca38bc8730cd224e361a40ecc9b91861a1f002b",
  "constructor completeParallelMultiInstanceUserTask":
    "3bb6b13f22ae141287e5a7bd83d73f2289fe3d46e597fa7bc4a2a64ba128dae1",
  "constructor awaitEffect":
    "5cfa154fa02f7697f8f2b3ad798d7b418570776e279603e7a1d4abc3bbdfca81",
  "structure UserTaskDefinition":
    "6252c38825a3a44c6fe497fc80eb0ae2176a4d397d499881cc5208e894b8d2b0",
  "structure EffectDefinition":
    "ee8363ad4b6fda876d1fe2640f6f049b0f17240ab57fecc7ad7a81253d06daef",
};

const legacyLean = /\.(awaitUserTask|awaitEffect)\b/u;
const leanWildcard = /\|\s*_\s*(=>|,)|\|\s*_\s*$/mu;
const leanHost = /\.activity\b/u;
const legacyTypeScript = /SemanticOperationKind\.(AwaitUserTask|AwaitEffect)\b/u;
const typeScriptHost =
  /SemanticOperationKind\.Activity\b|ActivityWorkKind\.|\b(settledOperations?|activityHostProjection|activityHostSettledProjection|publishedOperationKind)\(/u;

function read(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function trackedFiles(...roots: string[]): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...roots], {
    cwd: projectRoot,
    encoding: "utf8",
  }).split("\n").filter((file) => file.length > 0).sort();
}

/** Column-zero declarations; a Lean body runs to the next column-zero line that is not a continuation. */
function leanDeclarations(file: string, source: string): Declaration[] {
  const start = /^(?:@\[[^\]]*\]\s*)?(?:(?:private|protected|noncomputable|partial|public)\s+)*(def|theorem|abbrev|instance)\s+([^\s(:]+)/u;
  const declarations: Array<{ path: string; name: string; kind: string; lines: string[] }> = [];
  let current: (typeof declarations)[number] | null = null;
  for (const line of source.split("\n")) {
    const match = line.match(start);
    if (match !== null) {
      current = { path: file, name: match[2] ?? "", kind: match[1] ?? "", lines: [] };
      declarations.push(current);
    } else if (line.length > 0 && !/^\s/u.test(line) && !line.startsWith("--")) {
      current = null;
    }
    current?.lines.push(line);
  }
  return declarations.filter(({ kind }) => kind !== "theorem")
    .map(({ path: declarationPath, name, lines }) => ({ path: declarationPath, name, body: lines.join("\n") }));
}

/** Column-zero functions; a body runs to its column-zero closing brace. */
function typeScriptDeclarations(file: string, source: string): Declaration[] {
  const start = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/u;
  const declarations: Array<{ path: string; name: string; lines: string[] }> = [];
  let current: (typeof declarations)[number] | null = null;
  for (const line of source.split("\n")) {
    const match = line.match(start);
    if (match !== null) {
      current = { path: file, name: match[1] ?? "", lines: [] };
      declarations.push(current);
    }
    current?.lines.push(line);
    if (current !== null && line.startsWith("}")) current = null;
  }
  return declarations.map(({ path: declarationPath, name, lines }) => ({ path: declarationPath, name, body: lines.join("\n") }));
}

function leanPopulation(): Declaration[] {
  return trackedFiles("BpmnSemantics")
    .filter((file) => file.endsWith(".lean") && !file.includes("/Experiments/") &&
      !/Conformance|Fixtures/u.test(path.basename(file)))
    .flatMap((file) => leanDeclarations(file, read(file)))
    .filter(({ body }) => legacyLean.test(body) && leanWildcard.test(body));
}

function typeScriptPopulation(): Declaration[] {
  return trackedFiles("packages", "platform/contracts/src")
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts") && !file.includes("/test/") &&
      !file.includes("/dist/"))
    .flatMap((file) => typeScriptDeclarations(file, read(file)))
    .filter(({ body }) => legacyTypeScript.test(body) && !/assertNever\w*\(/u.test(body));
}

const key = ({ path: declarationPath, name }: Readonly<{ path: string; name: string }>): string =>
  `${declarationPath}::${name}`;

function leanFrozenDigests(): Record<string, string> {
  const source = read("BpmnSemantics/SemanticProcessContract.lean");
  const digests: Record<string, string> = {};
  const start = source.indexOf("inductive SemanticOperation where");
  const constructorBlock = source.slice(start, source.indexOf("\n\n", start));
  // Keyed by what a constructor carries, not by a name list, so a new User Task or effect constructor (a bounded
  // effect, say) fails here instead of growing the legacy representation beside the host.
  for (const match of constructorBlock.matchAll(/^  \| (\w+)\b[^\n]*(?:\n {6,}[^\n]*)*/gmu)) {
    if (/UserTask|Effect/u.test(match[0])) {
      digests[`constructor ${match[1]}`] = createHash("sha256").update(match[0]).digest("hex");
    }
  }
  for (const name of ["UserTaskDefinition", "EffectDefinition"]) {
    const match = source.match(new RegExp(`^structure ${name} where\\n(?: {2,}[^\\n]*\\n)*`, "mu"));
    assert.ok(match !== null, `absent structure ${name}`);
    digests[`structure ${name}`] = createHash("sha256").update(match[0]).digest("hex");
  }
  return digests;
}

test("every Lean declaration that can absorb the host through a wildcard names it or carries a reason", () => {
  const population = leanPopulation();
  const missing = population.filter((declaration) => !leanHost.test(declaration.body) && !(key(declaration) in leanAllowlist));
  assert.deepEqual(missing.map(key), []);
  const live = new Set(population.map(key));
  assert.deepEqual(Object.keys(leanAllowlist).filter((entry) => !live.has(entry)), [], "stale Lean allowlist entries");
});

test("every non-exhaustive TypeScript reader of the legacy kinds names the host or carries a reason", () => {
  const population = typeScriptPopulation();
  const missing = population.filter((declaration) =>
    !typeScriptHost.test(declaration.body) && !(key(declaration) in typeScriptAllowlist));
  assert.deepEqual(missing.map(key), []);
  const live = new Set(population.map(key));
  assert.deepEqual(Object.keys(typeScriptAllowlist).filter((entry) => !live.has(entry)), [], "stale TypeScript allowlist entries");
});

test("every multiplicity-keyed site names the host", () => {
  for (const site of multiplicitySites) {
    const source = read(site.path);
    const declarations = site.path.endsWith(".lean") ? leanDeclarations(site.path, source) : typeScriptDeclarations(site.path, source);
    const declaration = declarations.find(({ name }) => name === site.name || name.endsWith(`.${site.name}`));
    assert.ok(declaration !== undefined, `absent ${key(site)}`);
    assert.ok(site.path.endsWith(".lean") ? leanHost.test(declaration.body) : typeScriptHost.test(declaration.body),
      `${key(site)} does not name the host`);
  }
});

test("the legacy User Task and effect declarations stay frozen until the switch", () => {
  assert.deepEqual(leanFrozenDigests(), frozenLeanDeclarations);
});

test("rejects a wildcard declaration that omits the host", () => {
  const [declaration] = leanDeclarations("Probe.lean", "def probe : SemanticOperation → Bool\n  | .awaitUserTask .. => true\n  | _ => false\n");
  assert.ok(declaration !== undefined && legacyLean.test(declaration.body) && leanWildcard.test(declaration.body) &&
    !leanHost.test(declaration.body));
});
