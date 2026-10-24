import BpmnSemantics.SemanticProcessJson.InternalAlternative
import BpmnSemantics.SemanticProcess.OpenWaitProjection
import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import BpmnSemantics.SemanticProcess.ParallelScopeRuntime
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! PMIS lifecycle fixtures distinguish exact body retirement from whole-Activity cancellation and retain unrelated ownership. -/

namespace BpmnSemantics.ParallelScopeRuntimeConformance

open BpmnSemantics.SemanticProcess

def probeParent : ScopeOccurrenceId := ⟨⟨"applicants"⟩, ⟨"root"⟩, 1⟩
def probeBody (activation : Nat) : ScopeOccurrenceId := ⟨⟨"applicants"⟩, ⟨"body"⟩, activation⟩
def probeOther : ActivityOccurrence :=
  { processInstanceId := ⟨"applicants"⟩, activityElementId := ⟨"Other"⟩, activation := 1,
    owner := probeParent, body := .childScope ⟨⟨"applicants"⟩, ⟨"other"⟩, 1⟩, attachedHandlers := [] }
def probeEntry : ParallelScopeEntry :=
  ⟨⟨"enter"⟩, ⟨"Checks"⟩, ⟨"in"⟩, ⟨"check"⟩, ⟨"body"⟩, ⟨"out"⟩, "applicants", "applicant", [], some "approved"⟩
def probeReady : RuntimeState :=
  { initialState with
    control := .running ⟨"applicants"⟩,
    scopeOccurrences := [⟨probeParent, none⟩, ⟨⟨⟨"applicants"⟩, ⟨"other"⟩, 1⟩, some probeParent⟩],
    activityOccurrences := [probeOther], tokens := [⟨⟨"in"⟩, probeParent⟩],
    scopeActivations := [⟨⟨"body"⟩, 4⟩],
    variables := { emptyScopedVariables with process := { bindings :=
      [⟨"applicants", .stringList ["same", "same"]⟩, ⟨"approved", .boolean false⟩] } } }
def probeActive : RuntimeState := (enterParallelScope? probeEntry probeReady probeParent).getD initialState
def probeSettled : RuntimeState :=
  { probeActive with tokens := probeActive.tokens.filter (·.owner != probeBody 5) }
def probeRetired : RuntimeState := (completeParallelScope? probeEntry probeSettled (probeBody 5)).getD initialState

def probePairedProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"private-parallel-binding"⟩
        sourceId := ⟨"binding"⟩
        sourceSha256 := "private-binding-witness" },
    internalSchedulingMode := .rejectObservableChoice, processId := ⟨"applicants"⟩,
    definitionScopes := [], controlPlaces := [], controlPlaceScopes := [],
    operationScopes := [⟨⟨"enter"⟩, ⟨"root"⟩⟩, ⟨⟨"complete"⟩, ⟨"body"⟩⟩],
    operations := [.enterParallelMultiInstanceScope ⟨"enter"⟩ ⟨⟨"Checks"⟩⟩ ⟨"in"⟩ ⟨"check"⟩
      ⟨"body"⟩ ⟨"out"⟩ "applicants" "applicant" [] (some "approved"),
      .completeParallelMultiInstanceScope ⟨"complete"⟩ ⟨⟨"Checks"⟩⟩ ⟨"enter"⟩] }

theorem parallel_il_binding_preserves_selected_occurrence_fixture :
    applyParallelScopeOperation? probePairedProgram ⟨"enter"⟩ probeReady probeParent = some probeActive ∧
    applyParallelScopeOperation? probePairedProgram ⟨"complete"⟩ probeSettled (probeBody 5) = some probeRetired ∧
    applyParallelScopeOperation? probePairedProgram ⟨"complete"⟩ probeSettled (probeBody 6) = none ∧
    applyParallelScopeOperation? { probePairedProgram with operations := probePairedProgram.operations.reverse }
      ⟨"complete"⟩ probeSettled (probeBody 5) = some probeRetired ∧
    applyParallelScopeOperation? { probePairedProgram with operationScopes := [] }
      ⟨"complete"⟩ probeSettled (probeBody 5) = none := by decide +kernel

theorem parallel_entry_disjoint_ownership_fixture :
    (enterParallelScope? probeEntry probeReady probeParent).isSome = true ∧
    probeActive.activityOccurrences.filter (·.activityElementId == probeOther.activityElementId) = [probeOther] ∧
    (probeActive.activityOccurrences.flatMap fun record => activityBodyScopeClaims record.body).Nodup ∧
    probeActive.variables.scopes.map (·.owner) = [probeBody 5, probeBody 6] ∧
    parallelScopeControllersConsistent probeActive = true := by decide +kernel

theorem parallel_retirement_identity_and_sibling_fixture :
    completeParallelScope? probeEntry probeActive (probeBody 5) = none ∧
    (completeParallelScope? probeEntry probeSettled (probeBody 5)).isSome = true ∧
    probeRetired.activityOccurrences.map (fun record => (record.processInstanceId, record.activityElementId, record.activation)) = probeActive.activityOccurrences.map (fun record => (record.processInstanceId, record.activityElementId, record.activation)) ∧
    probeRetired.activityOccurrences.filter (·.activityElementId == probeOther.activityElementId) = [probeOther] ∧
    probeRetired.variables.scopes.map (·.owner) = [probeBody 6] ∧
    parallelScopeControllersConsistent probeRetired = true := by decide +kernel

