module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission

/-! # Root Parallel forks conformance

Finite admission witnesses of RPF-ADMIT-01, and of the [terminal forks specification](../docs/capsules/TERMINAL-FORKS-PROPOSAL.md#separating-witnesses)'s TFK-ADMIT-01, TFK-DATA-01 and TFK-PROFILE-01, under the nested scope-data profile. The employee onboarding graph
transcribes the retained `scenarios/root-parallel-forks` model, and the loan intake and loan review graphs the source
test's root Call pair and its Call in a root-branch Sub-Process; their routes and Start names are the TypeScript
analysis's values for the same graphs, and each refused graph differs from an admitted one in the fact its name states. The module runs no command: the journeys and the refused
completion are Lean executions of the registered scenarios in the pipeline. It imports admission owners only, as
`ConcurrentStructuredScopeDataConformance` does, so it stays outside `CommandAdmission`'s hidden-edit cone
(`lean-fanout`). See the [root Parallel forks specification](../docs/capsules/ROOT-PARALLEL-FORKS-SPEC.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.RootParallelForksConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
private def node (owner : String) (value : CheckedNode) : String × String × CheckedNode := (owner, value.id.value, value)
private def start (owner id : String) := node owner (.noneStartEvent ⟨id⟩)
private def finish (owner id : String) := node owner (.noneEndEvent ⟨id⟩)
private def fork (owner id : String) := node owner (.parallelGateway ⟨id⟩ .diverging)
private def join (owner id : String) := node owner (.parallelGateway ⟨id⟩ .converging)
private def merge (owner id : String) := node owner (.exclusiveMerge ⟨id⟩)
private def task (owner id : String) := node owner (.userTask ⟨id⟩ (some id))
private def sub (owner id : String) := node owner (.embeddedSubProcess ⟨id⟩ (scope id))
private def manual (owner id : String) := node owner (.nonOperationalTask ⟨id⟩ .manualTask)

private def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (owner id operation : String) (inputs outputs : List VariableMapping) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs outputs none)

private def mappedCall (owner id callee : String) (inputs outputs : List VariableMapping) :=
  node owner (.callActivity ⟨id⟩ ⟨callee⟩ (.variableMappings inputs outputs))

private def overlay : SourceOverlayIdentity :=
  { id := ⟨"root-parallel-forks-handlers"⟩, sha256 := "000000000000000000000000000000000000000000000000000000000000000a" }

/-- A checked graph of the nested scope-data profile over scopes, members and edges sorted into the canonical id
order, with its scope locals and a source overlay. -/
private def build (records : List ScopeLocalData) (scopes : List (String × Option String))
    (members : List (String × String × CheckedNode)) (edges : List (String × String)) : CheckedProcess :=
  let flowId := fun (edge : String × String) => edge.1 ++ ">" ++ edge.2
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (flowId left ≤ flowId right)
  let owner := fun (id : String) => ((members.find? (·.2.1 == id)).map (·.1)).getD ""
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"root-parallel-forks"⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000b"
        sourceOverlay := some overlay }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, id, _) => { nodeId := ⟨id⟩, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := ⟨flowId edge⟩, scopeId := scope (owner edge.1) }
    nodes := members.map (·.2.2)
    sequenceFlows := edges.map fun edge => { id := ⟨flowId edge⟩, sourceId := ⟨edge.1⟩, targetId := ⟨edge.2⟩ }
    scopeLocalData := records }

/-- The called *Expert review* Process: Start, *Give opinion*, End. -/
private def review : List (String × String × CheckedNode) × List (String × String) :=
  ([start "ExpertReview" "ReviewRequested", task "ExpertReview" "GiveOpinion", finish "ExpertReview" "ReviewCompleted"],
   [("ReviewRequested", "GiveOpinion"), ("GiveOpinion", "ReviewCompleted")])

