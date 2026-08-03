import BpmnSemantics.ActivityBoundaryTimerConformance
import BpmnSemantics.Conformance
import BpmnSemantics.BoundaryErrorConformance
import BpmnSemantics.CallActivityConformance
import BpmnSemantics.IntermediateCatchTimerConformance
import BpmnSemantics.EventBasedGatewayConformance
import BpmnSemantics.SemanticProcessConformance
import BpmnSemantics.SemanticProcessJsonConformance
import BpmnSemantics.ServiceTaskEffectConformance
import BpmnSemantics.SubProcessErrorPropagationConformance
import BpmnSemantics.UserTaskInteractionConformance

/-! Executable entry point for the compile-time contract locks. -/

def main : IO Unit :=
  IO.println "Sequential User Task contract and semantic checks passed."