def probeEarly : RuntimeState :=
  { probeSettled with variables := { probeSettled.variables with process := { bindings :=
    [⟨"applicants", .stringList ["same", "same"]⟩, ⟨"approved", .boolean true⟩] } } }

theorem parallel_terminal_cleanup_fixture :
    let final := (completeParallelScope? probeEntry probeEarly (probeBody 5)).getD initialState
    (completeParallelScope? probeEntry probeEarly (probeBody 5)).isSome = true ∧
    final.activityOccurrences = [probeOther] ∧ final.parallelScopeControllers = [] ∧
    final.variables.scopes = [] ∧ final.variables.process = probeEarly.variables.process ∧
    final.tokens = [⟨⟨"out"⟩, probeParent⟩] ∧ final.scopeActivations = probeEarly.scopeActivations := by decide +kernel

theorem parallel_natural_completion_fixture :
    let settled := { probeRetired with tokens := [] }
    let final := (completeParallelScope? probeEntry settled (probeBody 6)).getD initialState
    (completeParallelScope? probeEntry settled (probeBody 6)).isSome = true ∧
    final.activityOccurrences = [probeOther] ∧ final.parallelScopeControllers = [] ∧
    final.variables.scopes = [] ∧ final.tokens = [⟨⟨"out"⟩, probeParent⟩] ∧
    final.variables.process = probeReady.variables.process := by decide +kernel

open InternalCommutation

def occurrenceProgram : Program :=
  { probePairedProgram with
    operations := [.reachNoneEnd ⟨"end"⟩ ⟨⟨"End"⟩⟩ ⟨"in"⟩],
    operationScopes := [⟨⟨"end"⟩, ⟨"body"⟩⟩] }
def occurrenceState : RuntimeState :=
  { initialState with
    control := .running ⟨"applicants"⟩,
    scopeOccurrences := [⟨probeBody 1, some probeParent⟩, ⟨probeBody 2, some probeParent⟩],
    tokens := [⟨⟨"in"⟩, probeBody 1⟩, ⟨⟨"in"⟩, probeBody 2⟩] }
def occurrenceCandidate (n : Nat) : InternalOperationOccurrence := ⟨⟨"end"⟩, probeBody n⟩
def occurrenceEnded : RuntimeState :=
  { occurrenceState with tokens := [⟨⟨"in"⟩, probeBody 2⟩], endOccurrences := 1 }

theorem exact_operation_occurrence_discovery_fixture :
    internalOperationOccurrences? occurrenceProgram occurrenceState ⟨"end"⟩ =
      some [occurrenceCandidate 1, occurrenceCandidate 2] ∧
    internalOperationOccurrences? occurrenceProgram
      { occurrenceState with scopeOccurrences := occurrenceState.scopeOccurrences.reverse } ⟨"end"⟩ =
      some [occurrenceCandidate 1, occurrenceCandidate 2] ∧
    resolveInternalOperationOccurrence? occurrenceProgram
      { occurrenceState with scopeOccurrences := [⟨probeBody 2, some probeParent⟩] }
      (occurrenceCandidate 1) = none := by decide +kernel

theorem exact_operation_occurrence_end_fixture :
    applyInternalOperationOccurrence? occurrenceProgram occurrenceState (occurrenceCandidate 1) = some occurrenceEnded ∧
    applyInternalOperationOccurrence? occurrenceProgram occurrenceEnded (occurrenceCandidate 1) = none ∧
    applyInternalOperationOccurrence? occurrenceProgram occurrenceEnded (occurrenceCandidate 2) =
      some { occurrenceEnded with tokens := [], endOccurrences := 2 } := by decide +kernel

theorem exact_operation_occurrence_frontier_fixture :
    (deriveInternalOccurrenceFrontier? occurrenceProgram occurrenceState).map (List.map Prod.fst) =
      some [occurrenceCandidate 1, occurrenceCandidate 2] ∧
    (deriveInternalOccurrenceFrontier? occurrenceProgram occurrenceEnded).map (List.map Prod.fst) =
      some [occurrenceCandidate 2] := by decide +kernel

def occurrenceFork : Program :=
  { occurrenceProgram with operations := [.duplicate ⟨"end"⟩ ⟨⟨"Fork"⟩⟩ ⟨"in"⟩ [⟨"left"⟩, ⟨"right"⟩]] }
def occurrenceForked : RuntimeState :=
  (applyInternalOperationOccurrence? occurrenceFork occurrenceState (occurrenceCandidate 2)).getD initialState
def occurrenceJoin : Program :=
  { occurrenceProgram with operations := [.synchronize ⟨"end"⟩ ⟨⟨"Join"⟩⟩ [⟨"left"⟩, ⟨"right"⟩] ⟨"out"⟩] }

theorem exact_operation_occurrence_fork_join_fixture :
    (applyInternalOperationOccurrence? occurrenceFork occurrenceState (occurrenceCandidate 2)).isSome = true ∧
    (applyInternalOperationOccurrence? occurrenceJoin occurrenceForked (occurrenceCandidate 2)).isSome = true ∧
    applyInternalOperationOccurrence? occurrenceJoin occurrenceForked (occurrenceCandidate 1) = none ∧
    applyInternalOperationOccurrence? occurrenceFork
      { occurrenceState with tokens := ⟨⟨"in"⟩, probeBody 1⟩ :: occurrenceState.tokens }
      (occurrenceCandidate 1) = none := by decide +kernel

