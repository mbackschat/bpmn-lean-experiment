module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission

/-! # None End fan-in conformance

Finite admission and lowering witnesses of NEF-ADMIT-01 and NEF-END-01 under the nested scope-data profile. The travel
request graph transcribes the retained `scenarios/none-end-fan-in` model with its flow ids, so the lowered End
operations carry the identifiers the TypeScript lowering gives them; its Start names are the TypeScript analysis's
values for the same graph. Each refused graph differs from an admitted one in the fact its name states, and each
Program negative edits one origin of the admitted Program, so only the rule it names can refuse it. The employee
onboarding graph transcribes the retained `scenarios/root-parallel-forks` model for the fork negative. The module runs
no command: each End arrival is a Lean execution of the registered scenarios in the pipeline. It imports admission
owners only, as `ScopeReentryConformance` does, so it stays outside `CommandAdmission`'s hidden-edit cone
(`lean-fanout`). See the [None End fan-in specification](../docs/capsules/NONE-END-FAN-IN-SPEC.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.NoneEndFanInConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"
private def simpleBoolean : String := "urn:bpmn-lean:expression:simple-boolean:v1"

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
private def node (owner : String) (value : CheckedNode) : String × String × CheckedNode := (owner, value.id.value, value)
private def start (owner id : String) := node owner (.noneStartEvent ⟨id⟩)
private def finish (owner id : String) := node owner (.noneEndEvent ⟨id⟩)
private def fork (owner id : String) := node owner (.parallelGateway ⟨id⟩ .diverging)
private def join (owner id : String) := node owner (.parallelGateway ⟨id⟩ .converging)
private def task (owner id : String) := node owner (.userTask ⟨id⟩ (some id))
private def sub (owner id : String) := node owner (.embeddedSubProcess ⟨id⟩ (scope id))

private def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (owner id operation : String) (inputs outputs : List VariableMapping) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs outputs none)

private def declare (owner : String) (inputs outputs : List VariableMapping) : ScopeLocalData :=
  { scopeId := scope owner, localInputs := inputs, localOutputs := outputs }

/-- A Simple Boolean v1 test that the Process binding `name` equals `value`. -/
private def equals (name value : String) : CheckedCondition :=
  { language := simpleBoolean, body := "stringEquals(" ++ name ++ ",\"" ++ value ++ "\")" }

/-- A flow with an explicit id, so two flows between the same nodes stay distinct. -/
private structure Edge where
  id : String
  source : String
  target : String
  condition : Option CheckedCondition := none

/-- A checked graph of the nested scope-data profile over scopes, members and edges sorted into the canonical id
order, with its scope locals and a source overlay. -/
private def build (sourceId : String) (records : List ScopeLocalData) (scopes : List (String × Option String))
    (members : List (String × String × CheckedNode)) (edges : List Edge) : CheckedProcess :=
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (left.id ≤ right.id)
  let owner := fun (id : String) => ((members.find? (·.2.1 == id)).map (·.1)).getD ""
  let overlay : SourceOverlayIdentity :=
    { id := ⟨sourceId ++ "-handlers"⟩, sha256 := "000000000000000000000000000000000000000000000000000000000000000e" }
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨sourceId⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000d"
        sourceOverlay := some overlay }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, id, _) => { nodeId := ⟨id⟩, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := ⟨edge.id⟩, scopeId := scope (owner edge.source) }
    nodes := members.map (·.2.2)
    sequenceFlows := edges.map fun edge =>
      { id := ⟨edge.id⟩, sourceId := ⟨edge.source⟩, targetId := ⟨edge.target⟩, condition := edge.condition }
    scopeLocalData := records }

