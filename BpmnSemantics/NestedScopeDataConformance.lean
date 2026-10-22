import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.Scenario

/-! # Nested scope-data conformance

Finite checked witnesses of the nested scope-data profile run the purchase-order approval through the
actual external dispatcher and its internal closure: order approval encloses credit review, which
encloses a compliance check, so every read, write and output crosses up to three frames. The fixture
keeps the compliance outputs and the second order-approval output that the hosted model drops to fit the
Start capacity envelope, so it is the only lane witnessing them. Each step is
one dispatcher evaluation and the theorems only read its result. They do not discharge the quantified
frame laws, and the 16,384-byte patch bound is stated beside its predicate instead of kernel-reducing a
boundary-sized patch; see the
[nested scope data specification](../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#separating-witnesses-and-rule-to-evidence-matrix).
-/

namespace BpmnSemantics.NestedScopeDataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def descriptor (name : String) : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1", operation := name }

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩

private def literal (target value : String) : VariableMapping :=
  { target, expression := .stringLiteral value }

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

/-- Order approval: its `status` starts from the Process `initialStatus`, and four outputs publish its
locals, `status` twice. -/
def orderRecord : ScopeLocalData :=
  { scopeId := scope "O"
    localInputs := [literal "decision" "pending", literal "note" "draft", enclosing "order" "order",
                    enclosing "status" "initialStatus"]
    localOutputs := [fromLocal "approvedOrder" "order", fromLocal "auditStatus" "status",
                     fromLocal "finalDecision" "decision", fromLocal "finalStatus" "status"] }

/-- Credit review: `limit` reads the Process `requestedLimit`, never the sibling literal. -/
def creditRecord : ScopeLocalData :=
  { scopeId := scope "C"
    localInputs := [literal "decision" "credit-pending", enclosing "limit" "requestedLimit",
                    literal "requestedLimit" "0"]
    localOutputs := [fromLocal "limit" "limit"] }

/-- Compliance: `reviewer` reads order approval's null `status`, and `checkResult` is published to
`status`, which order approval declares. -/
def complianceRecord : ScopeLocalData :=
  { scopeId := scope "K"
    localInputs := [literal "checkResult" "pending-check", enclosing "reviewer" "status"]
    localOutputs := [fromLocal "status" "checkResult"] }

private def checkCompliance : CheckedNode :=
  .serviceTask ⟨"KS"⟩ (descriptor "checkCompliance")
    [enclosing "limit" "limit", enclosing "reviewer" "reviewer", enclosing "risk" "riskClass",
     enclosing "status" "status"]
    [fromLocal "checkResult" "checkResult", fromLocal "note" "note"] none

private def approveOrder : CheckedNode :=
  .serviceTask ⟨"OS"⟩ (descriptor "approveOrder") [enclosing "limit" "limit", enclosing "order" "order"]
    [] none

private def publishOrder : CheckedNode :=
  .serviceTask ⟨"R"⟩ (descriptor "publishOrder")
    [enclosing "approvedOrder" "approvedOrder", enclosing "auditStatus" "auditStatus",
     enclosing "finalDecision" "finalDecision", enclosing "finalStatus" "finalStatus",
     enclosing "limit" "limit", enclosing "note" "note", enclosing "status" "status"]
    [] none

/-- Root: Start, order approval, publish, End; order approval: Start, credit review, approve, End;
credit review: Start, compliance, *Review credit*, End; compliance: Start, check, End. -/
def checkedWith (records : List ScopeLocalData) : CheckedProcess :=
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"purchase-order"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000001"
        sourceOverlay := some
          { id := ⟨"handlers"⟩
            sha256 := "0000000000000000000000000000000000000000000000000000000000000002" } }
    processId := ⟨"P"⟩
    definitionScopes :=
      [ { id := scope "C", parentScopeId := some (scope "O"), originElementId := ⟨"C"⟩ }
      , { id := scope "K", parentScopeId := some (scope "C"), originElementId := ⟨"K"⟩ }
      , { id := scope "O", parentScopeId := some (scope "P"), originElementId := ⟨"O"⟩ }
      , { id := scope "P", parentScopeId := none, originElementId := ⟨"P"⟩ } ]
    nodeScopes := owned "P" ["A"] ++ owned "O" ["C"] ++ owned "C" ["CA", "CU", "CZ", "K"] ++
      owned "K" ["KA", "KS", "KZ"] ++ owned "P" ["O"] ++ owned "O" ["OA", "OS", "OZ"] ++
      owned "P" ["R", "Z"]
    sequenceFlowScopes := flowsIn "P" ["f01", "f02", "f03"] ++ flowsIn "O" ["f04", "f05", "f06"] ++
      flowsIn "C" ["f07", "f08", "f09"] ++ flowsIn "K" ["f10", "f11"]
    nodes :=
      [ .noneStartEvent ⟨"A"⟩, .embeddedSubProcess ⟨"C"⟩ (scope "C"), .noneStartEvent ⟨"CA"⟩
      , .userTask ⟨"CU"⟩ (some "Review credit"), .noneEndEvent ⟨"CZ"⟩
      , .embeddedSubProcess ⟨"K"⟩ (scope "K"), .noneStartEvent ⟨"KA"⟩, checkCompliance
      , .noneEndEvent ⟨"KZ"⟩, .embeddedSubProcess ⟨"O"⟩ (scope "O"), .noneStartEvent ⟨"OA"⟩
      , approveOrder, .noneEndEvent ⟨"OZ"⟩, publishOrder, .noneEndEvent ⟨"Z"⟩ ]
    sequenceFlows :=
      [ flow "f01" "A" "O", flow "f02" "O" "R", flow "f03" "R" "Z"
      , flow "f04" "OA" "C", flow "f05" "C" "OS", flow "f06" "OS" "OZ"
      , flow "f07" "CA" "K", flow "f08" "K" "CU", flow "f09" "CU" "CZ"
      , flow "f10" "KA" "KS", flow "f11" "KS" "KZ" ]
    scopeLocalData := records }

