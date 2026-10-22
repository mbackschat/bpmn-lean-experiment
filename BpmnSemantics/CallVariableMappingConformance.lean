import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.Scenario

/-! # Call variable mapping conformance

Finite checked witnesses of the nested scope-data profile's mapped Call run the loan application's
verification through the actual external dispatcher: a root-path Call copies `applicant` and `amount`
into the called-root frame, the called tasks write the namesake `amount` and the output source
`verdict`, and the return lands `decision` and `echoedCustomer` at the Process, where the review
Sub-Process initializes its frame from `decision`. Each step is one dispatcher evaluation and the
theorems only read its result; the quantified laws are in
[CallVariableMappingLaws](SemanticProcess/CallVariableMappingLaws.lean), and the rule-to-witness table
is the [Call variable mapping specification](../docs/capsules/CALL-VARIABLE-MAPPING-SPEC.md#separating-witnesses)'s.
-/

namespace BpmnSemantics.CallVariableMappingConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩

private def enclosing (target name : String) : VariableMapping :=
  { target, expression := .enclosingVariable name }

private def fromLocal (target name : String) : VariableMapping :=
  { target, expression := .localVariable name }

private def owned (scopeName : String) (ids : List String) : List NodeScopeOwnership :=
  ids.map fun id => { nodeId := ⟨id⟩, scopeId := scope scopeName }

private def flowsIn (scopeName : String) (ids : List String) : List SequenceFlowScopeOwnership :=
  ids.map fun id => { sequenceFlowId := ⟨id⟩, scopeId := scope scopeName }

private def flow (id source target : String) : CheckedSequenceFlow :=
  { id := ⟨id⟩, sourceId := ⟨source⟩, targetId := ⟨target⟩ }

def inputs : List VariableMapping := [enclosing "amount" "amount", enclosing "customer" "applicant"]
def outputs : List VariableMapping := [fromLocal "decision" "verdict", fromLocal "echoedCustomer" "customer"]

/-- Review: `decision` starts from the Process value the Call returned, and the reviewer's decision is
published back to it. -/
def reviewRecord : ScopeLocalData :=
  { scopeId := scope "R", localInputs := [enclosing "decision" "decision"],
    localOutputs := [fromLocal "decision" "decision"] }

/-- Caller `P`: Start, Call `V`, review Sub-Process `R`, End; review: Start, *Confirm decision*, End;
called `Q`: Start, *Collect document*, *Record verdict*, End. `nested` moves the Call into the review. -/
def checkedWith (nested : Bool) (calledProcess : String) (copiedIn copiedOut : List VariableMapping)
    (calledTask : CheckedNode) : CheckedProcess :=
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"loan-application"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000001"
        sourceOverlay := some
          { id := ⟨"handlers"⟩
            sha256 := "0000000000000000000000000000000000000000000000000000000000000002" } }
    processId := ⟨"P"⟩
    definitionScopes :=
      [ { id := scope "P", parentScopeId := none, originElementId := ⟨"P"⟩ }
      , { id := scope "Q", parentScopeId := none, originElementId := ⟨"Q"⟩ }
      , { id := scope "R", parentScopeId := some (scope "P"), originElementId := ⟨"R"⟩ } ]
    nodeScopes := owned "P" ["A"] ++ owned "Q" ["QA", "QU", "QV", "QZ"] ++ owned "P" ["R"] ++
      owned "R" ["RA", "RU", "RZ"] ++ owned (if nested then "R" else "P") ["V"] ++ owned "P" ["Z"]
    sequenceFlowScopes := (if nested then flowsIn "P" ["f1", "f3"] ++ flowsIn "R" ["f2", "f4", "f5"]
        else flowsIn "P" ["f1", "f2", "f3"] ++ flowsIn "R" ["f4", "f5"]) ++ flowsIn "Q" ["f6", "f7", "f8"]
    nodes :=
      [ .noneStartEvent ⟨"A"⟩, .noneStartEvent ⟨"QA"⟩, calledTask
      , .userTask ⟨"QV"⟩ (some "Record verdict"), .noneEndEvent ⟨"QZ"⟩
      , .embeddedSubProcess ⟨"R"⟩ (scope "R"), .noneStartEvent ⟨"RA"⟩
      , .userTask ⟨"RU"⟩ (some "Confirm decision"), .noneEndEvent ⟨"RZ"⟩
      , .callActivity ⟨"V"⟩ ⟨calledProcess⟩ (.variableMappings copiedIn copiedOut), .noneEndEvent ⟨"Z"⟩ ]
    sequenceFlows :=
      (if nested then [flow "f1" "A" "R", flow "f2" "RA" "V", flow "f3" "R" "Z", flow "f4" "V" "RU"]
        else [flow "f1" "A" "V", flow "f2" "V" "R", flow "f3" "R" "Z", flow "f4" "RA" "RU"]) ++
      [ flow "f5" "RU" "RZ", flow "f6" "QA" "QU", flow "f7" "QU" "QV", flow "f8" "QV" "QZ" ]
    scopeLocalData := [reviewRecord] }

