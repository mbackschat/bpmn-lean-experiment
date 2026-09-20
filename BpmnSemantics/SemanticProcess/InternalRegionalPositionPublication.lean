import BpmnSemantics.SemanticProcess.InternalRegionalTerminationPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalErrorPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalReturnPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionPositionPublication

/-! Complete regional preparation determines the actual public control-position delta.
Each family derives successor validity from the predecessor rather than assuming publication.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedRegional_position_delta (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ hosting after, before.control = .running hosting ∧
      applyPreparedInternalRegional? program before prepared = some after ∧
      controlPositionDelta? program hosting before after = some prepared.publicationTemplate.positionDelta := by
  cases operation with
  | returnProcess id origin process definition output =>
      exact preparedReturn_position_delta program before id origin process definition output prepared found
  | completeScope id origin definition output =>
      exact preparedComplete_position_delta program before id origin definition output prepared found
  | throwError id origin input error handler =>
      exact preparedError_position_delta program before id origin input error handler prepared found
  | terminateScope id origin input definition =>
      exact preparedTerminate_position_delta program before id origin input definition prepared found
  | _ =>
      have closedSelection := (prepareInternalRegional_facts program before _ prepared found).2.2.2.1
      have selected := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
      unfold selectInternalRegional? at selected
      obtain ⟨_, _, selected⟩ := Option.bind_eq_some_iff.mp selected
      contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
