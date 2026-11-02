module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission

/-! # Exclusive choice arity conformance

Finite admission witnesses of XCA-ADMIT-01 under the nested scope-data profile. The complaint handling graph
transcribes the retained `scenarios/exclusive-choice-arity` model; its Start names are the TypeScript analysis's values
for the same graph, and each refused graph differs from the admitted one in the fact its name states. The Program-level
profile control evaluates only the `choose` arm of `operationWellFormed`; the checked level has no such control, a gap
the proposal records. The module runs no command: candidate order and the default are Lean executions of the
registered scenarios in the pipeline. It imports admission owners only, as `ScopeReentryConformance` does, so it stays
outside `CommandAdmission`'s hidden-edit cone (`lean-fanout`). See the
[Exclusive choice arity proposal](../docs/capsules/EXCLUSIVE-CHOICE-ARITY-PROPOSAL.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.ExclusiveChoiceArityConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"
private def simpleBoolean : String := "urn:bpmn-lean:expression:simple-boolean:v1"

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
private def flowId (source target : String) : SequenceFlowId := ⟨source ++ ">" ++ target⟩
private def node (owner : String) (value : CheckedNode) : String × String × CheckedNode := (owner, value.id.value, value)
private def start (owner id : String) := node owner (.noneStartEvent ⟨id⟩)
private def finish (owner id : String) := node owner (.noneEndEvent ⟨id⟩)
private def merge (owner id : String) := node owner (.exclusiveMerge ⟨id⟩)
private def task (owner id : String) := node owner (.userTask ⟨id⟩ (some id))
private def sub (owner id : String) := node owner (.embeddedSubProcess ⟨id⟩ (scope id))

/-- A Choice whose conditional candidates go to `conditioned`, in declaration order, and whose default goes to
`fallback`. -/
private def choice (owner id : String) (conditioned : List String) (fallback : String) :=
  node owner (.exclusiveGateway ⟨id⟩ (conditioned.map (flowId id ·)) (flowId id fallback))

private def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (owner id operation : String) (inputs outputs : List VariableMapping) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs outputs none)

/-- A Simple Boolean v1 test that the Process binding `name` equals `value`. -/
private def equals (name value : String) : CheckedCondition :=
  { language := simpleBoolean, body := "stringEquals(" ++ name ++ ",\"" ++ value ++ "\")" }

private def overlay : SourceOverlayIdentity :=
  { id := ⟨"complaint-handling-handlers"⟩, sha256 := "000000000000000000000000000000000000000000000000000000000000000b" }

/-- Route complaint's conditional targets and conditions in the model's declaration order. -/
private def routes : List (String × CheckedCondition) :=
  [("EscalateToSupervisor", equals "priority" "urgent"), ("CorrectInvoice", equals "category" "billing"),
    ("ReshipOrder", equals "category" "delivery")]

