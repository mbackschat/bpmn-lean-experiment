module

public import Kernel.State.CallDepth
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
  | .activation slot => state.activationCount slot + 1

/-- One issue takes its slot's next ordinal; the slot counts past it. An occurrence's issue is its order position too
(DC25), so it also counts the position slot past the number `positionsOf` gives that position. -/
def assignStep (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ClaimSlot) : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare :=
  let ordinal := acc.2.getD claim.2 (base claim.2)
  let next := acc.2.insert claim.2 (ordinal + 1)
  (acc.1.insert claim.1 ordinal, match claim.2 with
    | .occurrence _ => next.insert .position (next.getD .position (base .position) + 1)
    | .scope _ | .item _ | .position | .activation _ => next)

/-- An issue's rank in `issuerOrder`, read from the run log: under `declarationDepthFirst` a fresh issue's unit's run
position, above every committed issue's 0; under `orderInvariant` 0, since that order reads no log. -/
def issueRank (schedule : BranchSchedule) (log : RunLog) : Issue → Nat
  | .committed _ => 0
  | .fresh unit _ =>
    match schedule with
    | .declarationDepthFirst => (orderKey log unit 0).1 + 1
    | .orderInvariant => 0

/-- `issuerOrder` between two units of one `issueRank`: the unit keys under `declarationDepthFirst`, whose run positions
tie, the breadth order itself under `orderInvariant`. -/
def tieOrder (schedule : BranchSchedule) : UnitKey → UnitKey → Ordering :=
  match schedule with
  | .declarationDepthFirst => compare
  | .orderInvariant => UnitKey.breadth.val

/-- The closure's issues in the closure's position order under `schedule` (`issuerOrder`, DC13): by their units, then by
their index in the unit. So the commit numbers positions in the order the closure's bodies compared them, and under
`orderInvariant` every slot's numbering is a function of the end state (KD1). -/
def issueOrder (schedule : BranchSchedule) (log : RunLog) (state : State) : List (Issue × ClaimSlot) :=
  -- Each issue's run position is read once, not in every comparison: the sort's comparisons dominated the commit of a
  -- closure at its bound (2026-11-25: 12 s of a 13 s case, two run-log lookups each). `issueOrder_eq` is the plain sort.
  ((state.issued.toList.map fun claim => (issueRank schedule log claim.1, claim)).mergeSort fun a b =>
    a.1 < b.1 || a.1 == b.1 && Issue.notAfter (tieOrder schedule) a.2.1 b.2.1).map (·.2)

/-- The claims of every slot but an activation's, in issue order. -/
def identityClaims (claims : List (Issue × ClaimSlot)) : List (Issue × ClaimSlot) :=
  claims.filter fun claim => match claim.2 with
    | .activation _ => false
    | .scope _ | .occurrence _ | .item _ | .position => true

/-- The Multi-Instance body and item an activation numbers an instance of: the body its occurrence continues into and the
index of the active slot it stands in, `none` for every other activation. -/
def instanceItem? (state : State) (claim : Issue × ActivationSlot) : Option (OccurrenceId × Nat) :=
  match claim.2.role with
  | .multiInstanceBody => none
  | .element => (state.occurrences.find? (·.activation == claim.1)).bind fun occurrence =>
    occurrence.continuation.body?.bind fun body => (state.slots.multiInstanceMap[body]?).bind fun record =>
      (record.instances.findIdx? fun
        | .active scope => scope == occurrence.scope
        | .waiting | .completed _ => false).map (body, ·)

/-- An activation's claim, `none` for every other slot's. -/
def activationClaim? (claim : Issue × ClaimSlot) : Option (Issue × ActivationSlot) :=
  match claim.2 with
  | .activation slot => some (claim.1, slot)
  | .scope _ | .occurrence _ | .item _ | .position => none

