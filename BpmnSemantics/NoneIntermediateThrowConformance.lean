module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission
import BpmnSemantics.SemanticProcessJson.CheckedProcess

/-! # None Intermediate Throw Event conformance

Finite admission witnesses of NIT-KIND-01, NIT-PASS-01, NIT-ADMIT-01 and NIT-PROFILE-01. The warranty repair and
onboarding milestones graphs transcribe the retained `scenarios/none-intermediate-throw` models, the loan assessment
graph the retained `scenarios/concurrent-structured-scope-data` model and the employee onboarding graph the retained
`scenarios/nested-embedded-scope-control` model; routes and bursts are the TypeScript analysis's values for the same
graphs, and each refused graph differs from an admitted one in the fact its name states. The module runs no command:
the Events' instantaneous occurrences are Lean executions of the registered scenarios in the pipeline. It imports
admission owners only, as `PassThroughTaskConformance` does, so it stays outside `CommandAdmission`'s hidden-edit cone
(`lean-fanout`). See the [None Throw specification](../docs/capsules/NONE-INTERMEDIATE-THROW-SPEC.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.NoneIntermediateThrowConformance

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
private def fork (owner id : String) := node owner (.parallelGateway ⟨id⟩ .diverging)
private def join (owner id : String) := node owner (.parallelGateway ⟨id⟩ .converging)
private def task (owner id : String) := node owner (.userTask ⟨id⟩ (some id))
private def sub (owner id : String) := node owner (.embeddedSubProcess ⟨id⟩ (scope id))
private def throw (owner id : String) := node owner (.noneIntermediateThrowEvent ⟨id⟩)

private def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (owner id operation : String) (inputs outputs : List VariableMapping) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs outputs none)

private def mappedCall (owner id callee : String) (inputs outputs : List VariableMapping) :=
  node owner (.callActivity ⟨id⟩ ⟨callee⟩ (.variableMappings inputs outputs))

private def declare (owner : String) (inputs outputs : List VariableMapping) : ScopeLocalData :=
  { scopeId := scope owner, localInputs := inputs, localOutputs := outputs }

/-- A Choice whose conditional candidates go to `conditioned`, in declaration order, and whose default goes to
`fallback`. -/
private def choice (owner id : String) (conditioned : List String) (fallback : String) :=
  node owner (.exclusiveGateway ⟨id⟩ (conditioned.map (flowId id ·)) (flowId id fallback))

/-- A Simple Boolean v1 test that the Process binding `name` equals `value`. -/
private def equals (name value : String) : CheckedCondition :=
  { language := simpleBoolean, body := "stringEquals(" ++ name ++ ",\"" ++ value ++ "\")" }

/-- A checked graph under `profile` over scopes, members and edges sorted into the canonical id order, with its scope
locals, the conditions keyed by their edges and, unless `overlaid` is false, a source overlay. -/
private def build (records : List ScopeLocalData) (scopes : List (String × Option String))
    (members : List (String × String × CheckedNode)) (edges : List (String × String))
    (conditions : List ((String × String) × CheckedCondition) := [])
    (profile : ProfileId := nestedScopeDataProfileId) (overlaid : Bool := true) : CheckedProcess :=
  let id := fun (edge : String × String) => (flowId edge.1 edge.2).value
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (id left ≤ id right)
  let owner := fun (node : String) => ((members.find? (·.2.1 == node)).map (·.1)).getD ""
  let overlay : SourceOverlayIdentity :=
    { id := ⟨"none-intermediate-throw-handlers"⟩
      sha256 := "0000000000000000000000000000000000000000000000000000000000000011" }
  { identity :=
      { semanticProfile := profile, sourceId := ⟨"none-intermediate-throw"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000012"
        sourceOverlay := if overlaid then some overlay else none }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, id, _) => { nodeId := ⟨id⟩, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := flowId edge.1 edge.2, scopeId := scope (owner edge.1) }
    nodes := members.map (·.2.2)
    sequenceFlows := edges.map fun edge =>
      { id := flowId edge.1 edge.2, sourceId := ⟨edge.1⟩, targetId := ⟨edge.2⟩,
        condition := (conditions.find? (·.1 == edge)).map (·.2) }
    scopeLocalData := records }

