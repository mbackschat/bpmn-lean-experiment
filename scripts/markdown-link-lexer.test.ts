import assert from "node:assert/strict";
import { test } from "node:test";

import {
  maskMarkdownIgnoredRegions,
  scanMarkdownAnchors,
  scanMarkdownLinks,
} from "./markdown-link-lexer.ts";

test("returns immutable exact spans for ordinary links and images", () => {
  const markdown = String.raw`prefix [la\]bel]( docs/a\(b\).md#x ) and ![alt](img_(1).png) tail`;
  const linkSource = String.raw`[la\]bel]( docs/a\(b\).md#x )`;
  const imageSource = "![alt](img_(1).png)";
  const linkStart = markdown.indexOf(linkSource);
  const imageStart = markdown.indexOf(imageSource);

  const spans = scanMarkdownLinks(markdown);

  assert.deepEqual(spans, [
    {
      start: linkStart,
      end: linkStart + linkSource.length,
      label: String.raw`la\]bel`,
      destination: String.raw`docs/a\(b\).md#x`,
      isImage: false,
      containerStart: 0,
      containerEnd: markdown.length,
    },
    {
      start: imageStart,
      end: imageStart + imageSource.length,
      label: "alt",
      destination: "img_(1).png",
      isImage: true,
      containerStart: 0,
      containerEnd: markdown.length,
    },
  ]);
  assert.equal(Object.isFrozen(spans), true);
  assert.equal(Object.isFrozen(spans[0]), true);
});

test("excludes fenced, indented, inline-code, and comment examples", () => {
  const markdown = `
[live](live.md)

\`\`\`md
[fenced](fenced.md)
\`\`\`

~~~
[tilde-fenced](tilde.md)
~~~~

    [indented](indented.md)

\`[inline](inline.md)\`

<!-- [comment](comment.md)
[multiline-comment](multiline.md) -->

\`\` \` [short-run-does-not-close](short.md) \`\`

unmatched \`\` [unmatched-opener-is-live](unmatched.md)
`;

  assert.deepEqual(
    scanMarkdownLinks(markdown).map(({ destination }) => destination),
    ["live.md", "unmatched.md"],
  );
});

test("uses source order when inline code and comments contain each other's openers", () => {
  const markdown = `
\`<!-- [code](code.md)\`
<!-- \` [comment](comment.md) -->
<!-- comment crosses a fence opener
\`\`\`
[still-comment](still-comment.md) -->
[after-comment](after.md)
`;

  assert.deepEqual(
    scanMarkdownLinks(markdown).map(({ destination }) => destination),
    ["after.md"],
  );
});

test("requires a matching fence character and a sufficiently long closing run", () => {
  const markdown = `
   \`\`\`\`
[inside-four-tick-fence](inside.md)
~~~
\`\`\`
[still-inside](still.md)
\`\`\`\`
[outside](outside.md)
`;

  assert.deepEqual(
    scanMarkdownLinks(markdown).map(({ destination }) => destination),
    ["outside.md"],
  );
});

test("masks blockquote and list-nested backtick and tilde fences at exact offsets", () => {
  const markdown = `before
> \`\`\`md
> [blockquote-hidden](quote.md)
> \`\`\`

- ~~~
  [list-hidden](list.md)
  ~~~

[live](live.md)
after`;
  const masked = maskMarkdownIgnoredRegions(markdown);

  assert.equal(masked.length, markdown.length);
  assert.deepEqual(
    [...masked.matchAll(/\n/gu)].map(({ index }) => index),
    [...markdown.matchAll(/\n/gu)].map(({ index }) => index),
  );
  assert.equal(masked.includes("blockquote-hidden"), false);
  assert.equal(masked.includes("list-hidden"), false);
  assert.deepEqual(scanMarkdownLinks(markdown).map(({ destination }) => destination), ["live.md"]);
});

test("does not treat reference links or escaped opening brackets as inline links", () => {
  assert.deepEqual(
    scanMarkdownLinks(
      String.raw`[reference][id] \[escaped](no.md) [live](yes.md)`,
    ).map(({ destination }) => destination),
    ["yes.md"],
  );
});

test("masks ignored non-newline source without changing offsets", () => {
  const markdown = "before `code`\n<!-- hidden\nlink -->\nafter";
  const masked = maskMarkdownIgnoredRegions(markdown);

  assert.equal(masked.length, markdown.length);
  assert.deepEqual(
    [...masked.matchAll(/\n/gu)].map(({ index }) => index),
    [...markdown.matchAll(/\n/gu)].map(({ index }) => index),
  );
  assert.equal(masked, "before       \n           \n        \nafter");
});

test("separates paragraph, list-item, blockquote-paragraph, and table-cell containers", () => {
  const paragraph = "first line\nsecond [paragraph](p.md) line\nthird line";
  const list =
    "- first [item](one.md)\n  continuation\n\n  second paragraph [same item](same.md)\n- second [item](two.md)";
  const quote = "> first\n> [quoted](quote.md)\n>\n> [separate](separate.md)";
  const table = "| first [cell](one.md) | second [cell](two.md) |";

  const [paragraphLink] = scanMarkdownLinks(paragraph);
  assert.ok(paragraphLink);
  assert.equal(
    paragraph.slice(paragraphLink.containerStart, paragraphLink.containerEnd),
    paragraph,
  );

  const [firstItem, sameItem, secondItem] = scanMarkdownLinks(list);
  assert.ok(firstItem);
  assert.ok(sameItem);
  assert.ok(secondItem);
  assert.equal(
    list.slice(firstItem.containerStart, firstItem.containerEnd),
    "- first [item](one.md)\n  continuation\n\n  second paragraph [same item](same.md)",
  );
  assert.deepEqual(
    [sameItem.containerStart, sameItem.containerEnd],
    [firstItem.containerStart, firstItem.containerEnd],
  );
  assert.equal(
    list.slice(secondItem.containerStart, secondItem.containerEnd),
    "- second [item](two.md)",
  );

  const [firstQuote, secondQuote] = scanMarkdownLinks(quote);
  assert.ok(firstQuote);
  assert.ok(secondQuote);
  assert.equal(
    quote.slice(firstQuote.containerStart, firstQuote.containerEnd),
    "> first\n> [quoted](quote.md)",
  );
  assert.equal(
    quote.slice(secondQuote.containerStart, secondQuote.containerEnd),
    "> [separate](separate.md)",
  );

  const [firstCell, secondCell] = scanMarkdownLinks(table);
  assert.ok(firstCell);
  assert.ok(secondCell);
  assert.equal(
    table.slice(firstCell.containerStart, firstCell.containerEnd),
    " first [cell](one.md) ",
  );
  assert.equal(
    table.slice(secondCell.containerStart, secondCell.containerEnd),
    " second [cell](two.md) ",
  );
});

test("provides one shared ignored-region-aware Markdown anchor index", () => {
  const markdown = `# Root [owner](owner.md)

## Repeated

first body

## Repeated

second body

<a id="manual"></a>

\`\`\`
## Ignored
\`\`\`
`;

  const anchors = scanMarkdownAnchors(markdown);

  assert.deepEqual(
    anchors.map(({ name, level }) => ({ name, level })),
    [
      { name: "root-owner", level: 1 },
      { name: "repeated", level: 2 },
      { name: "repeated-1", level: 2 },
      { name: "manual", level: 0 },
    ],
  );
  const repeated = anchors.find(({ name }) => name === "repeated");
  assert.ok(repeated);
  assert.equal(markdown.slice(repeated.start, repeated.end).includes("first body"), true);
  assert.equal(markdown.slice(repeated.start, repeated.end).includes("second body"), false);
});
