import 'dotenv/config';
const key=process.env.ADMIN_ENTRY_KEY;
if(!key){console.log('管理员入口未启用，请在 .env 配置 ADMIN_ENTRY_KEY。');process.exitCode=1;}
else console.log('http://127.0.0.1:'+(process.env.PORT||3131)+'/admin/entry?key='+encodeURIComponent(key));
