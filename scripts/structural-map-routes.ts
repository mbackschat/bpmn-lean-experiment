import path from "node:path";

import {
  maskMarkdownIgnoredRegions,
  scanMarkdownAnchors,
  scanMarkdownLinks,
} from "./markdown-link-lexer.ts";

const rootMapPath = "docs/IMPLEMENTATION-MAP.md";
const allowedStates = new Set(["active", "implemented", "deferred"]);
const routingHeader = "| Area ID | State | Detail map | Source-path families |";
const routingSeparator = "|---|---|---|---|";
const minimumDelegationWords = 100;
const implementationMapNameSource = String.raw`(?<![A-Z0-9-])(?:[A-Z][A-Z0-9-]*-)?IMPLEMENTATION-MAP\.md(?![A-Z0-9_-])`;

type MarkdownLink = ReturnType<typeof scanMarkdownLinks>[number];

export type ImplementationMapDirectoryEntry = Readonly<{
  state: string;
  path: string;
  linkStart: number;
  linkEnd: number;
}>;

export type ImplementationMapDirectoryResult = Readonly<{
  directory: ReadonlyMap<string, ImplementationMapDirectoryEntry>;
  errors: ReadonlyArray<string>;
}>;

type Line = Readonly<{ text: string; start: number; end: number }>;
type Range = Readonly<{ start: number; end: number }>;
type Destination = Readonly<{ path: string; fragment: string | undefined }>;
type RouteAtom = Readonly<{
  source: string;
  role: "router" | "root-owner" | "owner" | "delegation";
  area: string | undefined;
  target: string;
  fragment: string | undefined;
  link: MarkdownLink;
}>;

function lines(markdown: string): ReadonlyArray<Line> {
  const result: Line[] = [];
  let start = 0;
  for (const text of markdown.split("\n")) {
    result.push({ text, start, end: start + text.length });
    start += text.length + 1;
  }
  return result;
}

function h2Range(markdown: string, heading: string): Range | undefined {
  const allLines = lines(markdown);
  const visibleLines = lines(maskMarkdownIgnoredRegions(markdown));
  const matches = allLines.filter((line, index) =>
    visibleLines[index]?.text === `## ${heading}` && line.text === `## ${heading}`
  );
  if (matches.length !== 1) return undefined;
  const startLine = matches[0];
  if (startLine === undefined) return undefined;
  const next = allLines.find(({ start }, index) =>
    start > startLine.start && visibleLines[index]?.text.startsWith("## ") === true
  );
  return { start: startLine.end + 1, end: next?.start ?? markdown.length };
}

function linksInside(
  links: ReadonlyArray<MarkdownLink>,
  range: Range,
): ReadonlyArray<MarkdownLink> {
  return links.filter(({ start, end }) => start >= range.start && end <= range.end);
}

function splitTableCells(line: Line): ReadonlyArray<Readonly<{ text: string; range: Range }>> {
  if (!line.text.startsWith("|") || !line.text.endsWith("|")) return [];
  const cells: Array<Readonly<{ text: string; range: Range }>> = [];
  let left = 0;
  for (let index = 1; index < line.text.length; index += 1) {
    if (line.text[index] !== "|") continue;
    const rawStart = left + 1;
    const rawEnd = index;
    const raw = line.text.slice(rawStart, rawEnd);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    cells.push({
      text: raw.trim(),
      range: {
        start: line.start + rawStart + leading,
        end: line.start + rawEnd - trailing,
      },
    });
    left = index;
  }
  return cells;
}

function ordinaryLinkFillsCell(
  markdown: string,
  links: ReadonlyArray<MarkdownLink>,
  cell: Readonly<{ text: string; range: Range }>,
): MarkdownLink | undefined {
  const candidates = linksInside(links, cell.range);
  if (candidates.length !== 1) return undefined;
  const candidate = candidates[0];
  if (
    candidate === undefined || candidate.isImage ||
    candidate.label.includes("implementation-status-")
  ) return undefined;
  return candidate.start === cell.range.start && candidate.end === cell.range.end &&
      markdown.slice(candidate.start, candidate.end) === cell.text
    ? candidate
    : undefined;
}

