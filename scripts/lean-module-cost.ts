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
    { module: "BpmnSemantics.SequentialScopeGraphConformance", codeSha256: "a950872e9b76e48bc57385693d8e8b8309266dba86ee4b9eb89d472f415a6de3", peakResidentKib: 1039920, elapsedSeconds: 41.57, measurementReceiptSha256: "0e7c265a4132a5fc4985edc980973888dbe20e902fcf7c0e2035cf0d7c64c736", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", codeSha256: "ad789b3d3376931be907932cd7093efb5e824679889afaf83c859675784315cc", peakResidentKib: 359476, elapsedSeconds: 0.76, measurementReceiptSha256: "a1b06370e47e53e9728317c831b9a308261c8f29f356a85e97f884ff91b195f7", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.NestedScopeDataConformance", codeSha256: "d69a7b32b8bd21a2a418df2bc52bb287eed00fba90e123ef33006c771b47543e", peakResidentKib: 460356, elapsedSeconds: 1.68, measurementReceiptSha256: "a40e79610d64268ff0eadab954c916449e0701e95e1e4d20cc26401f57bb2810", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CallVariableMappingConformance", codeSha256: "a7b11c99d2732c9f68e7ca49fbc50d67722c45f15586995a6984b60a4383b0fa", peakResidentKib: 466336, elapsedSeconds: 1.15, measurementReceiptSha256: "35a15866362c72dd2702f39db4eb0ae20f236069222358c8b03fa32844b2ea9e", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.NestedScopeControlConformance", codeSha256: "96d6cba8814e9be9190c685f8fd7bd622605f278fc35bca8e111d3413af5ad93", peakResidentKib: 463704, elapsedSeconds: 1.26, measurementReceiptSha256: "6941b8b4da4c90a8691a51d472ae1813a0c58d85d6e37d38b8b5844d11bb80cf", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsAdmissionConformance", codeSha256: "016bd9b6b70628224004fe61f7c819f0e417d75749c6efa921c4825ba49d9e74", peakResidentKib: 468140, elapsedSeconds: 1.05, measurementReceiptSha256: "71fb9417629b6433b4e668e1521387717a0ce4bd9e824546ea52ec3e74c96ba4", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsConformance", codeSha256: "71c27dcca07d9a623012670c5a53d32fb98f8c6c5444ce8a00d6f343c21fc9ce", peakResidentKib: 465464, elapsedSeconds: 1.05, measurementReceiptSha256: "2313829eab049130f18669276b63ee4553b0d3d761773091e3ba5f29cf7c466f", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsAdmissionConformance", codeSha256: "5baa6b9e5f25795662e569bac47329ad7dbe72835af668fcf81edb313608af6c", peakResidentKib: 452540, elapsedSeconds: 1.06, measurementReceiptSha256: "20fd26fb3434f085f05b4a4b8eb2bfaaf8c3bb7306e08b1d107259e9c3936def", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsConformance", codeSha256: "c806da73865394435194b9c062af9af308f53444f9827dfb5d25f745dd7c5de0", peakResidentKib: 462212, elapsedSeconds: 1.16, measurementReceiptSha256: "0c426b131cb37c881229a67b06c825c1d9f600f91832fb1aacc12be0de1705d0", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", codeSha256: "46c3828630bfdaee3f61b4fedfb9cf66203651e4b488dfbc7537de1e2477949e", peakResidentKib: 490840, elapsedSeconds: 2.29, measurementReceiptSha256: "6c46f2609073e9eb303e4666ce1ca170a849431dd3fe1271d8a14c1890c8dee7", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", codeSha256: "d456cd9c66dcba9b7a58f9771b6bfb6597761b55639af76ee755502326bb590d", peakResidentKib: 630752, elapsedSeconds: 5.74, measurementReceiptSha256: "1ec5aa469b21dbdeeefc1783b29fcc9091f420de88f82a2348f4d1b17761a8d0", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", codeSha256: "9d22819b17f01ded9468d0316669e90129455e7a7c96e6219678905d4bad413b", peakResidentKib: 465456, elapsedSeconds: 10.31, measurementReceiptSha256: "8eda700f470e8926a717262a6b03d52dd19203c8b48b79ef172558b5ead65799", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", codeSha256: "38447d892661f4bbe1f544cd4cf0c9285d11aeac9c0a7d8a784a32eaa6c52b12", peakResidentKib: 1678616, elapsedSeconds: 72.24, measurementReceiptSha256: "1f30ac42612c06cfc2c08aafe937a86fd1aede07c2b756cecbc0d3d00d9e2fcd", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", codeSha256: "cd7493b13cc3185a84e6b103840661ff4b77c770f2969607d9d81bba91d0e4a0", peakResidentKib: 1420372, elapsedSeconds: 22.64, measurementReceiptSha256: "ef79bcc2a66544476aff57cf2031a312945867e9454cbfc5d4555d053c4722e8", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", codeSha256: "128c32c3ab76eaab7fb7778519a06c3e1d29eb779e2946d5791ff76bc633ac94", peakResidentKib: 494136, elapsedSeconds: 1.76, measurementReceiptSha256: "f0be5256601104ba0dbc686c16b21640be1243e86791670439aa3713854d41f6", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", codeSha256: "3fc433313305cea4199ab955a56627a2e81a817f77aa31830f40e62a102fe023", peakResidentKib: 412792, elapsedSeconds: 5.36, measurementReceiptSha256: "f813fc5d8aac1a940558d7f926acf675c540f449877c93fa3e1b44ed7499b703", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", codeSha256: "5b6ea58eca556fc62d9d58eaa86d2d872d2f8814b4dfcd148500b4453105290e", peakResidentKib: 592856, elapsedSeconds: 1.89, measurementReceiptSha256: "d864f7eca261b9dc18f6f64ee9741d8aec4d3a13e09411889e81481e673ddfab", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.PortableHandoffConformance", codeSha256: "661eb08d5d485c62f84467bd9b112390f94cfc244d592ece10f65966f78e2606", peakResidentKib: 461216, elapsedSeconds: 1.06, measurementReceiptSha256: "5000c774554f712e5a4b04e362c85ff6af128b4887d4088aac6e18e025739254", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.EffectDataConformance", codeSha256: "b98f98367534e12136ed83b1fd4f59984d933688a00716882e22bf6c5fb50bf4", peakResidentKib: 462180, elapsedSeconds: 1.26, measurementReceiptSha256: "170deef7b61c49ecedd3d236c1ce0dba609d3d5060b5a4538123bddc5f61a040", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionSourceConformance", codeSha256: "7e89255704e0e71f12feafd3fa8981e69375b9727884b243a6db9a04cc695493", peakResidentKib: 1066648, elapsedSeconds: 4.88, measurementReceiptSha256: "4585ce5fba64400aa3c0ec422d10eda9a4c80df62cb1552238cfe26ee7336521", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.TransactionSourceArmingConformance", codeSha256: "dd903fc6ddb2e5e274476652fe8d9c2cdb3bb5ff5ffd5142728a7ac1f09a8ce1", peakResidentKib: 1186500, elapsedSeconds: 10.55, measurementReceiptSha256: "c067de67ebf1a3dd091b8801ef478e662e0eb7a098cfc9a77db01cdb4d7abe0b", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", codeSha256: "7159655e84c28a3da8402ba615c78d95f205bb61f20c960c0c2dc7ece459fd1c", peakResidentKib: 460220, elapsedSeconds: 1.06, measurementReceiptSha256: "ad1a035221b5f62e3a76daa7d34e8425973b845d26c28e8c3e9ef222f1081d9a", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", codeSha256: "eb9d7b8f381af4782181c377f4350505141936548398b24af96b5bb50c493c45", peakResidentKib: 446840, elapsedSeconds: 0.96, measurementReceiptSha256: "532de65f0733245572edabf911a8824c73c009c9997cebf8618a78fbd4b44991", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", codeSha256: "d891c802d607f944d5a9e9db67781897c883eba704f8b4dd613c1264df76c476", peakResidentKib: 443956, elapsedSeconds: 0.96, measurementReceiptSha256: "5bca0ab8bd6cd02856f579b8838d3f8fb70bdb51a0855f2b850d8a27ebde7a4b", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", codeSha256: "be62ee5d7a0a99780d0168271862a13eec2845f28dedfaabc085757bf1874022", peakResidentKib: 435036, elapsedSeconds: 0.97, measurementReceiptSha256: "765088c89018917ca69dd54c6c080a276e4ae455ae9e9b03faada890b6176cce", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationConformance", codeSha256: "82cf372ce346746ce1fbddab05394129471b3265fefa482db973610dbd236f71", peakResidentKib: 571152, elapsedSeconds: 3.24, measurementReceiptSha256: "5af3028cd77438edaeef647202fc74819f699b8675b3aa0d93446f3a51d8f56a", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.TransactionRetentionConformance", codeSha256: "cc4a5cd6f0cf7224dd0003e9c21d70b6ecf713d43f7f4bf2d59064846cb0a158", peakResidentKib: 409896, elapsedSeconds: 0.86, measurementReceiptSha256: "cac3d35be67e912a9cb72a0de6f30df01b2b5fac605894d9ae2339ea3cb1c471", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", codeSha256: "8061a7afc102ed5f85ab2460be714aaba37ed0823728f2abb491bc6d82bd5abc", peakResidentKib: 444020, elapsedSeconds: 2.3, measurementReceiptSha256: "1f891d3528648eb459a6e1d010711acd917482be52d7925673b1f3f26f9a2085", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", codeSha256: "43dd8f8c6c2091ee28b156ff266ff701326ecc3758797d5032124b446df0b60a", peakResidentKib: 444196, elapsedSeconds: 0.95, measurementReceiptSha256: "729a44ac794fe4591f876ee6a534b587cf50351b710993a621069bc9fb299c0a", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", codeSha256: "ff57494b4ee3ec643f3e3fd1d2f39f90251c5c00e735c9a03af5397fb54fe3cd", peakResidentKib: 444548, elapsedSeconds: 0.96, measurementReceiptSha256: "72a24c4cb00836317afb2fdc4e97969258820b9e6c86e94c534df35e1c28be8a", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", codeSha256: "01f00f00b854d657642d19ee85313e664e75b0d69d018d5fd31d87732b78aa3a", peakResidentKib: 444152, elapsedSeconds: 1.92, measurementReceiptSha256: "e77224b4484f6dc4a51c137c3036ceb4094b1b4f4503f0bffffeb053fee310e8", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", codeSha256: "7b8165600c2c59c167139a7a020b4f1e5012adbd8abc247fd47ca6338691e7d9", peakResidentKib: 444460, elapsedSeconds: 0.96, measurementReceiptSha256: "6ae040f8bb065d8138ada5b7863d9ac14f3d0402f12d7c16ef2bec2dc8a0313b", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", codeSha256: "ed07c57af999c114bffba9a71489248b070c000389480478f0343c40f8c09ea5", peakResidentKib: 382016, elapsedSeconds: 0.57, measurementReceiptSha256: "baf62e54521f136171dfc912a5dacbb5b9573435dcafb6b10ff73b2ce7b206ca", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", codeSha256: "4f70773ef1a1e59693ffb356e6f1c7a0af4fa70c540046914965050e84f6656c", peakResidentKib: 451580, elapsedSeconds: 1.18, measurementReceiptSha256: "acd0ef729389798d0fe6769570d53848dcb0b2442c0f4f84eaf88f48f23787a8", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", codeSha256: "6e24380bdb9b1da6c34a41f3b128c6033998db0e95b24479f8fd3c799dc45021", peakResidentKib: 1017620, elapsedSeconds: 7.64, measurementReceiptSha256: "318836355fa5795ff5d0c4e3e67c27993702ed0c166770d96244d7f969516623", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", codeSha256: "8b2cde5052e9faf3e48f2f47f9264cf5078237245f047fb49d73868d6308bb02", peakResidentKib: 1213540, elapsedSeconds: 11.58, measurementReceiptSha256: "fc1e399054cff54e169835b487846768d0059995e1428eeb3e2effaf5f99657b", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", codeSha256: "046b0d96c0a0b7d5fb03ae247c9595f47c9d9a0682ebfbc6594beaa298d6b794", peakResidentKib: 815176, elapsedSeconds: 4.09, measurementReceiptSha256: "000108fcc385c641a5ce9d4b759668dbe6001f52e41a9d846dbba5153977c7df", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SnapshotInternalArmingSourceConformance", codeSha256: "445f13e2f05a1dffb10eecc74ddf6592a949856cdcef0be329fcbbd0f62e2729", peakResidentKib: 449716, elapsedSeconds: 1.05, measurementReceiptSha256: "45fd777c5f4481909ebea83c77006ef9d9d8316f7ba28dd38042422f75e5b8ea", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", codeSha256: "7400411a517c84a36923e59c40d32f79dddc7220d19d7a862af197dc3b1781f6", peakResidentKib: 454296, elapsedSeconds: 1.27, measurementReceiptSha256: "51869a30dacfa974623aa99bb2d87f28c75b225530c9675a2bf0f883f8384910", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", codeSha256: "128fe8d70ceb328499f09c0393ffba6bde4cf81b403b3562537892e370a20a58", peakResidentKib: 1809568, elapsedSeconds: 47.08, measurementReceiptSha256: "ec8941ae65370b05508f95f4aabed0576d5ff7c4fb813a9066b4c0c5d1a7f691", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", codeSha256: "5315595418999550ebe06d9e2f459db5a1804e9a6aaebcfbb351d36e24a61220", peakResidentKib: 452776, elapsedSeconds: 3.96, measurementReceiptSha256: "45788fc4a90f7a2ca59d9bc285aa45e7eabfcaaa52691950d7b017c430e3c678", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", codeSha256: "c96dd3c9f573c579dbbd490df7d2564d00a3abbd0acc426ba53a3a05898fb195", peakResidentKib: 1064888, elapsedSeconds: 10.66, measurementReceiptSha256: "be3fcec271ec6a236572afc9cc167f9f98db7911053aa11ecab8e0d050f2518a", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", codeSha256: "010f2a3469befbeb524ec1a01176c176b3d0720746cbf4be90c087dbe0140752", peakResidentKib: 466488, elapsedSeconds: 1.49, measurementReceiptSha256: "116aff13ba1e260af12c87b9b9c3bdbae5b6477f85dcc105c6d5becdc9333db4", measuredAtCommit: "2fd5da3b85e4d9bfe921fc5cf74285ba17418086" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", codeSha256: "6be598dc995480ec50ee1f1483ddf5ced0ab788a6321ed6d8894c41862c33f8c", peakResidentKib: 470944, elapsedSeconds: 1.16, measurementReceiptSha256: "5b48931d0c059b7646b887dccb376faf73e1d28c53ca1b91e31813307431af44", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", codeSha256: "23fe14004a1c18a888d3e892e459aab02c14c78c509d7dec7ee5ad266f234e90", peakResidentKib: 1145228, elapsedSeconds: 27.5, measurementReceiptSha256: "70238bb575d716f3e90184218e56359ebda9ffff3ca5e64514e67d02c419e875", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", codeSha256: "a4aba5484d553bc0fd58174672117221f7e47a03658e13bb04a5960c01fe954d", peakResidentKib: 854588, elapsedSeconds: 2.93, measurementReceiptSha256: "ad2114c919dfd37172567f484e0af387b9360e78e2c736074484b756884f3b26", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", codeSha256: "426f315b21ece6fbbe892a6a7ff216ca08b6f92b1fb9d35edcb95ab7347e0bbb", peakResidentKib: 455844, elapsedSeconds: 1.16, measurementReceiptSha256: "7a9bab46d8d218b864dad7c4bdddf833cb86422458253db121ea232ec3b98c92", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", codeSha256: "e3c0ef15abe8712b7014f4cfcf9bca6dc82a728db7e0a444b6170c72f157ee2b", peakResidentKib: 442920, elapsedSeconds: 1.06, measurementReceiptSha256: "15828a9169239b48c195ed34e8a58525f6693601d52c515e2cb498589b7f2df8", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", codeSha256: "653f3e5cf2a6896d0f54ab5dd29b85a791d3efb0b833b5755e8a28091925b858", peakResidentKib: 425296, elapsedSeconds: 0.85, measurementReceiptSha256: "2dbf5564077726dceccccf06ef70f28b65965ece7aed60b37ad963f8fd09162c", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", codeSha256: "5979246ec970adaf92cd5116b13ccb368b850b5f8e86dd79a022ee333d2e5d0f", peakResidentKib: 411336, elapsedSeconds: 0.75, measurementReceiptSha256: "a7351d1af74b0bebb07a92e9394e12ee7b4ff6e611a04e2ef8bde82f8b04369f", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", codeSha256: "769a3ea72ca19974e538dffec23487d117535f9ac0c2f7f95ef7f4c69374deac", peakResidentKib: 1402436, elapsedSeconds: 8.22, measurementReceiptSha256: "c82335a51548a0cc5818353201098d51046f6426cb2748989ec739397cb5e59c", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", codeSha256: "9928cb1a109c037646a7d568866bc59467453f9e2820e5362636edf717badb1e", peakResidentKib: 1144208, elapsedSeconds: 10.04, measurementReceiptSha256: "0717f3570b35010eecba343ecf86a15450448dea538a35a85e44cf4ef7ec93f8", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", codeSha256: "ec2c887957b18719758a7953c58a08828a797f49e5fc29419bb4a501900479bc", peakResidentKib: 404376, elapsedSeconds: 5.91, measurementReceiptSha256: "7b7ee830fac9a91c87d11ab08afbaf71fbb550dbe0a41d337b30cfe60f20bdcd", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", codeSha256: "d132073aad8a06810d2a1ec954b6a33cc75043f3941b7afd16a0f2704c1e6df5", peakResidentKib: 462108, elapsedSeconds: 4.68, measurementReceiptSha256: "4c868898d3d564be731f6381893e66774adebf19fca7889b482f2b0f454d98c4", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", codeSha256: "43fae542b4b8c384c69892328b0a89ebe8665b0bcc4d3b3d111e62f63c5fe811", peakResidentKib: 1003240, elapsedSeconds: 6.2, measurementReceiptSha256: "0400253cd7b0303b00b4645b1f619afc759e2aae91165c27084b6da0133c2b05", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", codeSha256: "9426019aae1b95cff35551b0c94a402a9e811e259321132193524bab006924ee", peakResidentKib: 409184, elapsedSeconds: 3.49, measurementReceiptSha256: "e72f6ed50169a8c3fffde75ee93fef678c5db13a2b8b635f8bc613683411cc03", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.MessageStartAdmissionConformance", codeSha256: "2e7fb235f2bc349ac0998e1d66ec6303ebfe6dd86096d122802f04b6a1655bb5", peakResidentKib: 996948, elapsedSeconds: 9.35, measurementReceiptSha256: "39217632eb568d284649ebfb18638548067cb3783a2bd25bafb2672f6f2b0f9c", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.MessageStartClosureConformance", codeSha256: "69e33d3bf3c43bb79ba20a7abb241621335e5ca9bcf86bde6eab71138eca5df4", peakResidentKib: 874284, elapsedSeconds: 3.24, measurementReceiptSha256: "27ee9b12f8f961797f801a2b77a198910af428a92314e5d3d5b1cc8c03e45bf8", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.MessageStartIdentityConformance", codeSha256: "79adca7aa8c57f442c5bd5c887944a31b547ccf740289abffd5c69d89b296cfd", peakResidentKib: 880752, elapsedSeconds: 5.88, measurementReceiptSha256: "b3da2762cbaf0bbcf5803b906c9d36557e0b77ca66c6d66407349c3c712f5b91", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.MessageStartScenarioConformance", codeSha256: "adca39a77f48095880d4a69c306dde86dc81436a79b829181d9a9ca9107caa12", peakResidentKib: 1150832, elapsedSeconds: 3.95, measurementReceiptSha256: "d17c258a12f66d94ff94f507fd9f649fff0c55c1f1c40f23c7fa167896f1ca4b", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.MessageStartConformance", codeSha256: "b0af696a951c386d29f76b87630266e422632d878f337964abe74968c8f7215e", peakResidentKib: 439412, elapsedSeconds: 0.95, measurementReceiptSha256: "0de11f22047c0e740137f013adf45c01ab572f7a51ef4365c886ea61b896e668", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessagePayloadCatchConformance", codeSha256: "63c16cb1a2de792a100c5e039603b95139753e006344937b494b443a5f995311", peakResidentKib: 1063740, elapsedSeconds: 8.84, measurementReceiptSha256: "1843f14f6d06b000b21fabd5323b67402fc051ac86db040a51ca0cdda5ef89d0", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.PortableMessagePayloadConformance", codeSha256: "d5841b478e3d4b2269c7ffe753e3e9aaf6a899931b238c67f267af14433990aa", peakResidentKib: 1213284, elapsedSeconds: 16.09, measurementReceiptSha256: "a8f0fa91ed4b8e6f754c7800c2a918afa70366d1b06b3f09218258f2e11b8073", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialMultiInstanceConformance", codeSha256: "e5d4cbac5fe57ba61b3f8594dca778cc88587d640516f56d9a235fd73b27191a", peakResidentKib: 435816, elapsedSeconds: 1.2, measurementReceiptSha256: "67bfbe81b0e557c8f24cabfda47adb1ddfd5595c1e663820b5b59d774fc4dff7", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgressConformance", codeSha256: "205bea0af2594a004c1b487b4f8653bacdada8c9f7ea2a459c30455f35cbebe3", peakResidentKib: 625172, elapsedSeconds: 4.8, measurementReceiptSha256: "6421246b0dd015b5ec4d6ab7749f7f6fc785b188f5c0fbd7a40cc6b9f5326fe7", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.SequentialMultiInstanceRuntimeConformance", codeSha256: "161c75e763127693e72395aa7ffeec41bbf425140ffb2d390017a35e157d6878", peakResidentKib: 1097316, elapsedSeconds: 21.78, measurementReceiptSha256: "75d6327eb31d27c48751b673b8960ef17f5bf9e29288107b8c22c1796a4bb508", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SequentialMultiInstanceRefusalConformance", codeSha256: "51787cabfe310ad96d2bed200fe5616b0aebdbae546dc649d0e56e9459ff68af", peakResidentKib: 1097616, elapsedSeconds: 12.57, measurementReceiptSha256: "c1e433a7365b8109d5007ec68dec838a20c11951468883d36430d9a947efa83d", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance", codeSha256: "f338bf1eef604781bfacceeeeb449d5c0cc8682518d1c6425eb65bf5cb598fbc", peakResidentKib: 457268, elapsedSeconds: 0.95, measurementReceiptSha256: "0d9b14b1a2881adef3fb0509b92a1dece148be801bbf5508a661b8c33789aec7", measuredAtCommit: "2fd5da3b85e4d9bfe921fc5cf74285ba17418086" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance", codeSha256: "73fce35b8406ec701aa255788ff009ba40244749fa186f8ce900b7a569207f60", peakResidentKib: 439892, elapsedSeconds: 11.98, measurementReceiptSha256: "33df23b8824218360d30bf6946895b61801bfdbc02e51317f1807ad1b738ae50", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", codeSha256: "a6919f4c1767257321eefe56c43ea013ec924c85e5231e91b5f7c1c4db0f11ab", peakResidentKib: 452304, elapsedSeconds: 2.21, measurementReceiptSha256: "91c56a3e3a17022b308a716b4d354d85be81534c2023702d7a333552b5c6ad6c", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", codeSha256: "f4ede1af690ffc20c35d42cc59b4817040d27784bffd171bb3ecc975c6d482b5", peakResidentKib: 821296, elapsedSeconds: 2.63, measurementReceiptSha256: "a0c29c5a44c6a6f9fd46c32850e3cbf8b6e2938f51829a49d368bd372fa709c8", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance", codeSha256: "fa0d31d8d611c6acd5f5042a049a7bf4e6f1bc70cbbb1b93c35b510163997fcc", peakResidentKib: 447220, elapsedSeconds: 0.96, measurementReceiptSha256: "432df3325efe2218aad8fe9f5d1e789cfa1bab637d262cff5fc7e392c3bd2cfd", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance", codeSha256: "229f034a35de5428c7640e8156affbce32fcb4f90e0fcc1ce6fe5a3422623bf9", peakResidentKib: 1563380, elapsedSeconds: 13.6, measurementReceiptSha256: "0bf534496b26dcc59775f885ca7c95629043974c439a4c38a3a86e5f5e15e31e", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecyclePropagatedErrorConformance", codeSha256: "d21c68380dc93ee71e763bdded8738b5157255257120d2b7f3b56a2147d47d86", peakResidentKib: 447464, elapsedSeconds: 1.06, measurementReceiptSha256: "4e2b1a5181163e6039c7dc033f6a1adcceb73e800d512846e77bc6fae682317e", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance", codeSha256: "fa2b138e9913bf104c7f2f630217f394ea919068291199d554ab9cb6c410af62", peakResidentKib: 1305800, elapsedSeconds: 8.94, measurementReceiptSha256: "2f283b9e39f0fe0236bb665ee1fd0ee1db9e38a35334772e2db831197b64b653", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance", codeSha256: "05b6857f60a0a189843b628172560ed5e2c3477da437bc98358b77e88997f452", peakResidentKib: 446828, elapsedSeconds: 1.06, measurementReceiptSha256: "a375b35a008bfce8b3f6f5c732764df7ad56193a85af9a76269bb9e42e030706", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.RuntimeStateWellFormedConformance", codeSha256: "fdb53f579abee3fd939596d98f058f42afcafc54cc0cb852f913009a00f89be0", peakResidentKib: 435568, elapsedSeconds: 1.59, measurementReceiptSha256: "5b7c929ec9350b8429f9b0a0a3e01ea5a89c3de5ee4e422df17a40132ac7457b", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance", codeSha256: "f0582ca1d3166cf0989c286f6c7141bc18bc0a1c3b0e8029147ee382327a2410", peakResidentKib: 450388, elapsedSeconds: 3.26, measurementReceiptSha256: "1023b91fa70b739474a18d78a33d0af08fee8f0f07e56871bc4ab3c331d7cff3", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", codeSha256: "d5b2a094bbaa47c72c994a898cf71bc7ab82d6fe1db4a585f307ab4ddcbb5c6d", peakResidentKib: 443088, elapsedSeconds: 2.81, measurementReceiptSha256: "4caa2bf4bb96a16d1d688b702ad354c2f5b380c98150b51d95d6156b859ba56e", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", codeSha256: "c312a1fc0789246374b180fe823e5537d04681e2625748d4be737ed499434a5c", peakResidentKib: 723560, elapsedSeconds: 5.68, measurementReceiptSha256: "7364ac0e62a0107603bf5e025637cc6df16d7efc3443c59224faba3d09a73727", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.CallActivityConformance", codeSha256: "b23f5d02c31bdba18c4147176d2b1f0a65e9ae0e51e62c6833c56cf1e2912053", peakResidentKib: 464236, elapsedSeconds: 3.0, measurementReceiptSha256: "181c4031ee39433593b76dfbb3a740ef11a5485074ad0478f8520fe5292971ff", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.CallActivityPairingConformance", codeSha256: "313e3a4f749b0356baffcef7b2fb6fca17a89622264bb6b570d1d236d4a5ff10", peakResidentKib: 448532, elapsedSeconds: 0.95, measurementReceiptSha256: "716dd2501cc78915af72dbe8c67609e091fda91f0a1ca226889f51fefa353972", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", codeSha256: "0aff3198d3f310d113b39fb0e06b4b93c9ffe1f29cebcb9898c6c1764299c41a", peakResidentKib: 1028116, elapsedSeconds: 9.66, measurementReceiptSha256: "4938c5ce784e6d6b47cf467004c25febb4a62bffc06e57ac89a3f4fbae0c0939", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.TimerStartConformance", codeSha256: "014909544801bfa5ab6e371a579f99880e4b60409df912d261a7cfa0afe5916b", peakResidentKib: 1143884, elapsedSeconds: 17.57, measurementReceiptSha256: "6d31f267986985530aa6201a5d29bcf880f683dac9e221ce780a18bec750d9c2", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", codeSha256: "5e4d4f4c34614944c1500e8b68f7d5ed80887317c9ec4151a279c19d876a5449", peakResidentKib: 1492828, elapsedSeconds: 42.15, measurementReceiptSha256: "c9284cc0a94bddcfcd83e89f232eae8a8c8b22acdc7d3aaf1aac5431ed2aa33e", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.RuntimeStateActivityConformance", codeSha256: "d5967e51d77067d6a36a9ffbfe32d7856dfb46fffbf17e38274ca11a894dcaec", peakResidentKib: 414296, elapsedSeconds: 4.1, measurementReceiptSha256: "1dd8ff081f0bc8a11ddb7184e549dbac2e0c7e976f6b8af430a15ead9e2c7d12", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", codeSha256: "dd9334f85a4d46e33dfdda93ec53ce6540268fb8f0df9ab35de50c108821233a", peakResidentKib: 1032248, elapsedSeconds: 3.4, measurementReceiptSha256: "e5e296bd16cfc6de15192b00c5715e8c394cb314d608d8b70d5cb6a63fb92381", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", codeSha256: "e2c19f2c33bed2099e45f39b26c17eefa324a93c0e604f8f775f16e5db939e88", peakResidentKib: 736640, elapsedSeconds: 2.0, measurementReceiptSha256: "487bb2e6c09e2870b7af9ec8cd8bf32047c7d100b87b7e0e9c6ee35e820ffe4d", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ScopeCancellationConformance", codeSha256: "651128cf9bf7384dfbd88b221aba2059755806415209b3b1ee9dfd486dc2ccf9", peakResidentKib: 385700, elapsedSeconds: 0.55, measurementReceiptSha256: "2fcde43431d737f06313c761b440e29cb3e7d1f5f35015e56c05f86479918ee9", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.ScopeCompletionConformance", codeSha256: "1134ac82c48b8348933559b2b3fac383e544af085b97db3ed35ef7782af8abc4", peakResidentKib: 395744, elapsedSeconds: 2.32, measurementReceiptSha256: "77bbb35f4359898a7ac6426957fb5bc8db850f39a8c5f1e17432626b8cbba21c", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateControllerConformance", codeSha256: "82a83a82d722a2a27b644c8ee021d724fd792d85e57861b721ddf32339b87b00", peakResidentKib: 457288, elapsedSeconds: 1.38, measurementReceiptSha256: "1334eb84f4010938690bf3f7dfc64a0a60497f40a0be922dfdd076e2d68ae493", measuredAtCommit: "2fd5da3b85e4d9bfe921fc5cf74285ba17418086" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", codeSha256: "40734ea3e99b8ee2dbd506e1a37da1b57dd676379d17115cad057d095e1ced93", peakResidentKib: 437940, elapsedSeconds: 1.4, measurementReceiptSha256: "cbafc94e92b13bff94f602bf03e3feb247b26e6b80175a599a7aac85ba66a3d7", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", codeSha256: "05e38bd4a72bc1949013145ea52fd8e3bec24bffafaa4dc0e11736db33081086", peakResidentKib: 558708, elapsedSeconds: 3.1, measurementReceiptSha256: "6ed3e664d3eadcfb54705aa04f0396c1bd0226154eccb5a699a8b8b513c3fe0a", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", codeSha256: "d9db6ebe882e732ee332abb5c88e19638783fe4534e0188ff663b110fbfa2cdf", peakResidentKib: 444672, elapsedSeconds: 5.06, measurementReceiptSha256: "eaf7ce8f4d629a7af1c33d57726d34da7713e4d4d6f463170f8dd47ca9a20916", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", codeSha256: "59a7f477d5e07fa25b826fa405b8b476771896c80d61b8b10940db2178453be1", peakResidentKib: 1331984, elapsedSeconds: 6.4, measurementReceiptSha256: "0ec81de20d776ebbd0224974be6ae2b96952ee4101aabf81d89e6e37b27917d5", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SemanticProcessAdmissionConformance", codeSha256: "49b040c155a516e23772c73a16e49dcd4eb1d43ab9f30f3de7e0f397d90b6f5d", peakResidentKib: 645136, elapsedSeconds: 5.13, measurementReceiptSha256: "389b8354db19a57ada8b8651f1ee4fb0c94fb643793b0bc065c920bc82128d98", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.EventBasedGatewayConformance", codeSha256: "5a17636eb7e58d9fd6ef3ff4243994279fc71f68aed3e80a936c501960a73141", peakResidentKib: 1221712, elapsedSeconds: 8.35, measurementReceiptSha256: "cd1b726474cb66cf7d5f98c301cb270634ecc67a774897994b33df127ace4b6c", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", codeSha256: "39158c9f3cf696aee9b1f0d2aef0061d6c7d7fc3e3f6c3efdd04a7cdd72cc9ad", peakResidentKib: 461296, elapsedSeconds: 1.28, measurementReceiptSha256: "7fcc6081ef0ba92512a6e63dd2b05aff746e6a2175322912d9507b8cb014376b", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", codeSha256: "70ac510c7da2a86be61397d76cb74fcde0b40655d34f16e071727d775e8f8fa9", peakResidentKib: 1297816, elapsedSeconds: 13.72, measurementReceiptSha256: "1710ecc20997f910dafcdf56144b4eb68ef4e11e0213735cede5f7ca829e44a6", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", codeSha256: "791206e525c916146033b71e045720c396ca8fcc251fccc022a700aea3c5062f", peakResidentKib: 792192, elapsedSeconds: 4.68, measurementReceiptSha256: "243b42817a341eaeca538cf2195804022167db8af1d4699c4b78e91255b0cac4", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", codeSha256: "e5a5f7229357528fc172516c7fa69c6e8b8d2fb238a317814c4a9802edbd2435", peakResidentKib: 1146804, elapsedSeconds: 4.97, measurementReceiptSha256: "fe3913086f964fce8409c8b4166a39e4f08e78d5d92ddfc62c1ec64f6774f8cf", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.TerminateEndEventConformance", codeSha256: "4ac57575b8c2cdd235fe3594e8648b1a900d72af5adababab62f2f0d42a374af", peakResidentKib: 718252, elapsedSeconds: 4.77, measurementReceiptSha256: "39efef673b11f157aedf091e92f3076bf3ae01df954252958daa210ccba3bbb6", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.RegionalRemovalOwnerCoverageConformance", codeSha256: "5ae83c6fb31c0f19fd2e7cd55ad0d1ce67e42d60c736753e289da7885b871783", peakResidentKib: 686828, elapsedSeconds: 2.53, measurementReceiptSha256: "a28545d10d13a8e3ef8c60f2dd422a57284552fd54534a9a0693f1b2f16fc459", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SemanticProcessConformance", codeSha256: "70617b54b890eaf7a2837dc699710d2e4ef1826114429d46153a14143631df72", peakResidentKib: 454668, elapsedSeconds: 1.06, measurementReceiptSha256: "42d0a4d15c5a143c4275a3bf925281d5cb194f26ec4891b893aa18fe14cd20b6", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", codeSha256: "3d4f228b2b31761500830122acded69af584650fb813dfe8277df88ea14f4369", peakResidentKib: 921844, elapsedSeconds: 19.37, measurementReceiptSha256: "2890027f6cb3cc7017498603f877c363c49ddabc2be29c4eb1173fe188040032", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", codeSha256: "01ac2bac0cdd52d31e46ae5ad6e70af2e112fa4b5d328ebd5afe40e688f6dc03", peakResidentKib: 1112600, elapsedSeconds: 14.83, measurementReceiptSha256: "a600ed50dc0bc501aee038ffd72e6e7b44d76f57624209a83e17ab1aad06ea53", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ActivityDataInputConformance", codeSha256: "a97e2063fd7fe744ca920bd1254bd923d110a6c8682a5906bb4d03658352d09e", peakResidentKib: 900232, elapsedSeconds: 6.0, measurementReceiptSha256: "9e12d72e315a33006dfac3765708a7327621ac2499f25776ee0eae495deeaf94", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", codeSha256: "35907cf99aff30718a5d632ab2e76457dc4ed532f5db50138fa8ebf5cf3dda58", peakResidentKib: 1066256, elapsedSeconds: 13.84, measurementReceiptSha256: "28fe6f4ea97ba01e0bc7149b35b01a9b2a6ddfd50aac6a9e3701244b00e839c6", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.MappedSuccessConformance", codeSha256: "816ea3b0679b6b031030a718d5599480260b123358643a52fcd651bdde19a1d0", peakResidentKib: 915124, elapsedSeconds: 7.03, measurementReceiptSha256: "6f352be9fa25a77b8db26e7c90766fe15f943f5aaa6ca2380946a5f6455f0a6a", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InclusiveGatewayConformance", codeSha256: "41b72eb189f4ac169b05cb69c8b95cfcbbc617b8103042db81b1de85274bef8d", peakResidentKib: 1343120, elapsedSeconds: 12.79, measurementReceiptSha256: "72dc025530f98986bf613908557584984ae86684ec9dc8678463bf7d350567f4", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", codeSha256: "78ae14fa12c20936824b9b74a949fc80a383639759990605afc1e2eda82bc605", peakResidentKib: 894876, elapsedSeconds: 28.57, measurementReceiptSha256: "f61cd2b86c91c03c074dd337d795063d6ed6f0f763387c2d74e42c96b04b92a4", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", codeSha256: "9ac37ec8c53ff993f863c4382d5c907c1c40a0f0f8ee0f490de1cd05fe5e413f", peakResidentKib: 877912, elapsedSeconds: 5.93, measurementReceiptSha256: "4e31cc612feb83ec0c834b8c507c6ba1b9418df4b64c1b0861d1b0a34312ccf9", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", codeSha256: "82185fd14ddd0be3f7999bd425cebbad19b03b08d0a1108b781035c05c06b53d", peakResidentKib: 1641576, elapsedSeconds: 21.82, measurementReceiptSha256: "0793bdd305cbe92b656bc0e15b27c5d549b94bc3c4b82ee514f36aa56abbcbcc", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InternalCommutationConformance", codeSha256: "558bafb463e765bfa1ed26f0ea785454b22ab1d823a22f3145a37cecca441b0f", peakResidentKib: 1064168, elapsedSeconds: 10.9, measurementReceiptSha256: "e9510d523506acf9a53e410f672b34ac2fe52b060cbc09d0c73059e0fdd8de5a", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", codeSha256: "c7ab78cf9c4b39dab892a82f4398aca79b78a382e5b39d591f59ce9d976cca69", peakResidentKib: 472512, elapsedSeconds: 1.05, measurementReceiptSha256: "45dd849058c47b9bffd0312a9694b7cc2e2e8cbd6e1b03e2f3a9c3b03a3c710a", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", codeSha256: "ffc46c5a2e45a34be5b866d65777b2516542f4b2e64a49686ae51e7fac74e87c", peakResidentKib: 1571604, elapsedSeconds: 10.31, measurementReceiptSha256: "5189a3fc334961e22c483c7eef31f1ffff0019428b502a66af3f3dcdc0f21e12", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
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
    { module: "BpmnSemantics.CompensationTriggerHandlerProgramContractConformance", codeSha256: "0de62c1fcffccbf9f2a53ba84d0006962086304f906882f8006c30991629bdf6", peakResidentKib: 456904, elapsedSeconds: 0.95, measurementReceiptSha256: "4772709bd869efb21518a71822a8b0f23ea38773bca83ae64ef66712b01b88d9", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance", codeSha256: "c0b72c3f9ee92d6359e11d11e27bd86ec46e401f7f68a00b7211e1c8bb591f7f", peakResidentKib: 477972, elapsedSeconds: 1.16, measurementReceiptSha256: "7ad932e0bb7c7ac289123dc1dd9f417c20423cbc37634a1dcb4f14739f0883ca", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeConformance", codeSha256: "0f2844ab3e31969ddf1bed1b5afa27a0197ecc2db0a86287ef9dae031e4fc012", peakResidentKib: 397820, elapsedSeconds: 0.66, measurementReceiptSha256: "bbb2e11b53e3c5af4082cedc3a5b79f8251abbe9ca2b340c54e0de0ba08c75ee", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance", codeSha256: "ad7985111d6c5e16631424f45e8ee53bd9f60493129ebf1c0c6ee42c8b4a9945", peakResidentKib: 891756, elapsedSeconds: 6.03, measurementReceiptSha256: "b967b0df9b70c3e0a3451b1409d18174280b3cf9630b9462644c30af766804ee", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", codeSha256: "9ed54f7b0b091114c611bb400e7a162b3fd7816b9e29ecce9124ff1ee0a51e9f", peakResidentKib: 1136700, elapsedSeconds: 19.85, measurementReceiptSha256: "74cbe309356189d4a78444d95ef7fcc708f47dabf62811fec716e9a3fc2f36ed", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance", codeSha256: "6c9c8704266c9bdb438900a0efdf26e02e3b66da9a34e69f0f734412261a2cc2", peakResidentKib: 424784, elapsedSeconds: 0.78, measurementReceiptSha256: "089eb734140439a1caa41d8c1df681bf7b2491f973ad8428666234411186d6bb", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationActivityRetentionProducerConformance", codeSha256: "416f8d3822084810f09ec06c5254727a0f0c6ed7650d6ba3f7ba8ea5349fb15a", peakResidentKib: 692836, elapsedSeconds: 8.47, measurementReceiptSha256: "e9c7a1051c69b40fe1615a65e845bee66f8cf66a77eb62b44fdde24d381fae5b", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.CompensationActivityRetentionConformance", codeSha256: "fdcc217b477b02664d0397cde89e689ec5d6ee6399eb6fb88b1680b2a3509be6", peakResidentKib: 782432, elapsedSeconds: 6.11, measurementReceiptSha256: "2f0eaf7cedd6422ad2c8b2db073da74383aa61db82a5f55891607af2a54115c6", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.UserTaskMetadataConformance", codeSha256: "2578abc0eebe5a376524e428f376fe55cbb4dc6958535fb3286b2bfc8713da20", peakResidentKib: 1112636, elapsedSeconds: 20.13, measurementReceiptSha256: "a5943450ca47bdb8f2bb931698281fd790511caaa40a4bfdf20be48ce238d7f2", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", codeSha256: "49e3e91811dc73425d3d608ce19de0bf6a93eae95e7c413ac35c6e24dc8c5ae4", peakResidentKib: 529148, elapsedSeconds: 2.1, measurementReceiptSha256: "4b66e80ade231f650c542af3af57d68fe05a8d20948a2e319b2ae96d00e84794", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", codeSha256: "5d0a4647aff165ed2b8948f080914e721c9bfbb300ccb1405181b4a78b723743", peakResidentKib: 535100, elapsedSeconds: 3.84, measurementReceiptSha256: "b49df227ed3bb13479505d92c4390585a47fbecf5bde383bd70265890e466f24", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", codeSha256: "7316d0de7fce308d4b51510479c3f2cdb675070efba61f174147b734020759fd", peakResidentKib: 459460, elapsedSeconds: 1.36, measurementReceiptSha256: "01b19c275d0f40081009b71ec070414b9ed620a47bebd8e3317b4dc8cdcb8954", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", codeSha256: "b4988388a667734f8112ad700a90fa98afb45735189d0696ae6b1d46ad7297c3", peakResidentKib: 458860, elapsedSeconds: 1.17, measurementReceiptSha256: "420147e77c32c618cb84bb8357703c1f5016e608d849db55e42b8b5af0c2baad", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.ActivityDataOutputConformance", codeSha256: "2b78a9e0d92981b35d5addd6763de95c2d37299f0c3e2e1b959c08256a705db7", peakResidentKib: 922580, elapsedSeconds: 6.64, measurementReceiptSha256: "e7abcff3e6ed05e9ae64e2560a7a0704b7e8e6b380439261c8dab8bd5ddc6d5b", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ReceiveTaskConformance", codeSha256: "57db9ed9cb1ae73719ec25195a0c3950224215b6d6da576abbe5bb554de773bf", peakResidentKib: 1189496, elapsedSeconds: 7.29, measurementReceiptSha256: "265792e272353657c3bf88524406680e45eb300806adac2c27c5e1ee10c5e106", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", codeSha256: "61032020e57231199b97e6b5f53b0e218a966b7fde1e5a2b8c9ed8d8d9a4fcd4", peakResidentKib: 448172, elapsedSeconds: 2.81, measurementReceiptSha256: "67d0e9d80e3707fff038f285e3b1cf7007448fd851eefd4d19cce174cd39b65e", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", codeSha256: "c9a06fa16bb018968e5585b23c876b01e19e6e985ad7c2b684ff0cce891a871b", peakResidentKib: 452684, elapsedSeconds: 8.6, measurementReceiptSha256: "3db0cd5fe310814229e0036512b401ffb03cf26fc3e3435fb21c61b567b5ca48", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotConformance", codeSha256: "02f8fdecb39ce9ff456cec5469944b7dca7a7d2a8881720b5de85a583e07a057", peakResidentKib: 463088, elapsedSeconds: 1.05, measurementReceiptSha256: "3e23ea379da2be8743126fc072ccbba79bdeabaa5d85b3d2af467b03652c23a0", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance", codeSha256: "13d7525827350358743e99be7b8c433fbff0e929425dad089076b8f3a90ddb26", peakResidentKib: 453188, elapsedSeconds: 1.07, measurementReceiptSha256: "d3080298aa75616f0030a842770fa878dad69cf4588acd8ebbb32c8e7e259db4", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance", codeSha256: "47eebc0fd0e1ce7f0f7ae02976406583d5e2bc04341dff42aca67bb3b16ad654", peakResidentKib: 457204, elapsedSeconds: 1.07, measurementReceiptSha256: "f7c358f7d3d5a3e4547d603fd6451d1493e992cfaa14a0343b2d4cb744e207fe", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance", codeSha256: "3b1911cd2690de747eee8c3331e1d4df40416cd1be3dc1f622c54f15a64fa874", peakResidentKib: 461596, elapsedSeconds: 1.6, measurementReceiptSha256: "ca09d01fc9c8b184b1964f2182eb2fdd73ab6dea84023e03cbb5d09a14e323dc", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance", codeSha256: "72262063b1468257ce8def92ac5954bab3cc26d1cbfcfcf5577105c536274da0", peakResidentKib: 446936, elapsedSeconds: 1.06, measurementReceiptSha256: "01dce3e0b61c64cd3f157f8447ff83a4148d9c873a75ec5fbaaf6c8047c764a1", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance", codeSha256: "d2330d7324ff28cd051f47b723e05ea7824459cd8daf8c6c0ce314db178374fc", peakResidentKib: 438048, elapsedSeconds: 1.06, measurementReceiptSha256: "25c52de80da4382e06180af7b4f58260bd2dc6942c638681b8e63b70f5aed553", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.UserTaskInteractionConformance", codeSha256: "9f1bc98b4ff073dd9a8ef39a93f3663f95d68ed42b531135ee67708bd041456a", peakResidentKib: 847192, elapsedSeconds: 5.18, measurementReceiptSha256: "e0cac54be1e1672b2b2a1f3173f808f1e4606964a9963554b1b88f9b195760d7", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", codeSha256: "25021a5612fdf408935f996e037761dcdf3c52daaa70b7fa2f7dc368dfb2b1ca", peakResidentKib: 463796, elapsedSeconds: 1.16, measurementReceiptSha256: "ed59ea16afb89b921e0b7ede6d9013f0b3854e0bf90227fdae4ad1922fbc5fc5", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", codeSha256: "6f4184e3f9582121dcf87049b2e633cfbe22a0003db16964dcaed9bf2414e44e", peakResidentKib: 1160296, elapsedSeconds: 9.17, measurementReceiptSha256: "2ed7d043a5cdd924944e9921edc67889967e6a9190846e5492bda4f214b87aef", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", codeSha256: "0e18b5b2402b0bc924e596d20fc64dbd1c2e0b48b392d771668cd065f5c386a2", peakResidentKib: 806720, elapsedSeconds: 5.82, measurementReceiptSha256: "719ff04f1743924d946f2e7df75f5e9b3c3d6295a5213a07818c5d5dda5c3ae5", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", codeSha256: "17d8c642ddc03d3f571e7fd03e5c0ff4dfc63784853f0775295e7ebf56602f7f", peakResidentKib: 449416, elapsedSeconds: 4.57, measurementReceiptSha256: "27535b36ec6d9143c8590983e9c24485f354ecfa741922a313d55ac093f483b2", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", codeSha256: "5ffe7ea0ae42ca468c3f0f6e6dcdcbf91abdc1ee08295fd74301658aed630948", peakResidentKib: 469940, elapsedSeconds: 1.06, measurementReceiptSha256: "70cebbfd3321bf990f4d26aa26f3419b9e4d47a82a3b4daf24e80b397a9a93bb", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.ActivityBoundaryMessageConformance", codeSha256: "f76da1a3d499e197979a6294961716e427a44eceaf742104e6113386936ffffd", peakResidentKib: 1255716, elapsedSeconds: 32.6, measurementReceiptSha256: "b5c95be13037a98dfa363c780962fcd8a5ae180618309e5c2e1be0d5f6e01908", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", codeSha256: "23d6ed3bc60831427fcd58c0cc8e6d1af0a73096833fb0aa6ee04ce3a9c39556", peakResidentKib: 956272, elapsedSeconds: 8.48, measurementReceiptSha256: "ed4a2a895a8a0d426e372e11e0de728998fc90f2b2fa759113fc5fce396b1328", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", codeSha256: "e34ca921a8b3b2082c36e90d5b35bf541c67dc9b92b194d5c90a76074d5f0c6a", peakResidentKib: 933556, elapsedSeconds: 8.44, measurementReceiptSha256: "b717aadfbd7cd0fc4f64fa36995ec3486ebe3c459750a52f1bb7aa060fd71988", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", codeSha256: "e981fa8605862e333d2524e66a4c71a8d564b44160f41226e585a215be716309", peakResidentKib: 445008, elapsedSeconds: 2.42, measurementReceiptSha256: "99df437a986cc86468ad05e7518cec7319fad71b369960685c3a3070c24e998f", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.StructuredHumanWorkConformance", codeSha256: "8d94b3a2967c17bb63c4d4fa034d47ac31c6b1a4134c87a7b7e68e7f6cd27cb5", peakResidentKib: 901388, elapsedSeconds: 5.06, measurementReceiptSha256: "a7a555643fb262a514114dc35141fcbc27a6b34c06e7b9e88817a5e49c295556", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", codeSha256: "565e41b9bdcaedfe1bc6fab68cfcfe5053ba8e5dad65247a60cf3f994c96585b", peakResidentKib: 782408, elapsedSeconds: 2.51, measurementReceiptSha256: "a7a203bf8b81d42294e0853c7bf759eff16fdf49a6270921ec4b72bdc7f3d329", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ProcessStartDataConformance", codeSha256: "5565d3c1d7191b7f28007e522f58f9bef836c0c4ceabbea9206820f70e51cc11", peakResidentKib: 581180, elapsedSeconds: 2.93, measurementReceiptSha256: "24935a8183e32fca1a777f6eb241ad5bd3d1b8c1d169bf2802b0945e61b48293", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ParallelMultiInstanceConformance", codeSha256: "3b321f0344ba619a4490ed90419c21088fe10f1fad605305fc68ce85f0dd098c", peakResidentKib: 477624, elapsedSeconds: 1.36, measurementReceiptSha256: "23cb1cc66cd8985697fa788d96e47a83d9758686229c2e56f57df5b2ba8f76c3", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", codeSha256: "c7a6d46204ba6a41096cfc940b5045fbbf5044cee18d9c5a54628143c9bc9b7f", peakResidentKib: 493740, elapsedSeconds: 6.18, measurementReceiptSha256: "cb69828a642fc9499049eb503f36a833ee334a675fbca75c11e409bfece188c1", measuredAtCommit: "d83a0fd01a7199d5462ae2cfcfdc1d2b3e94d0b4" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", codeSha256: "3c7e5807a654249cae8c87a06c16ba0591dc56ff883da918e327bd7a9d24ef83", peakResidentKib: 515888, elapsedSeconds: 3.43, measurementReceiptSha256: "1300837362e062e2c5b894b5d4735fe2bc0d10c9c4a448f3b8f0535dc4a87716", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", codeSha256: "274f9e71d63a11722490d0dee5f3030246c91a6a8d60d51130013ddef31c73c0", peakResidentKib: 561248, elapsedSeconds: 4.06, measurementReceiptSha256: "09c4f5aa3e769dcf8c331021cf397715f001976e6402087dce7ea11629b5ecc9", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", codeSha256: "3a681ad4eefe77bef753cac1ad794366f27d2e3b160649a94d58adf45db72752", peakResidentKib: 544840, elapsedSeconds: 2.32, measurementReceiptSha256: "36ece822f236e0dd48f122a79d3a04fce6fed95fa5b178e2ca5ab28483d989e9", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SemanticProcessJsonConformance", codeSha256: "b83ef1b9a1d0d96e99c9f487621c9c20d04c60cf87bc83ac90a199fca0d2d023", peakResidentKib: 487392, elapsedSeconds: 3.08, measurementReceiptSha256: "a2d26291d441f289e88b33d1be88835f450f58a8f4a74506b5e91ed3660e1d99", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance", codeSha256: "f377566a31e838767ce74618cfa801cd75b093a3b98d085db077d918240217e7",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", codeSha256: "378f0545ed655bfdc28ddba2bd9703ef98b0f7366a00031bc6f5fe21e5c31c05", peakResidentKib: 449952, elapsedSeconds: 0.85, measurementReceiptSha256: "f2c93d88448110560ccdb42cc240ba275b290f51b7e4e382e7e8338a33070459", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
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
