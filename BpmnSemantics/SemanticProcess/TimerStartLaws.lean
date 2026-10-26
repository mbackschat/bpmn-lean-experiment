module

public import BpmnSemantics.SemanticProcess.TimerStart
import BpmnSemantics.SemanticProcess.MessageStartLaws

/-! Timer initiation shares Message Start’s root-token fan-out law; the dispatcher retains only its executable relation bridge. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- From a fresh root control state, Timer initiation produces exactly one root-owned token for every output. -/
theorem timer_initiation_from_fresh_root_produces_each_output
    (state : RuntimeState) (owner : ScopeOccurrenceId)
    (outputs : List ControlPlaceId)
    (root : rootScopeOccurrence? state = some owner)
    (pending : state.initiationPending = true)
    (empty : state.tokens = []) :
    initiateTimerState? state outputs =
      some
        { state with
          initiationPending := false
          tokens := addTokens [] outputs owner } ∧
      ∀ query, ((addTokens [] outputs owner).filter
        fun token => decide (token.placeId = query)).length =
          (outputs.filter fun output => decide (output = query)).length := by
  exact message_initiation_from_fresh_root_produces_each_output
    state owner outputs root pending empty

end BpmnSemantics.SemanticProcess
