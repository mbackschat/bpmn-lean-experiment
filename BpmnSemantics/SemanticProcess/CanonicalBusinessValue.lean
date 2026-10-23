module

public import BpmnSemantics.BusinessValue
public import BpmnSemantics.SemanticProcess.CanonicalJsonStringCollection

/-! # Canonical portable-value byte measure

The exact UTF-8 size of one portable value's canonical JSON under the
[portable-value contract](../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#canonical-bytes-and-identity):
no whitespace, field order `kind` then `value` (or `kind`, `coefficient`, `scale`), Map entries
`name` then `value`, and `JSON.stringify` string escaping through the shared string measure. It owns
measurement only; the 16,384-byte limit belongs to the wire domain owner.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

/-- Bytes of a JSON array whose members measure `sizes`, including brackets and separators. -/
def canonicalArrayBytes (sizes : List Nat) : Nat :=
  2 + sizes.foldl (· + ·) 0 + (sizes.length - 1)

mutual
/-- Canonical bytes of one tagged portable value. -/
def canonicalBusinessValueUtf8Bytes : BusinessValue → Nat
  | .string value =>
      "{\"kind\":\"string\",\"value\":".utf8ByteSize + canonicalJsonStringUtf8Bytes value +
        "}".utf8ByteSize
  | .null => "{\"kind\":\"null\"}".utf8ByteSize
  | .boolean value =>
      "{\"kind\":\"boolean\",\"value\":".utf8ByteSize +
        (if value then "true".utf8ByteSize else "false".utf8ByteSize) + "}".utf8ByteSize
  | .integer value =>
      "{\"kind\":\"integer\",\"value\":".utf8ByteSize + (toString value).utf8ByteSize +
        "}".utf8ByteSize
  | .decimal coefficient scale =>
      "{\"kind\":\"decimal\",\"coefficient\":".utf8ByteSize +
        canonicalJsonStringUtf8Bytes (toString coefficient) + ",\"scale\":".utf8ByteSize +
        (toString scale).utf8ByteSize + "}".utf8ByteSize
  | .list members =>
      "{\"kind\":\"list\",\"value\":".utf8ByteSize +
        canonicalArrayBytes (canonicalBusinessMembersUtf8Bytes members) + "}".utf8ByteSize
  | .map entries =>
      "{\"kind\":\"map\",\"value\":".utf8ByteSize +
        canonicalArrayBytes (canonicalBusinessEntriesUtf8Bytes entries) + "}".utf8ByteSize

def canonicalBusinessMembersUtf8Bytes : List BusinessValue → List Nat
  | [] => []
  | member :: members =>
      canonicalBusinessValueUtf8Bytes member :: canonicalBusinessMembersUtf8Bytes members

def canonicalBusinessEntriesUtf8Bytes : List (String × BusinessValue) → List Nat
  | [] => []
  | (name, value) :: entries =>
      ("{\"name\":".utf8ByteSize + canonicalJsonStringUtf8Bytes name + ",\"value\":".utf8ByteSize +
        canonicalBusinessValueUtf8Bytes value + "}".utf8ByteSize) ::
        canonicalBusinessEntriesUtf8Bytes entries
end

/-- Canonical bytes of a JSON array of `{"name":…,"value":…}` entries in the given order: the Map-entry
layout without the Map's own tag, used as the nested scope-data patch measure (`NSD-TASK-01`). -/
def canonicalNamedValueArrayUtf8Bytes (entries : List (String × BusinessValue)) : Nat :=
  canonicalArrayBytes (canonicalBusinessEntriesUtf8Bytes entries)

end BpmnSemantics.SemanticProcess
