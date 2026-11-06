package lycotunnel

import (
 "context"
 "crypto/ecdsa"
 "crypto/elliptic"
 "crypto/rand"
 "crypto/x509"
 "crypto/x509/pkix"
 stdjson "encoding/json"
 "encoding/pem"
 "io"
 "net"
 "net/http"
 "net/http/httptest"
 "net/url"
 "math/big"
 "strconv"
 "sync/atomic"
 "sync"
 "testing"
 "time"

 box "github.com/sagernet/sing-box"
 "github.com/sagernet/sing-box/include"
 "github.com/sagernet/sing-box/option"
 "github.com/sagernet/sing/common/json"
)

func testPeer(t *testing.T, inbound map[string]any) int {
 t.Helper()
 listener,err:=net.Listen("tcp4","127.0.0.1:0");if err!=nil{t.Fatal(err)}
 port:=listener.Addr().(*net.TCPAddr).Port;listener.Close()
 inbound["listen"]="127.0.0.1";inbound["listen_port"]=port
 config:=map[string]any{"log":map[string]any{"disabled":true},"inbounds":[]any{inbound},
  "outbounds":[]any{map[string]any{"type":"direct","tag":"test-origin-only"}},
  "route":map[string]any{"final":"test-origin-only"}}
 content,_:=stdjson.Marshal(config)
 ctx,cancel:=context.WithCancel(include.Context(context.Background()))
 options,err:=json.UnmarshalExtendedContext[option.Options](ctx,content);if err!=nil{cancel();t.Fatal(err)}
 peer,err:=box.New(box.Options{Context:ctx,Options:options});if err!=nil{cancel();t.Fatal(err)}
 if err=peer.Start();err!=nil{cancel();peer.Close();t.Fatal(err)}
 t.Cleanup(func(){cancel();peer.Close()})
 return port
}

