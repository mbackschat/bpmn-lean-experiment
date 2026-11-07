module

public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission
import BpmnSemantics.SemanticProcess.LinkContraction
import BpmnSemantics.SemanticProcess.InternalCommutationCensus
import BpmnSemantics.SemanticProcess.EffectMappingValuePolicy
import BpmnSemantics.SemanticProcess.InternalCommutationCore

/-! # Activity host conformance

Finite witnesses of the [Activity host specification](../docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#separating-witnesses).

The host Program rules (ACTH-HOST-01) admit a host of two sorted distinct inputs and one output and refuse every other
host, so a host never doubles a Task's legacy encoding; the host takes no arming input and belongs to the composite
commutation family, so it is never batched.

The claim review graph transcribes the retained `scenarios/activity-host-merge` model with its flow ids, so its lowered
hosts carry the places the TypeScript lowering gives them; its Start names and burst are the TypeScript analysis's
values for the same graph. Each refused graph differs from the admitted one in the fact its name states. The module
runs no command: each arrival is a Lean execution of the registered scenarios in the pipeline. It imports admission
owners only, as `NoneEndFanInConformance` does, so it stays outside the step owner's import cone (`lean-fanout`).
-/

public section

namespace BpmnSemantics.ActivityHostConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

/-! ## Host Program rules -/

private def place (name : String) : ControlPlace := { id := ⟨"place:" ++ name⟩, origin := { elementId := ⟨name⟩ } }

private def places : List ControlPlace := [place "Flow_A", place "Flow_B", place "Flow_Out"]

private def host (inputs : List String) (outputs : List String) : ActivityHost :=
  { id := ⟨"op:Task_Review"⟩
    origin := { elementId := ⟨"Task_Review"⟩ }
    inputs := inputs.map fun name => ⟨"place:" ++ name⟩
    outputs := outputs.map fun name => { place := ⟨"place:" ++ name⟩ }
    work := .userTask { id := ⟨"Task_Review"⟩, name := some "Review claim" } }

private def hostProgram (operation : SemanticOperation) : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := nestedScopeDataProfileId
        sourceId := ⟨"activity-host-conformance"⟩
        sourceSha256 := "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"Process_ActivityHost"⟩
    definitionScopes := []
    operationScopes := []
    controlPlaceScopes := []
    controlPlaces := places
    operations := [operation] }

private def hostValid (candidate : ActivityHost) : Bool :=
  let operation := SemanticOperation.activity candidate
  operationWellFormed (hostProgram operation) places operation &&
    activityHostWorkValid (hostProgram operation) places operation

/-- ACTH-HOST-01: two sorted distinct inputs and one output, with the work valid as its legacy projection. -/
private def merging_host_is_admitted : Bool :=
  hostValid (host ["Flow_A", "Flow_B"] ["Flow_Out"])

/-- ACTH-HOST-01: one input would double the legacy encoding; unsorted inputs, two outputs and no output are no host
of this family. -/
private def other_hosts_are_refused : Bool :=
  !hostValid (host ["Flow_A"] ["Flow_Out"]) && !hostValid (host ["Flow_B", "Flow_A"] ["Flow_Out"]) &&
    !hostValid (host ["Flow_A", "Flow_B"] ["Flow_Out", "Flow_A"]) && !hostValid (host ["Flow_A", "Flow_B"] [])

/-- ACTH-HOST-01: the host takes no arming input and sits in the composite family, so it has no footprint. -/
private def host_is_never_batched : Bool :=
  let operation := SemanticOperation.activity (host ["Flow_A", "Flow_B"] ["Flow_Out"])
  (internalArmInput? operation).isNone &&
    semanticOperationInternalFamily operation == .compositeWaitAndActivityArming

/-! ## The claim review model -/

private def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"
private def simpleBoolean : String := "urn:bpmn-lean:expression:simple-boolean:v1"

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
private def node (value : CheckedNode) : String × CheckedNode := (value.id.value, value)
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (id operation : String) (inputs outputs : List VariableMapping) :=
  node (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs outputs none)

private def equals (name value : String) : CheckedCondition :=
  { language := simpleBoolean, body := "stringEquals(" ++ name ++ ",\"" ++ value ++ "\")" }

private structure Edge where
  id : String
  source : String
  target : String
  condition : Option CheckedCondition := none

/-- A root-only checked graph of the nested scope-data profile over members and edges sorted into the canonical id
order, with a source overlay; `profile` relabels it for the profile negatives. -/
private def build (members : List (String × CheckedNode)) (edges : List Edge)
    (profile : ProfileId := nestedScopeDataProfileId) : CheckedProcess :=
  let members := members.mergeSort fun left right => decide (left.1 ≤ right.1)
  let edges := edges.mergeSort fun left right => decide (left.id ≤ right.id)
  { identity :=
      { semanticProfile := profile, sourceId := ⟨"claim-review"⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000d"
        sourceOverlay := some { id := ⟨"claim-review-handlers"⟩
                                sha256 := "000000000000000000000000000000000000000000000000000000000000000e" } }
    processId := ⟨"P"⟩
    definitionScopes := [{ id := scope "P", parentScopeId := none, originElementId := ⟨"P"⟩ }]
    nodeScopes := members.map fun (id, _) => { nodeId := ⟨id⟩, scopeId := scope "P" }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := ⟨edge.id⟩, scopeId := scope "P" }
    nodes := members.map (·.2)
    sequenceFlows := edges.map fun edge =>
      { id := ⟨edge.id⟩, sourceId := ⟨edge.source⟩, targetId := ⟨edge.target⟩, condition := edge.condition } }

