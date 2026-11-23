module

public import Kernel.Laws.Step.Compact
public import Kernel.Laws.State.Frames

/-! # Laws of the step function: `WellFormed` across compaction at commit (DC12)

Each clause of `Laws.State.WellFormed` and of `Laws.State.IssuerFresh` across `Step.orderJournal`, which orders the journal and compacts the closure's issues onto the counters of the state it started from, from the clause laws of `Kernel.Laws.Step.Compact`; `Kernel.Proofs.Step` fills `Phases.runOrder` from it. Nothing executable imports this module.

A clause theorem takes the settled state's clauses it reads and the commit's premises: the closure's counters
(`CountersFrom`), its empty batches, which leave the committed state's queue views empty, so the clauses over queued
work hold of nothing, and DC26's key agreement (an occurrence's key leads with the scope occurrence it stands in), which
makes every pair of keys the clauses compare have one whose scope occurrence stands, so the renaming keeps them apart
(`renameId_apart`).
-/

@[expose] public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step Kernel.Laws.State

/-- `entry` is the settled scope occurrence `old` under the commit's renaming `r`. -/
structure ScopeRenamed (r : Issue → Issue) (old entry : ScopeOccurrence) : Prop where
  id : entry.id = renameScope r old.id
  occurrence : entry.occurrence = old.occurrence.map (renameId r)
  calledInstance : entry.calledInstance = old.calledInstance

/-- `occurrence` is the settled occurrence `old` under the commit's renaming `r`. -/
structure OccurrenceRenamed (r : Issue → Issue) (old occurrence : Occurrence) : Prop where
  id : occurrence.id = renameId r old.id
  scope : occurrence.scope = renameScope r old.scope
  element : occurrence.element = old.element
  begun : occurrence.begun = old.begun
  role : occurrence.role = old.role
  activation : occurrence.activation = old.activation

/-- What a commit keeps of the settled state `s` in `t`: every field it neither renames nor advances. -/
structure CommitKept (s t : State) : Prop where
  activations : t.activations = s.activations
  status : t.status = s.status
  failure : t.failure = s.failure
  instanceId : t.instanceId = s.instanceId
  batchSignals : t.batchSignals = s.batchSignals
  batchTokens : t.batchTokens = s.batchTokens
  draft : t.draft = s.draft
  queuedSignals : t.queuedSignals = s.queuedSignals
  queuedTokens : t.queuedTokens = s.queuedTokens

/-- The ordered state's clauses a commit's clause theorems read (`ordered_facts`). -/
structure OrderedFacts (start u : State) : Prop where
  counted : CountersFrom start u
  issued : IssuedBelow u
  owned : Owned u
  rooted : Rooted u
  quietSignals : allSignals u = []
  quietTokens : allQueuedTokens u = []

section Compacted

variable {start : State} {log : RunLog} {s t : State}

/-! ## What a commit keeps and renames -/

/-- A commit keeps every field it neither renames nor advances. -/
theorem compact_kept (ran : compact start log s = .ok t) : CommitKept s t := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩
  obtain ⟨_, _, _, same⟩ := advance_frame (commitRenaming start log s) (assign start log s).2
    (renameState (commitRenaming start log s) (commitRekey start log s) s)
  unfold compacted
  rw [same, renameState_eq]
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- The variable sets a commit leaves: the settled state's, renamed. -/
theorem compact_variables (ran : compact start log s = .ok t) :
    t.variables = s.variables.map fun variables =>
      { variables with scope := renameScope (commitRenaming start log s) variables.scope } := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · have same := commitRenaming_empty (start := start) (log := log) empty
    exact ((List.map_congr_left fun _ _ => by simp [renameScope_id same]).trans (List.map_id _)).symm
  obtain ⟨_, _, _, frame⟩ := advance_frame (commitRenaming start log s) (assign start log s).2
    (renameState (commitRenaming start log s) (commitRekey start log s) s)
  unfold compacted
  rw [frame, renameState_eq]

/-- A commit leaves the issue table empty. -/
theorem compact_issued (ran : compact start log s = .ok t) : t.issued = ∅ := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · exact Std.ExtTreeMap.isEmpty_iff.mp empty
  · rfl

/-- A commit keeps the queue views. -/
theorem compact_queues (ran : compact start log s = .ok t) :
    allSignals t = allSignals s ∧ allQueuedTokens t = allQueuedTokens s := by
  have kept := compact_kept ran
  simp only [allSignals, allQueuedTokens, kept.batchSignals, kept.batchTokens, kept.queuedSignals, kept.queuedTokens,
    and_self]

/-- A commit keeps the occurrence keys the start facts of the input record. -/
theorem compact_starts (ran : compact start log s = .ok t) :
    (starts t).map (·.occurrence) = (starts s).map (·.occurrence) := by
  have transitions := (compact_frame ran).2.2.1
  have draft := (compact_kept ran).draft
  rcases compact_cases ran with ⟨_, same⟩ | ⟨_, same⟩
  · rw [same]
  have journal : t.journal = s.journal.map (renameTransition (commitRenaming start log s)) := by
    obtain ⟨_, _, _, frame⟩ := advance_frame (commitRenaming start log s) (assign start log s).2
      (renameState (commitRenaming start log s) (commitRekey start log s) s)
    rw [same]
    unfold compacted
    rw [frame, renameState_eq]
  simp only [starts, List.map_append, journal, transitions, draft, List.flatMap_map, renameTransition_eq,
    List.map_flatMap, List.map_map, Function.comp_def]

/-! ## The settled state's tree and history -/

/-- A standing scope occurrence's parent stands, in a rooted state. -/
theorem rooted_parents (rooted : Rooted s) : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
    ScopeOccurrenceId.ofSegments rest ∈ standingKeys s := by
  intro segment rest standing
  obtain ⟨entry, member, named⟩ := List.mem_map.mp standing
  have link : entry.parent = some (.ofSegments rest) := by
    rw [ScopeOccurrence.parent_eq, named, ScopeOccurrenceId.parent?_cons]
  suffices up : ∀ {x outer : ScopeOccurrenceId}, Within s x outer → outer = State.root → x = entry.id →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s from up (rooted.2.2 entry member) rfl rfl
  intro x outer within root same
  cases within with
  | refl =>
    have orphan := (rooted.2.1 entry member).mpr (same.symm.trans root)
    rw [link] at orphan
    cases orphan
  | parent child parent _ _ childLink above =>
    have parentIs : parent = .ofSegments rest := by
      rw [ScopeOccurrence.parent_eq, same, named, ScopeOccurrenceId.parent?_cons] at childLink
      exact (Option.some.inj childLink).symm
    cases above with
    | refl => rw [← parentIs, root]; exact rooted.1
    | parent other _ _ otherIn _ _ => rw [← parentIs]; exact List.mem_map_of_mem (f := ScopeOccurrence.id) otherIn