/-- How a warranty repair graph departs from the retained model. -/
private inductive WarrantyEdit where
  | retained
  /-- *Fault diagnosed* gains a second outgoing flow to the root End, whose fan-in the profile admits. -/
  | secondOutgoing
  /-- The Merge *Repair round* is dropped and *Rework requested* re-enters at *Fault diagnosed*, so the Event joins the
  loop as uncontrolled flow. -/
  | secondIncoming

/-- Warranty repair: root `P` diagnoses the fault, throws *Fault diagnosed*, merges into the *Repair device* Sub-Process,
whose body throws *Repair started*, replaces the part, orders a spare part and tests the device into its own `result`,
copied out to `testResult`, and chooses by it: a passed device is released, otherwise rework is requested and the Merge
re-enters the Sub-Process. -/
private def warrantyWith (edit : WarrantyEdit := .retained) : CheckedProcess :=
  let body := "RepairDevice"
  let (round, loop) : List (String × String × CheckedNode) × List (String × String) := match edit with
    | .secondIncoming => ([], [("FaultDiagnosed", body), ("ReworkRequested", "FaultDiagnosed")])
    | _ => ([merge "P" "RepairRound"],
        [("FaultDiagnosed", "RepairRound"), ("RepairRound", body), ("ReworkRequested", "RepairRound")])
  build [declare body [literal "result" "untested"] [copied "testResult" "result"]] [("P", none), (body, some "P")]
    ([ start "P" "RepairRequested", task "P" "DiagnoseFault", throw "P" "FaultDiagnosed", sub "P" body
     , choice "P" "DevicePasses" ["DeviceReleased"] "ReworkRequested", throw "P" "DeviceReleased"
     , throw "P" "ReworkRequested", finish "P" "DeviceReturned"
     , start body "RepairOpened", throw body "RepairStarted", task body "ReplacePart"
     , service body "OrderSparePart" "orderSparePart" [] [], task body "TestDevice", finish body "RepairClosed" ] ++ round)
    ([ ("RepairRequested", "DiagnoseFault"), ("DiagnoseFault", "FaultDiagnosed"), (body, "DevicePasses")
     , ("DevicePasses", "DeviceReleased"), ("DevicePasses", "ReworkRequested"), ("DeviceReleased", "DeviceReturned")
     , ("RepairOpened", "RepairStarted"), ("RepairStarted", "ReplacePart"), ("ReplacePart", "OrderSparePart")
     , ("OrderSparePart", "TestDevice"), ("TestDevice", "RepairClosed") ] ++ loop
      ++ (if let .secondOutgoing := edit then [("FaultDiagnosed", "DeviceReturned")] else []))
    [(("DevicePasses", "DeviceReleased"), equals "testResult" "passed")]

/-- Onboarding milestones: root `P` confirms the start date and forks into the *Set up account* Sub-Process, whose body
creates the account and throws *Account ready*, and *Welcome sent* before the mapped *Order laptop*; the join throws
*Onboarding complete*. `badge` forks the body after its Start into the account branch and a terminal branch of one
*Badge* vertex ending at its own End: a User Task when `badge` holds `true`, a None Throw when it holds `false`. -/
private def onboardingWith (badge : Option Bool := none) : CheckedProcess :=
  let body := "SetUpAccount"
  let (members, edges) : List (String × String × CheckedNode) × List (String × String) := match badge with
    | none => ([], [("AccountSetupOpened", "CreateAccount")])
    | some waits => ([fork body "SplitSetup", if waits then task body "Badge" else throw body "Badge",
          finish body "BadgeClosed"],
        [("AccountSetupOpened", "SplitSetup"), ("SplitSetup", "CreateAccount"), ("SplitSetup", "Badge"),
          ("Badge", "BadgeClosed")])
  build [declare body [enclosing "account" "employee"] [copied "employeeAccount" "account"]]
    [("P", none), (body, some "P")]
    ([ start "P" "EmployeeHired", task "P" "ConfirmStartDate", fork "P" "StartOnboarding", sub "P" body
     , throw "P" "WelcomeSent"
     , service "P" "OrderLaptop" "orderLaptop" [enclosing "employee" "employee"] [copied "laptopOrder" "order"]
     , join "P" "OnboardingReady", throw "P" "OnboardingComplete", finish "P" "EmployeeOnboarded"
     , start body "AccountSetupOpened", task body "CreateAccount", throw body "AccountReady"
     , finish body "AccountSetupClosed" ] ++ members)
    ([ ("EmployeeHired", "ConfirmStartDate"), ("ConfirmStartDate", "StartOnboarding"), ("StartOnboarding", body)
     , ("StartOnboarding", "WelcomeSent"), ("WelcomeSent", "OrderLaptop"), ("OrderLaptop", "OnboardingReady")
     , (body, "OnboardingReady"), ("OnboardingReady", "OnboardingComplete")
     , ("OnboardingComplete", "EmployeeOnboarded"), ("CreateAccount", "AccountReady")
     , ("AccountReady", "AccountSetupClosed") ] ++ edges)

