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
    { module: "BpmnSemantics.SequentialScopeGraphConformance", codeSha256: "e5cb25488b7a2813bf76cade2a6042c2962f6527b4157298c260c2c16616a7a7", peakResidentKib: 1088040, elapsedSeconds: 103.24, measurementReceiptSha256: "7d43f8d6f919922069bf0ff02ca8c6ee360a4e148421d6de24d67e7b1b5ed5bc", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", codeSha256: "633c41d6544abb05d1e1e219f61991d96f0030d97c96f46eeb159e2e6607295c", peakResidentKib: 431056, elapsedSeconds: 3.14, measurementReceiptSha256: "239086141681d550637afc48eacfbf09f08cea2c1bbcd7581b7b54a091e3d1e7", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.NestedScopeDataConformance", codeSha256: "d71dc7b1aef3dfd422f41df4f2425714694b6976cf9143bf27a6facc39f56a73", peakResidentKib: 408160, elapsedSeconds: 1.42, measurementReceiptSha256: "e5920c4826188d18301ee1c8e59568617361530765b42c1e1cad9e0a516d2228", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CallVariableMappingConformance", codeSha256: "a03b1a795f135faeba441aa47eba13c113b337b2f33a92b0c06af933b669d903", peakResidentKib: 424540, elapsedSeconds: 1.46, measurementReceiptSha256: "37938f28c7dfceb17c729e92e2acb605cd833efbe95f194dfe8bfd54bef2505c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.NestedScopeControlConformance", codeSha256: "86a6c2989a30c9ab77c7272f623f6318f9b1b0418f310ced9ce8c0a565bfaafb", peakResidentKib: 415800, elapsedSeconds: 1.18, measurementReceiptSha256: "4cd93719fc224502add9b348fb530b0b39a7b7983e3e6e34c11176df0623e3f9", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsAdmissionConformance", codeSha256: "0ff908bc99d411a84eb96baa8389e9d8651df1009e955f320a6ed3b7ee0574c1", peakResidentKib: 409748, elapsedSeconds: 0.96, measurementReceiptSha256: "cc406bba70ecaab023964ea225f117fa678f74ed8eca470c34adbdc5d0a8f6ba", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsConformance", codeSha256: "1a5353898e18a84772a3067095ac20bdba531386f400e4eecc5a921993de86f8", peakResidentKib: 406768, elapsedSeconds: 0.95, measurementReceiptSha256: "38077751579996b4ca0bd15d66bb6c6d44b30e1701b810a3a85dfb1d7d1c50dc", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ConcurrentScopeDataConformance", codeSha256: "2b61389c41185113081bf9070c5a29c0cdfcba5be470204c8e6474781151224b", peakResidentKib: 402228, elapsedSeconds: 1.15, measurementReceiptSha256: "76dbec3e56acf9ea1fda6839e9b5fb0f2df31d753eec346d3439fb04318d45f3", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ConcurrentScopeServiceTasksConformance", codeSha256: "d2fdd11b0c92da4f20a93065f1a77863b729992f9363e4f2a4242d8b02aba74a", peakResidentKib: 413544, elapsedSeconds: 1.17, measurementReceiptSha256: "730f738704f7dff224a2b5187e4129bd29fead2174ef7e029a15407a712a8ace", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsAdmissionConformance", codeSha256: "dac0d008ee5b33f38ab2e7d6bb25f04d73aea2bbfae0da90a623abfaff227171", peakResidentKib: 391876, elapsedSeconds: 2.94, measurementReceiptSha256: "2b7f7bb3d085238732068ee347a565af500348abb221b3c0fc3530f5358aeda4", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsConformance", codeSha256: "b624721a47750840441f7d161d478ac474432a8c70d66a95026d2593b2e67f9a", peakResidentKib: 396824, elapsedSeconds: 3.8, measurementReceiptSha256: "2ab48bda8e0e2c684494d6469a853ddcb6075e356a295c39950caeecc5fe29ce", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", codeSha256: "859ded8057e44b298b3652544d8bb10e8d91cb692d6b2b56e98c478cd108fead", peakResidentKib: 487176, elapsedSeconds: 2.4, measurementReceiptSha256: "1fa6a5c37e345ac6797b533fface4b4b3d47ff30e73972a0b2fdf542d96b26d1", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", codeSha256: "55ef139413f13c63bbc73239d6b01896987c498b9411a980408ef71d3d8e757b", peakResidentKib: 622208, elapsedSeconds: 4.88, measurementReceiptSha256: "1c0f315c408de1af0ac428bdc00a20fbd3923da372d6487232b4aa9eaff45347", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", codeSha256: "503dff4a6faf20485962705ce0136476ae22e355bcc4a241a6a0af7f70a3ddd8", peakResidentKib: 410184, elapsedSeconds: 1.18, measurementReceiptSha256: "980b3cf080faee884a701ea01cb9f4bf3059ddb635a6a1b9aa3005d64d905504", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", codeSha256: "bc391e206bb2b17edab0812f6843a519cd9b0be5ffb5f39b90a3adfb081a1849", peakResidentKib: 405808, elapsedSeconds: 3.64, measurementReceiptSha256: "8881eeb6ccff17826abfa09fc2a36143a1f848982e0d197a0742dcadf441ae28", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", codeSha256: "46e5ea612185bd0ff32faac1a1c618c4e1e0b94a6be5d1997e2c226ca70bd4a0", peakResidentKib: 1498400, elapsedSeconds: 27.02, measurementReceiptSha256: "0c565201da9d1bada52c0dc0a69e293da40e5a98954fc674a1fb8b72df29aa73", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", codeSha256: "285dcc1dec9d6cc412f5f043899e8e4cb16ff427fb5463beeb1b0cfce766a149", peakResidentKib: 436180, elapsedSeconds: 3.03, measurementReceiptSha256: "b90b94256e04371c64a166307db1cefbcedb1d7db0449a896361c2cd43842cb2", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", codeSha256: "4acd4bebaffc3d703b5729c96727e994bde8cf5ec0610a83c7bba0302df942d8", peakResidentKib: 376256, elapsedSeconds: 1.59, measurementReceiptSha256: "596c5852e04120457b8339b49716a7327735cdf6db39da40fa724546a682a0bd", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", codeSha256: "24c53042616745601dd94cf2724293c570e518b48d2658d471a2dd0d78433aa5", peakResidentKib: 622160, elapsedSeconds: 2.79, measurementReceiptSha256: "5468ca8222d68b9757808c94c7cc8baa936e42bf854fe763069b25b3864742a3", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.PortableHandoffConformance", codeSha256: "182e74dfc83cf19c5ea057bbb9c7f00a4c4b22464173bedd56bbd6ee78dbe975", peakResidentKib: 398984, elapsedSeconds: 1.06, measurementReceiptSha256: "7ab2799c38bac41307712c1698a4eaec828a2fc1616353378083a8d7f08bbac4", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.EffectDataConformance", codeSha256: "676b2bf09fdff76d66b73546f310cec7cd71c52b4515ad9667f115a17a75a820", peakResidentKib: 405868, elapsedSeconds: 0.95, measurementReceiptSha256: "e00276449a541432918541271f83c202607fe3db34e3fd01298d71e0dba98557", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionSourceConformance", codeSha256: "a74ac9273cee79d429dc30401351b46847eb5b3f12419fa5c73cabbcf0de66a4", peakResidentKib: 1057056, elapsedSeconds: 9.31, measurementReceiptSha256: "595b110e064bc81160025193694233ffa7965a8044e90409b8d1b00d1197988e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionSourceArmingConformance", codeSha256: "046c70a99999e900cf23bf785ce88acd50904695d27f61339c349e6af7941b11", peakResidentKib: 1225668, elapsedSeconds: 19.79, measurementReceiptSha256: "77bab65e8f3d2ec08572ee455ce66b06d3d1dc1bc0c09eb518446b8df2b2ccdd", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", codeSha256: "215b68d97f28d65936c33c7d557b06e8ff5de77786b9631edd940789ad99f426", peakResidentKib: 403628, elapsedSeconds: 1.37, measurementReceiptSha256: "7f27a69f2cf325ba2e98a8c92ac9df3afccc4ac0c7a2df122a71b4df7af95b2e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", codeSha256: "1999a01dfa14f0ddb8ab63f15039079151b53ce3d4f7fa1b635ae192a030e4e2", peakResidentKib: 398848, elapsedSeconds: 1.69, measurementReceiptSha256: "59e4ceb04ae1c713c99922269a7adaed0ff367c77d99dd56526cf3ee34a0881c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", codeSha256: "057489c9ccf103d0c6e04f75aaac73e278063bc076e0e4673fda1b001604a699", peakResidentKib: 387412, elapsedSeconds: 1.19, measurementReceiptSha256: "da821f3b852c12db73262f5bf3b2af73966bdce46e3ae8301439a61a9df25594", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", codeSha256: "bb94b63460446cf033cb8fde08505b40adc1129c1323f438ae4a007dc19cc8fb", peakResidentKib: 378692, elapsedSeconds: 1.07, measurementReceiptSha256: "4a44c210cad7ebf0446df75553cd5b72a5b599e53a2b8fe96d343fe4608d44dc", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationConformance", codeSha256: "2788461ba726a1b7356d719251f820c0e0779b1ff938037297c07c80b850c684", peakResidentKib: 572508, elapsedSeconds: 4.75, measurementReceiptSha256: "d6eea99ec764191000d9b1975624f3f7ad7914234da787a5a748cfc1846e10cb", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionRetentionConformance", codeSha256: "c3a4f4d269f5871c3e1e01a250008f05dd51c4469105021735504235ba9d1c3e", peakResidentKib: 351920, elapsedSeconds: 0.98, measurementReceiptSha256: "b2b960573bfbe3353ddfc2adeec81f3f11fb014389117317b72bf660d329f1d7", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", codeSha256: "406f9e8edf82c1115d79127c93e10d5cc77d5b8b8b1f701d4945d88add006dc0", peakResidentKib: 387920, elapsedSeconds: 1.81, measurementReceiptSha256: "71b3528b3ddfcd8f32d621704652315e7bfd90d41465014a7a5a2113a34b148f", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", codeSha256: "c1563e0984f8ba04016f08e33e76b264a371471c29ba36a64016141c71324fe9", peakResidentKib: 387732, elapsedSeconds: 0.96, measurementReceiptSha256: "59c63e89bebe6fabe72940f71e7ff2814a3c90e8c2133c2d1e2c8ea0a6709500", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", codeSha256: "7c2d68698f90c3207432ef63b66db4a157d17fd8dcf780f58355fd94f0a9e50a", peakResidentKib: 388120, elapsedSeconds: 1.17, measurementReceiptSha256: "610c21bfb6f85e898ad8b4b8efd8b14e5dfe33c8e0f8eab7f43f67730bbe3ba0", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", codeSha256: "23426d47585caae065e397a61cef45c4c833f0f5069d8db87bb62e7fd4667a79", peakResidentKib: 388060, elapsedSeconds: 0.96, measurementReceiptSha256: "701ad09a57138fbcf6e14fff3a067dd27b251cc1e0e070b1189c6d6893204883", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", codeSha256: "a6f6334fe417882885a4e7e55360560ce8d5b9fa17f6bad1cf8e0bbf74cbbae4", peakResidentKib: 390132, elapsedSeconds: 0.96, measurementReceiptSha256: "c19e8c3803af79afa96ed174a893ccf02a3da03e8a196c5df99d3e643746b4c0", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", codeSha256: "5c2ba312a08d516e78bed8496bd9ae9a2738bebb550d1dcdcfedc203c7dd9c8e", peakResidentKib: 339388, elapsedSeconds: 0.66, measurementReceiptSha256: "716c1b1b603023191fad76a6da835a8301a7aae5928567e9ffc2126a0ef57251", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", codeSha256: "d4246a39a3b7998bb53ca54d9551022ada82d3e7d86887751c7e7d94667d856e", peakResidentKib: 396480, elapsedSeconds: 1.05, measurementReceiptSha256: "272ae4fe46444507c545e2d62bbf785f658974820e3396307e05610b95b1926e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", codeSha256: "f0efdccbe445b25c9dffae52cb34292f2b2d3e5029cda2e8a00200545f112454", peakResidentKib: 1080228, elapsedSeconds: 14.13, measurementReceiptSha256: "76186e28c38114edb9ddc4516d12582e978f3e1896ee705003b7528d995099d3", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", codeSha256: "9cb12fc53a4fc2e226d060919b9a35818cd3ca698b77acc33546e8d5d4ca2a41", peakResidentKib: 1231644, elapsedSeconds: 12.94, measurementReceiptSha256: "6ce3cdf3db09b11654b1ffa57f2f22408589ba3ffcbb1ad8a7e3647b09b7718f", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", codeSha256: "ca111a503351ae5a870be0f7d32a6c9cdfe8e4d5b7ede179645791f919ba20c8", peakResidentKib: 850456, elapsedSeconds: 5.98, measurementReceiptSha256: "264fa534e6ad440be98bf6e5b7a57fa9147044d3297301406f81f424a82e4a9f", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SnapshotInternalArmingSourceConformance", codeSha256: "f4a663acfca7436104dec6f91629c7b8d1633bdd2a654c2dda0c956bf86c0e2f", peakResidentKib: 390676, elapsedSeconds: 0.95, measurementReceiptSha256: "31178ed4ea9ad28319371fc47acf4973ffd3f65a31fadd5c93b585a79d5edbda", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", codeSha256: "d36ebb1a9c48fec7ab5f4c44c6c3f05b3d4ae32f168bd6782e06852e32d1e42b", peakResidentKib: 403292, elapsedSeconds: 3.39, measurementReceiptSha256: "163714604e312eed5269b5500c0aa4019ae418a04058ea8c61014ddc1e25f870", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", codeSha256: "a36c4b699c90ef55b509b36745cf4961ba41fb1dcfa88d4e38d63ed79dd9244c", peakResidentKib: 1825396, elapsedSeconds: 65.87, measurementReceiptSha256: "6e325b4a1932476f40da717311d1ac51c043d6ad79cd72b275efee0459b080bd", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", codeSha256: "8fef3d8c2f9b8072740bd6e0e76f44f80123a5255eb41d786c3e26dcd6f0834e", peakResidentKib: 399452, elapsedSeconds: 1.06, measurementReceiptSha256: "ab4de870107ac1dca7e6a1c4eaae21765ee4ac6b929cdb4e0fa20a2a787bf415", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", codeSha256: "8f32eb8bd5e3de550936340cb45e928f37e62a8d484482b4119a9e61821e1a45", peakResidentKib: 1155500, elapsedSeconds: 16.75, measurementReceiptSha256: "e95dfef65991060c3d3982b9ab4a13784d5a2b68a40781ed8d1215fc1e8e493a", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", codeSha256: "5c03e6e7088ae5778410b9ba2bb6167f9c881cc31f4da36c7c1b9e88cbb83247", peakResidentKib: 403904, elapsedSeconds: 1.47, measurementReceiptSha256: "f14fb401d9ea05ab8bc61878c6cbd86c100cdb3ce46285814e6f8dba43201085", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", codeSha256: "6510b640306d5e9a122260f3a7449e4e3aade5bb4a69f8d18118dd1ed6c3f5f7", peakResidentKib: 411132, elapsedSeconds: 4.4, measurementReceiptSha256: "5e6255d5b2e798837c0946fc7f79ea7b19a2e61e6088032d23b965aa6ce18b5c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", codeSha256: "e559898577a57664ebcadda5c519340a088be317c3e9faf838518e525ad4049d", peakResidentKib: 1170232, elapsedSeconds: 29.17, measurementReceiptSha256: "c812d566d570903d95b08444cae7e4a3ad5ebab365a415bd9fe59cbf9e54615e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", codeSha256: "739ff949d1e870a684cebf33882dc5280e0b04398b7ee6349aabfef064ffb97c", peakResidentKib: 868632, elapsedSeconds: 11.79, measurementReceiptSha256: "5adeec47b525e5dc3bdb1a4a98d7bd43c9e06184363b230dcf99bcfa0b7f4291", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", codeSha256: "ee5f9a011a8dccbc2ec022664bcabc4d7ff388c13143587bd50051dbafdfc800", peakResidentKib: 397080, elapsedSeconds: 1.16, measurementReceiptSha256: "874c178535fe8d8031a4f1168bd4c4fee0e40160a4e7623ac68dcc742bf30ba0", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", codeSha256: "03cbd4efdf01effe90bafc6c4e31632a980a5dd5e310c879a6dd8ef007255134", peakResidentKib: 389560, elapsedSeconds: 1.17, measurementReceiptSha256: "425de7dce18d8e6d1bcfad68bdbb47edbebdb055a196eab21e0d02e51105071b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", codeSha256: "b6d50be60183ab62241a95252bbab93c7a2b38de9a71a294d41e46a91a9ce865", peakResidentKib: 378516, elapsedSeconds: 0.85, measurementReceiptSha256: "39349c0e2c7e7b05e7ef9fbc5a13958165c0f1c996083a66e9c8008317385a1e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", codeSha256: "58b6fae29af6a05dd09e424951441efb426ca45a50d50938d311e5c2f7be16ba", peakResidentKib: 374160, elapsedSeconds: 4.01, measurementReceiptSha256: "bbc6267ba36fc32751819d8e02db66d4adaa501a727fa170441db2fe8bdf4074", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", codeSha256: "d132913e52200c19f9ba5c821b356493743051e6f09892f8c2454625f0ae5601", peakResidentKib: 1487812, elapsedSeconds: 9.88, measurementReceiptSha256: "8229c274b9a8bd702c1c3808bf8ffb552ab742b476273268aa549029a2cb3b68", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", codeSha256: "9d686ca9e04b1008434ae77f748cfa412186ad3e631fa498c9de08273f1e63ab", peakResidentKib: 1146232, elapsedSeconds: 12.72, measurementReceiptSha256: "73e98fef65eeeb7da15d290ec25fc281893a4fd365670e25275d909158816b52", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", codeSha256: "d98175ef4e0dae015439e39d5c94d3746b086579eb3cc2bb54572ef58be1cc8b", peakResidentKib: 342280, elapsedSeconds: 0.76, measurementReceiptSha256: "1ec33327bb4a4cf48ef6a754b62eb78803637b1523ba34b508b65331a1ff7a6c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", codeSha256: "1f44c7be174dcb24be800d48be8926c9f73fed6fbe3948dcef88edf19673f875", peakResidentKib: 405384, elapsedSeconds: 1.38, measurementReceiptSha256: "d500dd685a910ad5ef26ef4d64a58748be46aca00b1e8108a958312e4022b550", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", codeSha256: "c0e7e2479c396b001f071fb146c691bb3b82188ef6e841251f270702844fe575", peakResidentKib: 1028856, elapsedSeconds: 6.27, measurementReceiptSha256: "40d5665b6a95a8ba00dd7b1ef75252629678a1bab7afa9bd87e2e3aab857d272", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", codeSha256: "56d0c61ff683d9e306b2b0a5210228270b1255a674754faafb48a39525c4262b", peakResidentKib: 369852, elapsedSeconds: 1.71, measurementReceiptSha256: "11134f08ceacb399c5bb4b997dfbd0a43d3770e6546860fe66487efe7d9d88c0", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MessageStartAdmissionConformance", codeSha256: "15f2341f1fa0be4df8c25c488f8d38c82d8fdad529fb0dfb55dd5483bd816293", peakResidentKib: 1005260, elapsedSeconds: 12.34, measurementReceiptSha256: "53299e1a219e38744fae0e85b40c1af67776a2243f1034a20b33ff33f76f3dc5", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MessageStartClosureConformance", codeSha256: "98425bbdbc1bff5c8c60bd39cb6456ff9bd0a5608f460054f990841b7c813cb0", peakResidentKib: 889488, elapsedSeconds: 3.36, measurementReceiptSha256: "d03e499738f4837d5690b695c81103789e1316b0e64981a6b0c7f176f915249f", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MessageStartIdentityConformance", codeSha256: "21e688174019364f9ddcada3e64014b08835e2a129cb7b90122c220ff1199135", peakResidentKib: 906516, elapsedSeconds: 7.45, measurementReceiptSha256: "0681e8361ea6dfd3e0b837182b3d39405bd3bac22adaee8cdb121fdb0370eac4", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MessageStartScenarioConformance", codeSha256: "0d904cf28c5428e9677678bf3f18d46acbd6102e975226a56a62b01abc18e8c2", peakResidentKib: 1167776, elapsedSeconds: 4.81, measurementReceiptSha256: "fe49bc0539ddd5f3b51f787e42872ec20be021c59b8fdc45f532238299052616", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MessageStartConformance", codeSha256: "b0af696a951c386d29f76b87630266e422632d878f337964abe74968c8f7215e", peakResidentKib: 439412, elapsedSeconds: 0.95, measurementReceiptSha256: "0de11f22047c0e740137f013adf45c01ab572f7a51ef4365c886ea61b896e668", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessagePayloadCatchConformance", codeSha256: "52710559516ec33e73d0f34e17fdf916957eebe3726405ddb7f322e41eb647cf", peakResidentKib: 1124576, elapsedSeconds: 12.69, measurementReceiptSha256: "f95fff39acbbcd0eb08e93f6bdda7b8340dc753be8fb863b7ad8084131678533", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.PortableMessagePayloadConformance", codeSha256: "d5841b478e3d4b2269c7ffe753e3e9aaf6a899931b238c67f267af14433990aa", peakResidentKib: 1213284, elapsedSeconds: 16.09, measurementReceiptSha256: "a8f0fa91ed4b8e6f754c7800c2a918afa70366d1b06b3f09218258f2e11b8073", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialMultiInstanceConformance", codeSha256: "e5d4cbac5fe57ba61b3f8594dca778cc88587d640516f56d9a235fd73b27191a", peakResidentKib: 435816, elapsedSeconds: 1.2, measurementReceiptSha256: "67bfbe81b0e557c8f24cabfda47adb1ddfd5595c1e663820b5b59d774fc4dff7", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgressConformance", codeSha256: "6df36077588045b79566fc7436feae47286d5e495b43713a7224e71f9021558e", peakResidentKib: 639560, elapsedSeconds: 8.28, measurementReceiptSha256: "e7e6abc5dd0f42fca90e3097cd97855187d1c8bf53273c3b614cc95567307803", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SequentialMultiInstanceRuntimeConformance", codeSha256: "473b4829c217bbfb9c7d19978d8d014e37cea3b29d0c236c42551ca9e3777400", peakResidentKib: 669992, elapsedSeconds: 8.84, measurementReceiptSha256: "ae6b8f8adecc049ecac2dd49555142dac4c32267844baf812d8f278992dc3f8c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SequentialMultiInstanceRefusalConformance", codeSha256: "1ad2271371368b4db610cfd61dc79bd04b6c481bb52339a64817de488fb48a64", peakResidentKib: 649844, elapsedSeconds: 10, measurementReceiptSha256: "a784f52406d423af8d7d97c25615f0109b332e65085fe89d260f3f4a4855f3cc", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance", codeSha256: "04e3cc2a06b3b8ba15eba0dfb6244d1ac45c92af489d2046ec5a998d0f87ab7a", peakResidentKib: 378608, elapsedSeconds: 6.84, measurementReceiptSha256: "5c59b94a8520b172c93fdab7ddf2623dda0f88aef1a610109e217ef6e642b288", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance", codeSha256: "73fce35b8406ec701aa255788ff009ba40244749fa186f8ce900b7a569207f60", peakResidentKib: 439892, elapsedSeconds: 11.98, measurementReceiptSha256: "33df23b8824218360d30bf6946895b61801bfdbc02e51317f1807ad1b738ae50", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", codeSha256: "fb7d197313d1ffccc8ef599d9088a8898880ece24c0b3f9f2d299e7823ee14a6", peakResidentKib: 458128, elapsedSeconds: 2.41, measurementReceiptSha256: "e49678241a698f18403bc703ed503db363e3e23f7b49ed001aace447bf0171c9", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", codeSha256: "e49c16b927b6d9964870fdfe07df6786503da134f5db473a256ad3cf83b77b20", peakResidentKib: 887948, elapsedSeconds: 5.16, measurementReceiptSha256: "95adfbe54c3c1dc7ed8e11750ee61b6190cab65259f5d4edd76d3a905418950a", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
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
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", codeSha256: "9718edc231157f85fb449bb2b7c2910152b8516cd8f1805c278602e84dda8b1a", peakResidentKib: 1059436, elapsedSeconds: 36.94, measurementReceiptSha256: "3fb5a32a77105a2dc02fa7b73472e3b724c6ed17b395e35dbc808568b7369296", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TimerStartConformance", codeSha256: "4e4972acc5c240996771e2a6a80b09e40055c4f5d71855c003f3d77d4e2224b1", peakResidentKib: 1201228, elapsedSeconds: 24.5, measurementReceiptSha256: "85034c7745fb2e888cbd57ad465b01c4e9f9e5c788e13db78b5076a36a41b485", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", codeSha256: "13df74c6edb659108bee22cff4908d1303f0b4f1634ff3a40dc2de5565d1b8fc", peakResidentKib: 1564548, elapsedSeconds: 100.25, measurementReceiptSha256: "f23eb33490bfb6dec228a1e8365a4671df74ee643a04da711405d819c37c1756", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RuntimeStateActivityConformance", codeSha256: "d5967e51d77067d6a36a9ffbfe32d7856dfb46fffbf17e38274ca11a894dcaec", peakResidentKib: 414296, elapsedSeconds: 4.1, measurementReceiptSha256: "1dd8ff081f0bc8a11ddb7184e549dbac2e0c7e976f6b8af430a15ead9e2c7d12", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", codeSha256: "465ebda4adda183c4cbb24d99ee55ab55509c17c27aafd6cb7c04fc228e53f8b", peakResidentKib: 1090140, elapsedSeconds: 9.36, measurementReceiptSha256: "f8e6c40792b3c70f31efe2df40757487d77867cc0e0d62b00b88dc13c427083d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", codeSha256: "4781c4169b8f94487ae0dc6bdafe0977d0a85b11093882843ae56dd73bdfeb31", peakResidentKib: 782016, elapsedSeconds: 7.92, measurementReceiptSha256: "4727fc881792246465e6b20c0f38e36c45ff16b93006f1904d7708424162ef6b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeCancellationConformance", codeSha256: "484b6a194aa3b04dff2f74cacc923788385df3d099889b2f8a3df373abfe2a3a", peakResidentKib: 347300, elapsedSeconds: 1.44, measurementReceiptSha256: "92d48612c13094108df327f12c24358e603e8b5e9ee52ba73dff0e0ff70dab12", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ScopeCompletionConformance", codeSha256: "4a86642eaa5c0b5c82358a58e1d0c830f743f4e532cb5ae666d521fcc193ec86", peakResidentKib: 360848, elapsedSeconds: 1.09, measurementReceiptSha256: "47d6988f21d79bdff1cff34888be3b1326d980a6fb89d2daedb9c2d7eb1d8d21", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RuntimeStateControllerConformance", codeSha256: "6f7f3d29e67c68be8b81a493923067f0572189561deaf1e50dc7bce0ac334517", peakResidentKib: 415356, elapsedSeconds: 3.71, measurementReceiptSha256: "e182dd719850168bdac7067bca6f8b8d5a59c7a465bd9d92f69ee184e2604795", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", codeSha256: "40734ea3e99b8ee2dbd506e1a37da1b57dd676379d17115cad057d095e1ced93", peakResidentKib: 437940, elapsedSeconds: 1.4, measurementReceiptSha256: "cbafc94e92b13bff94f602bf03e3feb247b26e6b80175a599a7aac85ba66a3d7", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", codeSha256: "201c214e982f8a81beb4fe1c39bb80b20f0fc3964e02fd52c9260e1fc036037d", peakResidentKib: 504760, elapsedSeconds: 3, measurementReceiptSha256: "521a7ba124b88a58c9abb7673180d96e56a374053df3da2df3956c8617ec5b9d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", codeSha256: "3e703edc537b6450e76342f70f23a2fbc25be047928e252cc4df5d3c62a67fbd", peakResidentKib: 390032, elapsedSeconds: 1.18, measurementReceiptSha256: "8d9a6540c0f0934b9904ea18ab6e0dd935eee9adfdf067b2bc056a7a07946b6a", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", codeSha256: "e4ef0804eb135219052601101f6ffe73e6b607b3652dad9b7a5b335c7ed5dd98", peakResidentKib: 1401684, elapsedSeconds: 7.34, measurementReceiptSha256: "dde752f3bf8eb4f2648031f784f822f30b7ba45070b4f15391d5ae62f43a74b8", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SemanticProcessAdmissionConformance", codeSha256: "fea630278e0c6e0838f45c7fccd74386160611fba15f6fd392c5bff3b4c8ca05", peakResidentKib: 622808, elapsedSeconds: 14.24, measurementReceiptSha256: "4d3c5238ffd5d974a9b9d32092540399c72794cdf25ef3395e25d2af5cccba9c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.EventBasedGatewayConformance", codeSha256: "d255441130612e461f1d6b02bb23ecc35f5470733bd9afec77d0074ca86b5c87", peakResidentKib: 1276252, elapsedSeconds: 11.45, measurementReceiptSha256: "085e4e12c2051d746f6d7920ac1fc0ada20a882f6394af1a1690754941a876a1", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", codeSha256: "c788d36c9da5f56f9b9b37b2934788f6d469254f3a5ececdddc8f12673d0b883", peakResidentKib: 403200, elapsedSeconds: 1.37, measurementReceiptSha256: "c3597df5cf554a502b138687962c93ea349d72d9ac7fbb32ae4675c636d1e294", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", codeSha256: "9b4888d38b663f1324e0743ca08b33c9b0c6da6c99691767f401ac9e2dcbf2f2", peakResidentKib: 1386608, elapsedSeconds: 21.28, measurementReceiptSha256: "b8c2233e17fdef2ba21c21826edd6e6462fd5c5d9af8034e1b063f5b9ccbb4b6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", codeSha256: "b386dbf43f015a5c82eef4b8a669e043ccf7423f6b4b0ea6e9ffbb2b968bc186", peakResidentKib: 838580, elapsedSeconds: 8.89, measurementReceiptSha256: "c957df46e3f886b68b7019d58a8a4992ed383967c33a6ecc6079900a43160a28", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", codeSha256: "fa1a829b108b01a1c80fa7cf2d2cdf7ad58ec0013ac33ff35bba4363ab6dc89f", peakResidentKib: 1208100, elapsedSeconds: 6.45, measurementReceiptSha256: "d12d6c77d30371826568c0be3ad3df6f4772961452e66272daaa56ac1874389c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.TerminateEndEventConformance", codeSha256: "ed3c0acc4fd732d2433cfaafcc819b6c52483539695753767414dc735709ba13", peakResidentKib: 724792, elapsedSeconds: 6.39, measurementReceiptSha256: "9476d0a76f968a0a419ccb90117baff8fbd48987354a3a51a15b810e7bb6823f", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RegionalRemovalOwnerCoverageConformance", codeSha256: "48dfa6f26e79153bfb292df14168827604df5f2c307caddf3e31a727ba0eed54", peakResidentKib: 746732, elapsedSeconds: 2.25, measurementReceiptSha256: "f10f205d1c9d0c4d63b7b82e51ae698ab9e465212fe4ee78d790709c67d01638", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SemanticProcessConformance", codeSha256: "75e274e157a4be8c6bbf11ca7ec1e8edddb1c9ae7b4eb052f52a41fea7d8025c", peakResidentKib: 395664, elapsedSeconds: 9.07, measurementReceiptSha256: "744507ad0d32960f2ee0d966efe477858e914c55ad24eae6d0d3f04ee62191c6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", codeSha256: "1d5d7a68e32760239df1f95e0791b30dc8e99c54a85ea4666ad1bd7b4afe14fe", peakResidentKib: 987348, elapsedSeconds: 33.47, measurementReceiptSha256: "a40837d82ff846dafa02daff3cb6fe00d7e12d5fd4ec6c034d7d4f28da5afc9e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", codeSha256: "b43dae05bc1c80e65ef53a82319f4f529b7ffa83b2b20439bab080b8f78c7365", peakResidentKib: 1205112, elapsedSeconds: 14.68, measurementReceiptSha256: "c717ee8db418c6802d502742ac846a5e0d6038db7582e39ea6ff5fe179d80ed4", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityDataInputConformance", codeSha256: "ff7b558a3238b8c97d42fa259fe796f9799f2ea67582b6a827274b8c85cd0333", peakResidentKib: 968132, elapsedSeconds: 5.77, measurementReceiptSha256: "9c64de5ec6ca95ef99f1b87925688718601d5bbe8504c98247b5ff5026e3fe7b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", codeSha256: "fabc1b3a088a450225c0e7b713ffb1f3a9bf069ba30a1f65684cbdffccd10ba3", peakResidentKib: 1138244, elapsedSeconds: 19.4, measurementReceiptSha256: "414929682b50d2239af5eb94cfd235f4e94b8bc137016272a361b85312fb2468", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MappedSuccessConformance", codeSha256: "0ef8881bafc4a137b52aed0e9eb904c1c08e0794203398c5c524e4c3a0848866", peakResidentKib: 989280, elapsedSeconds: 11.85, measurementReceiptSha256: "68d21f998a2f4ad3ee86bfafaeec68c91e9ae5e9e1215304afde801869935b54", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InclusiveGatewayConformance", codeSha256: "89d7b0df1bdf532e52ef69dd115859a759a65012dd81c95aa25392f4218bf024", peakResidentKib: 1223780, elapsedSeconds: 10.93, measurementReceiptSha256: "ee2001377cba95b2d18c5659d000f2eb99d18938506b027f5952f5e9a17c3e78", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", codeSha256: "69b3892439ad2ef94831636d142b3dd78d779ec776f3b553e7dab67dd2a25001", peakResidentKib: 611264, elapsedSeconds: 14.04, measurementReceiptSha256: "31a5c2e41f55c0086b68f60447957dec8e709706f6191b409b17d899ecce8908", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", codeSha256: "3f895604505b9e38258e53fc0af893dac76c9903ad47c1c278f110a92594400d", peakResidentKib: 955920, elapsedSeconds: 23.12, measurementReceiptSha256: "651c25fe3d4395a87cba95e76f799eec18e181dd72045df42456e961d1529bcc", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", codeSha256: "b428efffe08b3f3545c4d88977217fd2f2617f9838e6323ea73fb697baa0affb", peakResidentKib: 1707988, elapsedSeconds: 27.28, measurementReceiptSha256: "f5ef72838b0dd7cd823d95b56900b4d654066747196a4824ba6c1f28e0757218", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalCommutationConformance", codeSha256: "44ea0e192bc1da107816126881d192ffb4a770a6748f53d8f5533582caf1f3fa", peakResidentKib: 1138684, elapsedSeconds: 13.62, measurementReceiptSha256: "1f7efa09a2ac827c77534a4915d99209390de9392fe308784714dad9b3e570ed", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", codeSha256: "108640fd67f0815417970ccb69f71b295097d7fac40856ce7453999f807653de", peakResidentKib: 400880, elapsedSeconds: 1.06, measurementReceiptSha256: "20ba9b405c999ad9d7b247e0585ac9c76759c13fd7018647a0b6ae1171c03049", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", codeSha256: "66ca788de08894296ab1ee6845d1c1b1dd35af07fb1e576cf18660b4409bb66f", peakResidentKib: 1576064, elapsedSeconds: 10.28, measurementReceiptSha256: "2e3a7e3eeb93e57714516f502912652f1019491389308cb555c57ba0aa7b3b8f", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
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
    { module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance", codeSha256: "c71b6b95f40ca365025ac88e39276166e2e7229e5797745625d85cc55012e0b5", peakResidentKib: 905812, elapsedSeconds: 5.66, measurementReceiptSha256: "5770f638d492c4d74e9e978f748face2008b10fb1698628af9f813e394fb88a7", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", codeSha256: "80c7cb993808fe2aa23dd663503faf664e7050c8cecd41e0ebaa07bffc9598cf", peakResidentKib: 1164468, elapsedSeconds: 20.99, measurementReceiptSha256: "bee8f03c895ad89fe6568bb357c0736c8c5658d51ebad474c6b32c23af387c50", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance", codeSha256: "bca32194fd5b119c52684d53fcf71309388872acb5bb313909097fe1600f48a7", peakResidentKib: 436044, elapsedSeconds: 0.96, measurementReceiptSha256: "511c7c5199ef79bb597611c978d136fce98187d26c4e31715734d6bcc6367b94", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationActivityRetentionProducerConformance", codeSha256: "e4bd251ba1fd9915b89b02a9a8161899dd58113bc3438a403e6f8c32a286e8bb", peakResidentKib: 733380, elapsedSeconds: 9.27, measurementReceiptSha256: "cbeab0cec596e61c94ad74cf68adb3065071ddc014ec1b5a0f254aa14e1711cb", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationActivityRetentionConformance", codeSha256: "106784667c6c6312f7f2ddf3621fda98c052403702ed255530a467f3e8c2da3c", peakResidentKib: 788408, elapsedSeconds: 6.8, measurementReceiptSha256: "661bbcb6b5bc00b0b1482a18be56d37a41153598e917b587b485f69cb46388a4", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.UserTaskMetadataConformance", codeSha256: "85e2581f3f66c604f43232a30928c35e913e70c5b95814f9a719faf5e2a62087", peakResidentKib: 767608, elapsedSeconds: 16.63, measurementReceiptSha256: "5ff098a930b4c5b07215b07930e71559cceff21c76a665ed25bb90efb6280fb4", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", codeSha256: "c9c3688b76ea33d635b046e7d24eab92a78cdbaa038e53797ba18309555c3d48", peakResidentKib: 591928, elapsedSeconds: 2.4, measurementReceiptSha256: "2a04b63f3327f1b6f2d096d5dba614eeb4d1fda4190be3d1c58a4c8e4f3c8421", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", codeSha256: "0c947e70b39bdf9a489c30276dfbfbbf328647d38c5f5c73ab5ede9dd50c8221", peakResidentKib: 543600, elapsedSeconds: 3.51, measurementReceiptSha256: "f803f08a679900b7d0ca78f5653ddf4184ec8b75ac9d65f499678ae36ce95246", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", codeSha256: "0d0527c2052cdb19189c7383a3ce748dfa53ea1a6fca0b4af7a10f157f47b2b7", peakResidentKib: 386848, elapsedSeconds: 1.06, measurementReceiptSha256: "c65e8f08a69d5e1fb972e07671d3cf4c25a8a65538966e95aee616d6ec51aab6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", codeSha256: "45ffa29ce8bfc5126dd89fee5c26828f6382a5be4f62f1631112173ab6102925", peakResidentKib: 406592, elapsedSeconds: 0.95, measurementReceiptSha256: "57c709fb6f97cb53701db4ee4789639561bf787cc5f3e2c82f376a378bf86f7d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityDataOutputConformance", codeSha256: "a21dcc5fd778f7a358021e3715a956f420920ce53e4ecbd18d31c58ac4fa13e4", peakResidentKib: 987004, elapsedSeconds: 7.32, measurementReceiptSha256: "41af7f197eb81728430be9253f9b1dfcbb5575b67446d89e1cb30e242dc36eb9", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ReceiveTaskConformance", codeSha256: "a3b1adb7537115755d077db44dc948650b760736dcc4b8c095ffd0b372da49e3", peakResidentKib: 1256828, elapsedSeconds: 7.85, measurementReceiptSha256: "932fc617a28fa7645c758f69fd8f1dbdeb90b99873ac60d8e7aba9f1e5a59498", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", codeSha256: "7b881505d27259081697f18651570f61b1f623514027c335e8aec291ab006886", peakResidentKib: 390124, elapsedSeconds: 2.44, measurementReceiptSha256: "c2d467b0b3ba47bda0f4e1e24b88756289ff3d4721c7c6ad132adaebc278dbeb", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", codeSha256: "1c1f397df461ea05b4c6cf6ae9eb11b164424ca6b388387a24c42b71999d7e6e", peakResidentKib: 397996, elapsedSeconds: 0.96, measurementReceiptSha256: "d2185cda9047ff5add4a059c04b34197afed03380383e9b42e9568067f07b717", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotConformance", codeSha256: "16dc87f6ced03c6ad24cc29d1214c0c996623e41ec83fefaadbaa6664d27014a", peakResidentKib: 401304, elapsedSeconds: 1.05, measurementReceiptSha256: "383503a36335dc935c0d1b3c0890812e679a8c64d4eb94c6c0a6cb5f2c946605", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance", codeSha256: "c0bbdb0aff131110d0603c9e93e85044bafdb4f31d470c31e7705d80e36c423d", peakResidentKib: 394964, elapsedSeconds: 0.95, measurementReceiptSha256: "6beb56f44803b96d11a43d42639ab816f8d4d8603c3f17253f20af8817fa0f29", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance", codeSha256: "bb2f9b2da0c94f621ec7991425dee4766c97af08fe601dbb71093c1d37e94819", peakResidentKib: 399104, elapsedSeconds: 0.88, measurementReceiptSha256: "167d1b7b2617c83af2223ab33b1bc2305e1392aef3d3d3fc0c1420e6496428f7", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance", codeSha256: "9329dc50dbf121e6cae4471d6cf5c7a797ab6283d57213fb2b8615fc247fe582", peakResidentKib: 403428, elapsedSeconds: 1.05, measurementReceiptSha256: "80c5288d0853db1aaf040e2615c31d8a153ea51b480862a3953af265d9af3912", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance", codeSha256: "95d31e0976b7135c195cc493d44366e712380d7c303d21472fa0b550a48cf21c", peakResidentKib: 388212, elapsedSeconds: 0.85, measurementReceiptSha256: "ba669f3d3342c927a50b9d526803a4e6a6a90409c9ead214b67b4f6c1ec76191", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance", codeSha256: "b72122afa42d1750b7410e0bfaa57f80a7fa51d6ffcee3d850db0373686daf7f", peakResidentKib: 379384, elapsedSeconds: 0.85, measurementReceiptSha256: "ba2f8702a85fa6aca5184647296e11ecf09d2a1591670c3080d316aaf241158b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.UserTaskInteractionConformance", codeSha256: "4aebfd6a8a07808b0a36d4886e3b2c926677c71f51eaa6c613692252af095635", peakResidentKib: 957444, elapsedSeconds: 6.55, measurementReceiptSha256: "ce3d5824747e4ec5c02b606382ba71ac37f00d9893a8d6fc89e755ada8af4c2c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", codeSha256: "460712b44ce82cd7dfeb339bea0bf4b545642a50090dd7aa41ef45f8a8474097", peakResidentKib: 407716, elapsedSeconds: 1.15, measurementReceiptSha256: "d7c7f9afb2fff817b2bf16f275edb963ac0e00fda5b50ae333d514835536b241", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", codeSha256: "02179578f74e3c55f4fe8c54382af8b09353f58455c9e4de4020c5b776beb70e", peakResidentKib: 1242120, elapsedSeconds: 17.53, measurementReceiptSha256: "96ef02b5d981788b3ab303589004c63bf4a08424b1979824bfef8645f1b591d2", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", codeSha256: "56e4c632cfe079da03c9b42b1fbbd5ed11a01fef4c87592c78d27bbce3a70084", peakResidentKib: 873472, elapsedSeconds: 7.19, measurementReceiptSha256: "83adc80c503918bb3d33d47d55825d40707fe2cfce7135e86aab87975fd34c12", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", codeSha256: "de2af35f3342b29c8a1a1be822d301d7e89920341b9e1ac2d65f6dc26848ad6c", peakResidentKib: 390796, elapsedSeconds: 5, measurementReceiptSha256: "1e7ce045e0a8de2155f7394227e09cf4f89c2f7413881e1488468b8f8e13af96", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", codeSha256: "4ff0dc67a98f36f2186640c360484434eaeeb4fe937c5e07150308ca0bf5fdfc", peakResidentKib: 426576, elapsedSeconds: 2.6, measurementReceiptSha256: "12d510e67716f345ba775f9245cefe251d5e49f8c4a1dcf0c9a35c2f6fd672d6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityBoundaryMessageConformance", codeSha256: "52ecf112c6b3203e52e4b9546783f4e23c5841e7788f55cfd63e7da1628aacba", peakResidentKib: 1080452, elapsedSeconds: 11, measurementReceiptSha256: "f21ac186466b478e4bfb8997596d0bdaa4c3303e3276b8f7d04d686237d2ee78", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", codeSha256: "ace7334e14d40aae764294118eafe171afeb92eaeefd7fd2be08256567de7c97", peakResidentKib: 1013120, elapsedSeconds: 17.96, measurementReceiptSha256: "06b1f1cc5f8f465d9a7db92a58e0a2f67e1ac924679951062b901542444b85f6", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", codeSha256: "2f179f0353ef22c20a7888be024834c82dce61ac5feeb7a73f17a13aca7a6336", peakResidentKib: 1004432, elapsedSeconds: 7.34, measurementReceiptSha256: "d44aeb098aa2837715ac290558e328fadf0b41326a59ba18f31b9adb6993a86e", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", codeSha256: "84be1a91da792ec30f348901e8a2e10b74ca287b492a19d9a47b6755b0cef296", peakResidentKib: 389820, elapsedSeconds: 1.05, measurementReceiptSha256: "6747e635f4d81977d555fe2028fa7a9af498b259988d9fcd6bea063dd5ebdd19", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.StructuredHumanWorkConformance", codeSha256: "8d94b3a2967c17bb63c4d4fa034d47ac31c6b1a4134c87a7b7e68e7f6cd27cb5", peakResidentKib: 901388, elapsedSeconds: 5.06, measurementReceiptSha256: "a7a555643fb262a514114dc35141fcbc27a6b34c06e7b9e88817a5e49c295556", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", codeSha256: "1814cd3e2f2c4dbb0918cb079cdb71ff5e6cdc6f9270fc50108fd619c52120e8", peakResidentKib: 847060, elapsedSeconds: 3.69, measurementReceiptSha256: "241b106435499f8b61181a91cf1d987391c50919a413e4915d2e3ce07e5fa9a1", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ProcessStartDataConformance", codeSha256: "003a43f7800d760a05759bab344affd324ae37f7ccc8dc450a20efc0cf976f8e", peakResidentKib: 621300, elapsedSeconds: 1.93, measurementReceiptSha256: "86f5abdeaa86f33f47497687e45d41219d2dd29de5f4cc069fdd176adc8ba604", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ParallelMultiInstanceConformance", codeSha256: "3fbd15593ad3ea6c551bce25626c6f323b10194b042d1d01faa96fbfbae8ec96", peakResidentKib: 411100, elapsedSeconds: 1.06, measurementReceiptSha256: "48ad2b63bc8750ac254e631a777a0fad8accadd7cd949345c2f694f4ff1c553d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", codeSha256: "eb83104cf154fbc097a5ac666e65f7134e7afa370e4e69429cd72b335ff3c5cd", peakResidentKib: 478000, elapsedSeconds: 1.99, measurementReceiptSha256: "3579f8f488a5390c50c1f99670daafe987dcc3c9b022ec2b107a01a21c5f1a0d", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", codeSha256: "19b4bc0ca1b462a031588986684c1a18b3ead97fd0a5994173561aed95852406", peakResidentKib: 511260, elapsedSeconds: 14.54, measurementReceiptSha256: "4f8dd50c6ec6a26334170b673a539305c75600d34e5c7fab420c1816fe250f26", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", codeSha256: "747014eaf0097ff9494c89205b62acae893b105b162562b38bbe06a4b727fdfa", peakResidentKib: 600392, elapsedSeconds: 27.73, measurementReceiptSha256: "78b3ea0dc560184a8a65d78aaa994bf8fce0e85f30ea84c52005100ec646083a", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", codeSha256: "0e9142e891073a4fce51890f65395d15a29803e2f2bf9da1ae0c6278f323dfd8", peakResidentKib: 575944, elapsedSeconds: 8.97, measurementReceiptSha256: "a174c308861f0f901d79ddafa8ba14677ee978fa42e4ae9b3270a6643c2f8e09", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.SemanticProcessJsonConformance", codeSha256: "85fa61229707717fb2de77a0aa9c8c61debee152a37514102d15c603dd14717b", peakResidentKib: 433600, elapsedSeconds: 11.07, measurementReceiptSha256: "1b19c7dd52517b9e4819e00b3d1d3bc07a51ba73ff77aa88502ce0b69145fe8b", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance", codeSha256: "f377566a31e838767ce74618cfa801cd75b093a3b98d085db077d918240217e7",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", codeSha256: "9679735a7df8a15203d8728c969882d2bbc706b6341c0a7c2bec7ca50a9e83dd", peakResidentKib: 436100, elapsedSeconds: 1.18, measurementReceiptSha256: "99d48059f93b8129b3982fdd051dc7f020048591ca3433a1924d9a037370399c", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.ActivityIssuingDisciplineConformance", codeSha256: "e7ada33c848dbe631a3d813d706234df0b26e276c44d1cc6360fb0622a0cec12", peakResidentKib: 446140, elapsedSeconds: 0.85, measurementReceiptSha256: "a5e9742711a7916637c85128cba0fdfbfdef4f12bfdb499cf929c040ada63495", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
    { module: "BpmnSemantics.Conformance", codeSha256: "a0c861de269a4d4e118e79e48d4150ff2678148ded78616fe7c317ee791f5ea8", peakResidentKib: 335080, elapsedSeconds: 0.45, measurementReceiptSha256: "f4603023c7cd762edd6057b69c601ccec57381b9443a67a61bb027c460dd31c9", measuredAtCommit: "83e765e9d3955351967d0df7e3657aade9b86c99" },
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
