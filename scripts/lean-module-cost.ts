/**
 * Recorded per-module cost of the Lean conformance corpus. The pure comparison
 * lives in [lean-module-cost-comparison.ts](./lean-module-cost-comparison.ts).
 *
 * Every conformance module kernel-decides fixtures, and kernel reduction holds
 * its terms in resident memory, so reduction depth and proof ownership carry a
 * host-memory cost. [`lean-module-cost.test.ts`](lean-module-cost.test.ts) is the
 * guard that enforces this record.
 *
 * Keep this module free of import-time side effects and of runtime imports that
 * need the workspace path mapping. The ratchet obtains its baseline by loading
 * this file's own previous committed revision from a temporary directory, so an
 * older revision must import safely and resolve outside the repository.
 */

import type { DeepReadonly } from "@bpmn-lean/contract-types";

/**
 * One measured module.
 *
 * `peakResidentKib` is GNU `time`'s `ru_maxrss` in KiB, exactly as measured.
 * `elapsedSeconds` is recorded as reading context only and is deliberately not
 * ratcheted: memory is the resource that terminates a build, and rebuild time
 * cannot manufacture the headroom that a raised memory figure would.
 */
export type LeanModuleCostRow = DeepReadonly<{
  module: string;
  peakResidentKib: number;
  elapsedSeconds: number;
  measuredAtCommit?: string;
}>;

export type LeanModuleCostProvenance = DeepReadonly<{
  measuredAtCommit: string;
  leanVersion: string;
  leanCommit: string;
  containerImage: string;
  containerImageId: string;
  leanNumThreads: string;
  cpuAllowance: string;
  memoryBoundBytes: number;
  swapPolicy: string;
  enforcementBackend: string;
  cacheState: string;
  accountingCaveat: string;
}>;

export type LeanModuleCostRecord = DeepReadonly<{
  provenance: LeanModuleCostProvenance;
  nearCapModules: readonly string[];
  rows: readonly LeanModuleCostRow[];
}>;

/** The subset of a record the ratchet compares against, and all it needs. */
export type LeanModuleCostBaseline = DeepReadonly<{
  measurements: readonly (readonly [string, number, string])[];
}>;

export type LeanModuleMeasurementSourceMismatch = DeepReadonly<{
  module: string;
  measuredAtCommit: string;
  reason: string;
}>;

export const leanModuleCostViolationKinds = {
  incompleteProvenance: "incomplete-provenance",
  duplicateRow: "duplicate-row",
  missingRow: "missing-row",
  unknownRow: "unknown-row",
  changedWithoutRemeasurement: "changed-without-remeasurement",
  measurementSourceMismatch: "measurement-source-mismatch",
  undisclosedNearCap: "undisclosed-near-cap",
  staleNearCapDisclosure: "stale-near-cap-disclosure",
} as const;

export type LeanModuleCostViolation = DeepReadonly<
  | { kind: "incomplete-provenance"; field: string; reason: string }
  | { kind: "duplicate-row"; module: string }
  | { kind: "missing-row"; module: string }
  | { kind: "unknown-row"; module: string }
  | {
      kind: "changed-without-remeasurement";
      module: string;
      baselineKib: number;
      recordedKib: number;
      measuredAtCommit: string;
    }
  | {
      kind: "measurement-source-mismatch";
      module: string;
      measuredAtCommit: string;
      reason: string;
    }
  | { kind: "undisclosed-near-cap"; module: string; recordedKib: number; thresholdKib: number }
  | { kind: "stale-near-cap-disclosure"; module: string; thresholdKib: number }
>;

/**
 * Fraction of the measured memory bound above which a module must be disclosed.
 *
 * GNU RSS and cgroup charging differ for the reason in `accountingCaveat`.
 * This disclosure and the RSS ratchet detect expensive modules; the separate
 * [cgroup acceptance rule](./lean-memory-acceptance.ts) checks the hard limit.
 */
export const nearCapFraction = 0.9;

export function nearCapThresholdKib(provenance: LeanModuleCostProvenance): number {
  return (provenance.memoryBoundBytes * nearCapFraction) / 1024;
}