/-- Loan assessment as retained: its body forks into *Credit check* and *Collateral valuation*, each preparing a file
and asking the *Expert review* Process through a mapped Call; `prepare` is the first vertex of *Credit check*. -/
private def loanWith (prepare : String → String → String × String × CheckedNode := task) : CheckedProcess :=
  build
    [ declare "AssessApplication"
        [literal "creditOpinion" "pending", enclosing "file" "application", literal "valuationOpinion" "pending"]
        [copied "credit" "creditOpinion", copied "valuation" "valuationOpinion"]
    , declare "CollateralValuation" [enclosing "dossier" "file"] [copied "valuationFile" "dossier"]
    , declare "CreditCheck" [enclosing "dossier" "file"] [copied "creditFile" "dossier"] ]
    [ ("P", none), ("AssessApplication", some "P"), ("CollateralValuation", some "AssessApplication")
    , ("CreditCheck", some "AssessApplication"), ("ExpertReview", none) ]
    [ start "P" "ApplicationReceived", sub "P" "AssessApplication", task "P" "DecideLoan", finish "P" "LoanDecided"
    , start "AssessApplication" "AssessmentOpened", fork "AssessApplication" "SplitAssessment"
    , sub "AssessApplication" "CreditCheck", sub "AssessApplication" "CollateralValuation"
    , join "AssessApplication" "JoinAssessment", finish "AssessApplication" "AssessmentClosed"
    , start "CreditCheck" "CreditCheckOpened", prepare "CreditCheck" "PrepareCreditFile"
    , mappedCall "CreditCheck" "CreditExpertReview" "ExpertReview" [enclosing "case" "dossier"]
        [copied "creditOpinion" "opinion"]
    , finish "CreditCheck" "CreditCheckClosed"
    , start "CollateralValuation" "ValuationOpened", task "CollateralValuation" "PrepareValuation"
    , mappedCall "CollateralValuation" "ValuationExpertReview" "ExpertReview" [enclosing "case" "dossier"]
        [copied "valuationOpinion" "opinion"]
    , finish "CollateralValuation" "ValuationClosed"
    , start "ExpertReview" "ReviewRequested", task "ExpertReview" "GiveOpinion", finish "ExpertReview" "ReviewCompleted" ]
    [ ("ApplicationReceived", "AssessApplication"), ("AssessApplication", "DecideLoan"), ("DecideLoan", "LoanDecided")
    , ("AssessmentOpened", "SplitAssessment"), ("SplitAssessment", "CreditCheck")
    , ("SplitAssessment", "CollateralValuation"), ("CreditCheck", "JoinAssessment")
    , ("CollateralValuation", "JoinAssessment"), ("JoinAssessment", "AssessmentClosed")
    , ("CreditCheckOpened", "PrepareCreditFile"), ("PrepareCreditFile", "CreditExpertReview")
    , ("CreditExpertReview", "CreditCheckClosed")
    , ("ValuationOpened", "PrepareValuation"), ("PrepareValuation", "ValuationExpertReview")
    , ("ValuationExpertReview", "ValuationClosed")
    , ("ReviewRequested", "GiveOpinion"), ("GiveOpinion", "ReviewCompleted") ]

