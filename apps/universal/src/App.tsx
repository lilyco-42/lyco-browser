import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,BackHandler,Keyboard,Linking,Platform,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import Browser from './Browser';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ACCOUNT,SHOP,login,account,proxyEntitlement,type Account} from './billing';
import {createProfile,readProfiles,saveProfiles,type Profile} from './profiles';

type Screen='home'|'profiles'|'about';
const COLOR={bg:'#10141e',panel:'#1a2130',line:'#30394e',text:'#f1f5fe',muted:'#a6b3ce',gold:'#ffcf77',blue:'#a0b8ff'};
function Action({title,label,onPress,secondary=false,disabled=false}:{title:string;label?:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label||title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
  style={[styles.action,secondary&&styles.secondary,disabled&&styles.disabled]}>
  <Text style={[styles.actionText,secondary&&{color:COLOR.text}]}>{title}</Text>
 </Pressable>;
}
function Field({label,value,onChangeText,placeholder,secureTextEntry=false}:{label:string;value:string;onChangeText:(value:string)=>void;placeholder?:string;secureTextEntry?:boolean}){
 return <View style={{gap:6,marginBottom:13}}>
  <Text style={styles.label}>{label}</Text>
  <TextInput testID={label} style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder}
   placeholderTextColor="#7183a1" autoCapitalize="none" autoCorrect={false}
   returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={()=>Keyboard.dismiss()} secureTextEntry={secureTextEntry} accessibilityLabel={label}/>
 </View>;
}
export default function App(){
 const [screen,setScreen]=useState<Screen>('home');
 const authGeneration=useRef(0);
 const [user,setUser]=useState(''),[password,setPassword]=useState('');
 const [token,setToken]=useState(''),[me,setMe]=useState<Account|null>(null);
 const [busy,setBusy]=useState(false),[note,setNote]=useState('');
 const [profiles,setProfiles]=useState<Profile[]>([]);
 const [name,setName]=useState(''),[url,setUrl]=useState('');
 const [openProfile,setOpenProfile]=useState<Profile|null>(null);
 useEffect(()=>{
  let live=true;
  readProfiles().then(rows=>{if(live)setProfiles(rows)}).catch(()=>{if(live)setNote('无法读取本地环境列表')});
  return()=>{live=false};
 },[]);
 useEffect(()=>{
  const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{
   if(openProfile){setOpenProfile(null);return true}
   if(screen!=='home'){setScreen('home');return true}
   return false;
  });
  return()=>subscription.remove();
 },[openProfile,screen]);
 async function doLogin(){
  const generation=++authGeneration.current;
  setBusy(true);setNote('登录中…');
  try{
   const credentials=await login(user,password);
   const result=await account(credentials.token);
   if(generation!==authGeneration.current)return;
   setToken(credentials.token);setMe(result);setPassword('');
   setNote('官网登录成功，已同步代理权益');
  }catch(e){if(generation===authGeneration.current){setPassword('');setToken('');setMe(null);setNote((e as Error).message)}}
  finally{if(generation===authGeneration.current)setBusy(false)}
 }
 async function refresh(){
  if(!token)return;
  const generation=authGeneration.current;
  setBusy(true);
  try{const next=await account(token);if(generation===authGeneration.current){setMe(next);setNote('权益已刷新')}}
  catch(e){if(generation===authGeneration.current){setMe(null);setToken('');setNote('请重新登录：'+(e as Error).message)}}
  finally{if(generation===authGeneration.current)setBusy(false)}
 }
 async function addProfile(){
  try{
   if(profiles.length>=100)throw Error('每台设备最多保存100个环境');
   const next=[...profiles,createProfile(name,url)];
   await saveProfiles(next);setProfiles(next);setName('');setUrl('');setNote('已建立本地环境条目');
  }catch(e){setNote((e as Error).message)}
 }
 async function removeProfile(id:string){
  try{
   const next=profiles.filter(x=>x.id!==id);
   await saveProfiles(next);setProfiles(next);setNote('环境列表条目已删除；原生网站数据仍保留在本机');
  }catch(e){setNote((e as Error).message)}
 }
 async function openSite(address:string){
  try{await Linking.openURL(address)}catch{setNote('无法打开网页，请确认浏览器已安装')}
 }
 const entitlement=me?proxyEntitlement(me):null;
 if(openProfile)return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content" />
  <Browser profile={openProfile} onClose={()=>setOpenProfile(null)} session={token&&me?.username?{token,username:me.username}:undefined}/></SafeAreaView>;
 return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content" />
  <View style={styles.header}>
   <Text style={styles.kicker}>LYCO / UNIFIED CLIENT</Text>
   <Text style={styles.title}>LYCO Browser</Text>
   <Text style={styles.subtitle}>代理会员与独立环境管理</Text>
  </View>
  <View style={styles.tabs}>
   {([['home','会员与代理'],['profiles','环境管理'],['about','平台能力']] as [Screen,string][]).map(([tab,label])=>
    <Pressable key={tab} onPress={()=>setScreen(tab)} style={[styles.tab,tab===screen&&styles.activeTab]}>
     <Text style={[styles.tabText,tab===screen&&styles.activeTabText]}>{label}</Text>
    </Pressable>)}
  </View>
  <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
   {screen==='home'&&<>
    <View style={styles.card}><Text style={styles.cardTitle}>网站账号 / Billing</Text>
     {!token?<><Text style={styles.hint}>与 lain42.top 共用账户，管理员令牌和支付密钥不进入客户端。</Text>
      <Field label="网站用户名" value={user} onChangeText={setUser} placeholder="输入用户名"/>
      <Field label="网站密码" value={password} onChangeText={setPassword} placeholder="至少8位" secureTextEntry/>
      <Action title={busy?'登录中…':'登录并验证权益'} disabled={busy} onPress={doLogin}/>
     </>:<>
      <Text style={styles.value}>✓ {me?.username||user}</Text>
      <Text style={styles.hint}>积分余额：{typeof me?.points?.balance==='number'?me.points.balance+' 分':'请在官网账户中心查看'}</Text>
      <Text style={[styles.value,{color:entitlement?'#8be4b3':COLOR.gold}]}>
       {entitlement?'代理月卡有效':'暂无有效代理月卡'}</Text>
      {entitlement?.expires_at&&<Text style={styles.hint}>到期：{new Date(entitlement.expires_at).toLocaleString()}</Text>}
      <View style={styles.actions}><Action title="刷新权益" disabled={busy} onPress={refresh}/>
       <Action title="退出" secondary onPress={()=>{authGeneration.current++;setBusy(false);setPassword('');setToken('');setMe(null);setNote('会话已退出')}}/></View>
     </>}
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>LYCO VPN / 代理服务</Text>
     <Text style={styles.hint}>桌面版使用 Mihomo 连接官网订阅。移动端新增独立网站数据与 HTTP(S) 代理入口，目前需要自备兼容代理，尚未连接官网订阅或全设备 VPN。</Text>
     <View style={styles.pill}><Text style={styles.pillText}>{Platform.OS==='android'?'Android':Platform.OS==='ios'?'iOS':'Web'} · {entitlement?'权益已验证':'尚无有效月卡'} · VPN 未连接</Text></View>
     <Action title="进入官网代理教程" secondary onPress={()=>openSite('https://lain42.top/vpn/')}/>
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>支付 / 续费</Text>
     <Text style={styles.hint}>价格、支付确认、开通和积分兑换由官网 Billing 处理；当前内部测试版直接打开官网。应用商店正式发布前需评估 Apple/Google 数字内容购买规则。</Text>
     <Action title="官方商城购买或续费" onPress={()=>openSite(SHOP)}/>
     <View style={{height:9}}/><Action title="官网账户中心" secondary onPress={()=>openSite(ACCOUNT)}/>
    </View>
   </>}
   {screen==='profiles'&&<>
    <View style={styles.card}><Text style={styles.cardTitle}>新建环境条目</Text>
     <Text style={styles.hint}>环境名称与网址保存在本设备。移动端通过原生网站数据存储区分环境，启动时配置专用 HTTP(S) 代理。指纹、系统参数和全设备流量不在这项隔离范围内。</Text>
     <Field label="环境名称" value={name} onChangeText={setName} placeholder="例如 客户 A"/>
     <Field label="首页 URL" value={url} onChangeText={setUrl} placeholder="https://example.com"/>
     <Action title="保存环境" onPress={addProfile}/>
    </View>
    {profiles.length===0?<View style={styles.card}><Text style={styles.hint}>暂无环境，先添加一个。</Text></View>:
     profiles.map(row=><View style={styles.card} key={row.id}>
      <Text style={styles.cardTitle}>{row.name}</Text><Text style={styles.hint}>{row.url}</Text>
      <View style={styles.actions}><Action title="打开网页" label={"打开环境 "+row.name} onPress={()=>setOpenProfile(row)}/>
       <Action title="删除条目" secondary onPress={()=>removeProfile(row.id)}/></View></View>)}
   </>}
   {screen==='about'&&<View style={styles.card}><Text style={styles.cardTitle}>支持范围与限制</Text>
    <Text style={styles.hint}>Android 9 及以上：原生 WebView 使用环境专用数据目录和独立进程。每次只打开一个环境，关闭后终止浏览进程。需要系统 WebView 支持代理覆盖。</Text>
    <Text style={styles.hint}>iOS 17 及以上：每个环境使用独立持久 WKWebsiteDataStore，并在加载前配置 HTTP(S) 代理。功能仍需模拟器和真机验证；不提供全设备 VPN。</Text>
    <Text style={styles.hint}>Windows / macOS / Linux：使用 OpenBrowser 桌面内核。React Native Web 可作为跨平台会员控制界面，但 Electron 容器和原生进程不同于移动端 WebView。</Text>
    <Text style={styles.hint}>反检测并非隐身承诺。独立账号、合法授权、合规使用，且不同平台的指纹能力不能保证完全相同。</Text>
    <Action title="官网帮助" secondary onPress={()=>openSite('https://lain42.top/vpn/')}/>
   </View>}
   {busy&&<ActivityIndicator color={COLOR.gold}/>}
   {!!note&&<Text style={styles.note} accessibilityRole="alert">{note}</Text>}
   <Text style={styles.footer}>LYCO Browser · Internal preview · GitHub Actions-only builds</Text>
  </ScrollView>
 </SafeAreaView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:COLOR.bg},header:{paddingHorizontal:22,paddingTop:24,paddingBottom:17},
 kicker:{fontSize:11,fontWeight:'700',letterSpacing:2,color:COLOR.gold},
 title:{fontSize:31,fontWeight:'800',color:COLOR.text,marginTop:6},
 subtitle:{color:COLOR.muted,fontSize:13,marginTop:5},
 tabs:{flexDirection:'row',marginHorizontal:13,gap:4,borderBottomColor:COLOR.line,borderBottomWidth:1},
 tab:{flex:1,paddingVertical:15,alignItems:'center'},activeTab:{borderBottomWidth:3,borderBottomColor:COLOR.gold},
 tabText:{color:COLOR.muted,fontSize:13},activeTabText:{color:COLOR.text,fontWeight:'700'},
 container:{paddingHorizontal:16,paddingTop:18,paddingBottom:40,maxWidth:900,width:'100%',alignSelf:'center',gap:15},
 card:{padding:20,backgroundColor:COLOR.panel,borderColor:COLOR.line,borderWidth:1,borderRadius:19,gap:10},
 cardTitle:{fontSize:19,fontWeight:'800',color:COLOR.text,marginBottom:4},
 hint:{color:COLOR.muted,fontSize:13,lineHeight:22},
 value:{fontSize:16,color:COLOR.text,fontWeight:'700'},
 label:{color:COLOR.text,fontSize:13,fontWeight:'600'},
 input:{color:COLOR.text,backgroundColor:COLOR.bg,borderColor:COLOR.line,borderWidth:1,borderRadius:10,paddingHorizontal:12,paddingVertical:11,fontSize:15},
 action:{backgroundColor:COLOR.gold,borderRadius:11,paddingVertical:12,paddingHorizontal:15,alignItems:'center',justifyContent:'center'},
 actionText:{color:'#1b1b22',fontWeight:'800',fontSize:13},
 secondary:{backgroundColor:'#303a54'},disabled:{opacity:0.4},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:5},
 pill:{backgroundColor:'#293249',padding:12,borderRadius:10,marginVertical:7},
 pillText:{color:COLOR.blue,fontSize:13},note:{padding:16,backgroundColor:'#292e3d',color:COLOR.gold,borderRadius:11,fontSize:13},
 footer:{fontSize:11,textAlign:'center',color:'#697790',marginTop:14}
});
