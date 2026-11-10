/**
 * The `source.schema` invariant (PC-BASIC-04): a model the reader admits is valid against the pinned OMG
 * `BPMN20.xsd`. Pinned CIB validates every deployment against its own copy of that schema (`BpmnParse:324`), so a
 * model it rejects never runs, while `bpmn-moddle` reads several invalid forms, such as `operationRef` written as an
 * attribute or an artifact placed before the flow elements, without a warning.
 *
 * The check walks the exact source bytes, because the parsed tree has lost child order and attribute-or-element form,
 * against the table `scripts/bpmn-schema-table.ts` generates from the schemas. It covers, in the BPMN model namespace:
 * the root element, each element's place in its parent's content model (order, cardinality, substitution groups,
 * wildcards), attribute presence and form (undeclared, required, foreign-namespace wildcard), text in element-only
 * content, abstract types and `xsi:type`, and the lexical form of `xsd:ID`, `xsd:IDREF`, `xsd:QName` (its prefix
 * bound in scope), `xsd:boolean`, `xsd:integer`, `xsd:int` and the enumerations. Earlier codes refuse some of these
 * facets first and cover the rest of the schema: well-formedness by `parser.failure`; an unknown unqualified attribute
 * or element, an illegal or duplicate identifier, body text and an unknown `xsi:type` by `parser.warning`; an
 * `xsd:IDREF` or reference that names no identifier by `source.reference`. Not covered: the BPMN DI content, which
 * the reader keeps only in the exact bytes, and the value range of `xsd:int`.
 */
import tableJson from "../bpmn-2.0.2-schema-table.json" with { type: "json" };

export type Occurs = Readonly<{ min: number; max: number | null }>;
/** A content particle: an element `ref` names a global element, a local element carries its `type`. */
export type Particle =
  | Readonly<{ kind: "element"; name: string; type?: string; namespace?: string } & Occurs>
  | Readonly<{ kind: "sequence" | "choice"; items: ReadonlyArray<Particle> } & Occurs>
  | Readonly<{ kind: "any"; namespace: string } & Occurs>;
type Attribute = Readonly<{ type: string; required: boolean }>;
/** A complex type as declared: its extension base, then what the extension adds. */
export type ComplexType = Readonly<{
  base: string | null;
  abstract: boolean;
  mixed: boolean;
  anyAttribute: boolean;
  attributes: Readonly<Record<string, Attribute>>;
  content: ReadonlyArray<Particle>;
}>;
/** What `scripts/bpmn-schema-table.ts` generates from the schemas, besides its provenance. */
export type SchemaTable = Readonly<{
  namespace: string;
  elements: Readonly<Record<string, Readonly<{ type: string; abstract: boolean; substitutionGroup: string | null }>>>;
  types: Readonly<Record<string, ComplexType>>;
  enumerations: Readonly<Record<string, ReadonlyArray<string> | null>>;
}>;

const table = tableJson as unknown as SchemaTable;
const xsiNamespace = "http://www.w3.org/2001/XMLSchema-instance";
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";

/** One schema violation: the nearest element identifier and the evidence naming the line and the facet. */
export type SchemaViolation = Readonly<{ element: string | null; evidence: string }>;

type XmlAttribute = Readonly<{ name: string; prefix: string | null; local: string; value: string }>;
export type XmlElement = {
  readonly prefix: string | null;
  readonly local: string;
  readonly namespace: string | null;
  readonly attributes: ReadonlyArray<XmlAttribute>;
  readonly scope: ReadonlyMap<string, string>;
  readonly line: number;
  readonly children: XmlElement[];
  text: string;
  /** Whether a text node of the element is only whitespace, which `moddle-xml` drops (`dist/index.js:839-847`). */
  droppedText: boolean;
};

const entities: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
const decode = (value: string): string => value.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/gu, (whole, name: string) =>
  name.startsWith("#x") ? String.fromCodePoint(Number.parseInt(name.slice(2), 16))
    : name.startsWith("#") ? String.fromCodePoint(Number(name.slice(1))) : entities[name] ?? whole);

const split = (qualified: string): readonly [string | null, string] => {
  const separator = qualified.indexOf(":");
  return separator < 0 ? [null, qualified] : [qualified.slice(0, separator), qualified.slice(separator + 1)];
};

/**
 * The element tree of a document `bpmn-moddle` has already parsed, so it is well-formed and needs no error recovery;
 * comments, processing instructions and CDATA are skipped or read as text, and a DOCTYPE was refused before.
 */
