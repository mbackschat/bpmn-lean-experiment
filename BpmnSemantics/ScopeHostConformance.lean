module

public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.InternalCommutationCensus
import BpmnSemantics.SemanticProcess.InternalCommutationCore

/-! # Scope host conformance

Finite witnesses of the [scope host specification](../docs/capsules/SCOPE-HOST-FLOW-LISTS-SPEC.md#separating-witnesses).

The host Program rules (SCPH-HOST-01) admit a host of two or more sorted distinct entries, a `process` host without an
input and a `subProcess` host with one, and an exit of two or more sorted distinct outputs, so neither doubles a legacy
encoding; neither takes an arming input.

The onboarding graph transcribes the retained `scenarios/scope-host-split` model with its flow ids, so its lowered hosts
and exit carry the places the TypeScript lowering gives them; its Start names are the TypeScript analysis's values for
the same graph. Each refused graph differs from an admitted control in the fact its name states. The module runs no
command: each split step is a Lean execution of the registered scenarios in the pipeline. It imports admission owners
only, as `ActivityHostConformance` does, so it stays outside the step owner's import cone (`lean-fanout`).
-/

public section

namespace BpmnSemantics.ScopeHostConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def processName : String := "Process_EmployeeOnboarding"
private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
private def placeId (name : String) : ControlPlaceId := ⟨"place:" ++ name⟩
private def output (name : String) : ActivityOutput := { place := placeId name }

/-! ## Host Program rules -/

private def places : List ControlPlace :=
  ["Flow_A", "Flow_B", "Flow_In"].map fun name => { id := placeId name, origin := { elementId := ⟨name⟩ } }

private def hostProgram (operation : SemanticOperation) : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := nestedScopeDataProfileId
        sourceId := ⟨"scope-host-conformance"⟩
        sourceSha256 := "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨processName⟩
    definitionScopes := [{ id := scope processName, parentScopeId := none, originElementId := ⟨processName⟩ },
      { id := scope "IssueEquipment", parentScopeId := some (scope processName), originElementId := ⟨"IssueEquipment"⟩ }]
    operationScopes := []
    controlPlaceScopes := []
    controlPlaces := places
    operations := [operation] }

private def host (inputs entries : List String) (work : ScopeWork) : SemanticOperation :=
  .scope { id := ⟨"op:Host"⟩, origin := { elementId := ⟨"Host"⟩ }, inputs := inputs.map placeId,
           entries := entries.map output, work }

private def exit (outputs : List String) : SemanticOperation :=
  .scopeExit { id := ⟨"op:Exit"⟩, origin := { elementId := ⟨"IssueEquipment"⟩ }, scopeId := scope "IssueEquipment",
               outputs := outputs.map output }

private def valid (operation : SemanticOperation) : Bool :=
  operationWellFormed (hostProgram operation) places operation

/-- SCPH-HOST-01: a `process` host over two sorted entries, a `subProcess` host entering its child from one input and an
exit over two sorted outputs. -/
private def splitting_hosts_are_admitted : Bool :=
  valid (host [] ["Flow_A", "Flow_B"] .process) &&
    valid (host ["Flow_In"] ["Flow_A", "Flow_B"] (.subProcess (scope "IssueEquipment"))) && valid (exit ["Flow_A", "Flow_B"])

/-- SCPH-HOST-01: one entry or output would double the legacy encoding; unsorted lists, a `process` host with an input
and a `subProcess` host with two inputs are no host of this family. -/
private def other_hosts_are_refused : Bool :=
  !valid (host [] ["Flow_A"] .process) && !valid (host [] ["Flow_B", "Flow_A"] .process) &&
    !valid (host ["Flow_In"] ["Flow_A", "Flow_B"] .process) &&
    !valid (host ["Flow_A", "Flow_In"] ["Flow_B", "Flow_In"] (.subProcess (scope "IssueEquipment"))) &&
    !valid (exit ["Flow_A"]) && !valid (exit ["Flow_B", "Flow_A"])

