# Capsule cost ledger

**Status:** Maintained closure-measurement ledger.

## Purpose and denominator

This ledger retains reproducible nonblank code and documentation churn for every completed semantic capsule or bounded product/enabling increment whose baseline and closure commits were recorded. It does not measure semantic value, proof strength, test independence, JSON evidence volume, generated output, or wall time. [PLAN.md](PLAN.md) owns only current sequencing; Git and the owning specifications retain implementation history.

The denominator begins when commit-bounded measurement became mandatory. Earlier work with no clean baseline remains explicitly unknown rather than reconstructed from a mixed span. Run `node scripts/capsule-cost.ts <baseline-commit> <closure-commit>` as specified by [TESTING-SPEC.md](TESTING-SPEC.md#capsule-closure-review).

## Measurements

| Increment | Boundary | Code | Documentation | Elapsed | Comparison consequence |
|---|---|---:|---:|---|---|
| [Scoped runtime data](capsules/SCOPED-DATA-SPEC.md) | `08d8b84..3b2e44d` | `+540/-73` | `+134/-11` | Unknown | First atomic runtime-representation replacement; later scope work should not be compared as if it were a small local semantic clause. |
| [Profile-parameterized admission](PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) | `e553b4b..dbfd702` | `+1760/-492` | `+160/-52` | Unknown | Larger than scoped data because it replaced source, Lean, core, host admission, and differential evidence, while removing recurring topology predicates. |
| [Intermediate Catch Message](capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md) | `28d9a35..e273374` | `+3181/-82` | `+227/-119` | Unknown | Adds source references, a transition family, a public observation field, and durable Signal/result ingress together; not comparable to a same-contract mechanism reuse. |
| [User Task completion data](capsules/USER-TASK-COMPLETION-DATA-SPEC.md) | `8a5f3ac..5255888` | `+651/-94` | `+84/-63` | Unknown | Reuses the existing User Task occurrence and Update lifecycle while adding the bounded simulated-form patch contract. |
| [Process-start data](capsules/PROCESS-START-DATA-SPEC.md) | `416df39..07e7f17` | `+289/-77` | `+104/-36` | Unknown | Smallest measured data increment; reuses Process scope and the existing start boundary. |
| [Runnable Temporal MVP](RUNNABLE-TEMPORAL-MVP-SPEC.md) | `9b58437..32df044` | `+950/-132` | `+58/-22` | Unknown | Adds the first strict external-runtime config, command, event/result, exit, and orchestration boundary. |
| [Ordinary embedded Sub-Process completion](capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) | `5b34977..a59f8a3` | `+5266/-1698` | `+283/-158` | Unknown | Adds the first definition/runtime occurrence ownership model and atomically replaces all consumers; future nested-scope capsules should reuse this foundation and be materially smaller unless they add another cross-layer contract. |
| [Embedded Sub-Process Error propagation](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md) | `be7845d..1449771` | `+3370/-398` | `+218/-133` | Unknown | Materially smaller than the ordinary completion foundation while adding a new checked-node and transition family across every evidence lane; regional cancellation and direct-parent handler resolution reuse the existing scope-occurrence model as intended. The closure boundary includes the review corrections that extend the Temporal bypass through its stale-command discriminator and align every evidence claim with its actual witness strength. |
| [Message-addressed Receive Task](capsules/RECEIVE-TASK-MESSAGE-SPEC.md) | `2f39cc2..65d4076` | `+3805/-788` | `+504/-191` | Unknown | Code additions increased beyond User Task completion data, Intermediate Catch Message, and the preceding Sub-Process Error propagation capsule; documentation additions are the largest recorded in this ledger, while code additions are second only to ordinary embedded Sub-Process completion. The range includes the atomic closed-channel replacement, checked-source corrections, retained-CIB lane, and closure evidence across every target. The closure removes one repeated process weight by sharing Message Temporal support, server, and Workflow bundle; later direct-Message consumers must reuse that boundary rather than repeat this cost. |
| [Inclusive Gateway selected-branch synchronization](capsules/INCLUSIVE-GATEWAY-PROPOSAL.md) | `263433e..24d726b` | `+3123/-151` | `+115/-45` | Unknown | Smaller than the nearest recorded Embedded Sub-Process Error propagation increment in both code additions (`3123` versus `3370`) and documentation additions (`115` versus `218`). The measured range still crosses source admission, two reusable operation kinds, hidden owner-scoped runtime state, Lean relations and laws, independent TypeScript semantics, four registered standards-only differential cases, Temporal Worker-replacement/replay evidence, and closure reflection; the absence of a CIB lane and reuse of User Task hosting keep it below that comparator without implying a general Inclusive Gateway implementation. |
| [Lean comment discipline](archived/LEAN-COMMENT-DISCIPLINE-PROPOSAL.md) | `cc1ae8f..35ae276` | `+1607/-1117` | `+26/-12` | Unknown | About one quarter of the code additions in the nearest source-ownership hygiene increment (`9f1f046..7674a02`, `+6210/-5144` code and `+18/-6` documentation). Most churn is ownership-preserving Lean extraction plus the focused scanner and tests; the selected comment backfill remains small and no density target is inferred from either measurement. |

## Unknown historical measurements

The [Exclusive Gateway conditional-routing capsule](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md) has no clean pre-capsule baseline and its multi-commit span contains unrelated toolchain work. Its code, documentation, and elapsed cost remain unknown. Other work completed before this policy is outside the measured denominator unless an already-recorded exact boundary exists in its owner.

## Update rule

At closure, record the baseline before implementation, create the closure commit only after the complete applicable gate passes, verify the measurement from those two commits, add or update one row here, and compare it with the nearest increment that changed the same layers. Do not keep the same measurement as a second live fact in [PLAN.md](PLAN.md).
