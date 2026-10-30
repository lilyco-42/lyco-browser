package lycotunnel

import (
 "context"
 "fmt"
 "io"
 "net"
 "net/http"
 "net/http/httptest"
 "net/url"
 "strconv"
 "sync/atomic"
 "testing"
 "time"

 "golang.org/x/net/proxy"
)

// Exercise the same authenticated mixed listener used by the iOS SOCKS5
// configuration. Both a remote-only name and a direct-reachable IP must travel
// through the explicit outbound; a stopped outbound must never reach the origin.
func TestAuthenticatedSOCKSInboundUsesOnlyTheSelectedOutbound(t *testing.T) {
 var originHits,proxyHits atomic.Int32
 origin:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  originHits.Add(1);io.WriteString(w,"LYCO authenticated SOCKS route")
 }));defer origin.Close()
 originURL,_:=url.Parse(origin.URL)
 _,originPort,_:=net.SplitHostPort(originURL.Host)
 remoteAddress:=net.JoinHostPort("lyco-socks-fixture.invalid",originPort)
 upstream:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  if r.Method!=http.MethodConnect || (r.Host!=originURL.Host && r.Host!=remoteAddress) {
   http.Error(w,"unexpected target",400);return
  }
  proxyHits.Add(1)
  target,err:=net.DialTimeout("tcp",originURL.Host,2*time.Second)
  if err!=nil {http.Error(w,"target unavailable",502);return}
  client,buffer,err:=w.(http.Hijacker).Hijack()
  if err!=nil {target.Close();return}
  buffer.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n");buffer.Flush()
  go func(){defer client.Close();defer target.Close();io.Copy(target,buffer)}()
  go func(){defer client.Close();defer target.Close();io.Copy(client,target)}()
 }));defer upstream.Close()
 upstreamURL,_:=url.Parse(upstream.URL)
 _,upstreamPort,_:=net.SplitHostPort(upstreamURL.Host)
 session,err:=Start(fmt.Sprintf(`{"type":"http","server":"127.0.0.1","server_port":%s}`,upstreamPort),true)
 if err!=nil {t.Fatal(err)}
 defer session.Close()
 local:=net.JoinHostPort("127.0.0.1",strconv.Itoa(session.Port()))
 dialer,err:=proxy.SOCKS5("tcp",local,&proxy.Auth{User:session.Username(),Password:session.Password()},&net.Dialer{Timeout:2*time.Second})
 if err!=nil {t.Fatal(err)}
 transport:=&http.Transport{DialContext:dialer.(proxy.ContextDialer).DialContext,DisableKeepAlives:true}
 defer transport.CloseIdleConnections()
 client:=&http.Client{Transport:transport,Timeout:4*time.Second}
 for _,target:=range []string{"http://"+remoteAddress,origin.URL} {
  response,err:=client.Get(target)
  if err!=nil {t.Fatal(err)}
  body,readErr:=io.ReadAll(response.Body);response.Body.Close()
  if readErr!=nil || string(body)!="LYCO authenticated SOCKS route" {t.Fatal("SOCKS route did not return the complete origin response")}
 }
 if proxyHits.Load()!=2 || originHits.Load()!=2 {t.Fatal("SOCKS destinations bypassed the selected HTTP outbound")}
 for _,auth:=range []*proxy.Auth{nil,{User:session.Username(),Password:"wrong"}} {
  unauthorized,err:=proxy.SOCKS5("tcp",local,auth,&net.Dialer{Timeout:2*time.Second})
  if err!=nil {t.Fatal(err)}
  ctx,cancel:=context.WithTimeout(context.Background(),2*time.Second)
  conn,err:=unauthorized.(proxy.ContextDialer).DialContext(ctx,"tcp",originURL.Host)
  cancel()
  if err==nil {conn.Close();t.Fatal("SOCKS listener accepted missing or incorrect credentials")}
 }
 upstream.Close()
 response,err:=client.Get(origin.URL)
 if err==nil {response.Body.Close();t.Fatal("SOCKS listener used a direct fallback after the selected outbound stopped")}
 if originHits.Load()!=2 {t.Fatal("Stopped outbound allowed a direct origin request")}
 if err=session.Close();err!=nil {t.Fatal(err)}
 response,err=client.Get(origin.URL)
 if err==nil {response.Body.Close();t.Fatal("Closed SOCKS environment continued routing")}
}