/-- SCPH-HOST-01: neither a host nor an exit takes an arming input, and each sits in its legacy operation's family. -/
private def hosts_are_never_batched : Bool :=
  let process := host [] ["Flow_A", "Flow_B"] .process
  let entry := host ["Flow_In"] ["Flow_A", "Flow_B"] (.subProcess (scope "IssueEquipment"))
  [process, entry, exit ["Flow_A", "Flow_B"]].all (internalArmInput? · |>.isNone) &&
    semanticOperationInternalFamily process == .processInitiation &&
    semanticOperationInternalFamily entry == .scopeCreationAndCallInvocation &&
    semanticOperationInternalFamily (exit ["Flow_A", "Flow_B"]) == .scopeReturnCompletionAndInterruption

/-! ## The employee onboarding model -/

private def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"

private structure Edge where
  id : String
  source : String
  target : String

/-- A node of the root scope or, with `inChild`, of *Issue equipment*'s body. -/
private structure Member where
  node : CheckedNode
  inChild : Bool := false

private def root (node : CheckedNode) : Member := { node }
private def body (node : CheckedNode) : Member := { node, inChild := true }
private def user (id : String) : CheckedNode := .userTask ⟨id⟩ none none

/-- A two-scope checked graph of `profile` over members and edges sorted into the canonical id order, with a source
overlay; an edge lies in its source's scope. -/
private def build (members : List Member) (edges : List Edge) (profile : ProfileId := nestedScopeDataProfileId) :
    CheckedProcess :=
  let members := members.mergeSort fun left right => decide (left.node.id.value ≤ right.node.id.value)
  let edges := edges.mergeSort fun left right => decide (left.id ≤ right.id)
  let scopeOf := fun (id : String) =>
    if (members.find? (·.node.id.value == id)).any (·.inChild) then scope "IssueEquipment" else scope processName
  { identity :=
      { semanticProfile := profile, sourceId := ⟨"employee-onboarding"⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000d"
        sourceOverlay := some { id := ⟨"employee-onboarding-handlers"⟩
                                sha256 := "000000000000000000000000000000000000000000000000000000000000000e" } }
    processId := ⟨processName⟩
    definitionScopes := [{ id := scope "IssueEquipment", parentScopeId := some (scope processName),
                           originElementId := ⟨"IssueEquipment"⟩ },
                         { id := scope processName, parentScopeId := none, originElementId := ⟨processName⟩ }]
    nodeScopes := members.map fun member => { nodeId := member.node.id, scopeId := scopeOf member.node.id.value }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := ⟨edge.id⟩, scopeId := scopeOf edge.source }
    nodes := members.map (·.node)
    sequenceFlows := edges.map fun edge =>
      { id := ⟨edge.id⟩, sourceId := ⟨edge.source⟩, targetId := ⟨edge.target⟩, condition := none } }

/-- *Issue equipment*'s body: its Start opens *Issue badge* and *Issue laptop*, joined before the End; serial, it runs
them one after the other. -/
private def equipmentBody (splits : Bool) : List Member × List Edge :=
  ([body (.noneStartEvent ⟨"EquipmentRequested"⟩), body (user "IssueBadge"), body (user "IssueLaptop"),
    body (.noneEndEvent ⟨"EquipmentIssued"⟩)] ++
      (if splits then [body (.parallelGateway ⟨"EquipmentReady"⟩ .converging)] else []),
   if splits then
     [⟨"Flow_ToBadge", "EquipmentRequested", "IssueBadge"⟩, ⟨"Flow_ToLaptop", "EquipmentRequested", "IssueLaptop"⟩,
      ⟨"Flow_BadgeIssued", "IssueBadge", "EquipmentReady"⟩, ⟨"Flow_LaptopIssued", "IssueLaptop", "EquipmentReady"⟩,
      ⟨"Flow_EquipmentReady", "EquipmentReady", "EquipmentIssued"⟩]
   else
     [⟨"Flow_ToBadge", "EquipmentRequested", "IssueBadge"⟩, ⟨"Flow_BadgeIssued", "IssueBadge", "IssueLaptop"⟩,
      ⟨"Flow_LaptopIssued", "IssueLaptop", "EquipmentIssued"⟩])