def collectDocument : CheckedNode := .userTask ⟨"QU"⟩ (some "Collect document")

def checked : CheckedProcess := checkedWith false "Q" inputs outputs collectDocument

def program : Program := lowerCheckedProcess checked

def text (value : String) : VariableValue := .string value

def calledInstance : SemanticId := deriveCalledProcessInstanceId ⟨"I"⟩ ⟨"V"⟩ 1

def calledTask (element : String) : UserTaskInstanceId :=
  { processInstanceId := calledInstance, elementId := ⟨element⟩, activation := 1 }

def start (bindings : List VariableBinding) : StimulusResult :=
  applyStimulus 8 program initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ bindings)

def started : StimulusResult :=
  start [{ name := "amount", value := text "25000" }, { name := "applicant", value := text "Ada" }]

def collect (task : UserTaskInstanceId) (patch : List VariableBinding) : StimulusResult :=
  applyStimulus 8 program started.state (.completeUserTaskInstance ⟨"collect"⟩ task patch)

def collected : StimulusResult := collect (calledTask "QU") [{ name := "amount", value := text "1" }]

def recordVerdict (state : RuntimeState) (patch : List VariableBinding) : StimulusResult :=
  applyStimulus 8 program state (.completeUserTaskInstance ⟨"verdict"⟩ (calledTask "QV") patch)

def returned : StimulusResult := recordVerdict collected.state [{ name := "verdict", value := text "approved" }]

def confirmed : StimulusResult :=
  applyStimulus 8 program returned.state (.completeUserTaskInstance ⟨"confirm"⟩
    { processInstanceId := ⟨"I"⟩, elementId := ⟨"RU"⟩, activation := 1 } [{ name := "decision", value := text "referred" }])

private def calledFrames (state : RuntimeState) : List (List VariableBinding) :=
  (state.variables.scopes.filter (·.owner.processInstanceId == calledInstance)).map (·.bindings)

private def refusedUnchanged (result : StimulusResult) (before : RuntimeState) : Bool :=
  result.outcome == .rejected && result.state == before

private def analysisOf (source : CheckedProcess) : Option NestedScopeData.Analysis :=
  NestedScopeData.checkedAnalysis source

theorem loan_definition_is_admitted :
    checkedWellFormed checked = true ∧ programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧
      definitionBindingValid checked program = true := by
  decide +kernel

def serviceCalledTask : CheckedNode :=
  .serviceTask ⟨"QU"⟩ { protocol := "urn:bpmn-lean:effect-protocol:activity-v1", operation := "collect" } [] [] none

/-- CVM-ADMIT-01: a Call inside the review Sub-Process is PC-SCOPE-05's placement and is refused. -/
theorem call_inside_a_sub_process_is_refused :
    (analysisOf (checkedWith true "Q" inputs outputs collectDocument)).isNone = true := by
  decide +kernel

