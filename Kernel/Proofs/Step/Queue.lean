module

public import Kernel.Laws.State.Fire
public import Kernel.Laws.Hooks

/-! # Proofs: queuing a signal under `Laws.State.WellFormed`

`Laws.State.signal_queueSound` asks which signal a phase queues, which only `Signal`'s owners may tell: `Queueable`
says, signal by signal, what queuing it asks of a well-formed state, and `queue_wellFormed` is the one place that tells
them apart. The helpers here queue the signals of the phases and of the registered hooks' operations records, which
`Kernel.Proofs.Step` fills.
-/

@[expose] public section

namespace Kernel.Proofs.Step

variable {program : Program}

open Kernel

/-- What queuing `signal` asks of a well-formed state `s`: an arming names issued identities and a host begun in the
scope occurrence it names, a begin names no reservation and a scope occurrence that stands (one that names a reservation
goes through `Laws.State.signal_named_wellFormed`), a completion completes an issued occurrence, no reservation a
queued begin names and none a start Event's item of `program` waits on, an instance end records a failure exactly when
it fails, a compensation may end as it asks, and a raise names an origin it finds (`Laws.State.Raisable`) and a
settled host. -/
def Queueable (program : Program) (s : State) : Signal → Prop
  | .arm host _ scope => Laws.State.OccurrenceIssued s host ∧ Laws.State.ScopeIssued s scope ∧
    ∀ occurrence ∈ s.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope
  | .armScope scope => Laws.State.ScopeIssued s scope
  | .armGateway occurrence _ scope => Laws.State.OccurrenceIssued s occurrence ∧ Laws.State.ScopeIssued s scope ∧
    ∀ found ∈ s.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope
  | .begin request => Laws.State.names request = [] ∧ request.scope ∈ Laws.State.scopeIds s
  | .complete id _ _ _ => (∀ request, Laws.State.Queued s request → id ∉ Laws.State.names request) ∧ Laws.State.OccurrenceIssued s id ∧
    ∀ item ∈ itemList s.openItems, ((program.element? item.element).bind (·.start?)).isSome = true → item.id.occurrence ≠ id
  | .endInstance status failure => failure.isSome = true ↔ status = .failed
  | .compensate scope _ _ _ resume => ∀ next, resume = some next → Laws.State.Resumable s scope next
  | .raise _ origin => Laws.State.Raisable program s origin ∧ ∀ host, origin.host = some host → Laws.State.Settled s host
  | .write _ _ _ => True
  | .remove _ _ => True
  | .occur _ _ _ _ _ => True
  | .cancel _ => True
  | .fire _ _ => True
  | .compensationFailed _ _ _ _ => True

/-- Queuing a signal a well-formed state is ready for keeps it well-formed. -/
theorem queue_wellFormed {state : State} (formed : Laws.State.WellFormed program state) {signal : Signal}
    (ready : Queueable program state signal) : Laws.State.WellFormed program (state.signal signal) := by
  cases signal
  case begin request =>
    exact Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
        (fun _ same => by simp at same) (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same)
        (fun _ _ _ _ same => by simp at same))
      (Laws.State.signal_claimed_begin formed ready.1 ready.2 fun _ _ _ _ same => by simp at same)
      (Laws.State.signal_settled_begin formed ready.1 (fun _ _ _ _ _ same => by simp at same) fun _ _ same => by
        simp at same)
      (fun _ _ _ _ same => by simp at same) fun _ _ same => by simp at same
  all_goals
    refine Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => ?_)
        (fun _ same => ?_) (fun _ _ _ same => ?_) (fun _ _ same => ?_) (fun _ _ _ _ same => ?_))
      (Laws.State.signal_claimed formed (fun _ same => by simp at same) fun _ _ _ _ same => ?_)
      (Laws.State.signal_settled formed (fun _ same => by simp at same) (fun _ _ _ _ _ same => ?_)
        fun _ _ _ same named => ?_)
      (fun _ _ _ _ same => ?_) (fun _ _ same => ?_) <;>
    first | (simp at same; done) | (cases same; exact ready) | (cases same; exact ready _ rfl) |
      (cases same; exact ready.1) | (cases same; exact ready.2.1) | (cases same; exact ready.2.2) |
      (cases same; exact ready.2 _ named)

