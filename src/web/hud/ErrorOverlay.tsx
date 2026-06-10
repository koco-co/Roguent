import { useEffect, useState } from "react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { reconnectRoom } from "../ws-client";
import { Icon } from "./icons";

/**
 * runtime 离线错误层 ErrorOverlay(T4.3 接真实连接状态):
 * 由 store.connection 驱动 —— 连接非 open 持续超过宽限期(GRACE_MS)才显示,
 * 避免正常 1s 退避重连时闪烁。绝不静默黑屏。
 * - 「重试连接」→ reconnectRoom()(立即重连);连上后 connection→open,本层自动隐。
 * - 「返回」→ 手动忽略本次(dismissed),离线时也先放用户进去;下次断线(重新 open 过)再弹。
 * selector 守铁律;gate 放所有 hooks 之后。
 */
const GRACE_MS = 2500;

export function ErrorOverlay() {
  const connection = useRoomStore((s) => s.connection);
  const commandError = useUiStore((s) => s.commandError);
  const setCommandError = useUiStore((s) => s.setCommandError);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (connection === "open") {
      setShow(false);
      setDismissed(false); // 恢复在线 → 重置忽略,下次断线可再弹
      return;
    }
    // 非 open(connecting/closed)持续 GRACE_MS 才显示
    const t = setTimeout(() => setShow(true), GRACE_MS);
    return () => clearTimeout(t);
  }, [connection]);

  if (commandError) {
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: scrim 是覆盖遮罩;键盘关闭由 App 的 Esc 集中处理
      <div className="scrim" onClick={() => setCommandError(null)}>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: 内层吞掉冒泡 */}
        <div className="error-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="error-spark">
            <Icon name="error" size={64} glow="#ff4d6d" />
          </div>
          <div
            className="px"
            style={{ fontSize: 14, color: "#ff8197", margin: "18px 0 10px" }}
          >
            命令失败
          </div>
          <div className="dim" style={{ marginBottom: 22 }}>
            {commandError}
          </div>
          <button
            type="button"
            className="pxbtn primary cjk"
            onClick={() => setCommandError(null)}
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  if (!show || dismissed) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrim 是覆盖遮罩;键盘关闭由 App 的 Esc 集中处理
    <div className="scrim" onClick={() => setDismissed(true)}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 内层吞掉冒泡 */}
      <div className="error-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="error-spark">
          <Icon name="error" size={64} glow="#ff4d6d" />
        </div>
        <div
          className="px"
          style={{ fontSize: 14, color: "#ff8197", margin: "18px 0 10px" }}
        >
          runtime 离线
        </div>
        <div className="dim" style={{ marginBottom: 8 }}>
          无法连接到该项目的 Claude Code engine。
        </div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 22 }}>
          资源/连接失败时显示可见错误层,绝不静默黑屏。
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            type="button"
            className="pxbtn primary cjk"
            onClick={() => reconnectRoom()}
          >
            重试连接
          </button>
          <button
            type="button"
            className="pxbtn cjk"
            onClick={() => setDismissed(true)}
          >
            返回
          </button>
        </div>
      </div>
    </div>
  );
}
