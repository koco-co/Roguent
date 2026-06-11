import { useSettingsStore } from "../settings-store";
import { useUiStore } from "../ui-store";
import { About } from "./About";
import { Account } from "./Account";
import { AgentCard } from "./AgentCard";
import { ButtonDock } from "./ButtonDock";
import { ChatDrawer } from "./ChatDrawer";
import { Currency } from "./Currency";
import { ErrorOverlay } from "./ErrorOverlay";
import { Hotbar } from "./Hotbar";
import { ImportPanel } from "./ImportPanel";
import { LangToggle } from "./LangToggle";
import { Leaderboard } from "./Leaderboard";
import { LimitBars } from "./LimitBars";
import { LootPanel } from "./LootPanel";
import { Market } from "./Market";
import { Minimap } from "./Minimap";
import { ModelPicker } from "./ModelPicker";
import { RosterCard } from "./RosterCard";
import { SessionBanner } from "./SessionBanner";
import { SessionGrid } from "./SessionGrid";
import { Settings } from "./Settings";
import { Shop } from "./Shop";
import { Skills } from "./Skills";
import { SystemMenu } from "./SystemMenu";
import { TaskWindow } from "./TaskWindow";
import { Tasks } from "./Tasks";
import { ViewSwitch } from "./ViewSwitch";
import { AchievementsPanel } from "./economy/AchievementsPanel";
import { GachaPanel } from "./economy/GachaPanel";
import { Icon, type IconName } from "./icons";
import { BoardPanel } from "./mailbox/BoardPanel";
import { MailboxPanel } from "./mailbox/MailboxPanel";
import { PairingPanelHost } from "./pairing/PairingPanel";

type AmbientKey =
  | "ambientGlow"
  | "ambientRain"
  | "ambientParticles"
  | "ambientSound";

const AMBIENT_TOGGLES: {
  key: AmbientKey;
  label: string;
  icon: IconName;
}[] = [
  { key: "ambientGlow", label: "辉光", icon: "crystal" },
  { key: "ambientRain", label: "雨幕", icon: "gem" },
  { key: "ambientParticles", label: "粒子", icon: "gear" },
  { key: "ambientSound", label: "声音", icon: "pause" },
];

function AmbientControls() {
  const inInterior = useUiStore((s) => s.view !== "overworld");
  const ambientGlow = useSettingsStore((s) => s.ambientGlow);
  const ambientRain = useSettingsStore((s) => s.ambientRain);
  const ambientParticles = useSettingsStore((s) => s.ambientParticles);
  const ambientSound = useSettingsStore((s) => s.ambientSound);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const values: Record<AmbientKey, boolean> = {
    ambientGlow,
    ambientRain,
    ambientParticles,
    ambientSound,
  };

  if (!inInterior) return null;

  return (
    <div className="panel ambient-controls" aria-label="ambient controls">
      <div className="ambient-head px">AMBIENCE</div>
      <div className="ambient-grid">
        {AMBIENT_TOGGLES.map((item) => {
          const on = values[item.key];
          return (
            <button
              key={item.key}
              type="button"
              role="switch"
              aria-checked={on}
              className={`ambient-toggle${on ? " on" : ""}`}
              onClick={() => setSetting(item.key, !on)}
              title={item.label}
            >
              <Icon name={item.icon} size={18} />
              <span className="ambient-label">{item.label}</span>
              <span className={`pxtoggle${on ? " on" : ""}`}>
                <span className="knob" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Hud() {
  return (
    <>
      <LimitBars />
      {/* 内景左上栈:在岗轮播卡(自带绝对定位,落在 LimitBars 下方)*/}
      <RosterCard />
      {/* 视图切换段(两视图都显示,落左上栈)*/}
      <ViewSwitch />
      {/* 界面语言切换(两视图都显示,落 ViewSwitch 下方)*/}
      <LangToggle />
      {/* 顶中会话横幅(仅内景显示,自带绝对定位)*/}
      <SessionBanner />

      {/* 顶右货币条(两视图都显示,自带绝对定位 top:12 right:12)*/}
      <Currency />

      {/* 顶右设置坞(两视图都显示,落 Currency 下方)*/}
      <ButtonDock />

      {/* 右下环境控制:本地 UI 偏好,驱动内景辉光 / 雨幕 / 粒子 / 声音状态。*/}
      <AmbientControls />

      {/* 底中操作坞(仅内景显示)*/}
      <Hotbar />

      {/* 内景左栈底部:实时任务窗(玻璃,真数据 sessionTodos,自带绝对定位 + 内景 gate)*/}
      <TaskWindow />
      {/* 内景左下:小地图(真 agents,复用房间布局,自带绝对定位 + 内景 gate)*/}
      <Minimap />

      <AgentCard />
      <LootPanel />
      <ChatDrawer />
      <MailboxPanel />
      <BoardPanel />
      <AchievementsPanel />
      <PairingPanelHost />
      <ModelPicker />
      <Skills />
      <ImportPanel />
      <Leaderboard />
      {/* 全会话总览(真数据:会话列表/进入/导入/error 角标;由大厅中央任务台 E 键触发,自带 activePanel gate)*/}
      <SessionGrid />
      <About />
      {/* 账号(ACCOUNT)面板(plan/用量真;auth 按钮占位,自带 activePanel gate)*/}
      <Account />
      {/* 共享任务面板(整面板 mock 占位,自带 activePanel gate)*/}
      <Tasks />
      {/* 设置(CONFIG)面板(整面板 mock 占位,自带 activePanel gate)*/}
      <Settings />
      {/* 装饰商店(SHOP)面板(gem 余额/已拥有为真,购买 mock;自带 activePanel gate)*/}
      <Shop />
      {/* 插件市场(MARKET)面板(整面板 mock + banner,自带 activePanel gate)*/}
      <Market />
      {/* 扭蛋机(GACHA)面板(真实 gem ledger 驱动,自带 activePanel gate)*/}
      <GachaPanel />
      {/* 系统 / 暂停菜单(全屏 scrim 覆盖层,自带 activePanel gate;menu→此组件)*/}
      <SystemMenu />
      {/* runtime 离线错误层(全屏 scrim,自带 activePanel gate;触发待 T4.3)*/}
      <ErrorOverlay />
    </>
  );
}
