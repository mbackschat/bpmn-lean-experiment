module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.NestedScopeControlAdmission
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission
import BpmnSemantics.SemanticProcessJson.CheckedProcess

/-! # Pass-through Task conformance

Finite admission witnesses of PTT-ADMIT-01, PTT-KIND-01, PTT-PASS-01, PTT-BURST-01 and the amended SRE-ROUTE-01
under the nested scope-data profile. The equipment return and document intake graphs transcribe the retained `scenarios/pass-through-task`
models; their routes, Start names and bursts are the TypeScript analysis's values for the same graphs, and each refused
graph differs from an admitted one in the fact its name states. The module runs no command: the Tasks' instantaneous
occurrences are Lean executions of the registered scenarios in the pipeline. It imports admission owners only, as
`ScopeReentryConformance` does, so it stays outside `CommandAdmission`'s hidden-edit cone (`lean-fanout`). See the
[pass-through Task specification](../docs/capsules/PASS-THROUGH-TASK-SPEC.md).
-/

public section

namespace BpmnSemantics.PassThroughTaskConformance

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
private def pass (owner id : String) (taskNotation : TaskNotation) := node owner (.nonOperationalTask ⟨id⟩ taskNotation)
private def gateway (owner id : String) (direction : GatewayDirection) := node owner (.parallelGateway ⟨id⟩ direction)
private def service (owner id operation : String) :=
  node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation } [] [] none)

/-- A Choice whose conditional candidates go to `conditioned`, in declaration order, and whose default goes to
`fallback`. -/
private def choice (owner id : String) (conditioned : List String) (fallback : String) :=
  node owner (.exclusiveGateway ⟨id⟩ (conditioned.map (flowId id ·)) (flowId id fallback))

/-- A Simple Boolean v1 test that the Process binding `name` equals `value`. -/
private def equals (name value : String) : CheckedCondition :=
  { language := simpleBoolean, body := "stringEquals(" ++ name ++ ",\"" ++ value ++ "\")" }

private def overlay : SourceOverlayIdentity :=
  { id := ⟨"pass-through-task-handlers"⟩, sha256 := "0000000000000000000000000000000000000000000000000000000000000009" }

private def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
private def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

