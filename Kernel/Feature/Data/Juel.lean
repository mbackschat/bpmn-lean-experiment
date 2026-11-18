module

public import Kernel.Feature.Data.Juel.Coercion

/-! # Data: the Core JUEL evaluator

One parsed JUEL text evaluates over the portable value domain and Java's carriers for it, as the pinned
`cibseven-juel` does ([expression semantics](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#evaluation)).
Integers are 64-bit and carry their Java class; a rule that would build a Double, or reach a Java surface the kernel
does not represent, ends as `unsupported`. Lean's `String` holds Unicode scalars, so every rule that counts, cuts or
orders a String converts it to UTF-16 code units first, as Java's `String` is.
-/

public section

namespace Kernel.Feature.Data.Juel

/-! ## Operators (`NumberOperations`, `BooleanOperations`; EL §1.7 to §1.11) -/

def aligned (left right : Int × Int) : Int × Int × Int :=
  let scale := max left.2 right.2
  (left.1 * 10 ^ (scale - left.2).toNat, right.1 * 10 ^ (scale - right.2).toNat, scale)

def addDecimal (left right : Int × Int) : Int × Int :=
  let (x, y, scale) := aligned left right
  (x + y, scale)

def subtractDecimal (left right : Int × Int) : Int × Int :=
  let (x, y, scale) := aligned left right
  (x - y, scale)

def multiplyDecimal (left right : Int × Int) : Int × Int := (left.1 * right.1, left.2 + right.2)

/-- `NumberOperations.add`, `sub` or `mul`, given its rule over BigDecimals and over longs. -/
def arithmetic (onDecimal : Int × Int → Int × Int → Int × Int) (onLong : Int → Int → Int) (left right : JVal) :
    Eval JVal := do
  match deciding NumberClass.rank (numberClass left) (numberClass right) with
  | .absent => return long 0
  | .bigDecimal =>
    let a ← toDecimal left
    let b ← toDecimal right
    let (coefficient, scale) := onDecimal a b
    return .decimal coefficient scale
  | .double => double left right
  | .long =>
    let a ← toLong left
    let b ← toLong right
    return long (onLong a b)

def remainder (left right : JVal) : Eval JVal := do
  match deciding NumberClass.rank (numberClass left) (numberClass right) with
  | .absent => return long 0
  | .bigDecimal | .double => double left right
  | .long =>
    let a ← toLong left
    let b ← toLong right
    -- `ArithmeticException`, which no EL resolver wraps (`NumberOperations.java:141`).
    if b == 0 then fail "juel.arithmetic" else return long (a.tmod b)

def negate (value : JVal) : Eval JVal :=
  match value with
  | .null => .ok (long 0)
  | .decimal coefficient scale => .ok (.decimal (-coefficient) scale)
  | .string _ => if dotEe value then double value value else long <$> (Neg.neg <$> toLong value)
  | .int value .integer => .ok (.int (wrap32 (-value)) .integer)
  | .int value .long => .ok (long (-value))
  | .int value .unknown => .ok (.int (wrap64 (-value)) .unknown)
  | .bool _ | .list _ | .map _ => fail elError

def isEmpty : JVal → Bool
  | .null => true
  | .string value => value.isEmpty
  | .list items => items.isEmpty
  | .map entries => entries.isEmpty
  | .bool _ | .int _ _ | .decimal _ _ => false

def unary (op : JuelUnary) (value : JVal) : Eval JVal :=
  match op with
  | .not => (JVal.bool ∘ not) <$> toBool value
  | .neg => negate value
  | .empty => .ok (.bool (isEmpty value))

def orderOf (left right : Int) : Ordering := if left < right then .lt else if left > right then .gt else .eq

/-- `BooleanOperations.lt0`'s order of `left` against `right`, both non-null. -/
def order (left right : JVal) : Eval Ordering := do
  match deciding OrderClass.rank (orderClass left) (orderClass right) with
  | .bigDecimal =>
    let a ← toDecimal left
    let b ← toDecimal right
    let (x, y, _) := aligned a b
    return orderOf x y
  | .long => return orderOf (← toLong left) (← toLong right)
  | .text => return compareUnits (utf16 (← toText left)) (utf16 (← toText right))
  | .boolean _ | .incomparable =>
    match orderClass left, orderClass right with
    | .boolean a, .boolean b => return orderOf (if a then 1 else 0) (if b then 1 else 0)
    -- A Boolean against a List or Map is a `ClassCastException`; two collections are no `Comparable`.
    | _, _ => fail elError

/-- `<`, `>`, `<=` or `>=`: `inclusive` answers two nulls, `holds` reads the order of two non-null operands. -/
def relational (inclusive : Bool) (holds : Ordering → Bool) (left right : JVal) : Eval JVal := do
  -- dynamic-only: Java answers two collections by reference identity first, which values do not have.
  if (isList left && isList right) || (isMap left && isMap right) then limit "juel.identity"
  else if isNull left && isNull right then return .bool inclusive
  else if isNull left || isNull right then return .bool false
  else return .bool (holds (← order left right))

/-- Three-valued conjunction: false wins, then unknown. -/
def allEqual (answers : List (Option Bool)) : Option Bool :=
  if answers.contains (some false) then some false else if answers.contains none then none else some true

/-- Three-valued disjunction: true wins, then unknown. -/
def anyEqual (answers : List (Option Bool)) : Option Bool :=
  if answers.contains (some true) then some true else if answers.contains none then none else some false

/-- Java `equals` of an evaluated value against a context value, three-valued: `none` when it depends on an Integer's
class, which a context value does not record. Every comparison the evaluator makes has a context value on one side, an
item or entry of a collection or the collection itself, whose `equals` Java keeps symmetric; so two equal Integers
always leave the answer to their classes. -/
def javaEquals (left : JVal) (right : Value) : Option Bool :=
  match left with
  | .int a _ =>
    match right with
    | .int b => if a != b then some false else none
    | .null | .bool _ | .decimal _ _ | .string _ | .stringList _ | .list _ | .map _ => some false
  | .decimal a scaleA =>
    match right with
    | .decimal b scaleB => some (a == b && scaleA == (scaleB : Int))
    | .null | .bool _ | .int _ | .string _ | .stringList _ | .list _ | .map _ => some false
  | .list items => valueEquals (.list items) right
  | .map entries => valueEquals (.map entries) right
  | .null =>
    match right with
    | .null => some true
    | .bool _ | .int _ | .decimal _ _ | .string _ | .stringList _ | .list _ | .map _ => some false
  | .bool a =>
    match right with
    | .bool b => some (a == b)
    | .null | .int _ | .decimal _ _ | .string _ | .stringList _ | .list _ | .map _ => some false
  | .string a =>
    match right with
    | .string b => some (a == b)
    | .null | .bool _ | .int _ | .decimal _ _ | .stringList _ | .list _ | .map _ => some false
where
  /-- Two context values, both of unknown class at every depth. -/
  valueEquals : Value → Value → Option Bool
    | .int a, right =>
      match right with
      | .int b => if a != b then some false else none
      | .null | .bool _ | .decimal _ _ | .string _ | .stringList _ | .list _ | .map _ => some false
    | .decimal a scaleA, right =>
      match right with
      | .decimal b scaleB => some (a == b && scaleA == scaleB)
      | .null | .bool _ | .int _ | .string _ | .stringList _ | .list _ | .map _ => some false
    | .list left, right =>
      match right with
      | .list right =>
        if left.length != right.length then some false
        else allEqual ((left.attach.zip right).map fun (⟨a, _⟩, b) => valueEquals a b)
      | .stringList right => textsEqual right left
      | .null | .bool _ | .int _ | .decimal _ _ | .string _ | .map _ => some false
    | .stringList left, right =>
      match right with
      | .stringList right => some (left == right)
      | .list right => textsEqual left right
      | .null | .bool _ | .int _ | .decimal _ _ | .string _ | .map _ => some false
    | .map left, right =>
      match right with
      | .map right =>
        if left.length != right.length then some false
        else allEqual (left.attach.map fun ⟨entry, _⟩ =>
          match right.find? (·.1 == entry.1) with
          | some (_, other) => valueEquals entry.2 other
          | none => some false)
      | .null | .bool _ | .int _ | .decimal _ _ | .string _ | .stringList _ | .list _ => some false
    | .null, right =>
      match right with
      | .null => some true
      | .bool _ | .int _ | .decimal _ _ | .string _ | .stringList _ | .list _ | .map _ => some false
    | .bool a, right =>
      match right with
      | .bool b => some (a == b)
      | .null | .int _ | .decimal _ _ | .string _ | .stringList _ | .list _ | .map _ => some false
    | .string a, right =>
      match right with
      | .string b => some (a == b)
      | .null | .bool _ | .int _ | .decimal _ _ | .stringList _ | .list _ | .map _ => some false
  termination_by left => sizeOf left
  decreasing_by
    all_goals simp_wf
    · have := List.sizeOf_lt_of_mem ‹_ ∈ left›; omega
    · have := List.sizeOf_lt_of_mem ‹entry ∈ left›
      cases entry; simp_all; omega
  /-- A `stringList` against a List: equal Strings in order. -/
  textsEqual (texts : List String) (items : List Value) : Option Bool :=
    if texts.length != items.length then some false
    else some ((texts.zip items).all fun (text, item) =>
      match item with
      | .string other => other == text
      | .null | .bool _ | .int _ | .decimal _ _ | .stringList _ | .list _ | .map _ => false)

def decided (answer : Option Bool) : Eval Bool :=
  match answer with
  | some value => .ok value
  -- dynamic-only: an Integer's Java class is not recorded in a value.
  | none => limit "juel.integerCarrier"

/-- `BooleanOperations.eq`. -/
def equal (left right : JVal) : Eval Bool := do
  match deciding EqualClass.rank (equalClass left) (equalClass right) with
  | .absent => return isNull left && isNull right
  | .bigDecimal => return (← toDecimal left) == (← toDecimal right)
  | .long => return (← toLong left) == (← toLong right)
  | .boolean => return (← toBool left) == (← toBool right)
  | .text => return (← toText left) == (← toText right)
  | .collection value => decided (javaEquals left value)

/-- `left op right`, the one dispatch over `JuelBinary`: `and` and `or` skip their right operand once the left one
decides (EL §1.9); every other operator evaluates both, left first. -/
def binary (op : JuelBinary) (sub : Nat → Eval JVal) (leftIndex rightIndex : Nat) : Eval JVal :=
  let both (rule : JVal → JVal → Eval JVal) : Eval JVal := do rule (← sub leftIndex) (← sub rightIndex)
  let logical (decisive : Bool) : Eval JVal := do
    let first ← toBool (← sub leftIndex)
    if first == decisive then return .bool first
    return .bool (← toBool (← sub rightIndex))
  match op with
  | .div => limit "expression.juel.division"
  | .and => logical false
  | .or => logical true
  | .eq => both fun left right => JVal.bool <$> equal left right
  | .ne => both fun left right => (JVal.bool ∘ not) <$> equal left right
  | .lt => both (relational false (· == .lt))
  | .gt => both (relational false (· == .gt))
  | .le => both (relational true (· != .gt))
  | .ge => both (relational true (· != .lt))
  | .add => both (arithmetic addDecimal (· + ·))
  | .sub => both (arithmetic subtractDecimal (· - ·))
  | .mul => both (arithmetic multiplyDecimal (· * ·))
  | .mod => both remainder

/-! ## Property access (`AstProperty.eval`; EL §1.6) -/

/-- `ListELResolver`'s index: an Integer narrowed as `intValue`, a String through `Integer.parseInt`. -/
def listIndex : JVal → Eval Int
  | .int value _ => .ok (wrap32 value)
  | .string text =>
    -- dynamic-only: `Integer.parseInt` reads Unicode digits the kernel does not model.
    if !isAscii text then limit "juel.nonAsciiText"
    else match parseJavaInt? text with
      | some parsed => .ok parsed
      | none => fail elError
  -- dynamic-only: another index kind's coercion depends on the shaded resolver.
  | .null | .bool _ | .decimal _ _ | .list _ | .map _ => limit "juel.indexType"

def listItem? (items : List Value) (index : Int) : Option Value :=
  if index < 0 then none else items[index.toNat]?

/-- A property of a scalar base: one of the bean properties its class has is a host property, anything else is not
found. -/
def scalarProperty (beanProperties : List String) (name : JVal) : Eval JVal := do
  -- dynamic-only: a Java bean property of a host class.
  if beanProperties.contains (← toText name) then limit "juel.beanProperty" else fail "juel.propertyNotFound"

/-- `base.name` or `base[name]` over a non-null base and property. -/
def property (base name : JVal) : Eval JVal := do
  match base with
  | .map entries =>
    match name with
    | .string key => return ((entries.find? (·.1 == key)).map (fromValue ·.2)).getD .null
    -- dynamic-only: a non-String key's lookup depends on the host Map class.
    | .null | .bool _ | .int _ _ | .decimal _ _ | .list _ | .map _ => limit "juel.indexType"
  | .list items => return ((listItem? items (← listIndex name)).map fromValue).getD .null
  | .string _ => scalarProperty ["class", "empty", "blank", "bytes"] name
  | .bool _ | .int _ _ | .decimal _ _ | .null => scalarProperty ["class"] name

/-! ## Methods (`AstMethod.invoke`; the closed list) -/

-- dynamic-only: the receiver's class has a method of that name the kernel does not model (a scalar carrier's `equals`,
-- the writing `Map.replace`), or an argument kind is outside the listed parameter's; either is the run's data.
def wrongReceiver {α : Type} : Eval α := limit "juel.methodReceiver"
def wrongArgument {α : Type} : Eval α := limit "juel.methodArgument"

/-- A listed method the receiver's class lacks: no String, List or Map carrier CIB hands JUEL (CIB-CFG-0009) declares
it, so the call throws `MethodNotFoundException` (`AstMethod.java:91-93`), an `ELException`. -/
def missingMethod {α : Type} : Eval α := fail elError

def textArgument : Option JVal → Eval String
  | some (.string value) => .ok value
  | _ => wrongArgument

def intArgument : Option JVal → Eval Int
  | some (.int value _) => .ok (wrap32 value)
  | _ => wrongArgument

/-- A String a cut or insertion produced, unless it split a surrogate pair. -/
def whole (units : List Nat) : Eval JVal :=
  match decodeUtf16 units with
  | some chars => .ok (.string (String.ofList chars))
  -- dynamic-only: a cut inside a surrogate pair depends on the run's data.
  | none => limit "juel.surrogateSplit"

def indexResult (found : Option Nat) : JVal :=
  integer (match found with
    | some index => index
    | none => -1)

def stringMethod (method : JuelMethod) (receiver : String) (args : List JVal) : Eval JVal := do
  let units := utf16 receiver
  let asciiCase (mapping : String → String) : Eval JVal :=
    -- dynamic-only: Java maps a non-ASCII character by the JVM's default locale.
    if !isAscii receiver then limit "juel.nonAsciiText" else .ok (.string (mapping receiver))
  match method with
  | .length => return integer units.length
  | .isEmpty => return .bool receiver.isEmpty
  | .equals =>
    return .bool (match args.head? with
      | some (.string other) => other == receiver
      | _ => false)
  | .contains => return .bool (firstIndex (utf16 (← textArgument args.head?)) units).isSome
  | .startsWith => return .bool ((utf16 (← textArgument args.head?)).isPrefixOf units)
  | .endsWith => return .bool ((utf16 (← textArgument args.head?)).isSuffixOf units)
  | .indexOf => return indexResult (firstIndex (utf16 (← textArgument args.head?)) units)
  | .lastIndexOf => return indexResult (lastIndex (utf16 (← textArgument args.head?)) units)
  | .concat => return .string (receiver ++ (← textArgument args.head?))
  | .substring =>
    let begin ← intArgument args.head?
    let finish ← if args.length == 1 then pure (units.length : Int) else intArgument args[1]?
    -- `StringIndexOutOfBoundsException` (`String.substring`).
    if begin < 0 || finish > units.length || begin > finish then fail elError
    else whole ((units.drop begin.toNat).take (finish - begin).toNat)
  | .toUpperCase => asciiCase String.toUpper
  | .toLowerCase => asciiCase String.toLower
  | .trim => return .string (String.ofList (javaTrim receiver.toList))
  | .replace =>
    let target ← textArgument args.head?
    let replacement ← textArgument args[1]?
    let (targetUnits, replacementUnits) := (utf16 target, utf16 replacement)
    if targetUnits.isEmpty then
      whole (replacementUnits ++ (units.flatMap (· :: replacementUnits)))
    else whole (replaceUnits targetUnits replacementUnits units)
  | .size | .get | .containsKey | .containsValue => missingMethod

def listMethod (method : JuelMethod) (items : List Value) (argument : JVal) : Eval JVal := do
  let found (indexes : List Nat) : Eval JVal := do
    for index in indexes do
      if ← decided (javaEquals argument (items[index]?.getD .null)) then return integer index
    return integer (-1)
  match method with
  | .isEmpty => return .bool items.isEmpty
  | .size => return integer items.length
  | .equals => return .bool (← decided (javaEquals argument (.list items)))
  | .contains => return .bool (← decided (anyEqual (items.map (javaEquals argument))))
  | .indexOf => found (List.range items.length)
  | .lastIndexOf => found (List.range items.length).reverse
  | .get =>
    let index ← intArgument (some argument)
    -- `IndexOutOfBoundsException` (`List.get`).
    match listItem? items index with
    | some item => return fromValue item
    | none => fail elError
  | .length | .startsWith | .endsWith | .substring | .toUpperCase | .toLowerCase | .trim | .concat
  | .replace | .containsKey | .containsValue => missingMethod

def mapMethod (method : JuelMethod) (entries : List (String × Value)) (argument : JVal) : Eval JVal := do
  match method with
  | .isEmpty => return .bool entries.isEmpty
  | .size => return integer entries.length
  | .equals => return .bool (← decided (javaEquals argument (.map entries)))
  | .get =>
    let key ← textArgument (some argument)
    return ((entries.find? (·.1 == key)).map (fromValue ·.2)).getD .null
  | .containsKey =>
    let key ← textArgument (some argument)
    return .bool (entries.any (·.1 == key))
  | .containsValue =>
    return .bool (← decided (anyEqual (entries.map fun (_, value) => javaEquals argument value)))
  | .length | .contains | .startsWith | .endsWith | .indexOf | .lastIndexOf | .substring
  | .toUpperCase | .toLowerCase | .trim | .concat => missingMethod
  | .replace => wrongReceiver

def applyMethod (method : JuelMethod) (receiver : JVal) (args : List JVal) : Eval JVal :=
  let first := args.head?.getD .null
  match receiver with
  | .string value => stringMethod method value args
  | .list items => listMethod method items first
  | .map entries => mapMethod method entries first
  | .null | .bool _ | .int _ _ | .decimal _ _ => wrongReceiver

def methodCall (payload : JuelCallNode) (sub : Nat → Eval JVal) : Eval JVal := do
  match payload.target with
  | .other _ => limit "expression.juel.method"
  | .listed method =>
    if !method.admits payload.args.length then limit "expression.juel.method"
    else
      let receiver ← sub payload.receiver
      if isNull receiver then fail "juel.propertyNotFound"
      else applyMethod method receiver (← payload.args.mapM sub)

/-! ## Nodes -/

/-- One node, given `sub`, the evaluation of an earlier node: the one dispatch over `JuelNode`, kept apart from the
recursion so that it is a single match site (guard 18). -/
def visit (context : EvalContext) (sub : Nat → Eval JVal) : JuelNode → Eval JVal
  | .text value => .ok (.string value)
  | .composite parts => do
    let rendered ← parts.mapM fun part => do toText (← sub part)
    return .string (String.join rendered)
  | .null => .ok .null
  | .bool value => .ok (.bool value)
  | .integer digits =>
    match integerLexeme? digits with
    | some value => .ok (long value)
    | none => malformed
  | .float _ => limit "expression.juel.floatLiteral"
  | .stringLiteral value => .ok (.string value)
  | .identifier name =>
    match context.variables.find? (·.1 == name) with
    | some (_, value) => .ok (fromValue value)
    | none => fail "unknown-variable"
  | .function _ => limit "expression.juel.function"
  | .dot base name => do
    let value ← sub base
    if isNull value then return .null else property value (.string name)
  | .bracket base name => do
    let value ← sub base
    if isNull value then return .null
    let key ← sub name
    if isNull key then return .null else property value key
  | .call payload => methodCall payload sub
  | .computedCall _ => limit "expression.juel.computedMethod"
  | .unary op operand => do unary op (← sub operand)
  | .binary payload => binary payload.op sub payload.left payload.right
  | .choice payload => do
    if ← toBool (← sub payload.condition) then sub payload.whenTrue else sub payload.whenFalse

/-- Node `position`; every child is an earlier node, so the recursion ends. -/
def node (context : EvalContext) (nodes : Array JuelNode) (position : Nat) : Eval JVal :=
  match nodes[position]? with
  | none => malformed
  | some current =>
    visit context (fun index => if index < position then node context nodes index else malformed) current
termination_by position

/-- Evaluate a JUEL node table against the context's variables, innermost binding first. -/
def evaluateJuel (context : EvalContext) (nodes : List JuelNode) : Evaluation :=
  if nodes.isEmpty then .unsupported "expression.juel.malformed"
  else
    match node context nodes.toArray (nodes.length - 1) with
    | .error (.failure code) => .failure code
    | .error (.unsupported code) => .unsupported code
    | .ok result =>
      match (if context.domainChecked then portable else siteValue) result with
      | some value => .value value
      -- dynamic-only: whether a result is portable depends on the run's data.
      | none => .unsupported "juel.resultOutsideDomain"

end Kernel.Feature.Data.Juel
