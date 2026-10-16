const element=id=>document.getElementById(id);
let busy=false;
async function request(action,extra={}){
 const result=await chrome.runtime.sendMessage({action,...extra});
 if(!result?.ok)throw Error(result?.error||'扩展后台未响应，请重新打开');return result;
}
function render(state){
 element('state').textContent=state.active?'浏览器代理已启用':state.blocked?'代理已暂停':'尚未启用';
 element('message').textContent=state.message||'';element('endpoint').textContent=state.endpoint||'';
 element('indicator').classList.toggle('on',Boolean(state.active));
}
async function run(action,extra){
 if(busy)return;busy=true;document.querySelectorAll('button').forEach(button=>button.disabled=true);
 try{const state=await request(action,extra);if(!state.opened)render(state);if(action==='connect')element('connection').value=''}
 catch(error){element('message').textContent=error.message}
 finally{busy=false;document.querySelectorAll('button').forEach(button=>button.disabled=false)}
}
element('connect-form').addEventListener('submit',event=>{event.preventDefault();void run('connect',{code:element('connection').value})});
element('disconnect').onclick=()=>run('disconnect');
element('account').onclick=()=>run('open-account');element('shop').onclick=()=>run('open-shop');element('guide').onclick=()=>run('open-guide');
void run('status');