/-- Employee onboarding: root `P` forks *Start onboarding* into *Prepare workstation* then *Order laptop*, and the
Sub-Process *Collect documents*, which copies `employee` into its local `record`; *Onboarding ready* joins them before
*Hold welcome meeting*. `forked` keeps the fork, otherwise the branches run in sequence; `closer` closes the fork,
and `terminal` instead ends the *Order laptop* branch at a second root End; `called` adds the *Expert review* Process;
`extra` adds members and edges, and `entry` and `workstationEntry` retarget the flows leaving *Hire recorded* and
entering *Prepare workstation*. -/
private def onboardingWith (forked : Bool := true)
    (closer : String → String → String × String × CheckedNode := join)
    (extra : List (String × String × CheckedNode) := []) (extraEdges : List (String × String) := [])
    (entry : String := "StartOnboarding") (workstationEntry : String := "StartOnboarding")
    (terminal : Bool := false) (called : Bool := false) : CheckedProcess :=
  let branches := [("HireRecorded", entry), (workstationEntry, "PrepareWorkstation"), ("StartOnboarding", "CollectDocuments")]
  let control := if forked && terminal
    then ([fork "P" "StartOnboarding", finish "P" "LaptopOrdered"],
      branches ++ [("OrderLaptop", "LaptopOrdered"), ("CollectDocuments", "HoldWelcomeMeeting")])
    else if forked
    then ([fork "P" "StartOnboarding", closer "P" "OnboardingReady"],
      branches ++ [("OrderLaptop", "OnboardingReady"), ("CollectDocuments", "OnboardingReady"),
        ("OnboardingReady", "HoldWelcomeMeeting")])
    else ([], [("HireRecorded", "PrepareWorkstation"), ("OrderLaptop", "CollectDocuments"),
      ("CollectDocuments", "HoldWelcomeMeeting")])
  build
    [declare "CollectDocuments" [enclosing "record" "employee", literal "stage" "documents-filed"]
      [copied "employee" "record", copied "onboardingStage" "stage"]]
    ([("P", none), ("CollectDocuments", some "P")] ++ (if called then [("ExpertReview", none)] else []))
    ([ start "P" "HireRecorded", task "P" "PrepareWorkstation"
     , service "P" "OrderLaptop" "orderLaptop" [enclosing "employee" "employee"]
         [copied "assetTag" "tag", copied "onboardingStage" "stage"]
     , sub "P" "CollectDocuments", task "P" "HoldWelcomeMeeting", finish "P" "EmployeeOnboarded"
     , start "CollectDocuments" "DocumentsRequested", task "CollectDocuments" "ConfirmDocuments"
     , finish "CollectDocuments" "DocumentsFiled" ] ++ control.1 ++ (if called then review.1 else []) ++ extra)
    ([ ("PrepareWorkstation", "OrderLaptop"), ("HoldWelcomeMeeting", "EmployeeOnboarded")
     , ("DocumentsRequested", "ConfirmDocuments"), ("ConfirmDocuments", "DocumentsFiled") ]
      ++ control.2 ++ (if called then review.2 else []) ++ extraEdges)
where
  declare (owner : String) (inputs outputs : List VariableMapping) : ScopeLocalData :=
    { scopeId := scope owner, localInputs := inputs, localOutputs := outputs }

