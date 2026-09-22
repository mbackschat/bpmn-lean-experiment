import BpmnSemantics.SemanticProcess.InternalPreparedTransition

/-! The [complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#explicit-observable-choice)
normalizes only singleton operations independent of every alternative. Presentation order supplies no choice.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def normalizingInternalPrepared (members : List PreparedInternalTransition) : List PreparedInternalTransition :=
  members.filter fun candidate => members.all fun other => decide
    (candidate.alternative = other.alternative ∨
      (candidate.operation.id ≠ other.operation.id ∧ candidate.Independent other))

theorem mem_normalizingInternalPrepared (members : List PreparedInternalTransition) (candidate : PreparedInternalTransition) :
    candidate ∈ normalizingInternalPrepared members ↔
      candidate ∈ members ∧ ∀ other ∈ members,
        candidate.alternative = other.alternative ∨
          (candidate.operation.id ≠ other.operation.id ∧ candidate.Independent other) := by
  simp [normalizingInternalPrepared, List.all_eq_true]

/-- Singleton-operation membership and universal separation supply every pair law's premises. -/
theorem normalizingInternalPrepared_pairwise (members : List PreparedInternalTransition)
    (distinct : members.Pairwise (fun left right => left.alternative ≠ right.alternative)) :
    (normalizingInternalPrepared members).Pairwise
      (fun left right => left.operation.id ≠ right.operation.id ∧ left.Independent right) := by
  have kept : (normalizingInternalPrepared members).Pairwise
      (fun left right => left.alternative ≠ right.alternative) := distinct.filter _
  apply List.Pairwise.imp_of_mem _ kept
  intro left right leftPresent rightPresent different
  have allOthers := (mem_normalizingInternalPrepared members left).mp leftPresent
  have rightMember := ((mem_normalizingInternalPrepared members right).mp rightPresent).1
  exact (allOthers.2 right rightMember).resolve_left different

inductive PreparedInternalFrontier where
  | stable
  | independentBatch (members : List PreparedInternalTransition)
  | observableChoice (members : List PreparedInternalTransition)
  deriving Repr, DecidableEq

def classifyPreparedInternalFrontier (prepared : List PreparedInternalTransition) : Option PreparedInternalFrontier :=
  let members := sortBy (fun left right => internalAlternativeBefore left.alternative right.alternative) prepared
  if members.Pairwise (fun left right => left.alternative ≠ right.alternative) then
    if members.isEmpty then some .stable
    else
      let independent := normalizingInternalPrepared members
      if independent.isEmpty then some (.observableChoice members)
      else some (.independentBatch independent)
  else none

/-- A classified batch contains original complete offers and is independent of every different offer,
including offers left behind because their operation has several alternatives. -/
theorem classifyPreparedInternalFrontier_batch (prepared selected : List PreparedInternalTransition)
    (found : classifyPreparedInternalFrontier prepared = some (.independentBatch selected)) :
    selected ≠ [] ∧
      selected.Pairwise (fun left right => left.operation.id ≠ right.operation.id ∧ left.Independent right) ∧
      ∀ candidate ∈ selected, candidate ∈ prepared ∧
        ∀ other ∈ prepared, candidate.alternative ≠ other.alternative →
          candidate.operation.id ≠ other.operation.id ∧ candidate.Independent other := by
  unfold classifyPreparedInternalFrontier at found
  dsimp only at found
  split at found
  · rename_i distinct
    split at found
    · simp at found
    · split at found
      · simp at found
      · rename_i nonempty
        cases found
        refine ⟨by simpa using nonempty, normalizingInternalPrepared_pairwise _ distinct, ?_⟩
        intro candidate member
        have facts := (mem_normalizingInternalPrepared _ candidate).mp member
        refine ⟨(mem_sortBy _ _ _).mp facts.1, ?_⟩
        intro other present different
        exact (facts.2 other ((mem_sortBy _ _ _).mpr present)).resolve_left different
  · simp at found

end BpmnSemantics.SemanticProcess.InternalCommutation
