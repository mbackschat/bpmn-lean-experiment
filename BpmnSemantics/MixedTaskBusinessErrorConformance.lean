import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmissionLaws
import BpmnSemantics.SemanticProcess.EffectCompletion
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! MBERR-DATA-01 and MBERR-PROGRESS-01 separate exceptional continuations from normal-only graph analysis. MBERR-MAP-01 and MBERR-REFUSE-01 check primitive mapping, routing and ownership. These constructed witnesses do not establish public command admission or reachable execution. -/

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

theorem error_bypass_requires_initial_value :
    (analyze exceptionalBypass).map (·.required) = some ["value"] := by decide +kernel

theorem writer_before_both_exits_supplies_value :
    (analyze (exceptionalBypass.map fun vertex =>
      if vertex.id == "check" then { vertex with writes := ["value"] } else vertex)).map
        (·.required) = some [] := by decide +kernel

def recoveryLoop : List Vertex :=
  [{ id := "start", kind := .start, outputs := ["retry"] },
   { id := "retry", kind := .merge, outputs := ["check"] },
   { id := "check", kind := .service, outputs := ["end", "correct"], reads := ["value"] },
   { id := "correct", kind := .service, outputs := ["retry"], writes := ["value"] },
   { id := "end", kind := .finish, outputs := [] }]

theorem recovery_write_cannot_initialize_first_entry :
    (analyze recoveryLoop).map (fun result => (result.required, result.maximumBurst)) =
      some (["value"], 3) := by decide +kernel

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

theorem error_continuation_exactly_eight_is_admitted :
    (analyze (exceptionalBurst 5)).map (·.maximumBurst) = some 8 := by decide +kernel

theorem error_continuation_nine_is_refused :
    analyze (exceptionalBurst 6) = none := by decide +kernel

theorem wait_exit_order_does_not_hide_overlong_error_burst :
    analyze ((exceptionalBurst 6).map fun vertex =>
      if vertex.id == "check" then { vertex with outputs := vertex.outputs.reverse } else vertex) =
      none := by decide +kernel

theorem internal_cycle_on_error_route_is_refused :
    analyze
      [{ id := "start", kind := .start, outputs := ["check"] },
       { id := "check", kind := .service, outputs := ["normal", "cycle"] },
       { id := "normal", kind := .human, outputs := ["exit"] },
       { id := "cycle", kind := .merge, outputs := ["choice"] },
       { id := "choice", kind := .choice, outputs := ["cycle", "exit"] },
       { id := "exit", kind := .merge, outputs := ["end"] },
       { id := "end", kind := .finish, outputs := [] }] = none := by decide +kernel

theorem shared_merge_retains_alternative_edge_multiplicity :
    (analyze
      [{ id := "start", kind := .start, outputs := ["check"] },
       { id := "check", kind := .service, outputs := ["merge", "merge"] },
       { id := "merge", kind := .merge, outputs := ["end"] },
       { id := "end", kind := .finish, outputs := [] }]).map (·.maximumBurst) = some 3 := by
  decide +kernel

theorem human_wait_does_not_gain_alternative_exits :
    analyze (exceptionalBypass.map fun vertex =>
      if vertex.id == "check" then { vertex with kind := .human } else vertex) = none := by
  decide +kernel

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

theorem primitive_success_maps_null_and_preserves_parent :
    completeBusinessEffect? [] (waiting "A") (effectId "A") (.success nullPatch) =
      some (completedAt "A" "normal") := by decide +kernel

theorem primitive_error_uses_each_active_attached_route :
    ["A", "B"].all (fun name =>
      completeBusinessEffect? [] (waiting name) (effectId name) (.bpmnError "REVIEW" none nullPatch) ==
        some (completedAt name "error")) = true := by decide +kernel

theorem primitive_error_rejects_extra_local_results :
    completeBusinessEffect? [] (waiting "A") (effectId "A")
      (.bpmnError "REVIEW" none ({ name := "extra", value := .null } :: nullPatch)) = none := by
  decide +kernel

theorem primitive_error_rejects_duplicate_waits :
    completeBusinessEffect? [] { waiting "A" with effectWaits := [effectWait "A", effectWait "A"] }
      (effectId "A") (.bpmnError "REVIEW" none nullPatch) = none := by decide +kernel

theorem primitive_error_refuses_wrong_code_and_stale_identity :
    completeBusinessEffect? [] (waiting "A") (effectId "A") (.bpmnError "OTHER" none nullPatch) = none ∧
    completeBusinessEffect? [] (waiting "B") (effectId "A") (.bpmnError "REVIEW" none nullPatch) = none := by
  decide +kernel

