# Compensation retention experiment

## Status

**Status:** Opened 2026-08-29 by owner decision; not yet executed

**Question:** Can a completed Activity occurrence's context be retained for later compensation without inverting the engine's layering and without invalidating the disposal rule every current Activity family relies on?

**Claim boundary:** This experiment decides retention feasibility and its cost boundary. It selects no compensation semantics, handler model, triggering rule, ordering rule, Transaction behavior, profile, or CIB relationship, and it closes no part of `BPMN-MECH-COMPENSATION-01`. Its outcome is an input to that family's eventual capsule, not a substitute for it.

## Why now rather than with compensation

Compensation is the only unimplemented family whose normative obligation contradicts a rule the engine already depends on, and that rule is being written into a specification while this experiment is opened.

Clause 13.5.5's operational semantics require that when an Activity transitions into state Completed, "a snapshot of the data associated with the parent Activity is taken and kept for later usage," that a multi-instance or loop parent take "for each instance a separate data snapshot," and that default compensation run "in reverse order of the execution of the original Activities." Only completed Activities are compensable; a failed one compensates to an empty operation.

The current representation discards exactly that at exactly that moment. `RuntimeState.activityOccurrences` holds what each **open** Activity occurrence owns, [`completeActivityVariableScope`](../../BpmnSemantics/SemanticProcess/Data.lean) removes the completing occurrence's local scope, and the in-flight [Activity data-input capsule](../capsules/ACTIVITY-DATA-INPUT-MEDIATION-PROPOSAL.md) locks the three-way disposal as `([], [], [])` while describing it as the representation for a "no-output, no-compensation Activity context." Nothing retains a completed occurrence's context anywhere in either semantic account.

[The forward-compatible restriction rule](../../CLAUDE.md#forward-compatible-semantic-restrictions) requires verifying before approval that later coverage can broaden without invalidating the representation, and redesigning before implementation when it would foreclose. That verification has not been performed for compensation, and its cost rises with every family that adopts unconditional disposal. Sequential and Parallel Multi-Instance are already closed and already dispose per-instance context, which is the case Clause 13.5.5 singles out for a separate snapshot each.

## Competing accounts

1. **Retained completion register.** Runtime state gains a compensation-eligible completion record per completed Activity occurrence: its identity, its completion ordinal, and the snapshot of the data associated with it. Disposal moves from Activity completion to the close of the owning scope. Canonically ordered and never publicly projected, as `activityOccurrences` already is. Its exposure is monotone growth of runtime state and of every Temporal continuation payload with the number of executed Activities, against budgets this repository has already measured.

2. **Publication-derived reconstruction.** Completed work is recovered from committed-execution publication or flow-node occurrence records rather than retained in semantic state. This account is stated in order to be refuted rather than measured: [flow-node occurrence lifecycle facts are derived at the evaluator boundary](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) and published, so reading them back would make a projection semantically load-bearing and invert the dependency direction the [non-negotiable boundaries](../../CLAUDE.md#non-negotiable-boundaries) fix. It is retained here because it is the account a reader reaches for first, and because refuting it explicitly is cheaper than refuting it again later.

3. **Program-declared retention scope.** Only what the program declares compensable is retained, making retention a program property exactly as `activityOccurrences` presence already is, and bounding growth to models that use compensation. This is the account the experiment expects to adopt, and the separating witness below is the case that decides whether it can be stated locally at all.

## Separating witness

BPMN admits compensation an Activity does not declare. A Sub-Process carrying the `compensable` attribute has default compensation implicitly defined, which "recursively compensates all successfully completed Activities within that Sub-Process," and a throw Compensation Event that specifies no Activity in a global context compensates "all completed Activities in the Process." The error-handling default adds a third path: absent an Error Event Sub-Process for a particular error, compensation is called automatically for all contained Activities.

The witness is therefore one Process whose compensable Sub-Process contains a Multi-Instance Activity and at least one ordinary Activity that declares no handler of its own, compensated through the global form. Account 3 stated as "retain where a handler is attached" retains nothing for that ordinary Activity and nothing per instance, so it cannot produce the snapshots Clause 13.5.5 requires; the accounts separate on whether retention is decidable from an Activity's own declaration or only from its enclosing scope's.

The cost half uses the same witness. Sequential Multi-Instance already admits sixteen items, each with its own local context, and Clause 13.5.5 requires a separate snapshot per instance. That is the largest retention the closed corpus can already demand, and it is measurable against the bounds the [Sequential Multi-Instance capacity probe](../capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) established: 8,000 Events, 8 MiB of History, 2,240 activation Events, and 2 MiB of canonical activation payload, against measured maxima of 87 Events, 568,902 History-envelope bytes, and 246,799 payload bytes.

## Scope and exclusions

In scope: whether the retention set is decidable from an Activity's own declaration or only from its enclosing scope; whether retained snapshots for the largest already-admissible model fit the measured Temporal continuation budget; and whether the disposal rule the current families and the in-flight data-input capsule state is a restriction that later broadens or a general rule that forecloses.

Excluded: compensation handlers, Compensation Event Sub-Processes, Compensation Activities, throw events, `waitForCompletion`, Transactions and cancel, reverse-order execution, dependency analysis, recursive triggering, snapshot restoration, any profile or admitted source shape, any CIB relationship, and any production implementation in Lean or the semantic core.

## Executable location and focused command

No production surface changes. The normative half is answered from the pinned OMG corpus and its machine-readable CMOF/XSD, recorded here. The cost half extends the existing private testkit capacity-probe methodology and reports against the bounds above; it runs under `./scripts/pnpm.sh run test:temporal` if it lands as a probe, and is otherwise reported as a measurement in this document.

## Stop conditions

The experiment stops at one bounded increment. If the cost half cannot be answered without first building retention, that is an unresolved boundary to record, not a licence to build it. If the normative half shows the retention set is scope-decided, the finding is recorded and the eventual capsule inherits it; the experiment does not itself amend the data-input capsule.

An outcome that corrects a current representation is material and opens the ordinary review path before any such correction is implemented.

## Result

Not yet executed.