function simpleDestination(raw: string): Destination | undefined {
  if (
    raw === "" || raw.startsWith("<") || raw.endsWith(">") ||
    /[\\\s?]/u.test(raw) || /%(?:2f|5c)/iu.test(raw)
  ) return undefined;
  const pieces = raw.split("#");
  if (pieces.length > 2 || pieces[0] === "") return undefined;
  try {
    return {
      path: pieces[0] ?? "",
      fragment: pieces.length === 2 ? decodeURIComponent(pieces[1] ?? "") : undefined,
    };
  } catch {
    return undefined;
  }
}

function normalizeTarget(source: string, destination: Destination): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(source), destination.path));
}

function spanKey(source: string, link: MarkdownLink): string {
  return `${source}:${link.start}:${link.end}`;
}

export function parseImplementationMapDirectory(
  markdown: string,
): ImplementationMapDirectoryResult {
  const errors: string[] = [];
  const directory = new Map<string, ImplementationMapDirectoryEntry>();
  const targetIds = new Map<string, string>();
  const range = h2Range(markdown, "Routing");
  if (range === undefined) {
    return { directory, errors: ["IMPLEMENTATION-MAP.md: requires exactly one ## Routing section"] };
  }
  const allLinks = scanMarkdownLinks(markdown);
  const sectionLines = lines(markdown).filter(({ start }) => start >= range.start && start < range.end);
  const headerIndexes = sectionLines.flatMap(({ text }, index) => text === routingHeader ? [index] : []);
  if (headerIndexes.length !== 1) {
    errors.push("IMPLEMENTATION-MAP.md: Routing requires its exact four-cell header");
    return { directory, errors };
  }
  const headerIndex = headerIndexes[0] ?? -1;
  if (sectionLines[headerIndex + 1]?.text !== routingSeparator) {
    errors.push("IMPLEMENTATION-MAP.md: Routing requires its exact separator");
    return { directory, errors };
  }
  let rowIndex = headerIndex + 2;
  for (; rowIndex < sectionLines.length; rowIndex += 1) {
    const line = sectionLines[rowIndex];
    if (line === undefined || !line.text.startsWith("|")) break;
    const cells = splitTableCells(line);
    if (cells.length !== 4) {
      errors.push("IMPLEMENTATION-MAP.md: every Routing row requires exactly four cells");
      continue;
    }
    const id = /^`([A-Z][A-Z0-9-]*)`$/u.exec(cells[0]?.text ?? "")?.[1];
    const state = /^`([a-z-]+)`$/u.exec(cells[1]?.text ?? "")?.[1];
    if (id === undefined) errors.push("IMPLEMENTATION-MAP.md: invalid Routing area ID cell");
    if (state === undefined || !allowedStates.has(state)) {
      errors.push(`IMPLEMENTATION-MAP.md: ${id ?? "row"} has a non-closed state`);
    }
    const detailCell = cells[2];
    const detailLink = detailCell === undefined
      ? undefined
      : ordinaryLinkFillsCell(markdown, allLinks, detailCell);
    const destination = detailLink === undefined
      ? undefined
      : simpleDestination(detailLink.destination);
    const file = destination?.path;
    if (
      detailLink === undefined || destination === undefined || destination.fragment !== undefined ||
      file === undefined || !/^[A-Z][A-Z0-9-]*-IMPLEMENTATION-MAP\.md$/u.test(file)
    ) {
      errors.push(`IMPLEMENTATION-MAP.md: ${id ?? "row"} requires one ordinary fragment-free detail-map link`);
    }
    for (const cell of [cells[0], cells[1], cells[3]]) {
      if (cell !== undefined && linksInside(allLinks, cell.range).some(({ destination }) =>
        destination.includes("IMPLEMENTATION-MAP.md")
      )) errors.push(`IMPLEMENTATION-MAP.md: ${id ?? "row"} names a map outside Detail map`);
    }
    if (id === undefined || state === undefined || !allowedStates.has(state) || file === undefined || detailLink === undefined || destination?.fragment !== undefined) continue;
    const target = path.posix.join("docs", file);
    if (directory.has(id)) errors.push(`IMPLEMENTATION-MAP.md: duplicate area ID ${id}`);
    if (targetIds.has(target)) errors.push(`IMPLEMENTATION-MAP.md: ${target} is registered by multiple area IDs`);
    if (!directory.has(id) && !targetIds.has(target)) {
      directory.set(id, { state, path: target, linkStart: detailLink.start, linkEnd: detailLink.end });
      targetIds.set(target, id);
    }
  }
  if (directory.size === 0) errors.push("IMPLEMENTATION-MAP.md: Routing requires at least one area row");
  return { directory, errors };
}

