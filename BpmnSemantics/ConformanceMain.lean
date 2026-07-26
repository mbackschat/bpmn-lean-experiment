import BpmnSemantics.Conformance
import BpmnSemantics.SemanticProcessConformance
import BpmnSemantics.UserTaskInteractionConformance

/-! Executable entry point for the compile-time contract locks. -/

def main : IO Unit :=
  IO.println "Sequential User Task contract and semantic checks passed."
