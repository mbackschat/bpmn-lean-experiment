module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission

/-! # Pass-through Tasks on Parallel branches conformance

Finite admission witnesses of PTPB-ADMIT-01, PTPB-WORK-01, PTPB-CALL-01, PTPB-BURST-01 and PTPB-PROFILE-01. The office
relocation and invoice settlement graphs transcribe the retained `scenarios/pass-through-parallel-branches` models, and
the loan assessment graph the retained `scenarios/concurrent-structured-scope-data` model; their bursts are the
TypeScript analysis's values for the same graphs, and each refused graph differs from an admitted one in the fact its
name states. The module runs no command: the batched closures are Lean executions of the registered scenarios in the
pipeline, and `PTPB-COMMUTE-01` is the proved pair law of `InternalMergeScopeCreationCommutation`. It imports admission
owners only, so it stays outside `CommandAdmission`'s hidden-edit cone (`lean-fanout`). See the
[pass-through branch specification](../docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.PassThroughParallelBranchesConformance

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
private def sub (owner id : String) := node owner (.embeddedSubProcess ⟨id⟩ (scope id))
private def pass (owner id : String) (taskNotation : TaskNotation := .abstractTask) :=
  node owner (.nonOperationalTask ⟨id⟩ taskNotation)

private def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (owner id operation : String) (inputs outputs : List VariableMapping) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs outputs none)

private def mappedCall (owner id callee : String) (inputs outputs : List VariableMapping) :=
  node owner (.callActivity ⟨id⟩ ⟨callee⟩ (.variableMappings inputs outputs))

private def declare (owner : String) (inputs outputs : List VariableMapping) : ScopeLocalData :=
  { scopeId := scope owner, localInputs := inputs, localOutputs := outputs }

/-- A checked graph under `profile` over scopes, members and edges sorted into the canonical id order, with its scope
locals and, unless `overlaid` is false, a source overlay. -/
private def build (records : List ScopeLocalData) (scopes : List (String × Option String))
    (members : List (String × String × CheckedNode)) (edges : List (String × String))
    (profile : ProfileId := nestedScopeDataProfileId) (overlaid : Bool := true) : CheckedProcess :=
  let flowId := fun (edge : String × String) => edge.1 ++ ">" ++ edge.2
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (flowId left ≤ flowId right)
  let owner := fun (id : String) => ((members.find? (·.2.1 == id)).map (·.1)).getD ""
  let overlay : SourceOverlayIdentity :=
    { id := ⟨"pass-through-parallel-branches-handlers"⟩
      sha256 := "000000000000000000000000000000000000000000000000000000000000000f" }
  { identity :=
      { semanticProfile := profile, sourceId := ⟨"pass-through-parallel-branches"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000010"
        sourceOverlay := if overlaid then some overlay else none }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, id, _) => { nodeId := ⟨id⟩, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := ⟨flowId edge⟩, scopeId := scope (owner edge.1) }
    nodes := members.map (·.2.2)
    sequenceFlows := edges.map fun edge => { id := ⟨flowId edge⟩, sourceId := ⟨edge.1⟩, targetId := ⟨edge.2⟩ }
    scopeLocalData := records }

/-- `count` pass-through Tasks `Chained1`… of `owner` between `source` and `target`, as members and edges. -/
private def chain (owner source target : String) (count : Nat) :
    List (String × String × CheckedNode) × List (String × String) :=
  let ids := (List.range count).map fun index => "Chained" ++ toString (index + 1)
  let steps := source :: ids ++ [target]
  (ids.map (pass owner ·), steps.zip steps.tail)