function mapTarget(
  source: string,
  link: MarkdownLink,
  knownPaths: ReadonlySet<string>,
): string | undefined {
  const destination = simpleDestination(link.destination);
  if (destination === undefined || destination.fragment !== undefined) return undefined;
  const target = normalizeTarget(source, destination);
  return knownPaths.has(target) ? target : undefined;
}

function parsePlan(
  markdown: string,
  links: ReadonlyArray<MarkdownLink>,
  detailPaths: ReadonlySet<string>,
  consumed: Set<string>,
  errors: string[],
): void {
  const range = h2Range(markdown, "Ordered work");
  if (range === undefined) {
    errors.push("docs/PLAN.md: requires exactly one ## Ordered work section");
    return;
  }
  for (const line of lines(markdown).filter(({ start, text }) =>
    start >= range.start && start < range.end && /^\d+\. /u.test(text)
  )) {
    const match = /^\d+\. `([A-Z][A-Z0-9-]*)` · \*\*([a-z-]+)\*\* · Owner: (.+?) · Maps: (.+?) · Action: (.+)$/u.exec(line.text);
    if (match === null) {
      errors.push("docs/PLAN.md: ordered item must use exact ID · state · Owner · Maps · Action fields");
      continue;
    }
    const mapsText = match[4] ?? "";
    const mapsOffset = line.text.indexOf(mapsText, line.text.indexOf(" · Maps: "));
    const mapsRange = { start: line.start + mapsOffset, end: line.start + mapsOffset + mapsText.length };
    const mapLinks = linksInside(links, mapsRange);
    const pieces = mapsText.split(", ");
    if (mapLinks.length !== pieces.length || pieces.some((piece, index) => {
      const link = mapLinks[index];
      return link === undefined || link.isImage || link.label.includes("implementation-status-") ||
        markdown.slice(link.start, link.end) !== piece ||
        mapTarget("docs/PLAN.md", link, detailPaths) === undefined;
    })) {
      errors.push("docs/PLAN.md: Maps must contain only comma-separated ordinary detail-map links");
      continue;
    }
    for (const link of mapLinks) consumed.add(spanKey("docs/PLAN.md", link));
  }
}

function parseRegistry(
  markdown: string,
  links: ReadonlyArray<MarkdownLink>,
  knownPaths: ReadonlySet<string>,
  consumed: Set<string>,
  errors: string[],
): void {
  const range = h2Range(markdown, "Registry");
  if (range === undefined) {
    errors.push("docs/README.md: requires exactly one ## Registry section");
    return;
  }
  const counts = new Map([...knownPaths].map((target) => [target, 0]));
  for (const line of lines(markdown).filter(({ start, text }) =>
    start >= range.start && start < range.end && text.startsWith("|")
  )) {
    const firstCell = splitTableCells(line)[0];
    if (firstCell === undefined) continue;
    const link = ordinaryLinkFillsCell(markdown, links, firstCell);
    if (link === undefined) continue;
    const target = mapTarget("docs/README.md", link, knownPaths);
    if (target === undefined) continue;
    counts.set(target, (counts.get(target) ?? 0) + 1);
    consumed.add(spanKey("docs/README.md", link));
  }
  for (const [target, count] of counts) {
    if (count !== 1) errors.push(`docs/README.md: Registry first cell must contain ${target} exactly once`);
  }
}