/-- Loan intake: root `P` runs the mapped Call *Triage*, then *Assess application*, whose body forks into *Check
credit* and *Value collateral*; `rootFork` forks the root into *Triage* and *Assess application* instead. -/
private def loanIntake (rootFork : Bool) : CheckedProcess :=
  let root := if rootFork
    then ([fork "P" "RootSplit", join "P" "RootJoin"],
      [("ApplicationReceived", "RootSplit"), ("RootSplit", "Triage"), ("RootSplit", "AssessApplication"),
       ("Triage", "RootJoin"), ("AssessApplication", "RootJoin"), ("RootJoin", "LoanTaken")])
    else ([], [("ApplicationReceived", "Triage"), ("Triage", "AssessApplication"), ("AssessApplication", "LoanTaken")])
  build [] [("P", none), ("AssessApplication", some "P"), ("ExpertReview", none)]
    ([ start "P" "ApplicationReceived"
     , mappedCall "P" "Triage" "ExpertReview" [enclosing "case" "application"] [copied "triage" "opinion"]
     , sub "P" "AssessApplication", finish "P" "LoanTaken"
     , start "AssessApplication" "AssessmentOpened", fork "AssessApplication" "SplitAssessment"
     , task "AssessApplication" "CheckCredit", task "AssessApplication" "ValueCollateral"
     , join "AssessApplication" "JoinAssessment", finish "AssessApplication" "AssessmentClosed" ]
      ++ review.1 ++ root.1)
    ([ ("AssessmentOpened", "SplitAssessment"), ("SplitAssessment", "CheckCredit"), ("SplitAssessment", "ValueCollateral")
     , ("CheckCredit", "JoinAssessment"), ("ValueCollateral", "JoinAssessment"), ("JoinAssessment", "AssessmentClosed") ]
      ++ review.2 ++ root.2)

/-- Loan review: root `P` forks into the Sub-Process *Review application*, whose body runs *Prepare file* and then the
mapped Call *Request opinion*, beside the User Task *Check identity*; *Decide loan* follows the join. -/
private def loanReview : CheckedProcess :=
  build [] [("P", none), ("ReviewApplication", some "P"), ("ExpertReview", none)]
    ([ start "P" "ApplicationReceived", fork "P" "RootSplit", sub "P" "ReviewApplication", task "P" "CheckIdentity"
     , join "P" "RootJoin", task "P" "DecideLoan", finish "P" "LoanDecided"
     , start "ReviewApplication" "ReviewOpened", task "ReviewApplication" "PrepareFile"
     , mappedCall "ReviewApplication" "RequestOpinion" "ExpertReview" [enclosing "case" "application"]
         [copied "opinion" "opinion"]
     , finish "ReviewApplication" "ReviewClosed" ] ++ review.1)
    ([ ("ApplicationReceived", "RootSplit"), ("RootSplit", "ReviewApplication"), ("RootSplit", "CheckIdentity")
     , ("ReviewApplication", "RootJoin"), ("CheckIdentity", "RootJoin"), ("RootJoin", "DecideLoan")
     , ("DecideLoan", "LoanDecided"), ("ReviewOpened", "PrepareFile"), ("PrepareFile", "RequestOpinion")
     , ("RequestOpinion", "ReviewClosed") ] ++ review.2)

private def onboarding : CheckedProcess := onboardingWith

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- RPF-ADMIT-01: the onboarding graph's root fork is admitted, routed concurrent, and requires only `employee`. -/
private def root_fork_is_admitted_and_routed_concurrent : Bool :=
  admitted onboarding && StructuredScopeData.concurrentProgram (lowerCheckedProcess onboarding) &&
    StructuredScopeData.checkedRouted onboarding &&
    decide (NestedScopeControl.checkedStartNames onboarding = some ["employee"] ∧
      NestedScopeControl.programStartNames (lowerCheckedProcess onboarding) = some ["employee"])

/-- The same branches run in sequence stay on the serial route. -/
private def sequenced_branches_stay_serial : Bool :=
  let serial := onboardingWith (forked := false)
  admitted serial && !StructuredScopeData.concurrentProgram (lowerCheckedProcess serial)

/-- TFK-ADMIT-01: a terminal root fork, whose *Order laptop* branch ends at a second root End, is admitted, which
RPF-ADMIT-01 first refused; both branches still wait before their Ends. -/
private def terminal_root_fork_is_admitted : Bool :=
  admitted onboarding && admitted (onboardingWith (terminal := true))

/-- A mapped Call on the root path before the root fork is refused. CSE-ADMIT-01 also refuses it, a Service Task
beside a Call, so the root Call pair below separates the root-Call clause. -/
private def call_in_a_forking_root_is_refused : Bool :=
  admitted onboarding && !admitted (onboardingWith (called := true)
    (extra := [mappedCall "P" "CheckReferences" "ExpertReview" [enclosing "case" "employee"] [copied "references" "opinion"]])
    (extraEdges := [("CheckReferences", "StartOnboarding")])
    (entry := "CheckReferences"))

