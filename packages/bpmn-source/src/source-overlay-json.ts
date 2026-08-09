/** Parses JSON while rejecting duplicate object keys and lone UTF-16 surrogates. */
export function parseStrictJson(source: string): unknown {
  return new StrictJsonParser(source).parse();
}

class StrictJsonParser {
  private index = 0;

  public constructor(private readonly source: string) {}

  public parse(): unknown {
    const value = this.readValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      this.fail("trailing content");
    }
    return value;
  }

  private readValue(): unknown {
    this.skipWhitespace();
    switch (this.source[this.index]) {
      case "{":
        return this.readObject();
      case "[":
        return this.readArray();
      case '"':
        return this.readString();
      case "t":
        return this.readKeyword("true", true);
      case "f":
        return this.readKeyword("false", false);
      case "n":
        return this.readKeyword("null", null);
      default:
        return this.readNumber();
    }
  }

  private readObject(): Record<string, unknown> {
    this.expect("{");
    const result: Record<string, unknown> = {};
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.take("}")) {
      return result;
    }
    while (true) {
      this.skipWhitespace();
      if (this.source[this.index] !== '"') {
        this.fail("object key must be a string");
      }
      const key = this.readString();
      if (keys.has(key)) {
        this.fail(`duplicate object key ${JSON.stringify(key)}`);
      }
      keys.add(key);
      this.skipWhitespace();
      this.expect(":");
      result[key] = this.readValue();
      this.skipWhitespace();
      if (this.take("}")) {
        return result;
      }
      this.expect(",");
    }
  }

  private readArray(): unknown[] {
    this.expect("[");
    const result: unknown[] = [];
    this.skipWhitespace();
    if (this.take("]")) {
      return result;
    }
    while (true) {
      result.push(this.readValue());
      this.skipWhitespace();
      if (this.take("]")) {
        return result;
      }
      this.expect(",");
    }
  }

  private readString(): string {
    this.expect('"');
    let result = "";
    while (this.index < this.source.length) {
      const character = this.source[this.index++];
      if (character === '"') {
        assertUnicodeScalars(result, () => this.fail("unpaired surrogate"));
        return result;
      }
      if (character === "\\") {
        result += this.readEscape();
        continue;
      }
      if (character === undefined || character.charCodeAt(0) <= 0x1f) {
        this.fail("unescaped control character");
      }
      result += character;
    }
    return this.fail("unterminated string");
  }

  private readEscape(): string {
    const escape = this.source[this.index++];
    switch (escape) {
      case '"':
      case "\\":
      case "/":
        return escape;
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "u": {
        const digits = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-f]{4}$/iu.test(digits)) {
          this.fail("invalid Unicode escape");
        }
        this.index += 4;
        return String.fromCharCode(Number.parseInt(digits, 16));
      }
      default:
        return this.fail("invalid string escape");
    }
  }

  private readNumber(): number {
    const remainder = this.source.slice(this.index);
    const match = remainder.match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (match === null) {
      return this.fail("expected JSON value");
    }
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      return this.fail("number is outside the finite JSON domain");
    }
    return value;
  }

  private readKeyword<T>(token: string, value: T): T {
    if (!this.source.startsWith(token, this.index)) {
      this.fail(`expected ${token}`);
    }
    this.index += token.length;
    return value;
  }

  private skipWhitespace(): void {
    while (/\s/u.test(this.source[this.index] ?? "") &&
      /[\u0009\u000a\u000d\u0020]/u.test(this.source[this.index] ?? "")) {
      this.index += 1;
    }
  }

  private expect(character: string): void {
    if (!this.take(character)) {
      this.fail(`expected ${JSON.stringify(character)}`);
    }
  }

  private take(character: string): boolean {
    if (this.source[this.index] !== character) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private fail(message: string): never {
    throw new SyntaxError(`Invalid JSON at offset ${this.index}: ${message}.`);
  }
}

function assertUnicodeScalars(value: string, fail: () => never): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        fail();
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail();
    }
  }
}
