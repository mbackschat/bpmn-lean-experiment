module

public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission
import BpmnSemantics.SemanticProcess.InternalCommutationCensus
import BpmnSemantics.SemanticProcess.InternalCommutationCore

/-! # Activity host split conformance

Finite witnesses of the [split proposal](../docs/capsules/ACTIVITY-HOST-SPLIT-PROPOSAL.md#separating-witnesses).

The host Program rules (ACSP-HOST-01) admit a host of one input and two or more sorted distinct outputs beside the
merging form, and refuse a host that both merges and splits; the host takes no arming input, so it is never batched.

The insurance claim intake graph transcribes the retained `scenarios/activity-host-split` model with its flow ids, so its
lowered hosts carry the places the TypeScript lowering gives them; a Send Task is a checked Service Task. Each refused
graph differs from the admitted one in the fact its name states. The module runs no command: each split step is a Lean
execution of the registered scenarios in the pipeline. It imports admission owners only, as `ActivityHostConformance`
does, so it stays outside the step owner's import cone (`lean-fanout`).
-/

public section

namespace BpmnSemantics.ActivityHostSplitConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def processName : String := "Process_InsuranceClaimIntake"
private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
private def placeId (name : String) : ControlPlaceId := ⟨"place:" ++ name⟩

/-! ## Host Program rules -/

private def places : List ControlPlace :=
  ["Flow_A", "Flow_B", "Flow_In"].map fun name => { id := placeId name, origin := { elementId := ⟨name⟩ } }

private def hostProgram (operation : SemanticOperation) : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := nestedScopeDataProfileId
        sourceId := ⟨"activity-host-split-conformance"⟩
        sourceSha256 := "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨processName⟩
    definitionScopes := []
    operationScopes := []
    controlPlaceScopes := []
    controlPlaces := places
    operations := [operation] }

private def host (inputs outputs : List String) : ActivityHost :=
  { id := ⟨"op:ReviewClaim"⟩
    origin := { elementId := ⟨"ReviewClaim"⟩ }
    inputs := inputs.map placeId
    outputs := outputs.map fun name => { place := placeId name }
    work := .userTask { id := ⟨"ReviewClaim"⟩, name := some "Review claim" } }

private def hostValid (candidate : ActivityHost) : Bool :=
  let operation := SemanticOperation.activity candidate
  operationWellFormed (hostProgram operation) places operation &&
    activityHostWorkValid (hostProgram operation) places operation

/-- ACSP-HOST-01: one input and two sorted distinct outputs, with the work valid at every output. -/
private def splitting_host_is_admitted : Bool :=
  hostValid (host ["Flow_In"] ["Flow_A", "Flow_B"])

/-- ACSP-HOST-01: unsorted or repeated outputs, and a host that both merges and splits, are no host of this family. -/
private def other_splitting_hosts_are_refused : Bool :=
  !hostValid (host ["Flow_In"] ["Flow_B", "Flow_A"]) && !hostValid (host ["Flow_In"] ["Flow_A", "Flow_A"]) &&
    !hostValid (host ["Flow_A", "Flow_B"] ["Flow_In", "Flow_A"])

/-- ACSP-HOST-01: a splitting host takes no arming input and sits in the composite family, so it has no footprint. -/
private def splitting_host_is_never_batched : Bool :=
  let operation := SemanticOperation.activity (host ["Flow_In"] ["Flow_A", "Flow_B"])
  (internalArmInput? operation).isNone &&
    semanticOperationInternalFamily operation == .compositeWaitAndActivityArming

/-! ## The insurance claim intake model -/

private def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"
private def simpleBoolean : String := "urn:bpmn-lean:expression:simple-boolean:v1"

private structure Edge where
  id : String
  source : String
  target : String
  condition : Option CheckedCondition := none

/-- A node of the root scope or, with `inChild`, of *Intake*'s body. -/
private structure Member where
  node : CheckedNode
  inChild : Bool := false

