module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission

/-! # Scope re-entry conformance

Finite admission witnesses of SRE-ROUTE-01, SRE-ADMIT-01, SRE-CYCLE-01, SRE-AVAILABLE-01 and SRE-BURST-01 under
the nested scope-data profile. The claim rework and contract revision graphs transcribe the retained
`scenarios/scope-reentry` models; their Start names and bursts are the TypeScript analysis's values for the same
graphs, and each refused graph differs from an admitted one in the fact its name states. The module runs no
command: fresh occurrences, frames and stale-command refusals are Lean executions of the registered scenarios in the
pipeline. It imports admission owners only, so it stays outside `CommandAdmission`'s hidden-edit cone
(`lean-fanout`). See the [scope re-entry specification](../docs/capsules/SCOPE-REENTRY-SPEC.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.ScopeReentryConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"
private def simpleBoolean : String := "urn:bpmn-lean:expression:simple-boolean:v1"

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
private def flowId (source target : String) : SequenceFlowId := ⟨source ++ ">" ++ target⟩
private def node (owner : String) (value : CheckedNode) : String × String × CheckedNode := (owner, value.id.value, value)
private def start (owner id : String) := node owner (.noneStartEvent ⟨id⟩)
private def finish (owner id : String) := node owner (.noneEndEvent ⟨id⟩)
private def fork (owner id : String) := node owner (.parallelGateway ⟨id⟩ .diverging)
private def join (owner id : String) := node owner (.parallelGateway ⟨id⟩ .converging)
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

private def mappedCall (owner id callee : String) (inputs outputs : List VariableMapping) :=
  node owner (.callActivity ⟨id⟩ ⟨callee⟩ (.variableMappings inputs outputs))

private def declare (owner : String) (inputs outputs : List VariableMapping) : ScopeLocalData :=
  { scopeId := scope owner, localInputs := inputs, localOutputs := outputs }

/-- A Simple Boolean v1 test that the Process binding `name` equals `value`. -/
private def equals (name value : String) : CheckedCondition :=
  { language := simpleBoolean, body := "stringEquals(" ++ name ++ ",\"" ++ value ++ "\")" }

private def overlay : SourceOverlayIdentity :=
  { id := ⟨"scope-reentry-handlers"⟩, sha256 := "0000000000000000000000000000000000000000000000000000000000000007" }

/-- A checked graph of the nested scope-data profile over scopes, members and edges sorted into the canonical id
order, with its scope locals, a source overlay, and the conditions keyed by their edges. -/
private def build (records : List ScopeLocalData) (scopes : List (String × Option String))
    (members : List (String × String × CheckedNode)) (edges : List (String × String))
    (conditions : List ((String × String) × CheckedCondition)) : CheckedProcess :=
  let id := fun (edge : String × String) => (flowId edge.1 edge.2).value
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (id left ≤ id right)
  let owner := fun (node : String) => ((members.find? (·.2.1 == node)).map (·.1)).getD ""
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"scope-reentry"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000008"
        sourceOverlay := some overlay }
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

/-- Wraps *Inspect damage* in `levels` nested Sub-Processes, each adding one entry step to every closure reaching
it: the members, scopes and edges replacing the task's own placement in *Assess claim*. -/
private def nestedInspection (levels : Nat) :
    List (String × String × CheckedNode) × List (String × Option String) × List (String × String) × String :=
  let level := fun (n : Nat) => "InspectDamageLevel" ++ toString n
  let owner := fun (n : Nat) => if n = 0 then "AssessClaim" else level n
  let target := fun (n : Nat) => if n = levels then "InspectDamage" else level (n + 1)
  let wrappers := (List.range levels).map (· + 1)
  ( task (owner levels) "InspectDamage" :: wrappers.flatMap (fun n =>
      [sub (owner (n - 1)) (level n), start (level n) (level n ++ "Start"), finish (level n) (level n ++ "End")])
  , wrappers.map fun n => (level n, some (owner (n - 1)))
  , wrappers.flatMap fun n => [(level n ++ "Start", target n), (target n, level n ++ "End")]
  , if levels = 0 then "InspectDamage" else level 1 )

