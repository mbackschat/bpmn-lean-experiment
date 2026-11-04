module

import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission

/-! # Exclusive Choice without a default conformance

Finite admission witnesses of `XND-ADMIT-01` under the nested scope-data profile. The ticket triage and expense routing
graphs transcribe the retained `scenarios/exclusive-choice-without-default` models, and each refused graph differs from
an admitted one in the fact its name states. The effect-closure exclusion is the source reader's alone, so it has no
witness here. Like `ExclusiveChoiceArityConformance`, the module runs no command and imports admission owners only:
the no-match outcome is proved in `Execution`, and Lean executes the rolled-back journeys in the
pipeline and the Lean-core differential test. Its graph helpers repeat that module's private ones on purpose: a
shared fixture module would join both modules' rebuild sets for a few one-line definitions. See the
[Exclusive Choice without a default account](../docs/capsules/EXCLUSIVE-CHOICE-WITHOUT-DEFAULT-SPEC.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.ExclusiveChoiceWithoutDefaultConformance

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
private def task (owner id : String) := node owner (.userTask ⟨id⟩ (some id))
private def sub (owner id : String) := node owner (.embeddedSubProcess ⟨id⟩ (scope id))

/-- A Choice without a default whose conditional candidates go to `conditioned`, in declaration order. -/
private def choice (owner id : String) (conditioned : List String) :=
  node owner (.exclusiveGateway ⟨id⟩ (conditioned.map (flowId id ·)) none)

private def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
private def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

private def service (owner id operation : String) (inputs : List VariableMapping) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } inputs [] none)

/-- A Simple Boolean v1 test that the Process binding `name` equals `value`. -/
private def equals (name value : String) : CheckedCondition :=
  { language := simpleBoolean, body := "stringEquals(" ++ name ++ ",\"" ++ value ++ "\")" }

private def overlay (name : String) : SourceOverlayIdentity :=
  { id := ⟨name ++ "-handlers"⟩, sha256 := "000000000000000000000000000000000000000000000000000000000000000e" }

/-- A checked source of the nested scope-data profile from owned members, edges and their conditions. -/
private def graph (name : String) (scopes : List (String × Option String))
    (members : List (String × String × CheckedNode)) (edges : List (String × String))
    (conditions : List ((String × String) × CheckedCondition)) (locals : List ScopeLocalData) : CheckedProcess :=
  let id := fun (edge : String × String) => (flowId edge.1 edge.2).value
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (id left ≤ id right)
  let ownerOf := fun (node : String) => ((members.find? (·.2.1 == node)).map (·.1)).getD ""
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨name⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000d"
        sourceOverlay := some (overlay name) }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, id, _) => { nodeId := ⟨id⟩, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun edge =>
      { sequenceFlowId := flowId edge.1 edge.2, scopeId := scope (ownerOf edge.1) }
    nodes := members.map (·.2.2)
    sequenceFlows := edges.map fun edge =>
      { id := flowId edge.1 edge.2, sourceId := ⟨edge.1⟩, targetId := ⟨edge.2⟩,
        condition := (conditions.find? (·.1 == edge)).map (·.2) }
    scopeLocalData := locals }

/-- Ticket triage: *Triage ticket* assesses `severity` inside *Triage*, whose output copies it to the Process, and
*Route by severity* sends high to *Escalate* and low to *Auto-close*, with no default. -/
private def ticketTriage : CheckedProcess :=
  graph "ticket-triage" [("P", none), ("Triage", some "P")]
    [ start "P" "TicketOpened", sub "P" "Triage", choice "P" "RouteBySeverity" ["Escalate", "AutoClose"]
    , task "P" "Escalate", service "P" "AutoClose" "autoCloseTicket" [enclosing "ticket" "ticket"]
    , merge "P" "TicketHandled", finish "P" "TicketClosed"
    , start "Triage" "TriageOpened", task "Triage" "TriageTicket", finish "Triage" "TriageClosed" ]
    [ ("TicketOpened", "Triage"), ("Triage", "RouteBySeverity"), ("RouteBySeverity", "Escalate")
    , ("RouteBySeverity", "AutoClose"), ("Escalate", "TicketHandled"), ("AutoClose", "TicketHandled")
    , ("TicketHandled", "TicketClosed"), ("TriageOpened", "TriageTicket"), ("TriageTicket", "TriageClosed") ]
    [ (("RouteBySeverity", "Escalate"), equals "severity" "high")
    , (("RouteBySeverity", "AutoClose"), equals "severity" "low") ]
    [ { scopeId := scope "Triage", localInputs := [literal "severity" "unassessed"]
        localOutputs := [copied "severity" "severity"] } ]

