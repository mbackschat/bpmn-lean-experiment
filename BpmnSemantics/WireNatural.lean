/-! The shared wire integer bound is independent of JSON decoding so predecessor arithmetic and
decoders use the same limit from the [wire contract](../contracts/README.md).
-/

namespace BpmnSemantics.SemanticProcessJson

def maxSafeWireNat : Nat := 9007199254740991

def isSafeWireNat (value : Nat) : Bool :=
  value ≤ maxSafeWireNat

end BpmnSemantics.SemanticProcessJson