function parseStartup(
  markdown: string,
  links: ReadonlyArray<MarkdownLink>,
  consumed: Set<string>,
  errors: string[],
): void {
  const range = h2Range(markdown, "Start every session");
  if (range === undefined) {
    errors.push("CLAUDE.md: requires exactly one ## Start every session section");
    return;
  }
  const candidates = lines(markdown).filter(({ start, text }) =>
    start >= range.start && start < range.end && text.startsWith("2. Read root ")
  );
  if (candidates.length !== 1) {
    errors.push("CLAUDE.md: requires the exact numbered root-map startup step");
    return;
  }
  const line = candidates[0];
  if (line === undefined) return;
  const lineLinks = linksInside(links, { start: line.start, end: line.end });
  const link = lineLinks[0];
  if (
    lineLinks.length !== 1 || link === undefined || link.isImage ||
    link.label !== "IMPLEMENTATION-MAP.md" ||
    mapTarget("CLAUDE.md", link, new Set([rootMapPath])) !== rootMapPath ||
    line.text !== `2. Read root ${markdown.slice(link.start, link.end)} completely.`
  ) {
    errors.push(lineLinks.length > 1
      ? "CLAUDE.md: startup step contains an additional map target"
      : "CLAUDE.md: root-map startup step has the wrong exact shape or target");
    return;
  }
  consumed.add(spanKey("CLAUDE.md", link));
}

function headings(markdown: string): ReadonlyMap<string, Readonly<{ level: number; range: Range }>> {
  return new Map(scanMarkdownAnchors(markdown).map(({ name, level, start, end }) =>
    [name, { level, range: { start, end } }]
  ));
}

function roleError(
  source: string,
  link: MarkdownLink,
  directory: ReadonlyMap<string, ImplementationMapDirectoryEntry>,
  documents: ReadonlyMap<string, string>,
): Readonly<{ atom?: RouteAtom; errors: ReadonlyArray<string> }> {
  const errors: string[] = [];
  if (link.isImage) errors.push(`${source}: route atom cannot be an image`);
  if (link.label.includes("\\") || link.destination.includes("\\")) errors.push(`${source}: escaped route atom is forbidden`);
  if (/%(?:2f|5c)/iu.test(link.destination)) errors.push(`${source}: encoded path separator is forbidden`);
  if (link.destination.startsWith("<")) errors.push(`${source}: angle destination is forbidden`);
  if (link.destination.includes("?")) errors.push(`${source}: query string is forbidden`);
  if (/\s/u.test(link.destination)) errors.push(`${source}: route atom title is forbidden`);
  const label = /^`implementation-status-(router|root-owner|owner:([A-Z][A-Z0-9-]*)|delegation:([A-Z][A-Z0-9-]*))`$/u.exec(link.label);
  if (label === null) {
    errors.push(`${source}: implementation-map reference must be one exact route atom`);
    return { errors };
  }
  const destination = simpleDestination(link.destination);
  if (destination === undefined) return { errors };
  const target = normalizeTarget(source, destination);
  const token = label[1] ?? "";
  const role = token === "router" || token === "root-owner"
    ? token
    : token.startsWith("delegation:") ? "delegation" : "owner";
  const area = label[2] ?? label[3];
  const entry = area === undefined ? undefined : directory.get(area);
  if (area !== undefined && entry === undefined) errors.push(`${source}: route atom has unknown area ${area}`);
  if (role === "router" && target !== rootMapPath) errors.push(`${source}: router must target the root map`);
  if (role === "router" && destination.fragment !== undefined) errors.push(`${source}: router cannot carry a fragment`);
  if (role === "root-owner" && target !== rootMapPath) errors.push(`${source}: root-owner must target the root map`);
  if (role === "root-owner" && destination.fragment === undefined) errors.push(`${source}: root-owner requires a fragment`);
  if ((role === "owner" || role === "delegation") && entry !== undefined && target !== entry.path) {
    errors.push(`${source}: ${role} target does not match area ${area}`);
  }
  if (role === "delegation" && destination.fragment === undefined) errors.push(`${source}: delegation requires a fragment`);
  const targetDocument = documents.get(target);
  const anchor = destination.fragment === undefined || targetDocument === undefined
    ? undefined
    : headings(targetDocument).get(destination.fragment);
  if (destination.fragment !== undefined && anchor === undefined) errors.push(`${source}: route atom has a missing fragment ${destination.fragment}`);
  if (role === "root-owner" && anchor !== undefined && (anchor.level !== 2 || destination.fragment === "routing")) {
    errors.push(`${source}: root-owner requires a non-Routing level-two fragment`);
  }
  if (role === "delegation" && anchor !== undefined && anchor.level !== 2) errors.push(`${source}: delegation fragment must name a level-two section`);
  if (errors.length !== 0) return { errors };
  return { atom: { source, role, area, target, fragment: destination.fragment, link }, errors };
}

