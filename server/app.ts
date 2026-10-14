import express from 'express';
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import type { Store } from './store.js';
import type { CardProvider } from './cards.js';
import type { Session } from '../shared/types.js';
import { Hub } from './hub.js';
import { GameError } from './engine.js';

export interface AppOptions { store:Store; cards:CardProvider; dev?:boolean; adminKey?:string; secureCookie?:boolean; hostGraceMs?:number }
export async function createApp(options:AppOptions){
  const app=express(),server=createServer(app),hub=new Hub(options.store,options.cards,options.hostGraceMs,Boolean(options.dev)&&process.env.NODE_ENV!=='production');
  await hub.init();
  const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
  const secure=options.secureCookie??process.env.COOKIE_SECURE==='1';
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  const cookieName='ygoguess_session';
  const tokens=(req:express.Request|{headers:{cookie?:string}})=>{
    const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    return raw&&/^[a-f0-9]{64}$/.test(raw)?raw:null;
  };
  const getSession=async(req:any)=>{const token=tokens(req);return token?options.store.getSession(hash(token)):null;};
  const allowed=(origin:string|undefined,host:string|undefined)=>{
    if(!origin)return true;
    if((process.env.ALLOWED_ORIGINS??'').split(',').filter(Boolean).includes(origin))return true;
    if(!host)return false;
    try{return ['http://','https://'].some(scheme=>new URL(scheme+host).origin===origin);}catch{return false;}
  };
  const rates=new Map<string,{at:number;count:number}>();
  const limit=(key:string,max=90)=>{const now=Date.now();let v=rates.get(key);if(!v||now-v.at>60000){v={at:now,count:0};rates.set(key,v);}if(rates.size>5000)for(const [k,v]of rates)if(now-v.at>60000)rates.delete(k);return ++v.count<=max;};
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');if(req.path.startsWith('/api')||req.path.startsWith('/admin/entry'))res.setHeader('Cache-Control','no-store');if(!allowed(req.headers.origin,req.headers.host)){res.status(403).json({message:'不允许的来源'});return;}next();});
  app.use(express.json({limit:'8kb'}));
  const saveSession=async(res:express.Response,session:Session)=>{const token=randomBytes(32).toString('hex');await options.store.putSession(hash(token),session);res.cookie(cookieName,token,{httpOnly:true,sameSite:'lax',secure,maxAge:30*86400000,path:'/'});return session;};
  app.get('/api/health',(_req,res)=>res.json({ok:true,service:'YgoGuess'}));
  app.get('/api/session',async(req,res)=>{const session=await getSession(req);res.json({session:session?{playerId:session.playerId,name:session.name,admin:session.admin}:null});});
  app.post('/api/session',async(req,res)=>{
    if(!limit('guest:'+req.socket.remoteAddress,30)){res.status(429).json({message:'请求过于频繁'});return;}
    const name=z.string().trim().min(1).max(16).refine(s=>!/[\x00-\x1f\x7f]/.test(s)).parse(req.body.name);
    const old=await getSession(req);
    if(old&&hub.roomFor(old.playerId)&&old.name!==name){res.status(409).json({message:'请先离开房间再更改昵称'});return;}
    const session=await saveSession(res,{playerId:old?.playerId??randomUUID(),name,admin:old?.admin??false,expiresAt:Date.now()+30*86400000});
    res.json({session:{playerId:session.playerId,name:session.name,admin:session.admin}});
  });
  app.get('/admin/entry',async(req,res)=>{
    const configured=options.adminKey??process.env.ADMIN_ENTRY_KEY;
    if(!configured){res.status(404).send('管理员入口未配置');return;}
    if(!limit('admin:'+req.socket.remoteAddress,10)){res.status(429).send('请求过于频繁');return;}
    const value=typeof req.query.key==='string'?req.query.key:'';
    const a=Buffer.from(hash(value)),b=Buffer.from(hash(configured));
    if(!value||!timingSafeEqual(a,b)){res.status(403).send('管理员密钥无效');return;}
    const old=await getSession(req);
    await saveSession(res,{playerId:old?.playerId??randomUUID(),name:old?.name??'管理员',admin:true,expiresAt:Date.now()+30*86400000});
    res.redirect(303,'/admin');
  });
  app.get('/api/cards/search',async(req,res)=>{
    const session=await getSession(req);if(!session){res.status(401).json({message:'请先输入昵称'});return;}
    if(!limit('search:'+session.playerId,60)){res.status(429).json({message:'搜索太快，请稍后重试'});return;}
    const q=z.string().trim().min(1).max(100).parse(req.query.q);
    const start=z.coerce.number().int().min(0).max(100000).default(0).parse(req.query.start);
    res.json(await options.cards.search(q,start));
  });
  // Reserve unknown API routes before the SPA fallback.
  app.use('/api',(_req,res)=>res.status(404).json({message:'接口不存在'}));
  server.on('upgrade',(req,socket,head)=>{
    void(async()=>{
      if(new URL(req.url??'/', 'http://local').pathname!=='/ws')return;
      if(!allowed(req.headers.origin,req.headers.host)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
      const session=await getSession(req);
      if(!session){socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();return;}
      wss.handleUpgrade(req,socket,head,ws=>{hub.attach(ws,session);wss.emit('connection',ws,req);});
    })().catch(()=>socket.destroy());
  });
  const alive=new WeakSet<object>();
  wss.on('connection',ws=>{alive.add(ws);ws.on('pong',()=>alive.add(ws));});
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!alive.has(ws)){ws.terminate();continue;}alive.delete(ws);ws.ping();}},15000);heartbeat.unref();
  let vite:{close():Promise<void>}|undefined;
  if(options.dev){
    const { createServer:createViteServer }=await import('vite');
    const v=await createViteServer({server:{middlewareMode:true,hmr:{server}},appType:'spa'});
    vite=v;app.use(v.middlewares);
  }else{
    app.use(express.static(path.resolve('dist/client')));
    app.get('/{*splat}',(_req,res)=>res.sendFile(path.resolve('dist/client/index.html')));
  }
  app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    if(error instanceof z.ZodError){res.status(400).json({message:'输入格式不正确，请检查后重试'});return;}
    if(error instanceof GameError){res.status(503).json({message:error.message});return;}
    console.error('Request failed:',error instanceof Error?error.message:'unknown');res.status(500).json({message:'服务暂时不可用'});
  });
  return {app,server,hub,async close(){clearInterval(heartbeat);await hub.close();for(const ws of wss.clients)ws.terminate();await new Promise<void>(r=>wss.close(()=>r()));await vite?.close();await new Promise<void>(r=>server.close(()=>r()));server.closeAllConnections();}};
}
