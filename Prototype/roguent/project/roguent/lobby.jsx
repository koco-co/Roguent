/* ROGUENT lobby — login → character select → interactive hub.
   Structures: quest tower, shop, gacha (扭蛋), ranking, announce board,
   achievement altar, mailbox, config altar, runtime doors. Torch/fountain particles.
   Globals: React, Icon, PixelSprite, DATA, GOLD_TINT, useSpriteTick. */
(function(){
  const {useState,useRef,useEffect}=React;
  const h=React.createElement;
  const T=window.T;

  // ================= LOGIN (§12) =================
  function LoginScreen({onStart,mainHero,L}){
    const tick=window.useSpriteTick();
    const pool=DATA.heroPool;
    const start0=Math.max(0,pool.findIndex(p=>p.hero===mainHero));
    const [idx,setIdx]=useState(start0<0?0:start0);
    const hero=pool[idx];
    const move=(d)=>setIdx(i=>(i+d+pool.length)%pool.length);
    return h('div',{className:'login'},[
      h('div',{key:'sky',className:'login-sky'}),
      h('div',{key:'rays',className:'login-rays'}),
      h('div',{key:'vig',className:'vignette'}),
      ...[...Array(16)].map((_,i)=>h('div',{key:'dust'+i,className:'login-dust','data-i':i,style:{left:(6+i*6)+'%',animationDelay:(i*0.5)+'s',animationDuration:(7+i%5)+'s'}})),
      h('div',{key:'logo',className:'login-logo'},[
        h('div',{key:'sword',className:'login-crest'},h(PixelSprite,{name:'weapon_golden_sword',scale:6})),
        h('div',{key:'t',className:'login-title px'},'ROGUENT'),
        h('div',{key:'s',className:'login-sub cjk'},T('像素指挥台 · 本地 Claude Code 双 runtime 调度')),
      ]),
      // single character frame — click arrows to switch, then enter
      h('div',{key:'pick',className:'login-pick'},[
        h('div',{key:'pl',className:'login-arrow px',onClick:()=>move(-1)},'‹'),
        h('div',{key:'frame',className:'login-charframe',style:{'--ac':hero.accent},onClick:()=>onStart(hero.hero)},[
          h('div',{key:'glow',className:'login-charframe-glow'}),
          h('div',{key:'rune',className:'login-charframe-rune'}),
          h('div',{key:'stage',className:'login-charframe-stage'},[
            h('div',{key:'ped',className:'login-charframe-ped'}),
            h('div',{key:'sp',className:'login-charframe-sp',style:{transform:`translateY(${Math.sin(tick/3)*4}px)`}},
              h(PixelSprite,{base:hero.hero,anim:'idle',scale:7})),
          ]),
          h('div',{key:'name',className:'login-charframe-name'},[
            h('span',{key:'n',className:'cjk'},T(hero.name)),
            h('span',{key:'i',className:'px'},(idx+1)+' / '+pool.length),
          ]),
        ]),
        h('div',{key:'pr',className:'login-arrow px',onClick:()=>move(1)},'›'),
      ]),
      // hero dots
      h('div',{key:'dots',className:'login-dots'},pool.map((p,i)=>
        h('span',{key:i,className:'login-dot'+(idx===i?' on':''),style:{'--ac':p.accent},onClick:()=>setIdx(i)}))),
      h('div',{key:'cta',className:'login-cta'},[
        h('button',{key:'b',className:'pxbtn gold login-btn cjk',onClick:()=>onStart(hero.hero)},[
          h(Icon,{key:'i',name:'task',size:22,style:{marginRight:10}}),T('选 '+hero.name+' · 开始 Vibe Coding')]),
        h('div',{key:'h',className:'login-hint cjk'},T('‹ › 切换角色 · 点击角色框直接进入 · 随时可在设置中切换主角色')),
      ]),
      h('div',{key:'ver',className:'login-ver px'},'v0.9 · prototype'),
    ]);
  }
  window.LoginScreen=LoginScreen;

  // ================= CHARACTER SELECT =================
  function CharacterSelect({onPick}){
    const [hov,setHov]=useState(null);
    return h('div',{className:'scrim charsel'},
      h('div',{className:'panel rivets modal-pop',style:{width:820},onClick:e=>e.stopPropagation()},[
        h('div',{key:'tb',className:'panel-titlebar'},[
          h(Icon,{key:'i',name:'account',size:22,glow:'#f2c84b'}),
          h('span',{key:'t',className:'title'},'CHOOSE HERO'),
          h('span',{key:'s',className:'sub cjk'},'选择像素角色进入大厅 · 这是你的主角色'),
        ]),
        h('div',{key:'b',className:'panel-body'},[
          h('div',{key:'g',className:'charsel-grid'},DATA.heroPool.map(hp=>
            h('div',{key:hp.hero,className:'charsel-cell',style:{'--ac':hp.accent},onClick:()=>onPick(hp),onMouseEnter:()=>setHov(hp.hero),onMouseLeave:()=>setHov(null)},[
              h('div',{key:'p',className:'charsel-portrait'},h(PixelSprite,{base:hp.hero,anim:hov===hp.hero?'run':'idle',scale:4})),
              h('div',{key:'n',className:'charsel-name'},hp.name),
            ]))),
          h('div',{key:'tip',className:'faint',style:{textAlign:'center',marginTop:14,fontSize:12}},'进入后用 WASD 或点击移动 · 走到任务台按 E 打开会话网格'),
        ]),
      ])
    );
  }

  // ================= HUB WORLD (playable) =================
  const INTERACT=[
    {id:'altar', x:960, y:236, r:130, label:'设置祭坛', sub:'CONFIG', action:'settings'},
    {id:'ach',   x:652, y:248, r:130, label:'成就殿', sub:'ACHIEVEMENTS', action:'achievements'},
    {id:'mail',  x:1272,y:248, r:130, label:'邮箱', sub:'MAILBOX', action:'mailbox'},
    {id:'board', x:362, y:452, r:140, label:'排行榜', sub:'RANKING', action:'leaderboard'},
    {id:'announce', x:360, y:742, r:140, label:'公告板', sub:'BOARD', action:'announce'},
    {id:'tower', x:960, y:512, r:170, label:'任务台', sub:'QUEST CONSOLE', action:'sessiongrid'},
    {id:'market',x:660, y:452, r:132, label:'插件市场', sub:'MARKET', action:'market'},
    {id:'shop',  x:1556,y:452, r:140, label:'装饰商店', sub:'SHOP', action:'shop'},
    {id:'gacha', x:1576,y:738, r:130, label:'扭蛋机', sub:'GACHA', action:'gacha'},
    {id:'cdoor', x:214, y:946, r:120, label:'Claude 项目', sub:'', action:'sessiongrid', rt:'claude'},
    {id:'xdoor', x:1706,y:946, r:120, label:'Codex 项目', sub:'', action:'sessiongrid', rt:'codex'},
  ];

  function HubWorld({picked,onOpen,onEnterSession,L,density=1}){
    const hubRef=useRef(), avRef=useRef(), petRef=useRef();
    const pos=useRef({x:960,y:980}), tgt=useRef(null), keys=useRef(new Set()), face=useRef(1);
    const pet=useRef({x:900,y:1000});
    const [near,setNear]=useState(null);
    const [moving,setMoving]=useState(false);
    const [facing,setFacing]=useState(1);
    const tick=window.useSpriteTick();

    useEffect(()=>{
      const MAP={w:'up',s:'down',a:'left',d:'right',arrowup:'up',arrowdown:'down',arrowleft:'left',arrowright:'right'};
      const kd=e=>{const dir=MAP[e.key.toLowerCase()];if(dir){keys.current.add(dir);tgt.current=null;}
        if(e.key.toLowerCase()==='e'){const n=INTERACT.find(it=>dist(pos.current,it)<it.r);if(n)fire(n);}};
      const ku=e=>{const dir=MAP[e.key.toLowerCase()];if(dir)keys.current.delete(dir);};
      window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);
      let raf,lastMoving=false,lastFace=1,lastNear=null;
      const dist=(p,it)=>Math.hypot(p.x-it.x,p.y-it.y);
      const loop=()=>{
        const p=pos.current; let vx=0,vy=0,sp=7;
        keys.current.forEach(dir=>{
          if(dir==='up')vy-=1; if(dir==='down')vy+=1; if(dir==='left')vx-=1; if(dir==='right')vx+=1;});
        let mv=false;
        if(vx||vy){const m=Math.hypot(vx,vy)||1;p.x+=vx/m*sp;p.y+=vy/m*sp;mv=true;if(vx)face.current=vx<0?-1:1;}
        else if(tgt.current){const dx=tgt.current.x-p.x,dy=tgt.current.y-p.y,d=Math.hypot(dx,dy);
          if(d>6){p.x+=dx/d*sp;p.y+=dy/d*sp;mv=true;if(Math.abs(dx)>1)face.current=dx<0?-1:1;}else tgt.current=null;}
        p.x=Math.max(70,Math.min(1850,p.x));p.y=Math.max(150,Math.min(1060,p.y));
        if(avRef.current)avRef.current.style.transform=`translate(-50%,-100%) translate(${p.x}px,${p.y}px)`;
        const pt=pet.current,pdx=p.x-40-pt.x,pdy=p.y-pt.y,pd=Math.hypot(pdx,pdy);
        if(pd>55){pt.x+=pdx/pd*5;pt.y+=pdy/pd*5;}
        if(petRef.current)petRef.current.style.transform=`translate(-50%,-100%) translate(${pt.x}px,${pt.y}px)`;
        const n=INTERACT.find(it=>dist(p,it)<it.r);
        if((n&&n.id)!==lastNear){lastNear=n&&n.id;setNear(n||null);}
        if(mv!==lastMoving){lastMoving=mv;setMoving(mv);}
        if(face.current!==lastFace){lastFace=face.current;setFacing(face.current);}
        raf=requestAnimationFrame(loop);
      };
      raf=requestAnimationFrame(loop);
      return()=>{cancelAnimationFrame(raf);window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);};
    },[]);

    const dist=(p,it)=>Math.hypot(p.x-it.x,p.y-it.y);
    const fire=(it)=>{ onOpen(it.action, it.rt); };
    const clickBg=(e)=>{const rect=hubRef.current.getBoundingClientRect();const sc=rect.width/1920;
      tgt.current={x:(e.clientX-rect.left)/sc,y:(e.clientY-rect.top)/sc};keys.current.clear();};
    const clickStruct=(e,it)=>{e.stopPropagation();
      if(dist(pos.current,it)<it.r)fire(it);
      else tgt.current={x:it.x,y:it.y+90};};

    // wall torches (ambient particles)
    const torches=[[150,150],[560,150],[960,120],[1360,150],[1770,150]];

    return h('div',{ref:hubRef,className:'hub town',onClick:clickBg},[
      h(window.HubCanvas,{key:'floor',density}),
      h('div',{key:'sun',className:'hub-sun'}),
      h('div',{key:'tod',className:'tod-tint'}),
      h('div',{key:'vig',className:'vignette town'}),
      // ambient floating embers
      ...[...Array(Math.round(18*density))].map((_,i)=>h('div',{key:'em'+i,className:'ember','data-i':i,
        style:{left:(4+i*(95/Math.max(1,Math.round(18*density))))+'%',bottom:'-20px',animationDelay:(i*0.6)+'s',animationDuration:(8+i%6)+'s'}})),
      // drifting petals / leaves across the courtyard
      ...[...Array(Math.round(14*density))].map((_,i)=>h('div',{key:'lf'+i,className:'hub-leaf k'+(i%4),'data-i':i,
        style:{left:(-4+i*(100/Math.max(1,Math.round(14*density))))+'%',top:'-6%',animationDelay:(i*1.3)+'s',animationDuration:(11+i%7)+'s'}})),
      // fireflies near the plaza / statues
      ...[...Array(Math.round(7*density))].map((_,i)=>h('div',{key:'ff'+i,className:'hub-firefly',
        style:{left:(640+(i*173)%680)+'px',top:(390+(i*97)%280)+'px',animationDelay:(i*0.8)+'s',animationDuration:(4+i%4)+'s'}})),
      // rotating plaza ground-rune under the quest tower
      h('div',{key:'prune',className:'hub-plaza-rune'},[
        h('div',{key:'a',className:'hub-plaza-ring'}),
        h('div',{key:'b',className:'hub-plaza-ring rev'}),
      ]),
      // wall torches with flame + sparks
      ...torches.map(([x,y],i)=>h('div',{key:'tor'+i,className:'torch',style:{left:x,top:y}},[
        h('div',{key:'b',className:'torch-bracket'}),
        h('div',{key:'f',className:'torch-flame'}),
        h('div',{key:'g',className:'torch-glow'}),
        ...[0,1,2].map(s=>h('div',{key:'s'+s,className:'torch-spark',style:{animationDelay:(s*0.5)+'s'}})),
      ])),
      // decorative wandering idle heroes
      ...[['knight_f',150,360],['dwarf_m',1700,392],['wizzard_f',1668,586],['goblin',120,600]].map(([hr,x,y],i)=>
        h('div',{key:'dec'+i,className:'hub-decor',style:{left:x,top:y}},h(PixelSprite,{base:hr,anim:'idle',scale:3.4,flip:x>960}))),
      // stone hero statues flanking the central plaza (monuments)
      ...[['knight_m',724,548,false],['elf_f',1196,548,true]].map(([hr,x,y,fl],i)=>
        h('div',{key:'stat'+i,className:'hub-statue',style:{left:x,top:y}},[
          h('div',{key:'s',className:'hub-statue-fig'},h(PixelSprite,{base:hr,anim:'idle',scale:3.6,flip:fl})),
          h('div',{key:'p',className:'hub-statue-ped'}),
        ])),
      // structures
      ...INTERACT.map(it=>h(Structure,{key:it.id,it,near:near&&near.id===it.id,onClick:e=>clickStruct(e,it),tick})),
      // hidden mimic chest (easter egg, blends with the lawn treasure)
      h('div',{key:'mimic',className:'hub-mimic',style:{left:1505,top:846}},h(window.MimicChest,{scale:4})),
      // pet (pettable)
      h('div',{key:'pet',ref:petRef,className:'hub-pet'},h(window.PetActor,{scale:3})),
      // avatar
      h('div',{key:'av',ref:avRef,className:'hub-avatar'},[
        (near)&&h('div',{key:'prompt',className:'hub-prompt'},[h('span',{key:'k',className:'px'},'E'),' '+T('进入')+' '+T(near.label)]),
        h('div',{key:'ring',className:'hub-avatar-ring'}),
        h(PixelSprite,{key:'sp',base:picked.hero,anim:moving?'run':'idle',scale:4.4,flip:facing<0}),
      ]),
      h('div',{key:'hint',className:'hub-controls px'},window.TL('WASD / 点击移动 · E 交互','WASD / click to move · E interact')),,
    ]);
  }

  function Structure({it,near,onClick,tick}){
    const float=Math.sin(tick/3)*4;
    let body;
    if(it.id==='tower'){
      body=h('div',{className:'struct-tower'},[
        h('div',{key:'ring',className:'tower-ring'}),
        h('div',{key:'orb',className:'tower-orb',style:{transform:`translateY(${float}px)`}},h(Icon,{name:'quest',size:64,glow:'#36c5e0'})),
        h('div',{key:'base',className:'tower-base'},[
          h(PixelSprite,{key:'b1',name:'wall_fountain_mid_blue_anim_f0',anim:undefined,scale:5}),
          h(PixelSprite,{key:'b2',name:'wall_fountain_basin_blue_anim_f0',scale:5}),
        ]),
        // fountain water droplets
        ...[0,1,2,3].map(i=>h('div',{key:'d'+i,className:'fountain-drop',style:{'--i':i,animationDelay:(i*0.4)+'s'}})),
      ]);
    } else if(it.id==='cdoor'||it.id==='xdoor'){
      const col=it.rt==='codex'?'#5fd35f':'#36c5e0';
      body=h('div',{className:'struct-door',style:{'--ac':col}},[
        h('div',{key:'flag',className:'door-flag',style:{background:col}},h(Icon,{name:it.rt==='codex'?'codex':'claude',size:18})),
        h(PixelSprite,{key:'d',name:'doors_leaf_closed',scale:4}),
      ]);
    } else if(it.id==='gacha'){
      body=h('div',{className:'struct-gacha'},[
        h('div',{key:'dome',className:'gm-dome'},[...['#ff4d6d','#36c5e0','#f2c84b','#5fd35f','#a06cd5'].map((c,i)=>
          h('div',{key:i,className:'gm-cap',style:{background:c,left:(14+i*16)+'%',top:(18+(i%2)*30)+'%'}}))]),
        h('div',{key:'body',className:'gm-body'},[h('div',{key:'k',className:'gm-knob'}),h('div',{key:'s',className:'gm-slot'})]),
        h('div',{key:'ped',className:'vendor-ped'}),
        h('div',{key:'spk',className:'gacha-sparkle',style:{transform:`translateY(${float}px)`}},'✦'),
      ]);
    } else if(it.id==='announce'){
      const items=DATA.announcements.slice(0,3);
      body=h('div',{className:'struct-board'},[
        h('div',{key:'roof',className:'board-roof'}),
        h('div',{key:'face',className:'board-face'},items.map((a,i)=>
          h('div',{key:i,className:'board-note',style:{'--ac':a.accent}},[
            h('span',{key:'p',className:'board-pin'}),
            h('span',{key:'t',className:'board-note-t'},a.text),
          ]))),
        h('div',{key:'legs',className:'board-legs'},[h('span',{key:1}),h('span',{key:2})]),
      ]);
    } else if(it.id==='mail'){
      const unread=DATA.inbox.filter(m=>m.unread).length;
      body=h('div',{className:'struct-mailbox'},[
        h('div',{key:'flag',className:'mailbox-flag'+(unread?' up':'')}),
        h('div',{key:'box',className:'mailbox-box'},h(Icon,{name:'mail',size:34})),
        h('div',{key:'post',className:'mailbox-post'}),
        unread>0&&h('div',{key:'b',className:'mailbox-count px'},unread),
      ]);
    } else {
      const ic={shop:'shop',board:'trophy',altar:'gear',ach:'medal',market:'mcp'}[it.id];
      const col={shop:'#a06cd5',board:'#f2c84b',altar:'#36c5e0',ach:'#f2c84b',market:'#36c5e0'}[it.id];
      body=h('div',{className:'struct-stall stall-'+it.id,style:{'--ac':col}},[
        h('div',{key:'roof',className:'stall-roof'}),
        h('div',{key:'val',className:'stall-valance'}),
        h('div',{key:'b',className:'stall-body'},[
          h('div',{key:'pl',className:'stall-post l'}),
          h('div',{key:'pr',className:'stall-post r'}),
          h('div',{key:'sign',className:'stall-sign',style:{transform:`translateY(${float}px)`}},h(Icon,{name:ic,size:40,glow:col})),
          h('div',{key:'ct',className:'stall-counter'}),
        ]),
      ]);
    }
    return h('div',{className:'structure'+(near?' near':''),style:{left:it.x,top:it.y},onClick},[
      React.cloneElement(body,{key:'body'}),
      h('div',{key:'lbl',className:'struct-label'},[h('span',{key:'n'},T(it.label)),it.sub&&window.__LANG!=='en'&&h('span',{key:'s',className:'struct-sub px'},it.sub)]),
    ]);
  }

  // ---- scheduling option tables (shared by list + form) ----
  const FREQ_META={once:['#a06cd5','一次性'],daily:['#5fd35f','每日'],weekly:['#36c5e0','每周'],monthly:['#f2c84b','每月']};
  const PERM_LABEL={auto:'Auto Mode',ask:'询问',strict:'严格','on-request':'On-request',untrusted:'Untrusted','on-failure':'On-failure',never:'Never'};
  const MODELS={claude:['Opus 4.8','Sonnet 4.6','Haiku 4.5'],codex:['gpt-5-codex','gpt-5','o4-mini']};
  const EFFORTS={claude:['low','medium','high','max','ultra'],codex:['low','medium','high']};
  const PERMS={claude:['auto','ask','strict'],codex:['auto','on-request','untrusted','never']};
  const WEEKDAYS=['周一','周二','周三','周四','周五','周六','周日'];
  function scheduleLabel(t){
    if(t.freq==='once') return (t.at||'').includes(' ')?t.at:('今天 '+(t.at||'18:00'));
    if(t.freq==='daily') return '每天 '+(t.at||'09:00');
    if(t.freq==='weekly') return '每'+(t.day||'周一')+' '+(t.at||'09:00');
    if(t.freq==='monthly') return '每月 '+(t.dom||1)+' 日 '+(t.at||'02:00');
    return '';
  }

  // ---- new / edit scheduled-task form ----
  function ScheduleForm({task,onCancel,onSave}){
    const seed=task?{...task,sessionMode:(!task.session||task.session==='new')?'new':'existing'}:{
      name:'',desc:'',project:'roguent',runtime:'claude',perm:'auto',model:'Sonnet 4.6',effort:'high',
      sessionMode:'new',session:'',freq:'daily',at:'09:00',day:'周一',dom:1,date:''};
    const [f,setF]=useState(seed);
    const set=(patch)=>setF(p=>({...p,...patch}));
    const setRuntime=(rt)=>set({runtime:rt,model:MODELS[rt][0],effort:rt==='codex'?'medium':'high',perm:PERMS[rt][0]==='auto'?'auto':PERMS[rt][0]});
    const projSessions=DATA.sessions.filter(s=>s.project===f.project&&s.runtime===f.runtime);
    const seg=(opts,cur,on)=>h('div',{className:'seg sm'},opts.map(([v,l])=>h('div',{key:v,className:'seg-opt'+(cur===v?' on':''),onClick:()=>on(v)},l)));
    const segS=(opts,cur,on)=>h('div',{className:'seg sm'},opts.map(o=>h('div',{key:o,className:'seg-opt'+(cur===o?' on':''),onClick:()=>on(o)},o)));
    const Row=(label,ctrl,hint)=>h('div',{className:'sf-row',key:label},[
      h('div',{key:'l',className:'sf-label'},[h('span',{key:'t'},label),hint&&h('span',{key:'h',className:'sf-hint'},hint)]),
      h('div',{key:'c',className:'sf-ctrl'},ctrl),
    ]);
    const valid=f.name.trim().length>0;
    const save=()=>{ if(!valid)return; onSave({
      ...f, id:task?task.id:'sc'+Date.now(),
      session:f.sessionMode==='existing'?(f.session||projSessions[0]&&projSessions[0].id||'new'):'new',
      next:scheduleLabel(f), on:task?task.on:true, lastRun:task?task.lastRun:null,
    }); };
    return h('div',{className:'sf-wrap'},[
      h('div',{key:'h',className:'sf-head'},[
        h('button',{key:'b',className:'sf-back',onClick:onCancel},'‹ 返回'),
        h('span',{key:'t',className:'sf-htitle px'},task?'编辑定时任务':'新建定时任务'),
      ]),
      h('div',{key:'body',className:'sf-body scroll'},[
        // task description
        Row('任务描述',h('textarea',{className:'pxinput sf-area',value:f.desc,placeholder:'例如：每天凌晨扫描依赖并汇总报告…',onChange:e=>set({desc:e.target.value})})),
        Row('任务名称',h('input',{className:'pxinput',style:{width:'100%'},value:f.name,placeholder:'给这个定时任务起个名字',onChange:e=>set({name:e.target.value})})),
        h('div',{key:'grid',className:'sf-grid'},[
          Row('项目',h('select',{className:'pxselect',style:{width:'100%'},value:f.project,onChange:e=>set({project:e.target.value,session:''})},DATA.projects.map(p=>h('option',{key:p.id,value:p.id},p.name)))),
          Row('Runtime',seg([['claude','Claude'],['codex','Codex']],f.runtime,setRuntime)),
          Row('模型 model',h('select',{className:'pxselect',style:{width:'100%'},value:f.model,onChange:e=>set({model:e.target.value})},MODELS[f.runtime].map(m=>h('option',{key:m,value:m},m)))),
          Row('权限模式',seg(PERMS[f.runtime].map(p=>[p,PERM_LABEL[p]||p]),f.perm,v=>set({perm:v})),'默认 Auto'),
          Row('推理强度 effort',segS(EFFORTS[f.runtime],f.effort,v=>set({effort:v}))),
          Row('会话',seg([['new','新会话'],['existing','已有会话']],f.sessionMode,v=>set({sessionMode:v}))),
        ]),
        f.sessionMode==='existing'&&Row('选择会话',
          projSessions.length
            ?h('select',{className:'pxselect',style:{width:'100%'},value:f.session||projSessions[0].id,onChange:e=>set({session:e.target.value})},projSessions.map(s=>h('option',{key:s.id,value:s.id},s.title+' · '+(s.tokens/1000|0)+'k')))
            :h('div',{className:'sf-empty'},'该项目下暂无 '+(f.runtime==='codex'?'Codex':'Claude')+' 会话，将新建')),
        // schedule
        h('div',{key:'sch',className:'sf-sched'},[
          h('div',{key:'l',className:'sf-label'},'调度频率'),
          h('div',{key:'fq'},seg([['once','一次性'],['daily','每日'],['weekly','每周'],['monthly','每月']],f.freq,v=>set({freq:v}))),
          h('div',{key:'when',className:'sf-when'},[
            f.freq==='once'&&h('input',{key:'d',className:'pxinput',type:'date',value:f.date,onChange:e=>set({date:e.target.value})}),
            f.freq==='weekly'&&h('select',{key:'w',className:'pxselect',value:f.day,onChange:e=>set({day:e.target.value})},WEEKDAYS.map(d=>h('option',{key:d,value:d},d))),
            f.freq==='monthly'&&h('select',{key:'m',className:'pxselect',value:f.dom,onChange:e=>set({dom:+e.target.value})},Array.from({length:28},(_,i)=>i+1).map(d=>h('option',{key:d,value:d},d+' 日'))),
            h('input',{key:'t',className:'pxinput',type:'time',value:f.at.includes(' ')?f.at.split(' ')[1]:f.at,onChange:e=>set({at:e.target.value})}),
          ]),
          h('div',{key:'prev',className:'sf-preview px'},['下次执行 ',h('span',{key:'v',className:'gold'},scheduleLabel(f))]),
        ]),
      ]),
      h('div',{key:'foot',className:'sf-foot'},[
        h('button',{key:'c',className:'pxbtn cjk',onClick:onCancel},'取消'),
        h('button',{key:'s',className:'pxbtn primary cjk',disabled:!valid,onClick:save},task?'保存修改':'创建定时任务'),
      ]),
    ]);
  }

  // ---- scheduled-task list ----
  function ScheduledList({sched,onToggle,onEdit,onDelete,onNew}){
    return h('div',{className:'sched-grid scroll'},[
      h('div',{key:'new',className:'sched-card sched-new',onClick:onNew},[
        h(Icon,{key:'i',name:'task',size:38,glow:'#f2c84b'}),
        h('div',{key:'t',className:'sg-import-t'},'新建定时任务'),
        h('div',{key:'s',className:'faint',style:{fontSize:11}},'一次性 · 每日 · 每周 · 每月'),
      ]),
      ...sched.map(t=>{const fm=FREQ_META[t.freq];
        return h('div',{key:t.id,className:'sched-card'+(t.on?'':' off'),style:{'--st':fm[0]}},[
          h('div',{key:'hd',className:'sched-head'},[
            h('span',{key:'f',className:'sched-freq px',style:{color:fm[0],boxShadow:'inset 0 0 0 1px '+fm[0]}},fm[1]),
            h('div',{key:'tg',className:'pxtoggle sm'+(t.on?' on':''),onClick:(e)=>{e.stopPropagation();onToggle(t.id);},title:t.on?'已启用':'已暂停'},h('div',{className:'knob'})),
          ]),
          h('div',{key:'nm',className:'sched-name'},t.name),
          h('div',{key:'ds',className:'sched-desc'},t.desc),
          h('div',{key:'sc',className:'sched-sched px'},[h(Icon,{key:'i',name:'transition',size:13,style:{marginRight:5}}),scheduleLabel(t)]),
          h('div',{key:'ch',className:'sched-chips'},[
            h('span',{key:'p',className:'chip px',style:{fontSize:8}},t.project),
            h('span',{key:'rt',className:'chip px '+(t.runtime==='codex'?'tag-codex':'tag-claude'),style:{fontSize:8}},t.runtime==='codex'?'Codex':'Claude'),
            h('span',{key:'m',className:'chip px',style:{fontSize:8}},t.model),
            h('span',{key:'e',className:'chip px',style:{fontSize:8}},'effort:'+t.effort),
            h('span',{key:'pm',className:'chip px',style:{fontSize:8}},PERM_LABEL[t.perm]||t.perm),
            h('span',{key:'se',className:'chip px',style:{fontSize:8}},(!t.session||t.session==='new')?'新会话':'已有会话'),
          ]),
          h('div',{key:'ft',className:'sched-foot'},[
            h('span',{key:'n',className:'sched-next px'},[t.on?'下次 ':'已暂停 ',h('span',{key:'v',style:{color:t.on?fm[0]:'var(--ink-faint)'}},t.on?t.next:'—')]),
            h('div',{key:'act',className:'sched-acts'},[
              h('button',{key:'e',className:'sched-actbtn',onClick:()=>onEdit(t),title:'编辑'},h(Icon,{name:'gear',size:13})),
              h('button',{key:'d',className:'sched-actbtn danger',onClick:()=>onDelete(t.id),title:'删除'},'✕'),
            ]),
          ]),
        ]);
      }),
    ]);
  }

  // ================= SESSION GRID =================
  // 相对时间：距最后一条消息的分钟数 → "3h ago"
  const agoLabel=(m)=>m==null?'':m<1?'now':m<60?(m+'m ago'):m<1440?(((m/60)|0)+'h ago'):(((m/1440)|0)+'d ago');
  const STATUS_W={askuser:0,error:1,active:2,idle:3,done:4};
  const PROJ_AC={};DATA.projects.forEach(p=>PROJ_AC[p.id]=p.accent);
  function SessionGrid({onClose,onEnter,onImport,runtime,onOpen}){
    const [mode,setMode]=useState('sessions'); // sessions | schedule
    const [rt,setRtRaw]=useState(runtime&&runtime!=='all'?runtime:'all');
    const [projSel,setProjSel]=useState([]);   // 多选：项目标签
    const [modelSel,setModelSel]=useState([]); // 多选：模型标签
    const [activeOnly,setActiveOnly]=useState(false);
    const [sched,setSched]=useState(()=>DATA.scheduled.map(s=>({...s})));
    const [editing,setEditing]=useState(null); // null | 'new' | task object
    const all=DATA.sessions;
    const rtList=all.filter(s=>rt==='all'||s.runtime===rt);
    const projects=[...new Set(rtList.map(s=>s.project))];
    const models=[...new Set(rtList.map(s=>s.model))];
    const setRt=(k)=>{ setRtRaw(k);
      const nl=all.filter(s=>k==='all'||s.runtime===k);
      const np=new Set(nl.map(s=>s.project)), nm=new Set(nl.map(s=>s.model));
      setProjSel(ps=>ps.filter(p=>np.has(p))); setModelSel(ms=>ms.filter(m=>nm.has(m))); };
    const togIn=(arr,set)=>(v)=>set(arr.includes(v)?arr.filter(x=>x!==v):[...arr,v]);
    const togProj=togIn(projSel,setProjSel), togModel=togIn(modelSel,setModelSel);
    const hasFilter=projSel.length||modelSel.length||activeOnly||rt!=='all';
    const clearAll=()=>{setRtRaw('all');setProjSel([]);setModelSel([]);setActiveOnly(false);};
    let list=rtList.filter(s=>(!projSel.length||projSel.includes(s.project))&&(!modelSel.length||modelSel.includes(s.model))&&(!activeOnly||['active','askuser','error'].includes(s.status)));
    list=[...list].sort((a,b)=>(STATUS_W[a.status]-STATUS_W[b.status])||((a.lastActive||0)-(b.lastActive||0)));
    const stMeta={active:['#36c5e0','活跃'],idle:['#8a8170','待命'],askuser:['#36c5e0','待回应'],done:['#5fd35f','完成'],error:['#ff4d6d','出错']};
    const subLabel=mode==='schedule'?('定时任务 · '+sched.filter(s=>s.on).length+' 已启用'):('任务台 · '+list.length+' / '+all.length+' 会话');
    const toggle=(id)=>setSched(ss=>ss.map(s=>s.id===id?{...s,on:!s.on}:s));
    const del=(id)=>setSched(ss=>ss.filter(s=>s.id!==id));
    const saveTask=(t)=>{ setSched(ss=>ss.some(s=>s.id===t.id)?ss.map(s=>s.id===t.id?t:s):[...ss,t]); setEditing(null); };
    const cnt=(fn)=>rtList.filter(fn).length;
    const fchip=(key,on,label,extra,onClick,ac)=>h('div',{key,className:'fchip'+(on?' on':''),style:ac?{'--ac':ac}:null,onClick},[
      h('span',{key:'l',className:'cjk'},label),
      extra!=null&&h('span',{key:'n',className:'fc-n px'},extra),
    ]);
    return h(window.Modal,{title:'SESSIONS',sub:subLabel,icon:'quest',onClose,width:1240},
      h('div',{className:'sg-wrap'},[
        h('div',{key:'mode',className:'sg-modebar'},[
          h('div',{key:'seg',className:'seg'},[
            h('div',{key:'s',className:'seg-opt'+(mode==='sessions'?' on':''),onClick:()=>{setMode('sessions');setEditing(null);}},'会话'),
            h('div',{key:'c',className:'seg-opt'+(mode==='schedule'?' on':''),onClick:()=>setMode('schedule')},'定时任务'),
          ]),
          mode==='schedule'&&!editing&&h('button',{key:'add',className:'pxbtn primary cjk sm',onClick:()=>setEditing('new')},'+ 新建定时任务'),
        ]),
        // ---- 多级过滤：runtime / 项目 / 模型 同级标签，可叠加 ----
        mode==='sessions'&&h('div',{key:'filters',className:'sg-filters'},[
          h('div',{key:'rt',className:'sg-frow'},[
            h('span',{key:'lab',className:'sg-flab px'},'RUNTIME'),
            fchip('all',rt==='all','全部',all.length,()=>setRt('all')),
            fchip('claude',rt==='claude','Claude',all.filter(s=>s.runtime==='claude').length,()=>setRt('claude'),'var(--claude, #36c5e0)'),
            fchip('codex',rt==='codex','Codex',all.filter(s=>s.runtime==='codex').length,()=>setRt('codex'),'#5fd35f'),
            h('span',{key:'sp',className:'sg-fsp'}),
            fchip('act',activeOnly,'仅活跃',cnt(s=>['active','askuser','error'].includes(s.status)),()=>setActiveOnly(v=>!v),'#36c5e0'),
            hasFilter?h('div',{key:'clr',className:'sg-clear px',onClick:clearAll},'✕ 清除筛选'):null,
          ]),
          h('div',{key:'pj',className:'sg-frow'},[
            h('span',{key:'lab',className:'sg-flab px'},'项目'),
            ...projects.map(p=>fchip(p,projSel.includes(p),p,cnt(s=>s.project===p),()=>togProj(p),PROJ_AC[p]||'#36c5e0')),
          ]),
          h('div',{key:'md',className:'sg-frow'},[
            h('span',{key:'lab',className:'sg-flab px'},'模型'),
            ...models.map(m=>fchip(m,modelSel.includes(m),m,cnt(s=>s.model===m),()=>togModel(m),'#f2c84b')),
          ]),
        ]),
        mode==='sessions'&&h('div',{key:'grid',className:'sg-grid scroll'},[
          !hasFilter&&h('div',{key:'imp',className:'sg-card sg-import',onClick:onImport},[
            h(Icon,{key:'i',name:'import',size:40,glow:'#f2c84b'}),
            h('div',{key:'t',className:'sg-import-t'},'导入历史会话'),
            h('div',{key:'s',className:'faint',style:{fontSize:11}},'+ 从本地扫描'),
          ]),
          ...list.map(s=>{const m=stMeta[s.status];
            const live=s.status==='active', ask=s.status==='askuser';
            const inactive=s.status==='idle'||s.status==='done';
            return h('div',{key:s.id,className:'sg-card'+(live?' breathing':'')+(ask?' breathing askstop':'')+(inactive?' inactive':''),style:{'--st':m[0]},onClick:()=>onEnter(s)},[
              live&&h('div',{key:'bg',className:'sg-breath'}),
              h('div',{key:'top',className:'sg-top'},[
                h('div',{key:'p',className:'sg-portrait'},h(PixelSprite,{base:s.hero,anim:live?'run':'idle',scale:2.6,filter:s.status==='done'?'grayscale(.8) brightness(.7)':s.runtime==='codex'?'hue-rotate(60deg) saturate(1.1)':undefined})),
                ask&&h('div',{key:'a',className:'sg-ask'},h('span',{className:'sg-ask-q'},'?')),
                s.status==='error'&&h('div',{key:'e',className:'sg-alert'},h(Icon,{name:'error',size:14})),
              ]),
              h('div',{key:'pr',className:'sg-proj'+(projSel.includes(s.project)?' on':''),title:'按项目 '+s.project+' 筛选',onClick:(e)=>{e.stopPropagation();togProj(s.project);}},'# '+s.project),
              h('div',{key:'ti',className:'sg-title'},s.title),
              h('div',{key:'meta',className:'sg-meta'},[
                h('span',{key:'st',className:'sg-status',style:{color:m[0]}},[h('span',{key:'d',className:'sg-dot'+(live?' pulse':''),style:{background:m[0]}}),h('span',{key:'l'},m[1])]),
                h('span',{key:'ch',className:'sg-chips'},[
                  h('span',{key:'rt',className:'chip px '+(s.runtime==='codex'?'tag-codex':'tag-claude'),style:{fontSize:8}},s.runtime==='codex'?'Codex':'Claude'),
                  h('span',{key:'m',className:'chip px',style:{fontSize:8}},s.model),
                ]),
              ]),
              h('div',{key:'ft',className:'sg-foot'},[
                h('span',{key:'tok',className:'sg-tok px'},(s.tokens/1000).toFixed(0)+'k tok · '+s.agents+'P'),
                h('span',{key:'tm',className:'sg-time px'+(live?' live':''),title:'最后一条消息'},agoLabel(s.lastActive)),
              ]),
              h('div',{key:'act',className:'sg-act'},[
                h('button',{key:'c',className:'sg-actbtn cjk'+(ask?' hot':''),onClick:(e)=>{e.stopPropagation();onOpen&&onOpen('chat',s);}},[h(Icon,{key:'i',name:'chat',size:13,style:{marginRight:5}}),ask?'回应':'聊天']),
                h('button',{key:'e',className:'sg-actbtn cjk',onClick:(e)=>{e.stopPropagation();onEnter(s);}},'进入'),
              ]),
            ]);
          }),
          list.length===0&&h('div',{key:'empty',className:'sg-empty'},[
            h(Icon,{key:'i',name:'search',size:36,glow:'#8a8170'}),
            h('div',{key:'t',className:'cjk',style:{marginTop:10}},'没有匹配的会话'),
            h('button',{key:'b',className:'pxbtn cjk sm',style:{marginTop:12},onClick:clearAll},'清除筛选'),
          ]),
        ]),
        mode==='schedule'&&!editing&&h(ScheduledList,{key:'sl',sched,onToggle:toggle,onEdit:(t)=>setEditing(t),onDelete:del,onNew:()=>setEditing('new')}),
        mode==='schedule'&&editing&&h(ScheduleForm,{key:'sf',task:editing==='new'?null:editing,onCancel:()=>setEditing(null),onSave:saveTask}),
      ])
    );
  }
  window.SessionGrid=SessionGrid;

  // expose hub
  function Lobby({onOpen,onEnterSession,runtime,mainHero,onPickHero,density,L}){
    const heroObj=DATA.heroPool.find(hp=>hp.hero===mainHero);
    if(!heroObj) return h(CharacterSelect,{onPick:(hp)=>{onPickHero&&onPickHero(hp.hero);}});
    return h(HubWorld,{picked:heroObj,onOpen,onEnterSession,density,L});
  }
  window.Lobby=Lobby;

  // ================= EMPTY STATE =================
  function EmptyState({onSummon}){
    return h('div',{className:'hub empty-state'},[
      h('div',{key:'floor',className:'hub-floor town'}),
      h('div',{key:'vig',className:'vignette'}),
      h('div',{key:'c',className:'empty-center'},[
        h('div',{key:'f',className:'struct-tower big'},[h('div',{key:'r',className:'tower-ring'}),h('div',{key:'o',className:'tower-orb'},h(Icon,{name:'quest',size:72,glow:'#36c5e0'}))]),
        h('div',{key:'t',className:'empty-title px'},T('空无一人')),
        h('div',{key:'s',className:'empty-sub cjk'},T('召唤你的第一个小队，开始 vibe coding')),
        h('button',{key:'b',className:'pxbtn gold cjk',onClick:onSummon},[h(Icon,{key:'i',name:'task',size:18,style:{marginRight:8}}),T('召唤小队')]),
      ]),
    ]);
  }
  window.EmptyState=EmptyState;

  // ================= ERROR OVERLAY =================
  function ErrorOverlay({onRetry,onClose}){
    return h('div',{className:'scrim',onClick:onClose},
      h('div',{className:'error-overlay',onClick:e=>e.stopPropagation()},[
        h('div',{key:'i',className:'error-spark'},h(Icon,{name:'error',size:64,glow:'#ff4d6d'})),
        h('div',{key:'t',className:'px',style:{fontSize:14,color:'#ff8197',margin:'18px 0 10px'}},'runtime 离线'),
        h('div',{key:'d',className:'dim',style:{marginBottom:8}},'无法连接到该项目的 Claude Code engine。'),
        h('div',{key:'d2',className:'faint',style:{fontSize:12,marginBottom:22}},'资源/连接失败时显示可见错误层，绝不静默黑屏。'),
        h('div',{key:'act',style:{display:'flex',gap:12,justifyContent:'center'}},[
          h('button',{key:'r',className:'pxbtn primary cjk',onClick:onRetry},'重试连接'),
          h('button',{key:'c',className:'pxbtn cjk',onClick:onClose},'返回'),
        ]),
      ])
    );
  }
  window.ErrorOverlay=ErrorOverlay;

  // ================= PROTOTYPE GUIDE =================
  function Guide({open,onToggle,go}){
    const screens=[
      ['登录页','login',null],['内景房间','interior',null],['大厅 Hub','lobby',null],['任务台','panel','sessiongrid'],['空态','empty',null],['错误态','error',null],
      ['NPC 卡片','panel','npc'],['任务面板','panel','tasks'],['设置','panel','settings'],['技能','panel','skills'],['插件市场','panel','market'],['装饰商店','panel','shop'],['排行榜','panel','leaderboard'],
      ['成就殿','panel','achievements'],['邮箱','panel','mailbox'],['扭蛋机','panel','gacha'],['扫码配对','panel','pairing'],
    ];
    return h('div',{className:'guide'+(open?' open':'')},[
      h('div',{key:'tab',className:'guide-tab',onClick:onToggle},[h(Icon,{key:'i',name:'menu',size:18}),h('span',{key:'t',className:'px'},open?'×':'导览')]),
      open&&h('div',{key:'body',className:'guide-body'},[
        h('div',{key:'h',className:'px',style:{fontSize:9,color:'#f2c84b',marginBottom:8}},'原型导览'),
        h('div',{key:'g',className:'guide-grid'},screens.map(([label,kind,arg],i)=>
          h('button',{key:i,className:'guide-btn cjk',onClick:()=>go(kind,arg)},label))),
      ]),
    ]);
  }
  window.Guide=Guide;
})();
