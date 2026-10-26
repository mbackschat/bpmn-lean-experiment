module

public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcessJson.CheckedProcess
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
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
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog

/-! # Transaction source grammar discriminators

Renaming and chain lengths are parameters of the fixture, not admission identities. The misplaced-subject mutation preserves graph cardinalities and isolates the eligible-branch obligation.
-/
@[expose] public section

namespace BpmnSemantics.TransactionSourceConformance
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson

/-- Shared role-grammar witness for source admission and the selected arming guarantee. -/
def transactionCheckedSource (namePrefix : String) (long : Bool) : CheckedProcess :=
  let node := fun (name : String) => NodeId.mk (namePrefix ++ name)
  let root : DefinitionScopeId := ⟨"scope:" ++ namePrefix ++ "Process"⟩
  let child : DefinitionScopeId := ⟨"scope:" ++ namePrefix ++ "Transaction"⟩
  let roots : List CheckedNode :=
    [.noneStartEvent (node "RootStart"), .transactionSubProcess (node "Transaction") child "##Compensate",
     .cancelBoundaryEvent (node "Boundary") (node "Transaction") ⟨namePrefix ++ "f2"⟩,
     .userTask (node "Ack") none, .noneEndEvent (node "NormalEnd"), .noneEndEvent (node "AckEnd")]
  let children : List CheckedNode :=
    [.noneStartEvent (node "ChildStart"), .parallelGateway (node "Split") .diverging,
     .userTask (node "Reserve") none, .userTask (node "Withdraw") none,
     .cancelEndEvent (node "Cancel"), .noneEndEvent (node "ChildEnd")] ++
      (if long then [.userTask (node "Prepare") none, .userTask (node "Confirm") none] else [])
  let endpoints :=
    [("f0", "RootStart", "Transaction", root), ("f1", "Transaction", "NormalEnd", root),
     ("f2", "Boundary", "Ack", root), ("f3", "Ack", "AckEnd", root),
     ("f4", "ChildStart", "Split", child), ("f5", "Split", "Reserve", child),
     ("f6", "Split", "Withdraw", child)] ++
      (if long then [("f7", "Reserve", "Prepare", child), ("f8", "Prepare", "ChildEnd", child),
         ("f9", "Withdraw", "Confirm", child), ("fa", "Confirm", "Cancel", child)]
       else [("f7", "Reserve", "ChildEnd", child), ("f8", "Withdraw", "Cancel", child)])
  let nodes :=
    ["Ack", "AckEnd", "Boundary", "Cancel", "ChildEnd", "ChildStart", "Confirm",
      "NormalEnd", "Prepare", "Reserve", "RootStart", "Split", "Transaction", "Withdraw"].filterMap
      (fun name => (roots ++ children).find? (fun n => n.id == node name))
  let flows : List CheckedSequenceFlow := endpoints.map fun (id, source, target, _) =>
    { id := ⟨namePrefix ++ id⟩, sourceId := node source, targetId := node target }
  { identity :=
      { semanticProfile := transactionCancellationCheckpointProfileId
        sourceId := ⟨"source"⟩
        sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := ⟨namePrefix ++ "Process"⟩
    definitionScopes :=
      [{ id := root, parentScopeId := none, originElementId := node "Process" },
       { id := child, parentScopeId := some root, originElementId := node "Transaction" }]
    nodes, sequenceFlows := flows
    nodeScopes := nodes.map fun n => { nodeId := n.id, scopeId := if roots.contains n then root else child }
    sequenceFlowScopes := endpoints.map fun (id, _, _, scope) => { sequenceFlowId := ⟨namePrefix ++ id⟩, scopeId := scope }
    transactionCancellation := some
      { definitionScopeId := child, triggerElementId := node "Cancel"
        subject := .boundaryActivity (node "Reserve") (node "CompensationBoundary")
          { handlerElementId := node "Undo"
            effectElementId := node "Undo"
            input := .empty
            descriptor :=
              { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
                operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" } }
        retentionLimits := { maxRecords := 1, maxCanonicalBytes := 4096 }
        executionLimits := { maxTriggers := 1, maxHandlers := 1, maxCanonicalBytes := 20480 } } }

def misplaced (s : CheckedProcess) (withdraw : String) : CheckedProcess :=
  { s with transactionCancellation := s.transactionCancellation.map fun d =>
    { d with subject := match d.subject with
      | .boundaryActivity _ boundary body => .boundaryActivity ⟨withdraw⟩ boundary body
      | other => other } }

-- StrictJson uses an opaque parser implementation; these byte-level checks are runtime evidence.
def declarationWire : String :=
  "{\"definitionScopeId\":\"scope:tx\",\"triggerElementId\":\"cancel\",\"subject\":{\"kind\":\"boundaryActivity\",\"subjectElementId\":\"reserve\",\"boundaryEventElementId\":\"undoBoundary\",\"body\":{\"kind\":\"singleEffect\",\"handlerElementId\":\"undo\",\"effectElementId\":\"undo\",\"descriptor\":{\"protocol\":\"urn:bpmn-lean:effect-protocol:activity-v1\",\"operation\":\"urn:bpmn-lean:effect-operation:compensation-single-effect-v1\"},\"input\":{\"kind\":\"empty\"}}},\"retentionLimits\":{\"maxRecords\":1,\"maxCanonicalBytes\":4096},\"executionLimits\":{\"maxTriggers\":1,\"maxHandlers\":1,\"maxCanonicalBytes\":20480}}"

def declarationAccepted (wire : String) : Bool :=
  match parseWireJson wire >>= decodeCheckedTransaction with
  | .ok _ => true
  | .error _ => false

def transaction_strict_decoder_accept_exact_declaration : Bool := Except.toBool <| show Except String Unit from do
  unless (declarationAccepted declarationWire) == true do
    throw "Transaction strict decoder: accept exact declaration"
def transaction_strict_decoder_reject_null_declaration : Bool := Except.toBool <| show Except String Unit from do
  unless (declarationAccepted "null") == false do
    throw "Transaction strict decoder: reject null declaration"
def transaction_strict_decoder_reject_retention_byte_drift : Bool := Except.toBool <| show Except String Unit from do
  unless (declarationAccepted (declarationWire.replace "4096" "4097")) == false do
    throw "Transaction strict decoder: reject retention byte drift"
def transaction_strict_decoder_reject_restored_handler_input : Bool := Except.toBool <| show Except String Unit from do
  unless (declarationAccepted (declarationWire.replace "empty" "directRestoredProcessBinding")) == false do
    throw "Transaction strict decoder: reject restored handler input"

def nodeWireAccepted (node : String) : Bool :=
  let wire := "{\"kind\":\"checkedProcess\",\"identity\":{\"semanticProfile\":\"p\",\"sourceId\":\"s\",\"sourceOverlay\":null,\"sourceSha256\":\"x\"},\"processId\":\"p\",\"definitionScopes\":[],\"nodeScopes\":[],\"sequenceFlowScopes\":[],\"nodes\":[" ++ node ++ "],\"sequenceFlows\":[]}"
  match parseWireJson wire >>= decodeCheckedProcess with
  | .ok _ => true
  | .error _ => false

def transaction_strict_decoder_accept_exact_transaction_method : Bool := Except.toBool <| show Except String Unit from do
  unless (nodeWireAccepted "{\"kind\":\"transactionSubProcess\",\"id\":\"tx\",\"childScopeId\":\"child\",\"method\":\"##Compensate\"}") == true do
    throw "Transaction strict decoder: accept exact Transaction method"
def transaction_strict_decoder_reject_case_folded_transaction_method : Bool := Except.toBool <| show Except String Unit from do
  unless (nodeWireAccepted "{\"kind\":\"transactionSubProcess\",\"id\":\"tx\",\"childScopeId\":\"child\",\"method\":\"##compensate\"}") == false do
    throw "Transaction strict decoder: reject case-folded Transaction method"
def transaction_strict_decoder_reject_missing_checked_method : Bool := Except.toBool <| show Except String Unit from do
  unless (nodeWireAccepted "{\"kind\":\"transactionSubProcess\",\"id\":\"tx\",\"childScopeId\":\"child\"}") == false do
    throw "Transaction strict decoder: reject missing checked method"
def transaction_strict_decoder_accept_cancel_end_node : Bool := Except.toBool <| show Except String Unit from do
  unless (nodeWireAccepted "{\"kind\":\"cancelEndEvent\",\"id\":\"cancel\"}") == true do
    throw "Transaction strict decoder: accept Cancel End node"
def transaction_strict_decoder_accept_cancel_boundary_node : Bool := Except.toBool <| show Except String Unit from do
  unless (nodeWireAccepted "{\"kind\":\"cancelBoundaryEvent\",\"id\":\"boundary\",\"attachedToRef\":\"tx\",\"outputFlowId\":\"flow\"}") == true do
    throw "Transaction strict decoder: accept Cancel Boundary node"
def transaction_strict_decoder_reject_extra_cancel_boundary_field : Bool := Except.toBool <| show Except String Unit from do
  unless (nodeWireAccepted "{\"kind\":\"cancelBoundaryEvent\",\"id\":\"boundary\",\"attachedToRef\":\"tx\",\"outputFlowId\":\"flow\",\"cancelActivity\":false}") == false do
    throw "Transaction strict decoder: reject extra Cancel Boundary field"

def short_checked_source_is_admitted : Bool := decide <| checkedWellFormed (transactionCheckedSource "" false) = true
def renamed_long_checked_source_is_admitted : Bool := decide <| checkedWellFormed (transactionCheckedSource "Renamed_" true) = true
def short_lowered_program_matches_complete_grammar : Bool := decide <| transactionCancellationProgramGraph (lowerCheckedProcess (transactionCheckedSource "" false)) = true
def renamed_long_lowered_program_matches_complete_grammar : Bool := decide <| transactionCancellationProgramGraph (lowerCheckedProcess (transactionCheckedSource "Renamed_" true)) = true
def eligible_subject_on_cancel_branch_is_rejected : Bool := decide <| checkedWellFormed (misplaced (transactionCheckedSource "" false) "Withdraw") = false
def renamed_eligible_subject_on_cancel_branch_is_rejected : Bool := decide <| checkedWellFormed (misplaced (transactionCheckedSource "Renamed_" true) "Renamed_Withdraw") = false
def lowered_misplaced_subject_is_rejected : Bool := decide <| transactionCancellationProgramGraph
    (lowerCheckedProcess (misplaced (transactionCheckedSource "" false) "Withdraw")) = false
def renamed_lowered_misplaced_subject_is_rejected : Bool := decide <| transactionCancellationProgramGraph
    (lowerCheckedProcess (misplaced (transactionCheckedSource "Renamed_" true) "Renamed_Withdraw")) = false
theorem short_lowered_program_is_well_formed : programWellFormed (lowerCheckedProcess (transactionCheckedSource "" false)) = true := by
  decide +kernel
def renamed_long_lowered_program_is_well_formed : Bool := decide <| programWellFormed (lowerCheckedProcess (transactionCheckedSource "Renamed_" true)) = true
theorem short_lowered_program_is_profile_admitted : programProfileCapabilitiesValid (lowerCheckedProcess (transactionCheckedSource "" false)) = true := by
  decide +kernel
def transaction_lowering_omits_snapshots : Bool := decide <| (lowerCheckedProcess (transactionCheckedSource "" false)).compensationEventSubProcessSnapshots = none
def transaction_start_rejects_process_data : Bool := decide <| variableValueAdmitted transactionCancellationCheckpointProfileId .processStart (.string "data") = false
def transaction_task_completion_rejects_process_data : Bool := decide <| variableValueAdmitted transactionCancellationCheckpointProfileId .userTaskCompletion (.string "data") = false

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("short_checked_source_is_admitted", short_checked_source_is_admitted),
  ("renamed_long_checked_source_is_admitted", renamed_long_checked_source_is_admitted),
  ("short_lowered_program_matches_complete_grammar", short_lowered_program_matches_complete_grammar),
  ("renamed_long_lowered_program_matches_complete_grammar", renamed_long_lowered_program_matches_complete_grammar),
  ("eligible_subject_on_cancel_branch_is_rejected", eligible_subject_on_cancel_branch_is_rejected),
  ("renamed_eligible_subject_on_cancel_branch_is_rejected", renamed_eligible_subject_on_cancel_branch_is_rejected),
  ("lowered_misplaced_subject_is_rejected", lowered_misplaced_subject_is_rejected),
  ("renamed_lowered_misplaced_subject_is_rejected", renamed_lowered_misplaced_subject_is_rejected),
  ("renamed_long_lowered_program_is_well_formed", renamed_long_lowered_program_is_well_formed),
  ("transaction_lowering_omits_snapshots", transaction_lowering_omits_snapshots),
  ("transaction_start_rejects_process_data", transaction_start_rejects_process_data),
  ("transaction_task_completion_rejects_process_data", transaction_task_completion_rejects_process_data),
  ("transaction_strict_decoder_accept_exact_declaration", transaction_strict_decoder_accept_exact_declaration),
  ("transaction_strict_decoder_reject_null_declaration", transaction_strict_decoder_reject_null_declaration),
  ("transaction_strict_decoder_reject_retention_byte_drift", transaction_strict_decoder_reject_retention_byte_drift),
  ("transaction_strict_decoder_reject_restored_handler_input", transaction_strict_decoder_reject_restored_handler_input),
  ("transaction_strict_decoder_accept_exact_transaction_method", transaction_strict_decoder_accept_exact_transaction_method),
  ("transaction_strict_decoder_reject_case_folded_transaction_method", transaction_strict_decoder_reject_case_folded_transaction_method),
  ("transaction_strict_decoder_reject_missing_checked_method", transaction_strict_decoder_reject_missing_checked_method),
  ("transaction_strict_decoder_accept_cancel_end_node", transaction_strict_decoder_accept_cancel_end_node),
  ("transaction_strict_decoder_accept_cancel_boundary_node", transaction_strict_decoder_accept_cancel_boundary_node),
  ("transaction_strict_decoder_reject_extra_cancel_boundary_field", transaction_strict_decoder_reject_extra_cancel_boundary_field)
]

end BpmnSemantics.TransactionSourceConformance
