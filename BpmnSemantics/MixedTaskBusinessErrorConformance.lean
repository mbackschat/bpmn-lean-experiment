module

public import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmissionLaws
public import BpmnSemantics.SemanticProcess.EffectCompletion
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario

/-! MBERR-DATA-01 and MBERR-PROGRESS-01 separate exceptional continuations from normal-only graph analysis. MBERR-MAP-01 and MBERR-REFUSE-01 check primitive mapping, routing and ownership. These constructed witnesses do not establish public command admission or reachable execution. -/

@[expose] public section

namespace BpmnSemantics.MixedTaskBusinessErrorConformance
open BpmnSemantics.SemanticProcess
open MixedTaskControlFlow

def exceptionalBypass : List Vertex :=
  [{ id := "start", kind := .start, outputs := ["check"] },
   { id := "check", kind := .service, outputs := ["normalWriter", "merge"] },
   { id := "normalWriter", kind := .service, outputs := ["merge"], writes := ["value"] },
   { id := "merge", kind := .merge, outputs := ["reader"] },
   { id := "reader", kind := .service, outputs := ["end"], reads := ["value"] },
   { id := "end", kind := .finish, outputs := [] }]

def error_bypass_requires_initial_value : Bool := decide <|
    (analyze exceptionalBypass).map (·.required) = some ["value"]

def writer_before_both_exits_supplies_value : Bool := decide <|
    (analyze (exceptionalBypass.map fun vertex =>
      if vertex.id == "check" then { vertex with writes := ["value"] } else vertex)).map
        (·.required) = some []

def recoveryLoop : List Vertex :=
  [{ id := "start", kind := .start, outputs := ["retry"] },
   { id := "retry", kind := .merge, outputs := ["check"] },
   { id := "check", kind := .service, outputs := ["end", "correct"], reads := ["value"] },
   { id := "correct", kind := .service, outputs := ["retry"], writes := ["value"] },
   { id := "end", kind := .finish, outputs := [] }]

def recovery_write_cannot_initialize_first_entry : Bool := decide <|
    (analyze recoveryLoop).map (fun result => (result.required, result.maximumBurst)) =
      some (["value"], 3)

def exceptionalBurst (choices : Nat) : List Vertex :=
  [{ id := "start", kind := .start, outputs := ["check"] },
   { id := "check", kind := .service, outputs := ["normal", "choice0"] },
   { id := "normal", kind := .human, outputs := ["merge"] }] ++
  (List.range choices).map (fun index =>
    { id := "choice" ++ toString index, kind := .choice,
      outputs := [if index + 1 = choices then "recovery" else "choice" ++ toString (index + 1),
        "merge"] }) ++
  [{ id := "recovery", kind := .human, outputs := ["merge"] },
   { id := "merge", kind := .merge, outputs := ["end"] },
   { id := "end", kind := .finish, outputs := [] }]

def error_continuation_exactly_eight_is_admitted : Bool := decide <|
    (analyze (exceptionalBurst 5)).map (·.maximumBurst) = some 8

def error_continuation_nine_is_refused : Bool := decide <|
    analyze (exceptionalBurst 6) = none

def wait_exit_order_does_not_hide_overlong_error_burst : Bool := decide <|
    analyze ((exceptionalBurst 6).map fun vertex =>
      if vertex.id == "check" then { vertex with outputs := vertex.outputs.reverse } else vertex) =
      none

def internal_cycle_on_error_route_is_refused : Bool := decide <|
    analyze
      [{ id := "start", kind := .start, outputs := ["check"] },
       { id := "check", kind := .service, outputs := ["normal", "cycle"] },
       { id := "normal", kind := .human, outputs := ["exit"] },
       { id := "cycle", kind := .merge, outputs := ["choice"] },
       { id := "choice", kind := .choice, outputs := ["cycle", "exit"] },
       { id := "exit", kind := .merge, outputs := ["end"] },
       { id := "end", kind := .finish, outputs := [] }] = none

def shared_merge_retains_alternative_edge_multiplicity : Bool := decide <|
    (analyze
      [{ id := "start", kind := .start, outputs := ["check"] },
       { id := "check", kind := .service, outputs := ["merge", "merge"] },
       { id := "merge", kind := .merge, outputs := ["end"] },
       { id := "end", kind := .finish, outputs := [] }]).map (·.maximumBurst) = some 3

