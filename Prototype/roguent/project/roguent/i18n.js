/* ROGUENT i18n — global string translator.
   window.__LANG is set by App ('cn' | 'en'). T(cn) returns the EN string in
   English mode, or the original Chinese in 中文 mode. Product / game terms
   (Claude, Codex, askuser, compact, Token, Context, Usage, Weekly, model names,
   slash commands, runtime, MCP, diff, PR, CI …) are intentionally NOT in the
   dictionary — they stay English in BOTH languages, giving a clean CN/EN border. */
(function(){
  window.__LANG = 'cn';

  const DICT = {
    // ── view / nav ──────────────────────────────────────────────
    '内景':'Room', '大厅':'Lobby',
    // ── generic actions / buttons ───────────────────────────────
    '进入':'Enter', '聊天':'Chat', '归档':'Archive', '删除':'Delete',
    '确认删除？':'Confirm delete?', '安装':'Install', '已拥有':'Owned',
    '登出':'Log out', '回应':'Reply', '打开原文':'Open source', '进入会话':'Open session',
    '未读':'unread', '+ 添加 X 博主 / GitHub 仓库':'+ Add X author / GitHub repo',
    '转发到配对 IM':'Forward to IM', '查看 diff':'View diff', '拉取到本地':'Pull local',
    '导入':'Import', '保存':'Save', '发送':'Send', '返回':'Back',
    '继续游戏':'Resume', '账号 · 订阅':'Account · Plan', 'runtime 管理':'Manage runtime',
    '保存 / 导出会话':'Save / Export session', '选择一封信件':'Select a message',
    '当前':'Current', '通用':'Universal', '查看更新':'View update',
    '还原':'Reset', '未保存':'Unsaved', '已保存':'Saved', '+ 添加自定义配置':'+ Add custom config',
    '检查更新':'Check update', '已安装':'Installed', '立即更新 v1.0':'Update to v1.0',
    '立即更新 v1.0':'Update to v1.0', '已是最新':'Up to date', '去做任务':'Open Tasks',
    '打开公告板':'Open Board', '领取今日奖励':'Claim today', '今日不再提示':"Don't show today",
    '一键领取':'Claim all', '全部已领':'All claimed',
    '今日':'Today', '查看':'View', '稍后':'Later',
    '签到':'Check-in', '公告':'Board', '限时':'Limited', '版本':'Release',
    '来自订阅源 · askuser · CI · 用量':'From feeds · askuser · CI · usage',
    '打开邮箱':'Open Mailbox', '查看 askuser':'View askuser',
    '掉落':'drop', '已配对设备':'Paired devices', '转发开':'Forwarding', '已暂停':'Paused',
    '进入房间':'Enter room', '小队':'Squad', '正在思考':'Thinking',
    '主控':'Lead',
    // ── modal subtitles ─────────────────────────────────────────
    '会话档案':'Session profile',
    '共享任务清单 · agent teams':'Shared task list · agent teams',
    '法术书 · slash 命令 & skills':'Spellbook · slash commands & skills',
    '按 token 降序':'Sorted by token desc',
    '插件市场 + 道具店':'Plugin market + item shop',
    '本会话产出 loot':"This session's loot",
    '切换会话模型':'Switch session model',
    '导入本地会话':'Import local sessions',
    '个人详情 · 订阅与用量':'Profile · plan & usage',
    '版本与更新日志':'Version & changelog',
    '关于 Roguent':'About Roguent',
    '成就殿 · vibe-coding 里程碑':'Achievements · vibe-coding milestones',
    '订阅信箱 · X 博主 + GitHub 仓库监控':'Subscriptions · X authors + GitHub repos',
    '商店旁的扭蛋机 · 纯外观彩蛋':'Gacha · cosmetic only',
    '扫码配对 · 微信 / 飞书消息互转':'Pairing · WeChat / Feishu relay',
    '大厅公告板 · 今日动态':"Board · today's activity",
    // ── section headers / small labels ──────────────────────────
    '在岗':'On duty', '会话产出':'Session loot', '扭蛋记录':'Gacha log',
    '项目':'Project', '模型':'Model', '模式':'Mode', '状态':'Status',
    '子智能体':'Subagents', '花费':'Cost', '待你回应':'Needs you',
    '继承全局 (20%)':'Inherit global (20%)', '局部覆盖':'Override',
    '跟随设置面板的全局默认（Opus 20%）。':'Follows the global default (Opus 20%).',
    '此 NPC 单独生效，优先级高于全局。':'Applies to this NPC only — overrides global.',
    '滚动 5 小时窗口':'rolling 5-hour window', '每周一 00:00 重置':'resets Mon 00:00',
    '剩余':'left', '已用':'used', '计划':'plan',
    '已暂存':'Staged', '已修改':'Modified', '未跟踪':'Untracked', '冲突':'Conflicts',
    '相对':'vs', 'stash 数量':'stashes',
    '扫描到的本地 Claude Code 项目：':'Local Claude Code projects found:',
    '会话':'sessions', '选择一个角色 · 开始本地 vibe coding':'Pick a hero · start local vibe coding',
    // ── status words ────────────────────────────────────────────
    '工作中':'Working', '思考':'Thinking', '待回应':'Needs you', '待办':'To-do',
    '待命':'Idle', '完成':'Done', '出错':'Error', '压缩中':'Compacting',
    '进行中':'In progress', '待领':'Pending', '待领取':'Pending',
    '待认领':'Unclaimed', '阻塞中':'Blocked', '等用户':'Awaiting user',
    '归属':'Owner', '依赖':'Deps', '无':'none', '状态时间线':'Status timeline',
    '认领任务':'Claim task', '认领':'Claim', '选择一个任务':'Select a task',
    '信箱 · inter-agent':'Mailbox · inter-agent', '阻塞':'Blocked',
    '选择一个角色 · 开始本地 vibe coding':'Pick a hero · start local vibe coding',
    'orchestrator':'orchestrator', 'subagent':'subagent',
    // ── tabs ────────────────────────────────────────────────────
    '信箱 · inter-agent':'Mailbox · inter-agent', '阻塞':'Blocked',
    '待认领':'Unclaimed',
    '按会话':'By session', '按模型':'By model', '按 runtime':'By runtime',
    '插件市场':'Plugin market', '道具店':'Item shop',
    '已安装':'Installed', '插件':'Plugins', '搜索…':'Search…', '安装':'Install',
    '导入会话':'Import session', '外观 / 主题':'Appearance / Theme', '退出':'Exit',
    '指挥台':'Command deck', '点击任意处继续':'Click anywhere to continue',
    '扭蛋战利品 · 外观':'Gacha loot · cosmetic', '本会话产出 loot':"This session's loot",
    '全部信件':'All mail', 'X 博主动态':'X feed', 'GitHub 监控':'GitHub watch',
    '订阅源管理':'Subscriptions', '已解锁':'Unlocked', '进度中':'In progress',
    '普通':'Common', '稀有':'Rare', '史诗':'Epic', '传说':'Legendary',
    '已解锁成就':'Unlocked', '系统':'System',
    '全部':'All',
    // ── login / boot ────────────────────────────────────────────
    '像素指挥台 · 本地 Claude Code 双 runtime 调度':'Pixel command deck · local Claude Code dual-runtime',
    '‹ › 切换角色 · 点击角色框直接进入 · 随时可在设置中切换主角色':'‹ › switch hero · click frame to enter · change anytime in Settings',
    '正在召集小队…':'Summoning the squad…',
    '普通模式下有一定概率遇到精英首领':'Elite bosses may appear in normal runs',
    '聚焦中…':'Focusing…', '暂停 · 点击继续':'Paused · click to resume',
    // ── menu items ──────────────────────────────────────────────
    '设置祭坛':'Config Altar', '成就殿':'Achievements Hall', '邮箱':'Mailbox',
    '排行榜':'Ranking', '公告板':'Board', '任务台':'Quest Console',
    '商店':'Shop', '装饰商店':'Decoration shop', '插件市场':'Plugin market',
    '扭蛋机':'Gacha', 'Claude 项目':'Claude projects', 'Codex 项目':'Codex projects',
    '活动':'Events', '设置':'Settings', '账号':'Account', '菜单':'Menu', '配对':'Pairing', '暂停':'Pause',
    // ── hero names ──────────────────────────────────────────────
    '骑士':'Knight', '法师':'Wizard', '精灵':'Elf', '蜥蜴人':'Lizardman',
    '女骑士':'Valkyrie', '矮人':'Dwarf', '女法师':'Sorceress', '游侠':'Ranger',
    // ── misc chrome ─────────────────────────────────────────────
    '召唤你的第一个小队':'Summon your first squad',
    '空无一人':'No one here', '召唤你的第一个小队，开始 vibe coding':'Summon your first squad and start vibe coding', '召唤小队':'Summon squad',
    '撸一下':'pet me', '宝箱':'chest', '许愿':'make a wish',
    '查看个人详情 · 5h / Weekly 用量':'View profile · 5h / Weekly usage',
    '查看 5h / Weekly 用量':'View 5h / Weekly usage',
  };

  // composite-string handlers (prefix-based) for dynamic strings
  function T(s){
    if(window.__LANG!=='en') return s;
    if(s==null) return s;
    if(DICT[s]!=null) return DICT[s];
    // dynamic: "进入 X · Y"
    if(typeof s==='string'){
      if(s.indexOf('选 ')===0 && s.indexOf('开始 Vibe Coding')>=0){
        const nm=s.slice(2).split(' · ')[0];
        return 'Play '+(DICT[nm]||nm)+' · Start Vibe Coding';
      }
      if(s.indexOf('进入 ')===0) return 'Enter '+s.slice(3);
    }
    return s;
  }
  window.T = T;
  // convenience: pick CN or EN inline
  window.TL = (cn,en)=> window.__LANG==='en' ? en : cn;
})();