export const leanModuleCostRecord = {
  provenance: {
    measuredAtCommit: "d878f38e",
    leanVersion: "4.31.0",
    leanCommit: "68218e876d2a38b1985b8590fff244a83c321783",
    containerImage: "bpmn-lean-audit:v4.31.0-arm64",
    containerImageId: "sha256:4df22c7a1ec8",
    leanNumThreads: "1",
    cpuAllowance: "--cpus=1",
    memoryBoundBytes: 3221225472,
    swapPolicy: "--memory-swap=3g, no additional swap",
    enforcementBackend: "Linux container on macOS (Docker Desktop VM)",
    cacheState:
      "warm dependency closure; only the measured target's own .olean/.ilean/hash/trace/C/setup artifacts removed",
    accountingCaveat:
      "GNU time's resident-set accounting in Docker Desktop's Linux VM does not align exactly with cgroup charging. Compare RSS within this measurement series; use the separately recorded cgroup peak and events for hard-limit acceptance.",
  },
  nearCapModules: [],
  rows: [
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", peakResidentKib: 1218364, elapsedSeconds: 8.45, measuredAtCommit: "4d4d8d76" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", peakResidentKib: 2156844, elapsedSeconds: 70.22, measuredAtCommit: "4d4d8d76" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", peakResidentKib: 1980156, elapsedSeconds: 80.59, measuredAtCommit: "10e774c5" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", peakResidentKib: 1368940, elapsedSeconds: 72.62, measuredAtCommit: "b589ab0a" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", peakResidentKib: 1049176, elapsedSeconds: 4.40, measuredAtCommit: "52a84367" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", peakResidentKib: 1726820, elapsedSeconds: 12.13, measuredAtCommit: "d7fcdcb0" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", peakResidentKib: 721184, elapsedSeconds: 1.78, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", peakResidentKib: 658084, elapsedSeconds: 2.23, measuredAtCommit: "bced19a5" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", peakResidentKib: 690964, elapsedSeconds: 1.61, measuredAtCommit: "a97a4ea1" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", peakResidentKib: 1570176, elapsedSeconds: 28.99, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", peakResidentKib: 1170672, elapsedSeconds: 8.31, measuredAtCommit: "10e774c5" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", peakResidentKib: 836304, elapsedSeconds: 3.43, measuredAtCommit: "565ff325" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", peakResidentKib: 1226740, elapsedSeconds: 5.85, measuredAtCommit: "a97a4ea1" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", peakResidentKib: 1344100, elapsedSeconds: 8.83, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", peakResidentKib: 607400, elapsedSeconds: 1.66, measuredAtCommit: "5fa6dfe3" },
    {
      module: "BpmnSemantics.MessageStartAdmissionConformance",
      peakResidentKib: 1810064,
      elapsedSeconds: 9.54,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessageStartClosureConformance",
      peakResidentKib: 1699144,
      elapsedSeconds: 6.92,
      measuredAtCommit: "e9c9db0f",
    },
    {
      module: "BpmnSemantics.MessageStartIdentityConformance",
      peakResidentKib: 1539460,
      elapsedSeconds: 7.8,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessageStartScenarioConformance",
      peakResidentKib: 1419604,
      elapsedSeconds: 6.56,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessageStartConformance",
      peakResidentKib: 618008,
      elapsedSeconds: 0.35,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessagePayloadCatchConformance",
      peakResidentKib: 1508268,
      elapsedSeconds: 25.93,
      measuredAtCommit: "5fa6dfe3",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceConformance",
      peakResidentKib: 619012,
      elapsedSeconds: 0.65,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceRuntimeConformance",
      peakResidentKib: 2509372,
      elapsedSeconds: 20.11,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceRefusalConformance",
      peakResidentKib: 1791356,
      elapsedSeconds: 10.21,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance",
      peakResidentKib: 833720,
      elapsedSeconds: 1.91,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance",
      peakResidentKib: 620612,
      elapsedSeconds: 0.66,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance",
      peakResidentKib: 639644,
      elapsedSeconds: 2.21,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance",
      peakResidentKib: 2172304,
      elapsedSeconds: 13.87,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance",
      peakResidentKib: 1699276,
      elapsedSeconds: 9.89,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance",
      peakResidentKib: 2333280,
      elapsedSeconds: 16.1,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance",
      peakResidentKib: 2086828,
      elapsedSeconds: 14.06,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance",
      peakResidentKib: 751784,
      elapsedSeconds: 1.07,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedConformance",
      peakResidentKib: 619360,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance",
      peakResidentKib: 1183920,
      elapsedSeconds: 20.24,
      measuredAtCommit: "5fa6dfe3",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance",
      peakResidentKib: 1390688,
      elapsedSeconds: 5.49,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance",
      peakResidentKib: 1832044,
      elapsedSeconds: 14.57,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.CallActivityConformance", peakResidentKib: 1362324, elapsedSeconds: 24.50, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.CallActivityPairingConformance", peakResidentKib: 1081832, elapsedSeconds: 3.54, measuredAtCommit: "b304150e" },
    {
      module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance",
      peakResidentKib: 1557692,
      elapsedSeconds: 27.41,
      measuredAtCommit: "93cfcbf9",
    },
    {
      module: "BpmnSemantics.TimerStartConformance",
      peakResidentKib: 1428084,
      elapsedSeconds: 21.83,
      measuredAtCommit: "93cfcbf9",
    },
    {
      module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance",
      peakResidentKib: 2825860,
      elapsedSeconds: 27.55,
      measuredAtCommit: "b9c1c586",
    },
    {
      module: "BpmnSemantics.RuntimeStateActivityConformance",
      peakResidentKib: 618664,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance",
      peakResidentKib: 1212052,
      elapsedSeconds: 14.63,
      measuredAtCommit: "0958697d",
    },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", peakResidentKib: 1013076, elapsedSeconds: 15.20, measuredAtCommit: "6d231a2b" },
    { module: "BpmnSemantics.ScopeCancellationConformance", peakResidentKib: 623244, elapsedSeconds: 0.88, measuredAtCommit: "0958697d" },
    { module: "BpmnSemantics.ScopeCompletionConformance", peakResidentKib: 587916, elapsedSeconds: 0.54, measuredAtCommit: "0958697d" },
    {
      module: "BpmnSemantics.RuntimeStateControllerConformance",
      peakResidentKib: 2089244,
      elapsedSeconds: 16,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance",
      peakResidentKib: 615444,
      elapsedSeconds: 1.41,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance",
      peakResidentKib: 1802080,
      elapsedSeconds: 11.73,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance",
      peakResidentKib: 2076884,
      elapsedSeconds: 13.87,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance",
      peakResidentKib: 2439560,
      elapsedSeconds: 24.56,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.SemanticProcessAdmissionConformance",
      peakResidentKib: 2713164,
      elapsedSeconds: 17.08,
      measuredAtCommit: "a52f0c39",
    },
    { module: "BpmnSemantics.EventBasedGatewayConformance", peakResidentKib: 2721196, elapsedSeconds: 17.19, measuredAtCommit: "e9c9db0f" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", peakResidentKib: 2494312, elapsedSeconds: 24.0 },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", peakResidentKib: 1354732, elapsedSeconds: 20.71, measuredAtCommit: "a97a4ea1" },
    {
      module: "BpmnSemantics.CommittedExecutionPublicationConformance",
      peakResidentKib: 1478996,
      elapsedSeconds: 17.13,
      measuredAtCommit: "cbb78a11",
    },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", peakResidentKib: 2225108, elapsedSeconds: 11.7 },
    {
      module: "BpmnSemantics.TerminateEndEventConformance",
      peakResidentKib: 1663504,
      elapsedSeconds: 31.22,
      measuredAtCommit: "93cfcbf9",
    },
    { module: "BpmnSemantics.SemanticProcessConformance", peakResidentKib: 2203824, elapsedSeconds: 8.9 },
    {
      module: "BpmnSemantics.ServiceTaskIncidentRetryConformance",
      peakResidentKib: 2432344,
      elapsedSeconds: 23.34,
      measuredAtCommit: "6208f2e4",
    },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", peakResidentKib: 2176108, elapsedSeconds: 13.9 },
    {
      module: "BpmnSemantics.ActivityDataInputConformance",
      peakResidentKib: 2696232,
      elapsedSeconds: 13.18,
      measuredAtCommit: "de03c7b1",
    },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", peakResidentKib: 2146500, elapsedSeconds: 13.5 },
    {
      module: "BpmnSemantics.MappedSuccessConformance",
      peakResidentKib: 2139596,
      elapsedSeconds: 13.73,
      measuredAtCommit: "b9c1c586",
    },
    { module: "BpmnSemantics.InclusiveGatewayConformance", peakResidentKib: 1435552, elapsedSeconds: 27.63, measuredAtCommit: "565ff325" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", peakResidentKib: 1981884, elapsedSeconds: 24.5 },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance",
      peakResidentKib: 1072920,
      elapsedSeconds: 10.15,
      measuredAtCommit: "f7d96deb",
    },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", peakResidentKib: 1926344, elapsedSeconds: 11.0 },
    {
      module: "BpmnSemantics.InternalCommutationConformance",
      peakResidentKib: 1271768,
      elapsedSeconds: 9.16,
      measuredAtCommit: "93cfcbf9",
    },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", peakResidentKib: 1261436, elapsedSeconds: 14.90, measuredAtCommit: "cbb78a11" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", peakResidentKib: 2447360, elapsedSeconds: 18.21, measuredAtCommit: "5fa6dfe3" },
    { module: "BpmnSemantics.CompensationSourceJsonConformance", peakResidentKib: 2326880, elapsedSeconds: 12.15, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceCompatibilityConformance", peakResidentKib: 2023220, elapsedSeconds: 14.78, measuredAtCommit: "05244cf7" },
    { module: "BpmnSemantics.CompensationSourceBindingReferenceConformance", peakResidentKib: 2725808, elapsedSeconds: 31.89, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingTriggerConformance", peakResidentKib: 2379680, elapsedSeconds: 20.36, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingStorageLimitConformance", peakResidentKib: 2701156, elapsedSeconds: 33.68, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingExecutionLimitConformance", peakResidentKib: 2574272, elapsedSeconds: 25.21, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingValidProgramConformance", peakResidentKib: 1833660, elapsedSeconds: 11.43, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingConformance", peakResidentKib: 635228, elapsedSeconds: 0.5, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceLoweringConformance", peakResidentKib: 635272, elapsedSeconds: 0.59, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance", peakResidentKib: 821532, elapsedSeconds: 5.14, measuredAtCommit: "7b0b5151" },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerProgramContractConformance",
      peakResidentKib: 889480,
      elapsedSeconds: 2.60,
      measuredAtCommit: "4b2a304f",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance",
      peakResidentKib: 705308,
      elapsedSeconds: 0.68,
      measuredAtCommit: "ef739572",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerRuntimeConformance",
      peakResidentKib: 1292220,
      elapsedSeconds: 4.78,
      measuredAtCommit: "eed22392",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance",
      peakResidentKib: 1892392,
      elapsedSeconds: 11.19,
      measuredAtCommit: "7126d5db",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance",
      peakResidentKib: 1485228,
      elapsedSeconds: 25.83,
      measuredAtCommit: "5fa6dfe3",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance",
      peakResidentKib: 614680,
      elapsedSeconds: 0.58,
      measuredAtCommit: "3020899b",
    },
    {
      module: "BpmnSemantics.CompensationActivityRetentionProducerConformance",
      peakResidentKib: 2332716,
      elapsedSeconds: 8.4,
      measuredAtCommit: "cb7fd54e",
    },
    {
      module: "BpmnSemantics.CompensationActivityRetentionConformance",
      peakResidentKib: 1916172,
      elapsedSeconds: 6.68,
      measuredAtCommit: "ef739572",
    },
    {
      module: "BpmnSemantics.UserTaskMetadataConformance",
      peakResidentKib: 1645712,
      elapsedSeconds: 11.28,
      measuredAtCommit: "4df4d9f2",
    },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", peakResidentKib: 967732, elapsedSeconds: 3.88, measuredAtCommit: "c6aeb583" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", peakResidentKib: 731312, elapsedSeconds: 2.41, measuredAtCommit: "8d3927f6" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", peakResidentKib: 974464, elapsedSeconds: 2.22, measuredAtCommit: "ee17ed58" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", peakResidentKib: 1288416, elapsedSeconds: 9.54, measuredAtCommit: "ee17ed58" },
    {
      module: "BpmnSemantics.ActivityDataOutputConformance",
      peakResidentKib: 2335952,
      elapsedSeconds: 12.94,
      measuredAtCommit: "de03c7b1",
    },
    { module: "BpmnSemantics.ReceiveTaskConformance", peakResidentKib: 1679876, elapsedSeconds: 19.3 },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", peakResidentKib: 1676016, elapsedSeconds: 10.7 },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance",
      peakResidentKib: 1464728,
      elapsedSeconds: 6.92,
      measuredAtCommit: "1fda9213",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotConformance",
      peakResidentKib: 2825652,
      elapsedSeconds: 13.24,
      measuredAtCommit: "7b70b7cc",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance",
      peakResidentKib: 1933028,
      elapsedSeconds: 15.25,
      measuredAtCommit: "5fa6dfe3",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance",
      peakResidentKib: 1515000,
      elapsedSeconds: 26.49,
      measuredAtCommit: "a97a4ea1",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorProgramConformance",
      peakResidentKib: 1755796,
      elapsedSeconds: 6.54,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorReadyStateConformance",
      peakResidentKib: 1898152,
      elapsedSeconds: 5.99,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorOutcomeConformance",
      peakResidentKib: 2545104,
      elapsedSeconds: 9.94,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorPurgeConformance",
      peakResidentKib: 2546956,
      elapsedSeconds: 11.64,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorRecoveryConformance",
      peakResidentKib: 2545196,
      elapsedSeconds: 10.55,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance",
      peakResidentKib: 1977500,
      elapsedSeconds: 6.55,
      measuredAtCommit: "ef739572",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance",
      peakResidentKib: 642024,
      elapsedSeconds: 0.67,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance",
      peakResidentKib: 622884,
      elapsedSeconds: 0.47,
      measuredAtCommit: "bd2bef03",
    },
    { module: "BpmnSemantics.UserTaskInteractionConformance", peakResidentKib: 1516764, elapsedSeconds: 7.14, measuredAtCommit: "eed22392" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", peakResidentKib: 1661596, elapsedSeconds: 9.48, measuredAtCommit: "24d92a7c" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", peakResidentKib: 1463248, elapsedSeconds: 7.2 },
    { module: "BpmnSemantics.BooleanProcessDataConformance", peakResidentKib: 1405164, elapsedSeconds: 3.8 },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", peakResidentKib: 1382440, elapsedSeconds: 3.8 },
    {
      module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance",
      peakResidentKib: 1617012,
      elapsedSeconds: 16.83,
      measuredAtCommit: "519c7c5e",
    },
    {
      module: "BpmnSemantics.ActivityBoundaryMessageConformance",
      peakResidentKib: 2807968,
      elapsedSeconds: 23.32,
      measuredAtCommit: "81c0703c",
    },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", peakResidentKib: 1349428, elapsedSeconds: 5.6 },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", peakResidentKib: 1296244, elapsedSeconds: 5.3 },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", peakResidentKib: 1201352, elapsedSeconds: 2.9 },
    {
      module: "BpmnSemantics.StructuredHumanWorkConformance",
      peakResidentKib: 1054660,
      elapsedSeconds: 3.46,
      measuredAtCommit: "826231ab",
    },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", peakResidentKib: 934608, elapsedSeconds: 2.0 },
    { module: "BpmnSemantics.ProcessStartDataConformance", peakResidentKib: 892876, elapsedSeconds: 4.1 },
    {
      module: "BpmnSemantics.ParallelMultiInstanceConformance",
      peakResidentKib: 1433212,
      elapsedSeconds: 3.32,
      measuredAtCommit: "42f152de",
    },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", peakResidentKib: 839556, elapsedSeconds: 3.9 },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance",
      peakResidentKib: 734464,
      elapsedSeconds: 3.98,
      measuredAtCommit: "f7d96deb",
    },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance",
      peakResidentKib: 825916,
      elapsedSeconds: 3.44,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance",
      peakResidentKib: 695004,
      elapsedSeconds: 3.07,
      measuredAtCommit: "f7d96deb",
    },
    {
      module: "BpmnSemantics.SemanticProcessJsonConformance",
      peakResidentKib: 694632,
      elapsedSeconds: 1.38,
      measuredAtCommit: "741d7f6d",
    },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", peakResidentKib: 646452, elapsedSeconds: 0.7 },
    {
      module: "BpmnSemantics.ActivityIssuingDisciplineConformance",
      peakResidentKib: 626648,
      elapsedSeconds: 1.24,
      measuredAtCommit: "c5bad315",
    },
    { module: "BpmnSemantics.Conformance", peakResidentKib: 508576, elapsedSeconds: 0.3 },
    { module: "BpmnSemantics.ParallelForkJoinConformance", peakResidentKib: 500536, elapsedSeconds: 0.3 },
  ],
} as const satisfies LeanModuleCostRecord;

export function measurementCommitFor(
  record: LeanModuleCostRecord,
  row: LeanModuleCostRow,
): string {
  return row.measuredAtCommit ?? record.provenance.measuredAtCommit;
}

export function leanModuleCostBaseline(record: LeanModuleCostRecord): LeanModuleCostBaseline {
  return {
    measurements: record.rows.map(
      (row) =>
        [row.module, row.peakResidentKib, measurementCommitFor(record, row)] as const,
    ),
  };
}

export function derivedNearCapModules(record: LeanModuleCostRecord): string[] {
  const thresholdKib = nearCapThresholdKib(record.provenance);
  return record.rows
    .filter((row) => row.peakResidentKib >= thresholdKib)
    .map((row) => row.module)
    .sort();
}
