module

public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # Call variable mapping conformance

Finite checked witnesses of the nested scope-data profile's mapped Call run the loan application's
verification through the actual external dispatcher: a root-path Call copies `applicant` and `amount`
into the called-root frame, the called tasks write the namesake `amount` and the output source
`verdict`, and the return lands `decision` and `echoedCustomer` at the Process, where the review
Sub-Process initializes its frame from `decision`. Each step is one dispatcher evaluation and the
checks only read its result; the quantified laws are in
[CallVariableMappingLaws](SemanticProcess/CallVariableMappingLaws.lean), and the rule-to-witness table
is the [Call variable mapping specification](../docs/capsules/CALL-VARIABLE-MAPPING-SPEC.md#separating-witnesses)'s.
-/

@[expose] public section

namespace BpmnSemantics.CallVariableMappingConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩

def enclosing (target name : String) : VariableMapping :=
  { target, expression := .enclosingVariable name }

def fromLocal (target name : String) : VariableMapping :=
  { target, expression := .localVariable name }

def owned (scopeName : String) (ids : List String) : List NodeScopeOwnership :=
  ids.map fun id => { nodeId := ⟨id⟩, scopeId := scope scopeName }

def flowsIn (scopeName : String) (ids : List String) : List SequenceFlowScopeOwnership :=
  ids.map fun id => { sequenceFlowId := ⟨id⟩, scopeId := scope scopeName }

def flow (id source target : String) : CheckedSequenceFlow :=
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

def calledFrames (state : RuntimeState) : List (List VariableBinding) :=
  (state.variables.scopes.filter (·.owner.processInstanceId == calledInstance)).map (·.bindings)

def refusedUnchanged (result : StimulusResult) (before : RuntimeState) : Bool :=
  result.outcome == .rejected && result.state == before

def analysisOf (source : CheckedProcess) : Option NestedScopeData.Analysis :=
  NestedScopeData.checkedAnalysis source

def loan_definition_is_admitted : Bool := decide <|
    checkedWellFormed checked = true ∧ programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧
      definitionBindingValid checked program = true

def serviceCalledTask : CheckedNode :=
  .serviceTask ⟨"QU"⟩ { protocol := "urn:bpmn-lean:effect-protocol:activity-v1", operation := "collect" } [] [] none

/-- CALLN-ADMIT-01, Stage B: a Call on the serial path of the review Sub-Process is admitted under this profile. -/
def call_inside_a_sub_process_is_admitted : Bool := decide <|
    (analysisOf (checkedWith true "Q" inputs outputs collectDocument)).isSome = true

/-- CVM-ADMIT-01: a called Process with a Service Task is refused. -/
def called_service_task_is_refused : Bool := decide <|
    (analysisOf (checkedWith false "Q" inputs outputs serviceCalledTask)).isNone = true

/-- CVM-RESOLVE-01: a `calledElement` naming the caller is refused. -/
def call_of_the_caller_is_refused : Bool := decide <|
    (analysisOf (checkedWith false "P" inputs outputs collectDocument)).isNone = true

/-- CVM-RESOLVE-01: a `calledElement` naming no Process of the definitions is refused. -/
def call_of_an_absent_process_is_refused : Bool := decide <|
    (analysisOf (checkedWith false "Absent" inputs outputs collectDocument)).isNone = true

/-- The serial path of one scope, from its Start to its End, with one flow per consecutive pair. -/
def serialFlows (path : List String) : List CheckedSequenceFlow :=
  (path.zip path.tail).map fun (source, target) => flow (source ++ "-" ++ target) source target

/-- Caller `P`: Start, `R1`, End; each `Ri` below the innermost holds Start, `R(i+1)`, End; the innermost `R<depth>`
holds Start, then one mapped Call `V1`, `V2`, … per entry of `calledProcesses`, in order, then End. Each named called
Process `X` is Start, *Collect document*, End. `depth` must be positive, since the profile requires a Sub-Process. -/
def nestedCalls (depth : Nat) (calledProcesses : List String) : CheckedProcess :=
  let subProcess (level : Nat) : String := "R" ++ toString level
  let innermost := subProcess depth
  let calls := (List.range calledProcesses.length).zip calledProcesses |>.map fun (index, called) =>
    ("V" ++ toString (index + 1), called)
  let called := calledProcesses.eraseDups
  let paths : List (String × List String) :=
    ("P", ["A", "R1", "Z"]) ::
      ((List.range (depth - 1)).map fun index =>
        (subProcess (index + 1), [subProcess (index + 1) ++ "A", subProcess (index + 2), subProcess (index + 1) ++ "Z"])) ++
      [(innermost, [innermost ++ "A"] ++ calls.map (·.1) ++ [innermost ++ "Z"])] ++
      called.map fun name => (name, [name ++ "A", name ++ "U", name ++ "Z"])
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"nested-calls"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000001"
        sourceOverlay := some
          { id := ⟨"handlers"⟩
            sha256 := "0000000000000000000000000000000000000000000000000000000000000002" } }
    processId := ⟨"P"⟩
    definitionScopes :=
      { id := scope "P", parentScopeId := none, originElementId := ⟨"P"⟩ } ::
        called.map (fun name => { id := scope name, parentScopeId := none, originElementId := ⟨name⟩ }) ++
        (List.range depth).map fun index =>
          { id := scope (subProcess (index + 1)), originElementId := ⟨subProcess (index + 1)⟩
            parentScopeId := some (scope (if index = 0 then "P" else subProcess index)) }
    nodeScopes := paths.flatMap fun (owner, path) => owned owner path
    sequenceFlowScopes := paths.flatMap fun (owner, path) =>
      flowsIn owner ((serialFlows path).map (·.id.value))
    nodes :=
      [.noneStartEvent ⟨"A"⟩, .noneEndEvent ⟨"Z"⟩] ++
        ((List.range depth).flatMap fun index =>
          [.embeddedSubProcess ⟨subProcess (index + 1)⟩ (scope (subProcess (index + 1))),
            .noneStartEvent ⟨subProcess (index + 1) ++ "A"⟩, .noneEndEvent ⟨subProcess (index + 1) ++ "Z"⟩]) ++
        calls.map (fun (id, calledProcess) =>
          .callActivity ⟨id⟩ ⟨calledProcess⟩ (.variableMappings inputs outputs)) ++
        called.flatMap fun name =>
          [.noneStartEvent ⟨name ++ "A"⟩, .userTask ⟨name ++ "U"⟩ (some "Collect document"), .noneEndEvent ⟨name ++ "Z"⟩]
    sequenceFlows := paths.flatMap fun (_, path) => serialFlows path }