private def root (node : CheckedNode) : Member := { node }
private def body (node : CheckedNode) : Member := { node, inChild := true }
private def user (id : String) : CheckedNode := .userTask ⟨id⟩ none none
private def summary : VariableMapping := { target := "claim", expression := .enclosingVariable "claimSummary" }

private def service (id operation : String) (outputs : List VariableMapping) : CheckedNode :=
  .serviceTask ⟨id⟩ { protocol := activityProtocol, operation } [summary] outputs none

/-- A two-scope checked graph of `profile` over members and edges sorted into the canonical id order, with a source
overlay; an edge lies in its source's scope. -/
private def build (members : List Member) (edges : List Edge) (profile : ProfileId := nestedScopeDataProfileId) :
    CheckedProcess :=
  let members := members.mergeSort fun left right => decide (left.node.id.value ≤ right.node.id.value)
  let edges := edges.mergeSort fun left right => decide (left.id ≤ right.id)
  let scopeOf := fun (id : String) =>
    if (members.find? (·.node.id.value == id)).any (·.inChild) then scope "Intake" else scope processName
  { identity :=
      { semanticProfile := profile, sourceId := ⟨"insurance-claim-intake"⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000d"
        sourceOverlay := some { id := ⟨"insurance-claim-intake-handlers"⟩
                                sha256 := "000000000000000000000000000000000000000000000000000000000000000e" } }
    processId := ⟨processName⟩
    definitionScopes := [{ id := scope "Intake", parentScopeId := some (scope processName), originElementId := ⟨"Intake"⟩ },
                         { id := scope processName, parentScopeId := none, originElementId := ⟨processName⟩ }]
    nodeScopes := members.map fun member => { nodeId := member.node.id, scopeId := scopeOf member.node.id.value }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := ⟨edge.id⟩, scopeId := scopeOf edge.source }
    nodes := members.map (·.node)
    sequenceFlows := edges.map fun edge =>
      { id := ⟨edge.id⟩, sourceId := ⟨edge.source⟩, targetId := ⟨edge.target⟩, condition := edge.condition } }

/-- *Intake*'s body: *Register claim* writes `claimNumber`; splitting, it opens *Archive documents* and the Send Task
*Notify broker*, each ending its own branch; serial, it runs them one after the other. -/
private def intakeBody (splits : Bool) : List Member × List Edge :=
  ([body (.noneStartEvent ⟨"IntakeOpened"⟩),
    body (service "RegisterClaim" "registerClaim"
      [{ target := "claimNumber", expression := .localVariable "claimNumber" }]),
    body (user "ArchiveDocuments"), body (service "NotifyBroker" "notifyBroker" []),
    body (.noneEndEvent ⟨"BrokerNotified"⟩)] ++
      (if splits then [body (.noneEndEvent ⟨"DocumentsArchived"⟩)] else []),
   [⟨"Flow_ToRegister", "IntakeOpened", "RegisterClaim", none⟩, ⟨"Flow_ToArchive", "RegisterClaim", "ArchiveDocuments", none⟩,
    ⟨"Flow_BrokerNotified", "NotifyBroker", "BrokerNotified", none⟩] ++
   if splits then
     [⟨"Flow_ToBroker", "RegisterClaim", "NotifyBroker", none⟩, ⟨"Flow_Archived", "ArchiveDocuments", "DocumentsArchived", none⟩]
   else [⟨"Flow_Archived", "ArchiveDocuments", "NotifyBroker", none⟩])

/-- The root after *Intake*: *Review claim* splits to the Service Task *Order assessment* and *Inform customer*, which
*Review done* joins before *Decide claim*. -/
private def reviewMembers : List Member :=
  [root (user "ReviewClaim"),
   root (service "OrderAssessment" "orderAssessment"
     [{ target := "assessmentReference", expression := .localVariable "assessmentReference" }]),
   root (user "InformCustomer"), root (.parallelGateway ⟨"ReviewDone"⟩ .converging), root (user "DecideClaim"),
   root (.noneEndEvent ⟨"ClaimDecided"⟩)]

