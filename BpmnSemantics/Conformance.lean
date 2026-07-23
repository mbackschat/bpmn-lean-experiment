import BpmnSemantics.Contract

/-! # BpmnSemantics.Conformance — Phase 0 contract locks

These examples lock only distinctions required directly by the architecture handoff.
They are not evidence of BPMN or CIB Seven compatibility.
-/

namespace BpmnSemantics

example : CommandOutcome.committed.isCommit = true := rfl
example : CommandOutcome.rolledBack.isCommit = false := rfl
example : CommandOutcome.rejected.isCommit = false := rfl
example : CommandOutcome.semanticFailure.isCommit = false := rfl
example : CommandOutcome.unsupported.isCommit = false := rfl

example : ScenarioOutcome.semantic .rolledBack ≠ .semantic .rejected := by
  decide

example : ScenarioOutcome.semantic .semanticFailure ≠ .harnessFailure := by
  decide

end BpmnSemantics
