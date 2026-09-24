import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from 'redis';
export interface Cache { get<T>(key:string):Promise<T|null>; set<T>(key:string,value:T,ttlSeconds:number):Promise<void>; close():Promise<void> }
export class FileCache implements Cache {
  constructor(private dir:string){}
  private filename(key:string){return path.join(this.dir,createHash('sha256').update(key).digest('hex')+'.json');}
  async get<T>(key:string):Promise<T|null>{try{const file=this.filename(key);const v=JSON.parse(await readFile(file,'utf8'));if(v.expiresAt<Date.now()){await unlink(file).catch(()=>{});return null;}return v.value;}catch{return null;}}
  async set<T>(key:string,value:T,ttl:number){await mkdir(this.dir,{recursive:true});const name=this.filename(key),tmp=name+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify({value,expiresAt:Date.now()+ttl*1000}));await rename(tmp,name);}
  async close(){}
}
export class RedisCache implements Cache {
  private client;
  constructor(uri:string){this.client=createClient({url:uri,disableOfflineQueue:true,commandsQueueMaxLength:1000,socket:{connectTimeout:3000}});this.client.on('error',()=>console.warn('Redis connection unavailable'));}
  async connect(){await this.client.connect();return this;}
  async get<T>(key:string):Promise<T|null>{const v=await this.client.withAbortSignal(AbortSignal.timeout(1500)).get('ygoguess:'+key);return v?JSON.parse(v):null;}
  async set<T>(key:string,value:T,ttl:number){await this.client.withAbortSignal(AbortSignal.timeout(1500)).set('ygoguess:'+key,JSON.stringify(value),{EX:ttl});}
  async close(){await this.client.quit();}
}
export async function openCache():Promise<Cache>{return process.env.CACHE==='redis'?new RedisCache(process.env.REDIS_URL??'redis://localhost:6379').connect():new FileCache(path.resolve(process.env.DATA_DIR??'data','cache'));}
