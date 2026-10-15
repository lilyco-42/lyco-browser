/**
 * Uses EXISTING LYCO Billing customer endpoints. No administrator credentials,
 * no local fake payment completion and no JWT persistent storage.
 */
export const API = 'https://lain42.top/studio/api';
export const SHOP = 'https://lain42.top/shop/#proxy_1m';
export const ACCOUNT = 'https://lain42.top/account/';
export interface Entitlement {
 product: string;
 status: string;
 expires_at?: string | null;
 meta?: {sub_url?: string};
}
export interface Account {
 username?: string;
 points?: {balance?: number};
 entitlements?: Entitlement[];
}
export type Login = {token: string};
async function request<T>(endpoint:string, body?:unknown, token?:string): Promise<T> {
 const res = await fetch(API+endpoint,{
  method: body ? 'POST':'GET',
  headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 if(!res.ok) throw Error(res.status===401?'密码错误或登录已过期':'服务器响应 HTTP '+res.status);
 return await res.json() as T;
}
export async function login(username:string,password:string):Promise<Login>{
 if(username.trim().length<3||password.length<8)throw Error('请输入完整用户名与密码');
 const r=await request<Login>('/login',{username:username.trim(),password});
 if(!r||typeof r.token!=='string'||r.token.length>4096)throw Error('未收到有效的登录会话');
 return {token:r.token};
}
export const account=(token:string):Promise<Account>=>request<Account>('/me',undefined,token);
export function proxyEntitlement(a:Account, now=Date.now()):Entitlement|null{
 return (a.entitlements||[]).find(e=>e.product==='proxy_1m'&&e.status==='active'&&
   (!e.expires_at||Date.parse(e.expires_at)>now))||null;
}