/-- CALLN-ADMIT-01, Stage B depth bound: two Calls two Sub-Processes deep are admitted, and one Call three deep is
refused although the three Sub-Processes alone are admitted. -/
def call_depth_bound_is_two : Bool := decide <|
    (analysisOf (nestedCalls 2 ["Q", "Q"])).isSome = true ∧ (analysisOf (nestedCalls 3 [])).isSome = true ∧
      (analysisOf (nestedCalls 3 ["Q"])).isNone = true

/-- CALLN-ADMIT-01, Stage B count bound: two Calls of one definition are admitted, and a third is refused. -/
def call_count_bound_is_two : Bool := decide <|
    (analysisOf (nestedCalls 1 ["Q", "Q"])).isSome = true ∧ (analysisOf (nestedCalls 1 ["Q", "Q", "Q"])).isNone = true

/-- CALLN-ADMIT-01, Stage B: two Calls of two different definitions are refused. -/
def calls_of_two_definitions_are_refused : Bool := decide <|
    (analysisOf (nestedCalls 1 ["Q", "Q2"])).isNone = true

/-- CALLN-FRAME-01, the proposal's wrong algorithm 5: of two invocations of one called root, the mappings are those
of the invocation that the live record's return operation names, never the first invocation of the definition. The
second invocation is added to the loan Program by hand, since its retained Programs hold no two invocations whose
output sources differ. -/
def called_root_mappings_follow_the_live_record : Bool :=
  match program.operations.find? (fun | .invokeProcess .. => true | _ => false) with
  | some (.invokeProcess id origin input calledProcessId calledRootScope calledEntry returned _) =>
      let secondReturn : OperationId := ⟨returned.value ++ ":second"⟩
      let secondOutputs := [fromLocal "secondDecision" "secondVerdict"]
      let twoInvocations : Program :=
        { program with operations := program.operations ++
            [.invokeProcess ⟨id.value ++ ":second"⟩ origin input calledProcessId calledRootScope calledEntry secondReturn
              (.variableMappings [] secondOutputs)] }
      let root : ScopeOccurrenceId :=
        { processInstanceId := calledInstance, definitionScopeId := calledRootScope, activation := 1 }
      let record (returnOperationId : OperationId) : CalledProcessOccurrence :=
        { id := { processInstanceId := ⟨"I"⟩, elementId := ⟨"V"⟩, activation := 1 }
          caller := { processInstanceId := ⟨"I"⟩, definitionScopeId := scope "P", activation := 1 }
          calledProcessId, calledRoot := root, returnOperationId }
      NestedScopeData.calledRootMappings? twoInvocations [record secondReturn] root == some ([], secondOutputs) &&
        NestedScopeData.calledRootMappings? twoInvocations [record returned] root == some (inputs, outputs)
  | _ => false

