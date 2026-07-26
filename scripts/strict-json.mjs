/**
 * Parses one current wire document while retaining byte-level facts that
 * ordinary JSON.parse discards.
 *
 * JSON object member names are compared after escape decoding, so `"id"` and
 * `"\u0069d"` are the same key. Strings must contain Unicode scalar values;
 * JavaScript's otherwise-permitted unpaired UTF-16 surrogates are rejected.
 */
export function parseStrictJson(text, label = "JSON document") {
  const value = JSON.parse(text);
  scanForDuplicateObjectKeys(text, label);
  requireWellFormedUnicode(value, label);
  return value;
}

export function requireWellFormedUnicode(value, label = "wire value") {
  visitStrings(value, (text) => requireUnicodeScalarString(text, label));
}

export function requireUnicodeScalarString(value, label = "wire string") {
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

function visitStrings(value, visit) {
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

function scanForDuplicateObjectKeys(text, label) {
  let index = 0;

  function skipWhitespace() {
    while (
      text[index] === " " ||
      text[index] === "\n" ||
      text[index] === "\r" ||
      text[index] === "\t"
    ) {
      index += 1;
    }
  }

  function scanString() {
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

  function scanArray() {
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

  function scanObject() {
    index += 1;
    skipWhitespace();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    const keys = new Set();
    while (true) {
      const encodedKey = scanString();
      const key = JSON.parse(encodedKey);
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

  function scanValue() {
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
          index < text.length &&
          !/[,\]}\s]/u.test(text[index])
        ) {
          index += 1;
        }
    }
  }

  scanValue();
}
