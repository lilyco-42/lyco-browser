import {randomUUID} from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {PROFILE_STORAGE_KEY,decodeProfileMetadata,encodeProfileMetadata,safeUrl,type Profile,type RouteBinding} from './profile-metadata.mjs';
export {safeUrl,type Profile,type RouteBinding} from './profile-metadata.mjs';
export type BrowserSession={token:string;username:string};
export type BrowserProps={profile:Profile;onClose:()=>void;session?:BrowserSession;onBindRoute:(binding:RouteBinding)=>Promise<Profile>};
export async function readProfiles():Promise<Profile[]>{
 const {profiles,migrated}=decodeProfileMetadata(await AsyncStorage.getItem(PROFILE_STORAGE_KEY),randomUUID);
 if(migrated)await saveProfiles(profiles);
 return profiles;
}
export async function saveProfiles(rows:Profile[]):Promise<void>{
 await AsyncStorage.setItem(PROFILE_STORAGE_KEY,encodeProfileMetadata(rows));
}
export function createProfile(name:string,url:string):Profile{
 if(!name.trim()||name.length>90)throw Error('请输入90字符以内的环境名称');
 const stamp=Date.now();
 return {id:randomUUID(),name:name.trim(),url:safeUrl(url),createdAt:stamp};
}
