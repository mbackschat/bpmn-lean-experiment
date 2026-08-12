import { useEffect, useRef, useState } from "react";

import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";

import { createBpmnJsViewer } from "./bpmn-js-factory";
import { BpmnDiagramViewer } from "./bpmn-viewer";
import type { DefinitionApiClient } from "./definitions-api";

export type DefinitionDiagramProps = Readonly<{
  api: Pick<DefinitionApiClient, "getSource">;
  definition: DeployedDefinitionVersion;
}>;

export function DefinitionDiagram({ api, definition }: DefinitionDiagramProps) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<BpmnDiagramViewer>(null);
  const generation = useRef(0);
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
      setRenderError(errorMessage(error));
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
    setRenderError(null);
    void (async () => {
      try {
        const bytes = await api.getSource(definition);
        if (generation.current !== activeGeneration || viewer.current === null) {
          return;
        }
        await viewer.current.render(bytes);
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
  }, [api, definition]);

  return (
    <section className="diagram-panel" aria-labelledby="diagram-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Exact admitted source</p>
          <h2 id="diagram-heading">{definition.processId}, version {definition.version}</h2>
        </div>
        <code>{definition.source.sha256.slice(0, 12)}…</code>
      </div>
      {rendering ? <p className="diagram-status" role="status">Rendering diagram…</p> : null}
      {renderError === null ? null : (
        <p className="error" role="alert">
          The presentation renderer could not display this admitted source: {renderError}
        </p>
      )}
      <div
        className="diagram-canvas"
        ref={container}
        aria-label={`BPMN diagram for ${definition.processId}, version ${definition.version}`}
      />
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown rendering failure";
}
