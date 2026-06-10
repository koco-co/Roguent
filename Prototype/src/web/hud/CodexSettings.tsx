import type { RuntimeConfig } from "../../shared/runtime";

export interface CodexSettingsProps {
  runtime: RuntimeConfig;
  provider: string;
  mcpServers: string[];
  mcpProfile: string;
}

export function CodexSettings({
  runtime,
  provider,
  mcpServers,
  mcpProfile,
}: CodexSettingsProps) {
  return (
    <section className="runtime-settings-summary codex">
      <div className="runtime-settings-title">Codex Runtime</div>
      <div className="runtime-settings-grid">
        <span>model</span>
        <strong>{runtime.model}</strong>
        <span>provider</span>
        <strong>{provider}</strong>
        <span>reasoning</span>
        <strong>{runtime.reasoningEffort ?? "medium"}</strong>
        <span>approval</span>
        <strong>{runtime.approvalPolicy ?? "on-request"}</strong>
        <span>sandbox</span>
        <strong>{runtime.sandboxMode}</strong>
        <span>network</span>
        <strong>{runtime.networkAccess ? "enabled" : "disabled"}</strong>
        <span>MCP</span>
        <strong>{mcpServers.length ? mcpServers.join(", ") : "none"}</strong>
        <span>MCP profile</span>
        <strong>{mcpProfile}</strong>
      </div>
    </section>
  );
}
