module

public import Kernel.State.Rename
public import Kernel.Laws.State.History
public import Kernel.Laws.State.Occurrence
public import Kernel.Laws.State.Slots
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

/-- A scope occurrence record renamed by a commit. -/
abbrev renamedScope (r : Issue → Issue) (scope : ScopeOccurrence) : ScopeOccurrence :=
  { scope with id := renameScope r scope.id, position := r scope.position, occurrence := scope.occurrence.map (renameId r) }

/-- The renamed scope map re-keys every record under its renamed key (`Keyed.refold`). -/
theorem renameState_scopes (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r p c s).scopeMap = Keyed.refold ScopeOccurrence.id (renamedScope r) s.scopeMap := by
  unfold renameState; rfl

/-- Every scope occurrence of the renamed state is one of `s`, renamed. -/
theorem renameState_scope_of {r p : Issue → Issue} {c : Continuation → Continuation} {s : State} {entry : ScopeOccurrence}
    (member : entry ∈ (renameState r p c s).scopes) : ∃ old ∈ s.scopes, entry = renamedScope r old := by
  rw [scopes_eq, renameState_scopes, scopeList_eq] at member
  rw [scopes_eq, scopeList_eq]
  exact Keyed.mem_refold_of member

/-- The standing keys of the renamed state are `s`'s, renamed, whatever the renaming: a renamed key is inserted and
never removed, only its record replaced. -/
theorem renameState_keys {r p : Issue → Issue} {c : Continuation → Continuation} {s : State} {x : ScopeOccurrenceId} :
    x ∈ standingKeys (renameState r p c s) ↔ x ∈ (standingKeys s).map (renameScope r) := by
  unfold standingKeys
  rw [scopes_eq, scopes_eq, renameState_scopes, scopeList_eq, scopeList_eq, Keyed.keys_refold, List.map_map]
  rfl

/-- A renaming that maps no two standing keys onto one keeps every scope occurrence of `s`, renamed. -/
theorem renameState_scope_mem {r p : Issue → Issue} {c : Continuation → Continuation} {s : State}
    (distinct : (standingKeys s).Nodup)
    (apart : ∀ x ∈ standingKeys s, ∀ y ∈ standingKeys s, renameScope r x = renameScope r y → x = y) {old : ScopeOccurrence}
    (member : old ∈ s.scopes) : renamedScope r old ∈ (renameState r p c s).scopes := by
  have values : ∀ {scope : ScopeOccurrence}, scope ∈ Keyed.values s.scopeMap → scope ∈ s.scopes := fun inside => by
    rw [scopes_eq, scopeList_eq]; exact inside
  rw [scopes_eq, renameState_scopes, scopeList_eq]
  rw [scopes_eq, scopeList_eq] at member
  refine Keyed.mem_refold (fun a aIn b bIn same => ?_) member
  exact nodup_map_eq distinct (values aIn) (values bIn)
    (apart _ (List.mem_map_of_mem (values aIn)) _ (List.mem_map_of_mem (values bIn)) same)