/-- Claim review: *Triage claim* writes `triage`; *Expert needed?* sends an expert claim to *Obtain expert opinion* and
otherwise straight to *Review claim*, which the opinion also reaches; *Fetch review outcome* writes `review`, and
*Reopen?* sends a reopened claim back to *Obtain expert opinion*, otherwise to *Claim decided*. `members` and `edges`
replace whole entries by id, so each edit below changes only the fact its name states. -/
private def claimMembers : List (String × CheckedNode) :=
  [ node (.noneStartEvent ⟨"ClaimSubmitted"⟩)
  , service "TriageClaim" "triageClaim" [enclosing "claim" "claimSummary"] [copied "triage" "route"]
  , node (.exclusiveGateway ⟨"ExpertNeeded"⟩ [⟨"Flow_ToExpert"⟩] (some ⟨"Flow_Direct"⟩))
  , service "ObtainExpertOpinion" "obtainExpertOpinion" [enclosing "question" "claimSummary"] [copied "opinion" "opinion"]
  , node (.userTask ⟨"ReviewClaim"⟩ (some "Review claim") none)
  , service "FetchReviewOutcome" "fetchReviewOutcome" [enclosing "claim" "claimSummary"] [copied "review" "outcome"]
  , node (.exclusiveGateway ⟨"Reopen"⟩ [⟨"Flow_Reopen"⟩] (some ⟨"Flow_Close"⟩))
  , node (.noneEndEvent ⟨"ClaimDecided"⟩) ]

private def claimEdges : List Edge :=
  [ { id := "Flow_Submitted", source := "ClaimSubmitted", target := "TriageClaim" }
  , { id := "Flow_Triaged", source := "TriageClaim", target := "ExpertNeeded" }
  , { id := "Flow_ToExpert", source := "ExpertNeeded", target := "ObtainExpertOpinion",
      condition := some (equals "triage" "expert") }
  , { id := "Flow_Direct", source := "ExpertNeeded", target := "ReviewClaim" }
  , { id := "Flow_OpinionReceived", source := "ObtainExpertOpinion", target := "ReviewClaim" }
  , { id := "Flow_Reviewed", source := "ReviewClaim", target := "FetchReviewOutcome" }
  , { id := "Flow_OutcomeFetched", source := "FetchReviewOutcome", target := "Reopen" }
  , { id := "Flow_Reopen", source := "Reopen", target := "ObtainExpertOpinion", condition := some (equals "review" "reopen") }
  , { id := "Flow_Close", source := "Reopen", target := "ClaimDecided" } ]

private def replaced {α : Type} (key : α → String) (entries : List α) (edits : List α) : List α :=
  entries.map fun entry => (edits.find? (key · == key entry)).getD entry

private def claimWith (members : List (String × CheckedNode) := []) (edges : List Edge := []) (extra : List Edge := [])
    (profile : ProfileId := nestedScopeDataProfileId) : CheckedProcess :=
  build (replaced (·.1) claimMembers members) (replaced (·.id) claimEdges edges ++ extra) profile

private def claim : CheckedProcess := claimWith

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- The lowered operation whose origin is `element`, when exactly one has it. -/
private def operationOf (program : Program) (element : String) : Option SemanticOperation :=
  match program.operations.filter (·.origin.elementId.value == element) with
  | [operation] => some operation
  | _ => none

/-- The host inputs of `element`'s operation, or none when it is no host. -/
private def hostInputs (program : Program) (element : String) : Option (List String) :=
  match operationOf program element with
  | some (.activity host) => some (host.inputs.map (·.value))
  | _ => none

private def isLegacyEffect (program : Program) (element : String) : Bool :=
  match operationOf program element with
  | some (.awaitEffect ..) => true
  | _ => false

/-- ACTH-ADMIT-01, ACTH-ONE-01: the model is admitted at both levels and routed to the re-entry account at each; each
merging Task lowers to one host over its incoming flows in canonical order, and each single-flow Task keeps its legacy
wait. -/
private def claim_review_is_admitted_with_two_hosts : Bool :=
  let program := lowerCheckedProcess claim
  admitted claim && ScopeReentry.checkedReentry claim && ScopeReentry.programReentry program &&
    StructuredScopeData.checkedRouted claim &&
    hostInputs program "ReviewClaim" == some ["place:Flow_Direct", "place:Flow_OpinionReceived"] &&
    hostInputs program "ObtainExpertOpinion" == some ["place:Flow_Reopen", "place:Flow_ToExpert"] &&
    isLegacyEffect program "TriageClaim" && isLegacyEffect program "FetchReviewOutcome"

