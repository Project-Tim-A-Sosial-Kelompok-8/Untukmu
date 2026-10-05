/** Adds semantics/focus behavior without changing the original visual geometry. */
export function installAccessibility() {
  const style=document.createElement("style");style.textContent=':focus-visible{outline:2px solid #b8d4ff!important;outline-offset:4px!important}.um-screen[aria-hidden="true"]{pointer-events:none}.um-toast{overflow-wrap:anywhere}@media(prefers-reduced-motion:reduce){.um-screen,.um-toast{transition:none!important}}';document.head.append(style);
  let top:HTMLElement|null=null, previous:HTMLElement|null=null, queued=false;
  const focusables=(root:HTMLElement)=>Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(node=>node.getClientRects().length>0);
  const sync=()=>{
    queued=false;
    const screens=Array.from(document.querySelectorAll<HTMLElement>('.um-screen'));
    const opened=screens.filter(node=>node.classList.contains('on')).sort((a,b)=>Number(getComputedStyle(a).zIndex||0)-Number(getComputedStyle(b).zIndex||0));
    const current=opened.at(-1)||null;
    for(const screen of screens){const active=screen===current;screen.inert=!active;if(screen.getAttribute('aria-hidden')!==String(!active)) screen.setAttribute('aria-hidden',String(!active));
      if(!screen.hasAttribute('role') && !screen.querySelector('[role=dialog]')) {screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label',screen.querySelector('.um-h1,h1')?.textContent||'Untukmu');}}
    if(current!==top){if(!top) previous=document.activeElement as HTMLElement|null;top=current;if(top) {if(!top.contains(document.activeElement)) focusables(top)[0]?.focus({preventScroll:true});}else previous?.focus({preventScroll:true});}
    const toast=document.querySelector('.um-toast');if(toast&&!toast.hasAttribute('role')){toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');}
    document.querySelectorAll<HTMLElement>('canvas').forEach(canvas=>{if(!canvas.hasAttribute('aria-label')){canvas.setAttribute('aria-label','Galaksi interaktif. Pesan juga tersedia melalui Dashboard.');canvas.setAttribute('role','img');}});
    document.querySelectorAll<HTMLElement>('.um-dock button').forEach(button=>{if(!button.getAttribute('aria-label')) button.setAttribute('aria-label',button.title||button.textContent||'Menu');});
  };
  new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(sync);}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});sync();
  window.addEventListener('keydown',event=>{
    if(!top) return;
    if(event.key==='Tab') {const nodes=focusables(top);const first=nodes[0],last=nodes.at(-1);if(!nodes.length){event.preventDefault();return;}if(!top.contains(document.activeElement)||event.shiftKey&&document.activeElement===first){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    if(event.key==='Escape'){const close=top.querySelector<HTMLButtonElement>('.um-close:not(:disabled),[data-act="close"]:not(:disabled)');event.stopImmediatePropagation();if(close){event.preventDefault();close.click();}}
  },true);
}
