import BpmnSemantics.SemanticProcess.MixedTaskControlFlowProgressProofs

/-! MBERR-CATCH-01, MBERR-MAP-01 and MBERR-PROGRESS-01 derive attached Error completion and bounded resumption from an actual committed Start. Route selection belongs to the current wait; shared Error codes supply no authority to select another Service Task's continuation. -/

namespace BpmnSemantics.SemanticProcess.MixedTaskControlFlow

/-- Actual reachability supplies readiness and unique ownership; callers supply only the current wait's attached route and its valid result payload. -/
theorem reached_attached_business_error_commits (program : Program) (analysis : Analysis)
    (startCommandId commandId processId instanceId : SemanticId)
    (initialBindings : List VariableBinding) (reached : RuntimeState)
    (wait : EffectWait) (route : BpmnErrorRoute) (message : Option String)
    (patch : List VariableBinding) (sources : List String)
    (profile : program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess startCommandId processId instanceId initialBindings)).outcome = .committed)
    (reachable : SerialBusinessTask.ExecutionReachable program (admitStimulus program initialState
      (.startProcess startCommandId processId instanceId initialBindings)).state reached)
    (live : wait ∈ reached.effectWaits) (attached : wait.bpmnErrorRoute = some route)
    (valid : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) patch = true)
    (collected : wait.outputMappings.mapM (fun mapping => match mapping.expression with
      | .localVariable name => some name | _ => none) = some sources)
    (count : sources.eraseDups.length = patch.length)
    (covered : sources.all (fun name => patch.any (·.name == name)) = true) :
    let effectId : EffectOccurrenceId := ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩
    ∃ (owner : ScopeOccurrenceId) (bindings : List VariableBinding) (after : RuntimeState),
      owner.processInstanceId = instanceId ∧
      serialEffectPatch? (SerialBusinessTask.programHandlers program) wait.outputMappings
        reached.variables.process.bindings patch = some bindings ∧
      after = { reached with
        effectWaits := reached.effectWaits.erase wait
        variables := { reached.variables with
          process := { bindings }
          activities := reached.variables.activities.filter (fun scope => !activityScopeMatches effectId scope) }
        tokens := [⟨route.output, wait.owner⟩] } ∧
      admitStimulus program reached (.completeEffect commandId effectId (.bpmnError route.code message patch)) =
        { outcome := .committed, state := after } ∧
      after.effectWaits = [] ∧ after.variables.activities = [] ∧
      SerialBusinessTask.RootFrame owner after ∧ AtPosition program analysis after ∧
      SerialBusinessTask.ExecutionReachable program (admitStimulus program initialState
        (.startProcess startCommandId processId instanceId initialBindings)).state after ∧
      ∀ fuel index ordinal, scenarioClosureLimit ≤ fuel →
        let closed := InternalCommutation.closeScheduledTraced fuel program commandId index ordinal [] after
        closed.failed = false ∧ SerialBusinessTask.ExecutionReachable program
          (admitStimulus program initialState
            (.startProcess startCommandId processId instanceId initialBindings)).state closed.state ∧
          (closed.state.waits ≠ [] ∨ closed.state.effectWaits ≠ [] ∨ closed.state.control = .completed instanceId) := by
  let effectId : EffectOccurrenceId := ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩
  obtain ⟨owner, instanceEq, _, _, framed, indexed, associations, runtime, _⟩ :=
    reached_invariant program analysis startCommandId processId instanceId initialBindings reached
      (Or.inr profile) analyzed committed reachable
  have static := guarded_program_admission program initialState
    (.startProcess startCommandId processId instanceId initialBindings) (Or.inr profile)
    (serial_committed_ingress_has_checked_predecessor program initialState _ committed)
  have fields : reached.tokens = [] ∧ reached.effectWaits = [wait] ∧
      reached.variables.activities =
        [{ owner := .effectOccurrence effectId, bindings := wait.arguments }] := by
    obtain ⟨_, position, _⟩ := indexed
    cases position <;> simp_all [SerialBusinessTask.frontierFields, effectId]
  have identity := (framed.2.2.1 wait live).2
  have running : reached.control = .running wait.processInstanceId := by
    rcases framed.2.2.2.1 with ⟨running, _⟩ | ⟨_, _, _, _, empty, _⟩ <;> simp_all
  have occurrence : reached.effectWaits.filter (effectIdNamesWait effectId) = [wait] := by
    simp [fields.2.1, effectId, effectIdNamesWait]
  have owned : reached.variables.activities.filter (activityScopeMatches effectId) =
      [{ owner := .effectOccurrence effectId, bindings := wait.arguments }] := by
    simp [fields.2.2, activityScopeMatches, localDataOwnerMatches]
  obtain ⟨bindings, mapped⟩ := SerialBusinessTask.serial_patch_exists
    (SerialBusinessTask.programHandlers program) wait.outputMappings reached.variables.process.bindings
    patch sources collected valid count covered
  let after : RuntimeState := { reached with
    effectWaits := reached.effectWaits.erase wait
    variables := { reached.variables with
      process := { bindings }
      activities := reached.variables.activities.filter (fun scope => !activityScopeMatches effectId scope) }
    tokens := [⟨route.output, wait.owner⟩] }
  have completed : completeBusinessEffect? (SerialBusinessTask.programHandlers program) reached effectId
      (.bpmnError route.code message patch) = some after := by
    simp [completeBusinessEffect?, occurrence, effectResultOutput, attached,
      completeSerialActivityScope?, owned, mapped, after, fields.1, addToken, canonicalInsertBy]
  have ownerRuntime : runtimeStateWellFormed program owner.processInstanceId reached = true := by
    simpa [instanceEq] using runtime
  have guarded := indexed_completion_guard program analysis reached owner
    (.completeEffect commandId effectId (.bpmnError route.code message patch)) (Or.inr profile)
    static.1 static.2 framed indexed associations ownerRuntime trivial
  have noCompensation := (admitted_serial_guard_has_no_foreign_effects program reached
    (.completeEffect commandId effectId (.bpmnError route.code message patch)) (Or.inr profile) guarded).2
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  have admitted : admitStimulus program reached
      (.completeEffect commandId effectId (.bpmnError route.code message patch)) =
      { outcome := .committed, state := after } := by
    rw [serial_completion_admission_eq_dispatch program analysis reached
      (.completeEffect commandId effectId (.bpmnError route.code message patch)) (Or.inr profile)
      analyzed framed.2.2.2.2.1
      (indexed_collection_storage program analysis reached owner framed indexed) guarded trivial]
    simp [dispatchStimulus, snapshots, running, noCompensation, occurrence, profile, completed, effectId]
  have preserved := effect_completion_preserves_position program analysis reached after effectId
    (.bpmnError route.code message patch) static.1 analyzed indexed owner framed completed
  have afterReachable : SerialBusinessTask.ExecutionReachable program (admitStimulus program initialState
      (.startProcess startCommandId processId instanceId initialBindings)).state after := by
    have step := SerialBusinessTask.ExecutionReachable.effect commandId effectId
      (.bpmnError route.code message patch) reachable
    simpa [admitted] using step
  refine ⟨owner, bindings, after, instanceEq, mapped, rfl, admitted, ?_, ?_,
    preserved.1, preserved.2, afterReachable, ?_⟩
  · simp [after, fields.2.1]
  · simp [after, fields.2.2, activityScopeMatches, localDataOwnerMatches]
  · intro fuel index ordinal within
    exact reached_scheduled_closure_is_bounded program analysis startCommandId commandId processId instanceId
      initialBindings after fuel index ordinal (Or.inr profile) analyzed committed afterReachable within

end BpmnSemantics.SemanticProcess.MixedTaskControlFlow