/-- CVM-ADMIT-01: an output targeting a name CIB reserves for multi-instance bookkeeping is refused. -/
def reserved_output_target_is_refused : Bool := decide <|
    (analysisOf (checkedWith false "Q" inputs [fromLocal "nrOfInstances" "verdict"] collectDocument)).isNone =
      true

/-- CVM-ADMIT-01: a duplicate input target is refused. -/
def duplicate_input_target_is_refused : Bool := decide <|
    (analysisOf (checkedWith false "Q" (inputs ++ [enclosing "amount" "applicant"]) outputs
      collectDocument)).isNone = true

/-- CVM-AVAILABLE-01 and CVM-START-01: the review's read of `decision` is produced by the Call's output,
so nothing is required, and the admitted Start names are the input sources and the output targets
landing at the Process. -/
def call_outputs_count_as_writes : Bool := decide <|
    (analysisOf checked).map (fun analysis => (analysis.required, analysis.optional)) =
      some ([], some ["amount", "applicant", "decision", "echoedCustomer"])

/-- CVM-AVAILABLE-01's separating case: without the `decision` output the review's read is required. -/
def without_the_output_the_read_is_required : Bool := decide <|
    (analysisOf (checkedWith false "Q" inputs [fromLocal "echoedCustomer" "customer"] collectDocument)).map
      (·.required) = some ["decision"]

/-- CVM-START-01: a Process-level output target is an admitted Start name. -/
def start_admits_a_process_output_target : Bool := decide <|
    (start [{ name := "amount", value := text "1" }, { name := "decision", value := text "old" }]).outcome =
      .committed

/-- CVM-START-01: a called-only name is a rejection. -/
def start_rejects_a_called_only_name : Bool := decide <|
    refusedUnchanged (start [{ name := "amount", value := text "1" }, { name := "customer", value := text "Ada" }])
      initialState = true

/-- CVM-START-01: a called output source is a rejection. -/
def start_rejects_a_called_output_source : Bool := decide <|
    refusedUnchanged (start [{ name := "amount", value := text "1" }, { name := "verdict", value := text "x" }])
      initialState = true

/-- CVM-IN-01: the called-root frame holds exactly the copied input targets. -/
def invocation_installs_the_copied_snapshot : Bool := decide <|
    (started.outcome == .committed &&
      calledFrames started.state == [[{ name := "amount", value := text "25000" },
        { name := "customer", value := text "Ada" }]]) = true

/-- CVM-IN-01: an absent input source is a present null in the called-root frame. -/
def absent_input_source_copies_a_present_null : Bool := decide <|
    calledFrames (start [{ name := "amount", value := text "25000" }]).state ==
      [[{ name := "amount", value := text "25000" }, { name := "customer", value := .null }]]

/-- The nearest non-law: the caller Process holds `applicant`, yet a called read of it is absent, so
resolving through the caller hierarchy is not the isolated read. -/
def called_reads_do_not_reach_the_caller_namesake : Bool := decide <|
    (started.state.variables.process.bindings.any (· == { name := "applicant", value := text "Ada" }) &&
      NestedScopeData.readOutcome? program started.state.variables calledInstance (scope "Q") "applicant" ==
        some none) = true

/-- CVM-TASK-01: a called patch naming a caller-only name is rejected unchanged. -/
def called_patch_of_a_caller_name_is_rejected : Bool := decide <|
    refusedUnchanged (collect (calledTask "QU") [{ name := "applicant", value := text "Eve" }]) started.state =
      true

/-- CVM-TASK-01: a called patch naming one name twice is rejected unchanged. -/
def called_patch_with_a_duplicate_name_is_rejected : Bool := decide <|
    refusedUnchanged (collect (calledTask "QU")
      [{ name := "amount", value := text "1" }, { name := "amount", value := text "2" }]) started.state = true

/-- CVM-REFUSE-01: a called completion addressed with the caller instance is rejected unchanged. -/
def caller_addressed_called_completion_is_rejected : Bool := decide <|
    refusedUnchanged (collect { calledTask "QU" with processInstanceId := ⟨"I"⟩ } []) started.state = true

/-- CVM-ISOLATE-01: the called write of the namesake `amount` stays in the called frame. -/
def called_writes_stay_in_the_called_frame : Bool := decide <|
    (collected.outcome == .committed &&
      calledFrames collected.state == [[{ name := "amount", value := text "1" },
        { name := "customer", value := text "Ada" }]] &&
      collected.state.variables.process.bindings ==
        [{ name := "amount", value := text "25000" }, { name := "applicant", value := text "Ada" }]) = true