def occurrenceTask : Program :=
  { occurrenceProgram with operations := [.awaitUserTask ⟨"end"⟩ ⟨⟨"End"⟩⟩ ⟨"in"⟩ ⟨"out"⟩
      { id := ⟨"Review"⟩, name := some "Review application" }] }
def occurrenceTaskBefore : RuntimeState :=
  { occurrenceState with activations := [⟨⟨"Review"⟩, 7⟩] }
def occurrenceTaskOne : RuntimeState :=
  (applyInternalOperationOccurrence? occurrenceTask occurrenceTaskBefore (occurrenceCandidate 2)).getD initialState
def occurrenceTaskBoth : RuntimeState :=
  (applyInternalOperationOccurrence? occurrenceTask occurrenceTaskOne (occurrenceCandidate 1)).getD initialState

theorem exact_operation_occurrence_task_arming_fixture :
    (deriveInternalOccurrenceFrontier? occurrenceTask occurrenceTaskBefore).map (List.map Prod.fst) =
      some [occurrenceCandidate 1, occurrenceCandidate 2] ∧
    occurrenceTaskOne.waits.map (fun wait => (wait.owner, wait.activation)) = [(probeBody 2, 8)] ∧
    applyInternalOperationOccurrence? occurrenceTask occurrenceTaskOne (occurrenceCandidate 2) = none ∧
    occurrenceTaskBoth.waits.map (fun wait => (wait.owner, wait.activation)) = [(probeBody 1, 9), (probeBody 2, 8)] ∧
    occurrenceTaskBoth.activations = [⟨⟨"Review"⟩, 9⟩] ∧ occurrenceTaskBoth.tokens = [] ∧
    occurrenceTaskBoth.variables = occurrenceTaskBefore.variables := by decide +kernel

def occurrenceTimerDefinition : TimerDefinition := ⟨⟨"Reminder"⟩, 1000⟩
def occurrenceTimers : RuntimeState :=
  let first := activateTimer occurrenceState ⟨"applicants"⟩ (probeBody 2) ⟨"in"⟩ ⟨"out"⟩ occurrenceTimerDefinition
  activateTimer first ⟨"applicants"⟩ (probeBody 1) ⟨"in"⟩ ⟨"out"⟩ occurrenceTimerDefinition

theorem exact_occurrence_task_projection_order_fixture :
    (projectOpenUserTasks [{ id := ⟨"Review"⟩, name := some "Review application" }] occurrenceTaskBoth).map
      (·.id.activation) = [8, 9] := by decide +kernel

theorem exact_occurrence_timer_projection_order_fixture :
    (projectOpenTimers [occurrenceTimerDefinition] occurrenceTimers).map (·.id.activation) = [1, 2] := by decide +kernel

theorem exact_occurrence_frontier_refuses_unhandled_operations :
    deriveInternalOccurrenceFrontier?
      { occurrenceProgram with operations := [.mergeExclusive ⟨"merge"⟩ ⟨⟨"Merge"⟩⟩ [⟨"in"⟩] ⟨"out"⟩] }
      occurrenceState = none ∧
    deriveInternalOccurrenceFrontier?
      { occurrenceProgram with operations := occurrenceProgram.operations ++ [.mergeExclusive ⟨"merge"⟩ ⟨⟨"Merge"⟩⟩ [⟨"in"⟩] ⟨"out"⟩] }
      occurrenceState = none := by decide +kernel

def effectInput (name : String) : VariableMapping := ⟨name, .enclosingVariable name⟩
def scopedEffect : EffectDefinition :=
  { elementId := ⟨"Check"⟩,
    descriptor := ⟨"urn:bpmn-lean:effect-protocol:activity-v1", "checkApplication"⟩,
    inputMappings := [effectInput "applicant", effectInput "status", effectInput "tenant"], outputMappings := [] }
def effectProgram : Program :=
  { probePairedProgram with
    operations := probePairedProgram.operations ++
      [.awaitEffect ⟨"check"⟩ ⟨⟨"Check"⟩⟩ ⟨"check"⟩ ⟨"done"⟩ scopedEffect none],
    operationScopes := probePairedProgram.operationScopes ++ [⟨⟨"check"⟩, ⟨"body"⟩⟩] }
def effectReady : RuntimeState :=
  { probeReady with variables := { emptyScopedVariables with process := { bindings :=
    [⟨"applicant", .string "wrong-process-item"⟩, ⟨"applicants", .stringList ["A", "B"]⟩, ⟨"approved", .boolean false⟩,
     ⟨"status", .string "wrong-process-status"⟩, ⟨"tenant", .string "acme"⟩] } } }
def effectActive : RuntimeState :=
  let active := (enterParallelScope? probeEntry effectReady probeParent).getD initialState
  { active with variables := { active.variables with scopes := active.variables.scopes.map fun frame =>
    { frame with bindings := [⟨"status", .null⟩] } } }
def expectedEffectInputs (item : String) : List VariableBinding :=
  [⟨"applicant", .string item⟩, ⟨"status", .null⟩, ⟨"tenant", .string "acme"⟩]
def armEffect (state : RuntimeState) (activation : Nat) : Option RuntimeState :=
  InternalCommutation.applyInternalOperationOccurrence? effectProgram state ⟨⟨"check"⟩, probeBody activation⟩