/-- PTPB-ADMIT-01: a pass-through Manual Task on a root branch is admitted, which RPF-ADMIT-01 first refused. -/
private def pass_through_on_a_root_branch_is_admitted : Bool :=
  admitted onboarding && admitted (onboardingWith (extra := [manual "P" "HandOverBadge"])
    (extraEdges := [("StartOnboarding", "HandOverBadge")])
    (workstationEntry := "HandOverBadge"))

/-- Root branches closed by an Exclusive merge are refused. -/
private def root_merge_is_refused : Bool := admitted onboarding && !admitted (onboardingWith (closer := merge))

/-- The root Call pair: a mapped root Call before a body fork is admitted as a concurrent Program; beside a root fork it
is refused, while the shared nested scope-control analysis admits that graph, so only the root-Call restriction
refuses it. Each level is checked on its own, because `admitted` would let either level's refusal hide a mutant of the
other. -/
private def root_call_pair_separates_the_restriction : Bool :=
  let (serial, forked) := (loanIntake false, loanIntake true)
  admitted serial && StructuredScopeData.concurrentProgram (lowerCheckedProcess serial) &&
    StructuredScopeData.checkedRouted serial && !StructuredScopeData.checkedRouted forked &&
    StructuredScopeData.programRouted (lowerCheckedProcess serial) &&
    !StructuredScopeData.programRouted (lowerCheckedProcess forked) &&
    (NestedScopeControl.checkedAnalysis forked).isSome &&
    (NestedScopeControl.programAnalysis (lowerCheckedProcess forked)).isSome

/-- A mapped Call in a Sub-Process body on a root branch stays admitted at each level, so a root-Call clause widened
to every Call of a forking model fails here. -/
private def call_in_a_root_branch_sub_process_is_admitted : Bool :=
  admitted loanReview && StructuredScopeData.concurrentProgram (lowerCheckedProcess loanReview) &&
    StructuredScopeData.checkedRouted loanReview && StructuredScopeData.programRouted (lowerCheckedProcess loanReview)

private def plain (owner id : String) := node owner (.nonOperationalTask ⟨id⟩ .abstractTask)

/-- Both analyses admit, each on its own, so a relaxation at one level cannot hide behind the other. -/
private def admittedAtEachLevel (source : CheckedProcess) : Bool :=
  admitted source && (NestedScopeControl.checkedAnalysis source).isSome &&
    (NestedScopeControl.programAnalysis (lowerCheckedProcess source)).isSome

private def refusedAtEachLevel (source : CheckedProcess) : Bool :=
  (NestedScopeControl.checkedAnalysis source).isNone &&
    (NestedScopeControl.programAnalysis (lowerCheckedProcess source)).isNone

/-- Employee offboarding, transcribing `scenarios/terminal-forks`: root `P` runs *Look up employee*, then forks *Start
offboarding* into *Collect equipment*, *Revoke system access*, the plain Task *Notify payroll* and a direct End, each to
its own End. `revoke` replaces the *Revoke system access* branch's members and edges. -/
private def offboardingWith (revoke : List (String × String × CheckedNode) × List (String × String) :=
    ([task "P" "RevokeSystemAccess"], [("StartOffboarding", "RevokeSystemAccess"), ("RevokeSystemAccess", "AccessRevoked")])) :
    CheckedProcess :=
  build [] [("P", none)]
    ([ start "P" "DepartureAnnounced"
     , service "P" "LookUpEmployee" "lookUpEmployee" [enclosing "employee" "employee"] [copied "employeeNumber" "number"]
     , fork "P" "StartOffboarding", task "P" "CollectEquipment", finish "P" "EquipmentCollected"
     , finish "P" "AccessRevoked", plain "P" "NotifyPayroll", finish "P" "PayrollNotified", finish "P" "DepartureRecorded" ]
      ++ revoke.1)
    ([ ("DepartureAnnounced", "LookUpEmployee"), ("LookUpEmployee", "StartOffboarding")
     , ("StartOffboarding", "CollectEquipment"), ("CollectEquipment", "EquipmentCollected")
     , ("StartOffboarding", "NotifyPayroll"), ("NotifyPayroll", "PayrollNotified")
     , ("StartOffboarding", "DepartureRecorded") ] ++ revoke.2)

