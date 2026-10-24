module

public import BpmnSemantics.SemanticProcess.RuntimeState

/-! Token-producing local control requires finite removal/insertion laws over exact canonical storage.
The patch retains token units rather than a successor collection, preserving unrelated multiplicity.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

structure TokenPatch where
  owner : ScopeOccurrenceId
  consumed : List ControlPlaceId
  produced : List ControlPlaceId
  deriving Repr, DecidableEq

def TokenPatch.apply (tokens : List ControlToken) (patch : TokenPatch) : List ControlToken :=
  addTokens (removeTokens tokens patch.consumed patch.owner) patch.produced patch.owner


end BpmnSemantics.SemanticProcess
