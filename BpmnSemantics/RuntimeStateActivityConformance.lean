import BpmnSemantics.RuntimeStateActivityOccurrenceConformance
import BpmnSemantics.RuntimeStateControllerConformance

/-! # Runtime-state Activity and controller conformance aggregate

This declaration-free compatibility module preserves the original import surface while the
independent Activity-occurrence and sequential Multi-Instance controller proof families remain
separate kernel targets under the repository's hard 3 GiB Lean measurement bound.
-/
