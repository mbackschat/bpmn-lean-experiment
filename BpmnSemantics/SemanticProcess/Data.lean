module

public import BpmnSemantics.SemanticProcessContract

/-! # Semantic Process bounded data mappings

This module owns scoped binding merges, immutable containing-context input evaluation, captured input snapshots and local result mappings; profile admission selects the permitted expression and scalar subsets.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Process-owned bindings that form the public variable projection. -/
structure ProcessVariableScope where
  bindings : List VariableBinding
  deriving Repr, DecidableEq

/-- Complete semantic owner identity for one private local-data scope. -/
inductive LocalDataOwner where
  | effectOccurrence (id : EffectOccurrenceId)
  | activityOccurrence (id : ActivityOccurrenceId)
  deriving Repr, DecidableEq

/-- Semantic Process instance named by either local-data owner arm. -/
def LocalDataOwner.processInstanceId : LocalDataOwner → SemanticId
  | .effectOccurrence id => id.processInstanceId
  | .activityOccurrence id => id.processInstanceId

/-- Private bindings owned by one complete semantic effect or Activity occurrence. -/
structure ActivityVariableScope where
  owner : LocalDataOwner
  bindings : List VariableBinding
  deriving Repr, DecidableEq

/-- Passive callable interface data belongs to the complete called-root occurrence, separate from caller Properties. An absent output is unavailable; a present null remains available (CDATA-OWNER-01). -/
structure ProcessInterfaceScope where
  owner : ScopeOccurrenceId
  inputs : List VariableBinding
  outputs : List VariableBinding
  deriving Repr, DecidableEq

/-- SMIS-DATA-01 keeps embedded-body declarations on their complete scope occurrence. -/
structure ScopeVariableScope where
  owner : ScopeOccurrenceId
  bindings : List VariableBinding
  deriving Repr, DecidableEq

/-- The single runtime representation for Process, callable-interface, scope-local and Activity-local data. -/
structure ScopedVariables where
  process : ProcessVariableScope
  activities : List ActivityVariableScope
  processInterfaces : List ProcessInterfaceScope
  scopes : List ScopeVariableScope
  deriving Repr, DecidableEq

def emptyScopedVariables : ScopedVariables :=
  { process := { bindings := [] }
    activities := []
    processInterfaces := []
    scopes := [] }

def insertVariableBinding (binding : VariableBinding) :
    List VariableBinding → List VariableBinding
  | [] => [binding]
  | candidate :: remaining =>
      if binding.name < candidate.name then
        binding :: candidate :: remaining
      else
        candidate :: insertVariableBinding binding remaining

def sortVariableBindings : List VariableBinding → List VariableBinding
  | [] => []
  | binding :: remaining =>
      insertVariableBinding binding (sortVariableBindings remaining)

/-- Canonically merge a User Task completion patch into Process scope, replacing equal names and retaining all unrelated bindings. -/
def mergeProcessVariableBindings
    (existing replacements : List VariableBinding) : List VariableBinding :=
  let replacedNames := replacements.map (·.name)
  sortVariableBindings
    (replacements ++ existing.filter fun binding =>
      !replacedNames.contains binding.name)

private theorem insertVariableBinding_perm (binding : VariableBinding)
    (bindings : List VariableBinding) :
    (insertVariableBinding binding bindings).Perm (binding :: bindings) := by
  induction bindings with
  | nil => exact List.Perm.refl _
  | cons first rest ih =>
      unfold insertVariableBinding
      split
      · exact List.Perm.refl _
      · exact (List.Perm.cons first ih).trans (List.Perm.swap binding first rest)

private theorem sortVariableBindings_perm (bindings : List VariableBinding) :
    (sortVariableBindings bindings).Perm bindings := by
  induction bindings with
  | nil => exact List.Perm.refl _
  | cons first rest ih =>
      exact (insertVariableBinding_perm first (sortVariableBindings rest)).trans
        (List.Perm.cons first ih)

/-- Canonical ordering preserves exactly the patch plus unreplaced bindings; composition
availability proofs need this fact without depending on the private sorting algorithm. -/
theorem mergeProcessVariableBindings_perm (existing replacements : List VariableBinding) :
    (mergeProcessVariableBindings existing replacements).Perm
      (replacements ++ existing.filter fun binding =>
        !(replacements.map (·.name)).contains binding.name) :=
  sortVariableBindings_perm _