theorem renameState_scopesKeyed (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    ScopesKeyed (renameState r p c s).scopeMap := by
  rw [renameState_scopes]; exact Keyed.keyedOn_refold _ _

/-- An occurrence record renamed by a commit, its continuation through `c`. -/
abbrev renamedOccurrence (r p : Issue → Issue) (c : Continuation → Continuation) (occurrence : Occurrence) : Occurrence :=
  { occurrence with id := renameId r occurrence.id, scope := renameScope r occurrence.scope, position := p occurrence.position
                    continuation := c occurrence.continuation }

/-- The renamed occurrence map re-keys every record under its renamed key (`Keyed.refold`). -/
theorem renameState_occurrences (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r p c s).occurrenceMap = Keyed.refold Occurrence.id (renamedOccurrence r p c) s.occurrenceMap := by
  unfold renameState; rfl

/-- Every occurrence of the renamed state is one of `s`, renamed. -/
theorem renameState_occurrence_of {r p : Issue → Issue} {c : Continuation → Continuation} {s : State} {entry : Occurrence}
    (member : entry ∈ (renameState r p c s).occurrences) : ∃ old ∈ s.occurrences, entry = renamedOccurrence r p c old := by
  rw [occurrences_eq, renameState_occurrences, occurrenceList_eq] at member
  rw [occurrences_eq, occurrenceList_eq]
  exact Keyed.mem_refold_of member

/-- A renaming that maps no two occurrence keys onto one keeps every occurrence of `s`, renamed. -/
theorem renameState_occurrence_mem {r p : Issue → Issue} {c : Continuation → Continuation} {s : State}
    (apart : ∀ a ∈ s.occurrences, ∀ b ∈ s.occurrences, renameId r a.id = renameId r b.id → a = b) {old : Occurrence}
    (member : old ∈ s.occurrences) : renamedOccurrence r p c old ∈ (renameState r p c s).occurrences := by
  rw [occurrences_eq, renameState_occurrences, occurrenceList_eq]
  rw [occurrences_eq, occurrenceList_eq] at member apart
  exact Keyed.mem_refold apart member

/-- The renamed occurrences sit under their own keys. -/
theorem renameState_occurrencesKeyed (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    OccurrencesKeyed (renameState r p c s).occurrenceMap := by
  rw [renameState_occurrences]; exact Keyed.keyedOn_refold _ _

theorem renameState_variables (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r p c s).variables =
      s.variables.foldl (fun renamed scope entries => renamed.insert (renameScope r scope) entries) ∅ := by
  unfold renameState; rfl

theorem insertAll_getElem? {β : Type} (f : ScopeOccurrenceId → ScopeOccurrenceId) {y : ScopeOccurrenceId} {v : β} :
    ∀ (entries : List (ScopeOccurrenceId × β)) (acc : TreeMap ScopeOccurrenceId β compare),
      (entries.foldl (fun renamed entry => renamed.insert (f entry.1) entry.2) acc)[y]? = some v →
        acc[y]? = some v ∨ ∃ entry ∈ entries, f entry.1 = y ∧ entry.2 = v
  | [], _, found => .inl found
  | entry :: entries, acc, found => by
    rcases insertAll_getElem? f entries _ found with here | ⟨other, member, renamed, value⟩
    · rw [Std.ExtTreeMap.getElem?_insert] at here
      split at here
      · next same => exact .inr ⟨entry, List.mem_cons_self, Std.LawfulEqCmp.compare_eq_iff_eq.mp same, Option.some.inj here⟩
      · exact .inl here
    · exact .inr ⟨other, List.mem_cons_of_mem _ member, renamed, value⟩

/-- A key-renamed map's entry is an original entry under a key renamed to it: renaming keys moves values, never
makes one. -/
theorem renameKeys_getElem? {β : Type} {f : ScopeOccurrenceId → ScopeOccurrenceId} {m : TreeMap ScopeOccurrenceId β compare}
    {y : ScopeOccurrenceId} {v : β} (found : (m.foldl (fun (renamed : TreeMap ScopeOccurrenceId β compare) x v => renamed.insert (f x) v) ∅)[y]? = some v) :
    ∃ x, f x = y ∧ m[x]? = some v := by
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList] at found
  rcases insertAll_getElem? f _ _ found with empty | ⟨⟨x, w⟩, member, renamed, rfl⟩
  · simp at empty
  · exact ⟨x, renamed, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp member⟩

/-- A key of a key-renamed map is an original key renamed. -/
theorem renameKeys_mem {β : Type} {f : ScopeOccurrenceId → ScopeOccurrenceId} {m : TreeMap ScopeOccurrenceId β compare}
    {y : ScopeOccurrenceId} (member : y ∈ m.foldl (fun (renamed : TreeMap ScopeOccurrenceId β compare) x v => renamed.insert (f x) v) ∅) : ∃ x ∈ m, f x = y := by
  obtain ⟨v, found⟩ := Option.isSome_iff_exists.mp (Std.ExtTreeMap.mem_iff_isSome_getElem?.mp member)
  obtain ⟨x, renamed, was⟩ := renameKeys_getElem? found
  exact ⟨x, Std.ExtTreeMap.mem_iff_isSome_getElem?.mpr (by simp [was]), renamed⟩

theorem renameState_openItems (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) : (renameState r p c s).openItems = s.openItems.foldl
    (fun renamed _ item =>
      let item := { item with id := renameItemKey r item.id, position := r item.position, scope := renameScope r item.scope
                              attachedTo := item.attachedTo.map (renameId r) }
      renamed.insert item.id item) ∅ := by
  unfold renameState; rfl

theorem renameState_slots (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) : (renameState r p c s).slots = renameSlots r s.slots := by
  unfold renameState; rfl

theorem renameState_journal (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r p c s).journal = s.journal.map (renameTransition r) := by
  unfold renameState; rfl

@[simp] theorem renameTransition_ended (r : Issue → Issue) (transition : Transition) :
    (renameTransition r transition).ended = transition.ended := by
  unfold renameTransition; rfl

/-- The renaming as an equation: every field but the identities it renames is kept. -/
theorem renameState_eq (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) : renameState r p c s = { s with
    scopeMap := Keyed.refold ScopeOccurrence.id (renamedScope r) s.scopeMap
    occurrenceMap := Keyed.refold Occurrence.id (renamedOccurrence r p c) s.occurrenceMap
    variables := s.variables.foldl (fun renamed scope entries => renamed.insert (renameScope r scope) entries) ∅
    openItems := s.openItems.foldl (fun renamed _ item =>
      let item := { item with id := renameItemKey r item.id, position := r item.position, scope := renameScope r item.scope
                              attachedTo := item.attachedTo.map (renameId r) }
      renamed.insert item.id item) ∅
    slots := renameSlots r s.slots
    journal := s.journal.map (renameTransition r) } := by
  unfold renameState; rfl

@[simp] theorem renameState_scopeOrdinals (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r p c s).scopeOrdinals = s.scopeOrdinals := by
  unfold renameState; rfl

@[simp] theorem renameState_occurrenceOrdinals (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r p c s).occurrenceOrdinals = s.occurrenceOrdinals := by
  unfold renameState; rfl

@[simp] theorem renameState_itemOrdinals (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) :
    (renameState r p c s).itemOrdinals = s.itemOrdinals := by
  unfold renameState; rfl

/-- The renaming keeps every field but the identities it renames. -/
theorem renameState_frame (r p : Issue → Issue) (c : Continuation → Continuation) (s : State) : renameState r p c s = { s with
    scopeMap := (renameState r p c s).scopeMap, occurrenceMap := (renameState r p c s).occurrenceMap
    variables := (renameState r p c s).variables, openItems := (renameState r p c s).openItems
    slots := (renameState r p c s).slots, journal := (renameState r p c s).journal } := by
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
  cases slots with | mk parked heldMap multiInstanceMap compensation instances =>
  cases compensation
  simp [renameSlots, ids, compensable, resume, iteration, renameScope_id same, Keyed.rebuild_self]
  exact ⟨Keyed.rebuild_self _, Keyed.rebuild_self _⟩

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
      heldMap := slots.heldMap.foldl (fun renamed occurrence scope => renamed.insert (renameId r occurrence) (renameScope r scope)) ∅
      multiInstanceMap := slots.multiInstanceMap.foldl (fun renamed occurrence record => renamed.insert (renameId r occurrence)
        { record with scope := renameScope r record.scope, instances := record.instances.map (renameIteration r) }) ∅
      compensation := {
        retained := slots.compensation.retained.map (renameCompensable r)
        runMap := slots.compensation.runMap.foldl (fun renamed key record => renamed.insert
          { key with scope := renameScope r key.scope }
          { record with pending := record.pending.map (renameCompensable r)
                        running := record.running.map fun (context, record) => (renameScope r context, renameCompensable r record)
                        leave := record.leave.map (renameId r), resume := record.resume.map (renameResume r) }) ∅ }
      instances := slots.instances.map fun data => { data with root := renameScope r data.root } } := by
  unfold renameSlots; rfl