/-- A state whose root stands and whose scope occurrences were issued has an issue history. -/
theorem historic_of (issued : IssuedBelow s) (rooted : Rooted s) : Historic s := by
  obtain ⟨scope, member, -⟩ := List.mem_map.mp rooted.1
  exact (issued.scopes scope member).historic

/-! ## The renaming keeps keys apart -/

/-- **The renaming keeps an issued occurrence key apart from one whose scope occurrence stands**: their scope
occurrence keys rename apart (`rename_inj` needs one to stand), so both stand, and `renameId_inj` applies. -/
theorem renameId_apart {H : ScopeOccurrenceId → Prop} (history : ScopeHistory s H) (counted : CountersFrom start s)
    (parents : ∀ segment rest, ScopeOccurrenceId.ofSegments (segment :: rest) ∈ standingKeys s →
      ScopeOccurrenceId.ofSegments rest ∈ standingKeys s)
    {x y : OccurrenceId} (held : H x.scope) (xi : OrdinalIssued s x) (yi : OrdinalIssued s y)
    (ys : y.scope ∈ standingKeys s)
    (same : renameId (commitRenaming start log s) x = renameId (commitRenaming start log s) y) : x = y := by
  have scopes : x.scope = y.scope := by
    have := rename_inj (start := start) (log := log) history counted parents x.scope.segments y.scope
      (by rw [ScopeOccurrenceId.ofSegments_eta]; exact held) ys
      (by rw [ScopeOccurrenceId.ofSegments_eta]; rw [renameId_eq, renameId_eq] at same
          simpa using congrArg OccurrenceId.scope same)
    rwa [ScopeOccurrenceId.ofSegments_eta] at this
  exact renameId_inj history counted parents xi yi (by rw [scopes]; exact ys) ys same

/-- Two issued occurrence keys, one of a standing occurrence, that a commit renames alike are one: under DC26's key
agreement the standing occurrence's key leads with a standing scope occurrence. -/
theorem renamed_apart (counted : CountersFrom start s) (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) {x : OccurrenceId}
    (xi : OccurrenceIssued s x) {occurrence : Occurrence} (member : occurrence ∈ s.occurrences)
    (same : renameId (commitRenaming start log s) x = renameId (commitRenaming start log s) occurrence.id) :
    x = occurrence.id := by
  obtain ⟨⟨H, history, held⟩, ordinal⟩ := xi
  exact renameId_apart history counted (rooted_parents rooted) held ordinal (issued.occurrences occurrence member).2
    (by rw [keys occurrence member]; exact owned.occurrenceScopes occurrence member) same

/-! ## The open items a commit leaves -/

/-- An item renamed by a commit. -/
abbrev renamedItem (r : Issue → Issue) (item : OpenItem) : OpenItem :=
  { item with id := renameItemKey r item.id, scope := renameScope r item.scope, attachedTo := item.attachedTo.map (renameId r) }

/-- A running Multi-Instance body renamed by a commit. -/
abbrev renamedBody (r : Issue → Issue) (run : MultiInstanceRun) : MultiInstanceRun :=
  { run with scope := renameScope r run.scope, occurrence := renameId r run.occurrence,
             instances := run.instances.map (renameIteration r) }

/-- An item a commit leaves is an item of the settled state, renamed. -/
theorem compact_item (ran : compact start log s = .ok t) {item : OpenItem} (member : item ∈ itemList t.openItems) :
    ∃ old ∈ itemList s.openItems, item = renamedItem (commitRenaming start log s) old := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · have same := commitRenaming_empty (start := start) (log := log) empty
    refine ⟨item, member, ?_⟩
    cases attached : item.attachedTo <;>
      simp [renamedItem, attached, renameItemKey_id same, renameScope_id same, renameId_id same] <;> rw [← attached]
  change item ∈ itemList (advanceCounters _ _ _).openItems at member
  rw [(advance_raised _ _ _).items, mem_itemList] at member
  obtain ⟨k, held⟩ := member
  rw [renameState_openItems, Std.ExtTreeMap.foldl_eq_foldl_toList] at held
  rcases foldl_from (g := fun (x : ItemKey × OpenItem) => renamedItem (commitRenaming start log s) x.2)
      (fun m x k v found => by
        simp only [Std.ExtTreeMap.getElem?_insert] at found
        split at found
        · exact .inr (Option.some.inj found).symm
        · exact .inl found) _ _ k item held with empty | ⟨x, entry, same⟩
  · simp at empty
  · exact ⟨x.2, mem_itemList.mpr ⟨x.1, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp entry⟩, same⟩

/-- A commit leaves its items keyed by their keys. -/
theorem compact_keyed (ran : compact start log s = .ok t) (keyed : KeyedBy s.openItems) : KeyedBy t.openItems := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact keyed
  change KeyedBy (advanceCounters _ _ _).openItems
  rw [(advance_raised _ _ _).items, renameState_openItems, Std.ExtTreeMap.foldl_eq_foldl_toList]
  exact foldl_keeps KeyedBy _ _ _ (fun m x _ held => keyedBy_insert held _) keyedBy_empty

/-! ## The clauses that read no renamed identity -/

/-- **`IssuerFresh` across the commit** (`issuer`): the commit empties the issue table. -/
theorem compact_issuerFresh (ran : compact start log s = .ok t) : IssuerFresh t :=
  ⟨fun _ _ held => by simp [compact_issued ran] at held, fun _ _ held => by simp [compact_issued ran] at held,
    fun _ _ _ held => by simp [compact_issued ran] at held⟩

/-- **`ActivationsKeyed` across the commit** (`activations`). -/
theorem compact_activations (ran : compact start log s = .ok t) (keyed : ActivationsKeyed s) : ActivationsKeyed t := by
  obtain ⟨unique, positive⟩ := keyed
  exact ⟨by rw [(compact_kept ran).activations]; exact unique, by rw [(compact_kept ran).activations]; exact positive⟩