/-- Complaint handling: root `P` reviews the complaint in a Sub-Process whose User Task classifies it, chooses among
`routed`'s conditional targets with *Answer customer* as the default, merges the four branches, and chooses once more
whether delivery needs confirming. `inBody` moves *Route complaint* and its branches into *Review complaint*;
`conditionedDefault` adds a condition to the default; `extraRoute` adds an unconditioned fourth outgoing flow. A
Choice without a default has no checked representation, so that refused edit lives in the source test only. -/
private def complaintWith (routed : List (String × CheckedCondition) := routes) (inBody : Bool := false)
    (conditionedDefault : Bool := false) (extraRoute : Bool := false) : CheckedProcess :=
  let owner := if inBody then "ReviewComplaint" else "P"
  let targets := routed.map (·.1)
  let branches := targets ++ ["AnswerCustomer"] ++ (if extraRoute then ["IssueRefund"] else [])
  let members :=
    [ start "P" "ComplaintReceived", sub "P" "ReviewComplaint"
    , choice owner "RouteComplaint" targets "AnswerCustomer"
    , task owner "EscalateToSupervisor", task owner "CorrectInvoice"
    , service owner "ReshipOrder" "reshipOrder" [enclosing "order" "orderNumber"] [copied "trackingNumber" "tracking"]
    , task owner "AnswerCustomer", merge owner "ComplaintHandled"
    , choice "P" "FollowUpNeeded" ["ConfirmDelivery"] "FollowUpDone"
    , task "P" "ConfirmDelivery", merge "P" "FollowUpDone", finish "P" "ComplaintClosed"
    , start "ReviewComplaint" "ReviewOpened", task "ReviewComplaint" "ClassifyComplaint"
    , finish "ReviewComplaint" "ReviewClosed" ]
      ++ (if extraRoute then [task owner "IssueRefund"] else [])
  let entry := if inBody then [("ComplaintReceived", "ReviewComplaint"), ("ReviewComplaint", "FollowUpNeeded"),
      ("ClassifyComplaint", "RouteComplaint"), ("ComplaintHandled", "ReviewClosed")]
    else [("ComplaintReceived", "ReviewComplaint"), ("ReviewComplaint", "RouteComplaint"),
      ("ClassifyComplaint", "ReviewClosed"), ("ComplaintHandled", "FollowUpNeeded")]
  let edges := entry ++ branches.flatMap (fun target => [("RouteComplaint", target), (target, "ComplaintHandled")]) ++
    [ ("FollowUpNeeded", "ConfirmDelivery"), ("FollowUpNeeded", "FollowUpDone"), ("ConfirmDelivery", "FollowUpDone")
    , ("FollowUpDone", "ComplaintClosed"), ("ReviewOpened", "ClassifyComplaint") ]
  let conditions := routed.map (fun (target, condition) => (("RouteComplaint", target), condition)) ++
    [(("FollowUpNeeded", "ConfirmDelivery"), equals "category" "delivery")] ++
    (if conditionedDefault then [(("RouteComplaint", "AnswerCustomer"), equals "category" "other")] else [])
  let id := fun (edge : String × String) => (flowId edge.1 edge.2).value
  let scopes := [("P", none), ("ReviewComplaint", some "P")]
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (id left ≤ id right)
  let review : ScopeLocalData :=
    { scopeId := scope "ReviewComplaint"
      localInputs := [literal "category" "unclassified", literal "priority" "normal"]
      localOutputs := [copied "category" "category", copied "priority" "priority"] }
  let ownerOf := fun (node : String) => ((members.find? (·.2.1 == node)).map (·.1)).getD ""
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"complaint-handling"⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000c"
        sourceOverlay := some overlay }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, id, _) => { nodeId := ⟨id⟩, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun edge =>
      { sequenceFlowId := flowId edge.1 edge.2, scopeId := scope (ownerOf edge.1) }
    nodes := members.map (·.2.2)
    sequenceFlows := edges.map fun edge =>
      { id := flowId edge.1 edge.2, sourceId := ⟨edge.1⟩, targetId := ⟨edge.2⟩,
        condition := (conditions.find? (·.1 == edge)).map (·.2) }
    scopeLocalData := [review] }

private def complaint : CheckedProcess := complaintWith

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- The targets of a Choice's candidates in candidate order, at both levels: the checked gateway's flows and the
lowered `choose`'s outputs, each read back to the node it reaches. -/
private def candidateTargets (source : CheckedProcess) (gateway : String) : Option (List String) := do
  let candidates ← source.nodes.findSome? fun
    | .exclusiveGateway id candidates _ => if id.value == gateway then some candidates else none
    | _ => none
  candidates.mapM fun flow => (source.sequenceFlows.find? (·.id == flow)).map (·.targetId.value)

private def programOrigins (program : Program) (gateway : String) : Option (List String) :=
  program.operations.findSome? fun
    | .choose _ origin _ candidates _ _ =>
        if origin.elementId.value == gateway then some (candidates.map (·.origin.elementId.value)) else none
    | _ => none

private def sorted (names : List String) : List String := names.mergeSort fun left right => decide (left ≤ right)