/-- CVM-ADMIT-01: a called Process with a Service Task is refused. -/
theorem called_service_task_is_refused :
    (analysisOf (checkedWith false "Q" inputs outputs serviceCalledTask)).isNone = true := by
  decide +kernel

/-- CVM-RESOLVE-01: a `calledElement` naming the caller is refused. -/
theorem call_of_the_caller_is_refused :
    (analysisOf (checkedWith false "P" inputs outputs collectDocument)).isNone = true := by
  decide +kernel

/-- CVM-RESOLVE-01: a `calledElement` naming no Process of the definitions is refused. -/
theorem call_of_an_absent_process_is_refused :
    (analysisOf (checkedWith false "Absent" inputs outputs collectDocument)).isNone = true := by
  decide +kernel

/-- CVM-ADMIT-01: an output targeting a name CIB reserves for multi-instance bookkeeping is refused. -/
theorem reserved_output_target_is_refused :
    (analysisOf (checkedWith false "Q" inputs [fromLocal "nrOfInstances" "verdict"] collectDocument)).isNone =
      true := by
  decide +kernel

/-- CVM-ADMIT-01: a duplicate input target is refused. -/
theorem duplicate_input_target_is_refused :
    (analysisOf (checkedWith false "Q" (inputs ++ [enclosing "amount" "applicant"]) outputs
      collectDocument)).isNone = true := by
  decide +kernel

/-- CVM-AVAILABLE-01 and CVM-START-01: the review's read of `decision` is produced by the Call's output,
so nothing is required, and the admitted Start names are the input sources and the output targets
landing at the Process. -/
theorem call_outputs_count_as_writes :
    (analysisOf checked).map (fun analysis => (analysis.required, analysis.optional)) =
      some ([], some ["amount", "applicant", "decision", "echoedCustomer"]) := by
  decide +kernel

/-- CVM-AVAILABLE-01's separating case: without the `decision` output the review's read is required. -/
theorem without_the_output_the_read_is_required :
    (analysisOf (checkedWith false "Q" inputs [fromLocal "echoedCustomer" "customer"] collectDocument)).map
      (·.required) = some ["decision"] := by
  decide +kernel

/-- CVM-START-01: a Process-level output target is an admitted Start name. -/
theorem start_admits_a_process_output_target :
    (start [{ name := "amount", value := text "1" }, { name := "decision", value := text "old" }]).outcome =
      .committed := by
  decide +kernel

/-- CVM-START-01: a called-only name is a rejection. -/
theorem start_rejects_a_called_only_name :
    refusedUnchanged (start [{ name := "amount", value := text "1" }, { name := "customer", value := text "Ada" }])
      initialState = true := by
  decide +kernel

/-- CVM-START-01: a called output source is a rejection. -/
theorem start_rejects_a_called_output_source :
    refusedUnchanged (start [{ name := "amount", value := text "1" }, { name := "verdict", value := text "x" }])
      initialState = true := by
  decide +kernel

/-- CVM-IN-01: the called-root frame holds exactly the copied input targets. -/
theorem invocation_installs_the_copied_snapshot :
    (started.outcome == .committed &&
      calledFrames started.state == [[{ name := "amount", value := text "25000" },
        { name := "customer", value := text "Ada" }]]) = true := by
  decide +kernel

/-- CVM-IN-01: an absent input source is a present null in the called-root frame. -/
theorem absent_input_source_copies_a_present_null :
    calledFrames (start [{ name := "amount", value := text "25000" }]).state ==
      [[{ name := "amount", value := text "25000" }, { name := "customer", value := .null }]] := by
  decide +kernel

