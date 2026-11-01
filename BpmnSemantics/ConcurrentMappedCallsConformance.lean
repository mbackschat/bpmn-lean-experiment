module

public import BpmnSemantics.ConcurrentScopeDataConformance

/-! # Concurrent mapped Calls conformance

Finite checked journeys of the retained supplier onboarding and travel request models under the cumulative
embedded completion profile, transcribing `scenarios/concurrent-mapped-calls`. The supplier's two reviews call
one Expert opinion definition with different mappings on concurrent branches; the travel request forks straight
into two mapped Calls beside a declaring Sub-Process. Expectations are the TypeScript analysis's and runtime's
values for the same graphs, and each refused model differs from an admitted one in the fact its name states.
The checks decide observations, not quantified laws: the prepared invocation's refinement and commutation live
in `InternalMappedInvocationLaws` and `InternalMappedInvocationCommutation`, and return, input and output in
`CallActivity` and `CallVariableMappingLaws`. See the
[concurrent mapped Calls specification](../docs/capsules/CONCURRENT-MAPPED-CALLS-SPEC.md#separating-witnesses).
-/

public section

namespace BpmnSemantics.ConcurrentMappedCallsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ConcurrentEmbeddedActivationsConformance (build node start finish fork join merge task sub scope admitted)
open BpmnSemantics.ConcurrentScopeServiceTasksConformance (activityProtocol)
open BpmnSemantics.ConcurrentScopeDataConformance (literal enclosing copied)

private def mappedCall (owner id callee : String) (inputs outputs : List VariableMapping) :=
  node owner (.callActivity ⟨id⟩ ⟨callee⟩ (.variableMappings inputs outputs))

private def unmappedCall (owner id callee : String) := node owner (.callActivity ⟨id⟩ ⟨callee⟩ .empty)

private def declare (owner : String) (inputs outputs : List VariableMapping) : ScopeLocalData :=
  { scopeId := scope owner, localInputs := inputs, localOutputs := outputs }

private def withData (records : List ScopeLocalData) (source : CheckedProcess) : CheckedProcess :=
  { source with scopeLocalData := records }

/-- Each review declares its `file` and a pending `verdict` and publishes the verdict to the Process; records
are sorted by scope id. -/
private def reviews : List ScopeLocalData :=
  [ declare "ComplianceReview" [literal "file" "sanctions screening", literal "verdict" "pending"]
      [copied "complianceVerdict" "verdict"]
  , declare "FinancialReview" [enclosing "file" "supplierName", literal "verdict" "pending"]
      [copied "financialVerdict" "verdict"] ]

/-- Supplier onboarding: `P` forks Financial review against Compliance review, each preparing its file and
then calling Expert opinion `X`, and approves after the join. `compliance` is the compliance Call's node;
`complianceLeads` drops the compliance review's preparing task, so its Call leads that body. -/
private def supplierWith (compliance : String × String × CheckedNode) (complianceLeads : Bool := false) : CheckedProcess :=
  let prepare := if complianceLeads then [] else [task "ComplianceReview" "PrepareComplianceFile"]
  let opened := if complianceLeads then [("CA", "ComplianceExpertOpinion")]
    else [("CA", "PrepareComplianceFile"), ("PrepareComplianceFile", "ComplianceExpertOpinion")]
  withData reviews <| build [("P", none), ("FinancialReview", some "P"), ("ComplianceReview", some "P"), ("X", none)]
    ([ start "P" "PA", fork "P" "PF", sub "P" "FinancialReview", sub "P" "ComplianceReview", join "P" "PJ"
    , task "P" "ApproveSupplier", finish "P" "PZ"
    , start "FinancialReview" "FA", task "FinancialReview" "PrepareFinancialFile"
    , mappedCall "FinancialReview" "FinancialExpertOpinion" "X" [enclosing "dossier" "file"] [copied "verdict" "opinion"]
    , finish "FinancialReview" "FZ"
    , start "ComplianceReview" "CA" ] ++ prepare ++ [ compliance, finish "ComplianceReview" "CZ"
    , start "X" "XA", task "X" "GiveExpertOpinion", finish "X" "XZ" ])
    ([ ("PA", "PF"), ("PF", "FinancialReview"), ("PF", "ComplianceReview"), ("FinancialReview", "PJ")
    , ("ComplianceReview", "PJ"), ("PJ", "ApproveSupplier"), ("ApproveSupplier", "PZ")
    , ("FA", "PrepareFinancialFile"), ("PrepareFinancialFile", "FinancialExpertOpinion")
    , ("FinancialExpertOpinion", "FZ") ] ++ opened ++ [ ("ComplianceExpertOpinion", "CZ")
    , ("XA", "GiveExpertOpinion"), ("GiveExpertOpinion", "XZ") ])

private def complianceCall :=
  mappedCall "ComplianceReview" "ComplianceExpertOpinion" "X" [enclosing "screeningFile" "file"] [copied "verdict" "finding"]

private def supplier : CheckedProcess := supplierWith complianceCall

/-- Travel request: `P` forks straight into Budget check `BC`, Visa check `VC` and Booking, whose local
`budget` starts from `approvedBudget`. `visa` is the Visa check Call's node and `callee` names its definition. -/
private def travelWith (visa : String → String × String × CheckedNode) (callee : String := "VC") : CheckedProcess :=
  withData [declare "Booking" [enclosing "budget" "approvedBudget"] []] <|
  build [("P", none), ("Booking", some "P"), ("BC", none), ("VC", none)]
    [ start "P" "TravelRequested", fork "P" "PreparationFork"
    , mappedCall "P" "BudgetCheck" "BC" [enclosing "traveller" "traveller"] [copied "approvedBudget" "confirmedBudget"]
    , visa callee, sub "P" "Booking", join "P" "PreparationJoin", finish "P" "TravelArranged"
    , start "Booking" "BookingOpened", task "Booking" "BookTravel", finish "Booking" "BookingClosed"
    , start "BC" "BudgetCheckRequested", task "BC" "CheckBudget", finish "BC" "BudgetChecked"
    , start "VC" "VisaCheckRequested", task "VC" "CheckVisa", finish "VC" "VisaChecked" ]
    [ ("TravelRequested", "PreparationFork"), ("PreparationFork", "BudgetCheck"), ("PreparationFork", "VisaCheck")
    , ("PreparationFork", "Booking"), ("BudgetCheck", "PreparationJoin"), ("VisaCheck", "PreparationJoin")
    , ("Booking", "PreparationJoin"), ("PreparationJoin", "TravelArranged"), ("BookingOpened", "BookTravel")
    , ("BookTravel", "BookingClosed"), ("BudgetCheckRequested", "CheckBudget"), ("CheckBudget", "BudgetChecked")
    , ("VisaCheckRequested", "CheckVisa"), ("CheckVisa", "VisaChecked") ]

private def visaCall (callee : String) :=
  mappedCall "P" "VisaCheck" callee [enclosing "traveller" "traveller"] [copied "visaStatus" "visaDecision"]

private def travel : CheckedProcess := travelWith visaCall

private def text (value : String) : VariableValue := .string value
private def bind (name value : String) : VariableBinding := { name, value := text value }

private def startWith (source : CheckedProcess) (bindings : List VariableBinding) : StimulusResult :=
  applyStimulus scenarioClosureLimit (lowerCheckedProcess source) initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ bindings)

