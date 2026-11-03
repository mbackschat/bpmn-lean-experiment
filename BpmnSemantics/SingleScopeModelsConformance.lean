module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmission

/-! # Single-scope models conformance

Finite admission witnesses of SSM-ADMIT-01, SSM-PROFILE-01 and SSM-ROUTE-01. The purchase request and invoice clearing
graphs transcribe the retained `scenarios/single-scope-models` models and the loan graphs the retained
`scenarios/call-variable-mapping` model; each refused or control graph differs from an admitted one in the fact its name
states. The degenerate Start-to-End model is absent: the serial overlay rule that refuses it is a source-reader rule,
witnessed by the source test. The module runs no command and imports admission owners only, as
`NoneIntermediateThrowConformance` does. See the
[single-scope models proposal](../docs/capsules/SINGLE-SCOPE-MODELS-PROPOSAL.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.SingleScopeModelsConformance

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
private def pass (owner id : String) (taskNotation : TaskNotation) := node owner (.nonOperationalTask ⟨id⟩ taskNotation)

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
    { id := ⟨"single-scope-models-handlers"⟩
      sha256 := "0000000000000000000000000000000000000000000000000000000000000021" }
  { identity :=
      { semanticProfile := profile, sourceId := ⟨"single-scope-models"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000022"
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

/-- How a purchase request graph departs from the retained model. -/
private inductive PurchaseEdit where
  | retained
  /-- *Log budget check* becomes a Call of a *Budget log* Process passing `request`, so the forking root calls. -/
  | rootCall

/-- Purchase request: root `P` alone reviews the request and forks into the mapped *Check budget*, reading `request`
into `budgetCode`, before the plain *Log budget check*, and the Manual *Collect signature* before *Approve purchase*; the
join throws *Purchase approved* before *Place order*. -/
private def purchaseWith (edit : PurchaseEdit := .retained) : CheckedProcess :=
  let (log, scopes, members, edges) : String × List (String × Option String) × List (String × String × CheckedNode) ×
      List (String × String) := match edit with
    | .retained => ("ChecksDone", [], [pass "P" "LogBudgetCheck" .abstractTask], [])
    | .rootCall => ("ChecksDone", [("BudgetLog", none)],
        [ mappedCall "P" "LogBudgetCheck" "BudgetLog" [enclosing "request" "request"] [], start "BudgetLog" "LogOpened"
        , task "BudgetLog" "WriteLog", finish "BudgetLog" "LogClosed" ],
        [("LogOpened", "WriteLog"), ("WriteLog", "LogClosed")])
  build [] ([("P", none)] ++ scopes)
    ([ start "P" "RequestSubmitted", task "P" "ReviewRequest", fork "P" "StartChecks"
     , service "P" "CheckBudget" "checkBudget" [enclosing "request" "request"] [copied "budgetCode" "code"]
     , pass "P" "CollectSignature" .manualTask, task "P" "ApprovePurchase", join "P" "ChecksDone"
     , throw "P" "PurchaseApproved", task "P" "PlaceOrder", finish "P" "OrderPlaced" ] ++ members)
    ([ ("RequestSubmitted", "ReviewRequest"), ("ReviewRequest", "StartChecks"), ("StartChecks", "CheckBudget")
     , ("CheckBudget", "LogBudgetCheck"), ("LogBudgetCheck", log), ("StartChecks", "CollectSignature")
     , ("CollectSignature", "ApprovePurchase"), ("ApprovePurchase", "ChecksDone"), ("ChecksDone", "PurchaseApproved")
     , ("PurchaseApproved", "PlaceOrder"), ("PlaceOrder", "OrderPlaced") ] ++ edges)

/-- Invoice clearing: root `P` alone merges into *Review invoice* and the mapped *Validate invoice*, reading `invoice`
into `verdict`, and chooses by it: an invalid invoice sends the Manual *Contact supplier* back to the Merge, otherwise
*Invoice cleared* is thrown before *Pay invoice*. -/
private def invoice : CheckedProcess :=
  build [] [("P", none)]
    [ start "P" "InvoiceReceived", merge "P" "ReviewRound", task "P" "ReviewInvoice"
    , service "P" "ValidateInvoice" "validateInvoice" [enclosing "invoice" "invoice"] [copied "verdict" "result"]
    , choice "P" "InvoiceValid" ["ContactSupplier"] "InvoiceCleared", pass "P" "ContactSupplier" .manualTask
    , throw "P" "InvoiceCleared", task "P" "PayInvoice", finish "P" "InvoicePaid" ]
    [ ("InvoiceReceived", "ReviewRound"), ("ReviewRound", "ReviewInvoice"), ("ReviewInvoice", "ValidateInvoice")
    , ("ValidateInvoice", "InvoiceValid"), ("InvoiceValid", "ContactSupplier"), ("ContactSupplier", "ReviewRound")
    , ("InvoiceValid", "InvoiceCleared"), ("InvoiceCleared", "PayInvoice"), ("PayInvoice", "InvoicePaid") ]
    [(("InvoiceValid", "ContactSupplier"), equals "verdict" "invalid")]

/-- Loan application: root `P` acknowledges the application and calls *Identity verification* through mappings before
*Review application*, as retained an embedded Sub-Process copying `decision` in and out, or, `flattened`, a User Task,
which leaves the called Process as the only other scope. -/
private def loanWith (flattened : Bool) : CheckedProcess :=
  let review := "ReviewApplication"
  let (records, scopes, members, edges) : List ScopeLocalData × List (String × Option String) ×
      List (String × String × CheckedNode) × List (String × String) := if flattened
    then ([], [], [task "P" review], [])
    else ([declare review [enclosing "decision" "decision"] [copied "decision" "decision"]], [(review, some "P")],
      [sub "P" review, start review "ReviewOpened", task review "ConfirmDecision", finish review "ReviewClosed"],
      [("ReviewOpened", "ConfirmDecision"), ("ConfirmDecision", "ReviewClosed")])
  build records ([("P", none), ("IdentityVerification", none)] ++ scopes)
    ([ start "P" "ApplicationReceived"
     , service "P" "AcknowledgeApplication" "acknowledgeApplication" [enclosing "amount" "amount"] []
     , mappedCall "P" "VerifyIdentity" "IdentityVerification"
         [enclosing "customer" "applicant", enclosing "amount" "amount"]
         [copied "decision" "verdict", copied "echoedCustomer" "customer"]
     , finish "P" "ApplicationDecided"
     , start "IdentityVerification" "VerificationRequested", task "IdentityVerification" "CollectDocument"
     , task "IdentityVerification" "RecordVerdict", finish "IdentityVerification" "VerificationCompleted" ] ++ members)
    ([ ("ApplicationReceived", "AcknowledgeApplication"), ("AcknowledgeApplication", "VerifyIdentity")
     , ("VerifyIdentity", review), (review, "ApplicationDecided")
     , ("VerificationRequested", "CollectDocument"), ("CollectDocument", "RecordVerdict")
     , ("RecordVerdict", "VerificationCompleted") ] ++ edges)

/-- Under `profile`, Start and End around `work`, at the root or, `wrapped`, inside a *Work* Sub-Process, with a source
overlay when `overlaid`. -/
private def around (profile : ProfileId) (overlaid wrapped : Bool) (work : String → List (String × String × CheckedNode))
    (flows : String → String → List (String × String)) : CheckedProcess :=
  if wrapped then
    build [] [("P", none), ("Work", some "P")]
      ([start "P" "Opened", sub "P" "Work", finish "P" "Closed", start "Work" "WorkOpened",
        finish "Work" "WorkClosed"] ++ work "Work")
      ([("Opened", "Work"), ("Work", "Closed")] ++ flows "WorkOpened" "WorkClosed") [] profile overlaid
  else
    build [] [("P", none)] ([start "P" "Opened", finish "P" "Closed"] ++ work "P") (flows "Opened" "Closed") [] profile
      overlaid

/-- The data-free control: a fork into *Review* and *Approve*, joined, overlaid only under the nested profile, as the
source reader compiles it under each. -/
private def reviews (profile : ProfileId) (wrapped : Bool) : CheckedProcess :=
  around profile (profile == nestedScopeDataProfileId) wrapped (fun owner => [fork owner "Split", task owner "Review", task owner "Approve", join owner "Join"])
    fun opened closed => [(opened, "Split"), ("Split", "Review"), ("Split", "Approve"), ("Review", "Join"),
      ("Approve", "Join"), ("Join", closed)]

/-- The data-bearing control: one mapped *Record* reading `entry` into `receipt`. -/
private def record (profile : ProfileId) (wrapped : Bool) : CheckedProcess :=
  around profile true wrapped
    (fun owner => [service owner "Record" "record" [enclosing "entry" "entry"] [copied "receipt" "receipt"]])
    fun opened closed => [(opened, "Record"), ("Record", closed)]

/-- A fork into *Review* and *Approve* whose branches end at their own None Ends, at the root, where it is the root's
second None End, or inside a *Work* Sub-Process. -/
private def terminalFork (wrapped : Bool) : CheckedProcess :=
  around nestedScopeDataProfileId true wrapped
    (fun owner => [fork owner "Split", task owner "Review", task owner "Approve", finish owner "Approved"])
    fun opened closed => [(opened, "Split"), ("Split", "Review"), ("Split", "Approve"), ("Review", closed),
      ("Approve", "Approved")]

/-- The Call of *Budget log* from the forking-root edit, after *Check budget* on a serial root path. -/
private def serialCall : CheckedProcess :=
  build [] [("P", none), ("BudgetLog", none)]
    [ start "P" "RequestSubmitted"
    , service "P" "CheckBudget" "checkBudget" [enclosing "request" "request"] [copied "budgetCode" "code"]
    , mappedCall "P" "LogBudgetCheck" "BudgetLog" [enclosing "request" "request"] [], finish "P" "OrderPlaced"
    , start "BudgetLog" "LogOpened", task "BudgetLog" "WriteLog", finish "BudgetLog" "LogClosed" ]
    [ ("RequestSubmitted", "CheckBudget"), ("CheckBudget", "LogBudgetCheck"), ("LogBudgetCheck", "OrderPlaced")
    , ("LogOpened", "WriteLog"), ("WriteLog", "LogClosed") ]

/-- Start, one User Task and End at the only scope under the nested scope-data profile. -/
private def approval : CheckedProcess :=
  build [] [("P", none)] [start "P" "Started", task "P" "Approve", finish "P" "Approved"]
    [("Started", "Approve"), ("Approve", "Approved")]

private def purchase : CheckedProcess := purchaseWith

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- The nested profile's routed analysis at both levels. -/
private def routed (source : CheckedProcess) : Bool :=
  StructuredScopeData.checkedRouted source && StructuredScopeData.programRouted (lowerCheckedProcess source)

/-- The concurrent analysis's largest closure at both levels, when they agree. -/
private def burst? (source : CheckedProcess) : Option Nat :=
  let checked := NestedScopeControl.checkedAnalysis source
  if checked == NestedScopeControl.programAnalysis (lowerCheckedProcess source) then checked else none

/-- SSM-ADMIT-01: the purchase request is admitted with one scope on the concurrent route and the invoice clearing on
the re-entry route, each at both levels. -/
private def retained_models_are_admitted_on_their_routes : Bool :=
  purchase.definitionScopes.length == 1 && admitted purchase && routed purchase &&
    StructuredScopeData.concurrentProgram (lowerCheckedProcess purchase) && (burst? purchase).isSome &&
    invoice.definitionScopes.length == 1 && admitted invoice && routed invoice &&
    ScopeReentry.checkedReentry invoice && ScopeReentry.programReentry (lowerCheckedProcess invoice)

/-- SSM-ADMIT-01: the loan application whose only other scope is its called Process is admitted on the serial route at
both levels, as its retained twin with the *Review application* Sub-Process is. -/
private def call_without_sub_process_is_admitted : Bool :=
  [loanWith false, loanWith true].all fun source =>
    admitted source && routed source && (NestedScopeData.checkedAnalysis source).isSome &&
      (NestedScopeData.programAnalysis (lowerCheckedProcess source)).isSome

/-- SSM-ADMIT-01: a Call in the forking root and a terminal fork, the root's second None End, stay refused at both
levels, while the same Call on a serial root path and the same fork inside a Sub-Process are routed, so neither refusal
comes from another rule. -/
private def excluded_forms_are_refused : Bool :=
  [purchaseWith .rootCall, terminalFork false].all (fun source =>
    !StructuredScopeData.checkedRouted source && !StructuredScopeData.programRouted (lowerCheckedProcess source)) &&
    [serialCall, terminalFork true].all fun source => admitted source && routed source

/-- SSM-PROFILE-01: under the embedded completion profile the data-free fork and the data-bearing serial model are
refused with one scope at both levels and admitted inside a Sub-Process, while the same one-scope graphs under the
nested scope-data profile are routed. -/
private def other_profiles_keep_the_lower_bound : Bool :=
  let embedded : ProfileId := ⟨embeddedCompletionProfile⟩
  [reviews, record].all fun control =>
    (burst? (control embedded true)).isSome &&
      (NestedScopeControl.checkedAnalysis (control embedded false)).isNone &&
      (NestedScopeControl.programAnalysis (lowerCheckedProcess (control embedded false))).isNone &&
      routed (control nestedScopeDataProfileId false)

/-- SSM-ROUTE-01: a one-scope Program of the nested scope-data profile is accepted by the structured-composition
analysis, which tests no profile, and by the nested route its profile dispatches user-task completion to, so the
completion theorems' `nestedScopeDataProgram program = false` premise is not vacuous. -/
private def structured_and_nested_routes_overlap : Bool :=
  let program := lowerCheckedProcess approval
  program.identity.semanticProfile == nestedScopeDataProfileId &&
    (StructuredComposition.programAnalysis program).isSome && StructuredScopeData.programRouted program

/-- Every executable check of this module, named for the driver's failure report. -/
def singleScopeModelsConformanceChecks : List (String × Bool) := [
  ("retained_models_are_admitted_on_their_routes", retained_models_are_admitted_on_their_routes),
  ("call_without_sub_process_is_admitted", call_without_sub_process_is_admitted),
  ("excluded_forms_are_refused", excluded_forms_are_refused),
  ("other_profiles_keep_the_lower_bound", other_profiles_keep_the_lower_bound),
  ("structured_and_nested_routes_overlap", structured_and_nested_routes_overlap)
]

end BpmnSemantics.SingleScopeModelsConformance
