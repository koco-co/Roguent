/* ROGUENT custom pixel icons — drawn as rect compositions on a 16px grid.
   Hard edges, dark outline #2c1c10, top-left light source. NO emoji.
   Exposes window.Icon (React) + window.ICONS (names). */
(function(){
  const O='#2c1c10';                 // outline
  const C={                          // shared palette
    red:'#ff4d6d', redD:'#c8324f', redH:'#ff90a3',
    cyan:'#36c5e0', cyanD:'#1f8aa3', cyanH:'#9fe9f7',
    gold:'#f2c84b', goldD:'#b8881f', goldH:'#ffe79a',
    green:'#5fd35f', greenD:'#2f9c3a', greenH:'#b6f0a8',
    purple:'#a06cd5', purpleD:'#6f43a0', purpleH:'#d6b6f2',
    wood:'#8a5a32', woodD:'#5a3a1e', woodH:'#c08a52',
    paper:'#e9dcc0', paperD:'#c4b48c',
    steel:'#aeb9c6', steelD:'#6f7c8c', steelH:'#e3ebf3',
    ink:'#2c1c10', white:'#f4ead7', shadow:'#0b0a12',
    pink:'#ff4d6d', muted:'#8a8170',
  };
  // r(x,y,w,h,color)
  const r=(x,y,w,h,c)=>({x,y,w,h,c});
  // box: filled rect with 1px outline
  function box(x,y,w,h,fill,line){const a=[r(x,y,w,h,line||O)];a.push(r(x+1,y+1,w-2,h-2,fill));return a;}

  const ART={};

  // ---- HP heart ----
  ART.heart=[
    r(3,2,4,1,O),r(9,2,4,1,O),
    r(2,3,1,3,O),r(7,3,2,2,O),r(13,3,1,3,O),
    r(3,3,4,1,C.redH),r(9,3,4,1,C.redH),
    r(3,4,4,2,C.red),r(9,4,4,2,C.red),
    r(2,6,12,1,C.red),r(2,6,1,1,O),r(13,6,1,1,O),
    r(3,7,10,1,C.redD),r(2,7,1,1,O),r(13,7,1,1,O),
    r(4,8,8,1,C.redD),r(3,8,1,1,O),r(12,8,1,1,O),
    r(5,9,6,1,C.redD),r(4,9,1,1,O),r(11,9,1,1,O),
    r(6,10,4,1,C.redD),r(5,10,1,1,O),r(10,10,1,1,O),
    r(7,11,2,1,O),
  ];
  // ---- MP / week gem (mana crystal) ----
  ART.gem=[
    r(6,1,4,1,O),r(5,2,1,1,O),r(10,2,1,1,O),
    r(6,2,4,1,C.cyanH),
    r(4,3,1,1,O),r(11,3,1,1,O),r(5,3,6,1,C.cyan),r(6,3,1,1,C.cyanH),
    r(3,4,1,2,O),r(12,4,1,2,O),r(4,4,8,2,C.cyan),r(4,4,2,1,C.cyanH),
    r(3,6,10,1,C.cyanD),r(2,6,1,1,O),r(13,6,1,1,O),
    r(4,7,8,1,C.cyanD),r(3,7,1,1,O),r(12,7,1,1,O),
    r(5,8,6,1,C.cyanD),r(4,8,1,1,O),r(11,8,1,1,O),
    r(6,9,4,1,C.cyanD),r(5,9,1,1,O),r(10,9,1,1,O),
    r(7,10,2,1,C.cyanD),r(6,10,1,1,O),r(9,10,1,1,O),
    r(7,11,2,1,O),
  ];
  // ---- token coin stack ----
  ART.coins=[
    r(4,9,8,1,O),r(3,10,10,1,O),r(3,10,10,1,O),
    r(3,10,1,3,O),r(12,10,1,3,O),r(4,10,8,3,C.gold),r(4,10,8,1,C.goldH),r(4,12,8,1,C.goldD),
    r(4,13,8,1,O),
    r(5,5,6,1,O),r(4,6,8,1,O),r(4,6,1,3,O),r(11,6,1,3,O),r(5,6,6,3,C.gold),r(5,6,6,1,C.goldH),r(5,8,6,1,C.goldD),r(5,9,6,1,O),
    r(7,7,2,1,C.goldH),
  ];
  // ---- gem currency (faceted) ----
  ART.gemcur=[
    r(5,2,6,1,O),r(4,3,1,1,O),r(11,3,1,1,O),r(5,3,6,1,C.purpleH),
    r(3,4,1,1,O),r(12,4,1,1,O),r(4,4,8,1,C.purple),
    r(3,5,10,1,C.purple),r(2,5,1,1,O),r(13,5,1,1,O),r(4,5,2,1,C.purpleH),
    r(2,6,12,1,C.purpleD),r(1,6,1,1,O),r(14,6,1,1,O),
    r(2,7,1,1,O),r(13,7,1,1,O),r(3,7,10,1,C.purple),
    r(3,8,1,1,O),r(12,8,1,1,O),r(4,8,8,1,C.purpleD),
    r(4,9,8,1,O),r(5,9,6,1,C.purpleD),r(5,9,1,1,O),r(10,9,1,1,O),
    r(5,10,6,1,O),r(6,10,4,1,C.purpleD),
    r(7,11,2,1,O),
  ];
  // ---- completed: laurel + check flag ----
  ART.laurel=[
    r(7,2,2,1,O),r(6,3,1,1,O),r(9,3,1,1,O),r(7,3,2,1,C.greenH),
    r(5,4,1,2,O),r(10,4,1,2,O),r(6,4,4,2,C.green),
    r(4,6,1,3,O),r(11,6,1,3,O),r(5,6,1,3,C.greenD),r(10,6,1,3,C.greenD),
    r(5,9,1,2,O),r(10,9,1,2,O),r(6,10,1,2,C.greenD),r(9,10,1,2,C.greenD),
    // check mark
    r(10,7,1,1,C.gold),r(9,8,1,1,C.gold),r(8,9,1,1,C.gold),r(6,8,1,1,C.gold),r(7,9,1,1,C.gold),r(7,10,1,1,C.goldH),
  ];

  // ---- spellbook (skill) ----
  ART.spellbook=[
    ...box(2,3,12,10,C.purpleD,O),
    r(3,4,5,8,C.purple),r(9,4,4,8,C.purple),
    r(8,3,1,10,O),
    r(4,5,3,1,C.purpleH),r(10,5,2,1,C.purpleH),
    r(4,7,3,1,C.purpleH),r(10,7,2,1,C.purpleH),
    r(4,9,2,1,C.purpleH),r(10,9,2,1,C.purpleH),
    // star clasp
    r(7,7,2,1,C.gold),r(8,6,1,3,C.gold),r(7,7,1,1,C.goldH),
  ];
  // ---- backpack / pouch ----
  ART.pouch=[
    r(6,2,4,1,O),r(5,3,1,1,O),r(10,3,1,1,O),r(6,3,4,1,C.woodH),
    ...box(3,4,10,9,C.wood,O),
    r(4,5,8,1,C.woodH),
    r(3,7,10,1,O),
    r(6,8,4,1,O),r(7,8,2,1,C.gold),
    r(4,9,3,3,C.woodD),r(9,9,3,3,C.woodD),
  ];
  // ---- chat scroll ----
  ART.chat=[
    ...box(2,3,12,7,C.paper,O),
    r(4,5,8,1,C.paperD),r(4,7,6,1,C.paperD),
    r(5,10,1,2,O),r(6,10,2,1,O),r(6,11,2,1,O),r(5,12,3,1,O), // tail
    r(6,10,1,2,C.paper),
  ];
  // ---- model crystal (multi-facet brain crystal) ----
  ART.crystal=[
    r(7,1,2,1,O),r(6,2,1,1,O),r(9,2,1,1,O),r(7,2,2,1,C.cyanH),
    r(5,3,1,4,O),r(10,3,1,4,O),r(6,3,4,1,C.cyan),
    r(6,4,4,3,C.cyan),r(6,4,1,3,C.cyanH),
    r(5,7,6,1,C.cyanD),
    r(6,8,1,3,O),r(9,8,1,3,O),r(7,8,2,3,C.cyanD),
    r(6,11,4,1,O),
    r(11,4,1,1,C.cyanH),r(12,5,1,1,C.cyanH),r(4,9,1,1,C.cyanH),
  ];
  // ---- import: folder + arrow ----
  ART.import=[
    r(2,4,5,1,O),r(2,5,1,8,O),
    ...box(2,5,12,8,C.gold,O),
    r(3,6,10,1,C.goldH),r(3,11,10,1,C.goldD),
    // down arrow
    r(8,6,1,3,O),r(6,8,5,1,O),r(7,9,3,1,O),r(8,10,1,1,O),
  ];
  // ---- quest scroll (tasks) ----
  ART.quest=[
    r(3,2,10,1,O),r(3,13,10,1,O),
    r(2,3,2,1,C.paperD),r(12,3,2,1,C.paperD),r(2,12,2,1,C.paperD),r(12,12,2,1,C.paperD),
    r(4,3,8,10,C.paper),r(3,3,1,10,O),r(12,3,1,10,O),
    r(6,5,5,1,O),r(6,7,5,1,O),r(6,9,4,1,O),
    r(5,5,1,1,C.green),r(5,7,1,1,C.green),r(5,9,1,1,C.muted),
  ];
  // ---- shop awning (market stall) ----
  ART.shop=[
    r(1,3,14,1,O),r(2,4,12,2,C.red),
    r(2,4,2,2,C.paper),r(6,4,2,2,C.paper),r(10,4,2,2,C.paper),
    r(2,6,1,1,O),r(4,6,1,1,O),r(6,6,1,1,O),r(8,6,1,1,O),r(10,6,1,1,O),r(12,6,1,1,O),
    r(2,7,12,6,C.woodD),r(2,7,1,6,O),r(13,7,1,6,O),r(2,12,12,1,O),
    r(4,8,3,4,C.wood),r(9,8,3,4,C.wood),
  ];
  // ---- trophy (leaderboard) ----
  ART.trophy=[
    r(4,2,8,1,O),r(4,3,1,4,O),r(11,3,1,4,O),r(5,3,6,3,C.gold),r(5,3,6,1,C.goldH),
    r(2,3,2,3,O),r(2,4,1,2,C.goldD),r(12,3,2,3,O),r(13,4,1,2,C.goldD),
    r(5,6,6,1,C.goldD),r(6,7,4,1,O),r(7,8,2,2,C.goldD),
    r(5,10,6,1,O),r(4,11,8,1,O),r(4,11,8,2,C.gold),r(4,12,8,1,C.goldD),r(4,13,8,1,O),
  ];

  // ---- settings gear-rune ----
  ART.gear=[
    r(7,1,2,1,O),r(7,1,2,1,C.steelH),
    r(1,7,1,2,O),r(14,7,1,2,O),r(7,14,2,1,O),
    r(3,3,2,2,C.steel),r(11,3,2,2,C.steel),r(3,11,2,2,C.steel),r(11,11,2,2,C.steel),
    ...box(4,4,8,8,C.steel,O),
    r(5,5,6,1,C.steelH),
    ...box(6,6,4,4,C.shadow,O),
    r(7,7,2,2,C.cyan),
  ];
  // ---- menu rune bars ----
  ART.menu=[
    ...box(2,3,12,2,C.gold,O),
    ...box(2,7,12,2,C.gold,O),
    ...box(2,11,12,2,C.gold,O),
    r(4,3,1,2,C.goldH),r(4,7,1,2,C.goldH),r(4,11,1,2,C.goldH),
  ];
  // ---- account portrait frame ----
  ART.account=[
    ...box(2,2,12,12,C.woodD,O),
    r(3,3,10,1,C.woodH),
    r(7,5,2,3,C.paperD),r(6,5,1,1,O),r(9,5,1,1,O), // head
    r(6,6,4,2,C.paper),
    r(5,9,6,3,C.cyan),r(5,9,6,1,C.cyanH), // shoulders
    r(4,10,1,2,O),r(11,10,1,2,O),
  ];
  // ---- pause ----
  ART.pause=[
    box(4,3,3,10,C.gold,O),box(9,3,3,10,C.gold,O),
    r(5,4,1,8,C.goldH),r(10,4,1,8,C.goldH),
  ].flat();

  // ---- tools ----
  ART.read=[ // open book
    r(2,4,5,1,O),r(9,4,5,1,O),r(7,3,2,9,O),
    r(2,4,1,8,O),r(13,4,1,8,O),r(2,12,12,1,O),
    r(3,5,4,7,C.paper),r(9,5,4,7,C.paper),
    r(4,6,2,1,C.cyanD),r(10,6,2,1,C.cyanD),r(4,8,3,1,C.paperD),r(9,8,3,1,C.paperD),
  ];
  ART.write=[ // quill
    r(11,2,2,1,O),r(10,3,2,1,O),r(9,4,2,1,O),r(8,5,2,1,O),r(7,6,2,1,O),
    r(10,3,1,1,C.white),r(9,4,1,2,C.steelH),r(8,5,1,2,C.steel),
    r(6,7,2,1,O),r(5,8,2,1,O),r(4,9,2,1,O),r(3,10,2,1,O),
    r(6,7,1,3,C.gold),r(4,9,2,2,C.goldD),
    r(3,11,2,1,C.ink),r(2,12,2,1,C.ink),
  ];
  ART.bash=[ // flask / test tube
    r(6,2,4,1,O),r(6,3,1,2,C.steelH),r(9,3,1,2,O),
    r(5,5,1,1,O),r(10,5,1,1,O),r(4,6,1,1,O),r(11,6,1,1,O),
    r(3,7,1,6,O),r(12,7,1,6,O),r(3,13,10,1,O),
    r(4,7,8,1,C.glassA||'#bfe9f0'),
    r(4,8,8,4,C.green),r(4,8,8,1,C.greenH),
    r(6,9,1,1,C.greenH),r(9,10,1,1,C.greenH),
  ];
  ART.search=[ // magnifier
    ...box(3,3,7,7,C.cyanD,O),
    r(4,4,5,5,C.cyanH),r(5,5,3,3,'#bfe9f0'),
    r(9,9,2,2,O),r(10,10,2,2,O),r(11,11,2,2,O),r(12,12,1,1,O),
    r(10,10,1,1,C.gold),
  ];
  ART.task=[ // wand + star
    r(11,2,2,1,C.gold),r(10,3,1,1,C.gold),r(12,3,1,1,C.gold),r(11,3,1,1,C.goldH),r(11,1,1,1,C.gold),
    r(9,5,2,1,O),r(8,6,2,1,O),r(7,7,2,1,O),r(6,8,2,1,O),r(5,9,2,1,O),r(4,10,2,1,O),r(3,11,2,1,O),
    r(9,5,1,1,C.purpleH),r(7,7,2,2,C.purple),r(4,10,2,2,C.purpleD),
    r(3,3,1,1,C.goldH),r(13,8,1,1,C.goldH),
  ];
  ART.mcp=[ // plug
    r(6,1,1,3,O),r(9,1,1,3,O),
    ...box(4,4,8,4,C.steel,O),r(5,5,6,1,C.steelH),
    r(5,8,6,2,C.steelD),r(6,8,4,1,O),
    r(7,10,2,3,O),r(7,10,2,3,C.gold),r(7,13,2,1,O),
  ];

  // ---- status ----
  ART.ask=[ // glowing ? rune in bubble
    ...box(2,2,12,9,C.cyanD,O),r(3,3,10,1,C.cyanH),
    r(6,10,1,2,O),r(6,11,2,1,O),r(6,10,1,2,C.cyanD), // tail
    // question mark
    r(6,4,4,1,C.white),r(6,4,1,2,C.white),r(9,4,1,3,C.white),r(8,6,1,1,C.white),r(7,7,1,1,C.white),r(7,9,1,1,C.white),
  ];
  ART.todo=[ // small scroll
    r(4,3,8,1,O),r(4,12,8,1,O),r(3,4,1,8,O),r(12,4,1,8,O),
    r(4,4,8,8,C.paper),r(6,6,4,1,C.paperD),r(6,8,4,1,C.paperD),r(6,10,3,1,C.muted),
  ];
  ART.idle=[ // zzz
    r(8,2,4,1,O),r(11,3,1,1,O),r(9,4,2,1,O),r(8,5,4,1,O),r(8,2,4,1,C.white),r(8,5,4,1,C.white),
    r(4,7,3,1,O),r(6,8,1,1,O),r(4,9,1,1,O),r(3,10,3,1,O),r(4,7,3,1,C.cyanH),r(3,10,3,1,C.cyanH),
  ];
  ART.done=[ // green check
    r(11,4,2,2,C.greenH),r(10,5,2,2,C.green),r(9,6,2,2,C.green),r(8,7,2,2,C.green),
    r(6,8,2,2,C.green),r(5,7,2,2,C.green),r(4,6,2,2,C.greenD),
    r(12,3,1,1,O),r(13,4,1,2,O),r(3,6,1,1,O),r(4,8,1,1,O),r(7,10,1,1,O),r(10,7,1,1,O),
  ];
  ART.error=[ // red spark
    r(7,1,2,3,C.red),r(7,12,2,3,C.red),r(1,7,3,2,C.red),r(12,7,3,2,C.red),
    r(3,3,2,2,C.redH),r(11,3,2,2,C.redH),r(3,11,2,2,C.redD),r(11,11,2,2,C.redD),
    r(6,6,4,4,C.gold),r(6,6,4,1,C.goldH),r(7,7,2,2,C.white),
  ];
  ART.compact=[ // refresh / cycle runes
    r(4,2,7,1,O),r(11,2,1,3,O),r(9,3,2,1,O),r(9,1,1,3,C.cyan),r(11,2,1,2,C.cyan),
    r(3,3,1,3,O),r(3,3,2,1,C.cyan),
    r(2,5,2,6,C.cyanD),r(12,5,2,6,C.cyanD),
    r(5,13,7,1,O),r(4,11,1,3,O),r(4,12,2,1,C.cyan),r(7,12,1,3,C.cyan),r(6,13,2,1,O),
  ];

  // ---- runtime badges ----
  ART.claude=[ // blue rune sigil
    ...box(2,2,12,12,'#103642',O),r(3,3,10,1,C.cyanH),
    r(7,4,2,2,C.cyanH),r(5,6,6,1,C.cyan),r(7,6,2,4,C.cyanH),
    r(4,8,2,1,C.cyan),r(10,8,2,1,C.cyan),r(6,10,4,1,C.cyan),r(7,11,2,1,C.cyanH),
  ];
  ART.codex=[ // green bracket/terminal rune
    ...box(2,2,12,12,'#103a1f',O),r(3,3,10,1,C.greenH),
    r(5,5,3,1,C.green),r(5,5,1,6,C.green),r(5,10,3,1,C.green),
    r(11,5,1,6,C.green),r(9,5,2,1,C.green),r(9,10,2,1,C.green),
    r(8,9,2,1,C.greenH),r(9,8,1,1,C.greenH),
  ];
  // ---- save / floppy (for transition) ----
  ART.save=[
    ...box(2,2,12,12,C.steelD,O),r(3,3,10,1,C.steelH),
    r(5,3,6,4,C.shadow),r(8,4,2,2,C.cyan),
    r(4,9,8,4,C.steel),r(4,9,8,1,C.steelH),r(5,10,6,2,C.shadow),
  ];
  // ---- vault / archive chest ----
  ART.vault=[
    r(3,5,10,1,O),r(3,6,10,2,C.wood),r(3,6,10,1,C.woodH),
    ...box(2,8,12,5,C.woodD,O),r(7,8,2,5,C.gold),r(7,10,2,2,C.goldH),
    r(3,2,4,3,C.woodD),r(9,2,4,3,C.woodD),r(3,4,10,1,O),
  ];
  // ---- mail / envelope (mailbox) ----
  ART.mail=[
    ...box(2,4,12,9,C.paper,O),
    r(3,5,10,1,C.paperD),
    // flap
    r(3,5,1,1,O),r(12,5,1,1,O),r(4,6,1,1,O),r(11,6,1,1,O),r(5,7,1,1,O),r(10,7,1,1,O),r(6,8,4,1,O),r(7,8,2,1,C.gold),
    r(4,10,3,1,C.paperD),r(9,10,3,1,C.paperD),
    // notification dot
    r(11,2,3,3,C.red),r(11,2,3,1,C.redH),
  ];
  // ---- medal (achievements) ----
  ART.medal=[
    // ribbon
    r(5,1,2,4,C.cyan),r(9,1,2,4,C.red),r(5,1,2,1,C.cyanH),r(9,1,2,1,C.redH),
    // disc
    r(6,5,4,1,O),r(5,6,1,5,O),r(10,6,1,5,O),r(6,11,4,1,O),
    r(6,6,4,5,C.gold),r(6,6,4,1,C.goldH),r(6,10,4,1,C.goldD),
    // star
    r(7,7,2,1,C.goldD),r(7,8,2,2,C.white),r(6,8,1,1,C.goldH),r(9,8,1,1,C.goldH),
  ];
  // ---- link / pairing (chain + scan) ----
  ART.link=[
    ...box(2,2,5,5,C.cyanD,O),r(3,3,3,3,C.shadow),r(4,4,1,1,C.cyanH),
    ...box(9,9,5,5,C.greenD,O),r(10,10,3,3,C.shadow),r(11,11,1,1,C.greenH),
    r(7,6,2,1,C.gold),r(8,7,1,2,C.gold),r(9,8,1,1,C.goldH),
    r(11,3,3,1,C.green),r(13,3,1,3,C.green),
    r(2,11,3,1,C.cyan),r(2,9,1,3,C.cyan),
  ];

  window.ICONS=Object.keys(ART);

  function Icon(props){
    const {name, size=24, className='', style={}, title, glow} = props;
    const art=ART[name];
    if(!art){return React.createElement('span',{style:{display:'inline-block',width:size,height:size,background:'#642'}});}
    const px=size/16;
    const rects=art.map((c,i)=>React.createElement('rect',{key:i,x:c.x,y:c.y,width:c.w,height:c.h,fill:c.c}));
    return React.createElement('svg',{
      width:size,height:size,viewBox:'0 0 16 16',className:'pxicon '+className,
      style:{display:'block',shapeRendering:'crispEdges',filter:glow?`drop-shadow(0 0 4px ${glow})`:undefined,...style},
      title,
    },rects);
  }
  window.Icon=Icon;
})();
