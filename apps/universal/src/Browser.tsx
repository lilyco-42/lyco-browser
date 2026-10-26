import React from 'react';
import {View,Text,Button,Linking} from 'react-native';
import type {BrowserProps} from './profiles';
export default function Browser({profile,onClose}:BrowserProps){
 return <View><Text>此平台通过系统浏览器打开网页，不能保证环境指纹隔离。</Text>
 <Button title="在系统浏览器打开" onPress={()=>Linking.openURL(profile.url)}/>
 <Button title="返回" onPress={onClose}/></View>;
}
