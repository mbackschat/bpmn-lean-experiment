import BpmnSemantics.SemanticProcess.CallActivityIdentity
import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! # Called-Process Call Activity runtime semantics

This module owns the hidden caller/called association, exact invocation and normal-return transitions, and their declarative soundness boundary. Called-instance identity is owned by `CallActivityIdentity`; source QName resolution, public observation, and Temporal hosting remain outside this module.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def occurrenceBefore (left right : ScopeOccurrenceId) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.definitionScopeId.value ≠ right.definitionScopeId.value then
    left.definitionScopeId.value < right.definitionScopeId.value
  else left.activation < right.activation

private def callRecordBefore
    (left right : CalledProcessOccurrence) : Bool :=
  if occurrenceBefore left.caller right.caller then true
  else if left.caller = right.caller then
    if left.id.elementId.value ≠ right.id.elementId.value then
      left.id.elementId.value < right.id.elementId.value
    else left.id.activation < right.id.activation
  else false

private def insertCallRecord (record : CalledProcessOccurrence) :
    List CalledProcessOccurrence → List CalledProcessOccurrence
  | [] => [record]
  | current :: rest =>
      if callRecordBefore record current then record :: current :: rest
      else current :: insertCallRecord record rest

private def sortCallRecords :
    List CalledProcessOccurrence → List CalledProcessOccurrence
  | [] => []
  | record :: rest => insertCallRecord record (sortCallRecords rest)

private def insertScopeOccurrence (occurrence : RuntimeScopeOccurrence) :
    List RuntimeScopeOccurrence → List RuntimeScopeOccurrence
  | [] => [occurrence]
  | current :: rest =>
      if occurrenceBefore occurrence.id current.id then occurrence :: current :: rest
      else current :: insertScopeOccurrence occurrence rest

private def rootInstanceId? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId
  | .completed instanceId
  | .cancelled instanceId => some instanceId
  | .notStarted => none

private def sameCallIdentity (record : CalledProcessOccurrence)
    (caller : ScopeOccurrenceId) (elementId : NodeId) : Bool :=
  record.caller = caller && record.id.elementId.value = elementId.value

/-- The hidden call collection and parentless called roots form a one-to-one identity association. -/
def calledProcessAssociationsValid (state : RuntimeState) : Bool :=
  match rootInstanceId? state with
  | none => false
  | some hostingInstanceId =>
      match state.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.parent.isNone &&
            occurrence.id.processInstanceId = hostingInstanceId) with
      | [hostingRoot] =>
          (state.calledProcessOccurrences.all fun record =>
              record.id.processInstanceId = record.caller.processInstanceId &&
              record.id.activation > 0 &&
              record.caller = hostingRoot.id &&
              record.calledRoot.processInstanceId =
                deriveCalledProcessInstanceId record.caller.processInstanceId
                  ⟨record.id.elementId.value⟩ record.id.activation &&
              record.calledRoot.processInstanceId ≠ hostingInstanceId &&
              record.calledRoot.definitionScopeId ≠ record.caller.definitionScopeId &&
              record.calledRoot.activation = 1 &&
              (state.calledProcessOccurrences.filter fun candidate =>
                sameCallIdentity candidate record.caller
                  ⟨record.id.elementId.value⟩).length = 1 &&
              (state.scopeOccurrences.filter fun occurrence =>
                decide (occurrence.id = record.calledRoot &&
                  occurrence.parent.isNone)).length = 1) &&
            (state.scopeOccurrences.all fun occurrence =>
              if occurrence.parent.isNone &&
                  occurrence.id.processInstanceId ≠ hostingInstanceId then
                (state.calledProcessOccurrences.filter fun record =>
                  decide (record.calledRoot = occurrence.id)).length = 1
              else true)
      | _ => false

private def processInstanceClosureWithin
    (records : List CalledProcessOccurrence) (seed : List SemanticId) :
    Nat → List SemanticId
  | 0 => seed
  | fuel + 1 =>
      let expanded := (seed ++ records.filterMap fun record =>
        if seed.contains record.caller.processInstanceId then
          some record.calledRoot.processInstanceId
        else none).eraseDups
      if expanded.length = seed.length then expanded
      else processInstanceClosureWithin records expanded fuel