/-- A held occurrence renamed by a commit. -/
abbrev renamedHeld (r : Issue → Issue) (held : Held) : Held :=
  { occurrence := renameId r held.occurrence, scope := renameScope r held.scope }

/-- Every held occurrence of the renamed slots is one of `slots`, renamed. -/
theorem renameSlots_held_of {r : Issue → Issue} {slots : FeatureSlots} {entry : Held}
    (member : entry ∈ (renameSlots r slots).held) : ∃ old ∈ slots.held, entry = renamedHeld r old := by
  rw [held_eq, renameSlots_eq, mem_heldList] at member
  obtain ⟨k, v, found, renamed⟩ := Keyed.rekey_getElem? member
  exact ⟨{ occurrence := k, scope := v }, mem_heldList.mpr found, by cases entry; simp_all⟩

/-- Every running body of the renamed slots is one of `slots`, renamed. -/
theorem renameSlots_bodies_of {r : Issue → Issue} {slots : FeatureSlots} {run : MultiInstanceRun}
    (member : run ∈ (renameSlots r slots).multiInstances) :
    ∃ old, old ∈ slots.multiInstances ∧
      { old with scope := renameScope r old.scope, occurrence := renameId r old.occurrence
                 instances := old.instances.map (renameIteration r) } = run := by
  rw [multiInstances_eq, renameSlots_eq, mem_multiInstanceList] at member
  obtain ⟨k, v, found, renamed⟩ := Keyed.rekey_getElem? member
  refine ⟨v.toRun k, mem_multiInstanceList.mpr (by simpa using found), ?_⟩
  rw [← run_record run, ← renamed.1, ← renamed.2]
  simp [run_eq]

