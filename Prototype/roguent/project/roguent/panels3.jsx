/* ROGUENT panels (3/3): Achievements, Mailbox, Gacha easter-egg, IM Pairing.
   Globals: React, Icon, PixelSprite, Modal, DATA, GOLD_TINT. */
(function(){
  const {useState,useRef,useEffect}=React;
  const h=React.createElement;
  const Modal=window.Modal;
  const RAR={common:'#8a8170',rare:'#36c5e0',epic:'#a06cd5',legendary:'#f2c84b'};
  const RARNAME={common:'普通',rare:'稀有',epic:'史诗',legendary:'传说'};

  // ============================================================
  //  ACHIEVEMENTS (成就殿) — §new
  // ============================================================
  function Achievements({onClose}){
    const [tab,setTab]=useState('all');
    const all=DATA.achievements;
    const done=all.filter(a=>a.unlocked);
    const pct=Math.round(done.length/all.length*100);
    let list=all;
    if(tab==='unlocked')list=done;
    else if(tab==='progress')list=all.filter(a=>!a.unlocked);
    return h(Modal,{title:'ACHIEVEMENTS',sub:'成就殿 · vibe-coding 里程碑',icon:'trophy',accent:'#f2c84b',onClose,width:1140},
      h('div',{className:'ach-wrap'},[
        h('div',{key:'hd',className:'ach-summary'},[
          h('div',{key:'l',className:'ach-sum-l'},[
            h(Icon,{key:'i',name:'trophy',size:38,glow:'#f2c84b'}),
            h('div',{key:'t'},[
              h('div',{key:'1',className:'px ach-sum-big'},done.length+' / '+all.length),
              h('div',{key:'2',className:'faint',style:{fontSize:12,marginTop:4}},'已解锁成就'),
            ]),
          ]),
          h('div',{key:'bar',className:'ach-sum-bar'},[
            h('div',{key:'f',className:'ach-sum-fill',style:{width:pct+'%'}}),
            h('span',{key:'v',className:'px ach-sum-pct'},pct+'%'),
          ]),
        ]),
        h('div',{key:'tabs',className:'tabs'},[['all','全部'],['unlocked','已解锁'],['progress','进行中']].map(([k,l])=>
          h('div',{key:k,className:'tab'+(tab===k?' on':''),onClick:()=>setTab(k)},l))),
        h('div',{key:'grid',className:'ach-grid scroll'},list.map(a=>h('div',{key:a.id,className:'ach-card'+(a.unlocked?' got':' lock'),style:{'--rar':RAR[a.rarity]}},[
          h('div',{key:'ic',className:'ach-ic'},[
            h(Icon,{name:a.icon,size:36,glow:a.unlocked?RAR[a.rarity]:undefined}),
            !a.unlocked&&h('div',{key:'lk',className:'ach-lockbadge'},h(Icon,{name:'error',size:14})),
          ]),
          h('div',{key:'m',className:'ach-mid'},[
            h('div',{key:'n',className:'ach-name'},a.name),
            h('div',{key:'d',className:'ach-desc'},a.desc),
            !a.unlocked&&a.total>1&&h('div',{key:'pg',className:'ach-prog'},[
              h('div',{key:'b',className:'ach-prog-bar'},h('div',{className:'ach-prog-fill',style:{width:(a.prog/a.total*100)+'%'}})),
              h('span',{key:'t',className:'px ach-prog-t'},a.prog+'/'+a.total),
            ]),
            h('div',{key:'r',className:'ach-foot'},[
              h('span',{key:'rar',className:'ach-rar px',style:{color:RAR[a.rarity]}},RARNAME[a.rarity]),
              h('span',{key:'rw',className:'ach-reward'},[h(Icon,{key:'i',name:'gemcur',size:13,style:{marginRight:4}}),a.reward]),
              a.unlocked&&h('span',{key:'at',className:'faint',style:{fontSize:10,marginLeft:'auto'}},'✓ '+a.at),
            ]),
          ]),
        ]))),
      ])
    );
  }
  window.Achievements=Achievements;

  // ============================================================
  //  MAILBOX (邮箱) — X feeds + GitHub monitors + askuser pings
  // ============================================================
  const SRC_META={x:['X 动态','#36c5e0'],github:['GitHub','#a06cd5'],ask:['askuser','#36c5e0'],system:['系统','#f2c84b']};
  function Mailbox({onClose,onOpen}){
    const [folder,setFolder]=useState('all');
    const [openId,setOpenId]=useState('m1');
    const [subs,setSubs]=useState(DATA.subscriptions);
    const inbox=DATA.inbox;
    const counts={all:inbox.length,x:inbox.filter(m=>m.type==='x').length,github:inbox.filter(m=>m.type==='github').length,ask:inbox.filter(m=>m.type==='ask').length};
    const unread=inbox.filter(m=>m.unread).length;
    let list=folder==='subs'?[]:inbox.filter(m=>folder==='all'||m.type===folder);
    const cur=inbox.find(m=>m.id===openId);
    const toggleSub=(id)=>setSubs(s=>s.map(x=>x.id===id?{...x,on:!x.on}:x));
    const folders=[['all','全部信件','chat'],['x','X 博主动态','chat'],['github','GitHub 监控','import'],['ask','askuser','ask'],['subs','订阅源管理','gear']];
    return h(Modal,{title:'MAILBOX',sub:'订阅信箱 · X 博主 + GitHub 仓库监控',icon:'chat',accent:'#36c5e0',onClose,width:1220},
      h('div',{className:'mbx-wrap'},[
        // folders
        h('div',{key:'nav',className:'mbx-nav'},[
          h('div',{key:'unread',className:'mbx-unread'},[h(Icon,{key:'i',name:'chat',size:18,glow:'#36c5e0'}),h('span',{key:'t',className:'px'},unread+' 未读')]),
          ...folders.map(([k,l,ic])=>h('div',{key:k,className:'mbx-folder'+(folder===k?' on':''),onClick:()=>setFolder(k)},[
            h(Icon,{key:'i',name:ic,size:16}),h('span',{key:'t'},l),
            counts[k]!=null&&h('span',{key:'c',className:'mbx-count px'},counts[k]),
          ])),
        ]),
        folder==='subs'
          ? h('div',{key:'subs',className:'mbx-subs scroll'},[
              h('div',{key:'h',className:'mbx-subs-h'},'管理你订阅的 X 博主与 GitHub 仓库。有新动态时推送到信箱，并可在公告板高亮。'),
              ...subs.map(s=>h('div',{key:s.id,className:'mbx-sub-row'},[
                h('div',{key:'av',className:'mbx-sub-av'},h(PixelSprite,{base:s.avatar,anim:'idle',scale:2.2})),
                h('div',{key:'m',className:'mbx-sub-meta'},[
                  h('div',{key:'n',className:'mbx-sub-name'},[s.name,s.kind==='github'?h(Icon,{key:'i',name:'import',size:13,style:{marginLeft:6,verticalAlign:'-2px'}}):null]),
                  h('div',{key:'h',className:'faint',style:{fontSize:11}},(s.kind==='x'?s.handle:'github.com')+' · '+s.freq),
                ]),
                h('span',{key:'k',className:'chip px',style:{fontSize:8,color:s.kind==='x'?'#36c5e0':'#a06cd5'}},s.kind==='x'?'X':'GitHub'),
                h('div',{key:'tg',className:'pxtoggle'+(s.on?' on':''),onClick:()=>toggleSub(s.id)},h('div',{className:'knob'})),
              ])),
              h('div',{key:'add',className:'mbx-sub-add'},[h(Icon,{key:'i',name:'task',size:15}),'+ 添加 X 博主 / GitHub 仓库']),
            ])
          : h('div',{key:'list',className:'mbx-list scroll'},list.map(m=>{
              const sm=SRC_META[m.type];
              return h('div',{key:m.id,className:'mbx-item'+(openId===m.id?' sel':'')+(m.unread?' unread':''),onClick:()=>setOpenId(m.id)},[
                h('div',{key:'av',className:'mbx-av'},[
                  h(PixelSprite,{key:'s',base:m.avatar,anim:'idle',scale:2}),
                  h('div',{key:'b',className:'mbx-av-badge',style:{background:sm[1]}},h(Icon,{name:m.type==='github'?'import':m.type==='ask'?'ask':'chat',size:10})),
                ]),
                h('div',{key:'c',className:'mbx-item-c'},[
                  h('div',{key:'top',className:'mbx-item-top'},[
                    h('span',{key:'a',className:'mbx-item-author'},m.author||m.repo||'系统'),
                    m.verified&&h('span',{key:'v',className:'mbx-verified'},'✓'),
                    h('span',{key:'t',className:'mbx-item-time faint'},m.time),
                  ]),
                  h('div',{key:'ti',className:'mbx-item-title'},m.title),
                  h('div',{key:'bd',className:'mbx-item-body'},m.body),
                ]),
                m.unread&&h('div',{key:'dot',className:'mbx-dot',style:{background:sm[1]}}),
              ]);
            })),
        // reading pane
        folder!=='subs'&&h('div',{key:'read',className:'mbx-read scroll'},cur?[
          h('div',{key:'hd',className:'mbx-read-hd'},[
            h('div',{key:'av',className:'mbx-read-av'},h(PixelSprite,{base:cur.avatar,anim:'idle',scale:3})),
            h('div',{key:'m',className:'mbx-read-meta'},[
              h('div',{key:'a',className:'mbx-read-author'},[cur.author||cur.repo||'系统',cur.verified&&h('span',{key:'v',className:'mbx-verified'},'✓')]),
              h('div',{key:'h',className:'faint',style:{fontSize:12}},(cur.handle||cur.session||cur.repo||'')+' · '+cur.time),
            ]),
            h('span',{key:'k',className:'chip px',style:{fontSize:8,color:SRC_META[cur.type][1],marginLeft:'auto'}},SRC_META[cur.type][0]),
          ]),
          h('div',{key:'ti',className:'mbx-read-title'},cur.title),
          h('div',{key:'bd',className:'mbx-read-body'},cur.body),
          cur.meta&&h('code',{key:'mt',className:'mbx-read-code'},cur.meta),
          h('div',{key:'tags',className:'mbx-tags'},cur.tags.map((t,i)=>h('span',{key:i,className:'chip px',style:{fontSize:8}},t))),
          h('div',{key:'act',className:'mbx-read-act'},
            cur.type==='ask'?[h('button',{key:'r',className:'pxbtn primary sm cjk',onClick:()=>onOpen&&onOpen('chat',cur)},'回应'),h('button',{key:'o',className:'pxbtn sm cjk',onClick:()=>onOpen&&onOpen('chat',cur)},'进入会话')]
            :cur.type==='github'?[h('button',{key:'v',className:'pxbtn gold sm cjk'},'查看 diff'),h('button',{key:'p',className:'pxbtn sm cjk'},'拉取到本地')]
            :[h('button',{key:'o',className:'pxbtn sm cjk'},'打开原文'),h('button',{key:'s',className:'pxbtn sm cjk'},'转发到配对 IM')]
          ),
        ]:h('div',{className:'faint',style:{padding:24}},'选择一封信件')),
      ])
    );
  }
  window.Mailbox=Mailbox;

  // ============================================================
  //  GACHA (扭蛋机彩蛋) — §new easter egg
  // ============================================================
  const GACHA_POOL=[
    {name:'忍者皮肤',icon:'task',rar:'epic',accent:'#ff4d6d'},
    {name:'黑猫伙伴',icon:'account',rar:'rare',accent:'#a06cd5'},
    {name:'黄金边框',icon:'trophy',rar:'epic',accent:'#f2c84b'},
    {name:'霓虹字体',icon:'write',rar:'rare',accent:'#36c5e0'},
    {name:'森林房间皮肤',icon:'quest',rar:'rare',accent:'#5fd35f'},
    {name:'×200 宝石',icon:'gemcur',rar:'common',accent:'#a06cd5'},
    {name:'史莱姆伙伴',icon:'bash',rar:'epic',accent:'#5fd35f'},
    {name:'赛博地砖',icon:'crystal',rar:'legendary',accent:'#36c5e0'},
  ];
  function Gacha({onClose}){
    const [phase,setPhase]=useState('idle'); // idle | spin | reveal
    const [prize,setPrize]=useState(null);
    const [lucky,setLucky]=useState(false);
    const clicks=useRef([]);
    const [loot,setLoot]=useState(()=>{try{return JSON.parse(localStorage.getItem('roguent_loot')||'[]');}catch(e){return [];}});
    const tmr=useRef(null);
    useEffect(()=>()=>clearTimeout(tmr.current),[]);
    const armLucky=(e)=>{ e.stopPropagation(); const now=Date.now(); clicks.current=clicks.current.filter(t=>now-t<1200); clicks.current.push(now); if(clicks.current.length>=5){ setLucky(true); clicks.current=[]; } };
    const roll=()=>{
      if(phase==='spin')return;
      setPhase('spin');setPrize(null);
      const wasLucky=lucky; setLucky(false);
      tmr.current=setTimeout(()=>{
        const pool=wasLucky?GACHA_POOL.filter(p=>p.rar==='legendary'):GACHA_POOL;
        const p=pool[Math.floor(Math.random()*pool.length)]||GACHA_POOL[0];
        setPrize({...p,jackpot:wasLucky});setPhase('reveal');
        setLoot(prev=>{const next=[p,...prev].slice(0,18);try{localStorage.setItem('roguent_loot',JSON.stringify(next));}catch(e){}return next;});
      },1600);
    };
    return h(Modal,{title:'GACHA',sub:'商店旁的扭蛋机 · 纯外观彩蛋',icon:'gemcur',accent:'#ff4d6d',onClose,width:560},
      h('div',{className:'gacha-wrap'},[
        h('div',{key:'machine',className:'gacha-machine'+(phase==='spin'?' shaking':'')+(lucky?' lucky':'')},[
          h('div',{key:'dome',className:'gacha-dome',onClick:armLucky},[
            ...[['#ff4d6d',18,22],['#36c5e0',46,16],['#f2c84b',30,40],['#5fd35f',58,38],['#a06cd5',16,52],['#ffe79a',50,56]].map(([c,l,t],i)=>
              h('div',{key:i,className:'gacha-cap',style:{background:c,left:l+'%',top:t+'%'}})),
            phase==='reveal'&&prize&&h('div',{key:'pr',className:'gacha-prize'+(prize.jackpot?' jackpot':''),style:{'--ac':prize.accent}},
              h(Icon,{name:prize.icon,size:54,glow:prize.accent})),
          ]),
          h('div',{key:'body',className:'gacha-body'},[
            h('div',{key:'slot',className:'gacha-slot'}),
            h('div',{key:'knob',className:'gacha-knob'+(phase==='spin'?' turning':'')}),
          ]),
          h('div',{key:'tray',className:'gacha-tray'},
            phase==='reveal'&&h('div',{key:'ball',className:'gacha-ball',style:{background:prize?prize.accent:'#fff'}})),
        ]),
        phase==='reveal'&&prize&&h('div',{key:'win',className:'gacha-win'},[
          prize.jackpot&&h('div',{key:'j',className:'gacha-jackpot px'},'★ JACKPOT ★'),
          h('div',{key:'r',className:'px',style:{fontSize:9,color:RAR[prize.rar],marginBottom:6}},RARNAME[prize.rar]+' 掉落'),
          h('div',{key:'n',className:'gacha-win-name'},prize.name),
        ]),
        lucky&&phase!=='reveal'&&h('div',{key:'luck',className:'gacha-luckhint px'},'★ 幸运已蓄力 · 下一发必出传说'),
        h('div',{key:'act',className:'gacha-act'},[
          h('div',{key:'bal',className:'gacha-bal'},[h(Icon,{key:'i',name:'gemcur',size:18}),h('span',{key:'v',className:'px',style:{color:'#a06cd5'}},DATA.currency.gems.toLocaleString())]),
          h('button',{key:'b',className:'pxbtn gold cjk',onClick:roll,disabled:phase==='spin'},
            phase==='spin'?'扭动中…':phase==='reveal'?'再来一发 · 500':[h(Icon,{key:'i',name:'gemcur',size:15,style:{marginRight:6}}),'扭一发 · 500']),
        ]),
        h('div',{key:'tip',className:'faint',style:{fontSize:11,textAlign:'center'}},'宝石由完成会话/任务赚取 · 扭蛋只影响外观，不改变开发结果'),
        h('div',{key:'loot',className:'gacha-loot'},[
          h('div',{key:'h',className:'gacha-loot-h'},[h(Icon,{key:'i',name:'pouch',size:14}),h('span',{key:'t',className:'px'},'战利品 · 已收集 '+loot.length+' 件 · 同步至背包')]),
          loot.length?h('div',{key:'r',className:'gacha-loot-row'},(()=>{
            const counts={};loot.forEach(p=>{counts[p.name]=counts[p.name]||{p,n:0};counts[p.name].n++;});
            return Object.values(counts).map((c,i)=>h('div',{key:i,className:'gacha-loot-cell',style:{'--ac':c.p.accent},title:c.p.name},[
              h(Icon,{key:'i',name:c.p.icon,size:24,glow:c.p.accent}),
              c.n>1&&h('span',{key:'x',className:'gacha-loot-x'},'×'+c.n),
            ]));
          })()):h('div',{key:'e',className:'gacha-loot-empty'},'还没有战利品 · 扭一发试试'),
        ]),
      ])
    );
  }
  window.Gacha=Gacha;

  // ============================================================
  //  IM PAIRING (扫码配对：微信 / 飞书)
  // ============================================================
  function QRPixels({seed=7,accent='#2c1c10'}){
    // deterministic 21x21 QR-like matrix with 3 finder squares
    const N=21,cells=[];
    const finder=(ox,oy)=>{for(let y=0;y<7;y++)for(let x=0;x<7;x++){const edge=x===0||y===0||x===6||y===6;const core=x>=2&&x<=4&&y>=2&&y<=4;if(edge||core)cells.push([ox+x,oy+y]);}};
    finder(0,0);finder(N-7,0);finder(0,N-7);
    let s=seed*2654435761>>>0;
    const rnd=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const inFinder=(x<8&&y<8)||(x>N-9&&y<8)||(x<8&&y>N-9);
      if(inFinder)continue;
      if(rnd()>0.55)cells.push([x,y]);
    }
    return h('svg',{width:168,height:168,viewBox:'0 0 21 21',style:{shapeRendering:'crispEdges',display:'block'}},
      cells.map((c,i)=>h('rect',{key:i,x:c[0],y:c[1],width:1,height:1,fill:accent})));
  }
  const APP_META={wechat:['微信','#5fd35f','wechat'],feishu:['飞书','#36c5e0','feishu']};
  function Pairing({onClose}){
    const [devices,setDevices]=useState(DATA.pairedDevices);
    const [scanApp,setScanApp]=useState('wechat');
    const toggle=(id)=>setDevices(d=>d.map(x=>x.id===id?{...x,on:!x.on}:x));
    const am=APP_META[scanApp];
    return h(Modal,{title:'PAIRING',sub:'扫码配对 · 微信 / 飞书消息互转',icon:'mcp',accent:'#5fd35f',onClose,width:1000},
      h('div',{className:'pair-wrap'},[
        // left: scan
        h('div',{key:'scan',className:'pair-scan'},[
          h('div',{key:'tabs',className:'pair-apptabs'},Object.keys(APP_META).map(k=>
            h('div',{key:k,className:'pair-apptab'+(scanApp===k?' on':''),style:{'--ac':APP_META[k][1]},onClick:()=>setScanApp(k)},APP_META[k][0]))),
          h('div',{key:'qr',className:'pair-qr',style:{'--ac':am[1]}},[
            h(QRPixels,{key:'px',seed:scanApp==='wechat'?7:13}),
            h('div',{key:'logo',className:'pair-qr-logo',style:{background:am[1]}},h(Icon,{name:'mcp',size:20})),
          ]),
          h('div',{key:'t',className:'pair-scan-t'},['用 ',h('span',{key:'a',style:{color:am[1]}},am[0]),' 扫码绑定本指挥台']),
          h('div',{key:'s',className:'faint',style:{fontSize:11,textAlign:'center',lineHeight:1.6}},'绑定后：在 '+am[0]+' 给机器人发消息 → 自动转接到当前会话；AI 的回复也会推送回 '+am[0]+'。'),
          h('div',{key:'flow',className:'pair-flow'},[
            h('div',{key:'a',className:'pair-flow-node'},[h(Icon,{key:'i',name:'mcp',size:20,glow:am[1]}),h('span',{key:'t'},am[0])]),
            h('div',{key:'ar',className:'pair-flow-arrows'},[h('span',{key:'1'},'⇄'),h('span',{key:'2',className:'faint',style:{fontSize:9}},'双向转发')]),
            h('div',{key:'b',className:'pair-flow-node'},[h(Icon,{key:'i',name:'task',size:20,glow:'#36c5e0'}),h('span',{key:'t'},'Roguent')]),
          ]),
        ]),
        // right: paired devices
        h('div',{key:'dev',className:'pair-dev'},[
          h('div',{key:'h',className:'px',style:{fontSize:10,color:'#f2c84b',marginBottom:4}},'已配对设备'),
          ...devices.map(d=>{const m=APP_META[d.app];
            return h('div',{key:d.id,className:'pair-row'+(d.on?'':' off'),style:{'--ac':m[1]}},[
              h('div',{key:'ic',className:'pair-row-ic'},h(Icon,{name:'mcp',size:22,glow:d.on?m[1]:undefined})),
              h('div',{key:'m',className:'pair-row-m'},[
                h('div',{key:'n',className:'pair-row-n'},[d.name,h('span',{key:'k',className:'chip px',style:{fontSize:8,marginLeft:8,color:m[1]}},m[0])]),
                h('div',{key:'s',className:'faint',style:{fontSize:11}},d.nick+' · 配对于 '+d.since+' · 已转发 '+d.forwarded+' 条'),
              ]),
              h('div',{key:'tg',className:'pair-toggle-wrap'},[
                h('span',{key:'l',className:'px pair-state',style:{color:d.on?m[1]:'#8a8170'}},d.on?'转发开':'已暂停'),
                h('div',{key:'t',className:'pxtoggle'+(d.on?' on':''),onClick:()=>toggle(d.id)},h('div',{className:'knob'})),
              ]),
            ]);
          }),
          h('div',{key:'note',className:'pair-note'},[
            h(Icon,{key:'i',name:'idle',size:16}),
            h('span',{key:'t'},'关闭转发后，消息只在指挥台内处理，不再回推到 IM。配对信息加密存储于本地。'),
          ]),
        ]),
      ])
    );
  }
  window.Pairing=Pairing;

  // ============================================================
  //  ANNOUNCE BOARD (公告板) — today's aggregated pings
  // ============================================================
  const AN_KIND={x:['X 动态','#36c5e0'],github:['GitHub','#a06cd5'],ask:['askuser','#36c5e0'],ci:['CI','#5fd35f'],usage:['用量','#f2c84b']};
  function Announce({onClose,onOpen}){
    const list=DATA.announcements;
    return h(Modal,{title:'BOARD',sub:'大厅公告板 · 今日动态',icon:'quest',accent:'#f2c84b',onClose,width:840},
      h('div',{className:'anb-wrap'},[
        h('div',{key:'hd',className:'anb-hd'},[
          h(Icon,{key:'i',name:'quest',size:22,glow:'#f2c84b'}),
          h('span',{key:'t',className:'cjk',style:{fontSize:14,color:'#f4ead7'}},'今天收到 '+list.length+' 条动态'),
          h('span',{key:'s',className:'faint',style:{fontSize:11,marginLeft:'auto'}},'来自订阅源 · askuser · CI · 用量'),
        ]),
        h('div',{key:'list',className:'anb-list'},list.map(a=>{const km=AN_KIND[a.kind]||['',a.accent];
          const dest={x:'mailbox',github:'mailbox',usage:'account',ask:'tasks',ci:'sessiongrid'}[a.kind]||'mailbox';
          return h('div',{key:a.id,className:'anb-row anb-link',style:{'--ac':a.accent},onClick:()=>onOpen&&onOpen(dest)},[
            h('div',{key:'ic',className:'anb-ic'},h(Icon,{name:a.icon,size:22,glow:a.accent})),
            h('div',{key:'c',className:'anb-c'},[
              h('div',{key:'top',className:'anb-top'},[
                h('span',{key:'k',className:'chip px',style:{fontSize:8,color:a.accent}},km[0]),
                h('span',{key:'f',className:'anb-from'},a.from),
                h('span',{key:'t',className:'faint',style:{fontSize:10,marginLeft:'auto'}},a.time),
              ]),
              h('div',{key:'tx',className:'anb-tx'},a.text),
            ]),
            h('span',{key:'go',className:'anb-go px'},'›'),
          ]);
        })),
        h('div',{key:'foot',className:'anb-foot'},[
          h('button',{key:'m',className:'pxbtn sm cjk',onClick:()=>onOpen&&onOpen('mailbox')},[h(Icon,{key:'i',name:'mail',size:14,style:{marginRight:6}}),'打开邮箱']),
          h('button',{key:'t',className:'pxbtn sm cjk',onClick:()=>onOpen&&onOpen('tasks')},'查看 askuser'),
        ]),
      ])
    );
  }
  window.Announce=Announce;

  // ============================================================
  //  LOGIN ACTIVITY POPUP (登录活动弹窗) — daily sign-in + events
  // ============================================================
  function EventArt({kind,accent,onGo}){
    if(kind==='signin'){
      const days=DATA.dailyRewards;
      return h('div',{className:'ev-signin'},days.map(d=>
        h('div',{key:d.day,className:'ev-day'+(d.got?' got':'')+(d.today?' today':'')+(d.big?' big':'')},[
          h('div',{key:'l',className:'ev-day-n px'},'第'+d.day+'天'),
          h('div',{key:'i',className:'ev-day-ic'},h(Icon,{name:d.icon,size:d.big?32:26,glow:d.today||d.big?accent:undefined})),
          h('div',{key:'v',className:'ev-day-v'},d.label),
          d.got&&h('div',{key:'c',className:'ev-day-check'},'✓'),
          d.today&&h('div',{key:'t',className:'ev-day-badge px'},'今日'),
        ])));
    }
    if(kind==='board'){
      const dest={x:'mailbox',github:'mailbox',usage:'account',ask:'tasks',ci:'sessiongrid'};
      return h('div',{className:'ev-board'},DATA.announcements.map(a=>
        h('div',{key:a.id,className:'ev-board-row',style:{'--ac2':a.accent},onClick:()=>onGo&&onGo(dest[a.kind]||'announce')},[
          h('div',{key:'i',className:'ev-board-ic'},h(Icon,{name:a.icon,size:16,glow:a.accent})),
          h('div',{key:'c',className:'ev-board-tx'},[
            h('span',{key:'f',className:'ev-board-from'},a.from+'  '),a.text,
          ]),
          h('span',{key:'t',className:'ev-board-time'},a.time),
          h('span',{key:'g',className:'ev-board-go px'},'›'),
        ])));
    }
    // poster art for double / release
    const glyph=kind==='double'?'gemcur':'crystal';
    return h('div',{className:'ev-poster',style:{'--ac':accent}},[
      h('div',{key:'rays',className:'ev-poster-rays'}),
      ...[...Array(7)].map((_,i)=>h('div',{key:'s'+i,className:'ev-poster-spark',style:{left:(8+i*13)+'%',top:(12+(i*37)%70)+'%',animationDelay:(i*0.3)+'s'}})),
      h('div',{key:'g',className:'ev-poster-glyph'},h(Icon,{name:glyph,size:80,glow:accent})),
      kind==='double'&&h('div',{key:'x2',className:'ev-poster-x2 px'},'×2'),
    ]);
  }

  function LoginEvents({onClose,onOpen}){
    const list=DATA.events;
    const [idx,setIdx]=useState(0);
    const [claimed,setClaimed]=useState(false);
    const [dontShow,setDontShow]=useState(false);
    const ev=list[idx];
    const close=()=>{ if(dontShow){try{localStorage.setItem('roguent_events_seen',new Date().toDateString());}catch(e){}} onClose(); };
    const go=(p)=>{ if(p&&onOpen){onClose();onOpen(p);} };
    return h('div',{className:'ev-scrim',onClick:close},
      h('div',{className:'ev-pop',style:{'--ac':ev.accent},onClick:e=>e.stopPropagation()},[
        // banner ribbon
        h('div',{key:'rib',className:'ev-ribbon'},[
          h('span',{key:'k',className:'ev-ribbon-k px'},ev.kind),
          h('span',{key:'t',className:'ev-ribbon-t cjk'},ev.title),
          ev.tag&&h('span',{key:'g',className:'ev-ribbon-tag px'},ev.tag),
        ]),
        h('div',{key:'x',className:'ev-close px',onClick:close},'✕'),
        // art
        h('div',{key:'art',className:'ev-art'+(ev.art==='board'?' tall':'')},h(EventArt,{kind:ev.art,accent:ev.accent,onGo:go})),
        // body
        h('div',{key:'body',className:'ev-body'},[
          h('div',{key:'s',className:'ev-sub cjk'},ev.sub),
          ev.desc&&h('div',{key:'d',className:'ev-desc'},ev.desc),
          ev.ends&&h('div',{key:'e',className:'ev-ends px'},[h(Icon,{key:'i',name:'idle',size:13,style:{marginRight:6}}),ev.ends]),
        ]),
        // actions
        h('div',{key:'act',className:'ev-act'},
          ev.art==='signin'
            ? [h('button',{key:'c',className:'pxbtn gold cjk'+(claimed?' is-done':''),disabled:claimed,onClick:()=>setClaimed(true)},
                claimed?'✓ 已领取 · 1天 Max':[h(Icon,{key:'i',name:'gemcur',size:16,style:{marginRight:8}}),'领取今日奖励'])]
            : [h('button',{key:'g',className:'pxbtn gold cjk',onClick:()=>go(ev.goto)},ev.cta||'查看'),
               h('button',{key:'l',className:'pxbtn sm cjk',onClick:close},'稍后')]
        ),
        // dots + dontshow
        h('div',{key:'foot',className:'ev-foot'},[
          h('label',{key:'ds',className:'ev-dontshow'},[
            h('span',{key:'b',className:'ev-check'+(dontShow?' on':''),onClick:()=>setDontShow(v=>!v)},dontShow?'✓':''),
            h('span',{key:'t'},'今日不再提示'),
          ]),
          h('div',{key:'dots',className:'ev-dots'},list.map((_,i)=>
            h('span',{key:i,className:'ev-dot'+(idx===i?' on':''),onClick:()=>{setIdx(i);}}))),
          h('div',{key:'nav',className:'ev-nav'},[
            h('span',{key:'p',className:'ev-arrow px',onClick:()=>setIdx(i=>(i-1+list.length)%list.length)},'‹'),
            h('span',{key:'n',className:'ev-arrow px',onClick:()=>setIdx(i=>(i+1)%list.length)},'›'),
          ]),
        ]),
      ])
    );
  }
  window.LoginEvents=LoginEvents;
})();