/-- Employee onboarding, data-free, under `profile`: root `P` forks into *Order equipment* and *Confirm start date*
before the *Workplace setup* Sub-Process, whose body forks into *Assign desk* and the nested *Accounts* Sub-Process
forking into *Create mailbox* and *Grant VPN*; every body branch ends at its own End, and the root join precedes
*Welcome meeting*. `meeting` splices a None Throw onto the flow entering *Welcome meeting*. -/
private def employeeOnboarding (profile : ProfileId) (meeting : Bool) : CheckedProcess :=
  let (members, edges) := if meeting
    then ([throw "P" "MeetingScheduled"],
      [("Gateway_PrepareJoin", "MeetingScheduled"), ("MeetingScheduled", "UserTask_WelcomeMeeting")])
    else ([], [("Gateway_PrepareJoin", "UserTask_WelcomeMeeting")])
  let setup := "SubProcess_WorkplaceSetup"
  let accounts := "SubProcess_Accounts"
  build [] [("P", none), (setup, some "P"), (accounts, some setup)]
    ([ start "P" "StartEvent_Hired", fork "P" "Gateway_PrepareFork", task "P" "UserTask_OrderEquipment"
     , task "P" "UserTask_ConfirmStartDate", sub "P" setup, join "P" "Gateway_PrepareJoin"
     , task "P" "UserTask_WelcomeMeeting", finish "P" "EndEvent_Onboarded"
     , start setup "StartEvent_Setup", fork setup "Gateway_SetupFork", task setup "UserTask_AssignDesk"
     , finish setup "EndEvent_DeskAssigned", sub setup accounts, finish setup "EndEvent_AccountsReady"
     , start accounts "StartEvent_Accounts", fork accounts "Gateway_AccountsFork", task accounts "UserTask_CreateMailbox"
     , task accounts "UserTask_GrantVpn", finish accounts "EndEvent_MailboxCreated"
     , finish accounts "EndEvent_VpnGranted" ] ++ members)
    ([ ("StartEvent_Hired", "Gateway_PrepareFork"), ("Gateway_PrepareFork", "UserTask_OrderEquipment")
     , ("Gateway_PrepareFork", "UserTask_ConfirmStartDate"), ("UserTask_ConfirmStartDate", setup)
     , ("UserTask_OrderEquipment", "Gateway_PrepareJoin"), (setup, "Gateway_PrepareJoin")
     , ("UserTask_WelcomeMeeting", "EndEvent_Onboarded")
     , ("StartEvent_Setup", "Gateway_SetupFork"), ("Gateway_SetupFork", "UserTask_AssignDesk")
     , ("Gateway_SetupFork", accounts), ("UserTask_AssignDesk", "EndEvent_DeskAssigned")
     , (accounts, "EndEvent_AccountsReady")
     , ("StartEvent_Accounts", "Gateway_AccountsFork"), ("Gateway_AccountsFork", "UserTask_CreateMailbox")
     , ("Gateway_AccountsFork", "UserTask_GrantVpn"), ("UserTask_CreateMailbox", "EndEvent_MailboxCreated")
     , ("UserTask_GrantVpn", "EndEvent_VpnGranted") ] ++ edges)
    [] profile (overlaid := profile == nestedScopeDataProfileId)

/-- Start, one User Task and End under an exact-shape profile, with `thrown` splicing a None Throw before the Task. -/
private def approval (thrown : Bool) : CheckedProcess :=
  let (members, edges) := if thrown
    then ([throw "P" "Requested"], [("Started", "Requested"), ("Requested", "Approve")])
    else ([], [("Started", "Approve")])
  build [] [("P", none)] ([start "P" "Started", task "P" "Approve", finish "P" "Approved"] ++ members)
    ([("Approve", "Approved")] ++ edges) [] ⟨"bpmn-2.0.2-user-task-preserved-notation-draft"⟩ (overlaid := false)

private def warranty : CheckedProcess := warrantyWith
private def onboarding : CheckedProcess := onboardingWith

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- The concurrent analysis's largest closure at both levels, when they agree. -/
private def burst? (source : CheckedProcess) : Option Nat :=
  let checked := NestedScopeControl.checkedAnalysis source
  if checked == NestedScopeControl.programAnalysis (lowerCheckedProcess source) then checked else none

/-- The lowered operation of node `id` is a one-input merge whose origin is that node. -/
private def lowersToOneInputMerge (source : CheckedProcess) (id : String) : Bool :=
  (lowerCheckedProcess source).operations.any fun
    | .mergeExclusive operation origin [_] _ => operation == nodeOperationId ⟨id⟩ && origin.elementId.value == id
    | _ => false

