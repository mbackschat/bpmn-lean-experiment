const JsonToken = {
  Array: "[",
  False: "f",
  Null: "n",
  NumberNegative: "-",
  Object: "{",
  String: '"',
  True: "t",
} as const;

const simpleEscapes: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

type TextDecoderConstructor = new (
  label?: string,
  options?: Readonly<{ fatal?: boolean }>,
) => Readonly<{ decode(input?: Uint8Array): string }>;

const RuntimeTextDecoder = (
  globalThis as typeof globalThis & Readonly<{ TextDecoder: TextDecoderConstructor }>
).TextDecoder;

/**
 * Parses one UTF-8 JSON value while preserving ordinary JSON.parse value behavior.
 * @throws SyntaxError for malformed UTF-8 or JSON, duplicate decoded object keys, or unpaired surrogates.
 */
export function parseStrictJson(bytes: Uint8Array): unknown {
  let source: string;
  try {
    source = new RuntimeTextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidJson();
  }
  return new StrictJsonParser(source).parse();
}

class StrictJsonParser {
  #index = 0;

  constructor(private readonly source: string) {}

  parse(): unknown {
    this.#skipWhitespace();
    const value = this.#parseValue();
    this.#skipWhitespace();
    if (this.#index !== this.source.length) throw invalidJson();
    return value;
  }

  #parseValue(): unknown {
    switch (this.source[this.#index]) {
      case JsonToken.Object:
        return this.#parseObject();
      case JsonToken.Array:
        return this.#parseArray();
      case JsonToken.String:
        return this.#parseString();
      case JsonToken.True:
        return this.#parseLiteral("true", true);
      case JsonToken.False:
        return this.#parseLiteral("false", false);
      case JsonToken.Null:
        return this.#parseLiteral("null", null);
      case JsonToken.NumberNegative:
        return this.#parseNumber();
      default:
        if (isDigit(this.source[this.#index])) return this.#parseNumber();
        throw invalidJson();
    }
  }

  #parseObject(): Record<string, unknown> {
    this.#index += 1;
    this.#skipWhitespace();
    const value: Record<string, unknown> = {};
    const keys = new Set<string>();
    if (this.#consume("}")) return value;
    while (true) {
      if (this.source[this.#index] !== '"') throw invalidJson();
      const key = this.#parseString();
      if (keys.has(key)) throw invalidJson();
      keys.add(key);
      this.#skipWhitespace();
      if (!this.#consume(":")) throw invalidJson();
      this.#skipWhitespace();
      const member = this.#parseValue();
      Object.defineProperty(value, key, {
        configurable: true,
        enumerable: true,
        value: member,
        writable: true,
      });
      this.#skipWhitespace();
      if (this.#consume("}")) return value;
      if (!this.#consume(",")) throw invalidJson();
      this.#skipWhitespace();
    }
  }

  #parseArray(): unknown[] {
    this.#index += 1;
    this.#skipWhitespace();
    const value: unknown[] = [];
    if (this.#consume("]")) return value;
    while (true) {
      value.push(this.#parseValue());
      this.#skipWhitespace();
      if (this.#consume("]")) return value;
      if (!this.#consume(",")) throw invalidJson();
      this.#skipWhitespace();
    }
  }

  #parseString(): string {
    this.#index += 1;
    let value = "";
    while (this.#index < this.source.length) {
      const character = this.source[this.#index];
      if (character === '"') {
        this.#index += 1;
        return value;
      }
      if (character === "\\") {
        value += this.#parseEscape();
        continue;
      }
      const codeUnit = this.source.charCodeAt(this.#index);
      if (codeUnit <= 0x1f || isLowSurrogate(codeUnit)) throw invalidJson();
      if (isHighSurrogate(codeUnit)) {
        const low = this.source.charCodeAt(this.#index + 1);
        if (!isLowSurrogate(low)) throw invalidJson();
        value += this.source.slice(this.#index, this.#index + 2);
        this.#index += 2;
        continue;
      }
      value += character;
      this.#index += 1;
    }
    throw invalidJson();
  }

  #parseEscape(): string {
    this.#index += 1;
    const escape = this.source[this.#index];
    if (escape === "u") {
      this.#index += 1;
      const high = this.#parseHexCodeUnit();
      if (isLowSurrogate(high)) throw invalidJson();
      if (!isHighSurrogate(high)) return String.fromCharCode(high);
      if (
        this.source[this.#index] !== "\\" ||
        this.source[this.#index + 1] !== "u"
      ) {
        throw invalidJson();
      }
      this.#index += 2;
      const low = this.#parseHexCodeUnit();
      if (!isLowSurrogate(low)) throw invalidJson();
      return String.fromCharCode(high, low);
    }
    const decoded = escape === undefined ? undefined : simpleEscapes[escape];
    if (decoded === undefined) throw invalidJson();
    this.#index += 1;
    return decoded;
  }

  #parseHexCodeUnit(): number {
    const digits = this.source.slice(this.#index, this.#index + 4);
    if (!/^[0-9a-fA-F]{4}$/u.test(digits)) throw invalidJson();
    this.#index += 4;
    return Number.parseInt(digits, 16);
  }

  #parseLiteral<Result>(token: string, value: Result): Result {
    if (!this.source.startsWith(token, this.#index)) throw invalidJson();
    this.#index += token.length;
    return value;
  }

  #parseNumber(): number {
    const start = this.#index;
    this.#consume("-");
    if (this.#consume("0")) {
      if (isDigit(this.source[this.#index])) throw invalidJson();
    } else {
      if (!isNonzeroDigit(this.source[this.#index])) throw invalidJson();
      while (isDigit(this.source[this.#index])) this.#index += 1;
    }
    if (this.#consume(".")) {
      if (!isDigit(this.source[this.#index])) throw invalidJson();
      while (isDigit(this.source[this.#index])) this.#index += 1;
    }
    if (this.source[this.#index] === "e" || this.source[this.#index] === "E") {
      this.#index += 1;
      if (this.source[this.#index] === "+" || this.source[this.#index] === "-") {
        this.#index += 1;
      }
      if (!isDigit(this.source[this.#index])) throw invalidJson();
      while (isDigit(this.source[this.#index])) this.#index += 1;
    }
    return Number(this.source.slice(start, this.#index));
  }

  #skipWhitespace(): void {
    while (
      this.source[this.#index] === " " ||
      this.source[this.#index] === "\t" ||
      this.source[this.#index] === "\n" ||
      this.source[this.#index] === "\r"
    ) {
      this.#index += 1;
    }
  }

  #consume(expected: string): boolean {
    if (this.source[this.#index] !== expected) return false;
    this.#index += 1;
    return true;
  }
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function isNonzeroDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "1" && character <= "9";
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function invalidJson(): SyntaxError {
  return new SyntaxError(
    "Input must be valid UTF-8 JSON without duplicate keys or unpaired surrogates",
  );
}
