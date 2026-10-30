// One version-framed value keeps route bindings and profile IDs together.
// An older reader's JSON.parse rejects v2, so it cannot silently discard a
// binding or overwrite this device's environment list during a downgrade.
export const PROFILE_STORAGE_KEY='lyco:browser-profile-metadata:v1';
const HEADER='LYCO_PROFILE_METADATA:2\n';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[a-f0-9]{64}$/;
export function safeUrl(url){
 if(typeof url!=='string')throw Error('非法网址');
 let value=url.trim();if(!/^[a-z][a-z0-9+.-]*:/i.test(value))value='https://'+value;
 const parsed=new URL(value);
 if(!['http:','https:'].includes(parsed.protocol))throw Error('仅允许 http/https 网页');
 if(!parsed.hostname||parsed.username||parsed.password)throw Error('非法网址');
 return parsed.toString();
}
export function routeBinding(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['owner','routeId','routeName'].includes(key))||
  typeof value.owner!=='string'||!value.owner.trim()||value.owner.length>120||/[\u0000-\u001f\u007f]/.test(value.owner)||
  typeof value.routeId!=='string'||!ID.test(value.routeId)||typeof value.routeName!=='string'||!value.routeName.trim()||
  value.routeName.length>120||/[\u0000-\u001f\u007f]/.test(value.routeName))throw Error('环境线路绑定记录无效，原有数据已保留');
 return {owner:value.owner,routeId:value.routeId,routeName:value.routeName};
}
function profileRow(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.id!=='string'||!UUID.test(value.id)||
  typeof value.name!=='string'||!value.name.trim()||value.name.length>90||!Number.isFinite(value.createdAt))throw Error('环境记录无效，原有数据已保留');
 return {id:value.id.toLowerCase(),name:value.name,url:safeUrl(value.url),createdAt:value.createdAt,
  ...(value.route!==undefined?{route:routeBinding(value.route)}:{})};
}
export function decodeProfileMetadata(raw,makeId){
 if(raw===null||raw==='')return {profiles:[],migrated:false};
 if(typeof raw!=='string'||raw.length>2000000)throw Error('环境记录无法读取，原有数据已保留');
 if(raw.startsWith(HEADER)){
  const payload=JSON.parse(raw.slice(HEADER.length));
  if(payload?.version!==2||!Array.isArray(payload.profiles)||payload.profiles.length>100)throw Error('环境记录版本无效，原有数据已保留');
  const profiles=payload.profiles.map(profileRow),ids=new Set(profiles.map(row=>row.id));
  if(ids.size!==profiles.length)throw Error('环境标识重复，原有数据已保留');
  return {profiles,migrated:false};
 }
 const data=JSON.parse(raw);
 if(!Array.isArray(data))throw Error('环境记录版本暂不支持，原有数据已保留');
 if(data.some(row=>row&&typeof row==='object'&&Object.hasOwn(row,'route')))throw Error('旧版记录包含线路绑定，拒绝降级读取');
 const profiles=[],seen=new Set();let migrated=false;
 for(const value of data.slice(0,100)){
  if(!value||typeof value.id!=='string'||typeof value.name!=='string'||!value.name.trim()||value.name.length>90||typeof value.url!=='string'||!Number.isFinite(value.createdAt))continue;
  let url;try{url=safeUrl(value.url)}catch{continue}
  const id=UUID.test(value.id)?value.id.toLowerCase():makeId();
  if(!UUID.test(id))throw Error('无法迁移环境标识');
  if(seen.has(id))continue;
  seen.add(id);migrated ||= id!==value.id;
  profiles.push({id,name:value.name,url,createdAt:value.createdAt});
 }
 return {profiles,migrated};
}
export function encodeProfileMetadata(rows){
 if(!Array.isArray(rows)||rows.length>100)throw Error('每台设备最多保存100个环境');
 const profiles=rows.map(profileRow);
 if(new Set(profiles.map(row=>row.id)).size!==profiles.length)throw Error('环境标识重复，无法保存');
 return HEADER+JSON.stringify({version:2,profiles});
}