private theorem insertVariableBinding_strictOrder (binding : VariableBinding) (bindings : List VariableBinding)
    (ordered : bindings.Pairwise (fun left right => left.name < right.name))
    (fresh : binding.name ∉ bindings.map (·.name)) :
    (insertVariableBinding binding bindings).Pairwise (fun left right => left.name < right.name) := by
  induction bindings with
  | nil => simp [insertVariableBinding]
  | cons first rest ih =>
    obtain ⟨headOrder, tailOrder⟩ := List.pairwise_cons.mp ordered
    have different : binding.name ≠ first.name := fun same => fresh (by simp [same])
    have tailFresh : binding.name ∉ rest.map (·.name) := fun member => fresh (List.mem_cons_of_mem _ member)
    by_cases before : binding.name < first.name
    · rw [insertVariableBinding, ite_eq_left before]
      apply List.pairwise_cons.mpr
      refine ⟨?_, ordered⟩
      intro value member
      rcases List.mem_cons.mp member with rfl | later
      · exact before
      · exact String.lt_trans before (headOrder value later)
    · rw [insertVariableBinding, ite_eq_right before]
      apply List.pairwise_cons.mpr
      refine ⟨?_, ih tailOrder tailFresh⟩
      intro value member
      have included := (insertVariableBinding_perm binding rest).mem_iff.mp member
      rcases List.mem_cons.mp included with rfl | later
      · exact Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different)
      · exact headOrder value later

private theorem sortVariableBindings_strictOrder (bindings : List VariableBinding)
    (unique : (bindings.map (·.name)).Nodup) :
    (sortVariableBindings bindings).Pairwise (fun left right => left.name < right.name) := by
  induction bindings with
  | nil => simp [sortVariableBindings]
  | cons first rest ih =>
    obtain ⟨fresh, uniqueRest⟩ := List.nodup_cons.mp unique
    apply insertVariableBinding_strictOrder first (sortVariableBindings rest) (ih uniqueRest)
    intro duplicate
    exact fresh (((sortVariableBindings_perm rest).map (·.name)).mem_iff.mp duplicate)

/-- Canonical merging strictly orders names when each supplied scope/patch names a variable at most once. This exposes the actual private sorter's ordering guarantee to profile proofs. -/
theorem mergeProcessVariableBindings_strictOrder (existing replacements : List VariableBinding)
    (existingUnique : (existing.map (·.name)).Nodup)
    (replacementUnique : (replacements.map (·.name)).Nodup) :
    (mergeProcessVariableBindings existing replacements).Pairwise (fun left right => left.name < right.name) := by
  apply sortVariableBindings_strictOrder
  rw [List.map_append]
  apply List.pairwise_append.mpr
  refine ⟨replacementUnique, ?_, ?_⟩
  · have sub : (existing.filter (fun binding => !(replacements.map (·.name)).contains binding.name)).Sublist existing := List.filter_sublist
    exact (sub.map (·.name)).nodup existingUnique
  · intro left leftMember right rightMember same
    obtain ⟨binding, member, named⟩ := List.mem_map.mp rightMember
    have absent : binding.name ∉ replacements.map (·.name) := by
      simpa [List.contains_eq_mem] using (List.mem_filter.mp member).2
    exact absent (by simpa [named, ← same] using leftMember)

/-- Exact equality for discriminated local-data owners. -/
def localDataOwnerMatches (left right : LocalDataOwner) : Bool :=
  decide (left = right)

/-- Match only the effect-owned arm retained by the existing effect APIs. -/
def activityScopeMatches (owner : EffectOccurrenceId)
    (scope : ActivityVariableScope) : Bool :=
  localDataOwnerMatches (.effectOccurrence owner) scope.owner

/-- Canonical complete-identity order within the effect-owner arm. -/
def localEffectOwnerBefore
    (left right : EffectOccurrenceId) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.elementId.value ≠ right.elementId.value then
    left.elementId.value < right.elementId.value
  else
    left.activation < right.activation

/-- Canonical complete-identity order within the Activity-owner arm. -/
def localActivityOwnerBefore
    (left right : ActivityOccurrenceId) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.activityElementId.value ≠ right.activityElementId.value then
    left.activityElementId.value < right.activityElementId.value
  else
    left.activation < right.activation

/-- Canonical discriminator-first order for complete local-data ownership. -/
def localDataOwnerBefore (left right : LocalDataOwner) : Bool :=
  match left, right with
  | .effectOccurrence left, .effectOccurrence right =>
      localEffectOwnerBefore left right
  | .effectOccurrence _, .activityOccurrence _ => true
  | .activityOccurrence _, .effectOccurrence _ => false
  | .activityOccurrence left, .activityOccurrence right =>
      localActivityOwnerBefore left right

