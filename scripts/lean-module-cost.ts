/**
 * Recorded per-module cost of the Lean conformance corpus. The pure comparison
 * lives in [lean-module-cost-comparison.ts](./lean-module-cost-comparison.ts).
 *
 * Conformance modules kernel-decide fixtures unless they hold executable checks,
 * and kernel reduction holds its terms in resident memory, so reduction depth and proof ownership carry a
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
    "BpmnSemantics.NestedScopeControlConformance",
    "BpmnSemantics.TransactionCancellationActivePublicationConformance",
    "BpmnSemantics.TransactionCancellationFailurePublicationConformance",
    "BpmnSemantics.TransactionCancellationJoinPublicationConformance",
  ],
  rows: [
    { module: "BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageConformance", codeSha256: "b4d6731072948f477885546dbd813d52037782f5d851d34bd504902ce3cafb92", peakResidentKib: 664976, elapsedSeconds: 5.58, measurementReceiptSha256: "ba7ec1dc574d94cd459429209f75cbc1271047557ce8012798e88a86046a5f91", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.SequentialScopeGraphConformance", codeSha256: "dd30c9435b4aa4dba3c7d595691d8ab04679a130c4a2dabe906c09dc2ad195d7", peakResidentKib: 1494136, elapsedSeconds: 82.08, measurementReceiptSha256: "3414e91b1618169ace4aa5f5245ae7ea8252d127dc68d11f1b1e96aab770c5fa", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", codeSha256: "89a7f26f62184f968eaa7b1f113a35459c6595ad1ea238dc1f8704fbd2d8a66d", peakResidentKib: 357268, elapsedSeconds: 0.88, measurementReceiptSha256: "f362ecb9dcc3293b467d5c749f0ee5ad6b3d374fbf6b8d76ef21d4996502e1b3", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.NestedScopeDataConformance", codeSha256: "b7836d441e36871a2c96226bb1ece67e3c45dd571a65d8478329e4c650e0fba4", peakResidentKib: 2147352, elapsedSeconds: 31.32, measurementReceiptSha256: "bdff834114a1a21a957e32852a554d400c3344ee0ae1c3f12a2aff43871658bd", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CallVariableMappingConformance", codeSha256: "8a54319010f77209be230af20e5394265a3c050ff5ac4802ebef0151484a538d", peakResidentKib: 470372, elapsedSeconds: 1.26, measurementReceiptSha256: "ca750f6797390ead45a5b539b39f7aa237b32169193987605771c022998bdbf0", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.NestedScopeControlConformance", codeSha256: "67634388225359ac90cbd4867f8d0caa5e0e15f15c5826a76e024f3f9f62094d", peakResidentKib: 2842484, elapsedSeconds: 143.53, measurementReceiptSha256: "8f730b9a353858920391df926500582a397dbd7a37380b357340a3b7098fff5e", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsAdmissionConformance", codeSha256: "e403c2e7dee35e2a9a10e25c8eba05fcc137447130ab31c34b159ba118d2a4f1", peakResidentKib: 2281160, elapsedSeconds: 39.09, measurementReceiptSha256: "92b8f5f1effee144e05e3c7c18a395600d55fada465e542154eaf535373e643c", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsConformance", codeSha256: "50eee2fd5fe10c607d4a18f5e4544eeaa4419afce221da895fd1ee5eea57247f", peakResidentKib: 2172204, elapsedSeconds: 89.03, measurementReceiptSha256: "bbf00783b95fa325bd88b3b882a0fa87440e28c26e94c6fd253f94d44813a787", measuredAtCommit: "b3e0b01e71473575c131e213c6e4149804d227d8" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsAdmissionConformance", codeSha256: "39c486010861819f2075736bceba42f3beefc26b4d706c63ae76da35f974ec6c", peakResidentKib: 737700, elapsedSeconds: 0.95, measurementReceiptSha256: "84a7498b55ea515985f3a4773e4d67407676949c3d12ad8d829edb186972e8fa", measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsConformance", codeSha256: "fd388d170797b88b1a248525de1c9cc10c42f7455c99f036e88edf0ab60595a1", peakResidentKib: 752508, elapsedSeconds: 1.08, measurementReceiptSha256: "3af9555c50d7587a13058bfc7b23da15d74728bbfc4ee08b14e612f74f5e75fe", measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", codeSha256: "3776eec7f90e9ac611c2b81315126f14f963368ce6f9244d850c57be1b3bf1fd", peakResidentKib: 1110484, elapsedSeconds: 9.43, measurementReceiptSha256: "ca3ccf4acd64ea8d3cfe00f0a5af67ec3886a40db5ee7083e4861fcde3287e7f", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", codeSha256: "64cf80360270db589d23a856a51b7ce83d227539cd076180c522ad82bb4e4ebe", peakResidentKib: 1365008, elapsedSeconds: 28.27, measurementReceiptSha256: "76daba090094c0b57e607766caa315d9ff0bad8f0caf7933b3b163d30b9c385d", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", codeSha256: "205fd234c4f60d9ae1cad99bf5a2233da800d4bc588c090b34c6338ec3c55764", peakResidentKib: 1842264, elapsedSeconds: 28.88, measurementReceiptSha256: "2b99d852eb5b8372ec0b2ad3332d93afbfaab0b33b40310f99956ea1a562e300", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", codeSha256: "e3aa0ab21412b47e7ffd71ab6cf9221992f2637fe959daa1c0d9516ec415dcdd", peakResidentKib: 1676272, elapsedSeconds: 130.85, measurementReceiptSha256: "40ffd08dbd425f08cf9c1d3e5c87704375a0b29a311e7cc87e287d8f5585f289", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", codeSha256: "75106f503d6ee3e471bb4c9d016da3575fb85a1a6bab730338aafd9b6bb790e1", peakResidentKib: 2158948, elapsedSeconds: 90.25, measurementReceiptSha256: "1ef0cc9b37d18fff2d1dc01a526dfae0f0a60253c3a687043207b3cd7dc321bc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", codeSha256: "5568c29e85eb7ebdc74fc33090ca2903c5eb622567d530d567e3af8911ceda4f", peakResidentKib: 500048, elapsedSeconds: 2.59, measurementReceiptSha256: "bec68cab07930051b76b788f4e34597b690d062639a208caf590f45a131b3ff7", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", codeSha256: "bfa0ab2de00a6877bf67ab997861d1e1de8cfcb0493230141bb08d861544a221", peakResidentKib: 1266940, elapsedSeconds: 11.92, measurementReceiptSha256: "98d49048baf3f681ae34d1044b30c702e9fba00b9eb5b3cf1fccc28f555edae4", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", codeSha256: "f5eddaf928428c225d26c972552ea39046c4aaeadfb7506ced97b1b15cfa9f18", peakResidentKib: 596364, elapsedSeconds: 9.75, measurementReceiptSha256: "e1151b05fbec5aeb386cdfd671713f174a24fbbe8666e94dfc643b6906bd3137", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.PortableHandoffConformance", codeSha256: "73519ceec3b2524e237c6d02f9b27112257c815d154c9fe39cf19ad89b8c3844", peakResidentKib: 1062356, elapsedSeconds: 12.8, measurementReceiptSha256: "1ff1ffdb16eae4102e98f5d8ca2f86b8b1533a30b9f14ef25047415a931680dc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.EffectDataConformance", codeSha256: "b3cfd0e05dbfdfa0144ee1a66b6a02eb21a51205c4cf05bffb1c966177779626", peakResidentKib: 1282988, elapsedSeconds: 11.7, measurementReceiptSha256: "2e78aa2cb30ba2209e5e39a421fe6a64c7cdade45f7af0fad480c962dae902dc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TransactionSourceConformance", codeSha256: "5abd14f87985dd33d976f91e6268a31448e131d82e15b25c94cb632df7b0b1ef", peakResidentKib: 1674116, elapsedSeconds: 23.15, measurementReceiptSha256: "4f217adac4fe1002a61ddb41f9573f3a49f239f3653f96ea795afdac01245f2a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TransactionSourceArmingConformance", codeSha256: "89f2c69e52bd8852c491fdb97688a038a8d7d37b6afb194aec85b7fb6192af2d", peakResidentKib: 1630352, elapsedSeconds: 27.7, measurementReceiptSha256: "628ef084f13e7dd6cad12d680a2f7201a0a080ac6a631584818c66d339ba15b1", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", codeSha256: "26201ec5348cbb42efd853abfe49717678ea23dc1ab8eb093aff5d585f733ab1", peakResidentKib: 2661244, elapsedSeconds: 45.26, measurementReceiptSha256: "9661f2de960e924db9237562b0709edc3527e54dd4f2d9b4c23a4e58caf935d1", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", codeSha256: "71167801e0b492522cef16d507c9dd2034dc9a24f1e92abd5484abac24fc04ab", peakResidentKib: 3303752, elapsedSeconds: 11.68, measurementReceiptSha256: "8c0efe6d30efaaabdf1dda5edfda35d5783354a567210eeb46f9107de62e2b62" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", codeSha256: "ca7642bc8d817e346fdd6e96445160d022644386c6b040146bfe0214d09a4e05", peakResidentKib: 2089436, elapsedSeconds: 6.33, measurementReceiptSha256: "2aaec3a679a8d8293ef1d4903c15d4bfd258c9d25b291d7fed50f3d950505326" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", codeSha256: "5376c328288de7c4ff699d04c500bd03e2ddededdf107a84bf3c2b83737ee374", peakResidentKib: 694184, elapsedSeconds: 0.74, measurementReceiptSha256: "c1277fdbc092ed31e7bbccda1269cd074c8b4253fa21cdcfe1c85bcedc81e790" },
    { module: "BpmnSemantics.TransactionCancellationConformance", codeSha256: "13939bf1994ba72fd98bc619d25e82e745c02ea5384c9be9c92f833b75f8c378", peakResidentKib: 739604, elapsedSeconds: 12.61, measurementReceiptSha256: "68307f352f242b4dffbd13ab0a167ab904a9b599567317e78c6965bc3c7aaf21" },
    { module: "BpmnSemantics.TransactionRetentionConformance", codeSha256: "5b3428ac82235a4bc1f165d7773a4af031fa4d4ea021f5a93fcf2792b3bf5afc", peakResidentKib: 627612, elapsedSeconds: 1.49, measurementReceiptSha256: "581c50e29e0328c94dddfed941cc70e6f83721f88162983c810cbb4d7c9524cc" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", codeSha256: "2952857d13c443a686a41bf4faaa03a4b2c61a4d4f715012a085a08faf8d822b", peakResidentKib: 2296608, elapsedSeconds: 17.1, measurementReceiptSha256: "1861844d1303968d36dc1b9b184394b838c66c824d57486c3bc9ff0bfb88fd0c", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", codeSha256: "359afce41247e00952220c469fe5ea932446abca01f9663a582b6dd8b18f6016", peakResidentKib: 2683848, elapsedSeconds: 12.33, measurementReceiptSha256: "52dd8f8f24f174a562e269e6b9924565ca9b422c964527a90c93ee026d46e7f7" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", codeSha256: "d0dfcdeabf1663ee7f2207cf40c3c7abf0dfb80d6c45e97a010dc34132fbb3f3", peakResidentKib: 3112056, elapsedSeconds: 10.25, measurementReceiptSha256: "f265c5b22259c53e36d8214b14c71d3ef4d9f41d8d1487cf2b20ee54045a6ccf" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", codeSha256: "a83ae0590a22ad9ab9a886e03d7350df95f060de4fe39f0dff6bee10dc4ef3fb", peakResidentKib: 2587736, elapsedSeconds: 15.88, measurementReceiptSha256: "c2119ab0cb1612aa17bbd73bbe33dc098a982563719eca218c81572419014a90", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", codeSha256: "b64ccfab7933d2b01476cf7dce7641b62b5e79dbdbb400a6911a00f0bcb84fbb", peakResidentKib: 3200528, elapsedSeconds: 10.99, measurementReceiptSha256: "570f5d9d254522e8dc20b6b4039ffcf5ea3bada81183a91de8fb516aad0d18d0" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", codeSha256: "e2c68fdc0fe9bfae88a981c1440b400de3199d009be825141a3e58acaafa722c", peakResidentKib: 388476, elapsedSeconds: 0.67, measurementReceiptSha256: "676664ad53d45b6d23f5465fa86cb37e603845115e49470d372a21d44a98041a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", codeSha256: "304d4f00aa390b2262434a2ea92c6aa41435e2e3937b7ad74e5d9a1b82f9781d", peakResidentKib: 1119340, elapsedSeconds: 27.09, measurementReceiptSha256: "1b7bfea269f0edd58ef088becf4d669f2051d7e21737e08ba302eb4dfaeb8e39", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", codeSha256: "609d7a149ef9ad2e19333e79271f6b76fc59469e9a9007c76b99cbdae5466255", peakResidentKib: 1310292, elapsedSeconds: 8.91, measurementReceiptSha256: "141d0d1252b17c5ea5ffafa8ed2c97e63e3affd9e5c551ac979953c5e751030b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", codeSha256: "ecfe4095c29799986806aea4a61c490bf39f68a686436e9acd9753aca063385e", peakResidentKib: 1488984, elapsedSeconds: 13.23, measurementReceiptSha256: "e20bda514f9343fa3be6b60409b2750ec1f319d76221250dd966e2d39d6ae108", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", codeSha256: "6a15841a6e7fb553380eb0719b2b1bd8b2b0b5a841cdf20e87364e440f39cd91", peakResidentKib: 2684740, elapsedSeconds: 20.27, measurementReceiptSha256: "5624a485e823e7655e7e0494a81d06da86f7526a119db11ef1afa6bee99b1be3", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", codeSha256: "7044a902ad81459535deb6249928e8c7e22eca36281d9abaff6b314f0d46b270", peakResidentKib: 2106088, elapsedSeconds: 27.01, measurementReceiptSha256: "8a108600669b2e862c4b02ac6be554c06558e0e13484fbecf81c8b0bc89206b8", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", codeSha256: "82616e3ea5babb5f7a83d61fb19c6b524aa028d0f07c92bba9e3e4ed8a944dd8", peakResidentKib: 1807252, elapsedSeconds: 45.11, measurementReceiptSha256: "35654f58ec2754cedec4b63e3646f28df9bd2b6e560b2f236706c74a84eab4b3", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", codeSha256: "c2edb8ad4e45db75b73a85d7907e91d1f741125105d70216d766a01bf6e76984", peakResidentKib: 2570204, elapsedSeconds: 23.61, measurementReceiptSha256: "f1a404d486efbc330e145be381a3d7690a14064b2665e96d9ccddc9c64b5a7c7", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", codeSha256: "4b31344140949b6c2e8238cb698a9e76999fa9f300c4fbff0464e2458069d57c", peakResidentKib: 1064124, elapsedSeconds: 18.41, measurementReceiptSha256: "012950a7a0a7563b2cfa4c92cd569b667d0bd13f6ac10a73a93c3c03fbbc2c26", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", codeSha256: "46fa103d2c5a6bf2b56778a11c63a71b274453305e2082b1ffab47073227281f", peakResidentKib: 2038508, elapsedSeconds: 100.25, measurementReceiptSha256: "9f20143acdcd60f6c3fade3eb4f2f0cbb6aed316e205302d98d4a1839652333a", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", codeSha256: "ff95f07cc3f2049411a3900569aeedad8590ba73ee641ec8aaa9f176779ac867", peakResidentKib: 2211620, elapsedSeconds: 117.65, measurementReceiptSha256: "ae8c1a207b53eae902941d2f73dd05cb8b8d6c9dfbefb61bae68c6c6a41abfcc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", codeSha256: "03314352a02ffb23849b0ce8ec055950c7e60de6f5517e2a474be652c3f39b8a", peakResidentKib: 1506552, elapsedSeconds: 70.62, measurementReceiptSha256: "2835621f133fcb949ea373cb699d73fb1f21783bfb945ee20208a8827c684dbd", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", codeSha256: "a00f371979eabb13e6b3e988845b3fb9fc5336a92360e9e507d75963873b04c6", peakResidentKib: 1144900, elapsedSeconds: 5.69, measurementReceiptSha256: "551cba9c1c54038bd8be31159a7e9846d44e8bfd5047fd8f57ecb1cebd443341", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", codeSha256: "287a7ac86d78c122fe91b5bb903a1a4c117e44e60c2ee42ec725147aac876db9", peakResidentKib: 1878400, elapsedSeconds: 15.52, measurementReceiptSha256: "ceea599b33522aa3d7a935060b2033f6b4a8dbcaceffb8d28c9bf629804ac26a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", codeSha256: "2a9e0e67ef46cf368f31c7276639330e7851a3d4f793e8357aaee9b67f324bb5", peakResidentKib: 796248, elapsedSeconds: 3.03, measurementReceiptSha256: "e52cfdaa61aec9436efc56204021d2ea531b5a034a03a7730cb4f328afc1202a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", codeSha256: "056f8007414fde8f85435d85efdb39b8b1937475425144d18cfb4b05aa938c77", peakResidentKib: 711552, elapsedSeconds: 1.27, measurementReceiptSha256: "bdceb4024b4b4ee9d21fba257672382f3021d39b8c3aa9418bac00a450581b55", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", codeSha256: "43d4a04009835fff395ba4c9a58c962cab700b029d3413c2c4878ccc95377936", peakResidentKib: 740344, elapsedSeconds: 2.75, measurementReceiptSha256: "8a8d4f395669fe31c6698bf7f3dd658894998da30a28aa7d55cdb8596b30826d", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", codeSha256: "8aa14432541531b52a958b4808a21ac838f1067beb24b4c574231bbfd67437cc", peakResidentKib: 1479064, elapsedSeconds: 39.38, measurementReceiptSha256: "ee7db583c726b9f6822af5a0cb628d17a621ef5b5e3189049aa72cfda24fad09", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", codeSha256: "beb62aebec4bc888cadce86d6c6c650277a8095d46384fc1e5302a6c74557618", peakResidentKib: 1143240, elapsedSeconds: 14.81, measurementReceiptSha256: "f4888ccece74bcc586bfae6967fa1cab5d4260f04ba5ea6521c219d9dc83ddce", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", codeSha256: "bfc074919dff308976883a2d339c84bc0bb8a7b31a2f8dcfa211f248759588f7", peakResidentKib: 945176, elapsedSeconds: 4.22, measurementReceiptSha256: "c8d57fe59d6bb2ec3ef97943a15fd2e73f697a7eb8ddd472c5661bec9ccc8b64", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", codeSha256: "db0999c1f9b5775165dae94c0d361d6c57dfdb3db76a2c2582e14db487eaccfe", peakResidentKib: 963004, elapsedSeconds: 5.54, measurementReceiptSha256: "f8ae3469ad08dca8e68e07965e963d44caa3f0535de05e4c604bf650998c517c", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", codeSha256: "794a03f0e539370cd0890cd36fec17ddb3059ee833f1c4e938c090bafaf81d81", peakResidentKib: 1304584, elapsedSeconds: 22.33, measurementReceiptSha256: "67b28a14a60e8af4bddb6f2fbd7a0cbcb20d2846abecf873d77febd6fcf63ed7", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", codeSha256: "fbd96443adfd6629f40edcb6b9badd9dbde1a231d2e78c6a56f0b15cf9f9e27d", peakResidentKib: 414372, elapsedSeconds: 2.89, measurementReceiptSha256: "ba23e2f93f6280829ab3803106870e08e15dbc747985efab924203053f3af352", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.MessageStartAdmissionConformance", codeSha256: "40c336a99eb2f2dfca6cc2f4983b777c0219e1eb11a9a33e6eb7dff92d6ef9e4", peakResidentKib: 997200, elapsedSeconds: 13.08, measurementReceiptSha256: "45e23259f7c73d386a9bacbd34470a8d3be4d7127de5adfdcceb7a07c8f9cbdf", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.MessageStartClosureConformance", codeSha256: "5e1470eeefc27da57c826c4157ecd976382a7c7538966159a00f8bea79de9f59", peakResidentKib: 876800, elapsedSeconds: 12.18, measurementReceiptSha256: "b1cefa63ae0dabec3abf711f7daa948ec47387831ca6f6699f9cf2d551b243c8", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.MessageStartIdentityConformance", codeSha256: "5b23af948d55b0327e9a5654b8274e94ff5a8f58a4c8facfc171d6eff8ed4b19", peakResidentKib: 974712, elapsedSeconds: 15.18, measurementReceiptSha256: "c006e0c8e83e1ab359922e5a87b8a965c8f91ee4aaac83421e58fdb37608a4fc", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.MessageStartScenarioConformance", codeSha256: "221299bbe7ac4f80d9b711d470aa4a605ec1d03201aa8e2ef89863812e22a47b", peakResidentKib: 1155048, elapsedSeconds: 12.99, measurementReceiptSha256: "27a26ecd0829418aff3a60dc36cada900648fda28e65f83090e2016a8f909b25", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.MessageStartConformance", codeSha256: "b0af696a951c386d29f76b87630266e422632d878f337964abe74968c8f7215e", peakResidentKib: 439412, elapsedSeconds: 0.95, measurementReceiptSha256: "0de11f22047c0e740137f013adf45c01ab572f7a51ef4365c886ea61b896e668", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessagePayloadCatchConformance", codeSha256: "96b73b08d4fb9a217fc27658a37d2d73ecf1a562ca6ea88c7c8a6692c70ff735", peakResidentKib: 1397136, elapsedSeconds: 39.15, measurementReceiptSha256: "fdb61921762aea054faffde40883018822c2301b42392166c4b5cb536bfa9182", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.PortableMessagePayloadConformance", codeSha256: "d5841b478e3d4b2269c7ffe753e3e9aaf6a899931b238c67f267af14433990aa", peakResidentKib: 1213284, elapsedSeconds: 16.09, measurementReceiptSha256: "a8f0fa91ed4b8e6f754c7800c2a918afa70366d1b06b3f09218258f2e11b8073", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialMultiInstanceConformance", codeSha256: "87266976246d9e26daf1600a1459c86f206bd89d61e5ea299a828a6ec89f0cdd", peakResidentKib: 766080, elapsedSeconds: 0.84, measurementReceiptSha256: "c654e417b2a4e1af91bb857945eb43f5c6aeeb2f92346865b4eb221822737806", measuredAtCommit: "b39851632faa9db039ac02cbdbc6fed2d9e369e5" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgressConformance", codeSha256: "19f11c46222feff26a697e4a0140318945a5afc2a4d18bc26870a9f3be046754", peakResidentKib: 934092, elapsedSeconds: 1.57, measurementReceiptSha256: "6e7fdabfb9c05395b87b1b87debb22731ec252362172014788b026323009395b", measuredAtCommit: "b39851632faa9db039ac02cbdbc6fed2d9e369e5" },
    { module: "BpmnSemantics.SequentialMultiInstanceRuntimeConformance", codeSha256: "be94b2b8dfd7ac909bb4695ae0519ca45e1e9b5167e8e465dbe7f2756b534eda", peakResidentKib: 1375752, elapsedSeconds: 22.98, measurementReceiptSha256: "63de3096ff03475ad62d11fa458aa48f29bba1ac50d0cdef8c5d1ee23698359d", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialMultiInstanceRefusalConformance", codeSha256: "9c76f628f15275a610c1448f2b2efa0a2a4ae54baf5b3deabcf0136d44489a8b", peakResidentKib: 1371228, elapsedSeconds: 11.95, measurementReceiptSha256: "8f157e90149f1ce3db63282f48924cc401023d056936f91324823e940053fcb8", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance", codeSha256: "6c34dc85ebcf66c072849b06a8f196743909aeceacb2b8bedd03dcae5336d328", peakResidentKib: 910712, elapsedSeconds: 2.91, measurementReceiptSha256: "581eab771bd27c0b9bc0ac990361d3412d22eb6b4de4b21d702d3d5d7a0e5a8a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance", codeSha256: "a5a81d262bcf3b3fdd2cfec935ba2a6d7193f51d8d308cb269de1881236aaa7f",
      peakResidentKib: 620612,
      elapsedSeconds: 0.66,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", codeSha256: "a6919f4c1767257321eefe56c43ea013ec924c85e5231e91b5f7c1c4db0f11ab", peakResidentKib: 452304, elapsedSeconds: 2.21, measurementReceiptSha256: "91c56a3e3a17022b308a716b4d354d85be81534c2023702d7a333552b5c6ad6c", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", codeSha256: "c4c959207c03f5d3931ee4c1bd26e1492ee4f2fcc88d380dd78e7075a6986c1e",
      peakResidentKib: 2054656,
      elapsedSeconds: 13.52,
      measurementReceiptSha256: "860f79d37d283024e003bc1e88388842348199b974ada9286111df5e25f96972",
      measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df",
    },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance", codeSha256: "6f493554f835c6bfd57712d22ca860b5a4964454b7c82b41758b3a2392417cfb", peakResidentKib: 1481612, elapsedSeconds: 9.76, measurementReceiptSha256: "7b9d811e19854cbd0c55bc46513f937beef2dacbdde5a6cf7b17ec2d06310bf8", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance", codeSha256: "bb88b2536f24f58c1fb09650030a97b790caa79b97a4e549bdde73d1d3831d2c",
      peakResidentKib: 2309120,
      elapsedSeconds: 14.44,
      measurementReceiptSha256: "b8a2f6bbc5b152d0bcf8921e60a3089a8bdef01b04eac43e4693b6a7804e1fc5",
      measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance", codeSha256: "7f65610c03d72d56ad2ec975c6eed5c7eed4ed23736157885f6975940d6566b8",
      peakResidentKib: 2086828,
      elapsedSeconds: 14.06,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance", codeSha256: "5ed192f9a738a2aa8c7016d62f54badb3b0241a0d684ca83462a77511dd92c4f", peakResidentKib: 550056, elapsedSeconds: 1.8, measurementReceiptSha256: "00ad83618fe7131c17fbd85f5375d12293422b700aa2556c8e1bfbdbe11a8e5e", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedConformance", codeSha256: "9271611fedc4f08a78731747a4df84dc2b265ee103e0e818ae5515446ccb6e8b",
      peakResidentKib: 619360,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance", codeSha256: "40b0fb46a0728a49a18b5e81cd2d9d5050711d9c7e96b320829e9dccc820712d", peakResidentKib: 1038492, elapsedSeconds: 36.68, measurementReceiptSha256: "49542f67410fa4772b56d8dccd06cf79270963284ef996b9b949917934a1b054", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", codeSha256: "bed67afed3fa9803591c637237706c71d5a7796a45beb59c4eee15a9127a8a71", peakResidentKib: 967848, elapsedSeconds: 9.1, measurementReceiptSha256: "5a8c5ce70eb2149ec43fe6f9e6d42f0d2bed875b5cb00e8dcfae42bbf5b41a2f", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", codeSha256: "eefc68cd3901f36fe52194ec7686a06436fdc680e90bafc8cde38953811e12b2", peakResidentKib: 1037000, elapsedSeconds: 32.14, measurementReceiptSha256: "46bb28b2affc57d8eaf10a9cb659fe6701b400b1351cbfad776ef7dfddb31d58", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CallActivityConformance", codeSha256: "adf66b9546cc1ff836817834f58efe3eca89942802360b62c0985b997bded622", peakResidentKib: 470132, elapsedSeconds: 1.9, measurementReceiptSha256: "99271b8bdc2a1d959140b2ded96c9511c85b32a76c9a4bbd254207699ea819e2", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CallActivityPairingConformance", codeSha256: "116f713a7533e122d3b6bdc982a7867380d894c33d7925548e264029575e251b", peakResidentKib: 452340, elapsedSeconds: 3.14, measurementReceiptSha256: "cc2211f688515d8149f43b415886fa95bb4626db98717766d70a4ab5ffcbbe04", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", codeSha256: "8ed7a05d1e11d6e7940ec4344d1f6cae426419108cb498e46f7eab3c9f056a79", peakResidentKib: 1697944, elapsedSeconds: 35.06, measurementReceiptSha256: "d396e1e073ae824b4a5716aa3b0fa74d4e45f03b22a24ab0fa74e3e0eab3ae33", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TimerStartConformance", codeSha256: "a8b44b40f8336d61b1c9829afcde82d4fc35ae5ebed2735d4cacbf4875ba3fd2", peakResidentKib: 1290316, elapsedSeconds: 32.49, measurementReceiptSha256: "ee65e90c376d5408327836e07053462b1d7f810e43b64378454724b067c23a27", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", codeSha256: "c224da865d9cde40dfebb4c9cbf465bef3eefb420e6e3d8c7f3bea484f6b1b79", peakResidentKib: 1779068, elapsedSeconds: 46.15, measurementReceiptSha256: "ae9f7748a7cd1985f1a5012e7fc15144502cb12afa32b380c50bae12103a6bb3", measuredAtCommit: "e768ee78d8f5f75ffcb4c538c5332fb504034940" },
    {
      module: "BpmnSemantics.RuntimeStateActivityConformance", codeSha256: "c7c675fa9958593a73f0b4492255e3c8e762a15b5b4c4f1eb460b752e91349eb",
      peakResidentKib: 618664,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", codeSha256: "b79b8b8e101973c8e7830744b40c09c48e7a260c61588dd9386e44fdbc7c01d4", peakResidentKib: 1046612, elapsedSeconds: 27.62, measurementReceiptSha256: "4fa6496a52c7976cf59c941818ae73f6adaef513d5ba9cee654bc912db5142cd", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", codeSha256: "fcbf3e59d80b53a51bc85399aac944f2b120d93372df35a9fd9645231f58c69b", peakResidentKib: 1013076, elapsedSeconds: 15.20, measuredAtCommit: "6d231a2b" },
    { module: "BpmnSemantics.ScopeCancellationConformance", codeSha256: "08fe6ed63a7a11f4db88abe2c60e9400edd0bc2bf87b80e8faeed8521a69826a", peakResidentKib: 414868, elapsedSeconds: 1.9, measurementReceiptSha256: "579bbd90309dba0b2401fa3f262eca3cdfc088c215642c871d807460bcd49359", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ScopeCompletionConformance", codeSha256: "27468c70c9ef4bd492769f042afece8da4b36be37e7ce7ff8c641e74b1bbfcf4", peakResidentKib: 398648, elapsedSeconds: 1.08, measurementReceiptSha256: "7811a124f17e19850df2c34ec9db06b89286956f542e7fb25286c75a0b0a483b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    {
      module: "BpmnSemantics.RuntimeStateControllerConformance", codeSha256: "ca7922a0af0fd699a468988b4c0c69b3f0960b969515c503c7a97454d12ba3f4",
      peakResidentKib: 2089244,
      elapsedSeconds: 16,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", codeSha256: "40734ea3e99b8ee2dbd506e1a37da1b57dd676379d17115cad057d095e1ced93", peakResidentKib: 437940, elapsedSeconds: 1.4, measurementReceiptSha256: "cbafc94e92b13bff94f602bf03e3feb247b26e6b80175a599a7aac85ba66a3d7", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", codeSha256: "be73c51e80cd1e78ed3e463df030355e1693561ed8641f96636b8c268526fd92", peakResidentKib: 1350724, elapsedSeconds: 29.12, measurementReceiptSha256: "5d47036145c0484ca72c0d85bc159896b1ee4758de0519adbacf4af6b3fc4825", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", codeSha256: "58e7af6b638920332bcdfe40defaa17721b1b77a69b3b90e7217f00052400f01", peakResidentKib: 1280164, elapsedSeconds: 43.07, measurementReceiptSha256: "dd57533344a94bda0f43a192f89621fa3258eca6993a5ac83b3cfdfe11181cae", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", codeSha256: "88b112cb48b26af3673bf5bb5deb012248e1edfa5e239fdd5258c0a4433b7339", peakResidentKib: 1847748, elapsedSeconds: 87.98, measurementReceiptSha256: "47e189fb060309c63e05ff54df843a19b55e3b1faf08a257275fd5e935c8c920", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.SemanticProcessAdmissionConformance", codeSha256: "7d21b91acfccceeb67402b4d70a04018a65725580a16e00213eb4eb0c238b2d8", peakResidentKib: 1184108, elapsedSeconds: 35.77, measurementReceiptSha256: "a3f06e59aadf302fe41a19197c5006a0de721ce4b05af5b5f4601efd17dcdb20", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.EventBasedGatewayConformance", codeSha256: "c5c3edb3d4c757f1aec3208a197970013a6b11ec2bc9c263a1721644a4b5dc0f", peakResidentKib: 1212900, elapsedSeconds: 29.01, measurementReceiptSha256: "405638a032f072fd9af0dbf75d4c5cfc90b3dcc0a20e0de09615994ba48fbf3d", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", codeSha256: "79d6705dafcdbd7c8f83536420cea9e388695e12ce6217813a70a99bb938fe9a", peakResidentKib: 2170588, elapsedSeconds: 79.84, measurementReceiptSha256: "9961bd67a53604112d2ef55c5e9940f048bf06cdffed971eee60dcd5a2670082", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", codeSha256: "66c21dc4490e072431aa717e2058f85e8fe0567d25094311d83d9a616f123dfa", peakResidentKib: 1314828, elapsedSeconds: 65.11, measurementReceiptSha256: "9b58dbc38e969907763b3ab3a84c6d7435ba968e48580ad2417ead6c871e63c2", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", codeSha256: "b94be0af1bd729d1cd08e85a0edbbf6ab087f12c4ce4c63bb2ddce77488d1006", peakResidentKib: 1618428, elapsedSeconds: 15.78, measurementReceiptSha256: "ac483bf99ed7d5ec1ba8c802ed4d89cbb91abbb0cccd84a38da61066f47abf83", measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", codeSha256: "ef9d85d31f093bd5faa6a61d21720ac1e33e1e5428c73e0507d5521395f52e39", peakResidentKib: 1146540, elapsedSeconds: 16.26, measurementReceiptSha256: "ab06e65fe11e70e937f6aa3fa3b21afca71f9ab383262ac5b260fd7adbb9c558", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.TerminateEndEventConformance", codeSha256: "118f536429e34ce1d3402583d20388c5602cad7b2a9277f5473fb034bf307ecf", peakResidentKib: 1446096, elapsedSeconds: 48.3, measurementReceiptSha256: "ac6cb578ee6908cfcca7e58a11246ca19eca39f8d79c802d599024548eadaf03", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.RegionalRemovalOwnerCoverageConformance", codeSha256: "c9cfafe4cbc67a7d6bcb92ae7d33259af6f6b0ec8869f682604afbcf83e1e80b", peakResidentKib: 1362400, elapsedSeconds: 8.73, measurementReceiptSha256: "3ea62ba62c04af1981873406380774a2a67415e2a32b45de97179fca96d6d8df", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SemanticProcessConformance", codeSha256: "6f04140fc07814c1843dab5d607b7d48fbec6baad86c41c40d1bdbae81a65930", peakResidentKib: 1254160, elapsedSeconds: 13.1, measurementReceiptSha256: "5c9c03f9f345ca0ca23311abcc6f4b84e02d24b2ccf6b0799fe462e56ab9a93c", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", codeSha256: "1b555b737e795d253bf54df1c45a124295dc9552f4c302eb5ba72ed64db2e28e", peakResidentKib: 914880, elapsedSeconds: 37.99, measurementReceiptSha256: "41acf635b6dee9c2f0b8b9aa59cf6584d6ac5455362b1e5192999eb09e36c259", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", codeSha256: "7ba8a50bab250ab4a5a8e747b2930fa03d8c8e4d260a2844d3dccd6fab27d54c", peakResidentKib: 1107856, elapsedSeconds: 52.38, measurementReceiptSha256: "1b3eb7973307ce91ba38a5e18ec5518a508b1e4057255a26065a3a4b5a75031d", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityDataInputConformance", codeSha256: "ada11a3f5d7e8817da4ffeb96380782acb1375cc4a934b4745d46e0e1fafcd08", peakResidentKib: 901888, elapsedSeconds: 29.56, measurementReceiptSha256: "b43a3dc03223a5a59e75c2b7a258ae0bb791c4db8737f1447212fc292cb150f1", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", codeSha256: "a3c28e3f9debefbedd3f6457a14d71c7ffbfbcb76d57a2b49b5f9cff0a83d3e6", peakResidentKib: 1071200, elapsedSeconds: 24.24, measurementReceiptSha256: "d6c1def798759b032ec95c4bdb20c62cb22e37a8a85c4b5915de0f2101bf187a", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.MappedSuccessConformance", codeSha256: "a5be810357dc2620a048dc00e7342033fa3764c4af85d8263ccce241947703ce", peakResidentKib: 1263728, elapsedSeconds: 17.95, measurementReceiptSha256: "171b1b263c79576518598f19132eb3df9cce825c9a49f077acb9279c44aa2c50", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InclusiveGatewayConformance", codeSha256: "b782c73adc11929d641269add1b2f353c27241150d5e02266c280d68d9b8992f", peakResidentKib: 1618416, elapsedSeconds: 31.25, measurementReceiptSha256: "64e92eb44a302435f4b190e5ae82b66f83e7ab440f2dc6fba35c32524d92479a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", codeSha256: "8e743a411fda493e8cc9ce7cab93b2c570bc9f0730f9f9b88c6b5cf5e7cfbe79", peakResidentKib: 853780, elapsedSeconds: 7.01, measurementReceiptSha256: "6f592d98eb4eee1048c8355be8986c5361cc921d685c0d9581aaf7e435a0f745", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", codeSha256: "7a8336b73c7c7a284dd91399b0fb817e8aa72109742e77184b6f5d9d6c53d729", peakResidentKib: 1149996, elapsedSeconds: 15.32, measurementReceiptSha256: "ac09c2acf915de48d80e55ddc450cbec277e0b715f9d2b6d924e9d31467ca8fc", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", codeSha256: "40469c448d1834cbb9a41bc7fc3cfe7c9aca676777c93851dddfeacc5a73b9c3", peakResidentKib: 1728916, elapsedSeconds: 31.02, measurementReceiptSha256: "40a4b8389052653e5b9dedce85cf59ce5d70c8aa5c6cba2e3d67b4dd6c176a4b", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InternalCommutationConformance", codeSha256: "1313206822089bfe49ae3f582557fbf7b7067513aa07f868c6382139df61b18b", peakResidentKib: 1072272, elapsedSeconds: 14.34, measurementReceiptSha256: "57f18e73862812a6ca4f93d37f7cc15cc72a1fb07b8c332299b3e8895118c640", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", codeSha256: "4b61f65247f78126c770a7c0aa735625090bdbd1d05ee1d86077100bc8e9b409", peakResidentKib: 1347216, elapsedSeconds: 14.68, measurementReceiptSha256: "2567208d31354a7aaeef983ad25b9362290aab3a43e07b795f714c98986d2501", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", codeSha256: "064010a3c4a8bace921624b4e34e2cfc76662982749d70523c60a30109d76743", peakResidentKib: 2309188, elapsedSeconds: 25.84, measurementReceiptSha256: "ef7dd267e4e8b002ac2e5a82d948b165a3a0062fc3bd042311daf7c1a15d330c", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CompensationSourceJsonConformance", codeSha256: "6ed0557fba2e6789d43413871fd928e2dcaa5e644b3da5212fdf7a1ba420ecf4", peakResidentKib: 2326880, elapsedSeconds: 12.15, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceCompatibilityConformance", codeSha256: "7c0e4543946eaae8c2772fe9a92d235631475c4b8d2481d3f4b44c2fae76c24f", peakResidentKib: 2023220, elapsedSeconds: 14.78, measuredAtCommit: "05244cf7" },
    { module: "BpmnSemantics.CompensationSourceBindingReferenceConformance", codeSha256: "f7b159fcf01bfbc18839971a502231b607dd5105276b9b16e05bda02b2578bfe", peakResidentKib: 2316544, elapsedSeconds: 25.62, measurementReceiptSha256: "b076b73736966e96e3274e7cfb464cd129fdcc1a70ae69263f91b989e033925e", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CompensationSourceBindingTriggerConformance", codeSha256: "6fc54b750253b598a458d84f5519e4772d06161771f3cbc8ffa0a3d62975273e", peakResidentKib: 2041712, elapsedSeconds: 20.6, measurementReceiptSha256: "5f520245088bd00b3c28a0c685bcf97afb915153cc4fdac7469f6d4b8fb0e7a1", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CompensationSourceBindingStorageLimitConformance", codeSha256: "9325bf29f9175aa5aa19b6174ca032b753a00f46b0d86693465ff8201f4c9bb9", peakResidentKib: 2076472, elapsedSeconds: 30.45, measurementReceiptSha256: "1602847ae5c6db20db80745095e1ee70dd62e2e13caa8ca3e54ec636d1a102ab", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CompensationSourceBindingExecutionLimitConformance", codeSha256: "6337444f1fca10e03ddd074b4c7f07fe129000951ffac19dc4133000d63965d7", peakResidentKib: 2074612, elapsedSeconds: 24.4, measurementReceiptSha256: "8dc79f128b0861c226e2daf4646a80f8d1e88e9d1e1f1e572fa0c3c46a9c20a0", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CompensationSourceBindingValidProgramConformance", codeSha256: "3a9c358f1be9265f829f05a06cbf0f5345b4be717724b485495f91c137662cf0", peakResidentKib: 1574020, elapsedSeconds: 14.57, measurementReceiptSha256: "2c394cd4525abe55182e7563d9eb52fa20d2f3503a8fcb902176ce5e2c64fbf7", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CompensationSourceBindingConformance", codeSha256: "6e61bd0d56099798a2a6e133dc979cb1f9666f5f67f793007a3fd882356cfd4f", peakResidentKib: 439800, elapsedSeconds: 1.59, measurementReceiptSha256: "0fc5c18f64554438bb9c72b0bce46cc7fe41efb7d647223020d9eab1cb6a7459", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceLoweringConformance", codeSha256: "ea5f9eb09df84368e77cffbbfd3dae14e2fd6d48189dedfc2f1658b020616890", peakResidentKib: 635272, elapsedSeconds: 0.59, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance", codeSha256: "76466d9bf68bfe4dba2e74e72e452393ccf370ab5a885015491bf8d898724c0d", peakResidentKib: 863200, elapsedSeconds: 3.45, measurementReceiptSha256: "183d41488cc76dd0cc139c60fefe3bdddf71ba62900cb72ceda93236392e7d81", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerProgramContractConformance", codeSha256: "e9fd3e634dfb7c2d378ad714a99f097a35b8500deedd190b4077c6bc7d5f6335", peakResidentKib: 984604, elapsedSeconds: 2.64, measurementReceiptSha256: "48491614403c4a26baad19d50fdae568762a0eba246d431ae9d7605dcebe198a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance", codeSha256: "c0b72c3f9ee92d6359e11d11e27bd86ec46e401f7f68a00b7211e1c8bb591f7f", peakResidentKib: 477972, elapsedSeconds: 1.16, measurementReceiptSha256: "7ad932e0bb7c7ac289123dc1dd9f417c20423cbc37634a1dcb4f14739f0883ca", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeConformance", codeSha256: "591bb71265f4bde6dd7216d276f4c72ef74e10ff38ef495aba0ca4fc7eb52d50", peakResidentKib: 1028368, elapsedSeconds: 4.91, measurementReceiptSha256: "cf38c41a271cb0357d4dc00e946884ab87db21d0da36558ce762f2a92bf0548e", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance", codeSha256: "5e07e88526b4204c6d95ffc692def1a29d99349652a668d5b15f3ae9d5b33afe", peakResidentKib: 1190632, elapsedSeconds: 8.98, measurementReceiptSha256: "95a4c2368269ce8cbab0123a97dc6ac2c7ae9cfac85290e0cb1375bc5915fcb8", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", codeSha256: "031ee09057eb6ba17ffc71319ff3146774a04c1130f00a5704b5d1ee3bca51b0", peakResidentKib: 1596188, elapsedSeconds: 31.34, measurementReceiptSha256: "f6294ad886814273b487d018ff61474a836c90e13a05f1a753a6ff299be4c3ff", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance", codeSha256: "6c9c8704266c9bdb438900a0efdf26e02e3b66da9a34e69f0f734412261a2cc2", peakResidentKib: 424784, elapsedSeconds: 0.78, measurementReceiptSha256: "089eb734140439a1caa41d8c1df681bf7b2491f973ad8428666234411186d6bb", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
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
    { module: "BpmnSemantics.UserTaskMetadataConformance", codeSha256: "e05a324bb243d3ba6f196d98be3cb840fe839cb695cec601152b694f7f366e50", peakResidentKib: 1396776, elapsedSeconds: 22.11, measurementReceiptSha256: "18912ee3cb4e7f18e1956df887bd880e49f930df4214560fe0fdaca2f3139097", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", codeSha256: "412c4ffaeb2fbfb4db5efd0f5abb44a6ba277acea1460eb7fb07b12f1f8d0700", peakResidentKib: 826992, elapsedSeconds: 6.22, measurementReceiptSha256: "9595376c54029d529ca871dc5e342380640bde555c13be7a7c9d57a2dbc674cb", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", codeSha256: "8d36c2e2d0b2a4d453c070dac0f4fb5aded4d3e9eca02748a60b97f32586d352", peakResidentKib: 541480, elapsedSeconds: 4.48, measurementReceiptSha256: "2a82ac34e5030e28aa27360248b9a3932a7f62e7e5841a4544a196a5113e4c6e", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", codeSha256: "7df21acc491276194d71668f5d8524684fc021279a0ee589f4b20901d0663b64", peakResidentKib: 825396, elapsedSeconds: 3.22, measurementReceiptSha256: "5017501eea8bd58f55ac2ab165cd095991dc7244ca0080088d4812e0462d0457", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", codeSha256: "bb67e24ec34a60f2f138e35f9058fa6e858a88cc85347cf612a4b0c90d0082ed", peakResidentKib: 1143484, elapsedSeconds: 12.22, measurementReceiptSha256: "e78f72efdcbd3f38a2be8c49c9e6218bb1b0f24a856663ef3f9aa269f8590d22", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityDataOutputConformance", codeSha256: "8a982641261d79b7a1d7003a966dd4ba9ecfe2ccdbb16d81faa7cec051fb508b", peakResidentKib: 1133132, elapsedSeconds: 23.72, measurementReceiptSha256: "abaa7b2c4e51075c671054dc12a6a3b3175b8b86451ebd386cee8851a3232903", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ReceiveTaskConformance", codeSha256: "e9a494fc601c4765a01f4942252299d980e90875f42f57fcf30e8e021190769b", peakResidentKib: 1185988, elapsedSeconds: 24.42, measurementReceiptSha256: "9ae1e9d1729fd75cfaeb40fc7aeb70076e63b9ab204e03c0108f8a8b9dc1aca6", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", codeSha256: "df4d9074450f4dec51216e5f60029fccdec3bbf6162e6d063e987003da1e384d", peakResidentKib: 1022928, elapsedSeconds: 18.06, measurementReceiptSha256: "0116e23beb194a265bb8224e9128c9f45834c9f2d84ab5de2f099ad5608f5630", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", codeSha256: "9549ab0af761439a37c72c0c68d81e6001a0251dfb97e0b3a397e5c0edbed63d", peakResidentKib: 1214124, elapsedSeconds: 7.65, measurementReceiptSha256: "bf17cc510d4ef0ffe7d35163896c9b926bdf44c577d7e3e9969a98caf1169d8c", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
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
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance", codeSha256: "5034c8818c67d5bebb78e4a0e0f2cc8d0a3d0b9040866611571773080a69b40f", peakResidentKib: 1655036, elapsedSeconds: 24.42, measurementReceiptSha256: "05e43d6ffe369f58baaac28b95d21e3eac0f18646accbbed060dd56b9afb20bc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
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
    { module: "BpmnSemantics.UserTaskInteractionConformance", codeSha256: "2ba71805d0e553846d8a9e879f3bf0565bba09fff0107df7edfdc401830bfa0c", peakResidentKib: 848896, elapsedSeconds: 8.39, measurementReceiptSha256: "26d47973c64472dd7978033bc59775b577c21f5193f055579e657c87e438d6a9", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", codeSha256: "07c1e7b2e0c5e207210a65da0c698bffa8b04560b157671e394ad58078fd8e63", peakResidentKib: 1039168, elapsedSeconds: 13.14, measurementReceiptSha256: "eb985c349d55d48696c275fbfaa3205ef7954b808ac6c5757daca2bef281353a", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", codeSha256: "2304ae32d3cfd33903da55e006a16c136d34c4fa5ce292ed8330517ba6deba27", peakResidentKib: 1159768, elapsedSeconds: 15.67, measurementReceiptSha256: "de09d02428973a6272c7a6e4544aabd5744601b27ad145d9e24c71ba5464009d", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", codeSha256: "88354c6c1b9bb0456dbb197d82aee50cabf5d3075c729445f3df62785419e880", peakResidentKib: 1051596, elapsedSeconds: 6.3, measurementReceiptSha256: "2d56d7e6745d0a525fc94a045138b8011fcab08ff6f00497dc61fca0a7dcac2e", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", codeSha256: "bcc0c718f8d9b8196fd11e45e89e24718fe6bdca06f6ff9bf6bab6abbef7ba13", peakResidentKib: 1028372, elapsedSeconds: 8.02, measurementReceiptSha256: "3e0702c588be8f9b1e9ebc703d3044ab0166e69d60204600fa8136356c50a790", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", codeSha256: "a29ee5178bd07f2f3af0a7d1a05757bf6a3db41405a5d1cf5b61cd2961458776", peakResidentKib: 1464712, elapsedSeconds: 7.79, measurementReceiptSha256: "9ffd2f000aee896112f665fd49017e6fc80e10cf46e27ca479aabf6578c25485", measuredAtCommit: "519c7c5e" },
    { module: "BpmnSemantics.ActivityBoundaryMessageConformance", codeSha256: "6f21115cfcad5b66fc37861b760bf4144578a909db827ae6309f2c36e0de5aad", peakResidentKib: 1255348, elapsedSeconds: 36.43, measurementReceiptSha256: "360ad3138cd7c384df3f6b5e88d9b2646d0671b802cebd7f9dbe016ac1bfa0a2", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", codeSha256: "863a51494ced005835df9e6bbc7002ad0985ad02cbfa6a86289708d181da89bd", peakResidentKib: 950040, elapsedSeconds: 17.51, measurementReceiptSha256: "8561069a4aad43ad9265fd92799dea6b5e9b7828583b4a338c67089db588e25b", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", codeSha256: "f4e82dae98d1bfd302feefa3335ed9a84a0679559baaa3003ad35f1e20b7b520", peakResidentKib: 927472, elapsedSeconds: 9.15, measurementReceiptSha256: "c222426c90970f09887c1207dc37a010d892e7d674cfd05364d74e1b723fca05", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", codeSha256: "c50b4b2f654eff2ca6a01b1e1cf2e31cfad7543b87ff977a4e5b15f7fe0e4a4a", peakResidentKib: 1116212, elapsedSeconds: 14.3, measurementReceiptSha256: "cda24f3d8e3c93e3ce28cd0ca14d50832692eefcfad75224447dbb017d0bbbd8", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.StructuredHumanWorkConformance", codeSha256: "8d94b3a2967c17bb63c4d4fa034d47ac31c6b1a4134c87a7b7e68e7f6cd27cb5", peakResidentKib: 901388, elapsedSeconds: 5.06, measurementReceiptSha256: "a7a555643fb262a514114dc35141fcbc27a6b34c06e7b9e88817a5e49c295556", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", codeSha256: "bdd53d77b79dfbe65d1c6e4c646f8513b1555b12daf84c467d25c3a80980275e", peakResidentKib: 784764, elapsedSeconds: 3.03, measurementReceiptSha256: "0a258f251b7c59fe9d02e66831fc60e72b8cbf935400e3d3ad44397a2560259e", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ProcessStartDataConformance", codeSha256: "0e70a65b0c50acc60cc1baba5ec4a6af0efa3cb2e9d37eed0f8125249e47b605", peakResidentKib: 565108, elapsedSeconds: 5.39, measurementReceiptSha256: "91c3c6ea70631961979ca1d977bcdda2c38d9589790ad4c369bf2b14d2d1603a", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ParallelMultiInstanceConformance", codeSha256: "cb3a7d23f012aa63e150a5051f7e1fc1127ba9c6cdaf651ec3b27b300e551035", peakResidentKib: 1081884, elapsedSeconds: 13.5, measurementReceiptSha256: "c29ef596e2ff9a534247403fdc761ad70eb7c4c9dc69fe3cc1c3105c61824c51", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", codeSha256: "c7a6d46204ba6a41096cfc940b5045fbbf5044cee18d9c5a54628143c9bc9b7f", peakResidentKib: 493740, elapsedSeconds: 6.18, measurementReceiptSha256: "cb69828a642fc9499049eb503f36a833ee334a675fbca75c11e409bfece188c1", measuredAtCommit: "d83a0fd01a7199d5462ae2cfcfdc1d2b3e94d0b4" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", codeSha256: "cf83dac55961aec0ff93dd9954640eec25f4d3aac4a5201a5e78cc2ee94df4bd", peakResidentKib: 1128448, elapsedSeconds: 3.6, measurementReceiptSha256: "4cb3f2dc24d7659a01e147679bb5a198c37f94236c4911227dff9275d6ec86b2", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    {
      module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", codeSha256: "72257c4843040a6d72caee2257dd686c885750f2764f9768f1de67ccaedd93f0",
      peakResidentKib: 825916,
      elapsedSeconds: 3.44,
      measuredAtCommit: "223486be",
    },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", codeSha256: "b120ce86e357af06a9ae3c1b99c4e2f033537bf610d5f7f233df7e130b6d4b4f", peakResidentKib: 797380, elapsedSeconds: 1.87, measurementReceiptSha256: "b0c66f99a8c18d30f84d7780f970d425592cbce2cb1226ba60e82ed508ee2174", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.SemanticProcessJsonConformance", codeSha256: "55555e3229233cce6498ae6d3375867411c763b2abfb257de26c7565d9d03694", peakResidentKib: 1056104, elapsedSeconds: 6.52, measurementReceiptSha256: "0a4b1bbfbea2f8e50368f9bcbfb24770703f08868c900be1086104df18abd3d4", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance", codeSha256: "f377566a31e838767ce74618cfa801cd75b093a3b98d085db077d918240217e7",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", codeSha256: "da5b7063568b9afb02cfa6ff397f8590992b6b3d5926eaf5e48f451aa4bd74f5", peakResidentKib: 683972, elapsedSeconds: 1.6, measurementReceiptSha256: "f1e5c1db4ebceba1b2a619af02c9358f687b83a687893c09802e5e9a196bdf0c", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityIssuingDisciplineConformance", codeSha256: "707edf516c53b4209eb9a98ecac44f50088a614c11c2f3611119645f517b5d26", peakResidentKib: 416576, elapsedSeconds: 1.08, measurementReceiptSha256: "dea95eb503d4ac19ca313f2d0faa8ea49fc54e2e271a359662c573b88d3e3c5e", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.Conformance", codeSha256: "f87d851ce40abd17efe769c5039e73801aa25488e5557abc6638c37dc6630a02", peakResidentKib: 336084, elapsedSeconds: 0.46, measurementReceiptSha256: "dbb5478f638aac46987f16ea4d86630b1b95b32df9739d8b209e1a9e5e287e21", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelForkJoinConformance", codeSha256: "d5412a7aabf512b20311d23355c2dcf8c61504f0ba008562af43a9c21bb53358", peakResidentKib: 334388, elapsedSeconds: 0.47, measurementReceiptSha256: "cefc67bcaf09f6d997e52782b5e2287d385478ab7416c6a7d72ca73834295d94", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
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
