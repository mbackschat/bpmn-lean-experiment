module

public import BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration

/-! PMIS-END-01 binds each parallel body completion to one immutable entry and forbids competing source identities. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess
open BpmnSemantics

/-- PMIS-END-01 keeps the continuation on the entry; completion carries only its binding. -/
def parallelScopeContinuation? (operations : List SemanticOperation)
    (entryId : OperationId) : Option ControlPlaceId :=
  operations.findSome? fun
    | .enterParallelMultiInstanceScope id _ _ _ _ output _ _ _ _ =>
        if id == entryId then some output else none
    | _ => none

/-- Each repeated body has exactly one completion with the same source Activity and child owner. -/
def parallelScopeOperationsPaired (program : Program) : Bool :=
  let entries := program.operations.filter fun
    | .enterParallelMultiInstanceScope .. => true | _ => false
  let completions := program.operations.filter fun
    | .completeParallelMultiInstanceScope .. => true | _ => false
  entries.length == completions.length && entries.all fun
    | .enterParallelMultiInstanceScope id origin _ _ childScopeId _ _ _ _ _ =>
        (program.operations.all fun operation =>
          operation.origin.elementId != origin.elementId ||
          match operation with
          | .enterParallelMultiInstanceScope entryId .. => entryId == id
          | .completeParallelMultiInstanceScope _ _ entryId => entryId == id
          | _ => false) &&
        (completions.filter fun
          | .completeParallelMultiInstanceScope completionId completionOrigin entryId =>
              entryId == id && completionOrigin == origin &&
                operationScope? program completionId == some childScopeId
          | _ => false).length == 1
    | _ => false

def parallelScopeOperationWellFormed (program : Program) : SemanticOperation → Bool
  | .enterParallelMultiInstanceScope id origin input childEntry childScope output collection item mappings condition =>
      !id.value.isEmpty && !origin.elementId.value.isEmpty &&
      (program.definitionScopes.any (·.id == childScope)) &&
      ([input, childEntry, output].eraseDups.length == 3) &&
      ([input, childEntry, output].all fun id => program.controlPlaces.any (·.id == id)) &&
      SerialBusinessTask.identifier collection && SerialBusinessTask.identifier item &&
      condition.all SerialBusinessTask.identifier && SequentialScopeData.bodyMappingsValid [] mappings
  | .completeParallelMultiInstanceScope id origin entry =>
      !id.value.isEmpty && !origin.elementId.value.isEmpty && !entry.value.isEmpty
  | _ => false

end BpmnSemantics.SemanticProcess