/-- A checked graph of the nested scope-data profile over scopes, members and edges sorted into the canonical id
order, with its scope locals, a source overlay and the conditions keyed by their edges. -/
private def build (records : List ScopeLocalData) (scopes : List (String × Option String))
    (members : List (String × String × CheckedNode)) (edges : List (String × String))
    (conditions : List ((String × String) × CheckedCondition)) : CheckedProcess :=
  let id := fun (edge : String × String) => (flowId edge.1 edge.2).value
  let scopes := scopes.mergeSort fun left right => decide (left.1 ≤ right.1)
  let members := members.mergeSort fun left right => decide (left.2.1 ≤ right.2.1)
  let edges := edges.mergeSort fun left right => decide (id left ≤ id right)
  let owner := fun (node : String) => ((members.find? (·.2.1 == node)).map (·.1)).getD ""
  { identity :=
      { semanticProfile := nestedScopeDataProfileId, sourceId := ⟨"pass-through-task"⟩
        sourceSha256 := "000000000000000000000000000000000000000000000000000000000000000a"
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

/-- `count` plain Tasks of `owner` replacing the edge `from → to`: the members and the edges through them. -/
private def chained (owner source target : String) (count : Nat) :
    List (String × String × CheckedNode) × List (String × String) :=
  let ids := (List.range count).map fun n => "Chained" ++ toString (n + 1)
  let steps := source :: ids ++ [target]
  (ids.map (pass owner · .abstractTask), steps.zip steps.tail)

/-- Equipment return: root `P` schedules the pickup, inspects the returned equipment in a Sub-Process whose body
unpacks it by hand and records its condition, refunds the deposit and closes the return ticket. `chain` inserts that
many plain Tasks between the refund and the ticket. `branched` puts *Unpack
equipment* and *Record condition* on the two branches of a Parallel fork in the body; `asUserTasks` turns both Tasks
into User Tasks, the control that leaves the Tasks as the only difference. -/
private def equipmentWith (chain : Nat := 0) (branched asUserTasks : Bool := false) : CheckedProcess :=
  let (links, linkEdges) := chained "P" "RefundDeposit" "CloseReturnTicket" chain
  let passOr := fun (owner id : String) (taskNotation : TaskNotation) =>
    if asUserTasks then task owner id else pass owner id taskNotation
  let body := if branched
    then [ ("InspectionOpened", "Fork"), ("Fork", "UnpackEquipment"), ("Fork", "RecordCondition")
         , ("UnpackEquipment", "Join"), ("RecordCondition", "Join"), ("Join", "InspectionClosed") ]
    else [ ("InspectionOpened", "UnpackEquipment"), ("UnpackEquipment", "RecordCondition")
         , ("RecordCondition", "InspectionClosed") ]
  build [] [("P", none), ("InspectReturnedEquipment", some "P")]
    ([ start "P" "ReturnRequested", task "P" "SchedulePickup", sub "P" "InspectReturnedEquipment"
     , service "P" "RefundDeposit" "refundDeposit", passOr "P" "CloseReturnTicket" .abstractTask
     , finish "P" "ReturnClosed"
     , start "InspectReturnedEquipment" "InspectionOpened", passOr "InspectReturnedEquipment" "UnpackEquipment" .manualTask
     , task "InspectReturnedEquipment" "RecordCondition", finish "InspectReturnedEquipment" "InspectionClosed" ]
      ++ (if branched then [ gateway "InspectReturnedEquipment" "Fork" .diverging
                           , gateway "InspectReturnedEquipment" "Join" .converging ] else [])
      ++ links)
    ([ ("ReturnRequested", "SchedulePickup"), ("SchedulePickup", "InspectReturnedEquipment")
     , ("InspectReturnedEquipment", "RefundDeposit"), ("CloseReturnTicket", "ReturnClosed") ]
      ++ body ++ linkEdges)
    []

/-- Document intake: root `P` merges into the *Classify document* Sub-Process, whose body records the format in its
own `format`, copied out to `documentFormat`, and chooses by it: paper is archived in a Sub-Process whose body files
the original by hand and indexes its location, illegible phones the sender and re-enters the Merge, and the default
registers the digital copy; both filings merge before the End. `chain` inserts that many plain Tasks between the
registration and the filing Merge; `conditioned` puts a condition on *Register digital copy*'s outgoing flow.
`split` gives *Register digital copy* a second outgoing flow into the Merge *Intake requested*, which takes any number
of inputs. `recontact` drops the Merge *Intake requested*, so the received document goes straight to classification, and sends
*Phone sender* to the given node instead. -/
private def intakeWith (chain : Nat := 0) (conditioned split : Bool := false) (recontact : Option String := none) :
    CheckedProcess :=
  let (links, linkEdges) := chained "P" "RegisterDigitalCopy" "Filed" chain
  build [{ scopeId := scope "ClassifyDocument", localInputs := [literal "format" "unclassified"],
           localOutputs := [copied "documentFormat" "format"] }]
    [("P", none), ("ClassifyDocument", some "P"), ("ArchivePaperOriginal", some "P")]
    ([ start "P" "DocumentReceived", sub "P" "ClassifyDocument"
     , choice "P" "DocumentFormat" ["ArchivePaperOriginal", "PhoneSender"] "RegisterDigitalCopy"
     , sub "P" "ArchivePaperOriginal", pass "P" "PhoneSender" .manualTask, pass "P" "RegisterDigitalCopy" .abstractTask
     , merge "P" "Filed", finish "P" "DocumentFiled"
     , start "ClassifyDocument" "ClassificationOpened", task "ClassifyDocument" "RecordDocumentFormat"
     , finish "ClassifyDocument" "ClassificationClosed"
     , start "ArchivePaperOriginal" "ArchivingOpened", pass "ArchivePaperOriginal" "FilePaperOriginal" .manualTask
     , service "ArchivePaperOriginal" "IndexArchiveLocation" "indexArchiveLocation"
     , finish "ArchivePaperOriginal" "ArchivingClosed" ] ++ links
      ++ (if recontact.isNone then [merge "P" "IntakeRequested"] else []))
    ((match recontact with
      | none => [ ("DocumentReceived", "IntakeRequested"), ("IntakeRequested", "ClassifyDocument")
                , ("PhoneSender", "IntakeRequested") ]
      | some target => [("DocumentReceived", "ClassifyDocument"), ("PhoneSender", target)]) ++
     [ ("ClassifyDocument", "DocumentFormat"), ("DocumentFormat", "ArchivePaperOriginal")
     , ("DocumentFormat", "PhoneSender"), ("DocumentFormat", "RegisterDigitalCopy")
     , ("ArchivePaperOriginal", "Filed"), ("Filed", "DocumentFiled")
     , ("ArchivingOpened", "FilePaperOriginal"), ("FilePaperOriginal", "IndexArchiveLocation")
     , ("IndexArchiveLocation", "ArchivingClosed"), ("ClassificationOpened", "RecordDocumentFormat")
     , ("RecordDocumentFormat", "ClassificationClosed") ]
      ++ (if chain = 0 then [("RegisterDigitalCopy", "Filed")] else linkEdges)
      ++ (if split then [("RegisterDigitalCopy", "IntakeRequested")] else []))
    ([(("DocumentFormat", "ArchivePaperOriginal"), equals "documentFormat" "paper"),
      (("DocumentFormat", "PhoneSender"), equals "documentFormat" "illegible")]
      ++ (if conditioned then [(("RegisterDigitalCopy", "Filed"), equals "documentFormat" "digital")] else []))

private def equipment : CheckedProcess := equipmentWith
private def intake : CheckedProcess := intakeWith

/-- Both checks, the lowered Program's capability catalog and the binding between the two. -/
private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

/-- The lowered operation of Task `id` is a one-input merge whose origin is the Task. -/
private def lowersToOneInputMerge (source : CheckedProcess) (id : String) : Bool :=
  (lowerCheckedProcess source).operations.any fun
    | .mergeExclusive operation origin [_] _ => operation == nodeOperationId ⟨id⟩ && origin.elementId.value == id
    | _ => false

/-- PTT-ADMIT-01: both retained graphs are admitted at both analysis levels. -/
private def retained_models_are_admitted : Bool :=
  admitted equipment && admitted intake &&
    StructuredScopeData.checkedRouted equipment && StructuredScopeData.programRouted (lowerCheckedProcess equipment) &&
    StructuredScopeData.checkedRouted intake && StructuredScopeData.programRouted (lowerCheckedProcess intake)

/-- PTT-PASS-01: each Task, in a body or at the root and of either notation, lowers to a one-input merge. -/
private def tasks_lower_to_one_input_merges : Bool :=
  ["UnpackEquipment", "CloseReturnTicket"].all (lowersToOneInputMerge equipment) &&
    ["FilePaperOriginal", "PhoneSender", "RegisterDigitalCopy"].all (lowersToOneInputMerge intake)

/-- The amended SRE-ROUTE-01: one-input merges keep the equipment return on the serial route at both levels, while
the intake's Choice and two-input Merges route it to the re-entry account. -/
private def one_input_merges_keep_the_serial_route : Bool :=
  !ScopeReentry.programReentry (lowerCheckedProcess equipment) && !ScopeReentry.checkedReentry equipment &&
    ScopeReentry.programReentry (lowerCheckedProcess intake) && ScopeReentry.checkedReentry intake

/-- SRE-AVAILABLE-01 and PTT-BURST-01 on the re-entry route: the intake requires no Start name and its longest
burst, the classification closed, a digital copy registered, filed and ended, is seven steps at both levels. -/
private def intake_requires_nothing_and_bursts_seven : Bool := decide <|
  (ScopeReentry.checkedAnalysis intake).map (fun analysis => (analysis.required, analysis.optional)) = some ([], none) ∧
    (ScopeReentry.programAnalysis (lowerCheckedProcess intake)).map
      (fun analysis => (analysis.required, analysis.optional)) = some ([], none) ∧
    ScopeReentry.checkedBurst? intake = some 7 ∧ ScopeReentry.programBurst? (lowerCheckedProcess intake) = some 7

/-- PTT-BURST-01 on the serial route: five chained Tasks after the refund make a burst of exactly eight, admitted;
six make nine, refused at both levels. -/
private def serial_burst_of_eight_is_admitted_and_nine_refused : Bool :=
  let nine := equipmentWith (chain := 6)
  admitted (equipmentWith (chain := 5)) && !admitted nine &&
    !StructuredScopeData.checkedRouted nine && !StructuredScopeData.programRouted (lowerCheckedProcess nine)

/-- PTT-BURST-01 on the re-entry route: one chained Task after the registration makes eight, two make nine. -/
private def reentry_burst_of_eight_is_admitted_and_nine_refused : Bool :=
  ScopeReentry.checkedBurst? (intakeWith (chain := 1)) = some 8 && admitted (intakeWith (chain := 1)) &&
    !admitted (intakeWith (chain := 2))

/-- PTT-ADMIT-01: a Task with a second outgoing flow is refused; its target, a Merge, admits the extra input. -/
private def second_outgoing_flow_is_refused : Bool := !admitted (intakeWith (split := true))

/-- PTT-ADMIT-01: a Task with a second incoming flow is refused, while the same graph sending that flow to the Merge
*Filed* instead is admitted, so the Task's in-degree is the only difference. -/
private def second_incoming_flow_is_refused : Bool :=
  admitted (intakeWith (recontact := some "Filed")) && !admitted (intakeWith (recontact := some "RegisterDigitalCopy"))

/-- PTT-ADMIT-01: a Task whose outgoing flow carries a condition is refused. -/
private def conditioned_outgoing_flow_is_refused : Bool := !admitted (intakeWith (conditioned := true))

/-- PTPB-ADMIT-01 since admits a Task on a joined branch of a forking Program, as it admits the same graph with User
Tasks in their places; the refusal PTT-ADMIT-01 first recorded here is lifted. -/
private def tasks_in_a_forking_program_are_admitted : Bool :=
  admitted (equipmentWith (branched := true) (asUserTasks := true)) && admitted (equipmentWith (branched := true))

/-- The strict decoder's reading of one checked Task node whose notation is `spelling`. -/
private def decodedTask (spelling : String) : Except String CheckedNode :=
  SemanticProcessJson.decodeCheckedNode (Lean.Json.mkObj
    [("id", Lean.Json.str "T"), ("kind", Lean.Json.str "nonOperationalTask"), ("notation", Lean.Json.str spelling)])

/-- PTT-KIND-01: each notation decodes to its own kind, and any other notation is refused. -/
private def notations_decode_to_their_own_kind : Bool :=
  let is := fun (spelling : String) (expected : TaskNotation) => match decodedTask spelling with
    | .ok (.nonOperationalTask id taskNotation) => id.value == "T" && decide (taskNotation = expected)
    | _ => false
  let refused := fun (spelling : String) => match decodedTask spelling with
    | .error _ => true
    | .ok _ => false
  is "abstractTask" .abstractTask && is "manualTask" .manualTask && refused "userTask" && refused "task"

/-- Every executable check of this module, named for the driver's failure report. -/
def passThroughTaskConformanceChecks : List (String × Bool) := [
  ("retained_models_are_admitted", retained_models_are_admitted),
  ("tasks_lower_to_one_input_merges", tasks_lower_to_one_input_merges),
  ("one_input_merges_keep_the_serial_route", one_input_merges_keep_the_serial_route),
  ("intake_requires_nothing_and_bursts_seven", intake_requires_nothing_and_bursts_seven),
  ("serial_burst_of_eight_is_admitted_and_nine_refused", serial_burst_of_eight_is_admitted_and_nine_refused),
  ("reentry_burst_of_eight_is_admitted_and_nine_refused", reentry_burst_of_eight_is_admitted_and_nine_refused),
  ("second_outgoing_flow_is_refused", second_outgoing_flow_is_refused),
  ("second_incoming_flow_is_refused", second_incoming_flow_is_refused),
  ("conditioned_outgoing_flow_is_refused", conditioned_outgoing_flow_is_refused),
  ("tasks_in_a_forking_program_are_admitted", tasks_in_a_forking_program_are_admitted),
  ("notations_decode_to_their_own_kind", notations_decode_to_their_own_kind)
]

end BpmnSemantics.PassThroughTaskConformance