#eval show IO Unit from do
  let some second := armEffect effectActive 6 | throw (IO.userError "parallel effect: second body did not arm")
  unless second.effectWaits.map (fun wait => (wait.owner, wait.activation, wait.arguments)) ==
      [(probeBody 6, 1, expectedEffectInputs "B")] do
    throw (IO.userError "parallel effect: second body snapshot mismatch")
  let some both := armEffect second 5 | throw (IO.userError "parallel effect: first body did not arm")
  unless both.effectWaits.map (fun wait => (wait.owner, wait.activation, wait.arguments)) ==
      [(probeBody 5, 2, expectedEffectInputs "A"), (probeBody 6, 1, expectedEffectInputs "B")] do
    throw (IO.userError "parallel effect: occurrence identities or snapshots mismatch")
  unless both.variables.process == effectActive.variables.process && both.variables.scopes == effectActive.variables.scopes do
    throw (IO.userError "parallel effect: arming changed Process or body data")
  unless (armEffect both 5).isNone do
    throw (IO.userError "parallel effect: consumed candidate armed twice")

theorem parallel_effect_missing_population_refuses_fixture :
    armEffect { effectActive with parallelScopeControllers := [] } 5 = none ∧
    armEffect { effectActive with variables := { effectActive.variables with
      scopes := effectActive.variables.scopes.filter (·.owner != probeBody 6) } } 5 = none ∧
    armEffect effectActive 7 = none := by decide +kernel

def resultProgram : Program :=
  { effectProgram with operations := probePairedProgram.operations ++ [
    .awaitEffect ⟨"check"⟩ ⟨⟨"Check"⟩⟩ ⟨"check"⟩ ⟨"done"⟩
      { scopedEffect with outputMappings := [⟨"status", .localVariable "result"⟩] } none] }

#eval show IO Unit from do
  let some second := InternalCommutation.applyInternalOperationOccurrence? resultProgram effectActive ⟨⟨"check"⟩, probeBody 6⟩
    | throw (IO.userError "parallel result: second body did not arm")
  let some both := InternalCommutation.applyInternalOperationOccurrence? resultProgram second ⟨⟨"check"⟩, probeBody 5⟩
    | throw (IO.userError "parallel result: first body did not arm")
  let effectId : EffectOccurrenceId := ⟨⟨"applicants"⟩, ⟨"Check"⟩, 1⟩
  let result := EffectExecutionResult.success [⟨"result", .string "checked"⟩]
  let some after := completeParallelScopeEffect? resultProgram both effectId result
    | throw (IO.userError "parallel result: mapped completion refused")
  unless (selectScopeVariables? after.variables (probeBody 6)).map (·.bindings) == some [⟨"status", .string "checked"⟩] &&
      selectScopeVariables? after.variables (probeBody 5) == selectScopeVariables? both.variables (probeBody 5) &&
      after.variables.process == both.variables.process && after.variables.activities.length == 1 &&
      after.effectWaits.length == 1 && after.tokens == [⟨⟨"done"⟩, probeBody 6⟩] do
    throw (IO.userError "parallel result: exact write, sibling retention or disposal mismatch")
  unless (completeParallelScopeEffect? resultProgram after effectId result).isNone &&
      (completeParallelScopeEffect? resultProgram { both with parallelScopeControllers := [] } effectId result).isNone &&
      (completeParallelScopeEffect? resultProgram both effectId (.success [])).isNone do
    throw (IO.userError "parallel result: stale or incomplete completion accepted")
  let humanId : UserTaskInstanceId := ⟨⟨"applicants"⟩, ⟨"Review"⟩, 1⟩
  let human := activateUserTask effectActive ⟨"applicants"⟩ (probeBody 6) ⟨"check"⟩ ⟨"done"⟩ ⟨⟨"Review"⟩, none, none⟩
  let some reviewed := completeParallelScopeUserTask? effectProgram human humanId
    [⟨"approved", .boolean true⟩, ⟨"status", .string "reviewed"⟩]
    | throw (IO.userError "parallel human result: completion refused")
  unless (selectScopeVariables? reviewed.variables (probeBody 6)).map (·.bindings) == some [⟨"status", .string "reviewed"⟩] &&
      reviewed.variables.process.bindings.find? (·.name == "approved") == some ⟨"approved", .boolean true⟩ &&
      selectScopeVariables? reviewed.variables (probeBody 5) == selectScopeVariables? human.variables (probeBody 5) do
    throw (IO.userError "parallel human result: local or Process condition write mismatch")
  for name in ["applicant", "applicants", "checkApplication"] do
    unless (completeParallelScopeUserTask? effectProgram human humanId [⟨name, .null⟩]).isNone do
      throw (IO.userError "parallel human result: protected name accepted")

def lifecycleProgram : Program :=
  { effectProgram with
    operations := effectProgram.operations ++ [.reachNoneEnd ⟨"end"⟩ ⟨⟨"End"⟩⟩ ⟨"done"⟩],
    operationScopes := effectProgram.operationScopes ++ [⟨⟨"end"⟩, ⟨"body"⟩⟩] }

