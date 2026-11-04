module

public import BpmnSemantics.SemanticProcess.LinkContraction
public import BpmnSemantics.NoneIntermediateThrowConformance
import BpmnSemantics.SemanticProcess.ScopeReentryAdmission
import BpmnSemantics.SemanticProcessJson.CheckedProcess
import BpmnSemantics.SemanticProcessJson.DefinitionInput

/-! # Link Event conformance

Finite witnesses of LNK-KIND-01, LNK-PAIR-01, LNK-CONT-01, LNK-ADMIT-01 and LNK-PROFILE-01. Each Link model is its
retained explicit-flow twin from `NoneIntermediateThrowConformance` with three flows interrupted by Link pairs, as the
retained `scenarios/link-events` models are: the interrupted flow keeps its identity into the throw and a new flow leaves
the catch. The oracle is the twin itself, so contraction must return it exactly and lowering must give its Program;
each refused graph differs from an admitted Link model in the fact its name states. The module runs no command: equal
journeys are executions of the registered scenarios in the pipeline. See the
[Link Events proposal](../docs/capsules/LINK-EVENTS-PROPOSAL.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.LinkEventsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.NoneIntermediateThrowConformance (warranty onboarding)

private def sortedById {α : Type} (key : α → String) (values : List α) : List α :=
  values.mergeSort fun left right => decide (key left ≤ key right)

/-- `graph` with the flow `source>target` ending at a new throw of `linkName` and a new flow leaving its catch for
`target`, both Events and the new flow owned by the interrupted flow's scope; `tag` keeps a second pair's ids distinct. -/
private def splice (graph : CheckedProcess) (source target linkName : String) (tag := "") : CheckedProcess :=
  let interrupted : SequenceFlowId := ⟨source ++ ">" ++ target⟩
  let owner := ((graph.sequenceFlowScopes.find? (·.sequenceFlowId == interrupted)).map (·.scopeId)).getD ⟨""⟩
  let throwId : NodeId := ⟨"Throw" ++ linkName ++ tag⟩
  let catchId : NodeId := ⟨"Catch" ++ linkName ++ tag⟩
  let caught : SequenceFlowId := ⟨catchId.value ++ ">" ++ target⟩
  { graph with
    nodes := sortedById (·.id.value) (graph.nodes ++ [.linkThrowEvent throwId linkName, .linkCatchEvent catchId linkName])
    nodeScopes := sortedById (·.nodeId.value)
      (graph.nodeScopes ++ [{ nodeId := throwId, scopeId := owner }, { nodeId := catchId, scopeId := owner }])
    sequenceFlows := sortedById (·.id.value) ((graph.sequenceFlows.map fun flow =>
        if flow.id == interrupted then { flow with targetId := throwId } else flow) ++
      [{ id := caught, sourceId := catchId, targetId := ⟨target⟩ }])
    sequenceFlowScopes := sortedById (·.sequenceFlowId.value)
      (graph.sequenceFlowScopes ++ [{ sequenceFlowId := caught, scopeId := owner }]) }

/-- The warranty repair with Go To links on the rework back-edge, in the *Repair device* body and on the conditioned
candidate *Device released*. -/
private def warrantyLinks : CheckedProcess :=
  splice (splice (splice warranty "ReworkRequested" "RepairRound" "BackToRepair")
    "OrderSparePart" "TestDevice" "ToTesting") "DevicePasses" "DeviceReleased" "ReleaseDevice"

/-- The onboarding milestones with Off-Page links on a Parallel branch, in the *Set up account* body and after the join. -/
private def onboardingLinks : CheckedProcess :=
  splice (splice (splice onboarding "StartOnboarding" "WelcomeSent" "WelcomeTrack")
    "CreateAccount" "AccountReady" "AccountDone") "OnboardingReady" "OnboardingComplete" "AllSet"

private def renamed (graph : CheckedProcess) (id linkName : String) : CheckedProcess :=
  { graph with nodes := graph.nodes.map fun
      | .linkThrowEvent node name => .linkThrowEvent node (if node.value == id then linkName else name)
      | .linkCatchEvent node name => .linkCatchEvent node (if node.value == id then linkName else name)
      | other => other }

/-- LNK-CONT-01: each Link model contracts to exactly its twin, and its linked lowering is the twin's Program. -/
private def models_are_their_twins : Bool :=
  [(warrantyLinks, warranty), (onboardingLinks, onboarding)].all fun (linked, twin) =>
    contractLinks? linked == some twin &&
      linkedCheckedWellFormed linked && lowerLinkedCheckedProcess linked == lowerCheckedProcess twin &&
      linkedDefinitionBindingValid linked (lowerCheckedProcess twin)

/-- LNK-ADMIT-01: the profile's analyses admit each contraction on its twin's route with its twin's burst, while the
raw graph, which a Link-free analysis would read, is refused by checked well-formedness and by both analyses. -/
private def analyses_run_on_the_contraction : Bool :=
  let contractedWarranty := (contractLinks? warrantyLinks).getD warrantyLinks
  let contractedOnboarding := (contractLinks? onboardingLinks).getD onboardingLinks
  ScopeReentry.checkedBurst? contractedWarranty == some 8 &&
    NestedScopeControl.checkedAnalysis contractedOnboarding == some 7 &&
    !checkedWellFormed warrantyLinks && !checkedWellFormed onboardingLinks &&
    ScopeReentry.checkedBurst? warrantyLinks == none && NestedScopeControl.checkedAnalysis onboardingLinks == none

/-- LNK-PAIR-01: the Link name decides the pairing. With the two root throws' names exchanged the rework flow would
continue at *Device released*, so the contraction exists but is no longer the twin. -/
private def pairing_follows_the_link_name : Bool :=
  let exchanged := renamed (renamed warrantyLinks "ThrowBackToRepair" "ReleaseDevice") "ThrowReleaseDevice" "BackToRepair"
  (contractLinks? exchanged).isSome && contractLinks? exchanged != some warranty

/-- LNK-PAIR-01: two throws or two catches of one name, an empty name, a conditioned catch flow, a pair split across
scopes and a catch leading into a throw are each refused. -/
private def excluded_pairings_are_refused : Bool :=
  let conditioned := { warrantyLinks with sequenceFlows := warrantyLinks.sequenceFlows.map fun flow =>
    if flow.id.value == "CatchReleaseDevice>DeviceReleased"
    then { flow with condition := some { language := "urn:bpmn-lean:expression:simple-boolean:v1", body := "true" } }
    else flow }
  let rootScope := ((warrantyLinks.nodeScopes.find? (·.nodeId.value == "ThrowBackToRepair")).map (·.scopeId)).getD ⟨""⟩
  let crossed := { warrantyLinks with
    nodeScopes := warrantyLinks.nodeScopes.map fun entry =>
      if entry.nodeId.value == "CatchToTesting" then { entry with scopeId := rootScope } else entry
    sequenceFlowScopes := warrantyLinks.sequenceFlowScopes.map fun entry =>
      if entry.sequenceFlowId.value == "CatchToTesting>TestDevice" then { entry with scopeId := rootScope } else entry }
  let chained := splice warrantyLinks "CatchBackToRepair" "RepairRound" "Hop"
  [ renamed warrantyLinks "ThrowBackToRepair" "ReleaseDevice", renamed warrantyLinks "CatchBackToRepair" "ReleaseDevice"
  , renamed (renamed warrantyLinks "ThrowBackToRepair" "") "CatchBackToRepair" "", conditioned, crossed, chained
  ].all fun graph => contractLinks? graph == none && !linkedCheckedWellFormed graph

/-- LNK-PAIR-01: a name pairs across the whole executed Process, as CIB deploys it, not per scope: a second complete
pair of the root name *Back to repair* inside the *Repair device* body is refused. A Link model whose entry root is not
the Process it names is refused too, while its Link-free twin relabelled the same way contracts to itself. -/
private def names_pair_across_the_executed_process : Bool :=
  let secondPair := splice warrantyLinks "ReplacePart" "OrderSparePart" "BackToRepair" "InBody"
  let otherRoot (graph : CheckedProcess) : CheckedProcess := { graph with processId := ⟨"Other"⟩ }
  contractLinks? secondPair == none && !linkedCheckedWellFormed secondPair &&
    contractLinks? (otherRoot warrantyLinks) == none && contractLinks? (otherRoot warranty) == some (otherRoot warranty)

/-- LNK-PROFILE-01: under another profile the Link model is refused, while its Link-free twin passes unchanged. -/
private def other_profiles_refuse_links : Bool :=
  let relabel (graph : CheckedProcess) : CheckedProcess :=
    { graph with identity := { graph.identity with semanticProfile := ⟨embeddedCompletionProfile⟩ } }
  contractLinks? (relabel warrantyLinks) == none && contractLinks? (relabel warranty) == some (relabel warranty)

/-- The strict decoder's reading of one checked node with `fields` beside its id. -/
private def decodedNode (fields : List (String × Lean.Json)) : Except String CheckedNode :=
  SemanticProcessJson.decodeCheckedNode (Lean.Json.mkObj ([("id", Lean.Json.str "E")] ++ fields))

/-- LNK-KIND-01: both arms decode with their Link name, and an arm without one or with an empty one is refused. -/
private def arms_decode_with_their_names : Bool :=
  (match decodedNode [("kind", Lean.Json.str "linkThrowEvent"), ("linkName", Lean.Json.str "Next")] with
    | .ok (.linkThrowEvent id name) => id.value == "E" && name == "Next"
    | _ => false) &&
  (match decodedNode [("kind", Lean.Json.str "linkCatchEvent"), ("linkName", Lean.Json.str "Next")] with
    | .ok (.linkCatchEvent id name) => id.value == "E" && name == "Next"
    | _ => false) &&
  (decodedNode [("kind", Lean.Json.str "linkThrowEvent")]).toBool == false &&
  (decodedNode [("kind", Lean.Json.str "linkCatchEvent"), ("linkName", Lean.Json.str "")]).toBool == false

/-- LNK-CONT-01 at the runtime boundary: the definition input keeps the Link graph and is validated against its twin's
Program, which the Link-free lowering of the raw graph would not give. -/
private def definition_input_binds_the_twin_program : Bool :=
  let input (program : Program) : SemanticProcessJson.DefinitionInput :=
    { scenarioId := ⟨"link-events"⟩, checkedProcess := warrantyLinks, semanticProcess := program }
  (SemanticProcessJson.validateDefinitionInput (input (lowerCheckedProcess warranty))).toBool &&
    !(SemanticProcessJson.validateDefinitionInput (input (lowerCheckedProcess warrantyLinks))).toBool

/-- Every executable check of this module, named for the driver's failure report. -/
def linkEventsConformanceChecks : List (String × Bool) := [
  ("models_are_their_twins", models_are_their_twins),
  ("analyses_run_on_the_contraction", analyses_run_on_the_contraction),
  ("pairing_follows_the_link_name", pairing_follows_the_link_name),
  ("excluded_pairings_are_refused", excluded_pairings_are_refused),
  ("names_pair_across_the_executed_process", names_pair_across_the_executed_process),
  ("other_profiles_refuse_links", other_profiles_refuse_links),
  ("arms_decode_with_their_names", arms_decode_with_their_names),
  ("definition_input_binds_the_twin_program", definition_input_binds_the_twin_program)
]

end BpmnSemantics.LinkEventsConformance
