import BpmnSemantics.SemanticProcess.CommandAdmission

/-! # Compensation Event Sub-Process snapshot command-admission compatibility import

The declaration-aware admission implementation now lives beside the private raw dispatcher in `CommandAdmission`, which mechanically prevents a declaring Program from reaching the raw path. This module preserves the focused import boundary for existing consumers. -/
