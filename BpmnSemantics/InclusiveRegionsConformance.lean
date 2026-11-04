module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission

/-! # Inclusive regions conformance

Finite admission witnesses of IGR-ADMIT-01, IGR-BIND-01, IGR-ROOT-01 and IGR-PROFILE-01 of the [Inclusive regions proposal](../docs/capsules/INCLUSIVE-GATEWAY-REGIONS-PROPOSAL.md#separating-witnesses) under the nested scope-data profile. The account opening and event booking graphs transcribe the retained `scenarios/inclusive-gateway-regions` models; each refused graph differs from an admitted one in the fact its name states, and each Program-level check lowers the graph and decides on the Program alone. The module runs no command: the journeys are Lean executions of the registered scenarios in the pipeline. It imports admission owners only, as `RootParallelForksConformance` does, so it stays outside `CommandAdmission`'s hidden-edit cone (`lean-fanout`).
-/

public section

namespace BpmnSemantics.InclusiveRegionsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
private def node (owner : String) (value : CheckedNode) : String × String × CheckedNode := (owner, value.id.value, value)
private def start (owner id : String) := node owner (.noneStartEvent ⟨id⟩)
private def finish (owner id : String) := node owner (.noneEndEvent ⟨id⟩)
private def fork (owner id : String) := node owner (.parallelGateway ⟨id⟩ .diverging)
private def join (owner id : String) := node owner (.parallelGateway ⟨id⟩ .converging)
private def task (owner id : String) := node owner (.userTask ⟨id⟩ (some id))
private def plain (owner id : String) := node owner (.nonOperationalTask ⟨id⟩ .abstractTask)
private def sub (owner id : String) := node owner (.embeddedSubProcess ⟨id⟩ (scope id))

private def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (owner id operation : String) (inputs outputs : List VariableMapping) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs outputs none)

private def flowId (source target : String) : String := source ++ ">" ++ target

/-- An Inclusive split over its candidate targets, canonical by flow id, and its optional default target. -/
private def split (owner id : String) (candidates : List String) (defaultTarget : Option String) :=
  node owner (.inclusiveGatewayDiverging ⟨id⟩
    ((candidates.map (flowId id)).mergeSort (fun left right => decide (left ≤ right)) |>.map (⟨·⟩))
    (defaultTarget.map fun target => ⟨flowId id target⟩))

private def regionJoin (owner id splitId : String) := node owner (.inclusiveGatewayConverging ⟨id⟩ ⟨splitId⟩)

private def overlay : SourceOverlayIdentity :=
  { id := ⟨"inclusive-gateway-regions-handlers"⟩, sha256 := "000000000000000000000000000000000000000000000000000000000000000c" }

/-- A checked graph of the nested scope-data profile over scopes, members and edges sorted into the canonical id
order; an edge carries its Simple Boolean v1 condition, when it has one. -/
private def build (records : List ScopeLocalData) (scopes : List (String × Option String))
    (members : List (String × String × CheckedNode)) (edges : List (String × String × Option String)) : CheckedProcess :=
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (flowId left.1 left.2.1 ≤ flowId right.1 right.2.1)
  let owner := fun (id : String) => ((members.find? (·.2.1 == id)).map (·.1)).getD ""
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"inclusive-gateway-regions"⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000d"
        sourceOverlay := some overlay }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, id, _) => { nodeId := ⟨id⟩, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun (source, target, _) =>
      { sequenceFlowId := ⟨flowId source target⟩, scopeId := scope (owner source) }
    nodes := members.map (·.2.2)
    sequenceFlows := edges.map fun (source, target, condition) =>
      { id := ⟨flowId source target⟩, sourceId := ⟨source⟩, targetId := ⟨target⟩
        condition := condition.map fun body => { language := simpleBooleanExpressionLanguage, body } }
    scopeLocalData := records }

private def plainEdge (source target : String) : String × String × Option String := (source, target, none)
private def guarded (source target body : String) : String × String × Option String := (source, target, some body)

private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- Both analyses admit, each on its own, so a relaxation at one level cannot hide behind the other. -/
private def admittedAtEachLevel (source : CheckedProcess) : Bool :=
  admitted source && (NestedScopeControl.checkedAnalysis source).isSome &&
    (NestedScopeControl.programAnalysis (lowerCheckedProcess source)).isSome

private def refusedAtEachLevel (source : CheckedProcess) : Bool :=
  (NestedScopeControl.checkedAnalysis source).isNone &&
    (NestedScopeControl.programAnalysis (lowerCheckedProcess source)).isNone

/-- Account opening, transcribing `scenarios/inclusive-gateway-regions`: *Assess applicant* declares and copies out
`riskRating`, `residency` and `channel`; *Required checks* selects *Enhanced due diligence*, *Collect tax residency form*
and *Verify identity document* by condition, or *Standard verification* by default, and *Checks complete* joins them
before *Open account*. `taxResidency` replaces the tax residency branch's member, `taxCondition` its condition. -/
private def accountOpeningWith (taxResidency : String × String × CheckedNode := task "P" "CollectTaxResidencyForm")
    (taxCondition : Option String := some "stringEquals(residency,\"foreign\")") : CheckedProcess :=
  build
    [{ scopeId := scope "AssessApplicant"
       localInputs := [literal "channel" "unknown", literal "residency" "unknown", literal "riskRating" "unrated"]
       localOutputs := [copied "channel" "channel", copied "residency" "residency", copied "riskRating" "riskRating"] }]
    [("P", none), ("AssessApplicant", some "P"), ("EnhancedDueDiligence", some "P")]
    [ start "P" "ApplicationReceived", sub "P" "AssessApplicant"
    , split "P" "RequiredChecks" ["EnhancedDueDiligence", "CollectTaxResidencyForm", "VerifyIdentityDocument"]
        (some "StandardVerification")
    , sub "P" "EnhancedDueDiligence", taxResidency
    , service "P" "VerifyIdentityDocument" "verifyIdentityDocument" [enclosing "applicant" "application"]
        [copied "identityCheck" "identityCheck"]
    , task "P" "StandardVerification", regionJoin "P" "ChecksComplete" "RequiredChecks", task "P" "OpenAccount"
    , finish "P" "AccountOpened"
    , start "AssessApplicant" "AssessmentOpened", task "AssessApplicant" "AssessApplicantTask"
    , finish "AssessApplicant" "AssessmentClosed"
    , start "EnhancedDueDiligence" "DueDiligenceOpened", task "EnhancedDueDiligence" "VerifySourceOfFunds"
    , finish "EnhancedDueDiligence" "DueDiligenceClosed" ]
    [ plainEdge "ApplicationReceived" "AssessApplicant", plainEdge "AssessApplicant" "RequiredChecks"
    , guarded "RequiredChecks" "EnhancedDueDiligence" "stringEquals(riskRating,\"high\")"
    , ("RequiredChecks", "CollectTaxResidencyForm", taxCondition)
    , guarded "RequiredChecks" "VerifyIdentityDocument" "stringEquals(channel,\"online\")"
    , plainEdge "RequiredChecks" "StandardVerification"
    , plainEdge "EnhancedDueDiligence" "ChecksComplete", plainEdge "CollectTaxResidencyForm" "ChecksComplete"
    , plainEdge "VerifyIdentityDocument" "ChecksComplete", plainEdge "StandardVerification" "ChecksComplete"
    , plainEdge "ChecksComplete" "OpenAccount", plainEdge "OpenAccount" "AccountOpened"
    , plainEdge "AssessmentOpened" "AssessApplicantTask", plainEdge "AssessApplicantTask" "AssessmentClosed"
    , plainEdge "DueDiligenceOpened" "VerifySourceOfFunds", plainEdge "VerifySourceOfFunds" "DueDiligenceClosed" ]

