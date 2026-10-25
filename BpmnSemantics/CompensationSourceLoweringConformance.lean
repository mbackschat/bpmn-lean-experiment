module

public import BpmnSemantics.CompensationSourceAdmissionConformance
public import BpmnSemantics.CompensationSourceBindingConformance
public import BpmnSemantics.CompensationSourceCompatibilityConformance
public import BpmnSemantics.CompensationSourceJsonConformance

/-! # Compensation source lowering conformance

Aggregate for the responsibility-split admission, lowering, compatibility, strict-decoding, and
cross-artifact binding checks of the owner-approved source checkpoint.
-/


@[expose] public section