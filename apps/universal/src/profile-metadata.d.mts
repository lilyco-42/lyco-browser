export type RouteBinding={owner:string;routeId:string;routeName:string};
export type Profile={id:string;name:string;url:string;createdAt:number;route?:RouteBinding};
export const PROFILE_STORAGE_KEY:string;
export function safeUrl(url:string):string;
export function routeBinding(value:unknown):RouteBinding;
export function decodeProfileMetadata(raw:string|null,makeId:()=>string):{profiles:Profile[];migrated:boolean};
export function encodeProfileMetadata(rows:Profile[]):string;
