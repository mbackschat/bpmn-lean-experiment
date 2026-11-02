module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission

/-! # Concurrent structured scope data conformance

Finite admission witnesses of CSSD-ADMIT-01 and CSSD-ROUTE-01 under the nested scope-data profile. The
order fulfilment and loan assessment graphs transcribe the retained `scenarios/concurrent-structured-scope-data`
models, and their expectations are the TypeScript analysis's values for the same graphs; each refused graph
differs from an admitted one in the fact its name states. The module runs no command: the journeys, values and
refusals are Lean executions of the registered scenarios in the pipeline, and the serial preservation is the
law beside the routing in `NestedScopeControlAdmission`. It imports admission owners only, never a module that
runs commands, so it stays outside `CommandAdmission`'s hidden-edit cone (`lean-fanout`); that is why it builds
its graphs itself instead of through `NestedScopeControlConformance.build`. See the
[concurrent structured scope data specification](../docs/capsules/CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.ConcurrentStructuredScopeDataConformance

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

private def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (owner id operation : String) (inputs outputs : List VariableMapping) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs outputs none)

private def mappedCall (owner id callee : String) (inputs outputs : List VariableMapping) :=
  node owner (.callActivity ⟨id⟩ ⟨callee⟩ (.variableMappings inputs outputs))

private def declare (owner : String) (inputs outputs : List VariableMapping) : ScopeLocalData :=
  { scopeId := scope owner, localInputs := inputs, localOutputs := outputs }

private def overlay : SourceOverlayIdentity :=
  { id := ⟨"structured-scope-data-handlers"⟩, sha256 := "0000000000000000000000000000000000000000000000000000000000000005" }

/-- A checked graph of the nested scope-data profile over scopes, members and edges sorted into the canonical id
order, with its scope locals and, unless `overlaid` is false, its source overlay. -/
private def build (records : List ScopeLocalData) (scopes : List (String × Option String))
    (members : List (String × String × CheckedNode)) (edges : List (String × String)) (overlaid : Bool := true) :
    CheckedProcess :=
  let flowId := fun (edge : String × String) => edge.1 ++ ">" ++ edge.2
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (flowId left ≤ flowId right)
  let owner := fun (id : String) => ((members.find? (·.2.1 == id)).map (·.1)).getD ""
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"concurrent-structured-scope-data"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000006"
        sourceOverlay := if overlaid then some overlay else none }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, id, _) => { nodeId := ⟨id⟩, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := ⟨flowId edge⟩, scopeId := scope (owner edge.1) }
    nodes := members.map (·.2.2)
    sequenceFlows := edges.map fun edge => { id := ⟨flowId edge⟩, sourceId := ⟨edge.1⟩, targetId := ⟨edge.2⟩ }
    scopeLocalData := records }

/-- Order fulfilment: root `P` runs *Fulfil order*, then *Close order*. *Fulfil order* forks into *Pick stock*
and *Plan shipment*, each copying the Process `order`, joins and notifies the customer. `closer` closes the
fork and `extraBranch` adds a third User Task branch. -/
private def orderWith (closer : String → String → String × String × CheckedNode := join)
    (extraBranch : Bool := false) : CheckedProcess :=
  let third := if extraBranch then [task "FulfilOrder" "CheckCredit"] else []
  let thirdEdges := if extraBranch then [("SplitFulfilment", "CheckCredit"), ("CheckCredit", "JoinFulfilment")] else []
  build
    [ declare "FulfilOrder" [literal "instructions" "standard", literal "label" "none", literal "parcels" "none"]
        [copied "finalInstructions" "instructions", copied "shippedParcels" "parcels", copied "shippingLabel" "label"]
    , declare "PickStock" [literal "packing" "none", enclosing "pickList" "order"] [copied "parcels" "packing"]
    , declare "PlanShipment" [enclosing "shipment" "order"] [] ]
    [("P", none), ("FulfilOrder", some "P"), ("PickStock", some "FulfilOrder"), ("PlanShipment", some "FulfilOrder")]
    ([ start "P" "OrderReceived", sub "P" "FulfilOrder", task "P" "CloseOrder", finish "P" "OrderClosed"
     , start "FulfilOrder" "FulfilmentOpened", fork "FulfilOrder" "SplitFulfilment", sub "FulfilOrder" "PickStock"
     , sub "FulfilOrder" "PlanShipment", closer "FulfilOrder" "JoinFulfilment"
     , service "FulfilOrder" "NotifyCustomer" "notifyCustomer" [enclosing "quote" "carrierQuote"] []
     , task "FulfilOrder" "ConfirmFulfilment", finish "FulfilOrder" "FulfilmentClosed"
     , start "PickStock" "PickingOpened"
     , service "PickStock" "PickItems" "pickItems" [enclosing "instructions" "instructions", enclosing "items" "pickList"]
         [copied "packing" "packed"]
     , finish "PickStock" "PickingClosed", start "PlanShipment" "PlanningOpened", task "PlanShipment" "ReviewRoute"
     , service "PlanShipment" "RateShipment" "rateShipment"
         [enclosing "instructions" "instructions", enclosing "shipment" "shipment"]
         [copied "carrierQuote" "quote", copied "label" "quote"]
     , finish "PlanShipment" "PlanningClosed" ] ++ third)
    ([ ("FulfilmentOpened", "SplitFulfilment"), ("SplitFulfilment", "PickStock"), ("SplitFulfilment", "PlanShipment")
     , ("PickStock", "JoinFulfilment"), ("PlanShipment", "JoinFulfilment"), ("JoinFulfilment", "NotifyCustomer")
     , ("NotifyCustomer", "ConfirmFulfilment"), ("ConfirmFulfilment", "FulfilmentClosed")
     , ("PickingOpened", "PickItems"), ("PickItems", "PickingClosed"), ("PlanningOpened", "ReviewRoute")
     , ("ReviewRoute", "RateShipment"), ("RateShipment", "PlanningClosed")
     , ("OrderReceived", "FulfilOrder"), ("FulfilOrder", "CloseOrder"), ("CloseOrder", "OrderClosed") ] ++ thirdEdges)

