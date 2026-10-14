import BpmnSemantics.SemanticProcess.PropertyPathValuePolicy
import BpmnSemantics.SemanticProcess.JsonSupport

/-! # Effect-mapping value policy

Which typed values a Service Task's effect mapping may carry: the enclosing values copied into an
argument snapshot, the snapshot itself, and the result patch read from the Activity-local scope. The
policy is derived from the exact Program profile and is never a wire flag, per the
[structured effect-data amendment](../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#runtime-ownership-and-acceptance).
It is the effect-side analogue of `PropertyPathValuePolicy`; the two are independent because a profile
may widen one path only.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

abbrev portableEffectDataProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-portable-business-effect-data-draft"⟩

inductive EffectMappingValuePolicy where
  /-- String, and Null only where the call permits one: the domain every earlier effect profile selected. -/
  | scalar
  /-- `SingletonBusinessItem`, whose Null is always a present value. -/
  | singletonBusinessItem
  deriving Repr, DecidableEq

/-- `allowNull` is the scalar contract's per-call distinction; the item arm ignores it. The item arm also
re-validates the whole tree, so a snapshot or patch is never trusted for having come from an earlier write. -/
def EffectMappingValuePolicy.admits : EffectMappingValuePolicy → Bool → VariableValue → Bool
  | .scalar, _, .string _ => true
  | .scalar, allowNull, .null => allowNull
  | .scalar, _, .boolean _ | .scalar, _, .integer _ | .scalar, _, .stringList _
  | .scalar, _, .decimal _ _ | .scalar, _, .list _ | .scalar, _, .map _ => false
  | .singletonBusinessItem, _, value =>
      PropertyPathValuePolicy.singletonBusinessItem.admits value &&
        BpmnSemantics.SemanticProcessJson.variableValueWellFormed value

/-- Only the structured effect-data profile widens effect mapping; every other profile, including an
unknown one, keeps the scalar contract. -/
def effectMappingValuePolicy (profile : ProfileId) : EffectMappingValuePolicy :=
  if profile = portableEffectDataProfileId then .singletonBusinessItem else .scalar

abbrev programEffectMappingValuePolicy (program : Program) : EffectMappingValuePolicy :=
  effectMappingValuePolicy program.identity.semanticProfile

theorem programEffectMappingValuePolicy_eq_scalar {program : Program}
    (other : program.identity.semanticProfile ≠ portableEffectDataProfileId) :
    programEffectMappingValuePolicy program = .scalar := by
  simp [programEffectMappingValuePolicy, effectMappingValuePolicy, other]

/-- The reading used by profile-specific proofs, which know their own profile identity. -/
theorem programEffectMappingValuePolicy_eq_scalar_of_profile {program : Program} {profile : ProfileId}
    (same : program.identity.semanticProfile = profile) (other : profile ≠ portableEffectDataProfileId) :
    programEffectMappingValuePolicy program = .scalar :=
  programEffectMappingValuePolicy_eq_scalar (same ▸ other)

/-- The reading used by proofs that know their Program only by its profile string, such as the Multi-Instance families. -/
theorem programEffectMappingValuePolicy_eq_scalar_of_value {program : Program} {value : String}
    (same : program.identity.semanticProfile.value = value) (other : value ≠ portableEffectDataProfileId.value) :
    programEffectMappingValuePolicy program = .scalar :=
  programEffectMappingValuePolicy_eq_scalar fun profile => other (same.symm.trans (congrArg ProfileId.value profile))

theorem effectMappingValuePolicy_portableEffectData :
    effectMappingValuePolicy portableEffectDataProfileId = .singletonBusinessItem := by
  simp [effectMappingValuePolicy]

/-- PBV-EFF-01's root String bound, shared by Start, argument snapshots and result patches. -/
theorem singletonBusinessItem_refuses_overlong_string (allowNull : Bool) {value : String}
    (over : 1024 < value.utf8ByteSize) :
    EffectMappingValuePolicy.singletonBusinessItem.admits allowNull (.string value) = false := by
  simp [EffectMappingValuePolicy.admits, PropertyPathValuePolicy.admits]
  omega

end BpmnSemantics.SemanticProcess
