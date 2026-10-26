module

public import BpmnSemantics.FlowNodeOccurrenceLifecycleProgramValidityConformanceCheckFixtures
public import BpmnSemantics.FlowNodeOccurrenceLifecycleFixtures
public import BpmnSemantics.EmbeddedSubProcessCompletionConformance
public import BpmnSemantics.ActivityBoundaryTimerConformance
public import BpmnSemantics.ConfiguredTaskConformance
public import BpmnSemantics.CallActivityConformanceFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
/-! # Flow-node occurrence lifecycle program-validity conformance

This module owns exact rejection witnesses for malformed runtime state and program-foreign lifecycle candidates.
-/

@[expose] public section

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
/-- Open projection rejects malformed scope trees, residual terminal locals, and every non-exact effect-local association. -/
theorem independent_open_projection_rejects_self_parented_embedded :
    projectOpenFlowNodeOccurrences? EmbeddedSubProcessCompletionConformance.program selfParentedEmbeddedState = none := by
  decide +kernel

theorem independent_open_projection_rejects_terminal_activity_local :
    projectOpenFlowNodeOccurrences? SequentialUserTask.program terminalStateWithActivityLocal = none := by
  decide +kernel

theorem independent_open_projection_rejects_configured_missing_activity_local :
    projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program configuredMissingActivityLocal = none := by
  decide +kernel

theorem independent_open_projection_rejects_configured_duplicate_activity_local :
    projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program configuredDuplicateActivityLocal = none := by
  decide +kernel

theorem independent_open_projection_rejects_configured_unowned_activity_local :
    projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program configuredUnownedActivityLocal = none := by
  decide +kernel

-- Composed from one kernel decision per counterexample: deciding the conjunction at once peaked at
-- 2.21 GiB resident on 2026-10-25, above the 2 GiB per-module ceiling in `lakefile.toml`.
theorem independent_open_projection_rejects_every_runtime_validity_counterexample :
    projectOpenFlowNodeOccurrences? EmbeddedSubProcessCompletionConformance.program
        selfParentedEmbeddedState = none ∧
      projectOpenFlowNodeOccurrences? SequentialUserTask.program
        terminalStateWithActivityLocal = none ∧
      projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program
        configuredMissingActivityLocal = none ∧
      projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program
        configuredDuplicateActivityLocal = none ∧
      projectOpenFlowNodeOccurrences? ConfiguredTaskConformance.program
        configuredUnownedActivityLocal = none :=
  ⟨independent_open_projection_rejects_self_parented_embedded,
    independent_open_projection_rejects_terminal_activity_local,
    independent_open_projection_rejects_configured_missing_activity_local,
    independent_open_projection_rejects_configured_duplicate_activity_local,
    independent_open_projection_rejects_configured_unowned_activity_local⟩

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
