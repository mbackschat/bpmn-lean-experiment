import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Passive Process interface runtime

Call invocation and composed task transitions share exact-owner scalar storage primitives.
Selector success equivalences support constructor-selection bridges here; higher preservation laws
live in `ProcessInterfaceData` because collection-order proofs already depend on Call execution.
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
  | .boolean _ | .integer _ | .stringList _ | .decimal _ _ | .list _ | .map _ => false

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

theorem selectProcessInterface_iff {variables : ScopedVariables} {owner : ScopeOccurrenceId}
    {scope : ProcessInterfaceScope} :
    selectProcessInterface? variables owner = some scope ↔
      variables.processInterfaces.filter (fun candidate => decide (candidate.owner = owner)) = [scope] := by
  unfold selectProcessInterface?
  split <;> simp_all

private theorem readInterfaceBinding_iff {bindings : List VariableBinding} {name : String}
    {binding : VariableBinding} : readInterfaceBinding? bindings name = some binding ↔
    bindings.filter (fun candidate => decide (candidate.name = name)) = [binding] ∧
      processInterfaceScalar binding.value = true := by
  unfold readInterfaceBinding?
  split
  · split <;> simp_all <;> intro equal <;> subst binding <;> assumption
  · simp_all

theorem readProcessInterfaceInput_iff {variables : ScopedVariables} {owner : ScopeOccurrenceId}
    {name : String} {binding : VariableBinding} :
    readProcessInterfaceInput? variables owner name = some binding ↔
      ∃ scope, selectProcessInterface? variables owner = some scope ∧
        scope.inputs.filter (fun candidate => decide (candidate.name = name)) = [binding] ∧
        processInterfaceScalar binding.value = true := by
  simp [readProcessInterfaceInput?, Option.bind_eq_some_iff, readInterfaceBinding_iff]

theorem readProcessInterfaceOutput_iff {variables : ScopedVariables} {owner : ScopeOccurrenceId}
    {name : String} {binding : VariableBinding} :
    readProcessInterfaceOutput? variables owner name = some binding ↔
      ∃ scope, selectProcessInterface? variables owner = some scope ∧
        scope.outputs.filter (fun candidate => decide (candidate.name = name)) = [binding] ∧
        processInterfaceScalar binding.value = true := by
  simp [readProcessInterfaceOutput?, Option.bind_eq_some_iff, readInterfaceBinding_iff]

theorem addProcessInterface_success_iff {variables result : ScopedVariables} {owner : ScopeOccurrenceId}
    {input : VariableBinding} : addProcessInterface? variables owner input = some result ↔
    variables.processInterfaces.any (fun scope => decide (scope.owner = owner)) = false ∧
      processInterfaceScalar input.value = true ∧
      result = { variables with processInterfaces :=
        (canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
          { owner, inputs := [input], outputs := [] } variables.processInterfaces) } := by
  cases fresh : variables.processInterfaces.any (fun scope => decide (scope.owner = owner)) <;>
    cases scalar : processInterfaceScalar input.value <;>
    simp [addProcessInterface?, fresh, scalar] <;> exact eq_comm

theorem writeProcessInterfaceOutput_success_iff {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {output : VariableBinding} :
    writeProcessInterfaceOutput? variables owner output = some result ↔
      ∃ scope, selectProcessInterface? variables owner = some scope ∧
        processInterfaceScalar output.value = true ∧
        (scope.outputs = [] ∨ ∃ previous, scope.outputs = [previous] ∧ previous.name = output.name) ∧
        result = { variables with processInterfaces := variables.processInterfaces.map fun candidate =>
          if candidate.owner = owner then { candidate with outputs := [output] } else candidate } := by
  cases selected : selectProcessInterface? variables owner with
  | none => simp [writeProcessInterfaceOutput?, selected]
  | some scope =>
      simp only [writeProcessInterfaceOutput?, selected, bind, Option.bind,
        Option.some.injEq, exists_eq_left']
      have slot : outputSlotAccepts scope.outputs output.name = true ↔
          scope.outputs = [] ∨ ∃ previous, scope.outputs = [previous] ∧ previous.name = output.name := by
        unfold outputSlotAccepts
        split <;> simp_all
      split
      · next accepted =>
        simp only [Bool.and_eq_true] at accepted
        have scalar := accepted.1
        have acceptedSlot := slot.mp accepted.2
        simp only [scalar, acceptedSlot, true_and, Option.some.injEq]
        exact eq_comm
      · next rejected =>
        have refused : ¬ (processInterfaceScalar output.value = true ∧
            (scope.outputs = [] ∨ ∃ previous, scope.outputs = [previous] ∧ previous.name = output.name)) := by
          intro accepted
          apply rejected
          simp [accepted.1, slot.mpr accepted.2]
        simp_all

end BpmnSemantics.SemanticProcess
