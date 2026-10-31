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
  nearCapModules: [],
  rows: [
    { module: "BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageConformance", codeSha256: "3ffaa1c9a4231de907d271cedba522cdf04cf32f73bdd24a937ee6e73c9d694e", peakResidentKib: 397620, elapsedSeconds: 5.89, measurementReceiptSha256: "6f000ff71766fc203b611bcc82809770a0149f0b46582afe6fdc2efc11fe7313", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SequentialScopeGraphConformance", codeSha256: "6bea97bfe5ad2fb325fb9dda39b3aa5a7f311efcf070209a78dcd9e9edfc8bc8", peakResidentKib: 1122620, elapsedSeconds: 45.29, measurementReceiptSha256: "390ec09ec02002f38e1732cc4e5cb09ad86e64fb4ff10788f79483395a2aaa31", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", codeSha256: "30c9eb88d4b47658f8d8b66a421034a47f80c67e94f918b283a9d2c439f1cffa", peakResidentKib: 446856, elapsedSeconds: 0.85, measurementReceiptSha256: "80f557eb2d09819a3c650d6e1c1637ee79a444c2bea62981484b67b01653e759", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.NestedScopeDataConformance", codeSha256: "d71dc7b1aef3dfd422f41df4f2425714694b6976cf9143bf27a6facc39f56a73", peakResidentKib: 408160, elapsedSeconds: 1.42, measurementReceiptSha256: "e5920c4826188d18301ee1c8e59568617361530765b42c1e1cad9e0a516d2228", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CallVariableMappingConformance", codeSha256: "a03b1a795f135faeba441aa47eba13c113b337b2f33a92b0c06af933b669d903", peakResidentKib: 424540, elapsedSeconds: 1.46, measurementReceiptSha256: "37938f28c7dfceb17c729e92e2acb605cd833efbe95f194dfe8bfd54bef2505c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.NestedScopeControlConformance", codeSha256: "86a6c2989a30c9ab77c7272f623f6318f9b1b0418f310ced9ce8c0a565bfaafb", peakResidentKib: 415800, elapsedSeconds: 1.18, measurementReceiptSha256: "4cd93719fc224502add9b348fb530b0b39a7b7983e3e6e34c11176df0623e3f9", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsAdmissionConformance", codeSha256: "0ff908bc99d411a84eb96baa8389e9d8651df1009e955f320a6ed3b7ee0574c1", peakResidentKib: 409748, elapsedSeconds: 0.96, measurementReceiptSha256: "cc406bba70ecaab023964ea225f117fa678f74ed8eca470c34adbdc5d0a8f6ba", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsConformance", codeSha256: "1a5353898e18a84772a3067095ac20bdba531386f400e4eecc5a921993de86f8", peakResidentKib: 406768, elapsedSeconds: 0.95, measurementReceiptSha256: "38077751579996b4ca0bd15d66bb6c6d44b30e1701b810a3a85dfb1d7d1c50dc", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ConcurrentScopeDataConformance", codeSha256: "42281e604ae00dfbc79b931ee9f6fbad1afbb27c8ea1e3940f5de64b5be8e401", peakResidentKib: 402000, elapsedSeconds: 1.76, measurementReceiptSha256: "8c0ab63c753ff46f9bebf7bffecf0bb19058a0cca51bff9e683bd662d15755cc", measuredAtCommit: "dd11931b59efccef06a7ac8a10be3ddffb8ec1d4" },
    { module: "BpmnSemantics.ConcurrentScopeServiceTasksConformance", codeSha256: "d2fdd11b0c92da4f20a93065f1a77863b729992f9363e4f2a4242d8b02aba74a", peakResidentKib: 413544, elapsedSeconds: 1.17, measurementReceiptSha256: "730f738704f7dff224a2b5187e4129bd29fead2174ef7e029a15407a712a8ace", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsAdmissionConformance", codeSha256: "dac0d008ee5b33f38ab2e7d6bb25f04d73aea2bbfae0da90a623abfaff227171", peakResidentKib: 391876, elapsedSeconds: 2.94, measurementReceiptSha256: "2b7f7bb3d085238732068ee347a565af500348abb221b3c0fc3530f5358aeda4", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsConformance", codeSha256: "b624721a47750840441f7d161d478ac474432a8c70d66a95026d2593b2e67f9a", peakResidentKib: 396824, elapsedSeconds: 3.8, measurementReceiptSha256: "2ab48bda8e0e2c684494d6469a853ddcb6075e356a295c39950caeecc5fe29ce", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", codeSha256: "1ea932a1f2e80420ebcd90a6e00dc404371bd567b620578c1e94feef04b383e2", peakResidentKib: 504924, elapsedSeconds: 2.43, measurementReceiptSha256: "e0b8260a8a7d4870971e115973a5e661db1b9a245d923d760563fa6780e2399e", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", codeSha256: "7e4d313dcdffb4b9bee4ab9e30e73d295b9512b0d84f60791e2950760fc558be", peakResidentKib: 673980, elapsedSeconds: 8.88, measurementReceiptSha256: "f518cf0f6747931d0f47813feeb049a1ae20bd5951c8d8fb1dceab1e33aed790", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", codeSha256: "503dff4a6faf20485962705ce0136476ae22e355bcc4a241a6a0af7f70a3ddd8", peakResidentKib: 410184, elapsedSeconds: 1.18, measurementReceiptSha256: "980b3cf080faee884a701ea01cb9f4bf3059ddb635a6a1b9aa3005d64d905504", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", codeSha256: "bc391e206bb2b17edab0812f6843a519cd9b0be5ffb5f39b90a3adfb081a1849", peakResidentKib: 405808, elapsedSeconds: 3.64, measurementReceiptSha256: "8881eeb6ccff17826abfa09fc2a36143a1f848982e0d197a0742dcadf441ae28", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", codeSha256: "b8cfde36ac8a2c7eaf5699036734023d895190b8a5bad612c8d1c7b1d5a3fd65", peakResidentKib: 1567756, elapsedSeconds: 32.02, measurementReceiptSha256: "a0bf3ade7f7c7ddd6b274f892377a0d0fbd96f9dd5dcaa37b7b79a22dafd609c", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", codeSha256: "285dcc1dec9d6cc412f5f043899e8e4cb16ff427fb5463beeb1b0cfce766a149", peakResidentKib: 436180, elapsedSeconds: 3.03, measurementReceiptSha256: "b90b94256e04371c64a166307db1cefbcedb1d7db0449a896361c2cd43842cb2", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", codeSha256: "4acd4bebaffc3d703b5729c96727e994bde8cf5ec0610a83c7bba0302df942d8", peakResidentKib: 376256, elapsedSeconds: 1.59, measurementReceiptSha256: "596c5852e04120457b8339b49716a7327735cdf6db39da40fa724546a682a0bd", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", codeSha256: "0c2d1dd55181e15baeb1b04470a0731b36cbe150f50fd3f6f5328de023954ddd", peakResidentKib: 643772, elapsedSeconds: 1.82, measurementReceiptSha256: "78d93a795289aa96dd3f6dfbb1432c2f60b7e214c97b5b1dcf41ebb3bf2ab848", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.PortableHandoffConformance", codeSha256: "182e74dfc83cf19c5ea057bbb9c7f00a4c4b22464173bedd56bbd6ee78dbe975", peakResidentKib: 398984, elapsedSeconds: 1.06, measurementReceiptSha256: "7ab2799c38bac41307712c1698a4eaec828a2fc1616353378083a8d7f08bbac4", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.EffectDataConformance", codeSha256: "676b2bf09fdff76d66b73546f310cec7cd71c52b4515ad9667f115a17a75a820", peakResidentKib: 405868, elapsedSeconds: 0.95, measurementReceiptSha256: "e00276449a541432918541271f83c202607fe3db34e3fd01298d71e0dba98557", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionSourceConformance", codeSha256: "ce70553eb8ddad7e3e4c9033d02abd865707ae4edc4ab1a3a564414425b68938", peakResidentKib: 1093396, elapsedSeconds: 4.61, measurementReceiptSha256: "91866851b7bc5cf95f1074878b0db2292c23e0b84ac124eb2b4c6bda50819ecd", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.TransactionSourceArmingConformance", codeSha256: "046c70a99999e900cf23bf785ce88acd50904695d27f61339c349e6af7941b11", peakResidentKib: 1225668, elapsedSeconds: 19.79, measurementReceiptSha256: "77bab65e8f3d2ec08572ee455ce66b06d3d1dc1bc0c09eb518446b8df2b2ccdd", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", codeSha256: "215b68d97f28d65936c33c7d557b06e8ff5de77786b9631edd940789ad99f426", peakResidentKib: 403628, elapsedSeconds: 1.37, measurementReceiptSha256: "7f27a69f2cf325ba2e98a8c92ac9df3afccc4ac0c7a2df122a71b4df7af95b2e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", codeSha256: "1999a01dfa14f0ddb8ab63f15039079151b53ce3d4f7fa1b635ae192a030e4e2", peakResidentKib: 398848, elapsedSeconds: 1.69, measurementReceiptSha256: "59e4ceb04ae1c713c99922269a7adaed0ff367c77d99dd56526cf3ee34a0881c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", codeSha256: "057489c9ccf103d0c6e04f75aaac73e278063bc076e0e4673fda1b001604a699", peakResidentKib: 387412, elapsedSeconds: 1.19, measurementReceiptSha256: "da821f3b852c12db73262f5bf3b2af73966bdce46e3ae8301439a61a9df25594", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", codeSha256: "bb94b63460446cf033cb8fde08505b40adc1129c1323f438ae4a007dc19cc8fb", peakResidentKib: 378692, elapsedSeconds: 1.07, measurementReceiptSha256: "4a44c210cad7ebf0446df75553cd5b72a5b599e53a2b8fe96d343fe4608d44dc", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationConformance", codeSha256: "375c5e6a8e77dee2af8c46c58460ecb5bf2c99ff85f242c17d83f23367c460e5", peakResidentKib: 594092, elapsedSeconds: 3.32, measurementReceiptSha256: "de35601e4ab4e03eb20dbae1a43577ab860fd6b5170566cacdfa79ac93248571", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.TransactionRetentionConformance", codeSha256: "c3a4f4d269f5871c3e1e01a250008f05dd51c4469105021735504235ba9d1c3e", peakResidentKib: 351920, elapsedSeconds: 0.98, measurementReceiptSha256: "b2b960573bfbe3353ddfc2adeec81f3f11fb014389117317b72bf660d329f1d7", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", codeSha256: "406f9e8edf82c1115d79127c93e10d5cc77d5b8b8b1f701d4945d88add006dc0", peakResidentKib: 387920, elapsedSeconds: 1.81, measurementReceiptSha256: "71b3528b3ddfcd8f32d621704652315e7bfd90d41465014a7a5a2113a34b148f", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", codeSha256: "c1563e0984f8ba04016f08e33e76b264a371471c29ba36a64016141c71324fe9", peakResidentKib: 387732, elapsedSeconds: 0.96, measurementReceiptSha256: "59c63e89bebe6fabe72940f71e7ff2814a3c90e8c2133c2d1e2c8ea0a6709500", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", codeSha256: "7c2d68698f90c3207432ef63b66db4a157d17fd8dcf780f58355fd94f0a9e50a", peakResidentKib: 388120, elapsedSeconds: 1.17, measurementReceiptSha256: "610c21bfb6f85e898ad8b4b8efd8b14e5dfe33c8e0f8eab7f43f67730bbe3ba0", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", codeSha256: "23426d47585caae065e397a61cef45c4c833f0f5069d8db87bb62e7fd4667a79", peakResidentKib: 388060, elapsedSeconds: 0.96, measurementReceiptSha256: "701ad09a57138fbcf6e14fff3a067dd27b251cc1e0e070b1189c6d6893204883", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", codeSha256: "a6f6334fe417882885a4e7e55360560ce8d5b9fa17f6bad1cf8e0bbf74cbbae4", peakResidentKib: 390132, elapsedSeconds: 0.96, measurementReceiptSha256: "c19e8c3803af79afa96ed174a893ccf02a3da03e8a196c5df99d3e643746b4c0", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", codeSha256: "5c2ba312a08d516e78bed8496bd9ae9a2738bebb550d1dcdcfedc203c7dd9c8e", peakResidentKib: 339388, elapsedSeconds: 0.66, measurementReceiptSha256: "716c1b1b603023191fad76a6da835a8301a7aae5928567e9ffc2126a0ef57251", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", codeSha256: "d4246a39a3b7998bb53ca54d9551022ada82d3e7d86887751c7e7d94667d856e", peakResidentKib: 396480, elapsedSeconds: 1.05, measurementReceiptSha256: "272ae4fe46444507c545e2d62bbf785f658974820e3396307e05610b95b1926e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", codeSha256: "f0efdccbe445b25c9dffae52cb34292f2b2d3e5029cda2e8a00200545f112454", peakResidentKib: 1080228, elapsedSeconds: 14.13, measurementReceiptSha256: "76186e28c38114edb9ddc4516d12582e978f3e1896ee705003b7528d995099d3", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", codeSha256: "176a620116ece359ef52ccbd9a7ab50c456a1f28bb50c2ff5350434830944681", peakResidentKib: 1258960, elapsedSeconds: 11.43, measurementReceiptSha256: "d4c52b1110724a8e1bbdf67fb74104d5dcdeea55e5965a519f80fef81bb7a1b1", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", codeSha256: "651af7723b184865df1a6fa9073f3b8ef5eb50b341c18a9edf959c6abfa96b42", peakResidentKib: 879000, elapsedSeconds: 3.08, measurementReceiptSha256: "f3f56302e378c44841090c1657463f23fd436609f39943cbfef939ae3c26e370", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SnapshotInternalArmingSourceConformance", codeSha256: "f4a663acfca7436104dec6f91629c7b8d1633bdd2a654c2dda0c956bf86c0e2f", peakResidentKib: 390676, elapsedSeconds: 0.95, measurementReceiptSha256: "31178ed4ea9ad28319371fc47acf4973ffd3f65a31fadd5c93b585a79d5edbda", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", codeSha256: "d36ebb1a9c48fec7ab5f4c44c6c3f05b3d4ae32f168bd6782e06852e32d1e42b", peakResidentKib: 403292, elapsedSeconds: 3.39, measurementReceiptSha256: "163714604e312eed5269b5500c0aa4019ae418a04058ea8c61014ddc1e25f870", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", codeSha256: "1727581a417540372451532f90410a57abf12f895acf9d2667b0c73015a976b1", peakResidentKib: 1889596, elapsedSeconds: 42.97, measurementReceiptSha256: "9751ca59651614855d959cac29f64b868653a37fa328a6add079aa234f170a12", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", codeSha256: "8fef3d8c2f9b8072740bd6e0e76f44f80123a5255eb41d786c3e26dcd6f0834e", peakResidentKib: 399452, elapsedSeconds: 1.06, measurementReceiptSha256: "ab4de870107ac1dca7e6a1c4eaae21765ee4ac6b929cdb4e0fa20a2a787bf415", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", codeSha256: "8f32eb8bd5e3de550936340cb45e928f37e62a8d484482b4119a9e61821e1a45", peakResidentKib: 1155500, elapsedSeconds: 16.75, measurementReceiptSha256: "e95dfef65991060c3d3982b9ab4a13784d5a2b68a40781ed8d1215fc1e8e493a", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", codeSha256: "5c03e6e7088ae5778410b9ba2bb6167f9c881cc31f4da36c7c1b9e88cbb83247", peakResidentKib: 403904, elapsedSeconds: 1.47, measurementReceiptSha256: "f14fb401d9ea05ab8bc61878c6cbd86c100cdb3ce46285814e6f8dba43201085", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", codeSha256: "6510b640306d5e9a122260f3a7449e4e3aade5bb4a69f8d18118dd1ed6c3f5f7", peakResidentKib: 411132, elapsedSeconds: 4.4, measurementReceiptSha256: "5e6255d5b2e798837c0946fc7f79ea7b19a2e61e6088032d23b965aa6ce18b5c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", codeSha256: "b788b2aec8a64b7f6f5c345ae0611f7e7c0afdd5772510124ef38e431ae0d95a", peakResidentKib: 1201124, elapsedSeconds: 27.31, measurementReceiptSha256: "4e8ca220e382314859fe569bcf9514059cf5da76d272ca1ce85facdefab4e096", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", codeSha256: "739ff949d1e870a684cebf33882dc5280e0b04398b7ee6349aabfef064ffb97c", peakResidentKib: 868632, elapsedSeconds: 11.79, measurementReceiptSha256: "5adeec47b525e5dc3bdb1a4a98d7bd43c9e06184363b230dcf99bcfa0b7f4291", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", codeSha256: "ee5f9a011a8dccbc2ec022664bcabc4d7ff388c13143587bd50051dbafdfc800", peakResidentKib: 397080, elapsedSeconds: 1.16, measurementReceiptSha256: "874c178535fe8d8031a4f1168bd4c4fee0e40160a4e7623ac68dcc742bf30ba0", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", codeSha256: "03cbd4efdf01effe90bafc6c4e31632a980a5dd5e310c879a6dd8ef007255134", peakResidentKib: 389560, elapsedSeconds: 1.17, measurementReceiptSha256: "425de7dce18d8e6d1bcfad68bdbb47edbebdb055a196eab21e0d02e51105071b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", codeSha256: "b6d50be60183ab62241a95252bbab93c7a2b38de9a71a294d41e46a91a9ce865", peakResidentKib: 378516, elapsedSeconds: 0.85, measurementReceiptSha256: "39349c0e2c7e7b05e7ef9fbc5a13958165c0f1c996083a66e9c8008317385a1e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", codeSha256: "58b6fae29af6a05dd09e424951441efb426ca45a50d50938d311e5c2f7be16ba", peakResidentKib: 374160, elapsedSeconds: 4.01, measurementReceiptSha256: "bbc6267ba36fc32751819d8e02db66d4adaa501a727fa170441db2fe8bdf4074", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", codeSha256: "eed4398f2069f52f01e078d963d38255598ca382b2aa3bbe4ea3dfd27523561e", peakResidentKib: 1523776, elapsedSeconds: 14.41, measurementReceiptSha256: "a823ff0993d22be62109fd37c8a95c39e39f28ef21359071c74f639dcdff3389", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", codeSha256: "d76d69f5c7cce42eedda1c7b30e962dc5f7ee0915fa5f9ba7a8526bee2edc50d", peakResidentKib: 1180884, elapsedSeconds: 9.62, measurementReceiptSha256: "2f241aff51462257b50312ef3e3adb8c3834fd14472a49c1d81a9b1fa515b495", measuredAtCommit: "c1a07d615eedd5666ac30f74eacd5d0a51a3df8d" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", codeSha256: "d98175ef4e0dae015439e39d5c94d3746b086579eb3cc2bb54572ef58be1cc8b", peakResidentKib: 342280, elapsedSeconds: 0.76, measurementReceiptSha256: "1ec33327bb4a4cf48ef6a754b62eb78803637b1523ba34b508b65331a1ff7a6c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", codeSha256: "1f44c7be174dcb24be800d48be8926c9f73fed6fbe3948dcef88edf19673f875", peakResidentKib: 405384, elapsedSeconds: 1.38, measurementReceiptSha256: "d500dd685a910ad5ef26ef4d64a58748be46aca00b1e8108a958312e4022b550", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", codeSha256: "b22a1f558eb43375371ebc2be544d2daff3c3a1536ff63a81fe4227786a33601", peakResidentKib: 1052432, elapsedSeconds: 5.71, measurementReceiptSha256: "56782617452b295ad8283ce6abfbe641894795b8ca57daa64a3c6d3d7404753a", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", codeSha256: "56d0c61ff683d9e306b2b0a5210228270b1255a674754faafb48a39525c4262b", peakResidentKib: 369852, elapsedSeconds: 1.71, measurementReceiptSha256: "11134f08ceacb399c5bb4b997dfbd0a43d3770e6546860fe66487efe7d9d88c0", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MessageStartAdmissionConformance", codeSha256: "ee3481ac23a0bc5e9b18f6121dcc1960919eb15f30da3b0691b1d094f0256ef1", peakResidentKib: 1035364, elapsedSeconds: 8.29, measurementReceiptSha256: "56cd18dd5463900b8ab4e26b6db362f38bddf3060e2630a22c954db34ada47cd", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.MessageStartClosureConformance", codeSha256: "cc334587c601948f88961fff6f89fef2f3c728adf105a09f8bb72bf0e6f0cf0b", peakResidentKib: 910256, elapsedSeconds: 4.95, measurementReceiptSha256: "e2b7764ec5418c1fb6f7d8bf2cb607592868b7773ca50b80dd8f50e274b36c14", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.MessageStartIdentityConformance", codeSha256: "83f4c7c47dab25ff633a0878184252564a54088a271dd85ca6bf218144179934", peakResidentKib: 929792, elapsedSeconds: 10.78, measurementReceiptSha256: "bcb79bf9321630e3d7c9d82b585b6437771811bea479941ea08cc6324bbc9657", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.MessageStartScenarioConformance", codeSha256: "f4781458320c26a47f93b25f4883d04fa2467a531255e84731ab2565940b85c1", peakResidentKib: 1189872, elapsedSeconds: 7.55, measurementReceiptSha256: "4a8eaf528df2c92c0adffd94ba0943d0c91a485cad58a5d2c913c67e378d0c25", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.MessageStartConformance", codeSha256: "b0af696a951c386d29f76b87630266e422632d878f337964abe74968c8f7215e", peakResidentKib: 439412, elapsedSeconds: 0.95, measurementReceiptSha256: "0de11f22047c0e740137f013adf45c01ab572f7a51ef4365c886ea61b896e668", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessagePayloadCatchConformance", codeSha256: "e11502c35764ced0064604977185d854b98cd1755a583266999667a0dafbf43e", peakResidentKib: 1152820, elapsedSeconds: 12.6, measurementReceiptSha256: "4178a5c3c6af9abd3316eb19f75bd995459ca5d46d1b635d3ffd71d10c335f80", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.PortableMessagePayloadConformance", codeSha256: "d5841b478e3d4b2269c7ffe753e3e9aaf6a899931b238c67f267af14433990aa", peakResidentKib: 1213284, elapsedSeconds: 16.09, measurementReceiptSha256: "a8f0fa91ed4b8e6f754c7800c2a918afa70366d1b06b3f09218258f2e11b8073", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialMultiInstanceConformance", codeSha256: "e5d4cbac5fe57ba61b3f8594dca778cc88587d640516f56d9a235fd73b27191a", peakResidentKib: 435816, elapsedSeconds: 1.2, measurementReceiptSha256: "67bfbe81b0e557c8f24cabfda47adb1ddfd5595c1e663820b5b59d774fc4dff7", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgressConformance", codeSha256: "55b60a4dc1d1813bef06f965be142c5092540c6695479a866239869775c3c2d1", peakResidentKib: 656416, elapsedSeconds: 2.09, measurementReceiptSha256: "48c779581a9a4601abd1b0664f6c74a73c9b1727fd21d8b20e74343738d7ecf3", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SequentialMultiInstanceRuntimeConformance", codeSha256: "495bf8921d576c3fce7752b6855f78516a5181a5cd3076e5d39f95210490a00b", peakResidentKib: 688480, elapsedSeconds: 3.39, measurementReceiptSha256: "8c2cef0d22a397b1c0c2132af2d0f258952b67004adb9291560ee1173b874918", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SequentialMultiInstanceRefusalConformance", codeSha256: "50e738385ceef9af7ea8173126c237a59db2a478e5285f3ecf41583277b49d5b", peakResidentKib: 670212, elapsedSeconds: 1.98, measurementReceiptSha256: "7830b697bff0d048b173e4a9054bebfbdfe6694b37a86b36b8db4f3bf36d009e", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance", codeSha256: "04e3cc2a06b3b8ba15eba0dfb6244d1ac45c92af489d2046ec5a998d0f87ab7a", peakResidentKib: 378608, elapsedSeconds: 6.84, measurementReceiptSha256: "5c59b94a8520b172c93fdab7ddf2623dda0f88aef1a610109e217ef6e642b288", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance", codeSha256: "73fce35b8406ec701aa255788ff009ba40244749fa186f8ce900b7a569207f60", peakResidentKib: 439892, elapsedSeconds: 11.98, measurementReceiptSha256: "33df23b8824218360d30bf6946895b61801bfdbc02e51317f1807ad1b738ae50", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", codeSha256: "fb7d197313d1ffccc8ef599d9088a8898880ece24c0b3f9f2d299e7823ee14a6", peakResidentKib: 458128, elapsedSeconds: 2.41, measurementReceiptSha256: "e49678241a698f18403bc703ed503db363e3e23f7b49ed001aace447bf0171c9", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", codeSha256: "4b22d3657af09999638ac612e1f6fff6fa48745bcffbbacf47bef4ee390e2c81", peakResidentKib: 917760, elapsedSeconds: 2.41, measurementReceiptSha256: "6ecc19ec0e40a72c6611ecf004e3f5a29e81132e6f6fa32a9e7238a7f5cb31f1", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance", codeSha256: "8596179ef14709d36dbd40e6fe262b9a32fcb429af8ed7b42ec5515ea45f69e2", peakResidentKib: 390700, elapsedSeconds: 1.16, measurementReceiptSha256: "a940fe304e78ea389bc28af275b506293b20b24a5e6a8a151a5a03fd166e30c9", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance", codeSha256: "ade6f02270110ae5da2bfdc9c91871f7b89aed10cf5c271963adf6fe62a794a6", peakResidentKib: 1632364, elapsedSeconds: 16.01, measurementReceiptSha256: "bb86b6ddd8912a070daf4f6367bd1c0dea59182175970217ca1c35adcd94aa59", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecyclePropagatedErrorConformance", codeSha256: "ddeb52c56176a03b4a46942462dc0e7dae8b41a9bde9864bdf4b94d726294843", peakResidentKib: 390944, elapsedSeconds: 1.16, measurementReceiptSha256: "2b00317400041eb78c8a467ecf307dcdb8aac097f3fcc33912c221bed45927b6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance", codeSha256: "bfdb175f56d7afdaf424f33275ee5ff6a4aff9f3808658c4274449fc2dbed69e", peakResidentKib: 1392188, elapsedSeconds: 13.85, measurementReceiptSha256: "e716a8b358df1fef3864a8f3a58f7c1a034cb0fa0913aef59653da7fc2582997", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance", codeSha256: "20d60a202f99fef2335705c4f8f54001545b852b3a3ae3cba93264eefdf30a65", peakResidentKib: 390412, elapsedSeconds: 0.85, measurementReceiptSha256: "5cad004b456654f19b5abf19a01069d1facf0bea4c6cf4358c49f6cb711d5c51", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RuntimeStateWellFormedConformance", codeSha256: "fdb53f579abee3fd939596d98f058f42afcafc54cc0cb852f913009a00f89be0", peakResidentKib: 435568, elapsedSeconds: 1.59, measurementReceiptSha256: "5b7c929ec9350b8429f9b0a0a3e01ea5a89c3de5ee4e422df17a40132ac7457b", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance", codeSha256: "bd5040cf331ab5fffa30c039f7cfa744bdffcd7fcad4cc851c8a307d9ad0d246", peakResidentKib: 394064, elapsedSeconds: 1.49, measurementReceiptSha256: "20c3b0d091c25a42d5052261d071d2cfe32fef7c05e385976f0ed286d284d6ed", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", codeSha256: "05c83d1bf19533314f78a3823869b93c6471c7226f3c7a65239c5696e7ed73d8", peakResidentKib: 386332, elapsedSeconds: 4.82, measurementReceiptSha256: "edc4033d5f884ecc0642c46a0f51d3585dbe51d1dae1fe6cd27db2a5b0820f76", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", codeSha256: "bb64c15fabcb6930bba18ddcb1a93e48c91ed708d12cc51486a68f2a6d73fd36", peakResidentKib: 789276, elapsedSeconds: 11.03, measurementReceiptSha256: "da4ffbb0b02639d4e3c3540480efe61081194e70dab211c746436631f63d7a29", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CallActivityConformance", codeSha256: "7595bcac1d723612d84943cb7fecf0adcb12af623219b8442397d9ec260a7deb", peakResidentKib: 407460, elapsedSeconds: 5.23, measurementReceiptSha256: "bd02b7420621f4c37183e0c146f21199dd802cf13f1dd9e900d5e8f76aeda8e6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CallActivityPairingConformance", codeSha256: "0e189138fd6ef1e8e84f04cfbe0ce66758a6770ce2a7b92d1ab51183833f1ee4", peakResidentKib: 392372, elapsedSeconds: 1.17, measurementReceiptSha256: "e11021b83013f6799a37bef525b76eb905ecaae3c1f86083ea2c3f37db5761c2", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", codeSha256: "5d74b417689c2f8815cab78d3a9f3e2e8c3dd970702195c833320afb564c8320", peakResidentKib: 1081644, elapsedSeconds: 8.62, measurementReceiptSha256: "65a1f167b82f2517c99f528bba94cb5456e49cc06ffa7c79b4722855579c19ed", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.TimerStartConformance", codeSha256: "f941a3f04297a7f689ce77f006cca14d175a71e29b0ed87e3ac99d50e88927aa", peakResidentKib: 1229956, elapsedSeconds: 17.43, measurementReceiptSha256: "25d6e4f602183572f2c40a6c93f178a6f66863a99e35383167a5e06a6e8810af", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", codeSha256: "13df74c6edb659108bee22cff4908d1303f0b4f1634ff3a40dc2de5565d1b8fc", peakResidentKib: 1564548, elapsedSeconds: 100.25, measurementReceiptSha256: "f23eb33490bfb6dec228a1e8365a4671df74ee643a04da711405d819c37c1756", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RuntimeStateActivityConformance", codeSha256: "d5967e51d77067d6a36a9ffbfe32d7856dfb46fffbf17e38274ca11a894dcaec", peakResidentKib: 414296, elapsedSeconds: 4.1, measurementReceiptSha256: "1dd8ff081f0bc8a11ddb7184e549dbac2e0c7e976f6b8af430a15ead9e2c7d12", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", codeSha256: "4caf5980966f3c10b36b2b2ed8096468d3b791500bbae1d9aec075f0cdc39b46", peakResidentKib: 1122052, elapsedSeconds: 4.8, measurementReceiptSha256: "e759a9be13240f440d857f63262acfda65d81c9c669bacee9836cfc6507c2b1b", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", codeSha256: "4781c4169b8f94487ae0dc6bdafe0977d0a85b11093882843ae56dd73bdfeb31", peakResidentKib: 782016, elapsedSeconds: 7.92, measurementReceiptSha256: "4727fc881792246465e6b20c0f38e36c45ff16b93006f1904d7708424162ef6b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeCancellationConformance", codeSha256: "484b6a194aa3b04dff2f74cacc923788385df3d099889b2f8a3df373abfe2a3a", peakResidentKib: 347300, elapsedSeconds: 1.44, measurementReceiptSha256: "92d48612c13094108df327f12c24358e603e8b5e9ee52ba73dff0e0ff70dab12", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeCompletionConformance", codeSha256: "4a86642eaa5c0b5c82358a58e1d0c830f743f4e532cb5ae666d521fcc193ec86", peakResidentKib: 360848, elapsedSeconds: 1.09, measurementReceiptSha256: "47d6988f21d79bdff1cff34888be3b1326d980a6fb89d2daedb9c2d7eb1d8d21", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RuntimeStateControllerConformance", codeSha256: "6f7f3d29e67c68be8b81a493923067f0572189561deaf1e50dc7bce0ac334517", peakResidentKib: 415356, elapsedSeconds: 3.71, measurementReceiptSha256: "e182dd719850168bdac7067bca6f8b8d5a59c7a465bd9d92f69ee184e2604795", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", codeSha256: "40734ea3e99b8ee2dbd506e1a37da1b57dd676379d17115cad057d095e1ced93", peakResidentKib: 437940, elapsedSeconds: 1.4, measurementReceiptSha256: "cbafc94e92b13bff94f602bf03e3feb247b26e6b80175a599a7aac85ba66a3d7", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", codeSha256: "201c214e982f8a81beb4fe1c39bb80b20f0fc3964e02fd52c9260e1fc036037d", peakResidentKib: 504760, elapsedSeconds: 3, measurementReceiptSha256: "521a7ba124b88a58c9abb7673180d96e56a374053df3da2df3956c8617ec5b9d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", codeSha256: "3e703edc537b6450e76342f70f23a2fbc25be047928e252cc4df5d3c62a67fbd", peakResidentKib: 390032, elapsedSeconds: 1.18, measurementReceiptSha256: "8d9a6540c0f0934b9904ea18ab6e0dd935eee9adfdf067b2bc056a7a07946b6a", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", codeSha256: "5264f282dd7a6de945ad1590298210b990b3f80c7934daf27375a494d6091805", peakResidentKib: 1436300, elapsedSeconds: 6.29, measurementReceiptSha256: "6759f773695057ce6b31c0dfbab4aafacade025a0bc94c3932b0433460a4c078", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SemanticProcessAdmissionConformance", codeSha256: "312e0647fb44000db806ae4b54ef03b53311f8cfc1acd90cdc191352fa1ab5ba", peakResidentKib: 636864, elapsedSeconds: 2.55, measurementReceiptSha256: "a09609b910e869aa5345acecf262fad44543dfc71603236e6f5d02d047ca6cdb", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.EventBasedGatewayConformance", codeSha256: "fdee30900142af4d8294d7d71bf566d274270bb8e779a29804cd229681c41b32", peakResidentKib: 1312420, elapsedSeconds: 10.6, measurementReceiptSha256: "67fdec81ea507fec6e6bda9e0e11d7e40188da3aa1d041214183ee6de91a12a7", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", codeSha256: "c788d36c9da5f56f9b9b37b2934788f6d469254f3a5ececdddc8f12673d0b883", peakResidentKib: 403200, elapsedSeconds: 1.37, measurementReceiptSha256: "c3597df5cf554a502b138687962c93ea349d72d9ac7fbb32ae4675c636d1e294", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", codeSha256: "2025da21b0a0553e053bf567bc14afbf1b7bb6602166dd7d5f9236811fff0037", peakResidentKib: 1434356, elapsedSeconds: 13.97, measurementReceiptSha256: "594eeda834aa22f17ced699dbffe0bf969d36ef3fa47e94af7c949eccc1e367f", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", codeSha256: "07fa34d80f2b5e51916432480142f52114cd533f99e0c36ff6353d1e01f05d38", peakResidentKib: 864472, elapsedSeconds: 5.18, measurementReceiptSha256: "d172d543b038a0d3ed8f3bfcb290e660844cfd78d9bfd713c8b16732ad99f6aa", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", codeSha256: "bf30a2db8be1fba21acf8df4fcaca404b703ee442e22f502792d13c2e2ab535d", peakResidentKib: 1239852, elapsedSeconds: 5.9, measurementReceiptSha256: "2f3e48d5518b7b0d1ae1327dfe0922f4db58beddcc4fc630def551bfb29c7c09", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.TerminateEndEventConformance", codeSha256: "71e7baae2cbd50c43ddf49fe4eefc61d3633590d80406c51db6f5f4122b5f50f", peakResidentKib: 751600, elapsedSeconds: 4.06, measurementReceiptSha256: "1bd69ccd8ecb5b7162cbb4bd092862559c9f1b26dc48c9a2bda1cf6b2ef3ab6d", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.RegionalRemovalOwnerCoverageConformance", codeSha256: "8c8243ace3cd178d0694ddce27b6cb758dc7edc4bdee66368544ee29241b7ff6", peakResidentKib: 769676, elapsedSeconds: 2.03, measurementReceiptSha256: "3d8c9a23fd81b2f09cc778f7d6ff3b4ec8adb866fece7970b4700116af3802c8", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SemanticProcessConformance", codeSha256: "75e274e157a4be8c6bbf11ca7ec1e8edddb1c9ae7b4eb052f52a41fea7d8025c", peakResidentKib: 395664, elapsedSeconds: 9.07, measurementReceiptSha256: "744507ad0d32960f2ee0d966efe477858e914c55ad24eae6d0d3f04ee62191c6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", codeSha256: "1d5d7a68e32760239df1f95e0791b30dc8e99c54a85ea4666ad1bd7b4afe14fe", peakResidentKib: 987348, elapsedSeconds: 33.47, measurementReceiptSha256: "a40837d82ff846dafa02daff3cb6fe00d7e12d5fd4ec6c034d7d4f28da5afc9e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", codeSha256: "2ba99cebc99be9a7106a10e26943eaba82701fb6798e83efe49a3e50a762aecf", peakResidentKib: 1244992, elapsedSeconds: 22.18, measurementReceiptSha256: "5bbb9b5b64d538cb5d408fdfe3956289674328cea4914af1f5a15f5450b9d5cf", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ActivityDataInputConformance", codeSha256: "8ec4f88d59ddd6a265b24eb72d4c227966cf05e84021cc8d17c9d26bfd3dbc3c", peakResidentKib: 995976, elapsedSeconds: 5.19, measurementReceiptSha256: "33f68c04a95396ffcaf036bbf96b34e4ecbec22fc5caa55feaa15d92c33fa8a4", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", codeSha256: "8add28ff38fa53a546b19989b13082947ec66dd5a3798bd42a47c148406ab962", peakResidentKib: 1168864, elapsedSeconds: 13.9, measurementReceiptSha256: "950d09c13f258b7f5487a4c57ec26468e29e0dbf3239299cfc287382d469f1b7", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.MappedSuccessConformance", codeSha256: "0df0be68590f1dd0a32201b0482eeb750abbe620f16d78e2518a71829feb0c36", peakResidentKib: 1019080, elapsedSeconds: 6.2, measurementReceiptSha256: "927a7dbd9c8d53f0e7784a04d4851c59a9788bf1e7c4bf6a3eb6ad49bf178cde", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.InclusiveGatewayConformance", codeSha256: "0a540611883805db55351881bc54e83aee120329f23fe95594cece51337b078d", peakResidentKib: 1263168, elapsedSeconds: 8.8, measurementReceiptSha256: "ee17e4a1ec7ba08fbf116f8b91afd16ce8d32497c2902ab7bc68e62bf903f89a", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", codeSha256: "69b3892439ad2ef94831636d142b3dd78d779ec776f3b553e7dab67dd2a25001", peakResidentKib: 611264, elapsedSeconds: 14.04, measurementReceiptSha256: "31a5c2e41f55c0086b68f60447957dec8e709706f6191b409b17d899ecce8908", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", codeSha256: "6f02aa58267e7b9512d11a406c199fff51befec190320d24d926d622d62e022f", peakResidentKib: 983080, elapsedSeconds: 6.56, measurementReceiptSha256: "3ead36849727353eee2584d1fb70b46e49d70e9812851e84dc8e2735a2b38d3c", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", codeSha256: "173ab8814aa8144af20064842396d12658e372f8e4a1e675e439a09d80171d94", peakResidentKib: 1760656, elapsedSeconds: 25.64, measurementReceiptSha256: "97c32883cb7c8fb919dd0c6e5e9af350aa8b6e8614afb5aa2486e7322bbc4ae3", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.InternalCommutationConformance", codeSha256: "086bf3cbcc5f76cbe05688baadd89d749f92b96be1e7b8111b98f978bbe1a4c2", peakResidentKib: 1155124, elapsedSeconds: 13.2, measurementReceiptSha256: "e9a645a8f4fdc8e59aeab7624ee45fb925b8c64eaa4ef0822c10e7e4b2207b8b", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", codeSha256: "108640fd67f0815417970ccb69f71b295097d7fac40856ce7453999f807653de", peakResidentKib: 400880, elapsedSeconds: 1.06, measurementReceiptSha256: "20ba9b405c999ad9d7b247e0585ac9c76759c13fd7018647a0b6ae1171c03049", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", codeSha256: "1a6340176fb2a8dd3d41cea54b155ea9c982c820f625f7ba68aef02b50b5ce27", peakResidentKib: 1608112, elapsedSeconds: 10.46, measurementReceiptSha256: "3263f6b82014ad4857c3a33685d216dcf2b35fb3958d1ac197bef21312d1780a", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.CompensationSourceJsonConformance", codeSha256: "e092fa1e74bdaaba714ba0cafd9a4ae0ff04306830e88fff35e543aa88411676", peakResidentKib: 391060, elapsedSeconds: 0.86, measurementReceiptSha256: "3a2e787603b19ea351345a3fd52a1339c450f22b8ace908bcb98ea5fae514a58", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationSourceCompatibilityConformance", codeSha256: "bfa998cbfc30e6686f0557af42e2c8961c1542136d2a768d1cc0329ed432397a", peakResidentKib: 396156, elapsedSeconds: 1.06, measurementReceiptSha256: "94636633c98e65b193e487b729f681c9a593d826fc32cbdd4f40522e9bd1101a", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationSourceBindingReferenceConformance", codeSha256: "fc114c019adc474474ff1a4ebd3272915d808bdc14821160706e913e8edab2cf", peakResidentKib: 388748, elapsedSeconds: 0.85, measurementReceiptSha256: "ebf97f7805153f36f903805b75007d9e3e40ca822f4177557dee746ef89f7dcf", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationSourceBindingTriggerConformance", codeSha256: "04f56e94284164b969ac9d0f84edeadd0f7307f42cc467e422c871ade8ab621c", peakResidentKib: 386724, elapsedSeconds: 1.07, measurementReceiptSha256: "8b756161c06de8c17c2abb1206112fad25c152adb2aafa8b633e9594804ead2d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationSourceBindingStorageLimitConformance", codeSha256: "31e501b861b146a7a7293fa86060ac1ac79663af19b512f3b289b4c39d580e28", peakResidentKib: 386736, elapsedSeconds: 1.15, measurementReceiptSha256: "98a6a826f62b312ee46db3754710ab69eb9a677198c8fb7210b11b09bd78b5ee", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationSourceBindingExecutionLimitConformance", codeSha256: "83a531753c82a8796ab6227e04db7de92afb5e9ff850b080790321f6b74f9951", peakResidentKib: 386788, elapsedSeconds: 0.96, measurementReceiptSha256: "cd2b3163c51786cbb2db83663295c0819bab7f8ecb1448316eda9402119539c7", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationSourceBindingValidProgramConformance", codeSha256: "d77430c64a4de7e5ad785106fedd419fc8efc0bc195297877d322b2b109bf8d6", peakResidentKib: 386616, elapsedSeconds: 0.86, measurementReceiptSha256: "7a91b7bd4cbbda86796adb8f3da4814e1f24f3c31bf4640a438b4d5b2f2dd6e6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationSourceBindingConformance", codeSha256: "6e61bd0d56099798a2a6e133dc979cb1f9666f5f67f793007a3fd882356cfd4f", peakResidentKib: 439800, elapsedSeconds: 1.59, measurementReceiptSha256: "0fc5c18f64554438bb9c72b0bce46cc7fe41efb7d647223020d9eab1cb6a7459", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceLoweringConformance", codeSha256: "27a15267a93668726fa2de8ebf79847edd12894239b5010d6c11957ef8a9daf6", peakResidentKib: 378736, elapsedSeconds: 0.86, measurementReceiptSha256: "f76e7b2def8416686a5c1790329eee11e61a76505d520dbb989f286eec9d89f8", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance", codeSha256: "ac5658e813ee76218e9f868b391922d58a4e00b8a6ffaf3a128317a9f569e204", peakResidentKib: 371776, elapsedSeconds: 0.76, measurementReceiptSha256: "c0767fe18f364dc5138dcb7f4829d061a901bd0ce224a871a45b3992b7edc14e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationTriggerHandlerProgramContractConformance", codeSha256: "2870798aa834c39fe197bf99a5ba140cf96ca206b3633c7535c24c3a1635c659", peakResidentKib: 443360, elapsedSeconds: 1.06, measurementReceiptSha256: "257829c746a22f48d1637cdc1207a80919dd1e27d4f9946f7c5ca45746a77e4b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance", codeSha256: "5018492fbcf09305cc76710a773f2eb0e4e6adbcfafe68ee5be63f7a74aa2b22", peakResidentKib: 483204, elapsedSeconds: 1.46, measurementReceiptSha256: "661b73d351d756d2c1ba8a4c60ca26557a0b7327a390e023300360563052532c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeConformance", codeSha256: "5134a268ff4b07e99882c56715f1c757e7ea953fd1fac7c8f8051616c3a55343", peakResidentKib: 364988, elapsedSeconds: 0.55, measurementReceiptSha256: "b90c0ad05fe1f701574e52e1c5ed6365be9f7d85175f49c6cec24a32efd0fb7d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance", codeSha256: "c0886eb6f795676f75de84e25e3c5b9510cbb585d08050d281a4ca388493ad90", peakResidentKib: 919488, elapsedSeconds: 6.92, measurementReceiptSha256: "47fea4c549d2b452c281a8a537b0122c52e9c613429f9502afc35087f5c4230d", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", codeSha256: "80c7cb993808fe2aa23dd663503faf664e7050c8cecd41e0ebaa07bffc9598cf", peakResidentKib: 1164468, elapsedSeconds: 20.99, measurementReceiptSha256: "bee8f03c895ad89fe6568bb357c0736c8c5658d51ebad474c6b32c23af387c50", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance", codeSha256: "bca32194fd5b119c52684d53fcf71309388872acb5bb313909097fe1600f48a7", peakResidentKib: 436044, elapsedSeconds: 0.96, measurementReceiptSha256: "511c7c5199ef79bb597611c978d136fce98187d26c4e31715734d6bcc6367b94", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationActivityRetentionProducerConformance", codeSha256: "e4bd251ba1fd9915b89b02a9a8161899dd58113bc3438a403e6f8c32a286e8bb", peakResidentKib: 733380, elapsedSeconds: 9.27, measurementReceiptSha256: "cbeab0cec596e61c94ad74cf68adb3065071ddc014ec1b5a0f254aa14e1711cb", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationActivityRetentionConformance", codeSha256: "491c5e15c6a2e66fde5248a0e120d53639eee609a0b1e816b35051f4aa519e2e", peakResidentKib: 806668, elapsedSeconds: 6.29, measurementReceiptSha256: "28eb085178ba1dcf5ec04edb746e21796a188585b67fe64886fe574251c9bcf3", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.UserTaskMetadataConformance", codeSha256: "85e2581f3f66c604f43232a30928c35e913e70c5b95814f9a719faf5e2a62087", peakResidentKib: 767608, elapsedSeconds: 16.63, measurementReceiptSha256: "5ff098a930b4c5b07215b07930e71559cceff21c76a665ed25bb90efb6280fb4", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", codeSha256: "73edd3b17c8c9edfb1d7c527a7dde27f6fb87f4c17cf1aa5baa1579bf31ad7bb", peakResidentKib: 583232, elapsedSeconds: 2.18, measurementReceiptSha256: "6e2d601d1cf88a1ba6f73839469affd8209c007ae41d4d2949c65890f0d55dec", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", codeSha256: "aecad283353546f2ac628b49ea196ba382ab46d29c786165cbfea094bda30e3f", peakResidentKib: 579984, elapsedSeconds: 3.26, measurementReceiptSha256: "0d0fdc6269c110dd3a541019faae152c384a6f3e1619007521a345d86f174112", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", codeSha256: "0d0527c2052cdb19189c7383a3ce748dfa53ea1a6fca0b4af7a10f157f47b2b7", peakResidentKib: 386848, elapsedSeconds: 1.06, measurementReceiptSha256: "c65e8f08a69d5e1fb972e07671d3cf4c25a8a65538966e95aee616d6ec51aab6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", codeSha256: "45ffa29ce8bfc5126dd89fee5c26828f6382a5be4f62f1631112173ab6102925", peakResidentKib: 406592, elapsedSeconds: 0.95, measurementReceiptSha256: "57c709fb6f97cb53701db4ee4789639561bf787cc5f3e2c82f376a378bf86f7d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityDataOutputConformance", codeSha256: "721fb39274a1d2a99105ffcb251323c2ce732728a621685c4690da6ba796bad2", peakResidentKib: 1017316, elapsedSeconds: 6.87, measurementReceiptSha256: "9d519e11467bcc6ed95760c20d33c42a0b721e481bf8449f3f251c35c6688b99", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ReceiveTaskConformance", codeSha256: "95575714f05117efa94e49419ccbada02763fbc17019358a7f470901fabaf4c1", peakResidentKib: 1281836, elapsedSeconds: 7.01, measurementReceiptSha256: "fe76d4021f6b7f8b4e62be6acd4bfcf17d4d196e8f64acfc453a9dcff9e448d5", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", codeSha256: "7b881505d27259081697f18651570f61b1f623514027c335e8aec291ab006886", peakResidentKib: 390124, elapsedSeconds: 2.44, measurementReceiptSha256: "c2d467b0b3ba47bda0f4e1e24b88756289ff3d4721c7c6ad132adaebc278dbeb", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", codeSha256: "1c1f397df461ea05b4c6cf6ae9eb11b164424ca6b388387a24c42b71999d7e6e", peakResidentKib: 397996, elapsedSeconds: 0.96, measurementReceiptSha256: "d2185cda9047ff5add4a059c04b34197afed03380383e9b42e9568067f07b717", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotConformance", codeSha256: "16dc87f6ced03c6ad24cc29d1214c0c996623e41ec83fefaadbaa6664d27014a", peakResidentKib: 401304, elapsedSeconds: 1.05, measurementReceiptSha256: "383503a36335dc935c0d1b3c0890812e679a8c64d4eb94c6c0a6cb5f2c946605", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance", codeSha256: "c0bbdb0aff131110d0603c9e93e85044bafdb4f31d470c31e7705d80e36c423d", peakResidentKib: 394964, elapsedSeconds: 0.95, measurementReceiptSha256: "6beb56f44803b96d11a43d42639ab816f8d4d8603c3f17253f20af8817fa0f29", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance", codeSha256: "bb2f9b2da0c94f621ec7991425dee4766c97af08fe601dbb71093c1d37e94819", peakResidentKib: 399104, elapsedSeconds: 0.88, measurementReceiptSha256: "167d1b7b2617c83af2223ab33b1bc2305e1392aef3d3d3fc0c1420e6496428f7", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance", codeSha256: "9329dc50dbf121e6cae4471d6cf5c7a797ab6283d57213fb2b8615fc247fe582", peakResidentKib: 403428, elapsedSeconds: 1.05, measurementReceiptSha256: "80c5288d0853db1aaf040e2615c31d8a153ea51b480862a3953af265d9af3912", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance", codeSha256: "95d31e0976b7135c195cc493d44366e712380d7c303d21472fa0b550a48cf21c", peakResidentKib: 388212, elapsedSeconds: 0.85, measurementReceiptSha256: "ba669f3d3342c927a50b9d526803a4e6a6a90409c9ead214b67b4f6c1ec76191", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance", codeSha256: "b72122afa42d1750b7410e0bfaa57f80a7fa51d6ffcee3d850db0373686daf7f", peakResidentKib: 379384, elapsedSeconds: 0.85, measurementReceiptSha256: "ba2f8702a85fa6aca5184647296e11ecf09d2a1591670c3080d316aaf241158b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.UserTaskInteractionConformance", codeSha256: "ef56c43c2c8d6b45ff9788cad02bf160a2c31d780c4c7984146a13edff44c3a6", peakResidentKib: 970136, elapsedSeconds: 6.83, measurementReceiptSha256: "44af5a7791e91336da439a30a0fd1a9b50655cf1834cea0d1600458b0446d430", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", codeSha256: "460712b44ce82cd7dfeb339bea0bf4b545642a50090dd7aa41ef45f8a8474097", peakResidentKib: 407716, elapsedSeconds: 1.15, measurementReceiptSha256: "d7c7f9afb2fff817b2bf16f275edb963ac0e00fda5b50ae333d514835536b241", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", codeSha256: "fd62a142901d760102621aacc4605f642211e9dd835ea058212f9e84cb35bfff", peakResidentKib: 1282156, elapsedSeconds: 8.13, measurementReceiptSha256: "4c3dbeced598b427815e3aacec1dd8339efd7193f5f84154de4d31f49c0ad896", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", codeSha256: "262920de2025a6cb6e0175d22ab39094315d5e236d7d016f3af4184a059887c9", peakResidentKib: 899832, elapsedSeconds: 5.47, measurementReceiptSha256: "56f83b76e4adef8f8b5575ec6abdf78b095cb275bc04e032dd2c11b325efe5e1", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", codeSha256: "de2af35f3342b29c8a1a1be822d301d7e89920341b9e1ac2d65f6dc26848ad6c", peakResidentKib: 390796, elapsedSeconds: 5, measurementReceiptSha256: "1e7ce045e0a8de2155f7394227e09cf4f89c2f7413881e1488468b8f8e13af96", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", codeSha256: "4ff0dc67a98f36f2186640c360484434eaeeb4fe937c5e07150308ca0bf5fdfc", peakResidentKib: 426576, elapsedSeconds: 2.6, measurementReceiptSha256: "12d510e67716f345ba775f9245cefe251d5e49f8c4a1dcf0c9a35c2f6fd672d6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityBoundaryMessageConformance", codeSha256: "1f650e6df13693aae43327f47c2685b11973f8ac202ced3b26c24463ed69a257", peakResidentKib: 1110124, elapsedSeconds: 6.1, measurementReceiptSha256: "a06e1889cfb1f0a1110676c47e57cb33eab126121eaacef21ac407ca76d2580d", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", codeSha256: "30a503339de4c0a5f0cf4d58270f4085b07ad5630b01b5515a1613a99d315622", peakResidentKib: 1067912, elapsedSeconds: 8.28, measurementReceiptSha256: "c706d09e00696d52be2d3c8c92460b0502b6e098013da63ff9a7f8ca5883367e", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", codeSha256: "d8b436bf3bed404798c154873812a276e76ea61d590f7d20975b9245766457b0", peakResidentKib: 1037232, elapsedSeconds: 7.01, measurementReceiptSha256: "19394bf7e09fa2b5bb1b0a3ca0516e570e996b14fb1f6bf936e80a2a7f616eb7", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", codeSha256: "84be1a91da792ec30f348901e8a2e10b74ca287b492a19d9a47b6755b0cef296", peakResidentKib: 389820, elapsedSeconds: 1.05, measurementReceiptSha256: "6747e635f4d81977d555fe2028fa7a9af498b259988d9fcd6bea063dd5ebdd19", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.StructuredHumanWorkConformance", codeSha256: "8d94b3a2967c17bb63c4d4fa034d47ac31c6b1a4134c87a7b7e68e7f6cd27cb5", peakResidentKib: 901388, elapsedSeconds: 5.06, measurementReceiptSha256: "a7a555643fb262a514114dc35141fcbc27a6b34c06e7b9e88817a5e49c295556", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", codeSha256: "3239a73595372674d18c06317be9956757195f95a440fde1cd8bc6d82d4fe582", peakResidentKib: 872204, elapsedSeconds: 2.55, measurementReceiptSha256: "18a9d0ba564b67e1320cad57121e17537cf0563fb64fd1bcf57a016610affdfc", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ProcessStartDataConformance", codeSha256: "003a43f7800d760a05759bab344affd324ae37f7ccc8dc450a20efc0cf976f8e", peakResidentKib: 621300, elapsedSeconds: 1.93, measurementReceiptSha256: "86f5abdeaa86f33f47497687e45d41219d2dd29de5f4cc069fdd176adc8ba604", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelMultiInstanceConformance", codeSha256: "3fbd15593ad3ea6c551bce25626c6f323b10194b042d1d01faa96fbfbae8ec96", peakResidentKib: 411100, elapsedSeconds: 1.06, measurementReceiptSha256: "48ad2b63bc8750ac254e631a777a0fad8accadd7cd949345c2f694f4ff1c553d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", codeSha256: "dfcfcdd977f5757343b334e105b0ad3013526ac5e79a66045914afcf0256611f", peakResidentKib: 499844, elapsedSeconds: 1.97, measurementReceiptSha256: "39a5e601e1e10a19eb029db471dcda030c0d2691fb717c393a11c22770c25369", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", codeSha256: "104331c8aa4f0b17e0cccd5ae191e76322ed889535c80a51538b74150cafa915", peakResidentKib: 527364, elapsedSeconds: 2.77, measurementReceiptSha256: "1f89dd159b80cf19efeecf3bb39472e36507c2d870d3b58a7c1d19d095115190", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", codeSha256: "f824bc3bdc457535f8888d39211cda3562be9f00b80f901d04346025e3e2aa60", peakResidentKib: 627968, elapsedSeconds: 4.79, measurementReceiptSha256: "a56f99a28daf2383bcf3c5676c1285f31bb51dec7d1fcc5086e015bd3d428303", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", codeSha256: "c2db7c5830b1ae206b4b2b1fa23989a969dc93105d3400adf44984cf107b5c8b", peakResidentKib: 600660, elapsedSeconds: 2.5, measurementReceiptSha256: "9b73e19c11f0b514025b308118699d4910fdeb233b27582ceed9e5ea5f7e065c", measuredAtCommit: "f9b7d679d1911dae02821031b704a0c6c389d245" },
    { module: "BpmnSemantics.SemanticProcessJsonConformance", codeSha256: "85fa61229707717fb2de77a0aa9c8c61debee152a37514102d15c603dd14717b", peakResidentKib: 433600, elapsedSeconds: 11.07, measurementReceiptSha256: "1b19c7dd52517b9e4819e00b3d1d3bc07a51ba73ff77aa88502ce0b69145fe8b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance", codeSha256: "f377566a31e838767ce74618cfa801cd75b093a3b98d085db077d918240217e7",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", codeSha256: "9679735a7df8a15203d8728c969882d2bbc706b6341c0a7c2bec7ca50a9e83dd", peakResidentKib: 436100, elapsedSeconds: 1.18, measurementReceiptSha256: "99d48059f93b8129b3982fdd051dc7f020048591ca3433a1924d9a037370399c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityIssuingDisciplineConformance", codeSha256: "e7ada33c848dbe631a3d813d706234df0b26e276c44d1cc6360fb0622a0cec12", peakResidentKib: 446140, elapsedSeconds: 0.85, measurementReceiptSha256: "a5e9742711a7916637c85128cba0fdfbfdef4f12bfdb499cf929c040ada63495", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.Conformance", codeSha256: "c6054a14f2ef52944e65fe999d6eba5d161c7ce4b57edce68471e1282038f288", peakResidentKib: 334332, elapsedSeconds: 0.56, measurementReceiptSha256: "ff8f9a25f179b84147c1f85321dd8eb4ba1fac7673223b299f62729be5cdc617", measuredAtCommit: "e14db20c0a80ca4cb6c415d341ae41f0772c083c" },
    { module: "BpmnSemantics.ParallelForkJoinConformance", codeSha256: "220f162f15747922bec4370c79f48fc7de75008eb01d269f814965838203e8f3", peakResidentKib: 333404, elapsedSeconds: 0.45, measurementReceiptSha256: "2e8efbb6df3fb3636aae4141886e016e2b2ee0936b2f7d2af08c6a8d3544cff2", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
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