#eval show IO Unit from do
  for count in [0, 1, 2, 16] do
    for reverse in [false, true] do
      let bindings := effectReady.variables.process.bindings.map fun binding => if binding.name == "applicants" then
        ⟨"applicants", .stringList (List.replicate count "same")⟩ else binding
      let ready := { effectReady with variables := { effectReady.variables with process := { bindings } } }
      let some entered := InternalCommutation.applyInternalOperationOccurrence? lifecycleProgram ready ⟨⟨"enter"⟩, probeParent⟩
        | throw (IO.userError "parallel lifecycle: entry refused")
      let order := if reverse then (List.range' 5 count).reverse else List.range' 5 count
      let mut state := entered
      for activation in order do
        let some offers := InternalCommutation.deriveInternalOccurrenceFrontier? lifecycleProgram state
          | throw (IO.userError "parallel lifecycle: incomplete frontier")
        let some offer := offers.find? (fun offer => offer.1 == ⟨⟨"check"⟩, probeBody activation⟩)
          | throw (IO.userError "parallel lifecycle: missing effect candidate")
        state := offer.2
      unless state.effectWaits.length == count do throw (IO.userError "parallel lifecycle: wrong effect count")
      for activation in order do
        let some wait := state.effectWaits.find? (·.owner == probeBody activation)
          | throw (IO.userError "parallel lifecycle: missing effect wait")
        let effectId : EffectOccurrenceId := ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩
        let some finished := completeParallelScopeEffect? lifecycleProgram state effectId (.success [])
          | throw (IO.userError "parallel lifecycle: effect completion refused")
        let some ended := InternalCommutation.applyInternalOperationOccurrence? lifecycleProgram finished ⟨⟨"end"⟩, probeBody activation⟩
          | throw (IO.userError "parallel lifecycle: End refused")
        let some retired := InternalCommutation.applyInternalOperationOccurrence? lifecycleProgram ended ⟨⟨"complete"⟩, probeBody activation⟩
          | throw (IO.userError "parallel lifecycle: body retirement refused")
        state := retired
      unless state.tokens == [⟨⟨"out"⟩, probeParent⟩] && state.parallelScopeControllers.isEmpty &&
          state.variables.scopes.isEmpty && state.variables.activities.isEmpty && state.effectWaits.isEmpty &&
          state.endOccurrences == count do
        throw (IO.userError "parallel lifecycle: cleanup or parent continuation mismatch")

def cohortProgram : Program :=
  { lifecycleProgram with
    definitionScopes := [⟨⟨"root"⟩, none, ⟨"applicants"⟩⟩, ⟨⟨"body"⟩, some ⟨"root"⟩, ⟨"Checks"⟩⟩],
    identity := { lifecycleProgram.identity with
      semanticProfile := ⟨"cibseven-2.2.0-parallel-multi-instance-subprocess-draft"⟩ },
    controlPlaces := [⟨⟨"check"⟩, ⟨⟨"CheckInput"⟩⟩⟩],
    controlPlaceScopes := [⟨⟨"check"⟩, ⟨"body"⟩⟩] }

def entryPublicationFixtureValid (count : Nat) : Bool := Id.run do
  let some operation := cohortProgram.operations.find? (·.id == ⟨"enter"⟩) | return false
  let bindings := effectReady.variables.process.bindings.map fun binding => if binding.name == "applicants" then
    ⟨"applicants", .stringList (List.replicate count "same")⟩ else binding
  let before := { effectReady with variables := { effectReady.variables with process := { bindings } } }
  let some after := applyInternalOperationOccurrence? cohortProgram before ⟨⟨"enter"⟩, probeParent⟩ | return false
  let some starts := candidateParallelScopeStarts? cohortProgram operation probeParent before after | return false
  if starts.length != count || !(starts.all fun start => start.owner == probeParent) then return false
  if count > 0 then
    let invalid := [
      { after with variables := { after.variables with scopes := [] } },
      { after with parallelScopeControllers := [] },
      { after with parallelScopeControllers := after.parallelScopeControllers ++ after.parallelScopeControllers },
      { after with parallelScopeControllers := after.parallelScopeControllers.map fun row => { row with completed := 1 } },
      { after with scopeOccurrences := after.scopeOccurrences.filter (·.id != probeBody 5) },
      { after with activityOccurrences := after.activityOccurrences ++ after.activityOccurrences } ]
    let staleBefore := { before with scopeActivations := [⟨⟨"body"⟩, 5⟩] }
    return invalid.all (fun state => (candidateParallelScopeStarts? cohortProgram operation probeParent before state).isNone) &&
      (candidateParallelScopeStarts? cohortProgram operation probeParent staleBefore after).isNone
  else
    let polluted := { after with scopeOccurrences := ⟨probeBody 5, some probeParent⟩ :: after.scopeOccurrences }
    return (candidateParallelScopeStarts? cohortProgram operation probeParent before polluted).isNone

theorem parallel_entry_publication_preserves_population_and_rejects_corrupt_fixtures :
    [0, 1, 2, 16].all entryPublicationFixtureValid = true := by decide +kernel

def completionPublicationOperation : SemanticOperation :=
  .completeParallelMultiInstanceScope ⟨"complete"⟩ ⟨⟨"Checks"⟩⟩ ⟨"enter"⟩

def completionPublicationEntryOperation : SemanticOperation :=
  .enterParallelMultiInstanceScope probeEntry.id ⟨probeEntry.elementId⟩ probeEntry.input probeEntry.childEntry
    probeEntry.childScopeId probeEntry.normalOutput probeEntry.collectionName probeEntry.itemName
    probeEntry.bodyInputs probeEntry.completionBooleanName

def completionPublicationDelta (activation : Nat) : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [], ended := [{ anchor := .scope (probeBody activation), terminal := .completed }] }

theorem parallel_partial_retirement_publishes_only_exact_completed_body :
    candidateFlowNodeOccurrenceDeltaForOwnedOperation? cohortProgram probeSettled probeRetired
      completionPublicationOperation (probeBody 5) ⟨"retire"⟩ 0 =
      some (completionPublicationDelta 5) := by decide +kernel