/-- A variable command queues its write (`Laws.Step.Phases.queueWrite`). -/
theorem queueWrite_wellFormed {state : State} (formed : Laws.State.WellFormed program state) (scope : ScopeOccurrenceId)
    (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.WellFormed program (state.signal (.write scope writes rule)) :=
  queue_wellFormed formed trivial

/-- A variable command queues its removal (`Laws.Step.Phases.queueRemove`). -/
theorem queueRemove_wellFormed {state : State} (formed : Laws.State.WellFormed program state) (scope : ScopeOccurrenceId)
    (names : List String) : Laws.State.WellFormed program (state.signal (.remove scope names)) :=
  queue_wellFormed formed trivial

/-- No start Event's item waits on a settled occurrence: each holds an unbegun reservation, which stands. -/
theorem settled_unstarted {state : State} (formed : Laws.State.WellFormed program state) {id : OccurrenceId}
    (settled : Laws.State.Settled state id) : ∀ item ∈ itemList state.openItems,
      ((program.element? item.element).bind (·.start?)).isSome = true → item.id.occurrence ≠ id := fun item inside start same => by
  obtain ⟨occurrence, present, named, _⟩ := formed.owned.itemOccurrences item inside
  have unbegun := (formed.typed item inside start).1 occurrence present named
  rw [settled.2.1 occurrence present (named.trans same)] at unbegun
  cases unbegun

/-- A settled occurrence's completion, queued, keeps `WellFormed`. -/
theorem settled_wellFormed {state : State} (formed : Laws.State.WellFormed program state) {id : OccurrenceId}
    (settled : Laws.State.Settled state id) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.WellFormed program (state.signal (.complete id leave writes rule)) :=
  queue_wellFormed formed ⟨settled.2.2, settled.1, settled_unstarted formed settled⟩

/-- A begun occurrence's completion, queued, keeps `WellFormed`. -/
theorem complete_wellFormed {state : State} (formed : Laws.State.WellFormed program state) {occurrence : Occurrence}
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (leave : Leave)
    (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.WellFormed program (state.signal (.complete occurrence.id leave writes rule)) :=
  settled_wellFormed formed (Laws.State.begun_settled formed member begun) leave writes rule

/-- The completion of what an item of no start Event waits on, queued, keeps `WellFormed`: a start Event's item waits
alone. -/
theorem waited_wellFormed {state : State} (formed : Laws.State.WellFormed program state) {item : OpenItem}
    (member : item ∈ itemList state.openItems) (unstarted : (program.element? item.element).bind (·.start?) = none)
    (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.WellFormed program (state.signal (.complete item.id.occurrence leave writes rule)) :=
  have ⟨occurrence, present, named, _⟩ := formed.owned.itemOccurrences item member
  queue_wellFormed formed ⟨Laws.State.waited_unnamed formed member, named ▸ formed.issued.occurrences occurrence present,
    fun other inside start same => by
      rw [← (formed.typed other inside start).2.1 item member same.symm, unstarted] at start
      cases start⟩

/-- A begun occurrence's arming, queued in its own scope occurrence, keeps `WellFormed`. -/
theorem queueArm_wellFormed {state : State} (formed : Laws.State.WellFormed program state) {occurrence : Occurrence}
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (element : ElementId) :
    Laws.State.WellFormed program (state.signal (.arm occurrence.id element occurrence.scope)) :=
  have scopeBelow : Laws.State.ScopeIssued state occurrence.scope := by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)
    exact named ▸ formed.issued.scopes entry inside
  queue_wellFormed formed ⟨formed.issued.occurrences occurrence member, scopeBelow, fun found inside named => by
    rw [Laws.State.nodup_map_eq formed.distinct.occurrences inside member named]
    exact ⟨begun, rfl⟩⟩

/-- The arming of a standing scope occurrence's Event Sub-Processes, queued, keeps `WellFormed`. -/
theorem armScope_wellFormed {state : State} (formed : Laws.State.WellFormed program state) {scope : ScopeOccurrenceId}
    (stands : ∃ entry ∈ state.scopes, entry.id = scope) : Laws.State.WellFormed program (state.signal (.armScope scope)) :=
  have ⟨entry, inside, named⟩ := stands
  queue_wellFormed formed (named ▸ formed.issued.scopes entry inside)

/-- A begin naming no reservation, queued in a scope occurrence that stands, keeps `WellFormed`. -/
theorem bareBegin_wellFormed {state : State} (formed : Laws.State.WellFormed program state) {request : BeginRequest}
    (bare : Laws.State.names request = []) (stands : request.scope ∈ Laws.State.scopeIds state) :
    Laws.State.WellFormed program (state.signal (.begin request)) :=
  queue_wellFormed formed ⟨bare, stands⟩

/-- A raise from a begun occurrence that stands, at its element, scope occurrence and activation, thrown by and hosted,
if at all, by the occurrence itself, queued, keeps `WellFormed`: the occurrence is the settled host, and the origin names
it by its key, which it issued and no other occurrence holds. -/
theorem raiseFrom_wellFormed {state : State} (formed : Laws.State.WellFormed program state) {occurrence : Occurrence}
    (present : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (event : Raised) {host : Option OccurrenceId}
    (hosted : ∀ id, host = some id → id = occurrence.id) (patch : List (String × Value)) :
    Laws.State.WellFormed program (state.signal (.raise event
      { element := occurrence.element, scope := occurrence.scope, activation := occurrence.activation,
        thrower := occurrence.id, host, patch })) := by
  refine queue_wellFormed formed ⟨fun _ => ?_, fun id same => ?_⟩
  · obtain ⟨entry, inside, entryNamed⟩ := List.mem_map.mp (formed.owned.occurrenceScopes occurrence present)
    refine ⟨entryNamed ▸ formed.issued.scopes entry inside, formed.issued.occurrences occurrence present,
      fun other inside named => ?_⟩
    rw [Laws.State.nodup_map_eq formed.distinct.occurrences inside present named]
    exact begun
  · rw [hosted id same]
    exact Laws.State.begun_settled formed present begun

/-- A business Error raised from an effect item's occurrence, queued, keeps `WellFormed`: the item waits for work, so its
occurrence has begun (`Laws.State.Worked`), and the item lies in its occurrence's scope occurrence. -/
theorem effectRaise_wellFormed {state : State} (formed : Laws.State.WellFormed program state) {item : OpenItem}
    (member : item ∈ itemList state.openItems) (effect : item.kind.view.effect.isSome = true) (event : Raised)
    (patch : List (String × Value)) : Laws.State.WellFormed program (state.signal (.raise event
      { element := item.element, scope := item.scope, thrower := item.id.occurrence, host := some item.id.occurrence,
        patch := patch, activation := ((state.occurrence? item.id.occurrence).map (·.activation)).getD 0 })) := by
  obtain ⟨occurrence, present, named, placed⟩ := formed.owned.itemOccurrences item member
  have begun := formed.worked item member (fun waits => by rw [waits.1] at effect; cases effect) occurrence present named
  have activation : ((state.occurrence? item.id.occurrence).map (·.activation)).getD 0 = occurrence.activation := by
    cases found : state.occurrence? item.id.occurrence with
    | none => exact absurd named (Laws.State.occurrence?_none found occurrence present)
    | some other =>
      obtain ⟨inside, same⟩ := Laws.State.occurrence?_some found
      rw [Laws.State.nodup_map_eq formed.distinct.occurrences inside present (same.trans named.symm)]
      rfl
  rw [activation, ← placed.1, ← placed.2, ← named]
  exact raiseFrom_wellFormed formed present begun event (fun _ same => (Option.some.inj same).symm) patch

/-- Holding an occurrence keeps `WellFormed`: no clause reads the held occurrences or the Ready list. -/
theorem hold_wellFormed {state : State} (formed : Laws.State.WellFormed program state) (occurrence : Occurrence) :
    Laws.State.WellFormed program (state.hold occurrence) := by
  rw [Laws.Hooks.hold_eq]
  have slotted : Laws.State.WellFormed program { state with slots := { state.slots with
      held := state.slots.held ++ [{ occurrence := occurrence.id, scope := occurrence.scope }] } } :=
    Laws.State.slots_wellFormed formed
      ⟨formed.settled.parked, formed.settled.bodies, formed.settled.resumed, formed.settled.queued, formed.settled.placed,
        formed.settled.runsPlaced, formed.settled.grouped, formed.settled.raised⟩
  exact slotted.narrow {
      scopes := rfl, scopeOrdinals := rfl, occurrences := rfl, activations := rfl, occurrenceOrdinals := rfl,
      instances := fun _ => by apply Laws.State.instanceOf_congr <;> rfl, recorded := id, items := .refl _,
      tokens := .refl _, signals := .refl _, starts := fun _ => id, slots := .same rfl, issued := rfl, issuing := rfl, issueNext := rfl } rfl slotted.startedOnce

/-- The scope occurrence an occurrence runs in stands. -/
theorem housed_of {state : State} (formed : Laws.State.WellFormed program state) {occurrence : Occurrence}
    (member : occurrence ∈ state.occurrences) : ∃ entry ∈ state.scopes, entry.id = occurrence.scope :=
  List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)

/-- The occurrence that owns a scope occurrence is begun. -/
theorem owner_begun {state : State} (formed : Laws.State.WellFormed program state) {scope : ScopeOccurrence}
    {occurrence : Occurrence} (member : scope ∈ state.scopes) (owned : occurrence ∈ state.occurrences)
    (link : scope.occurrence = some occurrence.id) : occurrence.begun = true := by
  obtain ⟨found, inside, named, begunFlag⟩ := formed.owned.scopeOwners scope member _ link
  rw [Laws.State.nodup_map_eq formed.distinct.occurrences inside owned named] at begunFlag
  exact begunFlag

/-- A begun occurrence is settled: it completes no reservation a queued begin names. -/
theorem begun_settled {state : State} (formed : Laws.State.WellFormed program state) {occurrence : Occurrence}
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) :
    Laws.State.Settled state occurrence.id :=
  ⟨formed.issued.occurrences occurrence member, fun found inside same => by
    rw [Laws.State.nodup_map_eq formed.distinct.occurrences inside member same]
    exact begun, Laws.State.begun_unnamed formed member begun⟩

/-- What a fired item waited on, completed, keeps `WellFormed` (`Laws.State.Fired`). -/
theorem fired_complete {state : State} (formed : Laws.State.WellFormed program state) {item : OpenItem}
    (fired : Laws.State.Fired program state item) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.WellFormed program (state.signal (.complete item.id.occurrence leave writes rule)) :=
  queue_wellFormed formed ⟨fired.2.2.1, fired.2.1, fired.2.2.2.1⟩

/-- A fired start Event's Event Sub-Process, begun with its reservation in the item's scope occurrence, keeps
`WellFormed`. -/
theorem fired_begin {state : State} (formed : Laws.State.WellFormed program state) {item : OpenItem}
    (fired : Laws.State.Fired program state item) (start : ((program.element? item.element).bind (·.start?)).isSome = true)
    (element : ElementId) (writes : List (String × Value)) : Laws.State.WellFormed program
      (state.signal (.begin { element, scope := item.scope, writes, inner := some item.id.occurrence })) :=
  have ⟨beginnable, unclaimed, placed⟩ := fired.2.2.2.2 start
  Laws.State.signal_named_wellFormed formed fired.1 (by simp [Laws.State.names])
    (fun id named => by
      simp only [Laws.State.names, Option.toList, List.nil_append, List.mem_singleton] at named
      subst named
      exact ⟨beginnable, unclaimed⟩)
    (fun id named found inside same => by
      simp only [Option.toList, List.mem_singleton] at named
      exact placed found inside (same.trans named))
    (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same) (fun _ same => by simp at same)
      (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same) (fun _ _ _ _ same => by simp at same))
    (fun _ _ _ _ same => by simp at same) (fun _ _ _ _ _ same => by simp at same) fun _ _ same => by simp at same

end Kernel.Proofs.Step