private def called (element : String) : SemanticId := deriveCalledProcessInstanceId ⟨"I"⟩ ⟨element⟩ 1

private def complete (source : CheckedProcess) (state : RuntimeState) (calledId : SemanticId) (element : String)
    (activation : Nat) (patch : List VariableBinding := []) : StimulusResult :=
  applyStimulus scenarioClosureLimit (lowerCheckedProcess source) state
    (.completeUserTaskInstance ⟨element⟩ { processInstanceId := calledId, elementId := ⟨element⟩, activation } patch)

/-- Both expert tasks open: the financial review prepares first, so its expert's task takes activation 1. -/
private def bothExpertsOpen : RuntimeState :=
  let started := (startWith supplier [bind "supplierName" "Acme"]).state
  let financial := (complete supplier started ⟨"I"⟩ "PrepareFinancialFile" 1).state
  (complete supplier financial ⟨"I"⟩ "PrepareComplianceFile" 1).state

private def financial : SemanticId := called "FinancialExpertOpinion"
private def compliance : SemanticId := called "ComplianceExpertOpinion"

private def frameOf (state : RuntimeState) (calledId : SemanticId) : Option (List VariableBinding) :=
  (state.variables.scopes.find? (·.owner.processInstanceId == calledId)).map (·.bindings)