/-- The nearest non-law: the caller Process holds `applicant`, yet a called read of it is absent, so
resolving through the caller hierarchy is not the isolated read. -/
theorem called_reads_do_not_reach_the_caller_namesake :
    (started.state.variables.process.bindings.any (· == { name := "applicant", value := text "Ada" }) &&
      NestedScopeData.readOutcome? program started.state.variables calledInstance (scope "Q") "applicant" ==
        some none) = true := by
  decide +kernel

/-- CVM-TASK-01: a called patch naming a caller-only name is rejected unchanged. -/
theorem called_patch_of_a_caller_name_is_rejected :
    refusedUnchanged (collect (calledTask "QU") [{ name := "applicant", value := text "Eve" }]) started.state =
      true := by
  decide +kernel

/-- CVM-TASK-01: a called patch naming one name twice is rejected unchanged. -/
theorem called_patch_with_a_duplicate_name_is_rejected :
    refusedUnchanged (collect (calledTask "QU")
      [{ name := "amount", value := text "1" }, { name := "amount", value := text "2" }]) started.state = true := by
  decide +kernel

/-- CVM-REFUSE-01: a called completion addressed with the caller instance is rejected unchanged. -/
theorem caller_addressed_called_completion_is_rejected :
    refusedUnchanged (collect { calledTask "QU" with processInstanceId := ⟨"I"⟩ } []) started.state = true := by
  decide +kernel

/-- CVM-ISOLATE-01: the called write of the namesake `amount` stays in the called frame. -/
theorem called_writes_stay_in_the_called_frame :
    (collected.outcome == .committed &&
      calledFrames collected.state == [[{ name := "amount", value := text "1" },
        { name := "customer", value := text "Ada" }]] &&
      collected.state.variables.process.bindings ==
        [{ name := "amount", value := text "25000" }, { name := "applicant", value := text "Ada" }]) = true := by
  decide +kernel

/-- CVM-OUT-01 and CVM-RETIRE-01: the outputs land at the Process, the called frame is gone and the
review frame starts from the returned `decision`. -/
theorem return_lands_outputs_and_retires_the_called_frame :
    (returned.outcome == .committed && calledFrames returned.state == [] &&
      returned.state.variables.scopes.map (·.bindings) == [[{ name := "decision", value := text "approved" }]] &&
      returned.state.variables.process.bindings ==
        [{ name := "amount", value := text "25000" }, { name := "applicant", value := text "Ada" },
         { name := "decision", value := text "approved" }, { name := "echoedCustomer", value := text "Ada" }]) =
      true := by
  decide +kernel

/-- CVM-RETIRE-01: a called completion after return is rejected because its wait is gone. -/
theorem stale_called_completion_is_rejected :
    refusedUnchanged (recordVerdict returned.state []) returned.state = true := by
  decide +kernel

/-- The review overrides the returned verdict in its frame and publishes it back to the Process. -/
theorem review_publishes_the_overridden_decision :
    (confirmed.outcome == .committed && confirmed.state.control == .completed ⟨"I"⟩ &&
      confirmed.state.variables.process.bindings.filter (·.name == "decision") ==
        [{ name := "decision", value := text "referred" }]) = true := by
  decide +kernel

def unsetVerdict : StimulusResult :=
  let begun := start [{ name := "amount", value := text "25000" }, { name := "decision", value := text "old" }]
  let collectedNothing := applyStimulus 8 program begun.state
    (.completeUserTaskInstance ⟨"collect"⟩ (calledTask "QU") [])
  recordVerdict collectedNothing.state []

/-- CVM-OUT-01: an output source the callee never sets overwrites the Start `decision` with null. -/
theorem unset_output_source_overwrites_with_null :
    (unsetVerdict.outcome == .committed &&
      unsetVerdict.state.variables.process.bindings.filter (fun binding =>
          binding.name == "decision" || binding.name == "echoedCustomer") ==
        [{ name := "decision", value := .null }, { name := "echoedCustomer", value := .null }]) = true := by
  decide +kernel

end BpmnSemantics.CallVariableMappingConformance