/-- Canonical order for complete discriminated local-data ownership. -/
def activityVariableScopeBefore (left right : ActivityVariableScope) : Bool :=
  localDataOwnerBefore left.owner right.owner

def insertActivityVariableScope (scope : ActivityVariableScope) :
    List ActivityVariableScope → List ActivityVariableScope
  | [] => [scope]
  | current :: rest =>
      if activityVariableScopeBefore scope current then
        scope :: current :: rest
      else
        current :: insertActivityVariableScope scope rest

/-- Add the input-mapping scope for one newly activated effect occurrence. Reachable runtime states supply a fresh complete owner. -/
def addActivityVariableScope (variables : ScopedVariables)
    (owner : EffectOccurrenceId)
    (bindings : List VariableBinding) : ScopedVariables :=
  { variables with
    activities := insertActivityVariableScope
      { owner := .effectOccurrence owner, bindings }
      variables.activities }

def evaluateInputMappings : List VariableMapping →
    Option (List VariableBinding)
  | [] => some []
  | [{ target, expression := .stringLiteral value }] =>
      some [{ name := target, value := .string value }]
  | _ => none


/-- SBT-INPUT-01 reads one immutable containing context; duplicate bindings are unavailable. -/
def enclosingVariable? (bindings : List VariableBinding) (name : String) : Option VariableValue :=
  match bindings.filter (·.name == name) with
  | [binding] => match binding.value with
      | .string _ | .null => some binding.value
      | _ => none
  | _ => none

def scalarInputLookup? (read : String → Option VariableValue) (name : String) : Option VariableValue := do
  let value ← read name
  match value with
  | .string _ | .null => some value
  | _ => none

def evaluateInputMappingsInOrder (read : String → Option VariableValue) :
    List VariableMapping → Option (List VariableBinding)
  | [] => some []
  | mapping :: rest => do
      let value ← match mapping.expression with
        | .stringLiteral value => some (.string value)
        | .enclosingVariable name => scalarInputLookup? read name
        | .localVariable _ => none
      return { name := mapping.target, value } :: (← evaluateInputMappingsInOrder read rest)

def orderedInputSnapshotMatches : List VariableMapping → List VariableBinding → Bool
  | [], [] => true
  | mapping :: mappings, binding :: bindings =>
      mapping.target == binding.name &&
        (match mapping.expression with
        | .stringLiteral value => binding.value == .string value
        | .enclosingVariable _ => match binding.value with
            | .string _ | .null => true
            | _ => false
        | .localVariable _ => false) && orderedInputSnapshotMatches mappings bindings
  | _, _ => false

/-- Inserts by ascending target. Structural rather than `List.mergeSort`, whose well-founded
recursion the kernel cannot unfold, so a kernel-decided witness can capture two or more inputs. On the
distinct targets `canonicalInputMappings?` admits, every stable ascending sort agrees. -/
def insertByTarget (mapping : VariableMapping) : List VariableMapping → List VariableMapping
  | [] => [mapping]
  | current :: rest =>
      if mapping.target ≤ current.target then mapping :: current :: rest
      else current :: insertByTarget mapping rest

def sortByTarget : List VariableMapping → List VariableMapping
  | [] => []
  | mapping :: rest => insertByTarget mapping (sortByTarget rest)

theorem insertByTarget_perm (mapping : VariableMapping) (mappings : List VariableMapping) :
    (insertByTarget mapping mappings).Perm (mapping :: mappings) := by
  induction mappings with
  | nil => exact List.Perm.refl _
  | cons current rest ih =>
      unfold insertByTarget
      split
      · exact List.Perm.refl _
      · exact (List.Perm.cons current ih).trans (List.Perm.swap mapping current rest)

theorem sortByTarget_perm (mappings : List VariableMapping) : (sortByTarget mappings).Perm mappings := by
  induction mappings with
  | nil => exact List.Perm.refl _
  | cons mapping rest ih => exact (insertByTarget_perm mapping _).trans (List.Perm.cons mapping ih)

/-- SBT-SNAPSHOT-01 treats mapping declarations by target name; duplicate targets cannot define a snapshot. -/
def canonicalInputMappings? (mappings : List VariableMapping) : Option (List VariableMapping) :=
  if (mappings.map (·.target)).Nodup then some (sortByTarget mappings)
  else none

/-- Immutable snapshots use canonical target order independently of declaration order. -/
def inputSnapshotMatches (mappings : List VariableMapping) (bindings : List VariableBinding) : Bool :=
  match canonicalInputMappings? mappings with
  | some ordered => orderedInputSnapshotMatches ordered bindings
  | none => false

def evaluateInputMappings? (read : String → Option VariableValue) (mappings : List VariableMapping) :
    Option (List VariableBinding) := do
  let ordered ← canonicalInputMappings? mappings
  evaluateInputMappingsInOrder read ordered

def evaluateEnclosingInputMappings (bindings : List VariableBinding) (mappings : List VariableMapping) :
    Option (List VariableBinding) := evaluateInputMappings? (enclosingVariable? bindings) mappings

theorem scalarInputLookup_enclosing (context : List VariableBinding) (name : String) :
    scalarInputLookup? (enclosingVariable? context) name = enclosingVariable? context name := by
  unfold scalarInputLookup? enclosingVariable?
  split
  · rename_i binding _
    cases binding.value <;> rfl
  · rfl

/-- Available scalar sources suffice independently of the order chosen for evaluation. -/
theorem evaluateInputMappingsInOrder_evaluable (read : String → Option VariableValue)
    (mappings : List VariableMapping)
    (available : ∀ mapping ∈ mappings, ∃ value,
      (match mapping.expression with
        | .stringLiteral value => some (.string value)
        | .enclosingVariable name => scalarInputLookup? read name
        | .localVariable _ => none) = some value) :
    ∃ bindings, evaluateInputMappingsInOrder read mappings = some bindings := by
  induction mappings with
  | nil => exact ⟨[], rfl⟩
  | cons mapping rest ih =>
      obtain ⟨value, found⟩ := available mapping (by simp)
      obtain ⟨tail, evaluated⟩ := ih (fun candidate member => available candidate (by simp [member]))
      exact ⟨{ name := mapping.target, value } :: tail,
        by cases expression : mapping.expression <;> simp_all [evaluateInputMappingsInOrder]⟩

/-- Canonicalization preserves source availability; duplicate target refusal is a separate premise. -/
theorem evaluateInputMappings_evaluable (read : String → Option VariableValue)
    (mappings : List VariableMapping) (unique : (mappings.map (·.target)).Nodup)
    (available : ∀ mapping ∈ mappings, ∃ value,
      (match mapping.expression with
        | .stringLiteral value => some (.string value)
        | .enclosingVariable name => scalarInputLookup? read name
        | .localVariable _ => none) = some value) :
    ∃ bindings, evaluateInputMappings? read mappings = some bindings := by
  unfold evaluateInputMappings? canonicalInputMappings?
  simp only [unique, ↓reduceIte]
  apply evaluateInputMappingsInOrder_evaluable
  intro mapping member
  exact available mapping ((sortByTarget_perm mappings).mem_iff.mp member)

theorem evaluateInputMappingsInOrder_snapshot (read : String → Option VariableValue)
    (mappings : List VariableMapping) (bindings : List VariableBinding)
    (evaluated : evaluateInputMappingsInOrder read mappings = some bindings) :
    orderedInputSnapshotMatches mappings bindings = true := by
  induction mappings generalizing bindings with
  | nil => simp [evaluateInputMappingsInOrder] at evaluated; subst bindings; rfl
  | cons mapping rest ih =>
      cases expression : mapping.expression with
      | localVariable name => simp [evaluateInputMappingsInOrder, expression] at evaluated
      | stringLiteral value =>
          cases tailEq : evaluateInputMappingsInOrder read rest with
          | none => simp [evaluateInputMappingsInOrder, expression, tailEq] at evaluated
          | some tail =>
              simp [evaluateInputMappingsInOrder, expression, tailEq] at evaluated
              subst bindings
              simpa [orderedInputSnapshotMatches, expression] using ih tail tailEq
      | enclosingVariable name =>
          cases lookup : scalarInputLookup? read name with
          | none => simp [evaluateInputMappingsInOrder, expression, lookup] at evaluated
          | some value =>
              cases tailEq : evaluateInputMappingsInOrder read rest with
              | none => simp [evaluateInputMappingsInOrder, expression, lookup, tailEq] at evaluated
              | some tail =>
                  simp [evaluateInputMappingsInOrder, expression, lookup, tailEq] at evaluated
                  subst bindings
                  have tailValid := ih tail tailEq
                  cases found : read name with
                  | none => simp [scalarInputLookup?, found] at lookup
                  | some source =>
                      cases source <;> simp_all [scalarInputLookup?, orderedInputSnapshotMatches]
                      all_goals cases value <;> simp_all

