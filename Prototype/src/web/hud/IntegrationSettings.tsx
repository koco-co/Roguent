import type { IntegrationConnectorStatus } from "../../shared/integrations";
import { RelaySettings } from "./settings/RelaySettings";

export interface IntegrationSettingsProps {
  relayStatus?: IntegrationConnectorStatus | null;
}

export function IntegrationSettings({ relayStatus }: IntegrationSettingsProps) {
  return <RelaySettings status={relayStatus} />;
}