/-- Travel request: root `P` assesses the request in a Sub-Process whose User Task writes `decision` and `channel`,
copied to the Process, then *Route request* sends a rejection straight to *Request closed*, a phone request to *Call
traveller* and otherwise books the travel; *Call traveller* and *Book travel* both flow to *Request closed*.
`rejectTo` retargets the rejection, `phoneDirect` sends the phone candidate to the End and drops *Call traveller*, and
`secondEnd` ends *Book travel* at its own End. -/
private def travelWith (rejectTo : String := "RequestClosed") (phoneDirect secondEnd : Bool := false) : CheckedProcess :=
  let phoneTarget := if phoneDirect then "RequestClosed" else "CallTraveller"
  let bookedTarget := if secondEnd then "TravelBooked" else "RequestClosed"
  build "travel-request"
    [declare "AssessRequest" [literal "channel" "email", literal "decision" "pending"]
      [copied "channel" "channel", copied "decision" "decision"]]
    [("P", none), ("AssessRequest", some "P")]
    ([ start "P" "RequestReceived", sub "P" "AssessRequest"
     , node "P" (.exclusiveGateway ⟨"RouteRequest"⟩ [⟨"Flow_Reject"⟩, ⟨"Flow_Call"⟩] ⟨"Flow_Book"⟩)
     , service "P" "BookTravel" "bookTravel" [enclosing "traveller" "traveller"] [copied "bookingNumber" "booking"]
     , finish "P" "RequestClosed"
     , start "AssessRequest" "AssessmentOpened", task "AssessRequest" "CheckRequest"
     , finish "AssessRequest" "AssessmentClosed" ]
      ++ (if phoneDirect then [] else [task "P" "CallTraveller"])
      ++ (if secondEnd then [finish "P" "TravelBooked"] else []))
    ([ { id := "Flow_Received", source := "RequestReceived", target := "AssessRequest" }
     , { id := "Flow_Assessed", source := "AssessRequest", target := "RouteRequest" }
     , { id := "Flow_Reject", source := "RouteRequest", target := rejectTo, condition := some (equals "decision" "reject") }
     , { id := "Flow_Call", source := "RouteRequest", target := phoneTarget, condition := some (equals "channel" "phone") }
     , { id := "Flow_Book", source := "RouteRequest", target := "BookTravel" }
     , { id := "Flow_Booked", source := "BookTravel", target := bookedTarget }
     , { id := "Flow_AssessmentOpened", source := "AssessmentOpened", target := "CheckRequest" }
     , { id := "Flow_Checked", source := "CheckRequest", target := "AssessmentClosed" } ]
      ++ (if phoneDirect then [] else [{ id := "Flow_Called", source := "CallTraveller", target := "RequestClosed" }]))

private def travel : CheckedProcess := travelWith

/-- Employee onboarding: root `P` forks into *Prepare workstation* then *Order laptop*, and the Sub-Process *Collect
documents*; `joined` joins them before *Hold welcome meeting*, otherwise both branches end at *Employee onboarded*. -/
private def onboarding (joined : Bool) : CheckedProcess :=
  let edge := fun (source target : String) => ({ id := source ++ ">" ++ target, source, target } : Edge)
  let closing := if joined
    then ([join "P" "OnboardingReady", task "P" "HoldWelcomeMeeting"],
      [edge "OrderLaptop" "OnboardingReady", edge "CollectDocuments" "OnboardingReady",
        edge "OnboardingReady" "HoldWelcomeMeeting", edge "HoldWelcomeMeeting" "EmployeeOnboarded"])
    else ([], [edge "OrderLaptop" "EmployeeOnboarded", edge "CollectDocuments" "EmployeeOnboarded"])
  build "employee-onboarding"
    [declare "CollectDocuments" [enclosing "record" "employee", literal "stage" "documents-filed"]
      [copied "employee" "record", copied "onboardingStage" "stage"]]
    [("P", none), ("CollectDocuments", some "P")]
    ([ start "P" "HireRecorded", fork "P" "StartOnboarding", task "P" "PrepareWorkstation"
     , service "P" "OrderLaptop" "orderLaptop" [enclosing "employee" "employee"]
         [copied "assetTag" "tag", copied "onboardingStage" "stage"]
     , sub "P" "CollectDocuments", finish "P" "EmployeeOnboarded"
     , start "CollectDocuments" "DocumentsRequested", task "CollectDocuments" "ConfirmDocuments"
     , finish "CollectDocuments" "DocumentsFiled" ] ++ closing.1)
    ([ edge "HireRecorded" "StartOnboarding", edge "StartOnboarding" "PrepareWorkstation"
     , edge "StartOnboarding" "CollectDocuments", edge "PrepareWorkstation" "OrderLaptop"
     , edge "DocumentsRequested" "ConfirmDocuments", edge "ConfirmDocuments" "DocumentsFiled" ] ++ closing.2)

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- The `reachNoneEnd` operations of the End `finish`, as operation id and input place. -/
private def arrivals (program : Program) (finish : String) : List (String × String) :=
  program.operations.filterMap fun
    | .reachNoneEnd id origin input => if origin.elementId.value == finish then some (id.value, input.value) else none
    | _ => none

/-- `program` with the origin of operation `id`, a `reachNoneEnd`, replaced by `elementId`. -/
private def withOrigin (program : Program) (id elementId : String) : Program :=
  { program with operations := program.operations.map fun operation =>
    match operation with
    | .reachNoneEnd operationId _ input =>
        if operationId.value == id then .reachNoneEnd operationId { elementId := ⟨elementId⟩ } input else operation
    | _ => operation }

private def sorted (names : List String) : List String := names.mergeSort fun left right => decide (left ≤ right)

/-- NEF-ADMIT-01 and NEF-END-01: the model is admitted at both levels, routed to the re-entry account, and its three
End arrivals lower to one operation per incoming flow, while the body End keeps its element-derived identifier. -/
private def travel_request_is_admitted_with_one_operation_per_flow : Bool :=
  let program := lowerCheckedProcess travel
  admitted travel && ScopeReentry.checkedReentry travel && ScopeReentry.programReentry program &&
    StructuredScopeData.checkedRouted travel &&
    arrivals program "RequestClosed" ==
      [("operation:RequestClosed:from:Flow_Booked", "place:Flow_Booked"),
        ("operation:RequestClosed:from:Flow_Called", "place:Flow_Called"),
        ("operation:RequestClosed:from:Flow_Reject", "place:Flow_Reject")] &&
    arrivals program "AssessmentClosed" == [("operation:AssessmentClosed", "place:Flow_Checked")]