func testTLS(t *testing.T) (map[string]any, map[string]any) {
 t.Helper()
 key,err:=ecdsa.GenerateKey(elliptic.P256(),rand.Reader);if err!=nil{t.Fatal(err)}
 certificate:=&x509.Certificate{SerialNumber:big.NewInt(1),Subject:pkix.Name{CommonName:"LYCO CI owned proxy"},
  DNSNames:[]string{"lyco-test.invalid"},NotBefore:time.Now().Add(-time.Minute),NotAfter:time.Now().Add(time.Hour),
  IsCA:true,BasicConstraintsValid:true,KeyUsage:x509.KeyUsageDigitalSignature|x509.KeyUsageCertSign,ExtKeyUsage:[]x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
 der,err:=x509.CreateCertificate(rand.Reader,certificate,certificate,&key.PublicKey,key);if err!=nil{t.Fatal(err)}
 privateKey,err:=x509.MarshalPKCS8PrivateKey(key);if err!=nil{t.Fatal(err)}
 cert:=string(pem.EncodeToMemory(&pem.Block{Type:"CERTIFICATE",Bytes:der}))
 secret:=string(pem.EncodeToMemory(&pem.Block{Type:"PRIVATE KEY",Bytes:privateKey}))
 return map[string]any{"enabled":true,"certificate":[]string{cert},"key":[]string{secret},"alpn":[]string{"h3"}},
  map[string]any{"enabled":true,"server_name":"lyco-test.invalid","certificate":[]string{cert},"alpn":[]string{"h3"}}
}

// Count the encrypted UDP hop independently from the origin. Each client gets
// its own connected socket; neither the relay nor origin can fake a QUIC reply.
func testUDPRelay(t *testing.T, peerPort int) (int, *atomic.Int32) {
 t.Helper()
 relay,err:=net.ListenUDP("udp4",&net.UDPAddr{IP:net.IPv4(127,0,0,1)});if err!=nil{t.Fatal(err)}
 count:=new(atomic.Int32)
 var lock sync.Mutex
 clients:=map[string]*net.UDPConn{}
 closed:=false
 t.Cleanup(func(){relay.Close();lock.Lock();defer lock.Unlock();closed=true;for _,connection:=range clients{connection.Close()}})
 go func(){
  packet:=make([]byte,65536)
  for {
   n,client,err:=relay.ReadFromUDP(packet);if err!=nil{return}
   count.Add(1)
   lock.Lock()
   if closed {lock.Unlock();return}
   connection:=clients[client.String()]
   if connection==nil {
    connection,err=net.DialUDP("udp4",nil,&net.UDPAddr{IP:net.IPv4(127,0,0,1),Port:peerPort})
    if err!=nil{lock.Unlock();return}
    clients[client.String()]=connection
    go func(upstream *net.UDPConn, destination *net.UDPAddr){
     response:=make([]byte,65536)
     for{n,_,err:=upstream.ReadFromUDP(response);if err!=nil{return};if _,err=relay.WriteToUDP(response[:n],destination);err!=nil{return}}
    }(connection,client)
   }
   lock.Unlock()
   if _,err=connection.Write(packet[:n]);err!=nil{return}
  }
 }()
 return relay.LocalAddr().(*net.UDPAddr).Port,count
}

func TestRealSubscriptionProtocolDataPaths(t *testing.T) {
 const uuid="01234567-89ab-4def-8123-456789abcdef"
 for _,scenario:=range []struct{protocol,transport string}{
  {"socks",""},{"shadowsocks",""},{"vmess",""},{"vless",""},
  {"trojan",""},{"hysteria2",""},{"tuic",""},{"vless","ws"},{"vmess","ws"},{"vless","grpc"},
 }{
  protocol:=scenario.protocol
  name:=protocol;if scenario.transport!=""{name+="/"+scenario.transport}
  t.Run(name,func(t *testing.T){
   inbound:=map[string]any{"type":protocol}
   outbound:=map[string]any{"type":protocol,"server":"127.0.0.1"}
   if protocol=="socks"{
    inbound["users"]=[]any{map[string]any{"username":"ci-user","password":"ci-password"}}
    outbound["version"]="5";outbound["username"]="ci-user";outbound["password"]="ci-password"
   }else if protocol=="shadowsocks"{
    inbound["method"]="aes-128-gcm";inbound["password"]="CI-only-encrypted-node"
    outbound["method"]="aes-128-gcm";outbound["password"]="CI-only-encrypted-node"
   }else if protocol=="vmess"||protocol=="vless"{
    inbound["users"]=[]any{map[string]any{"uuid":uuid}}
    outbound["uuid"]=uuid
    if protocol=="vmess"{outbound["security"]="auto"}
   }else{
    user:=map[string]any{"password":"ci-tls-password"}
    outbound["password"]="ci-tls-password"
    if protocol=="tuic" {user["uuid"]=uuid;outbound["uuid"]=uuid}
    inbound["users"]=[]any{user}
    serverTLS,clientTLS:=testTLS(t)
    inbound["tls"]=serverTLS;outbound["tls"]=clientTLS
   }
   if scenario.transport!="" {
    stream:=map[string]any{"type":scenario.transport}
    if scenario.transport=="ws"{stream["path"]="/lyco-ci-tunnel"}else{stream["service_name"]="lyco-ci"}
    inbound["transport"]=stream;outbound["transport"]=stream
   }
   peerPort:=testPeer(t,inbound)
   // A separate transport relay counts actual connections to the protocol peer.
   // Reaching the origin via a hidden direct fallback cannot pass this check.
   connections:=new(atomic.Int32)
   if protocol=="hysteria2"||protocol=="tuic" {
    port,count:=testUDPRelay(t,peerPort);outbound["server_port"]=port;connections=count
   }else{
   tracker,err:=net.Listen("tcp4","127.0.0.1:0");if err!=nil{t.Fatal(err)}
   t.Cleanup(func(){tracker.Close()})
   go func(){for{
    client,err:=tracker.Accept();if err!=nil{return};connections.Add(1)
    upstream,err:=net.Dial("tcp",net.JoinHostPort("127.0.0.1",strconv.Itoa(peerPort)))
    if err!=nil{client.Close();continue}
    go func(){defer client.Close();defer upstream.Close();io.Copy(upstream,client)}()
    go func(){defer client.Close();defer upstream.Close();io.Copy(client,upstream)}()
   }}()
   outbound["server_port"]=tracker.Addr().(*net.TCPAddr).Port
   }
   config,_:=stdjson.Marshal(outbound)
   session,err:=Start(string(config),false);if err!=nil{t.Fatal(err)}
   t.Cleanup(func(){session.Close()})
   origin:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){io.WriteString(w,"LYCO subscription peer verified")}));defer origin.Close()
   proxy:=&url.URL{Scheme:"http",Host:net.JoinHostPort("127.0.0.1",strconv.Itoa(session.Port()))}
   transport:=&http.Transport{Proxy:http.ProxyURL(proxy),DisableKeepAlives:true};defer transport.CloseIdleConnections()
   client:=&http.Client{Transport:transport,Timeout:8*time.Second}
   response,err:=client.Get(origin.URL);if err!=nil{t.Fatal(err)}
   body,_:=io.ReadAll(response.Body);response.Body.Close()
   if response.StatusCode!=200||string(body)!="LYCO subscription peer verified"||connections.Load()==0{t.Fatal("subscription protocol did not carry real browser-style traffic")}
  })
 }
}
