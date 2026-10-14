import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../server/cards.js';

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
