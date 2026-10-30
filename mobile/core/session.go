// Package lycotunnel provides a browser-only loopback HTTP/SOCKS5 proxy. It does not
// install a device VPN, alter system routes, or expose subscription credentials.
package lycotunnel

import (
 "context"
 "crypto/rand"
 "encoding/hex"
 stdjson "encoding/json"
 "errors"
 "net"
 "strconv"
 "sync"

 box "github.com/sagernet/sing-box"
 "github.com/sagernet/sing-box/include"
 "github.com/sagernet/sing-box/option"
 "github.com/sagernet/sing/common/json"
)

// Session is owned by one native browser environment, never by page JavaScript.
// Its exported API deliberately contains no configuration/credential getters
// for the remote subscription node.
type Session struct {
 mu sync.Mutex
 instance *box.Box
 cancel context.CancelFunc
 port int
 username, password string
 closed bool
}

func (s *Session) Port() int { return s.port }
func (s *Session) Username() string { return s.username }
func (s *Session) Password() string { return s.password }

// Keep closed ports occupied for the remainder of the app process. This stops
// a persistent old iOS worker from reaching a later environment on a reused port.
var closedPorts struct { sync.Mutex; listeners []net.Listener }

func (s *Session) Close() error {
 s.mu.Lock();defer s.mu.Unlock()
 if s.closed { return nil }
 s.closed=true
 s.cancel()
 err:=s.instance.Close()
 if listener, e:=net.Listen("tcp4",net.JoinHostPort("127.0.0.1",strconv.Itoa(s.port)));e==nil {
  closedPorts.Lock();closedPorts.listeners=append(closedPorts.listeners,listener);closedPorts.Unlock()
  go func(){for {c,e:=listener.Accept();if e!=nil{return};c.Close()}}()
 }
 return err
}

// Start accepts a single already-validated outbound. All inbound, logging,
// routing and DNS options are constructed here, never imported from a feed.
func Start(outboundJSON string, authenticated bool) (*Session,error) {
 if len(outboundJSON)>65536 {return nil,errors.New("proxy configuration too large")}
 var outbound map[string]any
 if stdjson.Unmarshal([]byte(outboundJSON),&outbound)!=nil || outbound==nil {return nil,errors.New("invalid proxy configuration")}
 kind,_:=outbound["type"].(string)
 switch kind {case "http","socks","shadowsocks","vmess","vless","trojan","hysteria2","tuic":default:return nil,errors.New("unsupported proxy protocol")}
 if _,found:=outbound["detour"];found{return nil,errors.New("proxy detours are not supported")}
 outbound["tag"]="proxy"
 listener,err:=net.Listen("tcp4","127.0.0.1:0");if err!=nil{return nil,errors.New("cannot allocate local proxy")}
 port:=listener.Addr().(*net.TCPAddr).Port
 listener.Close()
 inbound:=map[string]any{"type":"mixed","tag":"browser","listen":"127.0.0.1","listen_port":port}
 session:=&Session{port:port}
 if authenticated {
  random:=make([]byte,32);if _,err=rand.Read(random);err!=nil{return nil,errors.New("cannot create local proxy credentials")}
  session.username=hex.EncodeToString(random[:8]);session.password=hex.EncodeToString(random[8:])
  inbound["users"]=[]map[string]string{{"username":session.username,"password":session.password}}
 }
 config:=map[string]any{
  "log":map[string]any{"disabled":true},
  "inbounds":[]any{inbound},"outbounds":[]any{outbound},
  "dns":map[string]any{"servers":[]any{map[string]any{"type":"local","tag":"bootstrap"}},"final":"bootstrap"},
  "route":map[string]any{"final":"proxy","default_domain_resolver":"bootstrap"},
 }
 content,err:=stdjson.Marshal(config);if err!=nil{return nil,errors.New("invalid proxy configuration")}
 ctx,cancel:=context.WithCancel(include.Context(context.Background()))
 options,err:=json.UnmarshalExtendedContext[option.Options](ctx,content)
 if err!=nil {cancel();return nil,errors.New("invalid proxy protocol options")}
 instance,err:=box.New(box.Options{Context:ctx,Options:options})
 if err!=nil {cancel();return nil,errors.New("cannot prepare proxy core")}
 if err=instance.Start();err!=nil {cancel();instance.Close();return nil,errors.New("cannot start proxy core")}
 session.instance=instance;session.cancel=cancel
 return session,nil
}
