# Arming and token-storage resource ledger

## Status

Maintained historical evidence ledger. Dated records preserve their source, conditions and qualifications; current work is owned by [PLAN.md](../PLAN.md) and the linked specifications.

[Resource topic index](README.md) · [Cost rows](../CAPSULE-COST-LEDGER.md#measurements)

## Measurement basis

Apply [the historical measurement basis](RUNTIME-AND-ACTIVITY-LEDGER.md#measurement-basis) and the current procedure it links. Local records retain source/cache conditions and exceptions. Target calibration establishes no performance trend, cold whole-library qualification or independent semantic approval.

## Composed arming footprint checkpoint calibration

On 2026-09-08, immutable commit `5fa6dfe36214b6620ee90d588726a90c951c206d` supplied the read-only source archive for the measurements below. All 348 source inputs match the accepted cold full-library run above byte-for-byte. Each module retained the warm dependency closure and invalidated only its eight owned generated products; the pinned image, one CPU/thread, network isolation, 3 GiB ceiling, and no-additional-swap policy were unchanged. The selection covers the new canonical Activity-order witness, changed runtime and commutation consumers, all four standing-watch consumers, and all remaining near-cap targets.

| Module (`BpmnSemantics.` prefix) | Elapsed | GNU RSS | Cgroup peak | Output SHA-256 |
|---|---:|---:|---:|---|
| `ActivityActivationOrderConformance` | 1.66 s | 607,400 KiB | 845,103,104 bytes | `0a64a22b3043985df9340abc50fc56008e07c3a4ed8b712b015f2a3a18b367af` |
| `CallActivityConformance` | 23.60 s | 1,345,716 KiB | 1,045,606,400 bytes | `42dc8c7f41f482653b6b56fb669b94b9c969c5cecf3045edad62a0e5d9bb903f` |
| `CompensationEventSubProcessSnapshotLifecycleIntegrationConformance` | 15.25 s | 1,933,028 KiB | 1,656,119,296 bytes | `a19e78326a3d01c0248eefd64b4c26b6edf0f1866b6d415f3616cd23bff7ec8a` |
| `CompensationEventSubProcessSnapshotRootClosureConformance` | 20.08 s | 1,489,244 KiB | 1,225,306,112 bytes | `bbf0a1cacac672f35de204b21627877cbc238184c3cf79ca7d9033740bb69485` |
| `CompensationSourceAdmissionConformance` | 18.21 s | 2,447,360 KiB | 2,190,393,344 bytes | `61b115e04638762688e749ebe148e0f6361113d4a43a473ddf6024772632385b` |
| `CompensationTriggerHandlerCompletionConformance` | 25.83 s | 1,485,228 KiB | 1,177,042,944 bytes | `5120fe0e7e1db374d2d867970d760d18b2535579c22c6e3574395bad875190bd` |
| `InternalCommutationConformance` | 8.99 s | 1,242,848 KiB | 903,319,552 bytes | `3bbddc75baac4eac5b7e9177fe84f57a96fc3c331244d91d1538275cb3123ea1` |
| `MessagePayloadCatchConformance` | 25.93 s | 1,508,268 KiB | 1,215,041,536 bytes | `0830688b14e3209b8224e86304523035d7237143cb6360752826464261f261f7` |
| `RuntimeStateWellFormedInvariantConformance` | 20.24 s | 1,183,920 KiB | 845,213,696 bytes | `f19100b4e1fe8d42d54ae5168bae1b290cb32dbcc6a0cb36aaa2f4728809fea8` |
| `SequentialMultiInstanceProgramBindingConformance` | 31.01 s | 1,546,980 KiB | 1,246,470,144 bytes | `c94baa7d3503d1bf6192c6479a78c43b81817e0367a6de2d8849f4c0ab607604` |
| `TerminateEndEventConformance` | 30.56 s | 1,544,784 KiB | 1,240,502,272 bytes | `b4322512580a22c87fbcae5ea278ab94f25f11c9a7e013b61a20608f612cb257` |
| `TimerStartConformance` | 23.25 s | 1,416,140 KiB | 1,103,757,312 bytes | `0face0a8984680cd457c455eda188c71501d5c883d2d035287a98c0aa1dba131` |

Every command exited zero with zero controlled memory events, both pressure totals zero, and no swap. The source-bound rows replace [the module-cost record](../../scripts/lean-module-cost.ts); its derived near-cap set is now empty. Historical measurements of unchanged targets remain historical evidence, and the standing-watch trigger remains in force. Elapsed time is contextual: source archive faults and competing host work prevent a controlled speed comparison.

The immutable archive also passed `./scripts/lake.sh build` against those warm outputs in 0.34 seconds at 121,872 KiB GNU RSS and 41,222,144 cgroup bytes; output SHA-256: `4f567059c83dca3b1b9ffbbc39d5b9d271d0162dfbde274d951b9dc03891cd21`. All controlled memory events, pressure totals, and swap were zero.

The immutable archive also passed `./scripts/lake.sh test` against those warm outputs in 0.54 seconds at 121,856 KiB GNU RSS and 43,171,840 cgroup bytes; output SHA-256: `fe812e937bf9d73be49a2b1a69a77b28790dc06a28d06c9c556cb3c6fa69f8cd`. All controlled memory events, pressure totals, and swap were zero.

These two warm tuples replace [the cgroup acceptance record](../../scripts/lean-memory-acceptance.ts). They do not replace the genuinely cold full-library acceptance above. This calibration closes the resource checkpoint; independent semantic review and production batch integration remain separate obligations.

## Finite prepared arming checkpoint calibration

On 2026-09-08, immutable commit `1fb503c64f686eaee95ba22e7444ed5775dfc827` supplied the read-only archive for the new finite arming fixture and all four standing-watch consumers. Each measurement used the pinned image, one CPU/thread, no network, the unchanged 3 GiB/no-additional-swap controller, warm dependencies, and removal of only the target's eight generated products. The first new-target invocation after invalidation reported success without compiling the target; its 0.25-second result is excluded. The retained retry and every watch measurement explicitly rebuilt the named module.

| Module | Elapsed | GNU RSS | Cgroup peak | Output SHA-256 |
|---|---:|---:|---:|---|
| `FiniteInternalArmingConformance` | 8.96 s | 1,311,400 KiB | 963,710,976 bytes | `a372343c039cb110b1b392ded116ef3603892af3420546f3a7da492c5d753040` |
| `CallActivityConformance` | 22.57 s | 1,347,112 KiB | 1,035,366,400 bytes | `6b4ff9720ee9229c1f2434f7501de3c68aac423b3b06fe97271eba539d7f5b10` |
| `SequentialMultiInstanceProgramBindingConformance` | 27.36 s | 1,548,380 KiB | 1,253,380,096 bytes | `07dd293d5c77e1337f05c9275e3d50cfedac69b4a990ce09d191afd90791feec` |
| `TimerStartConformance` | 22.77 s | 1,419,104 KiB | 1,106,575,360 bytes | `c29a18e830711dec71d145e29a0baa8ed8852d6f173af1fa7844bdb297855644` |
| `TerminateEndEventConformance` | 31.99 s | 1,549,756 KiB | 1,287,991,296 bytes | `368fb04cc63138b9a611337f3d9119aaaaece63e47590a2c6a2aaffc797401ac` |

Every retained command exited zero with zero controlled memory events, pressure totals, and swap. These source-bound rows update [the executable module-cost record](../../scripts/lean-module-cost.ts); none reaches the near-cap threshold. Elapsed times remain host-load context. The measurements do not replace the full-library acceptance record or establish independent semantic approval.

## Place-wide token-owner census calibration

On 2026-09-08, immutable commit `21b4c1de92c39d021142b665d4cfccd9251dd8b4` supplied the read-only source archive for the changed census witness, finite arming consumer, and all four standing-watch modules. Each target retained warm dependencies and moved aside only its eight generated products inside the same container that ran Lean. Acceptance required observed artifact absence and an explicit build of the named module. A preceding host-side invalidation returned success in 0.24 seconds without compiling the target; that result is excluded, as is the analogous skipped invocation recorded in the finite arming calibration above.

| Module | Elapsed | GNU RSS | Cgroup peak | Output SHA-256 |
|---|---:|---:|---:|---|
| `InternalCommutationConformance` | 10.91 s | 1,250,512 KiB | 910,233,600 bytes | `00b1e3ba63d806b1d5cc072a9237d81ded4b677849f769ae2c3b2ef2f225839e` |
| `FiniteInternalArmingConformance` | 9.90 s | 1,315,448 KiB | 970,739,712 bytes | `df1fab088c9636d6ab7b97f1a47de748695f49635d4cd9bae7ed872cbd7c57bc` |
| `CallActivityConformance` | 29.76 s | 1,346,324 KiB | 1,040,130,048 bytes | `fd036cd60b1e46bc07e2fb23505a76e1b3fc0789857bf0246b3a2fd136e2c099` |
| `SequentialMultiInstanceProgramBindingConformance` | 33.36 s | 1,552,572 KiB | 1,196,924,928 bytes | `8d32e9f0ba9fad9522cce215f2966cf0fdac3d102b3cefc97aeb0fa07fc6a333` |
| `TimerStartConformance` | 25.67 s | 1,415,592 KiB | 1,124,364,288 bytes | `e52b0774dfbe76ba6d2d00207349429bcb96eeb067948b11fafd2e91c7b40ace` |
| `TerminateEndEventConformance` | 38.71 s | 1,550,232 KiB | 1,306,763,264 bytes | `df21f167e40a9ef6f6f5ca36a5444c24cc83fb5afc8eb46f20e655b861ad76c9` |

Every retained command exited zero below the hard ceiling with zero controlled memory events, pressure totals, and swap. These rows replace the corresponding [module-cost records](../../scripts/lean-module-cost.ts); none is near-cap. GNU RSS remains comparable within the series, while elapsed times reflect host load and the container-side invalidation is included in cgroup accounting. The checkpoint establishes no new full-library resource acceptance or semantic approval.

## Canonical token-storage calibration

On 2026-09-08, immutable commit `f7d96debd3c215149730b3db5299bd9d0a3cc826` supplied the read-only archive for the new token-storage witness, both commutation consumers, the four standing-watch consumers, and three changed cyclic-control-flow witnesses. All 357 archived Lean/build inputs were checked against that commit. Each target retained warm dependencies and moved aside only its eight generated products inside the measurement container; every retained invocation explicitly rebuilt the named module.

| Module | Elapsed | GNU RSS | Cgroup peak | Output SHA-256 |
|---|---:|---:|---:|---|
| `CanonicalTokenStorageConformance` | 4.60 s | 1,216,092 KiB | 846,581,760 bytes | `f6fad239d7ce20ce265d89f33bb10c83546623453ce00bcdce2f2743b3244b79` |
| `InternalCommutationConformance` | 10.31 s | 1,273,148 KiB | 933,793,792 bytes | `20cf31d517420252b68c3d28454f88c70381ec1ba969d2a960f358cf537842c5` |
| `FiniteInternalArmingConformance` | 10.18 s | 1,337,416 KiB | 1,009,618,944 bytes | `b633ba2d9d3779037906339af9a7e0d90a68df9bb2d2ad3fa539f54995bb2ac2` |
| `CallActivityConformance` | 25.74 s | 1,345,652 KiB | 1,049,415,680 bytes | `85ef8e867d8bd77b63c0fdd4c1e4d689311ac65d4edccb80bbc4449ad93d3eb3` |
| `SequentialMultiInstanceProgramBindingConformance` | 28.93 s | 1,550,868 KiB | 1,195,577,344 bytes | `c50be9dc7c3751c3719a04705bee9d1e784181f862037e6adc6a995e6ccd4e6f` |
| `TimerStartConformance` | 22.01 s | 1,417,392 KiB | 1,107,922,944 bytes | `a0ed91182c41563ad9549c470f59893239be055ee8eeba4fd3a1cfe02b03d273` |
| `TerminateEndEventConformance` | 33.25 s | 1,595,728 KiB | 1,284,681,728 bytes | `8cf1e5b54a99982db30aa1977f9e5ecb8b5eabaa2ef3ae2208dbb542bc33901a` |
| `SemanticProcess.CyclicControlFlowConformance` | 10.15 s | 1,072,920 KiB | 710,578,176 bytes | `3eddf1559257c357f91462facd199d2f765d945e7ae5b0e03e9c45f135532a01` |
| `SemanticProcess.CyclicControlFlowExecutionConformance` | 3.07 s | 695,004 KiB | 295,247,872 bytes | `3b9a5f1cc7ef2e02567b384b21aef2ad455178c4f3fa7b79bd14af1d905e16ee` |
| `SemanticProcess.CyclicControlFlowReachabilityConformance` | 3.98 s | 734,464 KiB | 336,646,144 bytes | `bff2b3825725c676c78b07b647ade8f7dd8d93fa45e8911ee6b411613e4a29f9` |

Every retained command exited zero below the hard ceiling with zero controlled memory events, pressure totals, and swap. These rows replace the corresponding [module-cost records](../../scripts/lean-module-cost.ts); none is near-cap. GNU RSS and cgroup charging remain separate measurements, and elapsed times reflect host load. This target-only calibration does not replace the cold full-library acceptance or establish independent semantic approval.

## Inclusive pairing calibration

On 2026-09-08, immutable commit `565ff325eec927f5367be6fe16d160c578ab70ae` supplied the read-only archive for the new pairing witness, the existing Inclusive Gateway consumer, and all four standing-watch consumers of the changed structural validator. All 360 archived Lean/build inputs match that commit. Each target retained warm dependencies and moved aside only its eight generated products inside the measurement container; every retained invocation explicitly rebuilt the named module.

| Module | Elapsed | GNU RSS | Cgroup peak | Output SHA-256 |
|---|---:|---:|---:|---|
| `InclusiveGatewayPairingConformance` | 3.43 s | 836,304 KiB | 414,973,952 bytes | `a966643491f93ee8ff51ab7d15fdef2989f6a0e91c1fa549738f0148f222e9c4` |
| `InclusiveGatewayConformance` | 27.63 s | 1,435,552 KiB | 1,141,964,800 bytes | `1de9b43eb472fa128cd474b3193c7636469df26d14b4b4a081a8b1ee070514ee` |
| `CallActivityConformance` | 25.96 s | 1,347,480 KiB | 1,039,626,240 bytes | `1ac7c302baef4d83ca8a94f79c933ae28e5c42df248c5f41f285cbab2d056a3c` |
| `SequentialMultiInstanceProgramBindingConformance` | 37.44 s | 1,557,340 KiB | 1,246,167,040 bytes | `58acb65caca0ce173a57d2ca9333241a08438b5d5c8ec749229cfeffed7cb7d8` |
| `TimerStartConformance` | 25.38 s | 1,416,408 KiB | 1,121,857,536 bytes | `761ccefedf2615b0653937832533ee2d4e3f6b77270ed34b31916cd628e08104` |
| `TerminateEndEventConformance` | 31.99 s | 1,604,368 KiB | 1,331,187,712 bytes | `ebfdf901892b95a3b4e1964bb81d50c82a64390b1db2168a938f512b1dcfe8e3` |

Every retained command exited zero below the hard ceiling with zero controlled memory events, pressure totals, and swap. These source-bound rows update [the executable module-cost record](../../scripts/lean-module-cost.ts); none is near-cap. Elapsed times remain host-load context. The initial container launch failed before Lean because the read-only source archive lacked the nested cache mount point; creating that empty directory changed no source input. These isolated measurements do not replace full-library acceptance or establish semantic approval.

## Standalone Activity-data arming, 2026-09-22

The [standalone arming outcome](../INTERNAL-COMMUTATION-PROPOSAL.md#standalone-activity-data-arming-outcome) starts at `7c509b9627ef75da85fa6981366dfd5cceee8414`. Input-only and output-only arming reuse the composed variant's complete lifetime patch, predecessor frames, and finite/mixed publication consumers. Generalizing its existing activation-preservation proof adds one shared insertion theorem and keeps the composed theorem's statement; it avoids a second field-by-field preservation proof. There is no new RuntimeState field, atom domain, public profile, wire shape, or Temporal mechanism. Preparation, successor validity, exact state/publication, and production integration remain one review outcome.

One cold review, one same-thread correction audit, and one clean complete Product 1 run closed the outcome. The 45 complete `/tmp/bpmn-standalone-arming-*` receipts through `/tmp/bpmn-standalone-arming-correction-infrastructure-1` supply the span and interval union from command/status modification times; fifteen have nonzero status. They exclude delegated implementation/reviewer commands and later acceptance checks. The separately disclosed zero-exit resource rejection remains failed acceptance evidence. These intervals measure commands, not engineering effort or critical-path delay.

Consequence: shared insertion preserves the composed statement. The unchanged contract paragraph contradicted its edited evidence row ([Finding 15, instance 25](../PROCESS-ASSESSMENT-LEDGER.md#finding-15)); same-reviewer audit verified historical-facade qualification/current-owner routing. The correction was documentation-only, so semantic/resource/integration evidence was retained. Existing activation/frame owners supply reuse without another invariant layer or reduced gate.

The complete semantic-core and source-package gates pass 1,221 and 817 tests respectively. The TypeScript red witness reproduces independent standalone arming rollback before dispatch integration. The root's 61-case integrated gate and the mixed-family Lean consumer pass; 32 focused documentation, ownership, and census checks pass. The first infrastructure run caught a test-only enum-widening annotation; the corrected run passed 581 checks and failed only the expected stale fixture measurement. With final measurements recorded, `/tmp/bpmn-standalone-arming-infrastructure-3` passes all 582 checks. The first bounded fixture attempt found a non-synthesized match-proposition decision instance and a record-layout parse error; both were corrected without changing production semantics. Failed receipts remain retained.

The first complete bounded Lean run, `/tmp/bpmn-standalone-arming-full-lean-1`, reached its unchanged 1,800-second deadline and exited 124 after reporting target 405 of 567. Its 2,816,712,704-byte cgroup peak stayed below 3 GiB; every controlled memory event was zero, while both pressure totals were 397,925 microseconds. The command is failed evidence, not full-gate acceptance. During the run the host load average rose from 65.41 to 95.95 and other applications were active; the Error-propagation fixture took 412 seconds against 38 seconds in the preceding calibration. These observations do not isolate a code regression from host contention. The retry keeps the same source snapshot, controller, deadline, and successful build cache; no input or guarantee is relaxed.

The retry `/tmp/bpmn-standalone-arming-full-lean-2` checked all 567 targets and exited zero in 1,136.37 seconds, but is rejected resource evidence: `memory.peak` reached exactly 3,221,225,472 bytes and `memory.events.max` was 799. OOM counters stayed zero, GNU RSS was 2,788,356 KiB, and both pressure totals were 876,165 microseconds. Exit zero does not override the [cgroup acceptance rule](COMPENSATION-RESOURCE-LEDGER.md#snapshot-invariant-and-cgroup-acceptance-correction); the required response is isolated cold-consumer checks under the same controller before any complete warm acceptance receipt.

All 599 archived Lean/build inputs in `.cache/standalone-data-arming-20260922/source-v2-sha256.json` match the final read-only snapshot and worktree; the manifest SHA-256 is `24580f6ea6807294f53505f7c24a59773d1e8457fcf0585794939e5fb481ca61`. The ten isolated cold-consumer checks below retain Lean 4.31.0, image `sha256:4df22c7a1ec8ba8c4c2795fdea1269d7b9cadade4e65b22e595047509aa27950`, one CPU/thread, no network, the fixed 3,221,225,472-byte controller, and zero additional swap. Dependencies are warm; each run moves aside only its target's generated products. Mounted-source and complete command-receipt digests bind the replacement [module-cost rows](../../scripts/lean-module-cost.ts). Every controlled memory event and swap count is zero. Cancellation records 164,365 microseconds in each pressure total; the other nine record zero. The largest cgroup peak leaves 349,736,960 bytes below the ceiling. The derived RSS near-cap set is empty; this is no performance-improvement claim.

| Exact target | Elapsed | GNU maximum RSS | Cgroup peak | Build-output SHA-256 |
|---|---:|---:|---:|---|
| `FiniteInternalArmingConformance` | 22.63 s | 1,486,952 KiB | 1,225,752,576 bytes | `2c4792d62ece3f9268fb26879f3b26eb139e4dd409774b76822b18c92d1076d1` |
| `FiniteInternalTransitionConformance` | 14.21 s | 1,364,756 KiB | 1,754,128,384 bytes | `1ec820da34b74ae62d712a1fa336fe6976a1f4379f8e00b78820c1c18f6ef58a` |
| `ScopeCreationMixedBatchConformance` | 87.55 s | 2,110,356 KiB | 2,221,199,360 bytes | `e1eb4f8b9f725c222b00a60b2b3891c66a1ec49be84edba3474f82d6e6c96394` |
| `InternalRegionalCancellationProjectionConformance` | 107.47 s | 2,812,648 KiB | 2,871,488,512 bytes | `d6d0251574bbe0e64dc66ae8d3c333681b98c6427d1e7a758924d72a21cede65` |
| `CallActivityConformance` | 29.36 s | 1,392,412 KiB | 1,199,734,784 bytes | `cd8d32ec90b3661dc9e88c1bd730c2021686d32a257a0b0af609c7c5f46c6c8f` |
| `SequentialMultiInstanceProgramBindingConformance` | 27.55 s | 1,592,064 KiB | 1,332,031,488 bytes | `fd176cd6f1291729818c3602788f596f08f0f61879c094080a7e923fb776eaf9` |
| `TimerStartConformance` | 21.34 s | 1,461,540 KiB | 1,179,779,072 bytes | `10094b79a4735fe63b7a89b7abceaa3f583ef068a4c461d786191661f5e44d03` |
| `TerminateEndEventConformance` | 33.17 s | 1,721,768 KiB | 1,474,985,984 bytes | `fbadcb88b55df702c03739c911ae962c3f0a94f0191b5b8a4309215fc85127bb` |
| `InternalRegionalPrivateTimerAliasConformance` | 18.21 s | 2,743,196 KiB | 2,527,932,416 bytes | `3be4fc010335f59e94125b94eb4c02d528d0f63ef72c55cce9e365e1fb42edf5` |
| `SubProcessErrorPropagationConformance` | 40.77 s | 2,367,304 KiB | 2,281,492,480 bytes | `d95bb480b2b6181081ef9241941214f0abe5de2b0d555a102f2431264e0430cf` |

After those checks, complete warm `lake test` and `lake build` pass in 1.08 and 0.65 seconds at 54,063,104 and 52,277,248 cgroup bytes. Their output digests are `e4db54a92f50b40579602b990e1d7cee300bf329aba8e0cba8201fd3b366989f` and `3d87b3ff498c3b6a4efc1404e05b599b4ac3acd2b18739368eb0f0b354514145`. The ten-declaration axiom audit passes in 0.96 seconds at 359,002,112 bytes, output `815637e7cd3fbf929ded66508cd46607f1ce9fe0d6a532db27c64f0afc30f2ec`; it reports only `propext`, `Classical.choice`, and `Quot.sound` for shared/composed preservation, preparation refinement, validity, pair publication, finite publication, and the standalone universal witness. All three warm receipts have zero controlled events, pressure totals, and swap. This establishes isolated cold-consumer plus complete warm acceptance under the existing protocol, not a successful cold whole-graph memory bound.

## Timer-task arming, 2026-09-22

One cold review, no required correction audit, and one clean full integration run accepted the outcome. The frozen 166 complete root precommit receipts in `/tmp/bpmn-timer-task-precommit-receipts` retain their original paths in `sources.json`; 73 have nonzero status. The summary uses command/status modification times and excludes independent reviewer commands, integration, acceptance checks, and the next-family probes. It measures command intervals, not engineering effort or critical-path delay. The bounded complete-Lean failures below remain separate rejected evidence rather than successful full runs. The enum advisory is corrected with acceptance; implementation cost excludes that follow-up.

Selection consequence: the umbrella selected five gates from 486 unpushed paths, while `selectedPrePushGates` on `bbaeb866..e8c1aa72` selects Product 1 only for 52 changed paths. It therefore repeated unrelated platform/PostgreSQL/showcase/browser work. Use the existing Product 1 entry after path selection at such checkpoints and the umbrella before push; no selector/gate changed. Pipeline 52.670 seconds exceeds the 36-second soft target and proves no speed improvement.

The [Timer-task outcome](../INTERNAL-COMMUTATION-PROPOSAL.md#timer-task-arming-outcome) groups both interrupting and non-interrupting arming, all existing mixed-family pair laws, successor validity, and canonical finite-batch publication into one review target. It reuses the existing TypeScript Activity preparation and activation, the regional atom domain, ordered insertion/filter laws, and finite executor. Its shared frame extractions preserve the existing consumers' theorem statements. The selected owner's Process identity corrects the two Lean activation paths without widening source/profile or Temporal admission.

The new `InternalTimerTaskBatchConformance` target passes a cold-target build with warm dependencies in **44.45 seconds**, at **2,007,128 KiB GNU RSS** and **1,944,612,864 cgroup bytes**. Every controlled memory event, pressure total, and swap count is zero. The run retains Lean 4.31.0, the pinned `bpmn-lean-audit:v4.31.0-arm64` image, one CPU/thread, no network, read-only source, the fixed 3,221,225,472-byte controller, and zero additional swap. Its asserted receipt is `/tmp/bpmn-timer-task-fixture-cold-4`; [the executable cost row](../../scripts/lean-module-cost.ts) binds the mounted source and complete command receipt. At that measurement, all 618 inputs in `.cache/timer-task-arming-20260922/source-v3-manifest.json` matched the worktree; manifest SHA-256 is `d6abc5c3075c0632f5ac921de950dbfb9072b738552ba97820aa421cda3b8df5`. This is an isolated target measurement, not full-library resource acceptance or a performance comparison.

The retained failures distinguish infrastructure setup from fixture defects. The first container could not create its cache mountpoint on read-only source; the next build compiled the changed dependency closure and exposed record-layout syntax and an ambiguous sorter name. The following attempt rejected the fixture's 2,000 ms standalone Timer because the existing structural account admits 1,000 ms. Diagnostic evaluation then confirmed the corrected Program, runtime state, projection, three prepared operations, and committed command before the kernel retry. No production validator or memory limit was relaxed.

The first complete Lean run, `/tmp/bpmn-timer-task-full-lean-1`, stopped at the unchanged 1,800-second deadline after reporting target 570 of 590. It exited 124 in 1,800.06 seconds at 2,743,192 KiB GNU RSS, reached the exact 3,221,225,472-byte cgroup ceiling, and recorded `max=1034`. OOM counters and swaps were zero; both pressure totals were 886,443 microseconds. This is failed verification and rejected resource evidence. Successful cached products remain available to finish the unchanged source; the [existing acceptance protocol](COMPENSATION-RESOURCE-LEDGER.md#snapshot-invariant-and-cgroup-acceptance-correction) still requires isolated cold-consumer measurements and complete accepted gates without raising the limit or deadline.

The cache-preserving continuation `/tmp/bpmn-timer-task-full-lean-2` found one omitted exhaustive match arm in the existing `FiniteInternalTransitionConformance` family-label fixture, not a failed expected semantic result. It exited 1 in 14.23 seconds at 1,154,908,160 cgroup bytes with zero controlled events. Adding the Timer-task label keeps every fixture expectation unchanged. Its isolated cold rebuild passes in 12.86 seconds at 1,376,408 KiB RSS and 1,098,285,056 cgroup bytes, with zero events, pressure, and swaps. The corrected `source-v4` snapshot differs only in that fixture; its 618-input manifest SHA-256 is `bdf9de23dc00af2f1a88de43f9cf74dd34adebcd3e0e6c24a7e179ca7f54bc1d`.

The nine final cold-consumer measurements below use that snapshot and the unchanged isolated-target protocol. Every controlled memory event and swap count is zero. Cancellation projection records 327,285 microseconds in each pressure total; private-Timer aliasing records 8,283; the other seven record zero. Cancellation projection crosses the existing 90% GNU-RSS disclosure threshold and is recorded in `nearCapModules`; its cgroup peak leaves 256,876,544 bytes below the hard ceiling. Mounted-source and complete command-receipt digests bind every updated [cost row](../../scripts/lean-module-cost.ts).

| Exact target | Elapsed | GNU maximum RSS | Cgroup peak | Output SHA-256 |
|---|---:|---:|---:|---|
| `FiniteInternalTransitionConformance` | 12.86 s | 1,376,408 KiB | 1,098,285,056 bytes | `fa6eea6e064593c167b6a33e1a999956972980c4aac5ed90ff4e32aee1025a19` |
| `CallActivityConformance` | 31.25 s | 1,398,692 KiB | 1,149,374,464 bytes | `005b8fb9e749ee7af3624179b91f3ff49e3909aba3e92a28e85757a7a6ac052b` |
| `SequentialMultiInstanceProgramBindingConformance` | 28.10 s | 1,595,216 KiB | 1,261,617,152 bytes | `9d44b32e4d972a54a493309e86409a1fdfd81da0b7367111adb1131be1bee48f` |
| `TimerStartConformance` | 29.87 s | 1,438,340 KiB | 1,162,399,744 bytes | `c21700dd70cf5dff49817b164f2eedca75b315d7990bf765ebee037b7885a823` |
| `TerminateEndEventConformance` | 40.78 s | 1,722,640 KiB | 1,458,466,816 bytes | `0d1f490518b507d29b9344807762b1ee65b491589b92054f457384b23ed67807` |
| `InternalRegionalCancellationProjectionConformance` | 111.86 s | 2,835,716 KiB | 2,964,348,928 bytes | `4f22094f18a033de81f35b4b0d85d14dc705177d7378c4bf647a8052b925c6ef` |
| `InternalRegionalPrivateTimerAliasConformance` | 16.97 s | 2,735,872 KiB | 2,562,113,536 bytes | `54eeda38c91fd8552b5fca6b2e2d67f9ec2cbe64eed2cd5af630d4b774f15df5` |
| `ActivityBoundaryTimerConformance` | 20.59 s | 1,250,204 KiB | 935,514,112 bytes | `0e4d4255db529aa66b33b5223226b30f11b3511c520ee9108403f8905f425a0c` |
| `NonInterruptingBoundaryTimerConformance` | 18.65 s | 1,292,472 KiB | 978,010,112 bytes | `a0ffb305358a9b43f613a06687affc687c621da3a8691a31762e815a6baf64c8` |

Complete warm `lake test` and `lake build` pass all 590 and 591 targets in 2.15 and 0.68 seconds, at 475,598,848 and 53,571,584 cgroup bytes. Their output SHA-256 digests are `3d18e16035999f587201fdf707b0680ce7a0b54b0f54a6f0232618df4fbb3e5a` and `88cb29cbe4a711a4a0b76963e0b9968fefe1b474ac26bd45b935bb92572a91d3`. The ten-declaration axiom audit passes in 1.77 seconds at 383,098,880 bytes, output `0b7cd32540a46824307d45e601e236efdc5d97dea31ec0020398b9780ea2056f`; it reports only `propext`, `Classical.choice`, and `Quot.sound` for owner identity, preparation refinement, runtime/open-set preservation, actual publication, regional pair publication, and finite permutation guarantees. All three complete receipts have zero controlled memory events, pressure totals, and swaps. This establishes isolated cold-consumer plus complete warm acceptance; the earlier full-run timeout and memory rejection remain visible.

The complete TypeScript semantic-core gate passes **1,245 tests**, including both Timer-task variants in the existing regional pair and scope/local-control permutation matrices. Every tested prefix retains complete preparation, runtime/projection validity, exact final state, and actual publication. The called-Process identity regression now checks a structurally valid graph and valid predecessor/successor; it needed distinct deadline routing, one merged called End, and canonical scope ordering. Failed intermediate fixture receipts remain retained. The initial infrastructure run passed 580 checks and failed two map-word-budget checks; shortening only the edited summary and linking its existing owner fixed them. The next run caught a test-only loss of the nonempty merge-input tuple type after sorting; an explicit two-element tuple annotation fixes that without changing the tested operation. The ten focused Timer-task tests and final complete infrastructure gate pass, with all 582 infrastructure assertions green in `/tmp/bpmn-timer-task-infrastructure-3`.

Consequence: the finite executor/publication format is reused, with complete mixed-family evidence in one outcome. The 22 new Timer-task proof modules contain 4,092 nonblank lines; this measures size, not efficiency/quality or abstraction savings. Fixture admission must precede semantic use. The prepared-transition sum requires the existing exhaustive finite-frontier fixture in focused compilation; it caught the omitted constructor only at full-run completion. No new process guard or weaker full gate follows.

## Bounded Sub-Process Activity identity correction, 2026-09-22

The owner-approved [identity correction](../INTERNAL-COMMUTATION-PROPOSAL.md#bounded-sub-process-arming-outcome) uses the Sub-Process BPMN element for its Activity record and counter while retaining the child definition-scope identity. The new fixture retains the two valid Program/predecessor counterexamples, and three existing fixtures preserve canonical issuance, duplicate-body refusal, and exact snapshot lifecycle state. This is resource evidence for the in-flight outcome, not a closed checkpoint or a complete integration verdict.

Measurements use the immutable `.cache/bounded-scope-identity-20260922/source-v3` snapshot, the existing pinned ARM64 image, one CPU/thread, no network, 3,221,225,472 cgroup bytes, and no additional swap. All 624 archived Lean/toolchain input files were compared byte-for-byte with the worktree. Each retained row below has warm dependencies and a cold target. Mounted-source hashes and the complete receipt-byte hashes bind the [module-cost rows](../../scripts/lean-module-cost.ts); historical provenance is retained. All memory-event counters, pressure totals, and swap counts are zero, and none of these four modules reaches the existing RSS near-cap threshold.

| Target | Receipt under `/tmp/` | Elapsed | GNU RSS KiB | Cgroup bytes |
|---|---|---:|---:|---:|
| `BoundedScopeActivityIdentityConformance` | `bpmn-bounded-identity-cold-2` | 12.63 s | 1,992,220 | 1,724,231,680 |
| `ActivityActivationOrderConformance` | `bpmn-bounded-activity-order-cold-1` | 0.65 s | 608,860 | 182,452,224 |
| `ActivityBodyClaimUniquenessConformance` | `bpmn-bounded-body-claims-cold-2` | 7.79 s | 1,464,712 | 1,137,766,400 |
| `CompensationEventSubProcessSnapshotRootClosureConformance` | `bpmn-bounded-snapshot-root-cold-2` | 20.63 s | 1,565,576 | 1,281,593,344 |

The first container attempts recorded sandbox socket denial and a missing nested cache mount point before any Lean execution. The first executing identity-fixture run rebuilt dependencies and then failed kernel reduction of the fixture's `List.mergeSort`; replacing it with the existing kernel-reducible `SemanticProcess.sortBy` produced the retained green run without changing production semantics. Body-claim and snapshot first runs included stale dependencies, so they are functional evidence rather than isolated target costs; their dependency-warm repeats supply the table. No memory ceiling or evaluator-trust exception changed. The corrected arming soundness and issuance-law axiom audit reports only `propext`, `Classical.choice`, and `Quot.sound` in `/tmp/bpmn-bounded-identity-ambiguity-1`.

The separately approved declaration-ambiguity check extends the identity fixture with ordinary and Sequential Multi-Instance User Task refusals on valid raw Programs and predecessors. Its current isolated measurement supersedes only the first table row: `/tmp/bpmn-bounded-ambiguity-kernel-final` builds the cold target from immutable `source-v4` with warm dependencies in 30.97 s at 1,991,084 KiB RSS and 1,793,449,984 cgroup bytes. The same 3 GiB, one-thread protocol retains zero memory events, pressure, and swap; `/tmp/bpmn-bounded-ambiguity-kernel-1` is the preceding successful dependency-building run. The source and receipt digests in the module-cost row bind the expanded fixture. Both core negative witnesses fail before the check in `/tmp/bpmn-bounded-ambiguity-red-1`, the focused gate passes all 12 cases after it, and the complete core package passes all 1,264 tests in `/tmp/bpmn-bounded-ambiguity-package-1`. These finite results do not themselves prove aggregate preservation or close the bounded outcome; the proposal owns the separate quantified proof and remaining obligations.

The owner-directed checkpoint on 2026-09-23 stops further family-pair expansion for an external architecture assessment. It preserves the corrections and completed proof work but does not close the bounded outcome or authorize the TypeScript-only batch integration as a cross-target result. The [bounded outcome owner](../INTERNAL-COMMUTATION-PROPOSAL.md#bounded-sub-process-arming-outcome) records the remaining obligations and the explicit unfinished-commit exception. No closed-outcome cost row or independent semantic approval is claimed. The initial checkpoint infrastructure run caught oversized PLAN and runtime-map status passages; focused document checks corrected both before the final gate, with failed evidence retained.

The first complete Lean checkpoint run, `/tmp/bpmn-bounded-checkpoint-full-lean-1`, timed out after 1,800.05 seconds with 481 of 608 targets completed. Its GNU maximum RSS was 2,741,848 KiB; cgroup peak reached the fixed 3,221,225,472-byte ceiling, with 473 `max` events and 832,694 microseconds of both `some` and `full` pressure. OOM, OOM-kill, and swap counts were zero. This is a failed full-gate attempt, not zero-pressure resource evidence. The unchanged-source continuation retains its completed cache and the same controller, timeout, and thread/CPU limits; it does not establish cold-package performance.

The continuation `/tmp/bpmn-bounded-checkpoint-full-lean-2` passes the complete 608-target Lean gate in 396.98 seconds at 2,712,784 KiB GNU RSS and 2,457,411,584 cgroup bytes. Every memory-event counter and swap count is zero; `some` and `full` pressure each total 30,923 microseconds, so this is not a zero-pressure isolated calibration. All 636 source/toolchain inputs match the immutable `source-v1` snapshot and worktree; its manifest SHA-256 is `583bb0d19e0918c5ea410a847633784697f6f6a1ebe39c178ca5543fb99c1a4b`. The complete 1,264-test core gate passes in `/tmp/bpmn-bounded-checkpoint-core-1`, and doctor verification passes in `/tmp/bpmn-bounded-checkpoint-doctor`. Final infrastructure receipt: `/tmp/bpmn-bounded-checkpoint-infrastructure-2`. These are pre-commit package checks, not a clean Product 1 integration or semantic acceptance verdict.
