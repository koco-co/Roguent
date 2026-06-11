import { useEffect } from "react";
import { useT, useTL } from "../i18n";
import { useUiStore } from "../ui-store";
import { sendCommand } from "../ws-client";
import { Modal } from "./Modal";
import { Icon } from "./icons";

/**
 * 导入本地会话面板 Import(对标设计原型 panels2.jsx 的 ImportPanel):
 * 竖排列出 ~/.claude/projects 下扫描到的本地 Claude Code 会话,
 * 点一条即把整段对话(用户 + 助手轮次)零额度同步进来——「云存档同步」式回看。
 *
 * **这是真数据面板,不是 mock**:列表来自引擎扫描真实磁盘(localSessions),
 * 点击发 `importSession` 真命令同步那段真实对话;无任何造假 / mock banner。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(含 useEffect,守 React
 * hooks 规则);useEffect 的 dep 是 active——面板变为 active 时发 `listLocalSessions`
 * 拉取列表(请求/响应:engine 定向回 control 消息)。
 * selector 守 zustand 铁律:localSessions 取 store 维护的稳定数组引用,
 * importError 取单值,绝不在 selector 里 .map/.filter/构造新值。
 */

/** The import panel: list & import real local Claude Code sessions (real command). */
export function ImportPanel() {
  const t = useT();
  const tl = useTL();
  const active = useUiStore((s) => s.activePanel === "import");
  const closePanel = useUiStore((s) => s.closePanel);
  // 真数据:扫描到的本地会话列表(稳定数组引用)+ 导入错误(单值)。
  const items = useUiStore((s) => s.localSessions);
  const error = useUiStore((s) => s.importError);

  // 面板变为 active 时拉一次本地会话列表(useEffect 放在 return null 之前,守 hooks 规则)。
  useEffect(() => {
    if (active) sendCommand({ cmd: "listLocalSessions" });
  }, [active]);

  if (!active) return null;

  return (
    <Modal
      title="IMPORT"
      sub="导入本地会话"
      icon="import"
      accent="#f2c84b"
      width={760}
      onClose={closePanel}
    >
      <div className="import-wrap">
        <div className="dim" style={{ marginBottom: 12 }}>
          {t("扫描到的本地 Claude Code 项目:")}
        </div>
        {/* 真错误:引擎扫描 / 导入失败时定向回传的 reason。 */}
        {error && (
          <div
            className="pinkc"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Icon name="error" size={18} glow="var(--pink)" />
            {error}
          </div>
        )}
        {items.length === 0 ? (
          <div className="faint">{t("没有本地会话")}</div>
        ) : (
          // 真会话行:每行 = 一段真实本地会话,整行点击即发 importSession 同步进来。
          // 行尾「{n} 行」chip 与「导入」chip 是纯视觉(非嵌套 button),保可达性。
          items.map((m) => (
            <button
              key={m.path}
              type="button"
              className="import-row"
              onClick={() =>
                sendCommand({ cmd: "importSession", path: m.path })
              }
            >
              <Icon name="import" size={22} glow="#f2c84b" />
              <div className="import-path">
                <div className="cyan">{m.project}</div>
                <div className="dim" style={{ wordBreak: "break-all" }}>
                  {m.firstMessage || m.sessionId}
                </div>
              </div>
              <span className="chip">
                {tl(`${m.msgCount} 行`, `${m.msgCount} lines`)}
              </span>
              <span className="pxbtn gold sm cjk">{t("导入")}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
