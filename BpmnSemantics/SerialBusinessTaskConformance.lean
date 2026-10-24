module

public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario

/-! Finite independent SBT witnesses retain the invoice review, validation, classification and finalization journey. They do not discharge the quantified reachable-progress obligation. -/

@[expose] public section

namespace BpmnSemantics.SerialBusinessTaskConformance
open BpmnSemantics.SemanticProcess

def descriptor (name : String) : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1", operation := name }

/-- SBT-RESULT-01 opts the private profile into null results; legacy mappings retain their refusal. -/
theorem legacy_result_contract_refuses_null_fanout :
    applyEffectResult []
      [{ target := "decision", expression := .localVariable "result" },
       { target := "status", expression := .localVariable "result" }]
      [{ name := "result", value := .string "parent" }]
      (.success [{ name := "result", value := .null }]) = none := by decide +kernel

def checked : CheckedProcess :=
  { identity :=
      { semanticProfile := serialBusinessTaskProfileId, sourceId := ⟨"invoice"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000001"
        sourceOverlay := some {
          id := ⟨"handlers"⟩
          sha256 := "0000000000000000000000000000000000000000000000000000000000000002" } }
    processId := ⟨"P"⟩
    definitionScopes := [rootDefinitionScope ⟨"P"⟩]
    nodeScopes := rootNodeScopes ⟨"P"⟩ [⟨"A"⟩, ⟨"B"⟩, ⟨"C"⟩, ⟨"D"⟩, ⟨"E"⟩, ⟨"F"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"P"⟩ [⟨"f1"⟩, ⟨"f2"⟩, ⟨"f3"⟩, ⟨"f4"⟩, ⟨"f5"⟩]
    nodes :=
      [.noneStartEvent ⟨"A"⟩, .userTask ⟨"B"⟩ (some "Review") none,
       .serviceTask ⟨"C"⟩ (descriptor "validateInvoice")
         [{ target := "echo", expression := .enclosingVariable "payload" },
          { target := "payload", expression := .enclosingVariable "request" }]
         [{ target := "decision", expression := .localVariable "result" },
          { target := "status", expression := .localVariable "result" }] none,
       .serviceTask ⟨"D"⟩ (descriptor "classifyInvoice")
         [{ target := "decision", expression := .enclosingVariable "decision" }]
         [{ target := "classification", expression := .localVariable "kind" }] none,
       .userTask ⟨"E"⟩ (some "Finalize") none, .noneEndEvent ⟨"F"⟩]
    sequenceFlows :=
      [{ id := ⟨"f1"⟩, sourceId := ⟨"A"⟩, targetId := ⟨"B"⟩ },
       { id := ⟨"f2"⟩, sourceId := ⟨"B"⟩, targetId := ⟨"C"⟩ },
       { id := ⟨"f3"⟩, sourceId := ⟨"C"⟩, targetId := ⟨"D"⟩ },
       { id := ⟨"f4"⟩, sourceId := ⟨"D"⟩, targetId := ⟨"E"⟩ },
       { id := ⟨"f5"⟩, sourceId := ⟨"E"⟩, targetId := ⟨"F"⟩ }] }

def program : Program := lowerCheckedProcess checked

def initialBindings : List VariableBinding :=
  [{ name := "payload", value := .string "parent" },
   { name := "request", value := .null }, { name := "result", value := .string "old" }]

def review : StimulusResult := applyStimulus 8 program initialState
  (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ initialBindings)

def validation : StimulusResult := applyStimulus 8 program review.state
  (.completeUserTaskInstance ⟨"review"⟩ ⟨⟨"I"⟩, ⟨"B"⟩, 1⟩
    [{ name := "request", value := .string "reviewed" }])

def validationId : EffectOccurrenceId := ⟨⟨"I"⟩, ⟨"C"⟩, 1⟩
def classificationId : EffectOccurrenceId := ⟨⟨"I"⟩, ⟨"D"⟩, 1⟩

def classification : StimulusResult := applyStimulus 8 program validation.state
  (.completeEffect ⟨"validate"⟩ validationId (.success [{ name := "result", value := .null }]))

def finalization : StimulusResult := applyStimulus 8 program classification.state
  (.completeEffect ⟨"classify"⟩ classificationId
    (.success [{ name := "kind", value := .string "manual" }]))

def completed : StimulusResult := applyStimulus 8 program finalization.state
  (.completeUserTaskInstance ⟨"finalize"⟩ ⟨⟨"I"⟩, ⟨"E"⟩, 1⟩ [])

theorem independent_chain_admission :
    checkedWellFormed checked = true ∧ programWellFormed program = true ∧
    programProfileCapabilitiesValid program = true := by decide +kernel

theorem required_input_analysis :
    (SerialBusinessTask.programAnalysis program).map (·.required) = some ["payload", "request"] := by
  decide +kernel

theorem explicit_null_start_reaches_review :
    review.outcome = .committed ∧ review.state.waits.map (·.task.id.value) = ["B"] := by
  decide +kernel

theorem review_arms_immutable_enclosing_arguments :
    validation.outcome = .committed ∧ validation.state.effectWaits.map (·.arguments) =
      [[{ name := "echo", value := .string "parent" },
        { name := "payload", value := .string "reviewed" }]] := by decide +kernel

theorem local_result_fanout_and_parent_frame :
    classification.outcome = .committed ∧
    classification.state.variables.process.bindings =
      [{ name := "decision", value := .null }, { name := "payload", value := .string "parent" },
       { name := "request", value := .string "reviewed" }, { name := "result", value := .string "old" },
       { name := "status", value := .null }] ∧
    classification.state.effectWaits.map (·.arguments) = [[{ name := "decision", value := .null }]] ∧
    classification.state.variables.activities.map (·.owner) = [.effectOccurrence classificationId] := by
  cbv

theorem complete_actual_serial_journey :
    finalization.outcome = .committed ∧ finalization.state.waits.map (·.task.id.value) = ["E"] ∧
    completed.outcome = .committed ∧ completed.state.control = .completed ⟨"I"⟩ ∧
    completed.state.effectWaits = [] ∧ completed.state.variables.activities = [] ∧
    completed.state.variables.process.bindings =
      [{ name := "classification", value := .string "manual" },
       { name := "decision", value := .null }, { name := "payload", value := .string "parent" },
       { name := "request", value := .string "reviewed" }, { name := "result", value := .string "old" },
       { name := "status", value := .null }] := by cbv

theorem missing_start_refuses :
    applyStimulus 8 program initialState (.startProcess ⟨"bad"⟩ ⟨"P"⟩ ⟨"I"⟩ []) =
      { outcome := .rejected, state := initialState,
        internalStepBoundExceeded := false, ambiguousInternalChoice := false } := by decide +kernel

theorem empty_instance_start_refuses :
    (admitStimulus program initialState
      (.startProcess ⟨"empty-instance"⟩ ⟨"P"⟩ ⟨""⟩ initialBindings)).outcome = .rejected ∧
    (admitStimulus program initialState
      (.startProcess ⟨"empty-instance"⟩ ⟨"P"⟩ ⟨""⟩ initialBindings)).state = initialState := by decide +kernel

theorem replayed_effect_refuses_unchanged :
    applyStimulus 8 program classification.state
      (.completeEffect ⟨"stale"⟩ validationId (.success [{ name := "result", value := .null }])) =
      { outcome := .rejected, state := classification.state,
        internalStepBoundExceeded := false, ambiguousInternalChoice := false } := by cbv

theorem incomplete_patch_refuses_unchanged :
    applyStimulus 8 program validation.state (.completeEffect ⟨"bad"⟩ validationId (.success [])) =
      { outcome := .rejected, state := validation.state,
        internalStepBoundExceeded := false, ambiguousInternalChoice := false } := by cbv

theorem engine_context_and_keyword_handlers_refuse :
    SerialBusinessTask.descriptorValid (descriptor "execution") = false ∧
    SerialBusinessTask.descriptorValid (descriptor "authenticatedUserId") = false ∧
    SerialBusinessTask.descriptorValid (descriptor "empty") = false := by decide +kernel

theorem snapshot_survives_parent_change :
    serialRuntimeAssociationsValid program
      { validation.state with variables := { validation.state.variables with
        process := { bindings := [{ name := "payload", value := .string "changed" },
          { name := "request", value := .string "later" }] } } } = true := by cbv

theorem chained_input_nonlaw :
    evaluateEnclosingInputMappings
      [{ name := "payload", value := .string "parent" }, { name := "request", value := .string "reviewed" }]
      [{ target := "payload", expression := .enclosingVariable "request" },
       { target := "echo", expression := .enclosingVariable "payload" }] =
      some [{ name := "echo", value := .string "parent" }, { name := "payload", value := .string "reviewed" }] := by
  cbv

theorem old_profile_does_not_admit_business_handlers :
    programProfileCapabilitiesValid { program with identity := { program.identity with
      semanticProfile := ⟨"cibseven-2.0.0-mapped-success-service-task-draft"⟩ } } = false := by
  decide +kernel

theorem malformed_result_classes_refuse :
    [ [{ name := "result", value := .boolean true }],
      [{ name := "private", value := .string "x" }, { name := "result", value := .null }],
      [{ name := "result", value := .null }, { name := "result", value := .null }],
      [{ name := "decision", value := .null }] ].all (fun patch =>
        let result := applyStimulus 8 program validation.state
          (.completeEffect ⟨"bad"⟩ validationId (.success patch))
        result.outcome == .rejected && result.state == validation.state) = true := by cbv

theorem second_distinct_source_cannot_partially_write :
    serialEffectPatch? []
      [{ target := "a", expression := .localVariable "x" },
       { target := "b", expression := .localVariable "y" }]
      [{ name := "a", value := .string "old" }] [{ name := "x", value := .string "new" }] = none := by
  decide +kernel

theorem empty_mapping_accepts_exact_empty_patch :
    serialEffectPatch? [] [] initialBindings [] = some initialBindings ∧
    serialEffectPatch? [] [] initialBindings [{ name := "extra", value := .null }] = none := by
  decide +kernel

theorem handler_shadowing_refuses_bindings_and_mapping :
    SerialBusinessTask.bindingsValid ["validateInvoice"]
      [{ name := "validateInvoice", value := .null }] = false ∧
    SerialBusinessTask.mappingsValid ["validateInvoice"]
      [{ target := "request", expression := .enclosingVariable "validateInvoice" }] [] = false := by
  decide +kernel

theorem duplicate_identity_and_disconnected_chain_refuse :
    (SerialBusinessTask.analyze
      [{ id := "start", kind := .start, outputs := ["human"] },
       { id := "human", kind := .human, outputs := ["service"] },
       { id := "service", kind := .service, outputs := ["end"] },
       { id := "end", kind := .finish, outputs := [] },
       { id := "extra", kind := .human, outputs := ["extra"] }]).isNone = true ∧
    checkedWellFormed { checked with nodes := checked.nodes ++ [.userTask ⟨"B"⟩ none none] } = false := by
  decide +kernel


end BpmnSemantics.SerialBusinessTaskConformance