/-- Expense routing: *Route expense* sends urgent, travel or equipment claims to their reviews, and *Pay out* sends
bank payouts to *Reimburse claimant* and payroll ones to *Add to payroll*, neither with a default. `payrollRoute`
false leaves *Pay out* with its bank flow alone; `otherRoute` adds an unconditioned non-default flow to *Route expense*. -/
private def expenseRoutingWith (payrollRoute : Bool := true) (otherRoute : Bool := false) : CheckedProcess :=
  let payouts := ["ReimburseClaimant"] ++ (if payrollRoute then ["AddToPayroll"] else [])
  graph "expense-routing" [("P", none)]
    ([ start "P" "ExpenseSubmitted", choice "P" "RouteExpense" ["ReviewUrgently", "ReviewTravel", "ReviewEquipment"]
    , task "P" "ReviewUrgently", task "P" "ReviewTravel", task "P" "ReviewEquipment", merge "P" "ExpenseReviewed"
    , choice "P" "PayOut" payouts, service "P" "ReimburseClaimant" "reimburseClaimant" [enclosing "claimant" "claimant"]
    , merge "P" "ExpensePaid", finish "P" "ExpenseSettled" ] ++
      (if payrollRoute then [task "P" "AddToPayroll"] else []))
    ([ ("ExpenseSubmitted", "RouteExpense"), ("RouteExpense", "ReviewUrgently"), ("RouteExpense", "ReviewTravel")
    , ("RouteExpense", "ReviewEquipment"), ("ReviewUrgently", "ExpenseReviewed"), ("ReviewTravel", "ExpenseReviewed")
    , ("ReviewEquipment", "ExpenseReviewed"), ("ExpenseReviewed", "PayOut"), ("PayOut", "ReimburseClaimant")
    , ("ReimburseClaimant", "ExpensePaid"), ("ExpensePaid", "ExpenseSettled") ] ++
      (if payrollRoute then [("PayOut", "AddToPayroll"), ("AddToPayroll", "ExpensePaid")] else []) ++
      (if otherRoute then [("RouteExpense", "ExpenseReviewed")] else []))
    [ (("RouteExpense", "ReviewUrgently"), equals "priority" "urgent")
    , (("RouteExpense", "ReviewTravel"), equals "category" "travel")
    , (("RouteExpense", "ReviewEquipment"), equals "category" "equipment")
    , (("PayOut", "ReimburseClaimant"), equals "payout" "bank"), (("PayOut", "AddToPayroll"), equals "payout" "payroll") ]
    []

private def expenseRouting : CheckedProcess := expenseRoutingWith

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- Each lowered Choice's origin with its candidate origins, in candidate order, and whether it carries a default. -/
private def programChoices (program : Program) : List (String × List String × Bool) :=
  program.operations.filterMap fun
    | .choose _ origin _ candidates defaultOutput defaultOrigin =>
        some (origin.elementId.value, candidates.map (·.origin.elementId.value),
          defaultOutput.isSome || defaultOrigin.isSome)
    | _ => none

/-- XND-ADMIT-01, XND-ROUTE-01: both models are admitted at both levels and routed to the re-entry account, and every
lowered Choice keeps its declaration order and carries no default. -/
private def both_models_are_admitted_without_a_default : Bool :=
  [ticketTriage, expenseRouting].all (fun source =>
    admitted source && ScopeReentry.checkedReentry source && ScopeReentry.programReentry (lowerCheckedProcess source)) &&
  programChoices (lowerCheckedProcess ticketTriage) ==
    [("RouteBySeverity", ["RouteBySeverity>Escalate", "RouteBySeverity>AutoClose"], false)] &&
  programChoices (lowerCheckedProcess expenseRouting) ==
    [ ("PayOut", ["PayOut>ReimburseClaimant", "PayOut>AddToPayroll"], false)
    , ("RouteExpense", ["RouteExpense>ReviewUrgently", "RouteExpense>ReviewTravel", "RouteExpense>ReviewEquipment"], false) ]

/-- XND-ADMIT-01: a Choice without a default left with one conditional flow, which CIB's parser refuses, and one with an
unconditioned non-default flow are each refused. -/
private def edits_leaving_the_class_are_refused : Bool :=
  !admitted (expenseRoutingWith (payrollRoute := false)) && !admitted (expenseRoutingWith (otherRoute := true))

/-- XND-ADMIT-01 profile control at the checked level: the Choice's own arm admits *Route expense* only with both the
variable-Choice and variable-Merge flags, which hold together for the nested scope-data profile alone; no other node
is consulted. -/
private def checked_choice_follows_the_profile : Bool :=
  let source := expenseRouting
  let route := source.nodes.filter fun | .exclusiveGateway .. => true | _ => false
  let arity := fun (mixed variableMerge : Bool) =>
    route.all (checkedNodeArityValid true false mixed false variableMerge [] source.sequenceFlows)
  route.length == 2 && arity true true && !arity true false && !arity false true

/-- XND-ADMIT-01 profile control at the Program level: the `choose` arm admits both default-less Choices under the
nested profile and refuses them under the mixed-task control-flow profile, whose Choices keep their default; a lone
candidate is refused under every profile. -/
private def program_choice_follows_the_profile : Bool :=
  let program := lowerCheckedProcess expenseRouting
  let under (profile : ProfileId) : Program := { program with identity := { program.identity with semanticProfile := profile } }
  let choices := program.operations.filter fun | .choose .. => true | _ => false
  let lone := choices.map fun
    | .choose id origin input (candidate :: _) defaultOutput defaultOrigin =>
        SemanticOperation.choose id origin input [candidate] defaultOutput defaultOrigin
    | operation => operation
  choices.length == 2 && choices.all (operationWellFormed program program.controlPlaces) &&
    choices.all (!operationWellFormed (under mixedTaskControlFlowProfileId) program.controlPlaces ·) &&
    lone.all (!operationWellFormed program program.controlPlaces ·)

/-- Every executable check of this module, named for the driver's failure report. -/
def exclusiveChoiceWithoutDefaultConformanceChecks : List (String × Bool) := [
  ("both_models_are_admitted_without_a_default", both_models_are_admitted_without_a_default),
  ("edits_leaving_the_class_are_refused", edits_leaving_the_class_are_refused),
  ("checked_choice_follows_the_profile", checked_choice_follows_the_profile),
  ("program_choice_follows_the_profile", program_choice_follows_the_profile)
]

end BpmnSemantics.ExclusiveChoiceWithoutDefaultConformance
