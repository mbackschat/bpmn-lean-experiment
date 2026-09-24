import BpmnSemantics.SemanticProcess.InternalRegionalDependencies
import BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention

/-! # Regional predecessor footprints

The selected Internal Commutation account protects region membership, continuation buckets,
global population censuses, bounded deadlines, and every actually withdrawn Activity association.
No successor state supplies a dependency.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def regionalWithdrawnActivityWrites (state : RuntimeState) (selected : InternalRegionalSelection) :
    List InternalRegionalStateAtom :=
  (state.activityOccurrences.filter (fun record =>
    !(regionalSelectionReferenceRetention state selected).activity record)).map .activityAssociation

/-- REG-OWN-FRAME-01 protects shared removal through either an Activity's owner or child body. -/
theorem regionalWithdrawnActivityWrites_contains (state : RuntimeState) (selected : InternalRegionalSelection)
    (record : ActivityOccurrence) (member : record ∈ state.activityOccurrences)
    (removed : (regionalSelectionReferenceRetention state selected).activity record = false) :
    .activityAssociation record ∈ regionalWithdrawnActivityWrites state selected := by
  apply List.mem_map.mpr
  exact ⟨record, List.mem_filter.mpr ⟨member, by simp [removed]⟩, rfl⟩

def regionalCensusWrites (state : RuntimeState) (region : InternalOccurrenceRegion)
    (outputs : List ControlPlaceId) : List InternalRegionalStateAtom :=
  (state.tokens.filter (fun token => region.contains token.owner)).map (fun token =>
    .ordinary (.tokenOwners token.placeId)) ++
  outputs.map (fun output => .ordinary (.tokenOwners output)) ++
  (state.selectedBranchSets.filter (fun record => region.contains record.owner)).map (fun record =>
    .ordinary (.selectedBranchOwners record.selectionKey))

private def boundedWithdrawalAtoms : InternalCompletionWithdrawal → List InternalRegionalStateAtom
  | .unbounded => []
  | .bounded record deadline =>
      [.activityAssociation record,
        .owned (.wait .timer (timerWaitOccurrence deadline)) deadline.owner,
        .owned (.openWaitAnchor (timerWaitOccurrence deadline)) deadline.owner]
  | .monitored record none => [.activityAssociation record]
  | .monitored record (some deadline) =>
      [.activityAssociation record,
        .owned (.wait .timer (timerWaitOccurrence deadline)) deadline.owner,
        .owned (.openWaitAnchor (timerWaitOccurrence deadline)) deadline.owner]

def regionalBaseFootprint? (state : RuntimeState) (hosting : SemanticId)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion) : Option InternalRegionalStateFootprint :=
  let owner := selected.root.id
  let regionAtom := InternalRegionalStateAtom.occurrenceRegion region
  let base := [InternalRegionalStateAtom.ordinary (.runtimeControl hosting),
    .ordinary (.scopeOccurrence owner), .ordinary (.scopeParent owner selected.root.parent),
    .ordinary .logicalTime, regionAtom]
  match selected.operation, selected.kind with
  | .returnProcess _ _ _ _ output, .returning record =>
      let association := InternalRegionalStateAtom.ordinary (.callAssociation record)
      let continuation := InternalRegionalStateAtom.ordinary (.controlToken record.caller output)
      some
        { reads := base ++ [.ordinary (.scopeOccurrence record.caller), association, continuation]
          writes := regionalCensusWrites state region [output] ++ [regionAtom, association, continuation] }
  | .completeScope _ _ _ output, .completing withdrawal =>
      let boundary := boundedWithdrawalAtoms withdrawal
      match selected.root.parent, output with
      | none, none => some
          { reads := base ++ [.initiationPending] ++ boundary
            writes := [regionAtom, .ordinary (.runtimeControl hosting)] ++ boundary }
      | some parent, some output =>
          let continuation := InternalRegionalStateAtom.ordinary (.controlToken parent output)
          some
            { reads := base ++ [.ordinary (.scopeOccurrence parent), continuation] ++ boundary
              writes := [regionAtom, continuation, .ordinary (.tokenOwners output)] ++ boundary }
      | _, _ => none
  | .throwError _ _ input _ handler, .interrupting parent =>
      let consumed := InternalRegionalStateAtom.ordinary (.controlToken owner input)
      let continuation := InternalRegionalStateAtom.ordinary (.controlToken parent handler.output)
      some
        { reads := base ++ [.ordinary (.tokenOwners input), consumed,
            .ordinary (.scopeOccurrence parent), continuation]
          writes := regionalCensusWrites state region [handler.output] ++ [regionAtom, consumed, continuation] }
  | .terminateScope _ _ input _, .terminating =>
      let consumed := InternalRegionalStateAtom.ordinary (.controlToken owner input)
      some
        { reads := base ++ [.ordinary (.tokenOwners input), consumed, .endIncrement]
          writes := regionalCensusWrites state region [] ++ [regionAtom, consumed, .endIncrement] }
  | _, _ => none

