module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission

/-! # Pass-through implicit split and merge conformance

Finite admission witnesses of PTSM-ADMIT-01, PTSM-MERGE-01, PTSM-SPLIT-01 and PTSM-PROFILE-01 under the nested
scope-data profile. The claim archiving and equipment dispatch graphs transcribe the retained
`scenarios/pass-through-implicit-split-merge` models, each with its Manual Task swapped for an Abstract Task or a None
Throw as notation twins; the event booking, loan intake and forked-region graphs are the source test's projection
witness and refused edits. Each refused graph differs from an admitted one in the fact its name states. The module runs
no command: the journeys are Lean executions of the registered scenarios in the pipeline. It imports admission owners
only, as `PassThroughTaskConformance` does, so it stays outside `CommandAdmission`'s hidden-edit cone (`lean-fanout`).
See the [pass-through implicit split and merge proposal](../docs/capsules/PASS-THROUGH-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.PassThroughImplicitSplitMergeConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
private def flowId (source target : String) : String := source ++ ">" ++ target
private def node (owner : String) (value : CheckedNode) : String × String × CheckedNode := (owner, value.id.value, value)
private def start (owner id : String) := node owner (.noneStartEvent ⟨id⟩)
private def finish (owner id : String) := node owner (.noneEndEvent ⟨id⟩)
private def fork (owner id : String) := node owner (.parallelGateway ⟨id⟩ .diverging)
private def join (owner id : String) := node owner (.parallelGateway ⟨id⟩ .converging)
private def task (owner id : String) := node owner (.userTask ⟨id⟩ (some id))
private def sub (owner id : String) := node owner (.embeddedSubProcess ⟨id⟩ (scope id))
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (owner id operation : String) (inputs outputs : List VariableMapping) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs outputs none)

/-- The pass-through notations a witness is twinned over: a Manual Task, an Abstract Task and a None Throw. -/
private inductive Notation where
  | manual | abstract | noneThrow
  deriving DecidableEq

private def allNotations : List Notation := [.manual, .abstract, .noneThrow]

private def pass (kind : Notation) (owner id : String) := match kind with
  | .manual => node owner (.nonOperationalTask ⟨id⟩ .manualTask)
  | .abstract => node owner (.nonOperationalTask ⟨id⟩ .abstractTask)
  | .noneThrow => node owner (.noneIntermediateThrowEvent ⟨id⟩)

/-- An Inclusive split over its candidate targets, canonical by flow id, and its optional default target. -/
private def split (owner id : String) (candidates : List String) (defaultTarget : Option String) :=
  node owner (.inclusiveGatewayDiverging ⟨id⟩
    ((candidates.map (flowId id)).mergeSort (fun left right => decide (left ≤ right)) |>.map (⟨·⟩))
    (defaultTarget.map fun target => ⟨flowId id target⟩))

private def regionJoin (owner id splitId : String) := node owner (.inclusiveGatewayConverging ⟨id⟩ ⟨splitId⟩)

private def overlay : SourceOverlayIdentity :=
  { id := ⟨"pass-through-implicit-split-merge-handlers"⟩
    sha256 := "000000000000000000000000000000000000000000000000000000000000000e" }

/-- A checked graph of the nested scope-data profile over scopes, members and edges sorted into the canonical id
order; an edge carries its Simple Boolean v1 condition, when it has one. -/
private def build (scopes : List (String × Option String)) (members : List (String × String × CheckedNode))
    (edges : List (String × String × Option String)) : CheckedProcess :=
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (flowId left.1 left.2.1 ≤ flowId right.1 right.2.1)
  let owner := fun (id : String) => ((members.find? (·.2.1 == id)).map (·.1)).getD ""
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"pass-through-implicit-split-merge"⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000f"
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
    scopeLocalData := [] }

private def plainEdge (source target : String) : String × String × Option String := (source, target, none)
private def guarded (source target body : String) : String × String × Option String := (source, target, some body)

