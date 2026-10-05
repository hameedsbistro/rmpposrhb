/* Hameeds Bistro LOCAL WAMP/MySQL browser adapter.
   No Supabase/cloud database is used. The existing Admin query style is
   translated into requests to the local Hameeds API, which reads/writes WAMP MySQL. */
(function(global){
  'use strict';

  let cachedBaseUrl='';
  let configPromise=null;
  const storageUrlCache=new Map();
  async function resolveBaseUrl(){
    if(cachedBaseUrl) return cachedBaseUrl;
    if(!configPromise){
      configPromise=(async()=>{
        try{
          if(global.hameedsDesktop?.getConfig){
            const cfg=await global.hameedsDesktop.getConfig();
            const u=String(cfg?.localApiUrl||'').trim();
            if(u){ cachedBaseUrl=u.replace(/\/$/,''); return cachedBaseUrl; }
          }
        }catch(e){ console.warn('Desktop config unavailable:',e); }
        const saved=String(localStorage.getItem('hameeds_local_api_url')||'').trim();
        cachedBaseUrl=(saved||'http://127.0.0.1:8787').replace(/\/$/,'');
        return cachedBaseUrl;
      })();
    }
    return configPromise;
  }

  global.addEventListener?.('hameeds-config-changed',e=>{
    const u=String(e?.detail?.localApiUrl||'').trim();
    if(u) cachedBaseUrl=u.replace(/\/$/,'');
    configPromise=null;
  });

  async function request(path, options={}){
    const directQuery=async()=>{
      if(path==='/api/db/query' && global.hameedsDesktop?.localDbQuery){
        const out=await global.hameedsDesktop.localDbQuery(options.body||{});
        if(!out?.ok)throw new Error(out?.error||'Local database query failed.');
        return {data:out.data??null,count:out.count??null};
      }
      return null;
    };
    const base=await resolveBaseUrl();
    try{
      const res=await fetch(base+path,{
        method:options.method||'GET',
        headers:{'Content-Type':'application/json',...(options.headers||{})},
        body:options.body===undefined?undefined:JSON.stringify(options.body),
        cache:'no-store'
      });
      const text=await res.text();
      let body={};
      try{ body=text?JSON.parse(text):{}; }catch{
        const isHtml=/<!doctype\s+html|<html[\s>]/i.test(text||'');
        body={error:isHtml?`HTTP ${res.status} — this API route is not available on the running RMP POS HOST service.`:(text||('HTTP '+res.status))};
      }
      if(!res.ok){
        if(path==='/api/db/query' && global.hameedsDesktop?.localDbQuery)return await directQuery();
        const message=body?.error||body?.message||('HTTP '+res.status);
        throw new Error(message);
      }
      return body;
    }catch(err){
      if(path==='/api/db/query' && global.hameedsDesktop?.localDbQuery)return await directQuery();
      throw err;
    }
  }

  class QueryBuilder{
    constructor(table){
      this.table=table; this.action='select'; this.selectExpr='*'; this.filters=[];
      this.orders=[]; this._limit=null; this._single=false; this._maybeSingle=false;
      this.values=null; this.upsertOptions=null; this.returning=false;
    }
    select(expr='*'){ this.selectExpr=expr==null?'*':String(expr); if(this.action!=='select') this.returning=true; return this; }
    insert(values){ this.action='insert'; this.values=Array.isArray(values)?values:[values]; return this; }
    update(values){ this.action='update'; this.values=values||{}; return this; }
    delete(){ this.action='delete'; return this; }
    upsert(values,options={}){ this.action='upsert'; this.values=Array.isArray(values)?values:[values]; this.upsertOptions=options||{}; return this; }
    eq(c,v){return this._f('eq',c,v)} neq(c,v){return this._f('neq',c,v)}
    gt(c,v){return this._f('gt',c,v)} gte(c,v){return this._f('gte',c,v)}
    lt(c,v){return this._f('lt',c,v)} lte(c,v){return this._f('lte',c,v)}
    in(c,v){return this._f('in',c,v)} contains(c,v){return this._f('contains',c,v)}
    ilike(c,v){return this._f('ilike',c,v)} like(c,v){return this._f('like',c,v)}
    is(c,v){return this._f('is',c,v)} not(c,op,v){this.filters.push({op:'not',column:c,operator:op,value:v});return this;}
    or(expr){ this.filters.push({op:'or',expr:String(expr||'')}); return this; }
    _f(op,column,value){this.filters.push({op,column,value});return this;}
    order(column,opts={}){this.orders.push({column,ascending:opts?.ascending!==false});return this;}
    limit(n){this._limit=Number(n);return this;}
    range(from,to){this._range={from:Number(from),to:Number(to)};return this;}
    single(){this._single=true;return this;}
    maybeSingle(){this._maybeSingle=true;return this;}
    async execute(){
      try{
        const out=await request('/api/db/query',{method:'POST',body:{
          table:this.table,action:this.action,select:this.selectExpr,filters:this.filters,
          orders:this.orders,limit:this._limit,range:this._range||null,values:this.values,
          single:this._single,maybeSingle:this._maybeSingle,returning:this.returning,
          upsertOptions:this.upsertOptions
        }});
        let data=out.data??null;
        if(this.table==='menu_items' && !/admin/i.test(document.title||'')){
          const base=await resolveBaseUrl();const localize=r=>{if(r&&typeof r==='object'&&/^https?:\/\//i.test(String(r.image_url||'')))r.image_url=base+'/api/image?src='+encodeURIComponent(r.image_url);return r;};
          if(Array.isArray(data))data=data.map(localize);else data=localize(data);
        }
        return {data,error:null,count:out.count??null};
      }catch(e){ return {data:null,error:{message:e.message||String(e)},count:null}; }
    }
    then(resolve,reject){return this.execute().then(resolve,reject)}
    catch(reject){return this.execute().catch(reject)}
    finally(cb){return this.execute().finally(cb)}
  }

  const realtime={channels:new Set(),timer:null,lastSeq:0,busy:false,eventSource:null,sseStarting:false};

  function dispatchRealtimeEvent(ev){
    if(!ev||!ev.table)return;
    const n=Number(ev.seq||0);
    if(n && n<=realtime.lastSeq)return;
    if(n)realtime.lastSeq=Math.max(realtime.lastSeq,n);
    for(const ch of realtime.channels){
      for(const sub of ch.subs){
        const f=sub.filter||{};
        if(f.table && String(f.table)!==String(ev.table))continue;
        if(f.event && f.event!=='*' && String(f.event).toUpperCase()!==String(ev.event).toUpperCase())continue;
        try{sub.cb({eventType:ev.event,new:ev.new||null,old:ev.old||null,table:ev.table});}catch(e){console.error(e)}
      }
    }
  }

  async function pollChanges(){
    if(realtime.busy||!realtime.channels.size)return;
    realtime.busy=true;
    try{
      const out=await request('/api/changes?since='+encodeURIComponent(realtime.lastSeq));
      for(const ev of out.events||[])dispatchRealtimeEvent(ev);
      realtime.lastSeq=Math.max(realtime.lastSeq,Number(out.seq||0));
    }catch(e){ /* local server may be temporarily unavailable */ }
    finally{realtime.busy=false;}
  }

  async function ensureSSE(){
    if(realtime.eventSource||realtime.sseStarting||!global.EventSource)return;
    realtime.sseStarting=true;
    try{
      const base=await resolveBaseUrl();
      const es=new EventSource(base+'/api/events');
      realtime.eventSource=es;
      es.addEventListener('db-change',e=>{
        try{dispatchRealtimeEvent(JSON.parse(e.data||'{}'));}catch(err){console.warn('Realtime event parse:',err)}
      });
      es.addEventListener('ready',()=>{ pollChanges(); });
      es.onerror=()=>{
        // EventSource reconnects itself. Keep a fast polling fallback as well.
        if(!realtime.timer)realtime.timer=setInterval(pollChanges,750);
      };
    }catch(e){
      if(!realtime.timer)realtime.timer=setInterval(pollChanges,750);
    }finally{realtime.sseStarting=false;}
  }

  function ensurePoller(){
    // Low-cost safety net for missed/reconnecting SSE events. In normal operation
    // the SSE route delivers new customer orders immediately.
    if(!realtime.timer)realtime.timer=setInterval(pollChanges,4000);
    ensureSSE();
  }

  class Channel{
    constructor(name){this.name=name;this.subs=[];this.active=false}
    on(type,filter,cb){if(type==='postgres_changes')this.subs.push({filter:filter||{},cb});return this;}
    subscribe(cb){this.active=true;realtime.channels.add(this);ensurePoller();pollChanges();try{cb?.('SUBSCRIBED')}catch{}return this;}
    unsubscribe(){realtime.channels.delete(this);this.active=false;return Promise.resolve('ok')}
  }

  function storageBucket(bucket){
    bucket=String(bucket||'');
    return {
      async upload(path,file,options={}){
        try{const ab=await file.arrayBuffer();let binary='';const bytes=new Uint8Array(ab);const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));const dataBase64=btoa(binary);
          const out=await request('/api/storage/upload',{method:'POST',body:{bucket,path:String(path||''),contentType:options.contentType||file.type||'application/octet-stream',upsert:options.upsert!==false,dataBase64}});storageUrlCache.set(bucket+'|'+path,out.publicUrl);return {data:{path:String(path||''),fullPath:String(path||'')},error:null};
        }catch(e){return {data:null,error:{message:e.message||String(e)}}}
      },
      getPublicUrl(path){return {data:{publicUrl:storageUrlCache.get(bucket+'|'+path)||''}};},
      async remove(paths){try{const out=await request('/api/storage/remove',{method:'POST',body:{bucket,paths:Array.isArray(paths)?paths:[]}});return {data:out.data||[],error:null};}catch(e){return {data:null,error:{message:e.message||String(e)}}}
      }
    };
  }
  function createClient(){
    return {
      from(table){return new QueryBuilder(String(table||''));},
      channel(name){return new Channel(name);},
      removeChannel(ch){return ch?.unsubscribe?.()||Promise.resolve('ok');},
      storage:{from:storageBucket},
      async health(){try{return await request('/api/health')}catch(e){return {ok:false,error:e.message}}}
    };
  }

  global.HameedsLocalDB={createClient,request,resolveBaseUrl,setBaseUrl(url){cachedBaseUrl=String(url||'').replace(/\/$/,'');configPromise=null;}};
})(window);
