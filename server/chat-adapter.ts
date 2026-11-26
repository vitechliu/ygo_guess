import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {dirname} from 'node:path'

export type ChatIdentity = {key:string,name:string,listed?:boolean}
export type ChatState = {type:'channel.state',channel:string,name:string,
    phase:'waiting'|'playing'|'finished'|'closed'|'unknown',memberCount:number,members:ChatIdentity[],maxLength:number}
export type ChatEvent = ChatState | {type:'message.created',channel:string,id:string,text:string,actor:ChatIdentity}
export type Delivery = {id:string,channel:string,text:string,actor:ChatIdentity,time:number}
export const chatKey = (value:string) => createHash('sha256').update(value).digest('hex')

export function createChatAdapter() {
    const {CHAT_HUB_URL,CHAT_SERVICE_ID,CHAT_SERVICE_SECRET,CHAT_OUTBOX_PATH='data/pinkki-chat-outbox.sqlite'}=process.env
    if (!CHAT_HUB_URL && !CHAT_SERVICE_ID && !CHAT_SERVICE_SECRET) return
    if (!CHAT_HUB_URL || !CHAT_SERVICE_ID || !CHAT_SERVICE_SECRET) throw new Error('Incomplete chat adapter configuration')
    const root=new URL(CHAT_HUB_URL)
    root.pathname=root.pathname.replace(/\/+$/, '')+'/'
    if (root.protocol!=='https:' && !['127.0.0.1','localhost','::1','[::1]'].includes(root.hostname)) {
        throw new Error('CHAT_HUB_URL requires HTTPS')
    }
    mkdirSync(dirname(CHAT_OUTBOX_PATH),{recursive:true})
    const db=new DatabaseSync(CHAT_OUTBOX_PATH)
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS delivered (id TEXT PRIMARY KEY,error TEXT,at INTEGER NOT NULL);`)
    const headers={Authorization:'Bearer '+CHAT_SERVICE_SECRET,'X-Chat-Service':CHAT_SERVICE_ID,'Content-Type':'application/json'}
    const url=(path:string)=>new URL('v1/adapter/'+path,root)
    async function request(path:string,body?:object) {
        return fetch(url(path),{method:body?'POST':'GET',headers,redirect:'error',
            signal:AbortSignal.timeout(3500),body:body?JSON.stringify(body):undefined})
    }
    let stopped=false, running:Promise<void>|undefined, timer:ReturnType<typeof setInterval>|undefined
    let retryAt=0, failures=0, lastRefresh=0
    let previous=new Map<string,ChatState>()
    function events(...items: ChatEvent[]) {
        if (stopped || !items.length) return
        const insert=db.prepare('INSERT INTO outbox(body) VALUES(?)')
        try {
            db.exec('BEGIN IMMEDIATE')
            for (const item of items) {
                // Room heartbeats can replace older waiting heartbeats for the same room.
                if (item.type==='channel.state' && item.phase!=='closed') {
                    const queued=db.prepare("SELECT seq,body FROM outbox WHERE json_extract(body,'$.channel')=? ORDER BY seq DESC LIMIT 1")
                        .get(item.channel) as {seq:number,body:string}|undefined
                    if (queued && (JSON.parse(queued.body) as ChatEvent).type==='channel.state' &&
                        (JSON.parse(queued.body) as ChatState).phase!=='closed') {
                        db.prepare('UPDATE outbox SET body=? WHERE seq=?').run(JSON.stringify(item),queued.seq)
                        continue
                    }
                }
                insert.run(JSON.stringify(item))
            }
            db.exec('COMMIT')
        } catch {
            try {db.exec('ROLLBACK')} catch {}
            console.error('Pinkki chat adapter outbox write failed',CHAT_SERVICE_ID)
        }
    }
    function start(states:()=>ChatState[]|Promise<ChatState[]>, deliver:(job:Delivery)=>Promise<string|undefined>) {
        const tick=()=>{
            if (stopped||running||Date.now()<retryAt) return
            running=(async()=>{
                if (Date.now()-lastRefresh>=20_000) {
                    const current=new Map((await states()).map(state=>[state.channel,state]))
                    const closed=[...previous.values()].filter(state=>!current.has(state.channel))
                        .map(state=>({...state,phase:'closed' as const,memberCount:0,members:[]}))
                    events(...current.values(),...closed)
                    previous=current
                    lastRefresh=Date.now()
                    db.prepare('DELETE FROM delivered WHERE at<?').run(Date.now()-86400000)
                }
                const queued=db.prepare('SELECT seq,body FROM outbox ORDER BY seq LIMIT 100').all() as {seq:number,body:string}[]
                for (const row of queued) {
                    const response=await request('events',JSON.parse(row.body))
                    if (!response.ok && ![400,404].includes(response.status)) throw new Error('event post failed')
                    if (!response.ok) console.warn('Pinkki chat adapter event rejected',CHAT_SERVICE_ID,response.status)
                    const body=db.prepare('SELECT body FROM outbox WHERE seq=?').get(row.seq) as {body:string}|undefined
                    if (body?.body===row.body) db.prepare('DELETE FROM outbox WHERE seq=?').run(row.seq)
                }
                const response=await request('deliveries')
                if (!response.ok) throw new Error('delivery poll failed')
                for (const job of (await response.json() as {jobs:Delivery[]}).jobs) {
                    if (stopped) break
                    const stored=db.prepare('SELECT error FROM delivered WHERE id=?').get(job.id) as {error:string|null}|undefined
                    let error=stored?.error??undefined
                    if (!stored) {
                        error=await deliver(job)
                        db.prepare('INSERT INTO delivered(id,error,at) VALUES(?,?,?)').run(job.id,error??null,Date.now())
                    }
                    if (!(await request('deliveries',{id:job.id,error})).ok) throw new Error('delivery ack failed')
                }
                failures=0
            })().catch(()=>{
                if (failures===0) console.warn('Pinkki chat adapter disconnected',CHAT_SERVICE_ID)
                retryAt=Date.now()+Math.min(30_000,1000*2**Math.min(++failures,5))
            }).finally(()=>{running=undefined})
        }
        timer=setInterval(tick,800)
        timer.unref()
        tick()
    }
    return {events,start,close:async()=>{stopped=true;clearInterval(timer);await running;db.close()}}
}
