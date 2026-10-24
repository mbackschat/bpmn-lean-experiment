module

public import BpmnSemantics.SemanticProcess.BoundedScope
public import BpmnSemantics.SemanticProcess.MonitoredScope
public import BpmnSemantics.SemanticProcess.TransactionCancellation
public import BpmnSemantics.SemanticProcess.NestedScopeData

/-! # Declared scope entry and completion

This module owns the scope-entry and scope-completion transformations that the `enterScope` and
`completeScope` operations evaluate: monitored or bounded completion selection, and the nested
scope-data hooks that initialize a declaring scope's frame on entry and write its outputs before
completion disposes it. A Program without a `scopeLocalData` record for the scope keeps exactly the
undeclared entry and completion, which the `_undeclared` and `_other_profile` equations state.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def completeSelectedScope? (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId) : Option RuntimeState :=
  if isMonitoredScopeDefinition program scopeId then
    completeMonitoredScope? program state scopeId parentOutput
  else completeBoundedScope? program state scopeId parentOutput

/-- `enterScope` with NSD-INIT-01: a scope declaring locals installs its frame in the same step. A
scope without a `scopeLocalData` record keeps exactly the retention-aware entry. -/
def enterDeclaredScope? (program : Program) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId) : Option RuntimeState :=
  match NestedScopeData.recordFor? program childScopeId with
  | none => enterScopeWithCompensationRetention? program state input childEntry childScopeId
  | some _ => do
      NestedScopeData.initializeFrame? program
        (← enterScopeWithCompensationRetention? program state input childEntry childScopeId) childScopeId

/-- `completeScope` with NSD-OUTPUT-01: a child scope declaring locals writes its outputs before the
completion rewrite disposes its frame. Root completion and undeclared scopes keep exactly the
selected completion. -/
def completeDeclaredScope? (program : Program) (state : RuntimeState) (scopeId : DefinitionScopeId) :
    Option ControlPlaceId → Option RuntimeState
  | none => completeSelectedScope? program state scopeId none
  | some output => match NestedScopeData.recordFor? program scopeId with
    | none => completeSelectedScope? program state scopeId (some output)
    | some _ => do
        completeSelectedScope? program (← NestedScopeData.writeOutputs? program state scopeId) scopeId
          (some output)

theorem enterDeclaredScope?_undeclared (program : Program) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (undeclared : NestedScopeData.recordFor? program childScopeId = none) :
    enterDeclaredScope? program state input childEntry childScopeId =
      enterScopeWithCompensationRetention? program state input childEntry childScopeId := by
  simp only [enterDeclaredScope?, undeclared]

theorem completeDeclaredScope?_undeclared (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (undeclared : NestedScopeData.recordFor? program scopeId = none) :
    completeDeclaredScope? program state scopeId output = completeSelectedScope? program state scopeId output := by
  cases output <;> simp only [completeDeclaredScope?, undeclared]

theorem enterDeclaredScope?_eq_none (program : Program) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (refused : enterScopeWithCompensationRetention? program state input childEntry childScopeId = none) :
    enterDeclaredScope? program state input childEntry childScopeId = none := by
  unfold enterDeclaredScope?
  split <;> simp [refused]

/-- A completion refused in every state differing from `state` only in data stays refused after
NSD-OUTPUT-01's write, which changes nothing else. -/
theorem completeDeclaredScope?_eq_none (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (refused : ∀ written : RuntimeState, written = { state with variables := written.variables } →
      completeSelectedScope? program written scopeId output = none) :
    completeDeclaredScope? program state scopeId output = none := by
  cases output with
  | none => exact refused state rfl
  | some output =>
      simp only [completeDeclaredScope?]
      cases NestedScopeData.recordFor? program scopeId with
      | none => exact refused state rfl
      | some _ =>
          cases wrote : NestedScopeData.writeOutputs? program state scopeId with
          | none => rfl
          | some written =>
              exact refused written
                (NestedScopeData.writeOutputs?_variables_only program state written scopeId wrote)

theorem enterDeclaredScope?_other_profile (program : Program) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (other : nestedScopeDataProgram program = false) :
    enterDeclaredScope? program state input childEntry childScopeId =
      enterScopeWithCompensationRetention? program state input childEntry childScopeId :=
  enterDeclaredScope?_undeclared program state input childEntry childScopeId
    (by simp only [NestedScopeData.recordFor?, other, Bool.false_eq_true, ↓reduceIte])

theorem completeDeclaredScope?_other_profile (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (other : nestedScopeDataProgram program = false) :
    completeDeclaredScope? program state scopeId output = completeSelectedScope? program state scopeId output :=
  completeDeclaredScope?_undeclared program state scopeId output
    (by simp only [NestedScopeData.recordFor?, other, Bool.false_eq_true, ↓reduceIte])

end BpmnSemantics.SemanticProcess
