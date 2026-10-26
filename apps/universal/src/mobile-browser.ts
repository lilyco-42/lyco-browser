import {requireOptionalNativeModule} from 'expo';
import {parseProxyEndpoint} from './proxy-endpoint.mjs';
import type {Profile} from './profiles';

type NativeBrowser = {open(options:Record<string,string>):Promise<void>};
export async function openMobileProfile(profile:Profile, proxyURL:string):Promise<void> {
 const route=parseProxyEndpoint(proxyURL);
 const native=requireOptionalNativeModule<NativeBrowser>('LycoMobileBrowser');
 if(!native)throw Error('当前安装包未包含原生独立环境，请安装最新原生预览版');
 await native.open({id:profile.id,name:profile.name,url:profile.url,
  scheme:route.scheme,host:route.host,port:String(route.port)});
}
