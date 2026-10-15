import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Linking,Platform,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import Browser from './Browser';
import {ACCOUNT,SHOP,login,account,proxyEntitlement,type Account} from './billing';
import {createProfile,readProfiles,saveProfiles,type Profile} from './profiles';

type Screen='home'|'profiles'|'about';
const COLOR={bg:'#10141e',panel:'#1a2130',line:'#30394e',text:'#f1f5fe',muted:'#a6b3ce',gold:'#ffcf77',blue:'#a0b8ff'};
function Action({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
 return <Pressable disabled={disabled} onPress={onPress}
  style={[styles.action,secondary&&styles.secondary,disabled&&styles.disabled]}>
  <Text style={[styles.actionText,secondary&&{color:COLOR.text}]}>{title}</Text>
 </Pressable>;
}
function Field({label,value,onChangeText,placeholder,secureTextEntry=false}:{label:string;value:string;onChangeText:(value:string)=>void;placeholder?:string;secureTextEntry?:boolean}){
 return <View style={{gap:6,marginBottom:13}}>
  <Text style={styles.label}>{label}</Text>
  <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder}
   placeholderTextColor="#7183a1" autoCapitalize="none" autoCorrect={false}
   secureTextEntry={secureTextEntry} accessibilityLabel={label}/>
 </View>;
}
export default function App(){
 const [screen,setScreen]=useState<Screen>('home');
 const [user,setUser]=useState(''),[password,setPassword]=useState('');
 const [token,setToken]=useState(''),[me,setMe]=useState<Account|null>(null);
 const [busy,setBusy]=useState(false),[note,setNote]=useState('');
 const [profiles,setProfiles]=useState<Profile[]>([]);
 const [name,setName]=useState(''),[url,setUrl]=useState('https://example.com');
 const [openProfile,setOpenProfile]=useState<Profile|null>(null);
 useEffect(()=>{
  let live=true;
  readProfiles().then(rows=>{if(live)setProfiles(rows)}).catch(()=>{if(live)setNote('无法读取本地环境列表')});
  return()=>{live=false};
 },[]);
 async function doLogin(){
  setBusy(true);setNote('登录中…');
  try{
   const credentials=await login(user,password);
   const result=await account(credentials.token);
   setToken(credentials.token);setMe(result);setPassword('');
   setNote('官网登录成功，已同步代理权益');
  }catch(e){setPassword('');setToken('');setMe(null);setNote((e as Error).message)}
  finally{setBusy(false)}
 }
 async function refresh(){
  if(!token)return;
  setBusy(true);
  try{setMe(await account(token));setNote('权益已刷新')}
  catch(e){setMe(null);setToken('');setNote('请重新登录：'+(e as Error).message)}
  finally{setBusy(false)}
 }
 async function addProfile(){
  try{
   const next=[...profiles,createProfile(name,url)];
   await saveProfiles(next);setProfiles(next);setName('');setNote('已建立本地环境条目');
  }catch(e){setNote((e as Error).message)}
 }
 async function removeProfile(id:string){
  try{
   const next=profiles.filter(x=>x.id!==id);
   await saveProfiles(next);setProfiles(next);setNote('本地环境条目已删除；历史浏览数据不保证清除');
  }catch(e){setNote((e as Error).message)}
 }
 async function openSite(address:string){
  try{await Linking.openURL(address)}catch{setNote('无法打开网页，请确认浏览器已安装')}
 }
 const entitlement=me?proxyEntitlement(me):null;
 if(openProfile)return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content" />
  <Browser profile={openProfile} onClose={()=>setOpenProfile(null)}/></SafeAreaView>;
 return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content" />
  <View style={styles.header}>
   <Text style={styles.kicker}>LYCO / UNIFIED CLIENT</Text>
   <Text style={styles.title}>LYCO Browser</Text>
   <Text style={styles.subtitle}>React Native · 代理会员与多环境管理</Text>
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
       <Action title="退出" secondary onPress={()=>{setToken('');setMe(null);setNote('会话已退出')}}/></View>
     </>}
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>LYCO VPN / 代理服务</Text>
     <Text style={styles.hint}>已接入现有 Billing 权益验证；桌面版使用 Mihomo 启动本地代理。移动端 VPN 原生隧道尚未接入，不能把付费权益当成已经连接 VPN。</Text>
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
     <Text style={styles.hint}>环境名称与网址保存在本设备。移动端目前使用临时 WebView，**不具备桌面版 Chromium 的独立用户目录与完整指纹隔离**。</Text>
     <Field label="环境名称" value={name} onChangeText={setName} placeholder="例如 客户 A"/>
     <Field label="首页 URL" value={url} onChangeText={setUrl} placeholder="https://example.com"/>
     <Action title="保存环境" onPress={addProfile}/>
    </View>
    {profiles.length===0?<View style={styles.card}><Text style={styles.hint}>暂无环境，先添加一个。</Text></View>:
     profiles.map(row=><View style={styles.card} key={row.id}>
      <Text style={styles.cardTitle}>{row.name}</Text><Text style={styles.hint}>{row.url}</Text>
      <View style={styles.actions}><Action title="打开网页" onPress={()=>setOpenProfile(row)}/>
       <Action title="删除条目" secondary onPress={()=>removeProfile(row.id)}/></View></View>)}
   </>}
   {screen==='about'&&<View style={styles.card}><Text style={styles.cardTitle}>支持范围与限制</Text>
    <Text style={styles.hint}>Android：React Native + Android WebView，单个临时网页视图；需要独立原生模块处理 VPNService、进程级 Cookie/缓存隔离。</Text>
    <Text style={styles.hint}>iOS：React Native + WKWebView。使用其他浏览器内核涉及 Apple 专门授权条件；VPN 必须使用 Network Extension 等原生能力及授权。</Text>
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
