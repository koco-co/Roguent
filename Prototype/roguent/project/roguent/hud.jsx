/* ROGUENT HUD + world. Globals: React, Icon, PixelSprite, Room, DATA. */
(function(){
  const {useState}=React;
  const T=window.T;
  const GOLD_TINT='sepia(1) saturate(3.2) hue-rotate(-18deg) brightness(1.08) contrast(1.05)';

  // ---------- custom pixel cat pet (no cat in atlas) ----------
  function CatPet({scale=4}){
    const t=window.useSpriteTick();
    const tail=(Math.floor(t/2)%2)===0;
    const px=scale, O='#15131c', body='#2b2733', hi='#3d3947', eye='#36c5e0';
    let _k=0;
    const R=(x,y,w,h,c)=>React.createElement('rect',{key:_k++,x,y,width:w,height:h,fill:c});
    const cells=[
      R(4,2,1,2,O),R(7,2,1,2,O),R(4,3,4,1,O), // ears
      R(3,4,6,4,body),R(3,4,6,1,O),R(3,7,6,1,O),R(3,4,1,4,O),R(8,4,1,4,O),
      R(4,5,1,1,eye),R(7,5,1,1,eye),R(4,4,4,1,hi),
      R(4,8,5,3,body),R(4,8,5,1,O),R(4,10,5,1,O),R(3,8,1,3,O),R(9,8,1,3,O),
      R(4,11,1,2,O),R(8,11,1,2,O), // legs
      tail?R(10,6,2,1,O):R(10,5,1,3,O),
      tail?R(11,4,1,3,O):R(11,7,2,1,O),
    ];
    return React.createElement('svg',{width:14*px,height:14*px,viewBox:'0 0 14 14',style:{shapeRendering:'crispEdges',imageRendering:'pixelated'}},cells);
  }

  function utilColor(u){return u<20?'#5fd35f':u<=80?'#f2c84b':'#ff4d6d';}

  // ---------- pettable cat (easter egg: click → hop + hearts) ----------
  function PetActor({scale=4}){
    const {useState,useRef}=React;
    const [hearts,setHearts]=useState([]);
    const [hop,setHop]=useState(false);
    const idRef=useRef(0), cnt=useRef(0);
    const pet=(e)=>{
      e.stopPropagation();
      cnt.current++;
      const id=idRef.current++;
      const rainbow=cnt.current%10===0;
      setHearts(hs=>[...hs,{id,x:(Math.random()*34-17)|0,rainbow}]);
      setHop(true); setTimeout(()=>setHop(false),360);
      setTimeout(()=>setHearts(hs=>hs.filter(h=>h.id!==id)),1100);
    };
    return React.createElement('div',{className:'petactor'+(hop?' hop':''),onClick:pet,title:'撸一下'},[
      React.createElement(CatPet,{key:'c',scale}),
      ...hearts.map(h=>React.createElement('div',{key:h.id,className:'pet-heart'+(h.rainbow?' rainbow':''),style:{'--hx':h.x+'px'}},
        React.createElement(Icon,{name:'heart',size:14,glow:h.rainbow?'#a06cd5':'#ff4d6d'}))),
    ]);
  }
  window.PetActor=PetActor;

  // ---------- interior idle quips (speech bubbles over working agents) ----------
  const QUIPS={
    working:['跑测试中…','编译通过 ✓','推进中…','改 mapping.ts','bun install…','git add -A'],
    thinking:['让我想想…','勘察源码…','在读 README','规划方案…'],
    askuser:['等你拍板','bun 还是 npm？','要我继续吗？'],
    todo:['排队中…','待领取','马上开工'],
    done:['收工 ✓','搞定！','已提交 PR'],
    error:['出错了…','重试中','看下日志'],
    idle:['摸鱼中…','待命'],
  };
  function QuipLayer({npcs}){
    const {useState,useEffect}=React;
    const [q,setQ]=useState(null);
    useEffect(()=>{
      let alive=true,t1,t2;
      const tick=()=>{
        const n=npcs[(Math.random()*npcs.length)|0];
        const pool=QUIPS[n.status]||QUIPS.working;
        setQ({id:Date.now(),x:n.x,y:n.y,text:pool[(Math.random()*pool.length)|0]});
        t2=setTimeout(()=>{if(alive)setQ(null);},2800);
        t1=setTimeout(tick,3600+Math.random()*2600);
      };
      t1=setTimeout(tick,1400);
      return()=>{alive=false;clearTimeout(t1);clearTimeout(t2);};
    },[npcs]);
    if(!q) return null;
    return React.createElement('div',{className:'quip',style:{left:q.x+'%',top:q.y+'%'}},
      React.createElement('div',{className:'quip-bubble cjk',key:q.id},q.text));
  }
  window.QuipLayer=QuipLayer;

  // ---------- mimic chest (lobby easter egg: looks like loot, snaps when clicked) ----------
  function MimicChest({scale=4}){
    const {useState}=React;
    const [snap,setSnap]=useState(false);
    const bite=(e)=>{
      e.stopPropagation();
      if(snap) return;
      setSnap(true);
      try{localStorage.setItem('roguent_mimic','1');}catch(err){}
      setTimeout(()=>setSnap(false),950);
    };
    return React.createElement('div',{className:'mimic'+(snap?' snap':''),onClick:bite,title:'宝箱'},[
      React.createElement(PixelSprite,{key:'c',name:snap?'chest_mimic_open_anim_f1':'chest_full_open_anim_f0',scale}),
      snap&&React.createElement('div',{key:'b',className:'mimic-pop px'},'?!'),
    ]);
  }
  window.MimicChest=MimicChest;

  // ---------- wishing fountain (easter egg: click the fountain to toss a coin) ----------
  function WishingSpot({style}){
    const {useState,useRef}=React;
    const [fx,setFx]=useState([]);
    const idRef=useRef(0);
    const wish=(e)=>{
      e.stopPropagation();
      const id=idRef.current++;
      let n=id+1; try{n=(parseInt(localStorage.getItem('roguent_wish')||'0',10)||0)+1;localStorage.setItem('roguent_wish',String(n));}catch(err){}
      const lucky=n%7===0;
      setFx(f=>[...f,{id,lucky,n}]);
      setTimeout(()=>setFx(f=>f.filter(x=>x.id!==id)),1300);
    };
    return React.createElement('div',{className:'wish-spot',style,onClick:wish,title:'许愿'},
      fx.map(w=>React.createElement('div',{key:w.id,className:'wish-fx'+(w.lucky?' lucky':'')},[
        React.createElement('div',{key:'r',className:'wish-ring'}),
        React.createElement('div',{key:'c',className:'wish-coin'},React.createElement(PixelSprite,{name:'coin_anim_f0',scale:4})),
        React.createElement('div',{key:'t',className:'wish-txt px'},w.lucky?('★ 福气 +'+w.n):'+1 福气'),
      ]))
    );
  }
  window.WishingSpot=WishingSpot;

  // ---------- NPC overhead + sprite ----------
  function Npc({npc, selected, onSelect}){
    const t=window.useSpriteTick();
    const isOrc=npc.orchestrator;
    const scale=isOrc?5.5:4.5;
    let statusIcon=null, glow=null, pulse=false, showDots=false, showCompact=false;
    if(npc.compacting){showCompact=true;}
    else if(npc.status==='askuser'){statusIcon='ask';glow='#36c5e0';pulse=true;}
    else if(npc.status==='todo'){statusIcon='todo';glow='#f2c84b';}
    else if(npc.status==='working'&&npc.tool){statusIcon=npc.tool;glow='#36c5e0';}
    else if(npc.status==='thinking'){showDots=true;}
    else if(npc.status==='idle'){statusIcon='idle';}
    else if(npc.status==='done'){statusIcon='done';glow='#5fd35f';}
    else if(npc.status==='error'){statusIcon='error';glow='#ff4d6d';}
    const anim=npc.status==='working'?'run':'idle';
    const bob=npc.status==='idle'?Math.sin(t/3)*1.5:0;

    return React.createElement('div',{
      className:'npc'+(selected?' npc-sel':''),
      style:{left:npc.x+'%',top:npc.y+'%'},
      onClick:(e)=>{e.stopPropagation();onSelect(npc.id);},
    },[
      // overhead stack
      React.createElement('div',{key:'oh',className:'npc-over'},[
        React.createElement('div',{key:'nm',className:'npc-name px'},[
          isOrc&&React.createElement('span',{key:'star',className:'gold'},'★ '),npc.name,
        ]),
        React.createElement('div',{key:'ub',className:'util'},[
          React.createElement('div',{key:'f',className:'fill',style:{width:npc.util+'%',background:utilColor(npc.util)}}),
          React.createElement('div',{key:'tk',className:'tick',style:{left:'20%'}}),
        ]),
        React.createElement('div',{key:'slot',className:'npc-slot'+(pulse?' askpulse':'')},[
          showCompact&&React.createElement('div',{key:'c',className:'compact-chip px'},[React.createElement(Icon,{key:'i',name:'compact',size:14}),T('压缩中')]),
          showDots&&React.createElement('div',{key:'d',className:'think-dots'},['●','●','●'].map((d,i)=>React.createElement('span',{key:i,style:{animationDelay:(i*0.18)+'s'}},d))),
          statusIcon&&React.createElement('div',{key:'si',className:'slot-bubble'},React.createElement(Icon,{name:statusIcon,size:22,glow})),
        ]),
      ]),
      // aura ring for orchestrator / selection
      (isOrc||selected)&&React.createElement('div',{key:'ring',className:'npc-ring',style:{boxShadow:isOrc?'0 0 0 2px #f2c84b88':'0 0 0 2px #36c5e0'}}),
      // sprite
      React.createElement('div',{key:'sp',className:'npc-sprite',style:{transform:`translateY(${bob}px)`}},[
        isOrc&&React.createElement('div',{key:'crown',className:'crown'},React.createElement('svg',{width:30,height:14,viewBox:'0 0 10 5',style:{shapeRendering:'crispEdges'}},[
          React.createElement('rect',{key:1,x:0,y:1,width:1,height:3,fill:'#b8881f'}),
          React.createElement('rect',{key:2,x:9,y:1,width:1,height:3,fill:'#b8881f'}),
          React.createElement('rect',{key:3,x:1,y:3,width:8,height:1,fill:'#f2c84b'}),
          React.createElement('rect',{key:4,x:0,y:0,width:1,height:1,fill:'#ffe79a'}),
          React.createElement('rect',{key:5,x:4,y:0,width:1,height:1,fill:'#ffe79a'}),
          React.createElement('rect',{key:6,x:9,y:0,width:1,height:1,fill:'#ffe79a'}),
        ])),
        React.createElement(PixelSprite,{key:'sp2',base:npc.hero,anim,scale,flip:npc.facing<0,filter:isOrc?GOLD_TINT:undefined}),
        React.createElement('div',{key:'rt',className:'npc-rt'},React.createElement(Icon,{name:npc.runtime==='claude'?'claude':'codex',size:16})),
      ]),
    ]);
  }

  // ---------- big command viewscreen: the browser the agent is driving ----------
  // 大屏 3D 物体：展示智能体正在操作的浏览器画面（拟真 + 动效）
  function BrowserScreen(){
    const {useState,useEffect,useRef}=React;
    const t=window.useSpriteTick();
    // rotating "what the agent is doing" captions + url
    const STEPS=[
      {url:'localhost:5173/lobby', act:'点击「任务台」', tab:'Roguent · Dev'},
      {url:'localhost:5173/lobby', act:'滚动到会话网格', tab:'Roguent · Dev'},
      {url:'github.com/anthropics/claude-code', act:'读取 PR #128 diff', tab:'PR #128 · GitHub'},
      {url:'localhost:5173/interior', act:'校验 HUD 状态槽', tab:'Roguent · Dev'},
      {url:'docs.anthropic.com/agent-teams', act:'查阅 agent teams', tab:'Docs · Anthropic'},
    ];
    const [si,setSi]=useState(0);
    const [busy,setBusy]=useState(true);
    useEffect(()=>{
      let a=true; const adv=()=>{ if(!a)return; setBusy(true); setTimeout(()=>a&&setBusy(false),900); setSi(i=>(i+1)%STEPS.length); };
      const id=setInterval(adv,3400); return ()=>{a=false;clearInterval(id);};
    },[]);
    const step=STEPS[si];
    // cursor drifts around the viewport (deterministic-ish from tick)
    const cx=50+Math.sin(t/7)*30, cy=52+Math.cos(t/5)*26;
    return React.createElement('div',{className:'bigscreen',onClick:e=>e.stopPropagation()},[
      React.createElement('div',{key:'arm',className:'bigscreen-arm'}),
      React.createElement('div',{key:'frame',className:'bigscreen-frame'},[
        // chrome: traffic dots + tab + url + live badge
        React.createElement('div',{key:'chr',className:'bs-chrome'},[
          React.createElement('div',{key:'dots',className:'bs-dots'},['#ff5f57','#febc2e','#28c840'].map((c,i)=>
            React.createElement('span',{key:i,className:'bs-dot',style:{background:c}}))),
          React.createElement('div',{key:'tab',className:'bs-tab cjk'},step.tab),
          React.createElement('div',{key:'sp',style:{flex:1}}),
          React.createElement('div',{key:'live',className:'bs-live px'+(busy?' busy':'')},[
            React.createElement('span',{key:'d',className:'bs-livedot'}),busy?'DRIVING':'LIVE',
          ]),
        ]),
        React.createElement('div',{key:'url',className:'bs-urlbar'},[
          React.createElement(Icon,{key:'i',name:busy?'compact':'search',size:12,glow:busy?'#36c5e0':undefined}),
          React.createElement('span',{key:'u',className:'bs-url px'},step.url),
          busy&&React.createElement('span',{key:'load',className:'bs-load'}),
        ]),
        // rendered "page": animated wireframe blocks
        React.createElement('div',{key:'vp',className:'bs-viewport'},[
          React.createElement('div',{key:'scan',className:'bs-scan'}),
          React.createElement('div',{key:'page',className:'bs-page'},[
            React.createElement('div',{key:'h',className:'bs-blk bs-hero'}),
            React.createElement('div',{key:'r1',className:'bs-row'},[
              React.createElement('div',{key:'a',className:'bs-blk bs-card'}),
              React.createElement('div',{key:'b',className:'bs-blk bs-card'}),
              React.createElement('div',{key:'c',className:'bs-blk bs-card'}),
            ]),
            React.createElement('div',{key:'l1',className:'bs-blk bs-line w80'}),
            React.createElement('div',{key:'l2',className:'bs-blk bs-line w60'}),
            React.createElement('div',{key:'l3',className:'bs-blk bs-line w70'}),
          ]),
          // agent cursor
          React.createElement('div',{key:'cur',className:'bs-cursor'+(busy?' click':''),style:{left:cx+'%',top:cy+'%'}},
            React.createElement('svg',{width:18,height:18,viewBox:'0 0 12 12',style:{shapeRendering:'crispEdges'}},[
              React.createElement('path',{key:'p',d:'M1 1 L1 9 L3 7 L5 11 L6 10 L4 6 L7 6 Z',fill:'#fff',stroke:'#0b0a12',strokeWidth:0.6}),
            ])),
          React.createElement('div',{key:'flick',className:'bs-flicker'}),
        ]),
        // caption: what the agent is doing
        React.createElement('div',{key:'cap',className:'bs-caption'},[
          React.createElement('span',{key:'rt',className:'chip px tag-claude',style:{fontSize:8}},'Surveyor'),
          React.createElement('span',{key:'a',className:'bs-act cjk'},step.act),
        ]),
      ]),
      React.createElement('div',{key:'base',className:'bigscreen-base'}),
      React.createElement('div',{key:'glow',className:'bigscreen-glow'}),
    ]);
  }
  window.BrowserScreen=BrowserScreen;

  // ---------- World stage ----------
  function World({theme, npcs, selected, onSelect, onBg, density=1}){
    const torches=[[150,150],[560,150],[1360,150],[1770,150]];
    const dustN=Math.max(0,Math.round(16*density));
    return React.createElement('div',{className:'world',onClick:onBg},[
      React.createElement(Room,{key:'room',theme}),
      React.createElement('div',{key:'glow',className:'room-core-glow'}),
      React.createElement('div',{key:'tod',className:'tod-tint'}),
      // big command viewscreen — the browser the agent is driving (大屏)
      React.createElement(BrowserScreen,{key:'screen'}),
      // wishing fountain (click to toss a coin)
      React.createElement(WishingSpot,{key:'wish',style:{left:'15%',top:'14%'}}),
      // animated command-dais rune ring (over the painted dais ~50%,42%)
      React.createElement('div',{key:'rune',className:'room-rune'},[
        React.createElement('div',{key:'r1',className:'room-rune-ring'}),
        React.createElement('div',{key:'r2',className:'room-rune-ring rev'}),
        React.createElement('div',{key:'r3',className:'room-rune-core'}),
      ]),
      // wall torches with flame + glow
      ...torches.map(([x,y],i)=>React.createElement('div',{key:'tor'+i,className:'torch',style:{left:x,top:y}},[
        React.createElement('div',{key:'b',className:'torch-bracket'}),
        React.createElement('div',{key:'f',className:'torch-flame'}),
        React.createElement('div',{key:'g',className:'torch-glow'}),
        ...[0,1,2].map(s=>React.createElement('div',{key:'s'+s,className:'torch-spark',style:{animationDelay:(s*0.5)+'s'}})),
      ])),
      // fountain spray droplets (north-centre lab core ~at canvas 11*80)
      React.createElement('div',{key:'foam',className:'room-fountain'},
        [0,1,2,3].map(i=>React.createElement('div',{key:'d'+i,className:'fountain-drop',style:{'--i':i,animationDelay:(i*0.4)+'s'}}))),
      // floating dust motes
      ...[...Array(dustN)].map((_,i)=>React.createElement('div',{key:'du'+i,className:'room-dust','data-i':i,
        style:{left:(5+i*5.8)+'%',top:(20+(i*37)%70)+'%',animationDelay:(i*0.7)+'s',animationDuration:(7+i%6)+'s'}})),
      React.createElement('div',{key:'vig',className:'vignette'}),
      // loot glow
      React.createElement('div',{key:'loot',className:'loot-glow',style:{left:'84%',top:'34%'}},React.createElement(PixelSprite,{name:'chest_full_open_anim_f1',scale:5})),
      // pet (pettable — click for hearts)
      React.createElement('div',{key:'pet',className:'pet',style:{left:DATA.room.pet.x+'%',top:DATA.room.pet.y+'%'}},React.createElement(PetActor,{scale:4})),
      // npcs
      ...npcs.map(n=>React.createElement(Npc,{key:n.id,npc:n,selected:selected===n.id,onSelect})),
      // idle quips over the squad
      React.createElement(QuipLayer,{key:'quips',npcs}),
    ]);
  }

  // ============ HUD pieces ============
  // small pixel crown (simple rects) used as a frame ornament
  function PixelCrown({w=34,h=16}){
    return React.createElement('svg',{width:w,height:h,viewBox:'0 0 10 5',style:{shapeRendering:'crispEdges',display:'block'}},[
      React.createElement('rect',{key:1,x:0,y:1,width:1,height:3,fill:'#b8881f'}),
      React.createElement('rect',{key:2,x:9,y:1,width:1,height:3,fill:'#b8881f'}),
      React.createElement('rect',{key:3,x:1,y:3,width:8,height:1,fill:'#f2c84b'}),
      React.createElement('rect',{key:4,x:4,y:2,width:2,height:2,fill:'#f2c84b'}),
      React.createElement('rect',{key:5,x:0,y:0,width:1,height:1,fill:'#ffe79a'}),
      React.createElement('rect',{key:6,x:4,y:0,width:1,height:1,fill:'#ffe79a'}),
      React.createElement('rect',{key:7,x:9,y:0,width:1,height:1,fill:'#ffe79a'}),
    ]);
  }
  window.PixelCrown=PixelCrown;

  // player avatar card (top-left). XP bar = context-window fill.
  // clicking the avatar opens the personal detail page (account panel).
  function LimitBars({account,mainHero,onOpen}){
    const hero=mainHero||account.hero||'knight_m';
    const ctx=account.selectedCtx; // 上下文窗口占比 → 经验条
    const ctxColor=ctx<60?'#5fd35f':ctx<=85?'#f2c84b':'#ff4d6d';
    const open=()=>onOpen&&onOpen('account');
    return React.createElement('div',{className:'panel rivets playercard',onClick:open,title:T('查看个人详情 · 5h / Weekly 用量')},
      React.createElement('div',{className:'pc-body'},[
        // ---- ornate avatar frame ----
        React.createElement('div',{key:'fr',className:'pc-frame'},[
          React.createElement('div',{key:'cr',className:'pc-crown'},React.createElement(PixelCrown,{w:30,h:15})),
          React.createElement('div',{key:'p',className:'pc-portrait'},React.createElement(PixelSprite,{base:hero,anim:'idle',scale:3.4,filter:GOLD_TINT})),
          React.createElement('div',{key:'cn',className:'pc-corners'}),
          React.createElement('div',{key:'rt',className:'pc-rt'},React.createElement(Icon,{name:'claude',size:13})),
          React.createElement('div',{key:'lv',className:'pc-level px'},'Lv '+(account.level||47)),
        ]),
        // ---- identity + context-window XP bar ----
        React.createElement('div',{key:'info',className:'pc-info'},[
          React.createElement('div',{key:'nm',className:'pc-name px'},account.name||'指挥官'),
          React.createElement('div',{key:'plan',className:'pc-plan px'},[
            React.createElement('span',{key:'g',className:'gold'},'CLAUDE'),
            React.createElement('span',{key:'d'},' · '+account.plan),
          ]),
          React.createElement('div',{key:'xp',className:'pc-xp'},[
            React.createElement('div',{key:'l',className:'pc-xp-lab px'},[
              React.createElement('span',{key:'a'},'Context'),
              React.createElement('span',{key:'b',style:{color:ctxColor}},ctx+'%'),
            ]),
            React.createElement('div',{key:'b',className:'pc-xp-bar'},
              React.createElement('div',{key:'f',className:'pc-xp-fill',style:{width:ctx+'%',background:'linear-gradient(180deg,#ffe79a,'+ctxColor+' 55%,rgba(0,0,0,.25))'}})),
          ]),
          React.createElement('div',{key:'hint',className:'pc-hint px'},window.TL('▸ 查看 5h / Weekly 用量','▸ View 5h / Weekly usage')),
        ]),
      ])
    );
  }

  function RosterCard({npcs, selected, onSelect}){
    return React.createElement('div',{className:'panel roster'},
      React.createElement('div',{className:'roster-body'},[
        React.createElement('div',{key:'h',className:'roster-h px'},[
          React.createElement('span',{key:1},T('在岗')),React.createElement('span',{key:2,className:'gold'},npcs.length+' '+T('在岗')),
        ]),
        React.createElement('div',{key:'r',className:'roster-row'},npcs.map(n=>{
          const alert=n.status==='askuser'?'ask':n.status==='error'?'error':n.status==='todo'?'todo':n.status==='done'?'done':null;
          const ended=n.status==='done';
          return React.createElement('div',{key:n.id,className:'roster-av'+(selected===n.id?' sel':'')+(ended?' ended':''),onClick:()=>onSelect(n.id)},[
            React.createElement('div',{key:'p',className:'roster-portrait'},React.createElement(PixelSprite,{base:n.hero,anim:'idle',scale:2.4,filter:n.orchestrator?GOLD_TINT:(ended?'grayscale(.85) brightness(.62)':undefined)})),
            alert&&React.createElement('div',{key:'a',className:'roster-alert'+(alert==='ask'?' askpulse':'')},React.createElement(Icon,{name:alert,size:12})),
          ]);
        })),
      ])
    );
  }

  function SessionBanner({room}){
    const g=room.git||{};
    const stat=[
      ['staged',g.staged,'#5fd35f',T('已暂存')],
      ['unstaged',g.unstaged,'#f2c84b',T('已修改')],
      ['untracked',g.untracked,'#36c5e0',T('未跟踪')],
      ['conflicts',g.conflicts,'#ff4d6d',T('冲突')],
    ];
    return React.createElement('div',{className:'panel session-banner gitbanner'},
      React.createElement('div',{className:'sb-body'},[
        // repo + branch identity
        React.createElement('div',{key:'id',className:'gb-id'},[
          React.createElement(Icon,{key:'i',name:'vault',size:18}),
          React.createElement('span',{key:'t',className:'sb-title'},room.project),
          React.createElement('span',{key:'br',className:'gb-branch px'},[
            React.createElement('span',{key:'f',className:'gb-fork'},'⌥'),React.createElement('span',{key:'b'},' '+g.branch),
          ]),
        ]),
        React.createElement('span',{key:'d1',className:'gb-sep'}),
        // ahead / behind vs upstream
        React.createElement('div',{key:'sync',className:'gb-sync px',title:'相对 '+g.upstream},[
          React.createElement('span',{key:'a',className:'gb-ahead'},'↑'+g.ahead),
          React.createElement('span',{key:'b',className:'gb-behind'},'↓'+g.behind),
        ]),
        React.createElement('span',{key:'d2',className:'gb-sep'}),
        // working-tree counts
        React.createElement('div',{key:'stat',className:'gb-stats'},stat.filter(s=>s[1]>0).map(([k,v,c,lbl])=>
          React.createElement('span',{key:k,className:'gb-stat px',style:{color:c},title:lbl},[
            React.createElement('span',{key:'d',className:'gb-statdot',style:{background:c}}),v,
          ]))),
        g.stashes>0&&React.createElement('span',{key:'stash',className:'gb-stash px',title:'stash 数量'},'⊟ '+g.stashes),
        // last commit
        React.createElement('div',{key:'cm',className:'gb-commit px',title:g.lastCommit&&g.lastCommit.msg},[
          React.createElement('span',{key:'h',className:'gb-hash'},g.lastCommit&&g.lastCommit.hash),
          React.createElement('span',{key:'m',className:'gb-cmsg'},g.lastCommit&&g.lastCommit.msg),
          React.createElement('span',{key:'w',className:'faint'},g.lastCommit&&g.lastCommit.when),
        ]),
        // clean / dirty pill
        React.createElement('span',{key:'state',className:'gb-clean px'+(g.clean?' ok':' dirty')},g.clean?'✓ clean':'● dirty'),
      ])
    );
  }

  function Currency({currency, runtime, onRuntime}){
    const cell=(icon,val,c)=>React.createElement('div',{key:val,className:'cur-cell'},[
      React.createElement(Icon,{key:'i',name:icon,size:22}),
      React.createElement('span',{key:'v',className:'px',style:{color:c}},val),
    ]);
    return React.createElement('div',{className:'panel currency'},
      React.createElement('div',{className:'cur-body'},[
        cell('coins',currency.tokens,'#f2c84b'),
        cell('gemcur',currency.gems.toLocaleString(),'#a06cd5'),
        cell('laurel',currency.completed,'#5fd35f'),
        React.createElement('div',{key:'rt',className:'runtime-filter'},[
          React.createElement('div',{key:'c',className:'rt-chip'+(runtime==='claude'||runtime==='all'?' on':''),onClick:()=>onRuntime(runtime==='claude'?'all':'claude')},[React.createElement(Icon,{key:'i',name:'claude',size:16}),'Claude']),
          React.createElement('div',{key:'x',className:'rt-chip codex'+(runtime==='codex'||runtime==='all'?' on':''),onClick:()=>onRuntime(runtime==='codex'?'all':'codex')},[React.createElement(Icon,{key:'i',name:'codex',size:16}),'Codex']),
        ]),
      ])
    );
  }

  function ButtonDock({onOpen,L}){
    const lb=L||{};
    // 顺序：通知类（邮箱/活动）→ 身份类（账号/配对）→ 系统类（设置/菜单）
    const btns=[['mail','mailbox',lb.mailbox||'邮箱'],['task','events',T('活动')],['account','account',lb.account||'账号'],['link','pairing',lb.pairing||'配对'],['gear','settings',lb.settings||'设置'],['menu','menu',lb.menu||'菜单']];
    const unread=DATA.inbox.filter(m=>m.unread).length;
    const evCount=(DATA.events||[]).length;
    return React.createElement('div',{className:'dock'},btns.map(([icon,panel,label],i)=>
      React.createElement('div',{key:panel,className:'iconbtn'+(panel==='events'?' ev-dock':'')+(panel==='settings'?' dock-sys':''),onClick:()=>onOpen(panel)},[
        React.createElement(Icon,{key:'i',name:icon,size:28}),
        panel==='mailbox'&&unread>0&&React.createElement('div',{key:'b',className:'badge count'},unread),
        panel==='events'&&evCount>0&&React.createElement('div',{key:'b',className:'badge count ev-badge'},evCount),
        React.createElement('div',{key:'t',className:'tip cjk'},label),
      ])
    ));
  }

  function Hotbar({onOpen, badges, L}){
    const lb=L||{};
    // 左组：工作流（任务/聊天/技能/插件市场/模型/导入）；右组：成长与资产（背包/装饰商店/排行/成就）
    const g1=[['quest','tasks',lb.tasks||'任务','务'],['chat','chat',lb.chat||'聊天','话'],['spellbook','skills',lb.skills||'技能','技'],['mcp','market','插件市场','插'],['crystal','model',lb.model||'模型','智'],['import','import',lb.import||'导入','入']];
    const g2=[['pouch','backpack',lb.backpack||'背包','物'],['shop','shop','装饰商店','市'],['trophy','leaderboard',lb.leaderboard||'排行榜','榜'],['medal','achievements',lb.achievements||'成就','成']];
    const slot=([icon,panel,label],i)=>React.createElement('div',{key:panel,className:'iconbtn',style:{'--accent':'#36c5e0'},onClick:()=>onOpen(panel)},[
      React.createElement(Icon,{key:'i',name:icon,size:30}),
      badges&&badges[panel]&&React.createElement('div',{key:'b',className:'badge'+(typeof badges[panel]==='number'?' count':''),style:{}},typeof badges[panel]==='number'?badges[panel]:null),
      React.createElement('div',{key:'t',className:'tip cjk'},label),
    ]);
    return React.createElement('div',{className:'panel hotbar'},
      React.createElement('div',{className:'hotbar-body'},[
        React.createElement('div',{key:'g1',className:'hb-group'},g1.map(slot)),
        React.createElement('div',{key:'sep',className:'hb-sep'}),
        React.createElement('div',{key:'g2',className:'hb-group'},g2.map(slot)),
      ])
    );
  }

  // ---------- language toggle (segmented 中 | EN) ----------
  function LangToggle({uiLang,onToggle}){
    const en=uiLang==='English';
    return React.createElement('div',{className:'lang-toggle',onClick:onToggle,title:en?'Switch to 中文':'切换到 English'},[
      React.createElement(Icon,{key:'i',name:'spellbook',size:16}),
      React.createElement('span',{key:'cn',className:'lang-opt'+(en?'':' on')},'中'),
      React.createElement('span',{key:'en',className:'lang-opt px'+(en?' on':'')},'EN'),
    ]);
  }
  window.LangToggle=LangToggle;

  // ---------- live task glass window (interior left) ----------
  function TaskWindow({onOpen}){
    const [open,setOpen]=useState(true);
    const t=window.useSpriteTick();
    const tasks=DATA.tasks;
    const meta={pending:['#8a8170','待领'],'in-progress':['#36c5e0','进行中'],completed:['#5fd35f','完成']};
    const prog=tk=>tk.state==='completed'?100:tk.state==='pending'?0:(tk.id==='t1'?62:tk.id==='t3'?38:50);
    const counts={ip:tasks.filter(x=>x.state==='in-progress').length,pd:tasks.filter(x=>x.state==='pending').length,dn:tasks.filter(x=>x.state==='completed').length};
    return React.createElement('div',{className:'taskwin glass'+(open?'':' collapsed')},[
      React.createElement('div',{key:'h',className:'tw-head',onClick:()=>setOpen(o=>!o)},[
        React.createElement(Icon,{key:'i',name:'quest',size:18}),
        React.createElement('span',{key:'t',className:'tw-title px'},'LIVE TASKS'),
        React.createElement('span',{key:'c',className:'tw-count'},counts.ip+'/'+tasks.length),
        React.createElement('span',{key:'v',className:'tw-chev'},open?'▾':'▸'),
      ]),
      open&&React.createElement('div',{key:'b',className:'tw-body scroll'},tasks.map(tk=>{
        const p=prog(tk), ip=tk.state==='in-progress';
        return React.createElement('div',{key:tk.id,className:'tw-item',onClick:()=>onOpen&&onOpen('tasks')},[
          React.createElement('div',{key:'r',className:'tw-row'},[
            React.createElement('span',{key:'d',className:'tw-dot',style:{background:meta[tk.state][0],boxShadow:ip?'0 0 6px '+meta[tk.state][0]:'none'}}),
            React.createElement('span',{key:'t',className:'tw-name'},tk.title),
            tk.blockedByUser&&React.createElement(Icon,{key:'a',name:'ask',size:12,glow:'#36c5e0',className:'askpulse'}),
          ]),
          React.createElement('div',{key:'bar',className:'tw-bar'},React.createElement('div',{className:'tw-fill'+(ip?' live':''),style:{width:p+'%',background:meta[tk.state][0]}})),
        ]);
      })),
      open&&React.createElement('div',{key:'f',className:'tw-foot'},[
        React.createElement('span',{key:'1',className:'cyan'},counts.ip+' '+T('进行中')),
        React.createElement('span',{key:'2',className:'faint'},counts.pd+' '+T('待领')),
        React.createElement('span',{key:'3',className:'greenc'},counts.dn+' '+T('完成')),
      ]),
    ]);
  }

  function Minimap({npcs, selected}){
    return React.createElement('div',{className:'panel minimap'},
      React.createElement('div',{className:'mm-body'},[
        React.createElement('div',{key:'h',className:'mm-h px'},'MAP'),
        React.createElement('div',{key:'g',className:'mm-grid'},npcs.map(n=>
          React.createElement('div',{key:n.id,className:'mm-dot'+(selected===n.id?' sel':''),
            style:{left:n.x+'%',top:n.y+'%',background:n.orchestrator?'#f2c84b':n.status==='askuser'?'#36c5e0':'#c9b79a'}}))),
      ])
    );
  }

  Object.assign(window,{World,LimitBars,RosterCard,SessionBanner,Currency,ButtonDock,Hotbar,Minimap,CatPet,GOLD_TINT,TaskWindow});
})();
