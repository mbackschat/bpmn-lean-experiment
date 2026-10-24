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
    { module: "BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageConformance", codeSha256: "7e6d20a4348bb06f051e1fa6f653d18c896509a522ba4442628c4feef0fd6198", peakResidentKib: 663664, elapsedSeconds: 2.63, measurementReceiptSha256: "99fd70b8da2fcc40a6d06072d813a8a4f5b69d2f8b6af6c8b2d340e5d5fbd09e", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialScopeGraphConformance", codeSha256: "dd30c9435b4aa4dba3c7d595691d8ab04679a130c4a2dabe906c09dc2ad195d7", peakResidentKib: 1494136, elapsedSeconds: 82.08, measurementReceiptSha256: "3414e91b1618169ace4aa5f5245ae7ea8252d127dc68d11f1b1e96aab770c5fa", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", codeSha256: "89a7f26f62184f968eaa7b1f113a35459c6595ad1ea238dc1f8704fbd2d8a66d", peakResidentKib: 357268, elapsedSeconds: 0.88, measurementReceiptSha256: "f362ecb9dcc3293b467d5c749f0ee5ad6b3d374fbf6b8d76ef21d4996502e1b3", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.NestedScopeDataConformance", codeSha256: "b7836d441e36871a2c96226bb1ece67e3c45dd571a65d8478329e4c650e0fba4", peakResidentKib: 2147352, elapsedSeconds: 31.32, measurementReceiptSha256: "bdff834114a1a21a957e32852a554d400c3344ee0ae1c3f12a2aff43871658bd", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CallVariableMappingConformance", codeSha256: "359ce4e543179d79bd324551e3d57430ee75a90e7399b8a7a2cfbc1690e90f1e", peakResidentKib: 470672, elapsedSeconds: 1.26, measurementReceiptSha256: "7394199a720ed6d2c6bf7463a2443c80b663098bc93c258252062782302a6423", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.NestedScopeControlConformance", codeSha256: "67634388225359ac90cbd4867f8d0caa5e0e15f15c5826a76e024f3f9f62094d", peakResidentKib: 2842484, elapsedSeconds: 143.53, measurementReceiptSha256: "8f730b9a353858920391df926500582a397dbd7a37380b357340a3b7098fff5e", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsAdmissionConformance", codeSha256: "e403c2e7dee35e2a9a10e25c8eba05fcc137447130ab31c34b159ba118d2a4f1", peakResidentKib: 2281160, elapsedSeconds: 39.09, measurementReceiptSha256: "92b8f5f1effee144e05e3c7c18a395600d55fada465e542154eaf535373e643c", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsConformance", codeSha256: "50eee2fd5fe10c607d4a18f5e4544eeaa4419afce221da895fd1ee5eea57247f", peakResidentKib: 2172204, elapsedSeconds: 89.03, measurementReceiptSha256: "bbf00783b95fa325bd88b3b882a0fa87440e28c26e94c6fd253f94d44813a787", measuredAtCommit: "b3e0b01e71473575c131e213c6e4149804d227d8" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsAdmissionConformance", codeSha256: "39c486010861819f2075736bceba42f3beefc26b4d706c63ae76da35f974ec6c", peakResidentKib: 737700, elapsedSeconds: 0.95, measurementReceiptSha256: "84a7498b55ea515985f3a4773e4d67407676949c3d12ad8d829edb186972e8fa", measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsConformance", codeSha256: "fd388d170797b88b1a248525de1c9cc10c42f7455c99f036e88edf0ab60595a1", peakResidentKib: 752508, elapsedSeconds: 1.08, measurementReceiptSha256: "3af9555c50d7587a13058bfc7b23da15d74728bbfc4ee08b14e612f74f5e75fe", measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", codeSha256: "3776eec7f90e9ac611c2b81315126f14f963368ce6f9244d850c57be1b3bf1fd", peakResidentKib: 1110484, elapsedSeconds: 9.43, measurementReceiptSha256: "ca3ccf4acd64ea8d3cfe00f0a5af67ec3886a40db5ee7083e4861fcde3287e7f", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", codeSha256: "64cf80360270db589d23a856a51b7ce83d227539cd076180c522ad82bb4e4ebe", peakResidentKib: 1365008, elapsedSeconds: 28.27, measurementReceiptSha256: "76daba090094c0b57e607766caa315d9ff0bad8f0caf7933b3b163d30b9c385d", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", codeSha256: "205fd234c4f60d9ae1cad99bf5a2233da800d4bc588c090b34c6338ec3c55764", peakResidentKib: 1842264, elapsedSeconds: 28.88, measurementReceiptSha256: "2b99d852eb5b8372ec0b2ad3332d93afbfaab0b33b40310f99956ea1a562e300", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", codeSha256: "1731dd138a80dd9d23f254293298531cec42492d0a3dc036a5f875d0cbbc0013", peakResidentKib: 1666668, elapsedSeconds: 71.05, measurementReceiptSha256: "0be3f3b560b60410f91e2a5780fc0fa77a823340a38c41ab049253d648953621", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", codeSha256: "75106f503d6ee3e471bb4c9d016da3575fb85a1a6bab730338aafd9b6bb790e1", peakResidentKib: 2158948, elapsedSeconds: 90.25, measurementReceiptSha256: "1ef0cc9b37d18fff2d1dc01a526dfae0f0a60253c3a687043207b3cd7dc321bc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", codeSha256: "be25c46482538cd113fbd5cf3ae2a17a8051b6830f9cf6382bedb0f5aea417fe", peakResidentKib: 498020, elapsedSeconds: 1.79, measurementReceiptSha256: "96abd9ec72f680ebc4b15dc771953343798e6458dae17019dbb71038dbdf51a4", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", codeSha256: "bfa0ab2de00a6877bf67ab997861d1e1de8cfcb0493230141bb08d861544a221", peakResidentKib: 1266940, elapsedSeconds: 11.92, measurementReceiptSha256: "98d49048baf3f681ae34d1044b30c702e9fba00b9eb5b3cf1fccc28f555edae4", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", codeSha256: "07c8342ada58ec2cbf207350582dd864f1c8626b6c8e6698bfcd118ee8906d72", peakResidentKib: 596836, elapsedSeconds: 4.48, measurementReceiptSha256: "e05e97bad21ae0b38c1b71be5ae8a9e5702375ee731844aaca073780e5c5064d", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.PortableHandoffConformance", codeSha256: "73519ceec3b2524e237c6d02f9b27112257c815d154c9fe39cf19ad89b8c3844", peakResidentKib: 1062356, elapsedSeconds: 12.8, measurementReceiptSha256: "1ff1ffdb16eae4102e98f5d8ca2f86b8b1533a30b9f14ef25047415a931680dc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.EffectDataConformance", codeSha256: "b3cfd0e05dbfdfa0144ee1a66b6a02eb21a51205c4cf05bffb1c966177779626", peakResidentKib: 1282988, elapsedSeconds: 11.7, measurementReceiptSha256: "2e78aa2cb30ba2209e5e39a421fe6a64c7cdade45f7af0fad480c962dae902dc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TransactionSourceConformance", codeSha256: "5abd14f87985dd33d976f91e6268a31448e131d82e15b25c94cb632df7b0b1ef", peakResidentKib: 1674116, elapsedSeconds: 23.15, measurementReceiptSha256: "4f217adac4fe1002a61ddb41f9573f3a49f239f3653f96ea795afdac01245f2a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TransactionSourceArmingConformance", codeSha256: "89f2c69e52bd8852c491fdb97688a038a8d7d37b6afb194aec85b7fb6192af2d", peakResidentKib: 1630352, elapsedSeconds: 27.7, measurementReceiptSha256: "628ef084f13e7dd6cad12d680a2f7201a0a080ac6a631584818c66d339ba15b1", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", codeSha256: "7543010d56c4e32c56d8c07228023861d0093694596b334a53060afb5520c4d3", peakResidentKib: 2660568, elapsedSeconds: 33.57, measurementReceiptSha256: "98e15fc15ddcb721f54d67782425de3e1dd173de70d29821bc73ceb775a8fdae", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", codeSha256: "71167801e0b492522cef16d507c9dd2034dc9a24f1e92abd5484abac24fc04ab", peakResidentKib: 3303752, elapsedSeconds: 11.68, measurementReceiptSha256: "8c0efe6d30efaaabdf1dda5edfda35d5783354a567210eeb46f9107de62e2b62" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", codeSha256: "ca7642bc8d817e346fdd6e96445160d022644386c6b040146bfe0214d09a4e05", peakResidentKib: 2089436, elapsedSeconds: 6.33, measurementReceiptSha256: "2aaec3a679a8d8293ef1d4903c15d4bfd258c9d25b291d7fed50f3d950505326" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", codeSha256: "5376c328288de7c4ff699d04c500bd03e2ddededdf107a84bf3c2b83737ee374", peakResidentKib: 694184, elapsedSeconds: 0.74, measurementReceiptSha256: "c1277fdbc092ed31e7bbccda1269cd074c8b4253fa21cdcfe1c85bcedc81e790" },
    { module: "BpmnSemantics.TransactionCancellationConformance", codeSha256: "13939bf1994ba72fd98bc619d25e82e745c02ea5384c9be9c92f833b75f8c378", peakResidentKib: 739604, elapsedSeconds: 12.61, measurementReceiptSha256: "68307f352f242b4dffbd13ab0a167ab904a9b599567317e78c6965bc3c7aaf21" },
    { module: "BpmnSemantics.TransactionRetentionConformance", codeSha256: "5b3428ac82235a4bc1f165d7773a4af031fa4d4ea021f5a93fcf2792b3bf5afc", peakResidentKib: 627612, elapsedSeconds: 1.49, measurementReceiptSha256: "581c50e29e0328c94dddfed941cc70e6f83721f88162983c810cbb4d7c9524cc" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", codeSha256: "464496abb80f37ea1ee8c2cc05dc42b8c10565fb3833d7c909e464edaf3741aa", peakResidentKib: 2294816, elapsedSeconds: 14.34, measurementReceiptSha256: "f457bf10d3b3dcbd1b94ed93ee4c97349fee3990ee173ec5e9756824a6d688da", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", codeSha256: "359afce41247e00952220c469fe5ea932446abca01f9663a582b6dd8b18f6016", peakResidentKib: 2683848, elapsedSeconds: 12.33, measurementReceiptSha256: "52dd8f8f24f174a562e269e6b9924565ca9b422c964527a90c93ee026d46e7f7" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", codeSha256: "d0dfcdeabf1663ee7f2207cf40c3c7abf0dfb80d6c45e97a010dc34132fbb3f3", peakResidentKib: 3112056, elapsedSeconds: 10.25, measurementReceiptSha256: "f265c5b22259c53e36d8214b14c71d3ef4d9f41d8d1487cf2b20ee54045a6ccf" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", codeSha256: "91c432c14f5a2b855565f85baccef4f3d595ed0d346cf66f79db0add36865875", peakResidentKib: 2582084, elapsedSeconds: 11.33, measurementReceiptSha256: "0721f71d3e55e3b0ae5f038567c4eede0d1fbe5375126ddea43af460f636a98c", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", codeSha256: "b64ccfab7933d2b01476cf7dce7641b62b5e79dbdbb400a6911a00f0bcb84fbb", peakResidentKib: 3200528, elapsedSeconds: 10.99, measurementReceiptSha256: "570f5d9d254522e8dc20b6b4039ffcf5ea3bada81183a91de8fb516aad0d18d0" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", codeSha256: "e2c68fdc0fe9bfae88a981c1440b400de3199d009be825141a3e58acaafa722c", peakResidentKib: 388476, elapsedSeconds: 0.67, measurementReceiptSha256: "676664ad53d45b6d23f5465fa86cb37e603845115e49470d372a21d44a98041a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", codeSha256: "d2e90a1ab3a7c2595feb2c62da2d17e66228cf21175ff84176dd2f3273e5e423", peakResidentKib: 1117612, elapsedSeconds: 16.12, measurementReceiptSha256: "83884b7de3e198252873ad303e0ea5bf1c94781631d8d4b598f97bb9de1efc06", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", codeSha256: "609d7a149ef9ad2e19333e79271f6b76fc59469e9a9007c76b99cbdae5466255", peakResidentKib: 1310292, elapsedSeconds: 8.91, measurementReceiptSha256: "141d0d1252b17c5ea5ffafa8ed2c97e63e3affd9e5c551ac979953c5e751030b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", codeSha256: "ecfe4095c29799986806aea4a61c490bf39f68a686436e9acd9753aca063385e", peakResidentKib: 1488984, elapsedSeconds: 13.23, measurementReceiptSha256: "e20bda514f9343fa3be6b60409b2750ec1f319d76221250dd966e2d39d6ae108", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", codeSha256: "6a15841a6e7fb553380eb0719b2b1bd8b2b0b5a841cdf20e87364e440f39cd91", peakResidentKib: 2684740, elapsedSeconds: 20.27, measurementReceiptSha256: "5624a485e823e7655e7e0494a81d06da86f7526a119db11ef1afa6bee99b1be3", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", codeSha256: "7044a902ad81459535deb6249928e8c7e22eca36281d9abaff6b314f0d46b270", peakResidentKib: 2106088, elapsedSeconds: 27.01, measurementReceiptSha256: "8a108600669b2e862c4b02ac6be554c06558e0e13484fbecf81c8b0bc89206b8", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", codeSha256: "ba7a554645b485138034622af9d0fc7644aed9738b8576278c221535ace82ed0", peakResidentKib: 1804968, elapsedSeconds: 41.87, measurementReceiptSha256: "8f6d8d63eb728a75d071e37e697fb724880b1b5da68559435150424026a1a5fe", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", codeSha256: "3a6929c1f5c7b3ae136419e26b0a3f744aaa2cd857723cefb723c4275df9c8ad", peakResidentKib: 2569784, elapsedSeconds: 18.38, measurementReceiptSha256: "536e3599fe4d93a2ae1d0af151a78d51a41275ca5b8b318144906535666cafd7", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", codeSha256: "c5dc956caef7070712f965f9d36f0fff7218a6aa214e4624308d0952cabf72e0", peakResidentKib: 1054668, elapsedSeconds: 19.54, measurementReceiptSha256: "4331db1678f98992ddf487a8b1dec2b7bf94cf31b8f533340f5ab56453ebe7a3", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", codeSha256: "27c2f1f75bf1bf7b9c38b75a371fc8f4ab415ba8d5054c30fd7d93f28eb9217c", peakResidentKib: 2036116, elapsedSeconds: 99.3, measurementReceiptSha256: "cfb2729ac7db315088df4778fb0fbc2ac437860cfc63302f2c56d2087ff990f4", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", codeSha256: "ff95f07cc3f2049411a3900569aeedad8590ba73ee641ec8aaa9f176779ac867", peakResidentKib: 2211620, elapsedSeconds: 117.65, measurementReceiptSha256: "ae8c1a207b53eae902941d2f73dd05cb8b8d6c9dfbefb61bae68c6c6a41abfcc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", codeSha256: "03314352a02ffb23849b0ce8ec055950c7e60de6f5517e2a474be652c3f39b8a", peakResidentKib: 1506552, elapsedSeconds: 70.62, measurementReceiptSha256: "2835621f133fcb949ea373cb699d73fb1f21783bfb945ee20208a8827c684dbd", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", codeSha256: "a00f371979eabb13e6b3e988845b3fb9fc5336a92360e9e507d75963873b04c6", peakResidentKib: 1144900, elapsedSeconds: 5.69, measurementReceiptSha256: "551cba9c1c54038bd8be31159a7e9846d44e8bfd5047fd8f57ecb1cebd443341", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", codeSha256: "287a7ac86d78c122fe91b5bb903a1a4c117e44e60c2ee42ec725147aac876db9", peakResidentKib: 1878400, elapsedSeconds: 15.52, measurementReceiptSha256: "ceea599b33522aa3d7a935060b2033f6b4a8dbcaceffb8d28c9bf629804ac26a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", codeSha256: "2a9e0e67ef46cf368f31c7276639330e7851a3d4f793e8357aaee9b67f324bb5", peakResidentKib: 796248, elapsedSeconds: 3.03, measurementReceiptSha256: "e52cfdaa61aec9436efc56204021d2ea531b5a034a03a7730cb4f328afc1202a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", codeSha256: "056f8007414fde8f85435d85efdb39b8b1937475425144d18cfb4b05aa938c77", peakResidentKib: 711552, elapsedSeconds: 1.27, measurementReceiptSha256: "bdceb4024b4b4ee9d21fba257672382f3021d39b8c3aa9418bac00a450581b55", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", codeSha256: "43d4a04009835fff395ba4c9a58c962cab700b029d3413c2c4878ccc95377936", peakResidentKib: 740344, elapsedSeconds: 2.75, measurementReceiptSha256: "8a8d4f395669fe31c6698bf7f3dd658894998da30a28aa7d55cdb8596b30826d", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", codeSha256: "7a8a5adf83fad125165a253093600bb83a90865962f387a6feba6e8ca899e0e1", peakResidentKib: 1479624, elapsedSeconds: 35.3, measurementReceiptSha256: "7250d61e2a314a77ff63fbdef184276df6a86a5b12afb0d161e0183930625dd6", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", codeSha256: "f1b882c887fcd25bdcd70a7b363a26a3c37bfdd2ebe0e1d503fe228c414da660", peakResidentKib: 1141900, elapsedSeconds: 12.63, measurementReceiptSha256: "41201b966b7b48497e271d8db86a6437c00018e15cef00fbfb9e9efc1a611d68", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", codeSha256: "bfc074919dff308976883a2d339c84bc0bb8a7b31a2f8dcfa211f248759588f7", peakResidentKib: 945176, elapsedSeconds: 4.22, measurementReceiptSha256: "c8d57fe59d6bb2ec3ef97943a15fd2e73f697a7eb8ddd472c5661bec9ccc8b64", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", codeSha256: "51fe1976b1f889d86785c3f47a6d3085e3d2f0c9f02135eb8c50b8400f02ad0f", peakResidentKib: 955152, elapsedSeconds: 5.61, measurementReceiptSha256: "f66d1d2c68d4eea7512868832bb61912edc3d59cf14e57a42ecd7767fe369823", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", codeSha256: "16a2c81789fc00bc984aa2db86858161ff46b8c0428de4fe9e6cb463df20da40", peakResidentKib: 1305588, elapsedSeconds: 16.69, measurementReceiptSha256: "6e0faffe8c21fa5f947c47e9ccc33e854459c8a8f6ddac67fb539ebe01c07be1", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", codeSha256: "275fd2e6e59fc7635758bc024751611bcbf425543f44f8d51d32318bbf154ca1", peakResidentKib: 411160, elapsedSeconds: 1.14, measurementReceiptSha256: "1e13dea837040d80d80c0b79fea84e252e0c5702b175520ba35f013a4cae5cc9", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessageStartAdmissionConformance", codeSha256: "db4035d00c029934b8cb5402f382ce128375cbc5bbdd4a47e6c0a73d00d515bc", peakResidentKib: 997540, elapsedSeconds: 9.81, measurementReceiptSha256: "f96e5b11334d5c2365e5d214b4efe311b6f20d93a636f5201b948cccb45524b5", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessageStartClosureConformance", codeSha256: "feabd9199b412eeb3ddf95d79fa69a6794fa80d990f640a868f0c9b96f8c6d2d", peakResidentKib: 867136, elapsedSeconds: 8.6, measurementReceiptSha256: "0ccd88f3174733c41b768c0042932770e55c91297ab3a8345fd7c31b386440c5", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessageStartIdentityConformance", codeSha256: "190cb22396c6e8e890d2ce743b1f5e10f33158dcbf7a404e0abac43125964000", peakResidentKib: 972904, elapsedSeconds: 9.05, measurementReceiptSha256: "88cc5eb6ed788bdcbb7b45486707b7e84c11620f63171d864105c2b8b1a442ac", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessageStartScenarioConformance", codeSha256: "6a7bc11aeaef1d427a3fa9c1752f71d6414a824bb172775ef1dec50a447c72e1", peakResidentKib: 1151344, elapsedSeconds: 7.48, measurementReceiptSha256: "e9fb7a27b74a8a04d6cb7e1b24c69302e4af10903dc2687f025988490aee72f2", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessageStartConformance", codeSha256: "b0af696a951c386d29f76b87630266e422632d878f337964abe74968c8f7215e", peakResidentKib: 439412, elapsedSeconds: 0.95, measurementReceiptSha256: "0de11f22047c0e740137f013adf45c01ab572f7a51ef4365c886ea61b896e668", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessagePayloadCatchConformance", codeSha256: "9e9cf8ee27b201422cab0a6f27b421cec3202bb4761b05cf43964e40e0a3994b", peakResidentKib: 1393312, elapsedSeconds: 32.38, measurementReceiptSha256: "dc2560f271ad73a36f85ac3a5a04f4f57777f14e571da5091929a626dba2f0dd", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
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
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", codeSha256: "5ef581dd26cbcaa4c0d63f9a3a916988e379b9b588bc46585cb897656ffa6bc2", peakResidentKib: 453676, elapsedSeconds: 1.69, measurementReceiptSha256: "33462150199c81fee24659fbbb150cbe4ffcc73693c4adbc1bc47632dbf53abf", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", codeSha256: "c4c959207c03f5d3931ee4c1bd26e1492ee4f2fcc88d380dd78e7075a6986c1e",
      peakResidentKib: 2054656,
      elapsedSeconds: 13.52,
      measurementReceiptSha256: "860f79d37d283024e003bc1e88388842348199b974ada9286111df5e25f96972",
      measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df",
    },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance", codeSha256: "dda0c3f94c8958eb42998a3309e25feafc225524cc9ef2132105d399fa88b789", peakResidentKib: 1481420, elapsedSeconds: 11.16, measurementReceiptSha256: "d8fb7d2ee53972fde848317e8bbe47d39c6837975fcad22edf8046fb5837bb8f", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
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
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance", codeSha256: "51f6f0376c96eb7216ca0a84a4378f758c621f3fb85775b3a9877a2aafd823f8", peakResidentKib: 548272, elapsedSeconds: 4.88, measurementReceiptSha256: "009eb6a676182ecdf51b1301b287efbff5b53d798d5e8a62a2511f2e3497a275", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedConformance", codeSha256: "9271611fedc4f08a78731747a4df84dc2b265ee103e0e818ae5515446ccb6e8b",
      peakResidentKib: 619360,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance", codeSha256: "dca9ec9f12385d66287d733ad7ac970804335b22d22d28a28f594b27aaad15f2", peakResidentKib: 1020716, elapsedSeconds: 31.41, measurementReceiptSha256: "09462b28509abcf21267e41e21311ea2cb1561bb1d84e17e9885e095dbfca677", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", codeSha256: "9af8f6f74002fc1a36d5ecf1d343bcb0d6c01bd5dc174015866bd5d3d8947ef2", peakResidentKib: 961240, elapsedSeconds: 8.77, measurementReceiptSha256: "d6fa723dc0b1d1b33d69206ace7cd4c84befc46faff738f87bd1d4b9ea731fbe", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", codeSha256: "28906e73f7086730f1f0b465494b489b7b59db6ff10110170c15b4254cf9d765", peakResidentKib: 1036808, elapsedSeconds: 21.91, measurementReceiptSha256: "ee6d8a71486b0300a239754bfa837d68708c14374b43741c6200d3edccb5b3d6", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CallActivityConformance", codeSha256: "83da2436648ba5f7cc7ef357ae89065fd4751fecc9755bc83d0eb434c8554c5c", peakResidentKib: 468376, elapsedSeconds: 1.71, measurementReceiptSha256: "1bd64075b3068da4ed70384141b84ffabbdade22bd7801025f4ad6bd38d77728", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CallActivityPairingConformance", codeSha256: "b160619ed65cabd4d3514aeac99e9250351eb9270f0236de271ca3b87a16b1a0", peakResidentKib: 452304, elapsedSeconds: 1.06, measurementReceiptSha256: "6425f99299f8262123e36ff1bdbe1171ea99d2f185fd223e34896dd5a1ccfa0b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", codeSha256: "8ed7a05d1e11d6e7940ec4344d1f6cae426419108cb498e46f7eab3c9f056a79", peakResidentKib: 1697944, elapsedSeconds: 35.06, measurementReceiptSha256: "d396e1e073ae824b4a5716aa3b0fa74d4e45f03b22a24ab0fa74e3e0eab3ae33", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TimerStartConformance", codeSha256: "7cfc4afa41317474329c289482d84dccec21662e3377cc2f2e91ae615703e0bf", peakResidentKib: 1333360, elapsedSeconds: 28.84, measurementReceiptSha256: "fae5d6d3bf1494fa99ffe078e2f57e9a4ba8d93f71b259cfe98ec502c15aa215", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", codeSha256: "c224da865d9cde40dfebb4c9cbf465bef3eefb420e6e3d8c7f3bea484f6b1b79", peakResidentKib: 1779068, elapsedSeconds: 46.15, measurementReceiptSha256: "ae9f7748a7cd1985f1a5012e7fc15144502cb12afa32b380c50bae12103a6bb3", measuredAtCommit: "e768ee78d8f5f75ffcb4c538c5332fb504034940" },
    {
      module: "BpmnSemantics.RuntimeStateActivityConformance", codeSha256: "c7c675fa9958593a73f0b4492255e3c8e762a15b5b4c4f1eb460b752e91349eb",
      peakResidentKib: 618664,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", codeSha256: "455b4adb55ba35a03b1900fd7411af84208ab659ac76db7c02f9dc7c5027aa4c", peakResidentKib: 1044896, elapsedSeconds: 18.22, measurementReceiptSha256: "305299d40525d0cc86d6adae08223caac6d0da67e117b7e0155fd15d13a25042", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", codeSha256: "fcbf3e59d80b53a51bc85399aac944f2b120d93372df35a9fd9645231f58c69b", peakResidentKib: 1013076, elapsedSeconds: 15.20, measuredAtCommit: "6d231a2b" },
    { module: "BpmnSemantics.ScopeCancellationConformance", codeSha256: "d82f2c2967a807a7e6e3205517b96c5e6aa16ba1ec594fa57f01b8e42bec66e8", peakResidentKib: 414220, elapsedSeconds: 1.24, measurementReceiptSha256: "fe3eeeaaa48d2c475f933d81074560346c52f48b14f177bb3de42220d54408e1", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeCompletionConformance", codeSha256: "27468c70c9ef4bd492769f042afece8da4b36be37e7ce7ff8c641e74b1bbfcf4", peakResidentKib: 398648, elapsedSeconds: 1.08, measurementReceiptSha256: "7811a124f17e19850df2c34ec9db06b89286956f542e7fb25286c75a0b0a483b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    {
      module: "BpmnSemantics.RuntimeStateControllerConformance", codeSha256: "ca7922a0af0fd699a468988b4c0c69b3f0960b969515c503c7a97454d12ba3f4",
      peakResidentKib: 2089244,
      elapsedSeconds: 16,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", codeSha256: "40734ea3e99b8ee2dbd506e1a37da1b57dd676379d17115cad057d095e1ced93", peakResidentKib: 437940, elapsedSeconds: 1.4, measurementReceiptSha256: "cbafc94e92b13bff94f602bf03e3feb247b26e6b80175a599a7aac85ba66a3d7", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", codeSha256: "d8e06c5189889a48e0935f126697ecefe66f6e1f1acc24335d420e7c012d895e", peakResidentKib: 1340184, elapsedSeconds: 13.53, measurementReceiptSha256: "8f3e9df29cb3d64ede5cf85165e3c98d1332f8ab5cd86a14c4e2f8aa75eea8f1", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", codeSha256: "dc29a2d9fb95c1493974f9dc1ff66c2ea9e1e580068565fc2d28edf405fe4b79", peakResidentKib: 1277576, elapsedSeconds: 21.58, measurementReceiptSha256: "c9892046b75b21e97acb1d56b470fa8f49b16ba242ea84020eb6e812f7aaa5d6", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", codeSha256: "0add3931a882d61ddcfe6b9c78b2bffa31c2fd47c943774a27b119d2579a5225", peakResidentKib: 1859444, elapsedSeconds: 26.64, measurementReceiptSha256: "286452e7d721869d98443660b908093536acc375144bcec7d7a9ac43898fa859", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SemanticProcessAdmissionConformance", codeSha256: "31a21b78461e2697db63f9f2267e6a9b6129d1339e70a97f451c7a6edba437a7", peakResidentKib: 1182476, elapsedSeconds: 18.88, measurementReceiptSha256: "c1a9bd8a805eab28cdbccfab951be6cbdff89e61c9e8d1886c2c3763077e0c17", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.EventBasedGatewayConformance", codeSha256: "e5decdff16bae4f6dd7fd93137f02ede0ded55223e0a6fbab27aac8bd60dbf75", peakResidentKib: 1219344, elapsedSeconds: 28.21, measurementReceiptSha256: "eaa2c0100cf7ab4bf8a26e3f0c0d6aa94d69e0a5b21ae146ac9bb92943a16aa1", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", codeSha256: "c468ea4d10bc547a0886353a817f02935a622cb33a24c050971576afb964f8be", peakResidentKib: 2169024, elapsedSeconds: 45.35, measurementReceiptSha256: "73c1456c570962e73f585b6e80bf8969faf520e8fcf7fcdc99031f4db0e15853", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", codeSha256: "49b68468a9095882a9eb59ad9edff3c7f9b74cdb309801d54189bbc4b94e3212", peakResidentKib: 1313732, elapsedSeconds: 37.76, measurementReceiptSha256: "ca5a42d8ad34e25ff3a8b23a83d42d2768a3e5c48e52b48babfa09c4566730bc", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", codeSha256: "b94be0af1bd729d1cd08e85a0edbbf6ab087f12c4ce4c63bb2ddce77488d1006", peakResidentKib: 1618428, elapsedSeconds: 15.78, measurementReceiptSha256: "ac483bf99ed7d5ec1ba8c802ed4d89cbb91abbb0cccd84a38da61066f47abf83", measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", codeSha256: "3fb86b097dc5e34b62ac218b9dea3e89cb92c5e2524dafddf2cb170ce7c81936", peakResidentKib: 1142980, elapsedSeconds: 15.1, measurementReceiptSha256: "8975823a06320913a19009af607a31d96116d74f0bfbcd65ad7a32b410850bf4", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.TerminateEndEventConformance", codeSha256: "89e6e81a596c2b0ddafbaa2275d97f2954cb87486ccf97707ab9859166490d9b", peakResidentKib: 1444436, elapsedSeconds: 34.14, measurementReceiptSha256: "0a5073b1e02905cd1fbf0ad7f66d79424fa5ae2cf87c40352807292305e8b873", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RegionalRemovalOwnerCoverageConformance", codeSha256: "c9cfafe4cbc67a7d6bcb92ae7d33259af6f6b0ec8869f682604afbcf83e1e80b", peakResidentKib: 1362400, elapsedSeconds: 8.73, measurementReceiptSha256: "3ea62ba62c04af1981873406380774a2a67415e2a32b45de97179fca96d6d8df", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SemanticProcessConformance", codeSha256: "6f04140fc07814c1843dab5d607b7d48fbec6baad86c41c40d1bdbae81a65930", peakResidentKib: 1254160, elapsedSeconds: 13.1, measurementReceiptSha256: "5c9c03f9f345ca0ca23311abcc6f4b84e02d24b2ccf6b0799fe462e56ab9a93c", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", codeSha256: "1421bc07f37bea1009ccb2e65ed38715b54bb978599071e10f70c3e801201a47", peakResidentKib: 914300, elapsedSeconds: 19.36, measurementReceiptSha256: "cc7b902719beafc72e5f7227b7b5c3ba2d30af7ce4176cd60c12ccdb5f6277bf", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", codeSha256: "5c0e472a84a4eb80b8c7983d4f05f7386a49f85e318782c782d61b0ca7621b0b", peakResidentKib: 1108076, elapsedSeconds: 22.93, measurementReceiptSha256: "8c08c716bf08ba32fdb13cbac71a7d086c6a9b171883708e06f49ac127afa03b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityDataInputConformance", codeSha256: "59c58f79e6db613c7aa62e5a8ccf2fc3dab6e6349a65d0b22c94160d42cc7d43", peakResidentKib: 900168, elapsedSeconds: 19.51, measurementReceiptSha256: "fc61090154e7ae8d441fffbce718c3364bb84e2acd17a0c40c1a07c7aa1fd37b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", codeSha256: "69e71b69c28247f194c094983487252afad531a9027c3d9744596c7f8480b7e6", peakResidentKib: 1066880, elapsedSeconds: 20.86, measurementReceiptSha256: "5570522a3487636fe39728f5ab622948e4ddd8a9fa46b37360ddadbe222eb4e0", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MappedSuccessConformance", codeSha256: "b1865b764c00e89eaceb8bcd2c382d6d472f43d3c74096583fa11d62e29b1e4f", peakResidentKib: 1261932, elapsedSeconds: 15.25, measurementReceiptSha256: "9ee9da08843aae94fe8db4f278241926cfda9ccaa801b6065f55760cb961d4fe", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InclusiveGatewayConformance", codeSha256: "b782c73adc11929d641269add1b2f353c27241150d5e02266c280d68d9b8992f", peakResidentKib: 1618416, elapsedSeconds: 31.25, measurementReceiptSha256: "64e92eb44a302435f4b190e5ae82b66f83e7ab440f2dc6fba35c32524d92479a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", codeSha256: "8e743a411fda493e8cc9ce7cab93b2c570bc9f0730f9f9b88c6b5cf5e7cfbe79", peakResidentKib: 853780, elapsedSeconds: 7.01, measurementReceiptSha256: "6f592d98eb4eee1048c8355be8986c5361cc921d685c0d9581aaf7e435a0f745", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", codeSha256: "7a8336b73c7c7a284dd91399b0fb817e8aa72109742e77184b6f5d9d6c53d729", peakResidentKib: 1149996, elapsedSeconds: 15.32, measurementReceiptSha256: "ac09c2acf915de48d80e55ddc450cbec277e0b715f9d2b6d924e9d31467ca8fc", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", codeSha256: "2a0c4fe1b919b23af621bcc29ab1b85d4f6eac091d0d66eb084a18b46b9fd90e", peakResidentKib: 1728248, elapsedSeconds: 40.1, measurementReceiptSha256: "0030947105d92cae4786d6415e0db828a5b072bcf7c0f7f5371cf8d98cb23c1b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalCommutationConformance", codeSha256: "ea959784570b5b7e107af9653566899969530a5cb6d06070aa2c3f8e91647721", peakResidentKib: 1069188, elapsedSeconds: 9.49, measurementReceiptSha256: "c9362e84c2bbfb9785b0b7b780c1fd24c333ae66b7dc5ef1112a344e2179fb6d", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", codeSha256: "4b61f65247f78126c770a7c0aa735625090bdbd1d05ee1d86077100bc8e9b409", peakResidentKib: 1347216, elapsedSeconds: 14.68, measurementReceiptSha256: "2567208d31354a7aaeef983ad25b9362290aab3a43e07b795f714c98986d2501", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", codeSha256: "f16285ec61027562a7f845cb92f85d6df1faf8ea15580dfa2e08a68e8ae23c4a", peakResidentKib: 2310568, elapsedSeconds: 20.71, measurementReceiptSha256: "3294c8aa6e685b66607deba69ae2dd9847d52549e9281899dcdf09205e5bf8c8", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceJsonConformance", codeSha256: "6ed0557fba2e6789d43413871fd928e2dcaa5e644b3da5212fdf7a1ba420ecf4", peakResidentKib: 2326880, elapsedSeconds: 12.15, measuredAtCommit: "b4544cf6" },
    { module: "BpmnSemantics.CompensationSourceCompatibilityConformance", codeSha256: "7c0e4543946eaae8c2772fe9a92d235631475c4b8d2481d3f4b44c2fae76c24f", peakResidentKib: 2023220, elapsedSeconds: 14.78, measuredAtCommit: "05244cf7" },
    { module: "BpmnSemantics.CompensationSourceBindingReferenceConformance", codeSha256: "f897c6e858567a08212640db11b9ba7a7bb25cc70185f729f7efde0246d3c83c", peakResidentKib: 2317104, elapsedSeconds: 27.05, measurementReceiptSha256: "e528df3d7f200392d769e7bddbbf92ac977c630c747089132b462e7cfdabc97b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceBindingTriggerConformance", codeSha256: "25bfdc2b000895f1d23403055e47909fb438f2d1b6fc53de9a6aad0907c6b6bc", peakResidentKib: 2040080, elapsedSeconds: 19.57, measurementReceiptSha256: "d3000cf4546823c4f9e41fd571840e18eefe554af5ef27a247b754768c0ffc09", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceBindingStorageLimitConformance", codeSha256: "986d9d1acd9fb2db9d73e3b45b57606c08a85fa49a8c3d03c9b8723693039d79", peakResidentKib: 2072640, elapsedSeconds: 36.65, measurementReceiptSha256: "da122f2a470292847ab904fd0a2e07010a398a51a0632929ffa1a4c6ee105a42", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceBindingExecutionLimitConformance", codeSha256: "61c25244b309667a233502aa70ea5d038e775b2d28f0ca9916b74da21c0aa06f", peakResidentKib: 2072784, elapsedSeconds: 25.4, measurementReceiptSha256: "bb59e875a1903943b4ea40d2333716b7a28b1d1a625ad72cb2999b4323520e18", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceBindingValidProgramConformance", codeSha256: "3f372099a9275646c4668553e3e7b8c0b8c7a561d170c333410f888868786600", peakResidentKib: 1569964, elapsedSeconds: 10.78, measurementReceiptSha256: "2389c16bf435393fe2664f857e68af7d26bcc69472f69ee321061f98398556e2", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
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
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", codeSha256: "af895b3d5fcd1f194f525908a27a3c182666f7e99ad9d9be2d4457e021d3bcec", peakResidentKib: 823216, elapsedSeconds: 5.21, measurementReceiptSha256: "593f60c7454d4aa6b27c58613f96771e1c89db95bb703b815a2bbd9ee163ea1e", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", codeSha256: "3756a87539700a9093a5a7bce8a0d2c165f41dd153dc77fe01663e059984d110", peakResidentKib: 538496, elapsedSeconds: 3.57, measurementReceiptSha256: "16b225bd79fd0d4b71532e9e7ba4d1e82a51a89b405661434b72307efdc9207e", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", codeSha256: "7671f21c64689529a4b2bc241e7aafec7c804d987a6a9bc75045fad633e76cc5", peakResidentKib: 823788, elapsedSeconds: 2.97, measurementReceiptSha256: "8677e10b46af5d791230ee8a1542ae77ea935b43f3e2a735a8fc29271cb85607", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", codeSha256: "3f3c8003dffd4a59778d1288289398d27c7377420aa7e0367236a8ead3aee835", peakResidentKib: 1142408, elapsedSeconds: 10.24, measurementReceiptSha256: "eef89648bb704bce50d63b2ec4ee5262202029442dd5470647fcd68add74e8d6", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityDataOutputConformance", codeSha256: "9664850e6f8a6fe3c6e2cbef97679586faebac51b537f937a0ddd708f8a9fdc3", peakResidentKib: 1132560, elapsedSeconds: 22.7, measurementReceiptSha256: "9d69c3a9874385f35893cfdefd61c0a8b6b8830c248e63e58462ba0612ef6fce", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ReceiveTaskConformance", codeSha256: "2904bdd31a9c29316b3f2f68de63f92e265c24e7f606e86bcdb5a810dbec37e9", peakResidentKib: 1190536, elapsedSeconds: 24.02, measurementReceiptSha256: "f755adf4106bde55be40ab0d57197c27b86e22262c1cdd564c57ff6011b3d04e", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", codeSha256: "e98835f4ce0113d50dde0a678103542f157b89f90e20fc12add5ad297b517f9a", peakResidentKib: 1019768, elapsedSeconds: 11.44, measurementReceiptSha256: "005d429c9d13aee5f91b4eefe9c2bb531d991b463375480b0f6a9ee3e2746dc1", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", codeSha256: "b9a5f1d58930f4238bc2e6f067ac65866a560efe661a1e51e9d79f7c51c19fd7", peakResidentKib: 1212696, elapsedSeconds: 8.07, measurementReceiptSha256: "8546bc50fe859501bd3afbaaed21d6dca4da436cb176c7628eb71d7e05e0ab1b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
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
    { module: "BpmnSemantics.UserTaskInteractionConformance", codeSha256: "095237d58775623df7b80a275db00b08fb44f354197e56dec62017ec2d7581c3", peakResidentKib: 852152, elapsedSeconds: 8.52, measurementReceiptSha256: "aef466b5475b48d90645f7340b41ce84a1e9248235ef8e6ad54ea3e743d6cc4e", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", codeSha256: "c8946c90f407d082f95dd239836bc916cad2c02b7ca45be4928409e303230fde", peakResidentKib: 1040704, elapsedSeconds: 12.6, measurementReceiptSha256: "d2b2a7fd93bfdc2a3265ff87755a55233ad50e49241d32499a74f4c4b0aee381", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", codeSha256: "cd4433b9951ad6109a81d109d0b09a8f9c078c066e0fd74f13ecda188113ba60", peakResidentKib: 1162012, elapsedSeconds: 11.88, measurementReceiptSha256: "f2b881836bd4b12ccdbbf3c250cdbf42754dac770d7897a82fea2e117a4b00f5", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", codeSha256: "88354c6c1b9bb0456dbb197d82aee50cabf5d3075c729445f3df62785419e880", peakResidentKib: 1051596, elapsedSeconds: 6.3, measurementReceiptSha256: "2d56d7e6745d0a525fc94a045138b8011fcab08ff6f00497dc61fca0a7dcac2e", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", codeSha256: "4da3b8f2c0d36c73bb87081da84ccb4b04242854056f7fce5bd7d32c63666263", peakResidentKib: 1024968, elapsedSeconds: 5.9, measurementReceiptSha256: "c37ce197a2c099b34c12dea8d57e732641ecbb33e08ad08aa46a468eedce1df8", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", codeSha256: "a29ee5178bd07f2f3af0a7d1a05757bf6a3db41405a5d1cf5b61cd2961458776", peakResidentKib: 1464712, elapsedSeconds: 7.79, measurementReceiptSha256: "9ffd2f000aee896112f665fd49017e6fc80e10cf46e27ca479aabf6578c25485", measuredAtCommit: "519c7c5e" },
    { module: "BpmnSemantics.ActivityBoundaryMessageConformance", codeSha256: "8abb5484f92fcf09959c7e26bce8325839e2cf4a45b77cce105ff0f60b001379", peakResidentKib: 1251196, elapsedSeconds: 27.2, measurementReceiptSha256: "303b51d64220178e71b2e47960646902ef4911983cc52912d74fe1e650f7ea25", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", codeSha256: "566e03f53614f011e7fb16c27c658113036f110d624416acb7698ae06f585cac", peakResidentKib: 936016, elapsedSeconds: 8.08, measurementReceiptSha256: "4d62256fe2c3beb5d48313cfab6eb568f3672d92d4c5b0190af5b59ec422f3ed", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", codeSha256: "10213b0dae8e73271794040a254f54605e47fe0c7d857e5daad8cfe7d4b5f8b1", peakResidentKib: 929764, elapsedSeconds: 6.07, measurementReceiptSha256: "b9cf19caf443e7db3453b11ec4e3b1b39ea65f507e4856816e8c19235d94f91b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", codeSha256: "3497c4239b63a904c66ce45378cd2ade3fc378cf3b7ff10fe4488bbbd66e05a5", peakResidentKib: 1116756, elapsedSeconds: 4.04, measurementReceiptSha256: "1260b55c70d3cbf2700c3f10617f37e2db15b31a3b68f631a8d47b3db0bcbf7f", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.StructuredHumanWorkConformance", codeSha256: "8d94b3a2967c17bb63c4d4fa034d47ac31c6b1a4134c87a7b7e68e7f6cd27cb5", peakResidentKib: 901388, elapsedSeconds: 5.06, measurementReceiptSha256: "a7a555643fb262a514114dc35141fcbc27a6b34c06e7b9e88817a5e49c295556", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", codeSha256: "45cc382ef352e41d148ad892938c37fd801955c78a916e71eedfeb0b4ad5d681", peakResidentKib: 782604, elapsedSeconds: 2.64, measurementReceiptSha256: "8b240539de47999119053f74639cba5719ae74dcfb44092e8254af2e9b7b8e8c", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ProcessStartDataConformance", codeSha256: "7618801e6febe0e61035258a72c1b710b57468ccd9b6eaa1149687e1db5f04f8", peakResidentKib: 563416, elapsedSeconds: 3.88, measurementReceiptSha256: "c5b9f86be73e16d37f6919670a711eb3daef700679668e386761c2a2c03a86bd", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelMultiInstanceConformance", codeSha256: "6e625ef0c406bd9e6385d2cddea8d90cdb0ffde376e6d740604e4e622dfa2432", peakResidentKib: 1080088, elapsedSeconds: 4.67, measurementReceiptSha256: "ce90f105670c9adf3a04660e408b9c68577dce1d77f59b97b8a089413085b1b3", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", codeSha256: "909c07b8234c6ce72e11879d9acf1b427316a4914c988e18be259d19de16e5a0", peakResidentKib: 488540, elapsedSeconds: 4.63, measurementReceiptSha256: "b18f8351b455c08695b000c47f96c5378235eb36a55b24aa9b3ce0488100630c", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
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
