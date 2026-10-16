import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import mysql from 'mysql2/promise';
import {MysqlStore} from '../server/store.js';import {RedisCache} from '../server/cache.js';import {createRoom,startRound,guess} from '../server/engine.js';import {cards,session} from './fixtures.js';
test('MySQL migrations, session expiry, room restart and durable results',{skip:!process.env.MYSQL_TEST_URL},async()=>{
 const url=process.env.MYSQL_TEST_URL!,code=randomUUID().replaceAll('-','').slice(0,6).toUpperCase(),token=randomUUID();
 let s=await MysqlStore.open(url);
 try{const r=createRoom(code,'a','A',{mode:'random',attempts:1});r.players.push({id:'b',name:'B',seat:1,score:0,ready:true,left:false});startRound(r,cards,true);guess(r,'a',r.entries[0].card!,r.turnId);guess(r,'b',r.entries[1].card!,r.turnId);await s.saveRoom(r,{actor:'test-admin',action:'test',target:code});await s.putSession(token,session('a'));await s.close();s=await MysqlStore.open(url);const recovered=(await s.loadRooms()).find(x=>x.code===code)!;assert.equal(recovered.players[0].score,1000);assert.equal(recovered.phase,'round-end');assert.equal((await s.getSession(token))!.playerId,'a');await s.putSession(token,{...session('a'),expiresAt:0});assert.equal(await s.getSession(token),null);
 await s.deleteRooms([code]);assert.equal((await s.loadRooms()).some(room=>room.code===code),false);
 const records=await mysql.createConnection(url);
 try{const [rows]=await records.execute('SELECT COUNT(*) AS n FROM results WHERE room_code=?',[code]);assert.equal(Number((rows as {n:number}[])[0].n),2);}finally{await records.end();}
 }finally{await s.close();const db=await mysql.createConnection(url);await db.execute('DELETE FROM rooms WHERE code=?',[code]);await db.execute('DELETE FROM results WHERE room_code=?',[code]);await db.execute('DELETE FROM sessions WHERE token_hash=?',[token]);await db.execute('DELETE FROM admin_audit WHERE target=? AND action=?',[code,'test']);await db.end();}
});
test('Redis JSON cache roundtrip, independent client visibility and TTL',{skip:!process.env.REDIS_TEST_URL},async()=>{
 const uri=process.env.REDIS_TEST_URL!,a=await new RedisCache(uri).connect(),b=await new RedisCache(uri).connect(),key='integration:'+randomUUID();
 try{await a.set(key,{nested:{value:42}},1);assert.deepEqual(await b.get(key),{nested:{value:42}});await new Promise(r=>setTimeout(r,1200));assert.equal(await b.get(key),null);}finally{await a.close();await b.close();}
});
