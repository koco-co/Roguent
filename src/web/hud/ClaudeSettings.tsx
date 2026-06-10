import type { RuntimeConfig } from "../../shared/runtime";

export interface ClaudeSettingsProps {
  runtime: RuntimeConfig;
}

export function ClaudeSettings({ runtime }: ClaudeSettingsProps) {
  return (
    <section className="runtime-settings-summary">
      <div className="runtime-settings-title">Claude Runtime</div>
      <div className="runtime-settings-grid">
        <span>model</span>
        <strong>{runtime.model}</strong>
        <span>permission</span>
        <strong>{runtime.permissionMode}</strong>
        <span>sandbox</span>
        <strong>{runtime.sandboxMode}</strong>
        <span>network</span>
        <strong>{runtime.networkAccess ? "enabled" : "disabled"}</strong>
      </div>
    </section>
  );
}
