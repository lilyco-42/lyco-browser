import {parseConnection,proxyConfig,BLOCKED} from './connection.mjs';
const ALARM='lyco-connection-expiry';
const setting=(method,value)=>new Promise((resolve,reject)=>chrome.proxy.settings[method](value,result=>{
 const error=chrome.runtime.lastError;if(error)reject(Error(error.message));else resolve(result);
}));
const current=()=>setting('get',{incognito:false});
const set=value=>setting('set',{value,scope:'regular_only'});
let pending=Promise.resolve();
function queued(fn){const task=pending.then(fn);pending=task.catch(()=>{});return task}
async function badge(text){await chrome.action.setBadgeText({text});await chrome.action.setBadgeBackgroundColor({color:'#be3047'})}
async function block() {
 const state=await current();
 if(state.levelOfControl==='controlled_by_this_extension')await set(BLOCKED);
 await chrome.storage.session.set({expired:true});await badge('!');
}
async function status() {
 const state=await current(),saved=await chrome.storage.session.get(['connection','expired','lastError']);
 const controlled=state.levelOfControl==='controlled_by_this_extension';
 const connection=saved.connection;
 if(controlled&&(!connection||connection.expiresAt<=Date.now())){await block();return {active:false,blocked:true,message:'连接码已过期，已暂停网页代理。重新连接，或关闭代理恢复原设置。'}}
 const active=controlled&&!saved.expired&&connection&&state.value.mode==='fixed_servers'&&state.value.rules?.singleProxy?.host==='127.0.0.1'&&state.value.rules?.singleProxy?.port===connection.port;
 return {active:Boolean(active),blocked:Boolean(controlled&&saved.expired),
  message:active?(saved.lastError||'浏览器代理设置已启用；请保持桌面客户端运行。'):'浏览器代理未由本扩展启用',
  endpoint:active?`${connection.scheme}://127.0.0.1:${connection.port}`:'',expiresAt:active?connection.expiresAt:null};
}
async function connect(code) {
 const connection=parseConnection(code),before=await current();
 if(!['controllable_by_this_extension','controlled_by_this_extension'].includes(before.levelOfControl))throw Error('代理设置正由系统策略或其他扩展管理，请先在浏览器中核实');
 const previous=await chrome.storage.session.get(['connection','expired','lastError']);
 try{
  await set(proxyConfig(connection));
  if((await current()).levelOfControl!=='controlled_by_this_extension')throw Error('浏览器没有采用本扩展的代理设置');
  await chrome.storage.session.set({connection,expired:false,lastError:''});
  await chrome.alarms.create(ALARM,{when:connection.expiresAt});await badge('ON');
 }catch(error){
  if((await current()).levelOfControl==='controlled_by_this_extension'){
   if(before.levelOfControl==='controlled_by_this_extension')await set(before.value);
   else await setting('clear',{scope:'regular_only'});
  }
  await chrome.storage.session.set(previous);throw error;
 }
 return status();
}
async function disconnect() {
 if((await current()).levelOfControl==='controlled_by_this_extension')await setting('clear',{scope:'regular_only'});
 await chrome.storage.session.clear();await chrome.alarms.clear(ALARM);await badge('');return status();
}
chrome.runtime.onMessage.addListener((request,sender,reply)=>{
 if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return false;
 queued(async()=>{
  if(request?.action==='status')return status();
  if(request?.action==='connect')return connect(request.code);
  if(request?.action==='disconnect')return disconnect();
  if(request?.action==='open-account'){await chrome.tabs.create({url:'https://lain42.top/account/'});return {opened:true}}
  if(request?.action==='open-shop'){await chrome.tabs.create({url:'https://lain42.top/shop/#proxy_1m'});return {opened:true}}
  if(request?.action==='open-guide'){await chrome.tabs.create({url:'https://lain42.top/proxy-guide/'});return {opened:true}}
  throw Error('未知操作');
 }).then(value=>reply({ok:true,...value}),error=>reply({ok:false,error:error.message}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)void queued(status).catch(()=>{})});
chrome.runtime.onStartup.addListener(()=>{void queued(status).catch(()=>{})});
chrome.proxy.onProxyError.addListener(()=>{void queued(async()=>{
 if((await current()).levelOfControl==='controlled_by_this_extension'){
  await chrome.storage.session.set({lastError:'代理连接出现错误，请检查桌面客户端；没有自动切换为直连。'});await badge('!');
 }
}).catch(()=>{})});
