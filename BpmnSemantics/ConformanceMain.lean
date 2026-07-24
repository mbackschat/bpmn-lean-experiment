import BpmnSemantics.Conformance
import BpmnSemantics.SequentialUserTaskConformance
import BpmnSemantics.UserTaskInteractionConformance

/-! Executable entry point for the compile-time contract locks. -/

def main : IO Unit :=
  IO.println "Milestone 0 contract and sequential User Task checks passed."
