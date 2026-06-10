import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { ChatHeader } from "./ChatHeader";
import { Composer } from "./Composer";
import { RuntimeControls } from "./RuntimeControls";
import { Timeline } from "./Timeline";

/**
 * 聊天抽屉 ChatDrawer(对标设计原型 panels2.jsx 的 Chat,由居中 Modal 改回右侧单栏抽屉):
 * 贴右满高玻璃抽屉,头部=当前会话名 + `claude · 模型 · NP` + 「会话」管理弹层;对话流按
 * markdown 渲染**真实整轮消息**,输入框发真 sendMessage。**真数据面板,不是 mock**。
 *
 * 原左侧会话侧栏删除,其独有的「新建会话 / 归档复活」收进头部「会话」弹层(真功能一个不丢)。
 * 接 token 流式 + 完整整轮消息(引擎 includePartialMessages=true),markdown 全渲染。导出名仍
 * ChatDrawer(Hud 不改)。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则)。selector 守
 * zustand 铁律:session/sessions 取 store 的稳定引用,Object.values 在 useMemo 里做,
 * 绝不在 selector 里构造新值。
 */
export function ChatDrawer({ sessionId }: { sessionId?: string } = {}) {
  const active = useUiStore((s) => s.activePanel === "chat");
  const closePanel = useUiStore((s) => s.closePanel);
  const currentSessionId = useRoomStore((s) => s.currentSessionId);
  const currentId = sessionId ?? currentSessionId ?? "";

  if (!active) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrim 是模态遮罩,点击空白处关闭;键盘关闭由 App 的 Esc 集中处理
    <div className="cdrawer-scrim" onClick={closePanel}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 内层吞冒泡,防点抽屉误触 scrim 关闭 */}
      <div className="cdrawer" onClick={(e) => e.stopPropagation()}>
        <ChatHeader sessionId={currentId} />
        <RuntimeControls sessionId={currentId} />
        <Timeline sessionId={currentId} />
        <Composer sessionId={currentId} />
      </div>
    </div>
  );
}
