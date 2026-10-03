# Business effect data experiment

## Status

Executed phase-zero CIB Seven `2.2.0` discriminator. The result informs the mixed human/automated composition proposal; it selects no production profile, mapping expression, handler API, or compatibility claim.

## Question and competing accounts

Can a Service Task receive reviewed Process data and return an Activity-local result without leaking its locals or confusing input scopes? Account A evaluates each input against the enclosing scope. Account B lets an earlier input's local write affect a later input. The difference matters before canonicalizing mappings or composing human work with automated effects.

The [project-authored invoice model](../../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/business-effect-data.bpmn) has Review → Validate → Finalize. Its exact XML preserves input declaration order, which is the deciding source fact; the [fixture-construction rule](../TESTING-SPEC.md#cib-bpmn-fixture-construction) therefore permits a literal fixture. The [probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBusinessEffectDataPhaseZeroProbeTest.java) uses public Task, Runtime, and Management services, with a Java delegate reporting its public local-variable view. Parser capture checks warnings only and supplies no behavioral result.

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

## Disposition and limits

Retain account A as source-grounded research input. General input ordering is still significant when expressions have side effects or targets repeat; this experiment proves neither general permutation equivalence nor an expression language. Output lookup can inherit variables through CIB scope lookup; the probe establishes local precedence only. Nested scopes, missing outputs, asynchronous recovery, technical retry policy, business errors, and effect replay require their own selected contract and discriminators.

The next proposal must make input scope, committed argument snapshots, result projection, exact effect identity, data availability at merges, and refusal behavior explicit. It must keep existing literal/local-reference profiles unchanged or record a reviewed replacement. A passing CIB probe grants no source admission, Lean law, TypeScript implementation, Temporal refinement, or public whole-model support.

This research/test increment is classified non-material under the [review gate](../TESTING-SPEC.md#independent-cold-review-gate): it changes no accepted semantic account or production capability. Validation comprises the complete CIB oracle gate, XSD validation, and the complete infrastructure gate (including source hygiene, links, documentation control, and oracle orchestration guards). Adoption requires the normal independent proposal review.
