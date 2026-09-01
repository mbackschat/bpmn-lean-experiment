# Compensation retention experiment

## Status

**Status:** Executed 2026-08-29; layering and capacity answered. The first handler-free eligibility inference was corrected after the context-cold review of proposal target `033a7552` resolved Tables 10.88 and 10.89 against the global-throw prose.

**Question:** Can a completed Activity occurrence's compensation context be retained without inverting the engine's layering, and which existing committed-state budget does that retention charge?

**Claim boundary:** This experiment decides hidden-state feasibility, records the normative separation between handler eligibility and scope lifetime, and identifies the applicable budget. It owns no executable retention contract, handler, trigger, ordering, snapshot representation, Transaction, profile, or CIB relationship and closes no part of `BPMN-MECH-COMPENSATION-01`.

## Why now rather than with compensation

Compensation requires completed semantic facts after current Activity families dispose their open occurrence state. Publication-derived reconstruction would make a projection semantically load-bearing, while hidden runtime retention can preserve dependency direction. Sequential and Parallel Multi-Instance make the timing risk concrete because inner and outer state are removed on completion or interruption.

Clause 13.5.5 also distinguishes associated boundary Compensation Activities from Compensation Event Sub-Processes. The former becomes enabled on successful outer Activity completion and triggers once for an outer Multi-Instance Activity. The latter restores its Process/Sub-Process parent's completion-time data and can need one snapshot per loop or Multi-Instance parent instance. Treating those as one generic Task snapshot would be both overbroad and insufficient. Clause 10.7.2 separately assigns per-instance boundary-handler invocation to a Multi-Instance Sub-Process, so the corrected proposal admits current Multi-Instance User Tasks and excludes Multi-Instance Sub-Processes instead of choosing silently across those texts.

## Competing accounts

1. **Handler-eligible completion register.** Runtime state retains the identity and chronology of a successfully completed Activity whose Program declares an explicit compensation handler. Scope owns visibility and lifetime; handler definition owns eligibility.

2. **Publication-derived reconstruction.** Committed execution or flow-node publication is read back to recover completed work. This is refuted on layering: publication is derived after semantic evaluation and cannot become semantic input.

3. **Scope-wide handler-free register.** Every completed Activity in a scope is retained because a global throw omits `activityRef`. This was the experiment's original expected account and is refuted by Tables 10.88 and 10.89, which require the Activity to have a boundary Compensation Event or contain a Compensation Event Sub-Process.

4. **Compensation Event Sub-Process snapshot register.** Complete parent Process/Sub-Process context is retained, provisionally per parent instance when necessary, and restored only for that handler family. This is feasible as hidden state but cannot be sized or specified from the current Task-I/O fixtures.

## Separating witnesses

The membership witness has two successfully completed Activities in one visible scope. Only one has a boundary Compensation Event associated to a Compensation Activity. A global throw without `activityRef` can select the handler-bearing Activity and cannot make the other eligible. Optional target syntax controls selection among eligible Activities, not eligibility itself.

The Multi-Instance User Task witness separates all-success from actual early cancellation. Zero items complete normally and the standard supplies no positive-cardinality exception, so compensation needs a fresh outer identity even though current execution creates no inner instance. One planned parallel item under `completionPolicy="first"` fills every slot and is all-success; more than one planned item causes the same policy to cancel siblings and is not. An interrupting boundary Timer is likewise not all-success.

The snapshot witness is a Multi-Instance Sub-Process containing a Compensation Event Sub-Process. Each parent instance can carry different scope data. A generic record of current User Task DataInput/DataOutput bindings cannot restore that parent scope and therefore cannot stand in for its snapshot.

## Scope and exclusions

In scope: hidden-state versus publication ownership; handler eligibility versus scope visibility/lifetime; outer identity and associated-handler multiplicity for zero-, one-, and many-item Multi-Instance User Task witnesses; and the committed-state budget retention charges.

Excluded: an executable handler, throw Event, source profile, exact parent-scope snapshot representation, Multi-Instance Sub-Process handler multiplicity, dependency ordering, cancellation consequences, Transactions, CIB behavior, and production implementation.

## Executable location and focused command

