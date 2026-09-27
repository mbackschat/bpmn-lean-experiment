import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DefinitionDeployStatus } from "@bpmn-lean/platform-contracts";
import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";
import { Button, ButtonVariant, InlineDisclosure } from "@bpmn-lean/platform-ui-kit";

import { CibCapabilityEvidenceKind, mvpBpmnCapabilities } from "../../../../model-corpus/mvp-capabilities.ts";
import type { ProcessShowcaseEntry } from "../../../../model-corpus/rc-showcases.ts";
import type { DefinitionApiClient } from "./definitions-api.ts";
import { findProcessShowcase, processShowcaseCatalog } from "./process-showcase-catalog.ts";
import type { DefinitionSearch, WorkspaceNavigation } from "./navigation/route-search.ts";
import styles from "./process-showcase-panel.module.css";

export type ProcessShowcasePanelProps = Readonly<{
  navigation?: WorkspaceNavigation<DefinitionSearch>;
  api: DefinitionApiClient;
  definitions?: ReadonlyArray<DeployedDefinitionVersion>;
  onPrepared: (definition: DeployedDefinitionVersion) => Promise<void>;
  onBack: () => void;
  entries?: ReadonlyArray<ProcessShowcaseEntry>;
}>;

export function ProcessShowcasePanel({ api, navigation, onPrepared, onBack, definitions = [], entries = processShowcaseCatalog }: ProcessShowcasePanelProps) {
  const [localQuery, setLocalQuery] = useState("");
  const [localAllModels, setLocalAllModels] = useState(false);
  const [localSelected, setLocalSelected] = useState<ProcessShowcaseEntry | null>(null);
  const query = navigation === undefined ? localQuery : navigation.search.q ?? "";
  const allModels = navigation === undefined ? localAllModels : navigation.search.all ?? false;
  const selected = navigation === undefined ? localSelected : entries.find((entry) => entry.id === navigation.search.model) ?? null;
  const setQuery = (q: string) => navigation === undefined ? setLocalQuery(q) : navigation.navigate({ ...navigation.search, q }, true);
  const setAllModels = (all: boolean) => navigation === undefined ? setLocalAllModels(all) : navigation.navigate({ ...navigation.search, all });
  const setSelected = (model: ProcessShowcaseEntry | null) => {
    if (navigation === undefined) setLocalSelected(model);
    else {
      const { model: previous, ...search } = navigation.search;
      navigation.navigate(model === null ? search : { ...search, model: model.id });
    }
  };
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
    navigation?.retainSelection(model.id);
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
          navigation?.retainSelection(null);
          await onPrepared(result.definition);
          break;
      }
    } catch (cause: unknown) {
      setError([cause instanceof Error ? cause.message : "Showcase preparation failed."]);
    } finally {
      navigation?.retainSelection(null);
      preparing.current = false;
      setPending(false);
    }
  }

  if (navigation?.search.model !== undefined && selected === null) return <section aria-label="Process showcases"><h2>Showcase unavailable</h2><p>This link does not identify a retained showcase.</p><Button onPress={() => setSelected(null)}>Back to showcase catalog</Button></section>;

  const search = query.trim().toLocaleLowerCase();
  const visible = entries.filter((entry) => (allModels || entry.showcase !== null)
    && [entry.title, entry.businessPurpose, ...entry.capabilityIds.map((id) =>
      mvpBpmnCapabilities.find((capability) => capability.id === id)?.element ?? id)]
      .some((text) => text.toLocaleLowerCase().includes(search)));
  const preparedDefinition = (model: ProcessShowcaseEntry) => model.showcase === null
    || (model.showcase.mode === "guided" && !runtimeAvailable) ? undefined
    : definitions.find((definition) => findProcessShowcase(definition, entries)?.id === model.id);
  const prepared = selected === null ? undefined : preparedDefinition(selected);

  return (
    <section className={styles.panel} aria-label="Process showcases">
      <Button variant={ButtonVariant.Secondary} isDisabled={pending} onPress={onBack}>Back to definitions</Button>
      <h2 ref={heading} tabIndex={-1}>{selected?.title ?? "Explore process showcases"}</h2>
      {selected === null ? <>
        <p>Choose a process that interests you. Prepared examples link directly to their definition and starting details; other examples need preparation first. Starting always remains your choice.</p>
        <p>Human-work paths use real claim and form interactions. Guided simulations use real Temporal execution with explicitly simulated participants and services.</p>
        <InlineDisclosure title="What this demonstrates about the approach">
          <p>BPMN defines the model. Lean supplies the profile's reference account and its declared proved or checked assurance; it is not executing the browser instance. The TypeScript semantic core executes the admitted model, and Temporal hosts durable execution. CIB Seven is a compatibility oracle for selected profiles, not the runtime behind this UI.</p>
          <p>A passing example establishes its bounded path. It does not prove every BPMN combination, general CIB compatibility, or production capacity. About lists exact element variants and restrictions.</p>
        </InlineDisclosure>
        <div className={styles.filters}>
          <label>Find a process or BPMN element<input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
          <label><input type="checkbox" checked={allModels} onChange={(event) => setAllModels(event.currentTarget.checked)} />Show additional models (view only)</label>
        </div>
        <p>These additional models document engine coverage. They do not have a runnable walkthrough in this app.</p>
        <p role="status">{visible.length} matching processes</p>
        <ul className={styles.collection} ref={list}>
          {visible.map((model) => {
            const definition = preparedDefinition(model);
            return <li key={model.id} data-model-id={model.id}>
            <div><h3>{model.title}</h3><p>{model.businessPurpose}</p><span>{modeLabel(model)}</span></div>
            <div className={styles.actions}>
              {definition === undefined ? null : <PreparedDefinitionLinks definition={definition} />}
              <Button variant={ButtonVariant.Secondary} aria-label={`Explore ${model.title}`} onPress={() => { setSelected(model); setError([]); }}>Explore</Button>
            </div>
          </li>;
          })}
        </ul>
      </> : <>
        <Button variant={ButtonVariant.Secondary} isDisabled={pending} onPress={() => { returnModelId.current = selected.id; setSelected(null); setError([]); }}>Back to showcase catalog</Button>
        <p>{selected.businessPurpose}</p>
        <p className={styles.mode}>{modeLabel(selected)}</p>
        {selected.showcase === null ? <p>{selected.browserLimit}</p> : <>
          <h3>What to try</h3><p>{selected.showcase.tryIt}</p>
          {selected.showcase.mode === "guided" ? <p>Participants and external services are simulated by the isolated RC showcase host. This is an engine demonstration, not a human inbox or a live business integration.</p> : <p>After starting, use Work to claim and complete each task. Inspect the exact instance in Operations for current state, semantic History and operator actions.</p>}
          {selected.showcase.mode === "guided" && !runtimeAvailable ? <p role="status">Guided execution is unavailable on this host. Launch the isolated RC showcase host with <code>./scripts/pnpm.sh run demo:rc</code> to try it.</p> : null}
          {prepared === undefined ? <Button isPending={pending} isDisabled={selected.showcase.mode === "guided" && !runtimeAvailable} onPress={() => { void prepare(selected); }}>Prepare this showcase</Button>
            : <PreparedDefinitionLinks definition={prepared} />}
          {pending ? <p role="status">Preparing this exact model. Wait for the result before choosing another showcase.</p> : null}
          <p>{prepared === undefined ? "Next: we’ll open the starting details for this process. You decide when to Start; preparing alone does not run it."
            : "Open the definition to inspect its diagram, or go directly to starting details. The process runs only when you choose Start."}</p>
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
        <InlineDisclosure title="Exact source and profile"><p>Profile: <code>{selected.profile}</code></p><p>Source SHA-256: <code>{selected.sha256}</code></p><pre>{selected.xml}</pre></InlineDisclosure>
      </>}
    </section>
  );
}

function PreparedDefinitionLinks({ definition }: Readonly<{ definition: DeployedDefinitionVersion }>) {
  const search = { process: definition.processId, version: definition.version };
  return <div className={styles.prepared}>
    <strong>Prepared · Ready to start</strong>
    <div className={styles.links}>
      <Link to="/definitions" search={{ ...search, tab: "diagram" }}>Open definition</Link>
      <Link to="/definitions" search={{ ...search, tab: "start" }}>Go to Start</Link>
    </div>
  </div>;
}

function modeLabel(entry: ProcessShowcaseEntry): string {
  switch (entry.showcase?.mode) {
    case "human": return "Interactive human work";
    case "guided": return "Guided simulation";
    default: return "Engine evidence — browser execution not selected";
  }
}