/-- The activation claims in issue order, each with the instance item it numbers under `schedule`: under
`orderInvariant` an instance's body and item (`instanceItem?`), under `declarationDepthFirst` none, whose issue order is
its begin order. -/
def taggedActivations (schedule : BranchSchedule) (state : State) (claims : List (Issue × ClaimSlot)) :
    List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat)) :=
  (claims.filterMap activationClaim?).map fun claim =>
      (claim, match schedule with
        | .orderInvariant => instanceItem? state claim
        | .declarationDepthFirst => none)

/-- The place in the closure's order of the tagged activation at issue-order index `place`: its own index, but an
instance of a body takes the places of that body's instances in item order (KD5), its rank among them by item, then by
index. So one body's instances are numbered in item order, and every other activation keeps its place. -/
def activationPlace (tagged : List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat))) (place : Nat) :
    Option (OccurrenceId × Nat) → Nat
  | none => place
  | some (body, item) =>
    let group := tagged.zipIdx.filter fun entry => entry.1.2.map (·.1) == some body
    let rank := group.countP fun entry => match entry.1.2 with
      | some (_, other) => other < item || (other == item && entry.2 < place)
      | none => false
    ((group.map (·.2))[rank]?).getD place

/-- The activation claims by the depth their process instance's name resolves to (`InstanceName.callDepth`), by their
place within one depth (`activationPlace`): a Call's activation is numbered before every activation in the instance it
calls, whose name carries it one level deeper, and one depth keeps issue order but for one body's instances, which take
their places in item order. The depth is the resolved name's, not the pending name's Calls: a standing called name and a
pending one that resolve alike share one slot, and sorting them by their Calls would number them against issue order. -/
def activationOrder (tagged : List ((Issue × ActivationSlot) × Option (OccurrenceId × Nat))) :
    List (Issue × ActivationSlot) :=
  -- Each depth is parsed once, not in every comparison (`activationOrder_eq` is the plain sort).
  (((tagged.zipIdx.map fun entry => (entry.1.1, activationPlace tagged entry.2 entry.1.2)).map fun entry =>
      (entry.1.2.processInstance.callDepth, entry)).mergeSort fun a b =>
    a.1 < b.1 || a.1 == b.1 && a.2.2 ≤ b.2.2).map (·.2.1)

/-- An activation slot under its process instance's name resolved by the ordinals `assigned` holds. -/
def resolveSlot (assigned : TreeMap Issue Nat compare) (slot : ActivationSlot) : ActivationSlot :=
  { slot with processInstance := slot.processInstance.rename (renameBy assigned) }

/-- One activation takes the next ordinal of its slot under its instance's resolved name (KD5): every activation its
name carries is numbered already (`activationOrder`), so two pending instances one name resolves to count on one counter,
the one a committed instance of that name counts on, as the base's `activate` counted on its resolved string. -/
def activationStep (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ActivationSlot) : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare :=
  assignStep base acc (claim.1, .activation (resolveSlot acc.1 claim.2))

/-- Every issue's committed ordinal, per slot in issue order above the slot's base, and each advanced slot's next
ordinal: the identities keyed by the slot as issued, then the activations by their resolved slot (`activationStep`).
Within one resolved slot the activations keep issue order, so the depth order changes no ordinal. -/
def assign (schedule : BranchSchedule) (start : State) (log : RunLog) (state : State) :
    TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare :=
  (activationOrder (taggedActivations schedule state (issueOrder schedule log state))).foldl (activationStep (slotBase start))
    ((identityClaims (issueOrder schedule log state)).foldl (assignStep (slotBase start)) (∅, ∅))

/-- One issue on the position counter: an occurrence's issue takes the counter's next number as its order position, a
position's issue counts past the one `assignStep` gives it, and every other issue leaves the counter. -/
def positionStep (acc : TreeMap Issue Nat compare × Nat) (claim : Issue × ClaimSlot) : TreeMap Issue Nat compare × Nat :=
  match claim.2 with
  | .occurrence _ => (acc.1.insert claim.1 acc.2, acc.2 + 1)
  | .position => (acc.1, acc.2 + 1)
  | .scope _ | .item _ | .activation _ => acc

