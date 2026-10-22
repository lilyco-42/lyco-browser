'use strict';
// Main-process only: persistent ownership + automatic loopback proxy binding.
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
class LycoProfiles {
  constructor({network, engine, proxyStore, dataDir}) {
    this.network=network; this.engine=engine; this.proxyStore=proxyStore;
    this.file=path.join(dataDir,'lyco-workspaces.json'); this.busy=false;
    this.bindings=Object.create(null);
    if(fs.existsSync(this.file)) {
      const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(saved.version!==1 || !saved.bindings || typeof saved.bindings!=='object' || Array.isArray(saved.bindings)) throw Error('LYCO 环境绑定记录无效，请恢复备份');
      for(const [id,binding] of Object.entries(saved.bindings)) {
        if(!/^[A-Za-z0-9_-]{1,120}$/.test(id) || ['__proto__','prototype','constructor'].includes(id) || typeof binding.owner!=='string' || !binding.owner || typeof binding.proxyId!=='string' || !binding.proxyId) throw Error('LYCO 环境绑定记录无效，请恢复备份');
      }
      this.bindings=Object.assign(Object.create(null),saved.bindings);
    }
    network.onCoreExit=()=>this.stopManaged();
    // The upstream sanitizer rebuilds proxyMeta and drops custom flags.
    // Resolve policy from trusted, persisted bindings at the final launch
    // boundary instead of trusting renderer metadata to survive that path.
    engine.lycoIsManagedProfile=profile=>Object.hasOwn(this.bindings,profile?.id) ||
      Object.values(this.bindings).some(binding=>binding.proxyId===profile?.proxyId);
    const start=engine.start.bind(engine);
    engine.start=async profile=>{
      const ready=await this.beforeStart(profile);
      if(ready.authorization) this.assertCurrent(ready.authorization);
      return start(ready.profile);
    };
  }
  save() {
    fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
    fs.writeFileSync(this.file+'.tmp',JSON.stringify({version:1,bindings:this.bindings}),{mode:0o600});
    fs.renameSync(this.file+'.tmp',this.file);
  }
  async authorized(owner) {
    const state=await this.network.refresh();
    if(!state.logged_in || !state.entitled || !state.username) throw Error('请登录并开通有效代理月卡');
    if(owner && state.username!==owner) throw Error('此环境属于另一网站账号，请切回原账号后启动');
    const connectionEpoch=this.network.connectionEpoch;
    const connected=await this.network.connect();
    if(connected.username!==state.username || !connected.logged_in || !connected.entitled || this.network.connectionEpoch!==connectionEpoch)
      throw Error('账号或连接已变化，请重新操作');
    if(!connected.connected || !Number.isInteger(connected.port)) throw Error('本地代理尚未就绪，环境不会直连启动');
    return {...connected,connectionEpoch};
  }
  assertCurrent(authorization) {
    const current=this.network.status();
    if(this.network.connectionEpoch!==authorization.connectionEpoch || current.username!==authorization.username ||
        !current.logged_in || !current.entitled || !current.connected || current.port!==authorization.port)
      throw Error('账号或连接已变化，请重新操作');
  }
  async proxy(state, existingId) {
    const payload={name:'LYCO 专属线路',protocol:'http',host:'127.0.0.1',port:state.port,
      raw:'http://127.0.0.1:'+state.port,remark:'LYCO Browser · 网站月卡管理'};
    const store=typeof this.proxyStore==='function'?this.proxyStore():this.proxyStore;
    if(!store) throw Error('代理库尚未就绪，请稍后重试');
    const record=await (existingId ? store.update(existingId,payload) : store.create(payload));
    if(!record?.id) throw Error('保存专属代理失败，环境未启动');
    return record;
  }
  async create() {
    if(this.busy) throw Error('正在创建环境，请勿重复点击');
    this.busy=true;
    try {
      const state=await this.authorized();
      const number=Math.max(0,...[...this.engine.profiles.values()].map(p=>Number(p.number)||0))+1;
      const record=await this.proxy(state);
      this.assertCurrent(state);
      const id=randomUUID();
      const profile={id,number,name:String(number),title:'LYCO 专属环境',browser:'Google Chrome',
        os:process.platform==='win32'?'Windows':process.platform==='darwin'?'macOS':'Linux',
        networkMode:'proxy',proxy:record.raw,proxyId:record.id,proxyMeta:{proxyId:record.id,lycoManaged:true,directBypass:false,bypassList:''},
        language:'en-US',startUrl:'https://www.youtube.com/',platform:{type:'other',startUrl:'https://www.youtube.com/'},
        privacy:{languageMode:'ip',langFromIp:true,uiLanguage:'profile',deviceProfile:'persona',clientRects:'native'}};
      this.bindings[id]={owner:state.username,proxyId:record.id};
      this.save();
      try { await this.engine.syncProfiles([...this.engine.profiles.values(),profile]); }
      catch(error) { delete this.bindings[id];this.save();throw error; }
      // Creating a ready profile does not open a third-party page automatically.
      return {profile:this.engine.profiles.get(id),owner:state.username};
    } finally {this.busy=false;}
  }
  async beforeStart(profile) {
    let binding=Object.hasOwn(this.bindings,profile?.id)?this.bindings[profile.id]:null;
    if(!binding) binding=Object.values(this.bindings).find(item=>item.proxyId===profile?.proxyId);
    if(!binding) return {profile};
    const state=await this.authorized(binding.owner);
    const record=await this.proxy(state,binding.proxyId);
    this.assertCurrent(state);
    const stored=this.engine.profiles.get(profile.id);
    if(!stored) throw Error('专属环境已不存在');
    if(!Object.hasOwn(this.bindings,profile.id)) {
      if(!/^[A-Za-z0-9_-]{1,120}$/.test(profile.id) || ['__proto__','prototype','constructor'].includes(profile.id)) throw Error('环境标识无效');
      this.bindings[profile.id]={...binding};this.save();
    }
    return {profile:{...stored,...profile,networkMode:'proxy',proxy:record.raw,proxyId:record.id,
      proxyMeta:{...(stored.proxyMeta||{}),proxyId:record.id,lycoManaged:true,directBypass:false,bypassList:''}},authorization:state};
  }
  async login(credentials) {
    // Switching accounts must not leave an old window using a recycled port.
    await this.disconnect();
    return this.network.login(credentials);
  }
  async stopManaged() {
    await Promise.allSettled(Object.keys(this.bindings).map(id=>this.engine.stop(id)));
  }
  async disconnect({logout=false}={}) {
    await this.stopManaged();
    return logout ? this.network.logout() : this.network.disconnect();
  }
}
module.exports={LycoProfiles};