/-- Claim archiving: *Assess claim* maps `claim` to `decision`, the Choice *Claim approved?* sends an approved claim to
*Approve payout* and any other to *Write rejection letter*, and both enter *Archive claim file* before the End.
`alsoSplit` gives *Archive claim file* a second outgoing flow, to a second End. -/
private def claimWith (kind : Notation := .manual) (alsoSplit : Bool := false) : CheckedProcess :=
  build [("P", none)]
    ([ start "P" "ClaimReceived"
     , service "P" "AssessClaim" "assessClaim" [enclosing "claim" "claim"] [copied "decision" "decision"]
     , node "P" (.exclusiveGateway ⟨"ClaimApproved"⟩ [⟨flowId "ClaimApproved" "ApprovePayout"⟩]
         (some ⟨flowId "ClaimApproved" "WriteRejectionLetter"⟩))
     , task "P" "ApprovePayout", task "P" "WriteRejectionLetter", pass kind "P" "ArchiveClaimFile"
     , finish "P" "ClaimClosed" ] ++ (if alsoSplit then [finish "P" "FileForwarded"] else []))
    ([ plainEdge "ClaimReceived" "AssessClaim", plainEdge "AssessClaim" "ClaimApproved"
     , guarded "ClaimApproved" "ApprovePayout" "stringEquals(decision,\"approve\")"
     , plainEdge "ClaimApproved" "WriteRejectionLetter", plainEdge "ApprovePayout" "ArchiveClaimFile"
     , plainEdge "WriteRejectionLetter" "ArchiveClaimFile", plainEdge "ArchiveClaimFile" "ClaimClosed" ]
      ++ (if alsoSplit then [plainEdge "ArchiveClaimFile" "FileForwarded"] else []))

/-- Equipment dispatch: *Reserve equipment* maps `order` to `reservation`, then *Print dispatch note* forks *Pack
equipment* and *Book courier*, which *Ready to ship* joins before the End. `conditioned` puts a condition on the
courier flow; `closer` closes the branches with another node, a merge under the fork when it is a pass-through one. -/
private def dispatchWith (kind : Notation := .manual) (conditioned : Bool := false)
    (closer : String → String → String × String × CheckedNode := join) : CheckedProcess :=
  build [("P", none)]
    [ start "P" "OrderPlaced"
    , service "P" "ReserveEquipment" "reserveEquipment" [enclosing "order" "order"] [copied "reservation" "reservation"]
    , pass kind "P" "PrintDispatchNote", task "P" "PackEquipment", task "P" "BookCourier"
    , closer "P" "ReadyToShip", finish "P" "EquipmentDispatched" ]
    [ plainEdge "OrderPlaced" "ReserveEquipment", plainEdge "ReserveEquipment" "PrintDispatchNote"
    , plainEdge "PrintDispatchNote" "PackEquipment"
    , if conditioned then guarded "PrintDispatchNote" "BookCourier" "isPresent(reservation)"
      else plainEdge "PrintDispatchNote" "BookCourier"
    , plainEdge "PackEquipment" "ReadyToShip", plainEdge "BookCourier" "ReadyToShip"
    , plainEdge "ReadyToShip" "EquipmentDispatched" ]

/-- The event booking of `scenarios/inclusive-gateway-regions` with its technology fork *Arrange technology* replaced by
a splitting Abstract Task on the conditioned branch of the region *Order extras*, before the region's join. -/
private def eventBooking : CheckedProcess :=
  build [("P", none)]
    [ start "P" "EventRequested"
    , service "P" "QuoteEvent" "quoteEvent" [enclosing "event" "event"] [copied "quote" "quote"]
    , fork "P" "PrepareEvent", task "P" "BookVenue"
    , split "P" "OrderExtras" ["OrderCatering", "ArrangeTechnology", "ConfirmAttendeeList"] none
    , task "P" "OrderCatering", pass .abstract "P" "ArrangeTechnology", task "P" "RentProjector"
    , task "P" "BookTechnician", join "P" "TechnologyArranged", task "P" "ConfirmAttendeeList"
    , regionJoin "P" "ExtrasOrdered" "OrderExtras", join "P" "EventReady", task "P" "SendConfirmation"
    , finish "P" "EventBooked" ]
    [ plainEdge "EventRequested" "QuoteEvent", plainEdge "QuoteEvent" "PrepareEvent"
    , plainEdge "PrepareEvent" "BookVenue", plainEdge "PrepareEvent" "OrderExtras"
    , guarded "OrderExtras" "OrderCatering" "stringEquals(catering,\"yes\")"
    , guarded "OrderExtras" "ArrangeTechnology" "stringEquals(technology,\"yes\")"
    , plainEdge "OrderExtras" "ConfirmAttendeeList"
    , plainEdge "ArrangeTechnology" "RentProjector", plainEdge "ArrangeTechnology" "BookTechnician"
    , plainEdge "RentProjector" "TechnologyArranged", plainEdge "BookTechnician" "TechnologyArranged"
    , plainEdge "OrderCatering" "ExtrasOrdered", plainEdge "TechnologyArranged" "ExtrasOrdered"
    , plainEdge "ConfirmAttendeeList" "ExtrasOrdered", plainEdge "BookVenue" "EventReady"
    , plainEdge "ExtrasOrdered" "EventReady", plainEdge "EventReady" "SendConfirmation"
    , plainEdge "SendConfirmation" "EventBooked" ]

