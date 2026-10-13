import BpmnSemantics.SemanticProcess.ProcessInterfaceRuntime

/-! # Property-path value policy

Which typed values a composed task's Property path may carry: the Property read into the task's
Activity-local input, the local input itself, and the Property its DataOutput writes. The policy is
derived from the exact Program profile and is never a wire flag, per the
[serial-handoff amendment](../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#runtime-ownership-and-acceptance).
Process-interface and Call ports keep `processInterfaceScalar`; this owner does not reach them.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

abbrev portableHandoffProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-portable-business-values-handoff-draft"⟩

inductive PropertyPathValuePolicy where
  /-- String or present Null, the domain every earlier composed-task profile selected. -/
  | scalar
  /-- `SingletonBusinessItem`: a root String of at most 1,024 UTF-8 bytes, Null, Boolean, Integer,
  Decimal or Map. A root List would be a collection on an untyped port, so it is refused. -/
  | singletonBusinessItem
  deriving Repr, DecidableEq

/-- Shape only: generic bounds of a Decimal or Map belong to the wire reader that admitted it, and
command admission re-checks them (`variableValueAdmitted`). -/
def PropertyPathValuePolicy.admits : PropertyPathValuePolicy → VariableValue → Bool
  | .scalar, value => processInterfaceScalar value
  | .singletonBusinessItem, .string value => value.utf8ByteSize ≤ 1024
  | .singletonBusinessItem, .null | .singletonBusinessItem, .boolean _
  | .singletonBusinessItem, .integer _ | .singletonBusinessItem, .decimal _ _
  | .singletonBusinessItem, .map _ => true
  | .singletonBusinessItem, .list _ | .singletonBusinessItem, .stringList _ => false

def propertyPathValuePolicy (profile : ProfileId) : PropertyPathValuePolicy :=
  if profile = portableHandoffProfileId then .singletonBusinessItem else .scalar

abbrev programPropertyPathValuePolicy (program : Program) : PropertyPathValuePolicy :=
  propertyPathValuePolicy program.identity.semanticProfile

theorem programPropertyPathValuePolicy_eq_scalar {program : Program}
    (other : program.identity.semanticProfile ≠ portableHandoffProfileId) :
    programPropertyPathValuePolicy program = .scalar := by
  simp [programPropertyPathValuePolicy, propertyPathValuePolicy, other]

@[simp] theorem PropertyPathValuePolicy.scalar_admits (value : VariableValue) :
    PropertyPathValuePolicy.scalar.admits value = processInterfaceScalar value := rfl

end BpmnSemantics.SemanticProcess
