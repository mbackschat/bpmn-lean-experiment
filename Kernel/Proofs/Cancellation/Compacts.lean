module

public import Kernel.Laws.Step.Compacted
public import Kernel.Laws.State.Committed

/-! # Cancellation's relation across compaction at commit (DC12)

The fields `ScopesKept` reads across `Step.orderJournal`'s compaction. `Kernel.Proofs.Cancellation` defines `ScopesKept` and proves its `Proofs.Frame.StepAlongside.runOrder` in one module, so this module imports neither it nor a feature (guard 15) and is imported by it.

The before-state is committed (`Laws.State.Committed`), so every key it holds is committed throughout and the commit's
renaming fixes it: a scope occurrence it held is issued after the commit, and one the committed state holds under its
key is its record, renamed onto itself.
-/

@[expose] public section

namespace Kernel.Laws.State

/-- **A committed state holds no pending activation** (KD5): the commit numbered every activation and resolved every
called instance's name, so publication reads committed numbers only. Its issue table is empty, which a pending
occurrence activation (`OccurrencesCounted`) or name (`IssuedBelow.names`) would have to be in. -/
theorem Committed.resolved {program : Program} {s : State} (committed : Committed s) (formed : WellFormed program s) :
    (∀ occurrence ∈ s.occurrences, occurrence.activation.isFresh = false) ∧
      ∀ scope ∈ s.scopes, ∀ name, scope.calledInstance = some name → name.unresolved = false := by
  refine ⟨fun occurrence member => ?_, fun scope member name called =>
    (formed.issued.names scope member name called).resolved_of_empty committed.issued⟩
  have counted := formed.occurrencesCounted occurrence member
  unfold Counted at counted
  split at counted
  · rename_i activation; simp [key] at activation; rw [activation]; exact isFresh_committed _
  · simp [committed.issued] at counted

end Kernel.Laws.State

namespace Kernel.Proofs.Cancellation

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State Kernel.Laws.Step

/-- **`ScopesKept before` across the commit** (discharges `scopesKept_stepAlongside`'s `runOrder`, both fields of
`ScopesKept`, stated over them): what the settled state kept of a committed, well-formed before-state's scope
occurrences, the committed state keeps. -/
theorem orderJournal_scopesKept {programBefore program : Program} {before start state : State} {log : RunLog}
    {after : State} (formedBefore : WellFormed programBefore before) (committed : Committed before)
    (formed : WellFormed program state)
    (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (kept : (∀ old ∈ before.scopes, ScopeIssued state old.id) ∧
      ∀ entry ∈ state.scopes, entry.id ∈ scopeIds before → entry ∈ before.scopes)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    (∀ old ∈ before.scopes, ScopeIssued after old.id) ∧
      ∀ entry ∈ after.scopes, entry.id ∈ scopeIds before → entry ∈ before.scopes := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted := facts.counted
  have rooted := facts.rooted
  have fixes : Fixes (commitRenaming schedule start log (ordered log state)) := renameBy_fixes _
  have fixed : ∀ old ∈ before.scopes, renameScope (commitRenaming schedule start log (ordered log state)) old.id = old.id :=
    fun old member => scope_fixed committed.issued (formedBefore.issued.scopes old member) fixes
  refine ⟨fun old member => ?_, fun entry member standing => ?_⟩
  · have issued := compact_scopeIssued ran counted rooted (kept.1 old member)
    rwa [fixed old member] at issued
  · obtain ⟨settled, inside, rfl⟩ := compact_scope_eq ran member
    obtain ⟨old, oldIn, oldId⟩ := List.mem_map.mp standing
    have same : old.id = settled.id := renameScope_apart counted rooted (kept.1 old oldIn) (List.mem_map_of_mem inside)
      (by rw [fixed old oldIn]; exact oldId)
    have held := kept.2 settled inside (by rw [← same]; exact List.mem_map_of_mem oldIn)
    have owner : settled.occurrence.map (renameId (commitRenaming schedule start log (ordered log state))) = settled.occurrence := by
      cases link : settled.occurrence with
      | none => rfl
      | some id =>
        obtain ⟨occurrence, present, named, -⟩ := formedBefore.owned.scopeOwners settled held id link
        rw [Option.map_some, id_fixed committed.issued (named ▸ formedBefore.issued.occurrences occurrence present) fixes]
    have position : commitRenaming schedule start log (ordered log state) settled.position = settled.position := by
      cases standing : settled.position with
      | committed n => exact fixes n
      | fresh unit index =>
        have tabled := formedBefore.issued.positions settled held unit index standing
        rw [committed.issued] at tabled
        simp at tabled
    have called : settled.calledInstance.map (·.rename (commitRenaming schedule start log (ordered log state))) =
        settled.calledInstance := by
      cases carried : settled.calledInstance with
      | none => rfl
      | some name =>
        rw [Option.map_some, rename_resolved _ ((committed.resolved formedBefore).2 settled held name carried)]
    rw [← same, fixed old oldIn, same, owner, position, called]
    exact held

end Kernel.Proofs.Cancellation
