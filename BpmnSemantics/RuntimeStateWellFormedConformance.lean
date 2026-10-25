module

public import BpmnSemantics.RuntimeStateActivityConformance
public import BpmnSemantics.RuntimeStateWellFormedInvariantConformance
public import BpmnSemantics.RuntimeStateWellFormedEventRaceConformance
public import BpmnSemantics.RuntimeStateWellFormedSuccessorConformance

/-! # Runtime-state well-formedness conformance

This declaration-free aggregate preserves the established import surface while keeping the Activity,
ordinary invariant, Event-Based Gateway, and successor proof families in independent elaboration
targets below the repository's Lean memory ceiling.
-/
