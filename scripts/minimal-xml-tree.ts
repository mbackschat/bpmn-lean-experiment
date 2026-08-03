/**
 * Dependency-free lexical XML element scanner for research inventories.
 *
 * It normalizes qualified names to their local part so a classifier never
 * depends on a document's namespace prefixes, and it excludes comments, CDATA,
 * and processing instructions so commented-out constructs contribute no signal.
 *
 * This is deliberately not a validating parser and is not the project's source
 * admission boundary: it reports a tag-balance defect through
 * `structurallyMalformed` and still returns the elements it recognized, because
 * a research corpus contains negative-deployment fixtures whose lexical signal
 * is worth counting. Executable admission remains the parser-backed checked
 * graph.
 */

export type XmlElement = {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: XmlElement[];
};

export type XmlScan = {
  roots: XmlElement[];
  structurallyMalformed: boolean;
};

/** Throws only on markup this scanner cannot delimit at all, never on imbalance. */
export function parseXmlElements(xml: string): XmlScan {
  const roots: XmlElement[] = [];
  const stack: XmlElement[] = [];
  let structurallyMalformed = false;
  let cursor = 0;

  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) {
      break;
    }
    if (xml.startsWith("<!--", start)) {
      cursor = afterTerminator(xml, start + 4, "-->", "XML comment");
      continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      cursor = afterTerminator(xml, start + 9, "]]>", "CDATA section");
      continue;
    }
    if (xml.startsWith("<?", start)) {
      cursor = afterTerminator(
        xml,
        start + 2,
        "?>",
        "processing instruction",
      );
      continue;
    }

    const end = findMarkupEnd(xml, start + 1);
    const markup = xml.slice(start + 1, end).trim();
    cursor = end + 1;
    if (markup.length === 0 || markup.startsWith("!")) {
      continue;
    }
    if (markup.startsWith("/")) {
      const closingName = localName(markup.slice(1).trim());
      const matchingIndex = stack.findLastIndex(
        (element) => element.name === closingName,
      );
      if (matchingIndex < 0) {
        structurallyMalformed = true;
      } else {
        if (matchingIndex !== stack.length - 1) {
          structurallyMalformed = true;
        }
        stack.length = matchingIndex;
      }
      continue;
    }

    const selfClosing = markup.endsWith("/");
    const body = selfClosing ? markup.slice(0, -1).trim() : markup;
    const nameEnd = body.search(/\s/u);
    const qualifiedName = nameEnd < 0 ? body : body.slice(0, nameEnd);
    const attributeText = nameEnd < 0 ? "" : body.slice(nameEnd + 1);
    const element: XmlElement = {
      name: localName(qualifiedName),
      attributes: parseAttributes(attributeText),
      children: [],
    };
    const parent = stack.at(-1);
    if (parent === undefined) {
      roots.push(element);
    } else {
      parent.children.push(element);
    }
    if (!selfClosing) {
      stack.push(element);
    }
  }

  if (stack.length > 0) {
    structurallyMalformed = true;
  }
  return { roots, structurallyMalformed };
}

/** Document order, parents before their own children. */
export function flattenElements(
  roots: readonly XmlElement[],
): XmlElement[] {
  const flattened: XmlElement[] = [];
  const pending = [...roots];
  while (pending.length > 0) {
    const element = pending.shift();
    if (element !== undefined) {
      flattened.push(element);
      pending.unshift(...element.children);
    }
  }
  return flattened;
}

export function hasDirectChild(element: XmlElement, name: string): boolean {
  return element.children.some((child) => child.name === name);
}

/**
 * Maps each `id` attribute to its element's local name. A duplicate `id` keeps
 * the first declaration so a malformed fixture resolves deterministically
 * rather than by scan position.
 */
export function localNamesById(
  elements: readonly XmlElement[],
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const element of elements) {
    const id = element.attributes.id;
    if (id !== undefined && !names.has(id)) {
      names.set(id, element.name);
    }
  }
  return names;
}

function parseAttributes(source: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=]+)\s*=\s*(["'])(.*?)\2/gsu;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const value = match[3];
    if (name !== undefined && value !== undefined) {
      attributes[name] = value;
    }
  }
  return attributes;
}

function findMarkupEnd(xml: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (character === '"' || character === "'") {
      quote = quote === undefined ? character : quote === character ? undefined : quote;
    } else if (character === ">" && quote === undefined) {
      return index;
    }
  }
  throw new TypeError("unterminated XML markup");
}

function afterTerminator(
  xml: string,
  start: number,
  terminator: string,
  description: string,
): number {
  const end = xml.indexOf(terminator, start);
  if (end < 0) {
    throw new TypeError(`unterminated ${description}`);
  }
  return end + terminator.length;
}

function localName(qualifiedName: string): string {
  const separator = qualifiedName.lastIndexOf(":");
  return separator < 0 ? qualifiedName : qualifiedName.slice(separator + 1);
}
