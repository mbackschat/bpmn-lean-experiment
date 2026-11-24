module

public import Kernel.Step.Order
public import Kernel.State.Rename

/-! # Step: commit

How a micro-step's effects become the input's journal: `journalDraft` turns the draft into one `Transition` of the
closure, keyed by the unit that ran it, and `orderJournal` commits a settled closure: its transitions and intents in run
order, read from the run log (`RunLog.runPosition`), every family keyed by a unit key emptied, so no unit key outlives
its closure (DC4), and every identity the closure issued renamed to its committed ordinal (`compact`, DC12).
`Kernel.Step.conclude` applies the first before it tells the features what the micro-step removed and wrote, since only
`Kernel.Step` calls those hooks (guard 17). The renaming itself writes the state, so it is `Kernel.State.Rename`'s, which
takes the continuation renaming from here: `Continuation.rekey` and `Continuation.body?` are `Kernel.Step`'s matches on
`Continuation`; nothing else here matches a guarded type.
-/

public section

namespace Kernel.Step

/-- The draft as the transition of the unit `unit`, the draft and the write log emptied. -/
def journalDraft (unit : UnitKey) (cause : Cause) (element : Option ElementId) (owner : ScopeOccurrenceId) (state : State) :
    State :=
  let transition : Transition :=
    { cause, element, owner, started := state.draft.started, ended := state.draft.ended, ready := state.draft.ready }
  { state with transitions := state.transitions.insert unit transition, draft := {}, writes := [] }

/-- The entries of a unit-keyed family in run order: by the position at which each unit ran, then by key, so the order
never depends on the map's (KD7). -/
def byRun {α : Type} (log : RunLog) (entries : TreeMap UnitKey α compare) : List α :=
  ((entries.toList.map fun (unit, value) => (log.runPosition unit, unit, value)).mergeSort fun a b =>
    a.1 < b.1 || a.1 == b.1 && compare a.2.1 b.2.1 != .gt).map (·.2.2)

/-! ## Compaction at commit (DC12) -/


/-- The Multi-Instance body occurrence an instance's occurrence completes into, `none` for any other continuation. -/
def _root_.Kernel.Continuation.body? : Continuation → Option OccurrenceId
  | .multiInstance body => some body
  | .flow => none
  | .compensation _ => none

/-- A continuation with its identities renamed. -/
def _root_.Kernel.Continuation.rekey (occurrence : OccurrenceId → OccurrenceId)
    (scope : ScopeOccurrenceId → ScopeOccurrenceId) : Continuation → Continuation
  | .flow => .flow
  | .multiInstance body => .multiInstance (occurrence body)
  | .compensation run => .compensation (scope run)

/-- The renaming an assignment defines: an assigned fresh issue's committed ordinal, every other issue itself. -/
def renameBy (assigned : TreeMap Issue Nat compare) (issue : Issue) : Issue :=
  match issue with
  | .committed _ => issue
  | .fresh _ _ => match assigned.get? issue with
    | some ordinal => .committed ordinal
    | none => issue

/-- A slot's first ordinal for the closure's issues: its counter in `state`, the closure's starting state (`compact`), or
0 for a slot whose owner the closure issued, which has no counter yet. -/
def slotBase (state : State) : ClaimSlot → Nat
  | .scope slot => if slot.parent.fresh then 0 else state.scopeOrdinals.getD slot 0
  | .occurrence slot => if slot.parent.fresh then 0 else state.occurrenceOrdinals.getD slot 0
  | .item occurrence => if occurrence.fresh then 0 else state.itemOrdinals.getD occurrence 0
  | .position => state.nextOrder

/-- One issue takes its slot's next ordinal; the slot counts past it. -/
def assignStep (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ClaimSlot) : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare :=
  let ordinal := acc.2.getD claim.2 (base claim.2)
  (acc.1.insert claim.1 ordinal, acc.2.insert claim.2 (ordinal + 1))

/-- The closure's issues in the closure's position order under `schedule` (`issuerOrder`, DC13): by their units, then by
their index in the unit. So the commit numbers positions in the order the closure's bodies compared them, and under
`orderInvariant` every slot's numbering is a function of the end state (KD1). -/
def issueOrder (schedule : BranchSchedule) (log : RunLog) (state : State) : List (Issue × ClaimSlot) :=
  state.issued.toList.mergeSort fun a b => Issue.notAfter (issuerOrder schedule log) a.1 b.1

/-- Every issue's committed ordinal, per slot in issue order above the slot's base, and each advanced slot's next
ordinal, keyed by the slot as issued. -/
def assign (schedule : BranchSchedule) (start : State) (log : RunLog) (state : State) :
    TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare :=
  (issueOrder schedule log state).foldl (assignStep (slotBase start)) (∅, ∅)

/-- The counters after the commit: each advanced slot's next ordinal under its renamed slot, where its renamed owner
stands; a counter whose owner the closure removed goes, as it went with its owner (`State.clearInside`,
`State.removeOccurrence`). A counter never decreases (`raiseCounter`): an advanced slot's next ordinal is at or above its
committed counter, so this changes no value, and the laws need no premise that two slots rename apart. -/
def raiseCounter {α : Type} [Ord α] [Std.TransOrd α] (counters : TreeMap α Nat compare) (slot : α) (ordinal : Nat) : TreeMap α Nat compare :=
  counters.insert slot (max ordinal (counters.getD slot 0))

