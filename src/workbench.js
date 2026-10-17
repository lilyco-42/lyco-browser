'use strict';
(() => {
 const actions=window.lycoWorkbenchActions;
 if(!actions)throw Error('LYCO workbench actions are unavailable');
 const labels={
  'zh-CN':{groups:'分组',newGroup:'新建分组',more:'更多操作',details:'展开详细列',compact:'收起详细列',start:'启动环境',stop:'停止环境',edit:'编辑环境',clone:'复制环境'},
  en:{groups:'Groups',newGroup:'New group',more:'More actions',details:'Show details',compact:'Compact columns',start:'Start environment',stop:'Stop environment',edit:'Edit environment',clone:'Clone environment'},
 };
 const text=key=>(labels[window.OpenBrowserI18n?.getLocale()]||labels.en)[key];
 const table=document.getElementById('profile-table');
 const view=document.getElementById('view-profiles');
 const toolbar=view.querySelector('.toolbar-left');
 const extra=document.createElement('details');extra.className='lyco-list-extras';
 const summary=document.createElement('summary');summary.dataset.lycoLabel='more';summary.translate=false;
 extra.append(summary);
 for(const id of ['batch-import','renumber-profiles'])extra.append(document.getElementById(id));
 const detailToggle=document.createElement('button');detailToggle.type='button';detailToggle.id='lyco-profile-details';detailToggle.translate=false;
 detailToggle.setAttribute('aria-pressed','false');
 detailToggle.onclick=()=>{
  const detailed=view.classList.toggle('lyco-detailed-profiles');
  detailToggle.setAttribute('aria-pressed',String(detailed));
  detailToggle.textContent=text(detailed?'compact':'details');extra.open=false;
 };
 extra.append(detailToggle);toolbar.append(extra);
 document.getElementById('lyco-group-create').onclick=()=>actions.createGroup();
 const menu=document.createElement('div');menu.className='lyco-profile-menu';menu.id='lyco-profile-menu';
 menu.setAttribute('role','menu');menu.setAttribute('aria-label','Environment actions');menu.translate=false;menu.hidden=true;
 let selected=null,returnFocus=null;
 const close=restore=>{menu.hidden=true;selected=null;if(restore&&returnFocus?.isConnected)returnFocus.focus()};
 for(const action of ['start','stop','edit','clone']) {
  const button=document.createElement('button');button.type='button';button.dataset.lycoAction=action;
  button.setAttribute('role','menuitem');
  button.onclick=()=>{const id=selected;close(false);if(id)void actions[action](id)};
  menu.append(button);
 }
 document.body.append(menu);
 const rowFor=event=>{
  if(event.target.closest('button,a,input,select,textarea'))return null;
  const row=event.target.closest('tr[data-profile-id]');return row&&table.contains(row)?row:null;
 };
 function showMenu(row,x,y) {
  selected=row.dataset.profileId;returnFocus=row;
  menu.querySelector('[data-lyco-action="start"]').disabled=actions.running(selected);
  menu.querySelector('[data-lyco-action="stop"]').disabled=!actions.running(selected);
  menu.hidden=false;
  menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';
  menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
  menu.querySelector('button:not(:disabled)').focus();
 }
 table.addEventListener('dblclick',event=>{const row=rowFor(event);if(row)void actions.start(row.dataset.profileId)});
 table.addEventListener('contextmenu',event=>{const row=rowFor(event);if(!row)return;event.preventDefault();showMenu(row,event.clientX,event.clientY)});
 table.addEventListener('keydown',event=>{
  const row=rowFor(event);if(!row)return;
  if(event.key==='Enter'){event.preventDefault();void actions.start(row.dataset.profileId)}
  if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();const rect=row.getBoundingClientRect();showMenu(row,rect.left+24,rect.top+24)}
 });
 menu.addEventListener('keydown',event=>{
  const buttons=[...menu.querySelectorAll('button:not(:disabled)')];
  const index=buttons.indexOf(document.activeElement);
  if(event.key==='Escape'){event.preventDefault();close(true)}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
  }
  if(event.key==='Tab')close(false);
 });
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close(false)});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){close(true);extra.open=false}});
 window.addEventListener('resize',()=>close(false));
 document.addEventListener('scroll',()=>close(false),true);
 function translate(){
  document.querySelectorAll('[data-lyco-label]').forEach(node=>{node.textContent=text(node.dataset.lycoLabel)});
  menu.querySelectorAll('button').forEach(node=>{node.textContent=text(node.dataset.lycoAction)});
  detailToggle.textContent=text(view.classList.contains('lyco-detailed-profiles')?'compact':'details');
 }
 translate();window.OpenBrowserI18n?.onChange(translate);
})();
