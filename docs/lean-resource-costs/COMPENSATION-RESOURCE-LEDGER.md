# Compensation resource ledger

## Status

Maintained historical evidence ledger. Dated records preserve their source, conditions and qualifications; current work is owned by [PLAN.md](../PLAN.md) and the linked specifications.

[Resource topic index](README.md) · [Cost rows](../CAPSULE-COST-LEDGER.md#measurements)

## Measurement basis

Apply [the historical measurement basis](RUNTIME-AND-ACTIVITY-LEDGER.md#measurement-basis) and the current procedure it links. Local records retain source/cache conditions and exceptions. Target calibration establishes no performance trend, cold whole-library qualification or independent semantic approval.

## Compensation snapshot resource-ceiling incident

The Compensation Event Sub-Process snapshot checkpoint repeated the same governed protocol on 2026-09-01: `docker run --rm --network=none --memory=3g --memory-swap=3g --cpus=1 ... /usr/bin/time -v ./scripts/lake.sh build <target>`, with `memory.max=3221225472`, no additional swap, `LEAN_NUM_THREADS=1`, a warm dependency closure, and only the named target's own generated artifacts removed before an immutable measurement. Diagnostic rows below were taken from the evolving working tree and therefore are design evidence rather than reproducible commit measurements; immutable rows name the exact commit whose source bytes were measured. GNU maximum RSS and cgroup peak remain separate because Docker Desktop's VM-level `ru_maxrss` can exceed the hard cgroup charge without an OOM kill. Unrelated host processes can perturb elapsed time and the VM's reported peak, so an anomalous near-bound result was retried under the unchanged ceiling; no pass was obtained by raising or disabling it.

The first breach was not a capacity shortage. Adding snapshot validation and a three-arm transition dispatcher to shared evaluator owners made declaration-free legacy fixtures re-reduce snapshot-only work for every operation. Moving the snapshot path into focused modules restored exact declaration-free delegation. A second breach showed that storing a generic `InternalCommutation.sortBy` computation inside a `Program` made every kernel-decided use of that program repeat the sort; explicit canonical snapshot atoms removed that amplification. A third class came from compound concrete fixtures: an Error interruption proposition repeatedly reconstructed and decided the program, start, purge, and recovery chain as one term. Named validated intermediate states and smaller proof owners preserved the same facts while bounding each reduction. The full-library probe then exposed a pre-existing, independent zero-margin `MessageStartConformance` monolith; splitting its unchanged laws by admission, closure, identity, and scenario made the aggregate cheap and gave every proof slice material headroom.

| Stage | Source boundary | Exact target | Exit | GNU maximum RSS | Cgroup peak | Deciding observation |
|---|---|---|---:|---:|---:|---|
| Shared-dispatch regression | Diagnostic working tree | `BpmnSemantics.SubProcessBoundaryTimerConformance` | 137 | 3,218,228 KiB | Hard 3 GiB ceiling reached | A declaration-free legacy target reduced the newly shared snapshot validator and dispatcher. |
| Focused fast-path correction, first retry | Diagnostic working tree | `BpmnSemantics.SubProcessBoundaryTimerConformance` | 0 | 2,687,260 KiB | Not retained | The same target passed under the unchanged ceiling after restoring a declaration-free path. |
| Broader minimal snapshot integration | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance` | 0 | 2,921,736 KiB | Not retained | Minimal end-to-end snapshot integration fit, at 3:11.90 elapsed. |
| Expanded unsplit snapshot integration | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance` | 1 | 3,101,876 KiB | Below the ceiling | The build retained only about 43 MiB of GNU-RSS margin and exposed false witnesses; the proof owner was split instead of accepting that margin. |
| First split lifecycle witness | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance` | 1 | 2,747,188 KiB | Not retained | The root tuple failed only `programWellFormed`; the Error tuple had an invalid program, committed start, one retained snapshot, and a rejected interruption. |
| Generic-sort design | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance` | 137 | 3,308,348 KiB | Hard 3 GiB ceiling reached | Embedding generic `InternalCommutation.sortBy` in the program repeated canonicalization in every kernel reduction. |
| Focused atom owner | Diagnostic working tree | `BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotInternalCommutation` | 0 | 683,948 KiB | Not retained | Snapshot-specific reservation, promotion, and purge atoms removed the shared-program sort. |
| Focused evaluator owner | Diagnostic working tree | `BpmnSemantics.SemanticProcess.TransitionAttempt` | 0 | 693,896 KiB | Not retained | The three-result attempt evaluator compiled before shared-owner restoration. |
| Focused trace owner | Diagnostic working tree | `BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace` | 0 | 715,456 KiB | Not retained | Replay and closure stayed cheap before the final law set. |
| Explicit root canonicalization | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance` | 0 | 2,924,548 KiB | Not retained | An explicit canonical snapshot list replaced generic sort while preserving the root-order witness. |
| Compound Error witness | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance` | 137 | 3,340,420 KiB | Hard 3 GiB ceiling reached | One compound proposition reconstructed the whole Error lifecycle. |
| Same-module Error fact split | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance` | 137 | 3,320,832 KiB | Hard 3 GiB ceiling reached | Merely naming facts in the same owner did not stop repeated reduction. |
| Declaration-aware Error start fact | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance` | 0 | 3,208,868 KiB | Below the ceiling | The pass had unsafe near-zero margin and was rejected as an adequate correction. |
| Explicit Error program state | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorProgramConformance` | 0 | 1,902,468 KiB | Not retained | A separately validated program bounded the first reduction. |
| Explicit Error outcome state | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorOutcomeConformance` | 0 | 2,549,344 KiB | Not retained | The interruption result was decided from the validated predecessor. |
| Explicit Error purge state | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorPurgeConformance` | 0 | 2,545,464 KiB | Not retained | Snapshot removal was decided independently. |
| Explicit Error recovery state | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorRecoveryConformance` | 0 | 2,545,616 KiB | Not retained | Recovery was decided independently. |
| Error aggregate after extraction | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance` | 0 | 1,754,260 KiB | Not retained | The aggregate stopped owning the reductions later measured in five exact modules. |
| Bounded full-library probe | Diagnostic working tree | `BpmnSemantics` | 1 | 3,420,192 KiB | At least one child reached the hard ceiling | `ParallelUserTaskMetadataCompositionConformance` and `MessageStartConformance` were killed; `CommittedExecutionPublication` also exposed a type mismatch. Elapsed was 12:36.56. |
| Parallel-metadata isolated retry | Diagnostic working tree | `BpmnSemantics.ParallelUserTaskMetadataCompositionConformance` | 0 | 3,395,384 KiB | Below the hard process-tree charge | The retry confirmed a noisy pre-existing near-cap target; its established comparison baseline is 3,282,876 KiB. |
| Publication compatibility repair | Diagnostic working tree | `BpmnSemantics.CommittedExecutionPublication` | 0 | 3,252,168 KiB | Below the ceiling | The temporary compatibility repair compiled; restoring the shared base source later eliminated the need for it. |
| Focused snapshot lifecycle, final design | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance` | 0 | 2,974,572 KiB | Below the ceiling | The focused API and exact legacy delegation removed shared amplification. |
| Focused snapshot root, final design | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance` | 0 | 2,929,356 KiB | Below the ceiling | The root proof remained the checkpoint's near-cap owner and required immutable remeasurement. |
| Focused snapshot Error aggregate, final design | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance` | 0 | 2,712,404 KiB | Below the ceiling | Split predecessor owners bounded the aggregate. |
| Focused snapshot atomicity, final design | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance` | 0 | 1,944,748 KiB | Below the ceiling | Whole-command refusal and trace atomicity fit with material margin. |
| Focused snapshot aggregate, warm diagnostic | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance` | 0 | 626,000 KiB | Not retained | The aggregate became import-only rather than a second proof owner. |
| Focused trace after universal laws | Diagnostic working tree | `BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace` | 0 | 670,172 KiB | 164,728,832 bytes | Result erasure, emitted-trace replay, noncommitted no-trace, no-trace no-lifecycle, and atomic-refusal laws remained cheap. |
| Focused command admission | Diagnostic working tree | `BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotCommandAdmission` | 0 | 629,084 KiB | Not retained | Validation runs once and declaration-free commands delegate exactly. |
| Focused commutation owner | Diagnostic working tree | `BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotInternalCommutation` | 0 | 667,264 KiB | Not retained | The extended atom vocabulary stays outside the shared `InternalStateAtom`. |
| Complete focused snapshot aggregate rebuild | Diagnostic working tree | `BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance` | 0 | 2,928,900 KiB | 2,665,435,136 bytes | The final design retained roughly 530 MiB of cgroup margin with no pressure or OOM event. |

The full-library probe's Message Start kill was reproducible enough to reject as host noise but variable enough to require retaining every retry. Before extraction, its earlier immutable row at `826231ab` was 3,116,780 KiB in 33.77 seconds. An observed failure reached 3,438,640 KiB. A partial three-dependency extraction passed at 3,151,392 KiB in 45.37 seconds, but a target-only retry was killed at 3,328,788 KiB with cgroup peak 3,221,225,472 bytes and `memory.events` recording `max=1641`, `oom=1`, `oom_kill=1`. After the first helper extraction, one run passed at 3,296,972 KiB with `max=2835` and no OOM, while an identical retry was killed at 3,345,072 KiB with `max=41975`, `oom=1`, `oom_kill=1`. Restoring the shared atom type while snapshot and cancellation hooks remained in shared owners produced a warm-dependency pass at 3,333,188 KiB with `max=6007`, followed by a target-only kill at 3,363,148 KiB with `max=7046`, `oom=1`, `oom_kill=1`. After every shared hook owner matched `HEAD`, a run that also rebuilt `Execution`, `Scenario`, and fixtures passed at 3,402,388 KiB with `max=452`, and a target-only retry passed at 3,226,700 KiB with `max=6319`; that was still effectively zero healthy margin. The accepted correction is commit `71b45760`, which split the unchanged laws and reduced the cold aggregate to 1,745,976 KiB by GNU time and 1,810,862,080 bytes by cgroup, with no pressure or OOM event.

| Immutable commit | Exact target | Elapsed | GNU maximum RSS | Cgroup peak | Verdict |
|---|---|---:|---:|---:|---|
| `71b45760` | `BpmnSemantics.MessageStartAdmissionConformance` | 9.54 s | 1,810,064 KiB | 1,410,764,800 bytes | Exit 0 |
| `71b45760` | `BpmnSemantics.MessageStartClosureConformance` | 6.87 s | 1,681,372 KiB | 1,240,563,712 bytes | Exit 0 |
| `71b45760` | `BpmnSemantics.MessageStartIdentityConformance` | 7.80 s | 1,539,460 KiB | 1,090,801,664 bytes | Exit 0 |
| `71b45760` | `BpmnSemantics.MessageStartScenarioConformance` | 6.56 s | 1,419,604 KiB | 971,304,960 bytes | Exit 0 |
| `71b45760` | `BpmnSemantics.MessageStartConformance` | 0.35 s | 618,008 KiB | 119,660,544 bytes | Exit 0 |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance` | 19.33 s | 2,050,248 KiB | 1,746,440,192 bytes | Exit 0 |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance` | 33.59 s | 2,929,256 KiB | 2,704,228,352 bytes | Exit 0; above the 90% GNU-RSS disclosure threshold |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorProgramConformance` | 6.54 s | 1,755,796 KiB | 1,309,077,504 bytes | Exit 0 |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorReadyStateConformance` | 5.99 s | 1,898,152 KiB | 1,452,879,872 bytes | Exit 0 |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorOutcomeConformance` | 9.94 s | 2,545,104 KiB | 2,112,049,152 bytes | Exit 0 |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorPurgeConformance` | 11.64 s | 2,546,956 KiB | 2,115,612,672 bytes | Exit 0 |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorRecoveryConformance` | 10.55 s | 2,545,196 KiB | 2,112,237,568 bytes | Exit 0 |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance` | 9.30 s | 1,894,208 KiB | 1,492,148,224 bytes | Exit 0 |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance` | 0.67 s | 642,024 KiB | 133,312,512 bytes | Exit 0 |
| `bd2bef03` | `BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance` | 0.47 s | 622,884 KiB | 121,970,688 bytes | Exit 0 |
| `1fda9213` | `BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance` | 6.92 s | 1,464,728 KiB | 1,085,808,640 bytes | Exit 0; checkpoint-review correction remeasurement |
| `1fda9213` | `BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance` | 11.81 s | 1,847,580 KiB | 1,538,920,448 bytes | Exit 0; checkpoint-review correction remeasurement |
| `1fda9213` | `BpmnSemantics.UserTaskMetadataConformance` | 13.36 s | 1,748,740 KiB | 1,412,497,408 bytes | Exit 0; checkpoint-review correction remeasurement |
| `6208f2e4` | `BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance` | 20.52 s | 2,126,608 KiB | 1,911,873,536 bytes | Exit 0; second correction-audit remeasurement |
| `6208f2e4` | `BpmnSemantics.ServiceTaskIncidentRetryConformance` | 23.34 s | 2,432,344 KiB | 2,138,685,440 bytes | Exit 0; controlled proof-regression remeasurement |

These immutable rows are the acceptance evidence. The root-closure target retains about 493 MiB of cgroup headroom even though its GNU-RSS figure crosses the record's conservative 90% disclosure threshold; every other new snapshot owner is below that threshold. The first three checkpoint-review correction measurements and both second-audit remeasurements used their own commit-specific Linux cache after each named target had been prewarmed and only its own generated artifacts removed. All five reported `memory.events` values of zero for `high`, `max`, `oom`, `oom_kill`, and `oom_group_kill`. Their elapsed figures were plausible for the unchanged one-CPU lane, so host-contention retries were not needed. The later lifecycle measurement covers the quantified root/child/completion and regional-cancellation laws plus the pre-closure Timer discriminator; the Service Task incident measurement binds the exhaustive proof repair forced by declaration-aware admission. The governing correction is therefore structural rather than a larger allowance: focused snapshot admission, transition, trace, and commutation owners; exact declaration-free delegation laws; explicit validated predecessor states; and split proof owners. Raising the ceiling by 0.5 GiB would make the rejected generic-sort, compound-fixture, or zero-margin monolith designs appear green without removing their amplification, so the 3 GiB bound remains unchanged.

## Parallel metadata and cyclic-consumer continuation

The first post-checkpoint full-library repair did not end with the snapshot owners. `ParallelUserTaskMetadataCompositionConformance` was killed under the same 3 GiB controller after the full-library probe made its accumulated exact-composition laws cold. An unchanged-limit isolated retry again ended with Lean code 137 after 46 seconds. The correction split admission, runtime, and closure laws into independent owners and made the original module an import-only aggregate; all 19 public theorem names were preserved. The first focused rows were already bounded—1,770,820 KiB for admission, 1,991,556 KiB for runtime, 2,530,968 KiB for closure, and 619,796 KiB for the aggregate—but the first complete build still touched the exact cgroup ceiling with `memory.events max=1940`, so the repair was not accepted on those focused exits alone.

That complete build exposed a second mechanism rather than another memory limit: four cyclic-control-flow consumers depended on the concrete shape of a private snapshot-bypassing evaluator. Splitting the parallel owner changed elaboration enough to expose the hidden dependency. The first correction failed because `fireWithoutCompensationSnapshots?` was private; the second chose `List ConditionalOutput` where the public contract requires `List ConditionalCandidate`; the third used `BpmnElementOrigin` where the route requires `BpmnSequenceFlowOrigin`. The accepted repair expressed the cyclic fixtures through public declaration-free constructor laws. The base cyclic target then passed, a complete test predicted and exposed the same issue in `CyclicControlFlowExecutionConformance`, and the same public-law correction repaired execution, reachability, and step-completeness without publishing or duplicating the private evaluator.

| Boundary | Exact target | Elapsed | GNU maximum RSS | Cgroup peak | Verdict |
|---|---|---:|---:|---:|---|
| Diagnostic split | `BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance` | 13.17 s | 1,770,820 KiB | 2,125,529,088 bytes | Exit 0 |
| Diagnostic split | `BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance` | 13.32 s | 1,991,556 KiB | 1,679,495,168 bytes | Exit 0 |
| Diagnostic split | `BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance` | 19.02 s | 2,530,968 KiB | 2,274,824,192 bytes | Exit 0 |
| Diagnostic split | `BpmnSemantics.ParallelUserTaskMetadataCompositionConformance` | 0.67 s | 619,796 KiB | 213,323,776 bytes | Exit 0; import-only aggregate |
| Diagnostic cyclic repair | `BpmnSemantics.SemanticProcess.CyclicControlFlowConformance` | 3:19.41 | 2,040,052 KiB | 1,744,367,616 bytes | Exit 0 after three failed type/private-boundary attempts |
| Diagnostic cyclic family | base, execution, reachability, and step-completeness | 3:38.32 | 1,986,988 KiB | 1,733,664,768 bytes | Exit 0 |
| `223486be` | `BpmnSemantics.ParallelUserTaskMetadataCompositionAdmissionConformance` | 11.73 s | 1,802,080 KiB | 1,496,846,336 bytes | Exit 0; no pressure event |
| `223486be` | `BpmnSemantics.ParallelUserTaskMetadataCompositionRuntimeConformance` | 13.87 s | 2,076,884 KiB | 1,778,135,040 bytes | Exit 0; no pressure event |
| `223486be` | `BpmnSemantics.ParallelUserTaskMetadataCompositionClosureConformance` | 24.56 s | 2,439,560 KiB | 2,213,457,920 bytes | Exit 0; no pressure event |
| `223486be` | `BpmnSemantics.ParallelUserTaskMetadataCompositionConformance` | 1.41 s | 615,444 KiB | 211,906,560 bytes | Exit 0; import-only aggregate |
| `223486be` | `BpmnSemantics.SemanticProcess.CyclicControlFlowConformance` | 16.19 s | 2,087,352 KiB | 1,810,960,384 bytes | Exit 0; no pressure event |
| `223486be` | `BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance` | 5.53 s | 790,732 KiB | 394,293,248 bytes | Exit 0; no pressure event |
| `223486be` | `BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance` | 3.99 s | 775,300 KiB | 390,721,536 bytes | Exit 0; no pressure event |
| `223486be` | `BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance` | 3.44 s | 825,916 KiB | 441,712,640 bytes | Exit 0; no pressure event |

After those repairs, a complete Lean build passed in 6:01.61 at 3,128,672 KiB GNU RSS and 3,030,597,632 bytes cgroup peak with no pressure event. The complete Lean test also exited zero, but it reached the exact 3,221,225,472-byte cgroup ceiling and recorded `memory.events max=32353`; an exit-zero test at zero process-tree margin was treated as a design failure, not as closure evidence.

## Whole-library near-cap audit and exact-pressure repair

The zero-margin complete test triggered an isolated census of every disclosed near-cap conformance target under the unchanged controller. Elapsed time was treated as noisy because unrelated host processes were active; cgroup ceiling events were not. Every suspicious exact-cap result was retried before selecting a structural change.

| Exact target | First GNU RSS / cgroup peak | Retry GNU RSS / cgroup peak | Classification |
|---|---:|---:|---|
| `SequentialMultiInstanceConformance` | 3,343,496 KiB / 3,121,868,800 bytes | 3,303,628 KiB / exact ceiling, `max=43` | Unsafe proof monolith |
| `FlowNodeOccurrenceLifecycleConformance` | 3,335,824 KiB / exact ceiling, `max=441` | 3,243,788 KiB / exact ceiling, `max=358` | Unsafe proof monolith |
| `RuntimeStateWellFormedConformance` | 3,106,528 KiB / 3,180,548,096 bytes | 3,133,532 KiB / exact ceiling, `max=33` | Unsafe proof monolith |
| `RuntimeStateActivityConformance` | 3,202,508 KiB / 3,112,075,264 bytes | 2,974,532 KiB / 2,994,561,024 bytes | Initially variable; exact ceiling with `max=120` after fixture narrowing proved it unsafe |
| `TimerStartConformance` | 2,953,420 KiB / 2,797,490,176 bytes | Not required | Retained near-cap disclosure |
| `MessagePayloadCatchConformance` | 3,070,632 KiB / 2,805,493,760 bytes | Not required | Retained near-cap disclosure |
| `SequentialMultiInstanceProgramBindingConformance` | 2,963,568 KiB / 2,795,372,544 bytes | Not required | Retained near-cap disclosure |
| `CallActivityConformance` | 3,200,492 KiB / 2,976,841,728 bytes | Not required | Retained near-cap disclosure |
| `CompensationEventSubProcessSnapshotRootClosureConformance` | 2,926,744 KiB / 2,950,213,632 bytes | 2,923,776 KiB / 2,715,987,968 bytes | Retained near-cap disclosure; unchanged-limit retry restored about 482 MiB cgroup margin |
| `TerminateEndEventConformance` | 2,813,976 KiB / 2,662,846,464 bytes | Not required | Retained near-cap disclosure |

The selected root mechanism was proof ownership, not file size or host capacity. Sequential Multi-Instance mixed runtime/lifecycle, refusal/bound, and canonical-JSON reductions around one shared lifecycle chain. Runtime well-formedness mixed ordinary invariant, Event-Based Gateway, and successor reductions, while its Activity owner still mixed boundary-Activity and sequential-controller reductions. Flow-node lifecycle imported thirteen semantic owners and evaluated every happy-path, projection-validity, cancellation, and rejection family in one target. Commit `da6e6477` moved unchanged declarations into sibling proof owners, preserved the original namespaces and import paths as declaration-free aggregates, and registered every aggregate in the import-only source guard. The only compile correction added the exact `TransitionTrace` import required by the moved `TracedStimulusResult` helpers.

| Immutable commit | Exact target | Elapsed | GNU maximum RSS | Cgroup peak | Verdict |
|---|---|---:|---:|---:|---|
| `da6e6477` | `BpmnSemantics.SequentialMultiInstanceRuntimeConformance` | 20.11 s | 2,509,372 KiB | 2,238,963,712 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.SequentialMultiInstanceRefusalConformance` | 10.21 s | 1,791,356 KiB | 1,443,962,880 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.SequentialMultiInstanceCanonicalJsonConformance` | 1.91 s | 833,720 KiB | 430,080,000 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.SequentialMultiInstanceConformance` | 0.65 s | 619,012 KiB | 213,352,448 bytes | Exit 0; import-only aggregate |
| `da6e6477` | `BpmnSemantics.RuntimeStateActivityOccurrenceConformance` | 18.29 s | 2,116,976 KiB | 1,838,526,464 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.RuntimeStateControllerConformance` | 16.00 s | 2,089,244 KiB | 1,793,007,616 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.RuntimeStateActivityConformance` | 0.55 s | 618,664 KiB | 213,245,952 bytes | Exit 0; import-only aggregate |
| `da6e6477` | `BpmnSemantics.RuntimeStateWellFormedInvariantConformance` | 14.62 s | 2,048,816 KiB | 1,740,648,448 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.RuntimeStateWellFormedEventRaceConformance` | 5.49 s | 1,390,688 KiB | 1,026,326,528 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.RuntimeStateWellFormedSuccessorConformance` | 14.57 s | 1,832,044 KiB | 1,526,501,376 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.RuntimeStateWellFormedConformance` | 0.55 s | 619,360 KiB | 214,175,744 bytes | Exit 0; import-only aggregate |
| `da6e6477` | `BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance` | 2.21 s | 639,644 KiB | 234,483,712 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformance` | 13.87 s | 2,172,304 KiB | 1,850,167,296 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.FlowNodeOccurrenceLifecycleProjectionConformance` | 9.89 s | 1,699,276 KiB | 1,362,251,776 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformance` | 16.10 s | 2,333,280 KiB | 2,064,138,240 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.FlowNodeOccurrenceLifecycleCancellationConformance` | 14.06 s | 2,086,828 KiB | 1,787,998,208 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.FlowNodeOccurrenceLifecycleRejectionConformance` | 1.07 s | 751,784 KiB | 346,161,152 bytes | Exit 0; no pressure event |
| `da6e6477` | `BpmnSemantics.FlowNodeOccurrenceLifecycleConformance` | 0.66 s | 620,612 KiB | 214,188,032 bytes | Exit 0; import-only aggregate |

The repaired complete Lean test passed in 5.18 seconds at 939,468 KiB GNU RSS and 1,266,122,752 bytes cgroup peak; the complete Lean build passed in 18.18 seconds at 2,308,556 KiB and 1,988,366,336 bytes. Both reported zero for `high`, `max`, `oom`, `oom_kill`, and `oom_group_kill`. These warm whole-graph times are not compared with the earlier multi-minute runs because their cache state differed and the host was active; the material result is the absence of pressure with more than 1 GiB of cgroup margin. The ceiling remains 3 GiB. Increasing it would have hidden four independently reproduced ownership defects and removed the oracle that forced their common structural correction.

## Snapshot invariant and cgroup acceptance correction

The second semantic-checkpoint correction audit found that the child-entry, bounded-child-entry, and scope-completion lifecycle theorems established only the expected snapshot collection shape, not the quantified aggregate state invariant of every applied successor. Commit `7b3ca41f` adds a fail-closed `applyValidSnapshotSuccessor` boundary and separate `attemptInternalOperation_enterScope_applied_stateValid`, `attemptInternalOperation_enterBoundedScope_applied_stateValid`, and `attemptInternalOperation_completeScope_applied_stateValid` theorems. Extracting that boundary into `InternalOperationAttempt.lean` was required when `Transition.lean` reached 811 nonblank lines; the transition owner returned to 777 without weakening the 800-line review target.

The same audit exposed a control-plane gap: GNU RSS rows alone could not reject a command that exited zero at the exact cgroup ceiling. [`lean-memory-acceptance.ts`](../../scripts/lean-memory-acceptance.ts) now rejects a nonzero command exit, `memory.peak` greater than or equal to 3,221,225,472 bytes, or any nonzero `high`, `max`, `oom`, `oom_kill`, or `oom_group_kill` event. Its tests include the exact-bound, exit-zero adversary. A 13:28.92 diagnostic full test is retained as rejected evidence: it exited zero at 3,157,844 KiB GNU RSS but reached the exact cgroup ceiling with `max=103`.

The unchanged-limit isolation pass then exercised every cold consumer implicated by that diagnostic result. Elapsed time is reported but not compared because other host processes were active; the cgroup peaks and zero-event results decide acceptance.

| Diagnostic target | Elapsed | GNU maximum RSS | Cgroup peak | Memory events |
|---|---:|---:|---:|---|
| `TerminateEndEventConformance` | 36.54 s | 2,928,144 KiB | 2,793,156,608 bytes | All zero |
| `SequentialMultiInstanceProgramBindingConformance` | 33.46 s | 3,013,432 KiB | 2,875,363,328 bytes | All zero |
| `CallActivityConformance` | 27.19 s | 3,294,196 KiB | 3,091,030,016 bytes | All zero |
| `TimerStartConformance` | 24.65 s | 3,079,472 KiB | 2,874,978,304 bytes | All zero |
| Standing watch set | Remeasurement trigger | Required response |
|---|---|---|
| `CallActivityConformance`, `SequentialMultiInstanceProgramBindingConformance`, `TimerStartConformance`, and `TerminateEndEventConformance` | A capsule adds or changes a reduction family consumed by any listed target | Remeasure each affected exact target under the unchanged 3 GiB ceiling with every controlled memory event zero. If margin is unsafe, first isolate asynchronous elaboration and repeated fixture construction as in the E1 experiment above; use local synchronous elaboration, kernel-locked literal fixtures, and reusable laws where they remove measured amplification. Split by proof ownership only for residual accumulation; a single over-bound obligation needs its own reduction repair. Do not budget fixture sites or raise the limit. |

The accepted complete receipts are immutable at `7b3ca41f`. The warm-closure test ran in 0.65 seconds at 120,048 KiB GNU RSS and 136,794,112 bytes cgroup peak; its log SHA-256 is `aaec15959030baf4dae2b0327c50fdb5b8a765e3f80ad93b82629f4339833d58`. The warm-closure build ran in 0.45 seconds at 119,768 KiB and 36,450,304 bytes; its log SHA-256 is `748a58696eab89272da962e2f88d514187abf2aab87a66985dfedc4e14ee0a13`. Both exited zero with every controlled memory event zero. The validator binds these receipts as closure evidence while the rejected cold diagnostic and isolated cold-consumer rows remain visible; no larger limit or exit-code-only exception was introduced.

## External-review fixture cost binding

The external-review corrections were remeasured at immutable commit `eed22392635ba31cc485367a0a1bf460b6d1c8f4` on 2026-09-06 under the identical pinned image and 3 GiB, no-additional-swap, one-CPU protocol above. The corrected [User Task fixture](../../BpmnSemantics/UserTaskInteractionConformance.lean) and [Compensation collision fixture](../../BpmnSemantics/CompensationTriggerHandlerRuntimeConformance.lean) were each rebuilt alone after warming their dependencies and moving only that target's generated artifacts out of the isolated cache. Both exited zero with zero swaps, every cgroup memory-event counter zero, and zero memory-pressure totals; neither reaches the 90% disclosure threshold. These records replace the stale source bindings in the executable cost registry without changing either fixture or the memory policy.

| Corrected target at `eed22392` | Elapsed | GNU maximum RSS | Cgroup peak | Output SHA-256 |
|---|---:|---:|---:|---|
| `UserTaskInteractionConformance` | 7.14 s | 1,516,764 KiB | 1,154,441,216 bytes | `ac68ba3162e016bb0893f29b7b19c45b039915b48fcf8532420a8140c4378002` |
| `CompensationTriggerHandlerRuntimeConformance` | 4.78 s | 1,292,220 KiB | 909,676,544 bytes | `2d07cdd47b74a2bab9fed4dbf6c477cc49f67613e8784f97ca1f2b0815bf5303` |

The composed declaration-dispatch correction was remeasured at immutable commit `8d3927f6bf7c1336ac69a6fb5c7e07d1af24194b` on 2026-09-06 under the same pinned image, one CPU, network isolation, and unchanged 3 GiB/no-additional-swap controller. After warming the dependency closure, each exact target's eight generated artifacts were moved aside and rebuilt alone. The changed refusal owner and all four standing-watch consumers exited zero with zero swaps, memory-event counters, and memory-pressure totals. The largest cgroup peak leaves 1,994,100,736 bytes below the limit. Elapsed time remains host-load context; no uncontended performance trend is claimed.

| Dispatch-correction target at `8d3927f6` | Elapsed | GNU maximum RSS | Cgroup peak | Output SHA-256 |
|---|---:|---:|---:|---|
| `ActivityDataInputOutputRefusalConformance` | 2.41 s | 731,312 KiB | 328,609,792 bytes | `e88d8a55197363f4eac99e11aabc090f1ac44dd761782be5cc1115d7acda342f` |
| `CallActivityConformance` | 23.17 s | 1,346,800 KiB | 1,040,437,248 bytes | `022df2035793221edf5a2b2d70bdb2fa5b1d1d5db3e6d4d0f77948d8a4e8eb48` |
| `SequentialMultiInstanceProgramBindingConformance` | 29.75 s | 1,548,508 KiB | 1,195,859,968 bytes | `55e8c9f1b624321cc89a041c1afdbff63ca54cca6c209efb0698b5a7707674bf` |
| `TimerStartConformance` | 22.32 s | 1,416,936 KiB | 1,103,904,768 bytes | `b9f654b21521188648308ae5e0028767eb161fe6b22fa999f96e9fbeb7a05b15` |
| `TerminateEndEventConformance` | 31.07 s | 1,543,944 KiB | 1,227,124,736 bytes | `2a3ba7d46f11f2f67117cf66bbf993af57d1b1c2b5ba9b3e53a9a4b958691ea2` |

## Compensation trigger-handler module-cost binding

The compensation trigger-handler proof owners were initially measured from immutable commit `ef739572` with a warm dependency closure and only each measured target's own generated artifacts removed. Other host processes were active, so elapsed time is recorded but not compared; every command exited zero without swap, and every cgroup `high`, `max`, `oom`, `oom_kill`, and `oom_group_kill` event remained zero.

| Target | Elapsed | GNU maximum RSS | Cgroup peak |
|---|---:|---:|---:|
| `CompensationTriggerHandlerRuntimeContractConformance` | 0.68 s | 705,308 KiB | 176,893,952 bytes |
| `CompensationTriggerHandlerRuntimeConformance` | 2.93 s | 1,086,024 KiB | 710,311,936 bytes |
| `CompensationTriggerHandlerTransitionConformance` | 11.19 s | 1,892,392 KiB | 1,473,748,992 bytes |
| `CompensationTriggerHandlerCompletionConformance` | 27.28 s | 2,966,900 KiB | 2,705,903,616 bytes |
| `CompensationActivityRetentionConformance` | 6.68 s | 1,916,172 KiB | 1,468,231,680 bytes |
| `CompensationEventSubProcessSnapshotAtomicityConformance` | 6.55 s | 1,977,500 KiB | 1,534,824,448 bytes |

The completion owner crosses the conservative 90% GNU-RSS disclosure threshold and is therefore listed in the executable near-cap registry. Its cgroup peak retained 515,321,856 bytes of hard-limit headroom with no pressure event. The fixed 3 GiB ceiling remains unchanged; the owner is viable but must not absorb another proof family without remeasurement or structural separation.

Commit `3020899b` added the separate cancellation conformance owner. Its immutable cold-target measurement passed in 0.58 seconds at 614,680 KiB GNU RSS and 175,321,088 bytes cgroup peak. Because the changed relation became a dependency of the near-cap completion owner, that target was remeasured rather than treated as unchanged: the first run passed in 27.48 seconds at 2,787,884 KiB and 2,478,338,048 bytes, but crossed below the disclosure threshold relative to the preceding record, so it was repeated. The conservative retained run passed in 27.07 seconds at 2,938,028 KiB and 2,623,070,208 bytes. Both completion runs and the cancellation run had no swap or controlled pressure/OOM event. The completion owner therefore remains disclosed and retains 598,155,264 bytes of cgroup headroom under the unchanged ceiling.

Correction commit `7126d5db` added the nonempty-trigger validity witness to `CompensationTriggerHandlerTransitionConformance`, so that target was remeasured against the immutable source revision. The first cold-target run passed in 11.89 seconds at 1,833,352 KiB GNU RSS and 2,024,046,592 bytes cgroup peak, with 90% CPU allocation and 1,570 major page faults. The identical retry passed in 11.19 seconds at 1,892,392 KiB and 1,473,748,992 bytes, with 98% CPU allocation and no major page fault; that more comparable retry supplies the executable row, while this paragraph retains the first run's higher process-tree charge. Both runs had no swap and zero `high`, `max`, `oom`, `oom_kill`, and `oom_group_kill` events. The target remains below the near-cap threshold under the unchanged 3 GiB ceiling.

## Compensation source checkpoint proof-owner repair

The first compensation source checkpoint implementation at immutable commit `02cf3d3a` placed all kernel-reduced admission, JSON, compatibility, and definition-binding assertions in `BpmnSemantics.CompensationSourceLoweringConformance`. Its first bounded container build also had to warm stale dependencies, so it is not an accepted cold-target cost row, but the target's own elaboration then ran for 734 seconds and exited `137` under the fixed 3 GiB process-tree ceiling. The last observation before termination recorded `memory.current=3,220,975,616`, `memory.peak=3,221,225,472`, and `memory.events max=4,108,930`; `high`, `oom`, and `oom_kill` were zero at that observation, but the final event file was not captured and is not inferred.

The first repair separated shared fixtures, admission, JSON, compatibility, and binding owners. The admission, JSON, compatibility, and import-only aggregate targets passed, but the binding owner still collected fifteen independent kernel decisions in one file and exited `137` after 197 seconds. Splitting conjunctions into named theorems had therefore not repaired the mechanism: the reduction work still accumulated under one proof owner.

Commit `b4544cf6` splits the binding obligations again by invariant family: valid Program shape, exact parser-graph references, trigger and restored-binding identity, storage-limit joins, and execution-limit joins. Every original obligation remains kernel checked, while the binding and checkpoint aggregates become import-only. Raising the memory ceiling was rejected because it would hide proof-ownership coupling and remove the existing pressure signal without creating a stable bound.

All ten accepted measurements below use immutable commit `b4544cf6`, the pinned `bpmn-lean-audit:v4.31.0-arm64` image with image ID `sha256:4df22c7a1ec8ba8c4c2795fdea1269d7b9cadade4e65b22e595047509aa27950`, one CPU, no network, the unchanged 3 GiB memory and no-additional-swap bounds, a warm dependency closure, and removal only of the named target's generated artifacts. Other machine processes were active, so elapsed time is retained as context rather than treated as a regression signal; CPU allocation remained between 86% and 99%, and no retry was required.

| Target | Elapsed | GNU maximum RSS | Cgroup peak |
|---|---:|---:|---:|
| `CompensationSourceAdmissionConformance` | 20.54 s | 2,863,952 KiB | 2,486,214,656 bytes |
| `CompensationSourceJsonConformance` | 12.15 s | 2,326,880 KiB | 1,910,824,960 bytes |
| `CompensationSourceCompatibilityConformance` | 0.69 s | 667,864 KiB | 156,762,112 bytes |
| `CompensationSourceBindingReferenceConformance` | 31.89 s | 2,725,808 KiB | 2,412,118,016 bytes |
| `CompensationSourceBindingTriggerConformance` | 20.36 s | 2,379,680 KiB | 2,019,799,040 bytes |
| `CompensationSourceBindingStorageLimitConformance` | 33.68 s | 2,701,156 KiB | 2,419,683,328 bytes |
| `CompensationSourceBindingExecutionLimitConformance` | 25.21 s | 2,574,272 KiB | 2,271,854,592 bytes |
| `CompensationSourceBindingValidProgramConformance` | 11.43 s | 1,833,660 KiB | 1,414,615,040 bytes |
| `CompensationSourceBindingConformance` | 0.50 s | 635,228 KiB | 127,651,840 bytes |
| `CompensationSourceLoweringConformance` | 0.59 s | 635,272 KiB | 129,077,248 bytes |

Every accepted target exited zero with zero swap and every controlled `low`, `high`, `max`, `oom`, `oom_kill`, `oom_group_kill`, and `sock_throttled` event at zero. `CompensationSourceAdmissionConformance` alone crosses the GNU-RSS 90% disclosure threshold and is now ratcheted as near-cap; its cgroup peak retains exactly 735,010,816 bytes of headroom. The two failed layouts remain part of the evidence because the hard ceiling exposed proof-reduction ownership, not source-file length or missing memory.

## Compensation start-capacity assurance

Commit `8ab3ba5f` extends `CompensationSourceCompatibilityConformance` with Program-derived start admission and changes its source bytes, so the old 667,864 KiB row at `b4544cf6` cannot remain its executable ratchet. The replacement uses the same pinned image, one CPU, no network, warm dependency closure, exact-target artifact removal, 3,221,225,472-byte memory limit, and zero additional swap.

The first concrete boundary used 7,510 and 7,511 ASCII value bytes. Production encoders produced snapshot/execution pairs of 8,192/18,257 and 8,193/18,259 bytes; the target exited `137` at `memory.peak=3,221,225,472`, with `oom=1` and `oom_kill=1`. Removing that value case and retaining the 875/876-byte identity boundary, whose pairs were 4,131/20,467 and 4,135/20,487 bytes, reproduced the same exact-ceiling OOM. A compact literal representation and then a single exact-side proposition each reproduced the exact-ceiling OOM, excluding source generation, conjunction size, and the rejected half as causes.

Removing both long concrete reductions passed under the unchanged limit in 10.80 seconds at cgroup peak 2,082,803,712 bytes with every controlled pressure/OOM event zero. The accepted design retains the universal arbitrary-start implication, production encoders, ordinary command-path state preservation, and escaped/multibyte decisions in Lean; independently written TypeScript and Product 1 witnesses own the full inherited-limit exact-fit/+1 cases. Neither a larger limit nor `native_decide` is selected.

The final cold-target build with short exact/one-under representative decisions passed in 15.00 seconds at 1,938,140 KiB GNU RSS and 2,324,123,648 cgroup bytes. `memory.max=3,221,225,472`, `memory.swap.max=0`, and every controlled event was zero. The output SHA-256 is `9f4d36fbf9c61fcb1a3525478c8c4a557b7752dce4a47af3a2c46af4cd24fb76`; this immutable-source measurement supplies the replacement executable row and remains below the near-cap threshold. The [start-data specification](../capsules/COMPENSATION-DURABILITY-START-DATA-REPAIR-SPEC.md#lean-assurance-correction-after-the-hard-ceiling) owns the semantic assurance split.

Cold-review correction commit `05244cf7` routes that short exact/one-under decision through ordinary command admission and therefore changes the target bytes again. After warming the dependency closure and recoverably moving only the target's seven generated products out of the cache, the exact committed source rebuilt under the same fixed ceiling in 14.78 seconds at 2,023,220 KiB GNU RSS and 2,228,940,800 cgroup bytes. `memory.max=3,221,225,472`, `memory.swap.max=0`, every controlled event and both pressure totals were zero, and the build emitted no signal. The source SHA-256 is `359f8b0c3747a6b5d91919c4b20456ded8bb5980ef5e22caebb0fc1f788e0d58` and the output SHA-256 is `506a17fa0c72ad1a5fd0dcbe3db3030ab12b6ea9a884af451901e1a9ae997b66`; this measurement replaces only the executable ratchet row, while every preceding OOM and design-disposition fact remains retained above.

## Message key-correlation population module-cost binding

The answer-free two-instance population conformance target was measured from immutable commit `b39031028942b005452179f98e7dc46ff912106d` on 2026-09-03 under the same pinned image, one-CPU, one-Lean-thread, no-network, 3 GiB memory, and no-additional-swap protocol. The exact commit archive was bind-mounted read-only with a separate commit-specific Linux cache; after a successful target prewarm, only the target's eight `.olean`, `.ilean`, hash, trace, C, and setup products were recoverably moved out of that cache. `BpmnSemantics.EnginePopulationScenarioConformance` then rebuilt in 0.85 seconds at 669,784 KiB GNU RSS and 257,982,464 cgroup bytes, with 72% CPU allocation, zero swap, every controlled memory event zero, and both pressure totals zero. Other host processes were active, so elapsed time is retained only as context. The source SHA-256 is `41a697fbc7b70acb4a836981e8a848dd60c76b496cf6b7b85aad21b08d60af82` and the output SHA-256 is `8f3f61f4752786d47d01f9b56dcba1320c14b9805d9f3b06f559ff28fb16f798`. The target remains far below the near-cap disclosure threshold; capsule churn and comparative reflection remain closure obligations rather than being inferred from this module measurement.
