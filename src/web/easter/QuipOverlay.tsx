import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent } from "../../shared/domain";
import { VH, VW } from "../room/config";
import { roomLayout } from "../room/layout";
import { useSettingsStore } from "../settings-store";
import { useRoomStore } from "../store";

// 内景小人头顶台词气泡(移植自原型 hud.jsx:52-80 的 QUIPS+QuipLayer)。
// 真假分明:**删了 askuser / todo 两组**——引擎的 AgentStatus 只有
// spawning|thinking|working|idle|done,没有 askuser/todo 状态,留着会是假台词。
// 内景小人是 Pixi 动态位置,DOM 层拿不到逐帧坐标 → 取其 home anchor(roomLayout,
// 与 Room.tsx 同一份纯函数)换算成 % 弹气泡。台词随机仅限交互/定时装饰层,不进渲染
// 快照、不进断言路径;组件签名留 rng 供测试注入确定性随机 + fake timers。

// QUIPS 词库照抄原型,删 askuser/todo。CN/EN 双语按 uiLang 选(整词翻译,不入 DICT)。
const QUIPS_CN: Record<string, string[]> = {
  working: [
    "跑测试中…",
    "编译通过 ✓",
    "推进中…",
    "改 mapping.ts",
    "bun install…",
    "git add -A",
  ],
  thinking: ["让我想想…", "勘察源码…", "在读 README", "规划方案…"],
  done: ["收工 ✓", "搞定！", "已提交 PR"],
  error: ["出错了…", "重试中", "看下日志"],
  idle: ["摸鱼中…", "待命"],
};
const QUIPS_EN: Record<string, string[]> = {
  working: [
    "running tests…",
    "build passed ✓",
    "pushing on…",
    "editing mapping.ts",
    "bun install…",
    "git add -A",
  ],
  thinking: [
    "let me think…",
    "scanning source…",
    "reading README",
    "planning…",
  ],
  done: ["wrapped ✓", "done!", "PR submitted"],
  error: ["error…", "retrying", "checking logs"],
  idle: ["slacking off…", "standing by"],
};

interface QuipNpc {
  id: string;
  status: string;
  /** home anchor 换算后的 % 坐标(相对内景舞台)。 */
  x: number;
  y: number;
}

interface ActiveQuip {
  id: number;
  x: number;
  y: number;
  text: string;
}

export interface QuipOverlayProps {
  /** 注入确定性 rng(测试用);默认 Math.random。仅挑人 / 挑词 / 抖动周期,不进快照。 */
  rng?: () => number;
}

/** 周期随机挑一个在场 agent 弹 2.8s 台词气泡。无在场 agent → 不渲染、不起定时器。 */
export function QuipOverlay({ rng = Math.random }: QuipOverlayProps) {
  const lang = useSettingsStore((s) => s.uiLang);
  // 订阅当前会话(稳定引用),派生 agents 进 useMemo(zustand 铁律:selector 不构造新值)。
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );
  const agents: Agent[] = useMemo(
    () => (session ? Object.values(session.agents) : []),
    [session],
  );

  // home anchor 是 id 集合的纯函数;% = 坐标 / VW(VH)。agents 已是 useMemo 稳定引用
  // (只在会话切换 / agent 增删 / status 变化时换新),npcs 随之换新,下游 effect 据此重起。
  const npcs: QuipNpc[] = useMemo(() => {
    const lay = roomLayout(
      agents.map((a) => a.id),
      VW,
      VH,
    );
    return agents.map((a) => {
      const p = lay[a.id] ?? { x: VW / 2, y: VH / 2 };
      return {
        id: a.id,
        status: a.status,
        x: (p.x / VW) * 100,
        y: (p.y / VH) * 100,
      };
    });
  }, [agents]);

  const [quip, setQuip] = useState<ActiveQuip | null>(null);
  // rng / 词库经 ref 透传,避免把它们写进 effect 依赖导致循环重挂(均为稳定装饰源)。
  const npcsRef = useRef(npcs);
  npcsRef.current = npcs;
  const rngRef = useRef(rng);
  rngRef.current = rng;
  const dictRef = useRef(lang === "en" ? QUIPS_EN : QUIPS_CN);
  dictRef.current = lang === "en" ? QUIPS_EN : QUIPS_CN;

  useEffect(() => {
    if (npcs.length === 0) {
      setQuip(null);
      return;
    }
    let alive = true;
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const tick = () => {
      const list = npcsRef.current;
      if (list.length === 0) return;
      const r = rngRef.current;
      const n = list[Math.trunc(r() * list.length) % list.length];
      if (!n) return;
      const dict = dictRef.current;
      const pool = dict[n.status] ?? dict.working ?? [];
      const text = pool[Math.trunc(r() * pool.length) % pool.length] ?? "";
      setQuip({ id: Date.now(), x: n.x, y: n.y, text });
      t2 = setTimeout(() => {
        if (alive) setQuip(null);
      }, 2800);
      t1 = setTimeout(tick, 3600 + r() * 2600);
    };
    t1 = setTimeout(tick, 1400);
    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // npcs 变化(会话切换 / agent 增删改)时重起周期;位置 / 词库经 ref 读最新。
  }, [npcs]);

  if (!quip) return null;
  return (
    <div className="quip" style={{ left: `${quip.x}%`, top: `${quip.y}%` }}>
      <div className="quip-bubble cjk">{quip.text}</div>
    </div>
  );
}
