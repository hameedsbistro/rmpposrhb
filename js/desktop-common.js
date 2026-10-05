(function(){
  'use strict';
  const nativePrint=window.print?.bind(window);
  window.hameedsDirectPrintHtml=async function(html,kind='receipt'){
    if(window.hameedsDesktop?.printHtml){
      const r=await window.hameedsDesktop.printHtml(String(html||''),kind);
      if(!r?.ok) throw new Error(r?.error||'Direct print failed');
      return r;
    }
    const w=window.open('','_blank'); if(!w) throw new Error('Print window blocked');
    w.document.open();w.document.write(String(html||''));w.document.close();setTimeout(()=>w.print(),250);return {ok:true};
  };
  window.print=function(){
    if(window.hameedsDesktop?.printCurrentWindow){window.hameedsDesktop.printCurrentWindow().then(r=>{if(r?.ok===false)alert('Print failed: '+(r.error||'Unable to print.'))}).catch(e=>alert('Print failed: '+(e?.message||e)));return;}
    return nativePrint?.();
  };

  const originalOpen=window.open?.bind(window);
  window.open=function(url='',target='_blank',features=''){
    // In the desktop build, print popups become an invisible same-page frame.
    // Existing HTML can keep using document.write()/w.print() without showing a dialog.
    if(window.hameedsDesktop && (!url || url==='about:blank')){
      const frame=document.createElement('iframe');
      frame.style.cssText='position:fixed;width:1px;height:1px;right:-20px;bottom:-20px;border:0;opacity:0;pointer-events:none';
      document.body.appendChild(frame);
      const w=frame.contentWindow;
      try{
        Object.defineProperty(w,'closed',{get:()=>!frame.isConnected});
      }catch{}
      w.focus=()=>{};
      w.close=()=>{try{frame.remove()}catch{}};
      w.print=async()=>{
        try{
          const html=w.document?.documentElement?.outerHTML||'';
          const kind=/receipt-print|FINAL RECEIPT|GUEST CHECK|TOTAL PAID/i.test(html)?'receipt':(/QR Label|Table\s+[A-C]\d+\s+QR/i.test(html)?'qr':'report');
          await window.hameedsDirectPrintHtml(html,kind);
        }catch(e){console.error('Native print:',e);try{alert('Print failed: '+(e?.message||e))}catch(_){} }
      };
      return w;
    }
    return originalOpen?originalOpen(url,target,features):null;
  };

  window.hameedsGetConfig=async function(){
    if(window.hameedsDesktop?.getConfig) return window.hameedsDesktop.getConfig();
    return {localApiUrl:localStorage.getItem('hameeds_local_api_url')||'http://127.0.0.1:8787'};
  };
  window.hameedsSaveLocalApiUrl=async function(url){
    url=String(url||'').trim().replace(/\/$/,''); if(!url)return;
    localStorage.setItem('hameeds_local_api_url',url);
    if(window.HameedsLocalDB?.setBaseUrl)window.HameedsLocalDB.setBaseUrl(url);
    window.dispatchEvent(new CustomEvent('hameeds-config-changed',{detail:{localApiUrl:url}}));
  };

})();