private def rootMembers : List Member :=
  [root (.noneStartEvent ⟨"HireConfirmed"⟩),
   root (.serviceTask ⟨"RegisterHire"⟩ { protocol := activityProtocol, operation := "registerHire" }
     [{ target := "hire", expression := .enclosingVariable "hireSummary" }]
     [{ target := "employeeNumber", expression := .localVariable "employeeNumber" }] none),
   root (user "PrepareWorkstation"), root (.parallelGateway ⟨"StartPrepared"⟩ .converging),
   root (.embeddedSubProcess ⟨"IssueEquipment"⟩ (scope "IssueEquipment")), root (user "ConfirmItAccess"),
   root (.noneEndEvent ⟨"AccessConfirmed"⟩)]

/-- The retained model: the root Start splits, *Issue equipment*'s body Start splits, and *Issue equipment* splits into
*Confirm IT access* and the terminal *Notify facilities*. -/
private def onboardingWith (profile : ProfileId := nestedScopeDataProfileId) : CheckedProcess :=
  let (bodyMembers, bodyEdges) := equipmentBody true
  build (rootMembers ++ [root (.noneEndEvent ⟨"NotifyFacilities"⟩)] ++ bodyMembers)
    ([⟨"Flow_ToRegister", "HireConfirmed", "RegisterHire"⟩, ⟨"Flow_ToWorkstation", "HireConfirmed", "PrepareWorkstation"⟩,
      ⟨"Flow_Registered", "RegisterHire", "StartPrepared"⟩, ⟨"Flow_WorkstationPrepared", "PrepareWorkstation", "StartPrepared"⟩,
      ⟨"Flow_ToEquipment", "StartPrepared", "IssueEquipment"⟩, ⟨"Flow_ToItAccess", "IssueEquipment", "ConfirmItAccess"⟩,
      ⟨"Flow_ToFacilities", "IssueEquipment", "NotifyFacilities"⟩,
      ⟨"Flow_ItAccessConfirmed", "ConfirmItAccess", "AccessConfirmed"⟩] ++ bodyEdges) profile

private def onboarding : CheckedProcess := onboardingWith

/-- *Issue equipment* on the branch of the root split that *Prepare workstation* held. With `exitSplits` its two flows,
or with `explicitFork` a Parallel fork after it, reach *Confirm IT access* and *Notify facilities*, rejoined on the
branch. -/
private def equipmentOnBranch (bodySplits exitSplits : Bool) (explicitFork : Bool := false) : CheckedProcess :=
  let (bodyMembers, bodyEdges) := equipmentBody bodySplits
  let exit : List Member × List Edge :=
    if !exitSplits then ([], [⟨"Flow_ToItAccess", "IssueEquipment", "ConfirmItAccess"⟩,
      ⟨"Flow_ItAccessConfirmed", "ConfirmItAccess", "StartPrepared"⟩])
    else
      let head : List Member × List Edge := if explicitFork
        then ([root (.parallelGateway ⟨"EquipmentFork"⟩ .diverging)],
          [⟨"Flow_ToFork", "IssueEquipment", "EquipmentFork"⟩, ⟨"Flow_ToItAccess", "EquipmentFork", "ConfirmItAccess"⟩,
           ⟨"Flow_ToFacilities", "EquipmentFork", "NotifyFacilities"⟩])
        else ([], [⟨"Flow_ToItAccess", "IssueEquipment", "ConfirmItAccess"⟩,
          ⟨"Flow_ToFacilities", "IssueEquipment", "NotifyFacilities"⟩])
      (head.1 ++ [root (user "NotifyFacilities"), root (.parallelGateway ⟨"EquipmentDone"⟩ .converging)],
       head.2 ++ [⟨"Flow_ItAccessConfirmed", "ConfirmItAccess", "EquipmentDone"⟩,
         ⟨"Flow_FacilitiesNotified", "NotifyFacilities", "EquipmentDone"⟩, ⟨"Flow_EquipmentDone", "EquipmentDone", "StartPrepared"⟩])
  build (rootMembers ++ exit.1 ++ bodyMembers)
    ([⟨"Flow_ToRegister", "HireConfirmed", "RegisterHire"⟩, ⟨"Flow_ToEquipment", "HireConfirmed", "IssueEquipment"⟩,
      ⟨"Flow_Registered", "RegisterHire", "StartPrepared"⟩, ⟨"Flow_ToWorkstation", "StartPrepared", "PrepareWorkstation"⟩,
      ⟨"Flow_WorkstationPrepared", "PrepareWorkstation", "AccessConfirmed"⟩] ++ exit.2 ++ bodyEdges)

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- The places of `element`'s scope host, with its work. -/
private def hostOf (program : Program) (element : String) : Option (List String × ScopeWork) :=
  match program.operations.filter fun | .scope host => host.origin.elementId.value == element | _ => false with
  | [.scope host] => some (host.entries.map (·.place.value), host.work)
  | _ => none

