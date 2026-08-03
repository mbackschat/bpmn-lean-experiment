# Process assessment ledger

**Status:** Maintained process-finding ledger.

## Purpose and denominator

This ledger retains every observed weakness in *how* work was carried out, separately from whether its claims were sound. [The capsule reflection](../CLAUDE.md#milestone-and-capsule-reflection) already requires turning each escaped issue into a reusable review question or an executable guard, and [the closure review](TESTING-SPEC.md#capsule-closure-review) repeats that requirement. Neither kept a record, so a finding could be answered with fresh prose, forgotten, and repeated — and a repeat was indistinguishable from a first occurrence. This ledger exists to make recurrence visible and therefore actionable.

The denominator is process findings, not defects. A finding belongs here when it cost real work or produced a wrong intermediate result **and** an existing guard did not catch it. A defect that a gate rejected is not a finding: the guard already worked. Semantic claims, evidence strength, and common-mode risks stay with [the owning capsule](capsules/README.md); reproducible cost stays in [the capsule cost ledger](CAPSULE-COST-LEDGER.md); implementation status stays in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

This is not a retrospective diary. Rows are findings with dispositions, one row per distinct mechanism, and no row narrates a session.

## Self-assessment questions

Answer these after a capsule or milestone closes, and again at each session handoff. A question whose honest answer is "I do not know" is itself a finding.

1. **Bounds.** Which executable guard, oracle, registry, or size ceiling already constrained this work, and did I enumerate them before the first edit or discover one mid-change?
2. **Recall.** Which structural claim did I state without reading its source in this session? Name the claim, not the intent to be careful.
3. **Rework.** What did I write and then discard? Was the deciding fact available before I started?
4. **Measurement.** Is every number I reported reproducible by a named command, and was any timing figure taken under competing load?
5. **Evidence reading.** Did I read each gate outcome from the run's own output, or from a summary, notification, or impression of it?
6. **Prose versus guard.** Which correction from the previous increment did I rely on prose to enforce, and did that prose actually bind me?
7. **Recurrence.** Does anything above already appear below? If so, its recorded disposition failed and must be escalated.

## Escalation rule

A finding recorded a second time refutes its own prose disposition: the rule existed and did not bind. The second occurrence therefore requires an **executable guard**, not a better-worded reminder — unless no repository fact can observe the class at all, which is what `unguardable` records. That exception exists because the rule as first written assumed every recurring finding is guardable, and a finding about how results are *reported* is not: the repository cannot see a claim made in prose about itself. [The executable check](../scripts/document-reviewability.test.ts) enforces this — a row at two or more instances whose disposition is not `executable guard` fails the infrastructure gate.

Dispositions are a closed set:

| Disposition | Meaning | Evidence cell must link |
|---|---|---|
| `executable guard` | A gate now rejects the class, not only the reported instance | at least one executable guard or script |
| `review question` | Added to the questions above or to a reviewer prompt; admissible only at a single instance | the document recording it |
| `accepted risk` | Understood, not worth a guard, and explicitly tolerated; admissible only at a single instance | the document recording the acceptance |
| `unguardable` | No repository fact can detect the class, so no gate can enforce it; admissible at any instance count but must state why | the reusable question standing in for the guard |

## Findings

| Finding | First observed | Instances | Disposition | Evidence |
|---|---|---:|---|---|
| Existing executable bounds were not enumerated before planning an atomic change, so an oracle, a module ceiling, and a registry obligation each surfaced mid-implementation | [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md) proposal | 3 | `executable guard` | [change-binding enumerator](../scripts/what-binds.test.ts), [capsule binding inventory](../scripts/document-reviewability.test.ts), [module-size headroom](../scripts/source-hygiene.test.ts) |
| Which module owned a behavior was asserted from thin context without opening the module, and the claim was wrong | [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md) proposal | 1 | `review question` | [question 2](#self-assessment-questions) |
| A gate outcome was read from a task notification rather than the run's own exit line | [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md) proposal | 1 | `review question` | [question 5](#self-assessment-questions) |
| A structural requirement was asserted from a proxy measurement rather than a demonstrated need, so an extraction was recorded as required for a file the work never grows | [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md) proposal | 1 | `review question` | [question 1](#self-assessment-questions) |
| A recorded conclusion outlived the measurement that made it true, because the premise was not stored beside it | [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md) proposal | 2 | `executable guard` | [recomputed owner headroom](../scripts/document-reviewability.test.ts) |
| A verification claim was stated more broadly than the gates actually run: twice against stale built output from a narrower build target, once by calling the tree green while an unrun focused gate was red, once by committing on `lake build` while the complete gate additionally builds the `Experiments` tree | [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md) proposal | 4 | `unguardable` | [question 5](#self-assessment-questions) |
| A registered profile was landed without the live example its oracle requires, turning the complete gate red after the focused gates passed | [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md) proposal | 1 | `review question` | [question 1](#self-assessment-questions) |
| A collection-contributing match over a semantic variant used a wildcard arm, so a new family silently contributed nothing instead of failing to compile: a boundary Event was unreachable because its Activity edge was keyed on trigger kind, and a composite family's task and timer waits were missing from every public projection | [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md) proposal | 3 | `executable guard` | [exhaustive variant inventories](../scripts/lean-source-contracts.test.ts) |
| A wall-time figure was measured while a review sub-agent competed for the same cores, making it non-comparable | [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md) proposal | 1 | `review question` | [contended-measurement rule](TESTING-SPEC.md#default-verification) |

## Update rule

At each capsule closure and each session handoff, answer the questions above and either add a row or record that none applied. When a mechanism already has a row, increment its instance count instead of adding a near-duplicate — the count is the signal the escalation rule reads. Keep the finding text describing the mechanism, not the incident, so a second occurrence in different code still matches the same row.

A row is retained after its guard lands. Removing it would hide the recurrence history that justified the guard, and the guard itself is the reason the count stops growing.
