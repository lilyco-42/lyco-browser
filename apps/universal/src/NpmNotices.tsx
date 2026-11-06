import React,{useMemo,useState} from 'react';
import {FlatList,Modal,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import bundled from './npm-notices.json';

type PackageNotice={id:string;name:string;version:string;license:string;files:{name:string;text:string;sha256:string}[]};
const notices=bundled as {generated:boolean;packages:PackageNotice[]};
export default function NpmNotices(){
 const [visible,setVisible]=useState(false),[query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const rows=useMemo(()=>notices.packages.filter(row=>row.name.toLowerCase().includes(query.trim().toLowerCase())),[query]);
 const close=()=>{setVisible(false);setQuery('');setSelected(null)};
 return <>
  <Pressable accessibilityRole="button" onPress={()=>setVisible(true)} style={styles.button}><Text style={styles.text}>JavaScript 依赖开源许可</Text></Pressable>
  <Modal visible={visible} onRequestClose={close} animationType="slide">
   <SafeAreaView style={styles.root}>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>依赖开源许可</Text>
     <Pressable accessibilityRole="button" onPress={close} style={styles.button}><Text style={styles.text}>关闭许可页</Text></Pressable></View>
    <Text style={styles.hint}>{notices.generated?'以下为此构建安装的 JavaScript 依赖及原始版权文本，包含构建工具。网络核心许可请在关于页面查看。':'此开发构建尚未生成依赖许可清单。'}</Text>
    <TextInput testID="npm-notice-search" accessibilityLabel="搜索依赖名称" placeholder="搜索依赖名称" placeholderTextColor="#a6b3ce" value={query} onChangeText={value=>{setQuery(value);setSelected(null)}} autoCorrect={false} autoCapitalize="none" style={styles.input}/>
    <FlatList data={rows} keyExtractor={row=>row.id} extraData={selected} keyboardShouldPersistTaps="handled"
     ListEmptyComponent={<Text style={styles.hint}>没有匹配的依赖。</Text>}
     renderItem={({item})=><View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityState={{expanded:selected===item.id}} onPress={()=>setSelected(selected===item.id?null:item.id)}>
       <Text style={styles.text}>{item.name} · {item.version}</Text><Text style={styles.hint}>{item.license}</Text>
      </Pressable>
      {selected===item.id&&(item.files.length?item.files.map(file=><View key={file.name} style={styles.notice}>
       <Text style={styles.hint}>{file.name}</Text><Text selectable style={styles.text}>{file.text}</Text>
      </View>):<Text style={styles.hint}>此依赖包未附独立版权文本，仍需补充核实。</Text>)}
     </View>}/>
   </SafeAreaView>
  </Modal>
 </>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:'#10141e',padding:18},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
 title:{color:'#f1f5fe',fontSize:22,fontWeight:'700',flexShrink:1},text:{color:'#f1f5fe',fontSize:14,lineHeight:22},
 hint:{color:'#a6b3ce',fontSize:13,lineHeight:20,marginVertical:6},button:{padding:13,borderWidth:1,borderColor:'#30394e',borderRadius:10},
 input:{color:'#f1f5fe',padding:12,borderWidth:1,borderColor:'#30394e',borderRadius:10,marginVertical:12},
 row:{paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#30394e'},notice:{paddingTop:12},
});
