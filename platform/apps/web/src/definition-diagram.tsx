import { useEffect, useRef, useState } from "react";

import {
  DefinitionPresentationProvenanceKind,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ResolvedBpmnDiagramPresentation,
} from "@bpmn-lean/platform-contracts";
import { Button } from "@bpmn-lean/platform-ui-kit";

import { createBpmnJsViewer } from "./bpmn-js-factory";
import { BpmnDiagramViewer } from "./bpmn-viewer";
import type { DefinitionApiClient } from "./definitions-api";
import { downloadDefinitionPresentation } from "./definition-presentation-download";
import styles from "./definition-diagram.module.css";

export type DefinitionDiagramProps = Readonly<{
  activeElementId?: string;
  api: Pick<DefinitionApiClient, "getPresentation">;
  definition: DeployedDefinitionVersion;
}>;

export function DefinitionDiagram({
  activeElementId,
  api,
  definition,
}: DefinitionDiagramProps) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<BpmnDiagramViewer>(null);
  const viewerInitializationError = useRef<string | null>(null);
  const generation = useRef(0);
  const [presentation, setPresentation] =
    useState<ResolvedBpmnDiagramPresentation | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    const element = container.current;
    if (element === null) {
      return;
    }
    try {
      viewer.current = new BpmnDiagramViewer(element, createBpmnJsViewer);
    } catch (error: unknown) {
      viewerInitializationError.current = errorMessage(error);
      setRenderError(viewerInitializationError.current);
    }
    return () => {
      viewer.current?.destroy();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    const activeGeneration = generation.current + 1;
    generation.current = activeGeneration;
    setRendering(true);
    setDownloadError(null);
    setRenderError(viewerInitializationError.current);
    setPresentation(null);
    void (async () => {
      try {
        const resolved = await api.getPresentation(definition);
        if (generation.current !== activeGeneration) {
          return;
        }
        setPresentation(resolved);
        if (viewer.current === null) {
          return;
        }
        const activeViewer = viewer.current;
        activeViewer.clearHighlight();
        await activeViewer.render(new TextEncoder().encode(
          resolved.presentationBpmnXml,
        ));
        if (
          generation.current === activeGeneration &&
          viewer.current === activeViewer &&
          activeElementId !== undefined
        ) {
          viewer.current.highlight(activeElementId);
        }
      } catch (error: unknown) {
        if (generation.current === activeGeneration) {
          setRenderError(errorMessage(error));
        }
      } finally {
        if (generation.current === activeGeneration) {
          setRendering(false);
        }
      }
    })();
    return () => {
      if (generation.current === activeGeneration) {
        generation.current += 1;
      }
    };
  }, [activeElementId, api, definition]);

  return (
    <section
      className={styles.panel}
      aria-label={`Complete diagram workspace for ${definition.processId}, version ${definition.version}`}
      data-ui="definition-diagram-surface"
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Resolved BPMN presentation</p>
          <h2 id="diagram-heading">{definition.processId}, version {definition.version}</h2>
        </div>
        <code>{definition.source.sha256.slice(0, 12)}…</code>
      </div>
      {rendering ? <p className={styles.status} role="status">Rendering diagram…</p> : null}
      {presentation === null ? null : (
        <>
          <p className={styles.status}>{presentationLabel(presentation)}</p>
          <div className={styles.download}>
            <p>Derived presentation copy, not admitted source.</p>
            <Button
              onPress={() => {
                try {
                  downloadDefinitionPresentation(presentation);
                  setDownloadError(null);
                } catch (error: unknown) {
                  setDownloadError(errorMessage(error));
                }
              }}
            >
              Download diagrammed BPMN
            </Button>
          </div>
        </>
      )}
      {downloadError === null ? null : (
        <p className={styles.error} role="alert">
          Diagram download is unavailable: {downloadError}
        </p>
      )}
      {renderError === null ? null : (
        <p className={styles.error} role="alert">
          Diagram view is unavailable: {renderError}
        </p>
      )}
      <div
        className={styles.canvas}
        ref={container}
        aria-label={`BPMN diagram for ${definition.processId}, version ${definition.version}`}
      />
    </section>
  );
}

function presentationLabel(
  presentation: ResolvedBpmnDiagramPresentation,
): string {
  switch (presentation.provenance.kind) {
    case DefinitionPresentationProvenanceKind.Source:
      return "Source layout";
    case DefinitionPresentationProvenanceKind.Generated:
      return "Generated layout";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown rendering failure";
}