export function scan(xml: string): XmlElement | undefined {
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let line = 1;
  let cursor = 0;
  const advance = (to: number): void => {
    for (let index = cursor; index < to; index += 1) if (xml.charCodeAt(index) === 10) line += 1;
    cursor = to;
  };
  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    const textEnd = open < 0 ? xml.length : open;
    const parent = stack.at(-1);
    if (parent !== undefined) {
      const segment = decode(xml.slice(cursor, textEnd));
      parent.text += segment;
      if (segment.length > 0 && segment.trim() === "") parent.droppedText = true;
    }
    advance(textEnd);
    if (open < 0) break;
    if (xml.startsWith("<!--", open)) {
      advance(xml.indexOf("-->", open) + 3);
    } else if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open);
      if (parent !== undefined) parent.text += xml.slice(open + 9, end);
      advance(end + 3);
    } else if (xml.startsWith("<?", open) || xml.startsWith("<!", open)) {
      advance(xml.indexOf(">", open) + 1);
    } else if (xml.startsWith("</", open)) {
      stack.pop();
      advance(xml.indexOf(">", open) + 1);
    } else {
      const tag = /^<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/u.exec(xml.slice(open));
      if (tag === null) return undefined;
      const [whole, name = "", attributeText = "", selfClosing] = tag;
      const attributes = [...attributeText.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)].map(([, qualified = "", double, single]) => {
        const [prefix, local] = split(qualified);
        return { name: qualified, prefix, local, value: decode(double ?? single ?? "") };
      });
      const scope = new Map(parent?.scope ?? []);
      for (const attribute of attributes) {
        if (attribute.name === "xmlns") scope.set("", attribute.value);
        else if (attribute.prefix === "xmlns") scope.set(attribute.local, attribute.value);
      }
      const [prefix, local] = split(name);
      const element: XmlElement = { prefix, local, namespace: scope.get(prefix ?? "") ?? null, attributes, scope, line,
        children: [], text: "", droppedText: false };
      if (parent === undefined) root = element;
      else parent.children.push(element);
      if (selfClosing !== "/") stack.push(element);
      advance(open + whole.length);
    }
  }
  return root;
}

class Violation extends Error {
  readonly violation: SchemaViolation;

  constructor(violation: SchemaViolation) {
    super(violation.evidence);
    this.violation = violation;
  }
}

const idOf = (element: XmlElement): string | null =>
  element.attributes.find((attribute) => attribute.prefix === null && attribute.local === "id")?.value ?? null;

function violate(element: XmlElement, facet: string): never {
  throw new Violation({ element: idOf(element), evidence: `line ${element.line}: ${element.local}: ${facet}` });
}

const ncName = /^[\p{L}_][\p{L}\p{N}\p{M}_.\-·]*$/u;

/** The lexical facets of the simple types the schemas use; `xsd:string`, `xsd:anyURI` and unions bound nothing here. */
function lexical(element: XmlElement, type: string, raw: string, subject: string): void {
  const value = raw.trim();
  const fail = (): never => violate(element, `${subject} "${raw}" is not a valid ${type}`);
  switch (type) {
    case "xsd:ID":
    case "xsd:IDREF":
      if (!ncName.test(value)) fail();
      return;
    case "xsd:QName": {
      const [prefix, local] = split(value);
      if (!ncName.test(local) || (prefix !== null && (!ncName.test(prefix) || !element.scope.has(prefix)))) fail();
      return;
    }
    case "xsd:boolean":
      if (!/^(?:true|false|1|0)$/u.test(value)) fail();
      return;
    case "xsd:integer":
    case "xsd:int":
      if (!/^[+-]?\d+$/u.test(value)) fail();
      return;
    default: {
      const values = table.enumerations[type];
      if (values !== undefined && values !== null && !values.includes(raw)) fail();
    }
  }
}

type Flattened = Readonly<{
  abstract: boolean;
  mixed: boolean;
  anyAttribute: boolean;
  attributes: ReadonlyMap<string, Attribute>;
  content: Particle;
}>;

function flatten(name: string): Flattened | undefined {
  const type = table.types[name];
  if (type === undefined) return undefined;
  const base = type.base === null ? undefined : flatten(type.base);
  return {
    abstract: type.abstract,
    // A type extending mixed content keeps it: `tFormalExpression` extends the mixed `tExpression` without restating it.
    mixed: type.mixed || (base?.mixed ?? false),
    anyAttribute: type.anyAttribute || (base?.anyAttribute ?? false),
    attributes: new Map([...(base?.attributes ?? []), ...Object.entries(type.attributes)]),
    content: { kind: "sequence", items: [...(base === undefined ? [] : [base.content]), ...type.content], min: 1, max: 1 },
  };
}

/** Whether the global element `member` may stand where `head` is expected, through its substitution groups. */
function substitutes(member: string, head: string): boolean {
  for (let current: string | null = member; current !== null; current = table.elements[current]?.substitutionGroup ?? null) {
    if (current === head) return true;
  }
  return false;
}

/** The type a matched child is validated against: `null` for content outside the BPMN model namespace. */
type Matched = Map<XmlElement, string | null>;