/-- SRE-AVAILABLE-01 and SRE-BURST-01 agree at both levels: a merging Task keeps its accesses and its cut, so only the
claim summary is a Start name and the longest automatic burst is three steps. -/
private def start_names_and_burst_agree : Bool :=
  let program := lowerCheckedProcess claim
  (ScopeReentry.checkedAnalysis claim).map (·.required) == some ["claimSummary"] &&
    (ScopeReentry.programAnalysis program).map (·.required) == some ["claimSummary"] &&
    ScopeReentry.checkedBurst? claim == some 3 && ScopeReentry.programBurst? program == some 3

/-- ACTH-ADMIT-01's refused edits: a merging Task with two outgoing flows and arrivals from two Parallel branches (wrong
algorithm 7) stay refused, the latter at the Program level too. -/
private def edits_leaving_the_class_are_refused : Bool :=
  let split := claimWith (extra := [{ id := "Flow_Extra", source := "ReviewClaim", target := "ClaimDecided" }])
  let forked := claimWith (members := [node (.parallelGateway ⟨"ExpertNeeded"⟩ .diverging)])
    (edges := [{ id := "Flow_ToExpert", source := "ExpertNeeded", target := "ObtainExpertOpinion" }])
  !admitted split && !admitted forked && !StructuredScopeData.programRouted (lowerCheckedProcess forked)

/-- ACTH-PROFILE-01: under the embedded completion profile the model is refused. -/
private def other_profiles_refuse_the_merging_task : Bool :=
  !admitted (claimWith (profile := ⟨embeddedCompletionProfile⟩))

/-- ACTH-PROFILE-01's checked-level control (wrong algorithm 2): the Task arms admit a merging User or Service Task
exactly when both `mixed` and `variableMerge` hold, and a single-flow Task under every flag. -/
private def task_arity_holds_for_the_nested_profile_alone : Bool :=
  let arity (id : String) (mixed variableMerge : Bool) : Bool :=
    (claim.nodes.find? (·.id.value == id)).any
      (checkedNodeArityValid true false mixed false variableMerge [] claim.sequenceFlows)
  [false, true].all fun mixed => [false, true].all fun variableMerge =>
    arity "ReviewClaim" mixed variableMerge == (mixed && variableMerge) &&
      arity "ObtainExpertOpinion" mixed variableMerge == (mixed && variableMerge) &&
      arity "TriageClaim" mixed variableMerge

/-- Both flows into *Obtain expert opinion* as throws of one Link name, whose one catch leads to `successor`. -/
private def linkTwin (base : CheckedProcess) (successor : String) : CheckedProcess :=
  let links := [node (.linkThrowEvent ⟨"ThrowReopenToExpert"⟩ "ToExpert"), node (.linkThrowEvent ⟨"ThrowToExpert"⟩ "ToExpert"),
    node (.linkCatchEvent ⟨"CatchToExpert"⟩ "ToExpert")]
  let edges := base.sequenceFlows.map fun flow =>
    let target := if flow.id.value == "Flow_ToExpert" then "ThrowToExpert"
      else if flow.id.value == "Flow_Reopen" then "ThrowReopenToExpert" else flow.targetId.value
    ({ id := flow.id.value, source := flow.sourceId.value, target, condition := flow.condition } : Edge)
  build (claimMembers ++ links) (edges ++ [{ id := "Flow_ExpertCaught", source := "CatchToExpert", target := successor }])

/-- ACTH-ADMIT-01: two Link throws of one name whose catch leads to a Task contract to the merging model, and the same
two throws into a Choice stay refused. -/
private def link_throws_into_a_task_merge : Bool :=
  contractLinks? (linkTwin claim "ObtainExpertOpinion") == some claim &&
    contractLinks? (linkTwin claim "ExpertNeeded") == none

/-- Every executable check of this module, named for the driver's failure report. -/
def activityHostConformanceChecks : List (String × Bool) := [
  ("merging_host_is_admitted", merging_host_is_admitted),
  ("other_hosts_are_refused", other_hosts_are_refused),
  ("host_is_never_batched", host_is_never_batched),
  ("claim_review_is_admitted_with_two_hosts", claim_review_is_admitted_with_two_hosts),
  ("start_names_and_burst_agree", start_names_and_burst_agree),
  ("edits_leaving_the_class_are_refused", edits_leaving_the_class_are_refused),
  ("other_profiles_refuse_the_merging_task", other_profiles_refuse_the_merging_task),
  ("task_arity_holds_for_the_nested_profile_alone", task_arity_holds_for_the_nested_profile_alone),
  ("link_throws_into_a_task_merge", link_throws_into_a_task_merge)
]

end BpmnSemantics.ActivityHostConformance
