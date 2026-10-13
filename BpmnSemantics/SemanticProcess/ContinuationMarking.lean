import BpmnSemantics.SemanticProcess.RuntimeState

/-! Blocked Task continuations and declared body ports support both MI execution accounts; enabled-token selection remains separate. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- PMIS-DATA-01 treats a blocked continuation and its emitted token as the same
owner/place marking; this proof abstraction does not assert token enabledness. -/
def continuationMarking (state : RuntimeState) (owner : ScopeOccurrenceId) (place : ControlPlaceId) : Nat :=
  (state.tokens.filter (fun token => token.owner == owner && token.placeId == place)).length +
    (state.waits.filter (fun wait => wait.owner == owner && wait.output == place)).length +
    (state.effectWaits.filter (fun wait => wait.owner == owner && wait.output == place)).length

def bodyConsumedPorts : SemanticOperation → List ControlPlaceId
  | .awaitUserTask _ _ input .. | .awaitEffect _ _ input ..
  | .enterSequentialMultiInstanceScope _ _ input .. | .enterParallelMultiInstanceScope _ _ input .. | .duplicate _ _ input _
  | .reachNoneEnd _ _ input => [input]
  | .synchronize _ _ places _ => places
  | _ => []

def bodyProducedPorts : SemanticOperation → List ControlPlaceId
  | .awaitUserTask _ _ _ output _ | .awaitEffect _ _ _ output .. |
    .synchronize _ _ _ output => [output]
  | .duplicate _ _ _ outputs => outputs
  | _ => []

def ownedPortCount (ports : List ControlPlaceId) (owner queried : ScopeOccurrenceId)
    (place : ControlPlaceId) : Nat :=
  (ports.filter (fun port => owner == queried && port == place)).length

end BpmnSemantics.SemanticProcess