theorem parallel_natural_exhaustion_publishes_completed_body_even_with_true_condition :
    let before := { probeRetired with tokens := [], variables :=
      { probeRetired.variables with process := probeEarly.variables.process } }
    let after := (completeParallelScope? probeEntry before (probeBody 6)).getD initialState
    candidateFlowNodeOccurrenceDeltaForOwnedOperation? cohortProgram before after
      completionPublicationOperation (probeBody 6) ⟨"retire"⟩ 1 =
      some (completionPublicationDelta 6) := by decide +kernel

def retirementPublicationOperations : List SemanticOperation :=
  [ completionPublicationOperation,
    .awaitEffect ⟨"effect"⟩ ⟨⟨"Check"⟩⟩ ⟨"effect-in"⟩ ⟨"effect-out"⟩
      { scopedEffect with inputMappings := [] } none,
    .reachNoneEnd ⟨"end"⟩ ⟨⟨"BodyEnd"⟩⟩ ⟨"done"⟩,
    completionPublicationEntryOperation,
    .duplicate ⟨"fork"⟩ ⟨⟨"Fork"⟩⟩ ⟨"check"⟩ [⟨"effect-in"⟩, ⟨"human-in"⟩],
    .awaitUserTask ⟨"human"⟩ ⟨⟨"Review"⟩⟩ ⟨"human-in"⟩ ⟨"human-out"⟩ ⟨⟨"Review"⟩, none, none⟩,
    .synchronize ⟨"join"⟩ ⟨⟨"Join"⟩⟩ [⟨"effect-out"⟩, ⟨"human-out"⟩] ⟨"done"⟩,
    .reachNoneEnd ⟨"parent-end"⟩ ⟨⟨"ParentEnd"⟩⟩ ⟨"finished"⟩,
    .completeScope ⟨"root-complete"⟩ ⟨⟨"applicants"⟩⟩ ⟨"root"⟩ none,
    .initiate ⟨"start"⟩ ⟨⟨"Start"⟩⟩ ⟨"in"⟩,
    .awaitUserTask ⟨"unrelated"⟩ ⟨⟨"OtherReview"⟩⟩ ⟨"out"⟩ ⟨"finished"⟩ ⟨⟨"OtherReview"⟩, none, none⟩ ]

def retirementPublicationPlaces : List String :=
  ["check", "done", "effect-in", "effect-out", "finished", "human-in", "human-out", "in", "out"]

def retirementPublicationProgram : Program :=
  { cohortProgram with
    identity := { cohortProgram.identity with sourceSha256 := String.ofList (List.replicate 64 'a') },
    definitionScopes := cohortProgram.definitionScopes.reverse,
    operations := retirementPublicationOperations,
    operationScopes := retirementPublicationOperations.map fun operation =>
      ⟨operation.id, ⟨if ["complete", "effect", "end", "fork", "human", "join"].contains operation.id.value
        then "body" else "root"⟩⟩,
    controlPlaces := retirementPublicationPlaces.map fun place => ⟨⟨place⟩, ⟨⟨place⟩⟩⟩,
    controlPlaceScopes := retirementPublicationPlaces.map fun place =>
      ⟨⟨place⟩, ⟨if ["in", "out", "finished"].contains place then "root" else "body"⟩⟩ }

def retirementPublicationBefore : RuntimeState :=
  let base := { probeEarly with
    tokens := [],
    scopeOccurrences := probeEarly.scopeOccurrences.filter (·.id.definitionScopeId != ⟨"other"⟩),
    activityOccurrences := probeEarly.activityOccurrences.filter (· != probeOther) }
  let human := activateUserTask base ⟨"applicants"⟩ (probeBody 6) ⟨"human-in"⟩ ⟨"human-out"⟩ ⟨⟨"Review"⟩, none, none⟩
  let effect := activateEffect human ⟨"applicants"⟩ (probeBody 6) ⟨"effect-in"⟩ ⟨"effect-out"⟩
    { scopedEffect with inputMappings := [] } none
  activateUserTask effect ⟨"applicants"⟩ probeParent ⟨"out"⟩ ⟨"finished"⟩ ⟨⟨"OtherReview"⟩, none, none⟩

def retirementPublicationAfter : RuntimeState :=
  (completeParallelScope? probeEntry retirementPublicationBefore (probeBody 5)).getD initialState

def retirementPublicationDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [], ended := [
      ⟨.wait ⟨⟨"applicants"⟩, ⟨"Check"⟩, 1⟩, .cancelled⟩,
      ⟨.wait ⟨⟨"applicants"⟩, ⟨"Review"⟩, 1⟩, .cancelled⟩,
      ⟨.scope (probeBody 5), .completed⟩, ⟨.scope (probeBody 6), .cancelled⟩ ] }

def retirementCandidate (program : Program) (before after : RuntimeState)
    (owner : ScopeOccurrenceId := probeBody 5) : Option UnnumberedFlowNodeOccurrenceDelta :=
  candidateFlowNodeOccurrenceDeltaForOwnedOperation? program before after
    completionPublicationOperation owner ⟨"retire"⟩ 0

theorem parallel_retirement_publication_fixture_has_independent_open_projection :
    programWellFormed retirementPublicationProgram = true ∧
    (projectOpenFlowNodeOccurrences? retirementPublicationProgram retirementPublicationBefore).isSome = true ∧
    (projectOpenFlowNodeOccurrences? retirementPublicationProgram retirementPublicationAfter).isSome = true := by
  decide +kernel