/-- Office relocation: root `P` approves the relocation, forks into *Pack workplace*, whose body labels and packs
boxes, *Hand over keys* → *Book movers* → *File movers' confirmation*, and *Notify facilities* alone, joins and closes
the ticket. `facilitiesChain` adds that many pass-through Tasks after *Notify facilities*. -/
private def relocationWith (facilitiesChain : Nat := 0) : CheckedProcess :=
  let (chained, chainedEdges) := chain "P" "NotifyFacilities" "RelocationReady" facilitiesChain
  build
    [declare "PackWorkplace" [enclosing "boxes" "employee"] [copied "packedBoxes" "boxes"]]
    [("P", none), ("PackWorkplace", some "P")]
    ([ start "P" "RelocationRequested", task "P" "ApproveRelocation", fork "P" "StartRelocation"
     , sub "P" "PackWorkplace", pass "P" "HandOverKeys" .manualTask
     , service "P" "BookMovers" "bookMovers" [enclosing "employee" "employee"] [copied "moversBooking" "booking"]
     , pass "P" "FileMoversConfirmation", pass "P" "NotifyFacilities", join "P" "RelocationReady"
     , pass "P" "CloseRelocationTicket", finish "P" "OfficeRelocated"
     , start "PackWorkplace" "PackingStarted", pass "PackWorkplace" "LabelBoxes" .manualTask
     , task "PackWorkplace" "PackBoxes", finish "PackWorkplace" "WorkplacePacked" ] ++ chained)
    ([ ("RelocationRequested", "ApproveRelocation"), ("ApproveRelocation", "StartRelocation")
     , ("StartRelocation", "PackWorkplace"), ("StartRelocation", "HandOverKeys"), ("StartRelocation", "NotifyFacilities")
     , ("HandOverKeys", "BookMovers"), ("BookMovers", "FileMoversConfirmation")
     , ("FileMoversConfirmation", "RelocationReady"), ("PackWorkplace", "RelocationReady")
     , ("RelocationReady", "CloseRelocationTicket"), ("CloseRelocationTicket", "OfficeRelocated")
     , ("PackingStarted", "LabelBoxes"), ("LabelBoxes", "PackBoxes"), ("PackBoxes", "WorkplacePacked") ]
      ++ (if facilitiesChain == 0 then [("NotifyFacilities", "RelocationReady")] else chainedEdges))

/-- How the invoice review body closes its fork after *Check invoice*. -/
private inductive Closing where
  /-- *Archive receipt* and *Notify accounting* join before the body End, as retained. -/
  | joined
  /-- An empty branch beside the two Tasks, straight from the fork to the join. -/
  | emptyBranch
  /-- A terminal fork: *Archive receipt* ends at its own End, *Notify accounting* reaches *Confirm booking*. -/
  | terminal (archiveWaits : Bool)
  /-- As `terminal`, with *Archive receipt* behind a nested fork of two pass-through Tasks joined before it. -/
  | terminalNested (archiveWaits : Bool)

/-- Invoice settlement: root `P` reviews the invoice in a Sub-Process, then pays it through a mapped Service Task.
The body checks the invoice and forks into *Archive receipt* and *Notify accounting*, closed as `closing` states. -/
private def settlementWith (closing : Closing := .joined) : CheckedProcess :=
  let body := "ReviewInvoice"
  let archive := fun (waits : Bool) => if waits then task body "ArchiveReceipt" else pass body "ArchiveReceipt"
  let (members, edges) : List (String × String × CheckedNode) × List (String × String) := match closing with
    | .joined => ([pass body "ArchiveReceipt", join body "InvoiceRecorded"],
        [("RecordInvoice", "ArchiveReceipt"), ("ArchiveReceipt", "InvoiceRecorded"),
          ("NotifyAccounting", "InvoiceRecorded"), ("InvoiceRecorded", "ReviewClosed")])
    | .emptyBranch => ([pass body "ArchiveReceipt", join body "InvoiceRecorded"],
        [("RecordInvoice", "ArchiveReceipt"), ("RecordInvoice", "InvoiceRecorded"), ("ArchiveReceipt", "InvoiceRecorded"),
          ("NotifyAccounting", "InvoiceRecorded"), ("InvoiceRecorded", "ReviewClosed")])
    | .terminal waits => ([archive waits, task body "ConfirmBooking", finish body "ReceiptArchived"],
        [("RecordInvoice", "ArchiveReceipt"), ("ArchiveReceipt", "ReceiptArchived"),
          ("NotifyAccounting", "ConfirmBooking"), ("ConfirmBooking", "ReviewClosed")])
    | .terminalNested waits =>
        ([archive waits, task body "ConfirmBooking", finish body "ReceiptArchived", fork body "SplitArchive",
            pass body "ArchivePaper", pass body "ArchiveScan", join body "ArchiveDone"],
          [("RecordInvoice", "SplitArchive"), ("SplitArchive", "ArchivePaper"), ("SplitArchive", "ArchiveScan"),
            ("ArchivePaper", "ArchiveDone"), ("ArchiveScan", "ArchiveDone"), ("ArchiveDone", "ArchiveReceipt"),
            ("ArchiveReceipt", "ReceiptArchived"), ("NotifyAccounting", "ConfirmBooking"), ("ConfirmBooking", "ReviewClosed")])
  build
    [declare body [literal "verdict" "pending"] [copied "reviewVerdict" "verdict"]]
    [("P", none), (body, some "P")]
    ([ start "P" "InvoiceReceived", sub "P" body
     , service "P" "PayInvoice" "payInvoice" [enclosing "invoice" "invoice", enclosing "verdict" "reviewVerdict"]
         [copied "paymentReference" "reference"]
     , finish "P" "InvoiceSettled", start body "ReviewOpened", task body "CheckInvoice", fork body "RecordInvoice"
     , pass body "NotifyAccounting", finish body "ReviewClosed" ] ++ members)
    ([ ("InvoiceReceived", body), (body, "PayInvoice"), ("PayInvoice", "InvoiceSettled")
     , ("ReviewOpened", "CheckInvoice"), ("CheckInvoice", "RecordInvoice"), ("RecordInvoice", "NotifyAccounting") ]
      ++ edges)

