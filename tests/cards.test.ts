import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Cards,normalize} from '../server/cards.js';
import {FileCache} from '../server/cache.js';

test('YGOPro translation wins over official simplified name in search and detail responses',()=>{
 const search={id:5318639,cid:4909,cn_name:'旋风',sc_name:'气旋',text:{types:'[魔法|速攻]'}};
 const detail={id:5318639,cid:4909,text:{name:'旋风',sc_name:'气旋',types:'[魔法|速攻]'}};
 assert.equal(normalize(search).name,'旋风');
 assert.equal(normalize(detail).name,'旋风');
 assert.equal(normalize({...search,cn_name:'  '}).name,'气旋');
});

test('super-pre card images use the super-pre CDN',()=>{
 assert.equal(normalize({id:100268021,cid:12345}).image,'https://cdntx.moecube.com/ygopro-super-pre/data/pics/100268021.jpg');
 assert.equal(normalize({id:100000000,cid:12346}).image,'https://cdn.233.momobako.com/ygopro/pics/100000000.jpg!half');
 assert.equal(normalize({id:5318639,cid:4909}).image,'https://cdn.233.momobako.com/ygopro/pics/5318639.jpg!half');
});

test('Dragonmaid lookup uses the Baige card endpoint and normal Chinese card data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ygoguess-dragonmaid-'));
 const original=global.fetch;
 try{
  global.fetch=async input=>{
   assert.equal(String(input),'https://ygocdb.com/api/v0/card/32600024');
   return new Response(JSON.stringify({id:32600024,cid:15012,text:{name:'半龙女仆·寝室龙女',types:'[怪兽|效果] 龙/暗',desc:'中文效果文字'}}),{status:200});
  };
  const card=await new Cards(new FileCache(dir)).card(32600024);
  assert.equal(card.name,'半龙女仆·寝室龙女');
  assert.equal(card.cid,15012);
  assert.equal(card.description,'中文效果文字');
  assert.equal(card.image,'https://cdn.233.momobako.com/ygopro/pics/32600024.jpg!half');
 }finally{global.fetch=original;await rm(dir,{recursive:true,force:true});}
});
