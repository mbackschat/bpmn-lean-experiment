import BpmnSemantics.SemanticProcess.InternalPreparedFrontier

/-! Discovery retains every exact Merge offer before classification under the
[complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome).
Families outside the prepared account retain their existing singleton evaluator path.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

structure InternalExecutionOffer where
  alternative : InternalAlternative
  operation : SemanticOperation
  successor : RuntimeState
  preparation : Option PreparedInternalTransition
  deriving Repr

structure InternalExecutionFrontier where
  offers : List InternalExecutionOffer := []
  preparationFailed : Bool := false
  occurrenceBatch : Option InternalOccurrenceArmingBatch := none
  deriving Repr

def ordinaryExecutionFrontier (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : InternalExecutionFrontier :=
  if program.identity.semanticProfile.value == "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" then
    match internalOperationOccurrenceOffers? program state operation with
    | none => { preparationFailed := true }
    | some candidates => { offers := candidates.map fun (candidate, successor) =>
        { alternative := .operationOccurrence candidate.operationId candidate.owner,
          operation, successor, preparation := none } }
  else
  -- The approved ordinary-End account retains the single-unit selector. Its broader raw
  -- relation must not bypass that executable restriction when preparation is unavailable.
  let selected := match operation with
    | .reachNoneEnd .. => (selectInternalEnd? state operation).isSome
    | _ => true
  if !selected then {} else
  match fire? program operation state with
  | none => {}
  | some successor =>
      { offers := [{ alternative := .operation operation.id, operation, successor
                     preparation := prepareInternalTransition? program state operation }] }

def mergeExecutionFrontier (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : InternalExecutionFrontier :=
  if program.identity.semanticProfile.value == "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" then
    { preparationFailed := true }
  else
  let alternatives := internalMergeInputAlternatives state operation
  let prepared := alternatives.mapM fun alternative => do
    let merge ← prepareInternalMerge? program state operation alternative
    let member := PreparedInternalTransition.mergeInput merge
    let successor ← applyPreparedInternalTransition? program state member
    pure ({ alternative, operation, successor, preparation := some member } : InternalExecutionOffer)
  match prepared with
  | some offers => { offers }
  | none =>
      match program.compensationEventSubProcessSnapshots, alternatives, fire? program operation state with
      | some _, [alternative], some successor =>
          { offers := [{ alternative, operation, successor, preparation := none }] }
      | _, _, _ => { preparationFailed := true }

def deriveInternalExecutionFrontier (program : Program) (state : RuntimeState) : InternalExecutionFrontier :=
  match state.control with
  | .cancelled _ | .failed .. => {}
  | _ =>
      let discovered := program.operations.foldl (fun frontier operation =>
        let next := match operation, state.control with
          | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
          | _, _ => ordinaryExecutionFrontier program state operation
        { frontier with
          offers := frontier.offers ++ next.offers
          preparationFailed := frontier.preparationFailed || next.preparationFailed }) ({} : InternalExecutionFrontier)
      let offers := sortBy (fun left right => internalAlternativeBefore left.alternative right.alternative) discovered.offers
      { offers
        occurrenceBatch := if offers.length < 2 || discovered.preparationFailed then none
          else prepareInternalOccurrenceArmingBatch? program state
        preparationFailed := discovered.preparationFailed ||
          !decide (offers.Pairwise (fun left right => left.alternative ≠ right.alternative)) }

def findInternalExecutionOffer? (frontier : InternalExecutionFrontier) (alternative : InternalAlternative) :
    Option InternalExecutionOffer :=
  frontier.offers.find? (fun offer => offer.alternative == alternative)

private theorem fold_empty_discoveries (operations : List SemanticOperation)
    (next : SemanticOperation → InternalExecutionFrontier)
    (empty : ∀ operation ∈ operations, next operation = {}) (initial : InternalExecutionFrontier) :
    operations.foldl (fun frontier operation =>
      { frontier with
        offers := frontier.offers ++ (next operation).offers
        preparationFailed := frontier.preparationFailed || (next operation).preparationFailed }) initial = initial := by
  induction operations generalizing initial with
  | nil => rfl
  | cons operation rest ih =>
    simp only [List.foldl_cons, empty operation (by simp), List.append_nil, Bool.or_false]
    exact ih (fun candidate member => empty candidate (List.mem_cons_of_mem _ member)) initial

/-- Empty per-operation discovery cannot acquire offers or a preparation failure in aggregation. -/
theorem deriveInternalExecutionFrontier_empty (program : Program) (state : RuntimeState)
    (empty : ∀ operation ∈ program.operations,
      (match operation, state.control with
        | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
        | _, _ => ordinaryExecutionFrontier program state operation) = {}) :
    deriveInternalExecutionFrontier program state = {} := by
  unfold deriveInternalExecutionFrontier
  split
  · rfl
  · rfl
  · dsimp only
    rw [fold_empty_discoveries _ _ empty]
    rfl

/-- Unique declaration membership is necessary: discovering the same singleton twice must still fail the duplicate-alternative check. -/
theorem deriveInternalExecutionFrontier_singleton (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (offer : InternalExecutionOffer)
    (active : (match state.control with | .cancelled _ | .failed .. => false | _ => true) = true)
    (unique : program.operations.Nodup) (member : operation ∈ program.operations)
    (selected : (match operation, state.control with
      | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
      | _, _ => ordinaryExecutionFrontier program state operation) = { offers := [offer] })
    (empty : ∀ candidate ∈ program.operations, candidate ≠ operation →
      (match candidate, state.control with
        | .mergeExclusive .., .running _ => mergeExecutionFrontier program state candidate
        | _, _ => ordinaryExecutionFrontier program state candidate) = {}) :
    deriveInternalExecutionFrontier program state = { offers := [offer] } := by
  let next := fun (candidate : SemanticOperation) => match candidate, state.control with
    | .mergeExclusive .., .running _ => mergeExecutionFrontier program state candidate
    | _, _ => ordinaryExecutionFrontier program state candidate
  obtain ⟨beforeOps, afterOps, splitList⟩ := List.mem_iff_append.mp member
  rw [splitList] at unique
  obtain ⟨_, afterOpsUnique, separated⟩ := List.nodup_append.mp unique
  have beforeOpsEmpty : ∀ candidate ∈ beforeOps, next candidate = {} := by
    intro candidate present
    exact empty candidate (by rw [splitList]; simp [present])
      (separated candidate present operation (by simp))
  have afterOpsEmpty : ∀ candidate ∈ afterOps, next candidate = {} := by
    intro candidate present
    exact empty candidate (by rw [splitList]; simp [present])
      (fun same => (List.nodup_cons.mp afterOpsUnique).1 (same ▸ present))
  have folded : program.operations.foldl (fun frontier candidate =>
      { frontier with
        offers := frontier.offers ++ (next candidate).offers
        preparationFailed := frontier.preparationFailed || (next candidate).preparationFailed })
      ({} : InternalExecutionFrontier) = { offers := [offer] } := by
    rw [splitList, List.foldl_append, fold_empty_discoveries _ _ beforeOpsEmpty, List.foldl_cons]
    change afterOps.foldl _ ({ offers := (next operation).offers, preparationFailed := (next operation).preparationFailed } : InternalExecutionFrontier) = _
    rw [fold_empty_discoveries _ _ afterOpsEmpty]
    simp only [show next operation = { offers := [offer] } from selected]
  unfold deriveInternalExecutionFrontier
  split
  · cases state.control <;> simp_all
  · cases state.control <;> simp_all
  · dsimp only
    rw [folded]
    rfl

end BpmnSemantics.SemanticProcess.InternalCommutation
