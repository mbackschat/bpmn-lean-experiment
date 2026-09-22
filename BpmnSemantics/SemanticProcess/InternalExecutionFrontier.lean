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
  deriving Repr

private def ordinaryExecutionFrontier (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : InternalExecutionFrontier :=
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

private def mergeExecutionFrontier (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : InternalExecutionFrontier :=
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
        { offers := frontier.offers ++ next.offers
          preparationFailed := frontier.preparationFailed || next.preparationFailed }) ({} : InternalExecutionFrontier)
      let offers := sortBy (fun left right => internalAlternativeBefore left.alternative right.alternative) discovered.offers
      { offers
        preparationFailed := discovered.preparationFailed ||
          !decide (offers.Pairwise (fun left right => left.alternative ≠ right.alternative)) }

def findInternalExecutionOffer? (frontier : InternalExecutionFrontier) (alternative : InternalAlternative) :
    Option InternalExecutionOffer :=
  frontier.offers.find? (fun offer => offer.alternative == alternative)

end BpmnSemantics.SemanticProcess.InternalCommutation
