# Review and workflow cost evidence ledger

## Status

Maintained historical evidence ledger. Dated records preserve their source, conditions and qualifications; current work is owned by [PLAN.md](../PLAN.md) and the linked specifications.

[Outcome topic index](README.md) · [Cost rows](../CAPSULE-COST-LEDGER.md#measurements)

These records preserve measured command populations, reviews, failures and qualifications. They do not measure engineering effort or certify later source. Numeric capsule rows live only in the root cost registry; command timings and non-registry endpoint observations remain here.

## Repair closure costs

These immutable checkpoint and closure-target ranges record the reviewed repairs; their specification receipts own approval. Closure-target rows retain all intervening work without subtraction; the earlier rows preserve the narrower implementation attribution. Subsequent cost binding, receipt, and graduation bookkeeping are excluded. Elapsed authoring time is unknown, and the [resource measurements](../CAPSULE-COST-LEDGER.md#select-the-task-owner) remain separate.

## Receipt timing observation, 2026-09-20

`node scripts/summarize-command-receipts.ts .cache/scope-mixed-batch-20260919` reproduces the reviewed mixed scope/regional window from 630 complete standard receipts: 2026-09-19 16:15:01.411 UTC through 2026-09-20 12:40:30.456 UTC. Modification-time intervals yield **20.425 hours span**, **2.537 hours union**, and **2.605 hours summed command duration**. All 630 lack lane labels; no agent count or engineering-time attribution follows. The summary exposes seven nonstandard measurement directories as incomplete standard-receipt candidates and ignores eighteen directories without receipt evidence; exit two denotes that partial input, not a failed measured build. This mixed-window observation cannot replace capsule-specific unknown elapsed costs or establish a performance trend. [The summary reader](../../scripts/summarize-command-receipts.ts) and [its overlap/incomplete-evidence tests](../../scripts/summarize-command-receipts.test.ts) own reproduction.

## Architecture and workflow review follow-up, 2026-09-20

These implementation ranges end at `fd214cd8`, before the following closure records. Reproduce them with `node scripts/capsule-cost.ts <baseline> fd214cd8`. The broader range includes the narrower repair without subtraction; the two rows must not be added together.

The complete clean-implementation command `./scripts/pnpm.sh run test:pre-push:verify` passed at `83dcd3e3` in 504.320 seconds, recorded by `/tmp/bpmn-review-followup-complete` with output SHA-256 `cb0d849159e55ebfe132046792b2a15b7efd970bf009af643d0dc9bb6cfd1b6f`. This command's interval is both its span and busy duration; it is not the programme's elapsed time. The later `fd214cd8` instruction-only change passed all 572 infrastructure tests in `/tmp/bpmn-agent-thread-policy-infrastructure`. Earlier complete-run failures remain in the [repair receipt](../capsules/PARALLEL-MULTI-INSTANCE-SPEC.md#independent-cold-review-receipt); focused reruns alone did not establish closure.

The [representation assessment](../INTERNAL-COMMUTATION-PROPOSAL.md#representation-and-reuse-assessment-2026-09-20) retains the production account after the locality pilot and consolidates identical collection proofs. The [fixture pilot](../lean-resource-costs/ELABORATION-AND-FIXTURES-LEDGER.md#kernel-fixture-pilot-2026-09-20) retains kernel checking. The [regional investigation](../INTERNAL-COMMUTATION-PROPOSAL.md#regional-preparation-prerequisite) records its admission premises and reopen witness without retiring RC obligations. [Compensation registration prerequisites](../capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#public-registration-prerequisites) own snapshot-batching and runner gaps. The corrected [evidence-lane account](../SEMANTIC-VERIFICATION-POLICY.md#evidence-lanes) separates lowering comparison, transcription checks, and shared account risk; the PMI receipt owns the output-capacity repair and stronger slot-order claim.

Workflow changes retain complete gates, bind measurements before committing, record review targets with verdicts, require deliverable-based reassessment before substantial proof prerequisites, and add terminal failure locators and optional receipt labels. [Gate selection remains unadopted](../TESTING-SPEC.md#three-level-verification-policy) because historical receipts cannot reconstruct changed inputs. [Receipt timing](REVIEW-AND-WORKFLOW-LEDGER.md#receipt-timing-observation-2026-09-20) is reproducible without engineering-effort or agent-count inference. The owner left the regional checkpoint trial pending in the RC queue on 2026-09-20; these fixes do not claim trial success, zero ceremony commits, or measured scheduling improvement. Its prospective observations remain receipt span/union, contemporaneously recorded repeat work, commit purpose, and unchanged assurance.

## Regional pair review-cycle baseline, 2026-09-21

The completed regional/local-control outcome spans both preparation frames and the final pair theorem/publication. The [review receipts](../INTERNAL-COMMUTATION-PROPOSAL.md#independent-cold-review-receipt) identify the immutable targets and successful clean complete gates:

| Target | Contribution | Cold-review cycles | Clean full-gate runs |
|---|---|---:|---:|
| `e185caca` | Forward preparation frame | 1 | 1 |
| `ecd535a0` | Reverse preparation frame | 1 | 1 |
| `ab29d3ca` | Exact state equality and accepted pair publication | 1 | 1 |
| Completed outcome | All three contributions | 3 | 3 |

These counts exclude focused builds and pre-commit package/infrastructure gates. For the regional/arming outcome, report the same two counts at completion alongside receipt span/union and code measurements. Required early semantic reviews remain required when a new claim or risk justifies them; fewer cycles alone establish neither quality nor elapsed-time savings. [Finding 63](../PROCESS-ASSESSMENT-LEDGER.md#finding-63) owns the corrected process assessment. The regional trial remains pending.

## Regional workflow-trial disposition, 2026-09-26

Disposition: observations complete; assurance retained; productivity and elapsed savings unproven. The trial grouped each complete preparation/frame/commutation/publication outcome before committing, while retaining required independent review and complete integration. It does not authorize omission of an early semantic checkpoint when a new account or material risk requires one.

| Completed outcome | Cold review cycles | Clean full-gate attempts | Interpretation |
|---|---:|---:|---|
| [Regional/local-control baseline](REVIEW-AND-WORKFLOW-LEDGER.md#regional-pair-review-cycle-baseline-2026-09-21) | 3 | 3 | Three preparation/pair increments each opened review and integration. |
| [Regional/arming](REGIONAL-OUTCOME-LEDGER.md#regionalarming-outcome-preparation-2026-09-21) | 1 | 4 | One complete semantic outcome reduced reviews; three harness failures prevented fewer gate attempts. |
| [Finite regional batch](../INTERNAL-COMMUTATION-PROPOSAL.md#finite-regional-batch-outcome) | 1 | 1 | One finite consumer outcome retained the complete accepted contract. |
| [Ordinary End batch](../INTERNAL-COMMUTATION-PROPOSAL.md#ordinary-end-batch-outcome) | 1 | 2 | One review and one correction audit; a stale source oracle caused the first gate failure. |

The linked cost records retain receipt span/union, failed commands, code/document measurements and exclusions. Regional/arming pre-commit span/union was 14794.974/2224.000 seconds, plus separately measured cleanup corrections 1244.543/775.523 seconds. These differently scoped and potentially overlapping intervals cannot be added into an engineering-effort or critical-path claim. Commit purpose was complete semantic outcome, required correction or evidence; no compiled helper alone required a checkpoint. The earlier pending-trial statements describe historical checkpoints and are superseded by this disposition.

The practical consequence is the owner's current cadence: focused checks during implementation, complete affected boundaries at coherent outcomes, and one complete repository/release qualification for the integrated RC candidate. Repeated failures still require diagnosis and a separating guard. Existing finite-batch, validity, projectability, canonical paired publication, rollback and Temporal admission guarantees remain mandatory. This is a workflow assessment, not additional conformance evidence.

## Mixed local-control production verification

On 2026-09-09, independent production review approved correction `34e38132` as recorded in [the receipt](../INTERNAL-COMMUTATION-PROPOSAL.md#independent-cold-review-receipt). Complete verification passes at clean commit `9fddbaca`. The retained attempts distinguish a corrected test typing defect from two runtime-harness failures; no test deadline, clock margin, VM flag, dependency pin, or semantic limit changed during these diagnostics.

| Target | Command or exact diagnostic | Exit | Elapsed | Output SHA-256 |
|---|---|---:|---:|---|
| `8c3f818c` | `test:pre-push`: harness typecheck refused three new test typing errors, corrected at `caa56e48` | 1 | 9,678 ms | `787240ddf34d17ca3a19799965aa34d459c76366ac745afa1b9bb3d30e4891c6` |
| `caa56e48` | `test:pre-push`: the SMI natural path consumed 2,622 ms of its 5,000 ms host Timer, exceeding the 50% margin after successful task completions | 1 | 559,534 ms | `c8dc0244bed85a9467aabd9d2cb902c8288e34ba6118969474f8113a967e2e03` |
| `caa56e48` | isolated `sequential-multi-instance-refinement.temporal-serial-test.ts`, unchanged deadline and margin | 0 | 18,422 ms | `de088f026f18faf110e07628406d18df54b78761dbb2e2545ea9b7dc59ba4c1a` |
| `34e38132` | `test:pre-push`: the direct-VM managed-wait test process terminated with `SIGSEGV` in V8 `ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers` during mark/compact collection | 1 | 246,169 ms | `f35aa4a229b5b34aa801bbffc58ac67fcac8aeba30feb16516efb877f047b61e` |
| `34e38132` | isolated `managed-wait-host-wakeup.test.ts` under the existing `--no-parallel-scavenge` flag | 0 | 2,775 ms | `23314a35b02a416742b26c6d8d7a419f37cdf6cf6a846f9f2e96980b6bdd2388` |
| `34e38132` | `test:temporal:built:concurrent`, all 332 tests unchanged | 0 | 76,802 ms | `e7c8a66c25be12fc3704a74f4e3871fa77f1ae7a9d472dc9235b77e637ed79d7` |
| `9fddbaca` | clean complete `test:pre-push`, all 72 pipeline cases agree | 0 | 549,784 ms | `060ac75fae528e1de3924934df0a42e99c9b8a0191d4eea6cc2cca747b623429` |

The macOS native reports captured at 2026-09-09 02:42:24 and 2026-09-08 16:10:34 local time have the same signal, invalid address, and first sixteen native frames. The earlier report predates this production integration. The isolated and concurrent passes establish diagnostic recovery; only the final complete run establishes repository acceptance, and none establishes a V8 fix. The final pipeline's 57,040 ms exceeds its 36,000 ms soft feedback target while remaining below the unchanged pathology ceiling; host load rose from 0.60 to 1.99 per core, so elapsed time establishes no performance trend.

## M6 closure evidence

The retained M6 closure gate ran on 2026-08-16 and exited zero. It covered Lean, the semantic core, BPMN source, protocol/schema/canonical bytes, Workflow Query, client/API, both pinned CIB releases, differential comparison, 219 Temporal adapter tests, retained history replays, and the complete registered pipeline. The separate path-scoped Product 2 browser evidence covered the 1280/1600 structured Human Work journey. This is correctness evidence, not an uncontended performance baseline or a production-scalability claim.