/-- SRE-AVAILABLE-01 and SRE-BURST-01 agree at both levels: only *Book travel*'s input is a required Start name. -/
private def start_requires_only_the_traveller : Bool :=
  let program := lowerCheckedProcess travel
  let checked := (ScopeReentry.checkedAnalysis travel).map fun analysis =>
    (sorted analysis.required, analysis.optional.map sorted)
  let lowered := (ScopeReentry.programAnalysis program).map fun analysis =>
    (sorted analysis.required, analysis.optional.map sorted)
  checked == some (["traveller"], none) && lowered == checked &&
    (ScopeReentry.checkedBurst? travel).isSome && ScopeReentry.checkedBurst? travel == ScopeReentry.programBurst? program

/-- NEF-ADMIT-01's optional scope: two flows of one Choice into the End are admitted. -/
private def two_flows_of_one_choice_are_admitted : Bool :=
  let edited := travelWith (phoneDirect := true)
  admitted edited && (arrivals (lowerCheckedProcess edited) "RequestClosed").map (·.2) ==
    ["place:Flow_Booked", "place:Flow_Call", "place:Flow_Reject"]

/-- NEF-ADMIT-01's exclusions: fan-in at an Activity, fan-in under a fork (against the admitted joined model) and a
second root End are each refused. -/
private def edits_leaving_the_class_are_refused : Bool :=
  !admitted (travelWith (rejectTo := "BookTravel")) && admitted (onboarding true) && !admitted (onboarding false) &&
    !admitted (travelWith (secondEnd := true))

/-- NEF-ADMIT-01's envelope relaxation: an End arrival sharing a User Task's origin and a body End sharing the root
End's origin are refused, and two root End elements pass the envelope but not SRE-ADMIT-01's one-End rule. -/
private def envelope_counts_a_shared_origin_once_only_among_root_arrivals : Bool :=
  let program := lowerCheckedProcess travel
  let sharesTask := withOrigin program "operation:RequestClosed:from:Flow_Called" "CallTraveller"
  let acrossScopes := withOrigin program "operation:AssessmentClosed" "RequestClosed"
  let secondEnd := withOrigin program "operation:RequestClosed:from:Flow_Booked" "TravelBooked"
  (NestedScopeData.programEnvelope? program).isSome &&
    (NestedScopeData.programEnvelope? sharesTask).isNone && (ScopeReentry.programAnalysis sharesTask).isNone &&
    (NestedScopeData.programEnvelope? acrossScopes).isNone && (ScopeReentry.programAnalysis acrossScopes).isNone &&
    (NestedScopeData.programEnvelope? secondEnd).isSome && (ScopeReentry.programAnalysis secondEnd).isNone

/-- NEF-ADMIT-01's profile control (wrong algorithm 2): the None End arm admits several incoming flows exactly when
both its `mixed` and `variableMerge` flags hold, and of the profiles either flag names only the nested scope-data
profile sets both; every other profile sets neither. -/
private def fan_in_arity_holds_for_the_nested_profile_alone : Bool :=
  let named : List ProfileId := [mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId, nestedScopeDataProfileId,
    ⟨embeddedCompletionProfile⟩]
  let fanIn := CheckedNode.noneEndEvent ⟨"RequestClosed"⟩
  named.all (fun profile => (checkedVariableChoiceProfile profile && checkedVariableMergeProfile profile) ==
    (profile == nestedScopeDataProfileId)) &&
  [false, true].all fun mixed => [false, true].all fun variableMerge =>
    checkedNodeArityValid false false mixed false variableMerge [] travel.sequenceFlows fanIn == (mixed && variableMerge)

/-- Every executable check of this module, named for the driver's failure report. -/
def noneEndFanInConformanceChecks : List (String × Bool) := [
  ("travel_request_is_admitted_with_one_operation_per_flow", travel_request_is_admitted_with_one_operation_per_flow),
  ("start_requires_only_the_traveller", start_requires_only_the_traveller),
  ("two_flows_of_one_choice_are_admitted", two_flows_of_one_choice_are_admitted),
  ("edits_leaving_the_class_are_refused", edits_leaving_the_class_are_refused),
  ("envelope_counts_a_shared_origin_once_only_among_root_arrivals", envelope_counts_a_shared_origin_once_only_among_root_arrivals),
  ("fan_in_arity_holds_for_the_nested_profile_alone", fan_in_arity_holds_for_the_nested_profile_alone)
]

end BpmnSemantics.NoneEndFanInConformance
