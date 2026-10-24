module

public import BpmnSemantics.SemanticProcess.InternalRegionalTerminationPositionPublication
public import BpmnSemantics.SemanticProcess.InternalRegionalErrorPositionPublication
public import BpmnSemantics.SemanticProcess.InternalRegionalReturnPositionPublication
public import BpmnSemantics.SemanticProcess.InternalRegionalCompletionPositionPublication

/-! Complete regional preparation determines the actual public control-position delta.
Each family derives successor validity from the predecessor rather than assuming publication.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedRegional_position_delta (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (interruptionRooted : operationInterrupts operation = true → InvocationsInProcessRoots program)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ hosting after, before.control = .running hosting ∧
      applyPreparedInternalRegional? program before prepared = some after ∧
      controlPositionDelta? program hosting before after = some prepared.publicationTemplate.positionDelta := by
  cases operation with
  | returnProcess id origin process definition output data =>
      have empty := prepareInternalRegional_return_data_empty program before id origin process definition output data prepared found
      subst data
      exact preparedReturn_position_delta program before id origin process definition output prepared found
  | completeScope id origin definition output =>
      exact preparedComplete_position_delta program before id origin definition output prepared found
  | throwError id origin input error handler =>
      haveI := interruptionRooted rfl
      exact preparedError_position_delta program before id origin input error handler prepared found
  | terminateScope id origin input definition =>
      haveI := interruptionRooted rfl
      exact preparedTerminate_position_delta program before id origin input definition prepared found
  | _ =>
      have closedSelection := (prepareInternalRegional_facts program before _ prepared found).2.2.2.1
      have selected := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
      unfold selectInternalRegional? at selected
      obtain ⟨_, _, selected⟩ := Option.bind_eq_some_iff.mp selected
      contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
