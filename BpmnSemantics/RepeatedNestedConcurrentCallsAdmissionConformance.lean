import BpmnSemantics.RepeatedNestedConcurrentCallsFixtures

/-! # Repeated, nested and concurrent Calls admission conformance

Finite checked admission witnesses of Process-root Call forests under the cumulative embedded completion
profile (CALLN-ADMIT-01): the retained supplier onboarding forest is admitted with agreeing checked and
Program closure bounds, and each refused forest is refused before start while its control, which differs in
the one fact the refusal names, is admitted. Each refusal is its own check. The forest scan has no quantified certificate; see the
[repeated, nested and concurrent Calls specification](../docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md#separating-witnesses).
-/

namespace BpmnSemantics.RepeatedNestedConcurrentCallsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ConcurrentEmbeddedActivationsConformance (admitted analyses)

def supplier_is_admitted : Bool := admitted supplier

def supplier_analyses_agree_on_its_burst : Bool := decide (analyses supplier = (some 6, some 6))

/-- CALLN-ONCE-01: a fork straight into two Calls of one definition is refused. -/
def fork_into_two_calls_of_one_definition_is_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis forkIntoTwoCalls = none

def user_task_first_branches_calling_one_definition_are_admitted : Bool := decide <|
    analyses forkIntoTwoCallsControl = (some 5, some 5)

/-- CALLN-SHARED-01: two branches calling one Call-bearing definition are refused. -/
def branches_sharing_a_call_bearing_definition_are_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis sharedCallBearing = none

def serial_calls_of_a_call_bearing_definition_are_admitted : Bool := decide <|
    analyses sharedCallBearingControl = (some 6, some 6)

def call_cycle_is_refused : Bool := decide (NestedScopeControl.checkedAnalysis callCycle = none)

/-- The Program analysis refuses the lowered cycle on its own: acyclicity orders a Call by its invocation-to-return
summary edge, so the invocation cycle is refused by the profile analysis, not by structural well-formedness. -/
def call_cycle_program_is_refused : Bool := decide <|
    NestedScopeControl.programAnalysis (lowerCheckedProcess callCycle) = none

/-- The cycle's control ends the chain at Call depth two. -/
def call_chain_of_depth_two_is_admitted : Bool := decide (analyses callCycleControl = (some 6, some 6))

def call_depth_four_is_refused : Bool := decide (NestedScopeControl.checkedAnalysis depthFour = none)

def call_depth_three_is_admitted : Bool := decide (analyses depthFourControl = (some 8, some 8))

def parallel_gateway_in_called_body_is_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis gatewayInCalledBody = none

def serial_called_body_is_admitted : Bool := decide (analyses gatewayInCalledBodyControl = (some 4, some 4))

def four_called_vertices_are_refused : Bool := decide (NestedScopeControl.checkedAnalysis fourCalledVertices = none)

def three_called_vertices_are_admitted : Bool := decide (analyses fourCalledVerticesControl = (some 4, some 4))

def call_inside_sub_process_is_refused : Bool := decide (NestedScopeControl.checkedAnalysis callInSubProcess = none)

def call_after_sub_process_is_admitted : Bool := decide (analyses callInSubProcessControl = (some 4, some 4))

def unreached_called_root_is_refused : Bool := decide (NestedScopeControl.checkedAnalysis unreachedRoot = none)

def reached_called_roots_are_admitted : Bool := decide (analyses unreachedRootControl = (some 4, some 4))

/-- A closure of nine steps exceeds the closure bound of eight and is refused. -/
def nine_step_burst_is_refused : Bool := decide (NestedScopeControl.checkedAnalysis nineStepBurst = none)

def eight_step_burst_is_admitted : Bool := decide (analyses nineStepBurstControl = (some 8, some 8))

/-- CALLN-INVOKE-01: an entry closure that batches two nested invocations reaches the bound exactly. -/
def fork_into_leading_calls_is_admitted : Bool := admitted forkIntoLeadingCalls

def fork_into_leading_calls_reaches_the_closure_bound : Bool := decide <|
    analyses forkIntoLeadingCalls = (some 8, some 8)

/-- The non-law's model is admitted, so its two live instances are reachable under the profile. -/
def two_callers_is_admitted : Bool := admitted twoCallers

/-- Every check of this module, named for the executable driver's failure report. -/
def admissionChecks : List (String × Bool) := [
  ("supplier_is_admitted", supplier_is_admitted),
  ("supplier_analyses_agree_on_its_burst", supplier_analyses_agree_on_its_burst),
  ("fork_into_two_calls_of_one_definition_is_refused", fork_into_two_calls_of_one_definition_is_refused),
  ("user_task_first_branches_calling_one_definition_are_admitted", user_task_first_branches_calling_one_definition_are_admitted),
  ("branches_sharing_a_call_bearing_definition_are_refused", branches_sharing_a_call_bearing_definition_are_refused),
  ("serial_calls_of_a_call_bearing_definition_are_admitted", serial_calls_of_a_call_bearing_definition_are_admitted),
  ("call_cycle_is_refused", call_cycle_is_refused),
  ("call_cycle_program_is_refused", call_cycle_program_is_refused),
  ("call_chain_of_depth_two_is_admitted", call_chain_of_depth_two_is_admitted),
  ("call_depth_four_is_refused", call_depth_four_is_refused),
  ("call_depth_three_is_admitted", call_depth_three_is_admitted),
  ("parallel_gateway_in_called_body_is_refused", parallel_gateway_in_called_body_is_refused),
  ("serial_called_body_is_admitted", serial_called_body_is_admitted),
  ("four_called_vertices_are_refused", four_called_vertices_are_refused),
  ("three_called_vertices_are_admitted", three_called_vertices_are_admitted),
  ("call_inside_sub_process_is_refused", call_inside_sub_process_is_refused),
  ("call_after_sub_process_is_admitted", call_after_sub_process_is_admitted),
  ("unreached_called_root_is_refused", unreached_called_root_is_refused),
  ("reached_called_roots_are_admitted", reached_called_roots_are_admitted),
  ("nine_step_burst_is_refused", nine_step_burst_is_refused),
  ("eight_step_burst_is_admitted", eight_step_burst_is_admitted),
  ("fork_into_leading_calls_is_admitted", fork_into_leading_calls_is_admitted),
  ("fork_into_leading_calls_reaches_the_closure_bound", fork_into_leading_calls_reaches_the_closure_bound),
  ("two_callers_is_admitted", two_callers_is_admitted)
]

end BpmnSemantics.RepeatedNestedConcurrentCallsConformance