/-- **`FailureRecorded` across the commit** (`failure`). -/
theorem compact_failure (ran : compact start log s = .ok t) (recorded : FailureRecorded s) : FailureRecorded t := by
  rw [FailureRecorded, (compact_kept ran).status, (compact_kept ran).failure]; exact recorded

/-- **`StartedOnce` across the commit** (`startedOnce`). -/
theorem compact_startedOnce (ran : compact start log s = .ok t) (once : StartedOnce s) : StartedOnce t := by
  rw [StartedOnce, compact_starts ran]; exact once

/-- **`StartsCounted` across the commit** (`counted`). -/
theorem compact_startsCounted (ran : compact start log s = .ok t) (counted : StartsCounted s) : StartsCounted t := by
  intro fact started
  have named : fact.occurrence ∈ (starts s).map (·.occurrence) := by
    rw [← compact_starts ran]; exact List.mem_map_of_mem (f := StartedFact.occurrence) started
  obtain ⟨old, inside, same⟩ := List.mem_map.mp named
  obtain ⟨count, member, rest⟩ := counted old inside
  exact ⟨count, by rw [(compact_kept ran).activations]; exact member, by rw [← same]; exact rest⟩

/-! ## The clauses over queued work: an empty queue -/

/-- With nothing queued, nothing is: every clause over the queue views holds of nothing. -/
theorem quiet_queued {u : State} (quiet : allSignals u = [] ∧ allQueuedTokens u = []) {request : BeginRequest} :
    ¬ Queued u request := by
  rintro (signal | token)
  · rw [quiet.1] at signal; cases signal
  · rw [quiet.2] at token; cases token

/-- **`QueueSound` across the commit** (`queue`): the committed state queues nothing. -/
theorem quiet_queueSound {u : State} (quiet : allSignals u = []) : QueueSound u where
  arm _ _ _ queued := by rw [quiet] at queued; cases queued
  armScope _ queued := by rw [quiet] at queued; cases queued
  armGateway _ _ _ queued := by rw [quiet] at queued; cases queued
  ends _ _ queued := by rw [quiet] at queued; cases queued
  completes _ _ _ _ queued := by rw [quiet] at queued; cases queued

/-- **`RaisesSound` across the commit** (`raises`). -/
theorem quiet_raisesSound {program : Program} {u : State} (quiet : allSignals u = []) : RaisesSound program u :=
  fun _ _ queued => by rw [quiet] at queued; cases queued

/-- The commit keeps an empty queue. -/
theorem compact_quiet (ran : compact start log s = .ok t) (quiet : allSignals s = [] ∧ allQueuedTokens s = []) :
    allSignals t = [] ∧ allQueuedTokens t = [] := by
  rw [(compact_queues ran).1, (compact_queues ran).2]; exact quiet

/-! ## Ownership across the commit -/

/-- **`Distinct.occurrences` across the commit.** -/
theorem compact_occurrencesDistinct (ran : compact start log s = .ok t) (counted : CountersFrom start s)
    (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) (distinct : (occurrenceIds s).Nodup) :
    (occurrenceIds t).Nodup := by
  have ids : t.occurrences.map (·.id) = (s.occurrences.map (·.id)).map (renameId (commitRenaming start log s)) := by
    rw [compact_occurrences ran]; simp [List.map_map, Function.comp_def]
  unfold occurrenceIds at distinct ⊢
  rw [ids]
  unfold List.Nodup at distinct ⊢
  rw [List.pairwise_map]
  refine distinct.imp_of_mem fun {x y} xin yin apart same => apart ?_
  obtain ⟨o, om, rfl⟩ := List.mem_map.mp xin
  obtain ⟨o', om', rfl⟩ := List.mem_map.mp yin
  exact renamed_apart counted issued owned rooted keys (issued.occurrences o om) om' same

/-! ## Records across the commit -/

/-- The root's key has no segment, in a rooted state: the root is parentless. -/
theorem rooted_root (rooted : Rooted s) : State.root.segments = [] := by
  obtain ⟨entry, member, named⟩ := List.mem_map.mp rooted.1
  have orphan : entry.id.parent? = none := (rooted.2.1 entry member).mpr named
  rw [named] at orphan
  cases segments : State.root.segments with
  | nil => rfl
  | cons segment rest => rw [ScopeOccurrenceId.parent?_cons_eq segments] at orphan; cases orphan

/-- The root's key renames to itself. -/
theorem renameScope_root (rooted : Rooted s) {r : Issue → Issue} (fixes : Fixes r) :
    renameScope r State.root = State.root := by
  have segments := rooted_root rooted
  rw [renameScope_eq fixes (by rw [segments]; trivial), segments, List.map_nil, ← segments, ScopeOccurrenceId.ofSegments_eta]

/-- A renamed layered key's parent is its parent renamed. -/
theorem renamed_parent {r : Issue → Issue} (fixes : Fixes r) {x : ScopeOccurrenceId} (layered : Layered x.segments) :
    (renameScope r x).parent? = x.parent?.map (renameScope r) := by
  rw [renameScope_eq fixes layered]
  conv => rhs; rw [← ScopeOccurrenceId.ofSegments_eta x]
  cases segments : x.segments with
  | nil => simp
  | cons segment rest =>
    rw [segments] at layered
    simp [renameScope_eq fixes (by rw [ScopeOccurrenceId.ofSegments_segments]; exact layered.tail)]

/-- A history key renamed is the root exactly when it is. -/
theorem renamed_root (rooted : Rooted s) {r : Issue → Issue} (fixes : Fixes r) {x : ScopeOccurrenceId}
    (layered : Layered x.segments) : renameScope r x = State.root ↔ x = State.root := by
  have root := rooted_root rooted
  rw [renameScope_eq fixes layered]
  constructor
  · intro same
    have empty := congrArg ScopeOccurrenceId.segments same
    rw [ScopeOccurrenceId.ofSegments_segments, root, List.map_eq_nil_iff] at empty
    rw [← ScopeOccurrenceId.ofSegments_eta x, empty, ← root, ScopeOccurrenceId.ofSegments_eta]
  · rintro rfl
    rw [root, List.map_nil, ← root, ScopeOccurrenceId.ofSegments_eta]

