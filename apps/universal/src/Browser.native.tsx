import React,{useEffect,useRef,useState} from 'react';
import {Keyboard,KeyboardAvoidingView,Platform,ScrollView,Text,Pressable,TextInput,StyleSheet} from 'react-native';
import {openMobileProfile,openPaidMobileProfile,closeMobileProfiles} from './mobile-browser';
import {mobileSubscription} from './billing';
import {identifyMobileSubscription} from './mobile-route-selection';
import {assertProfileAccess,bindingForNode,restoredRouteSelection,selectedMobileNode,type IdentifiedMobileSubscription} from './mobile-route-policy.mjs';
import type {BrowserProps,BrowserSession} from './profiles';
export default function Browser({profile,onClose,session,onBindRoute}:BrowserProps){
 const [proxy,setProxy]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [subscription,setSubscription]=useState<IdentifiedMobileSubscription|null>(null);
 const [selected,setSelected]=useState(profile.route?.routeId||''),[manual,setManual]=useState(!session&&!profile.route);
 const opening=useRef(false),mounted=useRef(true),latestSession=useRef(session);
 latestSession.current=session;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;void closeMobileProfiles().catch(()=>{})}},[]);
 useEffect(()=>{setSubscription(null);setMessage('')},[session?.token,session?.username]);
 useEffect(()=>{setSelected(profile.route?.routeId||'')},[profile.id,profile.route?.routeId]);
 function current(snapshot:BrowserSession|undefined=session){
  return mounted.current&&latestSession.current?.token===snapshot?.token&&latestSession.current?.username===snapshot?.username;
 }
 let accessError='';try{assertProfileAccess(profile,session?.username)}catch(error){accessError=(error as Error).message}
 async function run(action:()=>Promise<void>){
  if(opening.current)return;
  Keyboard.dismiss();opening.current=true;setBusy(true);setMessage('正在处理…');
  try{await action()}
  catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:'无法打开环境')}
  finally{opening.current=false;if(mounted.current)setBusy(false)}
 }
 function loadRoutes(){return run(async()=>{
  if(!session)throw Error('请返回会员页登录网站账号');
  assertProfileAccess(profile,session.username);
  const snapshot=session;
  const next=await identifyMobileSubscription(await mobileSubscription(snapshot.token,snapshot.username));
  if(!current(snapshot))return;
  const choice=restoredRouteSelection(profile,selected);
  setSubscription(next);setSelected(choice);
  setMessage(choice&&!next.nodes.some(row=>row.id===choice)?'已选线路不在当前目录，请重新选择；不会自动换线':'官网权益与线路已核实，请确认所选线路');
 })}
 async function resolveBinding(){
  if(!session||!selected)throw Error('请先登录并选择官网线路');
  assertProfileAccess(profile,session.username);
  const snapshot=session;
  const fresh=await identifyMobileSubscription(await mobileSubscription(snapshot.token,snapshot.username));
  if(!current(snapshot))throw Error('环境操作已取消');
  const node=selectedMobileNode(fresh,selected);
  const bound=await onBindRoute(bindingForNode(snapshot.username,node));
  if(!current(snapshot))throw Error('环境操作已取消');
  setSubscription(fresh);
  return {bound,fresh,node,snapshot};
 }
 function saveRoute(){return run(async()=>{
  const {node}=await resolveBinding();if(mounted.current)setMessage('已保存环境线路：'+node.name);
 })}
 function launchPaid(){return run(async()=>{
  const {bound,fresh,node,snapshot}=await resolveBinding();
  await openPaidMobileProfile(bound,fresh,node,snapshot,()=>current(snapshot));
  if(current(snapshot))setMessage('已提交官网线路启动，实际网络状态见浏览窗口');
 })}
 function launchManual(){return run(async()=>{
  await openMobileProfile(profile,proxy,()=>current());if(mounted.current)setMessage('已提交环境启动，实际网络状态见浏览窗口');
 })}
 const available=Boolean(subscription?.nodes.some(row=>row.id===selected));
 return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
 <ScrollView contentContainerStyle={s.shell} keyboardShouldPersistTaps="handled">
  <Text style={s.title}>{profile.name}</Text>
  <Text style={s.copy}>该环境有自己的持久网站数据。关闭当前环境后可打开另一个。</Text>
  {profile.route&&<Text style={s.copy} accessibilityLabel={'已保存线路 '+profile.route.routeName}>已保存线路：{profile.route.routeName}</Text>}
  {!!accessError&&<Text accessibilityRole="alert" style={s.copy}>{accessError}</Text>}
  {session&&!accessError&&<>
   <Text style={s.title}>官网订阅线路</Text>
   <Pressable accessibilityRole="button" disabled={busy} onPress={loadRoutes} style={s.button}><Text>加载 / 刷新官网线路</Text></Pressable>
   {subscription?.nodes.map(node=><Pressable key={node.id} accessibilityRole="radio" accessibilityLabel={'选择线路 '+node.name}
    accessibilityState={{checked:selected===node.id,disabled:busy}} disabled={busy} onPress={()=>setSelected(node.id)} style={[s.route,selected===node.id&&s.selected]}>
    <Text style={s.copy}>{selected===node.id?'●':'○'} {node.name}</Text></Pressable>)}
   {!!subscription?.unavailable&&<Text style={s.copy}>另有 {subscription.unavailable} 条线路暂不支持当前移动内核。</Text>}
   <Text style={s.copy}>保存或打开都会记住所选线路。更换线路先关闭当前浏览环境；原有网站数据保留。已保存线路不可用时不会改选其他线路。</Text>
   <Pressable accessibilityRole="button" disabled={busy||!available} onPress={saveRoute} style={[s.button,(busy||!available)&&s.disabled]}><Text>保存所选线路</Text></Pressable>
   <Pressable accessibilityRole="button" disabled={busy||!available} onPress={launchPaid} style={[s.button,(busy||!available)&&s.disabled]}><Text>通过官网线路打开环境</Text></Pressable>
   {!profile.route&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>setManual(value=>!value)}><Text style={s.copy}>{manual?'收起自备代理':'使用自备 HTTP(S) 代理'}</Text></Pressable>}
  </>}
  {profile.route&&!session&&<Text style={s.copy}>请返回会员页登录所属网站账号，再加载此环境的官网线路。</Text>}
  {manual&&!profile.route&&!accessError&&<>
   <Text style={s.copy}>输入可从此设备访问的无账号密码 HTTP(S) 代理。地址只用于本次启动，订阅链接请通过官网账号加载。</Text>
   <TextInput testID="mobile-proxy" accessibilityLabel="HTTP(S) 代理地址" style={s.input} defaultValue="" onChangeText={setProxy} editable={!busy}
    autoCapitalize="none" autoCorrect={false} returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={()=>Keyboard.dismiss()} placeholder="https://proxy.example.com:8443" placeholderTextColor="#8995aa"/>
   <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={launchManual} style={[s.button,busy&&s.disabled]}>
    <Text>{busy?'正在打开…':'通过代理打开独立环境'}</Text></Pressable>
  </>}
  <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={s.button}><Text>返回环境列表</Text></Pressable>
  {!!message&&<Text accessibilityRole="alert" style={s.copy}>{message}</Text>}
  <Text style={s.copy}>代理设置失败时不会改用系统浏览器。该功能保护环境网站数据与浏览代理，不代表全设备 VPN 或指纹伪装。</Text>
 </ScrollView></KeyboardAvoidingView>;
}
const s=StyleSheet.create({shell:{flexGrow:1,padding:24,gap:18,backgroundColor:'#111622'},title:{color:'#fff',fontSize:22,fontWeight:'700'},copy:{fontSize:14,lineHeight:22,color:'#b8c7dc'},input:{borderWidth:1,borderColor:'#68758b',borderRadius:8,color:'#fff',padding:14},button:{backgroundColor:'#c6d8f5',padding:16,borderRadius:8,alignItems:'center'},route:{padding:12,borderWidth:1,borderColor:'#68758b',borderRadius:8},selected:{borderColor:'#c6d8f5',backgroundColor:'#293547'},disabled:{opacity:.4}});