theorem evaluateInputMappings_snapshot (read : String → Option VariableValue)
    (mappings : List VariableMapping) (bindings : List VariableBinding)
    (evaluated : evaluateInputMappings? read mappings = some bindings) :
    inputSnapshotMatches mappings bindings = true := by
  cases ordered : canonicalInputMappings? mappings with
  | none => simp [evaluateInputMappings?, ordered] at evaluated
  | some mappings =>
      simp only [evaluateInputMappings?, ordered] at evaluated
      simpa only [inputSnapshotMatches, ordered] using evaluateInputMappingsInOrder_snapshot read mappings bindings evaluated

theorem evaluateEnclosingInputMappings_snapshot (context : List VariableBinding)
    (mappings : List VariableMapping) (bindings : List VariableBinding)
    (evaluated : evaluateEnclosingInputMappings context mappings = some bindings) :
    inputSnapshotMatches mappings bindings = true :=
  evaluateInputMappings_snapshot (enclosingVariable? context) mappings bindings evaluated

def singleStringLiteralMapping : List VariableMapping → Bool
  | [{ target, expression := .stringLiteral value }] =>
      !target.isEmpty && !value.isEmpty
  | _ => false

def singleLocalVariableMapping : List VariableMapping → Bool
  | [{ target, expression := .localVariable name }] =>
      !target.isEmpty && !name.isEmpty
  | _ => false

def applyEffectPatch
    (_arguments : List VariableBinding)
    (outputMappings : List VariableMapping)
    (processBindings : List VariableBinding)
    (localPatch : List VariableBinding)
    (allowNull : Bool) : Option (List VariableBinding) :=
  match outputMappings, localPatch with
  | [], [] => some processBindings
  | [{ target, expression := .localVariable source }],
      [{ name, value }] =>
      if source = name &&
          (match value with
            | .string _ => true
            | .boolean _ => false
            | .integer _ => false
            | .stringList _ => false
            | .decimal _ _ | .list _ | .map _ => false
            | .null => allowNull) then
        some
          ({ name := target, value } ::
            processBindings.filter fun binding =>
              decide (binding.name ≠ target))
      else
        none
  | _, _ => none

def applyEffectResult
    (arguments : List VariableBinding)
    (outputMappings : List VariableMapping)
    (processBindings : List VariableBinding)
    (result : EffectExecutionResult) : Option (List VariableBinding) :=
  match result with
  | .success localPatch =>
      applyEffectPatch arguments outputMappings processBindings
        localPatch false
  | .bpmnError _ _ localPatch =>
      applyEffectPatch arguments outputMappings processBindings
        localPatch true

/-- Match only the Activity-occurrence-owned arm used by the direct data-input family. -/
def activityOccurrenceScopeMatches (owner : ActivityOccurrenceId)
    (scope : ActivityVariableScope) : Bool :=
  localDataOwnerMatches (.activityOccurrence owner) scope.owner

/-- Add the copied data-input scope for one newly activated Activity occurrence. Separate from the effect entry point because substituting one owner family for the other is the alias this discriminator exists to prevent. -/
def addActivityOccurrenceVariableScope (variables : ScopedVariables)
    (owner : ActivityOccurrenceId)
    (bindings : List VariableBinding) : ScopedVariables :=
  { variables with
    activities := insertActivityVariableScope
      { owner := .activityOccurrence owner, bindings }
      variables.activities }

/-- The bindings of one Activity occurrence's unique local scope, or `none`. -/
def activityOccurrenceVariableBindings (variables : ScopedVariables)
    (owner : ActivityOccurrenceId) : Option (List VariableBinding) :=
  match variables.activities.filter (activityOccurrenceScopeMatches owner) with
  | [scope] => some scope.bindings
  | _ => none

/-- Remove one Activity occurrence's local scope, preserving Process scope and every other owner. A missing or duplicated owner returns `none` rather than removing what it found, so a state that lost the join refuses instead of committing a partial disposal. -/
def removeActivityOccurrenceVariableScope (variables : ScopedVariables)
    (owner : ActivityOccurrenceId) : Option ScopedVariables :=
  match variables.activities.filter (activityOccurrenceScopeMatches owner) with
  | [_] =>
      some
        { variables with
          activities :=
            variables.activities.filter fun scope =>
              !activityOccurrenceScopeMatches owner scope }
  | _ => none

