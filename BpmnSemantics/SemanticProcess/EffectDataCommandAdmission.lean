module

public import BpmnSemantics.SemanticProcess.EffectCompletion
public import BpmnSemantics.SemanticProcess.EffectDataAdmission
public import BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.EffectDataAdmission

/-! # Structured effect-data command boundary

Result patching, effect completion and command admission for `portableEffectDataProfileId`. The
result path is the serial one generalized over `EffectMappingValuePolicy`: `serialEffectPatch?` and its
callers stay the scalar definitions, and the `_scalar` theorems pin the `scalar` arm to them. The
guard is a separate predicate rather than a fourth profile in `serialBusinessCommandAdmitted`, whose
conjunction shape is projected positionally by the serial and mixed-task proofs.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- SBT-RESULT-01 over the policy: each distinct source exactly once, each value a policy member. -/
def serialEffectPatchUnder? (policy : EffectMappingValuePolicy) (handlers : List String)
    (outputs : List VariableMapping) (bindings patch : List VariableBinding) :
    Option (List VariableBinding) := do
  if !(EffectData.bindingsValidUnder policy handlers patch) then none
  else do
    let sources ← outputs.mapM fun mapping => match mapping.expression with
      | .localVariable name => some name
      | _ => none
    if !(sources.eraseDups.length == patch.length &&
        sources.all (fun name => patch.any (·.name == name))) then none
    else do
      let writes ← outputs.mapM fun mapping => match mapping.expression with
        | .localVariable name => do
            let value ← enclosingVariableUnder? policy patch name
            return { name := mapping.target, value : VariableBinding }
        | _ => none
      return mergeProcessVariableBindings bindings writes

theorem serialEffectPatchUnder?_scalar (handlers : List String) (outputs : List VariableMapping)
    (bindings patch : List VariableBinding) :
    serialEffectPatchUnder? .scalar handlers outputs bindings patch =
      serialEffectPatch? handlers outputs bindings patch := by
  unfold serialEffectPatchUnder? serialEffectPatch?
  rw [EffectData.bindingsValidUnder_scalar]
  simp only [enclosingVariableUnder?_scalar]
  rfl

/-- PBV-EFF-02: a result patch holding an over-bound String is refused before any write. -/
theorem serialEffectPatchUnder?_refuses_overlong_string {handlers : List String}
    {outputs : List VariableMapping} {bindings patch : List VariableBinding} {binding : VariableBinding}
    {value : String} (member : binding ∈ patch) (string : binding.value = .string value)
    (over : 1024 < value.utf8ByteSize) :
    serialEffectPatchUnder? .singletonBusinessItem handlers outputs bindings patch = none := by
  have refused := singletonBusinessItem_refuses_overlong_string true over
  have invalid : EffectData.bindingsValidUnder .singletonBusinessItem handlers patch = false := by
    have none_admitted : (patch.all fun binding => SerialBusinessTask.nameAllowed handlers binding.name &&
        EffectMappingValuePolicy.singletonBusinessItem.admits true binding.value) = false :=
      List.all_eq_false.mpr ⟨binding, member, by simp [string, refused]⟩
    simp [EffectData.bindingsValidUnder, EffectData.bindingsValidWith, none_admitted]
  simp [serialEffectPatchUnder?, invalid]

def completeSerialActivityScopeUnder? (policy : EffectMappingValuePolicy) (handlers : List String)
    (variables : ScopedVariables) (owner : EffectOccurrenceId) (outputs : List VariableMapping)
    (result : EffectExecutionResult) : Option ScopedVariables := do
  match variables.activities.filter (activityScopeMatches owner), result with
  | [_], .success patch =>
      let bindings ← serialEffectPatchUnder? policy handlers outputs variables.process.bindings patch
      return { variables with
        process := { bindings }
        activities := variables.activities.filter fun scope => !activityScopeMatches owner scope }
  | _, _ => none

def completeSerialEffectUnder? (policy : EffectMappingValuePolicy) (program : Program)
    (state : RuntimeState) (effectId : EffectOccurrenceId) (result : EffectExecutionResult) :
    Option RuntimeState := do
  match state.effectWaits.filter (effectIdNamesWait effectId) with
  | [wait] =>
      let variables ← completeSerialActivityScopeUnder? policy (SerialBusinessTask.programHandlers program)
        state.variables effectId wait.outputMappings result
      return { state with
        effectWaits := state.effectWaits.erase wait
        variables
        tokens := addToken state.tokens wait.output wait.owner }
  | _ => none

