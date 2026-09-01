import BpmnSemantics.SubProcessBoundaryTimerConformance
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Compensation Event Sub-Process snapshot structural admission

This module checks the narrow dormant-handler exception selected by the approved snapshot proposal. The standalone raw graph validator continues to reject a scope with no entry or completion operation; only complete Program admission may derive the exact dormant handler from a valid hidden declaration.
-/

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
theorem declaration_is_valid :
    compensationEventSubProcessSnapshotDeclarationValid program = true := by
  decide +kernel

/-- Raw graph admission keeps its ordinary meaning and rejects the dormant nested scope. -/
theorem raw_graph_admission_stays_strict :
    programGraphWellFormed program = false := by
  decide +kernel

/-- Complete Program admission applies the validated declaration-derived lifecycle exception. -/
theorem strict_program_admission_accepts_the_declared_handler :
    programWellFormed program = true := by
  decide +kernel

def extraDormantScopeId : DefinitionScopeId :=
  ⟨"scope:ZZExtraDormant"⟩

def extraDormantProgram : Program :=
  { program with
    definitionScopes := program.definitionScopes ++
      [ { id := extraDormantScopeId
          parentScopeId := some SubProcessBoundaryTimerConformance.childScopeId
          originElementId := ⟨"ZZExtraDormant"⟩ } ] }

theorem an_undeclared_dormant_scope_is_rejected :
    programGraphWellFormedForProgram extraDormantProgram = false := by
  decide +kernel

def additionalParentlessRootProgram : Program :=
  { program with
    definitionScopes := program.definitionScopes ++
      [ { id := ⟨"scope:CalledProcess"⟩
          parentScopeId := none
          originElementId := ⟨"CalledProcess"⟩ } ] }

/-- The snapshot checkpoint excludes called Processes even though ordinary graph admission supports them. -/
theorem an_additional_parentless_root_is_rejected :
    compensationEventSubProcessSnapshotDeclarationValid additionalParentlessRootProgram =
      false := by
  decide +kernel

def parentMismatchProgram : Program :=
  { program with
    compensationEventSubProcessSnapshots := some
      { declaration with
        targets :=
          [ { parentScopeId := SubProcessBoundaryTimerConformance.rootScopeId
              handlerScopeId } ] } }

theorem a_handler_outside_its_declared_parent_is_rejected :
    compensationEventSubProcessSnapshotDeclarationValid parentMismatchProgram = false := by
  decide +kernel

def nonemptyHandlerProgram : Program :=
  { program with
    operationScopes :=
      match program.operationScopes with
      | [] => []
      | ownership :: rest => { ownership with scopeId := handlerScopeId } :: rest }

theorem a_handler_with_an_owned_operation_is_rejected :
    compensationEventSubProcessSnapshotDeclarationValid nonemptyHandlerProgram = false := by
  decide +kernel

def handlerEntryProgram : Program :=
  { program with
    operations := program.operations.map fun operation =>
      match operation with
      | .enterBoundedScope id origin input childEntry _ boundaryTimer =>
          .enterBoundedScope id origin input childEntry handlerScopeId boundaryTimer
      | other => other }

theorem a_handler_with_an_entry_operation_is_rejected :
    compensationEventSubProcessSnapshotDeclarationValid handlerEntryProgram = false := by
  decide +kernel

def handlerCompletionProgram : Program :=
  { program with
    operations := program.operations.map fun operation =>
      match operation with
      | .completeScope id origin scopeId parentOutput =>
          if scopeId = SubProcessBoundaryTimerConformance.childScopeId then
            .completeScope id origin handlerScopeId parentOutput
          else operation
      | other => other }

theorem a_handler_with_a_completion_operation_is_rejected :
    compensationEventSubProcessSnapshotDeclarationValid handlerCompletionProgram = false := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance
