module

public import Kernel.State.Rename
public import Kernel.Laws.State.History
import all Kernel.State.Rename

/-! # Laws of the state: renaming at commit (DC12)

What `Kernel.State.Rename` computes, read from its bodies: a layered key renames segment by segment (`renameScope_eq`),
the renaming that fixes every issue fixes every identity (`renameScope_id`, `renameSlots_id`), and the renamed state's
fields as equations (`renameState_scopes` and its siblings), for the commit's laws, which see no body of this module.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- A segment renamed. -/
def renameSegment (r : Issue → Issue) (segment : ScopeSegment) : ScopeSegment := { segment with ordinal := r segment.ordinal }

/-- `r` keeps every committed issue. -/
def Fixes (r : Issue → Issue) : Prop := ∀ n, r (.committed n) = .committed n

theorem renameSegment_committed {r : Issue → Issue} (fixes : Fixes r) {segment : ScopeSegment}
    (committed : segment.ordinal.isFresh = false) : renameSegment r segment = segment := by
  obtain ⟨element, ordinal⟩ := segment
  cases ordinal with
  | committed n => simp [renameSegment, fixes n]
  | fresh => simp at committed

theorem map_committed {r : Issue → Issue} (fixes : Fixes r) {segments : List ScopeSegment}
    (committed : ∀ segment ∈ segments, segment.ordinal.isFresh = false) : segments.map (renameSegment r) = segments := by
  conv => rhs; rw [← List.map_id segments]
  exact List.map_congr_left fun segment member => renameSegment_committed fixes (committed segment member)

theorem renameScope_go {r : Issue → Issue} (fixes : Fixes r) :
    ∀ (segments : List ScopeSegment) (scope : ScopeOccurrenceId) (same : scope.segments = segments), Layered segments →
      renameWalk r segments scope same = ScopeOccurrenceId.ofSegments (segments.map (renameSegment r))
  | [], scope, same, _ => by
    simp only [renameWalk, List.map_nil]
    exact ScopeOccurrenceId.ext (by rw [same, ScopeOccurrenceId.ofSegments_segments])
  | segment :: rest, scope, same, ⟨top, below⟩ => by
    unfold renameWalk
    split
    · rename_i n committed
      have fixed := map_committed fixes (segments := segment :: rest)
        (fun c member => by
          rcases List.mem_cons.mp member with rfl | above
          · rw [committed]; simp
          · exact top (by rw [committed]; simp) c above)
      rw [fixed]
      exact ScopeOccurrenceId.ext (by rw [same, ScopeOccurrenceId.ofSegments_segments])
    · rename_i unit index fresh
      rw [renameScope_go fixes rest _ rfl below]
      exact ScopeOccurrenceId.ext (by simp [ScopeOccurrenceId.ofSegments_segments, renameSegment])

/-- **The renaming of a layered key** renames every segment. -/
theorem renameScope_eq {r : Issue → Issue} (fixes : Fixes r) {scope : ScopeOccurrenceId} (layered : Layered scope.segments) :
    renameScope r scope = .ofSegments (scope.segments.map (renameSegment r)) :=
  renameScope_go fixes _ scope rfl layered

/-- The renaming's equations, for the modules that state its clauses without its bodies. -/
theorem renameId_eq (r : Issue → Issue) (id : OccurrenceId) :
    renameId r id = { id with scope := renameScope r id.scope, ordinal := r id.ordinal } := by
  unfold renameId; rfl

theorem renameItemKey_eq (r : Issue → Issue) (key : ItemKey) :
    renameItemKey r key = { key with occurrence := renameId r key.occurrence, ordinal := r key.ordinal } := by
  unfold renameItemKey; rfl

theorem renameState_scopes (r : Issue → Issue) (c : Continuation → Continuation) (s : State) : (renameState r c s).scopes = s.scopes.map fun scope =>
    { scope with id := renameScope r scope.id, position := r scope.position, occurrence := scope.occurrence.map (renameId r) } := by
  unfold renameState; rfl

theorem renameState_occurrences (r : Issue → Issue) (c : Continuation → Continuation) (s : State) : (renameState r c s).occurrences = s.occurrences.map
    fun occurrence => { occurrence with id := renameId r occurrence.id, scope := renameScope r occurrence.scope
                                        continuation := c occurrence.continuation } := by
  unfold renameState; rfl

theorem renameState_variables (r : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r c s).variables = s.variables.map fun variables => { variables with scope := renameScope r variables.scope } := by
  unfold renameState; rfl

theorem renameState_openItems (r : Issue → Issue) (c : Continuation → Continuation) (s : State) : (renameState r c s).openItems = s.openItems.foldl
    (fun renamed _ item =>
      let item := { item with id := renameItemKey r item.id, position := r item.position, scope := renameScope r item.scope
                              attachedTo := item.attachedTo.map (renameId r) }
      renamed.insert item.id item) ∅ := by
  unfold renameState; rfl

theorem renameState_slots (r : Issue → Issue) (c : Continuation → Continuation) (s : State) : (renameState r c s).slots = renameSlots r s.slots := by
  unfold renameState; rfl

theorem renameState_journal (r : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r c s).journal = s.journal.map (renameTransition r) := by
  unfold renameState; rfl

@[simp] theorem renameTransition_ended (r : Issue → Issue) (transition : Transition) :
    (renameTransition r transition).ended = transition.ended := by
  unfold renameTransition; rfl

/-- The renaming as an equation: every field but the identities it renames is kept. -/
theorem renameState_eq (r : Issue → Issue) (c : Continuation → Continuation) (s : State) : renameState r c s = { s with
    scopes := s.scopes.map fun scope =>
      { scope with id := renameScope r scope.id, position := r scope.position, occurrence := scope.occurrence.map (renameId r) }
    occurrences := s.occurrences.map fun occurrence =>
      { occurrence with id := renameId r occurrence.id, scope := renameScope r occurrence.scope
                        continuation := c occurrence.continuation }
    variables := s.variables.map fun variables => { variables with scope := renameScope r variables.scope }
    openItems := s.openItems.foldl (fun renamed _ item =>
      let item := { item with id := renameItemKey r item.id, position := r item.position, scope := renameScope r item.scope
                              attachedTo := item.attachedTo.map (renameId r) }
      renamed.insert item.id item) ∅
    slots := renameSlots r s.slots
    journal := s.journal.map (renameTransition r) } := by
  unfold renameState; rfl

@[simp] theorem renameState_scopeOrdinals (r : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r c s).scopeOrdinals = s.scopeOrdinals := by
  unfold renameState; rfl

@[simp] theorem renameState_occurrenceOrdinals (r : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r c s).occurrenceOrdinals = s.occurrenceOrdinals := by
  unfold renameState; rfl

@[simp] theorem renameState_itemOrdinals (r : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r c s).itemOrdinals = s.itemOrdinals := by
  unfold renameState; rfl

/-- The renaming keeps every field but the identities it renames. -/
theorem renameState_frame (r : Issue → Issue) (c : Continuation → Continuation) (s : State) : renameState r c s = { s with
    scopes := (renameState r c s).scopes, occurrences := (renameState r c s).occurrences
    variables := (renameState r c s).variables, openItems := (renameState r c s).openItems
    slots := (renameState r c s).slots, journal := (renameState r c s).journal } := by
  unfold renameState; rfl

theorem renameWalk_id {r : Issue → Issue} (same : ∀ issue, r issue = issue) :
    ∀ (segments : List ScopeSegment) (scope : ScopeOccurrenceId) (h : scope.segments = segments),
      renameWalk r segments scope h = scope
  | [], _, _ => by simp only [renameWalk]
  | segment :: rest, scope, h => by
    unfold renameWalk
    split
    · rfl
    · rw [renameWalk_id same rest _ rfl, same]
      exact ScopeOccurrenceId.ext (by simp [h])

theorem renameScope_id {r : Issue → Issue} (same : ∀ issue, r issue = issue) (scope : ScopeOccurrenceId) :
    renameScope r scope = scope :=
  renameWalk_id same _ scope rfl

theorem renameId_id {r : Issue → Issue} (same : ∀ issue, r issue = issue) (id : OccurrenceId) : renameId r id = id := by
  simp [renameId, renameScope_id same, same]

theorem renameItemKey_id {r : Issue → Issue} (same : ∀ issue, r issue = issue) (key : ItemKey) :
    renameItemKey r key = key := by
  simp [renameItemKey, renameId_id same, same]

section Identity

variable {r : Issue → Issue} (same : ∀ issue, r issue = issue)
include same