/-- Claim rework: root `P` receives a claim, merges into *Assess claim*, whose body inspects the damage and prices
the repair, and chooses: rework re-enters the Merge, reject notifies the claimant, the default approves the
settlement. `inspectLevels` nests *Inspect damage*, `logRework` routes the back-edge through an empty *Log rework*
Sub-Process, `previous` makes *Price repair* also read `assessment`, `triage` writes `assessment` before the Merge,
`choiceTargets` lists the Choice's conditional targets after the rework, and `extra`, `extraEdges` and `drop` edit
the graph further. -/
private def claimWith (inspectLevels : Nat := 0) (logRework previous triage : Bool := false)
    (choiceTargets : List String := ["NotifyClaimant"])
    (extra : List (String × String × CheckedNode) := []) (extraScopes : List (String × Option String) := [])
    (extraEdges : List (String × String) := []) (drop : List String := [])
    (extraConditions : List ((String × String) × CheckedCondition) := [])
    (dropEdges : List (String × String) := []) : CheckedProcess :=
  let (inspection, inspectionScopes, inspectionEdges, inspectEntry) := nestedInspection inspectLevels
  let reworkTarget := if logRework then "LogRework" else "AssessmentRequested"
  let members :=
    [ start "P" "ClaimReceived", merge "P" "AssessmentRequested", sub "P" "AssessClaim"
    , choice "P" "AssessmentOutcome" (reworkTarget :: choiceTargets) "ApproveSettlement"
    , task "P" "NotifyClaimant", task "P" "ApproveSettlement", merge "P" "ClaimClosing", finish "P" "ClaimClosed"
    , start "AssessClaim" "AssessmentOpened"
    , service "AssessClaim" "PriceRepair" "priceRepair"
        ([enclosing "damage" "notes"] ++ if previous then [enclosing "previous" "assessment"] else [])
        [copied "repairQuote" "quote"]
    , finish "AssessClaim" "AssessmentClosed" ] ++ inspection
      ++ (if logRework then [sub "P" "LogRework", start "LogRework" "LogOpened", finish "LogRework" "LogClosed"] else [])
      ++ (if triage then [service "P" "Triage" "priceRepair" [enclosing "damage" "claimSummary"]
            [copied "assessment" "quote"]] else [])
      ++ extra
  let edges :=
    [ (if triage then ("ClaimReceived", "Triage") else ("ClaimReceived", "AssessmentRequested"))
    , ("AssessmentRequested", "AssessClaim"), ("AssessClaim", "AssessmentOutcome")
    , ("AssessmentOutcome", reworkTarget), ("AssessmentOutcome", "NotifyClaimant")
    , ("AssessmentOutcome", "ApproveSettlement"), ("NotifyClaimant", "ClaimClosing")
    , ("ApproveSettlement", "ClaimClosing"), ("ClaimClosing", "ClaimClosed")
    , ("AssessmentOpened", inspectEntry), (inspectEntry, "PriceRepair"), ("PriceRepair", "AssessmentClosed") ]
      ++ inspectionEdges
      ++ (if logRework then [("LogOpened", "LogClosed"), ("LogRework", "AssessmentRequested")] else [])
      ++ (if triage then [("Triage", "AssessmentRequested")] else [])
      ++ extraEdges
  build [declare "AssessClaim" [literal "decision" "pending", enclosing "notes" "claimSummary"] [copied "assessment" "decision"]]
    ([("P", none), ("AssessClaim", some "P")] ++ inspectionScopes ++
      (if logRework then [("LogRework", some "P")] else []) ++ extraScopes)
    (members.filter fun member => !drop.contains member.2.1)
    (edges.filter fun edge => !dropEdges.contains edge && !drop.contains edge.1 && !drop.contains edge.2)
    ([(("AssessmentOutcome", reworkTarget), equals "assessment" "rework"),
      (("AssessmentOutcome", "NotifyClaimant"), equals "assessment" "reject")] ++ extraConditions)

