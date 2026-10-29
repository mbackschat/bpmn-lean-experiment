module

public import BpmnSemantics.SemanticProcess.ScopeVariableData
public import BpmnSemantics.SemanticProcess.EffectDataMapping
import all BpmnSemantics.SemanticProcess.EffectMappingValuePolicy
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Nested embedded scope data

Name resolution, frame initialization and output writes for `nestedScopeDataProfileId`, per the
[nested scope data specification](../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#stable-rules).
A frame is the existing occurrence-keyed `ScopeVariableScope`; a scope's declarations are the
Program's `scopeLocalData` record for its definition.

The chain is walked over live scope occurrences, from the performing occurrence through its parents to
its instance root, selecting each frame by exact owner (CSD-CHAIN-01 of the
[concurrent scope data proposal](../../docs/capsules/CONCURRENT-SCOPE-DATA-PROPOSAL.md#stable-rules)).
Two live occurrences of one definition are two owners, so a sibling's frame is never on the chain.
Every operation depends only on the Program, the live occurrences and `ScopedVariables`.
-/

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`effectMappingValuePolicy]

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The nested scope-data profile, and a data-bearing embedded completion Program, whose frames resolve by
the same occurrence chain; every value check takes that Program's effect policy. -/
def nestedScopeDataProgram (program : Program) : Bool :=
  program.identity.semanticProfile == nestedScopeDataProfileId || embeddedScopeDataBearing program

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`nestedScopeDataProgram]

theorem nestedScopeDataProgram_of_profile_value {program : Program} {value : String}
    (selected : program.identity.semanticProfile.value = value)
    (distinct : value ≠ nestedScopeDataProfileId.value := by decide +kernel)
    (otherScope : value ≠ embeddedCompletionProfileId.value := by decide +kernel) :
    nestedScopeDataProgram program = false := by
  simp only [nestedScopeDataProgram, embeddedScopeDataBearing_of_profile_value selected otherScope, Bool.or_false,
    beq_eq_false_iff_ne]
  intro same
  apply distinct
  rw [← selected, same]

/-- A scalar effect policy excludes every Program whose frames resolve by the occurrence chain. -/
theorem nestedScopeDataProgram_false_of_scalar {program : Program}
    (scalar : programEffectMappingValuePolicy program = .scalar) : nestedScopeDataProgram program = false := by
  unfold programEffectMappingValuePolicy at scalar
  cases bearing : embeddedScopeDataBearing program with
  | true => simp [bearing] at scalar
  | false =>
      cases nested : program.identity.semanticProfile == nestedScopeDataProfileId with
      | false => simp [nestedScopeDataProgram, bearing, nested]
      | true =>
          simp only [beq_iff_eq] at nested
          simp [bearing, effectMappingValuePolicy, nested] at scalar

namespace NestedScopeData

/-- Only the nested scope-data profile consults its table, so a Program of any other profile behaves
identically whatever table it carries; admission separately refuses such a table. -/
def recordFor? (program : Program) (scopeId : DefinitionScopeId) : Option ScopeLocalData :=
  if nestedScopeDataProgram program then
    match program.scopeLocalData.filter (·.scopeId == scopeId) with
    | [record] => some record
    | _ => none
  else none

/-- `owner` and its live ancestors, innermost first, ending at the parentless instance root. An
occurrence that is not live exactly once, or a parent walk the fuel cannot finish, refuses rather than
resolving past a gap. -/
def occurrenceChainWithin (occurrences : List RuntimeScopeOccurrence) :
    Nat → ScopeOccurrenceId → Option (List ScopeOccurrenceId)
  | 0, _ => none
  | fuel + 1, owner =>
      match occurrences.filter (·.id == owner) with
      | [occurrence] =>
          match occurrence.parent with
          | none => some [owner]
          | some parent => (occurrenceChainWithin occurrences fuel parent).map (owner :: ·)
      | _ => none

def occurrenceChain (occurrences : List RuntimeScopeOccurrence) (owner : ScopeOccurrenceId) :
    Option (List ScopeOccurrenceId) :=
  occurrenceChainWithin occurrences occurrences.length owner

def framesAt (scopes : List ScopeVariableScope) (owner : ScopeOccurrenceId) : List ScopeVariableScope :=
  scopes.filter (·.owner == owner)

/-- Whether `scopeId` is the root of a variable-mapping called Process: some invocation targets it and
every one carries mappings. Its frame stands in for the called instance's Process data
(CVM-RESOLVE-01). Two Calls of one definition may map differently, so this answers only the kind,
never the mappings. -/
def mappedCalledRoot (program : Program) (scopeId : DefinitionScopeId) : Bool :=
  nestedScopeDataProgram program &&
    match program.operations.filter (fun
        | .invokeProcess _ _ _ _ calledRootScopeId .. => calledRootScopeId == scopeId
        | _ => false) with
    | [] => false
    | invocations => invocations.all fun
        | .invokeProcess _ _ _ _ _ _ _ (.variableMappings _ _) => true
        | _ => false

/-- The `camunda:in`/`camunda:out` copies of the Call that created the called root `root`: its one
live record names the return operation, which belongs to exactly one invocation. Selecting by called
definition instead would give the second of two Calls of one definition the first Call's mappings
(CALLN-FRAME-01). -/
def calledRootMappings? (program : Program) (calls : List CalledProcessOccurrence)
    (root : ScopeOccurrenceId) : Option (List VariableMapping × List VariableMapping) :=
  if nestedScopeDataProgram program then
    match calls.filter (·.calledRoot == root) with
    | [record] =>
        match program.operations.filter (fun
            | .invokeProcess _ _ _ _ calledRootScopeId _ returned _ =>
                returned == record.returnOperationId && calledRootScopeId == root.definitionScopeId
            | _ => false) with
        | [.invokeProcess _ _ _ _ _ _ _ (.variableMappings inputs outputs)] => some (inputs, outputs)
        | _ => none
    | _ => none
  else none

/-- The called root an occurrence chain ends at, if any; resolution from it never reaches the hosting
instance's Process data. -/
def calledRootOf? (program : Program) (chain : List ScopeOccurrenceId) : Option ScopeOccurrenceId :=
  match chain.getLast? with
  | some root => if mappedCalledRoot program root.definitionScopeId then some root else none
  | none => none

inductive Owner where
  | frame (owner : ScopeOccurrenceId)
  | process
  deriving Repr, DecidableEq

/-- NSD-READ-01 and NSD-WRITE-01: the nearest chain occurrence whose frame declares `name`, a present
null included, else the Process. Only the frames are an argument, so resolution is definitionally
unaffected by Activity-local or Process data. -/
def resolveOwner? (scopes : List ScopeVariableScope) : List ScopeOccurrenceId → String → Option Owner
  | [], _ => some .process
  | occurrence :: rest, name =>
      match framesAt scopes occurrence with
      | [] => resolveOwner? scopes rest name
      | [frame] =>
          if frame.bindings.any (·.name == name) then some (.frame frame.owner)
          else resolveOwner? scopes rest name
      | _ => none

/-- NSD-READ-01 from the occurrence `reader`; every value is re-validated under the Program's effect
policy, so a stored binding is never trusted for having been written earlier. -/
def read? (program : Program) (occurrences : List RuntimeScopeOccurrence) (variables : ScopedVariables)
    (reader : ScopeOccurrenceId) (name : String) : Option VariableValue := do
  let chain ← occurrenceChain occurrences reader
  match ← resolveOwner? variables.scopes chain name with
  | .process =>
      match calledRootOf? program chain with
      | none => enclosingVariableUnder? (programEffectMappingValuePolicy program) variables.process.bindings name
      | some _ => none
  | .frame owner =>
      let frame ← selectScopeVariables? variables owner
      enclosingVariableUnder? (programEffectMappingValuePolicy program) frame.bindings name

/-- A binding read that keeps absence apart from refusal: `some none` for no binding, `none` for a
repeated binding or a value outside the Program's value domain. Call mappings copy an absent name as a
present null (CVM-IN-01, CVM-OUT-01) but never fabricate one for a refused read. -/
def bindingOutcome? (policy : EffectMappingValuePolicy) (bindings : List VariableBinding) (name : String) :
    Option (Option VariableValue) :=
  match bindings.filter (·.name == name) with
  | [] => some none
  | [binding] =>
      if policy.admits true binding.value then some (some binding.value)
      else none
  | _ => none

/-- NSD-READ-01 with absence kept apart from refusal; an undeclared name at a called root is absent. -/
def readOutcome? (program : Program) (occurrences : List RuntimeScopeOccurrence)
    (variables : ScopedVariables) (reader : ScopeOccurrenceId) (name : String) :
    Option (Option VariableValue) := do
  let chain ← occurrenceChain occurrences reader
  match ← resolveOwner? variables.scopes chain name with
  | .process =>
      match calledRootOf? program chain with
      | none => bindingOutcome? (programEffectMappingValuePolicy program) variables.process.bindings name
      | some root =>
          let [_] := framesAt variables.scopes root | none
          some none
  | .frame owner =>
      let frame ← selectScopeVariables? variables owner
      bindingOutcome? (programEffectMappingValuePolicy program) frame.bindings name

/-- NSD-WRITE-01: update the nearest declaring frame, else create or replace the Process binding, or
the called-root frame's binding when the chain ends at a called root (CVM-RESOLVE-01, as CIB's
`setVariable` creates on the process instance); never create a local and never touch another frame. -/
def write? (program : Program) (occurrences : List RuntimeScopeOccurrence) (variables : ScopedVariables)
    (writer : ScopeOccurrenceId) (binding : VariableBinding) : Option ScopedVariables := do
  let chain ← occurrenceChain occurrences writer
  match ← resolveOwner? variables.scopes chain binding.name with
  | .process =>
      match calledRootOf? program chain with
      | none =>
          some { variables with process :=
            { bindings := mergeProcessVariableBindings variables.process.bindings [binding] } }
      | some root =>
          let [frame] := framesAt variables.scopes root | none
          some { variables with scopes := variables.scopes.map fun candidate =>
            if candidate.owner = frame.owner then
              { candidate with bindings := mergeProcessVariableBindings candidate.bindings [binding] }
            else candidate }
  | .frame owner =>
      let _ ← selectScopeVariables? variables owner
      some { variables with scopes := variables.scopes.map fun frame =>
        if frame.owner = owner then
          { frame with bindings := mergeProcessVariableBindings frame.bindings [binding] }
        else frame }

def writeAll? (program : Program) (occurrences : List RuntimeScopeOccurrence) (variables : ScopedVariables)
    (writer : ScopeOccurrenceId) : List VariableBinding → Option ScopedVariables
  | [] => some variables
  | binding :: rest => do
      writeAll? program occurrences (← write? program occurrences variables writer binding) writer rest

/-- The unique live occurrence of `scopeId` together with its live parent occurrence. -/
def occurrenceWithParent? (state : RuntimeState) (scopeId : DefinitionScopeId) :
    Option (ScopeOccurrenceId × ScopeOccurrenceId) := do
  let [occurrence] := state.scopeOccurrences.filter (·.id.definitionScopeId == scopeId) | none
  let parent ← occurrence.parent
  some (occurrence.id, parent)

/-- NSD-INIT-01 after the entry rewrite: inputs read the parent's whole chain before the new frame
exists, so neither declaration order nor a sibling input can influence a value. A scope without a
record installs no frame and leaves the state exactly as entry produced it. -/
def initializeFrame? (program : Program) (state : RuntimeState) (childScopeId : DefinitionScopeId) :
    Option RuntimeState :=
  match recordFor? program childScopeId with
  | none => some state
  | some record => do
      let (child, parent) ← occurrenceWithParent? state childScopeId
      let bindings ← evaluateInputMappingsUnder? (programEffectMappingValuePolicy program)
        (read? program state.scopeOccurrences state.variables parent) record.localInputs
      if !scopeVariableNamesUnique bindings || state.variables.scopes.any (·.owner == child) then none
      else
        let frame : ScopeVariableScope :=
          { owner := child, bindings := mergeProcessVariableBindings [] bindings }
        let scopes := canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
          frame state.variables.scopes
        some { state with variables := { state.variables with scopes } }

/-- NSD-OUTPUT-01 before the completion rewrite disposes the frame: every source is read from the
completing frame before any write, and the writes start at the parent, so no output can change
another output's source. -/
def writeOutputs? (program : Program) (state : RuntimeState) (scopeId : DefinitionScopeId) :
    Option RuntimeState :=
  match recordFor? program scopeId with
  | none => some state
  | some record => do
      let (child, parent) ← occurrenceWithParent? state scopeId
      let frame ← selectScopeVariables? state.variables child
      let values ← record.localOutputs.mapM fun mapping => match mapping.expression with
        | .localVariable source => do
            let value ← enclosingVariableUnder? (programEffectMappingValuePolicy program) frame.bindings source
            some ({ name := mapping.target, value } : VariableBinding)
        | _ => none
      let variables ← writeAll? program state.scopeOccurrences state.variables parent values
      some { state with variables }

/-- Frame installation touches only data, so every control, wait and occurrence fact survives it. -/
theorem initializeFrame?_variables_only (program : Program) (state written : RuntimeState)
    (childScopeId : DefinitionScopeId) (installed : initializeFrame? program state childScopeId = some written) :
    written = { state with variables := written.variables } := by
  unfold initializeFrame? at installed
  split at installed
  · cases installed; rfl
  · simp only [Option.bind_eq_bind, Option.bind_eq_some_iff] at installed
    obtain ⟨_, _, _, _, installed⟩ := installed
    split at installed
    · contradiction
    · cases installed; rfl

/-- Output writes touch only data, so every control, wait and occurrence fact survives them. -/
theorem writeOutputs?_variables_only (program : Program) (state written : RuntimeState)
    (scopeId : DefinitionScopeId) (wrote : writeOutputs? program state scopeId = some written) :
    written = { state with variables := written.variables } := by
  unfold writeOutputs? at wrote
  split at wrote
  · cases wrote; rfl
  · simp only [Option.bind_eq_bind, Option.bind_eq_some_iff] at wrote
    obtain ⟨_, _, _, _, _, _, _, _, wrote⟩ := wrote
    cases wrote; rfl

end NestedScopeData
end BpmnSemantics.SemanticProcess
