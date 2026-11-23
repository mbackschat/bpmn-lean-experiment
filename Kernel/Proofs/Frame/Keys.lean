module

public import Kernel.Proofs.Frame.Alongside

/-! # Proofs: occurrences are keyed in their scope occurrences beside `WellFormed`

`Keyed`: every occurrence's key leads with the scope occurrence it stands in, DC26's occurrence clause, which the
commit's renaming reads (`Laws.Step.Phases.runOrder`'s `keys`). Every writer of `State.occurrences` keeps it: a
reservation is keyed in the scope occurrence it is made in (`Laws.State.Reserves.keyed`), a begun occurrence in the one
it begins in, a reservation begun elsewhere being re-keyed there (`Laws.State.Begins.keyed`), and the other
writers keep or drop records. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Frame

open Kernel
open Kernel.Laws.State (WellFormed)

/-- Every occurrence's key leads with its scope occurrence. -/
def Keyed (s : State) : Prop := ∀ o ∈ s.occurrences, o.id.scope = o.scope

/-- Fewer occurrences stay keyed. -/
theorem Keyed.sublist {s t : State} (fewer : t.occurrences.Sublist s.occurrences) (held : Keyed s) :
    Keyed t := fun occurrence member => held occurrence (fewer.subset member)

/-- The same occurrences stay keyed. -/
theorem Keyed.same {s t : State} (same : t.occurrences = s.occurrences) (held : Keyed s) : Keyed t :=
  fun occurrence member => held occurrence (same ▸ member)

/-- A reservation is keyed in the scope occurrence it is made in. -/
theorem keyed_reserve {s : State} (held : Keyed s) (element : ElementId) (scope : ScopeOccurrenceId) :
    Keyed (s.reserve element scope).1 := by
  have reserves := Laws.State.reserve_reserves s element scope
  intro occurrence member
  rw [reserves.occurrences] at member
  rcases List.mem_append.mp member with old | made
  · exact held occurrence old
  · rw [List.mem_singleton.mp made, reserves.keyed, reserves.placed]

/-- A begin keeps the occurrences keyed: the begun occurrence is keyed in the request's scope occurrence, which it
begins in. -/
theorem keyed_begin {program : Program} {s : State} (formed : WellFormed program s) (held : Keyed s)
    (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    Keyed (s.beginOccurrence request role sourceType).1 := by
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  intro occurrence member
  rw [begins.occurrences] at member
  rcases List.mem_append.mp member with old | made
  · exact held occurrence (List.mem_filter.mp old).1
  · rw [List.mem_singleton.mp made, begins.keyed, begins.scope]

section Records

variable (program : Program)

theorem keyed_frame : FrameAlongside program Keyed where
  frame _ _ moved held := held.same moved.occurrences
  emit _ _ _ _ _ _ held := by rw [Laws.State.emit_eq]; exact held
  complete _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  park _ _ _ _ held := held
  arm _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  armGateway _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  raise _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  signalBegin _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  takePosition _ held := by rw [Laws.State.takePosition_eq]; exact held
  enterScope _ _ _ _ _ _ _ _ held := by rw [Laws.State.enterScope_eq]; exact held
  reserve _ element scope _ _ _ _ held := keyed_reserve held element scope
  leaveScope s scope _ _ _ held := held.sublist (Laws.State.leaveScope_occurrences s scope)
  clearInside _ scope keep formed present _ held :=
    held.sublist (Laws.State.clearInside_cleared formed present keep).occurrencesSublist
  disarm s host _ held := held.sublist (Laws.State.disarm_occurrences s host)
  setVariable s target name value _ held := held.same (Laws.State.setVariable_same s target name value).occurrences
  removeVariable s target name _ held := held.same (Laws.State.removeVariable_same s target name).occurrences

theorem keyed_stores : StoresAlongside program Keyed :=
  { keyed_frame program with storeRuns := fun _ _ _ _ _ _ held => held }

theorem keyed_alongside : Alongside program Keyed :=
  { keyed_frame program with
    instanceBegin := fun _ _ _ _ held => by rw [Laws.State.signal_eq]; exact held
    defer := fun _ _ _ _ held => by rw [Laws.State.deferBegins_eq]; exact held
    leaveInstance := fun s _ scope _ _ _ _ held => held.sublist (Laws.State.leaveScope_occurrences s scope)
    runs := fun _ _ _ _ held => held }

theorem keyed_occurs : OccursAlongside program Keyed where
  reserve _ element scope _ _ _ _ held := keyed_reserve held element scope
  occur _ _ _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  compensate _ _ _ _ _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  throwCompensate _ _ _ _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  raise _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  enterCalled _ _ _ _ formed _ _ _ _ _ held := by
    rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]; exact held

/-- Dropping an occurrence's record keeps the occurrences keyed. -/
theorem keyed_withoutRecord (t : State) (id : OccurrenceId) (held : Keyed t) :
    Keyed (Laws.State.withoutRecord t id) :=
  held.sublist (by simp only [Laws.State.withoutRecord]; exact List.filter_sublist)

/-- Cancelling an occurrence withdraws its items, drops its record and journals its end. -/
theorem keyed_cancel {s : State} (formed : WellFormed program s) (held : Keyed s) (id : OccurrenceId) :
    Keyed (s.cancelOccurrence id) :=
  (keyed_frame program).cancelOccurrence (fun t id _ kept => keyed_withoutRecord t id kept)
    (fun _ _ _ kept => kept) formed held

/-- `Step`'s own phases keep the occurrences keyed: every begin does (`keyed_begin`), and taking work off the queues,
cancelling, journalling and moving the batches touch no occurrence's key or scope occurrence. -/
theorem keyed_closure : ClosureAlongside program Keyed :=
  { keyed_frame program with
    dequeue := fun _ _ _ _ held => held
    unqueue := fun _ _ _ held => held
    untoken := fun _ _ _ held => held
    begin := fun _ request role sourceType formed _ _ _ _ held => keyed_begin formed held request role sourceType
    cancel := fun _ id formed held => keyed_cancel program formed held id
    journal := fun _ _ _ _ held _ _ _ => held
    queueBatch := fun _ _ _ held => by rw [Laws.State.queueBatch_eq]; exact held }

/-- The completion pipeline keeps `WellFormed` and the occurrences keyed: starting a reservation changes no key or scope
occurrence, and removing an occurrence drops records. -/
theorem keyed_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ Keyed s where
  startReserved _ s occurrence sourceType holds member unnamed := by
    refine ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    have started : Keyed (s.startReserved occurrence sourceType).1 := by
      cases begun : occurrence.begun
      · have starts := Laws.State.startReserved_starts s sourceType begun
        intro other inside
        rw [starts.occurrences] at inside
        obtain ⟨old, oldIn, rfl⟩ := List.mem_map.mp inside
        by_cases same : old.id = occurrence.id
        · simp only [same, ↓reduceIte]
          exact holds.2 occurrence member
        · simp only [same, ↓reduceIte]
          exact holds.2 old oldIn
      · rw [Laws.State.startReserved_begun s sourceType begun]
        exact holds.2
    rw [Laws.State.closeOwnItems_eq]
    exact started
  removeOccurrence _ s occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (keyed_frame _).removeOccurrence (fun t id _ kept => keyed_withoutRecord t id kept) holds.1 holds.2⟩,
      removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact holds.2⟩

end Records

end Kernel.Proofs.Frame