def checked : CheckedProcess := checkedWith [creditRecord, complianceRecord, orderRecord]

def program : Program := lowerCheckedProcess checked

private def item (sku : String) : BusinessValue :=
  .map [("quantity", .integer 2), ("sku", .string sku)]

/-- Two equal line items, a nested address with a present null and a negative scale-two total. -/
def order : VariableValue :=
  .map [("address", .map [("line1", .string "Dock 7"), ("line2", .null)]),
        ("items", .list [item "A-1", item "A-1"]),
        ("total", .decimal (-123455) 2)]

def startBindings (riskClass : VariableValue) : List VariableBinding :=
  [ { name := "initialStatus", value := .null }, { name := "note", value := .string "n0" }
  , { name := "order", value := order }, { name := "requestedLimit", value := .string "5000" }
  , { name := "riskClass", value := riskClass }, { name := "status", value := .string "open" } ]

def complianceId : EffectOccurrenceId := ⟨⟨"I"⟩, ⟨"KS"⟩, 1⟩
def approvalId : EffectOccurrenceId := ⟨⟨"I"⟩, ⟨"OS"⟩, 1⟩
def publishId : EffectOccurrenceId := ⟨⟨"I"⟩, ⟨"R"⟩, 1⟩
def reviewId : UserTaskInstanceId := { processInstanceId := ⟨"I"⟩, elementId := ⟨"CU"⟩, activation := 1 }

private def start (bindings : List VariableBinding) : StimulusResult :=
  applyStimulus 8 program initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ bindings)

def started : StimulusResult := start (startBindings (.string "low"))

def checkedCompliance : StimulusResult :=
  applyStimulus 8 program started.state (.completeEffect ⟨"check"⟩ complianceId
    (.success [{ name := "checkResult", value := .string "compliant" },
               { name := "note", value := .string "checked" }]))

private def review (patch : List VariableBinding) : StimulusResult :=
  applyStimulus 8 program checkedCompliance.state (.completeUserTaskInstance ⟨"review"⟩ reviewId patch)

def reviewPatch : List VariableBinding :=
  [ { name := "decision", value := .string "credit-approved" }, { name := "limit", value := .string "7500" }
  , { name := "status", value := .string "approved" } ]

def reviewed : StimulusResult := review reviewPatch

def approved : StimulusResult :=
  applyStimulus 8 program reviewed.state (.completeEffect ⟨"approve"⟩ approvalId (.success []))

def published : StimulusResult :=
  applyStimulus 8 program approved.state (.completeEffect ⟨"publish"⟩ publishId (.success []))

private def frameNames (state : RuntimeState) : List String :=
  state.variables.scopes.map (·.owner.definitionScopeId.value)

private def refusedUnchanged (result : StimulusResult) (before : RuntimeState) : Bool :=
  result.outcome == .rejected && result.state == before

theorem purchase_order_definition_is_admitted :
    checkedWellFormed checked = true ∧ programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧
      definitionBindingValid checked program = true := by
  decide +kernel

/-- NSD-AVAILABLE-01: compliance's `riskClass` is read but never declared or produced, and the root
reads `note` after order approval, whose frame alone received the inner write, has retired. The Process
`limit` and the four order outputs are definite Process writes and are not required. -/
theorem required_start_names_follow_the_scope_chain :
    (NestedScopeData.programAnalysis program).map (·.required) =
      some ["order", "initialStatus", "requestedLimit", "riskClass", "note", "status"] := by
  decide +kernel

