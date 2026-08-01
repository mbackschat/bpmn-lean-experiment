import BpmnSemantics.SemanticProcessContract

/-! # Shared definition-artifact invariants

This module owns only representation-independent string identity and canonical-order predicates shared by checked-process and Semantic Process admission. Node, operation, profile, and graph rules remain with their representation-specific validators.
-/

namespace BpmnSemantics.SemanticProcess

def strictlySortedStrings : List String → Bool
  | []
  | [_] => true
  | left :: right :: rest =>
      decide (left < right) && strictlySortedStrings (right :: rest)

def nonempty (value : String) : Bool :=
  !value.isEmpty

def lowercaseHexSha256 (value : String) : Bool :=
  value.length = 64 &&
    value.toList.all fun character =>
      "0123456789abcdef".toList.contains character

end BpmnSemantics.SemanticProcess
