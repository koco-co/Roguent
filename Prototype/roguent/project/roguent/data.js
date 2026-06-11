/* ROGUENT mock data — real-concept → game-metaphor mapping (brief §5). */
(function(){
  // ---- the active session's room roster (interior screen) ----
  // status: working | thinking | askuser | todo | idle | done | error | compacting
  // tool: read | write | bash | search | task | mcp
  const room = {
    sessionTitle:'roguent-web · 大厅重构',
    project:'roguent',
    model:'Opus 4.8',
    runtime:'claude',
    npcs:[
      {id:'orc', name:'Orchestrator', role:'主控', hero:'knight_m', orchestrator:true,
       runtime:'claude', status:'working', tool:'task', util:18, model:'Opus 4.8',
       tokens:182400, cost:4.86, threshold:20, inherit:false, x:50, y:42, facing:1,
       sub:{working:3,thinking:1,idle:1,askuser:1}},
      {id:'mage', name:'Surveyor', role:'subagent · 代码勘察', hero:'wizzard_m',
       runtime:'claude', status:'thinking', tool:null, util:64, model:'Sonnet 4.6',
       tokens:88200, cost:1.12, threshold:null, inherit:true, x:30, y:55, facing:1},
      {id:'elf', name:'Scribe', role:'subagent · 文档', hero:'elf_f',
       runtime:'claude', status:'askuser', tool:null, util:41, model:'Sonnet 4.6',
       tokens:51900, cost:0.74, threshold:null, inherit:true, x:68, y:36, facing:-1,
       ask:'要把 README 的安装段落改成 bun 还是保留 npm？'},
      {id:'liz', name:'Tinker', role:'subagent · 构建', hero:'lizard_m',
       runtime:'claude', status:'todo', tool:null, util:33, model:'Haiku 4.5',
       tokens:22100, cost:0.18, threshold:null, inherit:true, x:74, y:60, facing:-1,
       todoCount:2},
      {id:'kf', name:'Warden', role:'subagent · 测试', hero:'knight_f',
       runtime:'claude', status:'working', tool:'bash', util:88, model:'Opus 4.8',
       tokens:201500, cost:5.34, threshold:20, inherit:false, x:42, y:68, facing:1,
       compacting:false},
      {id:'dwf', name:'Quartermaster', role:'subagent · 依赖', hero:'dwarf_m',
       runtime:'claude', status:'done', tool:null, util:9, model:'Haiku 4.5',
       tokens:8800, cost:0.07, threshold:null, inherit:true, x:22, y:38, facing:1},
    ],
    pet:{hero:null, kind:'cat', x:46, y:50},
    // detailed git state for the interior top frame
    git:{
      branch:'feat/lobby-rework', upstream:'origin/feat/lobby-rework', ahead:7, behind:1,
      staged:5, unstaged:3, untracked:2, conflicts:0, stashes:1,
      lastCommit:{hash:'a3f9c21', msg:'feat(camera): 整数倍贴身跟随', when:'12m'},
      files:[
        {path:'src/camera.ts', x:'M ', staged:true},
        {path:'src/mapping.ts', x:'M ', staged:true},
        {path:'src/hud/StatusSlot.tsx', x:'A ', staged:true},
        {path:'README.md', x:' M', staged:false},
        {path:'bun.lock', x:' M', staged:false},
        {path:'src/minimap.ts', x:'??', staged:false},
      ],
      clean:false,
    },
    loot:[{x:58,y:48,kind:'chest'},{x:36,y:30,kind:'flask'}],
  };

  // ---- account usage (left bars) ----
  const account = {
    name:'指挥官 Orc', handle:'orc@roguent', level:47, hero:'knight_m',
    plan:'Max', fiveH:{used:58, resetIn:'2h 13m'}, week:{used:73, resetIn:'4d 6h'},
    selectedCtx:88, // active context-window fill → 头像经验条
  };

  const currency = { tokens:'1.28M', tokensRaw:1284900, gems:14099, completed:37 };

  // ---- shared task list (brief §6.9) ----
  const tasks = [
    {id:'t1', title:'重构大厅相机缩放逻辑', state:'in-progress', owner:'orc', model:'Opus 4.8', deps:[], runtime:'claude', desc:'让整数倍缩放贴身跟随主控，进出房间平滑过渡。'},
    {id:'t2', title:'勘察 mapping.ts 英雄池', state:'completed', owner:'mage', model:'Sonnet 4.6', deps:[], runtime:'claude', desc:'梳理 HERO_POOL / ORCHESTRATOR_HERO 的稳定哈希分配。'},
    {id:'t3', title:'重绘 NPC 头顶状态槽', state:'in-progress', owner:'kf', model:'Opus 4.8', deps:['t2'], runtime:'claude', desc:'askuser ❓ 最高优先，工具气泡随调用切换。'},
    {id:'t4', title:'接 TodoWrite → 任务面板实时同步', state:'pending', owner:null, model:'—', deps:['t1','t3'], runtime:'claude', desc:'聚合各会话待办 + agent team 共享清单。'},
    {id:'t5', title:'写大厅空态引导文案', state:'pending', owner:'elf', model:'Sonnet 4.6', deps:['t1'], runtime:'claude', desc:'“召唤你的第一个小队”引导。'},
    {id:'t6', title:'更新 README 安装步骤', state:'pending', owner:'elf', model:'Sonnet 4.6', deps:[], runtime:'claude', desc:'等待用户确认 bun / npm。', blockedByUser:true},
    {id:'t7', title:'依赖审计 bun.lock', state:'completed', owner:'dwf', model:'Haiku 4.5', deps:[], runtime:'claude', desc:'校验锁文件无幽灵依赖。'},
  ];
  const mailbox = [
    {from:'mage', to:'orc', text:'勘察完成，HERO_POOL 有 8 个稳定皮肤。'},
    {from:'orc', to:'kf', text:'状态槽优先级按 §6.6，askuser 置顶。'},
    {from:'kf', to:'orc', text:'测试套件 88% 上下文，接近阈值，请求压缩。'},
    {from:'dwf', to:'orc', text:'bun.lock 无异常，依赖审计通过。'},
  ];

  // ---- skills / slash commands (spellbook) ----
  const skills = [
    {id:'compact', name:'/compact', icon:'compact', desc:'压缩当前上下文并续跑', unlocked:true, rarity:'common'},
    {id:'review', name:'/review', icon:'search', desc:'对当前 diff 做代码审查', unlocked:true, rarity:'common'},
    {id:'test', name:'/test', icon:'bash', desc:'运行测试套件并汇总失败', unlocked:true, rarity:'common'},
    {id:'plan', name:'/plan', icon:'quest', desc:'生成多步任务计划', unlocked:true, rarity:'rare'},
    {id:'team', name:'/team', icon:'account', desc:'召集 agent team 协作', unlocked:true, rarity:'rare'},
    {id:'doc', name:'/docs', icon:'read', desc:'生成或更新文档', unlocked:true, rarity:'common'},
    {id:'commit', name:'/commit', icon:'write', desc:'生成提交信息并提交', unlocked:true, rarity:'common'},
    {id:'mcp', name:'/mcp', icon:'mcp', desc:'连接 MCP 工具服务器', unlocked:true, rarity:'rare'},
    {id:'refactor', name:'/refactor', icon:'task', desc:'跨文件安全重构', unlocked:false, rarity:'epic'},
    {id:'bench', name:'/bench', icon:'trophy', desc:'性能基准回归', unlocked:false, rarity:'epic'},
    {id:'migrate', name:'/migrate', icon:'import', desc:'数据/schema 迁移向导', unlocked:false, rarity:'rare'},
    {id:'oracle', name:'/oracle', icon:'crystal', desc:'调用更强模型做疑难推理', unlocked:false, rarity:'legendary'},
  ];

  // ---- plugin market (real) ----
  const plugins = [
    {id:'p1', name:'github-mcp', author:'anthropic', cat:'MCP', icon:'mcp', stars:4.9, installs:'52k', desc:'GitHub 仓库、PR、issue 的 MCP 服务器。', owned:true, runtime:'both'},
    {id:'p2', name:'playwright-skill', author:'community', cat:'Skills', icon:'search', stars:4.7, installs:'31k', desc:'浏览器自动化与端到端测试技能。', owned:false, runtime:'claude'},
    {id:'p3', name:'postgres-mcp', author:'community', cat:'MCP', icon:'crystal', stars:4.6, installs:'28k', desc:'安全只读/读写 Postgres 查询。', owned:false, runtime:'both'},
    {id:'p4', name:'figma-bridge', author:'studio', cat:'插件', icon:'shop', stars:4.4, installs:'12k', desc:'把 Figma 选区导入为组件草图。', owned:false, runtime:'claude'},
    {id:'p5', name:'commit-lint', author:'community', cat:'Skills', icon:'write', stars:4.8, installs:'40k', desc:'提交信息规范化与校验技能。', owned:true, runtime:'both'},
    {id:'p6', name:'sentry-mcp', author:'sentry', cat:'MCP', icon:'error', stars:4.5, installs:'19k', desc:'拉取错误分组与堆栈，定位回归。', owned:false, runtime:'both'},
  ];
  // ---- item shop (gems, cosmetic only) ----
  const items = [
    {id:'i1', name:'森林房间皮肤', cat:'房间', icon:'quest', price:1200, owned:false, accent:'#5fd35f'},
    {id:'i2', name:'赛博地砖', cat:'房间', icon:'crystal', price:1800, owned:false, accent:'#36c5e0'},
    {id:'i3', name:'黑猫伙伴', cat:'宠物', icon:'account', price:600, owned:true, accent:'#a06cd5'},
    {id:'i4', name:'史莱姆伙伴', cat:'宠物', icon:'bash', price:900, owned:false, accent:'#5fd35f'},
    {id:'i5', name:'忍者皮肤', cat:'皮肤', icon:'task', price:1500, owned:false, accent:'#ff4d6d'},
    {id:'i6', name:'黄金边框', cat:'UI', icon:'trophy', price:2400, owned:false, accent:'#f2c84b'},
    {id:'i7', name:'霓虹字体', cat:'UI', icon:'write', price:800, owned:false, accent:'#36c5e0'},
    {id:'i8', name:'扭蛋：随机皮肤', cat:'扭蛋', icon:'gemcur', price:500, owned:false, accent:'#ff4d6d', gacha:true},
  ];

  // ---- leaderboard (all sessions by token) ----
  const leaderboard = [
    {id:'l1', title:'roguent-web · 大厅重构', hero:'knight_m', tokens:1284900, cost:32.4, model:'Opus 4.8', runtime:'claude'},
    {id:'l2', title:'api-gateway · 限流重写', hero:'wizzard_m', tokens:902300, cost:21.1, model:'Opus 4.8', runtime:'claude'},
    {id:'l3', title:'mobile · 离线缓存', hero:'elf_m', tokens:651200, cost:9.8, model:'Sonnet 4.6', runtime:'claude'},
    {id:'l4', title:'infra · k8s 迁移', hero:'lizard_m', tokens:498700, cost:7.4, model:'Sonnet 4.6', runtime:'claude'},
    {id:'l5', title:'docs · 国际化', hero:'dwarf_f', tokens:312000, cost:2.6, model:'Haiku 4.5', runtime:'claude'},
    {id:'l6', title:'data · ETL 重构', hero:'knight_f', tokens:208400, cost:3.1, model:'Opus 4.8', runtime:'claude', archived:true},
    {id:'l7', title:'payments · 对账脚本', hero:'lizard_f', tokens:543800, cost:6.2, model:'gpt-5-codex', runtime:'codex'},
    {id:'l8', title:'cli · 参数解析重构', hero:'goblin', tokens:271500, cost:2.9, model:'gpt-5', runtime:'codex'},
  ];

  // ---- lobby overview (projects = rooms) ----
  const lobby = [
    {id:'r1', project:'roguent', sessions:6, accent:'#36c5e0', status:'active', runtime:'claude', heroes:['knight_m','wizzard_m','elf_f','lizard_m'], askuser:1},
    {id:'r2', project:'api-gateway', sessions:3, accent:'#a06cd5', status:'active', runtime:'claude', heroes:['wizzard_f','dwarf_m'], askuser:0},
    {id:'r3', project:'mobile', sessions:2, accent:'#5fd35f', status:'idle', runtime:'claude', heroes:['elf_m'], askuser:0},
    {id:'r4', project:'infra', sessions:4, accent:'#f2c84b', status:'active', runtime:'claude', heroes:['lizard_m','knight_f','goblin'], askuser:2},
    {id:'r5', project:'payments', sessions:3, accent:'#5fd35f', status:'active', runtime:'codex', heroes:['lizard_f','dwarf_f'], askuser:1},
    {id:'r6', project:'cli-tools', sessions:2, accent:'#5fd35f', status:'idle', runtime:'codex', heroes:['goblin','elf_m'], askuser:0},
  ];

  // ---- settings schema (grouped, with tooltips) ----
  const settingsGroups = [
    {id:'general', name:'通用 General', icon:'gear', items:[
      {k:'model', label:'默认模型 model', type:'select', val:'Opus 4.8', opts:['Opus 4.8','Sonnet 4.6','Haiku 4.5'], tip:'新会话默认使用的模型。'},
      {k:'outputStyle', label:'输出风格 outputStyle', type:'select', val:'default', opts:['default','concise','explanatory'], tip:'回复的详略与口吻。'},
      {k:'language', label:'回复语言 language', type:'select', val:'跟随系统', opts:['跟随系统','中文','English'], tip:'模型回复使用的语言。'},
      {k:'effortLevel', label:'推理强度 effortLevel', type:'radio', val:'high', opts:['low','medium','high','max','ultra'], tip:'跟随 Claude Code 的推理档位；Max / Ultra 为订阅计划额外解锁的更高强度，更慢但更准。'},
      {k:'alwaysThinking', label:'默认深度思考 alwaysThinkingEnabled', type:'toggle', val:true, tip:'每轮默认启用扩展思考。'},
    ]},
    {id:'ui', name:'界面 Interface', icon:'menu', items:[
      {k:'uiLang', label:'界面语言 uiLanguage', type:'radio', val:'中文', opts:['中文','English'], tip:'切换界面文案语言。Claude / Codex / askuser / compact 等产品术语与模型名保持不变。'},
      {k:'uiFont', label:'字体 fontFamily', type:'radio', val:'像素', opts:['像素','系统','等宽'], tip:'界面字体：像素（Fusion Pixel）、系统无衬线、或等宽。英文/数字始终用像素字体。'},
      {k:'theme', label:'主题 theme', type:'select', val:'地牢深青', opts:['地牢深青','城镇暖棕','暗夜'], tip:'面板与世界的整体配色。'},
      {k:'editorMode', label:'编辑模式 editorMode', type:'radio', val:'normal', opts:['normal','vim'], tip:'输入框的键位模式。'},
      {k:'viewMode', label:'视图 viewMode', type:'radio', val:'default', opts:['default','verbose','focus'], tip:'信息密度。'},
      {k:'autoScroll', label:'自动滚动 autoScrollEnabled', type:'toggle', val:true, tip:'新输出时自动滚到底部。'},
      {k:'reducedMotion', label:'减少动效 prefersReducedMotion', type:'toggle', val:false, tip:'关闭闪烁与粒子。'},
    ]},
    {id:'compact', name:'上下文压缩 Compaction', icon:'compact', items:[]}, // special-rendered §6.8
    {id:'ambiance', name:'氛围 Ambiance', icon:'crystal', items:[]}, // special-rendered (live world FX)
    {id:'perm', name:'权限 Permissions', icon:'gem', items:[
      {k:'defaultMode', label:'默认模式 defaultMode', type:'radio', val:'ask', opts:['ask','auto','strict'], tip:'工具调用的默认审批策略。'},
      {k:'additionalDirectories', label:'附加目录 additionalDirectories', type:'list', val:['~/work/shared'], tip:'允许访问的额外目录。'},
    ]},
    {id:'team', name:'Agent / 团队', icon:'account', items:[
      {k:'agentTeams', label:'实验性团队 EXPERIMENTAL_AGENT_TEAMS', type:'toggle', val:true, tip:'开启 agent teams 协作机制。'},
      {k:'teammateMode', label:'队友模式 teammateMode', type:'radio', val:'in-process', opts:['auto','in-process','tmux'], tip:'队友进程的运行方式。'},
      {k:'teammateModel', label:'默认队友模型', type:'select', val:'Sonnet 4.6', opts:['Opus 4.8','Sonnet 4.6','Haiku 4.5'], tip:'subagent 默认模型。'},
    ]},
    {id:'mcp', name:'MCP 服务器', icon:'mcp', items:[
      {k:'enableAllProjectMcp', label:'启用项目内全部 MCP', type:'toggle', val:false, tip:'自动启用 .mcp.json 中的服务器。'},
      {k:'enabledMcp', label:'已启用 enabledMcpjsonServers', type:'list', val:['github-mcp','commit-lint'], tip:'白名单服务器。'},
    ]},
    {id:'skills', name:'技能 / 插件', icon:'spellbook', items:[
      {k:'skillOverrides', label:'技能覆盖 skillOverrides', type:'radio', val:'on', opts:['on','name-only','off'], tip:'技能注入策略。'},
      {k:'disableSkillShell', label:'禁用技能 shell 执行', type:'toggle', val:false, tip:'安全：禁止技能执行 shell。'},
    ]},
    {id:'hooks', name:'Hooks', icon:'task', items:[
      {k:'hooks', label:'生命周期事件', type:'hooks', val:[
        {event:'TeammateIdle', cmd:'notify-send "队友空闲"'},
        {event:'TaskCompleted', cmd:'./scripts/on-done.sh'},
      ], tip:'在事件触发时运行命令（含 agent teams 事件）。'},
    ]},
  ];

  const compactModels = [
    {model:'claude-opus-4-8', label:'Opus 4.8', mode:'pct', pct:20, note:'1M 上下文易烧额度，建议设阈值。'},
    {model:'claude-sonnet-4-6', label:'Sonnet 4.6', mode:'auto', pct:50, note:'走 SDK 原生自动压缩。'},
    {model:'claude-haiku-4-5', label:'Haiku 4.5', mode:'auto', pct:50, note:'走 SDK 原生自动压缩。'},
  ];

  // ---- Codex settings schema (~/.codex/config.toml) ----
  const codexSettingsGroups = [
    {id:'cx-general', name:'\u901a\u7528 General', icon:'gear', items:[
      {k:'cx_model', label:'\u6a21\u578b model', type:'select', val:'gpt-5-codex', opts:['gpt-5-codex','gpt-5','o4-mini'], tip:'Codex CLI \u4f7f\u7528\u7684\u6a21\u578b\u3002'},
      {k:'cx_provider', label:'\u6a21\u578b\u63d0\u4f9b\u65b9 model_provider', type:'select', val:'openai', opts:['openai','azure','custom'], tip:'\u6a21\u578b\u63a5\u5165\u7684 provider\u3002'},
      {k:'cx_reasoning', label:'\u63a8\u7406\u5f3a\u5ea6 reasoning_effort', type:'radio', val:'medium', opts:['low','medium','high'], tip:'\u63a8\u7406\u94fe\u7684\u6df1\u5ea6\u3002'},
    ]},
    {id:'cx-approval', name:'\u5ba1\u6279 Approval', icon:'gem', items:[
      {k:'cx_approval', label:'\u5ba1\u6279\u7b56\u7565 approval_policy', type:'radio', val:'on-request', opts:['untrusted','on-request','on-failure','never'], tip:'\u4ec0\u4e48\u65f6\u5019\u9700\u8981\u4eba\u5de5\u6279\u51c6\u547d\u4ee4\u3002'},
    ]},
    {id:'cx-sandbox', name:'\u6c99\u7bb1 Sandbox', icon:'compact', items:[
      {k:'cx_sandbox', label:'\u6c99\u7bb1\u6a21\u5f0f sandbox_mode', type:'radio', val:'workspace-write', opts:['read-only','workspace-write','danger-full-access'], tip:'\u547d\u4ee4\u53ef\u8bbf\u95ee\u7684\u6587\u4ef6\u7cfb\u7edf\u8303\u56f4\u3002'},
      {k:'cx_network', label:'\u7f51\u7edc\u8bbf\u95ee network_access', type:'toggle', val:false, tip:'\u6c99\u7bb1\u5185\u662f\u5426\u5141\u8bb8\u8054\u7f51\u3002'},
    ]},
    {id:'cx-mcp', name:'MCP \u670d\u52a1\u5668', icon:'mcp', items:[
      {k:'cx_mcp', label:'mcp_servers', type:'list', val:['github-mcp'], tip:'config.toml \u4e2d\u914d\u7f6e\u7684 MCP \u670d\u52a1\u5668\u3002'},
    ]},
  ];

  // ---- all sessions (for hub Session Grid; status drives card accent) ----
  // status: active | idle | askuser | done | error
  // lastActive: 距最后一条消息的分钟数（驱动 "x hours ago" 与置灰排序）
  const sessions = [
    {id:'s1', project:'roguent', title:'大厅重构', hero:'knight_m', model:'Opus 4.8', runtime:'claude', status:'active', tokens:1284900, agents:6, lastActive:2},
    {id:'s2', project:'roguent', title:'HUD 状态槽', hero:'elf_f', model:'Sonnet 4.6', runtime:'claude', status:'askuser', tokens:51900, agents:2, lastActive:38},
    {id:'s3', project:'api-gateway', title:'限流重写', hero:'wizzard_m', model:'Opus 4.8', runtime:'claude', status:'active', tokens:902300, agents:3, lastActive:5},
    {id:'s4', project:'mobile', title:'离线缓存', hero:'elf_m', model:'Sonnet 4.6', runtime:'claude', status:'idle', tokens:651200, agents:2, lastActive:190},
    {id:'s5', project:'infra', title:'k8s 迁移', hero:'lizard_m', model:'Sonnet 4.6', runtime:'claude', status:'askuser', tokens:498700, agents:4, lastActive:75},
    {id:'s6', project:'docs', title:'国际化', hero:'dwarf_f', model:'Haiku 4.5', runtime:'claude', status:'done', tokens:312000, agents:1, lastActive:1560},
    {id:'s7', project:'data', title:'ETL 重构', hero:'knight_f', model:'Opus 4.8', runtime:'claude', status:'error', tokens:208400, agents:2, lastActive:12},
    {id:'s8', project:'payments', title:'对账脚本', hero:'lizard_f', model:'gpt-5-codex', runtime:'codex', status:'active', tokens:543800, agents:3, lastActive:1},
    {id:'s9', project:'cli-tools', title:'参数解析重构', hero:'goblin', model:'gpt-5', runtime:'codex', status:'idle', tokens:271500, agents:2, lastActive:420},
    {id:'s10', project:'payments', title:'风控规则', hero:'dwarf_f', model:'gpt-5-codex', runtime:'codex', status:'askuser', tokens:184200, agents:1, lastActive:55},
    {id:'s11', project:'web', title:'落地页 A/B', hero:'wizzard_f', model:'Sonnet 4.6', runtime:'claude', status:'active', tokens:421000, agents:2, lastActive:9},
    {id:'s12', project:'auth', title:'OAuth 迁移', hero:'knight_m', model:'Opus 4.8', runtime:'claude', status:'done', tokens:356700, agents:3, lastActive:2980},
    {id:'s13', project:'search', title:'向量索引', hero:'wizzard_m', model:'Sonnet 4.6', runtime:'claude', status:'idle', tokens:289400, agents:2, lastActive:600},
    {id:'s14', project:'cli-tools', title:'补全脚本', hero:'elf_m', model:'gpt-5', runtime:'codex', status:'done', tokens:97600, agents:1, lastActive:4500},
    {id:'s15', project:'infra', title:'日志聚合', hero:'lizard_m', model:'Haiku 4.5', runtime:'claude', status:'active', tokens:142300, agents:2, lastActive:3},
    {id:'s16', project:'mobile', title:'推送通道', hero:'elf_f', model:'Sonnet 4.6', runtime:'claude', status:'idle', tokens:78900, agents:1, lastActive:130},
    {id:'s17', project:'billing', title:'发票生成', hero:'dwarf_m', model:'gpt-5-codex', runtime:'codex', status:'active', tokens:233100, agents:2, lastActive:6},
  ];

  // ---- projects (rooms) available for scheduling / new sessions ----
  const projects = [
    {id:'roguent', name:'roguent', accent:'#36c5e0'},
    {id:'api-gateway', name:'api-gateway', accent:'#a06cd5'},
    {id:'mobile', name:'mobile', accent:'#5fd35f'},
    {id:'infra', name:'infra', accent:'#f2c84b'},
    {id:'payments', name:'payments', accent:'#5fd35f'},
    {id:'cli-tools', name:'cli-tools', accent:'#5fd35f'},
  ];

  // ---- scheduled / recurring tasks (定时任务) ----
  // freq: once | daily | weekly | monthly ; session: 'new' | <session id>
  const scheduled = [
    {id:'sc1', name:'每日依赖审计', desc:'扫描 bun.lock 幽灵依赖，汇总报告并在异常时开 issue。', project:'roguent',
     runtime:'claude', perm:'auto', model:'Haiku 4.5', effort:'medium', session:'new',
     freq:'daily', at:'09:00', next:'明天 09:00', on:true, lastRun:'今天 09:00 · ✓'},
    {id:'sc2', name:'周一性能回归', desc:'运行性能基准并对比上周，回归超过 5% 时通知。', project:'api-gateway',
     runtime:'claude', perm:'auto', model:'Sonnet 4.6', effort:'high', session:'s3',
     freq:'weekly', day:'周一', at:'08:30', next:'周一 08:30', on:true, lastRun:'上周一 · ✓'},
    {id:'sc3', name:'月度依赖升级 PR', desc:'升级次要版本依赖、跑测试并自动开 PR 等待 review。', project:'payments',
     runtime:'codex', perm:'on-request', model:'gpt-5-codex', effort:'medium', session:'new',
     freq:'monthly', dom:1, at:'02:00', next:'7/1 02:00', on:false, lastRun:'6/1 · ✓'},
    {id:'sc4', name:'部署后冒烟测试', desc:'对 staging 跑端到端冒烟用例，失败即回滚提醒。', project:'mobile',
     runtime:'claude', perm:'auto', model:'Opus 4.8', effort:'high', session:'new',
     freq:'once', at:'今天 18:00', next:'今天 18:00', on:true, lastRun:null},
  ];

  // ---- hero pool for hub character select ----
  const heroPool = [    {hero:'knight_m', name:'骑士', accent:'#f2c84b'},
    {hero:'wizzard_m', name:'法师', accent:'#36c5e0'},
    {hero:'elf_f', name:'精灵', accent:'#5fd35f'},
    {hero:'lizard_m', name:'蜥蜴人', accent:'#5fd35f'},
    {hero:'knight_f', name:'女骑士', accent:'#ff4d6d'},
    {hero:'dwarf_m', name:'矮人', accent:'#a06cd5'},
    {hero:'wizzard_f', name:'女法师', accent:'#a06cd5'},
    {hero:'elf_m', name:'游侠', accent:'#36c5e0'},
  ];

  // ---- achievements (成就殿) — vibe-coding milestones ----
  const achievements = [
    {id:'a1', name:'首次召唤', desc:'召集你的第一个 agent 小队', icon:'task', rarity:'common', unlocked:true, at:'3天前', prog:1, total:1, reward:'×120 宝石'},
    {id:'a2', name:'夜行者', desc:'在 00:00–05:00 之间合并一次提交', icon:'write', rarity:'rare', unlocked:true, at:'昨天', prog:1, total:1, reward:'忍者皮肤'},
    {id:'a3', name:'压缩大师', desc:'累计触发 50 次 /compact 续跑', icon:'compact', rarity:'rare', unlocked:false, prog:37, total:50, reward:'×300 宝石'},
    {id:'a4', name:'百万上下文', desc:'单会话 token 突破 1,000,000', icon:'crystal', rarity:'epic', unlocked:true, at:'今天', prog:1, total:1, reward:'黄金边框'},
    {id:'a5', name:'全绿通过', desc:'一次跑通全部测试套件，零失败', icon:'done', rarity:'common', unlocked:true, at:'5天前', prog:1, total:1, reward:'×80 宝石'},
    {id:'a6', name:'双修', desc:'同一天在 Claude 与 Codex 两个 runtime 都完成会话', icon:'codex', rarity:'rare', unlocked:false, prog:1, total:2, reward:'赛博地砖'},
    {id:'a7', name:'团队指挥官', desc:'一次编排 6 个以上 subagent 协作', icon:'account', rarity:'epic', unlocked:true, at:'今天', prog:1, total:1, reward:'指挥官披风'},
    {id:'a8', name:'零打扰', desc:'连续 10 个会话无 askuser 中断', icon:'ask', rarity:'epic', unlocked:false, prog:6, total:10, reward:'×500 宝石'},
    {id:'a9', name:'传说工匠', desc:'解锁全部 12 个 slash 技能', icon:'spellbook', rarity:'legendary', unlocked:false, prog:8, total:12, reward:'/oracle 神谕技能'},
    {id:'a10', name:'重构狂人', desc:'累计跨文件安全重构 100 次', icon:'task', rarity:'rare', unlocked:false, prog:64, total:100, reward:'×260 宝石'},
    {id:'a11', name:'依赖审计员', desc:'通过 25 次零幽灵依赖审计', icon:'gem', rarity:'common', unlocked:true, at:'2天前', prog:1, total:1, reward:'×90 宝石'},
    {id:'a12', name:'插件收藏家', desc:'安装 10 个市场插件', icon:'mcp', rarity:'rare', unlocked:false, prog:2, total:10, reward:'×200 宝石'},
  ];

  // ---- mailbox / 订阅信箱 (X feeds + GitHub monitors + askuser pings) ----
  // type: x | github | ask | system
  const inbox = [
    {id:'m1', type:'x', author:'claude-dev', handle:'@claude_dev', avatar:'wizzard_m', verified:true, unread:true, time:'12m',
     title:'Claude Code v0.9 发布', body:'新增 agent teams 稳定版、tmux 队友模式、以及 /oracle 技能。订阅者可直接在 Roguent 中一键升级 runtime。', tags:['release','agent-teams']},
    {id:'m2', type:'github', repo:'anthropics/claude-code', avatar:'lizard_m', unread:true, time:'34m',
     title:'main 分支有 3 个新提交', body:'fix(compact): 修复 1M 上下文阈值计算 · feat(hooks): 新增 TeammateIdle 事件 · docs: 更新 settings.json 模式', tags:['push','3 commits'], meta:'+182 −47'},
    {id:'m3', type:'ask', author:'Scribe', avatar:'elf_f', unread:true, time:'1h', session:'roguent · HUD 状态槽',
     title:'等待你的回应', body:'要把 README 的安装段落改成 bun 还是保留 npm？', tags:['askuser']},
    {id:'m4', type:'x', author:'simonw', handle:'@simonw', avatar:'dwarf_m', verified:true, unread:false, time:'2h',
     title:'用 Roguent 把 6 个 subagent 可视化成像素小队', body:'终于能一眼看出哪个 agent 卡在 askuser 了。中途停下的会话头顶会冒问号，呼吸光提示。', tags:['blog']},
    {id:'m5', type:'github', repo:'你的仓库 · roguent-web', avatar:'knight_m', unread:false, time:'3h',
     title:'CI 通过 · PR #128 可合并', body:'大厅重构分支全部检查通过，等待 review。', tags:['ci','passing'], meta:'✓ 14 checks'},
    {id:'m6', type:'x', author:'anthropic', handle:'@AnthropicAI', avatar:'angel', verified:true, unread:false, time:'5h',
     title:'Opus 4.8 现已支持 Max & Ultra 计划', body:'Ultra 计划解锁更高推理强度档位（ultra effort）与更大并发队友配额。', tags:['announce']},
    {id:'m7', type:'system', avatar:'knight_f', unread:false, time:'6h',
     title:'周用量提醒', body:'本周限额已用 73%，预计 4 天 6 小时后重置。', tags:['usage']},
  ];

  // ---- subscriptions (订阅源管理 in mailbox) ----
  const subscriptions = [
    {id:'sub1', kind:'x', name:'claude-dev', handle:'@claude_dev', avatar:'wizzard_m', on:true, freq:'实时'},
    {id:'sub2', kind:'x', name:'simonw', handle:'@simonw', avatar:'dwarf_m', on:true, freq:'实时'},
    {id:'sub3', kind:'x', name:'AnthropicAI', handle:'@AnthropicAI', avatar:'angel', on:true, freq:'每日摘要'},
    {id:'sub4', kind:'github', name:'anthropics/claude-code', avatar:'lizard_m', on:true, freq:'push + release'},
    {id:'sub5', kind:'github', name:'your-org/roguent-web', avatar:'knight_m', on:true, freq:'PR + CI'},
    {id:'sub6', kind:'github', name:'openai/codex', avatar:'goblin', on:false, freq:'release'},
  ];

  // ---- announcement board (大厅公告板) — today's pings ----
  const announcements = [
    {id:'an1', kind:'x', icon:'chat', from:'claude-dev', text:'Claude Code v0.9 发布，支持 agent teams 稳定版', time:'12m', accent:'#36c5e0'},
    {id:'an2', kind:'github', icon:'import', from:'anthropics/claude-code', text:'main 分支 3 个新提交已同步', time:'34m', accent:'#a06cd5'},
    {id:'an3', kind:'ask', icon:'ask', from:'Scribe · HUD 状态槽', text:'askuser：README 用 bun 还是 npm？', time:'1h', accent:'#36c5e0'},
    {id:'an4', kind:'ci', icon:'done', from:'roguent-web', text:'PR #128 CI 全绿，等待 review', time:'3h', accent:'#5fd35f'},
    {id:'an5', kind:'usage', icon:'gemcur', from:'系统', text:'本周限额已用 73%', time:'6h', accent:'#f2c84b'},
  ];

  // ---- IM pairing (扫码配对：微信 / 飞书) ----
  const pairedDevices = [
    {id:'pd1', app:'wechat', name:'微信 · 我的工作号', nick:'orc@roguent', on:true, since:'2天前', forwarded:128},
    {id:'pd2', app:'feishu', name:'飞书 · Roguent 机器人', nick:'指挥台 Bot', on:false, since:'5天前', forwarded:43},
  ];

  // ---- i18n: UI labels switch CN/EN, product terms stay (Claude/Codex/askuser/compact) ----
  const i18n = {
    cn:{lobby:'大厅',interior:'内景',shop:'商店',settings:'设置',tasks:'任务',skills:'技能',leaderboard:'排行榜',
        backpack:'背包',chat:'聊天',achievements:'成就',mailbox:'邮箱',gacha:'扭蛋',pairing:'配对',announce:'公告板',
        model:'模型',import:'导入',account:'账号',menu:'菜单',pause:'暂停',
        enter:'进入',send:'发送',save:'保存',close:'返回',unread:'未读',subscriptions:'订阅源',
        questConsole:'任务台',configAltar:'设置祭坛',ranking:'排行榜'},
    en:{lobby:'Lobby',interior:'Room',shop:'Shop',settings:'Settings',tasks:'Tasks',skills:'Skills',leaderboard:'Ranking',
        backpack:'Backpack',chat:'Chat',achievements:'Achievements',mailbox:'Mailbox',gacha:'Gacha',pairing:'Pairing',announce:'Board',
        model:'Model',import:'Import',account:'Account',menu:'Menu',pause:'Pause',
        enter:'Enter',send:'Send',save:'Save',close:'Back',unread:'unread',subscriptions:'Subscriptions',
        questConsole:'Quest Console',configAltar:'Config Altar',ranking:'Ranking'},
  };

  // ---- login activity popup (节日/版本/签到 弹窗) ----
  const dailyRewards = [
    {day:1, icon:'gemcur', label:'×120', got:true},
    {day:2, icon:'gemcur', label:'×150', got:true},
    {day:3, icon:'crystal', label:'1天 Max', got:false, today:true},
    {day:4, icon:'gemcur', label:'×200', got:false},
    {day:5, icon:'spellbook', label:'技能券', got:false},
    {day:6, icon:'gemcur', label:'×260', got:false},
    {day:7, icon:'trophy', label:'限定皮肤', got:false, big:true},
  ];
  const events = [
    {id:'ev_signin', kind:'签到', accent:'#f2c84b', title:'连续登录奖励', sub:'第 3 天 · 今日可领',
     art:'signin'},
    {id:'ev_board', kind:'公告', accent:'#36c5e0', title:'今日公告板', sub:'来自订阅源 · askuser · CI · 用量',
     art:'board', cta:'打开公告板', goto:'announce'},
    {id:'ev_double', kind:'限时', accent:'#36c5e0', title:'双倍宝石周末', sub:'完成会话获得 2× 宝石',
     desc:'本周末内，每完成一个会话或合并一次提交，奖励宝石翻倍。攒满去扭蛋机换限定皮肤。',
     art:'double', cta:'去做任务', goto:'tasks', ends:'剩 1 天 18 小时'},
    {id:'ev_release', kind:'版本', accent:'#a06cd5', title:'Claude Code v0.9', sub:'agent teams 稳定版上线',
     desc:'tmux 队友模式、/oracle 技能、1M 上下文阈值优化。订阅者可一键升级 runtime。',
     art:'release', cta:'查看更新', goto:'update', tag:'NEW'},
  ];
  // ---- per-session chat context builder (links session grid / mailbox → chat) ----
  const SUB_POOL=[
    {role:'subagent · 代码勘察', hero:'wizzard_m'},
    {role:'subagent · 测试', hero:'knight_f'},
    {role:'subagent · 文档', hero:'elf_f'},
    {role:'subagent · 构建', hero:'lizard_m'},
    {role:'subagent · 依赖', hero:'dwarf_m'},
  ];
  // ---- unified runtime registry: one mode/effort set drives both runtimes ----
  // permission modes — Claude & Codex collapsed into one set (Codex 自定义 dropped)
  const runtimeOpts = {
    modes:[
      {k:'ask',    label:'Ask permissions', cx:'请求批准',   icon:'ask',   color:'#36c5e0', desc:'每次工具调用前询问你'},
      {k:'accept', label:'Accept edits',    cx:'自动审批',   icon:'write', color:'#5fd35f', desc:'自动接受文件编辑'},
      {k:'plan',   label:'Plan mode',       cx:'计划模式',   icon:'todo',  color:'#a06cd5', desc:'只规划，不写入文件'},
      {k:'auto',   label:'Auto mode',       cx:'自动',       icon:'task',  color:'#f2c84b', desc:'自动推进（默认）'},
      {k:'bypass', label:'Bypass permissions', cx:'完全访问权限', icon:'error', color:'#ff4d6d', desc:'跳过所有审批，谨慎'},
      {k:'goal',   label:'Goal mode',       cx:'目标模式',   icon:'trophy',color:'#36c5e0', desc:'围绕目标自驱执行'},
    ],
    // effort scale — Codex only supports the first 4 (low/medium/high/xhigh)
    efforts:[
      {k:'low',       cx:'低'},
      {k:'medium',    cx:'中'},
      {k:'high',      cx:'高'},
      {k:'xhigh',     cx:'超高'},
      {k:'max',       cx:'Max'},
      {k:'ultracode', cx:'Ultra'},
    ],
    codexEffortCount:4,
    models:{
      claude:['Opus 4.8 (1M context)','Opus 4.8','Sonnet 4.6','Haiku 4.5','opusplan'],
      codex:['GPT-5.5','GPT-5.4','GPT-5.4-Mini','GPT-5.3-Codex','GPT-5.3-Codex-Spark','GPT-5.2'],
    },
    defaultModel:{claude:'Opus 4.8 (1M context)', codex:'GPT-5.5'},
    defaultMode:'auto',
    defaultEffort:'high',
  };
  window.RUNTIME_OPTS=runtimeOpts;

  function buildChatCtx(src){
    // default room chat
    if(!src){
      return {key:'__room', title:room.sessionTitle, runtime:room.runtime, model:room.model,
        npcs:room.npcs, ask:null, source:'room'};
    }
    // mailbox askuser ping → pseudo-session
    if(src.type==='ask'){
      const orcH=room.npcs[0].hero;
      return {key:'ask_'+src.id, title:src.session||'askuser 会话', runtime:'claude', model:'Sonnet 4.6',
        npcs:[{id:'orc',name:src.author||'Orchestrator',role:'主控',hero:'elf_f',orchestrator:true,status:'askuser'}],
        ask:src.body, source:'mailbox'};
    }
    // session grid card → synthesized team + seed
    const n=Math.max(1,(src.agents||1));
    const npcs=[{id:'orc',name:'Orchestrator',role:'主控',hero:src.hero,orchestrator:true,status:src.status==='done'?'done':'working'}];
    for(let i=0;i<n-1;i++){const p=SUB_POOL[i%SUB_POOL.length];
      npcs.push({id:'s'+i,name:['Surveyor','Warden','Scribe','Tinker','Quartermaster'][i%5],role:p.role,hero:p.hero,
        status:src.status==='done'?'done':(i===0&&src.status==='askuser'?'askuser':['working','thinking','idle'][i%3])});}
    return {key:src.id, title:src.project+' · '+src.title, runtime:src.runtime, model:src.model,
      npcs, ask:src.status==='askuser'?(src.ask||'需要你确认下一步方向，我先停在这里。'):null, status:src.status, source:'session'};
  }
  window.buildChatCtx=buildChatCtx;

  window.DATA={room,account,currency,tasks,mailbox,skills,plugins,items,leaderboard,lobby,settingsGroups,compactModels,codexSettingsGroups,sessions,projects,scheduled,heroPool,achievements,inbox,subscriptions,announcements,pairedDevices,i18n,dailyRewards,events};
})();
