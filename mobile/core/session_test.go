package lycotunnel

import (
 "fmt"
 "io"
 "net"
 "net/http"
 "net/http/httptest"
 "net/url"
 "strconv"
 "strings"
 "sync/atomic"
 "testing"
 "time"
)

func TestRealHTTPProxyAndClosedPortGuard(t *testing.T) {
 var hits atomic.Int32
 origin:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){io.WriteString(w,"LYCO route verified")}));defer origin.Close()
 upstream:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  hits.Add(1)
  if r.Method==http.MethodConnect {
   conn,err:=net.Dial("tcp",r.Host);if err!=nil{http.Error(w,"bad target",502);return}
   hijacker:=w.(http.Hijacker);client,buffer,err:=hijacker.Hijack();if err!=nil{conn.Close();return}
   buffer.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n");buffer.Flush()
   go func(){defer client.Close();defer conn.Close();io.Copy(conn,buffer)}()
   go func(){defer client.Close();defer conn.Close();io.Copy(client,conn)}()
   return
  }
  res,err:=http.DefaultTransport.RoundTrip(r);if err!=nil{http.Error(w,"upstream",502);return};defer res.Body.Close();io.Copy(w,res.Body)
 }));defer upstream.Close()
 address,_:=url.Parse(upstream.URL);_,port,_:=net.SplitHostPort(address.Host)
 session,err:=Start(fmt.Sprintf(`{"type":"http","server":"127.0.0.1","server_port":%s}`,port),true)
 if err!=nil{t.Fatal(err)}
 defer session.Close()
 proxy:=&url.URL{Scheme:"http",Host:net.JoinHostPort("127.0.0.1",strconv.Itoa(session.Port())),User:url.UserPassword(session.Username(),session.Password())}
 transport:=&http.Transport{Proxy:http.ProxyURL(proxy),DisableKeepAlives:true};defer transport.CloseIdleConnections()
 client:=&http.Client{Transport:transport,Timeout:5*time.Second}
 response,err:=client.Get(origin.URL);if err!=nil{t.Fatal(err)}
 body,_:=io.ReadAll(response.Body);response.Body.Close()
 if string(body)!="LYCO route verified"||hits.Load()==0{t.Fatal("traffic did not traverse the real HTTP outbound")}
 // HTTP/1.0 EOF-delimited pages remain valid through both proxy hops.
 legacy:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  connection,buffer,err:=w.(http.Hijacker).Hijack();if err!=nil{return}
  defer connection.Close()
  buffer.WriteString("HTTP/1.0 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<h1>Legacy HTML body</h1>")
  buffer.Flush()
 }));defer legacy.Close()
 response,err=client.Get(legacy.URL);if err!=nil{t.Fatal(err)}
 body,_=io.ReadAll(response.Body);response.Body.Close()
 if string(body)!="<h1>Legacy HTML body</h1>"{t.Fatalf("EOF-delimited body was truncated: %d bytes",len(body))}
 // Anonymous web content cannot access an authenticated iOS session's core.
 anonymous:=*proxy;anonymous.User=nil
 noAuth:=&http.Client{Transport:&http.Transport{Proxy:http.ProxyURL(&anonymous)},Timeout:2*time.Second}
 response,err=noAuth.Get(origin.URL)
 if err==nil{response.Body.Close();if response.StatusCode!=407{t.Fatal("local proxy accepted an unauthenticated request")}}
 if err=session.Close();err!=nil{t.Fatal(err)}
 if _,err=net.Listen("tcp4",proxy.Host);err==nil{t.Fatal("closed environment port could be recycled")}
 if response,err=client.Get(origin.URL);err==nil{response.Body.Close();t.Fatal("closed environment still routed traffic")}
}

func TestRejectsDirectAndInvalidImportsWithoutLeakingCredentials(t *testing.T){
 for _,config:=range []string{`{"type":"direct"}`,`{"type":"http","detour":"direct"}`,`{"type":"unknown","password":"PRIVATE_FIXTURE_SECRET"}`,strings.Repeat("x",65537)}{
  if session,err:=Start(config,false);err==nil{session.Close();t.Fatal("unsafe config accepted")}else if strings.Contains(err.Error(),"PRIVATE_FIXTURE_SECRET"){t.Fatal("credential leaked in error")}
 }
}
