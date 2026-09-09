import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Scope and remaining counter storage witnesses

Actual scope entry, Call invocation, and Event race arming retain independent insertion order only
through their raw collections. These witnesses distinguish canonical storage from sorted observation;
they do not establish new Program or source admission.
-/

namespace BpmnSemantics.ScopeStorageOrderConformance

open BpmnSemantics.SemanticProcess

private def root : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance"⟩, definitionScopeId := ⟨"process"⟩, activation := 1 }

private def before : RuntimeState :=
  { initialState with
    control := .running root.processInstanceId
    scopeOccurrences := [{ id := root, parent := none }]
    tokens := [{ placeId := ⟨"a-input"⟩, owner := root },
      { placeId := ⟨"z-input"⟩, owner := root }]
    scopeActivations := [{ scopeId := ⟨"a-child"⟩, count := 2 },
      { scopeId := ⟨"process"⟩, count := 1 }, { scopeId := ⟨"z-child"⟩, count := 9 }]
    callActivations := [{ elementId := ⟨"a-call"⟩, count := 2 },
      { elementId := ⟨"z-call"⟩, count := 9 }]
    eventRaceActivations := [{ elementId := ⟨"a-race"⟩, count := 2 },
      { elementId := ⟨"z-race"⟩, count := 9 }] }

private def enter (state : RuntimeState) (key : String) : Option RuntimeState :=
  enterScopeState? state ⟨key ++ "-input"⟩ ⟨key ++ "-entry"⟩ ⟨key ++ "-child"⟩

private def enterPair (first second : String) : Option RuntimeState := do
  let middle ← enter before first
  enter middle second

private def child (key : String) (activation : Nat) : RuntimeScopeOccurrence :=
  { id := { root with definitionScopeId := ⟨key ++ "-child"⟩, activation },
    parent := some root }

theorem scope_entry_stores_equal_raw_state_in_both_orders :
    canonicalCollectionOrder before = true ∧
      (enterPair "a" "z").isSome = true ∧
      enterPair "a" "z" = enterPair "z" "a" ∧
      (enterPair "a" "z").map canonicalCollectionOrder = some true ∧
      (enterPair "a" "z").map (·.scopeOccurrences) =
        some [child "a" 3, { id := root, parent := none }, child "z" 10] ∧
      (enterPair "a" "z").map (·.scopeActivations) =
        some [{ scopeId := ⟨"a-child"⟩, count := 3 },
          { scopeId := ⟨"process"⟩, count := 1 }, { scopeId := ⟨"z-child"⟩, count := 10 }] := by
  decide +kernel

private def invoke (state : RuntimeState) (key : String) : Option RuntimeState :=
  invokeProcessState? state ⟨⟨key ++ "-call"⟩⟩ ⟨key ++ "-input"⟩
    ⟨key ++ "-process"⟩ ⟨key ++ "-called-root"⟩ ⟨key ++ "-entry"⟩ ⟨key ++ "-return"⟩

private def invokePair (first second : String) : Option RuntimeState := do
  let middle ← invoke before first
  invoke middle second

theorem call_invocation_stores_equal_raw_state_and_preserves_other_marks :
    (invokePair "a" "z").isSome = true ∧
      invokePair "a" "z" = invokePair "z" "a" ∧
      (invokePair "a" "z").map canonicalCollectionOrder = some true ∧
      (invokePair "a" "z").map (·.callActivations) =
        some [{ elementId := ⟨"a-call"⟩, count := 3 },
          { elementId := ⟨"z-call"⟩, count := 10 }] ∧
      (invokePair "a" "z").map (·.scopeActivations) = some before.scopeActivations := by
  decide +kernel

private def armRace (state : RuntimeState) (key : String) : Option RuntimeState :=
  armEventRaceState? state ⟨⟨key ++ "-race"⟩⟩ ⟨key ++ "-input"⟩
    { elementId := ⟨key ++ "-message"⟩, channel := .directMessage ⟨key⟩,
      output := ⟨key ++ "-message-out"⟩, configurationOrigin := ⟨⟨key ++ "-message-flow"⟩⟩ }
    { elementId := ⟨key ++ "-timer"⟩, durationMs := 20, output := ⟨key ++ "-timer-out"⟩,
      configurationOrigin := ⟨⟨key ++ "-timer-flow"⟩⟩ }

private def armRacePair (first second : String) : Option RuntimeState := do
  let middle ← armRace before first
  armRace middle second

theorem race_arming_stores_equal_raw_state_and_preserves_other_marks :
    (armRacePair "a" "z").isSome = true ∧
      armRacePair "a" "z" = armRacePair "z" "a" ∧
      (armRacePair "a" "z").map canonicalCollectionOrder = some true ∧
      (armRacePair "a" "z").map (·.eventRaceActivations) =
        some [{ elementId := ⟨"a-race"⟩, count := 3 },
          { elementId := ⟨"z-race"⟩, count := 10 }] ∧
      (armRacePair "a" "z").map (·.callActivations) = some before.callActivations := by
  decide +kernel

theorem every_new_storage_collection_refuses_its_own_inversion :
    canonicalCollectionOrder before = true ∧
      canonicalCollectionOrder
        { before with scopeOccurrences := [{ id := root, parent := none }, child "z" 10] } = true ∧
      canonicalCollectionOrder
        { before with scopeOccurrences := [child "z" 10, { id := root, parent := none }] } = false ∧
      canonicalCollectionOrder
        { before with scopeActivations := before.scopeActivations.reverse } = false ∧
      canonicalCollectionOrder
        { before with callActivations := before.callActivations.reverse } = false ∧
      canonicalCollectionOrder
        { before with eventRaceActivations := before.eventRaceActivations.reverse } = false := by
  decide +kernel

theorem scope_storage_compares_complete_scalar_and_numeric_keys :
    scopeOwnerBefore { root with processInstanceId := ⟨"a"⟩, definitionScopeId := ⟨"z"⟩ }
      { root with processInstanceId := ⟨"z"⟩, definitionScopeId := ⟨"a"⟩ } = true ∧
      scopeOwnerBefore { root with definitionScopeId := ⟨"a"⟩, activation := 10 }
        { root with definitionScopeId := ⟨"z"⟩, activation := 2 } = true ∧
      scopeOwnerBefore { root with activation := 2 } { root with activation := 10 } = true ∧
      scopeOwnerBefore { root with processInstanceId := ⟨"\uE000"⟩ }
        { root with processInstanceId := ⟨"𐀀"⟩ } = true ∧
      scopeOwnerBefore { root with definitionScopeId := ⟨"\uE000"⟩ }
        { root with definitionScopeId := ⟨"𐀀"⟩ } = true := by
  decide +kernel

end BpmnSemantics.ScopeStorageOrderConformance
