import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/dialog.tsx", import.meta.url), "utf8");

test("uses React Aria modal semantics with a safe initial focus and dismiss restoration", () => {
  assert.match(source, /ModalOverlay/u);
  assert.match(source, /isDismissable/u);
  assert.match(source, /<Dialog/u);
  assert.match(source, /slot="title"/u);
  assert.match(source, /<Button autoFocus variant=\{ButtonVariant\.Secondary\}/u);
  assert.match(source, /onOpenChange=\{\(open\) => \{ if \(!open\) onCancel\(\); \}\}/u);
});
