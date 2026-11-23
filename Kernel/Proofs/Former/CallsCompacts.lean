module

public import Kernel.Laws.Step.CompactedKeys

/-! # Call Activities' relation across compaction at commit (DC12)

The fields `CallsFormed` reads across `Step.orderJournal`'s compaction. `Kernel.Proofs.Former.Calls` defines `CallsFormed` and proves its `Proofs.Frame.StepAlongside.runOrder` in one module, so this module imports neither it nor a feature (guard 15) and is imported by it.

A commit renames a called root with its owner, and the owner keeps its element, role, activation and, renamed, the
scope occurrence it stands in, whose process instance stays (`Laws.Step.compact_instanceOf`); two owners the renaming
would merge are one (`Laws.Step.renamed_apart`).
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel Kernel.Step Kernel.Laws.State Kernel.Laws.Step

section Calls

variable {schedule : BranchSchedule} {program : Program} {start state : State} {log : RunLog} {after : State}

/-- A scope occurrence's owner the commit renames onto a standing occurrence's key is that occurrence's. -/
theorem owner_apart (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    {root : ScopeOccurrence} (member : root ∈ state.scopes) {owner : OccurrenceId} (link : root.occurrence = some owner)
    {occurrence : Occurrence} (present : occurrence ∈ state.occurrences)
    (same : renameId (commitRenaming schedule start log (ordered log state)) owner =
      renameId (commitRenaming schedule start log (ordered log state)) occurrence.id) : owner = occurrence.id := by
  have facts := ordered_facts log formed counted batches
  have counted := facts.counted
  have issued := facts.issued
  have owned := facts.owned
  have rooted := facts.rooted
  obtain ⟨holder, holderIn, named, -⟩ := formed.owned.scopeOwners root member owner link
  exact renamed_apart counted issued owned rooted keys (named ▸ issued.occurrences holder holderIn) present same

/-- `root`, owned by `call`, is the settled called root `old` owned by `owner`, under the commit's renaming `r`. -/
structure OwnerRenamed (state : State) (r : Issue → Issue) (old : ScopeOccurrence) (owner : Occurrence)
    (root : ScopeOccurrence) (call : Occurrence) : Prop where
  scopeIn : old ∈ state.scopes
  ownerIn : owner ∈ state.occurrences
  calledInstance : old.calledInstance = root.calledInstance
  link : old.occurrence = some owner.id
  element : call.element = owner.element
  role : call.role = owner.role
  activation : call.activation = owner.activation
  scope : call.scope = renameScope r owner.scope

/-- A called root the commit leaves, with an owner it leaves: the settled state's, renamed, with its owner's. -/
theorem compact_owner (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) {root : ScopeOccurrence} (member : root ∈ after.scopes)
    {call : Occurrence} (present : call ∈ after.occurrences) (link : root.occurrence = some call.id) :
    ∃ old owner, OwnerRenamed state (commitRenaming schedule start log (ordered log state)) old owner root call := by
  have ran := orderJournal_of made
  obtain ⟨old, inside, rfl⟩ := compact_scope_eq ran member
  obtain ⟨owner, ownerIn, mapped⟩ := compact_occurrence_of ran present
  obtain ⟨a, was, same⟩ := Option.map_eq_some_iff.mp link
  rw [mapped.id] at same
  have apart := owner_apart formed counted batches keys inside was ownerIn same
  refine ⟨old, owner,
    { scopeIn := inside, ownerIn, calledInstance := rfl, link := ?_, element := mapped.element, role := mapped.role
      activation := mapped.activation, scope := mapped.scope }⟩
  rw [was, apart]

/-- **`CallsFormed.named` across the commit** (`Named`, stated over its body): a called root is named by its owner,
whose process instance, element and activation the commit keeps. -/
theorem orderJournal_named (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (named : ∀ root ∈ state.scopes, root.calledInstance.isSome → root.occurrence.isSome ∧ ∀ call ∈ state.occurrences,
      root.occurrence = some call.id → root.calledInstance =
        some (State.calledInstanceId (state.instanceOf call.scope) (program.publicId call.element) call.activation))
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ∀ root ∈ after.scopes, root.calledInstance.isSome → root.occurrence.isSome ∧ ∀ call ∈ after.occurrences,
      root.occurrence = some call.id → root.calledInstance =
        some (State.calledInstanceId (after.instanceOf call.scope) (program.publicId call.element) call.activation) := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted' := facts.counted
  have issued := facts.issued
  have owned := facts.owned
  have rooted := facts.rooted
  intro root member called
  refine ⟨?_, fun call present link => ?_⟩
  · obtain ⟨old, inside, rfl⟩ := compact_scope_eq ran member
    simpa using (named old inside called).1
  · obtain ⟨old, owner, renamed⟩ := compact_owner formed counted batches keys made member present link
    rw [← renamed.calledInstance, (named old renamed.scopeIn (renamed.calledInstance ▸ called)).2 owner renamed.ownerIn
      renamed.link, renamed.element, renamed.activation, renamed.scope,
      compact_instanceOf ran counted' formed rfl rfl issued rooted formed.distinct.scopes
        (formed.owned.occurrenceScopes owner renamed.ownerIn),
      instanceOf_congr (s := state) (t := ordered log state) rfl rfl]

/-- **`CallsFormed.roled` across the commit** (`Roled`, stated over its body). -/
theorem orderJournal_roled (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (roled : ∀ root ∈ state.scopes, root.calledInstance.isSome → ∀ call ∈ state.occurrences,
      root.occurrence = some call.id → call.role = .element)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ∀ root ∈ after.scopes, root.calledInstance.isSome → ∀ call ∈ after.occurrences,
      root.occurrence = some call.id → call.role = .element := by
  intro root member called call present link
  obtain ⟨old, owner, renamed⟩ := compact_owner formed counted batches keys made member present link
  rw [renamed.role]
  exact roled old renamed.scopeIn (renamed.calledInstance ▸ called) owner renamed.ownerIn renamed.link

/-- **`CallsFormed.activities` across the commit** (`ActivityOwners`, stated over its body). -/
theorem orderJournal_activities (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (activities : ∀ root ∈ state.scopes, root.calledInstance.isSome → ∀ call ∈ state.occurrences,
      root.occurrence = some call.id → ((program.element? call.element).bind (·.activity?)).isSome)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ∀ root ∈ after.scopes, root.calledInstance.isSome → ∀ call ∈ after.occurrences,
      root.occurrence = some call.id → ((program.element? call.element).bind (·.activity?)).isSome := by
  intro root member called call present link
  obtain ⟨old, owner, renamed⟩ := compact_owner formed counted batches keys made member present link
  rw [renamed.element]
  exact activities old renamed.scopeIn (renamed.calledInstance ▸ called) owner renamed.ownerIn renamed.link

/-- **`CallsFormed.ownersApart` across the commit** (`OwnersApart`, stated over its body): two called roots' owners the
renaming would merge are one, so the roots were one. -/
theorem orderJournal_ownersApart (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (apart : ∀ first ∈ state.scopes, ∀ second ∈ state.scopes, first.calledInstance.isSome →
      second.calledInstance.isSome → first.occurrence = second.occurrence → first.id = second.id)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    ∀ first ∈ after.scopes, ∀ second ∈ after.scopes, first.calledInstance.isSome →
      second.calledInstance.isSome → first.occurrence = second.occurrence → first.id = second.id := by
  have ran := orderJournal_of made
  intro first firstIn second secondIn firstCalled secondCalled same
  obtain ⟨one, oneIn, rfl⟩ := compact_scope_eq ran firstIn
  obtain ⟨two, twoIn, rfl⟩ := compact_scope_eq ran secondIn
  have owners : one.occurrence = two.occurrence := by
    cases oneLink : one.occurrence with
    | none =>
      cases twoLink : two.occurrence with
      | none => rfl
      | some b => simp [oneLink, twoLink] at same
    | some a =>
      cases twoLink : two.occurrence with
      | none => simp [oneLink, twoLink] at same
      | some b =>
        simp only [oneLink, twoLink, Option.map_some, Option.some.injEq] at same
        obtain ⟨holder, holderIn, named, -⟩ := formed.owned.scopeOwners two twoIn b twoLink
        rw [← named] at same ⊢
        rw [owner_apart formed counted batches keys oneIn oneLink holderIn same]
  change renameScope _ one.id = renameScope _ two.id
  rw [apart one oneIn two twoIn firstCalled secondCalled owners]

end Calls

end Kernel.Proofs.Former
