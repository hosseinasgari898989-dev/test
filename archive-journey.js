(function(root,factory){
  if(typeof module!=='undefined'&&module.exports)module.exports=factory();
  else root.PoppyArchiveJourneyCore=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const DEFAULT_SPEED=1,SPEEDS=[0.5,1,1.5,2];
  function cleanIndex(v){const n=Number(v);return Number.isFinite(n)&&n>=0?Math.floor(n):0;}
  function cleanSpeed(v){const n=Number(v);return SPEEDS.includes(n)?n:DEFAULT_SPEED;}
  function normalizeState(raw){
    const s=raw&&typeof raw==='object'?raw:{};
    return {articleIndex:cleanIndex(s.articleIndex),blockIndex:cleanIndex(s.blockIndex),speed:cleanSpeed(s.speed)};
  }
  function nextPosition(state,counts){
    const a=Array.isArray(counts)?counts:[],s=normalizeState(state);
    if(!a.length)return {articleIndex:0,blockIndex:0,done:true};
    const ai=Math.min(s.articleIndex,a.length-1),bc=Math.max(0,Number(a[ai])||0);
    if(!bc)return {articleIndex:ai,blockIndex:0,done:true};
    const bi=Math.min(s.blockIndex,bc-1);
    if(bi+1<bc)return {articleIndex:ai,blockIndex:bi+1,done:false};
    if(ai+1<a.length)return {articleIndex:ai+1,blockIndex:0,done:false};
    return {articleIndex:ai,blockIndex:bi,done:true};
  }
  function progressPercent(ai,bi,counts){
    const a=Array.isArray(counts)?counts.map(v=>Math.max(0,Number(v)||0)):[];
    const total=a.reduce((x,y)=>x+y,0);if(!total)return 0;
    const i=Math.max(0,Math.min(cleanIndex(ai),a.length-1));
    const before=a.slice(0,i).reduce((x,y)=>x+y,0);
    return Math.round(Math.min(total,before+Math.max(0,cleanIndex(bi)))/total*100);
  }
  function readingDuration(text,speed){
    const base=Math.max(1500,Math.min(9000,900+String(text||'').trim().length*24));
    return Math.round(base/cleanSpeed(speed));
  }
  return {DEFAULT_SPEED,SPEEDS,normalizeState,nextPosition,progressPercent,readingDuration};
});

