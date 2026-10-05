import BpmnSemantics.SemanticProcess.SequentialScopeRuntime

/-! SMIS-ADMIT-01 and SMIS-DATA-01 separate pre-entry Process requirements from initialized body lookup. -/

namespace BpmnSemantics.SemanticProcess.SequentialScopeData

open SerialBusinessTask

structure Analysis where
  entry : SequentialScopeEntry
  handlers : List String
  requiredProcessScalars : List String
  deriving Repr, DecidableEq

def protectedNames (entry : SequentialScopeEntry) : List String :=
  [entry.collectionName, entry.itemName] ++ entry.completionBooleanName.toList

def scalarReadsValid (entry : SequentialScopeEntry) (names : List String) : Bool :=
  names.all fun name => name != entry.collectionName && entry.completionBooleanName != some name

/-- CIB 2.2.0 BpmnParseUtil.parseParamValueProvider uses Java trim, preserving non-ASCII edge whitespace. -/
def bodyMappingsValid (handlers : List String) (inputs : List VariableMapping) : Bool :=
  strictlySortedStrings (inputs.map (·.target)) && inputs.all (fun mapping =>
    nameAllowed handlers mapping.target && match mapping.expression with
      | .stringLiteral value => !value.isEmpty &&
          !(value.toList.head?.any (fun c => c.toNat ≤ 32)) &&
          !(value.toList.getLast?.any (fun c => c.toNat ≤ 32)) &&
          !((value.toList.zip (value.toList.drop 1)).any fun (first, second) =>
            (first == '$' || first == '#') && second == '{')
      | .enclosingVariable name => nameAllowed handlers name
      | .localVariable _ => false)

def requirements (program : Program) : Option Analysis := do
  let [entry] := program.operations.filterMap sequentialScopeEntry? | none
  let handlers := programHandlers program
  let reserved := protectedNames entry
  if reserved.eraseDups.length != reserved.length ||
      !reserved.all (nameAllowed handlers) || !bodyMappingsValid handlers entry.bodyInputs ||
      entry.bodyInputs.any (fun mapping => reserved.contains mapping.target) then none
  else do
    let initialReads := readNames entry.bodyInputs
    if !scalarReadsValid entry initialReads then none
    else do
      let locals := entry.bodyInputs.map (·.target)
      let reads ← program.operations.mapM fun operation => do
        match operation with
        | .awaitEffect id _ _ _ effect _ =>
            let [owner] := program.operationScopes.filter (·.operationId == id) | none
            let names := readNames effect.inputMappings
            if !descriptorValid effect.descriptor ||
                !mappingsValid handlers effect.inputMappings effect.outputMappings ||
                effect.outputMappings.any (fun mapping => reserved.contains mapping.target) ||
                !scalarReadsValid entry names then none
            else some (names.filter fun name => owner.scopeId != entry.childScopeId ||
              (!locals.contains name && name != entry.itemName))
        | _ => some []
      return {
        entry, handlers,
        requiredProcessScalars := (initialReads ++ reads.flatten).eraseDups }

/-- Admission and canonical ordering are separate so finite witnesses can check each without unfolding the other. -/
def analyze (program : Program) : Option Analysis :=
  (requirements program).map fun analysis =>
    { analysis with requiredProcessScalars := analysis.requiredProcessScalars.mergeSort (fun a b => a ≤ b) }

def startValueValid (entry : SequentialScopeEntry) (binding : VariableBinding) : Bool :=
  if binding.name == entry.collectionName then
    match binding.value with
    | .stringList items => sequentialScopeCollectionWithinLimits items
    | _ => false
  else if entry.completionBooleanName == some binding.name then
    match binding.value with
    | .boolean _ => true
    | _ => false
  else scalar binding.value

def startAdmitted (program : Program) (bindings : List VariableBinding) : Bool :=
  match analyze program with
  | none => false
  | some analysis =>
      strictlySortedStrings (bindings.map (·.name)) &&
      bindings.all (fun binding => nameAllowed analysis.handlers binding.name && startValueValid analysis.entry binding) &&
      bindings.any (·.name == analysis.entry.collectionName) &&
      analysis.entry.completionBooleanName.all (fun name => bindings.any (·.name == name)) &&
      analysis.requiredProcessScalars.all (fun name => bindings.any (·.name == name))

def humanValuesAdmitted (analysis : Analysis) (bindings : List VariableBinding) : Bool :=
  strictlySortedStrings (bindings.map (·.name)) && bindings.all (fun binding =>
    nameAllowed analysis.handlers binding.name && binding.name != analysis.entry.collectionName &&
    binding.name != analysis.entry.itemName &&
    if analysis.entry.completionBooleanName == some binding.name then
      match binding.value with
      | .boolean _ => true
      | _ => false
    else scalar binding.value)

def stimulusAdmitted (program : Program) (stimulus : Stimulus) : Bool :=
  if !sequentialScopeProgramSelected program then true
  else match analyze program with
    | none => false
    | some analysis => match stimulus with
      | .startProcess _ _ instanceId bindings => !instanceId.value.isEmpty && startAdmitted program bindings
      | .completeUserTaskInstance _ _ bindings => humanValuesAdmitted analysis bindings
      | .completeEffect _ _ (.success bindings) => bindingsValid analysis.handlers bindings
      | _ => false

/-- SMIS-DATA-01 leaves command admission unchanged outside its selected profile. -/
@[simp] theorem stimulusAdmitted_unselected (program : Program) (stimulus : Stimulus)
    (unselected : sequentialScopeProgramSelected program = false) :
    stimulusAdmitted program stimulus = true := by
  simp only [stimulusAdmitted, unselected, Bool.not_false, ↓reduceIte]

end BpmnSemantics.SemanticProcess.SequentialScopeData
