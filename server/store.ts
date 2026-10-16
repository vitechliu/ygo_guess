import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import mysql, { type Pool } from 'mysql2/promise';
import type { RoomState, Session } from '../shared/types.js';
export interface Audit { actor: string; action: string; target: string }
export interface Store {
  loadRooms():Promise<RoomState[]>; saveRoom(room:RoomState,audit?:Audit):Promise<void>; saveRooms(rooms:RoomState[]):Promise<void>; deleteRooms(codes:string[]):Promise<void>;
  getSession(hash:string):Promise<Session|null>; putSession(hash:string,session:Session):Promise<void>; close():Promise<void>;
}
export class SqliteStore implements Store {
  private db:DatabaseSync;
  constructor(filename:string) {
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS cg_rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cg_sessions(token_hash TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cg_results(room_code TEXT NOT NULL, match_id TEXT NOT NULL, round INTEGER NOT NULL, player_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(room_code,match_id,round,player_id));
      CREATE TABLE IF NOT EXISTS cg_admin_audit(id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_cg_sessions_expiry ON cg_sessions(expires_at);`);
    this.db.prepare('DELETE FROM cg_sessions WHERE expires_at < ?').run(Date.now());
  }
  async loadRooms(){return (this.db.prepare('SELECT state FROM cg_rooms').all() as {state:string}[]).map(r=>JSON.parse(r.state));}
  async saveRoom(room:RoomState,audit?:Audit){await this.saveTransaction([room],audit);}
  async saveRooms(rooms:RoomState[]){await this.saveTransaction(rooms);}
  async deleteRooms(codes:string[]){
    if(!codes.length)return;
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const remove=this.db.prepare('DELETE FROM cg_rooms WHERE code=?');
      for(const code of codes)remove.run(code);
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  private async saveTransaction(rooms:RoomState[],audit?:Audit){
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const save=this.db.prepare('INSERT INTO cg_rooms(code,state) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET state=excluded.state');
      const put=this.db.prepare('INSERT INTO cg_results(room_code,match_id,round,player_id,value) VALUES(?,?,?,?,?) ON CONFLICT(room_code,match_id,round,player_id) DO NOTHING');
      for(const room of rooms){save.run(room.code,JSON.stringify(room));for(const h of room.history)for(const e of h.entries)put.run(room.code,String(room.createdAt),h.round,e.playerId,JSON.stringify(e));}
      if(audit)this.db.prepare('INSERT INTO cg_admin_audit(created_at,actor,action,target) VALUES(?,?,?,?)').run(Date.now(),audit.actor,audit.action,audit.target);
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  async getSession(hash:string){const r=this.db.prepare('SELECT value FROM cg_sessions WHERE token_hash=? AND expires_at>?').get(hash,Date.now()) as {value:string}|undefined;return r?JSON.parse(r.value):null;}
  async putSession(hash:string,s:Session){this.db.prepare('INSERT INTO cg_sessions(token_hash,value,expires_at) VALUES(?,?,?) ON CONFLICT(token_hash) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at').run(hash,JSON.stringify(s),s.expiresAt);}
  async close(){this.db.close();}
}
export class MysqlStore implements Store {
  constructor(private pool:Pool){}
  static async open(uri:string) {
    const s=new MysqlStore(mysql.createPool(uri));
    for(const sql of [
      'CREATE TABLE IF NOT EXISTS cg_rooms(code VARCHAR(12) PRIMARY KEY, state LONGTEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS cg_sessions(token_hash VARCHAR(64) PRIMARY KEY, value TEXT NOT NULL, expires_at BIGINT NOT NULL, INDEX idx_cg_sessions_expiry(expires_at))',
      'CREATE TABLE IF NOT EXISTS cg_results(room_code VARCHAR(12) NOT NULL, match_id VARCHAR(32) NOT NULL, round INT NOT NULL, player_id VARCHAR(64) NOT NULL, value TEXT NOT NULL, PRIMARY KEY(room_code,match_id,round,player_id))',
      'CREATE TABLE IF NOT EXISTS cg_admin_audit(id BIGINT AUTO_INCREMENT PRIMARY KEY, created_at BIGINT NOT NULL, actor VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL, target VARCHAR(128) NOT NULL)'
    ])await s.pool.query(sql);
    await s.pool.execute('DELETE FROM cg_sessions WHERE expires_at < ?',[Date.now()]);
    return s;
  }
  async loadRooms(){const [rows]=await this.pool.query('SELECT state FROM cg_rooms');return (rows as {state:string}[]).map(r=>JSON.parse(r.state));}
  async saveRoom(room:RoomState,audit?:Audit){await this.saveTransaction([room],audit);}
  async saveRooms(rooms:RoomState[]){await this.saveTransaction(rooms);}
  async deleteRooms(codes:string[]){
    if(!codes.length)return;
    const c=await this.pool.getConnection();
    try{
      await c.beginTransaction();
      for(const code of codes)await c.execute('DELETE FROM cg_rooms WHERE code=?',[code]);
      await c.commit();
    }catch(error){await c.rollback();throw error;}finally{c.release();}
  }
  private async saveTransaction(rooms:RoomState[],audit?:Audit){
    const c=await this.pool.getConnection();await c.beginTransaction();
    try{
      for(const room of rooms){
        await c.execute('INSERT INTO cg_rooms(code,state) VALUES(?,?) ON DUPLICATE KEY UPDATE state=VALUES(state)',[room.code,JSON.stringify(room)]);
        for(const h of room.history)for(const e of h.entries)await c.execute('INSERT IGNORE INTO cg_results(room_code,match_id,round,player_id,value) VALUES(?,?,?,?,?)',[room.code,String(room.createdAt),h.round,e.playerId,JSON.stringify(e)]);
      }
      if(audit)await c.execute('INSERT INTO cg_admin_audit(created_at,actor,action,target) VALUES(?,?,?,?)',[Date.now(),audit.actor,audit.action,audit.target]);
      await c.commit();
    }catch(error){await c.rollback();throw error;}finally{c.release();}
  }
  async getSession(hash:string){const [rows]=await this.pool.execute('SELECT value FROM cg_sessions WHERE token_hash=? AND expires_at>?',[hash,Date.now()]);const row=(rows as {value:string}[])[0];return row?JSON.parse(row.value):null;}
  async putSession(hash:string,s:Session){await this.pool.execute('INSERT INTO cg_sessions(token_hash,value,expires_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),expires_at=VALUES(expires_at)',[hash,JSON.stringify(s),s.expiresAt]);}
  async close(){await this.pool.end();}
}
export async function openStore():Promise<Store>{
  if(process.env.STORAGE==='mysql'){if(!process.env.MYSQL_URL)throw new Error('MYSQL_URL is required');return MysqlStore.open(process.env.MYSQL_URL);}
  const dir=path.resolve(process.env.DATA_DIR??'data');await mkdir(dir,{recursive:true});return new SqliteStore(path.join(dir,'ygoguess.sqlite'));
}
