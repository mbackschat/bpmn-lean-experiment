import BpmnSemantics.SemanticProcess.Transition

/-! # Refusable internal-transition compatibility import

The closed disabled/applied/refused attempt now lives beside the private raw evaluator in `Transition`, which mechanically prevents a declaring Program from selecting the raw path. This module preserves the focused import boundary for existing consumers. -/