/-- Office move, transcribing `scenarios/terminal-forks`: *Book movers*, then the Sub-Process *Clear old office*, whose
body forks into *Pack desk*, the Manual Task *Return keys* and the plain Task *Cancel parking permit*, each to its own End,
then *Confirm new office*. `waiting` makes the two wait-free branches User Tasks; `declaring` gives the Sub-Process a
scope-local `keysReturned`. -/
private def officeMoveWith (waiting declaring : Bool := false) : CheckedProcess :=
  let records := if declaring
    then [{ scopeId := scope "ClearOldOffice", localInputs := [literal "keysReturned" "no"], localOutputs := [] }]
    else []
  build records [("P", none), ("ClearOldOffice", some "P")]
    [ start "P" "MoveRequested", service "P" "BookMovers" "bookMovers" [enclosing "office" "office"] [copied "bookingCode" "code"]
    , sub "P" "ClearOldOffice", task "P" "ConfirmNewOffice", finish "P" "MoveCompleted"
    , start "ClearOldOffice" "ClearingStarted", fork "ClearOldOffice" "SplitClearing", task "ClearOldOffice" "PackDesk"
    , finish "ClearOldOffice" "DeskPacked"
    , if waiting then task "ClearOldOffice" "ReturnKeys" else manual "ClearOldOffice" "ReturnKeys"
    , finish "ClearOldOffice" "KeysReturned"
    , if waiting then task "ClearOldOffice" "CancelParkingPermit" else plain "ClearOldOffice" "CancelParkingPermit"
    , finish "ClearOldOffice" "ParkingCancelled" ]
    [ ("MoveRequested", "BookMovers"), ("BookMovers", "ClearOldOffice"), ("ClearOldOffice", "ConfirmNewOffice")
    , ("ConfirmNewOffice", "MoveCompleted"), ("ClearingStarted", "SplitClearing"), ("SplitClearing", "PackDesk")
    , ("PackDesk", "DeskPacked"), ("SplitClearing", "ReturnKeys"), ("ReturnKeys", "KeysReturned")
    , ("SplitClearing", "CancelParkingPermit"), ("CancelParkingPermit", "ParkingCancelled") ]

/-- TFK-ADMIT-01: four root Ends, two reached wait-free. -/
private def offboarding_is_admitted_at_each_level : Bool := admittedAtEachLevel (offboardingWith)

/-- TFK-ADMIT-01: two wait-free terminal branches in a Sub-Process body. -/
private def office_move_is_admitted_at_each_level : Bool := admittedAtEachLevel (officeMoveWith)

/-- TFK-DATA-01: the declaration alone refuses the wait-free branches, and only beside them. -/
private def declaring_office_move_is_refused_beside_its_waiting_twin : Bool :=
  refusedAtEachLevel (officeMoveWith (declaring := true)) &&
    admittedAtEachLevel (officeMoveWith (waiting := true) (declaring := true))

/-- PTPB-WORK-01 keeps refusing an empty branch to its paired join, which TFK-ADMIT-01 does not relax; the same block
with a pass-through Task on that branch is admitted. -/
private def empty_joined_branch_is_refused_beside_its_pass_through_twin : Bool :=
  let block := fun (second : List (String × String × CheckedNode)) (edges : List (String × String)) =>
    offboardingWith ([fork "P" "InnerSplit", task "P" "RevokeSystemAccess", join "P" "InnerJoin"] ++ second,
      [("StartOffboarding", "InnerSplit"), ("InnerSplit", "RevokeSystemAccess"), ("RevokeSystemAccess", "InnerJoin"),
       ("InnerJoin", "AccessRevoked")] ++ edges)
  refusedAtEachLevel (block [] [("InnerSplit", "InnerJoin")]) &&
    admittedAtEachLevel (block [plain "P" "LogRevocation"] [("InnerSplit", "LogRevocation"), ("LogRevocation", "InnerJoin")])

