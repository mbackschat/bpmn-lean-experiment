module

public import BpmnSemantics.SubProcessBoundaryTimerConformance
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Compensation Event Sub-Process snapshot structural admission

This module checks the narrow dormant-handler exception selected by the approved snapshot proposal. The standalone raw graph validator continues to reject a scope with no entry or completion operation; only complete Program admission may derive the exact dormant handler from a valid hidden declaration.
-/

@[expose] public section

namespace BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def handlerScopeId : DefinitionScopeId :=
  ⟨"scope:SnapshotHandler"⟩

def handlerScope : DefinitionScope :=
  { id := handlerScopeId
    parentScopeId := some SubProcessBoundaryTimerConformance.childScopeId
    originElementId := ⟨"SnapshotHandler"⟩ }

def declaration : CompensationEventSubProcessSnapshotDeclaration :=
  { targets :=
      [ { parentScopeId := SubProcessBoundaryTimerConformance.childScopeId
          handlerScopeId } ]
    maxRecords := 4
    maxCanonicalBytes := 4096 }

def program : Program :=
  { SubProcessBoundaryTimerConformance.program with
    definitionScopes :=
      SubProcessBoundaryTimerConformance.program.definitionScopes ++ [handlerScope]
    compensationEventSubProcessSnapshots := some declaration }

/-- The declaration is the sole authority for treating the nested empty scope as dormant. -/
def declaration_is_valid : Bool := decide <|
    compensationEventSubProcessSnapshotDeclarationValid program = true

/-- Raw graph admission keeps its ordinary meaning and rejects the dormant nested scope. -/
def raw_graph_admission_stays_strict : Bool := decide <|
    programGraphWellFormed program = false

/-- Complete Program admission applies the validated declaration-derived lifecycle exception. -/
def strict_program_admission_accepts_the_declared_handler : Bool := decide <|
    programWellFormed program = true

def extraDormantScopeId : DefinitionScopeId :=
  ⟨"scope:ZZExtraDormant"⟩

def extraDormantProgram : Program :=
  { program with
    definitionScopes := program.definitionScopes ++
      [ { id := extraDormantScopeId
          parentScopeId := some SubProcessBoundaryTimerConformance.childScopeId
          originElementId := ⟨"ZZExtraDormant"⟩ } ] }

def an_undeclared_dormant_scope_is_rejected : Bool := decide <|
    programGraphWellFormedForProgram extraDormantProgram = false

def additionalParentlessRootProgram : Program :=
  { program with
    definitionScopes := program.definitionScopes ++
      [ { id := ⟨"scope:CalledProcess"⟩
          parentScopeId := none
          originElementId := ⟨"CalledProcess"⟩ } ] }

/-- The snapshot checkpoint excludes called Processes even though ordinary graph admission supports them. -/
def an_additional_parentless_root_is_rejected : Bool := decide <|
    compensationEventSubProcessSnapshotDeclarationValid additionalParentlessRootProgram =
      false

def parentMismatchProgram : Program :=
  { program with
    compensationEventSubProcessSnapshots := some
      { declaration with
        targets :=
          [ { parentScopeId := SubProcessBoundaryTimerConformance.rootScopeId
              handlerScopeId } ] } }

def a_handler_outside_its_declared_parent_is_rejected : Bool := decide <|
    compensationEventSubProcessSnapshotDeclarationValid parentMismatchProgram = false

def nonemptyHandlerProgram : Program :=
  { program with
    operationScopes :=
      match program.operationScopes with
      | [] => []
      | ownership :: rest => { ownership with scopeId := handlerScopeId } :: rest }

def a_handler_with_an_owned_operation_is_rejected : Bool := decide <|
    compensationEventSubProcessSnapshotDeclarationValid nonemptyHandlerProgram = false

def handlerEntryProgram : Program :=
  { program with
    operations := program.operations.map fun operation =>
      match operation with
      | .enterBoundedScope id origin input childEntry _ boundaryTimer =>
          .enterBoundedScope id origin input childEntry handlerScopeId boundaryTimer
      | other => other }

def a_handler_with_an_entry_operation_is_rejected : Bool := decide <|
    compensationEventSubProcessSnapshotDeclarationValid handlerEntryProgram = false

def handlerCompletionProgram : Program :=
  { program with
    operations := program.operations.map fun operation =>
      match operation with
      | .completeScope id origin scopeId parentOutput =>
          if scopeId = SubProcessBoundaryTimerConformance.childScopeId then
            .completeScope id origin handlerScopeId parentOutput
          else operation
      | other => other }

def a_handler_with_a_completion_operation_is_rejected : Bool := decide <|
    compensationEventSubProcessSnapshotDeclarationValid handlerCompletionProgram = false

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("declaration_is_valid", declaration_is_valid),
  ("raw_graph_admission_stays_strict", raw_graph_admission_stays_strict),
  ("strict_program_admission_accepts_the_declared_handler", strict_program_admission_accepts_the_declared_handler),
  ("an_undeclared_dormant_scope_is_rejected", an_undeclared_dormant_scope_is_rejected),
  ("an_additional_parentless_root_is_rejected", an_additional_parentless_root_is_rejected),
  ("a_handler_outside_its_declared_parent_is_rejected", a_handler_outside_its_declared_parent_is_rejected),
  ("a_handler_with_an_owned_operation_is_rejected", a_handler_with_an_owned_operation_is_rejected),
  ("a_handler_with_an_entry_operation_is_rejected", a_handler_with_an_entry_operation_is_rejected),
  ("a_handler_with_a_completion_operation_is_rejected", a_handler_with_a_completion_operation_is_rejected)
]

end BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance
