import BpmnSemantics.SemanticProcess.Transition

/-! # Exclusive Gateway with Simple Boolean conditions

This module supplies executable locks and reusable laws for the project-owned Simple Boolean v1 evaluator and declaration-ordered conditional choice. It establishes neither XPath nor JUEL support.
-/

namespace BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def firstOutput : ControlPlaceId := ⟨"place:Flow_First"⟩
private def secondOutput : ControlPlaceId := ⟨"place:Flow_Second"⟩
private def defaultOutput : ControlPlaceId := ⟨"place:Flow_Default"⟩

private def candidate (flowId : String) (condition : SimpleBooleanExpression) :
    ConditionalCandidate :=
  { condition
    output := ⟨"place:" ++ flowId⟩
    origin := { elementId := ⟨flowId⟩ } }

theorem string_equals_expression_parses_exactly :
    parseSimpleBooleanExpression "stringEquals(route,\"review\")" =
      some (.stringEquals "route" "review") := by
  native_decide

theorem leading_whitespace_is_rejected :
    parseSimpleBooleanExpression " isPresent(route)" = none := by
  decide +kernel

theorem missing_binding_is_not_present :
    evaluateSimpleBooleanExpression (.isPresent "route") [] =
      some false := by
  decide +kernel

theorem null_binding_is_null :
    evaluateSimpleBooleanExpression (.isNull "route")
      [{ name := "route", value := .null }] = some true := by
  decide +kernel

theorem matching_string_binding_is_equal :
    evaluateSimpleBooleanExpression (.stringEquals "route" "review")
      [{ name := "route", value := .string "review" }] = some true := by
  decide +kernel

theorem first_true_candidate_selects_its_output :
    selectConditionalOutput
      [ candidate "Flow_First" (.literal false)
      , candidate "Flow_Second" (.literal true) ]
      defaultOutput [] = some secondOutput := by
  decide +kernel

theorem all_false_candidates_select_the_default :
    selectConditionalOutput
      [ candidate "Flow_First" (.literal false)
      , candidate "Flow_Second" (.literal false) ]
      defaultOutput [] = some defaultOutput := by
  decide +kernel

/-- Once the first candidate is true, later candidates cannot affect routing. -/
theorem first_true_ignores_tail
    (head : ConditionalCandidate)
    (tail : List ConditionalCandidate)
    (bindings : List VariableBinding)
    (truth : evaluateSimpleBooleanExpression head.condition bindings =
      some true) :
    selectConditionalOutput (head :: tail) defaultOutput bindings =
      some head.output := by
  simp [selectConditionalOutput, truth]

/-- A selected output is always owned by one candidate or by the explicit default. -/
theorem selected_output_owned
    (candidates : List ConditionalCandidate)
    (fallback output : ControlPlaceId)
    (bindings : List VariableBinding)
    (selected :
      selectConditionalOutput candidates fallback bindings = some output) :
    output = fallback ∨
      ∃ candidate ∈ candidates, output = candidate.output := by
  induction candidates with
  | nil =>
      simp [selectConditionalOutput] at selected
      exact Or.inl selected.symm
  | cons head tail inductionHypothesis =>
      cases evaluation :
          evaluateSimpleBooleanExpression head.condition bindings with
      | none =>
          simp [selectConditionalOutput, evaluation] at selected
      | some truth =>
          cases truth with
          | false =>
              simp [selectConditionalOutput, evaluation] at selected
              exact
                (inductionHypothesis selected).imp_right fun
                  ⟨item, member, equality⟩ =>
                    ⟨item, by simp [member], equality⟩
          | true =>
              simp [selectConditionalOutput, evaluation] at selected
              exact Or.inr ⟨head, by simp [selected]⟩

end BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance
