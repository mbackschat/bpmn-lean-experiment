import { useEffect, useRef, useState } from "react";

import {
  DefinitionPresentationProvenanceKind,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ResolvedBpmnDiagramPresentation,
} from "@bpmn-lean/platform-contracts";
import { Button } from "@bpmn-lean/platform-ui-kit";

import {
  BpmnDiagramMarkerKind,
} from "./bpmn-viewer-contract.ts";
import type { BpmnDiagramViewer } from "./bpmn-viewer.ts";
import type { DefinitionApiClient } from "./definitions-api";
import { downloadDefinitionPresentation } from "./definition-presentation-download";
import type { FlowNodeMetricBadge } from "./flow-node-metric-overlay.ts";
import styles from "./definition-diagram.module.css";

export type DefinitionDiagramHighlight =
  | Readonly<{
    elementId: string;
    markerKind:
      | typeof BpmnDiagramMarkerKind.Incident
      | typeof BpmnDiagramMarkerKind.Selected;
  }>
  | Readonly<{
    elementIds: readonly string[];
    markerKind: typeof BpmnDiagramMarkerKind.Current;
  }>;

export type DefinitionDiagramProps = Readonly<{
  api: Pick<DefinitionApiClient, "getPresentation">;
  definition: DeployedDefinitionVersion;
  highlight?: DefinitionDiagramHighlight;
  metricBadges?: readonly FlowNodeMetricBadge[];
  onMissingElementIds?: (elementIds: readonly string[]) => void;
  onMissingMetricElementIds?: (elementIds: readonly string[]) => void;
}>;

export function DefinitionDiagram({
  api,
  definition,
  highlight,
  metricBadges,
  onMissingElementIds,
  onMissingMetricElementIds,
}: DefinitionDiagramProps) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<BpmnDiagramViewer>(null);
  const generation = useRef(0);
  const [presentation, setPresentation] =
    useState<ResolvedBpmnDiagramPresentation | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [renderedGeneration, setRenderedGeneration] = useState(0);
  const [viewerReady, setViewerReady] = useState(false);
  const highlightedElementId = highlight !== undefined && "elementId" in highlight
    ? highlight.elementId
    : undefined;
  const highlightedElementIds = highlight !== undefined && "elementIds" in highlight
    ? highlight.elementIds
    : undefined;
  const markerKind = highlight?.markerKind;

  useEffect(() => {
    const element = container.current;
    if (element === null) {
      return;
    }
    let active = true;
    void Promise.all([
      import("./bpmn-js-factory"),
      import("./bpmn-viewer"),
    ]).then(([{ createBpmnJsViewer }, { BpmnDiagramViewer }]) => {
      if (!active) return;
      viewer.current = new BpmnDiagramViewer(element, createBpmnJsViewer);
      setViewerReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setRenderError(errorMessage(error));
      setRendering(false);
    });
    return () => {
      active = false;
      viewer.current?.destroy();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!viewerReady) return;
    const activeGeneration = generation.current + 1;
    generation.current = activeGeneration;
    setRendering(true);
    setDownloadError(null);
    setRenderError(null);
    setPresentation(null);
    setRenderedGeneration(0);
    onMissingElementIds?.([]);
    viewer.current?.clearMetricBadges();
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
        if (generation.current === activeGeneration && viewer.current === activeViewer) {
          switch (markerKind) {
            case BpmnDiagramMarkerKind.Incident:
            case BpmnDiagramMarkerKind.Selected:
              if (highlightedElementId === undefined) {
                throw new TypeError("single diagram highlight requires one BPMN element ID");
              }
              viewer.current.highlight(highlightedElementId, markerKind);
              break;
            case BpmnDiagramMarkerKind.Current:
              if (highlightedElementIds === undefined) {
                throw new TypeError("current diagram highlight requires BPMN element IDs");
              }
              onMissingElementIds?.(viewer.current.highlightMany(
                highlightedElementIds,
                markerKind,
              ));
              break;
            case undefined:
              break;
          }
          setRenderedGeneration(activeGeneration);
        }
      } catch (error: unknown) {
        if (generation.current === activeGeneration) {
          viewer.current?.clearMetricBadges();
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
  }, [
    api,
    definition,
    highlightedElementId,
    highlightedElementIds,
    markerKind,
    onMissingElementIds,
    viewerReady,
  ]);

  useEffect(() => {
    const activeViewer = viewer.current;
    if (activeViewer === null || renderedGeneration === 0) {
      onMissingMetricElementIds?.([]);
      return;
    }
    try {
      if (metricBadges === undefined) {
        activeViewer.clearMetricBadges();
        onMissingMetricElementIds?.([]);
      } else {
        onMissingMetricElementIds?.(activeViewer.replaceMetricBadges(metricBadges));
      }
    } catch (error: unknown) {
      activeViewer.clearMetricBadges();
      onMissingMetricElementIds?.([]);
      setRenderError(errorMessage(error));
    }
  }, [metricBadges, onMissingMetricElementIds, renderedGeneration]);

  return (
    <section
      className={styles.panel}
      aria-label={`Complete diagram workspace for ${definition.processId}, version ${definition.version}`}
      data-diagram-status={rendering ? "rendering" : renderError === null ? "ready" : "failed"}
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
        aria-label={diagramLabel(definition, highlight)}
      />
    </section>
  );
}

function diagramLabel(
  definition: DeployedDefinitionVersion,
  highlight: DefinitionDiagramHighlight | undefined,
): string {
  const base = `BPMN diagram for ${definition.processId}, version ${definition.version}`;
  if (highlight === undefined) return base;
  if ("elementId" in highlight) return `${base}, highlighting ${highlight.elementId}`;
  if ("elementIds" in highlight) {
    return `${base}, highlighting ${commaSeparated([...new Set(highlight.elementIds)])}`;
  }
  return base;
}

function commaSeparated(values: readonly string[]): string {
  let result = "";
  for (const value of values) result = result.length === 0 ? value : `${result}, ${value}`;
  return result;
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