private def removeCalledProcessTree (state : RuntimeState)
    (record : CalledProcessOccurrence) : RuntimeState :=
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [record.calledRoot.processInstanceId]
    (state.calledProcessOccurrences.length + 1)
  let removedOwner := fun owner : ScopeOccurrenceId =>
    removed.contains owner.processInstanceId
  { state with
    scopeOccurrences := state.scopeOccurrences.filter fun occurrence =>
      !removedOwner occurrence.id
    tokens := state.tokens.filter fun token => !removedOwner token.owner
    waits := state.waits.filter fun wait => !removedOwner wait.owner
    messageWaits := state.messageWaits.filter fun wait => !removedOwner wait.owner
    timerWaits := state.timerWaits.filter fun wait => !removedOwner wait.owner
    effectWaits := state.effectWaits.filter fun wait => !removedOwner wait.owner
    selectedBranchSets := state.selectedBranchSets.filter fun selected =>
      !removedOwner selected.owner
    eventRaces := state.eventRaces.filter fun race => !removedOwner race.owner
    calledProcessOccurrences := state.calledProcessOccurrences.filter fun candidate =>
      candidate.id ≠ record.id &&
        !removedOwner candidate.caller && !removedOwner candidate.calledRoot
    variables :=
      { state.variables with
        activities := state.variables.activities.filter fun activity =>
          !removed.contains activity.owner.processInstanceId } }

/-- Invoke one exact called Process after counting every record associated with the Call identity. -/
def invokeProcessState? (state : RuntimeState) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (calledEntry : ControlPlaceId)
    (returnOperationId : OperationId) : Option RuntimeState :=
  match onlyTokenOwner? state input, rootInstanceId? state with
  | some caller, some rootInstance =>
      if calledProcessAssociationsValid state then
        if caller.processInstanceId = rootInstance then
          if (state.tokens.filter fun token =>
              decide (token.placeId = input && token.owner = caller)).length = 1 then
            if (state.calledProcessOccurrences.filter fun record =>
                sameCallIdentity record caller origin.elementId).length = 0 then
              match state.scopeOccurrences.filter fun occurrence =>
                  decide (occurrence.id = caller) with
              | [callerRoot] =>
                  if callerRoot.id = caller && callerRoot.parent.isNone then
                    let activation := callActivationCount state origin.elementId + 1
                    let calledInstanceId :=
                      deriveCalledProcessInstanceId caller.processInstanceId
                        origin.elementId activation
                    let calledRoot : ScopeOccurrenceId :=
                      { processInstanceId := calledInstanceId
                        definitionScopeId := calledRootScopeId
                        activation := 1 }
                    let record : CalledProcessOccurrence :=
                      { id :=
                          { processInstanceId := caller.processInstanceId
                            elementId := ⟨origin.elementId.value⟩
                            activation }
                        caller
                        calledProcessId
                        calledRoot
                        returnOperationId }
                    if (state.scopeOccurrences.filter fun occurrence =>
                          decide (occurrence.id.processInstanceId =
                            calledInstanceId)).length = 0 then
                      if (state.calledProcessOccurrences.filter fun candidate =>
                          decide (candidate.id = record.id ||
                            candidate.calledRoot.processInstanceId =
                              calledInstanceId)).length = 0 then
                        some
                          { state with
                            tokens := addToken (removeToken state.tokens input caller)
                              calledEntry calledRoot
                            scopeOccurrences := insertScopeOccurrence
                              { id := calledRoot, parent := none }
                              state.scopeOccurrences
                            calledProcessOccurrences := sortCallRecords
                              (record :: state.calledProcessOccurrences)
                            callActivations := setCallActivationCount state
                              origin.elementId activation }
                      else none
                    else none
                  else none
              | _ => none
            else none
          else none
        else none
      else none
  | _, _ => none