private def exitOutputs (program : Program) : Option (List String) :=
  match program.operations.filter fun | .scopeExit _ => true | _ => false with
  | [.scopeExit exit] => some (exit.outputs.map (·.place.value))
  | _ => none

/-- SCPH-ADMIT-01, SCPH-START-01, SCPH-EXIT-01: the model is admitted at both levels and routed to the concurrent
account at each; the root Start lowers to a `process` host, *Issue equipment* to a `subProcess` host over its body
Start's flows and its completion to an exit over its own, each list in canonical order, and the body Start lowers to
nothing of its own. The lowered Program holds no `duplicate`, so its routing reads the hosts (wrong algorithm 10). -/
private def onboarding_is_admitted_with_hosts_and_an_exit : Bool :=
  let program := lowerCheckedProcess onboarding
  admitted onboarding && StructuredScopeData.checkedRouted onboarding && StructuredScopeData.programRouted program &&
    StructuredScopeData.concurrentProgram program &&
    !program.operations.any (fun | .duplicate .. => true | _ => false) &&
    hostOf program "HireConfirmed" == some (["place:Flow_ToRegister", "place:Flow_ToWorkstation"], .process) &&
    hostOf program "IssueEquipment" ==
      some (["place:Flow_ToBadge", "place:Flow_ToLaptop"], .subProcess (scope "IssueEquipment")) &&
    exitOutputs program == some ["place:Flow_ToFacilities", "place:Flow_ToItAccess"] &&
    !program.operations.any (·.origin.elementId.value == "EquipmentRequested")

/-- CSD-AVAILABLE-01 agrees at both levels: the hire summary is the one Start name. -/
private def start_names_agree : Bool :=
  NestedScopeControl.checkedStartNames onboarding == some ["hireSummary"] &&
    NestedScopeControl.programStartNames (lowerCheckedProcess onboarding) == some ["hireSummary"]

/-- SCPH-SINGLE-01 (wrong algorithm 5): a body split or a Sub-Process split on a branch of the root split is refused at
both levels, while its serial and explicit-fork twins are admitted. -/
private def splits_inside_fork_regions_are_refused : Bool :=
  let bodySplit := equipmentOnBranch true false
  let exitSplit := equipmentOnBranch false true
  admitted (equipmentOnBranch false false) && admitted (equipmentOnBranch false true true) &&
    !admitted bodySplit && !admitted exitSplit &&
    !StructuredScopeData.programRouted (lowerCheckedProcess bodySplit) &&
    !StructuredScopeData.programRouted (lowerCheckedProcess exitSplit)

/-- SCPH-PROFILE-01: under the embedded completion profile the model is refused. -/
private def other_profiles_refuse_the_splits : Bool :=
  !admitted (onboardingWith (profile := ⟨embeddedCompletionProfile⟩))