/-- The order position each occurrence issue of the closure commits to (DC25): in issue order from `start`'s position
counter, counted with the position slot's own issues, as `assignStep` counts them. -/
def positionsOf (schedule : BranchSchedule) (start : State) (log : RunLog) (state : State) : TreeMap Issue Nat compare :=
  ((issueOrder schedule log state).foldl positionStep (∅, start.nextOrder)).1

/-- The counters after the commit: each advanced slot's next ordinal under its renamed slot, where its renamed owner
stands; a counter whose owner the closure removed goes, as it went with its owner (`State.clearInside`,
`State.removeOccurrence`). A counter never decreases (`raiseCounter`): an advanced slot's next ordinal is at or above its
committed counter, so this changes no value, and the laws need no premise that two slots rename apart. -/
def raiseCounter {α : Type} [Ord α] [Std.TransOrd α] (counters : TreeMap α Nat compare) (slot : α) (ordinal : Nat) : TreeMap α Nat compare :=
  counters.insert slot (max ordinal (counters.getD slot 0))

/-- Whether `state` still names the process instance `name`: itself, or one a standing scope occurrence calls, or the
thrower's of a compensation run in progress (`countLive`). -/
@[expose] def instanceLive (state : State) (name : InstanceName) : Bool :=
  name == .named state.instanceId || state.scopes.any (·.calledInstance == some name) ||
    state.slots.compensation.runs.any (·.trigger.processInstanceId == name)

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
    | .position => { state with nextOrder := max ordinal state.nextOrder }
    | .activation slot =>
      -- The counter keeps the last activation numbered, one below the slot's next, under the instance's committed name;
      -- an instance the closure left keeps none (DC24's prune, `countLive`).
      let slot := { slot with processInstance := slot.processInstance.rename r }
      if instanceLive renamed slot.processInstance then
        let same (count : ActivationCount) :=
          count.processInstance == slot.processInstance && count.element == slot.element && count.role == slot.role
        { state with activations := { processInstance := slot.processInstance, element := slot.element, role := slot.role
                                      count := max (ordinal - 1) (state.activationCount slot) } ::
                                    state.activations.filter (!same ·) }
      else state) renamed

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
    -- The activations as well as the ordinals (KD5, owner decision 2026-11-25): numbered in issue order on their resolved
    -- name's counter, so under `orderInvariant` same-element activations of one closure take the schedule-free order,
    -- one body's instances item order (`activationPlace`), and the names of the instances its Calls entered resolve with
    -- them (`InstanceName.rename`).
    let r := renameBy assigned
    .ok { advanceCounters r next (renameState r (renameBy (positionsOf schedule start log state))
            (Continuation.rekey (renameId r) (renameScope r)) state) with issued := ∅, issuing := .ofRoot .seed, issueNext := 0 }

/-- Whether a record of `state` still names the process instance of the activation counter `count`: the process
instance itself, one a standing scope occurrence calls, which `State.instanceOf` gives every standing scope occurrence,
or the thrower's of a compensation run in progress, whose key the counter keeps bounding
(`Proofs.Compensation.TriggersApart.counted`). In an admitted model a run's thrower runs in the run's own instance, so the
last clause keeps no counter the first two drop; the lane does not prove that relation, which would tie a caught
Cancel's trigger to its Transaction's instance (`Feature.Propagation.leaveOccurrence`). -/
@[expose] def countLive (state : State) (count : ActivationCount) : Bool :=
  instanceLive state count.processInstance

/-- Refuse a committed state that names a called instance past `Bounds.instanceIdentityBytes` (OD14). A Call refuses
such an instance when it invokes it (`Feature.Work.invoke`) by the number its activation takes if no unit yet to run
issues another of its counter before it, which under `orderInvariant` the commit may raise (`Ctx.provisional`); this
refuses that rest once the commit has resolved the name. -/
def boundIdentities (bound : Nat) (state : State) : Outcome :=
  if state.scopeMap.any fun _ scope => scope.calledInstance.any (·.text.utf8ByteSize > bound) then
    .error (.unsupported "instance-identity-bound") -- dynamic-only: a Call's activation number grows with its closure
  else .ok state

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
