/* ROGUENT panels (2/2): Settings, Shop, SystemMenu, Transition, Backpack, Chat, Model, Import, Account.
   Globals: React, Icon, PixelSprite, Modal, DATA, GOLD_TINT. */
(function(){
  const {useState}=React;
  const h=React.createElement;
  const T=window.T;
  const Modal=window.Modal;

  function QTip({text}){return h('span',{className:'qmark has-tip'},['?',h('div',{key:'t',className:'tip cjk',style:{width:230,whiteSpace:'normal',bottom:'auto',top:'calc(100% + 6px)',left:0,transform:'none'}},text)]);}

  // ---------------- SETTINGS (§6.10) ----------------
  function Settings({onClose,uiLang,onUiLang,uiFont,onUiFont,mainHero,onPickHero,ambRune,onAmbRune,ambFx,onAmbFx,ambDen,onAmbDen,ambDay,onAmbDay,ambLink,onAmbLink,presets,onPreset,onCheckUpdate}){
    const [rt,setRt]=useState('claude');
    const groups=rt==='claude'?DATA.settingsGroups:DATA.codexSettingsGroups;
    const [grp,setGrp]=useState(groups[0].id);
    const [dirty,setDirty]=useState(false);
    const [vals,setVals]=useState({uiLang:uiLang||'中文',uiFont:uiFont||'像素'});
    const set=(k,v)=>{
      setVals(s=>({...s,[k]:v}));setDirty(true);
      if(k==='uiLang'&&onUiLang)onUiLang(v);
      if(k==='uiFont'&&onUiFont)onUiFont(v);
    };
    const switchRt=(r)=>{const gs=r==='claude'?DATA.settingsGroups:DATA.codexSettingsGroups;setRt(r);setGrp(gs[0].id);};
    const g=groups.find(x=>x.id===grp)||groups[0];
    return h(Modal,{title:'CONFIG',sub:rt==='claude'?'/config · settings.json':'~/.codex/config.toml',icon:'gear',accent:rt==='codex'?'#5fd35f':'#f2c84b',onClose,width:1180},
      h('div',{className:'settings-wrap'},[
        h('div',{key:'nav',className:'set-nav scroll'},[
          h('div',{key:'rt',className:'set-runtime'},[
            h('div',{key:'c',className:'set-rt px'+(rt==='claude'?' on':''),onClick:()=>switchRt('claude')},[h(Icon,{key:'i',name:'claude',size:16}),'Claude']),
            h('div',{key:'x',className:'set-rt px'+(rt==='codex'?' on codex':''),onClick:()=>switchRt('codex')},[h(Icon,{key:'i',name:'codex',size:16}),'Codex']),
          ]),
          ...groups.map(gr=>h('div',{key:gr.id,className:'set-navitem'+(grp===gr.id?' on':''),onClick:()=>setGrp(gr.id)},[
            h(Icon,{key:'i',name:gr.icon,size:18}),h('span',{key:'t'},gr.name),
          ])),
        ]),
        h('div',{key:'form',className:'set-form scroll'},
          grp==='compact'?h(CompactGroup,{vals,set}):
          grp==='ambiance'?h(AmbianceGroup,{rune:ambRune,onRune:onAmbRune,fx:ambFx,onFx:onAmbFx,den:ambDen,onDen:onAmbDen,day:ambDay,onDay:onAmbDay,link:ambLink,onLink:onAmbLink,presets,onPreset,onCheckUpdate}):
          [grp==='general'&&rt==='claude'&&h(MainRolePicker,{key:'role',mainHero,onPickHero}),
           ...g.items.map(it=>h(Field,{key:it.k,it,val:vals[it.k]!==undefined?vals[it.k]:it.val,set})),
           h('div',{key:'add',className:'set-add',onClick:()=>set('custom_'+Date.now(),'')},[h(Icon,{key:'i',name:'task',size:16}),T('+ 添加自定义配置')]),
          ]
        ),
      ]),
      h('div',{className:'set-foot'},[
        dirty?h('span',{key:'d',className:'px',style:{fontSize:10,color:'#f2c84b'}},T('● 未保存')):h('span',{key:'d',className:'faint',style:{fontSize:11}},T('已保存')),
        h('div',{key:'sp',style:{flex:1}}),
        h('button',{key:'r',className:'pxbtn sm cjk',onClick:()=>{setVals({uiLang,uiFont});setDirty(false);}},T('还原')),
        h('button',{key:'s',className:'pxbtn primary sm cjk',onClick:()=>setDirty(false)},T('保存')),
      ])
    );
  }
  // main character / 主角色 switcher (§12)
  function MainRolePicker({mainHero,onPickHero}){
    return h('div',{className:'mainrole'},[
      h('div',{key:'l',className:'field-label',style:{marginBottom:10}},[h('span',{key:'t'},'主角色 mainRole'),h(QTip,{key:'q',text:'你在大厅中操控的像素角色。随时可切换，不影响任何会话或模型。'})]),
      h('div',{key:'g',className:'mainrole-grid'},DATA.heroPool.map(hp=>
        h('div',{key:hp.hero,className:'mainrole-cell'+(mainHero===hp.hero?' on':''),style:{'--ac':hp.accent},onClick:()=>onPickHero&&onPickHero(hp.hero)},[
          h('div',{key:'p',className:'mainrole-portrait'},h(PixelSprite,{base:hp.hero,anim:'idle',scale:2.6})),
          h('div',{key:'n',className:'mainrole-name'},hp.name),
        ]))),
    ]);
  }
  // live world-ambiance controls (rune colour / fx intensity / decor density)
  function AmbianceGroup({rune,onRune,fx,onFx,den,onDen,day,onDay,link,onLink,presets,onPreset,onCheckUpdate}){
    const RUNES=[['#36c5e0','青'],['#f2c84b','金'],['#a06cd5','紫'],['#5fd35f','翠'],['#ff6a8a','绯'],['#e8eef2','霜']];
    const seg=(opts,cur,on)=>h('div',{className:'seg'},opts.map(o=>h('div',{key:o,className:'seg-opt'+(cur===o?' on':''),onClick:()=>on(o)},o)));
    const activePreset=(presets||[]).find(p=>p.rune===rune&&p.fx===fx&&p.den===den&&p.day===day);
    return h('div',{className:'amb-group'},[
      h('div',{key:'intro',className:'comp-intro'},[h(Icon,{key:'i',name:'crystal',size:20}),h('span',{key:'t'},'实时调整召唤法阵颜色、昼夜与世界氛围特效，改动立即在大厅与内景生效（自动保存）。')]),
      // one-click presets
      h('div',{key:'preset',className:'field'},[
        h('div',{key:'l',className:'field-label'},[h('span',{key:'t'},'氛围预设 preset'),h(QTip,{key:'q',text:'一键套用颜色 + 昼夜 + 动效 + 密度的组合。'})]),
        h('div',{key:'c',className:'amb-presets'},(presets||[]).map(p=>
          h('button',{key:p.id,className:'amb-preset'+(activePreset&&activePreset.id===p.id?' on':''),onClick:()=>onPreset(p)},[
            h('span',{key:'d',className:'amb-preset-dot',style:{background:p.rune}}),p.id]))),
      ]),
      h('div',{key:'rune',className:'field'},[
        h('div',{key:'l',className:'field-label'},[h('span',{key:'t'},'符文颜色 runeColor'),h(QTip,{key:'q',text:'大厅广场与内景指挥台召唤法阵的发光颜色。'})]),
        h('div',{key:'c',className:'amb-swatches'},RUNES.map(([c,n])=>
          h('div',{key:c,className:'amb-swatch'+(rune===c?' on':''),style:{'--sw':c},onClick:()=>onRune(c)},[
            h('span',{key:'d',className:'amb-swatch-dot'}),h('span',{key:'n',className:'amb-swatch-n'},n)]))),
      ]),
      h('div',{key:'day',className:'field'},[
        h('div',{key:'l',className:'field-label'},[h('span',{key:'t'},'昼夜光照 dayNight'),h(QTip,{key:'q',text:'大厅随时间在暖阳 / 黄昏 / 夜幕间着色。自动 = 跟随本机时钟。'})]),
        h('div',{key:'c',className:'field-ctrl'},seg(['自动','白天','黄昏','夜晚'],day,onDay)),
      ]),
      h('div',{key:'fx',className:'field'},[
        h('div',{key:'l',className:'field-label'},[h('span',{key:'t'},'动效强度 fxIntensity'),h(QTip,{key:'q',text:'法阵旋转、萤火、光晕的亮度与速度。关 = 静止。'})]),
        h('div',{key:'c',className:'field-ctrl'},seg(['关','弱','标准','强'],fx,onFx)),
      ]),
      h('div',{key:'den',className:'field'},[
        h('div',{key:'l',className:'field-label'},[h('span',{key:'t'},'装饰密度 density'),h(QTip,{key:'q',text:'花丛、落叶、萤火、尘埃等装饰元素的数量。'})]),
        h('div',{key:'c',className:'field-ctrl'},seg(['稀疏','标准','密集'],den,onDen)),
      ]),
      h('div',{key:'link',className:'field'},[
        h('div',{key:'l',className:'field-label'},[h('span',{key:'t'},'联动强调色 linkAccent'),h(QTip,{key:'q',text:'开启后，HUD 强调色与聊天气泡跟随符文颜色，一键统一全局配色。'})]),
        h('div',{key:'c',className:'field-ctrl'},h('div',{className:'pxtoggle'+(link?' on':''),onClick:()=>onLink(!link)},h('div',{className:'knob'}))),
      ]),
      h('div',{key:'prev',className:'amb-preview'},[
        h('div',{key:'r',className:'amb-preview-rune'},[h('span',{key:'a',className:'amb-prev-ring'}),h('span',{key:'b',className:'amb-prev-ring rev'}),h('span',{key:'c',className:'amb-prev-core'})]),
        h('div',{key:'t',className:'amb-preview-meta'},[
          h('div',{key:'1',className:'px',style:{fontSize:10,color:'var(--ink)'}},activePreset?('预设 · '+activePreset.id):'自定义'),
          h('div',{key:'2',className:'faint',style:{fontSize:11,marginTop:4}},'符文 '+rune+' · '+day+' · 动效 '+fx+' · 密度 '+den+(link?' · 联动':'')),
        ]),
      ]),
      // version / update
      h('div',{key:'upd',className:'amb-update'},[
        h('div',{key:'l',className:'amb-update-l'},[
          h(Icon,{key:'i',name:'spellbook',size:18,glow:'#a06cd5'}),
          h('div',{key:'t'},[h('div',{key:'1',className:'px',style:{fontSize:10,color:'var(--ink)'}},'Roguent v0.9'),h('div',{key:'2',className:'faint',style:{fontSize:10,marginTop:3}},'prototype · 本地双 runtime')]),
        ]),
        h('button',{key:'b',className:'pxbtn sm cjk',onClick:onCheckUpdate},[h(Icon,{key:'i',name:'import',size:14,style:{marginRight:6}}),'检查更新']),
      ]),
    ]);
  }

  function Field({it,val,set}){
    return h('div',{className:'field'},[
      h('div',{key:'l',className:'field-label'},[h('span',{key:'t'},it.label),h(QTip,{key:'q',text:it.tip})]),
      h('div',{key:'c',className:'field-ctrl'},renderCtrl(it,val,set)),
    ]);
  }
  function renderCtrl(it,val,set){
    if(it.type==='toggle') return h('div',{className:'pxtoggle'+(val?' on':''),onClick:()=>set(it.k,!val)},h('div',{className:'knob'}));
    if(it.type==='select') return h('select',{className:'pxselect',value:val,onChange:e=>set(it.k,e.target.value)},it.opts.map(o=>h('option',{key:o,value:o},o)));
    if(it.type==='radio') return h('div',{className:'seg'},it.opts.map(o=>h('div',{key:o,className:'seg-opt'+(val===o?' on':''),onClick:()=>set(it.k,o)},o)));
    if(it.type==='list') return h('div',{className:'pxlist'},[...(Array.isArray(val)?val:[]).map((v,i)=>h('div',{key:i,className:'pxlist-item'},[h('span',{key:'t'},v),h('span',{key:'x',className:'pxlist-x'},'✕')])),h('div',{key:'add',className:'pxlist-add'},'+ 添加')]);
    if(it.type==='hooks') return h('div',{className:'pxlist'},[...(val||[]).map((hk,i)=>h('div',{key:i,className:'hook-item'},[h('span',{key:'e',className:'chip cyan px',style:{fontSize:9}},hk.event),h('code',{key:'c',className:'hook-cmd'},hk.cmd)])),h('div',{key:'add',className:'pxlist-add'},'+ 添加 Hook')]);
    return h('input',{className:'pxinput',defaultValue:val,onChange:e=>set(it.k,e.target.value)});
  }
  // compaction group (§6.8)
  function CompactGroup({vals,set}){
    const models=DATA.compactModels;
    return h('div',{className:'compact-group'},[
      h('div',{key:'intro',className:'comp-intro'},[h(Icon,{key:'i',name:'compact',size:20}),h('span',{key:'t'},'为每个模型设“达到 X% 自动压缩续跑”的阈值。Auto = 不主动干预，走 SDK 原生压缩。')]),
      ...models.map(m=>h(ThresholdRow,{key:m.model,m,vals,set})),
      // flow card
      h('div',{key:'flow',className:'flow-card'},[
        h('div',{key:'h',className:'px',style:{fontSize:10,color:'#f2c84b',marginBottom:12}},'自动编排循环 (util ≥ 阈值)'),
        h('div',{key:'s',className:'flow-steps'},[
          ['1','终止本轮','error'],['2','/compact','compact'],['3','发送“继续”','chat'],['4','循环','task'],
        ].map(([n,t,ic],i,arr)=>h(React.Fragment,{key:n},[
          h('div',{key:'st',className:'flow-step'},[h('div',{key:'n',className:'flow-num px'},n),h(Icon,{key:'i',name:ic,size:22}),h('span',{key:'t'},t)]),
          i<arr.length-1&&h('div',{key:'ar',className:'flow-arrow'},'→'),
        ]))),
      ]),
    ]);
  }
  function ThresholdRow({m,vals,set}){
    const key=m.model;
    const cur=vals[key]||{mode:m.mode,pct:m.pct};
    const upd=o=>set(key,{...cur,...o});
    return h('div',{className:'thresh-row'},[
      h('div',{key:'l',className:'thresh-l'},[h('span',{key:'m',className:'px',style:{fontSize:10}},m.label),h('code',{key:'c',className:'thresh-id'},m.model)]),
      h('div',{key:'c',className:'thresh-c'},[
        h('div',{key:'seg',className:'seg sm'},[
          h('div',{key:'a',className:'seg-opt'+(cur.mode==='auto'?' on':''),onClick:()=>upd({mode:'auto'})},'Auto'),
          h('div',{key:'p',className:'seg-opt'+(cur.mode==='pct'?' on':''),onClick:()=>upd({mode:'pct'})},'阈值 %'),
        ]),
        cur.mode==='pct'&&h('div',{key:'sl',className:'slider-row'},[
          h('div',{key:'wrap',className:'range-wrap'},[
            h('input',{key:'r',type:'range',min:5,max:95,step:5,value:cur.pct,onChange:e=>upd({pct:+e.target.value}),className:'pxrange'}),
            h('div',{key:'tick',className:'range-tick',style:{left:'calc('+((20-5)/90*100)+'% )'}},'20'),
          ]),
          h('div',{key:'n',className:'px pct-num'},cur.pct+'%'),
        ]),
      ]),
      h('div',{key:'note',className:'thresh-note faint'},m.note),
    ]);
  }
  window.Settings=Settings;

  // ---------------- PLUGIN MARKET (插件市场，真实 MCP / Skills / 插件) ----------------
  function Market({onClose}){
    const [cat,setCat]=useState('全部');
    const [q,setQ]=useState('');
    const cats=['全部','已安装','Skills','MCP','插件'];
    let plugins=DATA.plugins.filter(p=>{
      if(cat==='已安装') return p.owned;
      if(cat!=='全部') return p.cat===cat;
      return true;
    }).filter(p=>!q||p.name.includes(q)||p.desc.includes(q));
    const owned=DATA.plugins.filter(p=>p.owned).length;
    return h(Modal,{title:'MARKET',sub:'插件市场 · MCP / Skills / 插件 · 接入真实能力',icon:'mcp',accent:'#36c5e0',onClose,width:1180},
      h('div',{className:'shop-wrap'},[
        h('div',{key:'m',className:'shop-market'},[
          h('div',{key:'side',className:'shop-side'},[
            h('div',{key:'search',className:'shop-search'},[h(Icon,{key:'i',name:'search',size:16}),h('input',{key:'in',className:'pxinput',placeholder:T('搜索…'),value:q,onChange:e=>setQ(e.target.value)})]),
            ...cats.map(c=>h('div',{key:c,className:'shop-cat'+(cat===c?' on':''),onClick:()=>setCat(c)},[h('span',{key:'l'},T(c)),c==='已安装'&&h('span',{key:'n',className:'shop-cat-n px'},owned)])),
            h('div',{key:'note',className:'shop-side-note faint'},'通过 settings.json / config.toml 启用，作用于 Claude 与 Codex。'),
          ]),
          h('div',{key:'grid',className:'shop-grid scroll'},plugins.map(p=>h('div',{key:p.id,className:'plugin-card'},[
            h('div',{key:'top',className:'plugin-top'},[
              h('div',{key:'ic',className:'plugin-ic'},h(Icon,{name:p.icon,size:30,glow:'#36c5e0'})),
              h('div',{key:'meta',className:'plugin-meta'},[h('div',{key:'n',className:'plugin-name'},p.name),h('div',{key:'a',className:'faint',style:{fontSize:11}},'by '+p.author)]),
              h('span',{key:'c',className:'chip px',style:{fontSize:8}},p.cat),
            ]),
            h('div',{key:'d',className:'plugin-desc'},p.desc),
            h('div',{key:'b',className:'plugin-bottom'},[
              h('span',{key:'s',className:'px',style:{fontSize:9,color:'#f2c84b'}},'★ '+p.stars),
              h('span',{key:'i',className:'faint',style:{fontSize:11}},p.installs+' '+window.TL('安装','installs')),
              h('span',{key:'rt',className:'chip px',style:{fontSize:8}},p.runtime==='both'?T('通用'):'Claude'),
              h('div',{key:'sp',style:{flex:1}}),
              p.owned?h('span',{key:'o',className:'chip greenc'},T('已启用')):h('button',{key:'in',className:'pxbtn gold sm cjk'},T('安装')),
            ]),
          ]))),
        ]),
      ])
    );
  }
  window.Market=Market;

  // ---------------- DECORATION SHOP (装饰商店，宝石消费 · 纯外观) ----------------
  function Shop({onClose,onOpen}){
    const cats=['全部','房间','皮肤','宠物','UI'];
    const [cat,setCat]=useState('全部');
    const items=DATA.items.filter(it=>!it.gacha).filter(it=>cat==='全部'||it.cat===cat);
    return h(Modal,{title:'SHOP',sub:'装饰商店 · 宝石消费 · 仅外观，不影响开发结果',icon:'shop',accent:'#a06cd5',onClose,width:1180},
      h('div',{className:'shop-items'},[
        h('div',{key:'bal',className:'shop-bal'},[
          h(Icon,{key:'i',name:'gemcur',size:22}),
          h('span',{key:'v',className:'px',style:{color:'#a06cd5'}},DATA.currency.gems.toLocaleString()),
          h('span',{key:'l',className:'faint',style:{fontSize:11,flex:1}},'宝石 · 完成会话 / 任务赚取'),
          h('button',{key:'g',className:'pxbtn sm cjk',onClick:()=>onOpen&&onOpen('gacha')},[h(Icon,{key:'i',name:'gemcur',size:14,style:{marginRight:6}}),'去扭蛋机']),
        ]),
        h('div',{key:'cats',className:'shop-itemcats'},cats.map(c=>
          h('div',{key:c,className:'shop-cat'+(cat===c?' on':''),onClick:()=>setCat(c)},c))),
        h('div',{key:'grid',className:'item-grid scroll'},items.map(it=>h('div',{key:it.id,className:'item-card',style:{'--ac':it.accent}},[
          h('div',{key:'base',className:'item-base'},h(Icon,{name:it.icon,size:40,glow:it.accent})),
          h('div',{key:'n',className:'item-name'},it.name),
          h('div',{key:'c',className:'chip px',style:{fontSize:8}},it.cat),
          it.owned?h('span',{key:'o',className:'chip greenc',style:{marginTop:8}},T('已拥有')):h('button',{key:'b',className:'pxbtn sm cjk',style:{marginTop:8}},[h(Icon,{key:'i',name:'gemcur',size:14,style:{marginRight:5}}),it.price]),
        ]))),
      ])
    );
  }
  window.Shop=Shop;

  // ---------------- SYSTEM / PAUSE MENU (§6.11) ----------------
  function SystemMenu({onClose,onOpen}){
    const items=[[T('继续游戏'),'done',onClose],[T('账号 · 订阅'),'account',()=>onOpen('account')],[T('runtime 管理'),'claude',()=>onOpen('account')],[T('保存 / 导出会话'),'save',null],[T('导入会话'),'import',()=>onOpen('import')],[T('外观 / 主题'),'gear',()=>onOpen('settings')],[T('关于 Roguent'),'spellbook',()=>onOpen('about')],[T('退出'),'error',null]];
    return h('div',{className:'scrim sysmenu',onClick:onClose},
      h('div',{className:'sysmenu-inner',onClick:e=>e.stopPropagation()},[
        h('div',{key:'logo',className:'sys-logo px'},'ROGUENT'),
        h('div',{key:'sub',className:'faint',style:{marginBottom:30,letterSpacing:'.2em'}},'PAUSED · '+T('指挥台')),
        ...items.map(([label,icon,fn],i)=>h('button',{key:i,className:'sys-btn',onClick:fn||onClose},[h(Icon,{key:'i',name:icon,size:22}),h('span',{key:'t'},label)])),
      ])
    );
  }
  window.SystemMenu=SystemMenu;

  // ---------------- TRANSITION / VORTEX (§6.17) ----------------
  function Transition({onClose,top='正在召集小队…',bottom='普通模式下有一定概率遇到精英首领'}){
    return h('div',{className:'scrim vortex-scrim',onClick:onClose},[
      h('div',{key:'top',className:'vortex-top px'},top),
      h('div',{key:'v',className:'vortex'},[
        h('div',{key:'g',className:'vortex-glow'}),
        h('div',{key:'s',className:'vortex-spin'}),
        h('div',{key:'core',className:'vortex-core'}),
        ...[0,1,2,3,4].map(i=>h('div',{key:'p'+i,className:'vortex-particle','data-i':i,style:{'--i':i}})),
      ]),
      h('div',{key:'bot',className:'vortex-bot cjk'},bottom),
      h('div',{key:'save',className:'vortex-save'},h(Icon,{name:'save',size:30})),
      h('div',{key:'hint',className:'vortex-hint faint'},T('点击任意处继续')),
    ]);
  }
  window.Transition=Transition;

  // ---------------- light panels ----------------
  function Backpack({onClose}){
    const loot=[{n:'auth.ts diff',i:'write',c:'#5fd35f'},{n:'设计稿.png',i:'read',c:'#36c5e0'},{n:'压缩报告',i:'compact',c:'#a06cd5'},{n:'测试结果',i:'bash',c:'#f2c84b'},{n:'README.md',i:'read',c:'#36c5e0'}];
    let gloot=[];try{gloot=JSON.parse(localStorage.getItem('roguent_loot')||'[]');}catch(e){}
    const gcounts={};gloot.forEach(p=>{gcounts[p.name]=gcounts[p.name]||{p,n:0};gcounts[p.name].n++;});
    const gachaItems=Object.values(gcounts);
    return h(Modal,{title:'BACKPACK',sub:'本会话产出 loot',icon:'pouch',onClose,width:760},
      h('div',{className:'bp-wrap'},[
        h('div',{key:'s1',className:'bp-sec px'},T('会话产出')),
        h('div',{key:'g1',className:'loot-grid'},[...loot.map((l,i)=>h('div',{key:i,className:'loot-cell'},[h('div',{key:'ic',className:'loot-ic'},h(Icon,{name:l.i,size:30,glow:l.c})),h('div',{key:'n',className:'loot-name'},l.n)])),...Array(2).fill(0).map((_,i)=>h('div',{key:'e'+i,className:'loot-cell empty'}))]),
        h('div',{key:'s2',className:'bp-sec px'},[h(Icon,{key:'i',name:'gemcur',size:13,style:{marginRight:6,verticalAlign:'-2px'}}),T('扭蛋战利品 · 外观')]),
        gachaItems.length
          ? h('div',{key:'g2',className:'loot-grid'},gachaItems.map((c,i)=>h('div',{key:i,className:'loot-cell',style:{boxShadow:'inset 0 0 0 2px '+c.p.accent}},[
              h('div',{key:'ic',className:'loot-ic'},h(Icon,{name:c.p.icon,size:30,glow:c.p.accent})),
              h('div',{key:'n',className:'loot-name'},c.p.name+(c.n>1?' ×'+c.n:'')),
            ])))
          : h('div',{key:'g2e',className:'faint',style:{fontSize:12,padding:'4px 2px 8px'}},'还没有扭蛋外观 · 去商店旁的扭蛋机扭一发'),
      ])
    );
  }
  window.Backpack=Backpack;

  // ---------------- mini markdown renderer ----------------
  function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function mdInline(s){
    return s
      .replace(/`([^`]+)`/g,(m,c)=>'<code class="md-code">'+c+'</code>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function mdToHtml(src){
    const lines=escHtml(src||'').split('\n');
    let out='',i=0,list=null;
    const closeL=()=>{if(list){out+='</'+list+'>';list=null;}};
    while(i<lines.length){
      const ln=lines[i];
      if(/^```/.test(ln.trim())){
        closeL();i++;let code='';
        while(i<lines.length&&!/^```/.test(lines[i].trim())){code+=lines[i]+'\n';i++;}
        i++;out+='<pre class="md-pre"><code>'+code.replace(/\n$/,'')+'</code></pre>';continue;
      }
      const hm=ln.match(/^(#{1,4})\s+(.*)$/);
      if(hm){closeL();out+='<div class="md-h md-h'+hm[1].length+'">'+mdInline(hm[2])+'</div>';i++;continue;}
      if(/^---+$/.test(ln.trim())){closeL();out+='<hr class="md-hr">';i++;continue;}
      if(/^>\s?/.test(ln)){closeL();out+='<blockquote class="md-bq">'+mdInline(ln.replace(/^>\s?/,''))+'</blockquote>';i++;continue;}
      const um=ln.match(/^[-*]\s+(.*)$/);
      if(um){if(list!=='ul'){closeL();out+='<ul class="md-ul">';list='ul';}out+='<li>'+mdInline(um[1])+'</li>';i++;continue;}
      const om=ln.match(/^(\d+)\.\s+(.*)$/);
      if(om){if(list!=='ol'){closeL();out+='<ol class="md-ol">';list='ol';}out+='<li>'+mdInline(om[2])+'</li>';i++;continue;}
      if(ln.trim()===''){closeL();i++;continue;}
      closeL();out+='<p class="md-p">'+mdInline(ln)+'</p>';i++;
    }
    closeL();return out;
  }

  // ---- clipboard + small reusable chat affordances ----
  function copyToClipboard(str){
    try{ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(str);return;} }catch(e){}
    const ta=document.createElement('textarea');ta.value=str;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(_){}document.body.removeChild(ta);
  }
  function nowTime(){const d=new Date();return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
  function CopyBtn({text,title}){
    const [ok,setOk]=useState(false);
    return h('button',{className:'cc-iconbtn'+(ok?' ok':''),title:title||'复制',
      onClick:(e)=>{e.stopPropagation();copyToClipboard(text);setOk(true);setTimeout(()=>setOk(false),1100);}},ok?'✓':'⧉');
  }
  // renders markdown html and injects a copy button into every code block
  function MdBlock({html,className}){
    const ref=React.useRef(null);
    React.useEffect(()=>{
      const el=ref.current;if(!el)return;
      el.querySelectorAll('pre.md-pre').forEach(pre=>{
        if(pre.querySelector('.codecopy'))return;
        const code=pre.querySelector('code');const txt=(code?code.textContent:pre.textContent)||'';
        const b=document.createElement('button');b.className='codecopy';b.textContent='复制';
        b.onclick=(ev)=>{ev.stopPropagation();copyToClipboard(txt);b.textContent='✓';setTimeout(()=>{b.textContent='复制';},1100);};
        pre.appendChild(b);
      });
    });
    return h('div',{ref,className,dangerouslySetInnerHTML:{__html:html}});
  }
  // collapsible "thinking" trace (default collapsed; copy excluded from message copy)
  function ThinkBlock({text}){
    const [open,setOpen]=useState(false);
    return h('div',{className:'cthink'+(open?' open':'')},[
      h('div',{key:'h',className:'cthink-h',onClick:()=>setOpen(o=>!o)},[
        h(Icon,{key:'i',name:'crystal',size:13}),
        h('span',{key:'t',className:'cthink-t'},'思考过程'),
        h('span',{key:'c',className:'cthink-chev'},open?'收起 ▾':'展开 ▸'),
      ]),
      open&&h('div',{key:'b',className:'cthink-b'},text),
    ]);
  }
  // collapsible executed-commands trace (default collapsed)
  function CmdBlock({cmds}){
    const [open,setOpen]=useState(false);
    return h('div',{className:'ccmd'+(open?' open':'')},[
      h('div',{key:'h',className:'ccmd-h',onClick:()=>setOpen(o=>!o)},[
        h(Icon,{key:'i',name:'bash',size:13}),
        h('span',{key:'t',className:'ccmd-t'},'执行命令'),
        h('span',{key:'n',className:'ccmd-n'},cmds.length),
        h('span',{key:'c',className:'ccmd-chev'},open?'收起 ▾':'展开 ▸'),
      ]),
      open&&h('div',{key:'b',className:'ccmd-b'},cmds.map((c,i)=>h('div',{key:i,className:'ccmd-row'},[
        h('div',{key:'cmd',className:'ccmd-cmd'},[h('span',{key:'p',className:'ccmd-prompt'},'$ '),h('span',{key:'c'},c.cmd),h(CopyBtn,{key:'cp',text:c.cmd,title:'复制命令'})]),
        c.out&&h('div',{key:'out',className:'ccmd-out'+(c.ok===false?' err':'')},c.out),
      ]))),
    ]);
  }
  // Claude Code AskUserQuestion tool — step tabs · numbered options w/ desc · ❯ cursor · Type something · Chat about this
  function AskTool({ask,onAnswer,busy}){
    const {useState}=React;
    const steps=ask.steps||[{id:'q',label:ask.label||'问题',question:ask.question,options:(ask.options||[]).map(o=>typeof o==='string'?{title:o}:o)}];
    const nSteps=steps.length;
    const [step,setStep]=useState(0);          // 0..nSteps-1 = question steps; nSteps = Submit
    const [answers,setAnswers]=useState({});   // id -> {title, free?}
    const [cursor,setCursor]=useState(0);
    const [freeEditing,setFreeEditing]=useState(false);
    const [freeText,setFreeText]=useState('');
    const onSubmit=step>=nSteps;
    const cur=steps[step];
    const answered=(s)=>answers[s.id]!==undefined;
    const allAnswered=steps.every(answered);

    const choose=(s,val)=>{
      setAnswers(a=>({...a,[s.id]:val}));
      setFreeEditing(false);setFreeText('');setCursor(0);
      setStep(st=>Math.min(nSteps,st+1));
    };
    const submit=()=>{ if(busy)return; onAnswer(steps.map(s=>{const v=answers[s.id];return s.label+'：'+((v&&(v.free||v.title))||'—');}).join('\n')); };

    // ---- step / submit tab bar ----
    const tabs=h('div',{key:'tabs',className:'ckask-tabs'},[
      h('button',{key:'l',className:'ckask-arrow',disabled:step<=0,onClick:()=>setStep(s=>Math.max(0,s-1))},'←'),
      ...steps.map((s,i)=>h('button',{key:s.id,className:'ckask-tab'+(step===i?' on':'')+(answered(s)?' done':''),onClick:()=>{setStep(i);setCursor(0);}},[
        h('span',{key:'b',className:'ckask-box'},answered(s)?'✔':'□'),
        h('span',{key:'l'},' '+s.label),
      ])),
      h('button',{key:'sub',className:'ckask-tab submit'+(onSubmit?' on':'')+(allAnswered?' ready':''),onClick:()=>setStep(nSteps)},[
        h('span',{key:'b',className:'ckask-box'},allAnswered?'✔':'□'),h('span',{key:'l'},' Submit'),
      ]),
      h('button',{key:'r',className:'ckask-arrow',disabled:step>=nSteps,onClick:()=>setStep(s=>Math.min(nSteps,s+1))},'→'),
    ]);

    let body;
    if(onSubmit){
      body=h('div',{key:'body',className:'ckask-body'},[
        h('div',{key:'q',className:'ckask-q'},'确认并提交以下选择：'),
        h('div',{key:'sum',className:'ckask-summary'},steps.map(s=>h('div',{key:s.id,className:'ckask-sumrow'},[
          h('span',{key:'l',className:'ckask-sumlabel'},s.label),
          h('span',{key:'v',className:'ckask-sumval'+(answered(s)?'':' none')},(answers[s.id]&&(answers[s.id].free||answers[s.id].title))||'未选择'),
        ]))),
        h('button',{key:'go',className:'pxbtn primary cjk',disabled:busy||!allAnswered,onClick:submit},'✔ 提交'),
      ]);
    } else {
      const opts=cur.options, freeIdx=opts.length, chatIdx=opts.length+1;
      const optRow=(i,title,desc,cls,onClick)=>h('div',{key:i,className:'ckask-opt'+(cursor===i?' cur':'')+(cls||''),onMouseEnter:()=>setCursor(i),onClick},[
        h('div',{key:'h',className:'ckask-opt-h'},[
          h('span',{key:'c',className:'ckask-cur'},cursor===i?'❯':' '),
          h('span',{key:'n',className:'ckask-num'},(i+1)+'.'),
          h('span',{key:'t',className:'ckask-title'},title),
        ]),
        desc&&h('div',{key:'d',className:'ckask-desc'},desc),
      ]);
      body=h('div',{key:'body',className:'ckask-body'},[
        h('div',{key:'q',className:'ckask-q'},cur.question),
        h('div',{key:'opts',className:'ckask-opts'},[
          ...opts.map((o,i)=>optRow(i,o.title,o.desc,answers[cur.id]&&answers[cur.id].title===o.title?' chosen':'',()=>choose(cur,{title:o.title}))),
          // Type something (freeform)
          h('div',{key:'free',className:'ckask-opt muted'+(cursor===freeIdx?' cur':''),onMouseEnter:()=>setCursor(freeIdx)},[
            h('div',{key:'h',className:'ckask-opt-h',onClick:()=>setFreeEditing(true)},[
              h('span',{key:'c',className:'ckask-cur'},cursor===freeIdx?'❯':' '),
              h('span',{key:'n',className:'ckask-num'},(freeIdx+1)+'.'),
              h('span',{key:'t',className:'ckask-title'},'Type something.'),
            ]),
            freeEditing&&h('div',{key:'in',className:'ckask-free'},[
              h('textarea',{key:'t',className:'pxinput',rows:2,placeholder:'输入你的回复…',value:freeText,
                onChange:e=>setFreeText(e.target.value),onKeyDown:e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&freeText.trim())choose(cur,{title:freeText.trim(),free:freeText.trim()});}}),
              h('button',{key:'s',className:'pxbtn primary sm cjk',disabled:!freeText.trim(),onClick:()=>choose(cur,{title:freeText.trim(),free:freeText.trim()})},'确定'),
            ]),
          ]),
        ]),
        h('div',{key:'hr',className:'ckask-hr'}),
        optRow(chatIdx,'Chat about this',null,' chat muted',()=>onAnswer('（先就这个问题聊聊）')),
      ]);
    }
    return h('div',{className:'ckask'},[tabs,body]);
  }

  const AGENT_REPLIES=[
    {think:'用户想把改动落到最小。先只读勘察，定位所有非整数缩放调用点，再决定要不要重构 camera 模块。避免一上来就大改。',
     cmds:[{cmd:'rg "\\.scale\\(" src --type ts -n',out:'src/camera.ts:42:  ctx.scale(raw)\nsrc/mapping.ts:88:  view.scale(z)\n2 matches',ok:true},
           {cmd:'bun run typecheck',out:'✓ no type errors (1.8s)',ok:true}],
     text:'**已加入队列。** 我让 `mage` 先做一次静态勘察，再决定改动范围。\n\n预计步骤：\n\n1. 读取 `camera.ts` 与 `mapping.ts`\n2. 标记所有非整数缩放调用点\n3. 产出最小 diff\n\n> 这一步只读，不会写文件。\n\n完成后我把结果贴回这里。'},
    {think:'两条路线：量化缩放最稳，步进缩放手感更好但要调阈值。默认推荐 A，把 B 作为可选。',
     text:'明白，给你两种方案：\n\n- **A · 量化缩放** — 简单稳定，`Math.round`\n- **B · 步进缩放** — 更跟手，但要调阈值\n\n```ts\nconst zoom = snapZoom(camera.raw); // A\n```\n\n你倾向哪个？我默认走 **A**。'},
    {cmds:[{cmd:'bun test camera.test.ts',out:'✓ 14 passed (0 failed)  312ms',ok:true}],
     text:'收到，已记录为本轮 todo。`kf` 正在跑测试套件，等变绿我再合并。'},
    {think:'状态槽优先级按 §6.6：askuser > error > 工具气泡。这样最显眼的永远是需要用户拍板的。',
     text:'好。我把状态槽优先级按 **§6.6** 排：\n\n1. `askuser` ❓ 最高\n2. `error` 次之\n3. 工具气泡随调用切换\n\n需要的话我现在就开一个子任务给 `kf`。'},
  ];

  const QUICK_REPLIES=['走 A 方案','先跑测试再合并','顺便对齐 minimap','保留 npm','给我看 diff'];
  // builds an ask payload from a context's ask string
  function askPayload(q){
    return {steps:[{id:'q',label:'确认',question:q||'需要你确认下一步方向。',options:[
      {title:'采用 bun',desc:'统一改 CONTRIBUTING / CI / Dockerfile 并跑安装验证。'},
      {title:'保留 npm',desc:'只调整文档措辞，不动脚本。'},
      {title:'两者都写',desc:'文档中并列说明，维护成本略高。'},
    ]}]};
  }
  // seeds tailored to a synthesized session's status
  function seedFor(ctx){
    if(ctx.source==='room'){
      return [
        {who:'in',from:'orc',time:'14:21',text:'**收到本轮目标。** 我已把任务拆给小队：\n\n- `mage` 勘察 `mapping.ts`\n- `kf` 跑测试套件\n\n准备好就告诉我下一步。',done:true},
        {who:'out',from:'me',time:'14:22',text:'把大厅相机改成整数倍缩放贴身跟随。',done:true},
        {who:'in',from:'orc',time:'14:23',
         think:'用户要整数倍缩放 + 贴身跟随。先把 snapZoom 暴露出来，再用主控坐标插值。改动集中在 camera.ts，minimap 是否同步缩放要问一下。',
         cmds:[{cmd:'cat src/camera.ts | head -50',out:'export class Camera {\n  raw = 1\n  ...\n}',ok:true}],
         text:'明白，**整数倍缩放 + 贴身跟随主控**。计划：\n\n1. `camera.ts` 暴露 `snapZoom()`\n2. 跟随逻辑用主控坐标插值\n3. 进出房间平滑过渡\n\n```ts\nfunction snapZoom(raw){\n  return Math.max(1, Math.round(raw));\n}\n```\n\n要我顺便对齐 `minimap` 的缩放吗？',done:true},
        {who:'in',from:'elf',time:'14:25',done:true,
         ask:{steps:[
           {id:'dir',label:'工作方向',question:'你今天想专注在哪个方向？',options:[
             {title:'新功能开发（推荐）',desc:'推进 ROADMAP 下一个待办项，让项目持续前进。'},
             {title:'Bug 修复',desc:'排查并修复现有问题，提升稳定性。'},
             {title:'重构 / 优化',desc:'改善代码质量或架构，不新增功能。'},
             {title:'文档 / 规范',desc:'更新 CLAUDE.md、ROADMAP、设计文档等。'},
           ]},
           {id:'cadence',label:'汇报节奏',question:'希望我多久同步一次进度？',options:[
             {title:'每完成一步',desc:'每个 todo 完成后都汇报，最透明。'},
             {title:'关键节点（推荐）',desc:'仅在阶段性成果或需要拍板时汇报。'},
             {title:'全部做完再说',desc:'我自驱推进，结束时一次性汇报。'},
           ]},
           {id:'worktree',label:'Worktree',question:'在哪个 worktree 上开工？',options:[
             {title:'feat/lobby-rework（当前）',desc:'继续大厅重构分支。'},
             {title:'新建 worktree',desc:'从 main 切一个干净分支。'},
           ]},
         ]}},
      ];
    }
    if(ctx.source==='mailbox'){
      return [
        {who:'in',from:'orc',time:'13:58',text:'我在处理这条会话时遇到一个需要你拍板的点。',done:true},
        {who:'in',from:'orc',time:'13:58',ask:askPayload(ctx.ask),done:true},
      ];
    }
    const t=ctx.title;
    if(ctx.status==='done') return [
      {who:'in',from:'orc',time:'11:04',
       cmds:[{cmd:'bun test && git push',out:'✓ 28 passed\nTo origin: feat/lobby-rework → merged',ok:true}],
       text:'**'+t+'** 已完成 ✓\n\n- 全部测试通过\n- 已合并到主分支\n\n需要我归档这个会话吗？',done:true},
    ];
    if(ctx.status==='error') return [
      {who:'in',from:'orc',time:'10:12',
       cmds:[{cmd:'bun run engine:connect',out:'Error: connection refused (engine offline)',ok:false}],
       text:'⚠️ **runtime 报错**，这个会话中断了：\n\n```\nError: connection refused (engine offline)\n```\n\n要我重试连接还是先看日志？',done:true},
    ];
    if(ctx.status==='askuser') return [
      {who:'in',from:'orc',time:'15:30',text:'我已经推进到一半，剩下这步需要你决定。',done:true},
      {who:'in',from:'orc',time:'15:30',ask:askPayload(ctx.ask),done:true},
    ];
    if(ctx.status==='idle') return [
      {who:'in',from:'orc',time:'09:40',text:'**'+t+'** 当前待命中。给我下一个目标就继续。',done:true},
    ];
    return [
      {who:'in',from:'orc',time:'14:02',text:'**'+t+'** 正在推进中。\n\n小队分工：\n\n- 勘察源码结构\n- 跑回归测试\n\n有需要调整的地方吗？',done:true},
    ];
  }

  function Chat({onClose,onOpen,session,onEnterSession}){
    const {useState,useRef,useEffect}=React;
    const ctx=(window.buildChatCtx?window.buildChatCtx(session):null)||{key:'__room',title:window.DATA.room.sessionTitle,runtime:'claude',model:'Opus 4.8',npcs:window.DATA.room.npcs,source:'room'};
    const OPTS=window.RUNTIME_OPTS;
    const npc=(id)=>ctx.npcs.find(x=>x.id===id)||{name:id,hero:'knight_m',role:''};
    const npcName=(id)=>npc(id).name;
    const [msgs,setMsgs]=useState(()=>seedFor(ctx));
    const [draft,setDraft]=useState('');
    const [busy,setBusy]=useState(false);
    const [typing,setTyping]=useState(false);
    // ---- unified runtime config (one mode/effort set drives both runtimes) ----
    const [model,setModel]=useState(()=>OPTS.defaultModel[ctx.runtime]||ctx.model);
    const [mode,setMode]=useState(OPTS.defaultMode);
    const [effort,setEffort]=useState(OPTS.defaultEffort);
    const [cfgOpen,setCfgOpen]=useState(false);
    const efforts=ctx.runtime==='codex'?OPTS.efforts.slice(0,OPTS.codexEffortCount):OPTS.efforts;
    const curMode=OPTS.modes.find(m=>m.k===mode)||OPTS.modes[3];
    const threadRef=useRef(null);
    const timerRef=useRef(null);
    const replyIdx=useRef(0);
    const orch=ctx.npcs.find(n=>n.orchestrator)||ctx.npcs[0];
    const team=ctx.npcs.filter(n=>!n.orchestrator);
    const isAsk=ctx.source!=='room'&&!!ctx.ask;

    // codex only supports first 4 effort tiers — clamp if needed
    useEffect(()=>{ if(ctx.runtime==='codex'&&!efforts.find(e=>e.k===effort)) setEffort('high'); },[ctx.runtime]);
    useEffect(()=>{const el=threadRef.current;if(el)el.scrollTop=el.scrollHeight;},[msgs,typing]);
    useEffect(()=>()=>clearTimeout(timerRef.current),[]);

    const stream=(reply)=>{
      const full=typeof reply==='string'?reply:reply.text;
      setBusy(true);setTyping(true);
      timerRef.current=setTimeout(()=>{
        setTyping(false);
        setMsgs(m=>[...m,{who:'in',from:'orc',text:'',done:false,time:nowTime(),think:reply.think,cmds:reply.cmds}]);
        let i=0;
        const step=()=>{
          i+=2+Math.round(Math.random()*3);
          setMsgs(m=>{const c=m.slice();c[c.length-1]={...c[c.length-1],text:full.slice(0,i)};return c;});
          if(i<full.length){timerRef.current=setTimeout(step,26);}
          else{setMsgs(m=>{const c=m.slice();c[c.length-1]={...c[c.length-1],done:true};return c;});setBusy(false);}
        };
        timerRef.current=setTimeout(step,40);
      },900);
    };

    const sendText=(v)=>{
      v=(v||'').trim();if(!v||busy)return;
      setDraft('');
      setMsgs(m=>[...m,{who:'out',from:'me',text:v,done:true,time:nowTime()}]);
      const reply=AGENT_REPLIES[replyIdx.current%AGENT_REPLIES.length];replyIdx.current++;
      stream(reply);
    };

    const rollbackTo=(i)=>{ clearTimeout(timerRef.current);setBusy(false);setTyping(false);setMsgs(m=>m.slice(0,i)); };
    // per-message footer: timestamp · copy (text only) · rollback
    const msgFoot=(m,i)=>h('div',{key:'foot',className:'cmsg-foot'},[
      m.time&&h('span',{key:'t',className:'cmsg-time px'},m.time),
      h(CopyBtn,{key:'c',text:m.text,title:'复制此消息（不含思考/命令）'}),
      h('button',{key:'r',className:'cc-iconbtn',title:'回滚到此处',onClick:()=>rollbackTo(i)},'↺'),
    ]);

    const lastMsg=msgs[msgs.length-1];
    const askOpen=lastMsg&&lastMsg.ask;
    const RT=ctx.runtime==='codex'?['Codex','tag-codex']:['Claude','tag-claude'];

    return h('div',{className:'cdrawer-scrim',onClick:onClose},
      h('div',{className:'cdrawer',onClick:e=>e.stopPropagation()},[
        h('div',{key:'hd',className:'cdrawer-hd'},[
          h('div',{key:'av',className:'cdrawer-hd-av'},[
            h(PixelSprite,{key:'s',base:orch.hero,anim:busy?'run':'idle',scale:2.4,filter:GOLD_TINT}),
            h('span',{key:'d',className:'cdrawer-pres'+(busy?' busy':isAsk?' ask':'')}),
          ]),
          h('div',{key:'t',className:'cdrawer-titles'},[
            h('div',{key:'n',className:'cdrawer-name cjk'},ctx.title),
            h('div',{key:'m',className:'cdrawer-meta px'},[
              h('span',{key:'rt',className:'chip px '+RT[1],style:{fontSize:7,marginRight:6}},RT[0]),
              h('span',{key:'mm'},model+' · '+ctx.npcs.length+'P'),
            ]),
          ]),
          h('div',{key:'x',className:'closex px',onClick:onClose},'✕'),
        ]),
        // ---- session config bar: unified model / permission mode / effort ----
        h('div',{key:'cfg',className:'cdrawer-cfg'+(cfgOpen?' open':'')},[
          h('div',{key:'sum',className:'ccfg-sum',onClick:()=>setCfgOpen(o=>!o)},[
            h('span',{key:'m',className:'ccfg-pill'},[h(Icon,{key:'i',name:'crystal',size:12}),h('span',{key:'t'},model)]),
            h('span',{key:'pm',className:'ccfg-pill',style:{color:curMode.color}},[h(Icon,{key:'i',name:curMode.icon,size:12}),h('span',{key:'t'},curMode.label)]),
            h('span',{key:'e',className:'ccfg-pill'},'effort · '+effort),
            h('span',{key:'c',className:'ccfg-chev px'},cfgOpen?'▾':'⚙'),
          ]),
          cfgOpen&&h('div',{key:'body',className:'ccfg-body'},[
            h('div',{key:'mrow',className:'ccfg-row'},[
              h('div',{key:'l',className:'ccfg-label'},'模型 model'),
              h('select',{key:'s',className:'pxselect',value:model,onChange:e=>setModel(e.target.value)},OPTS.models[ctx.runtime].map(m=>h('option',{key:m,value:m},m))),
            ]),
            h('div',{key:'pmrow',className:'ccfg-row col'},[
              h('div',{key:'l',className:'ccfg-label'},'权限模式 permission'),
              h('div',{key:'g',className:'ccfg-modes'},OPTS.modes.map(m=>h('div',{key:m.k,className:'ccfg-mode'+(mode===m.k?' on':''),style:{'--mc':m.color},onClick:()=>setMode(m.k)},[
                h('div',{key:'i',className:'ccfg-mode-i'},h(Icon,{name:m.icon,size:15,glow:mode===m.k?m.color:null})),
                h('div',{key:'c',className:'ccfg-mode-c'},[
                  h('div',{key:'l',className:'ccfg-mode-l'},[h('span',{key:'l'},m.label),h('span',{key:'cx',className:'ccfg-mode-cx'},m.cx)]),
                  h('div',{key:'d',className:'ccfg-mode-d'},m.desc),
                ]),
              ]))),
            ]),
            h('div',{key:'erow',className:'ccfg-row'},[
              h('div',{key:'l',className:'ccfg-label'},'推理强度 effort'),
              h('div',{key:'seg',className:'seg sm ccfg-eff'},efforts.map(e=>h('div',{key:e.k,className:'seg-opt'+(effort===e.k?' on':''),onClick:()=>setEffort(e.k)},[h('span',{key:'k'},e.k),h('span',{key:'x',className:'ccfg-eff-cx'},e.cx)]))),
            ]),
            ctx.runtime==='codex'&&h('div',{key:'note',className:'ccfg-foot'},'Codex 仅支持 低 / 中 / 高 / 超高 四档强度；权限模式与 Claude 共用一套。'),
          ]),
        ]),
        // askuser banner — links this chat back to the stopped session
        isAsk&&h('div',{key:'askb',className:'cdrawer-askbar'},[
          h(Icon,{key:'i',name:'ask',size:16,glow:'#f2c84b'}),
          h('span',{key:'t',className:'cjk'},window.TL('该会话因 askuser 停下，等待你的回应','Paused on askuser — waiting for your reply')),
          onEnterSession&&session&&session.id&&h('button',{key:'b',className:'pxbtn sm cjk',onClick:()=>{onClose();onEnterSession(session);}},T('进入房间')),
        ]),
        // team presence strip
        h('div',{key:'team',className:'cdrawer-team'},[
          h('span',{key:'l',className:'cdrawer-team-l px'},T('小队')),
          ...[orch,...team].map((n,i)=>h('div',{key:n.id||i,className:'cdrawer-team-av'+(n.status==='done'?' ended':''),title:n.name+' · '+n.role},[
            h(PixelSprite,{key:'s',base:n.hero,anim:'idle',scale:1.6,filter:n.orchestrator?GOLD_TINT:(n.status==='done'?'grayscale(.85) brightness(.6)':undefined)}),
            h('span',{key:'d',className:'cdrawer-team-dot st-'+n.status}),
          ])),
        ]),
        h('div',{key:'th',className:'cdrawer-thread scroll',ref:threadRef},[
          ...msgs.map((m,i)=>m.who==='out'
            ? h('div',{key:i,className:'cmsg me'},[
                h(MdBlock,{key:'b',className:'cmsg-bubble md',html:mdToHtml(m.text)}),
                msgFoot(m,i),
              ])
            : h('div',{key:i,className:'cmsg agent'},[
                h('div',{key:'av',className:'cmsg-av'},h(PixelSprite,{base:npc(m.from).hero,anim:'idle',scale:1.8,filter:m.from==='orc'?GOLD_TINT:undefined})),
                h('div',{key:'c',className:'cmsg-c'},[
                  h('div',{key:'a',className:'cmsg-author'},[h('span',{key:'n'},npcName(m.from)),h('span',{key:'r',className:'cmsg-role px'},npc(m.from).role||'主控')]),
                  m.think&&h(ThinkBlock,{key:'think',text:m.think}),
                  m.cmds&&m.cmds.length>0&&h(CmdBlock,{key:'cmds',cmds:m.cmds}),
                  m.ask
                    ? h(AskTool,{key:'ask',ask:m.ask,busy,onAnswer:sendText})
                    : h(MdBlock,{key:'b',className:'cmsg-bubble md'+(m.from==='orc'?' orc':''),html:mdToHtml(m.text)+(m.done?'':'<span class="md-caret"></span>')}),
                  m.done&&!m.ask&&msgFoot(m,i),
                ]),
              ])
          ),
          typing&&h('div',{key:'typing',className:'cmsg agent'},[
            h('div',{key:'av',className:'cmsg-av'},h(PixelSprite,{base:orch.hero,anim:'idle',scale:1.8,filter:GOLD_TINT})),
            h('div',{key:'c',className:'cmsg-c'},[
              h('div',{key:'a',className:'cmsg-author'},[h('span',{key:'n'},orch.name),h('span',{key:'r',className:'cmsg-role px'},T('正在思考'))]),
              h('div',{key:'b',className:'cmsg-bubble typing'},[h('span',{key:1,className:'tdot'}),h('span',{key:2,className:'tdot'}),h('span',{key:3,className:'tdot'})]),
            ]),
          ]),
        ]),
        // quick replies (hidden while an ask tool is open — it has its own options)
        !askOpen&&h('div',{key:'qr',className:'cdrawer-quick'},QUICK_REPLIES.map((q,i)=>
          h('button',{key:i,className:'cquick cjk',disabled:busy,onClick:()=>sendText(q)},q)),
        ),
        h('div',{key:'in',className:'cdrawer-input'},[
          h('input',{key:'i',className:'pxinput',placeholder:busy?window.TL('生成中…','Generating…'):window.TL('输入消息…','Type a message…'),value:draft,disabled:busy,
            onChange:e=>setDraft(e.target.value),onKeyDown:e=>{if(e.key==='Enter')sendText(draft);}}),
          h('button',{key:'s',className:'pxbtn primary sm cjk',onClick:()=>sendText(draft),disabled:busy},busy?'…':T('发送')),
        ]),
      ])
    );
  }
  window.Chat=Chat;

  function ModelPanel({onClose}){
    const models=[['Opus 4.8','最强推理 · 1M 上下文','#f2c84b',true],['Sonnet 4.6','均衡 · 默认队友','#36c5e0',false],['Haiku 4.5','快速 · 低成本','#5fd35f',false]];
    return h(Modal,{title:'MODEL',sub:'切换会话模型',icon:'crystal',accent:'#36c5e0',onClose,width:720},
      h('div',{className:'model-list'},models.map(([n,d,c,sel],i)=>h('div',{key:i,className:'model-card'+(sel?' sel':''),style:{'--ac':c}},[
        h('div',{key:'ic',className:'model-ic'},h(Icon,{name:'crystal',size:32,glow:c})),
        h('div',{key:'m',className:'model-meta'},[h('div',{key:'n',className:'px',style:{fontSize:11,color:c}},n),h('div',{key:'d',className:'dim',style:{fontSize:12,marginTop:4}},d)]),
        sel&&h('div',{key:'s',className:'chip greenc'},T('当前')),
      ])))
    );
  }
  window.ModelPanel=ModelPanel;

  function ImportPanel({onClose}){
    const sessions=[['~/code/roguent','6 '+T('会话'),'#36c5e0'],['~/code/api-gateway','3 '+T('会话'),'#a06cd5'],['~/code/mobile','2 '+T('会话'),'#5fd35f']];
    return h(Modal,{title:'IMPORT',sub:'导入本地会话',icon:'import',accent:'#f2c84b',onClose,width:760},
      h('div',{className:'import-wrap'},[
        h('div',{key:'h',className:'dim',style:{marginBottom:14}},T('扫描到的本地 Claude Code 项目：')),
        ...sessions.map(([p,c,col],i)=>h('div',{key:i,className:'import-row'},[h(Icon,{key:'i',name:'import',size:22,glow:col}),h('code',{key:'p',className:'import-path'},p),h('span',{key:'c',className:'chip px',style:{fontSize:9}},c),h('button',{key:'b',className:'pxbtn gold sm cjk'},T('导入'))])),
      ])
    );
  }
  window.ImportPanel=ImportPanel;

  function Account({onClose}){
    const a=DATA.account;
    let hero='knight_m'; try{hero=localStorage.getItem('roguent_hero')||a.hero||'knight_m';}catch(e){hero=a.hero||'knight_m';}
    const ctx=a.selectedCtx;
    const ctxColor=ctx<60?'#5fd35f':ctx<=85?'#f2c84b':'#ff4d6d';
    const usage=[
      {label:'5h',used:a.fiveH.used,reset:a.fiveH.resetIn,color:'#ff4d6d',icon:'heart',note:'滚动 5 小时窗口'},
      {label:'Weekly',used:a.week.used,reset:a.week.resetIn,color:'#36c5e0',icon:'gemcur',note:'每周一 00:00 重置'},
    ];
    return h(Modal,{title:'PROFILE',sub:'个人详情 · 订阅与用量',icon:'account',onClose,width:560},
      h('div',{className:'acct2'},[
        // ---- hero banner with ornate frame + decorations ----
        h('div',{key:'hero',className:'acct2-hero'},[
          h('div',{key:'fr',className:'acct2-frame'},[
            h('div',{key:'cr',className:'acct2-crown'},h(window.PixelCrown,{w:48,h:24})),
            h('div',{key:'p',className:'acct2-portrait'},h(PixelSprite,{base:hero,anim:'idle',scale:5.4,filter:GOLD_TINT})),
            h('div',{key:'cn',className:'acct2-corners'}),
            h('div',{key:'lv',className:'acct2-level px'},'Lv '+(a.level||47)),
          ]),
          h('div',{key:'id',className:'acct2-id'},[
            h('div',{key:'n',className:'acct2-name px'},a.name||'指挥官'),
            h('div',{key:'pl',className:'acct2-plan px'},[h('span',{key:'g',className:'gold'},'Claude'),h('span',{key:'d'},' · '+a.plan+' '+T('计划'))]),
            h('div',{key:'h',className:'acct2-handle px'},a.handle||'orc@roguent'),
            // context-window XP echo
            h('div',{key:'xp',className:'acct2-xprow'},[
              h(Icon,{key:'i',name:'gem',size:16}),
              h('span',{key:'l',className:'acct2-xplab px'},'Context'),
              h('div',{key:'b',className:'acct2-xpbar'},h('div',{className:'acct2-xpfill',style:{width:ctx+'%',background:'linear-gradient(180deg,#ffe79a,'+ctxColor+' 55%,rgba(0,0,0,.25))'}})),
              h('span',{key:'v',className:'px',style:{fontSize:9,color:ctxColor,minWidth:30,textAlign:'right'}},ctx+'%'),
            ]),
          ]),
        ]),
        // ---- usage limits (5h / week) ----
        h('div',{key:'us',className:'acct2-usage'},[
          h('div',{key:'h',className:'acct2-sec px'},'Usage'),
          ...usage.map((u,i)=>h('div',{key:i,className:'acct2-urow'},[
            h('div',{key:'ic',className:'acct2-uicon'},h(Icon,{name:u.icon,size:18})),
            h('div',{key:'c',className:'acct2-ucol'},[
              h('div',{key:'t',className:'acct2-utop'},[
                h('span',{key:'l',className:'px'},u.label),
                h('span',{key:'v',className:'px',style:{color:u.color}},u.used+'% '+T('已用')),
              ]),
              h('div',{key:'b',className:'acct2-ubar'},h('div',{className:'acct2-ufill',style:{width:u.used+'%',background:u.color}})),
              h('div',{key:'r',className:'acct2-ureset px'},[
                h('span',{key:'a'},'Resets in '+u.reset),
                h('span',{key:'b',className:'faint cjk'},T(u.note)+' · '+T('剩余')+' '+(100-u.used)+'%'),
              ]),
            ]),
          ])),
        ]),
        h('div',{key:'act',className:'npccard-act'},[h('button',{key:'l',className:'pxbtn cjk'},'/login'),h('button',{key:'o',className:'pxbtn cjk',style:{color:'#ff8197'}},T('登出'))]),
      ])
    );
  }
  window.Account=Account;

  // ---- version / changelog / update-check modal ----
  function UpdateModal({onClose}){
    const {useState,useRef,useEffect}=React;
    const [status,setStatus]=useState('idle'); // idle | checking | found | done
    const tmr=useRef(null);
    useEffect(()=>()=>clearTimeout(tmr.current),[]);
    const check=()=>{ if(status==='checking')return; setStatus('checking'); tmr.current=setTimeout(()=>setStatus('found'),1300); };
    const install=()=>{ setStatus('installing'); tmr.current=setTimeout(()=>setStatus('done'),1100); };
    const CHANGELOG=[
      {v:'v1.0',tag:'NEW',accent:'#5fd35f',avail:true,notes:['agent teams 正式版 · tmux 队友模式','/oracle 技能上线','1M 上下文阈值自动压缩优化']},
      {v:'v0.9',accent:'#36c5e0',notes:['大厅 / 内景像素美术升级','召唤法阵 · 昼夜光照 · 氛围预设','聊天气泡像素化 · 实时可调氛围']},
      {v:'v0.8',accent:'#8a8170',notes:['本地双 runtime 调度台','扭蛋 / 成就 / 排行榜 / 邮箱面板']},
    ];
    const subline=status==='found'?window.TL('发现新版本 v1.0 可用','New version v1.0 available'):status==='installing'?window.TL('正在升级 runtime…','Upgrading runtime…'):status==='done'?window.TL('已更新到 v1.0 · 已是最新','Updated to v1.0 · up to date'):window.TL('当前版本 · prototype','Current · prototype');
    return h(Modal,{title:'UPDATE',sub:'版本与更新日志',icon:'spellbook',accent:'#a06cd5',onClose,width:600},
      h('div',{className:'upd-wrap'},[
        h('div',{key:'cur',className:'upd-cur'},[
          h('div',{key:'l',className:'upd-cur-l'},[
            h('div',{key:'logo',className:'upd-logo px'},'R'),
            h('div',{key:'m',className:'upd-cur-m'},[
              h('div',{key:'1',className:'px',style:{fontSize:14,color:'#f2c84b'}},'Roguent v0.9'),
              h('div',{key:'2',className:'faint',style:{fontSize:11,marginTop:4}},subline),
            ]),
          ]),
          status==='found'?h('button',{key:'b',className:'pxbtn primary sm cjk',onClick:install},T('立即更新 v1.0'))
          :status==='done'?h('div',{key:'b',className:'upd-done px'},[h(Icon,{key:'i',name:'task',size:14,glow:'#5fd35f',style:{marginRight:6}}),T('已是最新')])
          :h('button',{key:'b',className:'pxbtn gold sm cjk',onClick:check,disabled:status==='checking'||status==='installing'},
              (status==='checking'||status==='installing')?[h('span',{key:'s',className:'upd-spin'}),status==='installing'?window.TL('升级中…','Upgrading…'):window.TL('检查中…','Checking…')]:[h(Icon,{key:'i',name:'import',size:14,style:{marginRight:6}}),T('检查更新')]),
        ]),
        status==='found'&&h('div',{key:'banner',className:'upd-banner'},[h(Icon,{key:'i',name:'crystal',size:16,glow:'#5fd35f'}),h('span',{key:'t',className:'cjk'},'v1.0 已就绪 · 订阅者可一键升级 runtime，会话进度不丢失')]),
        h('div',{key:'log',className:'upd-log scroll'},CHANGELOG.map((c,i)=>
          h('div',{key:i,className:'upd-entry'},[
            h('div',{key:'h',className:'upd-entry-h'},[
              h('span',{key:'v',className:'upd-ver px',style:{'--ac':c.accent}},c.v),
              c.tag&&h('span',{key:'t',className:'upd-tag px'},status==='done'&&i===0?T('已安装'):c.tag),
              i===(status==='found'||status==='done'?-1:0)&&h('span',{key:'cur',className:'faint',style:{fontSize:10,marginLeft:'auto'}},T('当前')),
            ]),
            h('ul',{key:'n',className:'upd-notes'},c.notes.map((n,j)=>h('li',{key:j},n))),
          ]))),
        h('div',{key:'tip',className:'faint',style:{fontSize:11,textAlign:'center',marginTop:4}},'原型演示 · 更新流程为模拟，不会真的改动你的本地 runtime'),
      ])
    );
  }
  window.UpdateModal=UpdateModal;

  function About({onClose,onCheckUpdate}){
    return h(Modal,{title:'ABOUT',sub:'关于 Roguent',icon:'spellbook',accent:'#a06cd5',onClose,width:680,vibe:'talent'},
      h('div',{style:{textAlign:'center',padding:'10px 20px'}},[
        h('div',{key:'l',className:'px',style:{fontSize:24,color:'#f2c84b',marginBottom:10}},'ROGUENT'),
        h('div',{key:'v',className:'faint px about-ver',style:{fontSize:9,marginBottom:20,cursor:'pointer'},onClick:onCheckUpdate,title:'点击查看更新日志'},'v0.9 · prototype'),
        h('div',{key:'d',className:'dim',style:{lineHeight:1.8}},'本地 Claude Code 双 runtime 的中央调度平台。把 vibe coding 渲染成一屋子像素小人在地牢里干活。'),
        h('div',{key:'c',className:'faint',style:{marginTop:20,fontSize:12}},'像素美术：0x72 DungeonTilesetII (CC0) · 致敬《元气骑士》'),
        onCheckUpdate&&h('button',{key:'u',className:'pxbtn sm cjk',style:{marginTop:22},onClick:onCheckUpdate},[h(Icon,{key:'i',name:'import',size:14,style:{marginRight:6}}),T('检查更新')]),
      ])
    );
  }
  window.About=About;
})();
