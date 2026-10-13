/**
 * Parses one JSON document while retaining facts that
 * ordinary JSON.parse discards.
 *
 * JSON object member names are compared after escape decoding, so `"id"` and
 * `"\u0069d"` are the same key. Strings must contain Unicode scalar values;
 * JavaScript's otherwise-permitted unpaired UTF-16 surrogates are rejected.
 */
export function parseStrictJson<T = unknown>(
  text: string,
  label = "JSON document",
): T {
  return parseJson(text, label, false);
}

/** Admits a wire document's canonical unsigned integers before JavaScript can round them (AA-13). */
export function parseWireJson<T = unknown>(
  text: string,
  label = "wire document",
): T {
  return parseJson(text, label, true);
}

/** Preserves malformed-encoding refusal at the actual artifact byte boundary (AA-13). */
export function parseWireJsonBytes<T = unknown>(
  bytes: Uint8Array,
  label = "wire document",
): T {
  return parseWireJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), label);
}

function parseJson<T>(text: string, label: string, wireIntegers: boolean): T {
  scanJsonTokens(text, label, wireIntegers);
  const value: unknown = JSON.parse(text);
  requireWellFormedUnicode(value, label);
  return value as T;
}

export function requireWellFormedUnicode(
  value: unknown,
  label = "wire value",
): void {
  visitStrings(value, (text) => requireUnicodeScalarString(text, label));
}

export function requireUnicodeScalarString(
  value: string,
  label = "wire string",
): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        throw new SyntaxError(`${label} contains an unpaired Unicode surrogate`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new SyntaxError(`${label} contains an unpaired Unicode surrogate`);
    }
  }
}

function visitStrings(
  value: unknown,
  visit: (text: string) => void,
): void {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      visitStrings(item, visit);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      visit(key);
      visitStrings(item, visit);
    }
  }
}

function scanJsonTokens(text: string, label: string, wireIntegers: boolean): void {
  let index = 0;

  function fail(): never {
    throw new SyntaxError(`${label} contains malformed JSON`);
  }

  function expect(character: string): void {
    if (text[index] !== character) fail();
    index += 1;
  }

  function skipWhitespace(): void {
    while (
      text[index] === " " ||
      text[index] === "\n" ||
      text[index] === "\r" ||
      text[index] === "\t"
    ) {
      index += 1;
    }
  }

  function scanString(): string {
    const start = index;
    expect('"');
    while (index < text.length) {
      const character = text[index];
      index += 1;
      if (character === '"') {
        return JSON.parse(text.slice(start, index)) as string;
      }
      if (character === "\\") {
        index += text[index] === "u" ? 5 : 1;
      }
    }
    throw new SyntaxError(`${label} contains an unterminated JSON string`);
  }

  function scanArray(): void {
    index += 1;
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    while (true) {
      scanValue();
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      expect(",");
      skipWhitespace();
    }
  }

  function scanObject(): void {
    index += 1;
    skipWhitespace();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    const keys = new Set<string>();
    while (true) {
      const key = scanString();
      if (keys.has(key)) {
        throw new SyntaxError(`duplicate JSON object key: ${key}`);
      }
      keys.add(key);
      skipWhitespace();
      expect(":");
      skipWhitespace();
      scanValue();
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      expect(",");
      skipWhitespace();
    }
  }

  function scanValue(): void {
    skipWhitespace();
    switch (text[index]) {
      case "{":
        scanObject();
        return;
      case "[":
        scanArray();
        return;
      case '"':
        scanString();
        return;
      default: {
        const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(text.slice(index))?.[0];
        if (token === undefined) fail();
        if (wireIntegers && /^[-0-9]/u.test(token)) {
          const maximum = "9007199254740991";
          if (!/^(?:0|[1-9][0-9]*)$/u.test(token) ||
            token.length > maximum.length ||
            (token.length === maximum.length && token > maximum)) {
            throw new SyntaxError(`${label} requires canonical nonnegative safe wire integers`);
          }
        }
        index += token.length;
      }
    }
  }

  scanValue();
  skipWhitespace();
  if (index !== text.length) fail();
}