/-- NIT-ADMIT-01: the warranty repair is admitted on the re-entry route with its rework closure at the limit of eight,
and the onboarding milestones on the concurrent route with a burst of seven, each at both levels. -/
private def retained_models_are_admitted_on_their_routes : Bool :=
  admitted warranty && ScopeReentry.checkedReentry warranty &&
    ScopeReentry.programReentry (lowerCheckedProcess warranty) &&
    ScopeReentry.checkedBurst? warranty == some 8 && ScopeReentry.programBurst? (lowerCheckedProcess warranty) == some 8 &&
    admitted onboarding && StructuredScopeData.checkedRouted onboarding &&
    StructuredScopeData.concurrentProgram (lowerCheckedProcess onboarding) && burst? onboarding == some 7

/-- NIT-PASS-01: each None Throw, in a body or at the root, lowers to a one-input merge whose origin is the Event. -/
private def events_lower_to_one_input_merges : Bool :=
  ["FaultDiagnosed", "RepairStarted", "DeviceReleased", "ReworkRequested"].all (lowersToOneInputMerge warranty) &&
    ["WelcomeSent", "AccountReady", "OnboardingComplete"].all (lowersToOneInputMerge onboarding)

/-- NIT-ADMIT-01: a None Throw with a second outgoing flow or a second incoming flow is refused. -/
private def second_flows_are_refused : Bool :=
  !admitted (warrantyWith .secondOutgoing) && !admitted (warrantyWith .secondIncoming)

/-- NIT-ADMIT-01: a None Throw alone on a terminal branch is refused while its User Task twin is admitted. TFK-DATA-01
keeps this refusal: *Set up account* declares scope-local data. -/
private def wait_free_terminal_branch_is_refused : Bool :=
  admitted (onboardingWith (some true)) && !admitted (onboardingWith (some false))

/-- NIT-ADMIT-01: a Call that only a None Throw separates from its body's Start is refused. -/
private def call_behind_only_a_none_throw_is_refused : Bool :=
  admitted loanWith && !admitted (loanWith throw)

/-- NIT-PROFILE-01: under the embedded completion profile a None Throw before *Welcome meeting* is refused at both
levels while its twin is admitted, and the same graph under the nested scope-data profile has a pass vertex; an
exact-shape profile's graph is refused with one None Throw and admitted without it, by its cardinalities. -/
private def other_profiles_refuse_the_event : Bool :=
  let embedded : ProfileId := ⟨embeddedCompletionProfile⟩
  (burst? (employeeOnboarding embedded false)).isSome &&
    (NestedScopeControl.checkedAnalysis (employeeOnboarding embedded true)).isNone &&
    (NestedScopeControl.programAnalysis (lowerCheckedProcess (employeeOnboarding embedded true))).isNone &&
    (burst? (employeeOnboarding nestedScopeDataProfileId true)).isSome &&
    admitted (approval false) && checkedExactShapeValid (approval false) &&
    !admitted (approval true) && !checkedExactShapeValid (approval true)

/-- The strict decoder's reading of one checked node with `fields` beside its kind. -/
private def decodedEvent (fields : List (String × Lean.Json)) : Except String CheckedNode :=
  SemanticProcessJson.decodeCheckedNode (Lean.Json.mkObj
    ([("id", Lean.Json.str "E"), ("kind", Lean.Json.str "noneIntermediateThrowEvent")] ++ fields))

/-- NIT-KIND-01: the node decodes to its own arm, and the same node carrying a Task notation is refused. -/
private def event_decodes_to_its_own_arm : Bool :=
  (match decodedEvent [] with
    | .ok (.noneIntermediateThrowEvent id) => id.value == "E"
    | _ => false) &&
  (match decodedEvent [("notation", Lean.Json.str "abstractTask")] with
    | .error _ => true
    | .ok _ => false)

/-- Every executable check of this module, named for the driver's failure report. -/
def noneIntermediateThrowConformanceChecks : List (String × Bool) := [
  ("retained_models_are_admitted_on_their_routes", retained_models_are_admitted_on_their_routes),
  ("events_lower_to_one_input_merges", events_lower_to_one_input_merges),
  ("second_flows_are_refused", second_flows_are_refused),
  ("wait_free_terminal_branch_is_refused", wait_free_terminal_branch_is_refused),
  ("call_behind_only_a_none_throw_is_refused", call_behind_only_a_none_throw_is_refused),
  ("other_profiles_refuse_the_event", other_profiles_refuse_the_event),
  ("event_decodes_to_its_own_arm", event_decodes_to_its_own_arm)
]

end BpmnSemantics.NoneIntermediateThrowConformance
