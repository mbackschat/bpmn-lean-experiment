module

/-! The shared wire integer bound is independent of JSON decoding so predecessor arithmetic and
decoders use the same limit from the [wire contract](../contracts/README.md).
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcessJson

@[no_expose] def maxSafeWireNat : Nat := 9007199254740991

@[no_expose] def isSafeWireNat (value : Nat) : Bool :=
  value ≤ maxSafeWireNat

end BpmnSemantics.SemanticProcessJson