private def reviewEdges : List Edge :=
  [⟨"Flow_ToAssessment", "ReviewClaim", "OrderAssessment", none⟩, ⟨"Flow_ToCustomer", "ReviewClaim", "InformCustomer", none⟩,
   ⟨"Flow_Assessed", "OrderAssessment", "ReviewDone", none⟩, ⟨"Flow_CustomerInformed", "InformCustomer", "ReviewDone", none⟩,
   ⟨"Flow_ToDecision", "ReviewDone", "DecideClaim", none⟩, ⟨"Flow_Decided", "DecideClaim", "ClaimDecided", none⟩]

private def replaced (edges : List Edge) (edits : List Edge) : List Edge :=
  edges.map fun edge => (edits.find? (·.id == edge.id)).getD edge

/-- The retained model; `edges` replaces whole edges by id and `extra` adds edges, so each edit below changes only the
fact its name states. -/
private def intakeWith (edges : List Edge := []) (extra : List Edge := []) (profile : ProfileId := nestedScopeDataProfileId) :
    CheckedProcess :=
  let (bodyMembers, bodyEdges) := intakeBody true
  build ([root (.noneStartEvent ⟨"ClaimReported"⟩), root (.embeddedSubProcess ⟨"Intake"⟩ (scope "Intake"))] ++
      reviewMembers ++ bodyMembers)
    (replaced ([⟨"Flow_ToIntake", "ClaimReported", "Intake", none⟩, ⟨"Flow_ToReview", "Intake", "ReviewClaim", none⟩] ++
      reviewEdges ++ bodyEdges) edges ++ extra) profile

private def intake : CheckedProcess := intakeWith

/-- *Intake* on one branch of a root fork whose other branch holds *Check coverage*, rejoined before *Review claim*;
`splits` chooses the splitting or the serial body. -/
private def intakeOnBranch (splits : Bool) : CheckedProcess :=
  let (bodyMembers, bodyEdges) := intakeBody splits
  build ([root (.noneStartEvent ⟨"ClaimReported"⟩), root (.parallelGateway ⟨"RootFork"⟩ .diverging),
      root (.embeddedSubProcess ⟨"Intake"⟩ (scope "Intake")), root (user "CheckCoverage"),
      root (.parallelGateway ⟨"RootJoin"⟩ .converging)] ++ reviewMembers ++ bodyMembers)
    ([⟨"Flow_ToFork", "ClaimReported", "RootFork", none⟩, ⟨"Flow_ToIntake", "RootFork", "Intake", none⟩,
      ⟨"Flow_ToCoverage", "RootFork", "CheckCoverage", none⟩, ⟨"Flow_IntakeDone", "Intake", "RootJoin", none⟩,
      ⟨"Flow_CoverageChecked", "CheckCoverage", "RootJoin", none⟩, ⟨"Flow_ToReview", "RootJoin", "ReviewClaim", none⟩] ++
      reviewEdges ++ bodyEdges)

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

/-- The host input and output places of `element`'s operation, or none when it is no host. -/
private def hostPlaces (program : Program) (element : String) : Option (List String × List String) :=
  match operationOf program element with
  | some (.activity host) => some (host.inputs.map (·.value), host.outputs.map (·.place.value))
  | _ => none

private def isLegacyWait (program : Program) (element : String) : Bool :=
  match operationOf program element with
  | some (.awaitUserTask ..) | some (.awaitEffect ..) => true
  | _ => false

/-- ACSP-ADMIT-01, ACSP-ONE-01: the model is admitted at both levels and routed to the concurrent account at each, never
to the re-entry account; each splitting Task lowers to one host over its one incoming flow with its outgoing flows in
canonical order, the Program holds no `duplicate`, and every one-flow Task keeps its legacy wait. -/
private def intake_is_admitted_with_two_splitting_hosts : Bool :=
  let program := lowerCheckedProcess intake
  admitted intake && StructuredScopeData.checkedRouted intake && StructuredScopeData.programRouted program &&
    StructuredScopeData.concurrentProgram program && !ScopeReentry.checkedReentry intake &&
    !ScopeReentry.programReentry program &&
    !program.operations.any (fun | .duplicate .. => true | _ => false) &&
    hostPlaces program "RegisterClaim" == some (["place:Flow_ToRegister"], ["place:Flow_ToArchive", "place:Flow_ToBroker"]) &&
    hostPlaces program "ReviewClaim" == some (["place:Flow_ToReview"], ["place:Flow_ToAssessment", "place:Flow_ToCustomer"]) &&
    ["ArchiveDocuments", "NotifyBroker", "OrderAssessment", "InformCustomer", "DecideClaim"].all (isLegacyWait program)