/-- Loan intake: the root Abstract Task *Open loan file* forks into *Triage* and *Assess application*, whose body forks
into *Check credit* and *Value collateral*. `called` makes *Triage* a mapped Call of *Expert review*, otherwise it is a
User Task. -/
private def loanIntake (called : Bool) : CheckedProcess :=
  build ([("P", none), ("AssessApplication", some "P")] ++ (if called then [("ExpertReview", none)] else []))
    ([ start "P" "ApplicationReceived", pass .abstract "P" "RootSplit"
     , if called then node "P" (.callActivity ⟨"Triage"⟩ ⟨"ExpertReview"⟩
         (.variableMappings [enclosing "case" "application"] [copied "triage" "opinion"]))
       else task "P" "Triage"
     , sub "P" "AssessApplication", join "P" "RootJoin", finish "P" "LoanTaken"
     , start "AssessApplication" "AssessmentOpened", fork "AssessApplication" "SplitAssessment"
     , task "AssessApplication" "CheckCredit", task "AssessApplication" "ValueCollateral"
     , join "AssessApplication" "JoinAssessment", finish "AssessApplication" "AssessmentClosed" ]
      ++ (if called then [start "ExpertReview" "ReviewRequested", task "ExpertReview" "GiveOpinion",
        finish "ExpertReview" "ReviewCompleted"] else []))
    ([ plainEdge "ApplicationReceived" "RootSplit", plainEdge "RootSplit" "Triage"
     , plainEdge "RootSplit" "AssessApplication", plainEdge "Triage" "RootJoin"
     , plainEdge "AssessApplication" "RootJoin", plainEdge "RootJoin" "LoanTaken"
     , plainEdge "AssessmentOpened" "SplitAssessment", plainEdge "SplitAssessment" "CheckCredit"
     , plainEdge "SplitAssessment" "ValueCollateral", plainEdge "CheckCredit" "JoinAssessment"
     , plainEdge "ValueCollateral" "JoinAssessment", plainEdge "JoinAssessment" "AssessmentClosed" ]
      ++ (if called then [plainEdge "ReviewRequested" "GiveOpinion", plainEdge "GiveOpinion" "ReviewCompleted"]
        else []))

/-- After *Prepare*, the splitting Abstract Task *Fork* runs region `A` beside `B` and joins them before *Finish*;
`siblingRegion` makes `B` an Inclusive region as well, otherwise a Parallel block. -/
private def forkedRegions (siblingRegion : Bool) : CheckedProcess :=
  build [("P", none)]
    ([ start "P" "Opened", task "P" "Prepare", pass .abstract "P" "Fork", join "P" "Joined", task "P" "Finish"
     , finish "P" "Closed", split "P" "ASplit" ["ARush"] (some "ANormal"), task "P" "ARush", task "P" "ANormal"
     , regionJoin "P" "AJoin" "ASplit", task "P" "BRush", task "P" "BNormal" ] ++
      (if siblingRegion then [split "P" "BSplit" ["BRush"] (some "BNormal"), regionJoin "P" "BJoin" "BSplit"]
      else [fork "P" "BSplit", join "P" "BJoin"]))
    [ plainEdge "Opened" "Prepare", plainEdge "Prepare" "Fork", plainEdge "Fork" "ASplit", plainEdge "Fork" "BSplit"
    , guarded "ASplit" "ARush" "isPresent(rush)", plainEdge "ASplit" "ANormal", plainEdge "ARush" "AJoin"
    , plainEdge "ANormal" "AJoin"
    , if siblingRegion then guarded "BSplit" "BRush" "isPresent(rush)" else plainEdge "BSplit" "BRush"
    , plainEdge "BSplit" "BNormal", plainEdge "BRush" "BJoin", plainEdge "BNormal" "BJoin"
    , plainEdge "AJoin" "Joined", plainEdge "BJoin" "Joined", plainEdge "Joined" "Finish", plainEdge "Finish" "Closed" ]

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- Admitted, with the checked route and the Program route each admitting on its own. -/
private def admittedAtEachLevel (source : CheckedProcess) : Bool :=
  admitted source && StructuredScopeData.checkedRouted source &&
    StructuredScopeData.programRouted (lowerCheckedProcess source)

