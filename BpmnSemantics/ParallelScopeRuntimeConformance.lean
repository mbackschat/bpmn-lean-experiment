import BpmnSemantics.SemanticProcess.ParallelScopeRuntime

/-! PMIS lifecycle fixtures distinguish exact body retirement from whole-Activity cancellation and retain unrelated ownership. -/

namespace BpmnSemantics.ParallelScopeRuntimeConformance

open BpmnSemantics.SemanticProcess

private def probeParent : ScopeOccurrenceId := ⟨⟨"applicants"⟩, ⟨"root"⟩, 1⟩
private def probeBody (activation : Nat) : ScopeOccurrenceId := ⟨⟨"applicants"⟩, ⟨"body"⟩, activation⟩
private def probeOther : ActivityOccurrence :=
  { processInstanceId := ⟨"applicants"⟩, activityElementId := ⟨"Other"⟩, activation := 1,
    owner := probeParent, body := .childScope ⟨⟨"applicants"⟩, ⟨"other"⟩, 1⟩, attachedHandlers := [] }
private def probeEntry : ParallelScopeEntry :=
  ⟨⟨"enter"⟩, ⟨"Checks"⟩, ⟨"in"⟩, ⟨"check"⟩, ⟨"body"⟩, ⟨"out"⟩, "applicants", "applicant", [], some "approved"⟩
private def probeReady : RuntimeState :=
  { initialState with
    control := .running ⟨"applicants"⟩,
    scopeOccurrences := [⟨probeParent, none⟩, ⟨⟨⟨"applicants"⟩, ⟨"other"⟩, 1⟩, some probeParent⟩],
    activityOccurrences := [probeOther], tokens := [⟨⟨"in"⟩, probeParent⟩],
    scopeActivations := [⟨⟨"body"⟩, 4⟩],
    variables := { emptyScopedVariables with process := { bindings :=
      [⟨"applicants", .stringList ["same", "same"]⟩, ⟨"approved", .boolean false⟩] } } }
private def probeActive : RuntimeState := (enterParallelScope? probeEntry probeReady probeParent).getD initialState
private def probeSettled : RuntimeState :=
  { probeActive with tokens := probeActive.tokens.filter (·.owner != probeBody 5) }
private def probeRetired : RuntimeState := (completeParallelScope? probeEntry probeSettled (probeBody 5)).getD initialState

private def probePairedProgram : Program :=
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

private def probeEarly : RuntimeState :=
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

end BpmnSemantics.ParallelScopeRuntimeConformance
