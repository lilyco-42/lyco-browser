import React from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import WebView from 'react-native-webview';
import type {Profile} from './profiles';
export default function Browser({profile,onClose}:{profile:Profile,onClose:()=>void}){
 return <View style={s.shell}>
  <View style={s.header}><Text style={s.title}>{profile.name}</Text>
   <Pressable onPress={onClose}><Text style={s.close}>关闭</Text></Pressable></View>
  <Text style={s.warning}>移动端临时 WebView，不是独立浏览器内核；VPN 未连接前不承诺专属代理或指纹隔离。</Text>
  <WebView key={profile.id} source={{uri:profile.url}} incognito sharedCookiesEnabled={false}
    thirdPartyCookiesEnabled={false} javaScriptEnabled
    setSupportMultipleWindows={false} style={{flex:1}}/>
 </View>;
}
const s=StyleSheet.create({shell:{flex:1,backgroundColor:'#111622'},header:{height:55,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16},title:{color:'#fff',fontSize:17,fontWeight:'700'},close:{color:'#98c8ff'},warning:{padding:9,fontSize:12,color:'#f3c974',backgroundColor:'#252334'}});