/-- The checked route and the Program route each refuse, so a relaxation at one level cannot hide behind the other. -/
private def refusedAtEachLevel (source : CheckedProcess) : Bool :=
  !admitted source && !StructuredScopeData.checkedRouted source &&
    !StructuredScopeData.programRouted (lowerCheckedProcess source)

/-- The concurrent analysis's largest closure at both levels, when they agree. -/
private def burst? (source : CheckedProcess) : Option Nat :=
  let checked := NestedScopeControl.checkedAnalysis source
  if checked == NestedScopeControl.programAnalysis (lowerCheckedProcess source) then checked else none

/-- PTSM-ADMIT-01: both retained models and their notation twins are admitted at each level, the claim archiving on the
re-entry route with agreeing bursts and the equipment dispatch on the concurrent route with agreeing bursts. -/
private def retained_models_and_twins_are_admitted : Bool :=
  allNotations.all fun kind =>
    let claim := claimWith kind
    let dispatch := dispatchWith kind
    admittedAtEachLevel claim && ScopeReentry.checkedReentry claim &&
      ScopeReentry.programReentry (lowerCheckedProcess claim) &&
      (ScopeReentry.checkedBurst? claim).isSome &&
      ScopeReentry.checkedBurst? claim == ScopeReentry.programBurst? (lowerCheckedProcess claim) &&
      admittedAtEachLevel dispatch && StructuredScopeData.concurrentProgram (lowerCheckedProcess dispatch) &&
      (burst? dispatch).isSome

/-- PTSM-MERGE-01 and PTSM-SPLIT-01: *Archive claim file* lowers to a two-input merge over its canonical inputs and
*Print dispatch note* to a two-output fork, each with the node as origin, for every notation. -/
private def nodes_lower_to_merge_and_fork : Bool :=
  allNotations.all fun kind =>
    let claim := claimWith kind
    let dispatch := dispatchWith kind
    (lowerCheckedProcess claim).operations.any (fun
      | .mergeExclusive operation origin inputs _ => operation == nodeOperationId ⟨"ArchiveClaimFile"⟩ &&
          origin.elementId.value == "ArchiveClaimFile" && inputs == lowerExclusiveMergeInputs claim ⟨"ArchiveClaimFile"⟩ &&
          inputs.length == 2
      | _ => false) &&
    (lowerCheckedProcess dispatch).operations.any fun
      | .duplicate operation origin _ outputs => operation == nodeOperationId ⟨"PrintDispatchNote"⟩ &&
          origin.elementId.value == "PrintDispatchNote" && outputs.length == 2
      | _ => false

/-- PTSM-ADMIT-01's projection witness: a splitting Task on an Inclusive region branch is admitted with agreeing
concurrent analyses, the region walk reading it as the fork its lowered `duplicate` is. -/
private def splitting_task_on_a_region_branch_is_admitted : Bool :=
  admittedAtEachLevel eventBooking && (burst? eventBooking).isSome

/-- PTSM-ADMIT-01: a node that both merges and splits is refused by the checked arity. -/
private def merge_and_split_at_once_is_refused : Bool :=
  admitted claimWith && !checkedWellFormed (claimWith (alsoSplit := true))

/-- PTSM-ADMIT-01: a conditioned outgoing flow of a splitting node is an inclusive split, refused by the candidate rule. -/
private def conditioned_split_flow_is_refused : Bool :=
  admitted dispatchWith && !checkedWellFormed (dispatchWith (conditioned := true))

/-- PTSM-ADMIT-01: the dispatch branches reconverging at a Manual Task are a merge under a fork, refused at each level. -/
private def merge_under_a_fork_is_refused : Bool :=
  refusedAtEachLevel (dispatchWith (closer := pass .manual))