(function(){
'use strict';
const W=window,D=document,CORE=W.PoppyArchiveJourneyCore;
if(!CORE)return;

const KEY='poppy_archive_journey_v1';
const CARD_SEL='.articleCard[data-article]';
const BLOCK_SEL='p, h3, h4, li, .quote';
let s={active:false,paused:false,articleIndex:0,blockIndex:0,lineIndex:0,lineProgress:0,speed:1,completed:false};
let raf=0,startAt=0,duration=0,blocks=[],activeBlock=null,markers=[],layer=null,modalBox=null,resumeTimer=0,closing=false;

const $=id=>D.getElementById(id);
const cards=()=>Array.from(D.querySelectorAll(CARD_SEL));
const keys=()=>cards().map(x=>x.dataset.article).filter(Boolean);
const lang=()=>{try{return currentLang==='en'?'en':'fa';}catch(e){return D.documentElement.lang==='en'?'en':'fa';}};
const T=(fa,en)=>lang()==='en'?en:fa;
const getLS=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const setLS=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const delLS=k=>{try{localStorage.removeItem(k)}catch(e){}};

function source(key){
  try{if(typeof articles!=='undefined'&&articles[key])return articles[key][lang()]||articles[key].fa||articles[key].en;}catch(e){}
  return null;
}
function sourceCount(key){
  const a=source(key);if(!a||!a.content)return 0;
  const x=D.createElement('div');x.innerHTML=a.content;
  return Array.from(x.querySelectorAll(BLOCK_SEL)).filter(n=>String(n.textContent||'').trim()).length;
}
function counts(){return keys().map(sourceCount);}
function saved(){
  let x=null;try{x=JSON.parse(getLS(KEY)||'null')}catch(e){}
  if(!x)return CORE.normalizeState({});
  return Object.assign(CORE.normalizeState(x),{completed:x.completed===true});
}
function persist(){setLS(KEY,JSON.stringify({articleIndex:s.articleIndex,blockIndex:s.blockIndex,speed:s.speed,completed:s.completed,updatedAt:Date.now()}));}

function style(){
  if($('archiveJourneyStyle'))return;
  const el=D.createElement('style');el.id='archiveJourneyStyle';
  el.textContent=[
    '.aj-navgrid{grid-template-columns:repeat(8,1fr)!important}',
    '.aj-navcard{position:relative}',
    '.aj-bar{position:fixed;top:88px;left:16px;right:16px;z-index:390;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid rgba(255,75,110,.38);border-radius:18px;background:rgba(10,4,8,.94);backdrop-filter:blur(18px);box-shadow:0 18px 60px #0009;color:#fff}',
    '.aj-bar[hidden]{display:none}',
    '.aj-head{display:flex;align-items:center;gap:8px;flex:1 1 190px;min-width:180px}',
    '.aj-dot{width:8px;height:8px;border-radius:50%;background:var(--red2,#ff4b6e);box-shadow:0 0 13px var(--red2,#ff4b6e)}',
    '.aj-name{font:800 12px Oswald,Vazirmatn,sans-serif;letter-spacing:1px;color:var(--red2,#ff4b6e)}',
    '.aj-current{font-size:10px;color:var(--muted,#c4aeb5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw}',
    '.aj-progress{flex:2 1 230px;min-width:180px}.aj-progress-row{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:5px}',
    '.aj-track{height:5px;background:#fff1;border-radius:9px;overflow:hidden}.aj-fill{height:100%;width:0;background:linear-gradient(90deg,var(--red),var(--red2));transition:width .2s}',
    '.aj-controls{display:flex;gap:5px;flex:0 0 auto;overflow-x:auto;scrollbar-width:none}.aj-controls::-webkit-scrollbar{display:none}',
    '.aj-btn{height:34px;padding:0 10px;border-radius:10px;border:1px solid rgba(255,75,110,.28);background:#ff174d0d;color:#cbb8be;font:700 11px Vazirmatn,sans-serif;white-space:nowrap;cursor:pointer}',
    '.aj-btn.active{background:linear-gradient(135deg,var(--red),var(--red2));color:#fff;border-color:transparent}.aj-btn.exit{color:#ff9aaa}',
    'body.archive-journey-active .articleModal{z-index:380}body.archive-journey-active .closeArticle{display:none}',
    '.aj-marker-layer{position:absolute;inset:0;pointer-events:none;z-index:0}.aj-marker{position:absolute;border-radius:5px;background:linear-gradient(90deg,#ff174d14,#ff4b6e55,#ff174d18);transform:scaleX(0);transform-origin:100% 50%;opacity:.82;will-change:transform}',
    '.aj-marker.done{transform:scaleX(1);opacity:.28}.aj-reading-target{position:relative;z-index:1}',
    '.aj-toast{position:fixed;top:154px;left:50%;z-index:500;transform:translateX(-50%);padding:10px 15px;border-radius:13px;background:linear-gradient(135deg,#1d0710,#8a0b36);border:1px solid #ff4b6e88;color:#fff;font:12px/1.7 Vazirmatn,sans-serif;box-shadow:0 15px 45px #0009;opacity:0;pointer-events:none;transition:.2s;max-width:calc(100vw - 30px);text-align:center}.aj-toast.show{opacity:1}',
    '@media(max-width:1100px){.aj-navgrid{grid-template-columns:repeat(4,1fr)!important}}',
    '@media(max-width:640px){.aj-navgrid{grid-template-columns:repeat(2,1fr)!important}.aj-bar{top:72px;left:8px;right:8px;padding:8px;border-radius:15px}.aj-head{flex-basis:100%;min-width:0}.aj-current{max-width:62vw}.aj-progress{flex-basis:100%;min-width:0}.aj-btn{height:32px;font-size:10px;padding:0 9px}}',
    '@media(prefers-reduced-motion:reduce){.aj-btn{transition:none}.aj-fill{transition:none}}'
  ].join('');
  D.head.appendChild(el);
}

function cardUI(){
  const nav=D.querySelector('.navgrid');if(!nav||$('archiveJourneyNav'))return;
  const news=nav.querySelector('[data-target="news"]'),c=D.createElement('button');
  c.id='archiveJourneyNav';c.type='button';c.className='navcard aj-navcard';
  c.innerHTML='<strong data-aj-fa="حالت مطالعه" data-aj-en="Archive Journey">حالت مطالعه</strong><small data-aj-fa="مطالعه‌ی خودکار مقالات" data-aj-en="Guided article reading">مطالعه‌ی خودکار مقالات</small>';
  if(news&&news.nextSibling)nav.insertBefore(c,news.nextSibling);else nav.appendChild(c);
  nav.classList.add('aj-navgrid');c.onclick=start;
}
function refreshCard(){
  const c=$('archiveJourneyNav');if(!c)return;
  c.querySelectorAll('[data-aj-fa]').forEach(x=>x.textContent=lang()==='en'?x.dataset.ajEn:x.dataset.ajFa);
}

function barUI(){
  if($('archiveJourneyBar'))return;
  const b=D.createElement('div');b.id='archiveJourneyBar';b.className='aj-bar';b.hidden=true;
  b.innerHTML='<div class="aj-head"><span class="aj-dot"></span><span class="aj-name">ARCHIVE JOURNEY</span><span class="aj-current" id="ajCurrent">...</span></div>'+
    '<div class="aj-progress"><div class="aj-progress-row"><span id="ajArticleLabel"></span><span id="ajPercent"></span></div><div class="aj-track"><div class="aj-fill" id="ajFill"></div></div></div>'+
    '<div class="aj-controls">'+
    '<button class="aj-btn active" id="ajPause" data-aj-action="pause">⏸ توقف</button>'+
    '<button class="aj-btn" data-aj-speed="0.5">0.5x</button><button class="aj-btn active" data-aj-speed="1">1x</button>'+
    '<button class="aj-btn" data-aj-speed="1.5">1.5x</button><button class="aj-btn" data-aj-speed="2">2x</button>'+
    '<button class="aj-btn exit" data-aj-action="exit">✕ خروج</button></div>';
  D.body.appendChild(b);
  b.onclick=e=>{
    const sp=e.target.closest('[data-aj-speed]');if(sp){speed(Number(sp.dataset.ajSpeed));return;}
    const a=e.target.closest('[data-aj-action]');if(!a)return;
    if(a.dataset.ajAction==='pause')pause();
    if(a.dataset.ajAction==='exit')exit();
  };
}

function toast(msg){
  let x=$('archiveJourneyToast');if(!x){x=D.createElement('div');x.id='archiveJourneyToast';x.className='aj-toast';D.body.appendChild(x);}
  x.textContent=msg;x.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>x.classList.remove('show'),2600);
}
function updateBar(){
  const c=counts(),ks=keys(),pct=CORE.progressPercent(s.articleIndex,s.blockIndex,c),card=cards()[s.articleIndex];
  const title=card?.querySelector('h4')?.textContent?.trim()||'';
  if($('ajArticleLabel'))$('ajArticleLabel').textContent=T('مقاله '+(s.articleIndex+1)+' از '+ks.length,'Article '+(s.articleIndex+1)+' of '+ks.length);
  if($('ajPercent'))$('ajPercent').textContent=lang()==='en'?pct+'%':String(pct).replace(/\\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])+'٪';
  if($('ajCurrent'))$('ajCurrent').textContent=title;
  if($('ajFill'))$('ajFill').style.width=pct+'%';
  D.querySelectorAll('[data-aj-speed]').forEach(x=>x.classList.toggle('active',Number(x.dataset.ajSpeed)===s.speed));
  const p=$('ajPause');if(p){p.textContent=s.paused?T('▶ ادامه','▶ Resume'):T('⏸ توقف','⏸ Pause');p.classList.toggle('active',!s.paused);}
}

