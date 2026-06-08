import type { IntegrationChannel } from "../../shared/integrations";
import type { IntegrationRouter } from "./router";
import type { ImConnector, ImConnectorEvent } from "./wechat-types";

export interface IntegrationManagerOptions {
  imConnectors?: Partial<Record<IntegrationChannel, ImConnector>>;
  router: IntegrationRouter;
  currentSessionId?: () => string | null | undefined;
}

export class IntegrationManager {
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly options: IntegrationManagerOptions) {}

  start(): void {
    this.stop();
    for (const connector of Object.values(this.options.imConnectors ?? {})) {
      if (!connector) continue;
      this.unsubscribers.push(
        connector.onEvent((event) => this.handleConnectorEvent(event)),
      );
    }
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
  }

  private async handleConnectorEvent(event: ImConnectorEvent): Promise<void> {
    if (event.type !== "message") return;
    await this.options.router.route(event.event, {
      currentSessionId: this.options.currentSessionId?.() ?? null,
    });
  }
}