/-- XCA-ADMIT-01: the model, with a three-condition and a one-condition Choice, is admitted at both levels, routed to
the re-entry account, and keeps declaration order at both levels. -/
private def complaint_handling_is_admitted_and_routed : Bool :=
  let program := lowerCheckedProcess complaint
  admitted complaint && ScopeReentry.checkedReentry complaint && ScopeReentry.programReentry program &&
    StructuredScopeData.checkedRouted complaint &&
    candidateTargets complaint "RouteComplaint" == some ["EscalateToSupervisor", "CorrectInvoice", "ReshipOrder"] &&
    candidateTargets complaint "FollowUpNeeded" == some ["ConfirmDelivery"] &&
    programOrigins program "RouteComplaint" ==
      some ["RouteComplaint>EscalateToSupervisor", "RouteComplaint>CorrectInvoice", "RouteComplaint>ReshipOrder"] &&
    programOrigins program "FollowUpNeeded" == some ["FollowUpNeeded>ConfirmDelivery"]

/-- XCA-ADMIT-01 with SRE-AVAILABLE-01: a Choice's reads require nothing and the review's inputs are literals, so the
root Service Task's input is the only required Start name at both levels, and the two levels agree on the burst. -/
private def start_requires_only_the_order_number : Bool :=
  let program := lowerCheckedProcess complaint
  let checked := (ScopeReentry.checkedAnalysis complaint).map fun analysis =>
    (sorted analysis.required, analysis.optional.map sorted)
  let lowered := (ScopeReentry.programAnalysis program).map fun analysis =>
    (sorted analysis.required, analysis.optional.map sorted)
  checked == some (["orderNumber"], none) && lowered == checked &&
    (ScopeReentry.checkedBurst? complaint).isSome && ScopeReentry.checkedBurst? complaint == ScopeReentry.programBurst? program

/-- XCA-ORDER-01 at admission: reversed declarations reverse the candidate order at both levels and stay admitted. -/
private def reversed_declarations_reverse_the_order : Bool :=
  let reversed := complaintWith (routed := routes.reverse)
  admitted reversed &&
    candidateTargets reversed "RouteComplaint" == some ["ReshipOrder", "CorrectInvoice", "EscalateToSupervisor"] &&
    programOrigins (lowerCheckedProcess reversed) "RouteComplaint" ==
      some ["RouteComplaint>ReshipOrder", "RouteComplaint>CorrectInvoice", "RouteComplaint>EscalateToSupervisor"]

/-- XCA-ADMIT-01: an unconditioned fourth outgoing flow, a condition on the default, and the Choice in the body of
*Review complaint* are each refused. -/
private def edits_leaving_the_class_are_refused : Bool :=
  !admitted (complaintWith (extraRoute := true)) && !admitted (complaintWith (conditionedDefault := true)) &&
    !admitted (complaintWith (inBody := true))

/-- XCA-ADMIT-01 profile control at the Program level: the `choose` arm admits the model's three- and one-candidate
Choices under the nested profile and refuses both under the Simple Boolean Exclusive Gateway profile, which keeps two
conditions; no other arm is consulted. -/
private def program_choice_arity_follows_the_profile : Bool :=
  let program := lowerCheckedProcess complaint
  let underTwo : Program :=
    { program with identity := { program.identity with semanticProfile := ⟨"bpmn-2.0.2-simple-boolean-exclusive-gateway-draft"⟩ } }
  let choices := program.operations.filter fun | .choose .. => true | _ => false
  choices.length == 2 &&
    choices.all (operationWellFormed program program.controlPlaces) &&
    choices.all (!operationWellFormed underTwo underTwo.controlPlaces ·)

/-- Every executable check of this module, named for the driver's failure report. -/
def exclusiveChoiceArityConformanceChecks : List (String × Bool) := [
  ("complaint_handling_is_admitted_and_routed", complaint_handling_is_admitted_and_routed),
  ("start_requires_only_the_order_number", start_requires_only_the_order_number),
  ("reversed_declarations_reverse_the_order", reversed_declarations_reverse_the_order),
  ("edits_leaving_the_class_are_refused", edits_leaving_the_class_are_refused),
  ("program_choice_arity_follows_the_profile", program_choice_arity_follows_the_profile)
]

end BpmnSemantics.ExclusiveChoiceArityConformance
