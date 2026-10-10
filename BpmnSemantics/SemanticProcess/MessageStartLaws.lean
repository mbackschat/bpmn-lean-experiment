import BpmnSemantics.SemanticProcess.MessageStart
import BpmnSemantics.SemanticProcess.TokenStorage

/-! Fresh-root Message initiation produces exactly the declared output-token multiplicities. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- From a fresh root control state, Message initiation produces exactly one root-owned token for each listed output. -/
theorem message_initiation_from_fresh_root_produces_each_output
    (state : RuntimeState) (owner : ScopeOccurrenceId)
    (outputs : List ControlPlaceId)
    (root : rootScopeOccurrence? state = some owner)
    (pending : state.initiationPending = true)
    (empty : state.tokens = []) :
    initiateMessageState? state outputs =
      some
        { state with
          initiationPending := false
          tokens := addTokens [] outputs owner } ∧
      ∀ query, ((addTokens [] outputs owner).filter
        fun token => decide (token.placeId = query)).length =
          (outputs.filter fun output => decide (output = query)).length := by
  constructor
  · simp [initiateMessageState?, initiateTriggeredStartState?, root, pending, empty]
  · intro query
    simpa using addTokens_place_multiplicity [] outputs owner query

/-- One-output Message initiation is the exact singleton specialization of the generic fan-out. -/
theorem message_initiation_one_output_corollary
    (state : RuntimeState) (owner : ScopeOccurrenceId)
    (output : ControlPlaceId)
    (root : rootScopeOccurrence? state = some owner)
    (pending : state.initiationPending = true)
    (empty : state.tokens = []) :
    initiateMessageState? state [output] =
      some
        { state with
          initiationPending := false
          tokens := [{ placeId := output, owner }] } := by
  simpa [addTokens, addToken, canonicalInsertBy] using
    (message_initiation_from_fresh_root_produces_each_output
      state owner [output] root pending empty).1

end BpmnSemantics.SemanticProcess