theorem completeSerialActivityScopeUnder?_scalar (handlers : List String) (variables : ScopedVariables)
    (owner : EffectOccurrenceId) (outputs : List VariableMapping) (result : EffectExecutionResult) :
    completeSerialActivityScopeUnder? .scalar handlers variables owner outputs result =
      completeSerialActivityScope? handlers variables owner outputs result := by
  unfold completeSerialActivityScopeUnder? completeSerialActivityScope?
  simp only [serialEffectPatchUnder?_scalar]
  rfl

theorem completeSerialEffectUnder?_scalar (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) :
    completeSerialEffectUnder? .scalar program state effectId result =
      completeSerialEffect? program state effectId result := by
  unfold completeSerialEffectUnder? completeSerialEffect?
  simp only [completeSerialActivityScopeUnder?_scalar]
  rfl

namespace EffectData

/-- SBT-REFUSE-01 for a Service-only chain: root ownership and the complete declaration/wait/local join. -/
def runtimeAssociationsValid (program : Program) (state : RuntimeState) : Bool :=
  let ownerValid := fun (owner : ScopeOccurrenceId) =>
    state.control == .running owner.processInstanceId &&
      (state.scopeOccurrences.filter (·.id == owner)).length == 1 &&
      program.definitionScopes.any (·.id == owner.definitionScopeId)
  state.messageWaits.isEmpty && state.timerWaits.isEmpty && state.effectIncidents.isEmpty &&
    state.eventRaces.isEmpty && state.activityOccurrences.isEmpty &&
    state.calledProcessOccurrences.isEmpty && state.sequentialMultiInstanceControllers.isEmpty &&
    state.parallelMultiInstanceControllers.isEmpty && state.compensationHandlerEffectWaits.isEmpty &&
    state.waits.isEmpty &&
    state.effectWaits.length + state.tokens.length + (if state.initiationPending then 1 else 0) ≤ 1 &&
    state.effectWaits.all (fun wait => ownerValid wait.owner &&
      wait.processInstanceId == wait.owner.processInstanceId &&
      (program.operations.filter (fun operation => match operation with
        | .awaitEffect _ _ _ output effect none => effect.elementId == wait.elementId &&
            effect.descriptor == wait.descriptor && output == wait.output &&
            effect.outputMappings == wait.outputMappings && wait.bpmnErrorRoute.isNone &&
            inputSnapshotMatchesUnder (programEffectMappingValuePolicy program) effect.inputMappings
              wait.arguments
        | _ => false)).length == 1 &&
      match state.variables.activities.filter (activityScopeMatches
          ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩) with
      | [scope] => scope.bindings == wait.arguments
      | _ => false) &&
    state.variables.activities.all (fun scope =>
      (state.effectWaits.filter (fun wait => activityScopeMatches
        ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩ scope)).length == 1)

/-- Only Start and effect completion exist in this profile; a Human completion has no wait to address. -/
def commandAdmitted (program : Program) (state : RuntimeState) (stimulus : Stimulus) : Bool :=
  if program.identity.semanticProfile != portableEffectDataProfileId then true
  else programWellFormed program && programProfileCapabilitiesValid program &&
    bindingsValidUnder (programEffectMappingValuePolicy program) (SerialBusinessTask.programHandlers program)
      state.variables.process.bindings &&
    runtimeAssociationsValid program state &&
    (match state.control with
      | .notStarted => state == initialState
      | .running instanceId | .completed instanceId => runtimeStateWellFormed program instanceId state
      | _ => false) &&
    match stimulus with
    | .startProcess _ _ instanceId _ => !instanceId.value.isEmpty
    | .completeEffect .. => true
    | _ => false

@[simp] theorem commandAdmitted_of_other_profile (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) (other : program.identity.semanticProfile ≠ portableEffectDataProfileId) :
    commandAdmitted program state stimulus = true := by
  unfold commandAdmitted
  simp [other]

end EffectData
end BpmnSemantics.SemanticProcess