/-- The graph relabelled to the embedded completion profile, which an effect-free model enters without an overlay. -/
private def asEmbeddedCompletion (source : CheckedProcess) : CheckedProcess :=
  { source with identity := { source.identity with semanticProfile := embeddedCompletionProfileId, sourceOverlay := none } }

/-- TFK-PROFILE-01's minimal pairs, data-free and effect-free: (a) a root terminal fork with four None Ends and (b) a
body branch straight to its End beside two User Tasks, each outside the embedded completion profile's exact multiset of
three User Tasks and three Ends. Each is admitted under this profile and refused at each level under the other. -/
private def terminal_fork_controls_are_refused_under_embedded_completion : Bool :=
  let rootFork := build [] [("P", none), ("Work", some "P")]
    [ start "P" "Opened", fork "P" "Split", sub "P" "Work", finish "P" "WorkDone", task "P" "Left", finish "P" "LeftDone"
    , task "P" "Right", finish "P" "RightDone", start "Work" "WorkOpened", task "Work" "Inner", finish "Work" "WorkClosed" ]
    [ ("Opened", "Split"), ("Split", "Work"), ("Work", "WorkDone"), ("Split", "Left"), ("Left", "LeftDone")
    , ("Split", "Right"), ("Right", "RightDone"), ("WorkOpened", "Inner"), ("Inner", "WorkClosed") ]
  let bodyEnd := build [] [("P", none), ("Work", some "P")]
    [ start "P" "Opened", task "P" "Prepare", sub "P" "Work", finish "P" "Closed", start "Work" "WorkOpened"
    , fork "Work" "Split", task "Work" "Inner", finish "Work" "InnerDone", finish "Work" "Skipped" ]
    [ ("Opened", "Prepare"), ("Prepare", "Work"), ("Work", "Closed"), ("WorkOpened", "Split"), ("Split", "Inner")
    , ("Inner", "InnerDone"), ("Split", "Skipped") ]
  [rootFork, bodyEnd].all fun control =>
    admittedAtEachLevel control && refusedAtEachLevel (asEmbeddedCompletion control)

/-- Every executable check of this module, named for the driver's failure report. -/
def rootParallelForksConformanceChecks : List (String × Bool) := [
  ("root_fork_is_admitted_and_routed_concurrent", root_fork_is_admitted_and_routed_concurrent),
  ("sequenced_branches_stay_serial", sequenced_branches_stay_serial),
  ("terminal_root_fork_is_admitted", terminal_root_fork_is_admitted),
  ("call_in_a_forking_root_is_refused", call_in_a_forking_root_is_refused),
  ("pass_through_on_a_root_branch_is_admitted", pass_through_on_a_root_branch_is_admitted),
  ("root_merge_is_refused", root_merge_is_refused),
  ("root_call_pair_separates_the_restriction", root_call_pair_separates_the_restriction),
  ("call_in_a_root_branch_sub_process_is_admitted", call_in_a_root_branch_sub_process_is_admitted),
  ("offboarding_is_admitted_at_each_level", offboarding_is_admitted_at_each_level),
  ("office_move_is_admitted_at_each_level", office_move_is_admitted_at_each_level),
  ("declaring_office_move_is_refused_beside_its_waiting_twin", declaring_office_move_is_refused_beside_its_waiting_twin),
  ("empty_joined_branch_is_refused_beside_its_pass_through_twin", empty_joined_branch_is_refused_beside_its_pass_through_twin),
  ("terminal_fork_controls_are_refused_under_embedded_completion", terminal_fork_controls_are_refused_under_embedded_completion)
]

end BpmnSemantics.RootParallelForksConformance