function reciprocal(
  atom: RouteAtom,
  documents: ReadonlyMap<string, string>,
): Readonly<{ isReciprocal: boolean; wordCount: number }> {
  if (atom.fragment === undefined) return { isReciprocal: false, wordCount: 0 };
  const target = documents.get(atom.target) ?? "";
  const section = headings(target).get(atom.fragment);
  if (section === undefined || section.level !== 2) return { isReciprocal: false, wordCount: 0 };
  const body = target.slice(section.range.start, section.range.end);
  const visibleBody = maskMarkdownIgnoredRegions(body);
  const backlink = scanMarkdownLinks(body).some((link) => {
    const destination = simpleDestination(link.destination);
    return !link.isImage && destination !== undefined &&
      normalizeTarget(atom.target, destination) === atom.source;
  });
  const visibleProse = scanMarkdownLinks(visibleBody).reduceRight(
    (text, link) => `${text.slice(0, link.start)}${link.label}${text.slice(link.end)}`,
    visibleBody,
  );
  return {
    isReciprocal: backlink && visibleBody.includes("**Implemented.**") && visibleBody.includes("**Absent.**"),
    wordCount: visibleProse.match(/[\p{L}\p{M}\p{N}\p{Pc}]+/gu)?.length ?? 0,
  };
}

function normalizeMarkdownEscapes(value: string): string {
  return value.replace(/\\([\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E])/gu, "$1");
}

function candidateMapReference(
  link: MarkdownLink,
): boolean {
  return link.label.includes("implementation-status-") ||
    new RegExp(implementationMapNameSource, "u").test(normalizeMarkdownEscapes(link.destination));
}

function bareMapPaths(
  markdown: string,
  links: ReadonlyArray<MarkdownLink>,
): ReadonlyArray<number> {
  const masked = [...maskMarkdownIgnoredRegions(markdown)];
  for (const link of links) {
    for (let index = link.start; index < link.end; index += 1) {
      if (masked[index] !== "\n") masked[index] = " ";
    }
  }
  const pattern = new RegExp(implementationMapNameSource, "gu");
  return [...normalizeMarkdownEscapes(masked.join("")).matchAll(pattern)].map((match) => match.index);
}

