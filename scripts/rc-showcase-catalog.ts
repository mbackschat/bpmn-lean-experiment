import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { rcShowcases } from "../model-corpus/rc-showcases.ts";
import type { ProcessShowcaseEntry } from "../model-corpus/rc-showcases.ts";
import type { DefinitionVersionStartCommand } from "../platform/contracts/src/definition-start-command.ts";
import { detectExecutableBpmnCapabilities } from "./executable-model-capabilities.ts";
import { requireExecutableModelCorpusManifest } from "./executable-model-corpus-manifest.ts";
import { flattenElements, parseXmlElements } from "./minimal-xml-tree.ts";

/** Builds a read-only UI projection; source admission and execution remain engine operations. */
export async function buildProcessShowcaseCatalog(projectRoot: string): Promise<ReadonlyArray<ProcessShowcaseEntry>> {
  const manifest = requireExecutableModelCorpusManifest(JSON.parse(
    await readFile(resolve(projectRoot, "model-corpus/manifest.json"), "utf8"),
  ));
  const result: ProcessShowcaseEntry[] = [];
  for (const model of manifest.models) {
    if (model.source.kind !== "retainedScenario") continue;
    const bytes = await readFile(resolve(projectRoot, model.source.bpmnRelativePath));
    if (createHash("sha256").update(bytes).digest("hex") !== model.source.sha256) {
      throw new Error(`Showcase source digest changed: ${model.id}`);
    }
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (model.businessPurpose === null) throw new Error(`Showcase lacks business purpose: ${model.id}`);
    const selection = rcShowcases.find(({ modelId }) => modelId === model.id);
    let showcase: ProcessShowcaseEntry["showcase"] = null;
    if (selection !== undefined) {
      const configPath = resolve(projectRoot, "examples/temporal-mvp", selection.configuration);
      const config = JSON.parse(await readFile(configPath, "utf8")) as {
        bpmn: { file: string; semanticProfile: string };
        process: { initialVariables: DefinitionVersionStartCommand["initialVariables"] };
      };
      if (resolve(dirname(configPath), config.bpmn.file) !== resolve(projectRoot, model.source.bpmnRelativePath)
        || config.bpmn.semanticProfile !== model.profile) {
        throw new Error(`Showcase configuration does not bind the retained model: ${model.id}`);
      }
      if (selection.mode === "human" && model.product2.kind !== "journeyBacked") {
        throw new Error(`Human showcase lacks a browser journey: ${model.id}`);
      }
      showcase = {
        mode: selection.mode,
        tryIt: selection.tryIt,
        start: {
          initialVariables: selection.mode === "human" ? [] : config.process.initialVariables,
        },
      };
    }
    result.push({
      id: model.id,
      title: model.title,
      businessPurpose: model.businessPurpose,
      sourcePath: model.source.bpmnRelativePath,
      sha256: model.source.sha256,
      profile: model.profile,
      xml,
      bpmnProcesses: flattenElements(parseXmlElements(xml).roots)
        .filter((element) => element.name === "process")
        .map(({ attributes }) => {
          if (attributes.id === undefined) throw new Error(`Showcase BPMN Process lacks an ID: ${model.id}`);
          return { id: xmlAttributeText(attributes.id), name: attributes.name === undefined ? null : xmlAttributeText(attributes.name) };
        }),
      capabilityIds: detectExecutableBpmnCapabilities(xml),
      pipelineCaseId: model.pipelineCaseId,
      browserEvidence: model.product2.kind,
      browserLimit: model.product2.kind === "notCatalogReady" ? model.product2.reason
        : model.product2.kind === "journeyBacked" ? "Complete retained human-work browser journey."
        : "Complete guided browser journey with simulated participants and integrations; no manual human-work claim.",
      showcase,
    });
  }
  for (const selection of rcShowcases) {
    if (!result.some(({ id }) => id === selection.modelId)) throw new Error(`Unknown showcase ${selection.modelId}`);
  }
  return result;
}

function xmlAttributeText(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/gu, (_, entity: string) => {
    switch (entity) {
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return '"';
      case "apos": return "'";
      default: return String.fromCodePoint(entity.startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10));
    }
  });
}