function clearMarkers(){
  if(layer?.parentNode)layer.parentNode.removeChild(layer);
  layer=null;markers=[];activeBlock=null;
  D.querySelectorAll('.aj-reading-target').forEach(x=>x.classList.remove('aj-reading-target'));
}
function collect(){
  const box=$('articleContent');return box?Array.from(box.querySelectorAll(BLOCK_SEL)).filter(x=>String(x.textContent||'').trim()):[];
}
function makeMarkers(){
  clearMarkers();if(!modalBox||!activeBlock)return;
  layer=D.createElement('div');layer.className='aj-marker-layer';modalBox.appendChild(layer);
  const br=modalBox.getBoundingClientRect(),r=D.createRange();r.selectNodeContents(activeBlock);
  const rects=Array.from(r.getClientRects()).filter(x=>x.width>1&&x.height>1);
  markers=rects.map((x,i)=>{
    const m=D.createElement('div');m.className='aj-marker'+(i<s.lineIndex?' done':'');
    m.style.left=(x.left-br.left+modalBox.scrollLeft)+'px';m.style.top=(x.top-br.top+modalBox.scrollTop)+'px';
    m.style.width=Math.max(3,x.width)+'px';m.style.height=Math.max(16,x.height*.92)+'px';layer.appendChild(m);return m;
  });
  activeBlock.classList.add('aj-reading-target');
  if(s.lineIndex>=markers.length)s.lineIndex=0;
  markers.forEach((m,i)=>{m.style.transform=i<s.lineIndex?'scaleX(1)':'scaleX(0)';m.classList.toggle('done',i<s.lineIndex);});
}
function centerBlock(){
  if(!activeBlock||!modalBox)return;
  const br=modalBox.getBoundingClientRect(),rr=activeBlock.getBoundingClientRect();
  const top=modalBox.scrollTop+rr.top-br.top-modalBox.clientHeight*.42;
  modalBox.scrollTo({top:Math.max(0,Math.min(modalBox.scrollHeight-modalBox.clientHeight,top)),behavior:(W.matchMedia&&W.matchMedia('(prefers-reduced-motion: reduce)').matches)?'auto':'smooth'});
}
function setBlock(i){
  blocks=collect();if(!blocks.length)return false;
  s.blockIndex=Math.min(Math.max(0,i),blocks.length-1);s.lineIndex=0;s.lineProgress=0;
  activeBlock=blocks[s.blockIndex];duration=CORE.readingDuration(activeBlock.textContent,s.speed);
  updateBar();persist();
  W.requestAnimationFrame(()=>{centerBlock();W.requestAnimationFrame(makeMarkers);});
  return true;
}
function stop(){if(raf){W.cancelAnimationFrame(raf);raf=0;}if(resumeTimer){clearTimeout(resumeTimer);resumeTimer=0;}}
function open(index){
  const c=cards()[index];if(!c)return false;c.click();return true;
}
function waitReady(ms=1500){
  return new Promise(resolve=>{
    const t=Date.now();
    (function check(){
      if($('articleModal')?.classList.contains('show')&&collect().length)return resolve(true);
      if(Date.now()-t>=ms)return resolve(false);
      resumeTimer=setTimeout(check,25);
    })();
  });
}
async function begin(index,block){
  clearMarkers();modalBox=$('articleModalBox');if(!open(index))return false;
  if(!(await waitReady()))return false;
  s.articleIndex=index;return setBlock(block);
}
function finish(){
  stop();s.completed=true;s.active=false;s.paused=false;persist();
  D.body.classList.remove('archive-journey-active');$('archiveJourneyBar')?.setAttribute('hidden','');clearMarkers();
  closeModal();toast(T('🎉 همه‌ی مقالات خوانده شد.','🎉 All articles have been read.'));
}
function advance(){
  const n=CORE.nextPosition(s,counts());
  if(n.done){finish();return;}
  s.articleIndex=n.articleIndex;s.blockIndex=n.blockIndex;s.lineIndex=0;s.lineProgress=0;persist();
  begin(s.articleIndex,s.blockIndex).then(ok=>{if(ok&&!s.paused)tickStart();});
}
function frame(now){
  if(!s.active||s.paused)return;
  if(!activeBlock){advance();return;}
  if(!markers.length){makeMarkers();raf=W.requestAnimationFrame(frame);return;}
  if(!startAt)startAt=now;
  const ld=duration/Math.max(1,markers.length),p=Math.max(0,Math.min(1,(now-startAt)/ld));s.lineProgress=p;
  markers.forEach((m,i)=>{
    if(i<s.lineIndex){m.classList.add('done');m.style.transform='scaleX(1)';}
    else if(i===s.lineIndex){m.classList.remove('done');m.style.transform='scaleX('+p+')';}
    else{m.classList.remove('done');m.style.transform='scaleX(0)';}
  });
  if(p>=1){
    s.lineIndex++;s.lineProgress=0;startAt=now;
    if(s.lineIndex>=markers.length){advance();return;}
  }
  raf=W.requestAnimationFrame(frame);
}
function tickStart(){stop();startAt=0;raf=W.requestAnimationFrame(frame);}
function pause(){
  if(!s.active)return;
  if(!s.paused&&startAt){const ld=duration/Math.max(1,markers.length);s.lineProgress=Math.max(0,Math.min(1,(performance.now()-startAt)/ld));}
  s.paused=!s.paused;persist();updateBar();
  if(s.paused)stop();else{const ld=duration/Math.max(1,markers.length);startAt=performance.now()-(s.lineProgress*ld);tickStart();}
}
function speed(v){
  if(!CORE.SPEEDS.includes(v)||s.speed===v)return;
  const p=s.lineProgress;s.speed=v;duration=CORE.readingDuration(activeBlock?.textContent||'',s.speed);
  if(!s.paused){const ld=duration/Math.max(1,markers.length);startAt=performance.now()-(p*ld);}
  persist();updateBar();
}
function closeModal(){
  const x=$('closeArticle');if(x){closing=true;x.click();setTimeout(()=>closing=false,0);}
  else $('articleModal')?.classList.remove('show');
}
function exit(clear=false){
  if(!s.active&&!clear)return;
  stop();s.active=false;s.paused=false;s.lineIndex=0;s.lineProgress=0;D.body.classList.remove('archive-journey-active');$('archiveJourneyBar')?.setAttribute('hidden','');clearMarkers();
  if(clear)delLS(KEY);closeModal();try{if(typeof updateFloatingUI==='function')updateFloatingUI();}catch(e){}
}
async function start(){
  const list=cards();if(!list.length){toast(T('هیچ مقاله‌ای پیدا نشد.','No articles found.'));return;}
  if(s.active){pause();return;}
  style();barUI();
  const old=saved(),ks=keys(),resume=!old.completed&&(old.articleIndex>0||old.blockIndex>0);
  s={active:true,paused:false,articleIndex:resume?Math.min(old.articleIndex,ks.length-1):0,blockIndex:resume?old.blockIndex:0,lineIndex:0,lineProgress:0,speed:old.speed||1,completed:false};
  const archive=$('archive');
  if(archive&&!archive.classList.contains('active')){$('openArchive')?.click();await new Promise(r=>setTimeout(r,70));}
  D.body.classList.add('archive-journey-active');$('archiveJourneyBar').hidden=false;updateBar();
  if(resume)toast(T('ادامه از آخرین موقعیت ذخیره‌شده…','Resuming from your saved position…'));
  if(!(await begin(s.articleIndex,s.blockIndex))){toast(T('مقاله برای حالت مطالعه آماده نشد.','The article could not be prepared.'));exit();return;}
  tickStart();
}
function bind(){
  D.addEventListener('keydown',e=>{
    if(!s.active)return;
    if(e.key==='Escape'){e.preventDefault();exit();}
    if(e.key===' '&&!/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName)){e.preventDefault();pause();}
  });
  D.addEventListener('visibilitychange',()=>{
    if(D.hidden&&s.active)persist();
    if(!D.hidden&&s.active&&!s.paused){const ld=duration/Math.max(1,markers.length);startAt=performance.now()-(s.lineProgress*ld);tickStart();}
  });
  W.addEventListener('pagehide',()=>{if(s.active)persist();});
  W.addEventListener('resize',()=>{
    if(s.active&&activeBlock){const p=s.lineProgress;makeMarkers();s.lineProgress=p;const ld=duration/Math.max(1,markers.length);startAt=performance.now()-(p*ld);}
  });
  const modal=$('articleModal');
  if(modal)new MutationObserver(()=>{
    if(!s.active||closing)return;
    if(!modal.classList.contains('show'))setTimeout(()=>{if(s.active&&!closing)begin(s.articleIndex,s.blockIndex);},80);
  }).observe(modal,{attributes:true,attributeFilter:['class']});
}
function init(){
  style();cardUI();barUI();refreshCard();bind();
  try{
    const old=W.setLanguage;
    if(typeof old==='function'&&!old.__archiveJourney){
      W.setLanguage=function(x){const r=old.apply(this,arguments);refreshCard();updateBar();return r;};
      W.setLanguage.__archiveJourney=true;
    }
  }catch(e){}
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',init,{once:true});else init();
W.ArchiveJourney={start,exit,pause,getState:()=>Object.assign({},s),clearProgress:()=>exit(true)};
})();