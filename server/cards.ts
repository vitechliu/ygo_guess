import { readFile } from 'node:fs/promises';
import type { Card } from '../shared/types.js';
import type { Cache } from './cache.js';
import { GameError } from './engine.js';
export interface CardProvider { search(q:string,start:number):Promise<{cards:Card[];next:number;cached?:boolean}>; card(id:number):Promise<Card>; pool():Promise<Card[]> }
type Raw=Record<string,any>;
export function normalize(raw:Raw):Card {
  const text=raw.text??{};
  if(!Number.isInteger(raw.id)||!Number.isInteger(raw.cid)||raw.id<=0||raw.cid<=0)throw new GameError('这张卡缺少有效标识，请选择其他卡牌');
  // Search/cardset use cn_name; the single-card endpoint puts the YGOPro name in text.name.
  const name=[raw.cn_name,text.cn_name,text.name,raw.name,raw.sc_name,text.sc_name,raw.md_name,text.md_name,raw.jp_name,text.jp_name]
    .find(value=>typeof value==='string'&&value.trim())?.trim()??String(raw.id);
  return {id:raw.id,cid:raw.cid,name,types:text.types??'',description:[text.pdesc,text.desc].filter(Boolean).join('\n'),image:'https://cdn.233.momobako.com/ygopro/pics/'+raw.id+'.jpg!half'};
}
export class Cards implements CardProvider {
  private pending=new Map<string,Promise<any>>();
  constructor(private cache:Cache,private poolPath=process.env.CARD_POOL_PATH??'config/card-pool.json'){}
  private async fetchCached<T>(key:string,url:string,fresh:number,init?:RequestInit):Promise<{data:T;cached:boolean}> {
    const old=await this.cache.get<{data:T;at:number}>(key).catch(()=>null);
    if(old&&Date.now()-old.at<fresh)return {data:old.data,cached:true};
    if(this.pending.has(key))return this.pending.get(key)!;
    const task=(async()=>{
      try{
        const response=await fetch(url,{...init,signal:AbortSignal.timeout(init?20000:8000),headers:{Accept:'application/json',...init?.headers}});
        if(!response.ok)throw new Error('upstream');
        const data=await response.json() as T;
        await this.cache.set(key,{data,at:Date.now()},7*86400).catch(()=>{});
        return {data,cached:false};
      }catch{if(old)return {data:old.data,cached:true};throw new GameError('卡牌服务暂时不可用，请稍后重试');}
    })();
    this.pending.set(key,task);try{return await task;}finally{this.pending.delete(key);}
  }
  async search(q:string,start=0){
    const {data,cached}=await this.fetchCached<Raw>('search:'+q+':'+start,'https://ygocdb.com/api/v0/?search='+encodeURIComponent(q)+'&start='+start,10*60*1000);
    if(!Array.isArray(data.result))throw new GameError('卡牌搜索返回异常，请稍后重试');
    const cards:Card[]=[];
    for(const raw of data.result){try{cards.push(normalize(raw));}catch{}}
    return {cards,next:Number(data.next)||0,cached};
  }
  async card(id:number){
    const {data}=await this.fetchCached<Raw>('card:'+id,'https://ygocdb.com/api/v0/card/'+id,86400*1000);
    return normalize(data);
  }
  async pool(){
    let ids:unknown;
    try{ids=JSON.parse(await readFile(this.poolPath,'utf8'));}catch{throw new GameError('精选题库文件无法读取');}
    if(!Array.isArray(ids)||ids.some(id=>!Number.isInteger(id)||id<=0))throw new GameError('精选题库格式应为卡牌密码数组');
    const cards:Card[]=[];
    // The API accepts at most 100 IDs per batch. Cache each batch for repeat rounds and offline fallback.
    for(let i=0;i<ids.length;i+=100){
      const batch=ids.slice(i,i+100) as number[];
      const {data}=await this.fetchCached<Record<string,Raw>>('pool-batch:'+batch.join(','),'https://ygocdb.com/api/v0/cardset',86400*1000,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:batch})});
      if(!data||typeof data!=='object'||Array.isArray(data))throw new GameError('精选题库查询返回异常，请稍后重试');
      for(const id of batch){const raw=data[String(id)];if(raw){try{cards.push(normalize(raw));}catch{}}}
    }
    return [...new Map(cards.map(c=>[c.cid,c])).values()];
  }
}
