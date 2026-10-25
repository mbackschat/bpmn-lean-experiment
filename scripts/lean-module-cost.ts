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
    { module: "BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageConformance", codeSha256: "0468033bb897bd98a811ed7ed8b2f23342fa6567a717876c5d4c09cf996b432b", peakResidentKib: 444480, elapsedSeconds: 2.2, measurementReceiptSha256: "0934367ca6ffbec8fbadee4b9998c145dfc0076e07d4d9cf31e1bf6484b7f1cf", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.SequentialScopeGraphConformance", codeSha256: "f589c883d3f97100c6acbf4bcbf3a1dea0673015f114de4f97a28a19cf256824", peakResidentKib: 1112984, elapsedSeconds: 95.57, measurementReceiptSha256: "0d1b32a508a929bf5c7aeaa60dfd1b5f1578b15b360dabb93b175732ad23b5c9", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", codeSha256: "ad789b3d3376931be907932cd7093efb5e824679889afaf83c859675784315cc", peakResidentKib: 359476, elapsedSeconds: 0.76, measurementReceiptSha256: "a1b06370e47e53e9728317c831b9a308261c8f29f356a85e97f884ff91b195f7", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.NestedScopeDataConformance", codeSha256: "d69a7b32b8bd21a2a418df2bc52bb287eed00fba90e123ef33006c771b47543e", peakResidentKib: 460356, elapsedSeconds: 1.68, measurementReceiptSha256: "a40e79610d64268ff0eadab954c916449e0701e95e1e4d20cc26401f57bb2810", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CallVariableMappingConformance", codeSha256: "8a54319010f77209be230af20e5394265a3c050ff5ac4802ebef0151484a538d", peakResidentKib: 470372, elapsedSeconds: 1.26, measurementReceiptSha256: "ca750f6797390ead45a5b539b39f7aa237b32169193987605771c022998bdbf0", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.NestedScopeControlConformance", codeSha256: "96d6cba8814e9be9190c685f8fd7bd622605f278fc35bca8e111d3413af5ad93", peakResidentKib: 463704, elapsedSeconds: 1.26, measurementReceiptSha256: "6941b8b4da4c90a8691a51d472ae1813a0c58d85d6e37d38b8b5844d11bb80cf", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsAdmissionConformance", codeSha256: "016bd9b6b70628224004fe61f7c819f0e417d75749c6efa921c4825ba49d9e74", peakResidentKib: 468140, elapsedSeconds: 1.05, measurementReceiptSha256: "71fb9417629b6433b4e668e1521387717a0ce4bd9e824546ea52ec3e74c96ba4", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsConformance", codeSha256: "71c27dcca07d9a623012670c5a53d32fb98f8c6c5444ce8a00d6f343c21fc9ce", peakResidentKib: 465464, elapsedSeconds: 1.05, measurementReceiptSha256: "2313829eab049130f18669276b63ee4553b0d3d761773091e3ba5f29cf7c466f", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsAdmissionConformance", codeSha256: "5baa6b9e5f25795662e569bac47329ad7dbe72835af668fcf81edb313608af6c", peakResidentKib: 452540, elapsedSeconds: 1.06, measurementReceiptSha256: "20fd26fb3434f085f05b4a4b8eb2bfaaf8c3bb7306e08b1d107259e9c3936def", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsConformance", codeSha256: "c806da73865394435194b9c062af9af308f53444f9827dfb5d25f745dd7c5de0", peakResidentKib: 462212, elapsedSeconds: 1.16, measurementReceiptSha256: "0c426b131cb37c881229a67b06c825c1d9f600f91832fb1aacc12be0de1705d0", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", codeSha256: "2d270b190cad57cc4d59aae1a36dfc802663e191f6975867886cab2c64318e5b", peakResidentKib: 499240, elapsedSeconds: 2.17, measurementReceiptSha256: "971b015648a184b8bbe0736a3df06421a41676759d1bf7307e37db3a3b6ae0a8", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", codeSha256: "0513de60379a8e65588e28e723c6a93810db3ee824dec976859bebcbe7a9b27a", peakResidentKib: 627760, elapsedSeconds: 4.34, measurementReceiptSha256: "d99e284e330d42b305cb30d3f116037c31354eb8cea33cade44c1420526a931b", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", codeSha256: "9d22819b17f01ded9468d0316669e90129455e7a7c96e6219678905d4bad413b", peakResidentKib: 465456, elapsedSeconds: 10.31, measurementReceiptSha256: "8eda700f470e8926a717262a6b03d52dd19203c8b48b79ef172558b5ead65799", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", codeSha256: "23d72c859265d90d2adb7394577b971954f158a32ea967c3a49819c5fb8f80d8", peakResidentKib: 1670344, elapsedSeconds: 52.07, measurementReceiptSha256: "64aad4d2048deec06c69b6fa63b45949ba2d173e4db96e83f3a489ce76f7dfc9", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", codeSha256: "de1a937387588e9d8508aa922227a59c767b98f438250521a74034877a93a023", peakResidentKib: 1436764, elapsedSeconds: 102.07, measurementReceiptSha256: "6d475e4bfa9550f14d4fe3c3775b88c6e34e4062e2467ae8c63a716c3e6501d7", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", codeSha256: "5568c29e85eb7ebdc74fc33090ca2903c5eb622567d530d567e3af8911ceda4f", peakResidentKib: 500048, elapsedSeconds: 2.59, measurementReceiptSha256: "bec68cab07930051b76b788f4e34597b690d062639a208caf590f45a131b3ff7", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", codeSha256: "3fc433313305cea4199ab955a56627a2e81a817f77aa31830f40e62a102fe023", peakResidentKib: 412792, elapsedSeconds: 5.36, measurementReceiptSha256: "f813fc5d8aac1a940558d7f926acf675c540f449877c93fa3e1b44ed7499b703", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", codeSha256: "019dd3a4707962d4e99120fa89da64c535323321203b9ac9851108bee04c77f3", peakResidentKib: 594140, elapsedSeconds: 4.46, measurementReceiptSha256: "19dd93bcfb97de9646e9b9ea68fef49c8100585ac5b8453c94be9b3a2b1b926d", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.PortableHandoffConformance", codeSha256: "661eb08d5d485c62f84467bd9b112390f94cfc244d592ece10f65966f78e2606", peakResidentKib: 461216, elapsedSeconds: 1.06, measurementReceiptSha256: "5000c774554f712e5a4b04e362c85ff6af128b4887d4088aac6e18e025739254", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.EffectDataConformance", codeSha256: "b98f98367534e12136ed83b1fd4f59984d933688a00716882e22bf6c5fb50bf4", peakResidentKib: 462180, elapsedSeconds: 1.26, measurementReceiptSha256: "170deef7b61c49ecedd3d236c1ce0dba609d3d5060b5a4538123bddc5f61a040", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionSourceConformance", codeSha256: "4faf10119557694662d5b176f248e3a7e36e1209caa7f21bf84cbce5e976ae35", peakResidentKib: 1071680, elapsedSeconds: 5.91, measurementReceiptSha256: "f7416d6b110cc481de986e3aed204a9bce58a385a6a2b760dd6179b85df515df", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.TransactionSourceArmingConformance", codeSha256: "31849cee9998ea9df14f6d7a2b6852ad674c5876df9fc1f26c51e1ebd2e762e3", peakResidentKib: 1311516, elapsedSeconds: 22.83, measurementReceiptSha256: "e18ba4d6740c6537c06b9a9d4f65f5bb5b8c3040c2820d58b2af69082fdb761e", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", codeSha256: "7159655e84c28a3da8402ba615c78d95f205bb61f20c960c0c2dc7ece459fd1c", peakResidentKib: 460220, elapsedSeconds: 1.06, measurementReceiptSha256: "ad1a035221b5f62e3a76daa7d34e8425973b845d26c28e8c3e9ef222f1081d9a", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", codeSha256: "eb9d7b8f381af4782181c377f4350505141936548398b24af96b5bb50c493c45", peakResidentKib: 446840, elapsedSeconds: 0.96, measurementReceiptSha256: "532de65f0733245572edabf911a8824c73c009c9997cebf8618a78fbd4b44991", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", codeSha256: "d891c802d607f944d5a9e9db67781897c883eba704f8b4dd613c1264df76c476", peakResidentKib: 443956, elapsedSeconds: 0.96, measurementReceiptSha256: "5bca0ab8bd6cd02856f579b8838d3f8fb70bdb51a0855f2b850d8a27ebde7a4b", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", codeSha256: "be62ee5d7a0a99780d0168271862a13eec2845f28dedfaabc085757bf1874022", peakResidentKib: 435036, elapsedSeconds: 0.97, measurementReceiptSha256: "765088c89018917ca69dd54c6c080a276e4ae455ae9e9b03faada890b6176cce", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationConformance", codeSha256: "527f1eace404411f9ba78943cf2b27a305878068fc3f11f1c213888436b5d721", peakResidentKib: 571304, elapsedSeconds: 12.21, measurementReceiptSha256: "43ec9197b738da1812b327f5ca509b5ee40a3398f2bf2c9afe2e66b1ddcfcbba", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.TransactionRetentionConformance", codeSha256: "cc4a5cd6f0cf7224dd0003e9c21d70b6ecf713d43f7f4bf2d59064846cb0a158", peakResidentKib: 409896, elapsedSeconds: 0.86, measurementReceiptSha256: "cac3d35be67e912a9cb72a0de6f30df01b2b5fac605894d9ae2339ea3cb1c471", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", codeSha256: "8061a7afc102ed5f85ab2460be714aaba37ed0823728f2abb491bc6d82bd5abc", peakResidentKib: 444020, elapsedSeconds: 2.3, measurementReceiptSha256: "1f891d3528648eb459a6e1d010711acd917482be52d7925673b1f3f26f9a2085", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", codeSha256: "43dd8f8c6c2091ee28b156ff266ff701326ecc3758797d5032124b446df0b60a", peakResidentKib: 444196, elapsedSeconds: 0.95, measurementReceiptSha256: "729a44ac794fe4591f876ee6a534b587cf50351b710993a621069bc9fb299c0a", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", codeSha256: "ff57494b4ee3ec643f3e3fd1d2f39f90251c5c00e735c9a03af5397fb54fe3cd", peakResidentKib: 444548, elapsedSeconds: 0.96, measurementReceiptSha256: "72a24c4cb00836317afb2fdc4e97969258820b9e6c86e94c534df35e1c28be8a", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", codeSha256: "01f00f00b854d657642d19ee85313e664e75b0d69d018d5fd31d87732b78aa3a", peakResidentKib: 444152, elapsedSeconds: 1.92, measurementReceiptSha256: "e77224b4484f6dc4a51c137c3036ceb4094b1b4f4503f0bffffeb053fee310e8", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", codeSha256: "7b8165600c2c59c167139a7a020b4f1e5012adbd8abc247fd47ca6338691e7d9", peakResidentKib: 444460, elapsedSeconds: 0.96, measurementReceiptSha256: "6ae040f8bb065d8138ada5b7863d9ac14f3d0402f12d7c16ef2bec2dc8a0313b", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", codeSha256: "ed07c57af999c114bffba9a71489248b070c000389480478f0343c40f8c09ea5", peakResidentKib: 382016, elapsedSeconds: 0.57, measurementReceiptSha256: "baf62e54521f136171dfc912a5dacbb5b9573435dcafb6b10ff73b2ce7b206ca", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", codeSha256: "4f70773ef1a1e59693ffb356e6f1c7a0af4fa70c540046914965050e84f6656c", peakResidentKib: 451580, elapsedSeconds: 1.18, measurementReceiptSha256: "acd0ef729389798d0fe6769570d53848dcb0b2442c0f4f84eaf88f48f23787a8", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", codeSha256: "a2768c83df1edba9d13d872c32d1f4e1926c3d7ec6d52623990fbfae950ce048", peakResidentKib: 1016644, elapsedSeconds: 16.3, measurementReceiptSha256: "886ace303b9bdb3349f035137dec341a2da88fc5c545f797d0ea4b866442199a", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", codeSha256: "bf453308f4494dad1aa6e043c29aa75e8fd898724da4e8cb373aa1299c66bb82", peakResidentKib: 1216024, elapsedSeconds: 21.42, measurementReceiptSha256: "76bb69aca44030f95e899f0cb1b449bf561a6564aaa08f82c9df5f82dca05d19", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", codeSha256: "6ba74ca7ffd6bfd7b9da7b6ecef401161c8282dfb76da6ddf99befbeabf6e5f9", peakResidentKib: 815276, elapsedSeconds: 17.96, measurementReceiptSha256: "d51d650af63ddd9367e8ef3fb6f440327a30a17e32db27882cf92d9a4b1a485c", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.SnapshotInternalArmingSourceConformance", codeSha256: "445f13e2f05a1dffb10eecc74ddf6592a949856cdcef0be329fcbbd0f62e2729", peakResidentKib: 449716, elapsedSeconds: 1.05, measurementReceiptSha256: "45fd777c5f4481909ebea83c77006ef9d9d8316f7ba28dd38042422f75e5b8ea", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", codeSha256: "7400411a517c84a36923e59c40d32f79dddc7220d19d7a862af197dc3b1781f6", peakResidentKib: 454296, elapsedSeconds: 1.27, measurementReceiptSha256: "51869a30dacfa974623aa99bb2d87f28c75b225530c9675a2bf0f883f8384910", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", codeSha256: "82616e3ea5babb5f7a83d61fb19c6b524aa028d0f07c92bba9e3e4ed8a944dd8", peakResidentKib: 1807252, elapsedSeconds: 45.11, measurementReceiptSha256: "35654f58ec2754cedec4b63e3646f28df9bd2b6e560b2f236706c74a84eab4b3", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", codeSha256: "5315595418999550ebe06d9e2f459db5a1804e9a6aaebcfbb351d36e24a61220", peakResidentKib: 452776, elapsedSeconds: 3.96, measurementReceiptSha256: "45788fc4a90f7a2ca59d9bc285aa45e7eabfcaaa52691950d7b017c430e3c678", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", codeSha256: "594c06827c807aba4a00e3def860eddd0bbe91b193adb17fb3868c5035c032bf", peakResidentKib: 1055284, elapsedSeconds: 34.11, measurementReceiptSha256: "c2f3445fbb0886225ea38adabaa44ee0d4f6bc9b4e43d9581d5d6449b59b2ba5", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", codeSha256: "c1ad5fa14a9199abcab7e2a12b59e3b597058863c9a3ca64d56512a028fabf2f", peakResidentKib: 1710220, elapsedSeconds: 8.52, measurementReceiptSha256: "f65bd27fff7e591c0beca20e3062324d1bfe2e8aec125a6d4f44fe80a8256ad1", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", codeSha256: "6be598dc995480ec50ee1f1483ddf5ced0ab788a6321ed6d8894c41862c33f8c", peakResidentKib: 470944, elapsedSeconds: 1.16, measurementReceiptSha256: "5b48931d0c059b7646b887dccb376faf73e1d28c53ca1b91e31813307431af44", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", codeSha256: "756fe564d5e0c05304b15626fcd71b13bbc75fa9a0376be3c334a45469166011", peakResidentKib: 1198256, elapsedSeconds: 104.83, measurementReceiptSha256: "5c95e30172e022c10ab2d98530e798ba5bbe9e6bcc187ceacbc0df128446496e", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", codeSha256: "77f0386f2135105e2d4390eb21c1ffcb266da4c30c85e0394a80c179e9df3b8f", peakResidentKib: 852012, elapsedSeconds: 3.84, measurementReceiptSha256: "b9ff182467b9375c76a92818d68b627bc07bd2788a1cc4c78a9977fe7a139c4e", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", codeSha256: "062ce6ca30bf359462d83dff1dd72138e813054633d58d59cb79e5ee620c5f6f", peakResidentKib: 1574572, elapsedSeconds: 33.45, measurementReceiptSha256: "e72f0d6e46c1a605057f6990c947000c7d0653d25aa73d5326fcd891aa9d63cc", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", codeSha256: "e3c0ef15abe8712b7014f4cfcf9bca6dc82a728db7e0a444b6170c72f157ee2b", peakResidentKib: 442920, elapsedSeconds: 1.06, measurementReceiptSha256: "15828a9169239b48c195ed34e8a58525f6693601d52c515e2cb498589b7f2df8", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", codeSha256: "653f3e5cf2a6896d0f54ab5dd29b85a791d3efb0b833b5755e8a28091925b858", peakResidentKib: 425296, elapsedSeconds: 0.85, measurementReceiptSha256: "2dbf5564077726dceccccf06ef70f28b65965ece7aed60b37ad963f8fd09162c", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", codeSha256: "5979246ec970adaf92cd5116b13ccb368b850b5f8e86dd79a022ee333d2e5d0f", peakResidentKib: 411336, elapsedSeconds: 0.75, measurementReceiptSha256: "a7351d1af74b0bebb07a92e9394e12ee7b4ff6e611a04e2ef8bde82f8b04369f", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", codeSha256: "8aa14432541531b52a958b4808a21ac838f1067beb24b4c574231bbfd67437cc", peakResidentKib: 1479064, elapsedSeconds: 39.38, measurementReceiptSha256: "ee7db583c726b9f6822af5a0cb628d17a621ef5b5e3189049aa72cfda24fad09", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", codeSha256: "beb62aebec4bc888cadce86d6c6c650277a8095d46384fc1e5302a6c74557618", peakResidentKib: 1143240, elapsedSeconds: 14.81, measurementReceiptSha256: "f4888ccece74bcc586bfae6967fa1cab5d4260f04ba5ea6521c219d9dc83ddce", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", codeSha256: "ec2c887957b18719758a7953c58a08828a797f49e5fc29419bb4a501900479bc", peakResidentKib: 404376, elapsedSeconds: 5.91, measurementReceiptSha256: "7b7ee830fac9a91c87d11ab08afbaf71fbb550dbe0a41d337b30cfe60f20bdcd", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", codeSha256: "d132073aad8a06810d2a1ec954b6a33cc75043f3941b7afd16a0f2704c1e6df5", peakResidentKib: 462108, elapsedSeconds: 4.68, measurementReceiptSha256: "4c868898d3d564be731f6381893e66774adebf19fca7889b482f2b0f454d98c4", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", codeSha256: "794a03f0e539370cd0890cd36fec17ddb3059ee833f1c4e938c090bafaf81d81", peakResidentKib: 1304584, elapsedSeconds: 22.33, measurementReceiptSha256: "67b28a14a60e8af4bddb6f2fbd7a0cbcb20d2846abecf873d77febd6fcf63ed7", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", codeSha256: "9426019aae1b95cff35551b0c94a402a9e811e259321132193524bab006924ee", peakResidentKib: 409184, elapsedSeconds: 3.49, measurementReceiptSha256: "e72f6ed50169a8c3fffde75ee93fef678c5db13a2b8b635f8bc613683411cc03", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.MessageStartAdmissionConformance", codeSha256: "e672c845468ff6439ac4b1f14a8ebec40a7119d21ffef16cb57a70467b7d4906", peakResidentKib: 999328, elapsedSeconds: 8.78, measurementReceiptSha256: "31265059600c2f0906dea8a87f8af2ddddb12c51a31c35a87923b892d409f1ee", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.MessageStartClosureConformance", codeSha256: "caffc23cf1b97954d1b2cf9e3e15faba51e71070da0ed88da648df1510004f83", peakResidentKib: 874104, elapsedSeconds: 2.53, measurementReceiptSha256: "6bd12ae529a3b34237bb076196350f2010e260a767e305bbc014268211eabdb3", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.MessageStartIdentityConformance", codeSha256: "6edd4b65a812720b9fd9e55973cf0204b2d5cede72db43c390611611b53c9805", peakResidentKib: 880628, elapsedSeconds: 5.59, measurementReceiptSha256: "d6af19d826d1830bc7fa1c0bdb5a706b6f11696973f7a6e5c8c90863de62fc92", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.MessageStartScenarioConformance", codeSha256: "37b1651f0831b91cd0021a62da8911c08ab1a974de0295136f647a64dfdfc470", peakResidentKib: 1150744, elapsedSeconds: 4.31, measurementReceiptSha256: "7b9659c45126d21b87f5168c9a8968b24297d7f399d5cc68577706695099b581", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.MessageStartConformance", codeSha256: "b0af696a951c386d29f76b87630266e422632d878f337964abe74968c8f7215e", peakResidentKib: 439412, elapsedSeconds: 0.95, measurementReceiptSha256: "0de11f22047c0e740137f013adf45c01ab572f7a51ef4365c886ea61b896e668", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessagePayloadCatchConformance", codeSha256: "96b73b08d4fb9a217fc27658a37d2d73ecf1a562ca6ea88c7c8a6692c70ff735", peakResidentKib: 1397136, elapsedSeconds: 39.15, measurementReceiptSha256: "fdb61921762aea054faffde40883018822c2301b42392166c4b5cb536bfa9182", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.PortableMessagePayloadConformance", codeSha256: "d5841b478e3d4b2269c7ffe753e3e9aaf6a899931b238c67f267af14433990aa", peakResidentKib: 1213284, elapsedSeconds: 16.09, measurementReceiptSha256: "a8f0fa91ed4b8e6f754c7800c2a918afa70366d1b06b3f09218258f2e11b8073", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialMultiInstanceConformance", codeSha256: "e5d4cbac5fe57ba61b3f8594dca778cc88587d640516f56d9a235fd73b27191a", peakResidentKib: 435816, elapsedSeconds: 1.2, measurementReceiptSha256: "67bfbe81b0e557c8f24cabfda47adb1ddfd5595c1e663820b5b59d774fc4dff7", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgressConformance", codeSha256: "205bea0af2594a004c1b487b4f8653bacdada8c9f7ea2a459c30455f35cbebe3", peakResidentKib: 625172, elapsedSeconds: 4.8, measurementReceiptSha256: "6421246b0dd015b5ec4d6ab7749f7f6fc785b188f5c0fbd7a40cc6b9f5326fe7", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.SequentialMultiInstanceRuntimeConformance", codeSha256: "2fef9c6ad249fb6b632fedb9dadc1b79dc8e21601edc628c14d44415b7bd8d1b", peakResidentKib: 1096956, elapsedSeconds: 42.2, measurementReceiptSha256: "a3038140a17e4017db7e710915ec585f0925c6dc29f75db72c26e32825dba857", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.SequentialMultiInstanceRefusalConformance", codeSha256: "f3d518f374d95d9454a4d3d29deff279652de66dc8e421d73a7bae6dec5d1054", peakResidentKib: 1092928, elapsedSeconds: 20.14, measurementReceiptSha256: "4e0e233676f1d597383c25c8feadffa9fe7973f0c4cc5af62ec79639d4999a2b", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance", codeSha256: "540c73291aee3a99eec541af9257658e3de69e2356e622f22fd9594c77595fec", peakResidentKib: 629308, elapsedSeconds: 6.37, measurementReceiptSha256: "5339bed353017360eb3b4a72fd08a4e48a089d8161050fde3d1360c048f0e79f", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance", codeSha256: "73fce35b8406ec701aa255788ff009ba40244749fa186f8ce900b7a569207f60", peakResidentKib: 439892, elapsedSeconds: 11.98, measurementReceiptSha256: "33df23b8824218360d30bf6946895b61801bfdbc02e51317f1807ad1b738ae50", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", codeSha256: "a6919f4c1767257321eefe56c43ea013ec924c85e5231e91b5f7c1c4db0f11ab", peakResidentKib: 452304, elapsedSeconds: 2.21, measurementReceiptSha256: "91c56a3e3a17022b308a716b4d354d85be81534c2023702d7a333552b5c6ad6c", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", codeSha256: "b8a1faff58faef83dbd33ccd45d7c914174c540c147523db3526a4c5d4322d99", peakResidentKib: 1746104, elapsedSeconds: 27.96, measurementReceiptSha256: "416245da78cdc7d5b4597c2decccd8938f5f5cfdb6ff1a55900de5036d5a8224", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance", codeSha256: "fa0d31d8d611c6acd5f5042a049a7bf4e6f1bc70cbbb1b93c35b510163997fcc", peakResidentKib: 447220, elapsedSeconds: 0.96, measurementReceiptSha256: "432df3325efe2218aad8fe9f5d1e789cfa1bab637d262cff5fc7e392c3bd2cfd", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance", codeSha256: "8194e729a58c3e8e5d820516dd797518b8c60b19a4f812f73f18675652c2b590", peakResidentKib: 1564664, elapsedSeconds: 35.76, measurementReceiptSha256: "1fa986da2acefb41a02a788eaa79dc9ef83eedc6bb05a3cfd0b4e5762c98e359", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecyclePropagatedErrorConformance", codeSha256: "d21c68380dc93ee71e763bdded8738b5157255257120d2b7f3b56a2147d47d86", peakResidentKib: 447464, elapsedSeconds: 1.06, measurementReceiptSha256: "4e2b1a5181163e6039c7dc033f6a1adcceb73e800d512846e77bc6fae682317e", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance", codeSha256: "f6493839e2a785ce628e3b110c167d86db5d1df7af3001f9f296577db3804415", peakResidentKib: 1296304, elapsedSeconds: 21.43, measurementReceiptSha256: "1cc9a8c30df1981f710ce1e882d1d2d6ba215812ecb16c85cc73d1559aac79b6", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance", codeSha256: "5ed192f9a738a2aa8c7016d62f54badb3b0241a0d684ca83462a77511dd92c4f", peakResidentKib: 550056, elapsedSeconds: 1.8, measurementReceiptSha256: "00ad83618fe7131c17fbd85f5375d12293422b700aa2556c8e1bfbdbe11a8e5e", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.RuntimeStateWellFormedConformance", codeSha256: "fdb53f579abee3fd939596d98f058f42afcafc54cc0cb852f913009a00f89be0", peakResidentKib: 435568, elapsedSeconds: 1.59, measurementReceiptSha256: "5b7c929ec9350b8429f9b0a0a3e01ea5a89c3de5ee4e422df17a40132ac7457b", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance", codeSha256: "f0582ca1d3166cf0989c286f6c7141bc18bc0a1c3b0e8029147ee382327a2410", peakResidentKib: 450388, elapsedSeconds: 3.26, measurementReceiptSha256: "1023b91fa70b739474a18d78a33d0af08fee8f0f07e56871bc4ab3c331d7cff3", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", codeSha256: "d5b2a094bbaa47c72c994a898cf71bc7ab82d6fe1db4a585f307ab4ddcbb5c6d", peakResidentKib: 443088, elapsedSeconds: 2.81, measurementReceiptSha256: "4caa2bf4bb96a16d1d688b702ad354c2f5b380c98150b51d95d6156b859ba56e", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", codeSha256: "6329f1d70ca7d6bde13910b2034839ffc82f50003e1edab460999cb3711a97dc", peakResidentKib: 720936, elapsedSeconds: 13.07, measurementReceiptSha256: "f0f11ad5344cbf965941a84e17c94afa532bc8149794b6978b70a1ba2d040097", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CallActivityConformance", codeSha256: "adf66b9546cc1ff836817834f58efe3eca89942802360b62c0985b997bded622", peakResidentKib: 470132, elapsedSeconds: 1.9, measurementReceiptSha256: "99271b8bdc2a1d959140b2ded96c9511c85b32a76c9a4bbd254207699ea819e2", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CallActivityPairingConformance", codeSha256: "116f713a7533e122d3b6bdc982a7867380d894c33d7925548e264029575e251b", peakResidentKib: 452340, elapsedSeconds: 3.14, measurementReceiptSha256: "cc2211f688515d8149f43b415886fa95bb4626db98717766d70a4ab5ffcbbe04", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", codeSha256: "4443ab4df5d7c684d634fe60bf6584d817ba9d192507d947d51e68fc56dd4a37", peakResidentKib: 1417980, elapsedSeconds: 76.29, measurementReceiptSha256: "986eb39a835873f9cff2392cb1f434e89b57207b9611f3551614e7b641da5c57", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.TimerStartConformance", codeSha256: "94a8a09df3b754501c998236afe016a68ca2151aaa78829242e0c0543f4214e1", peakResidentKib: 1127280, elapsedSeconds: 18.16, measurementReceiptSha256: "9a671e4bc091605ae4fab25af83973c26fef0512ec61bbe5696dac4129cb0d4a", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", codeSha256: "c134faa0cfc393e271c50be389c63078756a8a6df7c8497e0dcbbed2207a2652", peakResidentKib: 1489984, elapsedSeconds: 70.79, measurementReceiptSha256: "62b0ea7a83bc76b6f26ba707128ec4e25a624440b2c3d96a99990edbff5ebc42", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.RuntimeStateActivityConformance", codeSha256: "d5967e51d77067d6a36a9ffbfe32d7856dfb46fffbf17e38274ca11a894dcaec", peakResidentKib: 414296, elapsedSeconds: 4.1, measurementReceiptSha256: "1dd8ff081f0bc8a11ddb7184e549dbac2e0c7e976f6b8af430a15ead9e2c7d12", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", codeSha256: "fa1e7fd9420629b492f7cccdaccaa6b6babe842ae7626c7c8b6d5d95411e0727", peakResidentKib: 1027864, elapsedSeconds: 7.0, measurementReceiptSha256: "21098b0a09fab10c079477c1f4aa104e469b562aa7729e7ef4c0c104555e3c13", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", codeSha256: "9f40f19cf430d22e90e8ecaef8609516aa509013d0a8224089acf54db49470b8", peakResidentKib: 861812, elapsedSeconds: 32.9, measurementReceiptSha256: "ab1bf6f47877c6c9e3d7f23a54b463e49f95346a1a512236c4f58b6ab89053cb", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.ScopeCancellationConformance", codeSha256: "55ecbfd139af80f3ef0b5f709c27fd7743e04c5e9dd90422adea173a8c1c2c9e", peakResidentKib: 388304, elapsedSeconds: 2.15, measurementReceiptSha256: "0cb0e0f9a3b1dc3befd03216206b6330d072846a2539cae8407feb870367466c", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ScopeCompletionConformance", codeSha256: "1134ac82c48b8348933559b2b3fac383e544af085b97db3ed35ef7782af8abc4", peakResidentKib: 395744, elapsedSeconds: 2.32, measurementReceiptSha256: "77bbb35f4359898a7ac6426957fb5bc8db850f39a8c5f1e17432626b8cbba21c", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateControllerConformance", codeSha256: "1741436817d2dad416adf110389eaeb63fba89b3a1dad1620c4ab643505cb2e1", peakResidentKib: 1057640, elapsedSeconds: 32.28, measurementReceiptSha256: "3847059f59ab0cef12d86456f7fb76424f4b3dcd0f3260348687b7f672099842", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", codeSha256: "40734ea3e99b8ee2dbd506e1a37da1b57dd676379d17115cad057d095e1ced93", peakResidentKib: 437940, elapsedSeconds: 1.4, measurementReceiptSha256: "cbafc94e92b13bff94f602bf03e3feb247b26e6b80175a599a7aac85ba66a3d7", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", codeSha256: "37b5873cd45e5ca155a5d1cd0d0d5fb200294bfb6d1a9fb5c45aadba27095f93", peakResidentKib: 561804, elapsedSeconds: 6.41, measurementReceiptSha256: "b0253d34ffd881a76a235dd14027ec0aafe55cca8adc8e1a9e95074da39ce0b8", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", codeSha256: "d9db6ebe882e732ee332abb5c88e19638783fe4534e0188ff663b110fbfa2cdf", peakResidentKib: 444672, elapsedSeconds: 5.06, measurementReceiptSha256: "eaf7ce8f4d629a7af1c33d57726d34da7713e4d4d6f463170f8dd47ca9a20916", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", codeSha256: "f0857d0dc0571c392228b55a97331a8aab1630846fe940a0b9727d0cb36ecbc2", peakResidentKib: 1324944, elapsedSeconds: 10.6, measurementReceiptSha256: "68bd1701e01990e43c53649732fc8a84d6b566478007a3a26525f52e1e6d11a4", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.SemanticProcessAdmissionConformance", codeSha256: "49b040c155a516e23772c73a16e49dcd4eb1d43ab9f30f3de7e0f397d90b6f5d", peakResidentKib: 645136, elapsedSeconds: 5.13, measurementReceiptSha256: "389b8354db19a57ada8b8651f1ee4fb0c94fb643793b0bc065c920bc82128d98", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.EventBasedGatewayConformance", codeSha256: "f3592f3128d167bb487017a75163e7629d70a3e5b79ff2b2a89c8c9a1cf88c83", peakResidentKib: 1212544, elapsedSeconds: 9.63, measurementReceiptSha256: "d4a899a9cc07001e8e3a4f042015218b9d59b085a1cda6a4c5d0c098919cd1fc", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", codeSha256: "39158c9f3cf696aee9b1f0d2aef0061d6c7d7fc3e3f6c3efdd04a7cdd72cc9ad", peakResidentKib: 461296, elapsedSeconds: 1.28, measurementReceiptSha256: "7fcc6081ef0ba92512a6e63dd2b05aff746e6a2175322912d9507b8cb014376b", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", codeSha256: "c6ac30b197acf582a65d4f696061a9d9edf29a2f20c928fe302880d01fbf43d3", peakResidentKib: 1294124, elapsedSeconds: 13.59, measurementReceiptSha256: "4a63e92b99376b23559a00454c04b07c861573b2b7db63aa59b1c5913888696e", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", codeSha256: "d5ef5efe649f17e5c5ac73d1db62c832802a21f3d5105b70a689c5e75c24db81", peakResidentKib: 1326048, elapsedSeconds: 16.39, measurementReceiptSha256: "54492a7929220c7dc20dac6c8dc266f9169b153d7ae9011fd5501da7b464cce1", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", codeSha256: "2d6362da3855d44b3565ae733536acdb7c2eb8b4d12b247014f7bd868ad4212d", peakResidentKib: 1144088, elapsedSeconds: 5.73, measurementReceiptSha256: "375c4882ba86cf2a419e74367edca3f30130cf5c6fad57bba076bff686779f71", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TerminateEndEventConformance", codeSha256: "c8539d07d28971ac54bcc8f5813d3864eb05c34971b6858c2c70d0da668b3341", peakResidentKib: 714496, elapsedSeconds: 3.8, measurementReceiptSha256: "7edb65d03e67e3064ed6f399ea90fec8c7e76e86ea62d3af52dcd694b76a2f8c", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.RegionalRemovalOwnerCoverageConformance", codeSha256: "02524c990ad01e7abc97a55f78ec6378da3c1d8c039997e43bbd92df29159888", peakResidentKib: 1061972, elapsedSeconds: 16.35, measurementReceiptSha256: "254119be13f540546a39bd3050af59359e40d0d2f17f43fe02906743cf9c30c4", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.SemanticProcessConformance", codeSha256: "a86eafb825d085c3a038ce2a7892e4fa56e36cd93df24c4cbc14fa28b32954c3", peakResidentKib: 966352, elapsedSeconds: 12.8, measurementReceiptSha256: "4e5a08ab81bfefde3513d771b68398f980831f3e5dbaa70c34ebf91806616000", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", codeSha256: "1b555b737e795d253bf54df1c45a124295dc9552f4c302eb5ba72ed64db2e28e", peakResidentKib: 914880, elapsedSeconds: 37.99, measurementReceiptSha256: "41acf635b6dee9c2f0b8b9aa59cf6584d6ac5455362b1e5192999eb09e36c259", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", codeSha256: "885e286e87112937d64cb0a736df7699f46fd7ab5d7e507395b053dccc8b6155", peakResidentKib: 1111216, elapsedSeconds: 11.15, measurementReceiptSha256: "29da9dd81ffa2c987ebd40fb4a7912b5c64d59b9fa1f04347f60d9810c621811", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.ActivityDataInputConformance", codeSha256: "ada11a3f5d7e8817da4ffeb96380782acb1375cc4a934b4745d46e0e1fafcd08", peakResidentKib: 901888, elapsedSeconds: 29.56, measurementReceiptSha256: "b43a3dc03223a5a59e75c2b7a258ae0bb791c4db8737f1447212fc292cb150f1", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", codeSha256: "40887b97c1fb9ad85f2592e3cc1c368142c56c9fdb74ee94706618f396a2a073", peakResidentKib: 1065332, elapsedSeconds: 14.36, measurementReceiptSha256: "c6affa56d7421ce2c1bb24c4ff8ab6316cb82746848c5de94580ef170e8fa177", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.MappedSuccessConformance", codeSha256: "a5be810357dc2620a048dc00e7342033fa3764c4af85d8263ccce241947703ce", peakResidentKib: 1263728, elapsedSeconds: 17.95, measurementReceiptSha256: "171b1b263c79576518598f19132eb3df9cce825c9a49f077acb9279c44aa2c50", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InclusiveGatewayConformance", codeSha256: "cc1efb623816df2541ca4ab8bca6a73636c03c9e644a2862ba092b4531388ca8", peakResidentKib: 1340980, elapsedSeconds: 15.06, measurementReceiptSha256: "a67926630c35b6d1ace0d3f3a45a0717474940a9befe0012ff3f929fe613ec8f", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", codeSha256: "df6c6fc2233b5bf3ca9ad29cc20686fe7dfaf665bde4fef697ed1fc09c40eb6c", peakResidentKib: 563828, elapsedSeconds: 6.53, measurementReceiptSha256: "a10a86dfff52a3096e62c12cd12441c1dcf9649b0955913ae5b00c847f2e84ea", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", codeSha256: "6941a03eed25cf0a8acea7265a744eb483b49302b8f4081f16731e808916b348", peakResidentKib: 896324, elapsedSeconds: 19.16, measurementReceiptSha256: "b706842baa946c7c99083db497b7e979c1e9057f7e4a8be008381433197f75ea", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", codeSha256: "fd6a467855d64ff0eac69b6421113a6f1ce36475b33122304242ad3b25da8c1b", peakResidentKib: 1625268, elapsedSeconds: 20.71, measurementReceiptSha256: "6a4b0f0fc56ebf2682ab5b3aa697f22239abcb501057d4daeafface6f868a00d", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.InternalCommutationConformance", codeSha256: "1313206822089bfe49ae3f582557fbf7b7067513aa07f868c6382139df61b18b", peakResidentKib: 1072272, elapsedSeconds: 14.34, measurementReceiptSha256: "57f18e73862812a6ca4f93d37f7cc15cc72a1fb07b8c332299b3e8895118c640", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", codeSha256: "ec3a0555c995b7a1aae780a69d3919f4408be0c6efdbe437364fb9ea90fd76ec", peakResidentKib: 1053892, elapsedSeconds: 17.4, measurementReceiptSha256: "d14e970d227375dc741081d1350adecfb3225daa1833f6aed1c178809886d033", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", codeSha256: "95550f4a850eef08a151bbcd1c12e23776ba10427a7473b3eb5ac9d679d901de", peakResidentKib: 1573444, elapsedSeconds: 32.74, measurementReceiptSha256: "cc6042087eeae612b4ec1e084128f4481fcefdb0860ef69beef55aa567af2aa1", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationSourceJsonConformance", codeSha256: "74b5622387a933db9b25b7378f85789592a0c7d501c5b60054200c4c2f1da165", peakResidentKib: 452656, elapsedSeconds: 1.05, measurementReceiptSha256: "2568de9a6e159264cdd752004542d6ee26e877e8f3cbd794180ddc559441beee", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationSourceCompatibilityConformance", codeSha256: "a580e8441d0d0834f5102ba2b18d387973e864ce526fe021edbf3258dce6bc80", peakResidentKib: 455724, elapsedSeconds: 1.07, measurementReceiptSha256: "e158d47018a08fb2c090334d9931368897d37dcde111aceb24c5e69a88237468", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationSourceBindingReferenceConformance", codeSha256: "0a4002a12510d9eb26d97ea28ca8e8ab5dba568b3a64d84ed08a6be01ef6be7c", peakResidentKib: 445764, elapsedSeconds: 4.92, measurementReceiptSha256: "8169b70d05991987ff50082fce8f2e79301eafd03063c52092b6163537ec2d6f", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationSourceBindingTriggerConformance", codeSha256: "70756c6cca9fc3537136c7837fd017c4781b3ad8b09e4575f3d6d5e51fdc268a", peakResidentKib: 442996, elapsedSeconds: 5.84, measurementReceiptSha256: "779488ef51da0312d0a4c443d86c3a8750fd4a6ae9c677f0885e859b647b4b43", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationSourceBindingStorageLimitConformance", codeSha256: "aded7de69ecc226ee09984d425ae39b26730d3d713fb6b007e3b67b934e9c278", peakResidentKib: 445828, elapsedSeconds: 1.9, measurementReceiptSha256: "fea020a84bf6a740fa206cf04d27af212fcd3a7f39e486d0c5358d3cf8d855a7", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationSourceBindingExecutionLimitConformance", codeSha256: "82f85ecec2fbeb2f76140aa0f505c48b90e7b2af76945c5f7da1ec4f69d9ddcf", peakResidentKib: 445844, elapsedSeconds: 3.37, measurementReceiptSha256: "2485ffe663fed843e4df976c07bdec65caf43b410dae36f4d1a952d6a7cfdffc", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationSourceBindingValidProgramConformance", codeSha256: "1fac34f34dfd69b7de83d4692aeb3d4e37a49b5f6adfe2f910cf26fbc25ae318", peakResidentKib: 443036, elapsedSeconds: 7.04, measurementReceiptSha256: "a5c1a775aece707f5549b42f74adc5bf8eee8b811ff51a3240392b81baf570b5", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationSourceBindingConformance", codeSha256: "6e61bd0d56099798a2a6e133dc979cb1f9666f5f67f793007a3fd882356cfd4f", peakResidentKib: 439800, elapsedSeconds: 1.59, measurementReceiptSha256: "0fc5c18f64554438bb9c72b0bce46cc7fe41efb7d647223020d9eab1cb6a7459", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceLoweringConformance", codeSha256: "2cab2365b258a878254811a973d3c4ba42b549d9c32b2d9cb4749354af215b3a", peakResidentKib: 438112, elapsedSeconds: 0.96, measurementReceiptSha256: "2031b04eab275cb193815500f6f3922e04c8ae20efa8d8eec507e02d4cd9f37e", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance", codeSha256: "7086371cc4fccafc914ff8aadc9cff87d26865ef039edf71c14d2fb0ba2163fb", peakResidentKib: 407320, elapsedSeconds: 0.66, measurementReceiptSha256: "a0adf7145b2e0baa1ddd42882d224c0a4b2e396363c481c89c296acf3201973f", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CompensationTriggerHandlerProgramContractConformance", codeSha256: "a7505f7f609dcd120f90dc04f883f75f09bf2d7fa240ac80846192099c167547", peakResidentKib: 462848, elapsedSeconds: 1.06, measurementReceiptSha256: "295e4fdac82595457db85472f191977b2b4591be82647ca39e36b45f48927213", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance", codeSha256: "c0b72c3f9ee92d6359e11d11e27bd86ec46e401f7f68a00b7211e1c8bb591f7f", peakResidentKib: 477972, elapsedSeconds: 1.16, measurementReceiptSha256: "7ad932e0bb7c7ac289123dc1dd9f417c20423cbc37634a1dcb4f14739f0883ca", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeConformance", codeSha256: "0f2844ab3e31969ddf1bed1b5afa27a0197ecc2db0a86287ef9dae031e4fc012", peakResidentKib: 397820, elapsedSeconds: 0.66, measurementReceiptSha256: "bbb2e11b53e3c5af4082cedc3a5b79f8251abbe9ca2b340c54e0de0ba08c75ee", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance", codeSha256: "c81359dbc4293d757b1ea4059662948676fb1bb31c0a33ca29353cee6f1de34e", peakResidentKib: 894220, elapsedSeconds: 21.49, measurementReceiptSha256: "3d7ef7d8cd8669048ab98f2210b672da4ac40c3a4ab17d594dd6671b7d42b385", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", codeSha256: "7bf50e8e3de2544c2cace3f85508b7f8d891412d6d77b5d2b223bc195e38c0e5", peakResidentKib: 1298716, elapsedSeconds: 41.44, measurementReceiptSha256: "0ddd123941302e35367c8ffc2ed209db0ea77b28e5ebbd2b4b7567b0806eefbc", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance", codeSha256: "6c9c8704266c9bdb438900a0efdf26e02e3b66da9a34e69f0f734412261a2cc2", peakResidentKib: 424784, elapsedSeconds: 0.78, measurementReceiptSha256: "089eb734140439a1caa41d8c1df681bf7b2491f973ad8428666234411186d6bb", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationActivityRetentionProducerConformance", codeSha256: "aef065f5f94abd80740463dc5ce16b500e0c23dbd51cd662d5ed3ab151b56d3c", peakResidentKib: 688228, elapsedSeconds: 23.12, measurementReceiptSha256: "c0e7a46c99457db4d97041589821fcbbd0f001b6950450fa9a978261a07cdc82", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.CompensationActivityRetentionConformance", codeSha256: "6c4efdacee06a69120d47a85b4730eae81c99e416f76e71affbd1e69569f9977", peakResidentKib: 778660, elapsedSeconds: 6.05, measurementReceiptSha256: "dc27055d3c73d7abb9d6eaca70cf070dce4f5976df73d117659d1f278572a1e9", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.UserTaskMetadataConformance", codeSha256: "009792ff659b481792a5098297969bcd13cf37a08161132469c5ab5e3774480f", peakResidentKib: 1109372, elapsedSeconds: 21.18, measurementReceiptSha256: "d94d12b9d70ede8d7e4ef68f6c1a4a24eca8cf1232a9b4cda12f47044c2b7201", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", codeSha256: "412c4ffaeb2fbfb4db5efd0f5abb44a6ba277acea1460eb7fb07b12f1f8d0700", peakResidentKib: 826992, elapsedSeconds: 6.22, measurementReceiptSha256: "9595376c54029d529ca871dc5e342380640bde555c13be7a7c9d57a2dbc674cb", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", codeSha256: "8d36c2e2d0b2a4d453c070dac0f4fb5aded4d3e9eca02748a60b97f32586d352", peakResidentKib: 541480, elapsedSeconds: 4.48, measurementReceiptSha256: "2a82ac34e5030e28aa27360248b9a3932a7f62e7e5841a4544a196a5113e4c6e", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", codeSha256: "7df21acc491276194d71668f5d8524684fc021279a0ee589f4b20901d0663b64", peakResidentKib: 825396, elapsedSeconds: 3.22, measurementReceiptSha256: "5017501eea8bd58f55ac2ab165cd095991dc7244ca0080088d4812e0462d0457", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", codeSha256: "bb67e24ec34a60f2f138e35f9058fa6e858a88cc85347cf612a4b0c90d0082ed", peakResidentKib: 1143484, elapsedSeconds: 12.22, measurementReceiptSha256: "e78f72efdcbd3f38a2be8c49c9e6218bb1b0f24a856663ef3f9aa269f8590d22", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityDataOutputConformance", codeSha256: "8a982641261d79b7a1d7003a966dd4ba9ecfe2ccdbb16d81faa7cec051fb508b", peakResidentKib: 1133132, elapsedSeconds: 23.72, measurementReceiptSha256: "abaa7b2c4e51075c671054dc12a6a3b3175b8b86451ebd386cee8851a3232903", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ReceiveTaskConformance", codeSha256: "ff2ded6d68849d1878cc3483ca34d00acf83187c65a56b6de847784b3be4390e", peakResidentKib: 1186004, elapsedSeconds: 8.97, measurementReceiptSha256: "1b7b96323f8b202070941b4f11ad950f2b4014de10de3f1bcf6ab27e7e239454", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", codeSha256: "61032020e57231199b97e6b5f53b0e218a966b7fde1e5a2b8c9ed8d8d9a4fcd4", peakResidentKib: 448172, elapsedSeconds: 2.81, measurementReceiptSha256: "67d0e9d80e3707fff038f285e3b1cf7007448fd851eefd4d19cce174cd39b65e", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", codeSha256: "c9a06fa16bb018968e5585b23c876b01e19e6e985ad7c2b684ff0cce891a871b", peakResidentKib: 452684, elapsedSeconds: 8.6, measurementReceiptSha256: "3db0cd5fe310814229e0036512b401ffb03cf26fc3e3435fb21c61b567b5ca48", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotConformance", codeSha256: "02f8fdecb39ce9ff456cec5469944b7dca7a7d2a8881720b5de85a583e07a057", peakResidentKib: 463088, elapsedSeconds: 1.05, measurementReceiptSha256: "3e23ea379da2be8743126fc072ccbba79bdeabaa5d85b3d2af467b03652c23a0", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance", codeSha256: "13d7525827350358743e99be7b8c433fbff0e929425dad089076b8f3a90ddb26", peakResidentKib: 453188, elapsedSeconds: 1.07, measurementReceiptSha256: "d3080298aa75616f0030a842770fa878dad69cf4588acd8ebbb32c8e7e259db4", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance", codeSha256: "47eebc0fd0e1ce7f0f7ae02976406583d5e2bc04341dff42aca67bb3b16ad654", peakResidentKib: 457204, elapsedSeconds: 1.07, measurementReceiptSha256: "f7c358f7d3d5a3e4547d603fd6451d1493e992cfaa14a0343b2d4cb744e207fe", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance", codeSha256: "3b1911cd2690de747eee8c3331e1d4df40416cd1be3dc1f622c54f15a64fa874", peakResidentKib: 461596, elapsedSeconds: 1.6, measurementReceiptSha256: "ca09d01fc9c8b184b1964f2182eb2fdd73ab6dea84023e03cbb5d09a14e323dc", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance", codeSha256: "72262063b1468257ce8def92ac5954bab3cc26d1cbfcfcf5577105c536274da0", peakResidentKib: 446936, elapsedSeconds: 1.06, measurementReceiptSha256: "01dce3e0b61c64cd3f157f8447ff83a4148d9c873a75ec5fbaaf6c8047c764a1", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance", codeSha256: "d2330d7324ff28cd051f47b723e05ea7824459cd8daf8c6c0ce314db178374fc", peakResidentKib: 438048, elapsedSeconds: 1.06, measurementReceiptSha256: "25c52de80da4382e06180af7b4f58260bd2dc6942c638681b8e63b70f5aed553", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.UserTaskInteractionConformance", codeSha256: "2ba71805d0e553846d8a9e879f3bf0565bba09fff0107df7edfdc401830bfa0c", peakResidentKib: 848896, elapsedSeconds: 8.39, measurementReceiptSha256: "26d47973c64472dd7978033bc59775b577c21f5193f055579e657c87e438d6a9", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", codeSha256: "25021a5612fdf408935f996e037761dcdf3c52daaa70b7fa2f7dc368dfb2b1ca", peakResidentKib: 463796, elapsedSeconds: 1.16, measurementReceiptSha256: "ed59ea16afb89b921e0b7ede6d9013f0b3854e0bf90227fdae4ad1922fbc5fc5", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", codeSha256: "2304ae32d3cfd33903da55e006a16c136d34c4fa5ce292ed8330517ba6deba27", peakResidentKib: 1159768, elapsedSeconds: 15.67, measurementReceiptSha256: "de09d02428973a6272c7a6e4544aabd5744601b27ad145d9e24c71ba5464009d", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", codeSha256: "23f1cfcbd2bee593a25f6f4d1510d3977df21ba41ec0b082208a536bda6d4c65", peakResidentKib: 808924, elapsedSeconds: 10.84, measurementReceiptSha256: "0f8c7134d01cf5cc2bb55f02c0cdd736dcfa23a773653cf60b79326bc4b8b1f9", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", codeSha256: "17d8c642ddc03d3f571e7fd03e5c0ff4dfc63784853f0775295e7ebf56602f7f", peakResidentKib: 449416, elapsedSeconds: 4.57, measurementReceiptSha256: "27535b36ec6d9143c8590983e9c24485f354ecfa741922a313d55ac093f483b2", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", codeSha256: "e72dfd983cb5e2e20141f407e20e5ab7e204951ad0538634670a815f2b3a99b3", peakResidentKib: 1289868, elapsedSeconds: 23.84, measurementReceiptSha256: "4d2336903f88805a6a5f2ebab37914dc426de2560fe579baaf90884db18e48d2", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.ActivityBoundaryMessageConformance", codeSha256: "6f21115cfcad5b66fc37861b760bf4144578a909db827ae6309f2c36e0de5aad", peakResidentKib: 1255348, elapsedSeconds: 36.43, measurementReceiptSha256: "360ad3138cd7c384df3f6b5e88d9b2646d0671b802cebd7f9dbe016ac1bfa0a2", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", codeSha256: "863a51494ced005835df9e6bbc7002ad0985ad02cbfa6a86289708d181da89bd", peakResidentKib: 950040, elapsedSeconds: 17.51, measurementReceiptSha256: "8561069a4aad43ad9265fd92799dea6b5e9b7828583b4a338c67089db588e25b", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", codeSha256: "f4e82dae98d1bfd302feefa3335ed9a84a0679559baaa3003ad35f1e20b7b520", peakResidentKib: 927472, elapsedSeconds: 9.15, measurementReceiptSha256: "c222426c90970f09887c1207dc37a010d892e7d674cfd05364d74e1b723fca05", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", codeSha256: "e981fa8605862e333d2524e66a4c71a8d564b44160f41226e585a215be716309", peakResidentKib: 445008, elapsedSeconds: 2.42, measurementReceiptSha256: "99df437a986cc86468ad05e7518cec7319fad71b369960685c3a3070c24e998f", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.StructuredHumanWorkConformance", codeSha256: "8d94b3a2967c17bb63c4d4fa034d47ac31c6b1a4134c87a7b7e68e7f6cd27cb5", peakResidentKib: 901388, elapsedSeconds: 5.06, measurementReceiptSha256: "a7a555643fb262a514114dc35141fcbc27a6b34c06e7b9e88817a5e49c295556", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", codeSha256: "bdd53d77b79dfbe65d1c6e4c646f8513b1555b12daf84c467d25c3a80980275e", peakResidentKib: 784764, elapsedSeconds: 3.03, measurementReceiptSha256: "0a258f251b7c59fe9d02e66831fc60e72b8cbf935400e3d3ad44397a2560259e", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ProcessStartDataConformance", codeSha256: "0e70a65b0c50acc60cc1baba5ec4a6af0efa3cb2e9d37eed0f8125249e47b605", peakResidentKib: 565108, elapsedSeconds: 5.39, measurementReceiptSha256: "91c3c6ea70631961979ca1d977bcdda2c38d9589790ad4c369bf2b14d2d1603a", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ParallelMultiInstanceConformance", codeSha256: "cb3a7d23f012aa63e150a5051f7e1fc1127ba9c6cdaf651ec3b27b300e551035", peakResidentKib: 1081884, elapsedSeconds: 13.5, measurementReceiptSha256: "c29ef596e2ff9a534247403fdc761ad70eb7c4c9dc69fe3cc1c3105c61824c51", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", codeSha256: "c7a6d46204ba6a41096cfc940b5045fbbf5044cee18d9c5a54628143c9bc9b7f", peakResidentKib: 493740, elapsedSeconds: 6.18, measurementReceiptSha256: "cb69828a642fc9499049eb503f36a833ee334a675fbca75c11e409bfece188c1", measuredAtCommit: "d83a0fd01a7199d5462ae2cfcfdc1d2b3e94d0b4" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", codeSha256: "2889c53a6d89f92ca1dce2c340b71faf1609b5aefbec083772c56594a5bfd89d", peakResidentKib: 892744, elapsedSeconds: 4.95, measurementReceiptSha256: "750ce4187a797fd65980f4174cdd3beddcf8906a42fa459cebf88e1417d603c8", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", codeSha256: "1774b19e7fed07c1237835e2796b6a6c61971458d54fa824110204195c9b58d1", peakResidentKib: 568248, elapsedSeconds: 5.05, measurementReceiptSha256: "e4d6d2b7b44bbb60af0358175cfc2e59504de5ef53fe005cf31dd37e7207236e", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", codeSha256: "c370d0db3af3ab24c44895563259721b8d1c7ee8a98807390b2cc0bdbdd3137b", peakResidentKib: 541224, elapsedSeconds: 2.9, measurementReceiptSha256: "04005af0ec68cd67f315dacd8be9c42184e597536d987450840526a0fafeb012", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    { module: "BpmnSemantics.SemanticProcessJsonConformance", codeSha256: "b20887f8df2c44f857093329ad7e9406276c480eb189cb4003a50188d73cee68", peakResidentKib: 492684, elapsedSeconds: 2.68, measurementReceiptSha256: "996d53753b214758d6473c63a3564dddb25e4262e3c1c8ed4e3e6d9ea5ddd59c", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance", codeSha256: "f377566a31e838767ce74618cfa801cd75b093a3b98d085db077d918240217e7",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", codeSha256: "0540e5136548b051a35af420639fafb2afc2e824123c5d7fa3d0b7619c33392c", peakResidentKib: 451308, elapsedSeconds: 1.29, measurementReceiptSha256: "e82c0f2c8b2c594614d79554bf9f3f0057e756f95ace55ffc12cc33b659654f9", measuredAtCommit: "ee950a243b9cb65d845f29784c78674fa7d04ac8" },
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
