import React,{useRef,useState} from 'react';
import {View,Text,Pressable,TextInput,StyleSheet} from 'react-native';
import {openMobileProfile} from './mobile-browser';
import type {Profile} from './profiles';
export default function Browser({profile,onClose}:{profile:Profile;onClose:()=>void}){
 const [proxy,setProxy]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const opening=useRef(false);
 async function launch(){
  if(opening.current)return;
  opening.current=true;setBusy(true);setMessage('正在打开原生环境…');
  try{await openMobileProfile(profile,proxy);setMessage('已提交环境启动，实际网络状态见浏览窗口')}
  catch(error){setMessage(error instanceof Error?error.message:'无法打开环境')}
  finally{opening.current=false;setBusy(false)}
 }
 return <View style={s.shell}>
  <Text style={s.title}>{profile.name}</Text>
  <Text style={s.copy}>该环境有自己的持久网站数据。输入可从此设备访问的 HTTP(S) 代理；地址仅用于本次启动。</Text>
  <Text style={s.copy}>当前仅支持无账号密码的 HTTP(S) 代理，官网订阅的其他协议尚未接入移动端。</Text>
  <TextInput accessibilityLabel="HTTP(S) 代理地址" style={s.input} value={proxy} onChangeText={setProxy}
   autoCapitalize="none" autoCorrect={false} placeholder="https://proxy.example.com:8443" placeholderTextColor="#8995aa"/>
  <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={launch} style={s.button}>
   <Text>{busy?'正在打开…':'通过代理打开独立环境'}</Text></Pressable>
  <Pressable accessibilityRole="button" onPress={onClose} style={s.button}><Text>返回环境列表</Text></Pressable>
  {!!message&&<Text accessibilityRole="alert" style={s.copy}>{message}</Text>}
  <Text style={s.copy}>关闭当前环境后可打开另一个。代理配置失败时不会改用系统浏览器。该功能仍需原生网络与隔离验收，不代表全设备 VPN 或指纹伪装。</Text>
 </View>;
}
const s=StyleSheet.create({shell:{flex:1,padding:24,gap:18,backgroundColor:'#111622'},title:{color:'#fff',fontSize:22,fontWeight:'700'},copy:{fontSize:14,lineHeight:22,color:'#b8c7dc'},input:{borderWidth:1,borderColor:'#68758b',borderRadius:8,color:'#fff',padding:14},button:{backgroundColor:'#c6d8f5',padding:16,borderRadius:8,alignItems:'center'}});
