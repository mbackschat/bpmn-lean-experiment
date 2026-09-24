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
 * `sourceSha256` binds the exact mounted source bytes. New measurements identify
 * their completed command receipt separately from historical Git provenance;
 * [the commit protocol](../docs/TESTING-SPEC.md#commit-boundaries) defines capture.
 */
export type LeanModuleCostRow = DeepReadonly<{
  module: string;
  peakResidentKib: number;
  elapsedSeconds: number;
  sourceSha256: string;
  measurementReceiptSha256?: string;
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
  measurements: readonly (readonly [string, number, string, string?])[];
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
      sourceChanged?: boolean;
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
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", sourceSha256: "3727df0055f011a560cfd0c6119f6483436224dced977313e8527befc8651712", peakResidentKib: 587232, elapsedSeconds: 0.43, measurementReceiptSha256: "9d5978226b1cbbaaa07fd0a91062e944f758af7cea8a2d977fbc1a5e6f90fcdc" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", sourceSha256: "b592ff68e0acb46172f6660c9089380572197c6e5b1bebf922946542d5046d1b", peakResidentKib: 1327064, elapsedSeconds: 9.83, measurementReceiptSha256: "c690a6376673270bb77686b991b6e9de606d7ee1b9eede2edc2978b488f1453e" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", sourceSha256: "7b6b9523101343486f2031f1babbab179e12d9f76a5665ee90be9d04bd3047a7", peakResidentKib: 1229212, elapsedSeconds: 5.14, measurementReceiptSha256: "a9f0d1213c3f8870f7d3926a6759fcc7627fb2f7266e51dde8fbb9ff88c9817e" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", sourceSha256: "9545387627f567823ddf1cf0e1f6bb2ebb28d4703f3100f41a15d5b5cd9e7432", peakResidentKib: 1377844, elapsedSeconds: 9.57, measurementReceiptSha256: "b70eb630bd6a9fb0e1fbdf1f2c61b9a6f3e5d739cac6b3a6d09eea8293c078d8" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", sourceSha256: "10fdb5c521c2123e35886dd2c4711daed33fc5dbe64569f69da4262b67504794", peakResidentKib: 2554572, elapsedSeconds: 27.27, measurementReceiptSha256: "51410ee8198b7ff801855bb3aa3d7370608f7ccc1daccef1263634b910e0702c" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", sourceSha256: "4633f562d0c4a363eafebf2baaa6fd97d0be357a2b9be01a2a16538b9a7cbd21", peakResidentKib: 1991084, elapsedSeconds: 30.97, measurementReceiptSha256: "be4c7572447d53d3ee859c5f4abadb6a69afb9b78a64a1f7d31270bac1e7e0b7" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", sourceSha256: "fcfd3811c2f55cec85d6d5c8aa976eb05213ad9662df3d6e8544abf91d941d04", peakResidentKib: 2007128, elapsedSeconds: 44.45, measurementReceiptSha256: "5a6b41fda44e868ad4671fa2b28038f613c3bd4ba0e16f94c56395af356c855c" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", sourceSha256: "ea6e88079f52f88f539f2d4bcaea55a96ef15a0605478a37d9b4102b856ac288", peakResidentKib: 2735872, elapsedSeconds: 16.97, measurementReceiptSha256: "afd4d278ded008fec16dfd27c722215b1f41cd17b333d816bcb8549779bfb804" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", sourceSha256: "7f66ba0f077edcdc0eb6ecbdd42183a20e93fb755cd4637cfc5e55f327974086", peakResidentKib: 1218336, elapsedSeconds: 12.64, measurementReceiptSha256: "736239e62e8ed55852587eadf1300ad26b0c3309f8039d63dc68f8631585fc0a", measuredAtCommit: "4d4d8d76" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", sourceSha256: "d9b153277c292d04cae77e83d94138a7d952fd9ec643415ed752493c5405aadf", peakResidentKib: 2818852, elapsedSeconds: 108.6, measurementReceiptSha256: "c27b59ed29d06bd63ca703ed94ac92775b03c0e82d5c8dce7a7326966fa874c2" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", sourceSha256: "b3b5735380de0d8ae4f0fe93808e095052a3a1134a892069ac06d6273ab70c45", peakResidentKib: 2110356, elapsedSeconds: 87.55, measurementReceiptSha256: "e2cf48b535c622a5510088eb27d0aa14c928c2fd5ad7ee6ba52c6b94879d53b2" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", sourceSha256: "4cc55b055ae93be5f5e4f12e181fbbc56cf0d822afcbbaa45b0de4352d988094", peakResidentKib: 1368940, elapsedSeconds: 72.62, measuredAtCommit: "b589ab0a" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", sourceSha256: "4aae161d215aab3fcb9df35905d8f643587cfdd8f5005a77d3b3a1d49cd5b43d", peakResidentKib: 1049176, elapsedSeconds: 4.40, measuredAtCommit: "52a84367" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", sourceSha256: "0a43822fb153d42941e3b38fc0c98807124173a7457ccf84cfd6822f34efc3a6", peakResidentKib: 1726820, elapsedSeconds: 12.13, measuredAtCommit: "d7fcdcb0" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", sourceSha256: "8dace4787a396e3d9bad4785313302703e98f4f8a61b11dfcc73b72349cb25ca", peakResidentKib: 721184, elapsedSeconds: 1.78, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", sourceSha256: "1e6e453574d725a87dc3822e6db07bf0fb6571518fbf3559bab7d14161aabe3a", peakResidentKib: 658084, elapsedSeconds: 2.23, measuredAtCommit: "bced19a5" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", sourceSha256: "631273878f32400bb4c7ba24db7b1b07a1d6ae78b198b106c97115c2bf146009", peakResidentKib: 690964, elapsedSeconds: 1.61, measuredAtCommit: "a97a4ea1" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", sourceSha256: "1bed9ad23468ac08ae9c8324b35c003d004faf98f74f44d37c77277771722bcc", peakResidentKib: 1570176, elapsedSeconds: 28.99, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", sourceSha256: "96caf8fed5acc1e8a6976f595021d7d05ede9ac6623b3f1e81d4799b88fed30f", peakResidentKib: 1425944, elapsedSeconds: 16.2, measurementReceiptSha256: "5d25fd18d91c12ad68a8fe3b022e062856bd81fcea4702d3190a1439896ab61f" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", sourceSha256: "d82637238732c40185c03155e953afb19e99ff1f0f6b5cd916cfd19dcf8943c8", peakResidentKib: 836304, elapsedSeconds: 3.43, measuredAtCommit: "565ff325" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", sourceSha256: "c51bf6ffcf66937adeb9dbb3bd713942282d83254a35d022dcdf45c50d5705cb", peakResidentKib: 1226740, elapsedSeconds: 5.85, measuredAtCommit: "a97a4ea1" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", sourceSha256: "3dec9299936108c4097a9f8b7f69b9c168ea904ccffa2bcd5e606f56bc6f8474", peakResidentKib: 1486952, elapsedSeconds: 22.63, measurementReceiptSha256: "e323f915859ded9526b8b7172d731f8a2e5b2da523feb68eb5232c543cb0e9a7", measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", sourceSha256: "6c33cb9f704a9f07cdbad0ff5ad191f299a7e90e364e3e037d78324e0e89c5c5", peakResidentKib: 608860, elapsedSeconds: 0.65, measurementReceiptSha256: "6c74b05d8e0139853d1682dbe14ae19694cc4a11b3fbf45d623da0aec70dacd8", measuredAtCommit: "5fa6dfe3" },
    {
      module: "BpmnSemantics.MessageStartAdmissionConformance", sourceSha256: "8ca942d1deb17fec9fb3f6499da2f8ef773b0d3b91bdf6e7e6e607f5a85dcb6f",
      peakResidentKib: 1810064,
      elapsedSeconds: 9.54,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessageStartClosureConformance", sourceSha256: "b3e61de3708480cd370794f91b72844695b86899ec904ee3c8f01bc6a6e6b687",
      peakResidentKib: 1699144,
      elapsedSeconds: 6.92,
      measuredAtCommit: "e9c9db0f",
    },
    {
      module: "BpmnSemantics.MessageStartIdentityConformance", sourceSha256: "71f974c1aa052c423d11ec63c856bce8c127decf8e7bfa7cffd6e3b54a55fdac",
      peakResidentKib: 1539460,
      elapsedSeconds: 7.8,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessageStartScenarioConformance", sourceSha256: "238d3da16ed2c4d0ecc7a0c426c6d57915ffe02a1ac83ed97edba4d626f6e281",
      peakResidentKib: 1419604,
      elapsedSeconds: 6.56,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessageStartConformance", sourceSha256: "39aefbb559c6e55cc5a422b386ec6f2cc42b6be2f97a7944ddbb2f7e66b6e5e3",
      peakResidentKib: 618008,
      elapsedSeconds: 0.35,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessagePayloadCatchConformance", sourceSha256: "95272a9e17d6d294920116d20d1a4d14b08c0ab724f98e780f4eb772d3a20fdb",
      peakResidentKib: 1508268,
      elapsedSeconds: 25.93,
      measuredAtCommit: "5fa6dfe3",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceConformance", sourceSha256: "497e668bdc35e9967bace7afd5d0bd9f97e87ed9a065244e89a7a38cc4161e17",
      peakResidentKib: 619012,
      elapsedSeconds: 0.65,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceRuntimeConformance", sourceSha256: "c7e659b6160725b11450d49c398d4ca8d2562a575e12f658dab40a43864677c2",
      peakResidentKib: 2509372,
      elapsedSeconds: 20.11,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceRefusalConformance", sourceSha256: "15bb57ee792acbfc6ff301aa96f11f8a3d18a094d19e384ad30b5a7f9d2e1df4",
      peakResidentKib: 1791356,
      elapsedSeconds: 10.21,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance", sourceSha256: "7993ad06886c2772ac9f52aa96ba65ced871424712c0b00a98c8e914d8f54763",
      peakResidentKib: 833720,
      elapsedSeconds: 1.91,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance", sourceSha256: "213cc023a91ba85111db289554fa2f9a92f6b45125e2ce862c7a7bfb02c37c51",
      peakResidentKib: 620612,
      elapsedSeconds: 0.66,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", sourceSha256: "114905d4c2a3e9cab78eff13cf1cc56ee5039448f856427be2c0457ff02fd5b5",
      peakResidentKib: 639644,
      elapsedSeconds: 2.21,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", sourceSha256: "7ac8e97aa57950abced4bd935bc651eb5cceefd3701c9c14a340bfd72ccac527",
      peakResidentKib: 2172304,
      elapsedSeconds: 13.87,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance", sourceSha256: "2e8314aec6a2546cc8153da29cb97c13322e3b59edb1fd29db28ccd56883e674",
      peakResidentKib: 1699276,
      elapsedSeconds: 9.89,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance", sourceSha256: "b4f6365e604837ed88652efdf9f8fc4762974034d110c6a3fbce71d87ff12d19",
      peakResidentKib: 2333280,
      elapsedSeconds: 16.1,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance", sourceSha256: "74c068c022404fa65de5bc406088ac55b3609fe6bf84cc291976da4e36f798a6",
      peakResidentKib: 2086828,
      elapsedSeconds: 14.06,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance", sourceSha256: "0b4ed7a02a3d0c594819677d13027e32f64f61c67759bb3ff945b6542278356e",
      peakResidentKib: 751784,
      elapsedSeconds: 1.07,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedConformance", sourceSha256: "f167c35563c40fa3ce644ac3217f966d99ebaf0bbda86ca93f5e7c46853d1807",
      peakResidentKib: 619360,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance", sourceSha256: "663b25f3df406a25aace21bef65deb14cbb5bd644bb129e1b1ab28ba07967742",
      peakResidentKib: 1183920,
      elapsedSeconds: 20.24,
      measuredAtCommit: "5fa6dfe3",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", sourceSha256: "523250e08143d628fa6fd579309d39be3db3326d66b9dcc6899346de3cd39708",
      peakResidentKib: 1390688,
      elapsedSeconds: 5.49,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", sourceSha256: "9269e72b892fbf104dba3b710a453008827589fd67595856d2c4bbbe9b65c92e",
      peakResidentKib: 1832044,
      elapsedSeconds: 14.57,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.CallActivityConformance", sourceSha256: "594a55c469d1a1c89cb1280fd6adb46dbb21b7b6b3849ffb7c7adc598dbe4390", peakResidentKib: 1398692, elapsedSeconds: 31.25, measurementReceiptSha256: "86f4e44b46b1fc35e23dce78c4c107aad73dc328e804d1d2bd2beb8e8ad5fbe1" },
    { module: "BpmnSemantics.CallActivityPairingConformance", sourceSha256: "f1b06692452a19dcc1e41ddb9fdaca632dff95f3cc5196dae3af1a50488bc71b", peakResidentKib: 1081832, elapsedSeconds: 3.54, measuredAtCommit: "b304150e" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", sourceSha256: "9c9d85778b3f574d082cbb102840846089e05e1a6667577d31fe3d00a992fe7d", peakResidentKib: 1609256, elapsedSeconds: 51.5, measurementReceiptSha256: "2340a3aecb06e036a3bc74374b3a57e6c5b361073664e3cef4239901cfd68ac7" },
    {
      module: "BpmnSemantics.TimerStartConformance", sourceSha256: "6fabac266ded9705199deacc71b353a027f8bce17b925afd404b7b5ca3f63a61",
      peakResidentKib: 1438340,
      elapsedSeconds: 29.87,
      measurementReceiptSha256: "421a88a60904c60f29d600633c2668e5e33de2e61604d5e19e7bb66d94bf5a9f",
    },
    {
      module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", sourceSha256: "c12fc34b37edd9f29b1ae07e27ec061cb15b27468e985cca719160c0c29d587e",
      peakResidentKib: 2825860,
      elapsedSeconds: 27.55,
      measuredAtCommit: "b9c1c586",
    },
    {
      module: "BpmnSemantics.RuntimeStateActivityConformance", sourceSha256: "697bd85b3b4d2569f3363e6132fb131c03bed1c40040e052426aad7cadf8ba2e",
      peakResidentKib: 618664,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", sourceSha256: "7ead0876a404578645ff7430e32009efebb35c6841905b001556262c3c2342eb",
      peakResidentKib: 1212052,
      elapsedSeconds: 14.63,
      measuredAtCommit: "0958697d",
    },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", sourceSha256: "e3051a7bb3f1c635d2645492e773c0860d538a53eca8d79d9b131d10ac821ca3", peakResidentKib: 1013076, elapsedSeconds: 15.20, measuredAtCommit: "6d231a2b" },
    { module: "BpmnSemantics.ScopeCancellationConformance", sourceSha256: "82b5c60694b98181c835faa9c58350333f3d2a5b0f03b66d761eef8a6e451d5b", peakResidentKib: 614460, elapsedSeconds: 1.35, measurementReceiptSha256: "5b236a85591574e68119d0512e3bb49b0fcae081a4f819153ceea874ca3dabc5" },
    { module: "BpmnSemantics.ScopeCompletionConformance", sourceSha256: "96dfd671997fe4aef33c37e8d053229f4d2cca7196130ef46eb403af496a4855", peakResidentKib: 587916, elapsedSeconds: 0.54, measuredAtCommit: "0958697d" },
    {
      module: "BpmnSemantics.RuntimeStateControllerConformance", sourceSha256: "97ac82c9f9a2ca7ac111a1e242de94a053e26c763ddd8ab8da3393ca2fea889b",
      peakResidentKib: 2089244,
      elapsedSeconds: 16,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", sourceSha256: "2830fc772dfae3abcfd5dd3d7da8a2412dbd72cd78017be1707b6a9f9a1d68fd",
      peakResidentKib: 615444,
      elapsedSeconds: 1.41,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", sourceSha256: "ca751cd232da61ed5b7968f208a87c165a7b202dec023bc9898a72b8710105dd",
      peakResidentKib: 1802080,
      elapsedSeconds: 11.73,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", sourceSha256: "0608d55d491298a955e339936cad4d23f7e6f1768443049ec9183f3d70d8f8be",
      peakResidentKib: 2076884,
      elapsedSeconds: 13.87,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", sourceSha256: "886d08b818347ce5b19f9cbb4cbffc9317d7bc192aac0cf52cb050b2f3b7e81e",
      peakResidentKib: 2439560,
      elapsedSeconds: 24.56,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.SemanticProcessAdmissionConformance", sourceSha256: "74498cd9dd077c65b31387494da7b7f97542f4ecebfed4bbb9b7629eb6149fb5",
      peakResidentKib: 2713164,
      elapsedSeconds: 17.08,
      measuredAtCommit: "a52f0c39",
    },
    { module: "BpmnSemantics.EventBasedGatewayConformance", sourceSha256: "6d92cbf323262358a6521da1218834514961c5d62853baabeceadcdc77355f7e", peakResidentKib: 2721196, elapsedSeconds: 17.19, measuredAtCommit: "e9c9db0f" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", sourceSha256: "07f431826e295264ca63c8240c7210c51263c0ee60afc1d6dc53ee62c7ba0d02", peakResidentKib: 2367304, elapsedSeconds: 40.77, measurementReceiptSha256: "6fea56611b134a8225a9a55867c38eaf66d09a547d854a4c6ed4b5189de86950" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", sourceSha256: "40c6e0ff7a80ccf322286db4f1329dcf4006e274662a3234a458c2488b325ceb", peakResidentKib: 1514392, elapsedSeconds: 28.54, measurementReceiptSha256: "fa0047938f0da13dfa47a7dbeb656afb45359f749af731f0be8e00c4ef383454" },
    {
      module: "BpmnSemantics.CommittedExecutionPublicationConformance", sourceSha256: "2dab3dd3114f19a7cfd2403c24d93cd3cc93a1e56a7844e872edbcd832bb89b5",
      peakResidentKib: 1478996,
      elapsedSeconds: 17.13,
      measuredAtCommit: "cbb78a11",
    },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", sourceSha256: "3b219db84da8ca90b05c5924d66864fbc064f579149cbf81c94d8efa2d51aa3d", peakResidentKib: 2225108, elapsedSeconds: 11.7 },
    {
      module: "BpmnSemantics.TerminateEndEventConformance", sourceSha256: "651178a6b84e96fda3a5f5393e6574e59338422ae732d04a9cafc4746e384bf1",
      peakResidentKib: 1722640,
      elapsedSeconds: 40.78,
      measurementReceiptSha256: "c64f04119aedeb145c729b5629fb2d56e44c1afa566b9a71a6a5b40f4d3b795e",
    },
    { module: "BpmnSemantics.SemanticProcessConformance", sourceSha256: "ad75af29f6f4b4229d41b8ec5526346f68ec746f3c361685edee922883c27505", peakResidentKib: 2203824, elapsedSeconds: 8.9 },
    {
      module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", sourceSha256: "91c7430d4a4895d3f2c383fcf128420d941df5fccec230b730ce741f7bdb8a3b",
      peakResidentKib: 2432344,
      elapsedSeconds: 23.34,
      measuredAtCommit: "6208f2e4",
    },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", sourceSha256: "e6113b4ef77a8de12bf874e6d3b1afb012a35d1e76956be515817a5e4d15b50e", peakResidentKib: 1319948, elapsedSeconds: 17.76, measurementReceiptSha256: "9edc0cf0c06431aa21d917937698ce86a9ca044abd655cb2c8860482ff179044" },
    {
      module: "BpmnSemantics.ActivityDataInputConformance", sourceSha256: "6d87c86d6eb92ffc4474e075f156f78f9a75b5504ce7aab3b39110b12ccdc428",
      peakResidentKib: 2696232,
      elapsedSeconds: 13.18,
      measuredAtCommit: "de03c7b1",
    },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", sourceSha256: "8984f17cc2de03be8d475fae540131681218b5cd9fb2bbdc13043db3f02392c9", peakResidentKib: 1280148, elapsedSeconds: 17.51, measurementReceiptSha256: "33237985a2e7621e28d106e07c2ef8932244c9b7751848a6024dff6dd84c0c52" },
    {
      module: "BpmnSemantics.MappedSuccessConformance", sourceSha256: "15192c3681069c9d407b3a73ed0be9bc94d124f5bc85cc1921af28e831ba0739",
      peakResidentKib: 2139596,
      elapsedSeconds: 13.73,
      measuredAtCommit: "b9c1c586",
    },
    { module: "BpmnSemantics.InclusiveGatewayConformance", sourceSha256: "cc5ad5ec3f977518a35ead9fb8ba32af31e41c7b8b3caaa72705b9dc98437e81", peakResidentKib: 1435552, elapsedSeconds: 27.63, measuredAtCommit: "565ff325" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", sourceSha256: "015b07fba01fd04a24ad4574c11af2982f4a8944be9b160b12a3e518135e1a15", peakResidentKib: 1981884, elapsedSeconds: 24.5 },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", sourceSha256: "1e75a244dcad7d54988c5782c07be093f86986b4364d0905bd3cebdbdf370490",
      peakResidentKib: 1072920,
      elapsedSeconds: 10.15,
      measuredAtCommit: "f7d96deb",
    },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", sourceSha256: "4c30ff0decdd55e26d94931e5e90b781b30b20610708001662aacd89cb12a808", peakResidentKib: 1926344, elapsedSeconds: 11.0 },
    {
      module: "BpmnSemantics.InternalCommutationConformance", sourceSha256: "a02dd231e707535714fa9f6f453b6a8ca6059f89123b8f8aadb10737ac868d00",
      peakResidentKib: 1288936,
      elapsedSeconds: 10.86,
      measurementReceiptSha256: "a836939c202072965c700b568492e38cfd346628584fc39f77726a391fb1dc53",
      measuredAtCommit: "df8a6c2d",
    },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", sourceSha256: "726af063eace416930440c691765d1349259deae28caabe682c6d4294fd04cba", peakResidentKib: 1261436, elapsedSeconds: 14.90, measuredAtCommit: "cbb78a11" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", sourceSha256: "88b1ed346d0012c1117855f7fa82dec4f46ed81a48b0c13e9f7be5060edf2457", peakResidentKib: 2447360, elapsedSeconds: 18.21, measuredAtCommit: "5fa6dfe3" },
    { module: "BpmnSemantics.CompensationSourceJsonConformance", sourceSha256: "e5c22bb1998add36d3090953c0b93a815bc7aa9bd3abc442acdb6efcd5d96337", peakResidentKib: 2326880, elapsedSeconds: 12.15, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceCompatibilityConformance", sourceSha256: "359f8b0c3747a6b5d91919c4b20456ded8bb5980ef5e22caebb0fc1f788e0d58", peakResidentKib: 2023220, elapsedSeconds: 14.78, measuredAtCommit: "05244cf7" },
    { module: "BpmnSemantics.CompensationSourceBindingReferenceConformance", sourceSha256: "052a2da0185f522989f04bda65ef3649e05b661d8cf306380e1036cc168b365a", peakResidentKib: 2725808, elapsedSeconds: 31.89, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingTriggerConformance", sourceSha256: "7ccc13a6c6836bb48789a445b7c1aa38586e26c7f7ee9812d01d6b79df1ea51b", peakResidentKib: 2379680, elapsedSeconds: 20.36, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingStorageLimitConformance", sourceSha256: "0e5f932011a9c6548c001787d9deb328d087e3a8cb63b7109ff679110cb41a88", peakResidentKib: 2701156, elapsedSeconds: 33.68, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingExecutionLimitConformance", sourceSha256: "bd7e58e46aa400f3b7486f4d24ae8202501134ff2599e3ead7aafd75dac91488", peakResidentKib: 2574272, elapsedSeconds: 25.21, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingValidProgramConformance", sourceSha256: "7324534976733dc43d23a2afb2710340501e6b233d6ed47da1e55a55fb46b3fb", peakResidentKib: 1833660, elapsedSeconds: 11.43, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingConformance", sourceSha256: "0a589d7cd50006858e438b23919550cedb5542ffbfd7031a5af7e1b81e1da2a4", peakResidentKib: 635228, elapsedSeconds: 0.5, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceLoweringConformance", sourceSha256: "401e874f84be7969f751c6905ab3b6b3fdbc54c89e9d8e5e9432d3583c861d92", peakResidentKib: 635272, elapsedSeconds: 0.59, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance", sourceSha256: "e72f879e10cb862b812061982d49b7a72ece98cd68c953a18ba79be3b0cdd568", peakResidentKib: 821532, elapsedSeconds: 5.14, measuredAtCommit: "7b0b5151" },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerProgramContractConformance", sourceSha256: "7110c3fafb19578d54ec2ffd935606d6e2f1d63e55fc73dbead7b2a2e425aff5",
      peakResidentKib: 889480,
      elapsedSeconds: 2.60,
      measuredAtCommit: "4b2a304f",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance", sourceSha256: "df1f1bb4fe474c742ee8259ddad564b1daaf70864aedd05c8d7709f763502f7a",
      peakResidentKib: 705308,
      elapsedSeconds: 0.68,
      measuredAtCommit: "ef739572",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerRuntimeConformance", sourceSha256: "636ecd86dc9b5c9ec9b39a1f0ca8f9c1f2bc8ab925292e2f3d64fdcb39d7a811",
      peakResidentKib: 1292220,
      elapsedSeconds: 4.78,
      measuredAtCommit: "eed22392",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance", sourceSha256: "c9e849dddb2649314a20a6b7573428d66e94c2d45ff82fc1dad1f91e45dd9016",
      peakResidentKib: 1892392,
      elapsedSeconds: 11.19,
      measuredAtCommit: "7126d5db",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", sourceSha256: "374abbce9e248b8d64cfb853796e51cafbda2a42e51b6dcb5b6bed4d0d32fe50",
      peakResidentKib: 1485228,
      elapsedSeconds: 25.83,
      measuredAtCommit: "5fa6dfe3",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance", sourceSha256: "012b251e6eec0e6abdd3f60c8eba58189f46c9d3a44427f674fc030ed831dbab",
      peakResidentKib: 614680,
      elapsedSeconds: 0.58,
      measuredAtCommit: "3020899b",
    },
    {
      module: "BpmnSemantics.CompensationActivityRetentionProducerConformance", sourceSha256: "fc6f0d0d9a5b232ab3f8f628a85e22aad3678c17a5debe67f9d7f8d6c5aa55ef",
      peakResidentKib: 2332716,
      elapsedSeconds: 8.4,
      measuredAtCommit: "cb7fd54e",
    },
    {
      module: "BpmnSemantics.CompensationActivityRetentionConformance", sourceSha256: "bf83db883a733606dcdd54a91b8b812b5ccb8b62c0a4b6cb78b25b7a9a4a5fad",
      peakResidentKib: 1916172,
      elapsedSeconds: 6.68,
      measuredAtCommit: "ef739572",
    },
    { module: "BpmnSemantics.UserTaskMetadataConformance", sourceSha256: "538d0f263c1aab44ef5780fa9016cc8cabafe2d5bc638fab06384a44f4c33024", peakResidentKib: 1290752, elapsedSeconds: 16.77, measurementReceiptSha256: "124ee1b1fae8e6426f89b2e0721eec0bdfba76e0e2e6002a53cf7551ab54c311" },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", sourceSha256: "b1c87b3af8971495c4a85af8189f520f0ecd952a153112d25b5e24ac116490f3", peakResidentKib: 967732, elapsedSeconds: 3.88, measuredAtCommit: "c6aeb583" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", sourceSha256: "9e6e59e6421c9b9604cca025a1e93529c5ae25c898523eb65e83f610ad08cfc9", peakResidentKib: 731312, elapsedSeconds: 2.41, measuredAtCommit: "8d3927f6" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", sourceSha256: "5d9902c4ae803b2e7a2a2b69b9e2182dfcf6474d788260260bf4950713e6c0cb", peakResidentKib: 974464, elapsedSeconds: 2.22, measuredAtCommit: "ee17ed58" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", sourceSha256: "7730a53b5495a6b1b6bbd4c5d27d40e20dd7c265afe744c320b9462c3f0282a6", peakResidentKib: 1288416, elapsedSeconds: 9.54, measuredAtCommit: "ee17ed58" },
    {
      module: "BpmnSemantics.ActivityDataOutputConformance", sourceSha256: "7361030a200282a70487b789735b78bba061a920bf3a53d94e04114e5ed34f0d",
      peakResidentKib: 2335952,
      elapsedSeconds: 12.94,
      measuredAtCommit: "de03c7b1",
    },
    { module: "BpmnSemantics.ReceiveTaskConformance", sourceSha256: "db25942e52626c3ea0a5aebe3e9e453de4887aada6960a26f4768717e1abbb32", peakResidentKib: 1679876, elapsedSeconds: 19.3 },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", sourceSha256: "608eba093d26bfe58c6a38e3936a090ade6a6a8c90e6d9009ecc5360853ffbc1", peakResidentKib: 1676016, elapsedSeconds: 10.7 },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", sourceSha256: "5dc524b140cfb02d54868f6056b2272d173b04c922b9e58aedc20a5cbdf658bb",
      peakResidentKib: 1464728,
      elapsedSeconds: 6.92,
      measuredAtCommit: "1fda9213",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotConformance", sourceSha256: "d06b15d890a8d5beb0b8e59fd46c3974856d35d7311b421fbc9ad6554e02a5a1",
      peakResidentKib: 2825652,
      elapsedSeconds: 13.24,
      measuredAtCommit: "7b70b7cc",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance", sourceSha256: "8fc20942b2fb86109f2c018e9d7f8dde9d298f0cfc5c614f1a885e648e28be00",
      peakResidentKib: 1933028,
      elapsedSeconds: 15.25,
      measuredAtCommit: "5fa6dfe3",
    },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance", sourceSha256: "b88f42838f5ed3da2984430baffa8101014f8daff0ef37141ca329a625fc4f05", peakResidentKib: 1565576, elapsedSeconds: 20.63, measurementReceiptSha256: "796f19cbdfbea95d5211fe3b9bcbe7d7f319263f5b30c9215544b3af6f6d4f25", measuredAtCommit: "a97a4ea1" },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorProgramConformance", sourceSha256: "ed9f2cc86ffd44b492d55fb095c31fc1faea8ba74e4b6f4e650e9ecda673b127",
      peakResidentKib: 1755796,
      elapsedSeconds: 6.54,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorReadyStateConformance", sourceSha256: "6b4647645ffd319168171ae4680d5072c8cf9b1fe1100817281797f12e3aa2cf",
      peakResidentKib: 1898152,
      elapsedSeconds: 5.99,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorOutcomeConformance", sourceSha256: "2e50b1659fbfbed68d30f615b3a94892d97114fb69952a62c629058803100553",
      peakResidentKib: 2545104,
      elapsedSeconds: 9.94,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorPurgeConformance", sourceSha256: "2034b840336a463ecd737ae7f7bcaceb08eb692d6fe557dbb23a94b0c20c3df3",
      peakResidentKib: 2546956,
      elapsedSeconds: 11.64,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorRecoveryConformance", sourceSha256: "b5e83ae714f5a529431b31a9ea25a1cc227ca837a5820433289721433d30aac1",
      peakResidentKib: 2545196,
      elapsedSeconds: 10.55,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance", sourceSha256: "9b8fd34d0bae7c867d40c893edaa70a4b206be5a1b7279f646e07c8720d629b1",
      peakResidentKib: 1977500,
      elapsedSeconds: 6.55,
      measuredAtCommit: "ef739572",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance", sourceSha256: "8d73f14e562a55ce1a26e472e3ee275d79f47bdd572c0d076446cb5ab99eb73d",
      peakResidentKib: 642024,
      elapsedSeconds: 0.67,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance", sourceSha256: "f5aa6d395f46ad1259e59fb75d88d97a74896b5f8a19a63802dc3788fa89f01b",
      peakResidentKib: 622884,
      elapsedSeconds: 0.47,
      measuredAtCommit: "bd2bef03",
    },
    { module: "BpmnSemantics.UserTaskInteractionConformance", sourceSha256: "db66169ec4a874fa19b3faf129acc8205a19049cf084e80873fefb007079e492", peakResidentKib: 1516764, elapsedSeconds: 7.14, measuredAtCommit: "eed22392" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", sourceSha256: "76789f249f806bae0c35164b23a31366ba592182ca68df09c238e638a4827a6a", peakResidentKib: 1661596, elapsedSeconds: 9.48, measuredAtCommit: "24d92a7c" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", sourceSha256: "4469c8927a9ee825382978763c58046514f6e9ff4b87a0add2aa32c088320971", peakResidentKib: 1463248, elapsedSeconds: 7.2 },
    { module: "BpmnSemantics.BooleanProcessDataConformance", sourceSha256: "f58657510b8d650bf2b08ad29b6e72c609a860d43f50ce15bd16ff45d997b658", peakResidentKib: 1405164, elapsedSeconds: 3.8 },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", sourceSha256: "95aefc7c9d67ddcaaaf8b142db2f473f48b3d467295aec5008008d7784e15e1d", peakResidentKib: 1382440, elapsedSeconds: 3.8 },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", sourceSha256: "1c4274ce2837b7b6c90440feb79a0aea7b25cf58f27348590b41f9cfa4726c05", peakResidentKib: 1464712, elapsedSeconds: 7.79, measurementReceiptSha256: "9ffd2f000aee896112f665fd49017e6fc80e10cf46e27ca479aabf6578c25485", measuredAtCommit: "519c7c5e" },
    {
      module: "BpmnSemantics.ActivityBoundaryMessageConformance", sourceSha256: "a92aba0f28f4f827daf02c4970c4341a5fce2c699b9916c599e5db15d1b61e2a",
      peakResidentKib: 2807968,
      elapsedSeconds: 23.32,
      measuredAtCommit: "81c0703c",
    },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", sourceSha256: "0fdb674595072799f82086fbd27fa44a3cc1f440274b1bf6317d3f37796123ab", peakResidentKib: 1349428, elapsedSeconds: 5.6 },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", sourceSha256: "a177fd5270451eab097b128b6b17a1f65fb5b0ee007ebf0079c34df497650479", peakResidentKib: 1296244, elapsedSeconds: 5.3 },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", sourceSha256: "5046156d18a7655bdf7cb2c8f27ced063447551aa61360e9b93c3156859af8bf", peakResidentKib: 1201352, elapsedSeconds: 2.9 },
    {
      module: "BpmnSemantics.StructuredHumanWorkConformance", sourceSha256: "fa767fde33e84dac412e90bcf54e742ab0efd6b7b5c03b54568cb76d1440612a",
      peakResidentKib: 1054660,
      elapsedSeconds: 3.46,
      measuredAtCommit: "826231ab",
    },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", sourceSha256: "78a77d949247e0a7015e9c49fa01a9ea751db09b7bfd2d0fdb84c107478592f2", peakResidentKib: 934608, elapsedSeconds: 2.0 },
    { module: "BpmnSemantics.ProcessStartDataConformance", sourceSha256: "6b66dd1d2c041a10ad777fbd5629ff6ced26fbe00ac1de9e2fe9b6966cd080d9", peakResidentKib: 892876, elapsedSeconds: 4.1 },
    {
      module: "BpmnSemantics.ParallelMultiInstanceConformance", sourceSha256: "600c3b8fd85d185a7c69e1601fe69c54af12a24f37270eba0c32d17791e738c7",
      peakResidentKib: 1433212,
      elapsedSeconds: 3.32,
      measuredAtCommit: "42f152de",
    },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", sourceSha256: "10ec23cc34eaa9f185487cf18849270642cca0b648bdeb274e6db7915dffebfb", peakResidentKib: 839556, elapsedSeconds: 3.9 },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", sourceSha256: "6e11580a490d063f7638177b0964bb2abad9800f6820b89a4b0393c4c3d26ffb",
      peakResidentKib: 734464,
      elapsedSeconds: 3.98,
      measuredAtCommit: "f7d96deb",
    },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", sourceSha256: "42dbe3550fc30986075afa64376dcaf33501f1a6a23d0b09a62a79720a2ea381",
      peakResidentKib: 825916,
      elapsedSeconds: 3.44,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", sourceSha256: "b43abc0d491eac25341ee1dbf2f250a3fd2132579e282dd573ee1c2e8411e42e",
      peakResidentKib: 695004,
      elapsedSeconds: 3.07,
      measuredAtCommit: "f7d96deb",
    },
    {
      module: "BpmnSemantics.SemanticProcessJsonConformance", sourceSha256: "86bb80fc5f1cbd205d46250dd7fff0627b584f64a976989c42d44e03b7ac1bfc",
      peakResidentKib: 694632,
      elapsedSeconds: 1.38,
      measuredAtCommit: "741d7f6d",
    },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance", sourceSha256: "41a697fbc7b70acb4a836981e8a848dd60c76b496cf6b7b85aad21b08d60af82",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", sourceSha256: "92d18c0c9b7291567a219b1164fcd62ef0fec498bd69c8ec6373bb7388f23137", peakResidentKib: 646452, elapsedSeconds: 0.7 },
    {
      module: "BpmnSemantics.ActivityIssuingDisciplineConformance", sourceSha256: "15a53dbc902b26399c70f9494bfaea7eb6e3b8f5203cb3f3265739ff77ef219f",
      peakResidentKib: 626648,
      elapsedSeconds: 1.24,
      measuredAtCommit: "c5bad315",
    },
    { module: "BpmnSemantics.Conformance", sourceSha256: "584db140a4daadb41234caca696515c629fb0bab578971cadeb91b287bfcdc24", peakResidentKib: 508576, elapsedSeconds: 0.3 },
    { module: "BpmnSemantics.ParallelForkJoinConformance", sourceSha256: "e31a9f3b81249cd81ce367598fbcb5dbf354a79ad694135fa8a4ef15444ea2f5", peakResidentKib: 500536, elapsedSeconds: 0.3 },
  ],
} as const satisfies LeanModuleCostRecord;

export function measurementCommitFor(
  record: LeanModuleCostRecord,
  row: LeanModuleCostRow,
): string {
  return row.measuredAtCommit ?? record.provenance.measuredAtCommit;
}

/** Historical rows retain their original identity; new measurements use the completed receipt digest. */
export function measurementIdentityFor(record: LeanModuleCostRecord, row: LeanModuleCostRow): string {
  return row.measurementReceiptSha256 ?? measurementCommitFor(record, row);
}

export function leanModuleCostBaseline(record: LeanModuleCostRecord): LeanModuleCostBaseline {
  return {
    measurements: record.rows.map(
      (row) =>
        [row.module, row.peakResidentKib, measurementIdentityFor(record, row), row.sourceSha256] as const,
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
