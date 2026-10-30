/**
 * Uses EXISTING LYCO Billing customer endpoints. No administrator credentials,
 * no local fake payment completion and no JWT persistent storage.
 */
import {mobileNodes,type MobileNode} from './subscription.mjs';

export const API = 'https://lain42.top/studio/api';
export const SHOP = 'https://lain42.top/vpn/#plans';
export const ACCOUNT = 'https://lain42.top/account/';
export interface Entitlement {
 product: string;
 status: string;
 expires_at?: string | null;
 purchase_product?: string;
 meta?: {sub_url?: string;purchase_product?: string};
}
export interface Account {
 username?: string;
 points?: {balance?: number};
 entitlements?: Entitlement[];
}
export type Login = {token: string};
async function request<T>(endpoint:string, body?:unknown, token?:string, raw=false): Promise<T> {
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const res = await fetch(API+endpoint,{
   method: body ? 'POST':'GET',signal:controller.signal,redirect:'error',
   headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  if(!res.ok) throw Error(res.status===401||res.status===403?'密码错误或登录已过期':'服务器响应 HTTP '+res.status);
  if(Number(res.headers.get('content-length')||0)>2000000)throw Error('官网响应过大');
  const content=await res.text();if(content.length>2000000)throw Error('官网响应过大');
  return (raw?content:JSON.parse(content)) as T;
 }finally{clearTimeout(timer)}
}
export async function login(username:string,password:string):Promise<Login>{
 if(username.trim().length<3||username.trim().length>120||password.length<8||password.length>256)throw Error('请输入完整用户名与密码');
 const r=await request<Login>('/login',{username:username.trim(),password});
 if(!r||typeof r.token!=='string'||!r.token||r.token.length>4096)throw Error('未收到有效的登录会话');
 return {token:r.token};
}
export const account=(token:string):Promise<Account>=>request<Account>('/me',undefined,token);
export function proxyEntitlement(a:Account, now=Date.now()):Entitlement|null{
 return (Array.isArray(a?.entitlements)?a.entitlements:[]).find(e=>e.product==='proxy_1m'&&e.status==='active'&&
   (!e.expires_at||Date.parse(e.expires_at)>now))||null;
}
export function proxyPlanName(entitlement:Entitlement|null):string{
 const code=entitlement?.purchase_product||entitlement?.meta?.purchase_product||entitlement?.product;
 switch(code){
  case 'proxy_1m':return '代理月卡';
  case 'proxy_3m':return '代理季卡';
  case 'proxy_4m':return '代理120天套餐';
  case 'proxy_1y':return '代理年卡';
  default:return '代理订阅';
 }
}

export type MobileSubscription={owner:string;expiresAt:number|null;verifiedAt:number;nodes:MobileNode[];unavailable:number};
export async function mobileSubscription(token:string,owner:string):Promise<MobileSubscription>{
 const me=await account(token);
 const verifiedAt=Date.now();
 if(!owner||me.username!==owner)throw Error('登录账号已变化，请重新登录');
 const entitlement=proxyEntitlement(me,verifiedAt);
 if(!entitlement)throw Error('请先开通有效代理订阅');
 const match=/^https:\/\/lain42\.top\/panel\/api\/sub\/([A-Za-z0-9_-]{6,128})$/.exec(entitlement.meta?.sub_url||'');
 if(!match)throw Error('官网订阅地址无效');
 const source=await request<string>('/sub/'+encodeURIComponent(match[1])+'/clash',undefined,token,true);
 const routes=mobileNodes(source);
 return {owner,verifiedAt,expiresAt:entitlement.expires_at?Date.parse(entitlement.expires_at):null,...routes};
}