/-- A compensation run renamed by a commit. -/
abbrev renamedRun (r : Issue → Issue) (run : CompensationRun) : CompensationRun :=
  { run with scope := renameScope r run.scope, pending := run.pending.map (renameCompensable r)
             running := run.running.map fun (context, record) => (renameScope r context, renameCompensable r record)
             leave := run.leave.map (renameId r), resume := run.resume.map (renameResume r) }

/-- Every compensation run of the renamed slots is one of `slots`, renamed. -/
theorem renameSlots_runs_of {r : Issue → Issue} {slots : FeatureSlots} {run : CompensationRun}
    (member : run ∈ (renameSlots r slots).compensation.runs) :
    ∃ old ∈ slots.compensation.runs, renamedRun r old = run := by
  rw [runs_eq, renameSlots_eq, mem_runList] at member
  obtain ⟨k, v, found, renamed⟩ := Keyed.rekey_getElem? member
  refine ⟨v.toRun k, mem_runList.mpr (by simpa using found), ?_⟩
  rw [← toRun_toRecord run, ← renamed.1, ← renamed.2]
  simp [toRun_eq]

/-- The renamed runs are `slots`' runs renamed, up to order, when the renaming keeps their keys apart. -/
theorem renameSlots_runs_perm {r : Issue → Issue} {slots : FeatureSlots}
    (apart : ∀ a ∈ slots.compensation.runs, ∀ b ∈ slots.compensation.runs, renameScope r a.scope = renameScope r b.scope →
      a.trigger = b.trigger → a.scope = b.scope) :
    (renameSlots r slots).compensation.runs.Perm (slots.compensation.runs.map (renamedRun r)) := by
  have keysApart : ∀ a ∈ slots.compensation.runs, ∀ b ∈ slots.compensation.runs,
      renamedRun r a = renamedRun r b → a = b := fun a aIn b bIn same => by
    have triggers : a.trigger = b.trigger := by simpa using congrArg CompensationRun.trigger same
    have scopes := apart a aIn b bIn (by simpa using congrArg CompensationRun.scope same) triggers
    have keyed : a.key = b.key := key_eq_iff.mpr ⟨scopes, triggers⟩
    rw [runs_eq] at aIn bIn
    rw [← toRun_toRecord a, ← toRun_toRecord b, ← keyed, Option.some.inj ((mem_runList.mp aIn).symm.trans
      (keyed ▸ mem_runList.mp bIn))]
  refine (List.perm_ext_iff_of_nodup (runList_nodup' _) ?_).mpr fun run => ⟨fun member => ?_, fun member => ?_⟩
  · rw [List.Nodup, List.pairwise_map]
    exact (runList_nodup' _).imp_of_mem fun aIn bIn ne same => ne (keysApart _ aIn _ bIn same)
  · obtain ⟨old, inside, rfl⟩ := renameSlots_runs_of member
    exact List.mem_map_of_mem inside
  · obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
    have found := mem_runList.mp inside
    rw [renameSlots_eq, mem_runList]
    have rekeyed := Keyed.rekey_getElem?_of
      (f := fun key : RunKey => { key with scope := renameScope r key.scope })
      (g := fun record : RunRecord => { record with pending := record.pending.map (renameCompensable r)
                                                    running := record.running.map fun (context, record) =>
                                                      (renameScope r context, renameCompensable r record)
                                                    leave := record.leave.map (renameId r)
                                                    resume := record.resume.map (renameResume r) })
      (fun a b a' b' aFound bFound same => ?_) found
    · simpa [key_mk, toRecord_mk] using rekeyed
    · have aIn : a'.toRun a ∈ slots.compensation.runs := mem_runList.mpr (by simpa using aFound)
      have bIn : b'.toRun b ∈ slots.compensation.runs := mem_runList.mpr (by simpa using bFound)
      have scopes := apart _ aIn _ bIn (by simpa using congrArg RunKey.scope same) (by simpa using congrArg RunKey.trigger same)
      simp only [scope_toRun] at scopes
      cases a; cases b
      simp only [RunKey.mk.injEq] at same ⊢
      exact ⟨scopes, same.2⟩

theorem renameId_keep {r : Issue → Issue} (fixes : Fixes r) {id : OccurrenceId} (scope : renameScope r id.scope = id.scope)
    {m : Nat} (ordinal : id.ordinal = .committed m) : renameId r id = id := by
  obtain ⟨scope', element, ordinal'⟩ := id
  simp only at scope ordinal
  subst ordinal
  rw [renameId_eq]
  simp only [scope, fixes m]

end Kernel.Laws.State