/-- CSD-AVAILABLE-01 agrees at both levels: the claim summary is the one Start name, so a splitting Service Task host's
accesses count as the legacy Task's (wrong algorithm 11). -/
private def start_names_agree : Bool :=
  NestedScopeControl.checkedStartNames intake == some ["claimSummary"] &&
    NestedScopeControl.programStartNames (lowerCheckedProcess intake) == some ["claimSummary"]

/-- ACSP-SINGLE-01: a splitting Task inside a fork region of an ancestor scope is refused at both levels, while its
serial twin is admitted. -/
private def splits_inside_fork_regions_are_refused : Bool :=
  let forked := intakeOnBranch true
  admitted (intakeOnBranch false) && !admitted forked && !StructuredScopeData.programRouted (lowerCheckedProcess forked)

/-- ACSP-ADMIT-01's refused edits: a conditioned outgoing flow, and a Task that both merges and splits, are refused. -/
private def edits_leaving_the_class_are_refused : Bool :=
  let conditioned := intakeWith (edges := [⟨"Flow_ToCustomer", "ReviewClaim", "InformCustomer",
    some { language := simpleBoolean, body := "stringEquals(claimSummary,\"x\")" }⟩])
  let mergingSplit := intakeWith (extra := [⟨"Flow_Again", "InformCustomer", "ReviewClaim", none⟩])
  !admitted conditioned && !admitted mergingSplit

/-- ACSP-PROFILE-01: under the embedded completion profile the model is refused. -/
private def other_profiles_refuse_the_splitting_tasks : Bool :=
  !admitted (intakeWith (profile := ⟨embeddedCompletionProfile⟩))

/-- ACSP-PROFILE-01's checked-level control: the Task arms admit a splitting User or Service Task exactly when both
`mixed` and `variableMerge` hold, and a one-flow Task under every flag. -/
private def task_arity_holds_for_the_nested_profile_alone : Bool :=
  let arity (id : String) (mixed variableMerge : Bool) : Bool :=
    (intake.nodes.find? (·.id.value == id)).any
      (checkedNodeArityValid true false mixed false variableMerge [] intake.sequenceFlows)
  [false, true].all fun mixed => [false, true].all fun variableMerge =>
    arity "ReviewClaim" mixed variableMerge == (mixed && variableMerge) &&
      arity "RegisterClaim" mixed variableMerge == (mixed && variableMerge) &&
      arity "DecideClaim" mixed variableMerge

/-- Every executable check of this module, named for the driver's failure report. -/
def activityHostSplitConformanceChecks : List (String × Bool) := [
  ("splitting_host_is_admitted", splitting_host_is_admitted),
  ("other_splitting_hosts_are_refused", other_splitting_hosts_are_refused),
  ("splitting_host_is_never_batched", splitting_host_is_never_batched),
  ("intake_is_admitted_with_two_splitting_hosts", intake_is_admitted_with_two_splitting_hosts),
  ("start_names_agree", start_names_agree),
  ("splits_inside_fork_regions_are_refused", splits_inside_fork_regions_are_refused),
  ("edits_leaving_the_class_are_refused", edits_leaving_the_class_are_refused),
  ("other_profiles_refuse_the_splitting_tasks", other_profiles_refuse_the_splitting_tasks),
  ("task_arity_holds_for_the_nested_profile_alone", task_arity_holds_for_the_nested_profile_alone)
]

end BpmnSemantics.ActivityHostSplitConformance