/-- SCPH-PROFILE-01's checked-level control (wrong algorithm 2): the Start and Sub-Process arms admit two or more
outgoing flows exactly when both `mixed` and `variableMerge` hold, and one flow under every flag. -/
private def arity_holds_for_the_nested_profile_alone : Bool :=
  let arity (source : CheckedProcess) (id : String) (mixed variableMerge : Bool) : Bool :=
    (source.nodes.find? (·.id.value == id)).any
      (checkedNodeArityValid true false mixed false variableMerge [] source.sequenceFlows)
  let serial := equipmentOnBranch false false
  [false, true].all fun mixed => [false, true].all fun variableMerge =>
    ["HireConfirmed", "EquipmentRequested", "IssueEquipment"].all
      (arity onboarding · mixed variableMerge == (mixed && variableMerge)) &&
      arity serial "EquipmentRequested" mixed variableMerge && arity serial "IssueEquipment" mixed variableMerge

/-! ## Splits beside a root Call or Choice -/

private def flowOf (source target : String) : SequenceFlowId := ⟨source ++ ">" ++ target⟩

/-- A checked graph of the nested scope-data profile over `(scope, parent)` pairs, `(owner, node)` members and edges,
each sorted into the canonical id order, an edge lying in its source's scope; `conditions` key Simple Boolean tests by
edge. -/
private def graph (scopes : List (String × Option String)) (members : List (String × CheckedNode))
    (edges : List (String × String)) (conditions : List ((String × String) × CheckedCondition) := []) : CheckedProcess :=
  let key := fun (edge : String × String) => (flowOf edge.1 edge.2).value
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.id.value ≤ right.2.id.value)
  let edges := edges.mergeSort fun left right => decide (key left ≤ key right)
  let owner := fun (id : String) => ((members.find? (·.2.id.value == id)).map (·.1)).getD ""
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"scope-host-beside"⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000f"
        sourceOverlay := some { id := ⟨"scope-host-beside-handlers"⟩
                                sha256 := "0000000000000000000000000000000000000000000000000000000000000010" } }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, node) => { nodeId := node.id, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := flowOf edge.1 edge.2, scopeId := scope (owner edge.1) }
    nodes := members.map (·.2)
    sequenceFlows := edges.map fun edge =>
      { id := flowOf edge.1 edge.2, sourceId := ⟨edge.1⟩, targetId := ⟨edge.2⟩,
        condition := (conditions.find? (·.1 == edge)).map (·.2) } }

/-- One more flow from `node` of `owner`'s scope to a fresh End there. -/
private def aside (owner node : String) : List (String × CheckedNode) × List (String × String) :=
  ([(owner, .noneEndEvent ⟨"Aside"⟩)], [(node, "Aside")])

/-- A mapped Call of *Q*, copying the hire summary in and the verdict back. -/
private def call : CheckedNode :=
  .callActivity ⟨"C"⟩ ⟨"Q"⟩ (.variableMappings [{ target := "summary", expression := .enclosingVariable "hireSummary" }]
    [{ target := "verdict", expression := .localVariable "verdict" }])

/-- *P* enters a Sub-Process *B* of one task, then calls *Q*, a Process of one task; `extra` adds members and edges. -/
private def callModel (extra : List (String × CheckedNode) × List (String × String) := ([], [])) : CheckedProcess :=
  graph [("P", none), ("B", some "P"), ("Q", none)]
    ([("P", .noneStartEvent ⟨"S"⟩), ("P", .embeddedSubProcess ⟨"B"⟩ (scope "B")), ("P", call), ("P", .noneEndEvent ⟨"E"⟩),
      ("B", .noneStartEvent ⟨"BS"⟩), ("B", user "BT"), ("B", .noneEndEvent ⟨"BE"⟩),
      ("Q", .noneStartEvent ⟨"QS"⟩), ("Q", user "QT"), ("Q", .noneEndEvent ⟨"QE"⟩)] ++ extra.1)
    ([("S", "B"), ("B", "C"), ("C", "E"), ("BS", "BT"), ("BT", "BE"), ("QS", "QT"), ("QT", "QE")] ++ extra.2)

