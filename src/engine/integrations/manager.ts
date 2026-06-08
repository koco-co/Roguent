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
  private generation = 0;

  constructor(private readonly options: IntegrationManagerOptions) {}

  start(): void {
    this.stop();
    const generation = ++this.generation;
    for (const [channel, connector] of Object.entries(
      this.options.imConnectors ?? {},
    )) {
      if (!connector) continue;
      this.unsubscribers.push(
        connector.onEvent((event) => this.handleConnectorEvent(event)),
      );
      void connector.start?.().catch((error) => {
        if (this.generation !== generation) return;
        return this.publishStartupFailure(channel as IntegrationChannel, error);
      });
    }
  }

  stop(): void {
    this.generation++;
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    for (const connector of Object.values(this.options.imConnectors ?? {})) {
      void connector?.stop?.().catch(() => {});
    }
  }

  private async handleConnectorEvent(event: ImConnectorEvent): Promise<void> {
    if (event.type === "message") {
      await this.options.router.route(event.event, {
        currentSessionId: this.options.currentSessionId?.() ?? null,
      });
      return;
    }
    if (event.type === "status") {
      await this.options.router.publishStatus(event.status, {
        currentSessionId: this.options.currentSessionId?.() ?? null,
      });
    }
  }

  private async publishStartupFailure(
    channel: IntegrationChannel,
    error: unknown,
  ): Promise<void> {
    await this.options.router.publishStatus(
      {
        id: `${channel}-startup`,
        channel,
        state: "error",
        label: `${channel} connector`,
        error: sanitizeStartupError(error),
        lastEventAt: Date.now(),
        metadata: {
          code: "connector-startup-failed",
        },
      },
      {
        currentSessionId: this.options.currentSessionId?.() ?? null,
      },
    );
  }
}

function sanitizeStartupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/secret-[^\s,;"]+/gi, "[redacted]");
}