/-- Event booking, transcribing `scenarios/inclusive-gateway-regions`: after *Quote event*, *Prepare event* forks *Book
venue* and the split *Order extras*, whose catering and technology outputs are conditioned and whose attendee-list
output carries no condition; the technology branch is a Parallel block. `attendeeCondition` conditions that output. -/
private def eventBookingWith (attendeeCondition : Option String := none) : CheckedProcess :=
  build []
    [("P", none)]
    [ start "P" "EventRequested"
    , service "P" "QuoteEvent" "quoteEvent" [enclosing "event" "event"] [copied "quote" "quote"]
    , fork "P" "PrepareEvent", task "P" "BookVenue"
    , split "P" "OrderExtras" ["OrderCatering", "ArrangeTechnology", "ConfirmAttendeeList"] none
    , task "P" "OrderCatering", fork "P" "ArrangeTechnology", task "P" "RentProjector", task "P" "BookTechnician"
    , join "P" "TechnologyArranged", task "P" "ConfirmAttendeeList", regionJoin "P" "ExtrasOrdered" "OrderExtras"
    , join "P" "EventReady", task "P" "SendConfirmation", finish "P" "EventBooked" ]
    [ plainEdge "EventRequested" "QuoteEvent", plainEdge "QuoteEvent" "PrepareEvent"
    , plainEdge "PrepareEvent" "BookVenue", plainEdge "PrepareEvent" "OrderExtras"
    , guarded "OrderExtras" "OrderCatering" "stringEquals(catering,\"yes\")"
    , guarded "OrderExtras" "ArrangeTechnology" "stringEquals(technology,\"yes\")"
    , ("OrderExtras", "ConfirmAttendeeList", attendeeCondition)
    , plainEdge "ArrangeTechnology" "RentProjector", plainEdge "ArrangeTechnology" "BookTechnician"
    , plainEdge "RentProjector" "TechnologyArranged", plainEdge "BookTechnician" "TechnologyArranged"
    , plainEdge "OrderCatering" "ExtrasOrdered", plainEdge "TechnologyArranged" "ExtrasOrdered"
    , plainEdge "ConfirmAttendeeList" "ExtrasOrdered", plainEdge "BookVenue" "EventReady"
    , plainEdge "ExtrasOrdered" "EventReady", plainEdge "EventReady" "SendConfirmation"
    , plainEdge "SendConfirmation" "EventBooked" ]

/-- IGR-ADMIT-01: both retained models, each within the closure limit at eight steps. -/
private def retained_models_are_admitted_at_each_level : Bool :=
  admittedAtEachLevel (accountOpeningWith) && admittedAtEachLevel (eventBookingWith) &&
    decide (NestedScopeControl.checkedAnalysis accountOpeningWith = some 8 ∧
      NestedScopeControl.checkedAnalysis eventBookingWith = some 8)

/-- CIB-INT-0005: the unconditioned output lowers to the literal `true`, and the split carries no default. -/
private def unconditioned_output_lowers_to_true : Bool :=
  (lowerCheckedProcess eventBookingWith).operations.any fun
    | .selectMany _ _ _ candidates none _ =>
        candidates.any fun candidate => candidate.condition == .literal true &&
          candidate.origin.elementId.value == flowId "OrderExtras" "ConfirmAttendeeList"
    | _ => false

/-- IGR-ADMIT-01 condition 3: no default and every output conditioned; a default beside an unconditioned output. -/
private def selection_rule_refusals : Bool :=
  refusedAtEachLevel (eventBookingWith (attendeeCondition := some "stringEquals(catering,\"no\")")) &&
    refusedAtEachLevel (accountOpeningWith (taxCondition := none))

/-- IGR-ADMIT-01 condition 4: a pass-through branch, refused. -/
private def pass_through_branch_is_refused : Bool :=
  refusedAtEachLevel (accountOpeningWith (taxResidency := plain "P" "CollectTaxResidencyForm"))

/-- IGR-BIND-01: two expected join inputs swapped in the lowered Program; graph validation alone admits the swap. -/
private def swapped_join_inputs_are_refused : Bool :=
  let program := lowerCheckedProcess accountOpeningWith
  let swap := fun (candidates : List InclusiveCandidate) => match candidates with
    | first :: second :: rest =>
        { first with expectedJoinInput := second.expectedJoinInput } ::
          { second with expectedJoinInput := first.expectedJoinInput } :: rest
    | other => other
  let swapped := { program with operations := program.operations.map fun
    | .selectMany id origin input candidates defaultBranch key => .selectMany id origin input (swap candidates) defaultBranch key
    | operation => operation }
  programWellFormed swapped && (NestedScopeControl.programAnalysis swapped).isNone &&
    (NestedScopeControl.programAnalysis program).isSome