/-- A scope occurrence a commit leaves is one of the settled state, renamed. -/
theorem compact_scope_of (ran : compact start log s = .ok t) {entry : ScopeOccurrence} (member : entry ∈ t.scopes) :
    ∃ old ∈ s.scopes, ScopeRenamed (commitRenaming start log s) old entry := by
  rw [compact_scopeRecords ran] at member
  obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
  exact ⟨old, inside, { id := rfl, occurrence := rfl, calledInstance := rfl }⟩

/-- A scope occurrence of the settled state stands, renamed, after the commit. -/
theorem compact_scope_mem (ran : compact start log s = .ok t) {old : ScopeOccurrence} (member : old ∈ s.scopes) :
    ∃ entry ∈ t.scopes, ScopeRenamed (commitRenaming start log s) old entry := by
  rw [compact_scopeRecords ran]
  exact ⟨_, List.mem_map_of_mem member, { id := rfl, occurrence := rfl, calledInstance := rfl }⟩

/-- An occurrence a commit leaves is one of the settled state, renamed. -/
theorem compact_occurrence_of (ran : compact start log s = .ok t) {occurrence : Occurrence}
    (member : occurrence ∈ t.occurrences) : ∃ old ∈ s.occurrences, OccurrenceRenamed (commitRenaming start log s) old occurrence := by
  rw [compact_occurrences ran] at member
  obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
  exact ⟨old, inside, { id := rfl, scope := rfl, element := rfl, begun := rfl, role := rfl, activation := rfl }⟩

/-- An occurrence of the settled state stands, renamed, after the commit. -/
theorem compact_occurrence_mem (ran : compact start log s = .ok t) {old : Occurrence} (member : old ∈ s.occurrences) :
    ∃ occurrence ∈ t.occurrences, OccurrenceRenamed (commitRenaming start log s) old occurrence := by
  rw [compact_occurrences ran]
  exact ⟨_, List.mem_map_of_mem member, { id := rfl, scope := rfl, element := rfl, begun := rfl, role := rfl, activation := rfl }⟩

/-- An occurrence a commit leaves is one of the settled state, renamed with its continuation. -/
theorem compact_occurrence_eq (ran : compact start log s = .ok t) {occurrence : Occurrence}
    (member : occurrence ∈ t.occurrences) :
    ∃ old ∈ s.occurrences, occurrence =
      { old with id := renameId (commitRenaming start log s) old.id
                 scope := renameScope (commitRenaming start log s) old.scope
                 continuation := old.continuation.rekey (renameId (commitRenaming start log s))
                   (renameScope (commitRenaming start log s)) } := by
  rw [compact_occurrences ran] at member
  obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
  exact ⟨old, inside, rfl⟩

/-- The running bodies a commit leaves: the settled state's, renamed. -/
theorem compact_bodies (ran : compact start log s = .ok t) :
    t.slots.multiInstances = s.slots.multiInstances.map (renamedBody (commitRenaming start log s)) := by
  rw [compact_slots ran, renameSlots_eq]

/-- The compensation slot a commit leaves: the settled state's, renamed. -/
theorem compact_compensation (ran : compact start log s = .ok t) :
    t.slots.compensation =
      { retained := s.slots.compensation.retained.map (renameCompensable (commitRenaming start log s))
        runs := s.slots.compensation.runs.map fun run =>
          { run with scope := renameScope (commitRenaming start log s) run.scope
                     pending := run.pending.map (renameCompensable (commitRenaming start log s))
                     running := run.running.map fun (context, record) =>
                       (renameScope (commitRenaming start log s) context, renameCompensable (commitRenaming start log s) record)
                     leave := run.leave.map (renameId (commitRenaming start log s))
                     resume := run.resume.map (renameResume (commitRenaming start log s)) } } := by
  rw [compact_slots ran, renameSlots_eq]

/-- A renamed slot is active only where the slot was, in its scope occurrence renamed. -/
theorem renameIteration_activeOf {r : Issue → Issue} {iteration : Iteration} {scope : ScopeOccurrenceId}
    (same : renameIteration r iteration = .active scope) : ∃ old, iteration = .active old ∧ scope = renameScope r old := by
  cases iteration <;> simp_all

/-- An active slot of a renamed body is an active slot of the body, renamed. -/
theorem renamed_slot {r : Issue → Issue} {run : MultiInstanceRun} {index : Nat} {scope : ScopeOccurrenceId}
    (active : (run.instances.map (renameIteration r))[index]? = some (.active scope)) :
    ∃ old, run.instances[index]? = some (.active old) ∧ scope = renameScope r old := by
  rw [List.getElem?_map] at active
  obtain ⟨iteration, held, same⟩ := Option.map_eq_some_iff.mp active
  obtain ⟨old, rfl, rfl⟩ := renameIteration_activeOf same
  exact ⟨old, held, rfl⟩

/-- An active slot's scope occurrence of a renamed body is one of the body's active slots', renamed. -/
theorem renamed_active {r : Issue → Issue} {run : MultiInstanceRun} {scope : ScopeOccurrenceId}
    (active : Iteration.active scope ∈ run.instances.map (renameIteration r)) :
    ∃ old, Iteration.active old ∈ run.instances ∧ scope = renameScope r old := by
  obtain ⟨iteration, held, same⟩ := List.mem_map.mp active
  obtain ⟨old, rfl, rfl⟩ := renameIteration_activeOf same
  exact ⟨old, held, rfl⟩

/-- A scope occurrence key issued before the commit is issued after it, renamed. -/
theorem compact_scopeIssued (ran : compact start log s = .ok t) (counted : CountersFrom start s) (rooted : Rooted s)
    {x : ScopeOccurrenceId} (issued : ScopeIssued s x) : ScopeIssued t (renameScope (commitRenaming start log s) x) := by
  obtain ⟨H, history, held⟩ := issued
  exact ⟨_, compact_history ran counted history (rooted_parents rooted), x, held, rfl⟩

/-- A scope occurrence key issued before the commit and a standing one that rename alike are one. -/
theorem renameScope_apart (counted : CountersFrom start s) (rooted : Rooted s) {x y : ScopeOccurrenceId}
    (issued : ScopeIssued s x) (standing : y ∈ standingKeys s)
    (same : renameScope (commitRenaming start log s) x = renameScope (commitRenaming start log s) y) : x = y := by
  obtain ⟨H, history, held⟩ := issued
  have := rename_inj (start := start) (log := log) history counted (rooted_parents rooted) x.segments y
    (by rw [ScopeOccurrenceId.ofSegments_eta]; exact held) standing (by rw [ScopeOccurrenceId.ofSegments_eta]; exact same)
  rwa [ScopeOccurrenceId.ofSegments_eta] at this

