import 'dotenv/config';
import { openStore } from './store.js';
import { openCache } from './cache.js';
import { Cards } from './cards.js';
import { createApp } from './app.js';
const store=await openStore(),cache=await openCache();
const dev=process.env.NODE_ENV!=='production'&&process.argv[1]?.endsWith('.ts');
const app=await createApp({store,cards:new Cards(cache),dev});
const host=process.env.HOST??'0.0.0.0',port=Number(process.env.PORT??3131);
app.server.listen(port,host,()=>console.log('YgoGuess ready: http://localhost:'+port+' (LAN bind '+host+')'));
let stopping=false;async function stop(){if(stopping)return;stopping=true;await app.close();await cache.close();await store.close();process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
