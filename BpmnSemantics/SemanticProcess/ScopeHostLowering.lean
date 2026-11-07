module

public import BpmnSemantics.SemanticProcess.LoweringIdentity
public import BpmnSemantics.SemanticProcessContract

/-! # Scope host lowering

SCPH-ONE-01 of the [scope host proposal](../../docs/capsules/SCOPE-HOST-FLOW-LISTS-PROPOSAL.md#lowering): a None Start or
embedded Sub-Process lowers to a scope host or exit exactly when it has the several-flow form, so `Lowering` dispatches
here only for a splitting root Start, a Sub-Process whose body Start splits and a splitting Sub-Process's completion;
every one-flow node keeps its legacy lowering. Place lists are in canonical order, as flow lists are (SCPH-HOST-01). The
entry readers every scope entry shares stay in `CheckedGraphValidation` and `Lowering`, which consumers that reduce a
lowering already open, so a non-splitting lowering never unfolds this module. Transcribed independently by the
TypeScript `scope-host-lowering` module.
-/

public section

namespace BpmnSemantics.SemanticProcess

/-- A splitting root None Start: the Process initiation over every outgoing place. -/
def lowerProcessHost (id : NodeId) (outgoing : List ControlPlaceId) : SemanticOperation :=
  .scope { id := nodeOperationId id, origin := { elementId := id }, inputs := [],
           entries := outgoing.map ({ place := · }), work := .process }

/-- A Sub-Process whose body None Start splits: the scope entry over every outgoing place of that Start. -/
def lowerSubProcessHost (id : NodeId) (input : ControlPlaceId) (entries : List ControlPlaceId)
    (child : DefinitionScopeId) : SemanticOperation :=
  .scope { id := nodeOperationId id, origin := { elementId := id }, inputs := [input],
           entries := entries.map ({ place := · }), work := .subProcess child }

/-- A splitting Sub-Process's completion onto every outgoing place, under the legacy completion's identity. -/
def lowerScopeExit (scope : DefinitionScope) (outputs : List ControlPlaceId) : SemanticOperation :=
  .scopeExit { id := ⟨"operation:complete-scope:" ++ scope.id.value⟩, origin := { elementId := scope.originElementId },
               scopeId := scope.id, outputs := outputs.map ({ place := · }) }

end BpmnSemantics.SemanticProcess
