import { useEffect, useRef, useState } from "react";
import { DefinitionDeployStatus } from "@bpmn-lean/platform-contracts";
import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";
import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";

import { CibCapabilityEvidenceKind, mvpBpmnCapabilities } from "../../../../model-corpus/mvp-capabilities.ts";
import type { ProcessShowcaseEntry } from "../../../../model-corpus/rc-showcases.ts";
import type { DefinitionApiClient } from "./definitions-api.ts";
import { processShowcaseCatalog } from "./process-showcase-catalog.ts";
import styles from "./process-showcase-panel.module.css";

export type ProcessShowcasePanelProps = Readonly<{
  api: DefinitionApiClient;
  onPrepared: (definition: DeployedDefinitionVersion) => Promise<void>;
  onBack: () => void;
  entries?: ReadonlyArray<ProcessShowcaseEntry>;
}>;

export function ProcessShowcasePanel({ api, onPrepared, onBack, entries = processShowcaseCatalog }: ProcessShowcasePanelProps) {
  const [query, setQuery] = useState("");
  const [allModels, setAllModels] = useState(false);
  const [selected, setSelected] = useState<ProcessShowcaseEntry | null>(null);
  const [runtimeAvailable, setRuntimeAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReadonlyArray<string>>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const returnModelId = useRef<string | null>(null);
  const preparing = useRef(false);
  useEffect(() => {
    if (selected === null && returnModelId.current !== null) {
      const id = returnModelId.current;
      returnModelId.current = null;
      const row = Array.from(list.current?.children ?? []).find((element) => element.getAttribute("data-model-id") === id);
      row?.querySelector<HTMLButtonElement>("button")?.focus();
    } else heading.current?.focus();
  }, [selected]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/rc-showcase-runtime.json", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as unknown : null)
      .then((value) => {
        if (controller.signal.aborted) return;
        setRuntimeAvailable(typeof value === "object" && value !== null
          && "kind" in value && value.kind === "rcShowcaseRuntime"
          && "version" in value && value.version === 1);
      }).catch(() => { if (!controller.signal.aborted) setRuntimeAvailable(false); });
    return () => controller.abort();
  }, []);

  async function prepare(model: ProcessShowcaseEntry): Promise<void> {
    if (preparing.current || model.showcase === null || (model.showcase.mode === "guided" && !runtimeAvailable)) return;
    preparing.current = true;
    setPending(true);
    setError([]);
    try {
      const result = await api.deploy({
        bytes: new TextEncoder().encode(model.xml),
        sourceId: model.sourcePath.split("/").at(-1)!,
        semanticProfile: model.profile,
      });
      switch (result.status) {
        case DefinitionDeployStatus.Rejected:
          setError(result.diagnostics.map(({ code, evidence }) => `${code}: ${evidence}`));
          break;
        case DefinitionDeployStatus.Deployed:
          if (result.definition.source.sha256 !== model.sha256 || result.definition.semanticProfile !== model.profile) {
            throw new Error("Deployment does not match the selected showcase source and profile.");
          }
          await onPrepared(result.definition);
          break;
      }
    } catch (cause: unknown) {
      setError([cause instanceof Error ? cause.message : "Showcase preparation failed."]);
    } finally {
      preparing.current = false;
      setPending(false);
    }
  }

  const search = query.trim().toLocaleLowerCase();
  const visible = entries.filter((entry) => (allModels || entry.showcase !== null)
    && [entry.title, entry.businessPurpose, ...entry.capabilityIds.map((id) =>
      mvpBpmnCapabilities.find((capability) => capability.id === id)?.element ?? id)]
      .some((text) => text.toLocaleLowerCase().includes(search)));

  return (
    <section className={styles.panel} aria-label="Process showcases">
      <Button variant={ButtonVariant.Secondary} isDisabled={pending} onPress={onBack}>Back to definitions</Button>
      <h2 ref={heading} tabIndex={-1}>{selected?.title ?? "Explore process showcases"}</h2>
      {selected === null ? <>
        <p>Choose a business process, inspect its BPMN coverage, then prepare its exact model in Definitions and start it. {entries.filter((entry) => entry.showcase !== null).length} curated paths; {entries.length} retained engine models.</p>
        <p>Human-work paths use real claim and form interactions. Guided simulations use real Temporal execution with explicitly simulated participants and services.</p>
        <details className={styles.explanation}>
          <summary>What this demonstrates about the approach</summary>
          <p>BPMN defines the model. Lean supplies the profile's reference account and its declared proved or checked assurance; it is not executing the browser instance. The TypeScript semantic core executes the admitted model, and Temporal hosts durable execution. CIB Seven is a compatibility oracle for selected profiles, not the runtime behind this UI.</p>
          <p>A passing example establishes its bounded path. It does not prove every BPMN combination, general CIB compatibility, or production capacity. About lists exact element variants and restrictions.</p>
        </details>
        <div className={styles.filters}>
          <label>Find a process or BPMN element<input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
          <label><input type="checkbox" checked={allModels} onChange={(event) => setAllModels(event.currentTarget.checked)} />Include all retained engine models</label>
        </div>
        <p role="status">{visible.length} matching processes</p>
        <ul className={styles.collection} ref={list}>
          {visible.map((model) => <li key={model.id} data-model-id={model.id}>
            <div><h3>{model.title}</h3><p>{model.businessPurpose}</p><span>{modeLabel(model)}</span></div>
            <Button variant={ButtonVariant.Secondary} aria-label={`Explore ${model.title}`} onPress={() => { setSelected(model); setError([]); }}>Explore</Button>
          </li>)}
        </ul>
      </> : <>
        <Button variant={ButtonVariant.Secondary} isDisabled={pending} onPress={() => { returnModelId.current = selected.id; setSelected(null); setError([]); }}>Back to showcase catalog</Button>
        <p>{selected.businessPurpose}</p>
        <p className={styles.mode}>{modeLabel(selected)}</p>
        {selected.showcase === null ? <p>{selected.browserLimit}</p> : <>
          <h3>What to try</h3><p>{selected.showcase.tryIt}</p>
          {selected.showcase.mode === "guided" ? <p>Participants and external services are simulated by the isolated RC showcase host. This is an engine demonstration, not a human inbox or a live business integration.</p> : <p>After starting, use Work to claim and complete each task. Inspect the exact instance in Operations for current state, semantic History and operator actions.</p>}
          {selected.showcase.mode === "guided" && !runtimeAvailable ? <p role="status">Guided execution is unavailable on this host. Launch the isolated RC showcase host with <code>./scripts/pnpm.sh run demo:rc</code> to try it.</p> : null}
          <Button isPending={pending} isDisabled={selected.showcase.mode === "guided" && !runtimeAvailable} onPress={() => { void prepare(selected); }}>Prepare this showcase</Button>
          {pending ? <p role="status">Preparing this exact model. Wait for the result before choosing another showcase.</p> : null}
          <p>Preparation deploys the exact retained BPMN. Select Start for a separate, explicit instance creation; repeated starts create separate instances.</p>
        </>}
        {error.length === 0 ? null : <ul role="alert">{error.map((message, index) => <li key={index}>{message}</li>)}</ul>}
        <h3>BPMN elements and supported extent</h3>
        <ul className={styles.capabilities}>
          {selected.capabilityIds.map((id) => {
            const capability = mvpBpmnCapabilities.find((entry) => entry.id === id)!;
            return <li key={id}><strong>{capability.element}</strong><p>{capability.restriction}</p>
              <small>{capability.cibEvidence.kind === CibCapabilityEvidenceKind.ExactSelectedProfile
                ? `Selected variant comparison: CIB Seven ${capability.cibEvidence.version}, case ${capability.cibEvidence.pipelineCaseId}. This is not a comparison of every model using the element.`
                : capability.cibEvidence.kind === CibCapabilityEvidenceKind.NotSelected ? "No CIB comparison selected for this variant." : "Project extension; not a CIB compatibility claim."}</small>
            </li>;
          })}
        </ul>
        <h3>Evidence boundary</h3>
        <p>Retained cross-target engine scenario: <code>{selected.pipelineCaseId}</code>. Lean reference, TypeScript execution, and Temporal hosting are tested at the scenario's declared boundary. Finite scenario agreement is not a universal proof.</p>
        <p>{selected.browserLimit}</p>
        <details><summary>Exact source and profile</summary><p>Profile: <code>{selected.profile}</code></p><p>Source SHA-256: <code>{selected.sha256}</code></p><pre>{selected.xml}</pre></details>
      </>}
    </section>
  );
}

function modeLabel(entry: ProcessShowcaseEntry): string {
  switch (entry.showcase?.mode) {
    case "human": return "Interactive human work";
    case "guided": return "Guided simulation";
    default: return "Engine evidence — browser execution not selected";
  }
}
