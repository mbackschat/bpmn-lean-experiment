import type {
  ResolvedBpmnDiagramPresentation,
} from "@bpmn-lean/platform-contracts";

export type DefinitionPresentationDownloadPort = Readonly<{
  createObjectUrl(blob: Blob): string;
  click(objectUrl: string, fileName: string): void;
  revokeObjectUrl(objectUrl: string): void;
}>;

const browserDownloadPort: DefinitionPresentationDownloadPort = {
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  click(objectUrl, fileName) {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  },
  revokeObjectUrl: (objectUrl) => URL.revokeObjectURL(objectUrl),
};

/** Downloads the verified resolved presentation, never source bytes or a raw DI sidecar. */
export function downloadDefinitionPresentation(
  presentation: ResolvedBpmnDiagramPresentation,
  port: DefinitionPresentationDownloadPort = browserDownloadPort,
): void {
  const bytes = new TextEncoder().encode(presentation.presentationBpmnXml);
  const blob = new Blob([bytes], { type: "application/bpmn+xml" });
  const objectUrl = port.createObjectUrl(blob);
  try {
    port.click(objectUrl, presentationFileName(presentation));
  } finally {
    port.revokeObjectUrl(objectUrl);
  }
}

function presentationFileName(
  presentation: ResolvedBpmnDiagramPresentation,
): string {
  const portableProcessId = presentation.definition.processId
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .slice(0, 80)
    .replace(/^[._-]+|[._-]+$/gu, "");
  const baseName = portableProcessId.length === 0 ? "process" : portableProcessId;
  return `${baseName}-v${presentation.definition.version}-diagrammed.bpmn`;
}