/-- *P* chooses *T1* when `kind` is `a`, else *T2*, which meet at a merge before the End; `extra` as above. -/
private def choiceModel (extra : List (String × CheckedNode) × List (String × String) := ([], [])) : CheckedProcess :=
  graph [("P", none)]
    ([("P", .noneStartEvent ⟨"S"⟩), ("P", .exclusiveGateway ⟨"G"⟩ [flowOf "G" "T1"] (flowOf "G" "T2")),
      ("P", user "T1"), ("P", user "T2"), ("P", .exclusiveMerge ⟨"M"⟩), ("P", .noneEndEvent ⟨"E"⟩)] ++ extra.1)
    ([("S", "G"), ("G", "T1"), ("G", "T2"), ("T1", "M"), ("T2", "M"), ("M", "E")] ++ extra.2)
    [(("G", "T1"), { language := "urn:bpmn-lean:expression:simple-boolean:v1", body := "stringEquals(kind,\"a\")" })]

/-- SCPH-ADMIT-01 routing (wrong algorithm 10): a root Start split or a root Sub-Process split beside a root Call, and
a root Start split beside a root Choice, are refused by the checked graph and by the lowered Program alone, where the
host or exit is the only split; each unedited control is admitted at both levels. -/
private def splits_beside_a_root_call_or_choice_are_refused : Bool :=
  let routed := fun (source : CheckedProcess) => StructuredScopeData.programRouted (lowerCheckedProcess source)
  admitted callModel && routed callModel && admitted choiceModel && routed choiceModel &&
    [callModel (aside "P" "S"), callModel (aside "P" "B"), choiceModel (aside "P" "S")].all
      fun source => !admitted source && !routed source

/-- SCPH-ADMIT-01: a splitting Call and a splitting called-Process Start are refused, and a Call keeps one incoming and
one outgoing flow under every flag, so no merging or splitting Call is admitted. -/
private def calls_never_split_or_merge : Bool :=
  let flows := fun (edges : List (String × String)) => edges.map fun (source, target) =>
    ({ id := flowOf source target, sourceId := ⟨source⟩, targetId := ⟨target⟩, condition := none } : CheckedSequenceFlow)
  !admitted (callModel (aside "P" "C")) && !admitted (callModel (aside "Q" "QS")) &&
    [false, true].all fun mixed => [false, true].all fun variableMerge =>
      let arity := fun edges => checkedNodeArityValid true false mixed false variableMerge [] (flows edges) call
      arity [("A", "C"), ("C", "D")] && !arity [("A", "C"), ("B", "C"), ("C", "D")] &&
        !arity [("A", "C"), ("C", "D"), ("C", "F")]

/-- Every executable check of this module, named for the driver's failure report. -/
def scopeHostConformanceChecks : List (String × Bool) := [
  ("splitting_hosts_are_admitted", splitting_hosts_are_admitted),
  ("other_hosts_are_refused", other_hosts_are_refused),
  ("hosts_are_never_batched", hosts_are_never_batched),
  ("onboarding_is_admitted_with_hosts_and_an_exit", onboarding_is_admitted_with_hosts_and_an_exit),
  ("start_names_agree", start_names_agree),
  ("splits_inside_fork_regions_are_refused", splits_inside_fork_regions_are_refused),
  ("other_profiles_refuse_the_splits", other_profiles_refuse_the_splits),
  ("arity_holds_for_the_nested_profile_alone", arity_holds_for_the_nested_profile_alone),
  ("splits_beside_a_root_call_or_choice_are_refused", splits_beside_a_root_call_or_choice_are_refused),
  ("calls_never_split_or_merge", calls_never_split_or_merge)
]

end BpmnSemantics.ScopeHostConformance