/-- Return one exact quiescent called root after counting every record associated with the return identity. -/
def returnProcessState? (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId) :
    Option RuntimeState := do
  if calledProcessAssociationsValid state then
    match state.calledProcessOccurrences.filter fun record =>
        decide (record.returnOperationId = id &&
          record.id.elementId.value = origin.elementId.value) with
    | [record] =>
        if record.calledProcessId = calledProcessId then
          if record.calledRoot.definitionScopeId = calledRootScopeId then
          match state.scopeOccurrences.filter fun occurrence =>
              decide (occurrence.id = record.calledRoot) with
          | [calledRoot] =>
              if calledRoot.parent.isNone then
                if (state.scopeOccurrences.filter fun occurrence =>
                    decide (occurrence.id = record.caller)).length = 1 then
                  if (state.scopeOccurrences.filter fun occurrence =>
                      decide (occurrence.id.processInstanceId =
                        record.calledRoot.processInstanceId &&
                        occurrence.parent.isNone)).length = 1 then
                    if scopeQuiescent state calledRoot.id then
                      let cleaned := removeCalledProcessTree state record
                      some { cleaned with
                        tokens := addToken cleaned.tokens callerOutput record.caller }
                    else none
                  else none
                else none
              else none
          | _ => none
          else none
        else none
    | _ => none
  else none

/-- Declarative invocation with explicit root ownership, fresh association, derived identity, and exact state update. -/
inductive InvokeProcessStep : RuntimeState → BpmnElementOrigin →
    ControlPlaceId → ProcessId → DefinitionScopeId → ControlPlaceId →
    OperationId → RuntimeState → Prop where
  | permitted before origin input calledProcessId calledRootScopeId calledEntry
      returnOperationId caller rootInstance callerRoot activation calledRoot record
      (owned : onlyTokenOwner? before input = some caller)
      (root : rootInstanceId? before = some rootInstance)
      (associations : calledProcessAssociationsValid before = true)
      (callerIsRoot : caller.processInstanceId = rootInstance)
      (oneInput : (before.tokens.filter fun token =>
        decide (token.placeId = input && token.owner = caller)).length = 1)
      (freshCall : (before.calledProcessOccurrences.filter fun candidate =>
        sameCallIdentity candidate caller origin.elementId).length = 0)
      (uniqueCallerRoot : before.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = caller)) = [callerRoot])
      (callerRootIdentity : callerRoot.id = caller)
      (callerRootIsRoot : callerRoot.parent = none)
      (nextActivation : activation = callActivationCount before origin.elementId + 1)
      (calledRootExact : calledRoot =
        { processInstanceId := deriveCalledProcessInstanceId
            caller.processInstanceId origin.elementId activation
          definitionScopeId := calledRootScopeId
          activation := 1 })
      (recordExact : record =
        { id :=
            { processInstanceId := caller.processInstanceId
              elementId := ⟨origin.elementId.value⟩
              activation }
          caller
          calledProcessId
          calledRoot
          returnOperationId })
      (freshCalledScopes : (before.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id.processInstanceId =
          calledRoot.processInstanceId)).length = 0)
      (freshCalledRecord : (before.calledProcessOccurrences.filter fun candidate =>
        decide (candidate.id = record.id ||
          candidate.calledRoot.processInstanceId =
            calledRoot.processInstanceId)).length = 0) :
      InvokeProcessStep before origin input calledProcessId calledRootScopeId
        calledEntry returnOperationId
        { before with
          tokens := addToken (removeToken before.tokens input caller)
            calledEntry calledRoot
          scopeOccurrences := insertScopeOccurrence
            { id := calledRoot, parent := none } before.scopeOccurrences
          calledProcessOccurrences := sortCallRecords
            (record :: before.calledProcessOccurrences)
          callActivations :=
            setCallActivationCount before origin.elementId activation }

/-- Declarative normal return with one exact association, quiescent called root, cleanup, and one caller continuation. -/
inductive ReturnProcessStep : RuntimeState → OperationId → BpmnElementOrigin →
    ProcessId → DefinitionScopeId → ControlPlaceId → RuntimeState → Prop where
  | permitted before id origin calledProcessId calledRootScopeId callerOutput
      record calledRoot
      (associations : calledProcessAssociationsValid before = true)
      (uniqueReturn : before.calledProcessOccurrences.filter (fun candidate =>
        decide (candidate.returnOperationId = id &&
          candidate.id.elementId.value = origin.elementId.value)) = [record])
      (calledProcessMatches : record.calledProcessId = calledProcessId)
      (calledScopeMatches :
        record.calledRoot.definitionScopeId = calledRootScopeId)
      (uniqueCalledRoot : before.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = record.calledRoot)) = [calledRoot])
      (calledRootIsRoot : calledRoot.parent = none)
      (uniqueCaller : (before.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id = record.caller)).length = 1)
      (uniqueProcessRoot : (before.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id.processInstanceId =
          record.calledRoot.processInstanceId &&
          occurrence.parent.isNone)).length = 1)
      (quiescent : scopeQuiescent before calledRoot.id = true) :
      ReturnProcessStep before id origin calledProcessId calledRootScopeId
        callerOutput
        { removeCalledProcessTree before record with
          tokens := addToken (removeCalledProcessTree before record).tokens
            callerOutput record.caller }