theorem filter_insertActivityVariableScope_of_rejected
    (predicate : ActivityVariableScope → Bool) (inserted : ActivityVariableScope)
    (rejected : predicate inserted = false) : ∀ values : List ActivityVariableScope,
    (insertActivityVariableScope inserted values).filter predicate = values.filter predicate := by
  intro values
  induction values with
  | nil => simp [insertActivityVariableScope, rejected]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      split
      · simp [rejected]
      · simp only [List.filter_cons, ih]

theorem filter_insertActivityVariableScope_eq_singleton
    (predicate : ActivityVariableScope → Bool) (inserted : ActivityVariableScope)
    (accepted : predicate inserted = true)
    (rejected : ∀ value ∈ values, predicate value = false) :
    (insertActivityVariableScope inserted values).filter predicate = [inserted] := by
  induction values with
  | nil => simp [insertActivityVariableScope, accepted]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      have currentRejected := rejected current (by simp)
      have restRejected : ∀ value ∈ rest, predicate value = false := by
        intro value member
        exact rejected value (by simp [member])
      have restEmpty : rest.filter predicate = [] := List.filter_eq_nil_iff.mpr (by
        intro value member acceptedValue
        rw [restRejected value member] at acceptedValue
        contradiction)
      split
      · simp [accepted, currentRejected, restEmpty]
      · simp [currentRejected, ih restRejected]

theorem all_insertActivityVariableScope (predicate : ActivityVariableScope → Bool)
    (inserted : ActivityVariableScope) : ∀ values : List ActivityVariableScope,
    (insertActivityVariableScope inserted values).all predicate =
      (predicate inserted && values.all predicate) := by
  intro values
  induction values with
  | nil => simp [insertActivityVariableScope]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      split <;> simp_all [Bool.and_left_comm]

/-- Removing one Activity-local scope never touches Process scope. -/
theorem removeActivityOccurrenceVariableScope_preserves_process
    {variables result : ScopedVariables} {owner : ActivityOccurrenceId}
    (removed : removeActivityOccurrenceVariableScope variables owner = some result) :
    result.process = variables.process := by
  unfold removeActivityOccurrenceVariableScope at removed
  split at removed
  · cases removed
    rfl
  · exact absurd removed (by simp)

/-- A successful removal had exactly one scope for that owner and leaves none. -/
theorem removeActivityOccurrenceVariableScope_disposes
    {variables result : ScopedVariables} {owner : ActivityOccurrenceId}
    (removed : removeActivityOccurrenceVariableScope variables owner = some result) :
    (variables.activities.filter (activityOccurrenceScopeMatches owner)).length = 1 ∧
      result.activities.filter (activityOccurrenceScopeMatches owner) = [] := by
  unfold removeActivityOccurrenceVariableScope at removed
  split at removed
  · next singleton =>
      cases removed
      refine ⟨by rw [singleton]; rfl, ?_⟩
      simp [List.filter_filter]
  · exact absurd removed (by simp)

/-- Validate one effect result against its unique owned local scope, map into Process scope, and remove only that local scope. Missing or duplicate owners return `none`. -/
def completeActivityVariableScope
    (variables : ScopedVariables)
    (owner : EffectOccurrenceId)
    (outputMappings : List VariableMapping)
    (result : EffectExecutionResult) : Option ScopedVariables :=
  match variables.activities.filter (activityScopeMatches owner) with
  | [activity] =>
      match applyEffectResult activity.bindings outputMappings
          variables.process.bindings result with
      | none => none
      | some processBindings =>
          some
            { variables with
              process := { bindings := processBindings }
              activities :=
                variables.activities.filter fun scope =>
                  !activityScopeMatches owner scope }
  | _ => none

theorem completeActivityVariableScope_preserves_processInterfaces
    {variables completed : ScopedVariables} {owner : EffectOccurrenceId}
    {outputMappings : List VariableMapping} {result : EffectExecutionResult}
    (completion : completeActivityVariableScope variables owner outputMappings result = some completed) :
    completed.processInterfaces = variables.processInterfaces := by
  unfold completeActivityVariableScope at completion
  split at completion
  · split at completion
    · simp at completion
    · cases completion
      rfl
  · simp at completion

end BpmnSemantics.SemanticProcess
