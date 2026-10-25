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
    { module: "BpmnSemantics.SequentialScopeGraphConformance", codeSha256: "dd30c9435b4aa4dba3c7d595691d8ab04679a130c4a2dabe906c09dc2ad195d7", peakResidentKib: 1494136, elapsedSeconds: 82.08, measurementReceiptSha256: "3414e91b1618169ace4aa5f5245ae7ea8252d127dc68d11f1b1e96aab770c5fa", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", codeSha256: "89a7f26f62184f968eaa7b1f113a35459c6595ad1ea238dc1f8704fbd2d8a66d", peakResidentKib: 357268, elapsedSeconds: 0.88, measurementReceiptSha256: "f362ecb9dcc3293b467d5c749f0ee5ad6b3d374fbf6b8d76ef21d4996502e1b3", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.NestedScopeDataConformance", codeSha256: "d69a7b32b8bd21a2a418df2bc52bb287eed00fba90e123ef33006c771b47543e", peakResidentKib: 460356, elapsedSeconds: 1.68, measurementReceiptSha256: "a40e79610d64268ff0eadab954c916449e0701e95e1e4d20cc26401f57bb2810", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CallVariableMappingConformance", codeSha256: "8a54319010f77209be230af20e5394265a3c050ff5ac4802ebef0151484a538d", peakResidentKib: 470372, elapsedSeconds: 1.26, measurementReceiptSha256: "ca750f6797390ead45a5b539b39f7aa237b32169193987605771c022998bdbf0", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.NestedScopeControlConformance", codeSha256: "96d6cba8814e9be9190c685f8fd7bd622605f278fc35bca8e111d3413af5ad93", peakResidentKib: 463704, elapsedSeconds: 1.26, measurementReceiptSha256: "6941b8b4da4c90a8691a51d472ae1813a0c58d85d6e37d38b8b5844d11bb80cf", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsAdmissionConformance", codeSha256: "016bd9b6b70628224004fe61f7c819f0e417d75749c6efa921c4825ba49d9e74", peakResidentKib: 468140, elapsedSeconds: 1.05, measurementReceiptSha256: "71fb9417629b6433b4e668e1521387717a0ce4bd9e824546ea52ec3e74c96ba4", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsConformance", codeSha256: "71c27dcca07d9a623012670c5a53d32fb98f8c6c5444ce8a00d6f343c21fc9ce", peakResidentKib: 465464, elapsedSeconds: 1.05, measurementReceiptSha256: "2313829eab049130f18669276b63ee4553b0d3d761773091e3ba5f29cf7c466f", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsAdmissionConformance", codeSha256: "5baa6b9e5f25795662e569bac47329ad7dbe72835af668fcf81edb313608af6c", peakResidentKib: 452540, elapsedSeconds: 1.06, measurementReceiptSha256: "20fd26fb3434f085f05b4a4b8eb2bfaaf8c3bb7306e08b1d107259e9c3936def", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsConformance", codeSha256: "c806da73865394435194b9c062af9af308f53444f9827dfb5d25f745dd7c5de0", peakResidentKib: 462212, elapsedSeconds: 1.16, measurementReceiptSha256: "0c426b131cb37c881229a67b06c825c1d9f600f91832fb1aacc12be0de1705d0", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", codeSha256: "3776eec7f90e9ac611c2b81315126f14f963368ce6f9244d850c57be1b3bf1fd", peakResidentKib: 1110484, elapsedSeconds: 9.43, measurementReceiptSha256: "ca3ccf4acd64ea8d3cfe00f0a5af67ec3886a40db5ee7083e4861fcde3287e7f", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", codeSha256: "64cf80360270db589d23a856a51b7ce83d227539cd076180c522ad82bb4e4ebe", peakResidentKib: 1365008, elapsedSeconds: 28.27, measurementReceiptSha256: "76daba090094c0b57e607766caa315d9ff0bad8f0caf7933b3b163d30b9c385d", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", codeSha256: "205fd234c4f60d9ae1cad99bf5a2233da800d4bc588c090b34c6338ec3c55764", peakResidentKib: 1842264, elapsedSeconds: 28.88, measurementReceiptSha256: "2b99d852eb5b8372ec0b2ad3332d93afbfaab0b33b40310f99956ea1a562e300", measuredAtCommit: "28f4bf5a8ef59f8345a5f96b563f32641389a597" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", codeSha256: "e3aa0ab21412b47e7ffd71ab6cf9221992f2637fe959daa1c0d9516ec415dcdd", peakResidentKib: 1676272, elapsedSeconds: 130.85, measurementReceiptSha256: "40ffd08dbd425f08cf9c1d3e5c87704375a0b29a311e7cc87e287d8f5585f289", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", codeSha256: "a7153961b2d1a6badac67b19a3523b7265510e6dbf19b42dd6e57ab3df9bf070", peakResidentKib: 1740904, elapsedSeconds: 98.13, measurementReceiptSha256: "c80e9e4969cddc826078f8ee8b8d03f4452fd20667bc75a48ad79f3ac4546de5", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", codeSha256: "5568c29e85eb7ebdc74fc33090ca2903c5eb622567d530d567e3af8911ceda4f", peakResidentKib: 500048, elapsedSeconds: 2.59, measurementReceiptSha256: "bec68cab07930051b76b788f4e34597b690d062639a208caf590f45a131b3ff7", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", codeSha256: "bfa0ab2de00a6877bf67ab997861d1e1de8cfcb0493230141bb08d861544a221", peakResidentKib: 1266940, elapsedSeconds: 11.92, measurementReceiptSha256: "98d49048baf3f681ae34d1044b30c702e9fba00b9eb5b3cf1fccc28f555edae4", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", codeSha256: "019dd3a4707962d4e99120fa89da64c535323321203b9ac9851108bee04c77f3", peakResidentKib: 594140, elapsedSeconds: 4.46, measurementReceiptSha256: "19dd93bcfb97de9646e9b9ea68fef49c8100585ac5b8453c94be9b3a2b1b926d", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.PortableHandoffConformance", codeSha256: "661eb08d5d485c62f84467bd9b112390f94cfc244d592ece10f65966f78e2606", peakResidentKib: 461216, elapsedSeconds: 1.06, measurementReceiptSha256: "5000c774554f712e5a4b04e362c85ff6af128b4887d4088aac6e18e025739254", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.EffectDataConformance", codeSha256: "b98f98367534e12136ed83b1fd4f59984d933688a00716882e22bf6c5fb50bf4", peakResidentKib: 462180, elapsedSeconds: 1.26, measurementReceiptSha256: "170deef7b61c49ecedd3d236c1ce0dba609d3d5060b5a4538123bddc5f61a040", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionSourceConformance", codeSha256: "dd53b374008abf4b91dd27c0bf8663169e8694326e6ce5b43d7bbb6312111d10", peakResidentKib: 1272152, elapsedSeconds: 8.56, measurementReceiptSha256: "dfe0b5442d0886365c45824241cf76785a4518440cdf933046613932c7b93388", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TransactionSourceArmingConformance", codeSha256: "89f2c69e52bd8852c491fdb97688a038a8d7d37b6afb194aec85b7fb6192af2d", peakResidentKib: 1630352, elapsedSeconds: 27.7, measurementReceiptSha256: "628ef084f13e7dd6cad12d680a2f7201a0a080ac6a631584818c66d339ba15b1", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", codeSha256: "7159655e84c28a3da8402ba615c78d95f205bb61f20c960c0c2dc7ece459fd1c", peakResidentKib: 460220, elapsedSeconds: 1.06, measurementReceiptSha256: "ad1a035221b5f62e3a76daa7d34e8425973b845d26c28e8c3e9ef222f1081d9a", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", codeSha256: "eb9d7b8f381af4782181c377f4350505141936548398b24af96b5bb50c493c45", peakResidentKib: 446840, elapsedSeconds: 0.96, measurementReceiptSha256: "532de65f0733245572edabf911a8824c73c009c9997cebf8618a78fbd4b44991", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", codeSha256: "d891c802d607f944d5a9e9db67781897c883eba704f8b4dd613c1264df76c476", peakResidentKib: 443956, elapsedSeconds: 0.96, measurementReceiptSha256: "5bca0ab8bd6cd02856f579b8838d3f8fb70bdb51a0855f2b850d8a27ebde7a4b", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", codeSha256: "be62ee5d7a0a99780d0168271862a13eec2845f28dedfaabc085757bf1874022", peakResidentKib: 435036, elapsedSeconds: 0.97, measurementReceiptSha256: "765088c89018917ca69dd54c6c080a276e4ae455ae9e9b03faada890b6176cce", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationConformance", codeSha256: "13939bf1994ba72fd98bc619d25e82e745c02ea5384c9be9c92f833b75f8c378", peakResidentKib: 739604, elapsedSeconds: 12.61, measurementReceiptSha256: "68307f352f242b4dffbd13ab0a167ab904a9b599567317e78c6965bc3c7aaf21" },
    { module: "BpmnSemantics.TransactionRetentionConformance", codeSha256: "cc4a5cd6f0cf7224dd0003e9c21d70b6ecf713d43f7f4bf2d59064846cb0a158", peakResidentKib: 409896, elapsedSeconds: 0.86, measurementReceiptSha256: "cac3d35be67e912a9cb72a0de6f30df01b2b5fac605894d9ae2339ea3cb1c471", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", codeSha256: "8061a7afc102ed5f85ab2460be714aaba37ed0823728f2abb491bc6d82bd5abc", peakResidentKib: 444020, elapsedSeconds: 2.3, measurementReceiptSha256: "1f891d3528648eb459a6e1d010711acd917482be52d7925673b1f3f26f9a2085", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", codeSha256: "43dd8f8c6c2091ee28b156ff266ff701326ecc3758797d5032124b446df0b60a", peakResidentKib: 444196, elapsedSeconds: 0.95, measurementReceiptSha256: "729a44ac794fe4591f876ee6a534b587cf50351b710993a621069bc9fb299c0a", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", codeSha256: "ff57494b4ee3ec643f3e3fd1d2f39f90251c5c00e735c9a03af5397fb54fe3cd", peakResidentKib: 444548, elapsedSeconds: 0.96, measurementReceiptSha256: "72a24c4cb00836317afb2fdc4e97969258820b9e6c86e94c534df35e1c28be8a", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", codeSha256: "01f00f00b854d657642d19ee85313e664e75b0d69d018d5fd31d87732b78aa3a", peakResidentKib: 444152, elapsedSeconds: 1.92, measurementReceiptSha256: "e77224b4484f6dc4a51c137c3036ceb4094b1b4f4503f0bffffeb053fee310e8", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", codeSha256: "7b8165600c2c59c167139a7a020b4f1e5012adbd8abc247fd47ca6338691e7d9", peakResidentKib: 444460, elapsedSeconds: 0.96, measurementReceiptSha256: "6ae040f8bb065d8138ada5b7863d9ac14f3d0402f12d7c16ef2bec2dc8a0313b", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", codeSha256: "e2c68fdc0fe9bfae88a981c1440b400de3199d009be825141a3e58acaafa722c", peakResidentKib: 388476, elapsedSeconds: 0.67, measurementReceiptSha256: "676664ad53d45b6d23f5465fa86cb37e603845115e49470d372a21d44a98041a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", codeSha256: "304d4f00aa390b2262434a2ea92c6aa41435e2e3937b7ad74e5d9a1b82f9781d", peakResidentKib: 1119340, elapsedSeconds: 27.09, measurementReceiptSha256: "1b7bfea269f0edd58ef088becf4d669f2051d7e21737e08ba302eb4dfaeb8e39", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", codeSha256: "609d7a149ef9ad2e19333e79271f6b76fc59469e9a9007c76b99cbdae5466255", peakResidentKib: 1310292, elapsedSeconds: 8.91, measurementReceiptSha256: "141d0d1252b17c5ea5ffafa8ed2c97e63e3affd9e5c551ac979953c5e751030b", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", codeSha256: "ecfe4095c29799986806aea4a61c490bf39f68a686436e9acd9753aca063385e", peakResidentKib: 1488984, elapsedSeconds: 13.23, measurementReceiptSha256: "e20bda514f9343fa3be6b60409b2750ec1f319d76221250dd966e2d39d6ae108", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", codeSha256: "870a15eeac8f7e04144eb8e60ce166810779cd41bfa89336794da1abe972a8ce", peakResidentKib: 1150380, elapsedSeconds: 7.4, measurementReceiptSha256: "0bb5f2ed2ebba731946f316b5a85ed076c726596423319fd9e2f91ce1ff163c0", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.SnapshotInternalArmingSourceConformance", codeSha256: "445f13e2f05a1dffb10eecc74ddf6592a949856cdcef0be329fcbbd0f62e2729", peakResidentKib: 449716, elapsedSeconds: 1.05, measurementReceiptSha256: "45fd777c5f4481909ebea83c77006ef9d9d8316f7ba28dd38042422f75e5b8ea", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", codeSha256: "7400411a517c84a36923e59c40d32f79dddc7220d19d7a862af197dc3b1781f6", peakResidentKib: 454296, elapsedSeconds: 1.27, measurementReceiptSha256: "51869a30dacfa974623aa99bb2d87f28c75b225530c9675a2bf0f883f8384910", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", codeSha256: "82616e3ea5babb5f7a83d61fb19c6b524aa028d0f07c92bba9e3e4ed8a944dd8", peakResidentKib: 1807252, elapsedSeconds: 45.11, measurementReceiptSha256: "35654f58ec2754cedec4b63e3646f28df9bd2b6e560b2f236706c74a84eab4b3", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", codeSha256: "5315595418999550ebe06d9e2f459db5a1804e9a6aaebcfbb351d36e24a61220", peakResidentKib: 452776, elapsedSeconds: 3.96, measurementReceiptSha256: "45788fc4a90f7a2ca59d9bc285aa45e7eabfcaaa52691950d7b017c430e3c678", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", codeSha256: "594c06827c807aba4a00e3def860eddd0bbe91b193adb17fb3868c5035c032bf", peakResidentKib: 1055284, elapsedSeconds: 34.11, measurementReceiptSha256: "c2f3445fbb0886225ea38adabaa44ee0d4f6bc9b4e43d9581d5d6449b59b2ba5", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", codeSha256: "c1ad5fa14a9199abcab7e2a12b59e3b597058863c9a3ca64d56512a028fabf2f", peakResidentKib: 1710220, elapsedSeconds: 8.52, measurementReceiptSha256: "f65bd27fff7e591c0beca20e3062324d1bfe2e8aec125a6d4f44fe80a8256ad1", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", codeSha256: "6be598dc995480ec50ee1f1483ddf5ced0ab788a6321ed6d8894c41862c33f8c", peakResidentKib: 470944, elapsedSeconds: 1.16, measurementReceiptSha256: "5b48931d0c059b7646b887dccb376faf73e1d28c53ca1b91e31813307431af44", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", codeSha256: "03314352a02ffb23849b0ce8ec055950c7e60de6f5517e2a474be652c3f39b8a", peakResidentKib: 1506552, elapsedSeconds: 70.62, measurementReceiptSha256: "2835621f133fcb949ea373cb699d73fb1f21783bfb945ee20208a8827c684dbd", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", codeSha256: "a00f371979eabb13e6b3e988845b3fb9fc5336a92360e9e507d75963873b04c6", peakResidentKib: 1144900, elapsedSeconds: 5.69, measurementReceiptSha256: "551cba9c1c54038bd8be31159a7e9846d44e8bfd5047fd8f57ecb1cebd443341", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", codeSha256: "287a7ac86d78c122fe91b5bb903a1a4c117e44e60c2ee42ec725147aac876db9", peakResidentKib: 1878400, elapsedSeconds: 15.52, measurementReceiptSha256: "ceea599b33522aa3d7a935060b2033f6b4a8dbcaceffb8d28c9bf629804ac26a", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", codeSha256: "e3c0ef15abe8712b7014f4cfcf9bca6dc82a728db7e0a444b6170c72f157ee2b", peakResidentKib: 442920, elapsedSeconds: 1.06, measurementReceiptSha256: "15828a9169239b48c195ed34e8a58525f6693601d52c515e2cb498589b7f2df8", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", codeSha256: "653f3e5cf2a6896d0f54ab5dd29b85a791d3efb0b833b5755e8a28091925b858", peakResidentKib: 425296, elapsedSeconds: 0.85, measurementReceiptSha256: "2dbf5564077726dceccccf06ef70f28b65965ece7aed60b37ad963f8fd09162c", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", codeSha256: "5979246ec970adaf92cd5116b13ccb368b850b5f8e86dd79a022ee333d2e5d0f", peakResidentKib: 411336, elapsedSeconds: 0.75, measurementReceiptSha256: "a7351d1af74b0bebb07a92e9394e12ee7b4ff6e611a04e2ef8bde82f8b04369f", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", codeSha256: "8aa14432541531b52a958b4808a21ac838f1067beb24b4c574231bbfd67437cc", peakResidentKib: 1479064, elapsedSeconds: 39.38, measurementReceiptSha256: "ee7db583c726b9f6822af5a0cb628d17a621ef5b5e3189049aa72cfda24fad09", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", codeSha256: "beb62aebec4bc888cadce86d6c6c650277a8095d46384fc1e5302a6c74557618", peakResidentKib: 1143240, elapsedSeconds: 14.81, measurementReceiptSha256: "f4888ccece74bcc586bfae6967fa1cab5d4260f04ba5ea6521c219d9dc83ddce", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", codeSha256: "bfc074919dff308976883a2d339c84bc0bb8a7b31a2f8dcfa211f248759588f7", peakResidentKib: 945176, elapsedSeconds: 4.22, measurementReceiptSha256: "c8d57fe59d6bb2ec3ef97943a15fd2e73f697a7eb8ddd472c5661bec9ccc8b64", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", codeSha256: "d132073aad8a06810d2a1ec954b6a33cc75043f3941b7afd16a0f2704c1e6df5", peakResidentKib: 462108, elapsedSeconds: 4.68, measurementReceiptSha256: "4c868898d3d564be731f6381893e66774adebf19fca7889b482f2b0f454d98c4", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", codeSha256: "794a03f0e539370cd0890cd36fec17ddb3059ee833f1c4e938c090bafaf81d81", peakResidentKib: 1304584, elapsedSeconds: 22.33, measurementReceiptSha256: "67b28a14a60e8af4bddb6f2fbd7a0cbcb20d2846abecf873d77febd6fcf63ed7", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", codeSha256: "9426019aae1b95cff35551b0c94a402a9e811e259321132193524bab006924ee", peakResidentKib: 409184, elapsedSeconds: 3.49, measurementReceiptSha256: "e72f6ed50169a8c3fffde75ee93fef678c5db13a2b8b635f8bc613683411cc03", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
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
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance", codeSha256: "f000a9f62829319c43b30cf62b17083a1f45c31d4f824f1c978183fa26a56e95", peakResidentKib: 748604, elapsedSeconds: 1.26, measurementReceiptSha256: "67c2d3afedf7cb03be5311afa4f1f4d3df98e195f514e1ff775273812ae5ede4", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", codeSha256: "a6919f4c1767257321eefe56c43ea013ec924c85e5231e91b5f7c1c4db0f11ab", peakResidentKib: 452304, elapsedSeconds: 2.21, measurementReceiptSha256: "91c56a3e3a17022b308a716b4d354d85be81534c2023702d7a333552b5c6ad6c", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", codeSha256: "c4c959207c03f5d3931ee4c1bd26e1492ee4f2fcc88d380dd78e7075a6986c1e",
      peakResidentKib: 2054656,
      elapsedSeconds: 13.52,
      measurementReceiptSha256: "860f79d37d283024e003bc1e88388842348199b974ada9286111df5e25f96972",
      measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df",
    },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance", codeSha256: "fa0d31d8d611c6acd5f5042a049a7bf4e6f1bc70cbbb1b93c35b510163997fcc", peakResidentKib: 447220, elapsedSeconds: 0.96, measurementReceiptSha256: "432df3325efe2218aad8fe9f5d1e789cfa1bab637d262cff5fc7e392c3bd2cfd", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance", codeSha256: "4ccaa348781b7fb108868bffc066dcbcb31703288d62c57a30df28f2c2f49a73", peakResidentKib: 1866152, elapsedSeconds: 19.72, measurementReceiptSha256: "23bb4d138ed540458fe5281ec07d28fbf639f5cf1a9d03913fa17426d18d6288", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecyclePropagatedErrorConformance", codeSha256: "d21c68380dc93ee71e763bdded8738b5157255257120d2b7f3b56a2147d47d86", peakResidentKib: 447464, elapsedSeconds: 1.06, measurementReceiptSha256: "4e2b1a5181163e6039c7dc033f6a1adcceb73e800d512846e77bc6fae682317e", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance", codeSha256: "061d9b4495cfa0f4b7277a31f79fd409bd938fc4f216703c1f019a67138cd53c", peakResidentKib: 1597968, elapsedSeconds: 10.57, measurementReceiptSha256: "328fa21d262bfac0966666e5a2e30381536a42dae417f6f38847e2d0ef024aef", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance", codeSha256: "5ed192f9a738a2aa8c7016d62f54badb3b0241a0d684ca83462a77511dd92c4f", peakResidentKib: 550056, elapsedSeconds: 1.8, measurementReceiptSha256: "00ad83618fe7131c17fbd85f5375d12293422b700aa2556c8e1bfbdbe11a8e5e", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    {
      module: "BpmnSemantics.RuntimeStateWellFormedConformance", codeSha256: "9271611fedc4f08a78731747a4df84dc2b265ee103e0e818ae5515446ccb6e8b",
      peakResidentKib: 619360,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance", codeSha256: "f0582ca1d3166cf0989c286f6c7141bc18bc0a1c3b0e8029147ee382327a2410", peakResidentKib: 450388, elapsedSeconds: 3.26, measurementReceiptSha256: "1023b91fa70b739474a18d78a33d0af08fee8f0f07e56871bc4ab3c331d7cff3", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", codeSha256: "d5b2a094bbaa47c72c994a898cf71bc7ab82d6fe1db4a585f307ab4ddcbb5c6d", peakResidentKib: 443088, elapsedSeconds: 2.81, measurementReceiptSha256: "4caa2bf4bb96a16d1d688b702ad354c2f5b380c98150b51d95d6156b859ba56e", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", codeSha256: "6329f1d70ca7d6bde13910b2034839ffc82f50003e1edab460999cb3711a97dc", peakResidentKib: 720936, elapsedSeconds: 13.07, measurementReceiptSha256: "f0f11ad5344cbf965941a84e17c94afa532bc8149794b6978b70a1ba2d040097", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CallActivityConformance", codeSha256: "adf66b9546cc1ff836817834f58efe3eca89942802360b62c0985b997bded622", peakResidentKib: 470132, elapsedSeconds: 1.9, measurementReceiptSha256: "99271b8bdc2a1d959140b2ded96c9511c85b32a76c9a4bbd254207699ea819e2", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CallActivityPairingConformance", codeSha256: "116f713a7533e122d3b6bdc982a7867380d894c33d7925548e264029575e251b", peakResidentKib: 452340, elapsedSeconds: 3.14, measurementReceiptSha256: "cc2211f688515d8149f43b415886fa95bb4626db98717766d70a4ab5ffcbbe04", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", codeSha256: "dcbef7c5c6185b82a551fd25d23d13178cd93e03acbc41ce25b2458429c6e409", peakResidentKib: 1696004, elapsedSeconds: 44.86, measurementReceiptSha256: "240dc03c9b9e865a6b555b3353c05060856d7f323f72703463caf01da082bf95", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.TimerStartConformance", codeSha256: "a8b44b40f8336d61b1c9829afcde82d4fc35ae5ebed2735d4cacbf4875ba3fd2", peakResidentKib: 1290316, elapsedSeconds: 32.49, measurementReceiptSha256: "ee65e90c376d5408327836e07053462b1d7f810e43b64378454724b067c23a27", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", codeSha256: "c224da865d9cde40dfebb4c9cbf465bef3eefb420e6e3d8c7f3bea484f6b1b79", peakResidentKib: 1779068, elapsedSeconds: 46.15, measurementReceiptSha256: "ae9f7748a7cd1985f1a5012e7fc15144502cb12afa32b380c50bae12103a6bb3", measuredAtCommit: "e768ee78d8f5f75ffcb4c538c5332fb504034940" },
    {
      module: "BpmnSemantics.RuntimeStateActivityConformance", codeSha256: "c7c675fa9958593a73f0b4492255e3c8e762a15b5b4c4f1eb460b752e91349eb",
      peakResidentKib: 618664,
      elapsedSeconds: 0.55,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", codeSha256: "fa1e7fd9420629b492f7cccdaccaa6b6babe842ae7626c7c8b6d5d95411e0727", peakResidentKib: 1027864, elapsedSeconds: 7.0, measurementReceiptSha256: "21098b0a09fab10c079477c1f4aa104e469b562aa7729e7ef4c0c104555e3c13", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", codeSha256: "fcbf3e59d80b53a51bc85399aac944f2b120d93372df35a9fd9645231f58c69b", peakResidentKib: 1013076, elapsedSeconds: 15.20, measuredAtCommit: "6d231a2b" },
    { module: "BpmnSemantics.ScopeCancellationConformance", codeSha256: "55ecbfd139af80f3ef0b5f709c27fd7743e04c5e9dd90422adea173a8c1c2c9e", peakResidentKib: 388304, elapsedSeconds: 2.15, measurementReceiptSha256: "0cb0e0f9a3b1dc3befd03216206b6330d072846a2539cae8407feb870367466c", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ScopeCompletionConformance", codeSha256: "1134ac82c48b8348933559b2b3fac383e544af085b97db3ed35ef7782af8abc4", peakResidentKib: 395744, elapsedSeconds: 2.32, measurementReceiptSha256: "77bbb35f4359898a7ac6426957fb5bc8db850f39a8c5f1e17432626b8cbba21c", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    {
      module: "BpmnSemantics.RuntimeStateControllerConformance", codeSha256: "ca7922a0af0fd699a468988b4c0c69b3f0960b969515c503c7a97454d12ba3f4",
      peakResidentKib: 2089244,
      elapsedSeconds: 16,
      measuredAtCommit: "da6e6477",
    },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", codeSha256: "40734ea3e99b8ee2dbd506e1a37da1b57dd676379d17115cad057d095e1ced93", peakResidentKib: 437940, elapsedSeconds: 1.4, measurementReceiptSha256: "cbafc94e92b13bff94f602bf03e3feb247b26e6b80175a599a7aac85ba66a3d7", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", codeSha256: "37b5873cd45e5ca155a5d1cd0d0d5fb200294bfb6d1a9fb5c45aadba27095f93", peakResidentKib: 561804, elapsedSeconds: 6.41, measurementReceiptSha256: "b0253d34ffd881a76a235dd14027ec0aafe55cca8adc8e1a9e95074da39ce0b8", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", codeSha256: "d9db6ebe882e732ee332abb5c88e19638783fe4534e0188ff663b110fbfa2cdf", peakResidentKib: 444672, elapsedSeconds: 5.06, measurementReceiptSha256: "eaf7ce8f4d629a7af1c33d57726d34da7713e4d4d6f463170f8dd47ca9a20916", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", codeSha256: "f0857d0dc0571c392228b55a97331a8aab1630846fe940a0b9727d0cb36ecbc2", peakResidentKib: 1324944, elapsedSeconds: 10.6, measurementReceiptSha256: "68bd1701e01990e43c53649732fc8a84d6b566478007a3a26525f52e1e6d11a4", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.SemanticProcessAdmissionConformance", codeSha256: "49b040c155a516e23772c73a16e49dcd4eb1d43ab9f30f3de7e0f397d90b6f5d", peakResidentKib: 645136, elapsedSeconds: 5.13, measurementReceiptSha256: "389b8354db19a57ada8b8651f1ee4fb0c94fb643793b0bc065c920bc82128d98", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.EventBasedGatewayConformance", codeSha256: "c5c3edb3d4c757f1aec3208a197970013a6b11ec2bc9c263a1721644a4b5dc0f", peakResidentKib: 1212900, elapsedSeconds: 29.01, measurementReceiptSha256: "405638a032f072fd9af0dbf75d4c5cfc90b3dcc0a20e0de09615994ba48fbf3d", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", codeSha256: "39158c9f3cf696aee9b1f0d2aef0061d6c7d7fc3e3f6c3efdd04a7cdd72cc9ad", peakResidentKib: 461296, elapsedSeconds: 1.28, measurementReceiptSha256: "7fcc6081ef0ba92512a6e63dd2b05aff746e6a2175322912d9507b8cb014376b", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", codeSha256: "66c21dc4490e072431aa717e2058f85e8fe0567d25094311d83d9a616f123dfa", peakResidentKib: 1314828, elapsedSeconds: 65.11, measurementReceiptSha256: "9b58dbc38e969907763b3ab3a84c6d7435ba968e48580ad2417ead6c871e63c2", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", codeSha256: "b94be0af1bd729d1cd08e85a0edbbf6ab087f12c4ce4c63bb2ddce77488d1006", peakResidentKib: 1618428, elapsedSeconds: 15.78, measurementReceiptSha256: "ac483bf99ed7d5ec1ba8c802ed4d89cbb91abbb0cccd84a38da61066f47abf83", measuredAtCommit: "7ac96ded9b97e911654292a5e77215baa333b2df" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", codeSha256: "2d6362da3855d44b3565ae733536acdb7c2eb8b4d12b247014f7bd868ad4212d", peakResidentKib: 1144088, elapsedSeconds: 5.73, measurementReceiptSha256: "375c4882ba86cf2a419e74367edca3f30130cf5c6fad57bba076bff686779f71", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
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
    { module: "BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance", codeSha256: "76466d9bf68bfe4dba2e74e72e452393ccf370ab5a885015491bf8d898724c0d", peakResidentKib: 863200, elapsedSeconds: 3.45, measurementReceiptSha256: "183d41488cc76dd0cc139c60fefe3bdddf71ba62900cb72ceda93236392e7d81", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerProgramContractConformance", codeSha256: "8b8c29cd8e33f7c8d56f6bfddc5c757c9cc5cf8d8053e45e30cf4b8aea82415c", peakResidentKib: 657756, elapsedSeconds: 1.71, measurementReceiptSha256: "7f28b16d87cc9369f8e9f73b2787bf737c2f416aa4e838d33f4a92167ed0f00f", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance", codeSha256: "c0b72c3f9ee92d6359e11d11e27bd86ec46e401f7f68a00b7211e1c8bb591f7f", peakResidentKib: 477972, elapsedSeconds: 1.16, measurementReceiptSha256: "7ad932e0bb7c7ac289123dc1dd9f417c20423cbc37634a1dcb4f14739f0883ca", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeConformance", codeSha256: "0f2844ab3e31969ddf1bed1b5afa27a0197ecc2db0a86287ef9dae031e4fc012", peakResidentKib: 397820, elapsedSeconds: 0.66, measurementReceiptSha256: "bbb2e11b53e3c5af4082cedc3a5b79f8251abbe9ca2b340c54e0de0ba08c75ee", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance", codeSha256: "5e07e88526b4204c6d95ffc692def1a29d99349652a668d5b15f3ae9d5b33afe", peakResidentKib: 1190632, elapsedSeconds: 8.98, measurementReceiptSha256: "95a4c2368269ce8cbab0123a97dc6ac2c7ae9cfac85290e0cb1375bc5915fcb8", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", codeSha256: "031ee09057eb6ba17ffc71319ff3146774a04c1130f00a5704b5d1ee3bca51b0", peakResidentKib: 1596188, elapsedSeconds: 31.34, measurementReceiptSha256: "f6294ad886814273b487d018ff61474a836c90e13a05f1a753a6ff299be4c3ff", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance", codeSha256: "6c9c8704266c9bdb438900a0efdf26e02e3b66da9a34e69f0f734412261a2cc2", peakResidentKib: 424784, elapsedSeconds: 0.78, measurementReceiptSha256: "089eb734140439a1caa41d8c1df681bf7b2491f973ad8428666234411186d6bb", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationActivityRetentionProducerConformance", codeSha256: "4452331575c193504b78ce5e05d4bd31cb171594ecffb6c2dc06f345d08884cf", peakResidentKib: 976256, elapsedSeconds: 9.66, measurementReceiptSha256: "af901f8ccb6970bedc40a051725cb74b7cd0ddfddd972763a2f0b48791494f6b", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
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
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", codeSha256: "61032020e57231199b97e6b5f53b0e218a966b7fde1e5a2b8c9ed8d8d9a4fcd4", peakResidentKib: 448172, elapsedSeconds: 2.81, measurementReceiptSha256: "67d0e9d80e3707fff038f285e3b1cf7007448fd851eefd4d19cce174cd39b65e", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", codeSha256: "c9a06fa16bb018968e5585b23c876b01e19e6e985ad7c2b684ff0cce891a871b", peakResidentKib: 452684, elapsedSeconds: 8.6, measurementReceiptSha256: "3db0cd5fe310814229e0036512b401ffb03cf26fc3e3435fb21c61b567b5ca48", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotConformance", codeSha256: "02f8fdecb39ce9ff456cec5469944b7dca7a7d2a8881720b5de85a583e07a057", peakResidentKib: 463088, elapsedSeconds: 1.05, measurementReceiptSha256: "3e23ea379da2be8743126fc072ccbba79bdeabaa5d85b3d2af467b03652c23a0", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance", codeSha256: "13d7525827350358743e99be7b8c433fbff0e929425dad089076b8f3a90ddb26", peakResidentKib: 453188, elapsedSeconds: 1.07, measurementReceiptSha256: "d3080298aa75616f0030a842770fa878dad69cf4588acd8ebbb32c8e7e259db4", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance", codeSha256: "47eebc0fd0e1ce7f0f7ae02976406583d5e2bc04341dff42aca67bb3b16ad654", peakResidentKib: 457204, elapsedSeconds: 1.07, measurementReceiptSha256: "f7c358f7d3d5a3e4547d603fd6451d1493e992cfaa14a0343b2d4cb744e207fe", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance", codeSha256: "ccb1599bbb823d034c2fa6a533ad8e98165dc961e515b13d8b6cc20913cc78f3",
      peakResidentKib: 1977500,
      elapsedSeconds: 6.55,
      measuredAtCommit: "ef739572",
    },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance", codeSha256: "72262063b1468257ce8def92ac5954bab3cc26d1cbfcfcf5577105c536274da0", peakResidentKib: 446936, elapsedSeconds: 1.06, measurementReceiptSha256: "01dce3e0b61c64cd3f157f8447ff83a4148d9c873a75ec5fbaaf6c8047c764a1", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    {
      module: "BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance", codeSha256: "16c641bd34502874eac8103b0b82aa5bed4cdcd482e351caaf5342148bb71301",
      peakResidentKib: 622884,
      elapsedSeconds: 0.47,
      measuredAtCommit: "bd2bef03",
    },
    { module: "BpmnSemantics.UserTaskInteractionConformance", codeSha256: "2ba71805d0e553846d8a9e879f3bf0565bba09fff0107df7edfdc401830bfa0c", peakResidentKib: 848896, elapsedSeconds: 8.39, measurementReceiptSha256: "26d47973c64472dd7978033bc59775b577c21f5193f055579e657c87e438d6a9", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", codeSha256: "25021a5612fdf408935f996e037761dcdf3c52daaa70b7fa2f7dc368dfb2b1ca", peakResidentKib: 463796, elapsedSeconds: 1.16, measurementReceiptSha256: "ed59ea16afb89b921e0b7ede6d9013f0b3854e0bf90227fdae4ad1922fbc5fc5", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", codeSha256: "2304ae32d3cfd33903da55e006a16c136d34c4fa5ce292ed8330517ba6deba27", peakResidentKib: 1159768, elapsedSeconds: 15.67, measurementReceiptSha256: "de09d02428973a6272c7a6e4544aabd5744601b27ad145d9e24c71ba5464009d", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", codeSha256: "88354c6c1b9bb0456dbb197d82aee50cabf5d3075c729445f3df62785419e880", peakResidentKib: 1051596, elapsedSeconds: 6.3, measurementReceiptSha256: "2d56d7e6745d0a525fc94a045138b8011fcab08ff6f00497dc61fca0a7dcac2e", measuredAtCommit: "1a61e0fd54cd1d8357a73af8f5b11932bed6ef3f" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", codeSha256: "17d8c642ddc03d3f571e7fd03e5c0ff4dfc63784853f0775295e7ebf56602f7f", peakResidentKib: 449416, elapsedSeconds: 4.57, measurementReceiptSha256: "27535b36ec6d9143c8590983e9c24485f354ecfa741922a313d55ac093f483b2", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", codeSha256: "a29ee5178bd07f2f3af0a7d1a05757bf6a3db41405a5d1cf5b61cd2961458776", peakResidentKib: 1464712, elapsedSeconds: 7.79, measurementReceiptSha256: "9ffd2f000aee896112f665fd49017e6fc80e10cf46e27ca479aabf6578c25485", measuredAtCommit: "519c7c5e" },
    { module: "BpmnSemantics.ActivityBoundaryMessageConformance", codeSha256: "6f21115cfcad5b66fc37861b760bf4144578a909db827ae6309f2c36e0de5aad", peakResidentKib: 1255348, elapsedSeconds: 36.43, measurementReceiptSha256: "360ad3138cd7c384df3f6b5e88d9b2646d0671b802cebd7f9dbe016ac1bfa0a2", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", codeSha256: "863a51494ced005835df9e6bbc7002ad0985ad02cbfa6a86289708d181da89bd", peakResidentKib: 950040, elapsedSeconds: 17.51, measurementReceiptSha256: "8561069a4aad43ad9265fd92799dea6b5e9b7828583b4a338c67089db588e25b", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", codeSha256: "f4e82dae98d1bfd302feefa3335ed9a84a0679559baaa3003ad35f1e20b7b520", peakResidentKib: 927472, elapsedSeconds: 9.15, measurementReceiptSha256: "c222426c90970f09887c1207dc37a010d892e7d674cfd05364d74e1b723fca05", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", codeSha256: "e981fa8605862e333d2524e66a4c71a8d564b44160f41226e585a215be716309", peakResidentKib: 445008, elapsedSeconds: 2.42, measurementReceiptSha256: "99df437a986cc86468ad05e7518cec7319fad71b369960685c3a3070c24e998f", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
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
    { module: "BpmnSemantics.SemanticProcessJsonConformance", codeSha256: "228dffdb60edd6b8ee06a79e60290c60ada59dca69d93579250a395a18b9550b", peakResidentKib: 786236, elapsedSeconds: 4.91, measurementReceiptSha256: "2cb2e5ad48d47fa92a6649ce660297baf3787487a89283ace6c655102c026fac", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
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
