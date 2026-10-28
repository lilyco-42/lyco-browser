'use strict';
(() => {
 let busy=false,routeOwner='',routeNodes=[],routeRowsKey='',routeRenderGeneration=0;
 const e = id => document.getElementById(id);
 const message = (value, err=false) => { e('lyco-feedback').textContent=String(value||'');e('lyco-feedback').dataset.tone=err?'error':'status'; };
 const option=(value,text)=>{const node=document.createElement('option');node.value=value;node.textContent=text;return node};
 function routeOptions(select,value='',savedLabel='已保存线路（请加载官网线路核对）'){
  select.replaceChildren(option('','默认订阅线路'),...routeNodes.map(node=>option(node.id,node.label)));
  if(value&&!routeNodes.some(node=>node.id===value))select.append(option(value,routeNodes.length?savedLabel+'（当前目录未找到）':savedLabel));
  select.value=value;
 }
 async function renderRoutes(s){
  const generation=++routeRenderGeneration;
  if(routeOwner!==s.username||!s.logged_in){routeOwner=s.logged_in?s.username:'';routeNodes=[];routeRowsKey='';routeOptions(e('lyco-create-route'))}
  e('lyco-load-routes').disabled=!s.entitled||!s.has_core||busy;
  e('lyco-create-route').disabled=!s.entitled||busy;
  const result=s.logged_in?await window.ops.lycoListProfileRoutes():{owner:'',profiles:[]};
  if(generation!==routeRenderGeneration)return;
  const rows=result.owner===s.username?result.profiles:[];
  const key=JSON.stringify([routeOwner,routeNodes,rows]);
  e('lyco-route-card').hidden=!rows.length;
  if(key!==routeRowsKey){
   routeRowsKey=key;e('lyco-profile-routes').replaceChildren();
   for(const row of rows){
    const item=document.createElement('div');item.className='lyco-route-row';item.dataset.profileRoute=row.id;
    const heading=document.createElement('strong');heading.textContent=row.name;
    const label=document.createElement('label');label.textContent='环境线路';
    const select=document.createElement('select');select.id='lyco-route-'+row.id;label.htmlFor=select.id;
    routeOptions(select,row.routeId,row.routeName);label.append(select);
    const apply=document.createElement('button');apply.type='button';apply.className='outline';apply.textContent='停止并更换线路';
    apply.onclick=()=>{const routeId=select.value;void run(()=>window.ops.lycoSetProfileRoute({id:row.id,routeId}),'线路已保存，下次启动时生效')};
    item.append(heading,label,apply);e('lyco-profile-routes').append(item);
   }
  }
  e('lyco-profile-routes').querySelectorAll('select,button').forEach(node=>node.disabled=busy||!s.entitled);
 }
 async function render(x) {
  const s=x||await window.ops.lycoStatus();
  document.querySelectorAll('#view-lyco button').forEach(button=>button.disabled=false);
  const plan=s.plan_name||'代理订阅';
  e('lyco-account-status').textContent=s.logged_in ? (s.username+' · '+(s.entitled?'有效'+plan:'暂无有效代理订阅')+(s.expires_at?' · 到期 '+new Date(s.expires_at).toLocaleString() : '')) : '尚未登录';
  e('lyco-network-status').textContent=s.connected?('已连接 · 本地 HTTP 127.0.0.1:'+s.port):('未连接 · '+(s.has_core?'网络组件已就绪':'请在高级设置中导入网络组件'));
  e('lyco-account-chip').textContent=s.logged_in?(s.entitled?plan+'可用':'待购买或续费'):'待登录';
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
  await renderRoutes(s);
  if(busy)document.querySelectorAll('#view-lyco button').forEach(button=>button.disabled=true);
  e('view-lyco').setAttribute('aria-busy',String(busy));
  return s;
 }
 async function run(fn,ok) {
  if(busy)return null;busy=true;e('view-lyco').setAttribute('aria-busy','true');
  try {await render();message('处理中…');const result=await fn();message(ok);return result}
  catch(ex){message(ex.message||'请求失败',true);return null}
  finally{busy=false;await render().catch(()=>{});e('view-lyco').setAttribute('aria-busy',String(busy));}
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
 e('lyco-load-routes').onclick=()=>run(async()=>{
  const selected=e('lyco-create-route').value,selectedLabel=e('lyco-create-route').selectedOptions[0]?.textContent||'原选线路';
  const result=await window.ops.lycoRouteCatalog(),state=await window.ops.lycoStatus();
  if(!state.logged_in||state.username!==result.owner)throw Error('账号已变化，请重新加载线路');
  routeOwner=result.owner;routeNodes=result.nodes;routeRowsKey='';routeOptions(e('lyco-create-route'),selected,selectedLabel);
 },'官网线路已加载，可为新环境选择固定节点');
 e('lyco-create-profile').onclick=()=>run(async()=>{
  const result=await window.ops.lycoCreateProfile({routeId:e('lyco-create-route').value});
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
 e('lyco-buy').onclick=()=>run(()=>window.ops.lycoOpenShop(),'已在系统浏览器打开官方套餐页');
 e('lyco-account').onclick=()=>run(()=>window.ops.lycoOpenAccount(),'已打开官网个人中心');
 setInterval(()=>{if(!busy)render().catch(()=>{});},15000);
 render().catch(ex=>message(ex.message,true));
})();
