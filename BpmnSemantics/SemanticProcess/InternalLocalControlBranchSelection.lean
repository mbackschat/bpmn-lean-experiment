import BpmnSemantics.SemanticProcess.InclusiveGateway
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

/-! # Local-control branch preparation

This owner retains the evaluated condition reads required by the complete-preparation frame in [the Internal Commutation proposal](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

/-- The expression language has one named read per nonliteral expression; the evaluator in `SimpleBooleanExpression.lean` settles duplicate-binding failure. -/
def internalExpressionReadVariables : SimpleBooleanExpression → List String
  | .literal _ => []
  | .isPresent name | .isNull name | .stringEquals name _ => [name]

/-- Equality of the referenced binding population preserves evaluation, including malformed duplicate-binding failure. -/
theorem internal_expression_evaluation_frame
    (expression : SimpleBooleanExpression)
    (before after : List VariableBinding)
    (agree : ∀ name ∈ internalExpressionReadVariables expression,
      before.filter (fun binding => decide (binding.name = name)) =
        after.filter (fun binding => decide (binding.name = name))) :
    evaluateSimpleBooleanExpression expression before =
      evaluateSimpleBooleanExpression expression after := by
  cases expression with
  | literal value => rfl
  | isPresent name =>
      simp only [evaluateSimpleBooleanExpression,
        agree name (by simp [internalExpressionReadVariables])]
  | isNull name =>
      simp only [evaluateSimpleBooleanExpression,
        agree name (by simp [internalExpressionReadVariables])]
  | stringEquals name value =>
      simp only [evaluateSimpleBooleanExpression,
        agree name (by simp [internalExpressionReadVariables])]

structure InternalConditionalSelection where
  output : ControlPlaceId
  origin : BpmnSequenceFlowOrigin
  readVariables : List String
  deriving Repr, DecidableEq

/-- Retain the evaluated prefix because an earlier false condition can become the selected branch under an unprotected write; later candidates are not evaluated. -/
def prepareInternalConditional?
    (candidates : List ConditionalCandidate)
    (defaultOutput : ControlPlaceId)
    (defaultOrigin : BpmnSequenceFlowOrigin)
    (bindings : List VariableBinding) : Option InternalConditionalSelection :=
  match candidates with
  | [] => some ⟨defaultOutput, defaultOrigin, []⟩
  | candidate :: rest =>
      match evaluateSimpleBooleanExpression candidate.condition bindings with
      | none => none
      | some true => some
          ⟨candidate.output, candidate.origin,
            internalExpressionReadVariables candidate.condition⟩
      | some false => do
          let selected ← prepareInternalConditional? rest defaultOutput
            defaultOrigin bindings
          pure { selected with readVariables :=
            internalExpressionReadVariables candidate.condition ++
              selected.readVariables }

/-- Retained provenance and dependency reads do not change the existing conditional selector's output or failure. -/
theorem prepare_internal_conditional_output
    (candidates : List ConditionalCandidate)
    (defaultOutput : ControlPlaceId)
    (defaultOrigin : BpmnSequenceFlowOrigin)
    (bindings : List VariableBinding) :
    (prepareInternalConditional? candidates defaultOutput defaultOrigin bindings).map
        InternalConditionalSelection.output =
      selectConditionalOutput candidates defaultOutput bindings := by
  induction candidates with
  | nil => rfl
  | cons candidate rest ih =>
      cases evaluated :
          evaluateSimpleBooleanExpression candidate.condition bindings with
      | none => simp [prepareInternalConditional?, selectConditionalOutput, evaluated]
      | some value =>
          cases value with
          | true => simp [prepareInternalConditional?, selectConditionalOutput, evaluated]
          | false =>
              simp only [prepareInternalConditional?, selectConditionalOutput, evaluated]
              cases remaining : prepareInternalConditional? rest defaultOutput
                  defaultOrigin bindings <;> simpa [remaining] using ih

/-- Only the successful predecessor's evaluated prefix must agree; no successor preparation or unvisited-variable equality is assumed. -/
theorem prepare_internal_conditional_frame
    (candidates : List ConditionalCandidate)
    (defaultOutput : ControlPlaceId)
    (defaultOrigin : BpmnSequenceFlowOrigin)
    (before after : List VariableBinding)
    (selected : InternalConditionalSelection)
    (prepared : prepareInternalConditional? candidates defaultOutput
      defaultOrigin before = some selected)
    (agree : ∀ name ∈ selected.readVariables,
      before.filter (fun binding => decide (binding.name = name)) =
        after.filter (fun binding => decide (binding.name = name))) :
    prepareInternalConditional? candidates defaultOutput defaultOrigin after =
      some selected := by
  induction candidates generalizing selected with
  | nil => simpa [prepareInternalConditional?] using prepared
  | cons candidate rest ih =>
      cases evaluated :
          evaluateSimpleBooleanExpression candidate.condition before with
      | none => simp [prepareInternalConditional?, evaluated] at prepared
      | some value =>
          cases value with
          | true =>
              simp [prepareInternalConditional?, evaluated] at prepared
              subst selected
              have unchanged := internal_expression_evaluation_frame
                candidate.condition before after agree
              simp [prepareInternalConditional?, ← unchanged, evaluated]
          | false =>
              cases remaining : prepareInternalConditional? rest defaultOutput
                  defaultOrigin before with
              | none =>
                  simp [prepareInternalConditional?, evaluated, remaining] at prepared
              | some tailSelection =>
                  simp [prepareInternalConditional?, evaluated, remaining] at prepared
                  subst selected
                  have headAgree :
                      ∀ name ∈ internalExpressionReadVariables candidate.condition,
                        before.filter (fun binding => decide (binding.name = name)) =
                          after.filter (fun binding => decide (binding.name = name)) := by
                    intro name member
                    exact agree name (List.mem_append_left _ member)
                  have tailAgree : ∀ name ∈ tailSelection.readVariables,
                      before.filter (fun binding => decide (binding.name = name)) =
                        after.filter (fun binding => decide (binding.name = name)) := by
                    intro name member
                    exact agree name (List.mem_append_right _ member)
                  have unchanged := internal_expression_evaluation_frame
                    candidate.condition before after headAgree
                  have tailUnchanged := ih tailSelection remaining tailAgree
                  simp [prepareInternalConditional?, ← unchanged, evaluated, tailUnchanged]

/-- A successful condition ends evaluation, so even malformed bindings referenced only by the suffix cannot change this result. -/
theorem prepare_internal_conditional_true_ignores_suffix
    (candidate : ConditionalCandidate) (rest : List ConditionalCandidate)
    (defaultOutput : ControlPlaceId) (defaultOrigin : BpmnSequenceFlowOrigin)
    (bindings : List VariableBinding)
    (evaluated : evaluateSimpleBooleanExpression candidate.condition bindings =
      some true) :
    prepareInternalConditional? (candidate :: rest) defaultOutput defaultOrigin bindings =
      some ⟨candidate.output, candidate.origin,
        internalExpressionReadVariables candidate.condition⟩ := by
  simp [prepareInternalConditional?, evaluated]

/-- A false predecessor remains a dependency even when the next condition supplies the selected branch. -/
theorem prepare_internal_conditional_false_prefix_reads
    (first second : ConditionalCandidate) (rest : List ConditionalCandidate)
    (defaultOutput : ControlPlaceId) (defaultOrigin : BpmnSequenceFlowOrigin)
    (bindings : List VariableBinding)
    (firstFalse : evaluateSimpleBooleanExpression first.condition bindings = some false)
    (secondTrue : evaluateSimpleBooleanExpression second.condition bindings = some true) :
    prepareInternalConditional? (first :: second :: rest) defaultOutput
        defaultOrigin bindings =
      some ⟨second.output, second.origin,
        internalExpressionReadVariables first.condition ++
          internalExpressionReadVariables second.condition⟩ := by
  simp [prepareInternalConditional?, firstFalse, secondTrue]

/-- Default selection retains the complete failed prefix, because any of its conditions can displace the default. -/
theorem prepare_internal_conditional_default_reads
    (candidates : List ConditionalCandidate)
    (defaultOutput : ControlPlaceId) (defaultOrigin : BpmnSequenceFlowOrigin)
    (bindings : List VariableBinding)
    (allFalse : ∀ candidate ∈ candidates,
      evaluateSimpleBooleanExpression candidate.condition bindings = some false) :
    prepareInternalConditional? candidates defaultOutput defaultOrigin bindings =
      some ⟨defaultOutput, defaultOrigin,
        candidates.flatMap fun candidate =>
          internalExpressionReadVariables candidate.condition⟩ := by
  induction candidates with
  | nil => rfl
  | cons candidate rest ih =>
      have headFalse := allFalse candidate (by simp)
      have restFalse : ∀ candidate ∈ rest,
          evaluateSimpleBooleanExpression candidate.condition bindings = some false := by
        intro remaining member
        exact allFalse remaining (by simp [member])
      simp [prepareInternalConditional?, headFalse, ih restFalse]

structure InternalInclusiveSelection where
  selected : List (ControlPlaceId × ControlPlaceId)
  readVariables : List String
  deriving Repr, DecidableEq

def internalInclusiveReadVariables (candidates : List InclusiveCandidate) :
    List String :=
  candidates.flatMap fun candidate =>
    internalExpressionReadVariables candidate.condition

/-- Inclusive selection uses the existing evaluator because every candidate affects its exact branch set, including false candidates. -/
def prepareInternalInclusive?
    (candidates : List InclusiveCandidate)
    (defaultBranch : InclusiveDefaultBranch)
    (bindings : List VariableBinding) : Option InternalInclusiveSelection := do
  let selected ← evaluateInclusiveBranches candidates defaultBranch bindings
  pure ⟨selected, internalInclusiveReadVariables candidates⟩

/-- Retaining dependency reads preserves the evaluator's exact output/input pairs, default, ordering, and failure. -/
theorem prepare_internal_inclusive_selected
    (candidates : List InclusiveCandidate)
    (defaultBranch : InclusiveDefaultBranch)
    (bindings : List VariableBinding) :
    (prepareInternalInclusive? candidates defaultBranch bindings).map
        InternalInclusiveSelection.selected =
      evaluateInclusiveBranches candidates defaultBranch bindings := by
  unfold prepareInternalInclusive?
  cases evaluateInclusiveBranches candidates defaultBranch bindings <;> rfl

theorem internal_inclusive_candidates_frame
    (candidates : List InclusiveCandidate)
    (before after : List VariableBinding)
    (agree : ∀ name ∈ internalInclusiveReadVariables candidates,
      before.filter (fun binding => decide (binding.name = name)) =
        after.filter (fun binding => decide (binding.name = name))) :
    evaluateTrueInclusiveCandidates before candidates =
      evaluateTrueInclusiveCandidates after candidates := by
  induction candidates with
  | nil => rfl
  | cons candidate rest ih =>
      have headAgree : ∀ name ∈ internalExpressionReadVariables candidate.condition,
          before.filter (fun binding => decide (binding.name = name)) =
            after.filter (fun binding => decide (binding.name = name)) := by
        intro name member
        exact agree name (by simp [internalInclusiveReadVariables, member])
      have tailAgree : ∀ name ∈ internalInclusiveReadVariables rest,
          before.filter (fun binding => decide (binding.name = name)) =
            after.filter (fun binding => decide (binding.name = name)) := by
        intro name member
        exact agree name (by simpa [internalInclusiveReadVariables] using
          List.mem_append_right (internalExpressionReadVariables candidate.condition) member)
      simp only [evaluateTrueInclusiveCandidates, ih tailAgree,
        internal_expression_evaluation_frame candidate.condition before after headAgree]

/-- The successful predecessor records all Inclusive condition dependencies; protecting those reads preserves the complete retained preparation. -/
theorem prepare_internal_inclusive_frame
    (candidates : List InclusiveCandidate)
    (defaultBranch : InclusiveDefaultBranch)
    (before after : List VariableBinding)
    (selected : InternalInclusiveSelection)
    (prepared : prepareInternalInclusive? candidates defaultBranch before = some selected)
    (agree : ∀ name ∈ selected.readVariables,
      before.filter (fun binding => decide (binding.name = name)) =
        after.filter (fun binding => decide (binding.name = name))) :
    prepareInternalInclusive? candidates defaultBranch after = some selected := by
  have reads : selected.readVariables = internalInclusiveReadVariables candidates := by
    unfold prepareInternalInclusive? at prepared
    cases evaluated : evaluateInclusiveBranches candidates defaultBranch before with
    | none => simp [evaluated] at prepared
    | some pairs =>
        simp [evaluated] at prepared
        subst selected
        rfl
  have unchanged := internal_inclusive_candidates_frame candidates before after
    (by simpa [reads] using agree)
  simpa only [prepareInternalInclusive?, evaluateInclusiveBranches, ← unchanged]
    using prepared

end BpmnSemantics.SemanticProcess.InternalCommutation
