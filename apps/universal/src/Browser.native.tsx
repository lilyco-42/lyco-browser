import React,{useEffect,useRef,useState} from 'react';
import {Keyboard,ScrollView,Text,Pressable,TextInput,StyleSheet} from 'react-native';
import {openMobileProfile,openPaidMobileProfile,closeMobileProfiles} from './mobile-browser';
import {mobileSubscription,type MobileSubscription} from './billing';
import type {BrowserProps} from './profiles';
export default function Browser({profile,onClose,session}:BrowserProps){
 const [proxy,setProxy]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [subscription,setSubscription]=useState<MobileSubscription|null>(null);
 const [selected,setSelected]=useState(''),[manual,setManual]=useState(!session);
 const opening=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;void closeMobileProfiles().catch(()=>{})}},[]);
 async function run(action:()=>Promise<void>){
  if(opening.current)return;
  opening.current=true;setBusy(true);setMessage('正在处理…');
  try{await action()}
  catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:'无法打开环境')}
  finally{opening.current=false;if(mounted.current)setBusy(false)}
 }
 function loadRoutes(){return run(async()=>{
  if(!session)throw Error('请返回会员页登录网站账号');
  setSubscription(null);setSelected('');
  const next=await mobileSubscription(session.token,session.username);
  if(!mounted.current)return;
  setSubscription(next);setSelected(next.nodes[0].name);setMessage('官网权益与线路已核实');
 })}
 function launchPaid(){return run(async()=>{
  if(!session||!selected)throw Error('请先登录并加载官网线路');
  const fresh=await mobileSubscription(session.token,session.username);
  if(!mounted.current)return;
  const node=fresh.nodes.find(x=>x.name===selected);
  if(!node)throw Error('所选线路已变化，请重新加载线路');
  await openPaidMobileProfile(profile,fresh,node,session);
  if(mounted.current)setMessage('已提交官网线路启动，实际网络状态见浏览窗口');
 })}
 function launchManual(){return run(async()=>{
  await openMobileProfile(profile,proxy);if(mounted.current)setMessage('已提交环境启动，实际网络状态见浏览窗口');
 })}
 return <ScrollView contentContainerStyle={s.shell} keyboardShouldPersistTaps="handled">
  <Text style={s.title}>{profile.name}</Text>
  <Text style={s.copy}>该环境有自己的持久网站数据。关闭当前环境后可打开另一个。</Text>
  {session&&<>
   <Text style={s.title}>官网月卡线路</Text>
   <Pressable accessibilityRole="button" disabled={busy} onPress={loadRoutes} style={s.button}><Text>加载 / 刷新官网线路</Text></Pressable>
   {subscription?.nodes.map(node=><Pressable key={node.name} accessibilityRole="radio" accessibilityLabel={'选择线路 '+node.name}
    accessibilityState={{checked:selected===node.name,disabled:busy}} disabled={busy} onPress={()=>setSelected(node.name)} style={[s.route,selected===node.name&&s.selected]}>
    <Text style={s.copy}>{selected===node.name?'●':'○'} {node.name}</Text></Pressable>)}
   {!!subscription?.unavailable&&<Text style={s.copy}>另有 {subscription.unavailable} 条线路暂不支持当前移动内核。</Text>}
   <Pressable accessibilityRole="button" disabled={busy||!selected} onPress={launchPaid} style={[s.button,(busy||!selected)&&s.disabled]}><Text>通过官网线路打开环境</Text></Pressable>
   <Pressable accessibilityRole="button" onPress={()=>setManual(value=>!value)}><Text style={s.copy}>{manual?'收起自备代理':'使用自备 HTTP(S) 代理'}</Text></Pressable>
  </>}
  {manual&&<>
   <Text style={s.copy}>输入可从此设备访问的无账号密码 HTTP(S) 代理。地址只用于本次启动，订阅链接请通过官网账号加载。</Text>
   <TextInput testID="mobile-proxy" accessibilityLabel="HTTP(S) 代理地址" style={s.input} value={proxy} onChangeText={setProxy}
    autoCapitalize="none" autoCorrect={false} returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={()=>Keyboard.dismiss()} placeholder="https://proxy.example.com:8443" placeholderTextColor="#8995aa"/>
   <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={launchManual} style={[s.button,busy&&s.disabled]}>
    <Text>{busy?'正在打开…':'通过代理打开独立环境'}</Text></Pressable>
  </>}
  <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={s.button}><Text>返回环境列表</Text></Pressable>
  {!!message&&<Text accessibilityRole="alert" style={s.copy}>{message}</Text>}
  <Text style={s.copy}>代理设置失败时不会改用系统浏览器。该功能保护环境网站数据与浏览代理，不代表全设备 VPN 或指纹伪装。</Text>
 </ScrollView>;
}
const s=StyleSheet.create({shell:{flexGrow:1,padding:24,gap:18,backgroundColor:'#111622'},title:{color:'#fff',fontSize:22,fontWeight:'700'},copy:{fontSize:14,lineHeight:22,color:'#b8c7dc'},input:{borderWidth:1,borderColor:'#68758b',borderRadius:8,color:'#fff',padding:14},button:{backgroundColor:'#c6d8f5',padding:16,borderRadius:8,alignItems:'center'},route:{padding:12,borderWidth:1,borderColor:'#68758b',borderRadius:8},selected:{borderColor:'#c6d8f5',backgroundColor:'#293547'},disabled:{opacity:.4}});