def human_wait_does_not_gain_alternative_exits : Bool := decide <|
    analyze (exceptionalBypass.map fun vertex =>
      if vertex.id == "check" then { vertex with kind := .human } else vertex) = none

def effectId (name : String) : EffectOccurrenceId := ⟨⟨"I"⟩, ⟨name⟩, 1⟩

def effectWait (name : String) : EffectWait :=
  { processInstanceId := ⟨"I"⟩
    owner := ⟨⟨"I"⟩, ⟨"root"⟩, 1⟩
    elementId := ⟨name⟩
    activation := 1
    descriptor :=
      { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
        operation := "invoiceValidator" }
    arguments := []
    outputMappings := [{ target := "decision", expression := .localVariable "result" }]
    output := ⟨"normal:" ++ name⟩
    bpmnErrorRoute := some
      { code := "REVIEW"
        output := ⟨"error:" ++ name⟩
        origin :=
          { boundaryEventId := ⟨name ++ "Boundary"⟩
            errorDefinitionId := ⟨name ++ "Catch"⟩
            errorElementId := ⟨"SharedError"⟩
            sequenceFlowId := ⟨"error:" ++ name⟩ } } }

def waiting (name : String) : RuntimeState :=
  { initialState with
    control := .running ⟨"I"⟩
    scopeOccurrences := [{ id := (effectWait name).owner, parent := none }]
    effectWaits := [effectWait name]
    variables :=
      { process := { bindings := [{ name := "result", value := .string "parent" }] }
        processInterfaces := [], scopes := []
        activities := [{ owner := .effectOccurrence (effectId name), bindings := [] }] } }

def nullPatch : List VariableBinding := [{ name := "result", value := .null }]

def completedAt (name continuation : String) : RuntimeState :=
  { waiting name with
    effectWaits := []
    tokens := [{ placeId := ⟨continuation ++ ":" ++ name⟩, owner := (effectWait name).owner }]
    variables :=
      { process := { bindings := [{ name := "decision", value := .null },
          { name := "result", value := .string "parent" }] }
        processInterfaces := [], scopes := []
        activities := [] } }

def primitive_success_maps_null_and_preserves_parent : Bool := decide <|
    completeBusinessEffect? [] (waiting "A") (effectId "A") (.success nullPatch) =
      some (completedAt "A" "normal")

def primitive_error_uses_each_active_attached_route : Bool := decide <|
    ["A", "B"].all (fun name =>
      completeBusinessEffect? [] (waiting name) (effectId name) (.bpmnError "REVIEW" none nullPatch) ==
        some (completedAt name "error")) = true

def primitive_error_rejects_extra_local_results : Bool := decide <|
    completeBusinessEffect? [] (waiting "A") (effectId "A")
      (.bpmnError "REVIEW" none ({ name := "extra", value := .null } :: nullPatch)) = none

def primitive_error_rejects_duplicate_waits : Bool := decide <|
    completeBusinessEffect? [] { waiting "A" with effectWaits := [effectWait "A", effectWait "A"] }
      (effectId "A") (.bpmnError "REVIEW" none nullPatch) = none

def primitive_error_refuses_wrong_code_and_stale_identity : Bool := decide <|
    completeBusinessEffect? [] (waiting "A") (effectId "A") (.bpmnError "OTHER" none nullPatch) = none ∧
    completeBusinessEffect? [] (waiting "B") (effectId "A") (.bpmnError "REVIEW" none nullPatch) = none

def primitive_error_maps_one_local_to_two_targets : Bool := decide <|
    completeBusinessEffect? [] { waiting "A" with effectWaits := [{ effectWait "A" with
      outputMappings := [{ target := "decision", expression := .localVariable "result" },
        { target := "status", expression := .localVariable "result" }] }] }
      (effectId "A") (.bpmnError "REVIEW" none nullPatch) =
      some { completedAt "A" "error" with variables :=
        { (completedAt "A" "error").variables with process :=
          { bindings := [{ name := "decision", value := .null },
            { name := "result", value := .string "parent" }, { name := "status", value := .null }] } } }

