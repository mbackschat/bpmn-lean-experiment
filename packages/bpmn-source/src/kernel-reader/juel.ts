/**
 * The JUEL reader: a transcription of the pinned `cibseven-juel` `Scanner` and `Parser` (EL 2.2 with method
 * invocations) that turns one text into the kernel IL's flat node table, children before parents and the root last
 * ([expression semantics](../../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#grammar-at-core)). The parse is
 * meaning-preserving; the source bytes stay in the preserved source. A text outside the pinned grammar, or with a
 * non-ASCII character outside a string literal, has no parse (`null`), and the caller keeps it `foreign`.
 */
import { ctor } from "./wire.js";
import type { KernelJson } from "./wire.js";

enum Symbol {
  Text = "text", StartDynamic = "${", StartDeferred = "#{", EndEval = "}", Eof = "eof",
  Identifier = "identifier", Integer = "integer", Float = "float", String = "string",
  Mul = "*", Div = "div", Mod = "mod", Plus = "+", Minus = "-", Question = "?", Colon = ":", LBrack = "[",
  RBrack = "]", LParen = "(", RParen = ")", Comma = ",", Dot = ".", Eq = "eq", Ne = "ne", Lt = "lt", Gt = "gt",
  Le = "le", Ge = "ge", And = "and", Or = "or", Not = "not", Empty = "empty", Null = "null", True = "true",
  False = "false", Instanceof = "instanceof",
}

type Token = Readonly<{ symbol: Symbol; image: string; size: number }>;

class Unparsed extends Error {}

/** `Scanner.java:149-164`: scanned as keywords, never identifiers (EL §1.14). */
const keywordSymbols: Readonly<Record<string, Symbol>> = {
  null: Symbol.Null, true: Symbol.True, false: Symbol.False, empty: Symbol.Empty, div: Symbol.Div, mod: Symbol.Mod,
  not: Symbol.Not, and: Symbol.And, or: Symbol.Or, le: Symbol.Le, lt: Symbol.Lt, eq: Symbol.Eq, ne: Symbol.Ne,
  ge: Symbol.Ge, gt: Symbol.Gt, instanceof: Symbol.Instanceof,
};

const isDigit = (char: string): boolean => char >= "0" && char <= "9";
/** `Character.isWhitespace` over ASCII; non-ASCII whitespace leaves the text unparsed. */
const isWhitespace = (char: string): boolean => /^[\t\n\u000b\f\r \u001c-\u001f]$/u.test(char);
const isIdentifierStart = (char: string): boolean => /^[A-Za-z_$]$/u.test(char);
/** `Character.isJavaIdentifierPart` over ASCII: letters, digits, `_`, `$` and the identifier-ignorable controls. */
const isIdentifierPart = (char: string): boolean => /^[A-Za-z0-9_$\u0000-\u0008\u000e-\u001b\u007f]$/u.test(char);

/** `Scanner`: text outside an eval, tokens inside it. */
class Scanner {
  private position = 0;
  private token: Token | null = null;

  constructor(private readonly input: string) {}

  private inEval(): boolean {
    return this.token !== null && this.token.symbol !== Symbol.Text && this.token.symbol !== Symbol.EndEval;
  }

  next(): Token {
    if (this.token !== null) this.position += this.token.size;
    if (this.inEval()) {
      while (this.position < this.input.length && isWhitespace(this.input.charAt(this.position))) this.position += 1;
    }
    this.token = this.position === this.input.length ? { symbol: Symbol.Eof, image: "", size: 0 } : this.nextToken();
    return this.token;
  }

  private nextToken(): Token {
    const input = this.input;
    const at = this.position;
    if (this.inEval()) return input.charAt(at) === "}" ? fixed(Symbol.EndEval) : this.nextEval();
    if (at + 1 < input.length && input.charAt(at + 1) === "{") {
      if (input.charAt(at) === "#") return fixed(Symbol.StartDeferred);
      if (input.charAt(at) === "$") return fixed(Symbol.StartDynamic);
    }
    return this.nextText();
  }