/-- Loan assessment: root `P` runs *Assess application*, then *Decide loan*. Its body forks into *Credit check*
and *Collateral valuation*, each copying `file` into its own `dossier`, preparing it and asking the one
*Expert review* Process `ExpertReview` through its own mapped Call. `extra` adds members and edges,
`creditTail`, `assessTail` and `joinTail` retarget the flows leaving the credit Call, *Assess application* and the
join, `creditPrepared` keeps *Prepare credit file* before the credit Call, `valuationCalled` keeps the valuation
Call, and `overlaid` keeps the source overlay. -/
private def loanWith (extra : List (String × String × CheckedNode) := []) (extraEdges : List (String × String) := [])
    (creditTail : String := "CreditCheckClosed") (assessTail : String := "DecideLoan")
    (joinTail : String := "AssessmentClosed") (creditPrepared : Bool := true) (valuationCalled : Bool := true)
    (overlaid : Bool := true) : CheckedProcess :=
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
     , start "CreditCheck" "CreditCheckOpened"
     , mappedCall "CreditCheck" "CreditExpertReview" "ExpertReview" [enclosing "case" "dossier"]
         [copied "creditOpinion" "opinion"]
     , finish "CreditCheck" "CreditCheckClosed"
     , start "CollateralValuation" "ValuationOpened", task "CollateralValuation" "PrepareValuation"
     , finish "CollateralValuation" "ValuationClosed"
     , start "ExpertReview" "ReviewRequested", task "ExpertReview" "GiveOpinion", finish "ExpertReview" "ReviewCompleted" ]
      ++ (if creditPrepared then [task "CreditCheck" "PrepareCreditFile"] else [])
      ++ (if valuationCalled then
            [mappedCall "CollateralValuation" "ValuationExpertReview" "ExpertReview" [enclosing "case" "dossier"]
              [copied "valuationOpinion" "opinion"]] else [])
      ++ extra)
    ([ ("ApplicationReceived", "AssessApplication"), ("AssessApplication", assessTail), ("DecideLoan", "LoanDecided")
     , ("AssessmentOpened", "SplitAssessment"), ("SplitAssessment", "CreditCheck")
     , ("SplitAssessment", "CollateralValuation"), ("CreditCheck", "JoinAssessment")
     , ("CollateralValuation", "JoinAssessment"), ("JoinAssessment", joinTail)
     , ("CreditCheckOpened", if creditPrepared then "PrepareCreditFile" else "CreditExpertReview")
     , ("CreditExpertReview", creditTail), ("ValuationOpened", "PrepareValuation")
     , ("PrepareValuation", if valuationCalled then "ValuationExpertReview" else "ValuationClosed")
     , ("ReviewRequested", "GiveOpinion"), ("GiveOpinion", "ReviewCompleted") ]
      ++ (if creditPrepared then [("PrepareCreditFile", "CreditExpertReview")] else [])
      ++ (if valuationCalled then [("ValuationExpertReview", "ValuationClosed")] else [])
      ++ extraEdges)
    overlaid