theorem parallel_early_completion_cancels_pending_waits_and_preserves_unrelated_work :
    retirementCandidate retirementPublicationProgram retirementPublicationBefore retirementPublicationAfter =
      some retirementPublicationDelta ∧
    retirementPublicationAfter.waits = retirementPublicationBefore.waits.filter (·.owner == probeParent) ∧
    retirementPublicationAfter.effectWaits = [] ∧ retirementPublicationAfter.variables.activities = [] ∧
    retirementPublicationAfter.variables.process = retirementPublicationBefore.variables.process := by
  decide +kernel

theorem parallel_completion_candidate_is_predecessor_derived_and_after_oracle_is_independent :
    retirementCandidate retirementPublicationProgram retirementPublicationBefore initialState =
      some retirementPublicationDelta ∧
    acceptFlowNodeOccurrenceCandidate? retirementPublicationProgram retirementPublicationBefore
      retirementPublicationAfter retirementPublicationDelta = some retirementPublicationDelta ∧
    acceptFlowNodeOccurrenceCandidate? retirementPublicationProgram retirementPublicationBefore
      retirementPublicationBefore retirementPublicationDelta = none := by decide +kernel

theorem parallel_completion_publication_refuses_stale_ambiguous_and_malformed_bindings :
    let candidate := fun program before => retirementCandidate program before probeRetired
    retirementCandidate cohortProgram probeSettled probeRetired (probeBody 6) = none ∧
    retirementCandidate cohortProgram probeRetired probeRetired (probeBody 5) = none ∧
    candidate cohortProgram { probeSettled with parallelScopeControllers := [] } = none ∧
    candidate cohortProgram { probeSettled with activityOccurrences :=
      probeSettled.activityOccurrences ++ probeSettled.activityOccurrences } = none ∧
    candidate cohortProgram { probeSettled with variables := { probeSettled.variables with
      scopes := probeSettled.variables.scopes.filter (·.owner != probeBody 6) } } = none ∧
    candidate cohortProgram { probeSettled with scopeOccurrences :=
      ⟨probeBody 7, some probeParent⟩ :: probeSettled.scopeOccurrences } = none ∧
    candidate cohortProgram { probeSettled with variables := { probeSettled.variables with
      scopes := ⟨probeBody 7, []⟩ :: probeSettled.variables.scopes } } = none ∧
    candidate cohortProgram { probeSettled with parallelScopeControllers :=
      probeSettled.parallelScopeControllers ++ probeSettled.parallelScopeControllers.map fun row =>
        { row with id := { row.id with activation := 99 } } } = none ∧
    candidate { cohortProgram with operations := cohortProgram.operations ++ [completionPublicationOperation] }
      probeSettled = none ∧
    candidate { cohortProgram with operationScopes := cohortProgram.operationScopes.filter (·.operationId != ⟨"complete"⟩) }
      probeSettled = none ∧
    candidate { cohortProgram with definitionScopes := cohortProgram.definitionScopes.map fun definition =>
      if definition.id == ⟨"body"⟩ then { definition with originElementId := ⟨"Other"⟩ } else definition }
      probeSettled = none := by decide +kernel