export function validateStructuralMapRoutes(
  documents: ReadonlyMap<string, string>,
): ReadonlyArray<string> {
  const errors: string[] = [];
  const root = documents.get(rootMapPath);
  if (root === undefined) return [`${rootMapPath}: missing root implementation map`];
  const parsed = parseImplementationMapDirectory(root);
  errors.push(...parsed.errors);
  const detailPaths = new Set([...parsed.directory.values()].map(({ path: target }) => target));
  const knownPaths = new Set([rootMapPath, ...detailPaths]);
  const consumed = new Set<string>();
  for (const entry of parsed.directory.values()) {
    consumed.add(`${rootMapPath}:${entry.linkStart}:${entry.linkEnd}`);
    if (!documents.has(entry.path)) errors.push(`${entry.path}: registered detail map is missing`);
  }
  const scanned = new Map([...documents].map(([source, markdown]) => [source, scanMarkdownLinks(markdown)]));
  const planLinks = scanned.get("docs/PLAN.md");
  const planDocument = documents.get("docs/PLAN.md");
  if (planDocument === undefined || planLinks === undefined) errors.push("docs/PLAN.md: missing structural control");
  else parsePlan(planDocument, planLinks, detailPaths, consumed, errors);
  const registryLinks = scanned.get("docs/README.md");
  const registryDocument = documents.get("docs/README.md");
  if (registryDocument === undefined || registryLinks === undefined) errors.push("docs/README.md: missing structural control");
  else parseRegistry(registryDocument, registryLinks, knownPaths, consumed, errors);
  const startupLinks = scanned.get("CLAUDE.md");
  const startupDocument = documents.get("CLAUDE.md");
  if (startupDocument === undefined || startupLinks === undefined) errors.push("CLAUDE.md: missing structural control");
  else parseStartup(startupDocument, startupLinks, consumed, errors);

  const atoms: RouteAtom[] = [];
  for (const [source, markdown] of documents) {
    const links = scanned.get(source) ?? [];
    for (const link of links) {
      if (!candidateMapReference(link)) continue;
      if (consumed.has(spanKey(source, link))) continue;
      const checked = roleError(source, link, parsed.directory, documents);
      if (checked.atom !== undefined) atoms.push(checked.atom);
      if (checked.errors.length === 0) continue;
      const context = source === "docs/PLAN.md"
        ? `${source}: implementation-map link outside the exact Maps field`
        : source === "docs/README.md"
        ? `${source}: implementation-map link outside the Registry first cell`
        : source === "CLAUDE.md"
        ? `${source}: implementation-map link outside the exact startup step`
        : undefined;
      if (context !== undefined) errors.push(context);
      errors.push(...checked.errors);
    }
    for (const _offset of bareMapPaths(markdown, links)) {
      errors.push(`${source}: bare implementation-map path is forbidden`);
    }
  }

  const containerAtoms = new Set<string>();
  const declaredDelegations = new Set(
    atoms.filter(({ role }) => role === "delegation")
      .map(({ source, area, fragment }) => `${source}:${area}:${fragment}`),
  );
  const seenDelegations = new Set<string>();
  for (const atom of atoms) {
    const normalized = `${atom.role}:${atom.area ?? ""}:${atom.target}#${atom.fragment ?? ""}`;
    const containerKey = `${atom.source}:${atom.link.containerStart}:${atom.link.containerEnd}:${normalized}`;
    if (containerAtoms.has(containerKey)) errors.push(`${atom.source}: duplicate route atom inside one container`);
    containerAtoms.add(containerKey);
    if (atom.role === "delegation") {
      const delegationKey = `${atom.source}:${atom.area}:${atom.fragment}`;
      if (seenDelegations.has(delegationKey)) errors.push(`${atom.source}: duplicate delegation for area and fragment`);
      seenDelegations.add(delegationKey);
      if (!/^docs\/capsules\/[^/]+-SPEC\.md$/u.test(atom.source)) {
        errors.push(`${atom.source}: delegation is allowed only from a maintained capsule specification`);
      }
      const answer = reciprocal(atom, documents);
      if (!answer.isReciprocal) errors.push(`${atom.source}: delegation lacks its exact reciprocal backlink and Implemented/Absent halves`);
      if (answer.wordCount < minimumDelegationWords) errors.push(`${atom.source}: delegation target must contain at least 100 words`);
    } else if (atom.role === "owner" && /^docs\/capsules\/[^/]+-SPEC\.md$/u.test(atom.source)) {
      const answer = reciprocal(atom, documents);
      const delegationKey = `${atom.source}:${atom.area}:${atom.fragment}`;
      if (
        answer.isReciprocal && answer.wordCount >= minimumDelegationWords &&
        !declaredDelegations.has(delegationKey)
      ) {
        errors.push(`${atom.source}: reciprocal delegation was downgraded to an owner atom`);
      }
    }
  }
  return [...new Set(errors)];
}
