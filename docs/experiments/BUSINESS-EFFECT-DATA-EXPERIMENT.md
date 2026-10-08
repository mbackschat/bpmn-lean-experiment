# Business effect data experiment

## Status

Executed phase-zero CIB Seven `2.2.0` input-scope and business-failure discriminators. The [serial business-task capsule](../capsules/SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md) owns adoption of the input/result account; the business-failure follow-up below remains research, selecting no production profile or compatibility claim.

## Question and competing accounts

Can a Service Task receive reviewed Process data and return an Activity-local result without leaking its locals or confusing input scopes? Account A evaluates each input against the enclosing scope. Account B lets an earlier input's local write affect a later input. The difference matters before canonicalizing mappings or composing human work with automated effects.

The [project-authored invoice model](../../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/business-effect-data.bpmn) has Review → Validate → Finalize. Its exact XML preserves input declaration order, which is the deciding source fact; the [fixture-construction rule](../REVIEW-POLICY.md#cib-bpmn-fixture-construction) therefore permits a literal fixture. The [probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBusinessEffectDataPhaseZeroProbeTest.java) uses public Task, Runtime, and Management services, with a Java delegate reporting its public local-variable view. Parser capture checks warnings only and supplies no behavioral result.

| Separating input | Observation |
|---|---|
| Root `request = reviewed-invoice`, `payload = process-payload`; map local `payload = ${request}`, then `echo = ${payload}` | Handler receives `payload = reviewed-invoice`, `echo = process-payload` |
| Reverse those two input declarations | Same handler arguments |
| Root request present with `null` | Local payload and mapped decision remain present with `null`; echo still reads root payload |
| Root request absent | Job fails before delegate invocation; no decision or successor task, unchanged root payload, job retained with two retries |
| Parent `result = parent-result`, handler local result set from local payload | Output decision uses the local result; parent result and payload survive unchanged, local echo does not leak |
| Two separately started Processes, second job executed before first | Each receives and returns its own reviewed value; both reach Finalize independently |

These calls are sequential against isolated H2 engines. They establish instance separation, not database concurrency or scheduler fairness.

## Source basis

The pristine CIB checkout and release association are pinned by [SOURCES.md](../SOURCES.md). Under `engine/src/main/java/org/cibseven/bpm/engine/impl/core/variable/mapping/`, `IoParameter.execute(scope)` supplies the parent scope; `InputParameter.execute(innerScope, outerScope)` evaluates its provider against the outer scope and writes a local variable in the inner scope; `OutputParameter.execute(innerScope, outerScope)` evaluates against the inner scope and writes to the outer scope. This explains the discriminator without importing CIB implementation types into the semantic core.

BPMN 2.0.2 §§13.3.2–13.3.3 describe output mediation before Activity completion and the Service Task invocation/completion lifecycle. They do not define the CIB `inputOutput` extension. Consult the [Markdown-first normative route](../reference/bpmn-2.0.2/README.md); no PDF fallback was needed.

## Execution and result

The focused Maven invocation uses the existing wrapper, settings, Java 21, default CIB `2.2.0`, `target/verify-2.2.0`, and `-Dtest=CibSevenBusinessEffectDataPhaseZeroProbeTest test`. The maintained complete command is `./scripts/test-cibseven-oracle.sh`, which validates the new BPMN fixture against the pinned XSD before running the oracle suites. Commands use the [receipt policy](../TESTING-SPEC.md#three-level-verification-policy); exit status is asserted separately.

On 2026-10-03, receipt `/tmp/business-effect-data-shadowing-hypothesis` records three failing tests and one passing test under account B's predictions. Both declaration-order and null/instance variants contradicted that account. Source inspection identified outer-scope evaluation. Receipt `/tmp/business-effect-data-outer-scope-green` records all four tests passing under account A. A preceding compilation failure (`/tmp/business-effect-data-phase-zero`) used a nonexistent public API and is only a harness error, not semantic red evidence. The final probe additionally retains a conflicting parent result to distinguish output-local precedence. Complete receipt `/tmp/business-effect-data-complete-oracle` passes: CIB `2.2.0` runs 99 tests with 16 existing release-specific skips; CIB `2.0.0` runs its 18 selected legacy tests without skips. Neither lane has failures or errors; the new four-test probe runs only on `2.2.0`.

## Business-failure follow-up

The [business-failure probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBusinessFailurePhaseZeroProbeTest.java) uses the pinned public BPMN Model API to construct Review → Validate → Finalize, with an exact-code Error boundary leading to Recover → Review. Warning-free deployment and model validation precede every run. It asks whether caught Errors suppress or execute output mappings, whether missing local results fail or inherit a parent value, and whether technical failure follows the modeled Error route. Public services observe all results; the isolated H2 calls remain sequential.

| Separating input | CIB Seven `2.2.0` observation |
|---|---|
| Matching `InvoiceRejected`, local result set, conflicting parent result | Recover only; local result maps to Process decision, parent result survives, input local is cleared, no remaining job or incident |
| Matching Error with present local null | Decision is present null, not the conflicting parent result |
| Recover, reenter Review, then validate corrected data successfully | Fresh User Task and automation occurrence IDs; stale task completion refuses; new input/result reaches Finalize and normal completion |
| Technical `IllegalStateException` after local result write | No boundary or normal task; Process variables unchanged, job retained with two retries; explicit subsequent successful execution reaches Finalize |
| Matching Error without a local result, parent result present | Output lookup inherits the parent result |
| Matching Error without a result in either scope | Output evaluation fails, recovery is absent and the job remains; committed Process variables are unchanged |
| Different declared Error code with local-reference or literal output mapping | Both fail in `OutputParameter.execute` during root cleanup; no route commits and the job remains |
| Same unmatched Error with only the output mapping removed | Process ends with neither recovery nor normal End activity; no task or job remains |

The unmatched failure mechanism is separate from Error matching: `BpmnExceptionHandler.propagateError` calls `execution.end(true)` under the default configuration, `PvmAtomicOperationProcessEnd` destroys the ending execution, and `ExecutionEntity.destroy(false)` executes the still-associated output mapping. `IoParameter.execute` supplies `scope.getParentVariableScope()`; `OutputParameter.execute` writes through that parent, which is null at the root. The literal-output counterexample reproduces the same failure without variable lookup, while removing only the output mapping permits termination. These paths are under the pristine pin's `engine/src/main/java/org/cibseven/bpm/engine/impl/`; this is an observed CIB host defect, not selected BPMN meaning or a project workaround.

On 2026-10-04, `/tmp/business-failure-phase-zero` passed the first six tests. `/tmp/business-failure-codes` then disproved the clean unmatched-termination prediction for the mapped model with one `NullPointerException`; it is retained as failed evidence. After source diagnosis and the two separating mapping controls, `/tmp/business-failure-unmatched-isolation` passed all eight tests, with each receipt separately asserted. The focused Maven command matches the earlier probe command with `-Dtest=CibSevenBusinessFailurePhaseZeroProbeTest`; the complete oracle gate discovers it in the `2.2.0` group automatically. Complete receipt `/tmp/business-failure-complete-oracle` passes 107 tests with 16 existing release-specific skips on `2.2.0` and 18 tests without skips on `2.0.0`, with no failures or errors. `/tmp/business-failure-infrastructure-qualified` passes all 630 infrastructure checks with local loopback permission; both receipts are separately asserted.

## Disposition and limits

Retain account A as source-grounded input to the adopted serial and mixed-task capsules. General input ordering is still significant when expressions have side effects or targets repeat; this experiment proves neither general permutation equivalence nor an expression language. The failure follow-up establishes local precedence, parent fallback and missing-output failure separately. Nested scopes, asynchronous recovery, technical retry policy, general Error propagation and effect replay remain outside its evidence.

The business-failure proposal must preserve committed argument snapshots, exact effect identity and mapping authority, specify complete local-result requirements on both result branches, and account for the boundary edge in data availability and bounded closure. It must classify caught-path mapping for `2.2.0`, keep technical failure and unhandled-Error host behavior separate, and preserve existing profiles. A passing CIB probe grants no source admission, Lean law, TypeScript implementation, Temporal refinement, or public whole-model support.

This research/test increment is classified non-material under the [review gate](../REVIEW-POLICY.md#independent-cold-review-gate): it changes no accepted semantic account or production capability. Validation comprises the complete CIB oracle gate, XSD validation, and the complete infrastructure gate (including source hygiene, links, documentation control, and oracle orchestration guards). Adoption requires the normal independent proposal review.