private def refusedUnchanged (result : StimulusResult) (before : RuntimeState) : Bool :=
  result.outcome == .rejected && result.state == before

/-- Both answers in the given order, then the approval: the final Process bindings. -/
private def answered (complianceFirst : Bool) : StimulusResult :=
  let answers := [(compliance, 2, bind "finding" "clear"), (financial, 1, bind "opinion" "solvent")]
  let ordered := if complianceFirst then answers else answers.reverse
  let state := ordered.foldl (fun state (calledId, activation, patch) =>
      (complete supplier state calledId "GiveExpertOpinion" activation [patch]).state) bothExpertsOpen
  complete supplier state ⟨"I"⟩ "ApproveSupplier" 1

private def supplier_and_travel_are_admitted : Bool := admitted supplier && admitted travel

/-- CMCALL-START-01: the supplier requires only `supplierName`; travel requires `approvedBudget`, which
Booking reads from its sibling Budget check's output (CMCALL-AVAILABLE-01). -/
private def start_names_follow_availability : Bool := decide <|
  NestedScopeControl.programStartNames (lowerCheckedProcess supplier) = some ["supplierName"] &&
    NestedScopeControl.programStartNames (lowerCheckedProcess travel) = some ["approvedBudget"]

/-- CMCALL-AVAILABLE-01 and CMCALL-START-01: travel without `approvedBudget` and the supplier binding the
called-only `dossier` are refused; an absent `traveller` is admitted. -/
private def start_refuses_missing_and_called_only_names : Bool :=
  (startWith travel []).outcome == .rejected &&
    (startWith supplier [bind "dossier" "x", bind "supplierName" "Acme"]).outcome == .rejected &&
    (startWith travel [bind "approvedBudget" "1200"]).outcome == .committed

/-- CMCALL-PREPARE-01 and CMCALL-START-01: one Start batch invokes both checks and enters Booking, leaving two
called tasks and one caller task, and the absent traveller is a present null in both called frames. -/
private def travel_start_commits_one_batch : Bool :=
  let result := startWith travel [bind "approvedBudget" "1200"]
  result.outcome == .committed && !result.ambiguousInternalChoice &&
    let waiting := result.state.waits.map fun wait => (wait.processInstanceId, wait.task.id.value)
    waiting.length == 3 && [(called "BudgetCheck", "CheckBudget"), (called "VisaCheck", "CheckVisa"), (⟨"I"⟩, "BookTravel")].all
      waiting.contains &&
    frameOf result.state (called "BudgetCheck") == some [{ name := "traveller", value := .null }] &&
    frameOf result.state (called "VisaCheck") == some [{ name := "traveller", value := .null }]

/-- CMCALL-IN-01: each called frame holds its own Call's input target, read from its own review's `file`. -/
private def each_call_reads_its_own_review : Bool :=
  frameOf bothExpertsOpen financial == some [bind "dossier" "Acme"] &&
    frameOf bothExpertsOpen compliance == some [bind "screeningFile" "sanctions screening"]

/-- CMCALL-OWN-01, CMCALL-OUT-01: in both completion orders each answer lands in its own review's verdict. -/
private def each_answer_lands_in_its_own_review : Bool :=
  [true, false].all fun complianceFirst =>
    let result := answered complianceFirst
    result.outcome == .committed && result.state.control == .completed ⟨"I"⟩ &&
      result.state.variables.process.bindings ==
        [bind "complianceVerdict" "clear", bind "financialVerdict" "solvent", bind "supplierName" "Acme"]