/-- Contract revision: root `P` merges into *Prepare draft*, whose body edits the draft, invokes the *Legal review*
Process through a mapped Call and chooses: revise re-enters the Merge, withdraw closes the negotiation, the default
signs and files the contract. `editLevels` nests *Edit draft*, `logRevise` routes the back-edge through an empty
*Log revision* Sub-Process, and `edited` keeps *Edit draft*. -/
private def contractWith (editLevels : Nat := 0) (logRevise : Bool := false) (edited : Bool := true) : CheckedProcess :=
  let level := fun (n : Nat) => "EditDraftLevel" ++ toString n
  let owner := fun (n : Nat) => if n = 0 then "PrepareDraft" else level n
  let target := fun (n : Nat) => if n = editLevels then "EditDraft" else level (n + 1)
  let wrappers := (List.range editLevels).map (· + 1)
  let editEntry := if editLevels = 0 then "EditDraft" else level 1
  let reviseTarget := if logRevise then "LogRevision" else "RevisionRequested"
  build [declare "PrepareDraft" [enclosing "draft" "contractText"] [copied "contractText" "draft"]]
    ([("P", none), ("PrepareDraft", some "P"), ("LegalReviewProcess", none)] ++
      wrappers.map (fun n => (level n, some (owner (n - 1)))) ++
      (if logRevise then [("LogRevision", some "P")] else []))
    ([ start "P" "DraftRequested", merge "P" "RevisionRequested", sub "P" "PrepareDraft"
     , mappedCall "P" "LegalReview" "LegalReviewProcess" [enclosing "text" "contractText"] [copied "legalVerdict" "verdict"]
     , choice "P" "ReviewOutcome" [reviseTarget, "CloseNegotiation"] "SignContract"
     , task "P" "CloseNegotiation", task "P" "SignContract"
     , service "P" "FileContract" "fileContract" [enclosing "document" "contractText"] []
     , merge "P" "ContractSettled", finish "P" "ContractClosed"
     , start "PrepareDraft" "DraftOpened", finish "PrepareDraft" "DraftReady"
     , start "LegalReviewProcess" "ReviewRequested", task "LegalReviewProcess" "ReviewClauses"
     , finish "LegalReviewProcess" "ReviewCompleted" ]
      ++ (if edited then task (owner editLevels) "EditDraft" :: wrappers.flatMap (fun n =>
            [sub (owner (n - 1)) (level n), start (level n) (level n ++ "Start"), finish (level n) (level n ++ "End")])
          else [])
      ++ (if logRevise then [sub "P" "LogRevision", start "LogRevision" "LogOpened", finish "LogRevision" "LogClosed"]
          else []))
    ([ ("DraftRequested", "RevisionRequested"), ("RevisionRequested", "PrepareDraft"), ("PrepareDraft", "LegalReview")
     , ("LegalReview", "ReviewOutcome"), ("ReviewOutcome", reviseTarget), ("ReviewOutcome", "CloseNegotiation")
     , ("ReviewOutcome", "SignContract"), ("CloseNegotiation", "ContractSettled"), ("SignContract", "FileContract")
     , ("FileContract", "ContractSettled"), ("ContractSettled", "ContractClosed")
     , ("ReviewRequested", "ReviewClauses"), ("ReviewClauses", "ReviewCompleted") ]
      ++ (if edited then [("DraftOpened", editEntry), (editEntry, "DraftReady")] ++
            wrappers.flatMap (fun n => [(level n ++ "Start", target n), (target n, level n ++ "End")])
          else [("DraftOpened", "DraftReady")])
      ++ (if logRevise then [("LogOpened", "LogClosed"), ("LogRevision", "RevisionRequested")] else []))
    [(("ReviewOutcome", reviseTarget), equals "legalVerdict" "revise"),
     (("ReviewOutcome", "CloseNegotiation"), equals "legalVerdict" "withdraw")]

private def claim : CheckedProcess := claimWith
private def contract : CheckedProcess := contractWith

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