/-- CVM-OUT-01 and CVM-RETIRE-01: the outputs land at the Process, the called frame is gone and the
review frame starts from the returned `decision`. -/
def return_lands_outputs_and_retires_the_called_frame : Bool := decide <|
    (returned.outcome == .committed && calledFrames returned.state == [] &&
      returned.state.variables.scopes.map (·.bindings) == [[{ name := "decision", value := text "approved" }]] &&
      returned.state.variables.process.bindings ==
        [{ name := "amount", value := text "25000" }, { name := "applicant", value := text "Ada" },
         { name := "decision", value := text "approved" }, { name := "echoedCustomer", value := text "Ada" }]) =
      true

/-- CVM-RETIRE-01: a called completion after return is rejected because its wait is gone. -/
def stale_called_completion_is_rejected : Bool := decide <|
    refusedUnchanged (recordVerdict returned.state []) returned.state = true

/-- The review overrides the returned verdict in its frame and publishes it back to the Process. -/
def review_publishes_the_overridden_decision : Bool := decide <|
    (confirmed.outcome == .committed && confirmed.state.control == .completed ⟨"I"⟩ &&
      confirmed.state.variables.process.bindings.filter (·.name == "decision") ==
        [{ name := "decision", value := text "referred" }]) = true

def unsetVerdict : StimulusResult :=
  let begun := start [{ name := "amount", value := text "25000" }, { name := "decision", value := text "old" }]
  let collectedNothing := applyStimulus 8 program begun.state
    (.completeUserTaskInstance ⟨"collect"⟩ (calledTask "QU") [])
  recordVerdict collectedNothing.state []

/-- CVM-OUT-01: an output source the callee never sets overwrites the Start `decision` with null. -/
def unset_output_source_overwrites_with_null : Bool := decide <|
    (unsetVerdict.outcome == .committed &&
      unsetVerdict.state.variables.process.bindings.filter (fun binding =>
          binding.name == "decision" || binding.name == "echoedCustomer") ==
        [{ name := "decision", value := .null }, { name := "echoedCustomer", value := .null }]) = true

/-- Every check of this module, named for the executable driver's failure report. -/
def checks : List (String × Bool) := [
  ("loan_definition_is_admitted", loan_definition_is_admitted),
  ("call_inside_a_sub_process_is_admitted", call_inside_a_sub_process_is_admitted),
  ("called_service_task_is_refused", called_service_task_is_refused),
  ("call_of_the_caller_is_refused", call_of_the_caller_is_refused),
  ("call_of_an_absent_process_is_refused", call_of_an_absent_process_is_refused),
  ("call_depth_bound_is_two", call_depth_bound_is_two),
  ("call_count_bound_is_two", call_count_bound_is_two),
  ("calls_of_two_definitions_are_refused", calls_of_two_definitions_are_refused),
  ("called_root_mappings_follow_the_live_record", called_root_mappings_follow_the_live_record),
  ("reserved_output_target_is_refused", reserved_output_target_is_refused),
  ("duplicate_input_target_is_refused", duplicate_input_target_is_refused),
  ("call_outputs_count_as_writes", call_outputs_count_as_writes),
  ("without_the_output_the_read_is_required", without_the_output_the_read_is_required),
  ("start_admits_a_process_output_target", start_admits_a_process_output_target),
  ("start_rejects_a_called_only_name", start_rejects_a_called_only_name),
  ("start_rejects_a_called_output_source", start_rejects_a_called_output_source),
  ("invocation_installs_the_copied_snapshot", invocation_installs_the_copied_snapshot),
  ("absent_input_source_copies_a_present_null", absent_input_source_copies_a_present_null),
  ("called_reads_do_not_reach_the_caller_namesake", called_reads_do_not_reach_the_caller_namesake),
  ("called_patch_of_a_caller_name_is_rejected", called_patch_of_a_caller_name_is_rejected),
  ("called_patch_with_a_duplicate_name_is_rejected", called_patch_with_a_duplicate_name_is_rejected),
  ("caller_addressed_called_completion_is_rejected", caller_addressed_called_completion_is_rejected),
  ("called_writes_stay_in_the_called_frame", called_writes_stay_in_the_called_frame),
  ("return_lands_outputs_and_retires_the_called_frame", return_lands_outputs_and_retires_the_called_frame),
  ("stale_called_completion_is_rejected", stale_called_completion_is_rejected),
  ("review_publishes_the_overridden_decision", review_publishes_the_overridden_decision),
  ("unset_output_source_overwrites_with_null", unset_output_source_overwrites_with_null)
]

end BpmnSemantics.CallVariableMappingConformance
