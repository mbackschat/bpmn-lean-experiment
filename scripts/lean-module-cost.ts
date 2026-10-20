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
 * [the commit protocol](../docs/REVIEW-POLICY.md#commit-boundaries) defines capture.
 */
export type LeanModuleCostRow = DeepReadonly<{
  module: string;
  peakResidentKib: number;
  elapsedSeconds: number;
  sourceSha256: string;
  measurementReceiptSha256?: string;
  measuredAtCommit?: string;
}>;

/**
 * Aggregate provenance describes the historical baseline series; receipt-bound
 * rows retain their own measured toolchain and conditions in the identified
 * command receipt under [the commit protocol](../docs/REVIEW-POLICY.md#commit-boundaries).
 */
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
  nearCapModules: [
    "BpmnSemantics.InternalRegionalHandlerPublicationConformance",
    "BpmnSemantics.TransactionCancellationActivePublicationConformance",
    "BpmnSemantics.TransactionCancellationFailurePublicationConformance",
    "BpmnSemantics.TransactionCancellationJoinPublicationConformance",
  ],
  rows: [
    { module: "BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageConformance", sourceSha256: "780a7636156d770cb8a6f404eb57dbb78e8dd5ae91509054cf4df8a6f99c5e89", peakResidentKib: 922944, elapsedSeconds: 4.79, measurementReceiptSha256: "737bc7a04d03aa8bcefc7776e99b55e70c31a9712596d8206fa47d821096538a", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.SequentialScopeGraphConformance", sourceSha256: "f304c2fde52c682d79687e57b086ffceca7c72532934dd1794345db8d50569f5", peakResidentKib: 1475624, elapsedSeconds: 63.60, measurementReceiptSha256: "dbb277a296d46eeca1948eb4e4d2b93a317c56a1bdd0fab2cc431414c3103d1f", measuredAtCommit: "fee496d4bd5d729fbccb283de78de1606388dd7f" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", sourceSha256: "59dcb82626777726bf525b68f527a097a82f6bcd711c4e227dfa25598c88a700", peakResidentKib: 543788, elapsedSeconds: 0.87, measurementReceiptSha256: "84a79c56b2f080b0331defec30a82c7fe415741983e32205328ba0831dc1ead7", measuredAtCommit: "fee496d4bd5d729fbccb283de78de1606388dd7f" },
    { module: "BpmnSemantics.NestedScopeDataConformance", sourceSha256: "70c41aa2da0e9eb0759ac1f33dbd66596eb5f7c1da934ce81ea7360445b274e1", peakResidentKib: 2118984, elapsedSeconds: 36.32, measurementReceiptSha256: "eda4752cf5c073e1b5af7a0ef6def93a2f7cab984c3bef6c55cfe124284a3a17", measuredAtCommit: "fee496d4bd5d729fbccb283de78de1606388dd7f" },
    { module: "BpmnSemantics.NestedScopeControlConformance", sourceSha256: "7e5ef3b46a1cba2f6f5c398b589cdcdcf6c36314ee2a721115f6c26ed0d0ba93", peakResidentKib: 2808084, elapsedSeconds: 179.3, measurementReceiptSha256: "e4b3b24b47f05e657c2373a4a0873b830fbb41015db6d17cfc6ea97e5821d3ab", measuredAtCommit: "7f9a4cc7e32fe2142ef8b3f78bde6a404eb44dd5" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", sourceSha256: "31fe4e3ba57eaf9d27c94a27dd9140a1696e0962bdbb43a8ad8703be8b564e2e", peakResidentKib: 1073088, elapsedSeconds: 7.83, measurementReceiptSha256: "26bda55e23e07238444351d2efa2c7e085363e14519b65f7fd2f541dbcd702e9", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", sourceSha256: "c0ff688a1de17d812e2fda7516b7fd64954a3bd636666b92351d92f2a2c57202", peakResidentKib: 1325264, elapsedSeconds: 18.27, measurementReceiptSha256: "eb66d120c3d0261485bb161700f5bddfe6f81d05190c130293435b089fcca5bf", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", sourceSha256: "daf7a42aa265295310ffbb738729ed040b3973d15e53e24b9dff380f854554c4", peakResidentKib: 1842264, elapsedSeconds: 28.88, measurementReceiptSha256: "2b99d852eb5b8372ec0b2ad3332d93afbfaab0b33b40310f99956ea1a562e300", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", sourceSha256: "e072fab5e201a0e62558ebf8cc65149a17ce067c4b3110a48e40547e4b9c30c0", peakResidentKib: 1942604, elapsedSeconds: 69.79, measurementReceiptSha256: "b9c0ee0cbde87fc40f14fcf5ec7e209ff477670d6c0f64fed4ff7ca6421258e9", measuredAtCommit: "822aa91beec99d108a884955f65eb64ca52c3b7c" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", sourceSha256: "3e88f94390da9452825535dda5ee4884d00075a60e8ffb084aae2a0a01e15be5", peakResidentKib: 2116720, elapsedSeconds: 81.97, measurementReceiptSha256: "b407c010904eb500245bdb75e366e58099636e72faaf612cc5a7c922f095a4db", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", sourceSha256: "545b9a3530d105470cf4b3ee6cc7aed577d6e15e59f739653457f6c81e6b228a", peakResidentKib: 1613264, elapsedSeconds: 119.89, measurementReceiptSha256: "28a042e590e9f05d67027bbd89939b78be0d46f3a881b780cf5c7a72f2529401", measuredAtCommit: "e92046c014dbfb88cfbb8c1aa0a7ae714a02a1e3" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", sourceSha256: "b12aa97a3c84744e12b18e73beb26b4a940f5fa29c046f053c144b41c5593fe5", peakResidentKib: 1207580, elapsedSeconds: 9.44, measurementReceiptSha256: "ec0aa2213b7b66c82fb5c1ec44a2a171ae89333fa69d266e38a9adf203a4aa9f", measuredAtCommit: "c5a9d5a62e334cca7591bd907c60ce245e728f6c" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", sourceSha256: "da645ed026b953f09841e495a7cea9eeed37580ca7d5fd35f751bbb3f97c9929", peakResidentKib: 851324, elapsedSeconds: 4.36, measurementReceiptSha256: "891a71296b8d89e5b3930d1b0200672a35537b2b59ddcf984d63892ed6a3948b", measuredAtCommit: "55d70e576650b75d32c7188839056f27c720290d" },
    { module: "BpmnSemantics.PortableHandoffConformance", sourceSha256: "e0757d382d226c07ef756ffee4424af19522537914b6ab9ed5751c6298d56fd2", peakResidentKib: 1065420, elapsedSeconds: 11.26, measurementReceiptSha256: "a8b03772dab20aca622ee34efd7999c828c888598527fee3d962495a1014b946", measuredAtCommit: "4e15fa4bd280c568ea09a04b6aea93341a9839c2" },
    { module: "BpmnSemantics.EffectDataConformance", sourceSha256: "950e7eed2ec32c35854c7980bcf9759f2691a7a331ab533c9592887cd9446450", peakResidentKib: 1250864, elapsedSeconds: 14.24, measurementReceiptSha256: "ec99195da5124633dc0df9e42c1f61d97a3fe9d1148acbe26b2f62096eea5122", measuredAtCommit: "079c6e720c1487f923b5063be14c74103b060270" },
    {
      module: "BpmnSemantics.TransactionSourceConformance", sourceSha256: "ec708f43145ab93fce3e74809e88cb0d2ff35f876f3eb131d11cb9c64506cfba",
      peakResidentKib: 1612540,
      elapsedSeconds: 23.00,
      measurementReceiptSha256: "dba1f19cb677220a3bcab05015690c9b4c730c7003c2ce068de810c5235a0bce",
      measuredAtCommit: "4cd0ad90",
    },
    {
      module: "BpmnSemantics.TransactionSourceArmingConformance", sourceSha256: "2bf016fb15898c5bba5fc355548e0d51339580ca1f12b90740841d5308afd2e4",
      peakResidentKib: 1528556,
      elapsedSeconds: 21.45,
      measurementReceiptSha256: "bf8270867921fed6fdd2766e9f4bcb65eb391779a650fad0b3bd7da56910e283",
      measuredAtCommit: "4cd0ad90",
    },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", sourceSha256: "9331738a0f9afd02f56ce3b038cd6ee9e895f155ad751d3a3e64753f33b14954", peakResidentKib: 2882924, elapsedSeconds: 31.23, measurementReceiptSha256: "6cd03b051b22cf4baeb46bab5e913c97acf16e25e1236df0dd793c6d565b5dd5" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", sourceSha256: "13244758d7a5b868054c98dae288b73ebce9f39795ad57dd34f3cea565017c98", peakResidentKib: 3303752, elapsedSeconds: 11.68, measurementReceiptSha256: "8c0efe6d30efaaabdf1dda5edfda35d5783354a567210eeb46f9107de62e2b62" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", sourceSha256: "06dbd2b6998daae2cb468f22f511da7c7b98e57e8e2cf14c0bd6fd003a56f4c3", peakResidentKib: 2089436, elapsedSeconds: 6.33, measurementReceiptSha256: "2aaec3a679a8d8293ef1d4903c15d4bfd258c9d25b291d7fed50f3d950505326" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", sourceSha256: "19961d63f569c320fc13858cdb1f7e34bd382115ed414173d80d2c1bb863a9ab", peakResidentKib: 694184, elapsedSeconds: 0.74, measurementReceiptSha256: "c1277fdbc092ed31e7bbccda1269cd074c8b4253fa21cdcfe1c85bcedc81e790" },
    { module: "BpmnSemantics.TransactionCancellationConformance", sourceSha256: "b011a706e2d1b6ca556b15daf723188f5a8708f683517386adfc42f52504ca55", peakResidentKib: 739604, elapsedSeconds: 12.61, measurementReceiptSha256: "68307f352f242b4dffbd13ab0a167ab904a9b599567317e78c6965bc3c7aaf21" },
    { module: "BpmnSemantics.TransactionRetentionConformance", sourceSha256: "10f64df21ac403b475a259da59e55f988728b07136e0e59ab71577a638830f31", peakResidentKib: 627612, elapsedSeconds: 1.49, measurementReceiptSha256: "581c50e29e0328c94dddfed941cc70e6f83721f88162983c810cbb4d7c9524cc" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", sourceSha256: "9ad6cab2be058c50e2083ed1f27e45a956e5962d45483f87345d8ae47394e5ba", peakResidentKib: 2497492, elapsedSeconds: 14.34, measurementReceiptSha256: "05588be1dfea62fdd033a1d3cc7369b339da6d9a842a34726aa44b5f03418f02" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", sourceSha256: "ddd5cb8a1ebe5df6854346bea61bb51cde39f381ca56a7256f9bc8fa4bbf8868", peakResidentKib: 2683848, elapsedSeconds: 12.33, measurementReceiptSha256: "52dd8f8f24f174a562e269e6b9924565ca9b422c964527a90c93ee026d46e7f7" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", sourceSha256: "99e2b94f6f5d6836e4341a0252e4377b1507f893daaeb8a30acf2c38c0869b28", peakResidentKib: 3112056, elapsedSeconds: 10.25, measurementReceiptSha256: "f265c5b22259c53e36d8214b14c71d3ef4d9f41d8d1487cf2b20ee54045a6ccf" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", sourceSha256: "567389f2db135d72ce41203c7eb92c26cc52dce67cec1de8775d44a09c1365f5", peakResidentKib: 2784288, elapsedSeconds: 13.46, measurementReceiptSha256: "d311106ff81b99e27ac1d48bc199893d5310ac205154cc93d578f9074665b3cb" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", sourceSha256: "7f870e4c0d68cbee249ca464dd516b2b84df0b7daa884073a4413a2796c7f6cb", peakResidentKib: 3200528, elapsedSeconds: 10.99, measurementReceiptSha256: "570f5d9d254522e8dc20b6b4039ffcf5ea3bada81183a91de8fb516aad0d18d0" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", sourceSha256: "3727df0055f011a560cfd0c6119f6483436224dced977313e8527befc8651712", peakResidentKib: 587232, elapsedSeconds: 0.43, measurementReceiptSha256: "9d5978226b1cbbaaa07fd0a91062e944f758af7cea8a2d977fbc1a5e6f90fcdc" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", sourceSha256: "b592ff68e0acb46172f6660c9089380572197c6e5b1bebf922946542d5046d1b", peakResidentKib: 1327064, elapsedSeconds: 9.83, measurementReceiptSha256: "c690a6376673270bb77686b991b6e9de606d7ee1b9eede2edc2978b488f1453e" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", sourceSha256: "7b6b9523101343486f2031f1babbab179e12d9f76a5665ee90be9d04bd3047a7", peakResidentKib: 1229212, elapsedSeconds: 5.14, measurementReceiptSha256: "a9f0d1213c3f8870f7d3926a6759fcc7627fb2f7266e51dde8fbb9ff88c9817e" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", sourceSha256: "9545387627f567823ddf1cf0e1f6bb2ebb28d4703f3100f41a15d5b5cd9e7432", peakResidentKib: 1377844, elapsedSeconds: 9.57, measurementReceiptSha256: "b70eb630bd6a9fb0e1fbdf1f2c61b9a6f3e5d739cac6b3a6d09eea8293c078d8" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", sourceSha256: "6a4f79e1f9f2c99353261f5fd73761e753ad53703e2eeb6a44f205a374b8d79d", peakResidentKib: 2664772, elapsedSeconds: 21.35, measurementReceiptSha256: "e55eaee34a5596365e6d74ca2b1eeca3d5e7bbdd0de7d18bba2ffa578007a4f3", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", sourceSha256: "4633f562d0c4a363eafebf2baaa6fd97d0be357a2b9be01a2a16538b9a7cbd21", peakResidentKib: 1991084, elapsedSeconds: 30.97, measurementReceiptSha256: "be4c7572447d53d3ee859c5f4abadb6a69afb9b78a64a1f7d31270bac1e7e0b7" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", sourceSha256: "fcfd3811c2f55cec85d6d5c8aa976eb05213ad9662df3d6e8544abf91d941d04", peakResidentKib: 2007128, elapsedSeconds: 44.45, measurementReceiptSha256: "5a6b41fda44e868ad4671fa2b28038f613c3bd4ba0e16f94c56395af356c855c" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", sourceSha256: "ea6e88079f52f88f539f2d4bcaea55a96ef15a0605478a37d9b4102b856ac288", peakResidentKib: 2735872, elapsedSeconds: 16.97, measurementReceiptSha256: "afd4d278ded008fec16dfd27c722215b1f41cd17b333d816bcb8549779bfb804" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", sourceSha256: "7f66ba0f077edcdc0eb6ecbdd42183a20e93fb755cd4637cfc5e55f327974086", peakResidentKib: 1218336, elapsedSeconds: 12.64, measurementReceiptSha256: "736239e62e8ed55852587eadf1300ad26b0c3309f8039d63dc68f8631585fc0a", measuredAtCommit: "4d4d8d76" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", sourceSha256: "5922ea88a626a8cab27eb82f38b35afef771e6805f886aa62c3009056bf1a002", peakResidentKib: 2247008, elapsedSeconds: 190.87, measurementReceiptSha256: "f6faac47483d3385ef2ce6e75facb709d42a3fffaa5db70d3815d07b82cd1611" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", sourceSha256: "b3b5735380de0d8ae4f0fe93808e095052a3a1134a892069ac06d6273ab70c45", peakResidentKib: 2110356, elapsedSeconds: 87.55, measurementReceiptSha256: "e2cf48b535c622a5510088eb27d0aa14c928c2fd5ad7ee6ba52c6b94879d53b2" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", sourceSha256: "4cc55b055ae93be5f5e4f12e181fbbc56cf0d822afcbbaa45b0de4352d988094", peakResidentKib: 1368940, elapsedSeconds: 72.62, measuredAtCommit: "b589ab0a" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", sourceSha256: "4aae161d215aab3fcb9df35905d8f643587cfdd8f5005a77d3b3a1d49cd5b43d", peakResidentKib: 1049176, elapsedSeconds: 4.40, measuredAtCommit: "52a84367" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", sourceSha256: "0a43822fb153d42941e3b38fc0c98807124173a7457ccf84cfd6822f34efc3a6", peakResidentKib: 1726820, elapsedSeconds: 12.13, measuredAtCommit: "d7fcdcb0" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", sourceSha256: "8dace4787a396e3d9bad4785313302703e98f4f8a61b11dfcc73b72349cb25ca", peakResidentKib: 721184, elapsedSeconds: 1.78, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", sourceSha256: "1e6e453574d725a87dc3822e6db07bf0fb6571518fbf3559bab7d14161aabe3a", peakResidentKib: 658084, elapsedSeconds: 2.23, measuredAtCommit: "bced19a5" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", sourceSha256: "631273878f32400bb4c7ba24db7b1b07a1d6ae78b198b106c97115c2bf146009", peakResidentKib: 690964, elapsedSeconds: 1.61, measuredAtCommit: "a97a4ea1" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", sourceSha256: "1bed9ad23468ac08ae9c8324b35c003d004faf98f74f44d37c77277771722bcc", peakResidentKib: 1570176, elapsedSeconds: 28.99, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", sourceSha256: "3fae024a3f050d3d95fab1690a3330b1d144aabcd7f5d2e00566e8089d2d55d4", peakResidentKib: 1506192, elapsedSeconds: 11.42, measurementReceiptSha256: "427dfd9f3247ca7ae004bda468bb179ef5a8e81fddef95eb07db500eb5a3e3e6", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", sourceSha256: "d82637238732c40185c03155e953afb19e99ff1f0f6b5cd916cfd19dcf8943c8", peakResidentKib: 836304, elapsedSeconds: 3.43, measuredAtCommit: "565ff325" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", sourceSha256: "c51bf6ffcf66937adeb9dbb3bd713942282d83254a35d022dcdf45c50d5705cb", peakResidentKib: 1226740, elapsedSeconds: 5.85, measuredAtCommit: "a97a4ea1" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", sourceSha256: "052b9b3b9f99fcc89866428b26e63ab8d77b797e40101784d86d585ecb2d9394", peakResidentKib: 1612540, elapsedSeconds: 18.68, measurementReceiptSha256: "a5118c5a530fa69db31720df3f5541ac972dcf49d0ba59072d855948b89b2b06", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", sourceSha256: "a0b5b2db13f4b1c28da0708b85bd63bbe9f03631c804534696b493439e710d32", peakResidentKib: 642540, elapsedSeconds: 0.84, measurementReceiptSha256: "a8825872e9ff029b44c648a87b6cceab263ebd0a5f70850f405c81d8f7fe736a", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
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
    { module: "BpmnSemantics.MessagePayloadCatchConformance", sourceSha256: "95272a9e17d6d294920116d20d1a4d14b08c0ab724f98e780f4eb772d3a20fdb", peakResidentKib: 1650488, elapsedSeconds: 42.5, measurementReceiptSha256: "dd9461e73a20c8444eb41b28a9b1acb61e57ff2838911403f0b65d1c5a68d7b6", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.PortableMessagePayloadConformance", sourceSha256: "2d41ebd6347492b44efca529fee38caf4e3ccd2047e281cf9f2eab6e3ef4eb27", peakResidentKib: 1174816, elapsedSeconds: 25.8, measurementReceiptSha256: "bc162a9c48d4e5f13c17dfc21a16d9d88867d3622f7444aaa5cf7808dcbf0908", measuredAtCommit: "6ec5bd68daeb6c6a2666b337bda57ccc79defeb1" },
    { module: "BpmnSemantics.SequentialMultiInstanceConformance", sourceSha256: "01e7b77f3a9eacd6a6b9c8e5843bdc75beb3545487759a86116c974e60586f2f", peakResidentKib: 766080, elapsedSeconds: 0.84, measurementReceiptSha256: "c654e417b2a4e1af91bb857945eb43f5c6aeeb2f92346865b4eb221822737806", measuredAtCommit: "b39851632faa9db039ac02cbdbc6fed2d9e369e5" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgressConformance", sourceSha256: "abaaca00cab08b711cb793bef72e228cd8f851d878c48b473b967371b7768871", peakResidentKib: 934092, elapsedSeconds: 1.57, measurementReceiptSha256: "6e7fdabfb9c05395b87b1b87debb22731ec252362172014788b026323009395b", measuredAtCommit: "b39851632faa9db039ac02cbdbc6fed2d9e369e5" },
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
    { module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", sourceSha256: "d689b4868a7ab5eaaf1c6f57a0d43444f29eb1f21f4f661f148b301e8fd48865", peakResidentKib: 1217808, elapsedSeconds: 13.97, measurementReceiptSha256: "dca0ba4808198cef6cb747abb5e324b849e7d4f03f13908b52f3f3a5df5a296d", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", sourceSha256: "9269e72b892fbf104dba3b710a453008827589fd67595856d2c4bbbe9b65c92e",
      peakResidentKib: 1832044,
      elapsedSeconds: 14.57,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.CallActivityConformance", sourceSha256: "d9dc5b44325561145b57393f9ed47ad4648f64387e30ba28bc1b5cdc928bdfea", peakResidentKib: 1458860, elapsedSeconds: 72.67, measurementReceiptSha256: "8fbb92485679a9f06224979b86201a8eda11ffad9b95b573c7b5209efe656799", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.CallActivityPairingConformance", sourceSha256: "1ec3eda0a23d7968d7e886e2fefb41cc34005c0262ddbbaee3d6d6d0fb559c04", peakResidentKib: 1170064, elapsedSeconds: 2.95, measurementReceiptSha256: "099c86e1e43ce1c8c23013fbb83f391b8a1a33db29d6eaf00b3d42a874d20343", measuredAtCommit: "b304150e" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", sourceSha256: "385f704899e109b681df009e20e53c52ba640827bd31698c1e60d442e267f50b", peakResidentKib: 1678804, elapsedSeconds: 40.08, measurementReceiptSha256: "577b3cd57df66968c5a2d38f5bbb99f9146afd1f33952167d30cf2a55a60e3aa", measuredAtCommit: "7f9a4cc7e32fe2142ef8b3f78bde6a404eb44dd5" },
    {
      module: "BpmnSemantics.TimerStartConformance", sourceSha256: "6fabac266ded9705199deacc71b353a027f8bce17b925afd404b7b5ca3f63a61",
      peakResidentKib: 1438340,
      elapsedSeconds: 29.87,
      measurementReceiptSha256: "421a88a60904c60f29d600633c2668e5e33de2e61604d5e19e7bb66d94bf5a9f",
    },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", sourceSha256: "32859e1e91616f1afa441fbb97417d96210149d7b30d5786355ee2e262b71bff", peakResidentKib: 1739644, elapsedSeconds: 52.14, measurementReceiptSha256: "9ec9ed00c083dfe156c3c4a85ddff0a9182d8887b8aceca404a847129ad086ae", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    {
      module: "BpmnSemantics.RuntimeStateActivityConformance", sourceSha256: "697bd85b3b4d2569f3363e6132fb131c03bed1c40040e052426aad7cadf8ba2e",
      peakResidentKib: 618664,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", sourceSha256: "1a8857ba8fb9b013eacc1e4f802c938e15fa43c01d5bc9b8c29cb0181043a559", peakResidentKib: 1353184, elapsedSeconds: 16.55, measurementReceiptSha256: "1367d065c9907d40221099072a07aaf17d80f4cca05c0b64c0ba2bffc41b4d8e", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", sourceSha256: "e3051a7bb3f1c635d2645492e773c0860d538a53eca8d79d9b131d10ac821ca3", peakResidentKib: 1013076, elapsedSeconds: 15.20, measuredAtCommit: "6d231a2b" },
    { module: "BpmnSemantics.ScopeCancellationConformance", sourceSha256: "0f547139f06f936dfc5ded3011f981bf0b4ba172bc4ee1f94cac568302745cb7", peakResidentKib: 631384, elapsedSeconds: 0.85, measurementReceiptSha256: "b49308779f070851798ed6d40112455f61fb47f0e914c20d49c9f5a61bbf28b9", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
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
    { module: "BpmnSemantics.EventBasedGatewayConformance", sourceSha256: "e049a9055479005dbf98ae18bcf08d00bb5fdd75183ccd51041f49a05882bb82", peakResidentKib: 1469588, elapsedSeconds: 24.95, measurementReceiptSha256: "d0173af60a2491ac2186e2e25c1eec67e8b5f13e824b581e5df95d8c076fbd4f", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", sourceSha256: "07f431826e295264ca63c8240c7210c51263c0ee60afc1d6dc53ee62c7ba0d02", peakResidentKib: 2367304, elapsedSeconds: 40.77, measurementReceiptSha256: "6fea56611b134a8225a9a55867c38eaf66d09a547d854a4c6ed4b5189de86950" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", sourceSha256: "40c6e0ff7a80ccf322286db4f1329dcf4006e274662a3234a458c2488b325ceb", peakResidentKib: 1514392, elapsedSeconds: 28.54, measurementReceiptSha256: "fa0047938f0da13dfa47a7dbeb656afb45359f749af731f0be8e00c4ef383454" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", sourceSha256: "920f0839703383bdcf0b4b4fa8baa644089cbee0cdfa2d07d9c8962376273e65", peakResidentKib: 1580772, elapsedSeconds: 15.26, measurementReceiptSha256: "9ba40e7c8e83d8983c86e7a72f1c31205fdc1e300ab739dcaef28e09066391e0", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", sourceSha256: "3b219db84da8ca90b05c5924d66864fbc064f579149cbf81c94d8efa2d51aa3d", peakResidentKib: 2225108, elapsedSeconds: 11.7 },
    { module: "BpmnSemantics.TerminateEndEventConformance", sourceSha256: "86faeda5380989fd37a25f2c943d2bb9c005f9e783ec9df719f9e21f52200e77", peakResidentKib: 1701836, elapsedSeconds: 35.47, measurementReceiptSha256: "52324fa2defc78171911b728262ce8d967ff514fa7ff40e8ba5e9e6afb67af7c", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.RegionalRemovalOwnerCoverageConformance", sourceSha256: "7f10d5e5277c41273a30e2ad0adb1ca687bdec72a016538e355a6d531dba92d5", peakResidentKib: 1405092, elapsedSeconds: 10.0, measurementReceiptSha256: "f4ea1ce599ca2bbcc043cdfc3dd3e06cbb8de0bd26bef67b3fb8dfe0d9ce9d7c", measuredAtCommit: "0b3aeaaaec9d238ba8b0bacd53ed811fe7e6de45" },
    { module: "BpmnSemantics.SemanticProcessConformance", sourceSha256: "ad75af29f6f4b4229d41b8ec5526346f68ec746f3c361685edee922883c27505", peakResidentKib: 2203824, elapsedSeconds: 8.9 },
    {
      module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", sourceSha256: "91c7430d4a4895d3f2c383fcf128420d941df5fccec230b730ce741f7bdb8a3b",
      peakResidentKib: 2432344,
      elapsedSeconds: 23.34,
      measuredAtCommit: "6208f2e4",
    },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", sourceSha256: "e6113b4ef77a8de12bf874e6d3b1afb012a35d1e76956be515817a5e4d15b50e", peakResidentKib: 1319948, elapsedSeconds: 17.76, measurementReceiptSha256: "9edc0cf0c06431aa21d917937698ce86a9ca044abd655cb2c8860482ff179044" },
    { module: "BpmnSemantics.ActivityDataInputConformance", sourceSha256: "96dc550c4881e332854916f27271af12c0b5c8fee8ed1c1c374c97b0c2c35a31", peakResidentKib: 1217356, elapsedSeconds: 40.99, measurementReceiptSha256: "69318b7b55912b89dda49ef2d2710a98d928c467efbe5648fd40a58837842f79", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", sourceSha256: "66a80a06ef11f8bd7753681efee931a8db861a8663f57303d4ddcd9fa2e0070a", peakResidentKib: 1330152, elapsedSeconds: 20.16, measurementReceiptSha256: "89aa8fd739f9aec002a812ee56a636b12bda8e45b0d80e60658e78e85c6684b9", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.MappedSuccessConformance", sourceSha256: "4df7274a997554ee444037bd4307d05d08ec8d679d50d12eb1dc00439c891918", peakResidentKib: 1540920, elapsedSeconds: 20.53, measurementReceiptSha256: "ff3355722a37d2e310c81347773ee187e54c71cdc5982374547471961ecd5260", measuredAtCommit: "fee496d4bd5d729fbccb283de78de1606388dd7f" },
    { module: "BpmnSemantics.InclusiveGatewayConformance", sourceSha256: "ce46298760369c6e8f3325453d7502485834cc4a2ce8ab6f451e5b6f78e77087", peakResidentKib: 1578836, elapsedSeconds: 22.51, measurementReceiptSha256: "a4e683989719bc877200053a07e2ab8163651f72e291985a2e020f7dcaf10277", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", sourceSha256: "015b07fba01fd04a24ad4574c11af2982f4a8944be9b160b12a3e518135e1a15", peakResidentKib: 1981884, elapsedSeconds: 24.5 },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", sourceSha256: "a5efc7e20b874e374bdf86058b03d6c064a0c9c3d72285a9b52391ee68db7669", peakResidentKib: 1149996, elapsedSeconds: 15.32, measurementReceiptSha256: "ac09c2acf915de48d80e55ddc450cbec277e0b715f9d2b6d924e9d31467ca8fc", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
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
      module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", sourceSha256: "26da30f98de7d257ea13ce39b594c0073b22f1b6ea5550a72fd6e158bd015047",
      peakResidentKib: 1626092,
      elapsedSeconds: 40.51,
      measurementReceiptSha256: "04a66afd41fa8d867f61c76c6b808b2dbc8315674c8d23f4856b6698331af1e5",
      measuredAtCommit: "0b3aeaaaec9d238ba8b0bacd53ed811fe7e6de45",
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
    { module: "BpmnSemantics.UserTaskMetadataConformance", sourceSha256: "88c3414f7c681a25e106f716b88a67be914b81872b229bd65b2d58b408c9185e", peakResidentKib: 1370284, elapsedSeconds: 21.23, measurementReceiptSha256: "f960bf7403bc037a29b60c56b4c6f3ae842bfa01d58c0a424b18621a4f114800", measuredAtCommit: "fee496d4bd5d729fbccb283de78de1606388dd7f" },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", sourceSha256: "c6d2f6c0cb20d81d8e3b7064e2a9eef4fe68160885e88ecc38c51787fd506692", peakResidentKib: 1094580, elapsedSeconds: 7.35, measurementReceiptSha256: "4542a05dab81e6bfd8f222b221a7608bf41a1f6eadd1dc95b298dc02f19211ef", measuredAtCommit: "e92046c014dbfb88cfbb8c1aa0a7ae714a02a1e3" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", sourceSha256: "de936a04bbe3bbd048e83fcc22c4c5b8ff0196df955c9e9daab25dbc9bdb7c3e", peakResidentKib: 788884, elapsedSeconds: 2.11, measurementReceiptSha256: "f7074052ed824aeaa12b7a2c63c6fd828bf144b57394b89e4f716f184de023a8", measuredAtCommit: "8d3927f6" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", sourceSha256: "aa76e6e36b44cfec497a35cbedeffc49666e625daaabc6fb27a9e3a472065eef", peakResidentKib: 1088924, elapsedSeconds: 1.68, measurementReceiptSha256: "4d17d3e9780ea6aca2324767ea32a10bc8b2891e5fda5800d43dbc5ef34aca0e", measuredAtCommit: "ee17ed58" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", sourceSha256: "7730a53b5495a6b1b6bbd4c5d27d40e20dd7c265afe744c320b9462c3f0282a6", peakResidentKib: 1288416, elapsedSeconds: 9.54, measuredAtCommit: "ee17ed58" },
    { module: "BpmnSemantics.ActivityDataOutputConformance", sourceSha256: "852f6cf0c4571d011f7623e54f0656484029385a5f3d641da6d0c51742d1fe16", peakResidentKib: 1394652, elapsedSeconds: 18.61, measurementReceiptSha256: "ed4327102b7a976e241d0af19d745db546cf94733ca5bff332ce7017fb7ef548", measuredAtCommit: "de03c7b1" },
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
    { module: "BpmnSemantics.UserTaskInteractionConformance", sourceSha256: "56ece1f9ee561f64a89e48e99dda4db1ad4c49040865051c7b14427251aa955f", peakResidentKib: 1098584, elapsedSeconds: 6.95, measurementReceiptSha256: "b4e33b40bc4b115f200b38005b533a769c98206461362f047031aa19fc003cfe", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", sourceSha256: "76789f249f806bae0c35164b23a31366ba592182ca68df09c238e638a4827a6a", peakResidentKib: 1661596, elapsedSeconds: 9.48, measuredAtCommit: "24d92a7c" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", sourceSha256: "212ed8c048f14933ef878e0f1b55e0e533fb6988a2eee5c9c249f1b690349c77", peakResidentKib: 1424676, elapsedSeconds: 13.27, measurementReceiptSha256: "f877c4ba1e8ef2172c4dc50ed59bc72118f1a352bea4d9867e57f31cf7251d4f", measuredAtCommit: "30906e65dd77c839979b4bedbf1869c7578d1c60" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", sourceSha256: "2a3dd70f97339fdd3067df01919ac026d08f0bb9788d548503a61e1f0f6a8e9c", peakResidentKib: 1051596, elapsedSeconds: 6.3, measurementReceiptSha256: "2d56d7e6745d0a525fc94a045138b8011fcab08ff6f00497dc61fca0a7dcac2e", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", sourceSha256: "95aefc7c9d67ddcaaaf8b142db2f473f48b3d467295aec5008008d7784e15e1d", peakResidentKib: 1382440, elapsedSeconds: 3.8 },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", sourceSha256: "1c4274ce2837b7b6c90440feb79a0aea7b25cf58f27348590b41f9cfa4726c05", peakResidentKib: 1464712, elapsedSeconds: 7.79, measurementReceiptSha256: "9ffd2f000aee896112f665fd49017e6fc80e10cf46e27ca479aabf6578c25485", measuredAtCommit: "519c7c5e" },
    {
      module: "BpmnSemantics.ActivityBoundaryMessageConformance", sourceSha256: "a92aba0f28f4f827daf02c4970c4341a5fce2c699b9916c599e5db15d1b61e2a",
      peakResidentKib: 2807968,
      elapsedSeconds: 23.32,
      measuredAtCommit: "81c0703c",
    },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", sourceSha256: "90f4bf551c534bcc2a1dbdcd94cda1ed6c8a0a184b47314c02b1d20d57a7a188", peakResidentKib: 1188100, elapsedSeconds: 6.58, measurementReceiptSha256: "c73c34db1d4538a059b92902f04711650f7574973c05dfa9e783f3ee2961b3d3", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", sourceSha256: "910d1568c1d1bb60c3f427ea8766ae80a2f72edf67287386ff075ca3d9924888", peakResidentKib: 1179760, elapsedSeconds: 5.43, measurementReceiptSha256: "03df62a46af04fd0b7308e5c8650f4ad021e99b6c28b17026ba1272aa65c5148", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", sourceSha256: "5046156d18a7655bdf7cb2c8f27ced063447551aa61360e9b93c3156859af8bf", peakResidentKib: 1201352, elapsedSeconds: 2.9 },
    {
      module: "BpmnSemantics.StructuredHumanWorkConformance", sourceSha256: "fa767fde33e84dac412e90bcf54e742ab0efd6b7b5c03b54568cb76d1440612a",
      peakResidentKib: 1054660,
      elapsedSeconds: 3.46,
      measuredAtCommit: "826231ab",
    },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", sourceSha256: "e364c3ff644feed18ea5f863987b026f36b524f0c57a4c7d2ed119bf6702b89e", peakResidentKib: 1034532, elapsedSeconds: 2.19, measurementReceiptSha256: "38fb13fd8daa6047bef5e923263d6a177615775b603205862202ca88d52e43f9", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ProcessStartDataConformance", sourceSha256: "b82270de6bef909531dcf3dd1e108c5c5bde22b6c3bd1554d8b08bcd2010e642", peakResidentKib: 930116, elapsedSeconds: 2.37, measurementReceiptSha256: "af556b87b3d6930428357a8cf60779cfa10b4790dbcbd7eb48370e71a1c2b6e9", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    {
      module: "BpmnSemantics.ParallelMultiInstanceConformance", sourceSha256: "600c3b8fd85d185a7c69e1601fe69c54af12a24f37270eba0c32d17791e738c7",
      peakResidentKib: 1433212,
      elapsedSeconds: 3.32,
      measuredAtCommit: "42f152de",
    },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", sourceSha256: "10ec23cc34eaa9f185487cf18849270642cca0b648bdeb274e6db7915dffebfb", peakResidentKib: 839556, elapsedSeconds: 3.9 },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", sourceSha256: "9f88090a517d5a3d90c53682adfa29f1ba4aa8501e1731c986c3b0b7d2ba88a4", peakResidentKib: 1128448, elapsedSeconds: 3.6, measurementReceiptSha256: "4cb3f2dc24d7659a01e147679bb5a198c37f94236c4911227dff9275d6ec86b2", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", sourceSha256: "42dbe3550fc30986075afa64376dcaf33501f1a6a23d0b09a62a79720a2ea381",
      peakResidentKib: 825916,
      elapsedSeconds: 3.44,
      measuredAtCommit: "223486be",
    },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", sourceSha256: "26df8ac743bf821994c43a7635789ccbd6887c5632c47328e9948d8ccd06ced3", peakResidentKib: 797380, elapsedSeconds: 1.87, measurementReceiptSha256: "b0c66f99a8c18d30f84d7780f970d425592cbce2cb1226ba60e82ed508ee2174", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.SemanticProcessJsonConformance", sourceSha256: "d6d9c1d7df3de3e6f96cb5a64aa8846529c449c9047854c985e7a2111adb08c5", peakResidentKib: 1023744, elapsedSeconds: 5.35, measurementReceiptSha256: "daeb90ed2d861a49c28597f9e43f6513f9bbcc69be426acb224a124993897c91", measuredAtCommit: "fedb885082e2e0eeadc7c6e56b2bf92bb5d0328a" },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance", sourceSha256: "41a697fbc7b70acb4a836981e8a848dd60c76b496cf6b7b85aad21b08d60af82",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", sourceSha256: "92d18c0c9b7291567a219b1164fcd62ef0fec498bd69c8ec6373bb7388f23137", peakResidentKib: 646452, elapsedSeconds: 0.7 },
    { module: "BpmnSemantics.ActivityIssuingDisciplineConformance", sourceSha256: "f2901c5b333e8af36bc97ceafc8ba724e4c7f29fc681451cc4d0a98789fb5731", peakResidentKib: 625128, elapsedSeconds: 0.66, measurementReceiptSha256: "b6a735a8a147bc841d3f67ebe34b3f2940af8978448c763cc7d71588a205c05c", measuredAtCommit: "21f472140d6a286d62d9b8f8fe1c4ebcdd776e76" },
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