  /** `Scanner.nextText`: a backslash escapes `${` and `#{`; a backslash after one stays armed (`\\${x}` is text). */
  private nextText(): Token {
    const input = this.input;
    let out = "";
    let escaped = false;
    let index = this.position;
    while (index < input.length) {
      const char = input.charAt(index);
      if (char === "\\") {
        if (escaped) out += "\\";
        else escaped = true;
      } else if ((char === "#" || char === "$") && input.charAt(index + 1) === "{") {
        if (!escaped) return { symbol: Symbol.Text, image: out, size: index - this.position };
        out += char;
        escaped = false;
      } else {
        if (escaped) out += "\\";
        out += char;
        escaped = false;
      }
      index += 1;
    }
    if (escaped) out += "\\";
    return { symbol: Symbol.Text, image: out, size: index - this.position };
  }

  /** `Scanner.nextString`: only `\\` and the escaped quote are escapes. */
  private nextString(): Token {
    const input = this.input;
    const quote = input.charAt(this.position);
    let out = "";
    let index = this.position + 1;
    while (index < input.length) {
      const char = input.charAt(index);
      index += 1;
      if (char === "\\") {
        const escapedChar = input.charAt(index);
        index += 1;
        if (escapedChar !== "\\" && escapedChar !== quote) throw new Unparsed("invalid escape");
        out += escapedChar;
      } else if (char === quote) {
        return { symbol: Symbol.String, image: out, size: index - this.position };
      } else {
        out += char;
      }
    }
    throw new Unparsed("unterminated string");
  }

  /** `Scanner.nextNumber`: a point, or an exponent with digits, makes a floating literal. */
  private nextNumber(): Token {
    const input = this.input;
    let index = this.position;
    while (index < input.length && isDigit(input.charAt(index))) index += 1;
    let symbol = Symbol.Integer;
    if (input.charAt(index) === ".") {
      index += 1;
      while (index < input.length && isDigit(input.charAt(index))) index += 1;
      symbol = Symbol.Float;
    }
    if (input.charAt(index) === "e" || input.charAt(index) === "E") {
      const exponent = index;
      index += 1;
      if (input.charAt(index) === "+" || input.charAt(index) === "-") index += 1;
      if (index < input.length && isDigit(input.charAt(index))) {
        while (index < input.length && isDigit(input.charAt(index))) index += 1;
        symbol = Symbol.Float;
      } else {
        index = exponent;
      }
    }
    return { symbol, image: input.slice(this.position, index), size: index - this.position };
  }

  private nextEval(): Token {
    const input = this.input;
    const first = input.charAt(this.position);
    const second = input.charAt(this.position + 1);
    const single: Readonly<Record<string, Symbol>> = {
      "*": Symbol.Mul, "/": Symbol.Div, "%": Symbol.Mod, "+": Symbol.Plus, "-": Symbol.Minus, "?": Symbol.Question,
      ":": Symbol.Colon, "[": Symbol.LBrack, "]": Symbol.RBrack, "(": Symbol.LParen, ")": Symbol.RParen, ",": Symbol.Comma,
    };
    if (Object.hasOwn(single, first)) return { symbol: single[first] as Symbol, image: first, size: 1 };
    if (first === "." && !isDigit(second)) return { symbol: Symbol.Dot, image: ".", size: 1 };
    const pair = first + second;
    const pairs: Readonly<Record<string, Symbol>> = {
      "==": Symbol.Eq, "&&": Symbol.And, "||": Symbol.Or, "!=": Symbol.Ne, "<=": Symbol.Le, ">=": Symbol.Ge,
    };
    if (Object.hasOwn(pairs, pair)) return { symbol: pairs[pair] as Symbol, image: pair, size: 2 };
    if (first === "!") return { symbol: Symbol.Not, image: "!", size: 1 };
    if (first === "<") return { symbol: Symbol.Lt, image: "<", size: 1 };
    if (first === ">") return { symbol: Symbol.Gt, image: ">", size: 1 };
    if (first === "\"" || first === "'") return this.nextString();
    if (isDigit(first) || first === ".") return this.nextNumber();
    if (isIdentifierStart(first)) {
      let index = this.position + 1;
      while (index < input.length && isIdentifierPart(input.charAt(index))) index += 1;
      const name = input.slice(this.position, index);
      const keyword = Object.hasOwn(keywordSymbols, name) ? keywordSymbols[name] : undefined;
      return { symbol: keyword ?? Symbol.Identifier, image: name, size: index - this.position };
    }
    throw new Unparsed(`invalid character ${first}`);
  }
}

