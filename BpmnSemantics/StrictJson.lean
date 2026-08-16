import Lean.Data.Json

/-! A JSON parser that preserves wire facts erased by `Lean.Json.parse`. -/

namespace BpmnSemantics.StrictJson

open Std.Internal.Parsec
open Std.Internal.Parsec.String
open Lean

private def escapedChar : Parser Char := do
  let c ← any
  match c with
  | '\\' => return '\\'
  | '"' => return '"'
  | '/' => return '/'
  | 'b' => return '\x08'
  | 'f' => return '\x0c'
  | 'n' => return '\n'
  | 'r' => return '\r'
  | 't' => return '\t'
  | 'u' =>
      let u1 ← Json.Parser.hexChar
      let u2 ← Json.Parser.hexChar
      let u3 ← Json.Parser.hexChar
      let u4 ← Json.Parser.hexChar
      let value := (u1 <<< 12) ||| (u2 <<< 8) ||| (u3 <<< 4) ||| u4
      if h : value < 0xD800 then
        return ⟨value.toUInt32, Or.inl h⟩
      else if h' : value < 0xE000 then
        if value < 0xDC00 then
          Json.Parser.finishSurrogatePair value
        else
          fail "unpaired Unicode surrogate"
      else
        return ⟨value.toUInt32, Or.inr ⟨Nat.not_lt.mp h', Nat.lt_trans value.toFin.isLt (by decide +kernel)⟩⟩
  | _ => fail "illegal JSON escape"

private partial def stringCore (acc : String) : Parser String := do
  let c ← peek!
  if c = '"' then
    skip
    return acc
  let c ← any
  if c = '\\' then
    stringCore (acc.push (← escapedChar))
  else if 0x0020 ≤ c.val && c.val ≤ 0x10ffff then
    stringCore (acc.push c)
  else
    fail "unexpected character in JSON string"

private def string : Parser String :=
  stringCore ""

mutual

  private partial def arrayCore (values : Array Json) :
      Parser (Array Json) := do
    let value ← valueCore
    let values := values.push value
    let delimiter ← any
    if delimiter = ']' then
      ws
      return values
    else if delimiter = ',' then
      ws
      arrayCore values
    else
      fail "unexpected character in JSON array"

  private partial def objectCore (members : Std.TreeMap.Raw String Json) :
      Parser (Std.TreeMap.Raw String Json) := do
    Json.Parser.lookahead (fun c => c = '"') "\""
    skip
    let key ← string
    if members.contains key then
      fail s!"duplicate JSON object key: {key}"
    ws
    Json.Parser.lookahead (fun c => c = ':') ":"
    skip
    ws
    let value ← valueCore
    let members := members.insert key value
    let delimiter ← any
    if delimiter = '}' then
      ws
      return members
    else if delimiter = ',' then
      ws
      objectCore members
    else
      fail "unexpected character in JSON object"

  private partial def valueCore : Parser Json := do
    let c ← peek!
    if c = '[' then
      skip
      ws
      if (← peek!) = ']' then
        skip
        ws
        return .arr #[]
      return .arr (← arrayCore #[])
    else if c = '{' then
      skip
      ws
      if (← peek!) = '}' then
        skip
        ws
        return .obj ∅
      return .obj (← objectCore ∅)
    else if c = '"' then
      skip
      let value ← string
      ws
      return .str value
    else if c = 'f' then
      skipString "false"
      ws
      return .bool false
    else if c = 't' then
      skipString "true"
      ws
      return .bool true
    else if c = 'n' then
      skipString "null"
      ws
      return .null
    else if c = '-' || ('0' ≤ c && c ≤ '9') then
      let value ← Json.Parser.num
      if c = '-' && value.mantissa = 0 then
        fail "negative zero is not an admitted JSON number"
      ws
      return .num value
    else
      fail "unexpected JSON input"

end

private def document : Parser Json := do
  ws
  let value ← valueCore
  eof
  return value

/-- Parse exactly one complete JSON value while preserving admission facts erased by `Lean.Json.parse`: duplicate decoded object keys, including escape-equivalent keys, and unpaired Unicode surrogates are rejected, and trailing non-whitespace input cannot remain after `eof`. -/
def parse (contents : String) : Except String Json :=
  Parser.run document contents

end BpmnSemantics.StrictJson