/-- PTSM-ADMIT-01 with RPF-ADMIT-01: a root Call beside a root splitting Task is refused, a User Task there admitted. -/
private def root_call_beside_a_splitting_task_is_refused : Bool :=
  admittedAtEachLevel (loanIntake false) && !admitted (loanIntake true) &&
    !StructuredScopeData.checkedRouted (loanIntake true) &&
    !StructuredScopeData.programRouted (lowerCheckedProcess (loanIntake true))

/-- PTSM-ADMIT-01 with IGR-ADMIT-01: regions on both branches of a splitting Task are refused at each level, as beside a
Parallel fork, while one region beside a Parallel block is admitted. -/
private def sibling_regions_under_a_splitting_task_are_refused : Bool :=
  admittedAtEachLevel (forkedRegions false) && !admitted (forkedRegions true) &&
    (NestedScopeControl.checkedAnalysis (forkedRegions true)).isNone &&
    (NestedScopeControl.programAnalysis (lowerCheckedProcess (forkedRegions true))).isNone

/-- PTSM-PROFILE-01: under the embedded completion profile both models and their twins are refused at each level. -/
private def other_profiles_refuse_both_forms : Bool :=
  let embedded : CheckedProcess → CheckedProcess := fun source =>
    { source with identity := { source.identity with semanticProfile := ⟨embeddedCompletionProfile⟩ } }
  allNotations.all fun kind =>
    [claimWith kind, dispatchWith kind].all fun source =>
      !admitted (embedded source) && (NestedScopeControl.checkedAnalysis (embedded source)).isNone &&
        (NestedScopeControl.programAnalysis (lowerCheckedProcess (embedded source))).isNone

/-- PTSM-PROFILE-01's checked-level profile control (wrong algorithm 2), which the check above cannot reach because every
other profile refuses the pass-through node kind before its arity: the arm admits a merging or a splitting node exactly
when both its `mixed` and `variableMerge` flags hold, of the profiles either flag names only the nested scope-data
profile sets both, and the single-flow twin is admitted under every flag. -/
private def split_merge_arity_holds_for_the_nested_profile_alone : Bool :=
  let named : List ProfileId := [mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId, nestedScopeDataProfileId,
    ⟨embeddedCompletionProfile⟩]
  let claim := claimWith .manual
  let twin := { claim with sequenceFlows := claim.sequenceFlows.filter (·.sourceId.value != "WriteRejectionLetter") }
  let arity (source : CheckedProcess) (id : String) (mixed variableMerge : Bool) : Bool :=
    (source.nodes.find? (·.id.value == id)).any
      (checkedNodeArityValid false false mixed false variableMerge [] source.sequenceFlows)
  named.all (fun profile => (checkedVariableChoiceProfile profile && checkedVariableMergeProfile profile) ==
    (profile == nestedScopeDataProfileId)) &&
  [false, true].all fun mixed => [false, true].all fun variableMerge =>
    arity claim "ArchiveClaimFile" mixed variableMerge == (mixed && variableMerge) &&
      arity (dispatchWith .manual) "PrintDispatchNote" mixed variableMerge == (mixed && variableMerge) &&
      arity twin "ArchiveClaimFile" mixed variableMerge

/-- Every executable check of this module, named for the driver's failure report. -/
def passThroughImplicitSplitMergeConformanceChecks : List (String × Bool) := [
  ("retained_models_and_twins_are_admitted", retained_models_and_twins_are_admitted),
  ("nodes_lower_to_merge_and_fork", nodes_lower_to_merge_and_fork),
  ("splitting_task_on_a_region_branch_is_admitted", splitting_task_on_a_region_branch_is_admitted),
  ("merge_and_split_at_once_is_refused", merge_and_split_at_once_is_refused),
  ("conditioned_split_flow_is_refused", conditioned_split_flow_is_refused),
  ("merge_under_a_fork_is_refused", merge_under_a_fork_is_refused),
  ("root_call_beside_a_splitting_task_is_refused", root_call_beside_a_splitting_task_is_refused),
  ("sibling_regions_under_a_splitting_task_are_refused", sibling_regions_under_a_splitting_task_are_refused),
  ("other_profiles_refuse_both_forms", other_profiles_refuse_both_forms),
  ("split_merge_arity_holds_for_the_nested_profile_alone", split_merge_arity_holds_for_the_nested_profile_alone)
]

end BpmnSemantics.PassThroughImplicitSplitMergeConformance