private def order : CheckedProcess := orderWith
private def loan : CheckedProcess := loanWith

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- CSSD-ADMIT-01 and CSSD-ROUTE-01: both retained graphs are admitted, and their Programs are concurrent. -/
private def retained_models_are_admitted_and_routed_concurrent : Bool :=
  admitted order && admitted loan &&
    StructuredScopeData.concurrentProgram (lowerCheckedProcess order) &&
    StructuredScopeData.concurrentProgram (lowerCheckedProcess loan) &&
    StructuredScopeData.checkedRouted order && StructuredScopeData.checkedRouted loan

/-- CSD-AVAILABLE-01 under the profile: each model requires only its business object, and the Program and the
checked graph agree. -/
private def start_names_follow_availability : Bool := decide <|
    NestedScopeControl.programStartNames (lowerCheckedProcess order) = some ["order"] ∧
      NestedScopeControl.checkedStartNames order = some ["order"] ∧
      NestedScopeControl.programStartNames (lowerCheckedProcess loan) = some ["application"] ∧
      NestedScopeControl.checkedStartNames loan = some ["application"]

/-- CSSD-ADMIT-01 at Start: the business object is required, and the profile's `SingletonBusinessItem` policy
admits it as a Map. -/
private def start_requires_the_structured_business_object : Bool :=
  let program := lowerCheckedProcess order
  let structured : VariableValue := .map [("lines", .list [.string "A-17", .string "A-17"]), ("unit", .null)]
  StructuredScopeData.startBindingsRouted program [{ name := "order", value := structured }] &&
    !StructuredScopeData.startBindingsRouted program []

/-- Three branches closed by an Exclusive merge are refused, while the same branches closed by a join are
admitted; three branches, because graph arity already refuses a two-way merge under this profile. -/
private def merge_region_is_refused : Bool :=
  admitted (orderWith (extraBranch := true)) && !admitted (orderWith merge (extraBranch := true))

/-- The overlay stays required on a model without a Service Task. -/
private def overlay_free_model_is_refused : Bool := admitted loan && !admitted (loanWith (overlaid := false))

/-- A third Call exceeds the profile's Call bound. -/
private def third_call_is_refused : Bool :=
  admitted loan && !admitted (loanWith
    [mappedCall "CreditCheck" "CreditRecheck" "ExpertReview" [enclosing "case" "dossier"] [copied "creditOpinion" "opinion"]]
    [("CreditRecheck", "CreditCheckClosed")] (creditTail := "CreditRecheck"))

/-- A Service Task on the root path beside the Calls is refused. -/
private def service_task_beside_a_call_is_refused : Bool :=
  admitted loan && !admitted (loanWith [service "P" "RecordAssessment" "recordAssessment" [] []]
    [("RecordAssessment", "DecideLoan")] (assessTail := "RecordAssessment"))

/-- A credit Call leading its branch body is refused, while the same Call after *Prepare credit file* is
admitted. -/
private def call_leading_a_branch_body_is_refused : Bool :=
  admitted loan && !admitted (loanWith (creditPrepared := false))

/-- A Call after the join in the forking body is refused. The control drops the valuation Call, so the refused
graph stays within the two-Call bound and differs only in that placement. -/
private def call_in_a_forking_body_is_refused : Bool :=
  admitted (loanWith (valuationCalled := false)) && !admitted (loanWith
    [mappedCall "AssessApplication" "FinalReview" "ExpertReview" [enclosing "case" "file"] []]
    [("FinalReview", "AssessmentClosed")] (joinTail := "FinalReview") (valuationCalled := false))

/-- Every executable check of this module, named for the driver's failure report. -/
def concurrentStructuredScopeDataConformanceChecks : List (String × Bool) := [
  ("retained_models_are_admitted_and_routed_concurrent", retained_models_are_admitted_and_routed_concurrent),
  ("start_names_follow_availability", start_names_follow_availability),
  ("start_requires_the_structured_business_object", start_requires_the_structured_business_object),
  ("merge_region_is_refused", merge_region_is_refused),
  ("overlay_free_model_is_refused", overlay_free_model_is_refused),
  ("third_call_is_refused", third_call_is_refused),
  ("service_task_beside_a_call_is_refused", service_task_beside_a_call_is_refused),
  ("call_leading_a_branch_body_is_refused", call_leading_a_branch_body_is_refused),
  ("call_in_a_forking_body_is_refused", call_in_a_forking_body_is_refused)
]

end BpmnSemantics.ConcurrentStructuredScopeDataConformance
