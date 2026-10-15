'use strict';
(() => {
 const e = id => document.getElementById(id);
 const message = (value, err=false) => { e('lyco-feedback').textContent=String(value||'');e('lyco-feedback').style.color=err?'#f66':'inherit'; };
 async function render(x) {
  const s=x||await window.ops.lycoStatus();
  e('lyco-account-status').textContent=s.logged_in ? (s.username+' · '+(s.entitled?'有效代理月卡':'暂无有效月卡')+(s.expires_at?' · 到期 '+new Date(s.expires_at).toLocaleString() : '')) : '尚未登录';
  e('lyco-network-status').textContent=s.connected?('已连接 · 本地 HTTP 127.0.0.1:'+s.port):('未连接 · '+(s.has_core?'Mihomo 已配置':'尚未导入 Mihomo'));
  e('lyco-import').disabled=!s.connected;
  e('lyco-connect').disabled=!s.entitled||s.connected||!s.has_core;
  e('lyco-disconnect').disabled=!s.connected;
  e('lyco-refresh').disabled=!s.logged_in;
  e('lyco-logout').disabled=!s.logged_in;
  return s;
 }
 async function run(fn,ok) {
  try {message('处理中…');const result=await fn();await render();message(ok);return result}
  catch(ex){message(ex.message||'请求失败',true);return null}
 }
 e('lyco-login').addEventListener('submit',ev=>{
  ev.preventDefault();
  run(async()=>{const username=e('lyco-username').value.trim();const password=e('lyco-password').value;
   try{return await window.ops.lycoLogin({username,password})}finally{e('lyco-password').value=''}
  },'官网权益已核实');
 });
 e('lyco-refresh').onclick=()=>run(()=>window.ops.lycoRefresh(),'已刷新权益');
 e('lyco-logout').onclick=()=>run(()=>window.ops.lycoLogout(),'已退出且断开代理');
 e('lyco-pick-core').onclick=()=>run(()=>window.ops.lycoChooseCore(),'代理核心路径已核实');
 e('lyco-connect').onclick=()=>run(()=>window.ops.lycoConnect(),'代理已启动，可导入代理库');
 e('lyco-disconnect').onclick=()=>run(()=>window.ops.lycoDisconnect(),'代理已断开');
 e('lyco-import').onclick=()=>run(async()=>{
  const s=await window.ops.lycoStatus();if(!s.connected||!Number.isInteger(s.port))throw Error('请先连接代理');
  const raw='http://127.0.0.1:'+s.port;
  const result=await window.ops.proxyCreate({name:'LYCO VPN ('+s.port+')',protocol:'http',host:'127.0.0.1',port:s.port,raw,remark:'LYCO Browser 内置代理 · 仅本地'});
  if(!result?.id)throw Error('保存到代理库失败');
  if(typeof refreshProxies==='function')refreshProxies();
  return result;
 },'已保存到代理库，请在环境编辑页选择该代理');
 e('lyco-go-proxies').onclick=()=>{if(typeof switchView==='function')switchView('proxies')};
 e('lyco-buy').onclick=()=>run(()=>window.ops.lycoOpenShop(),'已在系统浏览器打开官方商城');
 e('lyco-account').onclick=()=>run(()=>window.ops.lycoOpenAccount(),'已打开官网个人中心');
 render().catch(ex=>message(ex.message,true));
})();