/-- CMCALL-TASK-01: each expert's patch of the other Call's output source is refused unchanged. -/
private def patch_names_follow_the_call : Bool :=
  refusedUnchanged (complete supplier bothExpertsOpen financial "GiveExpertOpinion" 1 [bind "finding" "x"]) bothExpertsOpen &&
    refusedUnchanged (complete supplier bothExpertsOpen compliance "GiveExpertOpinion" 2 [bind "opinion" "x"])
      bothExpertsOpen

/-- CMCALL-REFUSE-01: the financial task under the compliance identity, and the compliance task after its
return, are refused unchanged. -/
private def completions_route_by_identity : Bool :=
  let returned := (complete supplier bothExpertsOpen compliance "GiveExpertOpinion" 2 [bind "finding" "clear"]).state
  refusedUnchanged (complete supplier bothExpertsOpen compliance "GiveExpertOpinion" 1) bothExpertsOpen &&
    refusedUnchanged (complete supplier returned compliance "GiveExpertOpinion" 2 [bind "finding" "late"]) returned

/-- CMCALL-ISOLATE-01: the financial expert's patch leaves the compliance frame and both reviews' frames as
they were, and the Process gains only the published financial verdict. -/
private def called_patch_stays_in_its_instance : Bool :=
  let after := complete supplier bothExpertsOpen financial "GiveExpertOpinion" 1
    [bind "dossier" "Acme revised", bind "opinion" "solvent"]
  after.outcome == .committed && frameOf after.state compliance == frameOf bothExpertsOpen compliance &&
    after.state.variables.process.bindings == [bind "financialVerdict" "solvent", bind "supplierName" "Acme"]

/-- The nearest checked non-law: `calledRootMappings?` gives the two live roots of one definition different
mappings, so a selector by called definition, which returns one invocation's mappings for both roots,
disagrees with it on one of them. Mappings are compared by their target names. -/
private def mappings_by_definition_differ_from_mappings_by_record : Bool :=
  let program := lowerCheckedProcess supplier
  let names := fun (mappings : List VariableMapping × List VariableMapping) =>
    (mappings.1.map (·.target), mappings.2.map (·.target))
  let byDefinition := fun (root : ScopeOccurrenceId) => program.operations.findSome? fun operation =>
    match operation with
    | .invokeProcess _ _ _ _ calledRootScopeId _ _ (.variableMappings inputs outputs) =>
        if calledRootScopeId == root.definitionScopeId then some (names (inputs, outputs)) else none
    | _ => none
  let byRecord := fun (root : ScopeOccurrenceId) =>
    (NestedScopeData.calledRootMappings? program bothExpertsOpen.calledProcessOccurrences root).map names
  let roots := bothExpertsOpen.calledProcessOccurrences.map (·.calledRoot)
  roots.length == 2 && roots.all (byRecord · |>.isSome) &&
    (roots.map byRecord).eraseDups.length == 2 && roots.any fun root => byDefinition root != byRecord root

/-- CMCALL-ADMIT-01: a mapped Call leading its Sub-Process body on a fork branch is refused, since its
invocation would be co-enabled with sibling work from a non-root caller; `supplier` differs only in the
compliance review's preparing task. -/
private def mapped_call_leading_a_body_is_refused : Bool :=
  !admitted (supplierWith complianceCall (complianceLeads := true)) && admitted supplier

