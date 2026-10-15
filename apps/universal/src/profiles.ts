import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY='lyco:browser-profile-metadata:v1';
export type Profile = {id:string;name:string;url:string;createdAt:number};
export function safeUrl(url:string):string {
 let value=url.trim();
 if(!/^https?:\/\//i.test(value))value='https://'+value;
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
 return data.filter((x):x is Profile=>Boolean(x&&typeof x.id==='string'&&typeof x.name==='string'&&typeof x.url==='string'&&typeof x.createdAt==='number')).slice(0,100);
}
export async function saveProfiles(rows:Profile[]):Promise<void>{
 await AsyncStorage.setItem(KEY,JSON.stringify(rows.slice(0,100)));
}
export function createProfile(name:string,url:string):Profile{
 if(!name.trim()||name.length>90)throw Error('请输入90字符以内的环境名称');
 const stamp=Date.now();
 // Not used for security decisions; profile IDs are local UI metadata only.
 return {id:stamp.toString(36)+'-'+Math.random().toString(36).slice(2,12),name:name.trim(),url:safeUrl(url),createdAt:stamp};
}
