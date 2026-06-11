/* ROGUENT room renderer — paints a top-down pixel dungeon room onto a canvas
   using the 0x72 atlas, then React <Room> overlays animated props/NPCs. */
(function(){
  const A=window.ATLAS;
  const TILE=16, S=5, T=TILE*S;            // 80px tiles
  const COLS=24, ROWS=14;

  // deterministic pseudo-random per cell
  function hash(x,y){let h=(x*73856093)^(y*19349663);h=(h<0?-h:h)%997;return h/997;}

  function paintRoom(canvas, theme){
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const holo=theme&&theme.skin==='holo';
    if(holo){
      // ===== HOLO / BLUE-TECH floor: navy deck + glowing grid + nodes =====
      const gA=ctx.createRadialGradient(canvas.width/2,5.6*T,80,canvas.width/2,5.6*T,1100);
      gA.addColorStop(0,'#0e2238'); gA.addColorStop(.55,'#091628'); gA.addColorStop(1,'#050b16');
      ctx.fillStyle=gA; ctx.fillRect(0,0,canvas.width,canvas.height);
      // grid (perspective-ish: rows fade toward back)
      ctx.lineWidth=1;
      for(let gx=0;gx<=COLS;gx++){ const a=0.05+0.05*Math.sin(gx*0.7); ctx.strokeStyle='rgba(54,197,224,'+(0.10+a).toFixed(3)+')'; ctx.beginPath(); ctx.moveTo(gx*T,2*T); ctx.lineTo(gx*T,ROWS*T); ctx.stroke(); }
      for(let gy=2;gy<=ROWS;gy++){ const dep=(gy-2)/(ROWS-2); ctx.strokeStyle='rgba(54,197,224,'+(0.06+dep*0.16).toFixed(3)+')'; ctx.beginPath(); ctx.moveTo(0,gy*T); ctx.lineTo(canvas.width,gy*T); ctx.stroke(); }
      // glowing intersection nodes (sparse)
      for(let gy=3;gy<ROWS;gy+=2){ for(let gx=2;gx<COLS;gx+=3){ const hh=hash(gx*9+1,gy*5+3); if(hh<0.5){ ctx.fillStyle='rgba(95,224,255,'+(0.18+hh*0.5).toFixed(3)+')'; ctx.fillRect(gx*T-2,gy*T-2,4,4); } } }
      // top energy wall band
      ctx.fillStyle='rgba(10,28,46,.9)'; ctx.fillRect(0,0,canvas.width,2*T);
      ctx.fillStyle='rgba(54,197,224,.5)'; ctx.fillRect(0,2*T-3,canvas.width,3);
      ctx.fillStyle='rgba(54,197,224,.14)'; ctx.fillRect(0,2*T,canvas.width,16);
    } else {
    // base fill
    ctx.fillStyle=theme&&theme.floor||'#243a40';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // varied stone floor + cool dapple (rows below the wall band)
    for(let y=2;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        const h=hash(x*3+1,y*7+2);
        window.drawFrame(ctx, h<0.84?'floor_1':(h<0.93?'floor_2':'floor_3'), x*T,y*T,S);
        const sh=hash(x*13+2,y*5+5);
        if(sh<0.24){ ctx.fillStyle='rgba(8,24,28,'+(0.10+sh*0.5).toFixed(3)+')'; ctx.fillRect(x*T,y*T,T,T); }
        else if(sh>0.95){ ctx.fillStyle='rgba(120,200,210,.05)'; ctx.fillRect(x*T,y*T,T,T); }
      }
    }
    // top wall band: brick face rows 0-1, then a shadow lip
    for(let x=0;x<COLS;x++){
      window.drawFrame(ctx,'wall_mid',x*T,0,S);
      window.drawFrame(ctx,'wall_mid',x*T,T,S);
      window.drawFrame(ctx,'wall_top_mid',x*T,-6,S);
    }
    ctx.fillStyle='rgba(0,0,0,.30)'; ctx.fillRect(0,2*T,canvas.width,12);
    // banners on the wall (runtime flavor)
    window.drawFrame(ctx,'wall_banner_blue',4*T,T*0.55,S);
    window.drawFrame(ctx,'wall_banner_blue',19*T,T*0.55,S);
    }

    // ---- carpet runner from the south door up to the command dais ----
    const rugX=10.6*T, rugW=2.8*T;
    ctx.fillStyle='rgba(20,70,86,.6)'; ctx.fillRect(rugX,7.4*T,rugW,6.2*T);
    ctx.fillStyle='rgba(200,162,74,.55)'; ctx.fillRect(rugX,7.4*T,rugW,6); ctx.fillRect(rugX,7.4*T,6,6.2*T); ctx.fillRect(rugX+rugW-6,7.4*T,6,6.2*T);
    ctx.fillStyle='rgba(54,197,224,.18)'; for(let i=0;i<6;i++) ctx.fillRect(rugX+10,(7.9+i)*T,rugW-20,4);

    // ---- central command dais: raised inlay + glowing rune circle ----
    const dcx=12*T, dcy=6.4*T;            // under the orchestrator (~50%,42%)
    const rune=(theme&&theme.rune)||'#36c5e0';
    const hexA=(hex,a)=>{const n=hex.replace('#','');const r=parseInt(n.slice(0,2),16),g=parseInt(n.slice(2,4),16),b=parseInt(n.slice(4,6),16);return 'rgba('+r+','+g+','+b+','+a+')';};
    // platform inlay (darker stone slab with a lit rim)
    ctx.fillStyle='rgba(10,28,34,.55)'; ctx.fillRect(dcx-3.2*T,dcy-2.4*T,6.4*T,4.8*T);
    ctx.strokeStyle=hexA(rune,.5); ctx.lineWidth=4; ctx.strokeRect(dcx-3.2*T+2,dcy-2.4*T+2,6.4*T-4,4.8*T-4);
    ctx.strokeStyle='rgba(200,162,74,.35)'; ctx.lineWidth=2; ctx.strokeRect(dcx-3.2*T+10,dcy-2.4*T+10,6.4*T-20,4.8*T-20);
    // rune circle
    ctx.save(); ctx.translate(dcx,dcy);
    ctx.shadowColor=hexA(rune,.8); ctx.shadowBlur=14;
    ctx.strokeStyle=hexA(rune,.6); ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(0,0,150,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,108,0,Math.PI*2); ctx.stroke();
    ctx.lineWidth=2; ctx.beginPath();
    for(let i=0;i<12;i++){ const a=i/12*Math.PI*2; ctx.moveTo(Math.cos(a)*108,Math.sin(a)*108); ctx.lineTo(Math.cos(a)*150,Math.sin(a)*150); }
    ctx.stroke();
    ctx.shadowBlur=0; ctx.strokeStyle=hexA(rune,.3);
    ctx.beginPath(); ctx.moveTo(-150,0); ctx.lineTo(150,0); ctx.moveTo(0,-150); ctx.lineTo(0,150); ctx.stroke();
    ctx.restore();

    // ---- workstation props (grounded, clear of the dais & NPC spots) ----
    const at=(name,c,r,ox=0,oy=0)=>window.drawFrame(ctx,name,c*T+ox,r*T+oy,S);
    // fountain centerpiece against the north wall (the "lab core")
    const fx=11*T;
    window.drawFrame(ctx,'wall_fountain_top_1',fx,T*0.2,S);
    window.drawFrame(ctx,'wall_fountain_mid_blue_anim_f0',fx,T*1.2,S);
    window.drawFrame(ctx,'wall_fountain_basin_blue_anim_f0',fx,T*2.0,S);
    // left storeroom: crate stack + alchemy
    at('crate',2,9); at('crate',3,9); at('crate',2,8,0,4); at('skull',3,8,16,28);
    at('flask_big_green',1,11,8,0); at('flask_big_blue',2,11,4,0);
    // right workbench: crates + flasks
    const bx=16, by=9;
    at('crate',bx,by); at('crate',bx+1,by);
    at('flask_big_green',bx,by-1,6,2); at('flask_big_red',bx+1,by-1,6,2); at('flask_big_blue',bx,by-1,40,2);
    // far-right barrels & coins
    at('crate',21,11); at('crate',21,10,0,4); at('coin_anim_f0',20,11,40,20);
    // a stray chest + skull bottom-left
    at('chest_empty_open_anim_f0',6,12,12,8); at('skull',18,12,20,18);
    // a door at bottom
    window.drawFrame(ctx,'doors_frame_top',11.5*T,(ROWS-1)*T,S);
    window.drawFrame(ctx,'doors_leaf_closed',11.5*T,(ROWS-1)*T,S);
  }
  window.paintRoom=paintRoom;

  // ---- HUB / TOWN floor painter (walled courtyard: grass + edge-feathered stone plaza) ----
  function paintHub(canvas, density){
    if(!canvas) return;
    const den=density!=null?density:1;
    const ctx=canvas.getContext('2d');
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const COLS=24, ROWS=14;
    ctx.fillStyle='#2c4d24';                 // deep grass base
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // ---- stone map (boolean): central plaza + building pads + width-2 lanes ----
    const stone=[]; for(let r=0;r<ROWS;r++) stone.push(new Array(COLS).fill(false));
    const rect=(c0,r0,c1,r1)=>{for(let r=Math.max(0,r0);r<=Math.min(ROWS-1,r1);r++)for(let c=Math.max(0,c0);c<=Math.min(COLS-1,c1);c++)stone[r][c]=true;};
    // central octagon plaza (tower sits at tile ~12,6)
    rect(9,4,15,9);
    stone[4][9]=stone[4][15]=stone[9][9]=stone[9][15]=false;   // chamfer corners → octagon
    stone[5][9]=stone[5][15]=stone[8][9]=stone[8][15]=true;
    // building pads (3 wide × 2 tall, centered under each structure)
    const pad=(cx,ry)=>rect(cx-1,ry,cx+1,ry+1);
    pad(8,2); pad(12,1); pad(16,2);          // achievements · altar · mailbox (north)
    pad(4,5); pad(19,5);                       // ranking · shop (mid sides)
    pad(4,9); pad(20,9);                       // announce · gacha (lower sides)
    pad(3,11); pad(21,11);                     // claude · codex doors (bottom)
    // connecting lanes (width 2)
    rect(7,2,8,4);  rect(11,2,12,4);  rect(15,2,16,4);          // north spurs → plaza
    rect(4,5,9,6);  rect(15,5,19,6);                             // mid avenue (rank · plaza · shop)
    rect(4,6,5,9);  rect(19,6,20,9);                             // side descents to lower row
    rect(4,9,5,11); rect(20,9,21,11);                            // lower → door pads
    rect(11,9,12,11);                                            // plaza → south gate
    // grand south stair from plaza
    rect(10,9,13,10);

    // ---- ground pass: grass everywhere, with organic per-tile shading ----
    for(let r=2;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const hg=hash(c*5+9,r*11+4);
        window.drawFrame(ctx,'grass',c*T,r*T,S);
        // subtle dapple so the lawn isn't a flat slab
        const shade=hash(c*13+2,r*7+5);
        if(shade<0.26){ ctx.fillStyle='rgba(22,48,18,'+(0.07+shade*0.20).toFixed(3)+')'; ctx.fillRect(c*T,r*T,T,T); }
        else if(shade>0.94){ ctx.fillStyle='rgba(160,205,115,.10)'; ctx.fillRect(c*T,r*T,T,T); }
        // (no grass2 dirt-patch tiles — they read as litter; dapple gives texture instead)
      }
    }

    // ---- stone pass: edge-feathered floor (auto-tiles the plaza/lane borders) ----
    const isS=(c,r)=> r>=0&&r<ROWS&&c>=0&&c<COLS&&stone[r][c];
    for(let r=2;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        if(!isS(c,r)) continue;
        const N=!isS(c,r-1), So=!isS(c,r+1), W=!isS(c-1,r), E=!isS(c+1,r);
        let tile;
        if(N&&W) tile='edge-tl'; else if(N&&E) tile='edge-tr';
        else if(So&&W) tile='edge-bl'; else if(So&&E) tile='edge-br';
        else if(N) tile='edge-top'; else if(So) tile='edge-bottom';
        else if(W) tile='edge-left'; else if(E) tile='edge-right';
        else { const h=hash(c*3+1,r*7+2); tile = h<0.84?'floor_1':(h<0.93?'floor_2':'floor_3'); }
        window.drawFrame(ctx,tile,c*T,r*T,S);
        // warm flagstone wash so the courtyard reads as packed earth, not a dark pit
        const wm=hash(c*7+3,r*5+1);
        ctx.fillStyle='rgba(178,134,84,'+(0.42+wm*0.12).toFixed(3)+')';
        ctx.fillRect(c*T,r*T,T,T);
        if(wm>0.86){ ctx.fillStyle='rgba(208,176,128,.22)'; ctx.fillRect(c*T+6,r*T+6,T-12,T-12); }  // lighter paver speckle
      }
    }
    // soft cast shadow on grass just south of each stone front edge (depth)
    ctx.fillStyle='rgba(16,30,12,.30)';
    for(let r=2;r<ROWS-1;r++) for(let c=0;c<COLS;c++)
      if(isS(c,r)&&!isS(c,r+1)) ctx.fillRect(c*T,(r+1)*T,T,12);

    // ---- north battlement wall + cap ----
    for(let c=0;c<COLS;c++){
      window.drawFrame(ctx,'wall_mid',c*T,0,S);
      window.drawFrame(ctx,'wall_mid',c*T,T,S);
      window.drawFrame(ctx,'wall_top_mid',c*T,-6,S);
    }
    ctx.fillStyle='rgba(0,0,0,.30)'; ctx.fillRect(0,2*T,canvas.width,12);
    // festive banners on the wall
    window.drawFrame(ctx,'wall_banner_yellow',4*T,T*0.55,S);
    window.drawFrame(ctx,'wall_banner_blue',11.5*T,T*0.55,S);
    window.drawFrame(ctx,'wall_banner_green',19*T,T*0.55,S);

    // ---- curated, grounded props on grass margins ----
    const at=(name,c,r,ox=0,oy=0)=>window.drawFrame(ctx,name,c*T+ox,r*T+oy,S);
    // top-left storage stash
    at('crate',2,3); at('crate',3,3); at('crate',2,2,0,6); at('skull',3,4,18,30);
    // alchemy clutter by the shop
    at('flask_big_green',22,4,8,10); at('flask_big_red',22,5,2,0); at('flask_big_blue',23,4,2,34);
    // boxes tucked between buildings
    at('crate',7,9,10,0); at('crate',16,9,4,0);
    // treasure glints near the gacha
    at('chest_full_open_anim_f0',22,8,6,10); at('coin_anim_f0',21,8,30,40); at('coin_anim_f0',22,9,12,2);
    // a lone chest at the south courtyard
    at('chest_empty_open_anim_f0',8,12,20,8); at('coin_anim_f0',15,12,30,18);

    // ---- procedural garden: flower clusters & rocks on the lawn (fills empty grass) ----
    const FLOR=['#ff5a6a','#f2c84b','#7fd0ff','#c98bff','#ff9ed2'];
    function flower(px,py,c){
      ctx.fillStyle='#2f5e22'; ctx.fillRect(px+3,py+6,2,6);                 // stem
      ctx.fillStyle=c; ctx.fillRect(px+1,py+1,6,6); ctx.fillRect(px,py+2,8,4); ctx.fillRect(px+2,py,4,8); // petals
      ctx.fillStyle='#fff3c8'; ctx.fillRect(px+3,py+3,2,2);                 // center
    }
    function rock(px,py){
      ctx.fillStyle='#6b6b73'; ctx.fillRect(px,py+3,16,7); ctx.fillRect(px+3,py,11,5);
      ctx.fillStyle='#8c8c95'; ctx.fillRect(px+3,py+2,7,3);                  // highlight
      ctx.fillStyle='#3f3f47'; ctx.fillRect(px,py+9,16,2);                   // base shadow
    }
    // keep a clear radius around each building so décor never overlaps a structure/label
    const sites=[[8,2],[12,1],[16,2],[4,5],[19,5],[4,9],[20,9],[3,11],[21,11],[12,6]];
    const clearOf=(c,r)=>sites.some(([sc,sr])=>Math.abs(c-sc)<=1&&Math.abs(r-sr)<=2);
    for(let r=3;r<ROWS;r++){
      for(let c=1;c<COLS-1;c++){
        if(isS(c,r)||clearOf(c,r)) continue;
        const hf=hash(c*17+5,r*23+7);
        if(hf>(1-0.10*den)){                           // flower cluster
          const n=2+Math.floor(hash(c*4,r*9)*2);
          for(let k=0;k<n;k++){
            const ox=8+Math.floor(hash(c*7+k*3,r*5+k)*52);
            const oy=14+Math.floor(hash(c*11+k,r*13+k*2)*46);
            flower(c*T+ox,r*T+oy,FLOR[Math.floor(hash(c+k*5,r+k*7)*FLOR.length)]);
          }
        } else if(hf>(1-0.14*den)){                     // rock
          rock(c*T+18+Math.floor(hash(c*3,r*8)*40), r*T+30+Math.floor(hash(c*9,r*4)*34));
        }
      }
    }
  }
  window.paintHub=paintHub;

  function HubCanvas({density}){
    const ref=React.useRef();
    React.useEffect(()=>{
      let dead=false;
      window.loadAtlasImage().then(()=>{ if(!dead)paintHub(ref.current,density); }).catch(()=>{});
      return ()=>{dead=true;};
    },[density]);
    return React.createElement('canvas',{ref,width:1920,height:1120,className:'hub-canvas'});
  }
  window.HubCanvas=HubCanvas;

  function Room({theme,onReady}){
    const ref=React.useRef();
    React.useEffect(()=>{
      let dead=false;
      window.loadAtlasImage().then(()=>{ if(!dead){paintRoom(ref.current,theme); onReady&&onReady();} }).catch(()=>{});
      return ()=>{dead=true;};
    },[theme]);
    return React.createElement('canvas',{ref,width:1920,height:1120,className:'room-canvas'});
  }
  window.Room=Room;
})();