/-- `W` forks into two User Tasks that meet at a merge (`merged`) or a join, then runs `T`, whose body holds a
User Task and then a mapped Call of `X`. -/
private def nestedCallAfter (merged : Bool) : CheckedProcess :=
  build [("P", none), ("W", some "P"), ("T", some "W"), ("X", none)]
    [ start "P" "PA", sub "P" "W", finish "P" "PZ"
    , start "W" "WA", fork "W" "WF", task "W" "ReviewA", task "W" "ReviewB"
    , if merged then merge "W" "WM" else join "W" "WM", sub "W" "T", finish "W" "WZ"
    , start "T" "TA", task "T" "FixTask", mappedCall "T" "FixCall" "X" [enclosing "traveller" "traveller"] []
    , finish "T" "TZ", start "X" "XA", task "X" "CheckBudget", finish "X" "XZ" ]
    [ ("PA", "W"), ("W", "PZ"), ("WA", "WF"), ("WF", "ReviewA"), ("WF", "ReviewB"), ("ReviewA", "WM")
    , ("ReviewB", "WM"), ("WM", "T"), ("T", "WZ"), ("TA", "FixTask"), ("FixTask", "FixCall"), ("FixCall", "TZ")
    , ("XA", "CheckBudget"), ("CheckBudget", "XZ") ]

/-- CMCALL-ADMIT-01: a mapped Call in a merge-target body is refused, since two live occurrences of the
target would hold two records of one Call element; after a join, the same Call is admitted. -/
private def mapped_call_in_a_merge_target_is_refused : Bool :=
  !admitted (nestedCallAfter true) && admitted (nestedCallAfter false)

/-- CMCALL-ADMIT-01: a fork straight into two Calls of one definition is refused. -/
private def fork_into_two_calls_of_one_definition_is_refused : Bool :=
  !admitted (travelWith visaCall "BC")

/-- CMCALL-ADMIT-01: a called Process invoked by a mapped and an unmapped Call is refused. -/
private def mapped_and_unmapped_calls_of_one_definition_are_refused : Bool :=
  !admitted (supplierWith (unmappedCall "ComplianceReview" "ComplianceExpertOpinion" "X"))

/-- CMCALL-ADMIT-01: a mapped Call beside an unmapped Call of another definition is admitted. -/
private def unmapped_call_of_another_definition_is_admitted : Bool :=
  admitted (travelWith fun callee => unmappedCall "P" "VisaCheck" callee)

/-- CMCALL-ADMIT-01: a Service Task beside a mapped Call is refused. -/
private def service_task_beside_a_call_is_refused : Bool :=
  !admitted (travelWith fun _ => node "P" (.serviceTask ⟨"VisaCheck"⟩
    { protocol := activityProtocol, operation := "visaCheck" } [] [] none))

/-- Every executable check of this module, named for the driver's failure report. -/
def concurrentMappedCallsConformanceChecks : List (String × Bool) := [
  ("supplier_and_travel_are_admitted", supplier_and_travel_are_admitted),
  ("start_names_follow_availability", start_names_follow_availability),
  ("start_refuses_missing_and_called_only_names", start_refuses_missing_and_called_only_names),
  ("travel_start_commits_one_batch", travel_start_commits_one_batch),
  ("each_call_reads_its_own_review", each_call_reads_its_own_review),
  ("each_answer_lands_in_its_own_review", each_answer_lands_in_its_own_review),
  ("patch_names_follow_the_call", patch_names_follow_the_call),
  ("completions_route_by_identity", completions_route_by_identity),
  ("called_patch_stays_in_its_instance", called_patch_stays_in_its_instance),
  ("mappings_by_definition_differ_from_mappings_by_record", mappings_by_definition_differ_from_mappings_by_record),
  ("mapped_call_leading_a_body_is_refused", mapped_call_leading_a_body_is_refused),
  ("mapped_call_in_a_merge_target_is_refused", mapped_call_in_a_merge_target_is_refused),
  ("fork_into_two_calls_of_one_definition_is_refused", fork_into_two_calls_of_one_definition_is_refused),
  ("mapped_and_unmapped_calls_of_one_definition_are_refused", mapped_and_unmapped_calls_of_one_definition_are_refused),
  ("unmapped_call_of_another_definition_is_admitted", unmapped_call_of_another_definition_is_admitted),
  ("service_task_beside_a_call_is_refused", service_task_beside_a_call_is_refused)
]

end BpmnSemantics.ConcurrentMappedCallsConformance
