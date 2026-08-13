declare module "bpmn-moddle" {
  export class BpmnModdle {
    constructor(
      additionalPackages?: Readonly<Record<string, unknown>>,
      options?: Readonly<Record<string, unknown>>,
    );

    fromXML(xml: string): Promise<unknown>;
  }
}

declare module "bpmn-auto-layout" {
  export function layoutProcess(xml: string): Promise<string>;
}

declare module "saxen" {
  export class Parser {
    ns(namespaces?: Readonly<Record<string, string>>): this;
    on(
      name: "openTag",
      listener: (name: string) => void,
    ): this;
    on(name: "warn" | "error", listener: (error: Error) => void): this;
    parse(xml: string): Error | null;
  }
}