/-- An issued scope occurrence key is layered. -/
theorem ScopeIssued.layered {x : ScopeOccurrenceId} (issued : ScopeIssued s x) : Layered x.segments :=
  let ⟨_, history, held⟩ := issued
  history.layered x held

/-- The key of an item's occurrence was issued. -/
theorem item_issued (issued : IssuedBelow s) (owned : Owned s) {item : OpenItem} (member : item ∈ itemList s.openItems) :
    OccurrenceIssued s item.id.occurrence := by
  obtain ⟨occurrence, present, same, -⟩ := owned.itemOccurrences item member
  exact same ▸ issued.occurrences occurrence present

theorem renamedItem_occurrence (r : Issue → Issue) (item : OpenItem) :
    (renamedItem r item).id.occurrence = renameId r item.id.occurrence := by
  simp [renameItemKey_eq]

/-- What no standing occurrence of the settled state with an issued key has begun, none after the commit has. -/
theorem renamed_unbegun (ran : compact start log s = .ok t) (counted : CountersFrom start s) (issued : IssuedBelow s)
    (owned : Owned s) (rooted : Rooted s) (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope)
    {x : OccurrenceId} (xi : OccurrenceIssued s x) (unbegun : Unbegun s x) :
    Unbegun t (renameId (commitRenaming start log s) x) := by
  intro occurrence member same
  obtain ⟨old, inside, mapped⟩ := compact_occurrence_of ran member
  have id := mapped.id
  have begun := mapped.begun
  rw [id] at same
  rw [begun]
  exact unbegun old inside (renamed_apart counted issued owned rooted keys xi inside same.symm).symm

/-- What every standing occurrence of the settled state with an issued key has begun, every one after the commit has. -/
theorem renamed_begun (ran : compact start log s = .ok t) (counted : CountersFrom start s) (issued : IssuedBelow s)
    (owned : Owned s) (rooted : Rooted s) (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope)
    {x : OccurrenceId} (xi : OccurrenceIssued s x) (begun : ∀ occurrence ∈ s.occurrences, occurrence.id = x → occurrence.begun = true) :
    ∀ occurrence ∈ t.occurrences, occurrence.id = renameId (commitRenaming start log s) x → occurrence.begun = true := by
  intro occurrence member same
  obtain ⟨old, inside, mapped⟩ := compact_occurrence_of ran member
  have id := mapped.id
  have kept := mapped.begun
  rw [id] at same
  rw [kept]
  exact begun old inside (renamed_apart counted issued owned rooted keys xi inside same.symm).symm

/-- Two items of the settled state whose occurrences' keys rename alike wait for one occurrence. -/
theorem items_apart (counted : CountersFrom start s) (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) {a b : OpenItem}
    (am : a ∈ itemList s.openItems) (bm : b ∈ itemList s.openItems)
    (same : renameId (commitRenaming start log s) a.id.occurrence = renameId (commitRenaming start log s) b.id.occurrence) :
    a.id.occurrence = b.id.occurrence := by
  obtain ⟨occurrence, present, id, -⟩ := owned.itemOccurrences b bm
  rw [← id] at same ⊢
  exact renamed_apart counted issued owned rooted keys (item_issued issued owned am) present same

/-! ## The membership clauses across the commit -/

/-- **`Owned` across the commit** (`owned`, seven fields): every reference is renamed with what it refers to. -/
theorem compact_owned (ran : compact start log s = .ok t) (owned : Owned s) (quiet : allQueuedTokens t = []) : Owned t where
  occurrenceScopes occurrence member := by
    obtain ⟨old, inside, mapped⟩ := compact_occurrence_of ran member
    have scope := mapped.scope
    change _ ∈ standingKeys t
    rw [compact_scopes ran, scope]
    exact List.mem_map_of_mem (owned.occurrenceScopes old inside)
  itemScopes item member := by
    obtain ⟨old, inside, rfl⟩ := compact_item ran member
    change _ ∈ standingKeys t
    rw [compact_scopes ran]
    exact List.mem_map_of_mem (owned.itemScopes old inside)
  itemOccurrences item member := by
    obtain ⟨old, inside, rfl⟩ := compact_item ran member
    obtain ⟨occurrence, present, links⟩ := owned.itemOccurrences old inside
    obtain ⟨renamed, kept, mapped⟩ := compact_occurrence_mem ran present
    exact ⟨renamed, kept, by rw [mapped.id, links.1, renamedItem_occurrence], by rw [mapped.element, links.2.1],
      by rw [mapped.scope, links.2.2]⟩
  attachments item member host attached := by
    obtain ⟨old, inside, rfl⟩ := compact_item ran member
    obtain ⟨original, was, rfl⟩ := Option.map_eq_some_iff.mp attached
    obtain ⟨occurrence, present, links⟩ := owned.attachments old inside original was
    obtain ⟨renamed, kept, mapped⟩ := compact_occurrence_mem ran present
    exact ⟨renamed, kept, by rw [mapped.id, links.1], by rw [mapped.begun, links.2.1], by rw [mapped.scope, links.2.2]⟩
  scopeOwners scope member owner link := by
    obtain ⟨old, inside, mapped⟩ := compact_scope_of ran member
    have occurrence := mapped.occurrence
    rw [occurrence] at link
    obtain ⟨original, was, rfl⟩ := Option.map_eq_some_iff.mp link
    obtain ⟨present, inside', id, begun⟩ := owned.scopeOwners old inside original was
    obtain ⟨renamed, kept, mapped⟩ := compact_occurrence_mem ran inside'
    have id' := mapped.id
    have begun' := mapped.begun
    exact ⟨renamed, kept, by rw [id', id], by rw [begun', begun]⟩
  variableScopes variables member := by
    rw [compact_variables ran] at member
    obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
    change _ ∈ standingKeys t
    rw [compact_scopes ran]
    exact List.mem_map_of_mem (owned.variableScopes old inside)
  tokenScopes token member := by rw [quiet] at member; cases member