theorem primitive_error_maps_one_local_to_two_targets :
    completeBusinessEffect? [] { waiting "A" with effectWaits := [{ effectWait "A" with
      outputMappings := [{ target := "decision", expression := .localVariable "result" },
        { target := "status", expression := .localVariable "result" }] }] }
      (effectId "A") (.bpmnError "REVIEW" none nullPatch) =
      some { completedAt "A" "error" with variables :=
        { (completedAt "A" "error").variables with process :=
          { bindings := [{ name := "decision", value := .null },
            { name := "result", value := .string "parent" }, { name := "status", value := .null }] } } } := by
  decide +kernel

theorem primitive_error_without_outputs_accepts_exact_empty_patch :
    let state := { waiting "A" with effectWaits := [{ effectWait "A" with outputMappings := [] }] }
    completeBusinessEffect? [] state (effectId "A") (.bpmnError "REVIEW" none []) =
      some { completedAt "A" "error" with variables :=
        { (completedAt "A" "error").variables with process := (waiting "A").variables.process } } ∧
    completeBusinessEffect? [] state (effectId "A") (.bpmnError "REVIEW" none nullPatch) = none := by
  decide +kernel

theorem primitive_error_requires_one_exact_local_owner :
    [[], (waiting "A").variables.activities ++ (waiting "A").variables.activities,
      [{ owner := .effectOccurrence (effectId "B"), bindings := [] }]].all (fun activities =>
        completeBusinessEffect? [] { waiting "A" with variables := { (waiting "A").variables with activities } }
          (effectId "A") (.bpmnError "REVIEW" none nullPatch) == none) = true := by decide +kernel

theorem primitive_error_cannot_read_missing_result_from_parent :
    completeBusinessEffect? [] (waiting "A") (effectId "A") (.bpmnError "REVIEW" none []) = none := by
  decide +kernel

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

theorem independent_invoice_admission :
    checkedWellFormed invoice = true ∧ programWellFormed invoiceProgram = true ∧
    programProfileCapabilitiesValid invoiceProgram = true := by decide +kernel

theorem actual_invoice_error_reaches_human_correction :
    invoiceReview.outcome = .committed ∧ invoiceValidation.outcome = .committed ∧
    invoiceCorrection.outcome = .committed ∧
    invoiceCorrection.state.waits.map (·.task.id.value) = ["CorrectData"] ∧
    invoiceCorrection.state.effectWaits = [] ∧ invoiceCorrection.state.variables.activities = [] := by
  decide +kernel

theorem actual_rework_uses_fresh_identity_and_corrected_input :
    correctedReview.outcome = .committed ∧ repeatedValidation.outcome = .committed ∧
    repeatedValidation.state.effectWaits.map (fun wait => (wait.elementId.value, wait.activation, wait.arguments)) =
      [("Validate", 2, [{ name := "payload", value := .string "corrected" }])] := by decide +kernel

theorem second_service_catches_shared_code_at_its_own_boundary :
    invoiceAuthorization.outcome = .committed ∧ invoicePolicyReview.outcome = .committed ∧
    invoicePolicyReview.state.waits.map (·.task.id.value) = ["ReviewPolicy"] := by decide +kernel

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

theorem actual_invoice_completes_after_both_recovery_paths :
    [policyCorrectedReview, finalValidation, finalAuthorization, invoiceFinalization, invoiceCompleted].all
      (·.outcome == .committed) = true ∧
    invoiceCompleted.state.control = .completed ⟨"I"⟩ ∧
    invoiceCompleted.state.waits = [] ∧ invoiceCompleted.state.effectWaits = [] ∧
    invoiceCompleted.state.variables.activities = [] := by decide +kernel

theorem actual_repeated_wait_rejects_stale_code_and_incomplete_results :
    [(.completeEffect ⟨"stale"⟩ (effectId "Validate") (.bpmnError "REVIEW" none nullPatch)),
     (.completeEffect ⟨"wrong-code"⟩ { effectId "Validate" with activation := 2 }
       (.bpmnError "OTHER" none nullPatch)),
     (.completeEffect ⟨"missing-local"⟩ { effectId "Validate" with activation := 2 }
       (.bpmnError "REVIEW" none []))].all (fun command =>
      applyStimulus 8 invoiceProgram repeatedValidation.state command ==
        { outcome := .rejected, state := repeatedValidation.state,
          internalStepBoundExceeded := false, ambiguousInternalChoice := false }) = true := by decide +kernel

theorem previous_mixed_profile_keeps_error_routes_outside_its_scope :
    checkedWellFormed { invoice with identity :=
      { invoice.identity with semanticProfile := mixedTaskControlFlowProfileId } } = false ∧
    programProfileCapabilitiesValid { invoiceProgram with identity :=
      { invoiceProgram.identity with semanticProfile := mixedTaskControlFlowProfileId } } = false := by
  decide +kernel

end BpmnSemantics.MixedTaskBusinessErrorConformance