/-- Shared Activity withdrawals are added for every family before canonicalization, because
owner and child-body removal can reach the same record from otherwise disjoint regions. -/
def regionalStateFootprint? (state : RuntimeState) (selected : InternalRegionalSelection)
    (region : InternalOccurrenceRegion) : Option InternalRegionalStateFootprint := do
  let hosting ← runningInstance? state
  let base ← regionalBaseFootprint? state hosting selected region
  pure
    { reads := canonicalRegionalStateAtoms base.reads
      writes := canonicalRegionalStateAtoms (base.writes ++ regionalWithdrawnActivityWrites state selected) }

/-- Every predecessor-selected regional operation has a footprint; the dependency classifier
cannot silently disable one of the selected Return, Complete, Error, or Terminate branches. -/
theorem regionalSelection_has_footprint (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (found : selectInternalRegional? program state operation = some selected) :
    ∃ footprint, regionalStateFootprint? state selected region = some footprint := by
  obtain ⟨hosting, running⟩ := regionalSelection_running program state operation selected found
  simp only [regionalStateFootprint?, runningInstance?, running, Option.bind_eq_bind, Option.bind_some]
  unfold selectInternalRegional? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals
    dsimp only at found
    repeat' first
      | (solve | simp at found)
      | (solve | cases found; simp_all [regionalBaseFootprint?])
      | split at found
      | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found

theorem regionalStateFootprint_protects_withdrawn_activity (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion) (footprint : InternalRegionalStateFootprint)
    (record : ActivityOccurrence) (member : record ∈ state.activityOccurrences)
    (removed : (regionalSelectionReferenceRetention state selected).activity record = false)
    (found : regionalStateFootprint? state selected region = some footprint) :
    .activityAssociation record ∈ footprint.writes := by
  unfold regionalStateFootprint? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨base, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  apply (canonicalRegionalStateAtoms_mem _ _).mpr
  exact List.mem_append_right _ (regionalWithdrawnActivityWrites_contains state selected record member removed)

/-- A region's removed tokens and newly emitted continuations both change place-wide owner selection. -/
theorem regionalCensusWrites_contains_removed_token (state : RuntimeState) (region : InternalOccurrenceRegion)
    (outputs : List ControlPlaceId) (token : ControlToken) (member : token ∈ state.tokens)
    (inside : region.contains token.owner = true) :
    .ordinary (.tokenOwners token.placeId) ∈ regionalCensusWrites state region outputs := by
  simp only [regionalCensusWrites, List.mem_append, List.mem_map]
  exact Or.inl (Or.inl ⟨token, List.mem_filter.mpr ⟨member, inside⟩, rfl⟩)

theorem regionalCensusWrites_contains_continuation (state : RuntimeState) (region : InternalOccurrenceRegion)
    (outputs : List ControlPlaceId) (output : ControlPlaceId) (member : output ∈ outputs) :
    .ordinary (.tokenOwners output) ∈ regionalCensusWrites state region outputs := by
  simp only [regionalCensusWrites, List.mem_append, List.mem_map]
  exact Or.inl (Or.inr ⟨output, member, rfl⟩)

theorem regionalCensusWrites_contains_removed_selection (state : RuntimeState) (region : InternalOccurrenceRegion)
    (outputs : List ControlPlaceId) (record : SelectedBranchSet) (member : record ∈ state.selectedBranchSets)
    (inside : region.contains record.owner = true) :
    .ordinary (.selectedBranchOwners record.selectionKey) ∈ regionalCensusWrites state region outputs := by
  simp only [regionalCensusWrites, List.mem_append, List.mem_map]
  exact Or.inr ⟨record, List.mem_filter.mpr ⟨member, inside⟩, rfl⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