def primitive_error_without_outputs_accepts_exact_empty_patch : Bool := decide <|
    let state := { waiting "A" with effectWaits := [{ effectWait "A" with outputMappings := [] }] }
    completeBusinessEffect? [] state (effectId "A") (.bpmnError "REVIEW" none []) =
      some { completedAt "A" "error" with variables :=
        { (completedAt "A" "error").variables with process := (waiting "A").variables.process } } ∧
    completeBusinessEffect? [] state (effectId "A") (.bpmnError "REVIEW" none nullPatch) = none

def primitive_error_requires_one_exact_local_owner : Bool := decide <|
    [[], (waiting "A").variables.activities ++ (waiting "A").variables.activities,
      [{ owner := .effectOccurrence (effectId "B"), bindings := [] }]].all (fun activities =>
        completeBusinessEffect? [] { waiting "A" with variables := { (waiting "A").variables with activities } }
          (effectId "A") (.bpmnError "REVIEW" none nullPatch) == none) = true

def primitive_error_cannot_read_missing_result_from_parent : Bool := decide <|
    completeBusinessEffect? [] (waiting "A") (effectId "A") (.bpmnError "REVIEW" none []) = none

def invoiceService (id : String) : CheckedNode :=
  .serviceTask ⟨id⟩
    { protocol := "urn:bpmn-lean:effect-protocol:activity-v1", operation := "invoiceValidator" }
    [{ target := "payload", expression := .enclosingVariable "request" }]
    [{ target := "decision", expression := .localVariable "result" }]
    (some {
      boundaryEventId := ⟨id ++ "Boundary"⟩
      boundaryEventName := none
      attachedToRef := ⟨id⟩
      errorDefinitionId := ⟨id ++ "Catch"⟩
      errorElementId := ⟨"ReviewError"⟩
      errorName := some "Review"
      code := "REVIEW"
      outputFlowId := ⟨"error" ++ id⟩ })

def invoice : CheckedProcess :=
  let nodes : List CheckedNode :=
    [invoiceService "Authorize", .userTask ⟨"CorrectData"⟩ none none, .noneEndEvent ⟨"End"⟩,
     .userTask ⟨"Finalize"⟩ none none, .exclusiveMerge ⟨"Reentry"⟩, .userTask ⟨"Review"⟩ none none,
     .userTask ⟨"ReviewPolicy"⟩ none none, .noneStartEvent ⟨"Start"⟩, invoiceService "Validate"]
  let flows : List CheckedSequenceFlow :=
    [("authorize", "Validate", "Authorize"), ("begin", "Start", "Reentry"),
     ("errorAuthorize", "AuthorizeBoundary", "ReviewPolicy"),
     ("errorValidate", "ValidateBoundary", "CorrectData"), ("finalize", "Authorize", "Finalize"),
     ("finish", "Finalize", "End"), ("retryAuthorize", "ReviewPolicy", "Reentry"),
     ("retryValidate", "CorrectData", "Reentry"), ("review", "Reentry", "Review"),
     ("validate", "Review", "Validate")].map fun (id, source, target) =>
       { id := ⟨id⟩, sourceId := ⟨source⟩, targetId := ⟨target⟩ }
  { identity :=
      { semanticProfile := ⟨"cibseven-2.2.0-mixed-task-business-error-draft"⟩
        sourceId := ⟨"invoice-recovery"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000001"
        sourceOverlay := some {
          id := ⟨"invoice-handlers"⟩
          sha256 := "0000000000000000000000000000000000000000000000000000000000000002" } }
    processId := ⟨"Invoice"⟩
    nodes
    sequenceFlows := flows
    definitionScopes := [rootDefinitionScope ⟨"Invoice"⟩]
    nodeScopes := rootNodeScopes ⟨"Invoice"⟩ (nodes.map (·.id))
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"Invoice"⟩ (flows.map (·.id)) }

def invoiceProgram : Program := lowerCheckedProcess invoice

def invoiceReview : StimulusResult := applyStimulus 8 invoiceProgram initialState
  (.startProcess ⟨"start"⟩ ⟨"Invoice"⟩ ⟨"I"⟩ [{ name := "request", value := .string "submitted" }])

def invoiceValidation : StimulusResult := applyStimulus 8 invoiceProgram invoiceReview.state
  (.completeUserTaskInstance ⟨"review"⟩ ⟨⟨"I"⟩, ⟨"Review"⟩, 1⟩ [])