theorem invokeProcessState_sound (before after : RuntimeState)
    (origin input calledProcessId calledRootScopeId calledEntry returnOperationId)
    (result : invokeProcessState? before origin input calledProcessId
      calledRootScopeId calledEntry returnOperationId = some after) :
    InvokeProcessStep before origin input calledProcessId calledRootScopeId
      calledEntry returnOperationId after := by
  unfold invokeProcessState? at result
  generalize ownedEq : onlyTokenOwner? before input = owner? at result
  generalize rootEq : rootInstanceId? before = root? at result
  cases owner? with
  | none => simp at result
  | some caller =>
      cases root? with
      | none => simp at result
      | some rootInstance =>
          by_cases associations : calledProcessAssociationsValid before = true
          · by_cases callerIsRoot : caller.processInstanceId = rootInstance
            · subst rootInstance
              simp only [associations, if_true] at result
              by_cases oneInput : (before.tokens.filter fun token =>
                decide (token.placeId = input && token.owner = caller)).length = 1
              · by_cases freshCall : (before.calledProcessOccurrences.filter fun record =>
                  sameCallIdentity record caller origin.elementId).length = 0
                · generalize callerRootsEq : before.scopeOccurrences.filter
                    (fun occurrence => decide (occurrence.id = caller)) = callerRoots at result
                  cases callerRoots with
                  | nil =>
                      simp [freshCall] at result
                  | cons callerRoot rest =>
                      cases rest with
                      | cons second remaining =>
                          simp [freshCall] at result
                      | nil =>
                          cases callerRoot with
                          | mk callerRootId parent =>
                              by_cases callerIdentity : callerRootId = caller
                              · subst callerRootId
                                cases parent with
                                | some parentId =>
                                  simp [freshCall] at result
                                | none =>
                                  let activation := callActivationCount before
                                    origin.elementId + 1
                                  let calledRoot : ScopeOccurrenceId :=
                                    { processInstanceId := deriveCalledProcessInstanceId
                                        caller.processInstanceId origin.elementId activation
                                      definitionScopeId := calledRootScopeId
                                      activation := 1 }
                                  let record : CalledProcessOccurrence :=
                                    { id :=
                                        { processInstanceId := caller.processInstanceId
                                          elementId := ⟨origin.elementId.value⟩
                                          activation }
                                      caller
                                      calledProcessId
                                      calledRoot
                                      returnOperationId }
                                  by_cases freshScopes : (before.scopeOccurrences.filter fun occurrence =>
                                      decide (occurrence.id.processInstanceId =
                                        calledRoot.processInstanceId)).length = 0
                                  · by_cases freshRecord :
                                        (before.calledProcessOccurrences.filter fun candidate =>
                                          decide (candidate.id = record.id ||
                                            candidate.calledRoot.processInstanceId =
                                              calledRoot.processInstanceId)).length = 0
                                    · simp [freshCall, freshScopes, activation,
                                          calledRoot] at result
                                      cases result.2.2
                                      exact .permitted before origin input calledProcessId
                                        calledRootScopeId calledEntry returnOperationId caller
                                        caller.processInstanceId
                                        { id := caller, parent := none }
                                        activation calledRoot record ownedEq rootEq
                                        associations rfl oneInput freshCall callerRootsEq
                                        rfl rfl rfl rfl rfl freshScopes freshRecord
                                    · simp [freshCall, freshScopes, activation,
                                          calledRoot] at result
                                      exfalso
                                      apply freshRecord
                                      simpa [List.length_eq_zero_iff,
                                        activation, calledRoot,
                                        record] using result.2.1
                                  · simp [freshCall, freshScopes, activation,
                                        calledRoot] at result
                              · simp [freshCall, callerIdentity] at result
                · simp [freshCall] at result
              · simp at result
                exfalso
                apply oneInput
                simpa using result.1
            · simp [associations, callerIsRoot] at result
          · simp [associations] at result