/-- **`Rooted` across the commit** (`rooted`, three fields): the root keeps its key, and every parent link is renamed. -/
theorem compact_rooted (ran : compact start log s = .ok t) (issued : IssuedBelow s) (rooted : Rooted s) : Rooted t := by
  obtain ⟨H, history⟩ := historic_of issued rooted
  have fixes : Fixes (commitRenaming start log s) := renameBy_fixes _
  have layered : ∀ x ∈ standingKeys s, Layered x.segments := fun x standing =>
    history.layered x (history.standing_key standing)
  refine ⟨?_, fun entry member => ?_, fun entry member => ?_⟩
  · change State.root ∈ standingKeys t
    rw [compact_scopes ran, ← renameScope_root rooted fixes]
    exact List.mem_map_of_mem rooted.1
  · obtain ⟨old, inside, mapped⟩ := compact_scope_of ran member
    have id := mapped.id
    have oldLayered := layered old.id (List.mem_map_of_mem inside)
    change entry.id.parent? = none ↔ _
    rw [id, renamed_parent fixes oldLayered, Option.map_eq_none_iff, renamed_root rooted fixes oldLayered]
    exact rooted.2.1 old inside
  · obtain ⟨old, inside, mapped⟩ := compact_scope_of ran member
    have id := mapped.id
    rw [id]
    suffices up : ∀ {x outer : ScopeOccurrenceId}, Within s x outer → outer = State.root →
        Within t (renameScope (commitRenaming start log s) x) State.root from up (rooted.2.2 old inside) rfl
    intro x outer within root
    induction within with
    | refl scope => subst root; rw [renameScope_root rooted fixes]; exact .refl _
    | parent child parent _ childIn link _ ih =>
      obtain ⟨renamed, renamedIn, mapped⟩ := compact_scope_mem ran childIn
      have renamedId := mapped.id
      have renamedLink : renamed.parent = some (renameScope (commitRenaming start log s) parent) := by
        change renamed.id.parent? = _
        rw [renamedId, renamed_parent fixes (layered child.id (List.mem_map_of_mem childIn)),
          show child.id.parent? = some parent from link]
        rfl
      rw [← renamedId]
      exact .parent renamed _ _ renamedIn renamedLink (ih root)

/-- **`VariablesKeyed` across the commit** (`variables`, two fields): variable sets of standing scope occurrences, whose
keys rename apart. -/
theorem compact_variablesKeyed (ran : compact start log s = .ok t) (counted : CountersFrom start s)
    (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s) (keyed : VariablesKeyed s) : VariablesKeyed t := by
  have historic := historic_of issued rooted
  refine ⟨?_, fun variables member => ?_⟩
  · have scopes := keyed.scopes
    rw [compact_variables ran, List.map_map]
    unfold List.Nodup at scopes ⊢
    rw [List.pairwise_map] at scopes ⊢
    refine scopes.imp_of_mem fun {a b} am bm apart same => apart ?_
    exact renameScope_apart counted rooted (historic.issued_key (owned.variableScopes a am)) (owned.variableScopes b bm)
      (by simpa using same)
  · rw [compact_variables ran] at member
    obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
    exact keyed.names old inside

/-- **`OwnedBelow` across the commit** (`ownedBelow`): a scope occurrence's owner is renamed with it. -/
theorem compact_ownedBelow (ran : compact start log s = .ok t) (counted : CountersFrom start s) (issued : IssuedBelow s)
    (owned : Owned s) (rooted : Rooted s) (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope)
    (below : OwnedBelow s) : OwnedBelow t := by
  obtain ⟨H, history⟩ := historic_of issued rooted
  intro scope member occurrence present link
  obtain ⟨old, inside, mapped⟩ := compact_scope_of ran member
  have id := mapped.id
  have owner := mapped.occurrence
  obtain ⟨original, originalIn, mapped⟩ := compact_occurrence_of ran present
  have originalId := mapped.id
  have originalScope := mapped.scope
  rw [owner, originalId] at link
  obtain ⟨a, was, same⟩ := Option.map_eq_some_iff.mp link
  obtain ⟨holder, holderIn, holderId, -⟩ := owned.scopeOwners old inside a was
  have apart := renamed_apart counted issued owned rooted keys (holderId ▸ issued.occurrences holder holderIn) originalIn same
  have parent := below old inside original originalIn (by rw [was, apart])
  change scope.id.parent? = _
  rw [id, renamed_parent (renameBy_fixes _) (history.layered _ (history.standing_key (List.mem_map_of_mem inside))),
    originalScope, show old.id.parent? = some original.scope from parent]
  rfl

/-- **`AttachedReserved` across the commit** (`attachedReserved`). -/
theorem compact_attachedReserved (ran : compact start log s = .ok t) (counted : CountersFrom start s)
    (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) (reserved : AttachedReserved s) :
    AttachedReserved t := by
  intro item member attached
  obtain ⟨old, inside, rfl⟩ := compact_item ran member
  rw [renamedItem_occurrence]
  exact renamed_unbegun ran counted issued owned rooted keys (item_issued issued owned inside)
    (reserved old inside (by simpa [renamedItem] using attached))

