'use strict';
// Trusted main-process routing. Each explicitly selected workspace gets its own
// loopback core/config; changing one selector cannot reroute another workspace.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {makeConfig,freePort,waitForPort}=require('./network');
const hash=value=>createHash('sha256').update(value).digest('hex');
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(id)&&!['__proto__','prototype','constructor'].includes(id);
const validRoute=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);
const label=name=>name.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200);
async function cleanup(directory){
 await fs.rm(path.join(directory,'config.json'),{force:true}).catch(()=>{});
 await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
async function terminate(child){
 if(child.exitCode!==null)return;
 await new Promise(resolve=>{
  let timer;
  const done=()=>{clearTimeout(timer);child.removeListener('exit',done);resolve()};
  child.once('exit',done);
  timer=setTimeout(()=>{try{child.kill('SIGKILL')}catch(_){}done()},2000);
  try{child.kill()}catch(_){done()}
  if(child.exitCode!==null)done();
 });
}
function routesFromSubscription(input){
 const config=makeConfig(input,18001);
 const names=[...config.proxies,...config['proxy-groups']].map(row=>row.name);
 if(new Set(names).size!==names.length)throw Error('订阅存在重复节点或分组名称，无法固定线路');
 const nodes=config.proxies.map(node=>({id:hash(JSON.stringify([node.name,node.type,node.server??null,node.port??null])),label:label(node.name),name:node.name}));
 return {config,nodes};
}
function fixedConfig(source,node,port){
 const config=makeConfig(source,port);
 const rows=new Map([
  ...config.proxies.map(row=>[row.name,{row,refs:row['dialer-proxy']?[row['dialer-proxy']]:[],outbound:true}]),
  ...config['proxy-groups'].map(row=>[row.name,{row,refs:row.proxies,outbound:false}]),
 ]);
 if(!rows.get(node?.name)?.outbound)throw Error('所选官网节点无效');
 // Walk only reachable dependencies, preserving every entry hop and group
 // policy. Iterative DFS also rejects node/group cycles without stack overflow.
 const states=new Map(),stack=[{name:node.name,leave:false}];
 while(stack.length){
  const {name,leave}=stack.pop();
  if(name==='REJECT'||name==='REJECT-DROP')continue;
  if(leave){states.set(name,2);continue}
  if(states.get(name)===2)continue;
  if(states.get(name)===1)throw Error('所选官网线路存在循环代理依赖');
  const entry=rows.get(name);if(!entry)throw Error('所选官网线路存在未知代理依赖');
  states.set(name,1);stack.push({name,leave:true});
  for(let index=entry.refs.length-1;index>=0;index--)stack.push({name:entry.refs[index],leave:false});
 }
 const byName=(a,b)=>a.name<b.name?-1:a.name>b.name?1:0;
 config.proxies=config.proxies.filter(row=>states.has(row.name)).sort(byName);
 config['proxy-groups']=config['proxy-groups'].filter(row=>states.has(row.name)).sort(byName);
 // Do not rewrite a provider's PROXY: an outbound may use that group as its
 // dialer. A private ASCII selector avoids both collisions and rule injection.
 let root='LYCO_WORKSPACE_ROUTE',suffix=0;
 while(states.has(root))root='LYCO_WORKSPACE_ROUTE_'+(++suffix);
 config['proxy-groups'].push({name:root,type:'select',proxies:[node.name],'default-selected':node.name,'empty-fallback':'REJECT'});
 config.rules=['MATCH,'+root];
 return config;
}
class LycoWorkspaceRoutes {
 constructor({network,dataDir,onRouteLost=()=>{}}){
  this.network=network;this.directory=path.join(dataDir,'lyco-workspace-routes');
  this.onRouteLost=onRouteLost;this.entries=new Map();this.pending=new Map();this.epochs=new Map();this.generation=0;
 }
 assertAuthorization(authorization){
  const state=this.network.status();
  if(!state.logged_in||!state.entitled||!state.connected||state.username!==authorization.username||
    state.port!==authorization.port||this.network.connectionEpoch!==authorization.connectionEpoch||
    (state.expires_at&&Date.parse(state.expires_at)<=Date.now()))throw Error('账号或连接已变化，请重新操作');
 }
 async resolve(authorization,routeId){
  this.assertAuthorization(authorization);
  const source=await this.network.workspaceSubscription(authorization);
  this.assertAuthorization(authorization);
  const parsed=routesFromSubscription(source);
  if(routeId===undefined)return parsed;
  if(!validRoute(routeId))throw Error('官网线路标识无效');
  const node=parsed.nodes.find(row=>row.id===routeId);
  if(!node)throw Error('所选官网线路已不存在，请重新选择；环境不会改用其他线路');
  return {...parsed,node};
 }
 async catalog(authorization){
  const {nodes}=await this.resolve(authorization);
  return {owner:authorization.username,nodes:nodes.map(({id,label})=>({id,label}))};
 }
 assertCurrent(lease,authorization){
  this.assertAuthorization(authorization);
  const entry=this.entries.get(lease.id);
  if(!entry||entry!==lease||entry.child.exitCode!==null||entry.child.killed||entry.generation!==this.generation||entry.epoch!==(this.epochs.get(lease.id)||0))
   throw Error('环境线路连接已变化，请重新启动');
 }
 acquire(id,routeId,authorization){
  if(!validId(id)||!validRoute(routeId))return Promise.reject(Error('环境或官网线路标识无效'));
  const existing=this.pending.get(id);
  if(existing){
   if(existing.routeId!==routeId)return Promise.reject(Error('环境线路正在连接，请稍后重试'));
   return existing.promise.then(lease=>{this.assertCurrent(lease,authorization);return lease});
  }
  const epoch=this.epochs.get(id)||0,generation=this.generation;
  const promise=this.start(id,routeId,authorization,epoch,generation).finally(()=>{if(this.pending.get(id)?.promise===promise)this.pending.delete(id)});
  this.pending.set(id,{routeId,promise});return promise;
 }
 async start(id,routeId,authorization,epoch,generation){
  const current=()=>{
   this.assertAuthorization(authorization);
   if(generation!==this.generation||epoch!==(this.epochs.get(id)||0))throw Error('环境线路连接已取消');
  };
  const {config:source,node}=await this.resolve(authorization,routeId);current();
  const signature=hash(JSON.stringify(fixedConfig(source,node,18001)));
  const existing=this.entries.get(id);
  if(existing){
   this.assertCurrent(existing,authorization);
   if(existing.routeId!==routeId||existing.signature!==signature)throw Error('官网线路配置已变化，请停止环境后重新启动');
   return existing;
  }
  const core=this.network.findCore();if(!core)throw Error('代理内核尚未就绪');
  const port=await freePort();current();
  await fs.mkdir(this.directory,{recursive:true,mode:0o700});
  const directory=await fs.mkdtemp(path.join(this.directory,id+'-'));
  let entry;
  try{
   const file=path.join(directory,'config.json');
   await fs.writeFile(file,JSON.stringify(fixedConfig(source,node,port)),{encoding:'utf8',mode:0o600});current();
   const child=this.network.spawnFn(core,['-f',file,'-d',directory],{cwd:directory,windowsHide:true,stdio:'ignore'});
   entry={id,routeId,label:node.label,port,child,directory,epoch,generation,signature};
   this.entries.set(id,entry);
   const gone=()=>{
    if(this.entries.get(id)!==entry)return;
    this.entries.delete(id);this.epochs.set(id,epoch+1);
    cleanup(directory).catch(()=>{});
    try{Promise.resolve(this.onRouteLost(id)).catch(()=>{})}catch(_){}
   };
   child.on('error',gone);child.on('exit',gone);
   await waitForPort(port,child);current();this.assertCurrent(entry,authorization);return entry;
  }catch(error){
   if(entry&&this.entries.get(id)===entry){this.entries.delete(id);await terminate(entry.child)}
   await cleanup(directory);throw error;
  }
 }
 async stop(id){
  this.epochs.set(id,(this.epochs.get(id)||0)+1);
  const entry=this.entries.get(id);if(!entry)return;
  this.entries.delete(id);
  await terminate(entry.child);
  await cleanup(entry.directory);
 }
 async stopAll(){
  this.generation++;
  await Promise.allSettled([...this.entries.keys()].map(id=>this.stop(id)));
 }
}
module.exports={LycoWorkspaceRoutes,routesFromSubscription,fixedConfig,validRoute};