const fixed = (symbol: Symbol): Token => ({ symbol, image: symbol, size: symbol === Symbol.Eof ? 0 : symbol.length });

/** `Parser`: recursive descent emitting the node table in post-order. */
class Parser {
  readonly nodes: KernelJson[] = [];
  private token: Token;
  private readonly lookahead: Token[] = [];

  constructor(private readonly scanner: Scanner) {
    this.token = this.scanner.next();
  }

  /** Whether the current token is `symbol`; a call, so that a check after `advance` is not narrowed away. */
  private at(symbol: Symbol): boolean {
    return this.token.symbol === symbol;
  }

  private emit(node: KernelJson): number {
    this.nodes.push(node);
    return this.nodes.length - 1;
  }

  private advance(): Token {
    const consumed = this.token;
    this.token = this.lookahead.shift() ?? this.scanner.next();
    return consumed;
  }

  private peek(offset: number): Token {
    while (this.lookahead.length <= offset) this.lookahead.push(this.scanner.next());
    return this.lookahead[offset] as Token;
  }

  private expect(symbol: Symbol): Token {
    if (this.token.symbol !== symbol) throw new Unparsed(`expected ${symbol}`);
    return this.advance();
  }

  /** `Parser.tree`: text, one eval alone, or a composite whose evals all share the first eval's delimiter. */
  tree(): number {
    const text = this.text();
    if (this.at(Symbol.Eof)) return text ?? this.emit(ctor("text", { value: "" }));
    const deferred = this.at(Symbol.StartDeferred);
    const first = this.evaluation(deferred);
    if (this.at(Symbol.Eof) && text === null) return first;
    const parts = text === null ? [first] : [text, first];
    const after = this.text();
    if (after !== null) parts.push(after);
    while (!this.at(Symbol.Eof)) {
      parts.push(this.evaluation(deferred));
      const more = this.text();
      if (more !== null) parts.push(more);
    }
    return this.emit(ctor("composite", { parts }));
  }

  private text(): number | null {
    if (!this.at(Symbol.Text)) return null;
    return this.emit(ctor("text", { value: this.advance().image }));
  }

  private evaluation(deferred: boolean): number {
    this.expect(deferred ? Symbol.StartDeferred : Symbol.StartDynamic);
    const body = this.expr();
    this.expect(Symbol.EndEval);
    return body;
  }

  private expr(): number {
    const condition = this.binaryLevel(0);
    if (!this.at(Symbol.Question)) return condition;
    this.advance();
    const whenTrue = this.expr();
    this.expect(Symbol.Colon);
    const whenFalse = this.expr();
    return this.emit(ctor("choice", { payload: { condition, whenTrue, whenFalse } }));
  }

  /** `or`, `and`, `eq`, `cmp`, `add`, `mul`: left-associative levels, loosest first. */
  private binaryLevel(level: number): number {
    const operators = binaryLevels[level];
    if (operators === undefined) return this.unary();
    let left = this.binaryLevel(level + 1);
    for (;;) {
      const op = operators[this.token.symbol];
      if (op === undefined) return left;
      this.advance();
      const right = this.binaryLevel(level + 1);
      left = this.emit(ctor("binary", { payload: { op, left, right } }));
    }
  }

  private unary(): number {
    const op = unaryOperators[this.token.symbol];
    if (op === undefined) return this.value();
    this.advance();
    const operand = this.unary();
    return this.emit(ctor("unary", { op, operand }));
  }

