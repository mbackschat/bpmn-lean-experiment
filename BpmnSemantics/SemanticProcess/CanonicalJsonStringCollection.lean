import Init.Data.ByteArray.Basic
import Init.Data.String.Basic

/-! # Canonical JSON string collection byte measure

The exact UTF-8 byte measure JavaScript `JSON.stringify` emits for a list of strings whose characters
are valid Unicode scalar values. It owns only measurement. Multi-Instance profile limits and their
admission decisions remain with their family owners.

JSON array brackets, separators, and string framing are counted explicitly. Quote, backslash, and the
five named single-letter control escapes contribute two bytes. Every other character below `U+0020`
contributes six bytes through its `\u00XX` escape. All remaining characters contribute the byte size
of their UTF-8 encoding.

The executable measure scans the string's existing UTF-8 bytes rather than decoding them back into a
character list. Every byte JSON escapes is ASCII and therefore a complete one-byte scalar in valid
UTF-8. Its expansion is one byte for quote, backslash, and the named controls, and five bytes for the
other controls. Every non-ASCII byte and every other ASCII byte has zero expansion, so adding this
census to the already cached raw UTF-8 size is exact without constructing decoded characters.
-/

namespace BpmnSemantics.SemanticProcess

/-- Additional bytes `JSON.stringify` emits for one UTF-8 byte.

The seven named cases replace one input byte with a two-byte escape. The remaining control range
replaces one input byte with six `\u00XX` bytes. Continuation and leading bytes are all above ASCII,
so each contributes no expansion and the raw byte count retains the whole encoded scalar. -/
def canonicalJsonUtf8ByteExpansion (byte : UInt8) : Nat :=
  match byte.toNat with
  | 0x08 => 1
  | 0x09 => 1
  | 0x0a => 1
  | 0x0c => 1
  | 0x0d => 1
  | 0x22 => 1
  | 0x5c => 1
  | value => if value < 0x20 then 5 else 0

/-- Additional bytes contributed by every JSON escape in one string. -/
def canonicalJsonStringEscapeExpansionUtf8Bytes (item : String) : Nat :=
  item.toByteArray.foldl
    (fun total byte => total + canonicalJsonUtf8ByteExpansion byte) 0

/-- Bytes one string contributes to a JSON array, including its framing quotes. -/
def canonicalJsonStringUtf8Bytes (item : String) : Nat :=
  item.utf8ByteSize + canonicalJsonStringEscapeExpansionUtf8Bytes item + 2

/-- Bytes a complete JSON string array contributes, including brackets and separators. -/
def canonicalJsonStringCollectionUtf8Bytes : List String → Nat
  | [] => 2
  | first :: rest =>
      rest.foldl (fun total item => total + canonicalJsonStringUtf8Bytes item + 1)
        (canonicalJsonStringUtf8Bytes first) + 2

end BpmnSemantics.SemanticProcess