/-- **`Typed` across the commit** (`typed`). -/
theorem compact_typed {program : Program} (ran : compact start log s = .ok t) (counted : CountersFrom start s)
    (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) (quiet : allSignals t = [])
    (typed : Typed program s) : Typed program t := by
  intro item member started
  obtain ⟨old, inside, rfl⟩ := compact_item ran member
  obtain ⟨unbegun, alone, -, awaits⟩ := typed old inside started
  refine ⟨?_, fun other otherIn same => ?_, fun _ _ _ queued => (by rw [quiet] at queued; cases queued), awaits⟩
  · rw [renamedItem_occurrence]
    exact renamed_unbegun ran counted issued owned rooted keys (item_issued issued owned inside) unbegun
  · obtain ⟨old', inside', rfl⟩ := compact_item ran otherIn
    rw [renamedItem_occurrence, renamedItem_occurrence] at same
    rw [alone old' inside' (items_apart counted issued owned rooted keys inside' inside same)]

/-- **`Worked` across the commit** (`worked`). -/
theorem compact_worked (ran : compact start log s = .ok t) (counted : CountersFrom start s) (issued : IssuedBelow s)
    (owned : Owned s) (rooted : Rooted s) (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope)
    (worked : Worked s) : Worked t := by
  intro item member waits occurrence present same
  obtain ⟨old, inside, rfl⟩ := compact_item ran member
  rw [renamedItem_occurrence] at same
  exact renamed_begun ran counted issued owned rooted keys (item_issued issued owned inside) (worked old inside waits)
    occurrence present same

/-- **`ItemRoles` across the commit** (`itemRoles`). -/
theorem compact_itemRoles' (ran : compact start log s = .ok t) (counted : CountersFrom start s) (issued : IssuedBelow s)
    (owned : Owned s) (rooted : Rooted s) (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope)
    (roles : ItemRoles s) : ItemRoles t := by
  intro item member occurrence present same
  obtain ⟨old, inside, rfl⟩ := compact_item ran member
  obtain ⟨original, originalIn, mapped⟩ := compact_occurrence_of ran present
  have originalId := mapped.id
  have role := mapped.role
  rw [renamedItem_occurrence, originalId] at same
  rw [role]
  exact roles old inside original originalIn
    (renamed_apart counted issued owned rooted keys (item_issued issued owned inside) originalIn same.symm).symm

/-- **`EventRoles` across the commit** (`roles`). -/
theorem compact_eventRoles {program : Program} (ran : compact start log s = .ok t) (roles : EventRoles program s) :
    EventRoles program t := by
  intro occurrence member event
  obtain ⟨original, originalIn, mapped⟩ := compact_occurrence_of ran member
  have element := mapped.element
  have role := mapped.role
  rw [role]
  exact roles original originalIn (by rw [← element]; exact event)

/-- **`BodyRoles` across the commit** (`bodyRoles`). -/
theorem compact_bodyRoles {program : Program} (ran : compact start log s = .ok t) (bodies : BodyRoles program s) :
    BodyRoles program t := by
  intro occurrence member body
  obtain ⟨original, originalIn, mapped⟩ := compact_occurrence_of ran member
  have element := mapped.element
  have role := mapped.role
  rw [element]
  exact bodies original originalIn (by rw [← role]; exact body)

/-- **`ReservationsClaimed` across the commit** (`claimed`, eight fields): an attached item's reservation is renamed with
it, and nothing is queued. -/
theorem compact_claimed (ran : compact start log s = .ok t) (counted : CountersFrom start s) (issued : IssuedBelow s)
    (owned : Owned s) (rooted : Rooted s) (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope)
    (quiet : allSignals t = [] ∧ allQueuedTokens t = []) (claimed : ReservationsClaimed s) : ReservationsClaimed t where
  attached item member some reservation other otherIn same := by
    obtain ⟨old, inside, rfl⟩ := compact_item ran member
    obtain ⟨old', inside', rfl⟩ := compact_item ran otherIn
    rw [renamedItem_occurrence, renamedItem_occurrence] at same
    obtain ⟨occurrence, present, id, unbegun⟩ := reservation
    obtain ⟨original, originalIn, mapped⟩ := compact_occurrence_of ran present
    have originalId := mapped.id
    have begun := mapped.begun
    rw [renamedItem_occurrence, originalId] at id
    have apart := renamed_apart counted issued owned rooted keys (item_issued issued owned inside) originalIn id.symm
    rw [claimed.attached old inside (by simpa [renamedItem] using some)
      ⟨original, originalIn, apart.symm, by rw [← begun]; exact unbegun⟩ old' inside'
      (items_apart counted issued owned rooted keys inside' inside same)]
  named _ queued := absurd queued (quiet_queued quiet)
  signalsApart _ _ pair := by rw [quiet.1] at pair; simp [Precedes] at pair
  tokensApart _ _ pair := by rw [quiet.2] at pair; simp [Precedes] at pair
  queuesApart _ _ signal := by rw [quiet.1] at signal; cases signal
  uncompleted _ _ _ _ _ queued := absurd queued (quiet_queued quiet)
  scopesIssued _ queued := absurd queued (quiet_queued quiet)
  innerPlaced _ queued := absurd queued (quiet_queued quiet)

/-- **`SlotsSettled` across the commit** (`settled`, eight fields): what a slot completes is renamed with it, its
instances and handler contexts are renamed with their parents, and nothing is queued. -/
theorem compact_slotsSettled (ran : compact start log s = .ok t) (counted : CountersFrom start s)
    (issued : IssuedBelow s) (owned : Owned s) (rooted : Rooted s)
    (keys : ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope)
    (quiet : allSignals t = [] ∧ allQueuedTokens t = []) (settled : SlotsSettled s) : SlotsSettled t := by
  have renamedSettled : ∀ {x : OccurrenceId}, Settled s x → Settled t (renameId (commitRenaming start log s) x) := fun ⟨xi, begun, _⟩ =>
    ⟨compact_occurrenceIssued ran counted (rooted_parents rooted) xi,
      renamed_begun ran counted issued owned rooted keys xi begun, fun _ queued => absurd queued (quiet_queued quiet)⟩
  have placedBelow : ∀ {x parent : ScopeOccurrenceId}, ScopeIssued s x →
      (∀ entry ∈ s.scopes, entry.id = x → entry.parent = some parent) →
      ScopeIssued t (renameScope (commitRenaming start log s) x) ∧
        ∀ entry ∈ t.scopes, entry.id = renameScope (commitRenaming start log s) x → entry.parent = some (renameScope (commitRenaming start log s) parent) := by
    intro x parent xi below
    refine ⟨compact_scopeIssued ran counted rooted xi, fun entry member same => ?_⟩
    obtain ⟨old, inside, mapped⟩ := compact_scope_of ran member
    have id := mapped.id
    rw [id] at same
    have apart := renameScope_apart counted rooted xi (List.mem_map_of_mem inside) same.symm
    subst apart
    change entry.id.parent? = _
    rw [id, renamed_parent (renameBy_fixes _) (ScopeIssued.layered xi), show old.id.parent? = some parent from below old inside rfl]
    rfl
  have slots := compact_slots ran
  rw [renameSlots_eq] at slots
  refine {
    parked := fun waiting member => by
      rw [slots] at member
      obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
      exact renamedSettled (settled.parked old inside)
    bodies := fun run member => by
      rw [slots] at member
      obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
      exact renamedSettled (settled.bodies old inside)
    resumed := fun run member occurrence leave resume => by
      rw [slots] at member
      obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
      obtain ⟨original, was, same⟩ := Option.map_eq_some_iff.mp resume
      cases original with
      | complete a l =>
        simp only [renameResume_complete, Resume.complete.injEq] at same
        obtain ⟨rfl, rfl⟩ := same
        exact renamedSettled (settled.resumed old inside a l was)
      | occur => simp at same
      | group => simp at same
    queued := fun _ _ _ _ _ _ queued => by rw [quiet.1] at queued; cases queued
    placed := fun run member scope active => by
      rw [slots] at member
      obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
      obtain ⟨iteration, was, same⟩ := List.mem_map.mp active
      cases iteration with
      | active original =>
        simp only [renameIteration_active, Iteration.active.injEq] at same
        subst same
        obtain ⟨xi, below⟩ := settled.placed old inside original was
        exact placedBelow xi below
      | waiting => simp at same
      | completed => simp at same
    runsPlaced := ?runsPlaced
    grouped := fun _ _ _ _ _ queued => by rw [quiet.1] at queued; cases queued
    raised := fun _ _ _ queued => by rw [quiet.1] at queued; cases queued }
  case runsPlaced =>
    intro run member
    rw [slots] at member
    obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
    obtain ⟨groups, running⟩ := settled.runsPlaced old inside
    refine ⟨fun context resume => ?_, fun context active => ?_⟩
    · obtain ⟨original, was, same⟩ := Option.map_eq_some_iff.mp resume
      cases original with
      | group c =>
        simp only [renameResume_group, Resume.group.injEq] at same
        subst same
        rw [groups c was]
      | complete => simp at same
      | occur => simp at same
    · rw [List.map_map] at active
      obtain ⟨pair, pairIn, rfl⟩ := List.mem_map.mp active
      obtain ⟨xi, below⟩ := running pair.1 (List.mem_map_of_mem pairIn)
      exact placedBelow xi below

/-! ## What the relations' clauses share -/

/-- A scope occurrence a commit leaves is one of the settled state, renamed. -/
theorem compact_scope_eq (ran : compact start log s = .ok t) {entry : ScopeOccurrence} (member : entry ∈ t.scopes) :
    ∃ old ∈ s.scopes, entry =
      { old with id := renameScope (commitRenaming start log s) old.id
                 occurrence := old.occurrence.map (renameId (commitRenaming start log s)) } := by
  rw [compact_scopeRecords ran] at member
  obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
  exact ⟨old, inside, rfl⟩

/-- The start facts a commit journals: the ordered transitions', each fact's occurrence key kept. -/
theorem compact_journalStarts (ran : compact start log s = .ok t) :
    (t.journal.flatMap (·.started)).map (·.occurrence) = (s.journal.flatMap (·.started)).map (·.occurrence) := by
  rcases compact_cases ran with ⟨_, same⟩ | ⟨_, same⟩
  · rw [same]
  have journal : t.journal = s.journal.map (renameTransition (commitRenaming start log s)) := by
    obtain ⟨_, _, _, frame⟩ := advance_frame (commitRenaming start log s) (assign start log s).2
      (renameState (commitRenaming start log s) (commitRekey start log s) s)
    rw [same]
    unfold compacted
    rw [frame, renameState_eq]
  simp only [journal, List.flatMap_map, renameTransition_eq, List.map_flatMap, List.map_map, Function.comp_def]

/-- A history key of a state whose issue table is empty is committed throughout: a fresh segment would be in the table. -/
theorem committed_segments {u : State} {H : ScopeOccurrenceId → Prop} (history : ScopeHistory u H) (empty : u.issued = ∅) :
    ∀ segments : List ScopeSegment, H (.ofSegments segments) → ∀ c ∈ segments, c.ordinal.isFresh = false
  | [], _, c, member => nomatch member
  | segment :: rest, held, c, member => by
    rcases List.mem_cons.mp member with same | later
    · rw [same]
      cases fresh : segment.ordinal with
      | committed => simp
      | fresh unit index =>
        have tabled := history.tabled segment rest unit index held fresh
        rw [empty] at tabled
        simp at tabled
    · exact committed_segments history empty rest (history.closed segment rest held) c later

/-- A commit's renaming fixes every scope occurrence key a state with an empty issue table issued. -/
theorem scope_fixed {u : State} (empty : u.issued = ∅) {x : ScopeOccurrenceId} (issued : ScopeIssued u x)
    {r : Issue → Issue} (fixes : Fixes r) : renameScope r x = x := by
  obtain ⟨H, history, held⟩ := issued
  have all := committed_segments history empty x.segments (by rw [ScopeOccurrenceId.ofSegments_eta]; exact held)
  rw [renameScope_eq fixes (history.layered x held), map_committed fixes all, ScopeOccurrenceId.ofSegments_eta]

/-- A commit's renaming fixes every occurrence key a state with an empty issue table issued. -/
theorem id_fixed {u : State} (empty : u.issued = ∅) {x : OccurrenceId} (issued : OccurrenceIssued u x)
    {r : Issue → Issue} (fixes : Fixes r) : renameId r x = x := by
  obtain ⟨scope, ordinal⟩ := issued
  cases hx : x.ordinal with
  | committed n => exact renameId_keep fixes (scope_fixed empty scope fixes) hx
  | fresh unit index =>
    have tabled := ordinal.2.2 unit index hx
    rw [empty] at tabled
    simp at tabled

end Compacted

/-- The ordered state's clauses a commit's clause theorems read, from the settled state's: it differs from the settled
one in its journal, its emptied queues and its emptied transitions, and with the batches empty it queues nothing. -/
theorem ordered_facts {program : Program} {start state : State} (log : RunLog) (formed : WellFormed program state)
    (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = []) :
    OrderedFacts start (ordered log state) := by
  have quiet : allSignals (ordered log state) = [] ∧ allQueuedTokens (ordered log state) = [] := by
    simp [allSignals, allQueuedTokens, batches.1, batches.2.1]
  refine ⟨⟨counted.1, counted.2, counted.3⟩, ⟨formed.issued.1, formed.issued.2, formed.issued.3⟩,
    { occurrenceScopes := formed.owned.occurrenceScopes, itemScopes := formed.owned.itemScopes
      itemOccurrences := formed.owned.itemOccurrences, attachments := formed.owned.attachments
      scopeOwners := formed.owned.scopeOwners, variableScopes := formed.owned.variableScopes
      tokenScopes := fun _ member => by rw [quiet.2] at member; cases member },
    ⟨formed.rooted.1, formed.rooted.2.1,
      fun entry member => Within.congr (s := state) (t := ordered log state) rfl (formed.rooted.2.2 entry member)⟩,
    quiet.1, quiet.2⟩


end Kernel.Laws.Step
