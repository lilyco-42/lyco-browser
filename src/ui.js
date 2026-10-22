'use strict';
(() => {
 let busy=false;
 const e = id => document.getElementById(id);
 const message = (value, err=false) => { e('lyco-feedback').textContent=String(value||'');e('lyco-feedback').dataset.tone=err?'error':'status'; };
 async function render(x) {
  const s=x||await window.ops.lycoStatus();
  e('view-lyco').setAttribute('aria-busy',String(busy));
  document.querySelectorAll('#view-lyco button').forEach(button=>button.disabled=false);
  e('lyco-account-status').textContent=s.logged_in ? (s.username+' · '+(s.entitled?'有效代理月卡':'暂无有效月卡')+(s.expires_at?' · 到期 '+new Date(s.expires_at).toLocaleString() : '')) : '尚未登录';
  e('lyco-network-status').textContent=s.connected?('已连接 · 本地 HTTP 127.0.0.1:'+s.port):('未连接 · '+(s.has_core?'网络组件已就绪':'请在高级设置中导入网络组件'));
  e('lyco-account-chip').textContent=s.logged_in?(s.entitled?'月卡可用':'待购买或续费'):'待登录';
  e('lyco-account-chip').dataset.state=s.entitled?'ready':'pending';
  e('lyco-network-chip').textContent=s.connected?'已连接':'未连接';
  e('lyco-network-chip').dataset.state=s.connected?'ready':'pending';
  e('lyco-import').disabled=!s.connected;
  e('lyco-create-profile').disabled=!s.entitled||!s.has_core;
  e('lyco-copy-extension').disabled=!s.entitled||!s.connected;
  e('lyco-connect').disabled=!s.entitled||s.connected||!s.has_core;
  e('lyco-disconnect').disabled=!s.connected;
  e('lyco-refresh').disabled=!s.logged_in;
  e('lyco-logout').disabled=!s.logged_in;
  if(busy)document.querySelectorAll('#view-lyco button').forEach(button=>button.disabled=true);
  return s;
 }
 async function run(fn,ok) {
  if(busy)return null;busy=true;
  try {await render();message('处理中…');const result=await fn();message(ok);return result}
  catch(ex){message(ex.message||'请求失败',true);return null}
  finally{busy=false;await render().catch(()=>{});}
 }
 e('lyco-login').addEventListener('submit',ev=>{
  ev.preventDefault();
  run(async()=>{const username=e('lyco-username').value.trim();const password=e('lyco-password').value;
   try{return await window.ops.lycoLogin({username,password})}finally{e('lyco-password').value=''}
  },'官网权益已核实');
 });
 e('lyco-refresh').onclick=()=>run(()=>window.ops.lycoRefresh(),'已刷新权益');
 e('lyco-copy-extension').onclick=()=>run(()=>window.ops.lycoCopyExtension(),'已复制连接码，请粘贴到 LYCO 订阅助手；不含账号密钥');
 e('lyco-logout').onclick=()=>run(()=>window.ops.lycoLogout(),'已退出且断开代理');
 e('lyco-pick-core').onclick=()=>run(()=>window.ops.lycoChooseCore(),'代理核心路径已核实');
 e('lyco-connect').onclick=()=>run(()=>window.ops.lycoConnect(),'代理已启动，可导入代理库');
 e('lyco-disconnect').onclick=()=>run(()=>window.ops.lycoDisconnect(),'代理已断开');
 e('lyco-create-profile').onclick=()=>run(async()=>{
  const result=await window.ops.lycoCreateProfile();
  window.adoptLycoProfile(result.profile);
  if(typeof switchView==='function')switchView('profiles');
  return result;
 },'专属环境已创建并绑定代理，点击启动即可使用');
 e('lyco-import').onclick=()=>run(async()=>{
  const s=await window.ops.lycoStatus();if(!s.connected||!Number.isInteger(s.port))throw Error('请先连接代理');
  const raw='http://127.0.0.1:'+s.port;
  const result=await window.ops.proxyCreate({name:'LYCO VPN ('+s.port+')',protocol:'http',host:'127.0.0.1',port:s.port,raw,remark:'LYCO Browser 内置代理 · 仅本地'});
  if(!result?.id)throw Error('保存到代理库失败');
  if(typeof refreshProxies==='function')refreshProxies();
  return result;
 },'已保存到代理库，请在环境编辑页选择该代理');
 e('lyco-go-proxies').onclick=()=>{if(typeof switchView==='function')switchView('proxies')};
 e('lyco-go-profiles').onclick=()=>{if(typeof switchView==='function')switchView('profiles')};
 e('lyco-buy').onclick=()=>run(()=>window.ops.lycoOpenShop(),'已在系统浏览器打开官方商城');
 e('lyco-account').onclick=()=>run(()=>window.ops.lycoOpenAccount(),'已打开官网个人中心');
 setInterval(()=>{if(!busy)render().catch(()=>{});},15000);
 render().catch(ex=>message(ex.message,true));
})();
