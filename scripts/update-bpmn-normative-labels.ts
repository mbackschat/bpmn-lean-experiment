/**
 * Regenerates the tracked digest of the labels BPMN 2.0.2 declares.
 *
 * This is a maintainer operation, not a verification lane. It reads the optional local Markdown
 * conversion of the OMG PDF, which no gate may require, and writes the small project-authored digest
 * that [the reference guard](normative-reference-resolution.test.ts) resolves against instead. Absence
 * of the conversion is an infrastructure failure for this command alone.
 *
 * `--check` writes nothing and exits non-zero when the tracked digest disagrees with the conversion,
 * so a maintainer can detect drift without staging a regenerated file.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractNormativeLabels,
  serializeDigest,
} from "./bpmn-normative-labels.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const externalRoot = process.env["BPMN_EXTERNAL_ROOT"] ??
  path.resolve(projectRoot, "../oss");
const conversionName = "BPMN-2.0.2.md";
const conversionPath = process.env["BPMN_CORPUS_MARKDOWN_PATH"] ??
  path.join(externalRoot, "omg-bpmn-2.0.2", conversionName);
const digestPath = path.join(
  projectRoot,
  "docs/reference/bpmn-2.0.2/NORMATIVE-LABELS.digest",
);

async function readConversion(): Promise<string> {
  try {
    return await readFile(conversionPath, "utf8");
  } catch {
    process.stderr.write(
      `BPMN Markdown conversion is absent at ${conversionPath}; ` +
        "generate it with the pdf-to-markdown pipeline described in " +
        "docs/reference/bpmn-2.0.2/README.md, or set BPMN_CORPUS_MARKDOWN_PATH\n",
    );
    process.exit(1);
  }
}

const conversion = await readConversion();
const { labels, qualifiers } = extractNormativeLabels(conversion);
const serialized = serializeDigest({
  source: conversionName,
  sourceSha256: createHash("sha256").update(conversion).digest("hex"),
  labels,
  qualifiers,
});

if (process.argv.includes("--check")) {
  const tracked = await readFile(digestPath, "utf8");
  if (tracked !== serialized) {
    process.stderr.write(
      `${digestPath} disagrees with ${conversionPath}; ` +
        "regenerate it with node scripts/update-bpmn-normative-labels.ts\n",
    );
    process.exit(1);
  }
  process.stdout.write(
    `NORMATIVE_LABELS_OK ${labels.size} labels ${qualifiers.size} qualifiers\n`,
  );
} else {
  await writeFile(digestPath, serialized, "utf8");
  process.stdout.write(
    `NORMATIVE_LABELS_WRITTEN ${labels.size} labels ${qualifiers.size} qualifiers\n`,
  );
}
