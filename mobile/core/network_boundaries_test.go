package lycotunnel

import (
 "crypto/ecdsa"
 "crypto/elliptic"
 "crypto/rand"
 "crypto/sha1"
 "crypto/tls"
 "crypto/x509"
 "crypto/x509/pkix"
 "encoding/base64"
 "fmt"
 "io"
 "math/big"
 "net"
 "net/http"
 "net/http/httptest"
 "net/url"
 "strconv"
 "strings"
 "sync"
 "sync/atomic"
 "testing"
 "time"

 "golang.org/x/net/proxy"
)

// This is a core boundary test, not evidence that a WebView uses the core.
// Both origin families remain reachable after the selected outbound stops.
// HTTPS/WSS validate an ephemeral CI CA; certificate checks are never disabled.
func TestIPv6HTTPSAndWebSocketRequireSelectedOutbound(t *testing.T) {
 var hits atomic.Int32
 handler:=http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  hits.Add(1)
  if r.URL.Path!="/socket" {io.WriteString(w,"LYCO IPv6 origin");return}
  if r.Header.Get("Upgrade")!="websocket" || r.Header.Get("Sec-WebSocket-Version")!="13" {
   http.Error(w,"websocket required",400);return
  }
  connection,buffer,err:=w.(http.Hijacker).Hijack();if err!=nil{return}
  defer connection.Close()
  accept:=sha1.Sum([]byte(r.Header.Get("Sec-WebSocket-Key")+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
  fmt.Fprintf(buffer,"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n",base64.StdEncoding.EncodeToString(accept[:]))
  buffer.Write([]byte{0x81,7});buffer.WriteString("LYCO WS");buffer.Flush()
 })
 listenIPv6:=func()net.Listener{
  listener,err:=net.Listen("tcp6","[::1]:0");if err!=nil{t.Fatalf("Required IPv6 origin unavailable: %v",err)}
  return listener
 }
 plain:=httptest.NewUnstartedServer(handler);plain.Listener.Close();plain.Listener=listenIPv6();plain.Start();defer plain.Close()
 secure:=httptest.NewUnstartedServer(handler);secure.Listener.Close();secure.Listener=listenIPv6()
 key,err:=ecdsa.GenerateKey(elliptic.P256(),rand.Reader);if err!=nil{t.Fatal(err)}
 cert:=&x509.Certificate{SerialNumber:big.NewInt(42),Subject:pkix.Name{CommonName:"LYCO CI origin"},
  DNSNames:[]string{"lyco-boundary.invalid"},IPAddresses:[]net.IP{net.ParseIP("::1")},
  NotBefore:time.Now().Add(-time.Minute),NotAfter:time.Now().Add(time.Hour),
  IsCA:true,BasicConstraintsValid:true,KeyUsage:x509.KeyUsageCertSign|x509.KeyUsageDigitalSignature,
  ExtKeyUsage:[]x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
 der,err:=x509.CreateCertificate(rand.Reader,cert,cert,&key.PublicKey,key);if err!=nil{t.Fatal(err)}
 parsed,err:=x509.ParseCertificate(der);if err!=nil{t.Fatal(err)}
 roots:=x509.NewCertPool();roots.AddCert(parsed)
 secure.TLS=&tls.Config{MinVersion:tls.VersionTLS12,Certificates:[]tls.Certificate{{Certificate:[][]byte{der},PrivateKey:key}}}
 secure.StartTLS();defer secure.Close()
 plainURL,_:=url.Parse(plain.URL);secureURL,_:=url.Parse(secure.URL)
 _,securePort,_:=net.SplitHostPort(secureURL.Host)
 alias:=net.JoinHostPort("lyco-boundary.invalid",securePort)
 destinations:=map[string]string{plainURL.Host:plainURL.Host,secureURL.Host:secureURL.Host,alias:secureURL.Host}
 var mu sync.Mutex
 var connects []string
 upstream:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  target,allowed:=destinations[r.Host]
  if r.Method!="CONNECT" || !allowed {http.Error(w,"unexpected target",403);return}
  remote,err:=net.DialTimeout("tcp",target,2*time.Second);if err!=nil{http.Error(w,"origin unavailable",502);return}
  client,buffer,err:=w.(http.Hijacker).Hijack();if err!=nil{remote.Close();return}
  mu.Lock();connects=append(connects,r.Host);mu.Unlock()
  buffer.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n");buffer.Flush()
  client.SetDeadline(time.Now().Add(8*time.Second));remote.SetDeadline(time.Now().Add(8*time.Second))
  go func(){defer client.Close();defer remote.Close();io.Copy(remote,buffer)}()
  go func(){defer client.Close();defer remote.Close();io.Copy(client,remote)}()
 }));defer upstream.Close()
 upstreamURL,_:=url.Parse(upstream.URL);_,upstreamPort,_:=net.SplitHostPort(upstreamURL.Host)
 clients:=map[string]*http.Client{}
 for _,inbound:=range []string{"http","socks5"} {
  session,err:=Start(fmt.Sprintf(`{"type":"http","server":"127.0.0.1","server_port":%s}`,upstreamPort),true)
  if err!=nil{t.Fatal(err)}
  defer session.Close()
  transport:=&http.Transport{TLSClientConfig:&tls.Config{RootCAs:roots,MinVersion:tls.VersionTLS12},DisableKeepAlives:true}
  local:=net.JoinHostPort("127.0.0.1",strconv.Itoa(session.Port()))
  if inbound=="http" {
   transport.Proxy=http.ProxyURL(&url.URL{Scheme:"http",Host:local,User:url.UserPassword(session.Username(),session.Password())})
  }else{
   dialer,err:=proxy.SOCKS5("tcp",local,&proxy.Auth{User:session.Username(),Password:session.Password()},&net.Dialer{Timeout:2*time.Second})
   if err!=nil{t.Fatal(err)}
   transport.DialContext=dialer.(proxy.ContextDialer).DialContext
  }
  defer transport.CloseIdleConnections()
  clients[inbound]=&http.Client{Transport:transport,Timeout:4*time.Second}
 }
 targets:=[]string{plain.URL,secure.URL,"https://"+alias,"https://"+alias+"/socket"}
 request:=func(client *http.Client,target string)error{
  req,err:=http.NewRequest("GET",target,nil);if err!=nil{return err}
  socket:=strings.HasSuffix(target,"/socket")
  const nonce="dGhlIHNhbXBsZSBub25jZQ=="
  if socket {
   req.Header.Set("Connection","Upgrade");req.Header.Set("Upgrade","websocket")
   req.Header.Set("Sec-WebSocket-Version","13");req.Header.Set("Sec-WebSocket-Key",nonce)
  }
  response,err:=client.Do(req);if err!=nil{return err}
  defer response.Body.Close()
  if socket {
   expected:=sha1.Sum([]byte(nonce+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
   if response.StatusCode!=101 || response.Header.Get("Sec-WebSocket-Accept")!=base64.StdEncoding.EncodeToString(expected[:]) {
    return fmt.Errorf("invalid WebSocket handshake")
   }
   frame:=make([]byte,9);if _,err=io.ReadFull(response.Body,frame);err!=nil{return err}
   if string(frame)!=string([]byte{0x81,7})+"LYCO WS" {return fmt.Errorf("WebSocket origin frame differs")}
  }else{
   body,err:=io.ReadAll(response.Body);if err!=nil{return err}
   if response.StatusCode!=200 || string(body)!="LYCO IPv6 origin" {return fmt.Errorf("origin response differs")}
  }
  return nil
 }
 for name,client:=range clients {
  for _,target:=range targets {
   if err=request(client,target);err!=nil{t.Fatalf("%s selected route %s: %v",name,target,err)}
  }
 }
 mu.Lock();observed:=append([]string(nil),connects...);mu.Unlock()
 if len(observed)!=8 || hits.Load()!=8 {t.Fatalf("Expected 8 selected proxy/origin requests, observed %d/%d",len(observed),hits.Load())}
 names:=0;for _,host:=range observed{if host==alias{names++}}
 if names!=4 {t.Fatalf("Remote-only DNS names were not passed unchanged to the selected outbound: %d",names)}
 upstream.Close()
 for name,client:=range clients {
  for _,target:=range targets {
   if err=request(client,target);err==nil{t.Fatalf("%s used a fallback after outbound stop: %s",name,target)}
  }
 }
 if hits.Load()!=8 {t.Fatal("Stopped outbound reached the IPv6 origin directly")}
 direct:=&http.Client{Transport:&http.Transport{TLSClientConfig:&tls.Config{RootCAs:roots,MinVersion:tls.VersionTLS12},DisableKeepAlives:true},Timeout:4*time.Second}
 defer direct.Transport.(*http.Transport).CloseIdleConnections()
 for _,target:=range []string{plain.URL,secure.URL,secure.URL+"/socket"} {
  if err=request(direct,target);err!=nil{t.Fatalf("Direct positive control unavailable after outbound stop: %v",err)}
 }
 if hits.Load()!=11 {t.Fatal("Direct positive controls did not reach the still-available origins")}
 t.Log("Both authenticated inbounds: IPv6 HTTP, verified HTTPS, remote-name HTTPS/WSS, stopped-outbound negatives and independent direct positives passed; WebView and full DNS/RTC coverage remain separate")
}