def invoiceCorrection : StimulusResult := applyStimulus 8 invoiceProgram invoiceValidation.state
  (.completeEffect ⟨"reject-validation"⟩ (effectId "Validate") (.bpmnError "REVIEW" none nullPatch))

def correctedReview : StimulusResult := applyStimulus 8 invoiceProgram invoiceCorrection.state
  (.completeUserTaskInstance ⟨"correct"⟩ ⟨⟨"I"⟩, ⟨"CorrectData"⟩, 1⟩
    [{ name := "request", value := .string "corrected" }])

def repeatedValidation : StimulusResult := applyStimulus 8 invoiceProgram correctedReview.state
  (.completeUserTaskInstance ⟨"review-again"⟩ ⟨⟨"I"⟩, ⟨"Review"⟩, 2⟩ [])

def invoiceAuthorization : StimulusResult := applyStimulus 8 invoiceProgram repeatedValidation.state
  (.completeEffect ⟨"validation-success"⟩ { effectId "Validate" with activation := 2 } (.success nullPatch))

def invoicePolicyReview : StimulusResult := applyStimulus 8 invoiceProgram invoiceAuthorization.state
  (.completeEffect ⟨"reject-authorization"⟩ (effectId "Authorize") (.bpmnError "REVIEW" none nullPatch))

def independent_invoice_admission : Bool := decide <|
    checkedWellFormed invoice = true ∧ programWellFormed invoiceProgram = true ∧
    programProfileCapabilitiesValid invoiceProgram = true

def actual_invoice_error_reaches_human_correction : Bool := decide <|
    invoiceReview.outcome = .committed ∧ invoiceValidation.outcome = .committed ∧
    invoiceCorrection.outcome = .committed ∧
    invoiceCorrection.state.waits.map (·.task.id.value) = ["CorrectData"] ∧
    invoiceCorrection.state.effectWaits = [] ∧ invoiceCorrection.state.variables.activities = []

def actual_rework_uses_fresh_identity_and_corrected_input : Bool := decide <|
    correctedReview.outcome = .committed ∧ repeatedValidation.outcome = .committed ∧
    repeatedValidation.state.effectWaits.map (fun wait => (wait.elementId.value, wait.activation, wait.arguments)) =
      [("Validate", 2, [{ name := "payload", value := .string "corrected" }])]

def second_service_catches_shared_code_at_its_own_boundary : Bool := decide <|
    invoiceAuthorization.outcome = .committed ∧ invoicePolicyReview.outcome = .committed ∧
    invoicePolicyReview.state.waits.map (·.task.id.value) = ["ReviewPolicy"]

def policyCorrectedReview : StimulusResult := applyStimulus 8 invoiceProgram invoicePolicyReview.state
  (.completeUserTaskInstance ⟨"policy-corrected"⟩ ⟨⟨"I"⟩, ⟨"ReviewPolicy"⟩, 1⟩ [])

def finalValidation : StimulusResult := applyStimulus 8 invoiceProgram policyCorrectedReview.state
  (.completeUserTaskInstance ⟨"final-review"⟩ ⟨⟨"I"⟩, ⟨"Review"⟩, 3⟩ [])

def finalAuthorization : StimulusResult := applyStimulus 8 invoiceProgram finalValidation.state
  (.completeEffect ⟨"validation-accepted"⟩ { effectId "Validate" with activation := 3 } (.success nullPatch))

def invoiceFinalization : StimulusResult := applyStimulus 8 invoiceProgram finalAuthorization.state
  (.completeEffect ⟨"authorization-accepted"⟩ { effectId "Authorize" with activation := 2 } (.success nullPatch))

def invoiceCompleted : StimulusResult := applyStimulus 8 invoiceProgram invoiceFinalization.state
  (.completeUserTaskInstance ⟨"finalize"⟩ ⟨⟨"I"⟩, ⟨"Finalize"⟩, 1⟩ [])

def actual_invoice_completes_after_both_recovery_paths : Bool := decide <|
    [policyCorrectedReview, finalValidation, finalAuthorization, invoiceFinalization, invoiceCompleted].all
      (·.outcome == .committed) = true ∧
    invoiceCompleted.state.control = .completed ⟨"I"⟩ ∧
    invoiceCompleted.state.waits = [] ∧ invoiceCompleted.state.effectWaits = [] ∧
    invoiceCompleted.state.variables.activities = []