#eval show IO Unit from do
  for count in [2, 16] do
    let bindings := effectReady.variables.process.bindings.map fun binding => if binding.name == "applicants" then
      ⟨"applicants", .stringList (List.replicate count "same")⟩ else binding
    let ready := { effectReady with variables := { effectReady.variables with process := { bindings } } }
    let some entered := applyInternalOperationOccurrence? cohortProgram ready ⟨⟨"enter"⟩, probeParent⟩
      | throw (IO.userError "cohort entry refused")
    let missingInput := { entered with
      variables := { entered.variables with
        process := { bindings := entered.variables.process.bindings.filter (·.name != "tenant") } } }
    unless (deriveInternalOccurrenceFrontier? cohortProgram missingInput).isNone do
      throw (IO.userError "failed Service input disappeared from the complete frontier")
    let some batch := prepareInternalOccurrenceBatch? cohortProgram entered
      | throw (IO.userError s!"{count}-body occurrence cohort preparation refused")
    let some successors := applyInternalOccurrenceBatch? cohortProgram entered batch
      | throw (IO.userError "occurrence cohort application refused")
    unless successors.length == count do throw (IO.userError "cohort lost individual steps")
    let some final := successors.getLast? | throw (IO.userError "cohort has no final state")
    let waiting := { final with effectActivations := [⟨⟨"Check"⟩, 9007199254740991⟩] }
    unless deriveInternalOccurrenceFrontier? cohortProgram waiting == some [] do
      throw (IO.userError "an already-armed wait incorrectly required another issuance slot")
    unless final.effectWaits.map (fun wait => (wait.owner.activation, wait.activation)) ==
        (List.range count).map (fun index => (index + 5, index + 1)) && final.tokens.isEmpty do
      throw (IO.userError "cohort did not preserve exact owner-to-slot assignment")
    let reordered := { entered with
      scopeOccurrences := entered.scopeOccurrences.reverse
      variables := { entered.variables with scopes := entered.variables.scopes.reverse } }
    let some reorderedBatch := prepareInternalOccurrenceBatch? cohortProgram reordered
      | throw (IO.userError "cohort depends on storage order")
    unless reorderedBatch.members.filterMap (·.waitOccurrence?) == batch.members.filterMap (·.waitOccurrence?) do
      throw (IO.userError "storage order changed reservation slots")
    for changed in [
        { entered with parallelScopeControllers := [] },
        { entered with variables := { entered.variables with scopes := entered.variables.scopes.drop 1 } },
        { entered with scopeOccurrences := entered.scopeOccurrences.filter (·.id != probeBody 5) },
        { entered with effectActivations := [⟨⟨"Check"⟩, 1⟩] }] do
      unless (applyInternalOccurrenceBatch? cohortProgram changed batch).isNone do
        throw (IO.userError "cohort rebound stale predecessor")
    let forged := { batch with members := batch.members.reverse }
    unless (applyInternalOccurrenceBatch? cohortProgram entered forged).isNone do
      throw (IO.userError "cohort accepted forged allocation order")
    let overflow := { entered with effectActivations := [⟨⟨"Check"⟩, 9007199254740990⟩] }
    unless (prepareInternalOccurrenceBatch? cohortProgram overflow).isNone do
      throw (IO.userError "cohort allocated beyond the safe wire limit")
    let duplicates := { entered with effectActivations := [⟨⟨"Check"⟩, 0⟩, ⟨⟨"Check"⟩, 0⟩] }
    unless (prepareInternalOccurrenceBatch? cohortProgram duplicates).isNone do
      throw (IO.userError "cohort accepted duplicate counter rows")
    let some occupied := final.effectWaits.head? | throw (IO.userError "cohort missing collision witness")
    unless (prepareInternalOccurrenceBatch? cohortProgram
        { entered with effectWaits := [occupied] }).isNone do
      throw (IO.userError "cohort reused an issued anchor above its high-water mark")
    let humanOperations : List SemanticOperation := cohortProgram.operations.map fun operation =>
      match operation with
      | .awaitEffect id _ input output _ _ =>
          .awaitUserTask id ⟨⟨"Review"⟩⟩ input output ⟨⟨"Review"⟩, none, none⟩
      | _ => operation
    let humanProgram := { cohortProgram with operations := humanOperations }
    let some humanBatch := prepareInternalOccurrenceBatch? humanProgram entered
      | throw (IO.userError "human cohort preparation refused")
    let some humanStates := applyInternalOccurrenceBatch? humanProgram entered humanBatch
      | throw (IO.userError "human cohort application refused")
    let some humanFinal := humanStates.getLast? | throw (IO.userError "human cohort has no successor")
    unless humanFinal.waits.map (fun wait => (wait.owner.activation, wait.activation)) ==
        (List.range count).map (fun index => (index + 5, index + 1)) do
      throw (IO.userError "human cohort changed owner-to-slot assignment")

def decodeChoiceWire (text : String) :=
  SemanticProcessJson.parseWireJson text >>= SemanticProcessJson.decodeInternalAlternative

#eval show IO Unit from do
  let wire := r#"{"kind":"operationOccurrence","operationId":"check","owner":{"processInstanceId":"applicants","definitionScopeId":"body","activation":2}}"#
  match decodeChoiceWire wire with
  | .ok alternative =>
      unless alternative == .operationOccurrence ⟨"check"⟩ (probeBody 2) do
        throw (IO.userError "exact occurrence alternative changed during choice decoding")
  | .error message => throw (IO.userError s!"exact occurrence alternative refused: {message}")
  for activation in ["0", "-1", "1.5", "9007199254740992", "null", "\"2\""] do
    match decodeChoiceWire (wire.replace "\"activation\":2" s!"\"activation\":{activation}") with
    | .error _ => pure ()
    | .ok _ => throw (IO.userError s!"invalid choice activation admitted: {activation}")
  for (before, after) in [
      ("\"check\"", "\"\""), ("\"applicants\"", "\"\""), ("\"body\"", "\"\""),
      ("\"activation\":2", "\"activation\":2,\"extra\":true"),
      ("\"activation\":2", "\"activation\":2,\"activation\":3"),
      ("\"operationId\":\"check\",", ""),
      ("\"kind\":\"operationOccurrence\"", "\"kind\":\"operationOccurrence\",\"extra\":true")] do
    match decodeChoiceWire (wire.replace before after) with
    | .error _ => pure ()
    | .ok _ => throw (IO.userError s!"malformed exact choice admitted: {before}")
  match decodeChoiceWire (wire.replace "\"activation\":2" "\"activation\":9007199254740991") with
  | .ok (.operationOccurrence _ owner) =>
      unless owner.activation == 9007199254740991 do
        throw (IO.userError "choice decoder changed the safe activation boundary")
  | _ => throw (IO.userError "choice decoder refused the safe activation boundary")
  match decodeChoiceWire r#"{"kind":"operation","operationId":"check"}"# with
  | .ok (.operation ⟨"check"⟩) => pure ()
  | _ => throw (IO.userError "ordinary choice decoding changed")
  match decodeChoiceWire r#"{"kind":"mergeInput","operationId":"check","owner":{"processInstanceId":"applicants","definitionScopeId":"body","activation":2},"inputControlPlace":"in"}"# with
  | .ok (.mergeInput ⟨"check"⟩ owner ⟨"in"⟩) =>
      unless owner == probeBody 2 do throw (IO.userError "Merge choice owner changed")
  | _ => throw (IO.userError "Merge choice decoding changed")

end BpmnSemantics.ParallelScopeRuntimeConformance
