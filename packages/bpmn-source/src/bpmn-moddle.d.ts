declare module "bpmn-moddle" {
  export class BpmnModdle {
    constructor(
      additionalPackages?: Readonly<Record<string, unknown>>,
      options?: Readonly<Record<string, unknown>>,
    );

    fromXML(xml: string): Promise<unknown>;
  }
}