def actual_repeated_wait_rejects_stale_code_and_incomplete_results : Bool := decide <|
    [(.completeEffect ⟨"stale"⟩ (effectId "Validate") (.bpmnError "REVIEW" none nullPatch)),
     (.completeEffect ⟨"wrong-code"⟩ { effectId "Validate" with activation := 2 }
       (.bpmnError "OTHER" none nullPatch)),
     (.completeEffect ⟨"missing-local"⟩ { effectId "Validate" with activation := 2 }
       (.bpmnError "REVIEW" none []))].all (fun command =>
      applyStimulus 8 invoiceProgram repeatedValidation.state command ==
        { outcome := .rejected, state := repeatedValidation.state,
          internalStepBoundExceeded := false, ambiguousInternalChoice := false }) = true

def previous_mixed_profile_keeps_error_routes_outside_its_scope : Bool := decide <|
    checkedWellFormed { invoice with identity :=
      { invoice.identity with semanticProfile := mixedTaskControlFlowProfileId } } = false ∧
    programProfileCapabilitiesValid { invoiceProgram with identity :=
      { invoiceProgram.identity with semanticProfile := mixedTaskControlFlowProfileId } } = false

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("error_bypass_requires_initial_value", error_bypass_requires_initial_value),
  ("writer_before_both_exits_supplies_value", writer_before_both_exits_supplies_value),
  ("recovery_write_cannot_initialize_first_entry", recovery_write_cannot_initialize_first_entry),
  ("error_continuation_exactly_eight_is_admitted", error_continuation_exactly_eight_is_admitted),
  ("error_continuation_nine_is_refused", error_continuation_nine_is_refused),
  ("wait_exit_order_does_not_hide_overlong_error_burst", wait_exit_order_does_not_hide_overlong_error_burst),
  ("internal_cycle_on_error_route_is_refused", internal_cycle_on_error_route_is_refused),
  ("shared_merge_retains_alternative_edge_multiplicity", shared_merge_retains_alternative_edge_multiplicity),
  ("human_wait_does_not_gain_alternative_exits", human_wait_does_not_gain_alternative_exits),
  ("primitive_success_maps_null_and_preserves_parent", primitive_success_maps_null_and_preserves_parent),
  ("primitive_error_uses_each_active_attached_route", primitive_error_uses_each_active_attached_route),
  ("primitive_error_rejects_extra_local_results", primitive_error_rejects_extra_local_results),
  ("primitive_error_rejects_duplicate_waits", primitive_error_rejects_duplicate_waits),
  ("primitive_error_refuses_wrong_code_and_stale_identity", primitive_error_refuses_wrong_code_and_stale_identity),
  ("primitive_error_maps_one_local_to_two_targets", primitive_error_maps_one_local_to_two_targets),
  ("primitive_error_without_outputs_accepts_exact_empty_patch", primitive_error_without_outputs_accepts_exact_empty_patch),
  ("primitive_error_requires_one_exact_local_owner", primitive_error_requires_one_exact_local_owner),
  ("primitive_error_cannot_read_missing_result_from_parent", primitive_error_cannot_read_missing_result_from_parent),
  ("independent_invoice_admission", independent_invoice_admission),
  ("actual_invoice_error_reaches_human_correction", actual_invoice_error_reaches_human_correction),
  ("actual_rework_uses_fresh_identity_and_corrected_input", actual_rework_uses_fresh_identity_and_corrected_input),
  ("second_service_catches_shared_code_at_its_own_boundary", second_service_catches_shared_code_at_its_own_boundary),
  ("actual_invoice_completes_after_both_recovery_paths", actual_invoice_completes_after_both_recovery_paths),
  ("actual_repeated_wait_rejects_stale_code_and_incomplete_results", actual_repeated_wait_rejects_stale_code_and_incomplete_results),
  ("previous_mixed_profile_keeps_error_routes_outside_its_scope", previous_mixed_profile_keeps_error_routes_outside_its_scope)
]

end BpmnSemantics.MixedTaskBusinessErrorConformance
