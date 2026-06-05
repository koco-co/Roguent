import { About } from "./About";
import { AgentCard } from "./AgentCard";
import { ButtonDock } from "./ButtonDock";
import { ChatDrawer } from "./ChatDrawer";
import { Currency } from "./Currency";
import { Hotbar } from "./Hotbar";
import { ImportPanel } from "./ImportPanel";
import { Leaderboard } from "./Leaderboard";
import { LimitBars } from "./LimitBars";
import { LootPanel } from "./LootPanel";
import { ModelPicker } from "./ModelPicker";
import { RosterCard } from "./RosterCard";
import { SessionBanner } from "./SessionBanner";
import { SkillGrid } from "./SkillGrid";
import { ViewSwitch } from "./ViewSwitch";

// InfoPopover(原 gear→infoOpen 触发的会话信息浮层)在 T2.4 失去触发入口:新 ButtonDock
// 的 gear 改开 settings(T3.5)。组件文件暂保留待 T5 清理,这里先不渲染——它的内容由
// T3.5 Settings 取代。infoOpen 布尔标志同步留在 ui-store 待收尾。

export function Hud() {
  return (
    <>
      <LimitBars />
      {/* 内景左上栈:在岗轮播卡(自带绝对定位,落在 LimitBars 下方)*/}
      <RosterCard />
      {/* 视图切换段(两视图都显示,落左上栈)*/}
      <ViewSwitch />
      {/* 顶中会话横幅(仅内景显示,自带绝对定位)*/}
      <SessionBanner />

      {/* 顶右货币条(两视图都显示,自带绝对定位 top:12 right:12)*/}
      <Currency />

      {/* 顶右设置坞(两视图都显示,落 Currency 下方)*/}
      <ButtonDock />

      {/* 底中操作坞(仅内景显示)*/}
      <Hotbar />

      <AgentCard />
      <LootPanel />
      <ChatDrawer />
      <ModelPicker />
      <SkillGrid />
      <ImportPanel />
      <Leaderboard />
      <About />
    </>
  );
}
