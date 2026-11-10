/**
 * The FEEL unary-test subset of [decision semantics](../../../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md#4-feel-subset-lexical-and-syntactic)
 * item 4, read to the kernel IL's `InputEntry` and `OutputEntry` (`Kernel.IL.Types.Decision`). A text the grammar does
 * not derive in full is kept as `foreign`, which admission refuses (`decision.feel`); the reader decides no kind or
 * domain, which admission checks against each input's and output's `typeRef`.
 */
import { ctor } from "./wire.js";
import type { KernelJson } from "./wire.js";

const keywords: ReadonlySet<string> = new Set(["true", "false", "null", "not"]);
const whitespace: ReadonlySet<string> = new Set([" ", "\t", "\r", "\n"]);
const isDigit = (char: string | undefined): boolean => char !== undefined && char >= "0" && char <= "9";

/** A cursor over one entry's text; every `read` either consumes its form and returns it, or returns `null` unmoved. */
class Cursor {
  position = 0;
  constructor(readonly text: string) {}

  get done(): boolean {
    return this.position >= this.text.length;
  }

  skipSpace(): void {
    while (whitespace.has(this.text[this.position] ?? "")) this.position += 1;
  }

  take(token: string): boolean {
    if (!this.text.startsWith(token, this.position)) return false;
    this.position += token.length;
    return true;
  }

  /** A keyword, not followed by a name character, so `trueish` is no `true`. */
  keyword(word: string): boolean {
    const after = this.text[this.position + word.length];
    if (!this.text.startsWith(word, this.position) || (after !== undefined && /[A-Za-z0-9_]/u.test(after))) return false;
    this.position += word.length;
    return true;
  }

  /** `"-"? ( digit+ ( "." digit+ )? | "." digit+ )`, as `coefficient × 10^-scale` exactly as written. */
  number(): KernelJson | null {
    const start = this.position;
    const negative = this.take("-");
    let whole = "";
    while (isDigit(this.text[this.position])) whole += this.text[this.position++];
    let fraction = "";
    if (this.text[this.position] === "." && isDigit(this.text[this.position + 1])) {
      this.position += 1;
      while (isDigit(this.text[this.position])) fraction += this.text[this.position++];
    }
    if (whole === "" && fraction === "") {
      this.position = start;
      return null;
    }
    const magnitude = BigInt(whole + fraction);
    return ctor("number", { coefficient: String(negative ? -magnitude : magnitude), scale: fraction.length });
  }

  /** `'"' ( any char except '"', '\', CR, LF | '\"' | '\\' )* '"'`. */
  string(): KernelJson | null {
    const start = this.position;
    if (!this.take("\"")) return null;
    let value = "";
    for (;;) {
      const char = this.text[this.position];
      if (char === undefined || char === "\r" || char === "\n") break;
      this.position += 1;
      if (char === "\"") return ctor("string", { value });
      if (char !== "\\") {
        value += char;
        continue;
      }
      const escaped = this.text[this.position];
      if (escaped !== "\"" && escaped !== "\\") break;
      value += escaped;
      this.position += 1;
    }
    this.position = start;
    return null;
  }

  literal(): KernelJson | null {
    if (this.keyword("true")) return ctor("bool", { value: true });
    if (this.keyword("false")) return ctor("bool", { value: false });
    if (this.keyword("null")) return "null";
    return this.string() ?? this.number();
  }

  /** `( "[" | "(" | "]" ) number ".." number ( "]" | ")" | "[" )`: only `[` closes the low end and `]` the high end. */
  interval(): KernelJson | null {
    const start = this.position;
    const open = this.text[this.position];
    if (open !== "[" && open !== "(" && open !== "]") return null;
    this.position += 1;
    this.skipSpace();
    const low = this.number();
    this.skipSpace();
    const dots = low !== null && this.take("..");
    this.skipSpace();
    const high = dots ? this.number() : null;
    this.skipSpace();
    const close = this.text[this.position];
    if (high === null || (close !== "]" && close !== ")" && close !== "[")) {
      this.position = start;
      return null;
    }
    this.position += 1;
    return ctor("interval", { value: { low, lowClosed: open === "[", high, highClosed: close === "]" } });
  }

  test(): KernelJson | null {
    for (const [token, operator] of [["<=", "le"], [">=", "ge"], ["<", "lt"], [">", "gt"]] as const) {
      const start = this.position;
      if (!this.take(token)) continue;
      this.skipSpace();
      const bound = this.number();
      if (bound !== null) return ctor("compare", { operator, bound });
      this.position = start;
      return null;
    }
    const range = this.interval();
    if (range !== null) return range;
    const value = this.literal();
    return value === null ? null : ctor("literal", { value });
  }

  /** `test ( "," test )*`, never empty. */
  tests(negated: boolean): KernelJson | null {
    const first = this.test();
    if (first === null) return null;
    const rest: KernelJson[] = [];
    for (;;) {
      const start = this.position;
      this.skipSpace();
      if (!this.take(",")) {
        this.position = start;
        break;
      }
      this.skipSpace();
      const next = this.test();
      if (next === null) return null;
      rest.push(next);
    }
    return { negated, first, rest };
  }
}

/** The whole text, with surrounding whitespace, derived by `read`; `null` when anything is left over. */
function whole(text: string, read: (cursor: Cursor) => KernelJson | null): KernelJson | null {
  const cursor = new Cursor(text);
  cursor.skipSpace();
  const value = read(cursor);
  cursor.skipSpace();
  return value !== null && cursor.done ? value : null;
}

const foreign = (language: string | null, text: string): KernelJson => ctor("foreign", { value: { language, text } });

/** The text without the grammar's surrounding whitespace (space, tab, CR, LF), which `String.trim` would widen. */
function stripped(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && whitespace.has(text[start] ?? "")) start += 1;
  while (end > start && whitespace.has(text[end - 1] ?? "")) end -= 1;
  return text.slice(start, end);
}

/** An input entry: `-` or empty text is `any`; otherwise a test list, optionally inside `not( )`. */
export function inputEntry(text: string, language: string | null): KernelJson {
  if (language !== null) return foreign(language, text);
  const body = stripped(text);
  if (body === "" || body === "-") return "any";
  const read = whole(text, (cursor) => {
    if (cursor.keyword("not")) {
      cursor.skipSpace();
      if (!cursor.take("(")) return null;
      cursor.skipSpace();
      const list = cursor.tests(true);
      cursor.skipSpace();
      return list !== null && cursor.take(")") ? ctor("tests", { value: list }) : null;
    }
    const list = cursor.tests(false);
    return list === null ? null : ctor("tests", { value: list });
  });
  return read ?? foreign(null, text);
}

/** An output entry: blank text is `blank`, a literal is `literal`, anything else `foreign`. */
export function outputEntry(text: string, language: string | null): KernelJson {
  if (language !== null) return foreign(language, text);
  if (stripped(text) === "") return "blank";
  const value = whole(text, (cursor) => cursor.literal());
  return value === null ? foreign(null, text) : ctor("literal", { value });
}

/** An input expression: a bare name that is not a keyword. */
export function inputExpression(text: string, language: string | null): KernelJson {
  const name = whole(text, (cursor) => {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/u.exec(cursor.text.slice(cursor.position));
    if (match === null || keywords.has(match[0])) return null;
    cursor.position += match[0].length;
    return match[0];
  });
  return language === null && typeof name === "string" ? ctor("variable", { name }) : foreign(language, text);
}
