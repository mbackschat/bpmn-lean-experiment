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
    { module: "BpmnSemantics.SequentialScopeGraphConformance", codeSha256: "4c0c9a054dbe2bd06ba5e67bb3a13e35b6585eee8d0cb7c78318868e5fcdb664", peakResidentKib: 986364, elapsedSeconds: 34.76, measurementReceiptSha256: "f3dee178942535b7bc3548f0219d13ba57cf8636f7d05fe998c05ecb639b0573", measuredAtCommit: "c5e21004f2af59a4604debb43dd284b7d2058efc" },
    { module: "BpmnSemantics.ScopeVariableDataConformance", codeSha256: "ad789b3d3376931be907932cd7093efb5e824679889afaf83c859675784315cc", peakResidentKib: 359476, elapsedSeconds: 0.76, measurementReceiptSha256: "a1b06370e47e53e9728317c831b9a308261c8f29f356a85e97f884ff91b195f7", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.NestedScopeDataConformance", codeSha256: "d69a7b32b8bd21a2a418df2bc52bb287eed00fba90e123ef33006c771b47543e", peakResidentKib: 460356, elapsedSeconds: 1.68, measurementReceiptSha256: "a40e79610d64268ff0eadab954c916449e0701e95e1e4d20cc26401f57bb2810", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CallVariableMappingConformance", codeSha256: "a7b11c99d2732c9f68e7ca49fbc50d67722c45f15586995a6984b60a4383b0fa", peakResidentKib: 466336, elapsedSeconds: 1.15, measurementReceiptSha256: "35a15866362c72dd2702f39db4eb0ae20f236069222358c8b03fa32844b2ea9e", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.NestedScopeControlConformance", codeSha256: "96d6cba8814e9be9190c685f8fd7bd622605f278fc35bca8e111d3413af5ad93", peakResidentKib: 463704, elapsedSeconds: 1.26, measurementReceiptSha256: "6941b8b4da4c90a8691a51d472ae1813a0c58d85d6e37d38b8b5844d11bb80cf", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsAdmissionConformance", codeSha256: "28a17a0aa34a29bbd9c2e7d2d1f896b5b1bcd2134e00eb142f1de80623127831", peakResidentKib: 460096, elapsedSeconds: 0.95, measurementReceiptSha256: "cfee3bf3701e77801dc80a971b1b642d09ed89d58571a3f778399887c3b4ebca", measuredAtCommit: "1762dfb34c84ad0135a668cf643555a93bf5ab04" },
    { module: "BpmnSemantics.ConcurrentEmbeddedActivationsConformance", codeSha256: "71c27dcca07d9a623012670c5a53d32fb98f8c6c5444ce8a00d6f343c21fc9ce", peakResidentKib: 465464, elapsedSeconds: 1.05, measurementReceiptSha256: "2313829eab049130f18669276b63ee4553b0d3d761773091e3ba5f29cf7c466f", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ConcurrentScopeServiceTasksConformance", codeSha256: "3fcaf84b566ca02ed18f47791975765fbba62a699e5a541ac6fb3c6b1ee7d0b0", peakResidentKib: 468328, elapsedSeconds: 1.36, measurementReceiptSha256: "e0c1033abbf3243bcf3592b579d7987a909df96da5bbbb3fec7abe4faa00d146", measuredAtCommit: "1c78b8160cb50f211ee3b746688ff5f28b33925c" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsAdmissionConformance", codeSha256: "5baa6b9e5f25795662e569bac47329ad7dbe72835af668fcf81edb313608af6c", peakResidentKib: 452540, elapsedSeconds: 1.06, measurementReceiptSha256: "20fd26fb3434f085f05b4a4b8eb2bfaaf8c3bb7306e08b1d107259e9c3936def", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.RepeatedNestedConcurrentCallsConformance", codeSha256: "c806da73865394435194b9c062af9af308f53444f9827dfb5d25f745dd7c5de0", peakResidentKib: 462212, elapsedSeconds: 1.16, measurementReceiptSha256: "0c426b131cb37c881229a67b06c825c1d9f600f91832fb1aacc12be0de1705d0", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ParallelScopeRuntimeConformance", codeSha256: "5f42cdeb19343fd4e84402410fa8a54843e7aeae3ccf1b92bad261253cbedd17", peakResidentKib: 484912, elapsedSeconds: 2.39, measurementReceiptSha256: "f0debd9f055c24202d099dd0dd103885cf6a49091e5b652e209565b8cb278145", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ParallelScopeGraphConformance", codeSha256: "09a6bda6cdf7983abd11607e6a25ed125ec1ebcabe71374a06b81a9e1ca44d87", peakResidentKib: 628124, elapsedSeconds: 4.87, measurementReceiptSha256: "384fd8e23cfd1e2c3ebcff3b8f1ff0c3bab2040a77d93572229c56dad208bc10", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.MixedTaskBusinessErrorConformance", codeSha256: "599c4d8b69174a220afc98ec1422cd01b04cbc842e056be833dc569478e8bb81", peakResidentKib: 475452, elapsedSeconds: 2.23, measurementReceiptSha256: "fbde48654758ba4c85a3eae1cd3de72d9e5282aa31acf67d9c4df1b256f7a566", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.SerialBusinessTaskConformance", codeSha256: "76f1e393e577f9eff104bd68c5ff5d7886b0cacf98810b2d1451e99fde22323a", peakResidentKib: 468476, elapsedSeconds: 1.47, measurementReceiptSha256: "70168dd9063d106728cf0d97cf9f3e50cd50a3ed9adc12902f2c00449d481618", measuredAtCommit: "c5e21004f2af59a4604debb43dd284b7d2058efc" },
    { module: "BpmnSemantics.InterruptingMessageEventSubProcessConformance", codeSha256: "530f890c3e8c62d33fcc6a92c6f83444a0cfb086f2eba8feedc563b4e1759a00", peakResidentKib: 1414532, elapsedSeconds: 26.85, measurementReceiptSha256: "08db3a29acaa30d4f3717f41f578420e1bc600f9ab5b5fef9f9598112452e72c", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CallActivityDataBoundariesConformance", codeSha256: "128c32c3ab76eaab7fb7778519a06c3e1d29eb779e2946d5791ff76bc633ac94", peakResidentKib: 494136, elapsedSeconds: 1.76, measurementReceiptSha256: "f0be5256601104ba0dbc686c16b21640be1243e86791670439aa3713854d41f6", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.StructuredCompositionAdmissionConformance", codeSha256: "3fc433313305cea4199ab955a56627a2e81a817f77aa31830f40e62a102fe023", peakResidentKib: 412792, elapsedSeconds: 5.36, measurementReceiptSha256: "f813fc5d8aac1a940558d7f926acf675c540f449877c93fa3e1b44ed7499b703", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.StructuredCompositionCommandConformance", codeSha256: "5b6ea58eca556fc62d9d58eaa86d2d872d2f8814b4dfcd148500b4453105290e", peakResidentKib: 592856, elapsedSeconds: 1.89, measurementReceiptSha256: "d864f7eca261b9dc18f6f64ee9741d8aec4d3a13e09411889e81481e673ddfab", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.PortableHandoffConformance", codeSha256: "661eb08d5d485c62f84467bd9b112390f94cfc244d592ece10f65966f78e2606", peakResidentKib: 461216, elapsedSeconds: 1.06, measurementReceiptSha256: "5000c774554f712e5a4b04e362c85ff6af128b4887d4088aac6e18e025739254", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.EffectDataConformance", codeSha256: "ad6e84355abcff8dbeb2dfd09a515a2aa2341cd09a629a1f654256c91658ee73", peakResidentKib: 458504, elapsedSeconds: 1.27, measurementReceiptSha256: "77a20af82a8224bea060c41388921bad4827716af94786c6b19a5977254e0213", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.TransactionSourceConformance", codeSha256: "7e89255704e0e71f12feafd3fa8981e69375b9727884b243a6db9a04cc695493", peakResidentKib: 1066648, elapsedSeconds: 4.88, measurementReceiptSha256: "4585ce5fba64400aa3c0ec422d10eda9a4c80df62cb1552238cfe26ee7336521", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.TransactionSourceArmingConformance", codeSha256: "0d18dc6dfb32a187fd4f48f650e4faa34158380223073beb4ab59699f228fe67", peakResidentKib: 1178480, elapsedSeconds: 16.43, measurementReceiptSha256: "b06f40313157b713e58f496629e8c08190e3958d22021dd94fde3bc4dfdc9927", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.InternalRegionalHandlerPublicationConformance", codeSha256: "699e3eac1021ac0fd7d7371accbeae7fbbfdf8143e81981491b01f625d0ec114", peakResidentKib: 456256, elapsedSeconds: 1.93, measurementReceiptSha256: "49783523cb2cb8aa8fd756011dbabb9913cd87d4fdaa90a91f76ce7c1e79b2e6", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.TransactionCancellationJoinPublicationConformance", codeSha256: "eb9d7b8f381af4782181c377f4350505141936548398b24af96b5bb50c493c45", peakResidentKib: 446840, elapsedSeconds: 0.96, measurementReceiptSha256: "532de65f0733245572edabf911a8824c73c009c9997cebf8618a78fbd4b44991", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationTerminalPublicationConformance", codeSha256: "0196db8c95f6d8fadcad309e923ef5f1267c47c97e922482db40dbe7f59c9b19", peakResidentKib: 438828, elapsedSeconds: 2.84, measurementReceiptSha256: "1dd00f406b430e19873ec6c317548e3aef3f5019d1f71b3f9e07c72ac84cf9f3", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.TransactionCancellationPublicationConformance", codeSha256: "be62ee5d7a0a99780d0168271862a13eec2845f28dedfaabc085757bf1874022", peakResidentKib: 435036, elapsedSeconds: 0.97, measurementReceiptSha256: "765088c89018917ca69dd54c6c080a276e4ae455ae9e9b03faada890b6176cce", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationConformance", codeSha256: "82cf372ce346746ce1fbddab05394129471b3265fefa482db973610dbd236f71", peakResidentKib: 571152, elapsedSeconds: 3.24, measurementReceiptSha256: "5af3028cd77438edaeef647202fc74819f699b8675b3aa0d93446f3a51d8f56a", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.TransactionRetentionConformance", codeSha256: "cd040f5cba59cdc417710db7ac3b29416642734408209e1d22715812a37cf74b", peakResidentKib: 400568, elapsedSeconds: 1.48, measurementReceiptSha256: "d1c4c9df0858767dc3da37d7cbf80dad63a6cec49fbc977e014edcb3bb858d7f", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.TransactionCancellationStartConformance", codeSha256: "8061a7afc102ed5f85ab2460be714aaba37ed0823728f2abb491bc6d82bd5abc", peakResidentKib: 444020, elapsedSeconds: 2.3, measurementReceiptSha256: "1f891d3528648eb459a6e1d010711acd917482be52d7925673b1f3f26f9a2085", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TransactionCancellationRetentionPublicationConformance", codeSha256: "43dd8f8c6c2091ee28b156ff266ff701326ecc3758797d5032124b446df0b60a", peakResidentKib: 444196, elapsedSeconds: 0.95, measurementReceiptSha256: "729a44ac794fe4591f876ee6a534b587cf50351b710993a621069bc9fb299c0a", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationActivePublicationConformance", codeSha256: "ff57494b4ee3ec643f3e3fd1d2f39f90251c5c00e735c9a03af5397fb54fe3cd", peakResidentKib: 444548, elapsedSeconds: 0.96, measurementReceiptSha256: "72a24c4cb00836317afb2fdc4e97969258820b9e6c86e94c534df35e1c28be8a", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.TransactionCancellationEmptyPublicationConformance", codeSha256: "01f00f00b854d657642d19ee85313e664e75b0d69d018d5fd31d87732b78aa3a", peakResidentKib: 444152, elapsedSeconds: 1.92, measurementReceiptSha256: "e77224b4484f6dc4a51c137c3036ceb4094b1b4f4503f0bffffeb053fee310e8", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.TransactionCancellationFailurePublicationConformance", codeSha256: "7b8165600c2c59c167139a7a020b4f1e5012adbd8abc247fd47ca6338691e7d9", peakResidentKib: 444460, elapsedSeconds: 0.96, measurementReceiptSha256: "6ae040f8bb065d8138ada5b7863d9ac14f3d0402f12d7c16ef2bec2dc8a0313b", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.SubscribedScopeCancellationConformance", codeSha256: "ed07c57af999c114bffba9a71489248b070c000389480478f0343c40f8c09ea5", peakResidentKib: 382016, elapsedSeconds: 0.57, measurementReceiptSha256: "baf62e54521f136171dfc912a5dacbb5b9573435dcafb6b10ff73b2ce7b206ca", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.RecurringTimerLifetimeConformance", codeSha256: "4f70773ef1a1e59693ffb356e6f1c7a0af4fa70c540046914965050e84f6656c", peakResidentKib: 451580, elapsedSeconds: 1.18, measurementReceiptSha256: "acd0ef729389798d0fe6769570d53848dcb0b2442c0f4f84eaf88f48f23787a8", measuredAtCommit: "3875d8ae3d11faff1bb5a10092e2639823e2bdb2" },
    { module: "BpmnSemantics.RepeatableMessageLifetimeConformance", codeSha256: "6e24380bdb9b1da6c34a41f3b128c6033998db0e95b24479f8fd3c799dc45021", peakResidentKib: 1017620, elapsedSeconds: 7.64, measurementReceiptSha256: "318836355fa5795ff5d0c4e3e67c27993702ed0c166770d96244d7f969516623", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance", codeSha256: "8b2cde5052e9faf3e48f2f47f9264cf5078237245f047fb49d73868d6308bb02", peakResidentKib: 1213540, elapsedSeconds: 11.58, measurementReceiptSha256: "fc1e399054cff54e169835b487846768d0059995e1428eeb3e2effaf5f99657b", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SnapshotInternalArmingConformance", codeSha256: "ee1708b91b6d45bac950df79b2f82e37da96470d2159458e3c62637bc8a08ae7", peakResidentKib: 792076, elapsedSeconds: 3.32, measurementReceiptSha256: "acab791d8bbf40750c9e0368889f3622905fd1655977ae71f46701e947d61808", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.SnapshotInternalArmingSourceConformance", codeSha256: "445f13e2f05a1dffb10eecc74ddf6592a949856cdcef0be329fcbbd0f62e2729", peakResidentKib: 449716, elapsedSeconds: 1.05, measurementReceiptSha256: "45fd777c5f4481909ebea83c77006ef9d9d8316f7ba28dd38042422f75e5b8ea", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.BoundedScopeActivityIdentityConformance", codeSha256: "7400411a517c84a36923e59c40d32f79dddc7220d19d7a862af197dc3b1781f6", peakResidentKib: 454296, elapsedSeconds: 1.27, measurementReceiptSha256: "51869a30dacfa974623aa99bb2d87f28c75b225530c9675a2bf0f883f8384910", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalTimerTaskBatchConformance", codeSha256: "40c1d68c8295b064818fd114ca7a011d40056fc3c699ab5c5c138a9b389a9738", peakResidentKib: 1762368, elapsedSeconds: 42.97, measurementReceiptSha256: "c619b204f172db5b8706d9cd7879980832dd525e3ab4359bd369943ee01ebaf8", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.InternalRegionalPrivateTimerAliasConformance", codeSha256: "5315595418999550ebe06d9e2f459db5a1804e9a6aaebcfbb351d36e24a61220", peakResidentKib: 452776, elapsedSeconds: 3.96, measurementReceiptSha256: "45788fc4a90f7a2ca59d9bc285aa45e7eabfcaaa52691950d7b017c430e3c678", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.BoundaryTimerProjectionConformance", codeSha256: "c96dd3c9f573c579dbbd490df7d2564d00a3abbd0acc426ba53a3a05898fb195", peakResidentKib: 1064888, elapsedSeconds: 10.66, measurementReceiptSha256: "be3fcec271ec6a236572afc9cc167f9f98db7911053aa11ecab8e0d050f2518a", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InternalRegionalCancellationProjectionConformance", codeSha256: "010f2a3469befbeb524ec1a01176c176b3d0720746cbf4be90c087dbe0140752", peakResidentKib: 466488, elapsedSeconds: 1.49, measurementReceiptSha256: "116aff13ba1e260af12c87b9b9c3bdbae5b6477f85dcc105c6d5becdc9333db4", measuredAtCommit: "2fd5da3b85e4d9bfe921fc5cf74285ba17418086" },
    { module: "BpmnSemantics.ScopeCreationMixedBatchConformance", codeSha256: "2d07beddf4296fe0d0a907ba7d8a3727cb0942826b0f7a4ed248354102be00c3", peakResidentKib: 467080, elapsedSeconds: 1.17, measurementReceiptSha256: "67539d8da45d92c61dedf980bad7a13c136a04c119799beb8a06037000fcdb6d", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.InternalScopeCreationFrameConformance", codeSha256: "b9e1f8a4c2aee8b5fc7ba012ee9188a50a347e97f8e0a34324803a57daf52968", peakResidentKib: 1134028, elapsedSeconds: 24.84, measurementReceiptSha256: "5c52aab0dd2943d96f7383df16b59772fd7f0c11bfd7894a340abe57899e537b", measuredAtCommit: "c5e21004f2af59a4604debb43dd284b7d2058efc" },
    { module: "BpmnSemantics.ScopeCreationCompensationValidityConformance", codeSha256: "f841f1d35dd843e6424c3478f98474ad91d37e3c72a8677729b3a11bd587540e", peakResidentKib: 854880, elapsedSeconds: 3.26, measurementReceiptSha256: "d7fb2c6ba2587c1305b98001ac7d364bf668d1dca764b83b4cc2b4dddee4e16f", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.InternalScopeCreationValidityConformance", codeSha256: "426f315b21ece6fbbe892a6a7ff216ca08b6f92b1fb9d35edcb95ab7347e0bbb", peakResidentKib: 455844, elapsedSeconds: 1.16, measurementReceiptSha256: "7a9bab46d8d218b864dad7c4bdddf833cb86422458253db121ea232ec3b98c92", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.InternalScopeCreationPreparationConformance", codeSha256: "e3c0ef15abe8712b7014f4cfcf9bca6dc82a728db7e0a444b6170c72f157ee2b", peakResidentKib: 442920, elapsedSeconds: 1.06, measurementReceiptSha256: "15828a9169239b48c195ed34e8a58525f6693601d52c515e2cb498589b7f2df8", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.InternalScopeCreationSelectionConformance", codeSha256: "653f3e5cf2a6896d0f54ab5dd29b85a791d3efb0b833b5755e8a28091925b858", peakResidentKib: 425296, elapsedSeconds: 0.85, measurementReceiptSha256: "2dbf5564077726dceccccf06ef70f28b65965ece7aed60b37ad963f8fd09162c", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.ScopeStorageOrderConformance", codeSha256: "ee914b50bcef59eec0f325bf8b4bb17f9a1391ea37be852caedbed0b9791dba4", peakResidentKib: 406084, elapsedSeconds: 0.76, measurementReceiptSha256: "e4a4dfc2bf48fa78d603e56b2c99d1a44665870df974a815a758841a6dc84f2e", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.MixedLocalControlClosureConformance", codeSha256: "769a3ea72ca19974e538dffec23487d117535f9ac0c2f7f95ef7f4c69374deac", peakResidentKib: 1402436, elapsedSeconds: 8.22, measurementReceiptSha256: "c82335a51548a0cc5818353201098d51046f6426cb2748989ec739397cb5e59c", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.FiniteInternalTransitionConformance", codeSha256: "80f24e30df36031b410e7f5be55fa4a1208454e0ce7d0412e0e4415b66de3c10", peakResidentKib: 1086512, elapsedSeconds: 10.37, measurementReceiptSha256: "bad5f53429ab43b059975f7064b4b5e58c970069f9733858098be0ad60bf2927", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.InclusiveGatewayPairingConformance", codeSha256: "ec2c887957b18719758a7953c58a08828a797f49e5fc29419bb4a501900479bc", peakResidentKib: 404376, elapsedSeconds: 5.91, measurementReceiptSha256: "7b7ee830fac9a91c87d11ab08afbaf71fbb550dbe0a41d337b30cfe60f20bdcd", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CanonicalTokenStorageConformance", codeSha256: "ae5f4cb4d0b55fc98bf456feb6e20b486be343ab76e4266bcb3b7b12f1060db3", peakResidentKib: 459252, elapsedSeconds: 1.16, measurementReceiptSha256: "a933a38b692246d1385ef0c1553ea80aba1b155cc51422412196efbb61df0804", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.FiniteInternalArmingConformance", codeSha256: "0793525f9490498627e2358f82661b677648a769c5c191381c0c7b713445615f", peakResidentKib: 988740, elapsedSeconds: 5.53, measurementReceiptSha256: "6a86138159afc8c80cb4ffac40e771509ace05081f6bec03d3d0a7f0f462f8c6", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ActivityActivationOrderConformance", codeSha256: "bed3b9a43af42d87534172e2a3a5f9c2a527bde93d5083711e8df4426d9662a6", peakResidentKib: 402208, elapsedSeconds: 1.31, measurementReceiptSha256: "e148bf2d31ec01b7a5b94e097efe7f48c18ca15294fd3fef5f8ae6a3336e719b", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.MessageStartAdmissionConformance", codeSha256: "5efcb2329e16ede7c33fc1d7b93de1e64310a9d5ee7bac73436f56e82f3d61d5", peakResidentKib: 996560, elapsedSeconds: 9.6, measurementReceiptSha256: "c3ea63e2c830f10f4b4fd415a0026a9c69a7aaea2fc4f1c6fd8dcbb5dee22734", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.MessageStartClosureConformance", codeSha256: "69e33d3bf3c43bb79ba20a7abb241621335e5ca9bcf86bde6eab71138eca5df4", peakResidentKib: 874284, elapsedSeconds: 3.24, measurementReceiptSha256: "27ee9b12f8f961797f801a2b77a198910af428a92314e5d3d5b1cc8c03e45bf8", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.MessageStartIdentityConformance", codeSha256: "79adca7aa8c57f442c5bd5c887944a31b547ccf740289abffd5c69d89b296cfd", peakResidentKib: 880752, elapsedSeconds: 5.88, measurementReceiptSha256: "b3da2762cbaf0bbcf5803b906c9d36557e0b77ca66c6d66407349c3c712f5b91", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.MessageStartScenarioConformance", codeSha256: "adca39a77f48095880d4a69c306dde86dc81436a79b829181d9a9ca9107caa12", peakResidentKib: 1150832, elapsedSeconds: 3.95, measurementReceiptSha256: "d17c258a12f66d94ff94f507fd9f649fff0c55c1f1c40f23c7fa167896f1ca4b", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.MessageStartConformance", codeSha256: "b0af696a951c386d29f76b87630266e422632d878f337964abe74968c8f7215e", peakResidentKib: 439412, elapsedSeconds: 0.95, measurementReceiptSha256: "0de11f22047c0e740137f013adf45c01ab572f7a51ef4365c886ea61b896e668", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.MessagePayloadCatchConformance", codeSha256: "ae7b52504f9434cde83c9c1559e3fe7c32108451433068f0fc689797eefbeb47", peakResidentKib: 1064312, elapsedSeconds: 7.59, measurementReceiptSha256: "4a38348e933907f5f8eb67c51120a7bea5ea731ce197972f70c53226fcf22fb6", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.PortableMessagePayloadConformance", codeSha256: "d5841b478e3d4b2269c7ffe753e3e9aaf6a899931b238c67f267af14433990aa", peakResidentKib: 1213284, elapsedSeconds: 16.09, measurementReceiptSha256: "a8f0fa91ed4b8e6f754c7800c2a918afa70366d1b06b3f09218258f2e11b8073", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.SequentialMultiInstanceConformance", codeSha256: "e5d4cbac5fe57ba61b3f8594dca778cc88587d640516f56d9a235fd73b27191a", peakResidentKib: 435816, elapsedSeconds: 1.2, measurementReceiptSha256: "67bfbe81b0e557c8f24cabfda47adb1ddfd5595c1e663820b5b59d774fc4dff7", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgressConformance", codeSha256: "31d1f29e214fa12909e828b7e774be165c24843dadc9d27779c64acbeb04ff5c", peakResidentKib: 620824, elapsedSeconds: 2.04, measurementReceiptSha256: "da33a7cf8e23c64c4c2d4c2a7f59e1f0a703b3047eefe71b4477c9b6e902c442", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.SequentialMultiInstanceRuntimeConformance", codeSha256: "f93f4c4f25002f34bfc0abe8cd9c50732b3f6eafba55ce61849a3be5243d6a53", peakResidentKib: 644116, elapsedSeconds: 2.65, measurementReceiptSha256: "b865efb7424e6edfbbaa5b54f0ab91df0fd43b3c2042e3cc6d862642f494b646", measuredAtCommit: "c5e21004f2af59a4604debb43dd284b7d2058efc" },
    { module: "BpmnSemantics.SequentialMultiInstanceRefusalConformance", codeSha256: "42c48408f54ebf5d60eb110f5f2ce5726f5d467969641ba4c42cec567012839c", peakResidentKib: 626456, elapsedSeconds: 1.57, measurementReceiptSha256: "8a5222e1fa547bcb90eb70ccf069c7bf8592bffc45a28b385d8731deed17a0e0", measuredAtCommit: "c5e21004f2af59a4604debb43dd284b7d2058efc" },
    { module: "BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance", codeSha256: "f338bf1eef604781bfacceeeeb449d5c0cc8682518d1c6425eb65bf5cb598fbc", peakResidentKib: 457268, elapsedSeconds: 0.95, measurementReceiptSha256: "0d9b14b1a2881adef3fb0509b92a1dece148be801bbf5508a661b8c33789aec7", measuredAtCommit: "2fd5da3b85e4d9bfe921fc5cf74285ba17418086" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance", codeSha256: "73fce35b8406ec701aa255788ff009ba40244749fa186f8ce900b7a569207f60", peakResidentKib: 439892, elapsedSeconds: 11.98, measurementReceiptSha256: "33df23b8824218360d30bf6946895b61801bfdbc02e51317f1807ad1b738ae50", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance", codeSha256: "a6919f4c1767257321eefe56c43ea013ec924c85e5231e91b5f7c1c4db0f11ab", peakResidentKib: 452304, elapsedSeconds: 2.21, measurementReceiptSha256: "91c56a3e3a17022b308a716b4d354d85be81534c2023702d7a333552b5c6ad6c", measuredAtCommit: "49f2f085b5c975b05be90eaf5f185c91c1e472d2" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance", codeSha256: "48cd32892f3782821eec8ce288273d532f6244635784ed624f53a9405375901c", peakResidentKib: 821436, elapsedSeconds: 2.96, measurementReceiptSha256: "c8ae5c73541cf4cca3d5b353b501420a9711a3c38287b6c4fd62b8c65de64388", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance", codeSha256: "2ebe0dd9cd6a163642795e06f432ee5faec103097aa014b303fa7452dfea65a0", peakResidentKib: 445764, elapsedSeconds: 1.38, measurementReceiptSha256: "4f3298e89953386f7b882cd59cea7b3af73d86a278587a74180603f0c05ca112", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance", codeSha256: "2d8129e35fc743343fe1934b21250a00715d0c4e894dbf5db8bc7f99fc233d18", peakResidentKib: 1562932, elapsedSeconds: 13.64, measurementReceiptSha256: "b4e310476261bd36f8e0683c3178618938550162497cead8506f6b56be5a2380", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecyclePropagatedErrorConformance", codeSha256: "d21c68380dc93ee71e763bdded8738b5157255257120d2b7f3b56a2147d47d86", peakResidentKib: 447464, elapsedSeconds: 1.06, measurementReceiptSha256: "4e2b1a5181163e6039c7dc033f6a1adcceb73e800d512846e77bc6fae682317e", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance", codeSha256: "5a460a2cb7dfb7488f66906bf4e59faa594c48d62a7477afd3851e2fd76adfa2", peakResidentKib: 1295964, elapsedSeconds: 11.4, measurementReceiptSha256: "0370ab561a619de71548cef002c0512112b2efbb80ef92a3930be2634aea0f9d", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance", codeSha256: "10ebd8694eb9abfc0c354e4687adab1e3aca9c069a459b5ac3c50f55187d9f92", peakResidentKib: 443740, elapsedSeconds: 0.95, measurementReceiptSha256: "1e2ec69f8eb92cff5cd7d4b2b2d2f097c1a7895e363eba7969e924524a8825c3", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.RuntimeStateWellFormedConformance", codeSha256: "fdb53f579abee3fd939596d98f058f42afcafc54cc0cb852f913009a00f89be0", peakResidentKib: 435568, elapsedSeconds: 1.59, measurementReceiptSha256: "5b7c929ec9350b8429f9b0a0a3e01ea5a89c3de5ee4e422df17a40132ac7457b", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.RuntimeStateWellFormedInvariantConformance", codeSha256: "f0582ca1d3166cf0989c286f6c7141bc18bc0a1c3b0e8029147ee382327a2410", peakResidentKib: 450388, elapsedSeconds: 3.26, measurementReceiptSha256: "1023b91fa70b739474a18d78a33d0af08fee8f0f07e56871bc4ab3c331d7cff3", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateWellFormedEventRaceConformance", codeSha256: "d5b2a094bbaa47c72c994a898cf71bc7ab82d6fe1db4a585f307ab4ddcbb5c6d", peakResidentKib: 443088, elapsedSeconds: 2.81, measurementReceiptSha256: "4caa2bf4bb96a16d1d688b702ad354c2f5b380c98150b51d95d6156b859ba56e", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateWellFormedSuccessorConformance", codeSha256: "c312a1fc0789246374b180fe823e5537d04681e2625748d4be737ed499434a5c", peakResidentKib: 723560, elapsedSeconds: 5.68, measurementReceiptSha256: "7364ac0e62a0107603bf5e025637cc6df16d7efc3443c59224faba3d09a73727", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.CallActivityConformance", codeSha256: "b23f5d02c31bdba18c4147176d2b1f0a65e9ae0e51e62c6833c56cf1e2912053", peakResidentKib: 464236, elapsedSeconds: 3.0, measurementReceiptSha256: "181c4031ee39433593b76dfbb3a740ef11a5485074ad0478f8520fe5292971ff", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.CallActivityPairingConformance", codeSha256: "313e3a4f749b0356baffcef7b2fb6fca17a89622264bb6b570d1d236d4a5ff10", peakResidentKib: 448532, elapsedSeconds: 0.95, measurementReceiptSha256: "716dd2501cc78915af72dbe8c67609e091fda91f0a1ca226889f51fefa353972", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance", codeSha256: "9cf1ecce63b38a566e4b467ef882d272f06f446881dd5ff8d65bc303d45d6025", peakResidentKib: 1027732, elapsedSeconds: 9.75, measurementReceiptSha256: "788b79f0c0dd12e81e530b94582f68cdc9a13f70c9693b5fb5fcbabdd0bad648", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.TimerStartConformance", codeSha256: "af19f5907a50bbbb41f26996c1a20a55aa7eda3323e2dfcb7d9f50440cc09423", peakResidentKib: 1141688, elapsedSeconds: 19.51, measurementReceiptSha256: "dbf17b3769671d673548dd80cf1c21b05baf5f64499838c0000fe7e3f12a91a4", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance", codeSha256: "5e4d4f4c34614944c1500e8b68f7d5ed80887317c9ec4151a279c19d876a5449", peakResidentKib: 1492828, elapsedSeconds: 42.15, measurementReceiptSha256: "c9284cc0a94bddcfcd83e89f232eae8a8c8b22acdc7d3aaf1aac5431ed2aa33e", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.RuntimeStateActivityConformance", codeSha256: "d5967e51d77067d6a36a9ffbfe32d7856dfb46fffbf17e38274ca11a894dcaec", peakResidentKib: 414296, elapsedSeconds: 4.1, measurementReceiptSha256: "1dd8ff081f0bc8a11ddb7184e549dbac2e0c7e976f6b8af430a15ead9e2c7d12", measuredAtCommit: "f0d1d0300c2a07bb96a18c76c3a00a7f3e53dee1" },
    { module: "BpmnSemantics.RuntimeStateActivityOccurrenceConformance", codeSha256: "dd9334f85a4d46e33dfdda93ec53ce6540268fb8f0df9ab35de50c108821233a", peakResidentKib: 1032248, elapsedSeconds: 3.4, measurementReceiptSha256: "e5e296bd16cfc6de15192b00c5715e8c394cb314d608d8b70d5cb6a63fb92381", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.RuntimeStateInitializationConformance", codeSha256: "4892a3bfc0364f75195880dfb269bd1942dc57c1c2114b231383474172f0a436", peakResidentKib: 736652, elapsedSeconds: 2.02, measurementReceiptSha256: "6d581838fb2906fce6be2f1bcc5851fcdbe1c39dc174895a732cdb45b86f3b81", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ScopeCancellationConformance", codeSha256: "651128cf9bf7384dfbd88b221aba2059755806415209b3b1ee9dfd486dc2ccf9", peakResidentKib: 385700, elapsedSeconds: 0.55, measurementReceiptSha256: "2fcde43431d737f06313c761b440e29cb3e7d1f5f35015e56c05f86479918ee9", measuredAtCommit: "53be1372cd4328a1938be78acfbdab04b6b6845b" },
    { module: "BpmnSemantics.ScopeCompletionConformance", codeSha256: "1134ac82c48b8348933559b2b3fac383e544af085b97db3ed35ef7782af8abc4", peakResidentKib: 395744, elapsedSeconds: 2.32, measurementReceiptSha256: "77bbb35f4359898a7ac6426957fb5bc8db850f39a8c5f1e17432626b8cbba21c", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.RuntimeStateControllerConformance", codeSha256: "82a83a82d722a2a27b644c8ee021d724fd792d85e57861b721ddf32339b87b00", peakResidentKib: 457288, elapsedSeconds: 1.38, measurementReceiptSha256: "1334eb84f4010938690bf3f7dfc64a0a60497f40a0be922dfdd076e2d68ae493", measuredAtCommit: "2fd5da3b85e4d9bfe921fc5cf74285ba17418086" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", codeSha256: "40734ea3e99b8ee2dbd506e1a37da1b57dd676379d17115cad057d095e1ced93", peakResidentKib: 437940, elapsedSeconds: 1.4, measurementReceiptSha256: "cbafc94e92b13bff94f602bf03e3feb247b26e6b80175a599a7aac85ba66a3d7", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance", codeSha256: "4024a395df05b32ee22dcc14f45e8d2fa313490871a43fdf0aebcbdbd5a94736", peakResidentKib: 556868, elapsedSeconds: 3.22, measurementReceiptSha256: "71ee3996d0f0793a85a300fbec82e9dd7c3a2071f895b5d587869b1ea14e49d1", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance", codeSha256: "d9db6ebe882e732ee332abb5c88e19638783fe4534e0188ff663b110fbfa2cdf", peakResidentKib: 444672, elapsedSeconds: 5.06, measurementReceiptSha256: "eaf7ce8f4d629a7af1c33d57726d34da7713e4d4d6f463170f8dd47ca9a20916", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance", codeSha256: "59a7f477d5e07fa25b826fa405b8b476771896c80d61b8b10940db2178453be1", peakResidentKib: 1331984, elapsedSeconds: 6.4, measurementReceiptSha256: "0ec81de20d776ebbd0224974be6ae2b96952ee4101aabf81d89e6e37b27917d5", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SemanticProcessAdmissionConformance", codeSha256: "5d7a5b7dd844569695e0f81d4da91d1e2629a550ae74a4fd96a83bf5bfbd451d", peakResidentKib: 622628, elapsedSeconds: 3.03, measurementReceiptSha256: "c76392e9e70f838cb55dd1b7926f83a37cd6f38dece0d3fcf447fc4c67fd4aff", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.EventBasedGatewayConformance", codeSha256: "5a17636eb7e58d9fd6ef3ff4243994279fc71f68aed3e80a936c501960a73141", peakResidentKib: 1221712, elapsedSeconds: 8.35, measurementReceiptSha256: "cd1b726474cb66cf7d5f98c301cb270634ecc67a774897994b33df127ace4b6c", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", codeSha256: "39158c9f3cf696aee9b1f0d2aef0061d6c7d7fc3e3f6c3efdd04a7cdd72cc9ad", peakResidentKib: 461296, elapsedSeconds: 1.28, measurementReceiptSha256: "7fcc6081ef0ba92512a6e63dd2b05aff746e6a2175322912d9507b8cb014376b", measuredAtCommit: "a25f3c512863dcfae51b1caad739cd6bbe68aac0" },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", codeSha256: "70ac510c7da2a86be61397d76cb74fcde0b40655d34f16e071727d775e8f8fa9", peakResidentKib: 1297816, elapsedSeconds: 13.72, measurementReceiptSha256: "1710ecc20997f910dafcdf56144b4eb68ef4e11e0213735cede5f7ca829e44a6", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.CommittedExecutionPublicationConformance", codeSha256: "4c7c06d74828c8212c150e2f8d7171349fba119cae5707d1d37a544e827973aa", peakResidentKib: 784368, elapsedSeconds: 4.47, measurementReceiptSha256: "e8d59b80605f2070ac542ac97d75495252f75916ae4d083d3754de964420c183", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", codeSha256: "e5a5f7229357528fc172516c7fa69c6e8b8d2fb238a317814c4a9802edbd2435", peakResidentKib: 1146804, elapsedSeconds: 4.97, measurementReceiptSha256: "fe3913086f964fce8409c8b4166a39e4f08e78d5d92ddfc62c1ec64f6774f8cf", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.TerminateEndEventConformance", codeSha256: "0685166769d81a2df08eb9460ed97efaeac43b3db5ccc88ca38fa7adc4e3a0e9", peakResidentKib: 720340, elapsedSeconds: 4.4, measurementReceiptSha256: "b59f0297406563b3df7ac8f2fe0c6686e6273c7ae4e5603720bfc2e5ce75e278", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.RegionalRemovalOwnerCoverageConformance", codeSha256: "b912f3c8e5fb8795ae18a3d37b604a30f37a9b48894a35a3f868cb946c04b404", peakResidentKib: 683844, elapsedSeconds: 3.54, measurementReceiptSha256: "80430bdd194503d023edf9e6c2ae5b38a837146325e445ad17813c7f97b518e1", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.SemanticProcessConformance", codeSha256: "ef1b2a97dab2fd456077a9657d40b52f2e48815b3eed1d8f2c1cae4a3ccff2a9", peakResidentKib: 448676, elapsedSeconds: 1.38, measurementReceiptSha256: "0518be1e742ed60a5089a5ee56e34e937cc72cd04c183da7d6832067558a535a", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", codeSha256: "3d4f228b2b31761500830122acded69af584650fb813dfe8277df88ea14f4369", peakResidentKib: 921844, elapsedSeconds: 19.37, measurementReceiptSha256: "2890027f6cb3cc7017498603f877c363c49ddabc2be29c4eb1173fe188040032", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", codeSha256: "01ac2bac0cdd52d31e46ae5ad6e70af2e112fa4b5d328ebd5afe40e688f6dc03", peakResidentKib: 1112600, elapsedSeconds: 14.83, measurementReceiptSha256: "a600ed50dc0bc501aee038ffd72e6e7b44d76f57624209a83e17ab1aad06ea53", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.ActivityDataInputConformance", codeSha256: "8be8a25045b014022e5a5abbaf2bcd69436c74f4318a9865d5017be662a9a714", peakResidentKib: 898140, elapsedSeconds: 9.87, measurementReceiptSha256: "e2f47b59e6216ba0229c9dfafeaffbf23818240597ae2e41503d742f2efbaced", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", codeSha256: "370942512db846aa6319c9cf62127438a9a1ee5a973917b2ad8b2e206b233c54", peakResidentKib: 1067324, elapsedSeconds: 19.65, measurementReceiptSha256: "5c40604bdda22e4743c8a787663e2b2adf19272156aa6f804bdcced5a7879201", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.MappedSuccessConformance", codeSha256: "b9354c211eecdc67a9cd668f348aa64e43a8db73df68ee4be31353fc62491bdb", peakResidentKib: 916908, elapsedSeconds: 6.85, measurementReceiptSha256: "c0134d251cd55758836c912aca1c5c80d9430aa67047d3cbfd2f64900687c632", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.InclusiveGatewayConformance", codeSha256: "0763e59ea733f9db0e05464836a0c7604744f2f4af8f24b9563680dd9d2c660f", peakResidentKib: 1135844, elapsedSeconds: 8.36, measurementReceiptSha256: "c8f8484412711a255b7b9f850be64d7d7f2f68f97b5920944aebaa5a9c30e756", measuredAtCommit: "c5e21004f2af59a4604debb43dd284b7d2058efc" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", codeSha256: "9347295645c91aa99d7ef035a819c1e585fb2c592c28095b41c053c66657ea0d", peakResidentKib: 556724, elapsedSeconds: 5.04, measurementReceiptSha256: "1ccbbd5f806a9d2ebc25403ec50b8bacb30a43bd04f528d4874e2a85e2406cfd", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", codeSha256: "a478e77e615712e157dbe6c1f7076bf73c322298d64074981c86d2affa7b9a06", peakResidentKib: 875052, elapsedSeconds: 6.6, measurementReceiptSha256: "857da90e6fce745208d48cce1ce8ffe3c9480da4600db7e0e84a8c5056136b29", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", codeSha256: "82185fd14ddd0be3f7999bd425cebbad19b03b08d0a1108b781035c05c06b53d", peakResidentKib: 1641576, elapsedSeconds: 21.82, measurementReceiptSha256: "0793bdd305cbe92b656bc0e15b27c5d549b94bc3c4b82ee514f36aa56abbcbcc", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.InternalCommutationConformance", codeSha256: "8b56523655e78dab25d09e442747b6a943daf3c8f60fdb1027e8f98000d85446", peakResidentKib: 1064040, elapsedSeconds: 13.03, measurementReceiptSha256: "66a79a0d47f64bd23fd4f78db51555a9bf7b6e20dc57e391467650314cbad067", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.InternalClosureAtomicityConformance", codeSha256: "8c8ea62e3cb496625ea3e5a10942367a801e8004f1f16edfe0fa00617a78c72e", peakResidentKib: 471588, elapsedSeconds: 1.6, measurementReceiptSha256: "27a1be5c36e7cda84052111236c9db5a2ad1334c8812863498b4322fe397a8c8", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationSourceAdmissionConformance", codeSha256: "718f289029334d7d8fe242f4ca637397675952e6fafa5c00c3378cfedad5f548", peakResidentKib: 1573060, elapsedSeconds: 9.63, measurementReceiptSha256: "c72c1b738fe9aba37ced21751db4edee3ac08b65b86229133cca218b5e9eb8f3", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationSourceJsonConformance", codeSha256: "74b5622387a933db9b25b7378f85789592a0c7d501c5b60054200c4c2f1da165", peakResidentKib: 452656, elapsedSeconds: 1.05, measurementReceiptSha256: "2568de9a6e159264cdd752004542d6ee26e877e8f3cbd794180ddc559441beee", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationSourceCompatibilityConformance", codeSha256: "a580e8441d0d0834f5102ba2b18d387973e864ce526fe021edbf3258dce6bc80", peakResidentKib: 455724, elapsedSeconds: 1.07, measurementReceiptSha256: "e158d47018a08fb2c090334d9931368897d37dcde111aceb24c5e69a88237468", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationSourceBindingReferenceConformance", codeSha256: "ef52db9f8d826d2eadf98c69b27ed8c483030ba8aa7399d911ebb5c2c7f1ebc7", peakResidentKib: 442376, elapsedSeconds: 1.07, measurementReceiptSha256: "66f9d5f804f08123d67f5818fefc3ae37114381dda74cfb79ad95e9dbda0e66d", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationSourceBindingTriggerConformance", codeSha256: "681c8c4daf88db6f658a82022ed21a13220d9b6c0b6038d6ad3483dc9c7ccec5", peakResidentKib: 442372, elapsedSeconds: 1.16, measurementReceiptSha256: "5bc675c107d2f376a9e5b12540a048be02c178a96b2b294cd9a2d1ff569048e2", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationSourceBindingStorageLimitConformance", codeSha256: "31b1ede3da1e1242748c357a171e39df41838cf72d52c5ea2293c3ea6f37afad", peakResidentKib: 442380, elapsedSeconds: 1.08, measurementReceiptSha256: "8bf860aff1bb5d286a3943ffe07a4fc1b909a221c37462eeef814f4d407f9cc9", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationSourceBindingExecutionLimitConformance", codeSha256: "ae2db57431ccc4547e1c07fd26d172eaf55f02fbcd438d3678a6450db51e6eac", peakResidentKib: 442352, elapsedSeconds: 1.48, measurementReceiptSha256: "ba1bb1960625365dbe2b7324247ae3e565d3c69e971452cec8dcae904f66f76d", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationSourceBindingValidProgramConformance", codeSha256: "1fac34f34dfd69b7de83d4692aeb3d4e37a49b5f6adfe2f910cf26fbc25ae318", peakResidentKib: 443036, elapsedSeconds: 7.04, measurementReceiptSha256: "a5c1a775aece707f5549b42f74adc5bf8eee8b811ff51a3240392b81baf570b5", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationSourceBindingConformance", codeSha256: "6e61bd0d56099798a2a6e133dc979cb1f9666f5f67f793007a3fd882356cfd4f", peakResidentKib: 439800, elapsedSeconds: 1.59, measurementReceiptSha256: "0fc5c18f64554438bb9c72b0bce46cc7fe41efb7d647223020d9eab1cb6a7459", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.CompensationSourceLoweringConformance", codeSha256: "2cab2365b258a878254811a973d3c4ba42b549d9c32b2d9cb4749354af215b3a", peakResidentKib: 438112, elapsedSeconds: 0.96, measurementReceiptSha256: "2031b04eab275cb193815500f6f3922e04c8ae20efa8d8eec507e02d4cd9f37e", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance", codeSha256: "7086371cc4fccafc914ff8aadc9cff87d26865ef039edf71c14d2fb0ba2163fb", peakResidentKib: 407320, elapsedSeconds: 0.66, measurementReceiptSha256: "a0adf7145b2e0baa1ddd42882d224c0a4b2e396363c481c89c296acf3201973f", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CompensationTriggerHandlerProgramContractConformance", codeSha256: "6d8a2d241e22b1110a276ad046bfd4a5f871fd72cc5cf95494b59304ce6c175d", peakResidentKib: 450244, elapsedSeconds: 1.69, measurementReceiptSha256: "85a1f31ea9dd31799fdeb55346288b07b395fb44799523205029d9a4d545ece6", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeContractConformance", codeSha256: "15f859d5726634fe7fffbbf51976e61fb1c982eb77b77e8c7999678a463b3227", peakResidentKib: 464328, elapsedSeconds: 3.41, measurementReceiptSha256: "e7cb0f3970e09753c68de438d40db37db3eb08ce66d6ca61c2ac3c568d50d781", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationTriggerHandlerRuntimeConformance", codeSha256: "0f2844ab3e31969ddf1bed1b5afa27a0197ecc2db0a86287ef9dae031e4fc012", peakResidentKib: 397820, elapsedSeconds: 0.66, measurementReceiptSha256: "bbb2e11b53e3c5af4082cedc3a5b79f8251abbe9ca2b340c54e0de0ba08c75ee", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationTriggerHandlerTransitionConformance", codeSha256: "413c5462ba3b84584bab24bf473240ad78534b854f590d0f8f18b3e5b0ca3258", peakResidentKib: 891408, elapsedSeconds: 5.43, measurementReceiptSha256: "88f422626679feac365ce531563a2da9acedf20d3f9e67d0715b543ad1467c09", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCompletionConformance", codeSha256: "c319ccc75b2bb04568266e7d2c5fde1e09f714835e2c84f2df686d6576e37687", peakResidentKib: 1126240, elapsedSeconds: 24.24, measurementReceiptSha256: "c2819f859d14ba388f3d297229bef90a759a9bbe141a431b231d7b8e0912362b", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationTriggerHandlerCancellationConformance", codeSha256: "696ac47e9dc436da78e9da1c10fea61f50b045836552a8e2361c56d9efa1a249", peakResidentKib: 419896, elapsedSeconds: 0.65, measurementReceiptSha256: "12cf6184edd6f00abc790185df9330f9dc418f93efbab925186dfca5313b9ff0", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationActivityRetentionProducerConformance", codeSha256: "3e1e501613b273931f62f63d56c74e662980a9d3646edf6841910285088b9481", peakResidentKib: 690160, elapsedSeconds: 8.31, measurementReceiptSha256: "8009124d4edc337aedaae95c39d904f35d35736792e179f0419a488b010782ea", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.CompensationActivityRetentionConformance", codeSha256: "2618df8ef454d20f3576ce84633d3706cf54e04ce5e49b6e3b20369d49933e74", peakResidentKib: 782900, elapsedSeconds: 5.9, measurementReceiptSha256: "291532a8d9b51c14dd1caa99134b3d0f0cb9fdc512710934bb06b128e7b97b59", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.UserTaskMetadataConformance", codeSha256: "ba7c9b545d92f7b4457074cc3b306266559f7f3742c9c75a6a3ca0223dfaa112", peakResidentKib: 697576, elapsedSeconds: 10.21, measurementReceiptSha256: "cc3f4d2dc09c61bf45fcc28309686803de62794a90bbb002ac3c088bce4ab583", measuredAtCommit: "c5e21004f2af59a4604debb43dd284b7d2058efc" },
    { module: "BpmnSemantics.ActivityDataInputOutputAdmissionConformance", codeSha256: "588d20ec37a367c4310aa2fbf68bbe935f02158c545e141a56e09665a8ed9b41", peakResidentKib: 529944, elapsedSeconds: 3.16, measurementReceiptSha256: "30d999f5882a66c57ef39e51c71e3e838ca0168bb59c2e686b93505b11ccbf86", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ActivityDataInputOutputRefusalConformance", codeSha256: "dbee2d93c10a9a73c97310a31f852a5c6a27c4a91836222fc39fb5965cfff09e", peakResidentKib: 536484, elapsedSeconds: 3.7, measurementReceiptSha256: "4b84ae77ea4bad25394de3d7e0316fd27d7de23cc29c1dc7cc7756165f9d036f", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ActivityDataInputOutputConformance", codeSha256: "50dd5a97bd516400480d677d6e2f572126ceb60bec5ae9eaf7446969e63323a1", peakResidentKib: 441196, elapsedSeconds: 1.38, measurementReceiptSha256: "7a258d5cadc3dd538f132b7f832157bf7c0187230e6c5be8d0fb6b4855860589", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ActivityDataInputOutputProjectionConformance", codeSha256: "b4988388a667734f8112ad700a90fa98afb45735189d0696ae6b1d46ad7297c3", peakResidentKib: 458860, elapsedSeconds: 1.17, measurementReceiptSha256: "420147e77c32c618cb84bb8357703c1f5016e608d849db55e42b8b5af0c2baad", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.ActivityDataOutputConformance", codeSha256: "43556929e89892be2863da6c48b55a5accdf00c3a4ab52df4d6c4bcc0ff16e6f", peakResidentKib: 922060, elapsedSeconds: 6.9, measurementReceiptSha256: "81b1908bc9f2ec9959468afc66546f0b025b251e756b1509c5e144647ffd4b84", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ReceiveTaskConformance", codeSha256: "57db9ed9cb1ae73719ec25195a0c3950224215b6d6da576abbe5bb554de773bf", peakResidentKib: 1189496, elapsedSeconds: 7.29, measurementReceiptSha256: "265792e272353657c3bf88524406680e45eb300806adac2c27c5e1ee10c5e106", measuredAtCommit: "0cb38212ce09377822d5778cfc18c7c0e600f40e" },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", codeSha256: "61032020e57231199b97e6b5f53b0e218a966b7fde1e5a2b8c9ed8d8d9a4fcd4", peakResidentKib: 448172, elapsedSeconds: 2.81, measurementReceiptSha256: "67d0e9d80e3707fff038f285e3b1cf7007448fd851eefd4d19cce174cd39b65e", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance", codeSha256: "c9a06fa16bb018968e5585b23c876b01e19e6e985ad7c2b684ff0cce891a871b", peakResidentKib: 452684, elapsedSeconds: 8.6, measurementReceiptSha256: "3db0cd5fe310814229e0036512b401ffb03cf26fc3e3435fb21c61b567b5ca48", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotConformance", codeSha256: "02f8fdecb39ce9ff456cec5469944b7dca7a7d2a8881720b5de85a583e07a057", peakResidentKib: 463088, elapsedSeconds: 1.05, measurementReceiptSha256: "3e23ea379da2be8743126fc072ccbba79bdeabaa5d85b3d2af467b03652c23a0", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance", codeSha256: "13d7525827350358743e99be7b8c433fbff0e929425dad089076b8f3a90ddb26", peakResidentKib: 453188, elapsedSeconds: 1.07, measurementReceiptSha256: "d3080298aa75616f0030a842770fa878dad69cf4588acd8ebbb32c8e7e259db4", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance", codeSha256: "47eebc0fd0e1ce7f0f7ae02976406583d5e2bc04341dff42aca67bb3b16ad654", peakResidentKib: 457204, elapsedSeconds: 1.07, measurementReceiptSha256: "f7c358f7d3d5a3e4547d603fd6451d1493e992cfaa14a0343b2d4cb744e207fe", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance", codeSha256: "3b1911cd2690de747eee8c3331e1d4df40416cd1be3dc1f622c54f15a64fa874", peakResidentKib: 461596, elapsedSeconds: 1.6, measurementReceiptSha256: "ca09d01fc9c8b184b1964f2182eb2fdd73ab6dea84023e03cbb5d09a14e323dc", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance", codeSha256: "72262063b1468257ce8def92ac5954bab3cc26d1cbfcfcf5577105c536274da0", peakResidentKib: 446936, elapsedSeconds: 1.06, measurementReceiptSha256: "01dce3e0b61c64cd3f157f8447ff83a4148d9c873a75ec5fbaaf6c8047c764a1", measuredAtCommit: "0cddc440a1163c4a7910ede80741d23a145d3e96" },
    { module: "BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance", codeSha256: "d2330d7324ff28cd051f47b723e05ea7824459cd8daf8c6c0ce314db178374fc", peakResidentKib: 438048, elapsedSeconds: 1.06, measurementReceiptSha256: "25c52de80da4382e06180af7b4f58260bd2dc6942c638681b8e63b70f5aed553", measuredAtCommit: "f35c74ad199f9a5e65127190da6207898dfa4c0e" },
    { module: "BpmnSemantics.UserTaskInteractionConformance", codeSha256: "d08c661ce5b93017063ac55db792710ada509535b043e6eab7b4dd5ea1692e84", peakResidentKib: 848508, elapsedSeconds: 8.91, measurementReceiptSha256: "36be93e0782640953ebf590eb5131ce3607c3f7ebcca2273c55206d36d5456a9", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ConfiguredTaskConformance", codeSha256: "c3fbded7170d703b9d5889eb00e85c96d63f94099e81b62bc47ab4967661d83e", peakResidentKib: 462240, elapsedSeconds: 1.05, measurementReceiptSha256: "260e81019c5351b33230552249b9ca0173f9f497b4cba1da055d109d5ffd2f8f", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", codeSha256: "60486f0df14c3efc53e6032726c2d691ee4061848ecf1c60593ba917694f2e4a", peakResidentKib: 1160520, elapsedSeconds: 11.36, measurementReceiptSha256: "507fcaf82225d120288445020df746ba5ca427bbb97f39d6da5d5f32b6581dec", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.BooleanProcessDataConformance", codeSha256: "dfbc359218b32710604a1c2034581b81fd7ff15a011bde8c2bec409bc7ea10fc", peakResidentKib: 806260, elapsedSeconds: 5.55, measurementReceiptSha256: "e9ef1f782bc2b3799cadb4a8e74dc5532436dc8ec82aeb93de27741127573ad1", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", codeSha256: "17d8c642ddc03d3f571e7fd03e5c0ff4dfc63784853f0775295e7ebf56602f7f", peakResidentKib: 449416, elapsedSeconds: 4.57, measurementReceiptSha256: "27535b36ec6d9143c8590983e9c24485f354ecfa741922a313d55ac093f483b2", measuredAtCommit: "51646364da90a5c5baef61cee7a7eadf566e939f" },
    { module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance", codeSha256: "5ffe7ea0ae42ca468c3f0f6e6dcdcbf91abdc1ee08295fd74301658aed630948", peakResidentKib: 469940, elapsedSeconds: 1.06, measurementReceiptSha256: "70cebbfd3321bf990f4d26aa26f3419b9e4d47a82a3b4daf24e80b397a9a93bb", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.ActivityBoundaryMessageConformance", codeSha256: "fab5d7837a76fc6728dd14a28dcb563c6163bf68c3923e33ac831a90f31a1642", peakResidentKib: 1041932, elapsedSeconds: 6.56, measurementReceiptSha256: "9be7f934487be4454a0581300627c37ea0823c1d68c6512fa95ca014f1ba0000", measuredAtCommit: "c5e21004f2af59a4604debb43dd284b7d2058efc" },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", codeSha256: "429179bcd87288f07200682a93aa9a9d6de0c6be6602c96e6a201d4dd2df9863", peakResidentKib: 955648, elapsedSeconds: 8.56, measurementReceiptSha256: "d8c63a2e8ede7f8bd6f3c09533bfd980f78330b81fba7ea00ddcd511cba8bac9", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", codeSha256: "f2dce52f1ae9e9413d4298329f046b9fd6dec42305928c72c11d6a9e4b5f3dd4", peakResidentKib: 932980, elapsedSeconds: 7.09, measurementReceiptSha256: "68f496703d843b491fa94b898f44c85a79def99e9d1312ac6f1b2cef0eab4ef3", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", codeSha256: "75adbdd7018b08c0e90c5e3ee4455473e220ea543c47bcfd1f10843e5ebe3775", peakResidentKib: 441564, elapsedSeconds: 1.27, measurementReceiptSha256: "4472583756656672aa06f809bc25a0ead75e273ae5cb954b73f79a4dd3b79e74", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.StructuredHumanWorkConformance", codeSha256: "8d94b3a2967c17bb63c4d4fa034d47ac31c6b1a4134c87a7b7e68e7f6cd27cb5", peakResidentKib: 901388, elapsedSeconds: 5.06, measurementReceiptSha256: "a7a555643fb262a514114dc35141fcbc27a6b34c06e7b9e88817a5e49c295556", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", codeSha256: "f2f2eb2db29757cf75b0179f3b1461ecbd0bbbbef2810073fa904970fdee2bee", peakResidentKib: 780740, elapsedSeconds: 5.2, measurementReceiptSha256: "97186c58cde5ed3d8ff521bc79c5b5cb8c6c3453f56cef5d5b9db825ee206a73", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ProcessStartDataConformance", codeSha256: "f99ede7db35120d80d4bb19e075e6c289abc3875437648216ea4d616c370b1e9", peakResidentKib: 578540, elapsedSeconds: 2.13, measurementReceiptSha256: "a0ba7a2721ee08613682541002db9df3360e53342bab0a16137202ed93d811e5", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ParallelMultiInstanceConformance", codeSha256: "3b321f0344ba619a4490ed90419c21088fe10f1fad605305fc68ce85f0dd098c", peakResidentKib: 477624, elapsedSeconds: 1.36, measurementReceiptSha256: "23cb1cc66cd8985697fa788d96e47a83d9758686229c2e56f57df5b2ba8f76c3", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", codeSha256: "4d4280fb75579d2c7ff966c462a0e2e264d267bd8a50d8dfe5e4b2434c330300", peakResidentKib: 491036, elapsedSeconds: 5.87, measurementReceiptSha256: "5e3728cc0a0e6001fe7d4f44a3fcbeef64c68384c761cb5231e9f6585e6b492e", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", codeSha256: "3c7e5807a654249cae8c87a06c16ba0591dc56ff883da918e327bd7a9d24ef83", peakResidentKib: 515888, elapsedSeconds: 3.43, measurementReceiptSha256: "1300837362e062e2c5b894b5d4735fe2bc0d10c9c4a448f3b8f0535dc4a87716", measuredAtCommit: "0b6104b1711b859363c6bd85afb91593b3a2d279" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", codeSha256: "be45d26b1da85952e69f658b9ce503a03a49cb26aac3e05fe2d0cb037fd41a51", peakResidentKib: 552240, elapsedSeconds: 4.04, measurementReceiptSha256: "2bf8affce7823558047e1b6fd358ae45da51ffe820b0a677ee4134af87f416cf", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", codeSha256: "2529ab2654a385af6006cafb895efc97f6b0d90a0fd4eb15fef75e4b8acd0d9c", peakResidentKib: 543268, elapsedSeconds: 2.5, measurementReceiptSha256: "7a4f3d51e83587f620b513138e03f075ff707d3138b1590c81010601fa186014", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.SemanticProcessJsonConformance", codeSha256: "e39b559e0de95fa3fec35e9af324c3f9ddd713abf788e8c5b790c7a0a3ec49c1", peakResidentKib: 485628, elapsedSeconds: 1.79, measurementReceiptSha256: "891960195d013cfc45bfb62ff627cec2358e43dd4251a2e6e739f76ff4b766f9", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    {
      module: "BpmnSemantics.EnginePopulationScenarioConformance", codeSha256: "f377566a31e838767ce74618cfa801cd75b093a3b98d085db077d918240217e7",
      peakResidentKib: 669784,
      elapsedSeconds: 0.85,
      measuredAtCommit: "b3903102",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", codeSha256: "48f5df6ef410339447f9451762fac192d97b351dec79dba9d2b08c8ece3df914", peakResidentKib: 439124, elapsedSeconds: 0.86, measurementReceiptSha256: "0d01b7cb67b19a5fb0d5c96340d92d17b047951323f2a099aafb87d3bcaddabc", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.ActivityIssuingDisciplineConformance", codeSha256: "03d12a407d996304896d68e113c686a8b89b8ffde6d7ce84af4007f1b2196d33", peakResidentKib: 410004, elapsedSeconds: 1.79, measurementReceiptSha256: "08ecb2b6ba2006946b98be673640799f480157140236314549bf4d37e05877e1", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
    { module: "BpmnSemantics.Conformance", codeSha256: "f87d851ce40abd17efe769c5039e73801aa25488e5557abc6638c37dc6630a02", peakResidentKib: 336084, elapsedSeconds: 0.46, measurementReceiptSha256: "dbb5478f638aac46987f16ea4d86630b1b95b32df9739d8b209e1a9e5e287e21", measuredAtCommit: "095a7df09b8941d1ebcd7e975490187edd46c52b" },
    { module: "BpmnSemantics.ParallelForkJoinConformance", codeSha256: "c648c2537bc39997b5a798ee199913e47f57034b4564269cd76ec885790f49dc", peakResidentKib: 334440, elapsedSeconds: 0.68, measurementReceiptSha256: "6272fe29471db8cf26a14cb821c62feb75d15a0b90656df0c3a5c0bcc900e2cf", measuredAtCommit: "d02577fea0fc75d97949457f0fff57eef4cdbd55" },
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
