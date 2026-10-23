import BpmnSemantics.RepeatedNestedConcurrentCallsFixtures

/-! # Repeated, nested and concurrent Calls admission conformance

Finite checked admission witnesses of Process-root Call forests under the cumulative embedded completion
profile (CALLN-ADMIT-01): the retained supplier onboarding forest is admitted with agreeing checked and
Program closure bounds, and each refused forest is refused before start while its control, which differs in
the one fact the refusal names, is admitted. Each refusal is its own theorem, so no kernel decision keeps
another model's reduction resident. The forest scan has no quantified certificate; see the
[repeated, nested and concurrent Calls proposal](../docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-PROPOSAL.md#separating-witnesses).
-/

namespace BpmnSemantics.RepeatedNestedConcurrentCallsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ConcurrentEmbeddedActivationsConformance (admitted analyses)

/-- `admitted` from its separately decided conjuncts. Deciding `admitted` whole reduces the checked and
Program well-formedness twice in one kernel declaration, once directly and once inside
`definitionBindingValid`, which peaked at 3,020,004 KiB against the 3 GiB fixture ceiling on 2026-10-23;
each conjunct alone stays below 2.5 GiB. -/
private theorem admitted_of (source : CheckedProcess) (checked : checkedWellFormed source = true)
    (program : programWellFormed (lowerCheckedProcess source) = true)
    (capabilities : programProfileCapabilitiesValid (lowerCheckedProcess source) = true) :
    admitted source = true := by
  simp [admitted, definitionBindingValid, checked, program, capabilities]

theorem supplier_checked : checkedWellFormed supplier = true := by decide +kernel

theorem supplier_program : programWellFormed (lowerCheckedProcess supplier) = true := by decide +kernel

theorem supplier_capabilities : programProfileCapabilitiesValid (lowerCheckedProcess supplier) = true := by
  decide +kernel

theorem supplier_is_admitted : admitted supplier = true :=
  admitted_of supplier supplier_checked supplier_program supplier_capabilities

theorem supplier_analyses_agree_on_its_burst : analyses supplier = (some 6, some 6) := by decide +kernel

/-- CALLN-ONCE-01: a fork straight into two Calls of one definition is refused. -/
theorem fork_into_two_calls_of_one_definition_is_refused :
    NestedScopeControl.checkedAnalysis forkIntoTwoCalls = none := by decide +kernel

theorem user_task_first_branches_calling_one_definition_are_admitted :
    analyses forkIntoTwoCallsControl = (some 5, some 5) := by decide +kernel

/-- CALLN-SHARED-01: two branches calling one Call-bearing definition are refused. -/
theorem branches_sharing_a_call_bearing_definition_are_refused :
    NestedScopeControl.checkedAnalysis sharedCallBearing = none := by decide +kernel

theorem serial_calls_of_a_call_bearing_definition_are_admitted :
    analyses sharedCallBearingControl = (some 6, some 6) := by decide +kernel

theorem call_cycle_is_refused : NestedScopeControl.checkedAnalysis callCycle = none := by decide +kernel

/-- The Program analysis refuses the lowered cycle on its own: acyclicity orders a Call by its invocation-to-return
summary edge, so the invocation cycle is refused by the profile analysis, not by structural well-formedness. -/
theorem call_cycle_program_is_refused :
    NestedScopeControl.programAnalysis (lowerCheckedProcess callCycle) = none := by decide +kernel

/-- The cycle's control ends the chain at Call depth two. -/
theorem call_chain_of_depth_two_is_admitted : analyses callCycleControl = (some 6, some 6) := by
  decide +kernel

theorem call_depth_four_is_refused : NestedScopeControl.checkedAnalysis depthFour = none := by decide +kernel

theorem call_depth_three_is_admitted : analyses depthFourControl = (some 8, some 8) := by decide +kernel

theorem parallel_gateway_in_called_body_is_refused :
    NestedScopeControl.checkedAnalysis gatewayInCalledBody = none := by decide +kernel

theorem serial_called_body_is_admitted : analyses gatewayInCalledBodyControl = (some 4, some 4) := by
  decide +kernel

theorem four_called_vertices_are_refused :
    NestedScopeControl.checkedAnalysis fourCalledVertices = none := by decide +kernel

theorem three_called_vertices_are_admitted : analyses fourCalledVerticesControl = (some 4, some 4) := by
  decide +kernel

theorem call_inside_sub_process_is_refused :
    NestedScopeControl.checkedAnalysis callInSubProcess = none := by decide +kernel

theorem call_after_sub_process_is_admitted : analyses callInSubProcessControl = (some 4, some 4) := by
  decide +kernel

theorem unreached_called_root_is_refused :
    NestedScopeControl.checkedAnalysis unreachedRoot = none := by decide +kernel

theorem reached_called_roots_are_admitted : analyses unreachedRootControl = (some 4, some 4) := by
  decide +kernel

/-- A closure of nine steps exceeds the closure bound of eight and is refused. -/
theorem nine_step_burst_is_refused : NestedScopeControl.checkedAnalysis nineStepBurst = none := by
  decide +kernel

theorem eight_step_burst_is_admitted : analyses nineStepBurstControl = (some 8, some 8) := by decide +kernel

theorem fork_into_leading_calls_checked : checkedWellFormed forkIntoLeadingCalls = true := by decide +kernel

theorem fork_into_leading_calls_program : programWellFormed (lowerCheckedProcess forkIntoLeadingCalls) = true := by
  decide +kernel

theorem fork_into_leading_calls_capabilities :
    programProfileCapabilitiesValid (lowerCheckedProcess forkIntoLeadingCalls) = true := by
  decide +kernel

/-- CALLN-INVOKE-01: an entry closure that batches two nested invocations reaches the bound exactly. -/
theorem fork_into_leading_calls_is_admitted : admitted forkIntoLeadingCalls = true :=
  admitted_of forkIntoLeadingCalls fork_into_leading_calls_checked fork_into_leading_calls_program
    fork_into_leading_calls_capabilities

theorem fork_into_leading_calls_reaches_the_closure_bound :
    analyses forkIntoLeadingCalls = (some 8, some 8) := by decide +kernel

theorem two_callers_checked : checkedWellFormed twoCallers = true := by decide +kernel

theorem two_callers_program : programWellFormed (lowerCheckedProcess twoCallers) = true := by
  decide +kernel

theorem two_callers_capabilities :
    programProfileCapabilitiesValid (lowerCheckedProcess twoCallers) = true := by
  decide +kernel

/-- The non-law's model is admitted, so its two live instances are reachable under the profile. -/
theorem two_callers_is_admitted : admitted twoCallers = true :=
  admitted_of twoCallers two_callers_checked two_callers_program two_callers_capabilities

end BpmnSemantics.RepeatedNestedConcurrentCallsConformance