  /** `Parser.value`: a nonliteral or literal, then `.name`, `[expr]` and method calls. */
  private value(): number {
    let base = this.nonliteral() ?? this.literal();
    if (base === null) throw new Unparsed("expected an expression");
    for (;;) {
      if (this.at(Symbol.Dot)) {
        this.advance();
        const name = this.expect(Symbol.Identifier).image;
        if (this.at(Symbol.LParen)) {
          const args = this.params();
          // The method name as written; the kernel codecs look it up among the listed methods.
          base = this.emit(ctor("call", { payload: { receiver: base, target: name, args } }));
        } else {
          base = this.emit(ctor("dot", { base, property: name }));
        }
      } else if (this.at(Symbol.LBrack)) {
        this.advance();
        const property = this.expr();
        this.expect(Symbol.RBrack);
        base = this.at(Symbol.LParen)
          ? this.emitComputed(base, property, this.params())
          : this.emit(ctor("bracket", { base, property }));
      } else {
        return base;
      }
    }
  }

  private emitComputed(receiver: number, name: number, args: number[]): number {
    return this.emit(ctor("computedCall", { payload: { receiver, name, args } }));
  }

  private nonliteral(): number | null {
    if (this.at(Symbol.Identifier)) {
      let name = this.advance().image;
      let qualifier: string | null = null;
      if (this.at(Symbol.Colon) && this.peek(0).symbol === Symbol.Identifier && this.peek(1).symbol === Symbol.LParen) {
        this.advance();
        qualifier = name;
        name = this.advance().image;
      }
      if (this.at(Symbol.LParen)) return this.emit(ctor("function", { payload: { qualifier, name, args: this.params() } }));
      return this.emit(ctor("identifier", { name }));
    }
    if (this.at(Symbol.LParen)) {
      this.advance();
      const nested = this.expr();
      this.expect(Symbol.RParen);
      return nested;
    }
    return null;
  }

  private literal(): number | null {
    const { symbol, image } = this.token;
    let literal: KernelJson;
    if (symbol === Symbol.True || symbol === Symbol.False) literal = ctor("bool", { value: symbol === Symbol.True });
    else if (symbol === Symbol.Null) literal = "null";
    else if (symbol === Symbol.String) literal = ctor("stringLiteral", { value: image });
    else if (symbol === Symbol.Integer) {
      // `Parser.java:140` reads it with `Long.valueOf`, which refuses a value above 2^63−1.
      if (BigInt(image) > 9223372036854775807n) throw new Unparsed("integer literal out of range");
      literal = ctor("integer", { digits: image });
    } else if (symbol === Symbol.Float) literal = ctor("float", { lexeme: image });
    else return null;
    this.advance();
    return this.emit(literal);
  }

  private params(): number[] {
    this.expect(Symbol.LParen);
    const args: number[] = [];
    if (!this.at(Symbol.RParen)) {
      args.push(this.expr());
      while (this.at(Symbol.Comma)) {
        this.advance();
        args.push(this.expr());
      }
    }
    this.expect(Symbol.RParen);
    return args;
  }
}

const binaryLevels: ReadonlyArray<Readonly<Partial<Record<Symbol, string>>>> = [
  { [Symbol.Or]: "or" },
  { [Symbol.And]: "and" },
  { [Symbol.Eq]: "eq", [Symbol.Ne]: "ne" },
  { [Symbol.Lt]: "lt", [Symbol.Le]: "le", [Symbol.Ge]: "ge", [Symbol.Gt]: "gt" },
  { [Symbol.Plus]: "add", [Symbol.Minus]: "sub" },
  { [Symbol.Mul]: "mul", [Symbol.Div]: "div", [Symbol.Mod]: "mod" },
];

const unaryOperators: Readonly<Partial<Record<Symbol, string>>> = {
  [Symbol.Not]: "not", [Symbol.Minus]: "neg", [Symbol.Empty]: "empty",
};

/** The node table of `text`, or `null` when the pinned grammar, read over ASCII outside string literals, refuses it. */
export function parseJuel(text: string): KernelJson[] | null {
  try {
    const parser = new Parser(new Scanner(text));
    parser.tree();
    return parser.nodes;
  } catch (error) {
    if (error instanceof Unparsed) return null;
    throw error;
  }
}
