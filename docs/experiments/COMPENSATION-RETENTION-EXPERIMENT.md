# Compensation retention experiment

## Status

**Status:** Executed 2026-08-29; both halves answered; no representation correction required, and two bounds are recorded for the compensation capsule

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

BPMN admits compensation an Activity does not declare. Clauses 10.7.2 and 13.5.5 make a throw Compensation Event that specifies no Activity compensate "all completed Activities in the Process," and the metamodel admits exactly that form because `CompensateEventDefinition-activityRef` carries `lower="0"`.

The witness is therefore one Process compensated through the global form, containing at least one ordinary Activity that declares nothing about compensation. Account 3 stated as "retain where a handler is attached" retains nothing for that Activity, so it cannot produce the snapshot Clause 13.5.5 requires; the accounts separate on whether retention is decidable from an Activity's own declaration or only from its enclosing scope's.

Two further paths would widen the same conclusion and are checked rather than assumed, because a witness resting on an inadmissible attribute is not a witness. The prose `compensable` Sub-Process attribute and the Clause 13.5.5 unhandled-error default are examined in the result below.

The cost half measures the largest retention the closed corpus can already demand, which is the registered Sequential Multi-Instance program at its admitted sixteen-item maximum, against the budget a retained record actually charges.

## Scope and exclusions

In scope: whether the retention set is decidable from an Activity's own declaration or only from its enclosing scope; whether retained snapshots for the largest already-admissible model fit the measured Temporal continuation budget; and whether the disposal rule the current families and the in-flight data-input capsule state is a restriction that later broadens or a general rule that forecloses.

Excluded: compensation handlers, Compensation Event Sub-Processes, Compensation Activities, throw events, `waitForCompletion`, Transactions and cancel, reverse-order execution, dependency analysis, recursive triggering, snapshot restoration, any profile or admitted source shape, any CIB relationship, and any production implementation in Lean or the semantic core.

## Executable location and focused command

No production surface changes, and no retained probe. The normative half is answered from the pinned OMG corpus and its machine-readable CMOF and XSD, cited in the result. The cost half was measured by driving the registered Sequential Multi-Instance program through the semantic core at its admitted sixteen-item maximum and sizing each committed state, using `JSON.stringify`, whose output differs from the adapter's sorted-key canonical encoder only in key order and therefore not in byte count. The figures are recorded below rather than kept as a gate, because nothing in the production surface changed and a retained probe would assert a bound no admitted profile yet has.

## Stop conditions

The experiment stops at one bounded increment. If the cost half cannot be answered without first building retention, that is an unresolved boundary to record, not a licence to build it. If the normative half shows the retention set is scope-decided, the finding is recorded and the eventual capsule inherits it; the experiment does not itself amend the data-input capsule.

An outcome that corrects a current representation is material and opens the ordinary review path before any such correction is implemented.

## Result

### Retention is scope-decided, not declaration-decided

Account 3 stated as "retain where a compensation handler is attached" is unsound. `CompensateEventDefinition-activityRef` carries `lower="0"` in the CMOF, so a throw event that names no Activity is metamodel-admissible, and Clauses 10.7.2 and 13.5.5 make that global form compensate every completed Activity in the Process. An Activity that declares nothing about compensation is still compensable, so the retention set is a property of the enclosing scope.

Two of the three paths that would have widened it further turn out not to. The `compensable` Sub-Process attribute exists only in prose at Clauses 10.7.1 and 13.5.5 and appears **nowhere** in `BPMN20.cmof` or `BPMN20.xsd`; `SubProcess` owns only `triggeredByEvent` and `artifacts` beyond `Activity`. No conforming document can set it, so that default-compensation path is a BPMN prose-to-metamodel inconsistency for the requirement ledger's compensation row to classify when that family is taken up, not a retention obligation. The Clause 13.5.5 "presumed abort" default, where an unhandled error compensates all contained Activities, is real but presently inert: no admitted profile can declare a compensation handler, so it compensates nothing observable. That qualifier is what keeps the closed Error capsules sound, and it expires the moment a profile admits a handler.

Account 2 is refuted as stated, on layering rather than on cost.

### The budget retention charges is 64 KiB, not 2 MiB

Retention lives in committed runtime state, so it charges `CommittedRuntimeStateBytes`, a hard per-commit bound of 64 KiB checked before mutation, and not the 2 MiB retained trace and publication budget. Continue-As-New carries the whole `RuntimeState` forward, so rollover bounds Event History but cannot shed retention.

Measured on the registered Sequential Multi-Instance program at its admitted sixteen-item maximum: peak committed state 2,626 bytes of the 65,536-byte bound, leaving 62,910 bytes; the state falls to 1,308 bytes at completion, and that fall is exactly what a retention account removes. One completion record carrying occurrence identity, owner, completion ordinal, and a single scalar snapshot binding encodes to 356 bytes. The ceiling is therefore about 176 retained records, against a normative requirement to retain every completed Activity in a compensable Process.

### No representation correction is required now

The current disposal facts are family- and profile-local rather than general laws, so a compensation-admitting profile can state a conditional rule without invalidating `completeActivityVariableScope`'s contract or the retained conformance results that lock disposal. Retention is also expressible additively rather than by redesign: `sequentialMultiInstanceControllers` already retains a whole input collection in runtime state for its controller's lifetime, which is the same shape of obligation, and optional program-specific state fields are an established pattern.

The disposal rule the in-flight [Activity data-input capsule](../capsules/ACTIVITY-DATA-INPUT-MEDIATION-PROPOSAL.md) states may therefore close as written, because it is scoped to a no-compensation Activity context rather than asserted as the meaning of Activity completion.

### Recorded for the compensation capsule

Retention disposal attaches to scope close rather than Activity completion, because compensation remains possible for as long as the enclosing scope is open.

The profile must admit an explicit retained-record bound, the way Multi-Instance admits its sixteen-item bound, and must state it against the 64 KiB committed-state budget rather than assume rollover absorbs it. A compensable Process whose completed-Activity count exceeds that bound is a refusal the profile owes, not a capacity surprise at run time.

## What remains undecided

The 356-byte record measures one scalar snapshot binding. Clause 13.5.5 gives a Compensation Event Sub-Process access to its parent's data at completion, so a realistic snapshot is the parent scope's bindings rather than one value, and the per-record figure grows with that scope's data. Sizing it needs an admitted compensation profile to exist, which is the compensation capsule's work rather than this experiment's.

Whether a Multi-Instance Sub-Process, which Clause 13.5.5 requires to snapshot per instance, multiplies that figure by its instance count is unanswerable here for the same reason: no Multi-Instance Sub-Process is admitted today.
