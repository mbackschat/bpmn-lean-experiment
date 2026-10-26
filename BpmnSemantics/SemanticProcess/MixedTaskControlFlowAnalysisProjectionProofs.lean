module

import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmissionLaws
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
public import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
public import BpmnSemantics.SemanticProcess.StructuredCompositionAdmission

/-! What an accepted mixed-task program analysis projects from its Program: the vertex projection it analyzed, its graph, and the absent compensation and Event Sub-Process declarations. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.MixedTaskControlFlow

theorem program_analysis_projection (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    ∃ vertices,
      (program.operations.filter fun op => !StructuredComposition.isScopeCompletion op).mapM
        (operationVertex? program) = some vertices ∧ analyze vertices = some analysis := by
  unfold programAnalysis at analyzed
  obtain ⟨root, rootSelected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  split at analyzed
  · contradiction
  · obtain ⟨completion, selected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
    cases completion <;> try simp only at analyzed
    all_goals try contradiction
    case completeScope id origin scope output =>
      cases output with
      | some output => contradiction
      | none =>
        dsimp only at analyzed
        split at analyzed
        · contradiction
        · obtain ⟨origins, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
          split at analyzed
          · contradiction
          · exact Option.bind_eq_some_iff.mp analyzed

theorem program_analysis_graph (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    analyze analysis.vertices = some analysis := by
  obtain ⟨vertices, _, accepted⟩ := program_analysis_projection program analysis analyzed
  simpa only [(analyze_facts vertices analysis accepted).vertices_eq] using accepted

theorem program_analysis_declarations_absent (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    program.compensationActivityRetention = none ∧ program.compensationEventSubProcessSnapshots = none ∧
      program.compensationExecution = none ∧ program.interruptingMessageEventSubProcesses = [] := by
  unfold programAnalysis at analyzed
  obtain ⟨root, selected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  split at analyzed
  · contradiction
  · simp_all

end BpmnSemantics.SemanticProcess.MixedTaskControlFlow
