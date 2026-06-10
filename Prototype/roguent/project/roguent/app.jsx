/* ROGUENT root app — state, panel routing, stage scaler, tweaks. */
(function(){
  const {useState,useEffect,useCallback}=React;
  const h=React.createElement;
  const {useTweaks,TweaksPanel,TweakSection,TweakColor,TweakRadio,TweakToggle}=window;

  function useStageScale(){
    useEffect(()=>{
      const stage=document.getElementById('stage');
      const fit=()=>{const s=Math.min(window.innerWidth/1920,window.innerHeight/1080);stage.style.transform=`translate(-50%,-50%) scale(${s})`;};
      fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);
    },[]);
  }

  const PANELS={
    npc:window.NpcCard, tasks:window.Tasks, settings:window.Settings, skills:window.Skills,
    shop:window.Shop, leaderboard:window.Leaderboard, backpack:window.Backpack, chat:window.Chat,
    model:window.ModelPanel, import:window.ImportPanel, account:window.Account, about:window.About,
    achievements:window.Achievements, mailbox:window.Mailbox, gacha:window.Gacha, pairing:window.Pairing, announce:window.Announce,
  };
  const PANEL_KEYS=['tasks','settings','skills','shop','leaderboard','menu','account','chat','model','import','backpack','npc','sessiongrid','achievements','mailbox','gacha','pairing','announce'];

  const TWEAK_DEFAULTS={accent:'#36c5e0', theme:'深青', motion:true, density:'舒适', cjkPixel:true};
  const THEME={'深青':'teal','森林':'forest','赛博':'cyber'};
  const GLOW={teal:'rgba(54,170,210,.22)',forest:'rgba(95,211,95,.2)',cyber:'rgba(160,108,213,.24)'};
  const LS=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:v;}catch(e){return d;}};
  const FONTCLS={'像素':'','系统':'font-sys','等宽':'font-mono'};
  const FXCLS={'关':'fx-off','弱':'fx-low','标准':'','强':'fx-high'};
  const DENF={'稀疏':0.5,'标准':1,'密集':1.8};
  const TODCLS={'白天':'tod-day','黄昏':'tod-dusk','夜晚':'tod-night'};
  const autoTod=()=>{const h=new Date().getHours();return h>=6&&h<16?'tod-day':h<19?'tod-dusk':'tod-night';};
  const PRESETS=[
    {id:'标准',rune:'#36c5e0',fx:'标准',den:'标准',day:'自动',link:false},
    {id:'暗夜',rune:'#a06cd5',fx:'强',den:'标准',day:'夜晚',link:true},
    {id:'节日',rune:'#ff6a8a',fx:'强',den:'密集',day:'黄昏',link:true},
    {id:'极简',rune:'#36c5e0',fx:'关',den:'稀疏',day:'白天',link:false},
  ];

  function App(){
    useStageScale();
    const [t,setTweak]=useTweaks(TWEAK_DEFAULTS);
    const _hash=(location.hash||'').replace('#','');
    const [view,setView]=useState(['lobby','empty','interior'].includes(_hash)?_hash:'interior');
    const [panel,setPanel]=useState(PANEL_KEYS.includes(_hash)?_hash:null);
    const [selected,setSelected]=useState(_hash==='npc'?'elf':'orc');
    const [transition,setTransition]=useState(_hash==='transition'?{top:'正在召集小队…',bottom:'普通模式下有一定概率遇到精英首领'}:null);
    const [guideOpen,setGuideOpen]=useState(false);
    const [runtime,setRuntime]=useState('all');
    const [sgRt,setSgRt]=useState('all');
    const [chatCtx,setChatCtx]=useState(null);
    const [cheat,setCheat]=useState(false);
    const [showUpdate,setShowUpdate]=useState(false);
    // konami easter egg → DEBUG MODE coin shower
    useEffect(()=>{
      const seq=['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
      let i=0;
      const onKey=(e)=>{
        const k=e.key.toLowerCase();
        if(k===seq[i]){ i++; if(i===seq.length){ i=0; setCheat(true); setTimeout(()=>setCheat(false),4200); } }
        else { i = (k===seq[0])?1:0; }
      };
      window.addEventListener('keydown',onKey);
      return ()=>window.removeEventListener('keydown',onKey);
    },[]);
    // ---- new global UI state ----
    const [booted,setBooted]=useState(LS('roguent_booted','0')==='1' || ['lobby','empty','interior'].includes(_hash));
    const [mainHero,setMainHeroRaw]=useState(LS('roguent_hero',''));
    const [uiLang,setUiLangRaw]=useState(LS('roguent_lang','中文'));
    const [uiFont,setUiFontRaw]=useState(LS('roguent_font','像素'));
    // ---- world ambiance (live FX, adjustable in Settings) ----
    const [ambRune,setAmbRuneRaw]=useState(LS('roguent_rune','#36c5e0'));
    const [ambFx,setAmbFxRaw]=useState(LS('roguent_fx','标准'));
    const [ambDen,setAmbDenRaw]=useState(LS('roguent_den','标准'));
    const [ambDay,setAmbDayRaw]=useState(LS('roguent_day','自动'));
    const [ambLink,setAmbLinkRaw]=useState(LS('roguent_link','0')==='1');
    const setAmbRune=(v)=>{setAmbRuneRaw(v);try{localStorage.setItem('roguent_rune',v);}catch(e){}};
    const setAmbFx=(v)=>{setAmbFxRaw(v);try{localStorage.setItem('roguent_fx',v);}catch(e){}};
    const setAmbDen=(v)=>{setAmbDenRaw(v);try{localStorage.setItem('roguent_den',v);}catch(e){}};
    const setAmbDay=(v)=>{setAmbDayRaw(v);try{localStorage.setItem('roguent_day',v);}catch(e){}};
    const setAmbLink=(v)=>{setAmbLinkRaw(v);try{localStorage.setItem('roguent_link',v?'1':'0');}catch(e){}};
    const applyPreset=(p)=>{ setAmbRune(p.rune);setAmbFx(p.fx);setAmbDen(p.den);setAmbDay(p.day); if(p.link!=null)setAmbLink(p.link); };
    const setMainHero=(hp)=>{const id=typeof hp==='string'?hp:hp.hero;setMainHeroRaw(id);try{localStorage.setItem('roguent_hero',id);}catch(e){}};
    const setUiLang=(v)=>{setUiLangRaw(v);try{localStorage.setItem('roguent_lang',v);}catch(e){}};
    const setUiFont=(v)=>{setUiFontRaw(v);try{localStorage.setItem('roguent_font',v);}catch(e){}};
    const L=DATA.i18n[uiLang==='English'?'en':'cn'];
    // ---- login activity popup (登录活动弹窗) ----
    const seenToday=LS('roguent_events_seen','')===new Date().toDateString();
    const [showEvents,setShowEvents]=useState(false);
    useEffect(()=>{
      if(booted&&!seenToday){const tm=setTimeout(()=>setShowEvents(true),700);return()=>clearTimeout(tm);}
    },[booted]);

    const room=DATA.room;
    const selNpc=room.npcs.find(n=>n.id===selected)||room.npcs[0];
    const open=useCallback((k,arg)=>{
      if(k==='transition'){setTransition({top:'聚焦中…',bottom:'暂停 · 点击继续'});}
      else if(k==='sessiongrid'){setSgRt(arg||'all');setPanel('sessiongrid');}
      else if(k==='chat'){setChatCtx(arg||null);setPanel('chat');}
      else if(k==='events'){setShowEvents(true);}
      else if(k==='update'){setShowUpdate(true);}
      else setPanel(k);
    },[]);
    const closePanel=()=>setPanel(null);

    const go=(kind,arg)=>{
      setPanel(null);setTransition(null);
      if(kind==='login'){setBooted(false);try{localStorage.setItem('roguent_booted','0');}catch(e){}return;}
      if(kind==='interior'){setView('interior');}
      else if(kind==='lobby'){setView('lobby');}
      else if(kind==='empty'){setView('empty');}
      else if(kind==='error'){setView('interior');setPanel('error');}
      else if(kind==='transition'){setTransition({top:'正在召集小队…',bottom:'普通模式下有一定概率遇到精英首领'});}
      else if(kind==='panel'){ if(arg==='sessiongrid'){setView('lobby');} else if(view!=='interior')setView('interior');
        if(arg==='npc'){setSelected('elf');setPanel('npc');} else if(arg==='menu'){setPanel('menu');} else setPanel(arg); }
      setGuideOpen(false);
    };

    const enterSession=(s)=>{ setPanel(null);
      setTransition({top:'进入 '+s.project+' · '+s.title,bottom:s.agents+'P · '+s.model});
      setTimeout(()=>{setView('interior');setTransition(null);},1500); };

    const badges={tasks:DATA.room.npcs.filter(n=>n.status==='askuser'||n.status==='todo').length, backpack:5, shop:true};

    const todClass=ambDay==='自动'?autoTod():(TODCLS[ambDay]||'');
    const rootClass=['stage-root','room-'+(THEME[t.theme]||'teal'),t.motion?'':'no-motion',t.density==='紧凑'?'hud-compact':'',t.cjkPixel?'':'cjk-sys',FONTCLS[uiFont]||'',FXCLS[ambFx]||'',todClass,ambLink?'link-accent':''].filter(Boolean).join(' ');
    const rootStyle={'--accent':ambLink?ambRune:t.accent,'--core-glow':GLOW[THEME[t.theme]||'teal'],'--rune':ambRune};
    if(ambLink){ rootStyle['--cyan']=ambRune; }
    const denFactor=DENF[ambDen]!=null?DENF[ambDen]:1;

    // ---- login gate (§12) ----
    const startBoot=(hero)=>{if(hero)setMainHero(hero);setBooted(true);try{localStorage.setItem('roguent_booted','1');}catch(e){}setView('lobby');setPanel(null);};
    if(!booted){
      return h('div',{id:'stage-root',className:rootClass,style:rootStyle},
        h(window.LoginScreen,{key:'login',onStart:startBoot,mainHero,L}));
    }

    return h('div',{id:'stage-root',className:rootClass,style:rootStyle},[
      // ---- world / view ----
      view==='interior'&&h(window.World,{key:'world',theme:{floor:'#243a40',rune:ambRune},density:denFactor,npcs:room.npcs,selected,onSelect:(id)=>{setSelected(id);setPanel('npc');},onBg:()=>setSelected(null)}),
      view==='lobby'&&h(window.Lobby,{key:'lobby',onOpen:open,onEnterSession:enterSession,runtime,mainHero,onPickHero:setMainHero,density:denFactor,L}),
      view==='empty'&&h(window.EmptyState,{key:'empty',onSummon:()=>{setTransition({top:'正在召集小队…',bottom:'普通模式下有一定概率遇到精英首领'});setTimeout(()=>{setTransition(null);setView('interior');},1600);}}),

      // ---- HUD ----
      (view==='interior'||view==='lobby')&&h('div',{key:'hud',className:'hud'},[
        h('div',{key:'tl',className:'hud-tl'},[
          h(window.LimitBars,{key:'bars',account:DATA.account,mainHero,onOpen:open}),
          view==='interior'&&h(window.RosterCard,{key:'roster',npcs:room.npcs,selected,onSelect:setSelected}),
          h('div',{key:'view',className:'view-switch'},[
            h('div',{key:'i',className:'vs-opt'+(view==='interior'?' on':''),onClick:()=>setView('interior')},L.interior),
            h('div',{key:'l',className:'vs-opt'+(view==='lobby'?' on':''),onClick:()=>setView('lobby')},L.lobby),
          ]),
          view==='interior'&&h(window.TaskWindow,{key:'tw',onOpen:open}),
        ]),
        view==='interior'&&h('div',{key:'tc',className:'hud-tc'},h(window.SessionBanner,{room})),
        h('div',{key:'tr',className:'hud-tr'},[
          h(window.Currency,{key:'cur',currency:DATA.currency,runtime,onRuntime:setRuntime}),
          h(window.ButtonDock,{key:'dock',onOpen:open,L}),
        ]),
        view==='interior'&&h('div',{key:'bl',className:'hud-bl'},h(window.Minimap,{npcs:room.npcs,selected})),
        view==='interior'&&h('div',{key:'bc',className:'hud-bc'},h(window.Hotbar,{onOpen:open,badges,L})),
      ]),

      // ---- panels ----
      panel==='npc'&&h(window.NpcCard,{key:'np',npc:selNpc,onClose:closePanel,onOpen:open}),
      panel==='sessiongrid'&&h(window.SessionGrid,{key:'sg',runtime:sgRt,onClose:closePanel,onEnter:enterSession,onImport:()=>setPanel('import'),onOpen:open}),
      panel==='settings'&&h(window.Settings,{key:'settings',onClose:closePanel,onOpen:open,uiLang,onUiLang:setUiLang,uiFont,onUiFont:setUiFont,mainHero,onPickHero:setMainHero,ambRune,onAmbRune:setAmbRune,ambFx,onAmbFx:setAmbFx,ambDen,onAmbDen:setAmbDen,ambDay,onAmbDay:setAmbDay,ambLink,onAmbLink:setAmbLink,presets:PRESETS,onPreset:applyPreset,onCheckUpdate:()=>setShowUpdate(true)}),
      panel==='chat'&&h(window.Chat,{key:'chat',onClose:closePanel,onOpen:open,session:chatCtx,onEnterSession:enterSession}),
      panel==='about'&&h(window.About,{key:'about',onClose:closePanel,onCheckUpdate:()=>setShowUpdate(true)}),
      panel&&!['npc','menu','error','sessiongrid','settings','chat','about'].includes(panel)&&PANELS[panel]&&h(PANELS[panel],{key:panel,onClose:closePanel,onOpen:open}),
      panel==='menu'&&h(window.SystemMenu,{key:'menu',onClose:closePanel,onOpen:open}),
      panel==='error'&&h(window.ErrorOverlay,{key:'err',onRetry:closePanel,onClose:closePanel}),
      // ---- update / changelog modal ----
      showUpdate&&h(window.UpdateModal,{key:'update',onClose:()=>setShowUpdate(false)}),

      // ---- login activity popup ----
      showEvents&&h(window.LoginEvents,{key:'events',onClose:()=>setShowEvents(false),onOpen:open}),

      // ---- transition ----
      transition&&h(window.Transition,{key:'tr',top:transition.top,bottom:transition.bottom,onClose:()=>setTransition(null)}),

      // ---- konami DEBUG MODE easter egg ----
      cheat&&h('div',{key:'cheat',className:'cheat-overlay'},[
        h('div',{key:'toast',className:'cheat-toast'},[
          h(window.Icon,{key:'i',name:'bash',size:22,glow:'#5fd35f'}),
          h('span',{key:'t',className:'px'},'DEBUG MODE'),
          h('span',{key:'s',className:'cjk'},'作弊码已激活 · 无限 token'),
        ]),
        ...[...Array(36)].map((_,i)=>h('div',{key:'co'+i,className:'cheat-coin',
          style:{left:(Math.random()*100)+'%',animationDelay:(Math.random()*1.3).toFixed(2)+'s',animationDuration:(1.6+Math.random()*1.5).toFixed(2)+'s'}},
          h(window.PixelSprite,{name:'coin_anim_f'+(i%4),scale:4}))),
      ]),

      // ---- guide ----
      h(window.Guide,{key:'guide',open:guideOpen,onToggle:()=>setGuideOpen(o=>!o),go}),

      // ---- tweaks ----
      h(TweaksPanel,{key:'tweaks'},[
        h(TweakSection,{key:'s1',label:'外观 Appearance'}),
        h(TweakColor,{key:'accent',label:'强调色 Accent',value:t.accent,options:['#36c5e0','#f2c84b','#ff4d6d','#a06cd5','#5fd35f'],onChange:v=>setTweak('accent',v)}),
        h(TweakRadio,{key:'theme',label:'房间主题',value:t.theme,options:['深青','森林','赛博'],onChange:v=>setTweak('theme',v)}),
        h(TweakSection,{key:'s2',label:'界面 Interface'}),
        h(TweakRadio,{key:'density',label:'HUD 密度',value:t.density,options:['舒适','紧凑'],onChange:v=>setTweak('density',v)}),
        h(TweakToggle,{key:'cjk',label:'像素中文字体',value:t.cjkPixel,onChange:v=>setTweak('cjkPixel',v)}),
        h(TweakToggle,{key:'motion',label:'动效',value:t.motion,onChange:v=>setTweak('motion',v)}),
      ]),
    ]);
  }
  window.RoguentApp=App;
})();
