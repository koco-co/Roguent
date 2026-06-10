import type { IntegrationConnectorStatus } from "../../../shared/integrations";

export interface RelaySettingsProps {
  status?: IntegrationConnectorStatus | null;
}

const STATE_LABELS: Record<string, string> = {
  blocked: "blocked",
  connected: "connected",
  disconnected: "disconnected",
};

export function RelaySettings({ status }: RelaySettingsProps) {
  const relayStatus = status?.channel === "relay" ? status : null;
  const state = relayStatus?.state ?? "disconnected";
  const displayState = STATE_LABELS[state] ?? state;
  const reason =
    relayStatus?.error ??
    stringMetadata(relayStatus, "reason") ??
    stringMetadata(relayStatus, "status");

  return (
    <section className="relay-settings" data-state={state}>
      <div className="relay-settings__heading">
        <span className="relay-settings__title">Relay</span>
        <span className={`relay-settings__badge ${state}`}>{displayState}</span>
      </div>
      {reason && <p className="relay-settings__reason">{reason}</p>}
    </section>
  );
}

function stringMetadata(
  status: IntegrationConnectorStatus | null,
  key: string,
): string | undefined {
  const value = status?.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
