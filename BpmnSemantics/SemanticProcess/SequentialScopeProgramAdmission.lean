import BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission
import BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission

/-! SMIS-ADMIT-01 selects the complete mixed-body contract; generic graph validation remains a separate admission conjunct. -/

namespace BpmnSemantics.SemanticProcess.SequentialScopeProgram

/-- SMIS-ADMIT-01 validates typed operation payloads before the full ownership and data checks. -/
def operationWellFormed (program : Program) : SemanticOperation → Bool
  | .enterSequentialMultiInstanceScope id origin input childEntry childScope output collection item mappings condition =>
      !id.value.isEmpty && !origin.elementId.value.isEmpty &&
      (program.definitionScopes.any (·.id == childScope)) &&
      ([input, childEntry, output].eraseDups.length == 3) &&
      ([input, childEntry, output].all fun id => program.controlPlaces.any (·.id == id)) &&
      SerialBusinessTask.identifier collection && SerialBusinessTask.identifier item &&
      condition.all SerialBusinessTask.identifier && SequentialScopeData.bodyMappingsValid [] mappings
  | .completeSequentialMultiInstanceScope id origin entry =>
      !id.value.isEmpty && !origin.elementId.value.isEmpty && !entry.value.isEmpty
  | _ => false

def operationAllowed : SemanticOperation → Bool
  | .initiate .. | .enterSequentialMultiInstanceScope ..
  | .completeSequentialMultiInstanceScope .. | .reachNoneEnd ..
  | .duplicate .. | .synchronize .. => true
  | .completeScope _ _ _ output => output.isNone
  | .awaitUserTask _ origin _ _ task =>
      task.metadata.isNone && task.id.value == origin.elementId.value
  | .awaitEffect _ origin _ _ effect route =>
      route.isNone && effect.elementId == origin.elementId
  | _ => false

/-- Completion operations reuse their owning source element; every other admitted operation owns a distinct source node. -/
def sourceNode? : SemanticOperation → Option String
  | .initiate _ origin _ | .enterSequentialMultiInstanceScope _ origin ..
  | .reachNoneEnd _ origin _ | .duplicate _ origin .. | .synchronize _ origin ..
  | .awaitUserTask _ origin .. | .awaitEffect _ origin .. => some origin.elementId.value
  | _ => none

def admitted (program : Program) : Bool :=
  program.identity.sourceOverlay.isSome && program.operations.all operationAllowed &&
  match SequentialScopeControl.analyze program with
  | none => false
  | some control =>
      (SequentialScopeData.requirements program).isSome &&
      let child := program.operations.filter fun operation =>
        program.operationScopes.any fun owner =>
          owner.operationId == operation.id && owner.scopeId == control.childScopeId
      (child.any fun operation => match operation with | .awaitUserTask .. => true | _ => false) &&
      (child.any fun operation => match operation with | .awaitEffect .. => true | _ => false) &&
      let identities := program.processId.value ::
        program.operations.filterMap sourceNode? ++ program.controlPlaces.map (·.origin.elementId.value)
      identities.eraseDups.length == identities.length

end BpmnSemantics.SemanticProcess.SequentialScopeProgram
