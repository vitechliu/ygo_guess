import type { Card,Session } from '../shared/types.js';
import type {CardProvider} from '../server/cards.js';
import {normalize} from '../server/cards.js';
import {DRAGONMAID_IDS} from '../shared/dragonmaids.js';
export const cards:Card[]=Array.from({length:10},(_,i)=>({id:100+i,cid:1000+i,name:'测试卡'+i,types:'[怪兽|通常]',description:'仅用于隔离测试，不进入正式题库。',image:'https://example.invalid/card-'+i+'.jpg'}));
export class FixtureCards implements CardProvider {
 constructor(public available:Card[]=cards){}
 async card(id:number){
  if(DRAGONMAID_IDS.some(maidId=>maidId===id))return normalize({id,cid:id+1000,text:{name:'半龙女仆·测试龙女',types:'[怪兽|效果] 龙/暗',desc:'百鸽测试卡牌说明'}});
  const c=cards.find(c=>c.id===id);if(!c)throw new Error('Missing fixture');return c;
 }
 async search(q:string,start=0){return {cards:cards.filter(c=>c.name.includes(q)).slice(start,start+3),next:start+3<cards.length?start+3:0};}
 async pool(){return this.available;}
}
export const session=(id:string,admin=false):Session=>({playerId:id,name:id,admin,expiresAt:Date.now()+86400000});
