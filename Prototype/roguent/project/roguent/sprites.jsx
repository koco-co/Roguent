/* Atlas sprite system — slices 0x72 dungeon.png into crisp scaled sprites.
   Depends on window.ATLAS (atlas-frames.js) + React. */
(function(){
  const A = window.ATLAS;

  // resolve the frame list for a character base + motion (idle/run/hit)
  function framesFor(base, kind){
    kind = kind || 'idle';
    const keys = Object.keys(A.frames);
    // try `<base>_<kind>_anim_fN`
    let list = keys.filter(k => k.startsWith(base+'_'+kind+'_anim_f'))
                   .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if(list.length) return list;
    // try `<base>_<kind>_fN`
    list = keys.filter(k => k.startsWith(base+'_'+kind+'_f') && /_f\d+$/.test(k))
               .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if(list.length) return list;
    // single frame `<base>_<kind>` or just `<base>`
    if(A.frames[base+'_'+kind]) return [base+'_'+kind];
    if(A.frames[base]) return [base];
    // fallback: idle
    list = keys.filter(k=>k.startsWith(base+'_idle')).sort();
    return list.length?list:[keys.find(k=>k.startsWith(base))||'knight_m_idle_anim_f0'];
  }
  window.framesFor = framesFor;

  // global low-fps ticker so dozens of sprites share one timer
  const subs = new Set();
  let tick = 0;
  setInterval(()=>{ tick=(tick+1)%600; subs.forEach(fn=>fn(tick)); }, 150); // ~6.6fps

  function useTick(){
    const [,force] = React.useState(0);
    React.useEffect(()=>{ const fn=()=>force(v=>v+1); subs.add(fn); return ()=>subs.delete(fn); },[]);
    return tick;
  }

  // PixelSprite: render a named frame or an animated character
  function PixelSprite(props){
    const { name, base, anim='idle', scale=4, fps=6, flip=false, animated=true,
            filter, className='', style={}, title } = props;
    const t = useTick();
    let list;
    if(name) list=[name];
    else list=framesFor(base, anim);
    let idx = 0;
    if(animated && list.length>1){
      const step = Math.max(1, Math.round(6/fps));
      idx = Math.floor(t/step) % list.length;
    }
    const fr = A.frames[list[idx]] || A.frames[list[0]];
    if(!fr) return null;
    const [x,y,w,h]=fr;
    const s={
      width:w*scale, height:h*scale,
      backgroundImage:`url(${A.image})`,
      backgroundRepeat:'no-repeat',
      backgroundPosition:`${-x*scale}px ${-y*scale}px`,
      backgroundSize:`${A.w*scale}px ${A.h*scale}px`,
      imageRendering:'pixelated',
      transform: flip?'scaleX(-1)':undefined,
      filter,
      ...style,
    };
    return React.createElement('div',{className:'pxsprite '+className, style:s, title});
  }

  window.PixelSprite = PixelSprite;
  window.useSpriteTick = useTick;

  // preload atlas <img> for canvas painting
  let atlasImg=null, atlasPromise=null;
  window.loadAtlasImage=function(){
    if(atlasPromise) return atlasPromise;
    atlasPromise=new Promise((res,rej)=>{
      const im=new Image();
      im.onload=()=>{ atlasImg=im; res(im); };
      im.onerror=rej;
      im.src=A.image;
    });
    return atlasPromise;
  };
  // draw a named frame onto a 2d context at (dx,dy) scaled (nearest neighbor)
  window.drawFrame=function(ctx,name,dx,dy,scale){
    const f=A.frames[name]; if(!f||!atlasImg) return;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(atlasImg, f[0],f[1],f[2],f[3], dx,dy, f[2]*scale, f[3]*scale);
  };
  window.getAtlasImg=()=>atlasImg;
})();