theorem returnProcessState_sound (before after : RuntimeState)
    (id origin calledProcessId calledRootScopeId callerOutput)
    (result : returnProcessState? before id origin calledProcessId
      calledRootScopeId callerOutput = some after) :
    ReturnProcessStep before id origin calledProcessId calledRootScopeId
      callerOutput after := by
  unfold returnProcessState? at result
  by_cases associations : calledProcessAssociationsValid before = true
  · simp only [associations, if_true] at result
    generalize recordsEq : before.calledProcessOccurrences.filter (fun record =>
        decide (record.returnOperationId = id &&
          record.id.elementId.value = origin.elementId.value)) = records at result
    cases records with
    | nil =>
        simp at result
    | cons record rest =>
        cases rest with
        | cons second remaining =>
            simp at result
        | nil =>
            by_cases processMatches : record.calledProcessId = calledProcessId
            · by_cases scopeMatches :
                  record.calledRoot.definitionScopeId = calledRootScopeId
              · generalize rootEq : before.scopeOccurrences.filter (fun occurrence =>
                    decide (occurrence.id = record.calledRoot)) = roots at result
                cases roots with
                | nil =>
                    simp [processMatches, scopeMatches, rootEq] at result
                | cons calledRoot remainingRoots =>
                    cases remainingRoots with
                    | cons second tail =>
                        simp [processMatches, scopeMatches, rootEq] at result
                    | nil =>
                        cases calledRoot with
                        | mk calledRootId parent =>
                          cases parent with
                          | some parentId =>
                            simp [processMatches, scopeMatches, rootEq] at result
                          | none =>
                            by_cases uniqueCaller : (before.scopeOccurrences.filter fun occurrence =>
                              decide (occurrence.id = record.caller)).length = 1
                            · by_cases uniqueProcessRoot :
                                (before.scopeOccurrences.filter fun occurrence =>
                                  decide (occurrence.id.processInstanceId =
                                    record.calledRoot.processInstanceId &&
                                    occurrence.parent.isNone)).length = 1
                              · by_cases quiescent : scopeQuiescent before calledRootId = true
                                · simp [processMatches, scopeMatches, rootEq,
                                      uniqueCaller, quiescent] at result
                                  cases result.2
                                  exact .permitted before id origin calledProcessId
                                    calledRootScopeId callerOutput record
                                    { id := calledRootId, parent := none }
                                    associations recordsEq processMatches scopeMatches
                                    rootEq rfl uniqueCaller uniqueProcessRoot quiescent
                                · simp [processMatches, scopeMatches, rootEq,
                                    uniqueCaller, quiescent] at result
                              · simp [processMatches, scopeMatches, rootEq,
                                  uniqueCaller] at result
                                exfalso
                                apply uniqueProcessRoot
                                simpa using result.1
                            · simp [processMatches, scopeMatches, rootEq,
                                uniqueCaller] at result
              · simp [processMatches, scopeMatches] at result
            · simp [processMatches] at result
  · simp [associations] at result

/-- Every permitted return removes the unique association tree and emits one exact caller-owned continuation update. -/
theorem return_step_removes_exact_association_and_emits_one_continuation
    (before after : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId)
    (transition : ReturnProcessStep before id origin calledProcessId
      calledRootScopeId callerOutput after) :
    ∃ record calledRoot,
      before.calledProcessOccurrences.filter (fun candidate =>
        decide (candidate.returnOperationId = id &&
          candidate.id.elementId.value = origin.elementId.value)) = [record] ∧
      before.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = record.calledRoot)) = [calledRoot] ∧
      scopeQuiescent before calledRoot.id = true ∧
      record ∉ after.calledProcessOccurrences ∧
      after =
        { removeCalledProcessTree before record with
          tokens := addToken (removeCalledProcessTree before record).tokens
            callerOutput record.caller } := by
  cases transition with
  | permitted record calledRoot _ uniqueReturn _ _ uniqueCalledRoot _ _ _ quiescent =>
      refine ⟨record, calledRoot, uniqueReturn, uniqueCalledRoot, quiescent, ?_, rfl⟩
      simp [removeCalledProcessTree]

end BpmnSemantics.SemanticProcess