function matchOnce(particle: Particle, children: ReadonlyArray<XmlElement>, position: number, matched: Matched): number | null {
  const child = children[position];
  switch (particle.kind) {
    case "element": {
      if (child === undefined) return null;
      if (particle.namespace !== undefined) {
        if (child.namespace !== particle.namespace || child.local !== particle.name) return null;
        matched.set(child, null);
        return position + 1;
      }
      if (child.namespace !== table.namespace) return null;
      if (particle.type !== undefined) {
        if (child.local !== particle.name) return null;
        matched.set(child, particle.type);
        return position + 1;
      }
      const global = table.elements[child.local];
      if (global === undefined || global.abstract || !substitutes(child.local, particle.name)) return null;
      matched.set(child, global.type);
      return position + 1;
    }
    case "any": {
      if (child === undefined) return null;
      const other = child.namespace !== table.namespace && child.namespace !== null;
      if (particle.namespace === "##other" && !other) return null;
      // Lax processing validates a wildcard child only where a global declaration names it.
      matched.set(child, other ? null : table.elements[child.local]?.type ?? null);
      return position + 1;
    }
    case "sequence": {
      let at = position;
      for (const item of particle.items) {
        const next = match(item, children, at, matched);
        if (next === null) return null;
        at = next;
      }
      return at;
    }
    case "choice": {
      let empty = false;
      for (const item of particle.items) {
        const next = match(item, children, position, matched);
        if (next !== null && next > position) return next;
        if (next === position) empty = true;
      }
      return empty ? position : null;
    }
  }
}

/**
 * Matches `particle` within its occurrence bounds, taking as many repetitions as fit. The schemas obey the unique
 * particle attribution rule, so a greedy match is the only one.
 */
function match(particle: Particle, children: ReadonlyArray<XmlElement>, position: number, matched: Matched): number | null {
  let at = position;
  let count = 0;
  while (particle.max === null || count < particle.max) {
    const next = matchOnce(particle, children, at, matched);
    if (next === null) break;
    if (next === at) return at;
    at = next;
    count += 1;
  }
  return count >= particle.min ? at : null;
}

function validateSimple(element: XmlElement, type: string): void {
  const child = element.children[0];
  if (child !== undefined) violate(child, `element is not allowed inside the ${type} content of ${element.local}`);
  lexical(element, type, element.text, "content");
}

function validate(element: XmlElement, declared: string): void {
  if (declared.startsWith("xsd:")) {
    validateSimple(element, declared);
    return;
  }
  const xsiType = element.attributes.find((attribute) =>
    attribute.prefix !== null && element.scope.get(attribute.prefix) === xsiNamespace && attribute.local === "type");
  let name = declared;
  if (xsiType !== undefined) {
    const [prefix, local] = split(xsiType.value.trim());
    if (element.scope.get(prefix ?? "") !== table.namespace || table.types[local] === undefined) {
      violate(element, `xsi:type "${xsiType.value}" names no BPMN type`);
    }
    name = local;
  }
  const type = flatten(name);
  if (type === undefined) return violate(element, `type ${name} is not in the schema table`);
  if (type.abstract) violate(element, `type ${name} is abstract`);
  for (const attribute of element.attributes) {
    if (attribute.name === "xmlns" || attribute.prefix === "xmlns") continue;
    if (attribute.prefix !== null) {
      const namespace = element.scope.get(attribute.prefix);
      if (namespace === xsiNamespace || namespace === xmlNamespace) continue;
      if (namespace === table.namespace || !type.anyAttribute) violate(element, `attribute ${attribute.name} is not allowed`);
      continue;
    }
    const declaredAttribute = type.attributes.get(attribute.local);
    if (declaredAttribute === undefined) violate(element, `attribute ${attribute.name} is not allowed`);
    else lexical(element, declaredAttribute.type, attribute.value, `attribute ${attribute.name}`);
  }
  for (const [attribute, { required }] of type.attributes) {
    if (required && !element.attributes.some((entry) => entry.prefix === null && entry.local === attribute)) {
      violate(element, `required attribute ${attribute} is absent`);
    }
  }
  if (!type.mixed && element.text.trim() !== "") violate(element, "text is not allowed in element-only content");
  const matched: Matched = new Map();
  const end = match(type.content, element.children, 0, matched);
  if (end === null) return violate(element, "a required child element is absent");
  const unexpected = element.children[end];
  if (unexpected !== undefined) violate(unexpected, `element is not expected here inside ${element.local}`);
  for (const child of element.children) {
    const childType = matched.get(child);
    if (childType !== undefined && childType !== null) validate(child, childType);
  }
}

/** The first schema violation of a walk that checks an element before its children, or `undefined` when the source is valid. */
export function firstSchemaViolation(xml: string): SchemaViolation | undefined {
  const root = scan(xml);
  if (root === undefined) return { element: null, evidence: "the source has no element the schema check can read" };
  try {
    if (root.namespace !== table.namespace || root.local !== "definitions") violate(root, "the root is not bpmn:definitions");
    validate(root, table.elements["definitions"]?.type ?? "tDefinitions");
    return undefined;
  } catch (error: unknown) {
    if (error instanceof Violation) return error.violation;
    throw error;
  }
}
