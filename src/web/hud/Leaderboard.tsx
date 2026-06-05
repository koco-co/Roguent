import { useState } from "react";
import { ORCHESTRATOR_HERO, roleToHero } from "../../shared/mapping";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { HeroPortrait } from "./HeroPortrait";
import { Modal } from "./Modal";
import {
  type AggRow,
  type LeaderboardRow,
  leaderboardByModel,
  leaderboardByRuntime,
  leaderboardRows,
} from "./leaderboard-rows";
import { shortModel } from "./widgets";

/**
 * 排行榜面板 Leaderboard(对标设计原型 panels1.jsx 的 Leaderboard):
 * 三页签(按会话 / 按模型 / 按 runtime)+ 领奖台(podium)+ 排行行。
 *
 * **真假分明**:
 * - **按会话**:真——`leaderboardRows(sessions)` 取全部会话 usage.tokens 降序。
 * - **按模型**:真聚合——`leaderboardByModel` 同模型会话 tokens/cost 求和。
 * - **按 runtime**:Claude 行真聚合(全部会话求和);Codex 行为**占位**(0、置灰、标注),
 *   引擎暂未接入第二 runtime。
 *
 * activePanel gate 的 return null 放在所有 hooks 之后(React hooks 规则)。
 * selector 守铁律:只取稳定的 sessions map 引用 / activePanel 基元 / closePanel 稳定函数;
 * 聚合在 render 体里用纯函数算,不在 selector 里建数组。
 */

// 领奖台奖牌色(金 / 银 / 铜),按 place(冠/亚/季)取。
const MEDALS = ["#f2c84b", "#cfd6dd", "#cd7f32"] as const;

export function Leaderboard() {
  const active = useUiStore((s) => s.activePanel === "leaderboard");
  const closePanel = useUiStore((s) => s.closePanel);
  const sessions = useRoomStore((s) => s.sessions);
  const [tab, setTab] = useState<"session" | "model" | "runtime">("session");

  if (!active) return null;

  // 按页签取数据(纯函数,在 render 体里算)。session 页签是 LeaderboardRow(带
  // sessionId/archived),model/runtime 页签是 AggRow。
  const sessionRows = tab === "session" ? leaderboardRows(sessions) : [];
  const aggRows: AggRow[] =
    tab === "model"
      ? leaderboardByModel(sessions)
      : tab === "runtime"
        ? leaderboardByRuntime(sessions)
        : [];
  const rows: Array<LeaderboardRow | AggRow> =
    tab === "session" ? sessionRows : aggRows;
  const max = Math.max(...rows.map((r) => r.tokens), 1);

  // 领奖台:仅按会话页签且前三可用时渲染(渲染序 [1,0,2] = 银/金/铜视觉)。
  const showPodium = tab === "session" && sessionRows.length >= 3;

  return (
    <Modal
      title="LEADERBOARD"
      sub="按 token 降序"
      icon="trophy"
      width={1080}
      onClose={closePanel}
    >
      <div className="lb-wrap">
        {/* 三页签 */}
        <div className="tabs">
          <button
            type="button"
            className={`tab${tab === "session" ? " on" : ""}`}
            onClick={() => setTab("session")}
          >
            按会话
          </button>
          <button
            type="button"
            className={`tab${tab === "model" ? " on" : ""}`}
            onClick={() => setTab("model")}
          >
            按模型
          </button>
          <button
            type="button"
            className={`tab${tab === "runtime" ? " on" : ""}`}
            onClick={() => setTab("runtime")}
          >
            按 runtime
          </button>
        </div>

        {/* 领奖台(仅会话页签且 ≥3 行) */}
        {showPodium && (
          <div className="podium">
            {[1, 0, 2].map((idx) => {
              const r = sessionRows[idx];
              if (!r) return null;
              const place = idx + 1; // 1=金 2=银 3=铜
              const medal = MEDALS[idx];
              return (
                <div key={r.sessionId} className={`pod-col pod-${place}`}>
                  <div
                    className="pod-portrait"
                    style={{ boxShadow: `0 0 0 3px ${medal}` }}
                  >
                    <HeroPortrait
                      sessionId={r.sessionId}
                      size={58}
                      className={idx === 0 ? "champ" : ""}
                    />
                  </div>
                  <div className="pod-name">{r.title}</div>
                  <div className="pod-tok px" style={{ color: medal }}>
                    {(r.tokens / 1000).toFixed(0)}k
                  </div>
                  <div className="pod-base px" style={{ background: medal }}>
                    {place}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 排行行 */}
        {rows.length === 0 ? (
          <div className="faint">暂无会话</div>
        ) : (
          <div className="lb-rows">
            {rows.map((r, i) => {
              // session 行才有 sessionId/archived;用 "sessionId" in r 收窄类型。
              const isSession = "sessionId" in r;
              const archived = isSession && r.archived;
              const isCodex = !isSession && r.key === "codex";
              const key = isSession ? r.sessionId : r.key;
              return (
                <div
                  key={key}
                  className={`lb-rrow${archived ? " arch" : ""}`}
                  style={isCodex ? { filter: "grayscale(1) opacity(.55)" } : {}}
                >
                  <div className="lb-rank px">{i + 1}</div>
                  <div className="lb-portrait">
                    {isSession ? (
                      <HeroPortrait
                        sessionId={r.sessionId}
                        size={30}
                        className=""
                      />
                    ) : tab === "model" ? (
                      <HeroPortrait
                        sessionId=""
                        hero={roleToHero(r.model)}
                        size={30}
                        className=""
                      />
                    ) : (
                      <HeroPortrait
                        sessionId=""
                        hero={isCodex ? "lizard_m" : ORCHESTRATOR_HERO}
                        size={30}
                        className=""
                      />
                    )}
                  </div>
                  <div className="lb-rtitle">{r.title}</div>
                  <div className="lb-bar">
                    <div
                      className="lb-barfill"
                      style={{ width: `${(r.tokens / max) * 100}%` }}
                    />
                    <span className="lb-barv px">
                      {r.tokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="lb-cost px">${r.cost.toFixed(1)}</div>
                  <div className="chip px">
                    {tab === "runtime" ? r.model : shortModel(r.model)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Codex 占位标注(仅 runtime 页签) */}
        {tab === "runtime" && (
          <div className="faint" style={{ fontSize: 11, marginTop: 12 }}>
            Codex 为占位 · 引擎暂未接入(0)
          </div>
        )}
      </div>
    </Modal>
  );
}
