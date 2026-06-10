/* ROGUENT panels (1/2): Modal shell, NpcCard, Tasks, Skills, Leaderboard.
   Globals: React, Icon, PixelSprite, DATA, GOLD_TINT. */
(function(){
  const {useState}=React;
  const h=React.createElement;

  function Modal({title,sub,icon,accent='#f2c84b',onClose,width=1120,height,vibe,children}){
    return h('div',{className:'scrim',onClick:onClose},
      h('div',{className:'panel rivets modal-pop'+(vibe?' vibe-'+vibe:''),style:{width,maxHeight:'960px',height},onClick:e=>e.stopPropagation()},[
        h('div',{key:'tb',className:'panel-titlebar'},[
          icon&&h(Icon,{key:'i',name:icon,size:22,glow:accent}),
          h('span',{key:'t',className:'title',style:{color:accent}},title),
          sub&&h('span',{key:'s',className:'sub cjk'},sub),
          h('div',{key:'x',className:'closex px',onClick:onClose},'✕'),
        ]),
        h('div',{key:'b',className:'panel-body scroll',style:{maxHeight:'860px'}},children),
      ])
    );
  }
  window.Modal=Modal;

  // ---------------- NPC CARD (§6.7 + §6.8 local override) ----------------
  function NpcCard({npc,onClose,onOpen}){
    const [mode,setMode]=useState(npc.threshold==null?'inherit':'override');
    const [pct,setPct]=useState(npc.threshold||20);
    const [confirmDel,setConfirmDel]=useState(false);
    const statusColor={working:'#36c5e0',thinking:'#a06cd5',askuser:'#36c5e0',todo:'#f2c84b',idle:'#8a8170',done:'#5fd35f',error:'#ff4d6d'}[npc.status]||'#c9b79a';
    const row=(label,val,extra)=>h('div',{key:label,className:'statrow'},[
      h('span',{key:'l',className:'sr-label'},label),
      h('span',{key:'v',className:'sr-val'+(extra||'')},val),
    ]);
    return h(Modal,{title:'NPC',sub:'会话档案',icon:'account',accent:statusColor,onClose,width:760},
      h('div',{className:'npccard'},[
        h('div',{key:'hd',className:'npccard-hd'},[
          h('div',{key:'p',className:'npccard-portrait',style:{boxShadow:'0 0 0 3px '+statusColor}},h(PixelSprite,{base:npc.hero,anim:'idle',scale:5,filter:npc.orchestrator?GOLD_TINT:undefined})),
          h('div',{key:'meta',className:'npccard-meta'},[
            h('div',{key:'n',className:'npccard-name px'},[npc.orchestrator&&h('span',{key:'s',className:'gold'},'★ '),npc.name]),
            h('div',{key:'r',className:'dim'},npc.role),
            h('div',{key:'tags',className:'npccard-tags'},[
              h('span',{key:'st',className:'chip',style:{color:statusColor,boxShadow:'inset 0 0 0 1px '+statusColor}},statusText(npc.status)),
              h('span',{key:'rt',className:'chip tag-claude'},[h(Icon,{key:'i',name:'claude',size:13,style:{marginRight:4}}),'Claude']),
            ]),
          ]),
        ]),
        npc.status==='askuser'&&h('div',{key:'ask',className:'ask-banner askpulse'},[
          h(Icon,{key:'i',name:'ask',size:22,glow:'#36c5e0'}),
          h('div',{key:'t'},[h('div',{key:'1',className:'px',style:{fontSize:10,color:'#36c5e0',marginBottom:4}},'待你回应'),h('div',{key:'2'},npc.ask)]),
        ]),
        h('div',{key:'stats',className:'statgrid'},[
          row('项目',DATA.room.project),
          row('模型',npc.model,' gold'),
          row('模式',npc.orchestrator?'orchestrator':'subagent'),
          row('状态',statusText(npc.status)),
          npc.orchestrator&&row('子智能体',Object.entries(npc.sub).map(([k,v])=>statusText(k)+' '+v).join(' · ')),
          row('Token',npc.tokens.toLocaleString()),
          row('花费','$'+npc.cost.toFixed(2)),
        ]),
        // context bar
        h('div',{key:'ctx',className:'npccard-ctx'},[
          h('div',{key:'l',className:'sr-label'},['上下文 ',h('span',{key:'p',className:'px',style:{fontSize:9}},npc.util+'%')]),
          h('div',{key:'b',className:'util',style:{width:'100%',height:12}},[
            h('div',{key:'f',className:'fill',style:{width:npc.util+'%',background:npc.util<20?'#5fd35f':npc.util<=80?'#f2c84b':'#ff4d6d'}}),
            h('div',{key:'t',className:'tick',style:{left:'20%'}}),
          ]),
        ]),
        // compaction override (§6.8)
        h('div',{key:'comp',className:'comp-box'},[
          h('div',{key:'h',className:'comp-h'},[
            h(Icon,{key:'i',name:'compact',size:18}),
            h('span',{key:'t',className:'px',style:{fontSize:10}},'上下文压缩阈值'),
            h('span',{key:'q',className:'qmark has-tip'},['?',h('div',{key:'tip',className:'tip cjk',style:{width:240,whiteSpace:'normal',bottom:'auto',top:'calc(100% + 6px)'}},'达到该 % 自动 /compact 并续跑。订阅模式 Opus 默认 1M 上下文，设阈值可避免烧爆额度。')]),
          ]),
          h('div',{key:'seg',className:'seg'},[
            h('div',{key:'i',className:'seg-opt'+(mode==='inherit'?' on':''),onClick:()=>setMode('inherit')},'继承全局 (20%)'),
            h('div',{key:'o',className:'seg-opt'+(mode==='override'?' on':''),onClick:()=>setMode('override')},'局部覆盖'),
          ]),
          mode==='override'&&h('div',{key:'sl',className:'slider-row'},[
            h('input',{key:'r',type:'range',min:5,max:95,step:5,value:pct,onChange:e=>setPct(+e.target.value),className:'pxrange'}),
            h('div',{key:'n',className:'px pct-num'},pct+'%'),
          ]),
          h('div',{key:'note',className:'faint',style:{fontSize:11,marginTop:6}},mode==='inherit'?'跟随设置面板的全局默认（Opus 20%）。':'此 NPC 单独生效，优先级高于全局。'),
        ]),
        // actions
        h('div',{key:'act',className:'npccard-act'},[
          h('button',{key:'enter',className:'pxbtn primary cjk',onClick:onClose},'进入'),
          h('button',{key:'chat',className:'pxbtn cjk',onClick:()=>onOpen('chat')},'聊天'),
          h('button',{key:'arch',className:'pxbtn cjk'},'归档'),
          confirmDel
            ? h('button',{key:'del',className:'pxbtn danger cjk',onClick:onClose},'确认删除？')
            : h('button',{key:'del',className:'pxbtn cjk',style:{color:'#ff8197'},onClick:()=>setConfirmDel(true)},'删除'),
        ]),
      ])
    );
  }
  function statusText(s){return {working:'工作中',thinking:'思考',askuser:'待回应',todo:'待办',idle:'待命',done:'完成',error:'出错',compacting:'压缩中'}[s]||s;}
  window.NpcCard=NpcCard;
  window.statusText=statusText;

  // ---------------- TASKS (§6.9) ----------------
  function Tasks({onClose}){
    const [sel,setSel]=useState('t3');
    const tasks=DATA.tasks;
    const byState={pending:tasks.filter(t=>t.state==='pending'),'in-progress':tasks.filter(t=>t.state==='in-progress'),completed:tasks.filter(t=>t.state==='completed')};
    const npcName=id=>{const n=DATA.room.npcs.find(x=>x.id===id);return n?n.name:'待认领';};
    const heroOf=id=>{const n=DATA.room.npcs.find(x=>x.id===id);return n?n.hero:null;};
    const cur=tasks.find(t=>t.id===sel);
    const isBlocked=t=>t.state==='pending'&&t.deps.some(d=>{const dep=tasks.find(x=>x.id===d);return dep&&dep.state!=='completed';});
    const stateMeta={pending:['待领','#8a8170'],'in-progress':['进行中','#36c5e0'],completed:['完成','#5fd35f']};
    const askers=DATA.room.npcs.filter(n=>n.status==='askuser');
    return h(Modal,{title:'TASKS',sub:'共享任务清单 · agent teams',icon:'quest',onClose,width:1180},
      h('div',{className:'tasks-wrap'},[
        // askuser aggregation
        askers.length>0&&h('div',{key:'ask',className:'task-askbar'},[
          h(Icon,{key:'i',name:'ask',size:20,glow:'#36c5e0'}),
          h('span',{key:'t',className:'px',style:{fontSize:10,color:'#36c5e0'}},'待你回应 ('+askers.length+')'),
          ...askers.map(n=>h('span',{key:n.id,className:'chip',style:{cursor:'pointer'}},n.name)),
        ]),
        h('div',{key:'cols',className:'tasks-cols'},[
          // left: list grouped
          h('div',{key:'l',className:'tasks-list scroll'},Object.keys(byState).map(st=>h('div',{key:st,className:'task-group'},[
            h('div',{key:'h',className:'task-group-h px'},[h('span',{key:'d',className:'dot',style:{background:stateMeta[st][1]}}),stateMeta[st][0]+' ('+byState[st].length+')']),
            ...byState[st].map(t=>{
              const blk=isBlocked(t);
              return h('div',{key:t.id,className:'task-item'+(sel===t.id?' sel':''),onClick:()=>setSel(t.id)},[
                h('div',{key:'tt',className:'task-title'},[blk&&h(Icon,{key:'lk',name:'error',size:13,style:{marginRight:4,opacity:.8}}),t.title]),
                h('div',{key:'mt',className:'task-sub'},[
                  t.owner?h('span',{key:'o',className:'task-owner'},[heroOf(t.owner)&&h(PixelSprite,{key:'p',base:heroOf(t.owner),anim:'idle',scale:1.6}),npcName(t.owner)]):h('span',{key:'o',className:'faint'},'待认领'),
                  blk&&h('span',{key:'b',className:'chip',style:{color:'#ff8197'}},'阻塞中'),
                  t.blockedByUser&&h('span',{key:'u',className:'chip askpulse',style:{color:'#36c5e0'}},'等用户'),
                ]),
              ]);
            }),
          ]))),
          // right: detail
          h('div',{key:'r',className:'task-detail'},cur?[
            h('div',{key:'t',className:'task-d-title'},cur.title),
            h('div',{key:'s',className:'chip',style:{color:stateMeta[cur.state][1],boxShadow:'inset 0 0 0 1px '+stateMeta[cur.state][1],marginBottom:14}},stateMeta[cur.state][0]),
            h('div',{key:'desc',className:'task-d-desc'},cur.desc),
            h('div',{key:'meta',className:'task-d-meta'},[
              metaLine('归属',cur.owner?npcName(cur.owner):'待认领'),
              metaLine('模型',cur.model),
              metaLine('依赖',cur.deps.length?cur.deps.map(d=>{const dep=DATA.tasks.find(x=>x.id===d);return (dep?dep.title:d)+(dep&&dep.state==='completed'?' ✓':' ⧖');}).join('，'):'无'),
            ]),
            h('div',{key:'tl',className:'task-timeline'},[
              h('div',{key:'h',className:'px',style:{fontSize:9,color:'#8a8170',marginBottom:8}},'状态时间线'),
              h('div',{key:'1',className:'tl-step done'},'创建 · 19:02'),
              cur.state!=='pending'&&h('div',{key:'2',className:'tl-step done'},'认领 · 19:05'),
              cur.state==='completed'?h('div',{key:'3',className:'tl-step done'},'完成 · 19:41'):h('div',{key:'3',className:'tl-step now'},'进行中…'),
            ]),
            cur.state==='pending'&&!cur.blockedByUser&&h('button',{key:'claim',className:'pxbtn primary cjk',style:{marginTop:14}},'认领任务'),
          ]:h('div',{className:'faint'},'选择一个任务')),
        ]),
        // mailbox
        h('div',{key:'mb',className:'mailbox'},[
          h('div',{key:'h',className:'px',style:{fontSize:10,color:'#f2c84b',marginBottom:8}},[h(Icon,{key:'i',name:'chat',size:16,style:{marginRight:6,verticalAlign:'middle'}}),'信箱 · inter-agent']),
          h('div',{key:'l',className:'mb-list'},DATA.mailbox.map((m,i)=>h('div',{key:i,className:'mb-msg'},[
            h('span',{key:'f',className:'cyan'},npcName(m.from)),h('span',{key:'a',className:'faint'},' → '),h('span',{key:'t',className:'gold'},npcName(m.to)),h('span',{key:'x',className:'dim'},'：'+m.text),
          ]))),
        ]),
      ])
    );
    function metaLine(l,v){return h('div',{key:l,className:'statrow'},[h('span',{key:'l',className:'sr-label'},l),h('span',{key:'v',className:'sr-val'},v)]);}
  }
  window.Tasks=Tasks;

  // ---------------- SKILLS (§6.13 spellbook) ----------------
  function Skills({onClose}){
    const rarity={common:'#8a8170',rare:'#36c5e0',epic:'#a06cd5',legendary:'#f2c84b'};
    return h(Modal,{title:'SKILLS',sub:'法术书 · slash 命令 & skills',icon:'spellbook',accent:'#a06cd5',onClose,width:1000,vibe:'talent'},
      h('div',{className:'skill-grid'},DATA.skills.map(s=>h('div',{key:s.id,className:'skill-cell'+(s.unlocked?'':' locked'),style:{'--rar':rarity[s.rarity]}},[
        h('div',{key:'i',className:'skill-ic'},h(Icon,{name:s.icon,size:34,glow:s.unlocked?rarity[s.rarity]:undefined})),
        h('div',{key:'n',className:'skill-name px'},s.name),
        h('div',{key:'d',className:'skill-desc'},s.desc),
        h('div',{key:'r',className:'skill-rar px',style:{color:rarity[s.rarity]}},s.rarity),
        !s.unlocked&&h('div',{key:'lk',className:'skill-lock'},h(Icon,{name:'error',size:18})),
      ])))
    );
  }
  window.Skills=Skills;

  // ---------------- LEADERBOARD (§6.12) ----------------
  function Leaderboard({onClose}){
    const [tab,setTab]=useState('session');
    let rows=DATA.leaderboard;
    if(tab==='model'){
      const m={}; DATA.leaderboard.forEach(r=>{m[r.model]=m[r.model]||{title:r.model,tokens:0,cost:0,hero:r.hero,model:r.model,runtime:'claude'};m[r.model].tokens+=r.tokens;m[r.model].cost+=r.cost;});
      rows=Object.values(m).sort((a,b)=>b.tokens-a.tokens);
    } else if(tab==='runtime'){
      rows=[{title:'Claude',tokens:DATA.leaderboard.reduce((s,r)=>s+r.tokens,0),cost:DATA.leaderboard.reduce((s,r)=>s+r.cost,0),hero:'knight_m',model:'all',runtime:'claude'},
            {title:'Codex',tokens:0,cost:0,hero:'lizard_m',model:'—',runtime:'codex'}];
    }
    const max=Math.max(...rows.map(r=>r.tokens),1);
    const podium=tab==='session'?rows.slice(0,3):[];
    return h(Modal,{title:'LEADERBOARD',sub:'按 token 降序',icon:'trophy',onClose,width:1080},
      h('div',{className:'lb-wrap'},[
        h('div',{key:'tabs',className:'tabs'},[['session','按会话'],['model','按模型'],['runtime','按 runtime']].map(([k,l])=>
          h('div',{key:k,className:'tab'+(tab===k?' on':''),onClick:()=>setTab(k)},l))),
        podium.length===3&&h('div',{key:'pod',className:'podium'},[1,0,2].map(i=>{const r=podium[i];const place=i+1;const medal=['#f2c84b','#cfd6dd','#cd7f32'][i];
          return h('div',{key:i,className:'pod-col pod-'+place},[
            h('div',{key:'p',className:'pod-portrait',style:{boxShadow:'0 0 0 3px '+medal}},h(PixelSprite,{base:r.hero,anim:'idle',scale:3.2,filter:i===0?GOLD_TINT:undefined})),
            h('div',{key:'n',className:'pod-name'},r.title),
            h('div',{key:'t',className:'pod-tok px',style:{color:medal}},(r.tokens/1000).toFixed(0)+'k'),
            h('div',{key:'b',className:'pod-base px',style:{background:medal}},place),
          ]);
        })),
        h('div',{key:'rows',className:'lb-rows'},rows.map((r,i)=>h('div',{key:i,className:'lb-rrow'+(r.archived?' arch':'')},[
          h('div',{key:'r',className:'lb-rank px'},(i+1)),
          h('div',{key:'p',className:'lb-portrait'},h(PixelSprite,{base:r.hero,anim:'idle',scale:2,filter:r.runtime==='codex'?'grayscale(.7)':r.archived?'grayscale(.6)':undefined})),
          h('div',{key:'t',className:'lb-rtitle'},r.title),
          h('div',{key:'bar',className:'lb-bar'},[h('div',{key:'f',className:'lb-barfill',style:{width:(r.tokens/max*100)+'%'}}),h('span',{key:'v',className:'px lb-barv'},r.tokens.toLocaleString())]),
          h('div',{key:'c',className:'lb-cost px'},'$'+r.cost.toFixed(1)),
          h('div',{key:'m',className:'chip px',style:{fontSize:9}},r.model),
        ]))),
      ])
    );
  }
  window.Leaderboard=Leaderboard;
})();