def advanceCounters (r : Issue → Issue) (next : TreeMap ClaimSlot Nat compare) (renamed : State) : State :=
  next.foldl (fun state slot ordinal =>
    match slot with
    | .scope slot =>
      let slot := { slot with parent := renameScope r slot.parent }
      if renamed.scopes.any (·.id == slot.parent) then { state with scopeOrdinals := raiseCounter state.scopeOrdinals slot ordinal }
      else state
    | .occurrence slot =>
      let slot := { slot with parent := renameScope r slot.parent }
      if renamed.scopes.any (·.id == slot.parent) then
        { state with occurrenceOrdinals := raiseCounter state.occurrenceOrdinals slot ordinal }
      else state
    | .item occurrence =>
      let occurrence := renameId r occurrence
      if renamed.occurrences.any (·.id == occurrence) then
        { state with itemOrdinals := raiseCounter state.itemOrdinals occurrence ordinal }
      else state
    | .position => { state with nextOrder := max ordinal state.nextOrder }) renamed

/-- Whether two fresh issues share their index and their units agree on depth, fingerprint and root. -/
def sameIssuerName : Issue → Issue → Bool
  | .fresh unit index, .fresh other index' =>
    index == index' && unit.spine.level == other.spine.level && unit.spine.fingerprint == other.spine.fingerprint &&
      unit.root == other.root
  | _, _ => false

/-- Whether two distinct units of the closure issued at a common index and agree on depth, fingerprint and root: the
TypeScript kernel names an issuer by those fixed-size fields, so it would order such a pair otherwise than the full key
does. Distinct steps have distinct fingerprint codes (`UnitStep.stepCode`), so only a 64-bit fingerprint collision makes
such a pair. One pass in the table's order, which runs the fresh issues by index, then unit, and the units by depth,
fingerprint, root and path, so such a pair has a neighbouring pair of the same kind (`Laws.Step.compact_issuersNamed`),
and the table's keys are distinct, so the neighbours' units differ. -/
def issuerCollision (issued : TreeMap Issue ClaimSlot compare) : Bool :=
  (issued.foldl (init := ((none : Option Issue), false)) fun acc issue _ =>
    (some issue, acc.2 || acc.1.any (sameIssuerName · issue))).2

/-- Rename every identity the closure issued to its committed form (DC12): in issue order, every issue takes its slot's
next ordinal above the slot's counter in `start`, the closure's starting state, so the committed keys are the ones a
counter at issue gave, even for a slot whose owner the closure removed, which prunes its counters (`State.leaveScope`);
the counters of owners that stand advance past them. The issue table empties. An issue no unit made (issued between
micro-steps) is an invariant failure; two issuers a fixed-size name cannot tell apart (`issuerCollision`) are refused.
A closure that issued nothing commits its state as it is, so only an issuing commit renames the whole state; that
renaming walks every identity the state holds, linear in its size per issuing commit. -/
def compact (schedule : BranchSchedule) (start : State) (log : RunLog) (state : State) : Outcome :=
  if state.issued.isEmpty then .ok state
  else if state.issued.any (fun issue _ => issue.unit? == some (.ofRoot .seed)) then
    .error (.semanticFailure .invariant "issue-outside-unit")
  -- dynamic-only: a 64-bit fingerprint collision between two units of one closure, which no model property predicts
  else if issuerCollision state.issued then .error (.unsupported "unit-fingerprint-collision")
  else
    let (assigned, next) := assign schedule start log state
    let r := renameBy assigned
    .ok { advanceCounters r next (renameState r (Continuation.rekey (renameId r) (renameScope r)) state) with issued := ∅, issuing := .ofRoot .seed, issueNext := 0 }

/-- Whether a record of `state` still names the process instance of the activation counter `count`: the process
instance itself, one a standing scope occurrence calls, which `State.instanceOf` gives every standing scope occurrence,
or the thrower's of a compensation run in progress, whose key the counter keeps bounding
(`Proofs.Compensation.TriggersApart.counted`). In an admitted model a run's thrower runs in the run's own instance, so the
last clause keeps no counter the first two drop; the lane does not prove that relation, which would tie a caught
Cancel's trigger to its Transaction's instance (`Feature.Propagation.leaveOccurrence`). -/
@[expose] def countLive (state : State) (count : ActivationCount) : Bool :=
  count.processInstance == state.instanceId || state.scopes.any (·.calledInstance == some count.processInstance) ||
    state.slots.compensation.runs.any (·.trigger.processInstanceId == count.processInstance)

/-- Commit a settled closure: its transitions as the journal and its batches' intents as the input's intents, each in the
order its units ran, every family keyed by a unit key emptied, so no unit key outlives its closure (DC4), and every
identity it issued compacted (`compact`, DC12) against the counters of `start`, the state the closure began from.
Queued work an instance that ended mid-closure left behind is dropped with them: no input runs on an ended instance
(`Step.onRunning`). The activation counters of every called instance the closure left go (DC24): no scope occurrence
stands in it, so nothing activates in it again, and its start facts are the journal's, which counters no longer bound
(`Laws.State.starts`). The draft goes with the transitions, as every micro-step's `conclude` already empties it, so the
committed state holds no start fact a counter must bound. -/
def orderJournal (schedule : BranchSchedule) (start : State) (outcome : Except Failure (State × RunLog)) : Outcome := do
  let (state, log) ← outcome
  compact schedule start log
    { state with
        journal := byRun log state.transitions, intents := (byRun log state.outboxes).flatten
        transitions := ∅, outboxes := ∅, queuedTokens := ∅, queuedSignals := ∅, draft := {}
        activations := state.activations.filter (countLive state) }

end Kernel.Step
