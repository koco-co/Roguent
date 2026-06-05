import { About } from "./About";
import { Account } from "./Account";
import { AgentCard } from "./AgentCard";
import { ButtonDock } from "./ButtonDock";
import { ChatDrawer } from "./ChatDrawer";
import { Currency } from "./Currency";
import { Hotbar } from "./Hotbar";
import { ImportPanel } from "./ImportPanel";
import { Leaderboard } from "./Leaderboard";
import { LimitBars } from "./LimitBars";
import { LootPanel } from "./LootPanel";
import { Minimap } from "./Minimap";
import { ModelPicker } from "./ModelPicker";
import { RosterCard } from "./RosterCard";
import { SessionBanner } from "./SessionBanner";
import { Settings } from "./Settings";
import { Shop } from "./Shop";
import { Skills } from "./Skills";
import { TaskWindow } from "./TaskWindow";
import { Tasks } from "./Tasks";
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

      {/* 内景左栈底部:实时任务窗(玻璃,mock 占位,自带绝对定位 + 内景 gate)*/}
      <TaskWindow />
      {/* 内景左下:小地图(真 agents,复用房间布局,自带绝对定位 + 内景 gate)*/}
      <Minimap />

      <AgentCard />
      <LootPanel />
      <ChatDrawer />
      <ModelPicker />
      {/* SkillGrid(legacy skillsOpen 浮层)已被 T3.3 Skills Modal 取代;
          文件 + skillsOpen 标志留待 T5 清理。这里改渲染新的 Skills。 */}
      <Skills />
      <ImportPanel />
      <Leaderboard />
      <About />
      {/* 账号(ACCOUNT)面板(plan/用量真;auth 按钮占位,自带 activePanel gate)*/}
      <Account />
      {/* 共享任务面板(整面板 mock 占位,自带 activePanel gate)*/}
      <Tasks />
      {/* 设置(CONFIG)面板(整面板 mock 占位,自带 activePanel gate)*/}
      <Settings />
      {/* 商店(SHOP)面板(整面板 mock 占位,自带 activePanel gate)*/}
      <Shop />
    </>
  );
}
