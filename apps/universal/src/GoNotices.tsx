import React,{useState} from 'react';
import {FlatList,Keyboard,Modal,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import bundled from './go-notices.json';

type NoticeFile={name:string;text:string;sha256:string};
type PackageNotice={id:string;name:string;version:string;files:NoticeFile[]};
const notices=bundled as {generated:boolean;packages:PackageNotice[]};
const totalFiles=notices.packages.reduce((total,row)=>total+row.files.length,0);

export default function GoNotices(){
 const [visible,setVisible]=useState(false);
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState<string|null>(null);
 const search=query.trim().toLowerCase();
 const rows=notices.packages.filter(row=>(row.name+' '+row.version).toLowerCase().includes(search));
 function close(){Keyboard.dismiss();setVisible(false);setQuery('');setSelected(null)}
 function clear(){Keyboard.dismiss();setQuery('');setSelected(null)}
 return <>
  <Pressable accessibilityRole="button" onPress={()=>setVisible(true)} style={styles.button}>
   <Text style={styles.text}>网络依赖原始声明</Text>
  </Pressable>
  {visible?<Modal visible onRequestClose={close} animationType="slide">
   <SafeAreaView style={styles.root}>
    <View style={styles.header}>
     <Text accessibilityRole="header" style={styles.title}>网络依赖声明</Text>
     <Pressable accessibilityRole="button" onPress={close} style={styles.button}><Text style={styles.text}>关闭网络依赖声明</Text></Pressable>
    </View>
    <Text style={styles.hint}>{notices.generated?'Android 网络核心的 Go 依赖原文，包含许可证、版权及作者声明。网络核心完整许可保留在上一级。':'此开发构建尚未生成网络依赖声明。'}</Text>
    <Text testID="go-notice-count" style={styles.hint}>{rows.length} / {notices.packages.length} 个依赖 · {totalFiles} 份原始声明</Text>
    <TextInput testID="go-notice-search" accessibilityLabel="搜索网络依赖名称或版本" placeholder="搜索名称或版本" placeholderTextColor="#a6b3ce"
     value={query} onChangeText={value=>{setQuery(value);setSelected(null)}} autoCorrect={false} autoCapitalize="none"
     returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={()=>Keyboard.dismiss()} style={styles.input}/>
    <Pressable accessibilityRole="button" accessibilityState={{disabled:!query}} disabled={!query} onPress={clear} style={[styles.button,!query&&styles.disabled]}>
     <Text style={styles.text}>清除网络依赖搜索</Text>
    </Pressable>
    <FlatList data={rows} keyExtractor={row=>row.id} extraData={selected} keyboardShouldPersistTaps="handled"
     ListEmptyComponent={<Text style={styles.hint}>没有匹配的网络依赖。</Text>}
     renderItem={({item})=><View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityState={{expanded:selected===item.id}} onPress={()=>setSelected(value=>value===item.id?null:item.id)}>
       <Text style={styles.text}>{item.name} · {item.version}</Text>
       <Text style={styles.hint}>{item.files.length} 份原始声明</Text>
      </Pressable>
      {selected===item.id?item.files.map(file=><View key={file.name} style={styles.notice}>
       <Text style={styles.hint}>{file.name}</Text><Text selectable style={styles.text}>{file.text}</Text>
      </View>):null}
     </View>}/>
   </SafeAreaView>
  </Modal>:null}
 </>;
}

const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:'#10141e',padding:18},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
 title:{color:'#f1f5fe',fontSize:22,fontWeight:'700',flexShrink:1},text:{color:'#f1f5fe',fontSize:14,lineHeight:22},
 hint:{color:'#a6b3ce',fontSize:13,lineHeight:20,marginVertical:6},button:{padding:13,borderWidth:1,borderColor:'#30394e',borderRadius:10},
 disabled:{opacity:0.5},input:{color:'#f1f5fe',padding:12,borderWidth:1,borderColor:'#30394e',borderRadius:10,marginVertical:12},
 row:{paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#30394e'},notice:{paddingTop:12},
});