/-- NSD-AVAILABLE-01 at Start: a missing required name is a rejection, a present null is present. -/
theorem start_requires_risk_class_and_accepts_present_null :
    refusedUnchanged (start ((startBindings .null).filter (·.name != "riskClass"))) initialState = true ∧
      (start (startBindings .null)).outcome = .committed := by
  decide +kernel

/-- NSD-INIT-01 and NSD-READ-01 at the compliance effect: `limit` is the Process `requestedLimit`, not
credit review's sibling literal; `reviewer` and `status` are order approval's null over the Process
`"open"`. Three frames are live, one per scope. -/
theorem compliance_effect_reads_through_three_frames :
    (started.outcome == .committed &&
      frameNames started.state == ["scope:C", "scope:K", "scope:O"] &&
      started.state.effectWaits.map (·.arguments) ==
        [[{ name := "limit", value := .string "5000" }, { name := "reviewer", value := .null },
          { name := "risk", value := .string "low" }, { name := "status", value := .null }]]) = true := by
  decide +kernel

/-- NSD-WRITE-01, NSD-OUTPUT-01 and NSD-RETIRE-01 to the credit review: the compliance result lands in
its own frame and in order approval's `note`, compliance retires and publishes `checkResult` into order
approval's `status`, and the Process keeps `"open"`. -/
theorem compliance_outputs_land_in_the_order_frame :
    (checkedCompliance.outcome == .committed &&
      frameNames checkedCompliance.state == ["scope:C", "scope:O"] &&
      (checkedCompliance.state.variables.scopes.filter (·.owner.definitionScopeId == ⟨"scope:O"⟩)).map
          (·.bindings) ==
        [[{ name := "decision", value := .string "pending" }, { name := "note", value := .string "checked" },
          { name := "order", value := order }, { name := "status", value := .string "compliant" }]] &&
      checkedCompliance.state.variables.process.bindings == startBindings (.string "low") &&
      checkedCompliance.state.waits.length == 1) = true := by
  decide +kernel

/-- NSD-TASK-01: a name outside every frame on the task's chain, a repeated name and a root List are
rejections that leave the committed state unchanged. -/
theorem review_patch_refusals_leave_state_unchanged :
    refusedUnchanged (review [{ name := "unknown", value := .string "x" }]) checkedCompliance.state = true ∧
      refusedUnchanged (review [{ name := "status", value := .string "a" }, { name := "status", value := .string "b" }])
        checkedCompliance.state = true ∧
      refusedUnchanged (review [{ name := "status", value := .list [.string "a"] }])
        checkedCompliance.state = true := by
  decide +kernel

/-- NSD-WRITE-01 and NSD-OUTPUT-01 through the end: the review writes `decision` to credit review and
`status` to order approval; credit review publishes its `limit` to the Process and retires, so the
approval effect reads the Process value; order approval then publishes `"approved"` twice and its own
untouched `decision`, and the order Map arrives unchanged. -/
theorem order_outputs_publish_the_nearest_owner_writes :
    (reviewed.outcome == .committed && frameNames reviewed.state == ["scope:O"] &&
      reviewed.state.effectWaits.map (·.arguments) ==
        [[{ name := "limit", value := .string "7500" }, { name := "order", value := order }]] &&
      approved.outcome == .committed && approved.state.variables.scopes.isEmpty &&
      approved.state.effectWaits.map (·.arguments) ==
        [[{ name := "approvedOrder", value := order }, { name := "auditStatus", value := .string "approved" },
          { name := "finalDecision", value := .string "pending" },
          { name := "finalStatus", value := .string "approved" },
          { name := "limit", value := .string "7500" }, { name := "note", value := .string "n0" },
          { name := "status", value := .string "open" }]] &&
      published.outcome == .committed && published.state.control == .completed ⟨"I"⟩) = true := by
  decide +kernel

/-- NSD-ADMIT-01: an output sourced from a name its own Sub-Process does not declare, a record for the
root scope and a scope-local table under another profile are refused. -/
theorem undeclared_output_source_and_foreign_tables_are_refused :
    (NestedScopeData.checkedAnalysis (checkedWith [creditRecord, complianceRecord,
        { orderRecord with localOutputs := [fromLocal "approvedOrder" "initialStatus"] }])).isNone = true ∧
      (NestedScopeData.checkedAnalysis (checkedWith [creditRecord, complianceRecord, orderRecord,
        { orderRecord with scopeId := scope "P" }])).isNone = true ∧
      checkedProfileCapabilitiesValid { checked with
        identity := { checked.identity with semanticProfile := portableEffectDataProfileId } } = false := by
  decide +kernel

end BpmnSemantics.NestedScopeDataConformance
