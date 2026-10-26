import {randomUUID} from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY='lyco:browser-profile-metadata:v1';
export type BrowserSession={token:string;username:string};
export type BrowserProps={profile:Profile;onClose:()=>void;session?:BrowserSession};
export type Profile = {id:string;name:string;url:string;createdAt:number};
export function safeUrl(url:string):string {
 let value=url.trim();
 if(!/^[a-z][a-z0-9+.-]*:/i.test(value))value='https://'+value;
 const parsed=new URL(value);
 if(!['http:','https:'].includes(parsed.protocol))throw Error('仅允许 http/https 网页');
 if(!parsed.hostname||parsed.username||parsed.password)throw Error('非法网址');
 return parsed.toString();
}
export async function readProfiles():Promise<Profile[]>{
 const value=await AsyncStorage.getItem(KEY);
 if(!value)return [];
 const data:unknown=JSON.parse(value);
 if(!Array.isArray(data))return [];
 const rows:Profile[]=[];
 const seen=new Set<string>();
 let migrated=false;
 for(const x of data.slice(0,100)){
  if(!x||typeof x.id!=='string'||typeof x.name!=='string'||!x.name.trim()||x.name.length>90||typeof x.url!=='string'||!Number.isFinite(x.createdAt))continue;
  try{
   const url=safeUrl(x.url);
   const id=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x.id)?x.id:randomUUID();
   if(seen.has(id))continue;
   seen.add(id);migrated ||= id!==x.id;
   rows.push({id,name:x.name,url,createdAt:x.createdAt});
  }catch{ /* Invalid metadata is never passed to a native browser. */ }
 }
 if(migrated)await saveProfiles(rows);
 return rows;
}
export async function saveProfiles(rows:Profile[]):Promise<void>{
 await AsyncStorage.setItem(KEY,JSON.stringify(rows.slice(0,100)));
}
export function createProfile(name:string,url:string):Profile{
 if(!name.trim()||name.length>90)throw Error('请输入90字符以内的环境名称');
 const stamp=Date.now();
 return {id:randomUUID(),name:name.trim(),url:safeUrl(url),createdAt:stamp};
}
