package lycotunnel

import (
 "context"
 stdjson "encoding/json"
 "io"
 "net"
 "net/http"
 "net/http/httptest"
 "net/url"
 "strconv"
 "sync/atomic"
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

func TestRealSubscriptionProtocolDataPaths(t *testing.T) {
 const uuid="01234567-89ab-4def-8123-456789abcdef"
 for _,protocol:=range []string{"shadowsocks","vmess","vless"}{
  t.Run(protocol,func(t *testing.T){
   inbound:=map[string]any{"type":protocol}
   outbound:=map[string]any{"type":protocol,"server":"127.0.0.1"}
   if protocol=="shadowsocks"{
    inbound["method"]="aes-128-gcm";inbound["password"]="CI-only-encrypted-node"
    outbound["method"]="aes-128-gcm";outbound["password"]="CI-only-encrypted-node"
   }else{
    inbound["users"]=[]any{map[string]any{"uuid":uuid}}
    outbound["uuid"]=uuid
    if protocol=="vmess"{outbound["security"]="auto"}
   }
   peerPort:=testPeer(t,inbound)
   // A separate TCP relay counts actual connections to the protocol peer.
   // Reaching the origin via a hidden direct fallback cannot pass this check.
   tracker,err:=net.Listen("tcp4","127.0.0.1:0");if err!=nil{t.Fatal(err)}
   t.Cleanup(func(){tracker.Close()})
   var connections atomic.Int32
   go func(){for{
    client,err:=tracker.Accept();if err!=nil{return};connections.Add(1)
    upstream,err:=net.Dial("tcp",net.JoinHostPort("127.0.0.1",strconv.Itoa(peerPort)))
    if err!=nil{client.Close();continue}
    go func(){defer client.Close();defer upstream.Close();io.Copy(upstream,client)}()
    go func(){defer client.Close();defer upstream.Close();io.Copy(client,upstream)}()
   }}()
   outbound["server_port"]=tracker.Addr().(*net.TCPAddr).Port
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
