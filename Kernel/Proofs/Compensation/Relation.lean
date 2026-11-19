module

public import Kernel.Proofs.Frame
public import Kernel.Laws.Compensation.Rules
public import Kernel.Laws.State.Sample

/-! # Proofs: the Compensation lane relation

The relation `Formed` the Compensation and Transaction lane ([PLAN, P5](../../../docs/PLAN.md#proof-wave)) carries
beside `Laws.State.WellFormed`, its clauses and the small states each clause rejects. It reads no feature, so the
lane's frame proofs (`Kernel.Proofs.Compensation.Formed`) lie in no feature's rebuild cone (guard 15); the statements
over the hooks are `Kernel.Proofs.Compensation`'s. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (scopeIds Counted)
open Kernel.Laws.Compensation (ClaimsApart Advances Ready)

/-! ## The lane relation -/

/-- Every retained record lies in a present scope occurrence. -/
def RetainedPresent (s : State) : Prop :=
  ∀ record ∈ s.slots.compensation.retained, record.scope ∈ scopeIds s

/-- Every run has a handler pending or running. -/
def RunsUnfinished (s : State) : Prop :=
  ∀ run ∈ s.slots.compensation.runs, run.pending ≠ [] ∨ run.running ≠ []

/-- The completion numbers of `record` and of the records it keeps, at every depth. -/
def completionsOf (record : Compensable) : List Nat :=
  Laws.Compensation.heldCompletions record

/-- The completion numbers of `records`, each with the records it keeps at every depth. -/
def completionsIn (records : List Compensable) : List Nat :=
  records.flatMap completionsOf

/-- The completion numbers a compensation slot holds, each record once: the retained records and every pending one,
each with the children it keeps at every depth, and each running one by its own number only, since its children were
retained in its context when it began, or became its group's nested run's pending records
(`Compensation.beginHandler`). -/
def completions (compensation : Compensations) : List Nat :=
  completionsIn compensation.retained ++ compensation.runs.flatMap fun run =>
    completionsIn run.pending ++ run.running.map (·.2.completion)

/-- No completion number is held twice: `Compensation.completed` issues each record's afresh, and a record moved into
its Scope's children, its parent or a run keeps its own. `ClaimsApart` rests on it, since a completion moves records
outward. -/
def CompletionsApart (compensation : Compensations) : Prop :=
  (completions compensation).Nodup

/-- Every completion number held was issued, so the next completion's is held by no record. -/
def CompletionsIssued (s : State) : Prop :=
  ∀ completion ∈ completions s.slots.compensation, completion < s.nextPosition

/-- No run holds a pending record that may start under `precedes` (`Laws.Compensation.Ready`): every advance starts the
ones that may (`Laws.Compensation.Advances`), and every other change to a run leaves it settled or drops it. -/
def RunsSettled (precedes : Compensable → Compensable → Prop) (s : State) : Prop :=
  ∀ run ∈ s.slots.compensation.runs, ∀ record, ¬ Ready precedes run record

/-- No two runs share a scope occurrence and a trigger, the key `Compensation.advance` and `release` find a run by
(`isRun`). -/
def RunsKeyed (s : State) : Prop :=
  (s.slots.compensation.runs.map fun run => (run.scope, run.trigger)).Nodup

/-- Every run's scope occurrence was issued, so a context entered later is no run's and a group's nested run takes a
key no run has. -/
def RunsIssued (s : State) : Prop :=
  ∀ run ∈ s.slots.compensation.runs, Laws.State.ScopeIssued s run.scope

/-- Whether a compensation resumes a group's nested run (`Resume.group`), which only `Compensation.beginHandler`
makes. -/
def resumesGroup : Option Resume → Bool
  | some (.group _) => true
  | some (.complete _ _) => false
  | some (.occur _ _ _) => false
  | none => false

/-- The trigger a queued compensation or Cancel raise (`Laws.Step.triggersOf`) names in `s`: a compensation's own, and
for a Cancel raise its thrower while the raise's scope occurrence stands, the trigger of the compensation its catch
queues (`Feature.Propagation.leaveOccurrence`). -/
def queuedTrigger (s : State) : OccurrenceRef ⊕ Origin → Option OccurrenceRef
  | .inl trigger => some trigger
  | .inr origin =>
    if origin.scope ∈ scopeIds s then
      some { processInstanceId := s.instanceOf origin.scope, element := origin.element, activation := origin.activation }
    else none

/-- The triggers `s`'s queued compensations and Cancel raises name (`queuedTrigger`). -/
def queuedTriggers (s : State) : List OccurrenceRef :=
  (Laws.Step.triggersOf s.signals).filterMap (queuedTrigger s)

/-- The triggers `s` keeps apart: its runs' but a group's nested runs', which share their outer run's, and the queued
ones. -/
def heldTriggers (s : State) : List OccurrenceRef :=
  (s.slots.compensation.runs.filter (!resumesGroup ·.resume)).map (·.trigger) ++ queuedTriggers s

/-- The key of the occurrence a trigger names, which numbers under its element's own counter. -/
def triggerKey (trigger : OccurrenceRef) : OccurrenceKey :=
  { processInstanceId := trigger.processInstanceId, element := trigger.element, activation := trigger.activation }

/-- Every compensation trigger the state holds is held once and was counted, so a compensation `Step` performs takes a
key no run has (`CompensationsFresh`): the held triggers are distinct (`heldTriggers`); a group's nested run, which
takes the trigger of the run whose handler began it, shares none of the queued ones; every run's and every queued
trigger's activation was issued by its counter (`Laws.State.Counted`), so an occurrence begun afresh later is no thrower
of one; and a queued Cancel raise's scope occurrence was issued, so no scope occurrence entered later makes it name a
trigger (`queuedTrigger`). No trigger names an unbegun reservation: a throw's trigger is its begun occurrence's key,
which no other occurrence carries (`Laws.State.Distinct.keys`), and a reservation made later is numbered above every
counted activation; so a thrower `Step` begins, a reservation or a fresh issue, takes a key no held trigger has. A
group's nested run is tied to no outer run: a drop by scope occurrence (`Compensation.dropWithin`) may take its outer
run and leave it. -/
structure TriggersApart (s : State) : Prop where
  apart : (heldTriggers s).Nodup
  grouped : ∀ run ∈ s.slots.compensation.runs, resumesGroup run.resume = true → run.trigger ∉ queuedTriggers s
  counted : ∀ trigger ∈ s.slots.compensation.runs.map (·.trigger) ++ queuedTriggers s, Counted s (triggerKey trigger)
  issued : ∀ origin, .inr origin ∈ Laws.Step.triggersOf s.signals → Laws.State.ScopeIssued s origin.scope
  unreserved : ∀ occurrence ∈ s.occurrences, occurrence.begun = false →
    ∀ trigger ∈ s.slots.compensation.runs.map (·.trigger) ++ queuedTriggers s,
      triggerKey trigger ≠ Laws.State.key s occurrence

/-- No queued compensation resumes a group: `Propagation` queues those that complete or occur an occurrence, and a
group's nested run resumes its outer run directly (`Compensation.advance`). -/
def QueuedUngrouped (s : State) : Prop :=
  ∀ scope activity trigger leave resume, Signal.compensate scope activity trigger leave resume ∈ s.signals →
    resumesGroup resume = false

/-- The lane relation: no record is claimed twice (`ClaimsApart`), every retained record lies in a present scope
occurrence and no finished run is left, the P0 slot invariant, and its inductive strengthening, which the kernel keeps
by construction (root decision D2, 2026-11-15): completion numbers apart and issued, runs settled under `precedes` and
keyed apart in issued scope occurrences, the held triggers apart and no queued compensation resuming a group (root
decision on the P5 hook proofs' stop, 2026-11-15). It is a lane premise beside
`WellFormed`, not a clause of it, since feature slot entries are each feature's own laws; the lane proves it kept, as P2
does `WellFormed`: by a committed input, at a start (`CompensationsFormedAtStart`) and in every instance of a population
run (`CompensationsFormedInPopulation`). Without `CompletionsApart` a completion that moves a record outward would make
two claimed records equal; without `RunsSettled` and `RunsKeyed` a run no hook touches could hold a ready handler, and a
second run of one key would be advanced in its place, and without `RunsIssued` a group's context, entered afresh, could
be a run's scope occurrence, whose run its nested run's advance then finds; without `TriggersApart` and
`QueuedUngrouped` a compensation could take a key a run holds, whose advance then finds the old run and loses the new
one, or end by releasing a context. -/
structure Formed (precedes : Compensable → Compensable → Prop) (s : State) : Prop where
  claims : ClaimsApart s.slots.compensation
  retained : RetainedPresent s
  unfinished : RunsUnfinished s
  completions : CompletionsApart s.slots.compensation
  issued : CompletionsIssued s
  settled : RunsSettled precedes s
  keyed : RunsKeyed s
  runsIssued : RunsIssued s
  triggers : TriggersApart s
  ungrouped : QueuedUngrouped s

/-! ## Non-vacuity of the lane relation's strengthening

Each clause `Formed` adds to the P0 slot invariant rejects a small state. A record `A` completed in the root scope
occurrence; a trigger thrown by occurrence 7 of `T`. -/

def subjectA : ElementId := ⟨"A"⟩
def thrower : ElementId := ⟨"T"⟩
def rootScope : ScopeOccurrenceId := .ofSegments []

/-- A key below the root that no history of `holdingState` holds: the root's counter of `T` has issued none. -/
def unissuedScope : ScopeOccurrenceId := rootScope.child thrower 0

/-- The first occurrence of `T` in a scope occurrence. -/
def throwerIn (scope : ScopeOccurrenceId) : OccurrenceId := { scope, element := thrower, ordinal := 0 }

def recordA : Compensable := { subject := subjectA, handler := some ⟨"UndoA"⟩, scope := rootScope, completion := 1 }
def thrownBy : OccurrenceRef := { processInstanceId := "p", element := thrower, activation := 1 }
def pendingRun : CompensationRun := { trigger := thrownBy, scope := rootScope, pending := [recordA], leave := none, resume := none }

/-- A state holding `compensation` and queuing `signals`, its root scope occurrence and the counter of `T` at 1. -/
def holdingState (compensation : Compensations) (signals : List Signal) : State :=
  { instanceId := "p", scopes := [{ id := rootScope, element := none }], nextPosition := 8, signals,
    activations := [{ processInstance := "p", element := thrower, role := .element, count := 1 }],
    slots := { compensation } }

/-- Two records of one completion number break `CompletionsApart`. -/
theorem shared_completion_rejected :
    ¬ CompletionsApart { retained := [recordA, { recordA with subject := thrower }] } := by
  simp [CompletionsApart, completions, completionsIn, completionsOf, Laws.Compensation.heldCompletions, recordA]

/-- A completion number not yet issued breaks `CompletionsIssued`. -/
theorem unissued_completion_rejected :
    ¬ CompletionsIssued { holdingState { retained := [recordA] } [] with nextPosition := 1 } := by
  simp [CompletionsIssued, completions, completionsIn, completionsOf, Laws.Compensation.heldCompletions, holdingState, recordA]

/-- A run whose pending record may start breaks `RunsSettled`. -/
theorem ready_pending_rejected : ¬ RunsSettled (fun _ _ => False) (holdingState { runs := [pendingRun] } []) := fun settled =>
  settled pendingRun (by simp [holdingState]) recordA ⟨by simp [pendingRun], fun _ _ none => none⟩

/-- Two runs of one key break `RunsKeyed`. -/
theorem shared_key_rejected : ¬ RunsKeyed (holdingState { runs := [pendingRun, pendingRun] } []) := by
  simp [RunsKeyed, holdingState]

/-- A run in a scope occurrence not yet issued breaks `RunsIssued`. -/
theorem unissued_run_rejected : ¬ RunsIssued (holdingState { runs := [{ pendingRun with scope := unissuedScope }] } []) :=
  fun issued => Laws.State.unissued_of_count (parent := rootScope) (element := thrower) (ordinal := 0)
    (by simp [holdingState]) (by simp [Laws.State.slotCount, holdingState]) (issued _ (List.mem_singleton_self _))

/-- A queued compensation with a run's trigger breaks `TriggersApart`. -/
theorem shared_trigger_rejected :
    ¬ TriggersApart (holdingState { runs := [pendingRun] } [.compensate rootScope none thrownBy none none]) := fun apart => by
  have nodup := apart.apart
  simp [heldTriggers, queuedTriggers, holdingState, pendingRun, resumesGroup, Laws.Step.triggersOf_compensate,
    queuedTrigger] at nodup

/-- `pendingRun` as a group's nested run. -/
def groupRun : CompensationRun := { pendingRun with resume := some (.group rootScope) }

/-- A group's nested run with a queued compensation's trigger breaks `TriggersApart`, though no run but a group's holds
the trigger. -/
theorem queued_group_trigger_rejected :
    ¬ TriggersApart (holdingState { runs := [groupRun] } [.compensate rootScope none thrownBy none none]) := fun apart => by
  refine apart.grouped groupRun (by simp [holdingState]) (by simp [groupRun, resumesGroup]) ?_
  simp [queuedTriggers, holdingState, groupRun, pendingRun, Laws.Step.triggersOf_compensate, queuedTrigger]

/-- A trigger whose activation its counter has not issued breaks `TriggersApart`. -/
theorem uncounted_trigger_rejected :
    ¬ TriggersApart (holdingState { runs := [{ pendingRun with trigger := { thrownBy with activation := 2 } }] } []) :=
  fun apart => by
    obtain ⟨count, member, named⟩ := apart.counted { thrownBy with activation := 2 } (by simp [holdingState])
    obtain ⟨_, _, _, below⟩ := named
    simp [holdingState] at member
    simp [member, triggerKey] at below

/-- So does a group's nested run whose trigger's activation was not issued, though no held trigger names it. -/
theorem uncounted_group_rejected :
    ¬ TriggersApart (holdingState { runs := [{ groupRun with trigger := { thrownBy with activation := 2 } }] } []) :=
  fun apart => by
    obtain ⟨count, member, named⟩ := apart.counted { thrownBy with activation := 2 } (by simp [holdingState])
    obtain ⟨_, _, _, below⟩ := named
    simp [holdingState] at member
    simp [member, triggerKey] at below

/-- A queued Cancel raise from a scope occurrence not yet issued breaks `TriggersApart`. -/
theorem unissued_raise_rejected :
    ¬ TriggersApart (holdingState {} [.raise .cancel { element := thrower, scope := unissuedScope, activation := 1, thrower := throwerIn unissuedScope }]) :=
  fun apart => Laws.State.unissued_of_count (parent := rootScope) (element := thrower) (ordinal := 0)
    (by simp [holdingState]) (by simp [Laws.State.slotCount, holdingState])
    (apart.issued { element := thrower, scope := unissuedScope, activation := 1, thrower := throwerIn unissuedScope }
      (by simp [holdingState, Laws.Step.triggersOf_raise, Laws.State.isCancel_cancel]))

/-- An unbegun reservation of the first occurrence of `T` in the root scope occurrence, with a Cancel raise queued from
that occurrence. -/
def reservedRaise : State :=
  { holdingState {} [.raise .cancel { element := thrower, scope := rootScope, activation := 1, thrower := throwerIn rootScope }] with
    occurrences := [{ id := throwerIn rootScope, element := thrower, scope := rootScope, activation := 1, begun := false }] }

/-- A queued trigger that names an unbegun reservation breaks `TriggersApart`: beginning the reservation would throw
from a key the trigger already holds. -/
theorem reserved_trigger_rejected : ¬ TriggersApart reservedRaise := fun apart =>
  apart.unreserved _ (List.mem_singleton_self _) rfl
    { processInstanceId := reservedRaise.instanceOf rootScope, element := thrower, activation := 1 }
    (List.mem_append_right _ (by
      simp [queuedTriggers, reservedRaise, holdingState, Laws.Step.triggersOf_raise, Laws.State.isCancel_cancel,
        queuedTrigger, scopeIds]))
    rfl

/-- A queued compensation that resumes a group breaks `QueuedUngrouped`. -/
theorem queued_group_rejected :
    ¬ QueuedUngrouped (holdingState {} [.compensate rootScope none thrownBy none (some (.group rootScope))]) :=
  fun ungrouped => by
    have := ungrouped rootScope none thrownBy none (some (.group rootScope)) (by simp [holdingState])
    simp [resumesGroup] at this

end Kernel.Proofs.Compensation
