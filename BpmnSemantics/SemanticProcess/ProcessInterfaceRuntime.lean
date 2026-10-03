import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Passive Process interface runtime

Call invocation and composed task transitions share exact-owner scalar storage primitives.
Proofs live in `ProcessInterfaceData` because collection-order proofs already depend on Call execution.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Owner ambiguity refuses before inspecting ports, even if only one duplicate carries the requested
port. The full scope identity prevents activation, instance, and definition-scope aliases. -/
def selectProcessInterface? (variables : ScopedVariables) (owner : ScopeOccurrenceId) :
    Option ProcessInterfaceScope :=
  match variables.processInterfaces.filter fun scope => decide (scope.owner = owner) with
  | [scope] => some scope
  | _ => none

/-- The scalar domain treats a present null as available; wire admission separately bounds strings. -/
def processInterfaceScalar : VariableValue → Bool
  | .string _ | .null => true
  | .boolean _ | .integer _ | .stringList _ => false

def readInterfaceBinding? (bindings : List VariableBinding) (name : String) :
    Option VariableBinding :=
  match bindings.filter fun binding => decide (binding.name = name) with
  | [binding] => if processInterfaceScalar binding.value then some binding else none
  | _ => none

def readProcessInterfaceInput? (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (name : String) : Option VariableBinding := do
  let scope ← selectProcessInterface? variables owner
  readInterfaceBinding? scope.inputs name

def readProcessInterfaceOutput? (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (name : String) : Option VariableBinding := do
  let scope ← selectProcessInterface? variables owner
  readInterfaceBinding? scope.outputs name

/-- A fresh interface snapshots one scalar input, with output unavailable until completion.
Any pre-existing complete owner refuses, including an ambiguous duplicate (CDATA-INPUT-01). -/
def addProcessInterface? (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (input : VariableBinding) : Option ScopedVariables :=
  if variables.processInterfaces.any (fun scope => decide (scope.owner = owner)) ||
      !processInterfaceScalar input.value then none
  else some { variables with processInterfaces :=
    (canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
      { owner, inputs := [input], outputs := [] } variables.processInterfaces) }

def outputSlotAccepts (outputs : List VariableBinding) (name : String) : Bool :=
  match outputs with
  | [] => true
  | [existing] => decide (existing.name = name)
  | _ => false

/-- Completion writes only the unique owner's output slot and preserves its input snapshot.
An already occupied slot must have the same port identity; ambiguous owners and multiple outputs refuse. -/
def writeProcessInterfaceOutput? (variables : ScopedVariables) (owner : ScopeOccurrenceId)
    (output : VariableBinding) : Option ScopedVariables := do
  let scope ← selectProcessInterface? variables owner
  if processInterfaceScalar output.value && outputSlotAccepts scope.outputs output.name then
    some { variables with processInterfaces := variables.processInterfaces.map fun candidate =>
      if candidate.owner = owner then { candidate with outputs := [output] } else candidate }
  else none

end BpmnSemantics.SemanticProcess