private def sorted (names : List String) : List String := names.mergeSort fun left right => decide (left ≤ right)

/-- The re-entry account's required and optional names and burst over the checked graph, which the lowered
Program's must equal. -/
private def analyses (source : CheckedProcess) : Option (List String × Option (List String) × Nat) :=
  let program := lowerCheckedProcess source
  let checked := (ScopeReentry.checkedAnalysis source).map fun analysis =>
    (sorted analysis.required, analysis.optional.map sorted)
  let lowered := (ScopeReentry.programAnalysis program).map fun analysis =>
    (sorted analysis.required, analysis.optional.map sorted)
  if checked != lowered || ScopeReentry.checkedBurst? source != ScopeReentry.programBurst? program then none
  else do
    let (required, optional) ← checked
    some (required, optional, ← ScopeReentry.checkedBurst? source)

/-- SRE-ROUTE-01 and SRE-ADMIT-01: both retained graphs are admitted and routed to the re-entry account. -/
private def retained_models_are_admitted_and_routed : Bool :=
  admitted claim && admitted contract &&
    ScopeReentry.programReentry (lowerCheckedProcess claim) && ScopeReentry.checkedReentry claim &&
    ScopeReentry.programReentry (lowerCheckedProcess contract) && ScopeReentry.checkedReentry contract &&
    StructuredScopeData.checkedRouted claim && StructuredScopeData.checkedRouted contract

/-- SRE-AVAILABLE-01 and SRE-BURST-01: the claim requires its summary and bursts six steps; the contract requires
its text, admits the returned verdict and bursts six steps. -/
private def start_names_and_bursts_follow_the_topology : Bool := decide <|
  analyses claim = some (["claimSummary"], none, 6) ∧
    analyses contract = some (["contractText"], some ["legalVerdict"], 6)

/-- SRE-AVAILABLE-01 at Start: the summary is required, and the profile's `SingletonBusinessItem` policy admits it. -/
private def start_requires_the_claim_summary : Bool :=
  let program := lowerCheckedProcess claim
  StructuredScopeData.startBindingsRouted program [{ name := "claimSummary", value := .string "hail damage" }] &&
    !StructuredScopeData.startBindingsRouted program []

/-- SRE-BURST-01: a burst of exactly eight is admitted, caller-side and through the Call's return, and the
routing of the back-edge through an empty Sub-Process, nine steps, is refused. -/
private def burst_of_eight_is_admitted_and_nine_refused : Bool :=
  (analyses (claimWith (inspectLevels := 2))).map (·.2.2) == some 8 &&
    (analyses (contractWith (editLevels := 2))).map (·.2.2) == some 8 &&
    !admitted (claimWith (logRework := true)) && !admitted (contractWith (logRevise := true))

/-- SRE-AVAILABLE-01: a read whose only writer lies on the back-edge stays a Start name; a writer before the Merge
supplies the first entry. -/
private def back_edge_writer_leaves_a_start_name : Bool := decide <|
  (analyses (claimWith (previous := true))).map (·.1) = some ["assessment", "claimSummary"] ∧
    (analyses (claimWith (previous := true) (triage := true))).map (·.1) = some ["claimSummary"]

/-- SRE-CYCLE-01: a cycle of Merge and Choice alone is refused although a User Task lies on its exit path. -/
private def internal_only_cycle_is_refused : Bool :=
  !admitted (claimWith (extraEdges := [("ClaimReceived", "AssessClaim"), ("AssessmentRequested", "AssessmentOutcome"),
      ("AssessClaim", "AssessmentRequested")])
    (dropEdges := [("ClaimReceived", "AssessmentRequested"), ("AssessmentRequested", "AssessClaim"),
      ("AssessClaim", "AssessmentOutcome")]))

/-- SRE-CYCLE-01: a cycle whose Sub-Process body holds no task is refused. -/
private def task_free_body_cycle_is_refused : Bool :=
  !admitted (claimWith (drop := ["InspectDamage", "PriceRepair"]) (extraEdges := [("AssessmentOpened", "AssessmentClosed")]))

