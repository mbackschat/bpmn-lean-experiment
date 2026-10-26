module

import BpmnSemantics.SemanticProcessConformanceCheckFixtures
import BpmnSemantics.SemanticProcessAdmissionConformance
import BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance
import BpmnSemantics.TimerStartConformance
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
public import BpmnSemantics.SemanticProcess.InternalScheduledClosure
public import BpmnSemantics.SemanticProcess.GraphReachabilityLaws
/-! # BpmnSemantics.SemanticProcessConformance: runtime and evaluator contract checks

These checks own generic runtime closure, resumability, and evaluator behavior. Checked-graph admission, program validation, definition binding, and lowering fixtures live in `SemanticProcessAdmissionConformance` so each kernel-decided lane has an independent build boundary.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcessConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
theorem parallelEvaluatorSound :
    Obligations.evaluator_sound ProgramStep step :=
  step_sound

end BpmnSemantics.SemanticProcessConformance
