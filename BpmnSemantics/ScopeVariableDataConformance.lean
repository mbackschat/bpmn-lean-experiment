module

public import BpmnSemantics.SemanticProcess.ScopeVariableData

/-! # Occurrence-owned body data witnesses

SMIS-DATA-01 requires pre-entry mapping, present-null shadowing and nearest-existing writes.
These separating controls cover owner collisions and turnover without claiming MI execution.
-/

@[expose] public section

namespace BpmnSemantics.ScopeVariableDataConformance

open SemanticProcess

def owner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"first"⟩, definitionScopeId := ⟨"body"⟩, activation := 1 }

def foreign : ScopeOccurrenceId := { owner with processInstanceId := ⟨"second"⟩ }

def input (target source : String) : VariableMapping :=
  { target, expression := .enclosingVariable source }

def literal (target value : String) : VariableMapping :=
  { target, expression := .stringLiteral value }

def before : ScopedVariables :=
  { emptyScopedVariables with
    process := { bindings := [{ name := "a", value := .string "outer" },
      { name := "status", value := .string "parent" }] }
    scopes := [{ owner := foreign, bindings := [{ name := "status", value := .string "foreign" }] }] }

def initialized : Option ScopedVariables :=
  initializeScopeVariables? before owner [literal "a" "seed", input "b" "a", input "status" "status"]

theorem inputs_use_pre_entry_context_and_ignore_declaration_order :
    (initialized.bind fun variables => readScopeVariable? variables owner "b") = some (.string "outer") ∧
    initializeScopeVariables? before owner [input "status" "status", input "b" "a", literal "a" "seed"] = initialized := by
  simp [initialized, before, owner, foreign, input, literal, initializeScopeVariables?,
    evaluateEnclosingInputMappings, evaluateInputMappings?, canonicalInputMappings?,
    sortByTarget, insertByTarget] <;> decide +kernel

theorem missing_parent_is_not_supplied_by_local_declarations :
    initializeScopeVariables? emptyScopedVariables owner [input "status" "status"] = none ∧
    initializeScopeVariables? emptyScopedVariables owner [literal "a" "seed", input "b" "a"] = none := by
  simp [owner, input, literal, initializeScopeVariables?, evaluateEnclosingInputMappings,
    evaluateInputMappings?, canonicalInputMappings?, sortByTarget,
    insertByTarget] <;> decide +kernel

theorem present_null_initializes_and_shadows_parent :
    ((initializeScopeVariables? { before with process := { bindings := [{ name := "status", value := .null }] } }
      owner [input "status" "status"]).bind fun variables => readScopeVariable? variables owner "status") = some .null ∧
    ((initialized.bind fun variables => writeScopeVariables? variables owner [{ name := "status", value := .null }]).bind
      fun variables => readScopeVariable? variables owner "status") = some .null := by
  simp [initialized, before, owner, foreign, input, literal, initializeScopeVariables?,
    evaluateEnclosingInputMappings, evaluateInputMappings?, canonicalInputMappings?,
    sortByTarget, insertByTarget] <;> decide +kernel

theorem writes_choose_existing_body_and_otherwise_process :
    ((initialized.bind fun variables => writeScopeVariables? variables owner
      [{ name := "status", value := .null }, { name := "new", value := .string "created" }]).map
      fun variables => (variables.process.bindings, readScopeVariable? variables foreign "status")) =
    some ([{ name := "a", value := .string "outer" }, { name := "new", value := .string "created" },
      { name := "status", value := .string "parent" }], some (.string "foreign")) := by
  simp [initialized, before, owner, foreign, input, literal, initializeScopeVariables?,
    evaluateEnclosingInputMappings, evaluateInputMappings?, canonicalInputMappings?,
    sortByTarget, insertByTarget] <;> decide +kernel

theorem duplicate_complete_owner_refuses_before_binding_availability :
    let variables := { before with scopes := [{ owner, bindings := [] },
      { owner, bindings := [{ name := "status", value := .null }] }] }
    readScopeVariable? variables owner "status" = none ∧
    writeScopeVariables? variables owner [{ name := "status", value := .string "changed" }] = none ∧
    removeScopeVariables? variables owner = none := by
  decide +kernel

theorem disposal_preserves_other_owners_and_reentry_initializes_fresh_data :
    (initialized.bind fun variables => removeScopeVariables? variables owner) = some before ∧
    ((initialized.bind fun variables => removeScopeVariables? variables owner).bind fun variables =>
      (initializeScopeVariables? variables { owner with activation := 2 } [literal "status" "pending"]).bind
        fun next => readScopeVariable? next { owner with activation := 2 } "status") = some (.string "pending") := by
  simp [initialized, before, owner, foreign, input, literal, initializeScopeVariables?,
    evaluateEnclosingInputMappings, evaluateInputMappings?, canonicalInputMappings?,
    sortByTarget, insertByTarget] <;> decide +kernel

end BpmnSemantics.ScopeVariableDataConformance