No production surface changed and no retained probe exists. The normative correction comes from the pinned BPMN corpus and machine-readable artifacts. The capacity measurement drove the registered Sequential Multi-Instance program through the semantic core at sixteen items and sized each committed state with `JSON.stringify`; key order changes no byte count for the measured fixed structure.

## Stop conditions

The experiment stops at representation and budget feasibility. An exact handler-eligibility, outer-completion, or parent-scope snapshot account belongs in a reviewed capsule. The experiment must not silently choose among the open implicit-compensation or cancellation interpretations.

## Result

### Hidden semantic state is required

Publication-derived reconstruction is unsound because it inverts the semantic-core-to-publication dependency. A Program-specific optional runtime collection is additive and follows the established optional-state pattern without changing current no-compensation Programs or states.

### Eligibility is handler-decided; lifetime is scope-decided

Tables 10.88 and 10.89 require a boundary Compensation Event or contained Compensation Event Sub-Process. A global throw broadcasts only across visible successfully completed eligible Activities. Scope therefore decides visibility and how long an enabled handler remains available, while explicit handler definition decides which completions enter the register.

The original inference from optional `activityRef` to handler-free eligibility was wrong and shared the unresolved contradiction tracked by [BPMN21-403](https://issues.omg.org/issues/BPMN21-403). The prose-only `SubProcess.compensable` path remains unusable because no such CMOF or XSD property exists, as tracked by [BPMN21-167](https://issues.omg.org/issues/BPMN21-167).

### Boundary-handler and Event Sub-Process retention are different

An associated boundary handler needs one completed outer Activity identity and chronology; an admitted Multi-Instance User Task becomes eligible only after all instances succeed, and its handler later triggers once. Equality includes a zero-item normal completion, which still needs an outer identity, and a one-item `completionPolicy="first"` completion; a larger sibling-canceling first-completion path is not all-success. No generic Task-data snapshot is assigned to that handler by the selected clauses. Multi-Instance Sub-Process handler multiplicity remains open with its distinct Clause 10.7.2 wording.

A Compensation Event Sub-Process instead needs complete data from its Process/Sub-Process parent at completion. A loop or Multi-Instance parent can require one dedicated snapshot per instance. That mechanism needs provisional per-instance state and exact purge on failed, early, or interrupted completion; it is a separate immediately following risk band.

### Retention charges the 64 KiB committed-state budget

Retention lives in committed RuntimeState, so it charges `CommittedRuntimeStateBytes`, a hard 65,536-byte per-candidate bound, not the 2 MiB trace/publication budget. Continue-As-New carries the complete state and cannot shed retention.

The registered sixteen-item Sequential Multi-Instance witness peaked at 2,626 bytes and ended at 1,308 bytes, leaving 62,910 bytes at peak. The earlier 356-byte sample included one speculative scalar snapshot binding; it remains a cost observation, not the selected associated-handler record shape or a bound for complete parent-scope snapshots.

### No current representation correction is required

Current disposal laws are profile-local and current profiles declare no compensation handler. A future Program can add optional retention without invalidating existing Program or state bytes. The revised boundary-handler proposal must nevertheless mint a zero-item outer identity, distinguish one-item all-success from larger sibling-canceling early completion, and refuse capacity before any completion mutation.

## Recorded for the compensation capsules

The [boundary-handler retention proposal](../capsules/COMPENSATION-BOUNDARY-HANDLER-RETENTION-PROPOSAL.md) owns explicit target eligibility for one closed ordinary User Task family and both current Multi-Instance User Task families, one outer all-success record including zero-item identity, chronology, bounds, and normal scope-close disposal.

The immediately following Compensation Event Sub-Process proposal must own complete Process/Sub-Process parent context, per-instance provisional snapshots where applicable, exact promotion on successful parent completion, exact purge on failure/early completion/interruption, and snapshot-byte bounds. Neither proposal may treat Continue-As-New as disposal.

## What remains undecided

The exact parent-scope data representation is not implemented for nested Sub-Processes, so its snapshot cannot be sized honestly yet. Trigger visibility, target selection, dependency order, handler consumption/failure, cancellation, Transaction semantics, and CIB compatibility also remain undecided.
