/**
 * Parses one current wire document while retaining byte-level facts that
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
  const value: unknown = JSON.parse(text);
  scanForDuplicateObjectKeys(text, label);
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

function scanForDuplicateObjectKeys(text: string, label: string): void {
  let index = 0;

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
    index += 1;
    while (index < text.length) {
      const character = text[index];
      index += 1;
      if (character === '"') {
        return text.slice(start, index);
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
      index += 1;
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
      const encodedKey = scanString();
      const key = JSON.parse(encodedKey) as string;
      if (keys.has(key)) {
        throw new SyntaxError(`duplicate JSON object key: ${key}`);
      }
      keys.add(key);
      skipWhitespace();
      index += 1;
      skipWhitespace();
      scanValue();
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      index += 1;
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
      default:
        while (
          index < text.length
        ) {
          const character = text[index];
          if (
            character === undefined ||
            /[,\]}\s]/u.test(character)
          ) {
            break;
          }
          index += 1;
        }
    }
  }

  scanValue();
}