/-- Two blocks in sequence: the first opened by `I` and closed by `PJ`, the second opened by `Q` and closed by `IJ`.
`crossed` makes `I` an Inclusive split with two unconditioned outputs and `IJ` the Inclusive join naming it. -/
private def blocks (crossed : Bool) : CheckedProcess :=
  build [] [("P", none)]
    ([ start "P" "Opened", task "P" "A", task "P" "B", join "P" "PJ", fork "P" "Q", task "P" "C", task "P" "D"
     , finish "P" "Closed" ] ++
      (if crossed then [split "P" "I" ["A", "B"] none, regionJoin "P" "IJ" "I"] else [fork "P" "I", join "P" "IJ"]))
    [ plainEdge "Opened" "I", plainEdge "I" "A", plainEdge "I" "B", plainEdge "A" "PJ"
    , plainEdge "B" "PJ", plainEdge "PJ" "Q", plainEdge "Q" "C", plainEdge "Q" "D", plainEdge "C" "IJ"
    , plainEdge "D" "IJ", plainEdge "IJ" "Closed" ]

/-- Wrong algorithm 5: key pairing alone passes the crossing; structural pairing refuses it beside its Parallel twin. -/
private def crossing_is_refused : Bool :=
  refusedAtEachLevel (blocks true) && admittedAtEachLevel (blocks false)

/-- The minimal data-free region: `wrapped` puts it in a Sub-Process body, otherwise it follows a Sub-Process. -/
private def minimalRegion (wrapped : Bool) : CheckedProcess :=
  let owner := if wrapped then "Work" else "P"
  let region := [ split owner "Split" ["Rush"] (some "Normal"), task owner "Rush", task owner "Normal"
    , regionJoin owner "Join" "Split" ]
  let regionEdges := [ guarded "Split" "Rush" "isPresent(rush)", plainEdge "Split" "Normal"
    , plainEdge "Rush" "Join", plainEdge "Normal" "Join" ]
  if wrapped then
    build [] [("P", none), ("Work", some "P")]
      ([ start "P" "Opened", task "P" "Prepare", sub "P" "Work", task "P" "Finish", finish "P" "Closed"
       , start "Work" "WorkOpened", finish "Work" "WorkClosed" ] ++ region)
      ([ plainEdge "Opened" "Prepare", plainEdge "Prepare" "Work", plainEdge "Work" "Finish", plainEdge "Finish" "Closed"
       , plainEdge "WorkOpened" "Split", plainEdge "Join" "WorkClosed" ] ++ regionEdges)
  else
    build [] [("P", none), ("Work", some "P")]
      ([ start "P" "Opened", sub "P" "Work", task "P" "Finish", finish "P" "Closed"
       , start "Work" "WorkOpened", task "Work" "Inner", finish "Work" "WorkClosed" ] ++ region)
      ([ plainEdge "Opened" "Work", plainEdge "Work" "Split", plainEdge "Join" "Finish", plainEdge "Finish" "Closed"
       , plainEdge "WorkOpened" "Inner", plainEdge "Inner" "WorkClosed" ] ++ regionEdges)

/-- IGR-ROOT-01: the region in a Sub-Process body is refused, the same region in the root admitted. -/
private def body_region_is_refused_beside_its_root_twin : Bool :=
  refusedAtEachLevel (minimalRegion true) && admittedAtEachLevel (minimalRegion false)

/-- IGR-PROFILE-01: the root region relabelled to the embedded completion profile, without an overlay, is refused. -/
private def root_region_is_refused_under_embedded_completion : Bool :=
  let relabelled := { minimalRegion false with identity :=
    { (minimalRegion false).identity with semanticProfile := embeddedCompletionProfileId, sourceOverlay := none } }
  refusedAtEachLevel relabelled

/-- Every executable check of this module, named for the driver's failure report. -/
def inclusiveRegionsConformanceChecks : List (String × Bool) := [
  ("retained_models_are_admitted_at_each_level", retained_models_are_admitted_at_each_level),
  ("unconditioned_output_lowers_to_true", unconditioned_output_lowers_to_true),
  ("selection_rule_refusals", selection_rule_refusals),
  ("pass_through_branch_is_refused", pass_through_branch_is_refused),
  ("swapped_join_inputs_are_refused", swapped_join_inputs_are_refused),
  ("crossing_is_refused", crossing_is_refused),
  ("body_region_is_refused_beside_its_root_twin", body_region_is_refused_beside_its_root_twin),
  ("root_region_is_refused_under_embedded_completion", root_region_is_refused_under_embedded_completion)
]

end BpmnSemantics.InclusiveRegionsConformance