/-- Loan assessment as retained: its body forks into *Credit check* and *Collateral valuation*, each preparing a file
and asking the *Expert review* Process through a mapped Call. `prepare` is the first vertex of *Credit check*, and
`afterPrepare` adds a pass-through Task between it and the credit Call. -/
private def loanWith (prepare : String → String → String × String × CheckedNode := task)
    (afterPrepare : Bool := false) : CheckedProcess :=
  let (tail, tailEdges) := if afterPrepare
    then ([pass "CreditCheck" "LogCreditFile"],
      [("PrepareCreditFile", "LogCreditFile"), ("LogCreditFile", "CreditExpertReview")])
    else ([], [("PrepareCreditFile", "CreditExpertReview")])
  build
    [ declare "AssessApplication"
        [literal "creditOpinion" "pending", enclosing "file" "application", literal "valuationOpinion" "pending"]
        [copied "credit" "creditOpinion", copied "valuation" "valuationOpinion"]
    , declare "CollateralValuation" [enclosing "dossier" "file"] [copied "valuationFile" "dossier"]
    , declare "CreditCheck" [enclosing "dossier" "file"] [copied "creditFile" "dossier"] ]
    [ ("P", none), ("AssessApplication", some "P"), ("CollateralValuation", some "AssessApplication")
    , ("CreditCheck", some "AssessApplication"), ("ExpertReview", none) ]
    ([ start "P" "ApplicationReceived", sub "P" "AssessApplication", task "P" "DecideLoan", finish "P" "LoanDecided"
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
      ++ tail)
    ([ ("ApplicationReceived", "AssessApplication"), ("AssessApplication", "DecideLoan"), ("DecideLoan", "LoanDecided")
     , ("AssessmentOpened", "SplitAssessment"), ("SplitAssessment", "CreditCheck")
     , ("SplitAssessment", "CollateralValuation"), ("CreditCheck", "JoinAssessment")
     , ("CollateralValuation", "JoinAssessment"), ("JoinAssessment", "AssessmentClosed")
     , ("CreditCheckOpened", "PrepareCreditFile"), ("CreditExpertReview", "CreditCheckClosed")
     , ("ValuationOpened", "PrepareValuation"), ("PrepareValuation", "ValuationExpertReview")
     , ("ValuationExpertReview", "ValuationClosed")
     , ("ReviewRequested", "GiveOpinion"), ("GiveOpinion", "ReviewCompleted") ] ++ tailEdges)

/-- A data-free embedded body under `profile`: root `P` runs *Setup*, then *Close*; *Setup* forks into *Assign desk*
and *Grant access*, joined before its End. `passed` puts a pass-through Task before *Assign desk*. -/
private def setupWith (profile : ProfileId) (passed : Bool) : CheckedProcess :=
  let (members, edges) := if passed
    then ([pass "Setup" "LogDesk"], [("SetupFork", "LogDesk"), ("LogDesk", "AssignDesk")])
    else ([], [("SetupFork", "AssignDesk")])
  build [] [("P", none), ("Setup", some "P")]
    ([ start "P" "Requested", sub "P" "Setup", task "P" "Close", finish "P" "Closed"
     , start "Setup" "SetupOpened", fork "Setup" "SetupFork", task "Setup" "AssignDesk", task "Setup" "GrantAccess"
     , join "Setup" "SetupJoin", finish "Setup" "SetupClosed" ] ++ members)
    ([ ("Requested", "Setup"), ("Setup", "Close"), ("Close", "Closed"), ("SetupOpened", "SetupFork")
     , ("SetupFork", "GrantAccess"), ("AssignDesk", "SetupJoin"), ("GrantAccess", "SetupJoin")
     , ("SetupJoin", "SetupClosed") ] ++ edges)
    -- The nested scope-data profile requires an overlay on every model; the embedded body has no effect, so none.
    profile (overlaid := profile == nestedScopeDataProfileId)

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- The concurrent analysis's largest closure at both levels, when they agree. -/
private def burst? (source : CheckedProcess) : Option Nat :=
  let checked := NestedScopeControl.checkedAnalysis source
  if checked == NestedScopeControl.programAnalysis (lowerCheckedProcess source) then checked else none

/-- PTPB-ADMIT-01: both witnesses are admitted and routed to the concurrent account at both levels, and the office
relocation's longest closure is its fork closure of seven steps. -/
private def retained_models_are_admitted_on_the_concurrent_route : Bool :=
  [relocationWith, settlementWith].all (fun source =>
    admitted source && StructuredScopeData.checkedRouted source &&
      StructuredScopeData.concurrentProgram (lowerCheckedProcess source)) &&
    burst? relocationWith == some 7

/-- PTPB-BURST-01: one more pass-through Task on the third branch reaches the closure limit of eight and is admitted;
two exceed it and are refused. -/
private def burst_of_eight_is_admitted_and_nine_refused : Bool :=
  admitted (relocationWith 1) && burst? (relocationWith 1) == some 8 && !admitted (relocationWith 2)

/-- PTPB-WORK-01: an empty branch, a terminal branch of a plain Task alone, and one through a nested wait-free fork
are refused, while each terminal twin whose first branch waits is admitted. -/
private def wait_free_terminal_and_empty_branches_are_refused : Bool :=
  !admitted (settlementWith .emptyBranch) &&
    admitted (settlementWith (.terminal true)) && !admitted (settlementWith (.terminal false)) &&
    admitted (settlementWith (.terminalNested true)) && !admitted (settlementWith (.terminalNested false))

/-- PTPB-CALL-01: a Call that only a Manual Task separates from its body's Start is refused, while a pass-through Task
between the body's first wait and its Call is admitted. -/
private def call_behind_only_pass_through_tasks_is_refused : Bool :=
  admitted loanWith && admitted (loanWith (afterPrepare := true)) &&
    !admitted (loanWith (fun owner id => pass owner id .manualTask))

/-- PTPB-PROFILE-01: under the embedded completion profile a pass-through Task before *Assign desk* is refused at
both levels while its twin is admitted, and the same graph under the nested scope-data profile has a pass vertex. -/
private def embedded_completion_profile_produces_no_pass_vertex : Bool :=
  let embedded : ProfileId := ⟨embeddedCompletionProfile⟩
  (burst? (setupWith embedded false)).isSome &&
    (NestedScopeControl.checkedAnalysis (setupWith embedded true)).isNone &&
    (NestedScopeControl.programAnalysis (lowerCheckedProcess (setupWith embedded true))).isNone &&
    (burst? (setupWith nestedScopeDataProfileId true)).isSome

/-- Every executable check of this module, named for the driver's failure report. -/
def passThroughParallelBranchesConformanceChecks : List (String × Bool) := [
  ("retained_models_are_admitted_on_the_concurrent_route", retained_models_are_admitted_on_the_concurrent_route),
  ("burst_of_eight_is_admitted_and_nine_refused", burst_of_eight_is_admitted_and_nine_refused),
  ("wait_free_terminal_and_empty_branches_are_refused", wait_free_terminal_and_empty_branches_are_refused),
  ("call_behind_only_pass_through_tasks_is_refused", call_behind_only_pass_through_tasks_is_refused),
  ("embedded_completion_profile_produces_no_pass_vertex", embedded_completion_profile_produces_no_pass_vertex)
]

end BpmnSemantics.PassThroughParallelBranchesConformance
