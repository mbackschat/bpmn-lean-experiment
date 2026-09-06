export type ProcessFinding = Readonly<{
  finding: string;
  instances: string;
  disposition: string;
  evidence: string;
}>;

/** Shared so guards cannot pair one finding with another finding's disposition or evidence. */
export function processFindingSections(markdown: string): ReadonlyArray<ProcessFinding> {
  const findingsHeading = "## Findings\n";
  const updateHeading = "\n## Update rule";
  const start = markdown.indexOf(findingsHeading);
  const end = markdown.indexOf(updateHeading, start + findingsHeading.length);
  if (start === -1 || end === -1) {
    throw new TypeError("process-assessment ledger has no bounded Findings section");
  }
  const content = markdown.slice(start + findingsHeading.length, end).trim();
  const blocks = content.split(/\n(?=### Finding \d+\n)/u);
  return blocks.map((rawBlock, index) => {
    const block = rawBlock.trim();
    const match = /^### Finding (\d+)\n\n([^\n]+)\n\nInstances\n: ([^\n]+)\n\nDisposition\n: ([^\n]+)\n\nEvidence\n: ([^\n]+)\n\n\*\*First observed:\*\* [^\n]+(?:\n\n[\s\S]+)?$/u.exec(block);
    if (match === null) {
      throw new TypeError(`process-assessment finding ${index + 1} has malformed structure`);
    }
    const [, ordinal, finding, instances, disposition, evidence] = match;
    if (Number(ordinal) !== index + 1) {
      throw new TypeError(
        `process-assessment finding ${index + 1} carries ordinal ${JSON.stringify(ordinal)}`,
      );
    }
    return {
      finding: finding ?? "",
      instances: instances ?? "",
      disposition: disposition ?? "",
      evidence: evidence ?? "",
    };
  });
}
