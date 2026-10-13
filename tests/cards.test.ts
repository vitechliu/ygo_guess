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
