import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Cards } from '../server/cards.js';
import { openCache } from '../server/cache.js';

const path=process.env.CARD_POOL_PATH??'config/card-pool.json';
const ids=JSON.parse(await readFile(path,'utf8')) as unknown;
const cache=await openCache();
try{
  const cards=await new Cards(cache,path).pool();
  const count=Array.isArray(ids)?ids.length:0;
  console.log(`题库密码数量：${count}；有效且 CID 不重复的卡牌数量：${cards.length}`);
  if(count===0)console.log('题库留空：分配模式不可开始，出题模式不受影响');
  else if(cards.length!==count)throw new Error('题库包含无效密码或重复 CID，请检查后再使用分配模式');
}finally{await cache.close();}
