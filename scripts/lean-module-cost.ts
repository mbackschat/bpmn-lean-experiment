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
 * `codeSha256` binds the measured source with its comments removed, as
 * [`leanCodeWithoutComments`](./lean-source-analysis.ts) defines it: comments
 * are not elaboration input, so a comment repair keeps the measurement while any
 * code or literal edit requires a new one. New measurements identify
 * their completed command receipt separately from historical Git provenance;
 * [the commit protocol](../docs/REVIEW-POLICY.md#commit-boundaries) defines capture.
 */
export type LeanModuleCostRow = DeepReadonly<{
  module: string;
  peakResidentKib: number;
  elapsedSeconds: number;
  codeSha256: string;
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
    { module: "BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageConformance", codeSha256: "f59db0578e10e7b414078c49242ecb88dec53420112c778e30fdc86c2d2652b2", peakResidentKib: 922944, elapsedSeconds: 4.79, measurementReceiptSha256: "737bc7a04d03aa8bcefc7776e99b55e70c31a9712596d8206fa47d821096538a", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.SequentialScopeGraphConformance", codeSha256: "0aac6d80900e9449e58ec8d5dc303745f2257efb48d6b92903f856879f3f3b8d", peakResidentKib: 1475624, elapsedSeconds: 63.60, measurementReceiptSha256: "dbb277a296d46eeca1948eb4e4d2b93a317c56a1bdd0fab2cc431414c3103d1f", measuredAtCommit: "fee496d4bd5d729fbccb283de78de1606388dd7f" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", codeSha256: "48ccfcf37518f6b09b9bb9080f1a7cee557c772c194bddc4c2acefc3e13066f2", peakResidentKib: 543788, elapsedSeconds: 0.87, measurementReceiptSha256: "84a79c56b2f080b0331defec30a82c7fe415741983e32205328ba0831dc1ead7", measuredAtCommit: "fee496d4bd5d729fbccb283de78de1606388dd7f" },
    { module: "BpmnSemantics.NestedScopeDataConformance", codeSha256: "8f531cb1e874fe758bedd225bf006571b6b1a7b3e1edffa90f116b951768e664", peakResidentKib: 2118984, elapsedSeconds: 36.32, measurementReceiptSha256: "eda4752cf5c073e1b5af7a0ef6def93a2f7cab984c3bef6c55cfe124284a3a17", measuredAtCommit: "fee496d4bd5d729fbccb283de78de1606388dd7f" },
    { module: "BpmnSemantics.CallVariableMappingConformance", codeSha256: "d70d556c3b66fceda99cc17ba423145ff19681146c8066d0ebfe4fd35f0ff286", peakResidentKib: 1604552, elapsedSeconds: 24.80, measurementReceiptSha256: "d3e659065c7ea87fbbc2f0af6f7cbd975e0c73771f709e9af8fae43e533e09d7", measuredAtCommit: "d351a4b839f50cc44ee76713a44cd65a75d03ab7" },
    { module: "BpmnSemantics.NestedScopeControlConformance", codeSha256: "d064d04aefbfde9f14bdcf97c43ccb7eecd462d8aaf61f1293dfcb2cd180dfd8", peakResidentKib: 2808084, elapsedSeconds: 179.3, measurementReceiptSha256: "e4b3b24b47f05e657c2373a4a0873b830fbb41015db6d17cfc6ea97e5821d3ab", measuredAtCommit: "7f9a4cc7e32fe2142ef8b3f78bde6a404eb44dd5" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsAdmissionConformance", codeSha256: "2318624b8ee2cc2816fe49d496b7bcf55fc1c798a5edbc331b55270dab28295e", peakResidentKib: 2250072, elapsedSeconds: 44.37, measurementReceiptSha256: "0bf4cb55accccf87519e787622a9b470973f289d2a9a948123a583ce7fb9c35f", measuredAtCommit: "b3e0b01e71473575c131e213c6e4149804d227d8" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsConformance", codeSha256: "50eee2fd5fe10c607d4a18f5e4544eeaa4419afce221da895fd1ee5eea57247f", peakResidentKib: 2172204, elapsedSeconds: 89.03, measurementReceiptSha256: "bbf00783b95fa325bd88b3b882a0fa87440e28c26e94c6fd253f94d44813a787", measuredAtCommit: "b3e0b01e71473575c131e213c6e4149804d227d8" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", codeSha256: "436fe91b88a0d39294c0c09f66a9eec36c6b0a99848a00c0f8170d66b6d2d6a2", peakResidentKib: 1073088, elapsedSeconds: 7.83, measurementReceiptSha256: "26bda55e23e07238444351d2efa2c7e085363e14519b65f7fd2f541dbcd702e9", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", codeSha256: "e5662f70d118852dcc472a6f9ab232cd04c9c721941b44e8dee72acfeed36d54", peakResidentKib: 1325264, elapsedSeconds: 18.27, measurementReceiptSha256: "eb66d120c3d0261485bb161700f5bddfe6f81d05190c130293435b089fcca5bf", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", codeSha256: "205fd234c4f60d9ae1cad99bf5a2233da800d4bc588c090b34c6338ec3c55764", peakResidentKib: 1842264, elapsedSeconds: 28.88, measurementReceiptSha256: "2b99d852eb5b8372ec0b2ad3332d93afbfaab0b33b40310f99956ea1a562e300", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", codeSha256: "1e5089228c847bc3c36bff910a4a0fb96413a53f0608538c4f990f4f747b3713", peakResidentKib: 1942604, elapsedSeconds: 69.79, measurementReceiptSha256: "b9c0ee0cbde87fc40f14fcf5ec7e209ff477670d6c0f64fed4ff7ca6421258e9", measuredAtCommit: "822aa91beec99d108a884955f65eb64ca52c3b7c" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", codeSha256: "ff6c08f047407d4c64e677e33d8391f260ecd4da7b4626128e3e8be288676e08", peakResidentKib: 2116720, elapsedSeconds: 81.97, measurementReceiptSha256: "b407c010904eb500245bdb75e366e58099636e72faaf612cc5a7c922f095a4db", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", codeSha256: "8fdf0889719aa7ce4746bd5ca0f2164425b10bbb5cf75abcd101360992ffc341", peakResidentKib: 1613264, elapsedSeconds: 119.89, measurementReceiptSha256: "28a042e590e9f05d67027bbd89939b78be0d46f3a881b780cf5c7a72f2529401", measuredAtCommit: "e92046c014dbfb88cfbb8c1aa0a7ae714a02a1e3" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", codeSha256: "431cac52ac3838a2dc8a8f213181a5d42a0a5d2dfe0ec48745818c75c5b2800b", peakResidentKib: 1207580, elapsedSeconds: 9.44, measurementReceiptSha256: "ec0aa2213b7b66c82fb5c1ec44a2a171ae89333fa69d266e38a9adf203a4aa9f", measuredAtCommit: "c5a9d5a62e334cca7591bd907c60ce245e728f6c" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", codeSha256: "0994ebc60be4d653015c9b50676252d5bf55200b3dcd3d77dd5821ac0881f7eb", peakResidentKib: 851324, elapsedSeconds: 4.36, measurementReceiptSha256: "891a71296b8d89e5b3930d1b0200672a35537b2b59ddcf984d63892ed6a3948b", measuredAtCommit: "55d70e576650b75d32c7188839056f27c720290d" },
    { module: "BpmnSemantics.PortableHandoffConformance", codeSha256: "245f457c93a5ace4ab77c7be51c8c18d59c5aa75b27c9c3161944ae24a920274", peakResidentKib: 1065420, elapsedSeconds: 11.26, measurementReceiptSha256: "a8b03772dab20aca622ee34efd7999c828c888598527fee3d962495a1014b946", measuredAtCommit: "4e15fa4bd280c568ea09a04b6aea93341a9839c2" },
    { module: "BpmnSemantics.EffectDataConformance", codeSha256: "d121fec7ae71bfb6203a11adb4c058d0c60072e704314e46ca92cb66177be06a", peakResidentKib: 1250864, elapsedSeconds: 14.24, measurementReceiptSha256: "ec99195da5124633dc0df9e42c1f61d97a3fe9d1148acbe26b2f62096eea5122", measuredAtCommit: "079c6e720c1487f923b5063be14c74103b060270" },
    {
      module: "BpmnSemantics.TransactionSourceConformance", codeSha256: "7bebd27ac551f93e0355fffcc87f27a3252c7284f494040b8399701d0bc584e8",
      peakResidentKib: 1612540,
      elapsedSeconds: 23.00,
      measurementReceiptSha256: "dba1f19cb677220a3bcab05015690c9b4c730c7003c2ce068de810c5235a0bce",
      measuredAtCommit: "4cd0ad90",
    },
    {
      module: "BpmnSemantics.TransactionSourceArmingConformance", codeSha256: "b990d123fc05158af5ac19769f07e5f85deff23bf31a983fd3719806f47ae49c",
      peakResidentKib: 1528556,
      elapsedSeconds: 21.45,
      measurementReceiptSha256: "bf8270867921fed6fdd2766e9f4bcb65eb391779a650fad0b3bd7da56910e283",
      measuredAtCommit: "4cd0ad90",
    },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", codeSha256: "7c8f79fca5c4e91e8bd4dfda49880f3451ae046e6dfb41fa7ab7757573cd24bf", peakResidentKib: 2882924, elapsedSeconds: 31.23, measurementReceiptSha256: "6cd03b051b22cf4baeb46bab5e913c97acf16e25e1236df0dd793c6d565b5dd5" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", codeSha256: "71167801e0b492522cef16d507c9dd2034dc9a24f1e92abd5484abac24fc04ab", peakResidentKib: 3303752, elapsedSeconds: 11.68, measurementReceiptSha256: "8c0efe6d30efaaabdf1dda5edfda35d5783354a567210eeb46f9107de62e2b62" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", codeSha256: "ca7642bc8d817e346fdd6e96445160d022644386c6b040146bfe0214d09a4e05", peakResidentKib: 2089436, elapsedSeconds: 6.33, measurementReceiptSha256: "2aaec3a679a8d8293ef1d4903c15d4bfd258c9d25b291d7fed50f3d950505326" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", codeSha256: "5376c328288de7c4ff699d04c500bd03e2ddededdf107a84bf3c2b83737ee374", peakResidentKib: 694184, elapsedSeconds: 0.74, measurementReceiptSha256: "c1277fdbc092ed31e7bbccda1269cd074c8b4253fa21cdcfe1c85bcedc81e790" },
    { module: "BpmnSemantics.TransactionCancellationConformance", codeSha256: "13939bf1994ba72fd98bc619d25e82e745c02ea5384c9be9c92f833b75f8c378", peakResidentKib: 739604, elapsedSeconds: 12.61, measurementReceiptSha256: "68307f352f242b4dffbd13ab0a167ab904a9b599567317e78c6965bc3c7aaf21" },
    { module: "BpmnSemantics.TransactionRetentionConformance", codeSha256: "5b3428ac82235a4bc1f165d7773a4af031fa4d4ea021f5a93fcf2792b3bf5afc", peakResidentKib: 627612, elapsedSeconds: 1.49, measurementReceiptSha256: "581c50e29e0328c94dddfed941cc70e6f83721f88162983c810cbb4d7c9524cc" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", codeSha256: "d2e08d6900a87dfba448c525f5e3da2c580eeb9840e39b8e6a2a0d1a2f7fd1a0", peakResidentKib: 2497492, elapsedSeconds: 14.34, measurementReceiptSha256: "05588be1dfea62fdd033a1d3cc7369b339da6d9a842a34726aa44b5f03418f02" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", codeSha256: "359afce41247e00952220c469fe5ea932446abca01f9663a582b6dd8b18f6016", peakResidentKib: 2683848, elapsedSeconds: 12.33, measurementReceiptSha256: "52dd8f8f24f174a562e269e6b9924565ca9b422c964527a90c93ee026d46e7f7" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", codeSha256: "d0dfcdeabf1663ee7f2207cf40c3c7abf0dfb80d6c45e97a010dc34132fbb3f3", peakResidentKib: 3112056, elapsedSeconds: 10.25, measurementReceiptSha256: "f265c5b22259c53e36d8214b14c71d3ef4d9f41d8d1487cf2b20ee54045a6ccf" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", codeSha256: "50ab77a54550bca4618ca2c3dc8f3c0d1343e53b7f87fbe8f68b8e732e71cb35", peakResidentKib: 2784288, elapsedSeconds: 13.46, measurementReceiptSha256: "d311106ff81b99e27ac1d48bc199893d5310ac205154cc93d578f9074665b3cb" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", codeSha256: "b64ccfab7933d2b01476cf7dce7641b62b5e79dbdbb400a6911a00f0bcb84fbb", peakResidentKib: 3200528, elapsedSeconds: 10.99, measurementReceiptSha256: "570f5d9d254522e8dc20b6b4039ffcf5ea3bada81183a91de8fb516aad0d18d0" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", codeSha256: "8849e768d1533b5b846b527bc24b8fd209d018dd7e99ca92513dacee1c7bbe14", peakResidentKib: 587232, elapsedSeconds: 0.43, measurementReceiptSha256: "9d5978226b1cbbaaa07fd0a91062e944f758af7cea8a2d977fbc1a5e6f90fcdc" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", codeSha256: "d32aec6b4c2e8bfc8a28fa245f9a62628fa846dad5ba4ea567212a68e74cec84", peakResidentKib: 1327064, elapsedSeconds: 9.83, measurementReceiptSha256: "c690a6376673270bb77686b991b6e9de606d7ee1b9eede2edc2978b488f1453e" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", codeSha256: "5d4e10fb12dc7e59a981badc77f0fee92a98ff9ce47849fd046df6cc59ad7427", peakResidentKib: 1229212, elapsedSeconds: 5.14, measurementReceiptSha256: "a9f0d1213c3f8870f7d3926a6759fcc7627fb2f7266e51dde8fbb9ff88c9817e" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", codeSha256: "ffbe992349e1b4dcb62ad2428b9c40903136a1d3eb88b75c05d905bfeb98285f", peakResidentKib: 1377844, elapsedSeconds: 9.57, measurementReceiptSha256: "b70eb630bd6a9fb0e1fbdf1f2c61b9a6f3e5d739cac6b3a6d09eea8293c078d8" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", codeSha256: "37bee14f56b8001a062b29e0aaf58f39750b83819979f40145e4654c3d663eea", peakResidentKib: 2664772, elapsedSeconds: 21.35, measurementReceiptSha256: "e55eaee34a5596365e6d74ca2b1eeca3d5e7bbdd0de7d18bba2ffa578007a4f3", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", codeSha256: "caa4f7a3407e17fbdc115077a3c18dec9ee8c0a362d4a6717b8dfab51f64e392", peakResidentKib: 1991084, elapsedSeconds: 30.97, measurementReceiptSha256: "be4c7572447d53d3ee859c5f4abadb6a69afb9b78a64a1f7d31270bac1e7e0b7" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", codeSha256: "ffd0431d0b30f802b6f460b0f63718192f3b82ca31933a1d562a2a8060f351bf", peakResidentKib: 2007128, elapsedSeconds: 44.45, measurementReceiptSha256: "5a6b41fda44e868ad4671fa2b28038f613c3bd4ba0e16f94c56395af356c855c" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", codeSha256: "0f2248506636a020a59290087054b75a04be8cfd8da1e9e28bef9f4495bdc8a7", peakResidentKib: 2735872, elapsedSeconds: 16.97, measurementReceiptSha256: "afd4d278ded008fec16dfd27c722215b1f41cd17b333d816bcb8549779bfb804" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", codeSha256: "83f30443713998bfe060735b928ea8cc2f22b1a9ff5ef70bf1f2964b4b6f06b8", peakResidentKib: 1218336, elapsedSeconds: 12.64, measurementReceiptSha256: "736239e62e8ed55852587eadf1300ad26b0c3309f8039d63dc68f8631585fc0a", measuredAtCommit: "4d4d8d76" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", codeSha256: "8a8bf7e2602beae0ce35a296b8b89ee65ee8edb53dc2345ed3c98d329e85031b", peakResidentKib: 2247008, elapsedSeconds: 190.87, measurementReceiptSha256: "f6faac47483d3385ef2ce6e75facb709d42a3fffaa5db70d3815d07b82cd1611" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", codeSha256: "e9566d9354f4f7cf08809d15650d2a2933e48decd83c4a8ad45e3fb16f326577", peakResidentKib: 2110356, elapsedSeconds: 87.55, measurementReceiptSha256: "e2cf48b535c622a5510088eb27d0aa14c928c2fd5ad7ee6ba52c6b94879d53b2" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", codeSha256: "8a83e76b292a713fc6e74ce3b33b992a16434b09778fb5cf9c01dcdbc7414c31", peakResidentKib: 1368940, elapsedSeconds: 72.62, measuredAtCommit: "b589ab0a" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", codeSha256: "a240e72fd46c4cea1000b21004323ff7fd2023fb7d26e437e984295cf838248e", peakResidentKib: 1049176, elapsedSeconds: 4.40, measuredAtCommit: "52a84367" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", codeSha256: "7337b4bce79aefa0a1a5f413032dbfe79123accb8259f2c85449bc5b9cfa162d", peakResidentKib: 1726820, elapsedSeconds: 12.13, measuredAtCommit: "d7fcdcb0" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", codeSha256: "e0c476aa4da8c3a3dea70f613bc40642df4b824bed0254a4648781afc216e1ad", peakResidentKib: 721184, elapsedSeconds: 1.78, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", codeSha256: "6fcbefdea87e510437af8e4ddb3dd62b9fe991f7aec5750ff17bcf65951fd2d7", peakResidentKib: 658084, elapsedSeconds: 2.23, measuredAtCommit: "bced19a5" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", codeSha256: "99f85da227197415427f87e88d72163faa7da3897ccb48dbb1c2c61000e5ac5d", peakResidentKib: 690964, elapsedSeconds: 1.61, measuredAtCommit: "a97a4ea1" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", codeSha256: "273db2f720c43887b3547604cac3352a26558cd6608111680476cba7a8971d41", peakResidentKib: 1570176, elapsedSeconds: 28.99, measuredAtCommit: "93cfcbf9" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", codeSha256: "c8341f8ca17c0670f67cad55c07597a9b30bbb0b86ad9d04ba9a90575961bcfd", peakResidentKib: 1506192, elapsedSeconds: 11.42, measurementReceiptSha256: "427dfd9f3247ca7ae004bda468bb179ef5a8e81fddef95eb07db500eb5a3e3e6", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", codeSha256: "cc29a2f84dd1a00623e54559d84864b6a7ed2613253dac60b6baf70c69f1ba82", peakResidentKib: 836304, elapsedSeconds: 3.43, measuredAtCommit: "565ff325" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", codeSha256: "a5d1d7e2fee3ef40d781294b64b587325247494f44ab6c59362559fbe18ed86f", peakResidentKib: 1226740, elapsedSeconds: 5.85, measuredAtCommit: "a97a4ea1" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", codeSha256: "642080897c094b5f4f05aa6ee82e6ca3d7ebcb9c8ef66f9ef121ad077d0b059b", peakResidentKib: 1612540, elapsedSeconds: 18.68, measurementReceiptSha256: "a5118c5a530fa69db31720df3f5541ac972dcf49d0ba59072d855948b89b2b06", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", codeSha256: "8effc18af2d80bbcef717edc008e7be69088c2349c368a9576e95294eca8cbfa", peakResidentKib: 642540, elapsedSeconds: 0.84, measurementReceiptSha256: "a8825872e9ff029b44c648a87b6cceab263ebd0a5f70850f405c81d8f7fe736a", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    {
      module: "BpmnSemantics.MessageStartAdmissionConformance", codeSha256: "21409ced0082dbec871fe7cd8e1a8a2d0cbebf28a69dd58411f13ad61a6e642e",
      peakResidentKib: 1810064,
      elapsedSeconds: 9.54,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessageStartClosureConformance", codeSha256: "d2238a2a9e23786fadbb13d382c4d9057944cbeba6b3a1b9d1c69db1b40b20a9",
      peakResidentKib: 1699144,
      elapsedSeconds: 6.92,
      measuredAtCommit: "e9c9db0f",
    },
    {
      module: "BpmnSemantics.MessageStartIdentityConformance", codeSha256: "8dad0e8f8dfb91704214b6be8f38b865c5655d39620b1d43db183d91a47b63f7",
      peakResidentKib: 1539460,
      elapsedSeconds: 7.8,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessageStartScenarioConformance", codeSha256: "1eceb0c006eb7da2e6b267084f99510251047bb6dba0a066d07baa38cb6d101d",
      peakResidentKib: 1419604,
      elapsedSeconds: 6.56,
      measuredAtCommit: "71b45760",
    },
    {
      module: "BpmnSemantics.MessageStartConformance", codeSha256: "cff938052c6968bc180f595e1f8c19377cfe45e455903677221891ffbd915bdf",
      peakResidentKib: 618008,
      elapsedSeconds: 0.35,
      measuredAtCommit: "71b45760",
    },
    { module: "BpmnSemantics.MessagePayloadCatchConformance", codeSha256: "65de8c41cbacd0d7814bc50f2b3b647fbd0c7ee5ce366cae1969933503388dbc", peakResidentKib: 1650488, elapsedSeconds: 42.5, measurementReceiptSha256: "dd9461e73a20c8444eb41b28a9b1acb61e57ff2838911403f0b65d1c5a68d7b6", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.PortableMessagePayloadConformance", codeSha256: "dcb3f8682c7a2b4e64fbc05581a5e86646cfad7137bd1c90c70694c403b47f03", peakResidentKib: 1174816, elapsedSeconds: 25.8, measurementReceiptSha256: "bc162a9c48d4e5f13c17dfc21a16d9d88867d3622f7444aaa5cf7808dcbf0908", measuredAtCommit: "6ec5bd68daeb6c6a2666b337bda57ccc79defeb1" },
    { module: "BpmnSemantics.SequentialMultiInstanceConformance", codeSha256: "87266976246d9e26daf1600a1459c86f206bd89d61e5ea299a828a6ec89f0cdd", peakResidentKib: 766080, elapsedSeconds: 0.84, measurementReceiptSha256: "c654e417b2a4e1af91bb857945eb43f5c6aeeb2f92346865b4eb221822737806", measuredAtCommit: "b39851632faa9db039ac02cbdbc6fed2d9e369e5" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgressConformance", codeSha256: "19f11c46222feff26a697e4a0140318945a5afc2a4d18bc26870a9f3be046754", peakResidentKib: 934092, elapsedSeconds: 1.57, measurementReceiptSha256: "6e7fdabfb9c05395b87b1b87debb22731ec252362172014788b026323009395b", measuredAtCommit: "b39851632faa9db039ac02cbdbc6fed2d9e369e5" },
    {
      module: "BpmnSemantics.SequentialMultiInstanceRuntimeConformance", codeSha256: "19ef593c1319fbcd86a34c33c77cdfc6dd47c788f865ce3f2b7e7a832ebd4f5c",
      peakResidentKib: 2509372,
      elapsedSeconds: 20.11,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceRefusalConformance", codeSha256: "c3cceabeb169e8739653ba2ac4672f5abfd6fb531a2c0a15e3447684d3cf1330",
      peakResidentKib: 1791356,
      elapsedSeconds: 10.21,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance", codeSha256: "edff0c9bccf756ef86b205d8604dd063a6d974db16a9295ed8cf2c4d88b57bd2",
      peakResidentKib: 833720,
      elapsedSeconds: 1.91,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance", codeSha256: "a5a81d262bcf3b3fdd2cfec935ba2a6d7193f51d8d308cb269de1881236aaa7f",
      peakResidentKib: 620612,
      elapsedSeconds: 0.66,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", codeSha256: "2bf599b9b1e457c59894b55d8bec05f4b31f4a500fb2628acad3bdf6808d7f01",
      peakResidentKib: 639644,
      elapsedSeconds: 2.21,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", codeSha256: "518b9bb9d453f1377c6182ded7e0f0c8663a00e62b0da70c6226a26c237022ff",
      peakResidentKib: 2172304,
      elapsedSeconds: 13.87,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance", codeSha256: "2aa7ea94bf1572f21f25b0aab056763e9f4df6a3c6f0f51ab60f7c81c5fdb197",
      peakResidentKib: 1699276,
      elapsedSeconds: 9.89,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance", codeSha256: "fc9f0e944ec92216c7b55cee222148b7c3415f686fec7f440d17ee06faad4688",
      peakResidentKib: 2333280,
      elapsedSeconds: 16.1,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance", codeSha256: "7f65610c03d72d56ad2ec975c6eed5c7eed4ed23736157885f6975940d6566b8",
      peakResidentKib: 2086828,
      elapsedSeconds: 14.06,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance", codeSha256: "25915b01b5fbc1ae0345249caab499caf1b57d5d16c5879cd94c72e79ea4fdd0",
      peakResidentKib: 751784,
      elapsedSeconds: 1.07,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedConformance", codeSha256: "9271611fedc4f08a78731747a4df84dc2b265ee103e0e818ae5515446ccb6e8b",
      peakResidentKib: 619360,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance", codeSha256: "6da14c455613ebdd45c6bfcd933d10e97b4920796cf1de9525f17f52f1e59314",
      peakResidentKib: 1183920,
      elapsedSeconds: 20.24,
      measuredAtCommit: "5fa6dfe3",
    },
    { module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", codeSha256: "6a4e04121ecf61cd174fba9e544ab123ea1d3241ba81b7b70844e6fb8e5e1080", peakResidentKib: 1217808, elapsedSeconds: 13.97, measurementReceiptSha256: "dca0ba4808198cef6cb747abb5e324b849e7d4f03f13908b52f3f3a5df5a296d", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", codeSha256: "53871dc4a721f354bc4fa633bab48ed462085f47a979807acb8980edc020d6fc",
      peakResidentKib: 1832044,
      elapsedSeconds: 14.57,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.CallActivityConformance", codeSha256: "70d8f90fe5b7c812eadb18e079d3e629c77fa423d93c2e5c0c2995b7d056503b", peakResidentKib: 1458860, elapsedSeconds: 72.67, measurementReceiptSha256: "8fbb92485679a9f06224979b86201a8eda11ffad9b95b573c7b5209efe656799", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.CallActivityPairingConformance", codeSha256: "b2bc51b3d839d89386b8c39ad462b45439369af8ec91b0b1f37bddd644cfd631", peakResidentKib: 1170064, elapsedSeconds: 2.95, measurementReceiptSha256: "099c86e1e43ce1c8c23013fbb83f391b8a1a33db29d6eaf00b3d42a874d20343", measuredAtCommit: "b304150e" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", codeSha256: "d394aeb662887ee7dbd531b56257252ef7dd8521684cfe749894f4d4ec9f4cea", peakResidentKib: 1679172, elapsedSeconds: 37.5, measurementReceiptSha256: "c3ea255cea07886723655e7ead6cb91c15ae62f781f6afc398b15ea8ddc2fea0", measuredAtCommit: "b9d1fa06e6802d1ecfff07f7574eb6860c75e46e" },
    {
      module: "BpmnSemantics.TimerStartConformance", codeSha256: "10b1e44705e3786c89f917c47f4d4d7f530fe39b60db5c48398825e0c9598419",
      peakResidentKib: 1438340,
      elapsedSeconds: 29.87,
      measurementReceiptSha256: "421a88a60904c60f29d600633c2668e5e33de2e61604d5e19e7bb66d94bf5a9f",
    },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", codeSha256: "e39e4891f28f959bb999517b091f5f993c5da169fa7e873e6d843f389c2e1cbb", peakResidentKib: 1739644, elapsedSeconds: 52.14, measurementReceiptSha256: "9ec9ed00c083dfe156c3c4a85ddff0a9182d8887b8aceca404a847129ad086ae", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    {
      module: "BpmnSemantics.RuntimeStateActivityConformance", codeSha256: "c7c675fa9958593a73f0b4492255e3c8e762a15b5b4c4f1eb460b752e91349eb",
      peakResidentKib: 618664,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", codeSha256: "4cb6f8ce6548bd2834efee8bb433c983f5aee939abe29c4d754b2f346d258c46", peakResidentKib: 1353184, elapsedSeconds: 16.55, measurementReceiptSha256: "1367d065c9907d40221099072a07aaf17d80f4cca05c0b64c0ba2bffc41b4d8e", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", codeSha256: "fcbf3e59d80b53a51bc85399aac944f2b120d93372df35a9fd9645231f58c69b", peakResidentKib: 1013076, elapsedSeconds: 15.20, measuredAtCommit: "6d231a2b" },
    { module: "BpmnSemantics.ScopeCancellationConformance", codeSha256: "0ccfcb2997a86e7e05d1959f6bca6bae02a872c6936f14563e33d53d939819f4", peakResidentKib: 631384, elapsedSeconds: 0.85, measurementReceiptSha256: "b49308779f070851798ed6d40112455f61fb47f0e914c20d49c9f5a61bbf28b9", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.ScopeCompletionConformance", codeSha256: "967651e5d3809fce25449a329a5de37ed4ed5703b86aabad9d7065af32555755", peakResidentKib: 587916, elapsedSeconds: 0.54, measuredAtCommit: "0958697d" },
    {
      module: "BpmnSemantics.RuntimeStateControllerConformance", codeSha256: "ca7922a0af0fd699a468988b4c0c69b3f0960b969515c503c7a97454d12ba3f4",
      peakResidentKib: 2089244,
      elapsedSeconds: 16,
      measuredAtCommit: "da6e6477",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", codeSha256: "7e15a6cb05d400c68b29da524a68dd4dbd9aba517013b9592fa834bb02104b60",
      peakResidentKib: 615444,
      elapsedSeconds: 1.41,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", codeSha256: "a6a9fcbb0d064c38953aa7b26c1eb8d3b4b87eae5c7d7c1f05efedae2660724d",
      peakResidentKib: 1802080,
      elapsedSeconds: 11.73,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", codeSha256: "0c7655c6ac9a7700364f20603e75d32cba8469e4c7d6980dc63fd87ca21064f7",
      peakResidentKib: 2076884,
      elapsedSeconds: 13.87,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", codeSha256: "2ae8d93589f0bbab91122269704ac3e3895646bb56f8a2160887976ac33af38d",
      peakResidentKib: 2439560,
      elapsedSeconds: 24.56,
      measuredAtCommit: "223486be",
    },
    {
      module: "BpmnSemantics.SemanticProcessAdmissionConformance", codeSha256: "3e6ca648f89af0ce01ac90fa428857640a3148f96ff435c4cd9c2a8d4e42ac3f",
      peakResidentKib: 2713164,
      elapsedSeconds: 17.08,
      measuredAtCommit: "a52f0c39",
    },
    { module: "BpmnSemantics.EventBasedGatewayConformance", codeSha256: "bf961f0034290d91f22cccd9fd441340e5729ce933b91cf286238cb400b8d17f", peakResidentKib: 1469588, elapsedSeconds: 24.95, measurementReceiptSha256: "d0173af60a2491ac2186e2e25c1eec67e8b5f13e824b581e5df95d8c076fbd4f", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", codeSha256: "74204696c166c92fc732bd022cb814e6b342f148b9fb407f3348ab60c2e3bbda", peakResidentKib: 2367304, elapsedSeconds: 40.77, measurementReceiptSha256: "6fea56611b134a8225a9a55867c38eaf66d09a547d854a4c6ed4b5189de86950" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", codeSha256: "2588e826ca1327e57f86b19ebad79d5e5ae2005d3f472ba675e868c4a22bf5e3", peakResidentKib: 1514392, elapsedSeconds: 28.54, measurementReceiptSha256: "fa0047938f0da13dfa47a7dbeb656afb45359f749af731f0be8e00c4ef383454" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", codeSha256: "4eb240ca605e9edcb70d40d489f02a0ba67a71c51d0ddfc9da3d73f699d00d76", peakResidentKib: 1580772, elapsedSeconds: 15.26, measurementReceiptSha256: "9ba40e7c8e83d8983c86e7a72f1c31205fdc1e300ab739dcaef28e09066391e0", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", codeSha256: "06af1d2c569b90eade0f33c45cc3869de0aaf0203d23b3340a37a285e0d62202", peakResidentKib: 2225108, elapsedSeconds: 11.7 },
    { module: "BpmnSemantics.TerminateEndEventConformance", codeSha256: "6bead8c833bf5010b97a2b42bb5be6af11575633b5d8c2b7a52f2e9a7a927fb6", peakResidentKib: 1701836, elapsedSeconds: 35.47, measurementReceiptSha256: "52324fa2defc78171911b728262ce8d967ff514fa7ff40e8ba5e9e6afb67af7c", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.RegionalRemovalOwnerCoverageConformance", codeSha256: "74b73afd567d554ef2a33f9af532533a7df215494f0f5be6998974166f6a81de", peakResidentKib: 1405092, elapsedSeconds: 10.0, measurementReceiptSha256: "f4ea1ce599ca2bbcc043cdfc3dd3e06cbb8de0bd26bef67b3fb8dfe0d9ce9d7c", measuredAtCommit: "0b3aeaaaec9d238ba8b0bacd53ed811fe7e6de45" },
    { module: "BpmnSemantics.SemanticProcessConformance", codeSha256: "7d3ef022a3563f1993ec77710cd4e1631cd4d732bff02b3c84d7a753a6decf83", peakResidentKib: 2203824, elapsedSeconds: 8.9 },
    {
      module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", codeSha256: "5d06354c310db0a5bcfeeb38440aa22d89bbae702c329bc72b78a5b539a48653",
      peakResidentKib: 2432344,
      elapsedSeconds: 23.34,
      measuredAtCommit: "6208f2e4",
    },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", codeSha256: "b4aaff08384b1b7b1518a1ca5a84b938fb712e49d65005f9933000e2fd7b5eaa", peakResidentKib: 1319948, elapsedSeconds: 17.76, measurementReceiptSha256: "9edc0cf0c06431aa21d917937698ce86a9ca044abd655cb2c8860482ff179044" },
    { module: "BpmnSemantics.ActivityDataInputConformance", codeSha256: "52cba016ca026c96b4a2c5bd55c37b6d888c7adaecd176d85c8331eee7b0b2eb", peakResidentKib: 1217356, elapsedSeconds: 40.99, measurementReceiptSha256: "69318b7b55912b89dda49ef2d2710a98d928c467efbe5648fd40a58837842f79", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", codeSha256: "51469cd289a123b9c3b0aac84e3d3a33e5cdede5391c6d5c164bda680662dfbc", peakResidentKib: 1330152, elapsedSeconds: 20.16, measurementReceiptSha256: "89aa8fd739f9aec002a812ee56a636b12bda8e45b0d80e60658e78e85c6684b9", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.MappedSuccessConformance", codeSha256: "aabbce8a5fa35feece11bf4eecd3f79e80f4fab234a3aad02ddc3bef00066630", peakResidentKib: 1540920, elapsedSeconds: 20.53, measurementReceiptSha256: "ff3355722a37d2e310c81347773ee187e54c71cdc5982374547471961ecd5260", measuredAtCommit: "fee496d4bd5d729fbccb283de78de1606388dd7f" },
    { module: "BpmnSemantics.InclusiveGatewayConformance", codeSha256: "31f230b6ca3eccbc0c1d817e5fa3de328c69230d21c41e31bb0bb8061e5c3745", peakResidentKib: 1578836, elapsedSeconds: 22.51, measurementReceiptSha256: "a4e683989719bc877200053a07e2ab8163651f72e291985a2e020f7dcaf10277", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", codeSha256: "2005bdfad8183cadc916a9c72d907cd7bc64f4889400580091560f7e5800198e", peakResidentKib: 1981884, elapsedSeconds: 24.5 },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", codeSha256: "7a8336b73c7c7a284dd91399b0fb817e8aa72109742e77184b6f5d9d6c53d729", peakResidentKib: 1149996, elapsedSeconds: 15.32, measurementReceiptSha256: "ac09c2acf915de48d80e55ddc450cbec277e0b715f9d2b6d924e9d31467ca8fc", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", codeSha256: "55756f14172b30542dac8b327ce2b60a34363f6d50697af4db8ecfcc11974d3d", peakResidentKib: 1926344, elapsedSeconds: 11.0 },
    {
      module: "BpmnSemantics.InternalCommutationConformance", codeSha256: "5f23659740ae2474b8ebd0c3a53aade46dc507ac481aa81461ef0862e90b4422",
      peakResidentKib: 1288936,
      elapsedSeconds: 10.86,
      measurementReceiptSha256: "a836939c202072965c700b568492e38cfd346628584fc39f77726a391fb1dc53",
      measuredAtCommit: "df8a6c2d",
    },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", codeSha256: "f226700ee58edf5ba5e2d47702a572bfaf957c58f8311670ad0ea0cdfed6a953", peakResidentKib: 1261436, elapsedSeconds: 14.90, measuredAtCommit: "cbb78a11" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", codeSha256: "5c327bf2fd8815049e954e35600390adc9f2dc9b9735fc4287eea072f4eb86a0", peakResidentKib: 2447360, elapsedSeconds: 18.21, measuredAtCommit: "5fa6dfe3" },
    { module: "BpmnSemantics.CompensationSourceJsonConformance", codeSha256: "6ed0557fba2e6789d43413871fd928e2dcaa5e644b3da5212fdf7a1ba420ecf4", peakResidentKib: 2326880, elapsedSeconds: 12.15, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceCompatibilityConformance", codeSha256: "7c0e4543946eaae8c2772fe9a92d235631475c4b8d2481d3f4b44c2fae76c24f", peakResidentKib: 2023220, elapsedSeconds: 14.78, measuredAtCommit: "05244cf7" },
    { module: "BpmnSemantics.CompensationSourceBindingReferenceConformance", codeSha256: "fc87e0259b14e7067d23cceefe6c0382ecf0d14bef332aca4a7bd4770836945b", peakResidentKib: 2725808, elapsedSeconds: 31.89, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingTriggerConformance", codeSha256: "5deae7eee16cb6da5ec56ee323d592e53feb2456d6efa8994b6d0137969f45e5", peakResidentKib: 2379680, elapsedSeconds: 20.36, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingStorageLimitConformance", codeSha256: "2722c06f1111078b469a9b98ff48ab70b9f054e4636ada1a967ff5f441551fbc", peakResidentKib: 2701156, elapsedSeconds: 33.68, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingExecutionLimitConformance", codeSha256: "ef2decddf1ed3963a273f456acbf56cd3b827e33e12f2a83d15953843f2a4e2a", peakResidentKib: 2574272, elapsedSeconds: 25.21, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingValidProgramConformance", codeSha256: "76fc8358230e4000ed7d81b782ef5b7ab288d805e3f92fc59b0d5d3141eeee06", peakResidentKib: 1833660, elapsedSeconds: 11.43, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceBindingConformance", codeSha256: "2b3c4da1f85aff031c071c1127b3e28938b2b9e83c073eacba7d24ca7714208f", peakResidentKib: 635228, elapsedSeconds: 0.5, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceLoweringConformance", codeSha256: "ea5f9eb09df84368e77cffbbfd3dae14e2fd6d48189dedfc2f1658b020616890", peakResidentKib: 635272, elapsedSeconds: 0.59, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance", codeSha256: "2c774d51df17fe089345387c8f6d44dc1afa2903d42e2d84fc24f7cd9bf416a0", peakResidentKib: 821532, elapsedSeconds: 5.14, measuredAtCommit: "7b0b5151" },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerProgramContractConformance", codeSha256: "c5e0902393f69fd293235aa64d98f82f705302d23f5dfd5a96d7041111819b45",
      peakResidentKib: 889480,
      elapsedSeconds: 2.60,
      measuredAtCommit: "4b2a304f",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance", codeSha256: "a053efbc5e0dd3c2bab82790e72dc4c377aab936d5358608299eba5cfd693bc9",
      peakResidentKib: 705308,
      elapsedSeconds: 0.68,
      measuredAtCommit: "ef739572",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerRuntimeConformance", codeSha256: "5f2f1b660dd9a62b33168b872bf15695a968fdbaaee03d1882addf45a40eaab5",
      peakResidentKib: 1292220,
      elapsedSeconds: 4.78,
      measuredAtCommit: "eed22392",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance", codeSha256: "e221e8998ef745348d42c0d25a7e662c042c4068c7f86392b38d5291b66e958e",
      peakResidentKib: 1892392,
      elapsedSeconds: 11.19,
      measuredAtCommit: "7126d5db",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", codeSha256: "032287fe90df67215508def03e41e8edbc6d0dd2ddab118529511b5dddd2ed00",
      peakResidentKib: 1626092,
      elapsedSeconds: 40.51,
      measurementReceiptSha256: "04a66afd41fa8d867f61c76c6b808b2dbc8315674c8d23f4856b6698331af1e5",
      measuredAtCommit: "0b3aeaaaec9d238ba8b0bacd53ed811fe7e6de45",
    },
    {
      module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance", codeSha256: "bce409b80c8ed28c385e40956440068ab2874013e652297f869465020f8a1a1a",
      peakResidentKib: 614680,
      elapsedSeconds: 0.58,
      measuredAtCommit: "3020899b",
    },
    {
      module: "BpmnSemantics.CompensationActivityRetentionProducerConformance", codeSha256: "4452331575c193504b78ce5e05d4bd31cb171594ecffb6c2dc06f345d08884cf",
      peakResidentKib: 2332716,
      elapsedSeconds: 8.4,
      measuredAtCommit: "cb7fd54e",
    },
    {
      module: "BpmnSemantics.CompensationActivityRetentionConformance", codeSha256: "f54d9f991738299766bb009c71a04ae1701058dce06edef137ef36a21d71b594",
      peakResidentKib: 1916172,
      elapsedSeconds: 6.68,
      measuredAtCommit: "ef739572",
    },
    { module: "BpmnSemantics.UserTaskMetadataConformance", codeSha256: "0d41a1c241af4dfc13aaa504a85c938a822fb2b2d1d93c8eb4d6e8a2659d3316", peakResidentKib: 1380920, elapsedSeconds: 31.18, measurementReceiptSha256: "b7e8907fa663ad6aad4c063f77ab8e23edf58bd3511c7b56a23e9c4904165c4d", measuredAtCommit: "9d25c01dc576a61b587d1d06d280baf45a270deb" },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", codeSha256: "3c975247cde72f1f68383887b978d56731c7eeb161aa0fd85b202a2e9450b5dd", peakResidentKib: 1094580, elapsedSeconds: 7.35, measurementReceiptSha256: "4542a05dab81e6bfd8f222b221a7608bf41a1f6eadd1dc95b298dc02f19211ef", measuredAtCommit: "e92046c014dbfb88cfbb8c1aa0a7ae714a02a1e3" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", codeSha256: "70fb44c9baa40d217cdf7726b9fd216ac352f3f52fbcbb2a5bf06de059b8f3f4", peakResidentKib: 788884, elapsedSeconds: 2.11, measurementReceiptSha256: "f7074052ed824aeaa12b7a2c63c6fd828bf144b57394b89e4f716f184de023a8", measuredAtCommit: "8d3927f6" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", codeSha256: "9a981b9c9406147c00fdf4119da3bca17af098a44ac12f3ad01e314c2153f656", peakResidentKib: 1088924, elapsedSeconds: 1.68, measurementReceiptSha256: "4d17d3e9780ea6aca2324767ea32a10bc8b2891e5fda5800d43dbc5ef34aca0e", measuredAtCommit: "ee17ed58" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", codeSha256: "ef2aa57b010c695910c86c8e27ea84b3cf190342e1d5adb12f611cef8fd13af9", peakResidentKib: 1288416, elapsedSeconds: 9.54, measuredAtCommit: "ee17ed58" },
    { module: "BpmnSemantics.ActivityDataOutputConformance", codeSha256: "7445954bf729692a8805b4c0d16b1f00fec8c4b9fee19e2103552b0c8183ee2c", peakResidentKib: 1394652, elapsedSeconds: 18.61, measurementReceiptSha256: "ed4327102b7a976e241d0af19d745db546cf94733ca5bff332ce7017fb7ef548", measuredAtCommit: "de03c7b1" },
    { module: "BpmnSemantics.ReceiveTaskConformance", codeSha256: "4fb157ae453a84707a77d1f5a11bebd5e168db0aa8722061733f22eb04c510fe", peakResidentKib: 1679876, elapsedSeconds: 19.3 },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", codeSha256: "6428c589b542de2d3c594f82fc8cf0f75bc33bd87d84f216f6148525f0464d56", peakResidentKib: 1676016, elapsedSeconds: 10.7 },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", codeSha256: "7ccadccca9d38731148436ee5a5cfd877ec49ddda7959ed4ca76ffb8d4ede13e",
      peakResidentKib: 1464728,
      elapsedSeconds: 6.92,
      measuredAtCommit: "1fda9213",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotConformance", codeSha256: "c8a2563882b08fb8e675551e151a4fe326d91a81df34906e4e59350dd840a0f8",
      peakResidentKib: 2825652,
      elapsedSeconds: 13.24,
      measuredAtCommit: "7b70b7cc",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance", codeSha256: "b6cbcaec08f048b663e9e59eec8c797161ab32cd46bf9f97b4ed5098800cab26",
      peakResidentKib: 1933028,
      elapsedSeconds: 15.25,
      measuredAtCommit: "5fa6dfe3",
    },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance", codeSha256: "6b14be6bb70b2302165dcdf130912caa27425c41ed0419e5a82e6928835822fc", peakResidentKib: 1565576, elapsedSeconds: 20.63, measurementReceiptSha256: "796f19cbdfbea95d5211fe3b9bcbe7d7f319263f5b30c9215544b3af6f6d4f25", measuredAtCommit: "a97a4ea1" },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorProgramConformance", codeSha256: "db1dc0096a62dbc8dc5b054d6e6375ac118c3051ed5f37282b69dbf47e554dac",
      peakResidentKib: 1755796,
      elapsedSeconds: 6.54,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorReadyStateConformance", codeSha256: "8a5cf5d681b61ecc0ee8cdf7bebf15adf75d8550e2809afaa8f20c3d7ba1fde0",
      peakResidentKib: 1898152,
      elapsedSeconds: 5.99,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorOutcomeConformance", codeSha256: "0c8c9b5074c83332720f2f432dbcd20f933a773fe165e3cfb45b9b77b985df2f",
      peakResidentKib: 2545104,
      elapsedSeconds: 9.94,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorPurgeConformance", codeSha256: "409c1b553969946753427fd0673494e8e78ddaa915078a6b2812638153d0a554",
      peakResidentKib: 2546956,
      elapsedSeconds: 11.64,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorRecoveryConformance", codeSha256: "94e4b025a688d0f64210a1b442d448c0b96cc9bcdc01fa257abef31c148243d8",
      peakResidentKib: 2545196,
      elapsedSeconds: 10.55,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance", codeSha256: "ccb1599bbb823d034c2fa6a533ad8e98165dc961e515b13d8b6cc20913cc78f3",
      peakResidentKib: 1977500,
      elapsedSeconds: 6.55,
      measuredAtCommit: "ef739572",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance", codeSha256: "1dd773f17fe674da99e102979fefed4ba766192d982398eca081e345d14a3284",
      peakResidentKib: 642024,
      elapsedSeconds: 0.67,
      measuredAtCommit: "bd2bef03",
    },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance", codeSha256: "16c641bd34502874eac8103b0b82aa5bed4cdcd482e351caaf5342148bb71301",
      peakResidentKib: 622884,
      elapsedSeconds: 0.47,
      measuredAtCommit: "bd2bef03",
    },
    { module: "BpmnSemantics.UserTaskInteractionConformance", codeSha256: "107ef4e87310ee3e2515e5d95654e90d9bf17990b40c618e9be8d870a225a57d", peakResidentKib: 1098584, elapsedSeconds: 6.95, measurementReceiptSha256: "b4e33b40bc4b115f200b38005b533a769c98206461362f047031aa19fc003cfe", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", codeSha256: "1823c935964a36f6dad6edda0e2ef4f5b33ca24d03bdf596c077ad42e20ec4cf", peakResidentKib: 1661596, elapsedSeconds: 9.48, measuredAtCommit: "24d92a7c" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", codeSha256: "40a6285998cde19120079dacbacc06e7fe892caf508a21a6c44eee2c09fcc855", peakResidentKib: 1424676, elapsedSeconds: 13.27, measurementReceiptSha256: "f877c4ba1e8ef2172c4dc50ed59bc72118f1a352bea4d9867e57f31cf7251d4f", measuredAtCommit: "30906e65dd77c839979b4bedbf1869c7578d1c60" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", codeSha256: "88354c6c1b9bb0456dbb197d82aee50cabf5d3075c729445f3df62785419e880", peakResidentKib: 1051596, elapsedSeconds: 6.3, measurementReceiptSha256: "2d56d7e6745d0a525fc94a045138b8011fcab08ff6f00497dc61fca0a7dcac2e", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", codeSha256: "800a8eb262036d536dac14e1f71ab604b17262b723dcf97b1729bd068f5463f2", peakResidentKib: 1382440, elapsedSeconds: 3.8 },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", codeSha256: "a29ee5178bd07f2f3af0a7d1a05757bf6a3db41405a5d1cf5b61cd2961458776", peakResidentKib: 1464712, elapsedSeconds: 7.79, measurementReceiptSha256: "9ffd2f000aee896112f665fd49017e6fc80e10cf46e27ca479aabf6578c25485", measuredAtCommit: "519c7c5e" },
    {
      module: "BpmnSemantics.ActivityBoundaryMessageConformance", codeSha256: "9726943878bdde0e737d823187bea8cba51284d32a81e6ae8427a58d450077b9",
      peakResidentKib: 2807968,
      elapsedSeconds: 23.32,
      measuredAtCommit: "81c0703c",
    },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", codeSha256: "397304593d31c416f0ca1563942e24d321ab0d8ceb5b78f539a0190040f345b1", peakResidentKib: 1188100, elapsedSeconds: 6.58, measurementReceiptSha256: "c73c34db1d4538a059b92902f04711650f7574973c05dfa9e783f3ee2961b3d3", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", codeSha256: "8378cadc2889c9dbb8d7f9f33c8f8e61df71606a25b22899b23ed77c670e0343", peakResidentKib: 1179760, elapsedSeconds: 5.43, measurementReceiptSha256: "03df62a46af04fd0b7308e5c8650f4ad021e99b6c28b17026ba1272aa65c5148", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", codeSha256: "52523e0f0cd1cf1a7388ad6976eb350d74340740cb19591358099ded3d892d8f", peakResidentKib: 1201352, elapsedSeconds: 2.9 },
    {
      module: "BpmnSemantics.StructuredHumanWorkConformance", codeSha256: "b4465394aa79d04600759c84435d064219f2c14fcab5796a5f566fcc1ca70d44",
      peakResidentKib: 1054660,
      elapsedSeconds: 3.46,
      measuredAtCommit: "826231ab",
    },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", codeSha256: "8914998ca6b6a95a5c992f27357021a7b3fcd527491b68b2266ba571cad3bb06", peakResidentKib: 1034532, elapsedSeconds: 2.19, measurementReceiptSha256: "38fb13fd8daa6047bef5e923263d6a177615775b603205862202ca88d52e43f9", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ProcessStartDataConformance", codeSha256: "04614508f021fb96ac3f6e37fc69b8da1deb254fec2cf7ae7b311a488aade05e", peakResidentKib: 930116, elapsedSeconds: 2.37, measurementReceiptSha256: "af556b87b3d6930428357a8cf60779cfa10b4790dbcbd7eb48370e71a1c2b6e9", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    {
      module: "BpmnSemantics.ParallelMultiInstanceConformance", codeSha256: "0e44c0554c6ae3d562001796da208848d6b2bb372e5e72b284ea8966f8495e56",
      peakResidentKib: 1433212,
      elapsedSeconds: 3.32,
      measuredAtCommit: "42f152de",
    },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", codeSha256: "e023bababd249eda10f4ed9443a49622dac2e785f34e5d69cff0b242741782bf", peakResidentKib: 839556, elapsedSeconds: 3.9 },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", codeSha256: "cf83dac55961aec0ff93dd9954640eec25f4d3aac4a5201a5e78cc2ee94df4bd", peakResidentKib: 1128448, elapsedSeconds: 3.6, measurementReceiptSha256: "4cb3f2dc24d7659a01e147679bb5a198c37f94236c4911227dff9275d6ec86b2", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", codeSha256: "72257c4843040a6d72caee2257dd686c885750f2764f9768f1de67ccaedd93f0",
      peakResidentKib: 825916,
      elapsedSeconds: 3.44,
      measuredAtCommit: "223486be",
    },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", codeSha256: "b120ce86e357af06a9ae3c1b99c4e2f033537bf610d5f7f233df7e130b6d4b4f", peakResidentKib: 797380, elapsedSeconds: 1.87, measurementReceiptSha256: "b0c66f99a8c18d30f84d7780f970d425592cbce2cb1226ba60e82ed508ee2174", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.SemanticProcessJsonConformance", codeSha256: "067451a7b9d1c988a0278842fa90bb6a3a38ecc39a8c631ab96b93ec556be6b5", peakResidentKib: 1023744, elapsedSeconds: 5.35, measurementReceiptSha256: "daeb90ed2d861a49c28597f9e43f6513f9bbcc69be426acb224a124993897c91", measuredAtCommit: "fedb885082e2e0eeadc7c6e56b2bf92bb5d0328a" },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance", codeSha256: "f377566a31e838767ce74618cfa801cd75b093a3b98d085db077d918240217e7",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", codeSha256: "1f6d978bd0840292f1f137cd280677c79aea6ea7e2cec85393d966ae93e8fb3e", peakResidentKib: 646452, elapsedSeconds: 0.7 },
    { module: "BpmnSemantics.ActivityIssuingDisciplineConformance", codeSha256: "273a963f3612e9638c72e9cb7d6e737728933eefb7b1b49d9c770b51b746abbc", peakResidentKib: 625128, elapsedSeconds: 0.66, measurementReceiptSha256: "b6a735a8a147bc841d3f67ebe34b3f2940af8978448c763cc7d71588a205c05c", measuredAtCommit: "21f472140d6a286d62d9b8f8fe1c4ebcdd776e76" },
    { module: "BpmnSemantics.Conformance", codeSha256: "95bdd67dbe2cf2d5c33649e154ed139127be41a3510886314921a8e9c869e038", peakResidentKib: 508576, elapsedSeconds: 0.3 },
    { module: "BpmnSemantics.ParallelForkJoinConformance", codeSha256: "e8c63f15a2151865149fcf24e48e1a7a27bd9d9d1af9e9959062e6c73157bb66", peakResidentKib: 500536, elapsedSeconds: 0.3 },
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
        [row.module, row.peakResidentKib, measurementIdentityFor(record, row), row.codeSha256] as const,
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