/-- SRE-CYCLE-01's cut excludes a cycle whose only resumption lies in the called Process. -/
private def called_only_resumption_is_refused : Bool := !admitted (contractWith (edited := false))

/-- SRE-ADMIT-01: a Choice with one or three conditions is refused. -/
private def choice_arity_is_two_conditions : Bool :=
  !admitted (claimWith (choiceTargets := []) (drop := ["NotifyClaimant", "ClaimClosing"])
      (extraEdges := [("ApproveSettlement", "ClaimClosed")])) &&
    !admitted (claimWith (choiceTargets := ["NotifyClaimant", "ClaimClosing"])
      (extraEdges := [("AssessmentOutcome", "ClaimClosing")])
      (extraConditions := [(("AssessmentOutcome", "ClaimClosing"), equals "assessment" "withdrawn")]))

/-- SRE-ADMIT-01: a Choice inside a Sub-Process body is refused. -/
private def body_choice_is_refused : Bool :=
  !admitted (claimWith
    (extra := [choice "AssessClaim" "DamageKind" ["DamageKindJoin", "DamageKindJoinShort"] "DamageKindJoinPlain",
      merge "AssessClaim" "DamageKindJoin", task "AssessClaim" "DamageKindJoinShort", task "AssessClaim" "DamageKindJoinPlain"])
    (extraEdges := [("AssessmentOpened", "DamageKind"), ("DamageKindJoinShort", "DamageKindJoin"),
      ("DamageKindJoinPlain", "DamageKindJoin"), ("DamageKindJoin", "InspectDamage")])
    (dropEdges := [("AssessmentOpened", "InspectDamage")])
    (extraConditions := [(("DamageKind", "DamageKindJoin"), equals "notes" "long"),
      (("DamageKind", "DamageKindJoinShort"), equals "notes" "short")]))

/-- SRE-ROUTE-01: a graph that both forks and chooses is refused. -/
private def fork_and_choice_is_refused : Bool :=
  !admitted (claimWith
    (extra := [fork "AssessClaim" "Split", join "AssessClaim" "Join", task "AssessClaim" "PhotographDamage"])
    (extraEdges := [("AssessmentOpened", "Split"), ("Split", "InspectDamage"), ("Split", "PhotographDamage"),
      ("InspectDamage", "Join"), ("PhotographDamage", "Join"), ("Join", "PriceRepair")])
    (dropEdges := [("AssessmentOpened", "InspectDamage"), ("InspectDamage", "PriceRepair")]))

/-- SRE-ADMIT-01: the root keeps one None End. -/
private def second_root_end_is_refused : Bool :=
  !admitted (claimWith (extra := [finish "P" "ClaimSettled"]) (drop := ["ClaimClosing"])
    (extraEdges := [("NotifyClaimant", "ClaimClosed"), ("ApproveSettlement", "ClaimSettled")]))

/-- Every executable check of this module, named for the driver's failure report. -/
def scopeReentryConformanceChecks : List (String × Bool) := [
  ("retained_models_are_admitted_and_routed", retained_models_are_admitted_and_routed),
  ("start_names_and_bursts_follow_the_topology", start_names_and_bursts_follow_the_topology),
  ("start_requires_the_claim_summary", start_requires_the_claim_summary),
  ("burst_of_eight_is_admitted_and_nine_refused", burst_of_eight_is_admitted_and_nine_refused),
  ("back_edge_writer_leaves_a_start_name", back_edge_writer_leaves_a_start_name),
  ("internal_only_cycle_is_refused", internal_only_cycle_is_refused),
  ("task_free_body_cycle_is_refused", task_free_body_cycle_is_refused),
  ("called_only_resumption_is_refused", called_only_resumption_is_refused),
  ("choice_arity_is_two_conditions", choice_arity_is_two_conditions),
  ("body_choice_is_refused", body_choice_is_refused),
  ("fork_and_choice_is_refused", fork_and_choice_is_refused),
  ("second_root_end_is_refused", second_root_end_is_refused)
]

end BpmnSemantics.ScopeReentryConformance
