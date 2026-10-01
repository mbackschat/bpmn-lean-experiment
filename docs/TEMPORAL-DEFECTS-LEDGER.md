# Temporal defects ledger

## Status

Active project ledger, reviewed 2026-10-01. It tracks the runtime failures encountered during MUE qualification, including confirmed SDK defects and failures whose cause or ownership remains unresolved. “Temporal” names the affected hosting stack; an entry does not by itself assign fault to Temporal.

This document owns defect IDs, project disposition, impact, next actions and closure requirements. Linked research owns the detailed diagnosis, version and source provenance, reproducer commands, crash reports and historical measurements. [PLAN.md](PLAN.md#ordered-work) owns execution order and final MUE acceptance; this ledger does not change the frozen capability scope or open new Lean work.

## Inventory

| ID and failure | Project disposition | Attribution |
|---|---|---|
| [TD-001: Queries lost during Run eviction](#td-001-query-loss-during-run-eviction) | Private correction and focused product witnesses pass; adoption and full qualification open | Confirmed Temporal SDK Core defect, reproduced without BPMN |
| [TD-002: Transaction publication descriptor rejected](#td-002-transaction-publication-descriptor-rejected) | Investigating | Unassigned; adapter publication and transport boundaries still need separation |
| [TD-003: Native V8 garbage-collection crash](#td-003-native-v8-garbage-collection-crash) | Upstream correction validated in equivalent private builds; adoption and qualification on the adopted runtime open | V8 baseline prologue defect demonstrated in a live crash capture |
| [TD-004: Direct-VM initialization timeout](#td-004-direct-vm-initialization-timeout) | Investigating | Project harness supplies the deadline; reason for exceeding it unproven |
| [TD-005: Async-hooks callback abort](#td-005-async-hooks-callback-abort) | Diagnostic reproduction available; production relevance unresolved | Node VM/async-hooks boundary; distinct from TD-003 |

Retain each ID when its disposition changes or it closes. Record a correction's exact revision and qualification evidence before marking it closed. A passing rerun or accepted release exception does not establish a causal repair. A validated private correction remains open until required product qualification and adoption are complete. These entries are investigation boundaries, not a count of proven independent upstream bugs.

## TD-001: Query loss during Run eviction

- **Impact:** Concurrent reads of a completed Run can lose queued requests and reach their RPC deadlines, making an otherwise retained publication unavailable to callers.
- **Established cause:** Core takes the evicted Run's task buffer, reinstates its first task and drops the remainder. A tiny constant-Query Workflow reproduces the loss under supported usage, independently of the BPMN adapter's size or semantics.
- **Correction:** The [private patch](experiments/temporal-query-eviction-core/core.patch), Core commit `7cb28c68`, preserves remaining requests, their supersession groups and the activation produced when a later task can run before an earlier history fetch completes. It is retained locally; installed SDK and production distribution dependencies are unchanged.
- **Evidence:** [Query-loss investigation](research/TEMPORAL-EXECUTION-RESEARCH.md#closed-run-query-eviction-investigation) and [private correction validation](research/TEMPORAL-EXECUTION-RESEARCH.md#private-core-correction-and-usage-check) own the baseline comparison, live one/two/three-Query results, complete Core unit suite, adversarial controls and exact build provenance. Seven [focused product checks](research/TEMPORAL-EXECUTION-RESEARCH.md#product-qualification-and-digest-discrimination) now pass on macOS arm64, covering Transaction cancellation, replacement, publication traversal, recovery capacity and replay.
- **Next action:** Complete broader product and intended Linux/distribution qualification of the exact candidate, then obtain the dependency-adoption decision before shipping it.
- **Closure:** The adopted dependency contains the demonstrated correction and applicable product/distribution gates pass against that exact artifact. The owner declined upstream publication; no issue or patch has been published for this finding. Historical upstream issue 716 and patch 740 concern another buffer and do not close this entry.

## TD-002: Transaction publication descriptor rejected

- **Impact:** A compensated Transaction's selected publication segment has rejected its descriptor digest, preventing the client from accepting that read as a valid publication.
- **Established boundary:** The rejection is observed; the reason the descriptor and selected segment disagree remains unknown. There is no demonstrated persisted-data corruption, and TD-001's timeout mechanism does not explain a digest mismatch.
- **Evidence:** The [digest discrimination](research/TEMPORAL-EXECUTION-RESEARCH.md#product-qualification-and-digest-discrimination) retains the original rejected selection and subsequent matching comparisons. Forced cache misses with the private Core candidate produced nine matching retained descriptors and timestamps. The original failing history is still absent; these passing comparisons establish no repair.
- **Next action:** Capture the exact failing selection descriptor, selected Run, digest inputs and returned segment in one bounded witness. Separate mutation or canonicalization in the adapter from transport behavior, then predict and reproduce a second instance of the proposed mechanism.
- **Closure:** Correct the demonstrated cause and retain a guard that rejects the faulty behavior while accepting the valid Transaction publication under the unchanged identity and digest checks. Successful reruns without that explanation leave this entry open.

## TD-003: Native V8 garbage-collection crash

- **Impact:** Temporal test children terminate in native code, failing qualification without a TypeScript assertion or semantic result.
- **Established cause:** The installed Node binary saves unused register `x4` into a GC-scanned baseline-prologue frame on a configuration without dispatch-handle linkage. A live debugger capture locates invalid value `0x0f` in that exact saved slot, where root scanning dereferences `0x0e`. This demonstrates the V8 mechanism for the captured crash; it does not assign every historical native failure to it.
- **Correction:** V8 commit `0b94a9fd` saves the zero register instead of `x4` when JavaScript linkage carries no dispatch handle. The unmodified upstream patch applies to Node `24.18.0`. A private build of it differs from the equivalent private baseline only in the prologue's saved register pair. Installed SDK, Node pin and production distribution are unchanged.
- **Evidence:** [Observed crashes](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#environment-and-observed-failures), [ordinary-setting recurrences](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#2026-09-30-documentation-checkpoint-recurrence) and [source, binary and live stack evidence](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#2026-10-01-source-binary-and-live-stack-evidence) establish the mechanism. The [corrected-build validation](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#2026-10-01-corrected-build-validation) retains the separating regression. With an invalid `x4` injected at the prologue's slow path, the release and private baselines fault at `0xe`, and the candidate passes. The same holds for the captured Temporal workload under ordinary flags. The candidate also passes all 818 `test:temporal` checks. An unforced stress comparison reproduced the fault on neither binary and is not repair evidence.
- **Next action:** Obtain the runtime-adoption decision. Select a Node release or build containing the correction, check its prologue and the separating witness on every adopted platform, including Linux CI and distribution images, then run the applicable product and distribution gates on that exact artifact.
- **Closure:** Demonstrate the causal correction and qualify the adopted runtime under intended settings. Compiler/GC suppression flags are not an accepted repair. The existing RC publication exception does not close final MUE acceptance or authorize a new workaround.

## TD-004: Direct-VM initialization timeout

- **Impact:** The repeatable-subscription direct-VM test fails during initialization, so its semantic assertions cannot establish a passing result.
- **Established boundary:** The SDK VM exceeded the one-second limit supplied by the [project harness](../packages/temporal-adapter/testkit/test/direct-vm-activation-harness.ts). The observed host load does not prove contention caused it; neither a Temporal defect nor an inadequate project timeout has been established.
- **Evidence:** The separate timeout observation in the [2026-09-30 investigation](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#2026-09-30-documentation-checkpoint-recurrence) records the failing test and its qualification context.
- **Separate cleanup risk:** The direct-VM harness awaits `createWorkflow` before entering its cleanup block. A creation failure can therefore bypass `creator.destroy()` and leave the SDK's bundle source-map registration retained. This source-level cleanup gap is not established as the observed initialization timeout's cause; isolate its correction from timeout diagnosis.
- **Next action:** Isolate initialization with the same bundle, runtime and deadline, and find the smallest failing pair or contention condition. Measure where execution spends its time before choosing a correction.
- **Closure:** A causal repair passes the original workload and a separating guard under the intended configuration. Raising the deadline or reducing concurrency solely to obtain a pass does not close this entry. Keep it distinct from TD-003.

## TD-005: Async-hooks callback abort

- **Impact:** A native callback-scope assertion can abort the Node process. Its relevance to a production Temporal Worker remains unproven.
- **Established boundary:** A diagnostic combining timed `vm.runInContext`, Promise/`AsyncLocalStorage` work and async hooks reproduces an `execution_async_id` assertion. This differs from the GC fault in TD-003; a direct-VM timeout is a lead for investigation, not evidence that the production Worker follows the same path.
- **Evidence:** [Observed callback abort and diagnostic](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#environment-and-observed-failures) and [mechanism assessment](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#mechanism-assessment).
- **New observation:** On 2026-10-01 an oversized-ingress test child aborted with this assertion, reached from `Environment::CheckImmediate`, just after its direct-VM execution timeout. The run used the private baseline under diagnostic stress compaction (report `node-2026-10-01-141649.ips`). This is the first instance in a project test child. It ties the abort to the timed direct-VM harness path, not to a production Worker, and does not demonstrate its mechanism.
- **Next action:** Connect the minimal diagnostic to the exact harness/SDK callback path, or demonstrate why it is confined to the diagnostic. Investigate its relationship to timeout handling without merging it with TD-004 by assumption.
- **Closure:** Retain a demonstrated correction for the affected project path, or an evidence-backed disposition that precisely excludes it from that path. An untested assertion that all native crashes share one cause is insufficient.

## Unattributed qualification observations

The hosted empty-Transaction final-publication failure and evaluation-browser unavailable reads do not retain enough underlying error evidence to assign them to a particular entry. Preserve their failed status and correlate future observations before attributing them to TD-001 or TD-002; the [Query investigation](research/TEMPORAL-EXECUTION-RESEARCH.md#closed-run-query-eviction-investigation) and [current evaluation evidence](PLAN.md#current-evidence) retain their context. No entry here establishes a general Temporal capacity limit or that the BPMN adapter is its largest client.

Rancher smoke, distribution refresh and human evaluation remain acceptance tasks in [PLAN.md](PLAN.md), rather than runtime defects. New evidence updates the relevant entry and its research owner; only the plan changes immediate work order.