theorem renameSlots_id (slots : FeatureSlots) : renameSlots r slots = slots := by
  have ids : renameId r = id := funext (renameId_id same)
  have scopes : renameScope r = id := funext (renameScope_id same)
  have compensable : renameCompensable r = id := funext fun record => by
    simp [renameCompensable, renameScope_id same]
  have resume : renameResume r = id := funext fun resume => by
    cases resume <;> simp [renameResume, renameScope_id same, renameId_id same]
  have iteration : renameIteration r = id := funext fun iteration => by
    cases iteration <;> simp [renameIteration, renameScope_id same]
  cases slots
  simp [renameSlots, ids, compensable, resume, iteration, renameScope_id same]

end Identity

/-! ## The renaming's equations for the commit's clause laws

`Kernel.Laws.Step.Compacted` and the Proofs relations' clause modules read the renamed slots, transitions and their
parts without the bodies of `Kernel.State.Rename`, which only this module opens. -/

theorem renameCompensable_eq (r : Issue → Issue) (record : Compensable) :
    renameCompensable r record = { record with scope := renameScope r record.scope } := by
  unfold renameCompensable; rfl

@[simp] theorem renameResume_complete (r : Issue → Issue) (occurrence : OccurrenceId) (leave : Leave) :
    renameResume r (.complete occurrence leave) = .complete (renameId r occurrence) leave := by
  simp only [renameResume]

@[simp] theorem renameResume_occur (r : Issue → Issue) (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave) :
    renameResume r (.occur element scope leave) = .occur element (renameScope r scope) leave := by
  simp only [renameResume]

@[simp] theorem renameResume_group (r : Issue → Issue) (context : ScopeOccurrenceId) :
    renameResume r (.group context) = .group (renameScope r context) := by
  simp only [renameResume]

@[simp] theorem renameIteration_active (r : Issue → Issue) (scope : ScopeOccurrenceId) :
    renameIteration r (.active scope) = .active (renameScope r scope) := by
  simp only [renameIteration]

@[simp] theorem renameIteration_waiting (r : Issue → Issue) : renameIteration r .waiting = .waiting := by
  simp only [renameIteration]

@[simp] theorem renameIteration_completed (r : Issue → Issue) (output : Option Value) :
    renameIteration r (.completed output) = .completed output := by
  simp only [renameIteration]

@[simp] theorem renameCause_idle (r : Issue → Issue) (scope : ScopeOccurrenceId) :
    renameCause r (.idle scope) = .idle (renameScope r scope) := by
  simp only [renameCause]

@[simp] theorem renameCause_input (r : Issue → Issue) (tag : InputTag) : renameCause r (.input tag) = .input tag := by
  simp only [renameCause]

@[simp] theorem renameCause_signal (r : Issue → Issue) (name : String) : renameCause r (.signal name) = .signal name := by
  simp only [renameCause]

@[simp] theorem renameCause_arrive (r : Issue → Issue) (flow : FlowId) : renameCause r (.arrive flow) = .arrive flow := by
  simp only [renameCause]

theorem renameTransition_eq (r : Issue → Issue) (transition : Transition) :
    renameTransition r transition = { transition with
      cause := renameCause r transition.cause, owner := renameScope r transition.owner
      started := transition.started.map fun fact => { fact with owner := renameScope r fact.owner } } := by
  unfold renameTransition; rfl

theorem renameSlots_eq (r : Issue → Issue) (slots : FeatureSlots) : renameSlots r slots =
    { parked := slots.parked.map fun parked =>
        { parked with occurrence := renameId r parked.occurrence, scope := renameScope r parked.scope }
      held := slots.held.map fun held => { held with occurrence := renameId r held.occurrence, scope := renameScope r held.scope }
      multiInstances := slots.multiInstances.map fun run =>
        { run with scope := renameScope r run.scope, occurrence := renameId r run.occurrence
                   instances := run.instances.map (renameIteration r) }
      compensation := {
        retained := slots.compensation.retained.map (renameCompensable r)
        runs := slots.compensation.runs.map fun run =>
          { run with scope := renameScope r run.scope, pending := run.pending.map (renameCompensable r)
                     running := run.running.map fun (context, record) => (renameScope r context, renameCompensable r record)
                     leave := run.leave.map (renameId r), resume := run.resume.map (renameResume r) } }
      instances := slots.instances.map fun data => { data with root := renameScope r data.root } } := by
  unfold renameSlots; rfl

end Kernel.Laws.State
