import BpmnSemantics.SemanticProcess.RuntimeState

/-! Public control-position values are independent of trace evaluation so predecessor preparation
can retain exact publication templates under the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Public multiplicity at one BPMN Sequence Flow and runtime scope occurrence. -/
structure PublicControlTokenPosition where
  sequenceFlowId : SequenceFlowId
  owner : ScopeOccurrenceId
  multiplicity : Nat
  deriving Repr, DecidableEq

/-- Public identity and parentage of one live runtime definition-scope occurrence. -/
structure PublicScopePosition where
  id : ScopeOccurrenceId
  parent : Option ScopeOccurrenceId
  bpmnElementId : NodeId
  deriving Repr, DecidableEq

/-- Complete public control position, independently projected from one RuntimeState. -/
structure PublicControlPosition where
  controlTokens : List PublicControlTokenPosition
  scopes : List PublicScopePosition
  deriving Repr, DecidableEq

/-- Exact public position change across one semantic transition. -/
structure PublicControlPositionDelta where
  consumedTokens : List PublicControlTokenPosition
  producedTokens : List PublicControlTokenPosition
  enteredScopes : List PublicScopePosition
  exitedScopes : List PublicScopePosition
  deriving Repr, DecidableEq

end BpmnSemantics.SemanticProcess
