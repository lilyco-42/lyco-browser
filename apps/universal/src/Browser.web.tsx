import React from 'react';
import {View,Text,Button,Linking} from 'react-native';
import type {Profile} from './profiles';
export default function Browser({profile,onClose}:{profile:Profile,onClose:()=>void}){
 return <View><Text>Web 版使用系统浏览器打开环境页面，指纹与 Cookie 隔离需要原生桌面端。</Text>
 <Button title="打开网页" onPress={()=>Linking.openURL(profile.url)}/>
 <Button title="返回环境列表" onPress={onClose}/></View>;
}
