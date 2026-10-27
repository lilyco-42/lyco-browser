(function(){
  'use strict';
  var products={},wallet='',account=null,selected=null,busy=false,nextBefore=null,afdianProducts=[],alipayProducts=[],stripeProducts=[],pickedStripe=null,alipayTopup=null,alipayReady=false,alipayTiers=[];
  var toolContainers={'asset-studio':'#desktopProducts','mirage-studio':'#mirageProducts','story-studio':'#storyProducts','vision-studio':'#visionProducts'};
  var labels={paid:'已支付 / 已兑换',pending:'等待支付',processing:'核对中',refunded:'已退款',active:'生效中',revoked:'已撤销',pending_delivery:'交付中，自动重试',pending_admin:'等待人工处理',expired:'已过期'};
  function feedback(message,error){var e=$('#feedback');e.textContent=message;e.hidden=false;e.dataset.error=String(!!error)}
  async function request(path,body){var requestToken=tok();var o=await api(path,body?{method:'POST',body:JSON.stringify(body)}:{});if(path!=='/products'&&tok()!==requestToken)throw new Error('账号已切换，请刷新页面');if(o.code===401){clearTok();signedOut();throw new Error('登录已过期，请重新登录')}if(o.code!==200)throw new Error(typeof o.j.detail==='string'?o.j.detail:o.code>=500?'服务器暂时繁忙，请稍后重试；如已付款请勿重复支付。':'请求未成功，请检查内容');return o.j}
  function signedOut(){clearInterval(afTimer);afEpoch++;var ext=$('#externalPayment');if(ext){ext.hidden=true;ext.textContent=''}account=null;updateTopupSummary();setAlipayButton();$('#identity').textContent='';$('#logout').hidden=true;$('#login').hidden=false;if($('#login').tagName==='DETAILS')$('#login').open=false;var a=$('#accountData');if(a)a.hidden=true;var es=$('#entitlements');if(es)es.textContent='';var os=$('#orders');if(os)os.textContent='';mountLogin({id:'loginBox',onDone:load})}
  function showAuth(wantRegister){var login=$('#login');if(!login)return;login.hidden=false;if(login.tagName==='DETAILS')login.open=true;mountLogin({id:'loginBox',onDone:load});if(wantRegister){var tab=login.querySelector('[data-m="reg"]');if(tab)tab.click()}login.scrollIntoView({behavior:'smooth',block:'start'});}
  function guard(){if(account)return true;showAuth(false);feedback('请先注册或登录网站账户，充值和商品都只发放到此账户');return false}
  function name(code){if(code==='points_topup')return '积分充值';return products[code]?products[code].name:code}
  function entitlementName(row){var purchased=row.purchase_product||(row.meta||{}).purchase_product;return name(row.product==='proxy_1m'&&['proxy_1m','proxy_3m','proxy_1y'].includes(purchased)?purchased:row.product)}
  function status(row){return row.status==='active'&&row.expires_at&&new Date(row.expires_at)<new Date()?'已过期':labels[row.status]||row.status}
  var afTimer=null,afEpoch=0,pickedTopup=null;
  function updateTopupSummary(){
    if(!$('#startAfdianTopup'))return;
    $('#topupAccount').textContent=account?account.username:'请先登录';
    $('#topupBalance').textContent=account?account.points.balance+' 积分':'登录后查看';
    $('#topupCredit').textContent=pickedTopup?'+'+pickedTopup.points_credit+' 积分':'请选择金额';
    $('#topupPrice').textContent=pickedTopup?'¥'+Number(pickedTopup.price_cny).toFixed(2):'—';
    $('#startAfdianTopup').textContent=account?'继续充值':'请先注册 / 登录账户';
    $('#startAfdianTopup').disabled=!pickedTopup||busy||!account;
    var onboarding=$('#topupOnboarding');if(onboarding)onboarding.hidden=!!account;
    $('#topupSelection').hidden=false;
    $all('#afdianTopups button').forEach(function(b){b.setAttribute('aria-pressed',String(!!pickedTopup&&b.dataset.afdian===pickedTopup.product))});
  }
  function trustedAfdianUrl(raw,code){
    try{var u=new URL(raw);
      return u.protocol==='https:'&&['afdian.com','afdian.net'].includes(u.hostname)
        &&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443')&&u.pathname==='/order/create'
        &&/^LA42-[A-F0-9]{32}$/.test(code)&&u.searchParams.get('custom_order_id')===code?u.href:null
    }catch(_){return null}
  }
  // Payment references need real crypto randomness; old WebViews lack randomUUID.
  function newPaymentReference(){
    var c=window.crypto||window.msCrypto;
    if(!c||typeof c.getRandomValues!=='function')
      throw new Error('当前浏览器不支持安全随机数，请在最新版 Safari 或 Chrome 中打开充值页');
    var bytes=new Uint8Array(16);c.getRandomValues(bytes);
    return Array.prototype.map.call(bytes,function(b){return ('0'+b.toString(16)).slice(-2)}).join('');
  }
  async function startTopup(){
    if(busy||!pickedTopup||!guard())return;
    var p=pickedTopup,uid=account.account_id,epoch=++afEpoch;
    var storage='afdian:'+uid+':'+p.product,button=$('#startAfdianTopup');
    // Stay on site until the buyer reviews the quote and clicks the checkout link.
    busy=true;button.disabled=true;button.textContent='正在生成站内充值指引…';clearInterval(afTimer);
    try{
      var ref=sessionStorage.getItem(storage)||newPaymentReference();sessionStorage.setItem(storage,ref);
      var d=await request('/payments/afdian/intents',{product:p.product,reference:ref});
      if(epoch!==afEpoch||!account||account.account_id!==uid){
        return;
      }
      var checkoutUrl=trustedAfdianUrl(d.automatic_checkout_url,d.intent_id);
      if(!checkoutUrl||d.automatic_binding!==true||Number(d.price_cny)!==Number(p.price_cny)
        ||Number(d.points_credit)!==Number(p.points_credit))
          throw new Error('支付链接或金额校验未通过，请联系管理员，切勿转账');
      var pay=$('#externalPayment');pay.hidden=false;pay.dataset.state='pending';
      pay.innerHTML='<h3>完成这次充值</h3><div class="checkout-quote"><b>¥'+esc(d.price_cny)+' → 到账 '+esc(d.points_credit)+' 积分</b><span>充值账号：'+esc(account.username)+'</span></div>'+
        '<ol class="checkout-steps"><li><h3>账号已关联到付款链接</h3><p>通过本页按钮付款，链接会自动携带网站订单标识，<strong>不需要手动填写留言核对码</strong>。请核对上方到账账号。</p><details><summary>备用核对码（一般无需填写）</summary><textarea readonly aria-label="爱发电付款留言核对码"></textarea><button id="copyTopupCode">复制核对码</button><p id="copyTopupHint" class="intro">使用旧链接或人工核对时，可复制此码。</p></details></li>'+
        '<li><h3>前往爱发电付款</h3><p>已准备你选择的 <strong>¥'+esc(d.price_cny)+'</strong> 对应商品（'+esc(d.points_credit)+' 积分），数量保持 <strong>1 份</strong>。请使用下面的专属付款按钮，不要改用收藏的旧链接或爱发电主页重新下单。</p><a id="openTopupCheckout" class="button primary" target="_blank" rel="noopener noreferrer">打开爱发电 ¥'+esc(d.price_cny)+' 充值页面 ↗</a><p class="intro">核对账号与金额后，点击上面的按钮前往付款。原页面不要关闭，付款后返回查询到账。</p></li>' +
        '<li><h3>回到这里，查看到账结果</h3><p>页面会自动核验；打开付款页面不代表已付款。暂未到账时，请先查询，<strong>不要重复付款</strong>。</p><div class="actions"><button id="checkTopup">我已付款，查询积分</button><a class="button" href="/account/#ledger">查看积分流水</a></div></li></ol>'+
        '<p id="topupStatus" class="checkout-status" role="status" data-state="pending">等待付款核验 · 尚未确认到账</p><details><summary>已经付款，积分没到账怎么办？</summary><p>不要重复充值。若留言漏填或填错，请通过微信 Lilyco42 或 QQ 1957374829 联系管理员，提供爱发电成功订单号或付款截图，以及下面的网站账号与充值信息。管理员核实后可补发到正确账号。</p><textarea id="topupSupportInfo" readonly aria-label="充值人工核对信息"></textarea></details><button id="changeTopup">返回选择金额</button>';
      pay.querySelector('textarea').value=d.remark;
      $('#topupSupportInfo').value='网站账号：'+account.username+'\n充值金额：¥'+d.price_cny+'\n应到账：'+d.points_credit+' 积分\n网站核对码：'+d.remark+'\n爱发电成功订单号：（请补充）';
      // The matching price-specific checkout URL is always visible and clickable.
      // Do not put it behind a checkbox; that made buyers think no payment link existed.
      $('#openTopupCheckout').href=checkoutUrl;
      $('#copyTopupCode').onclick=async function(){
        try{await navigator.clipboard.writeText(d.remark);this.textContent='核对码已复制';$('#copyTopupHint').textContent='备用码已复制。通过本页专属付款按钮无需填写留言。'}
        catch(_){pay.querySelector('textarea').focus();pay.querySelector('textarea').select();$('#copyTopupHint').textContent='自动复制不可用。请复制已选中的文字，再粘贴到爱发电「留言」。'}
      };
      var note=$('#topupStatus'),check=$('#checkTopup'),checking=false,paid=false,started=Date.now();
      function active(){return epoch===afEpoch&&account&&account.account_id===uid}
      async function query(){
        if(!active()){clearInterval(afTimer);return}if(checking||paid)return;
        checking=true;check.disabled=true;check.textContent='正在核验付款…';
        try{
          var state=await request('/payments/afdian/intents/'+encodeURIComponent(d.intent_id)+'/check',{});
          if(!active())return;
          if(state.status==='paid'){
            paid=true;clearInterval(afTimer);sessionStorage.removeItem(storage);await load();if(!active())return;
            pay.dataset.state='paid';note.dataset.state='paid';note.textContent='充值成功 · '+d.points_credit+' 积分已到账。可在积分流水中核对余额。';
            check.textContent='积分已到账';$('#openTopupCheckout').hidden=true;$('#copyTopupCode').hidden=true;$('#changeTopup').textContent='再充一笔';feedback(note.textContent);
          }else{note.dataset.state='pending';note.textContent='尚未确认到账。已付款请确认使用了本页专属链接、金额与数量正确；自动核验会继续，无需再次付款。'}
        }catch(e){if(active()){note.dataset.state='error';note.textContent='查询暂未成功：'+e.message+'。这不代表付款失败，请稍后再查询，不要重复付款。'}}
        finally{checking=false;if(!paid){check.disabled=false;check.textContent='我已付款，查询积分'}}
      }
      check.onclick=query;
      $('#changeTopup').onclick=function(){afEpoch++;clearInterval(afTimer);pay.hidden=true;pay.textContent='';updateTopupSummary();$('#topup').scrollIntoView({behavior:'smooth'});feedback(paid?'可选择金额，再充一笔。':'原充值记录保留；已经付款请选回原档位查询，不要再次付款。')};
      afTimer=setInterval(function(){if(Date.now()-started>600000){clearInterval(afTimer);note.textContent='自动查询已暂停。已付款请点击“我已付款，查询积分”继续核验，不要重复付款。';return}query()},15000);
      feedback('站内充值指引已准备好。请核对账号与金额，再点击「打开爱发电 ¥'+d.price_cny+' 充值页面」。账号已自动关联，无需填写留言核对码；未到账不要重复付款。');
      pay.scrollIntoView({behavior:'smooth'});
    }catch(e){
      if(epoch===afEpoch){feedback('充值指引未能生成：'+e.message+'。请先核对账户与订单；如已付款切勿再次付款。',true)}
    }
    finally{busy=false;updateTopupSummary()}
  }
  function renderTopups(){
    var box=$('#afdianTopups');if(!box)return;box.textContent='';
    var packs=afdianProducts.filter(function(p){return p.points_credit>0});
    $('#afdianTopupState').textContent=packs.length?'选金额，核对账号，再前往爱发电付款。':'爱发电充值档位尚未开放，请稍后再来。';
    pickedTopup=packs.find(function(p){return pickedTopup&&p.product===pickedTopup.product})||packs.find(function(p){return p.price_cny===6})||packs[0]||null;
    packs.forEach(function(p){
      var b=document.createElement('button');b.dataset.afdian=p.product;
      b.innerHTML='<strong>¥'+esc(p.price_cny)+'</strong><span>'+esc(p.points_credit)+' 积分</span>';b.setAttribute('aria-label','充值 '+p.price_cny+' 元，到账 '+p.points_credit+' 积分');
      b.onclick=function(){if(busy)return;var pay=$('#externalPayment'),pending=!pay.hidden&&pay.dataset.state==='pending';pickedTopup=p;afEpoch++;clearInterval(afTimer);pay.hidden=true;pay.textContent='';updateTopupSummary();if(pending)feedback('原充值记录保留；已经付款请选回原档位查询，不要再次付款。')};box.appendChild(b);
    });$('#startAfdianTopup').onclick=startTopup;updateTopupSummary();
  }
  function setAlipayButton(){
    var btn=$('#startAlipayTopup');if(!btn)return;
    btn.disabled=!alipayReady||!account||!alipayTopup||busy;
    btn.textContent=!alipayReady?'支付宝商户待开通':!account?'请先注册 / 登录账户':'前往支付宝收银台';
  }
  function renderAlipayTopups(){
    var box=$('#alipayPacks');if(!box)return;box.textContent='';
    var status=$('#alipayTopupState');
    if(!alipayReady||!alipayTiers.length){
      status.textContent='支付宝商户签约或安全配置尚未完成，目前不能用支付宝充值，请勿向个人二维码转账。';
      alipayTopup=null;setAlipayButton();return;
    }
    status.textContent='选择充值档位，支付宝付款经服务器核验成功后自动增加积分。';
    alipayTopup=alipayTiers.includes(alipayTopup)?alipayTopup:(alipayTiers.includes(10)?10:alipayTiers[0]);
    alipayTiers.forEach(function(amount){
      var b=document.createElement('button');b.dataset.alipayAmount=String(amount);
      b.innerHTML='<strong>¥'+amount+'</strong><span>'+(amount*10)+' 积分</span>';
      b.setAttribute('aria-pressed',String(amount===alipayTopup));
      b.onclick=function(){if(busy)return;alipayTopup=amount;renderAlipayTopups()};
      box.appendChild(b);
    });
    $('#startAlipayTopup').onclick=startAlipayTopup;
    setAlipayButton();
  }
  async function startAlipayTopup(){
    if(busy||!alipayReady||!alipayTopup||!guard())return;
    var amount=alipayTopup,uid=account.account_id,storage='alipay:points:'+uid+':'+amount;
    busy=true;setAlipayButton();
    try{
      var ref=sessionStorage.getItem(storage)||newPaymentReference();
      sessionStorage.setItem(storage,ref);
      var d=await request('/payments/alipay/topups',{amount_cny:amount,reference:ref});
      if(!account||account.account_id!==uid)throw new Error('登录账号已变化，请重新核对');
      if(Number(d.amount_cny)!==amount||Number(d.points_credit)!==amount*10||
         d.environment!=='production'||!/^AP[A-F0-9]{24}$/.test(d.order_no))
        throw new Error('付款金额或订单校验失败，请不要付款');
      var container=document.createElement('div');
      container.hidden=true;container.innerHTML=d.payment_html;
      var form=container.querySelector('form');
      if(!form||form.method.toLowerCase()!=='post'||
         !['https://openapi.alipay.com/gateway.do'].includes(form.action.split('?')[0]))
        throw new Error('支付宝收银台地址校验失败');
      container.querySelectorAll('script').forEach(function(s){s.remove()});
      sessionStorage.setItem('alipay-return-order',d.order_no);
      document.body.appendChild(container);
      feedback('正在前往支付宝。返回本站后将由服务器核验订单，切勿重复付款。');
      form.submit();
    }catch(e){
      feedback('支付宝充值暂不可用：'+e.message+'。如已经支付，请在我的账户核对订单，不要重复付款。',true);
    }finally{busy=false;setAlipayButton()}
  }
  function setStripeButton(){var btn=$('#startStripeTopup');if(!btn)return;btn.disabled=!pickedStripe||busy||!account;btn.textContent=account?'前往 Stripe 收银台':'请先注册 / 登录账户'}
  function renderStripeTopup(){
    var box=$('#stripePacks');if(!box)return;box.textContent='';
    var packs=stripeProducts.filter(function(p){return p.points_credit>0});
    $('#stripeTopupState').textContent=packs.length?'选择金额，前往 Stripe 收银台付款。付款后回到本站自动核验到账。':'Stripe 在线充值暂未开放，请稍后再来。';
    $('#startStripeTopup').onclick=startStripeTopup;
    if(!packs.length){setStripeButton();return}
    pickedStripe=packs.find(function(p){return pickedStripe&&p.product===pickedStripe.product})||packs.find(function(p){return p.price_cny===6})||packs[0];
    packs.forEach(function(p){
      var b=document.createElement('button');b.dataset.stripe=p.product;
      b.innerHTML='<strong>¥'+esc(p.price_cny)+'</strong><span>'+esc(p.points_credit)+' 积分</span>';b.setAttribute('aria-label','Stripe 充值 '+p.price_cny+' 元，到账 '+p.points_credit+' 积分');
      b.setAttribute('aria-pressed',String(!!pickedStripe&&pickedStripe.product===p.product));
      b.onclick=function(){if(busy)return;pickedStripe=p;renderStripeTopup();feedback('已选择 Stripe 充值 ¥'+p.price_cny+'，点击“前往 Stripe 收银台”继续。')};box.appendChild(b);
    });setStripeButton();
  }
  async function startStripeTopup(){
    if(busy||!pickedStripe||!guard())return;
    var p=pickedStripe,uid=account.account_id,storage='stripe:'+uid+':'+p.product;
    var ref=sessionStorage.getItem(storage)||newPaymentReference();sessionStorage.setItem(storage,ref);
    var btn=$('#startStripeTopup');busy=true;btn.disabled=true;
    try{
      var d=await request('/payments/stripe/intents',{product:p.product,reference:ref});
      sessionStorage.setItem('stripe-return-order',d.order_no);
      feedback('Stripe 收银台已就绪，请完成付款；付款后回到本站自动核验到账。');
      window.location.href=d.url;
    }catch(e){sessionStorage.removeItem(storage);feedback(e.message,true)}finally{busy=false;setStripeButton()}
  }
  function safeSubscription(url){try{var u=new URL(url);return u.protocol==='https:'&&u.hostname==='lain42.top'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&!u.search&&!u.hash&&/^(?:\/panel\/api\/sub\/[A-Za-z0-9_-]{6,128}|\/studio\/api\/kr\/shared\/[A-Za-z0-9_-]{43}\/clash)$/.test(u.pathname)?u.href:null}catch(_){return null}}
function safeMusic(url){try{var u=new URL(url);return u.protocol==='https:'&&u.hostname==='lain42.top'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&!u.search&&!u.hash&&/^\/studio\/api\/music\/sub\/[A-Za-z0-9_-]{6,128}$/.test(u.pathname)?u.href:null}catch(_){return null}}
function musicSubUrl(e){if(!e||!e.product||e.product.indexOf('music_')!==0)return null;var m=e.meta||{};return safeMusic(m.sub_url||(e.license_key?'https://lain42.top/studio/api/music/sub/'+encodeURIComponent(e.license_key):null))}
  function renderProducts(){var box=$('#products');if(!box)return;box.innerHTML='';if($('#projectProducts'))$('#projectProducts').textContent='';['#subscriptionProducts','#musicProducts'].forEach(function(selector){var target=$(selector);if(target)target.textContent=''});Object.values(toolContainers).forEach(function(selector){var target=$(selector);if(target)target.textContent=''});Object.values(products).sort(function(a,b){return Number(b.code.startsWith('rembg_'))-Number(a.code.startsWith('rembg_'))}).forEach(function(p){
    if(p.code==='lytrade_panel')return;
    if(p.delivery_kind==='source_download'||p.delivery_kind==='desktop_download'){
      var desktop=p.delivery_kind==='desktop_download',mirage=p.tool==='mirage-studio',story=p.tool==='story-studio',vision=p.tool==='vision-studio',projects=$(desktop?toolContainers[p.tool]:'#projectProducts');if(!projects)return;
      var card=document.createElement('article');card.className='tile';card.id=p.code;
      card.innerHTML='<h3>'+esc(p.name)+'</h3><p>'+esc(p.desc)+'</p><small>'+esc(desktop&&p.runtime_license?'MIT 自有代码 + Spine 独立许可':p.license)+' · '+esc(p.stars)+' 星 · 版本 '+esc(p.version)+'</small><div class="price">'+esc(p.points_price)+' <small>积分 · ¥'+esc(p.price_cny)+'</small></div>';
      var official=document.createElement('a');official.href=p.source_url;official.target='_blank';official.rel='noopener noreferrer';official.textContent=desktop?'界面与引擎免费源码 ↗':'官方免费源码 ↗';card.appendChild(official);
      if(desktop){
        var requirements=document.createElement('p');requirements.className='intro';requirements.textContent=p.requirements+(vision?' · 八项图片工具，背景提取不是 AI 抠图；HTML 截图需要 Chrome/Edge':story?' · 离线剧情预览及工程导出，不附官方引擎或素材':p.runtime_license?' · 集成 Spine 3.8（'+p.runtime_license+'，非 MIT）':' · 灰度透明 PNG，不含 Spine Runtime');card.appendChild(requirements);
        var freePackage=document.createElement('a');freePackage.className='button';freePackage.href=p.official_download_url;freePackage.target='_blank';freePackage.rel='noopener noreferrer';freePackage.textContent='GitHub 免费工具包 ↗';card.appendChild(freePackage);
        if(p.official_installer_url){var installer=document.createElement('a');installer.className='button';installer.href=p.official_installer_url;installer.target='_blank';installer.rel='noopener noreferrer';installer.textContent='Windows 免费安装 EXE ↗';card.appendChild(installer);var installNote=document.createElement('small');installNote.textContent='安装器暂未代码签名，Windows 可能显示未知发布者；请核对官方 Release 的 SHA256。需要 WebView2，缺少时程序会提示。';card.appendChild(installNote)}
        if(p.runtime_license){var runtimeLicense=document.createElement('a');runtimeLicense.href='https://esotericsoftware.com/spine-runtimes-license';runtimeLicense.target='_blank';runtimeLicense.rel='noopener noreferrer';runtimeLicense.textContent='Spine Runtime 许可 ↗';card.appendChild(runtimeLicense)}
      }
      var license=document.createElement('a');license.href=p.license_url;license.target='_blank';license.rel='noopener noreferrer';license.textContent='查看原许可证 ↗';card.appendChild(license);
      var buy=document.createElement('button');buy.className='primary';buy.dataset.product=p.code;buy.disabled=!p.available;buy.textContent=p.available?'用积分购买加速下载':'加速文件准备中 · 请用官方入口';
      buy.onclick=function(){if(!guard())return;selected=p;$('#quote').textContent=p.name+'，需 '+p.points_price+' 积分。'+(desktop?'交付 '+p.requirements+' 的完整工具 ZIP；解压整个文件夹后启动。'+(vision?'框选裁剪、调整尺寸、取色、图片对比、纯色背景提取、转 SVG、信息与可信 HTML 截图。无需账号或 AI 模型。背景提取不是 AI 抠图。':story?'编辑 DSL、导入背景、预览对白和分支，导出 LetsGal 工程；不是独立游戏安装包。':mirage?'两张图片合成灰度透明 PNG，黑白背景预览并导出；无需账号或 AI 模型。':'集成 AIC 和 Spine 3.8 播放器，随包保留 Runtime 许可，不含游戏素材或 Spine Editor。')+'GitHub 工具包免费，此处购买整理与加速交付服务。':'交付固定版本源码 ZIP，不是安装包；官方源码免费。')+'当前余额 '+account.points.balance+' 积分。';$('#pay').disabled=busy;$('#confirm').showModal()};card.appendChild(buy);projects.appendChild(card);return;
    }
    var el=document.createElement('article');el.className='tile';el.id=p.code;el.innerHTML='<h3>'+esc(p.name)+'</h3><p>'+esc(p.desc)+'</p><div class="price">'+esc(p.points_price)+' <small>积分</small></div><small>'+esc(p.duration_days?p.duration_days+' 天权益':'数字权益')+' · '+esc(p.code.startsWith('proxy_kr_')?'¥'+p.price_cny+' · '+(p.sale_open===false?'待开通':'可购买'):(['proxy_1m','proxy_3m','proxy_1y'].includes(p.code)?'请先充值积分，再购买套餐':p.price_usdt+' USDT 等值'))+'</small>';
    var button=document.createElement('button');button.className='primary';button.textContent=p.sale_open===false?'线路验收中 · 暂未开售':'用积分购买';button.disabled=p.sale_open===false;button.dataset.product=p.code;button.onclick=function(){if(!guard())return;selected=p;$('#quote').textContent=p.name+'，需 '+p.points_price+' 积分。当前余额 '+account.points.balance+' 积分。';$('#pay').disabled=busy;$('#confirm').showModal()};el.appendChild(button);
    if(afdianProducts.some(function(a){return a.product===p.code})){var af=document.createElement('button');af.textContent='爱发电购买 · ¥'+p.price_cny;af.dataset.afdian=p.code;af.onclick=async function(){if(busy||!guard())return;clearInterval(afTimer);afEpoch++;busy=true;af.disabled=true;var uid=account.account_id;try{var storage='afdian:'+uid+':'+p.code,ref=sessionStorage.getItem(storage)||newPaymentReference();sessionStorage.setItem(storage,ref);var d=await request('/payments/afdian/intents',{product:p.code,reference:ref});var box=$('#externalPayment');box.hidden=false;if(window.revealStoreSection)window.revealStoreSection(box);box.textContent='';var info=document.createElement('p');info.textContent='购买 '+p.name+'（¥'+d.price_cny+'），只买一份 / 一个月。专属付款链接已带入网站订单标识，无需手动填写留言核对码。请用本页购买按钮付款。';box.appendChild(info);var ta=document.createElement('textarea');ta.readOnly=true;ta.value=d.remark;ta.setAttribute('aria-label','爱发电付款留言核对码');box.appendChild(ta);var cpb=document.createElement('button');cpb.textContent='复制核对码';cpb.onclick=function(){cp(d.remark,'',cpb)};box.appendChild(cpb);var link=document.createElement('a');link.className='button';link.href=d.automatic_checkout_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='打开爱发电购买';box.appendChild(link);var check=document.createElement('button');check.textContent='我已付款，查询权益';check.onclick=async function(){check.disabled=true;try{var state=await request('/payments/afdian/intents/'+encodeURIComponent(d.intent_id)+'/check',{});feedback(state.status==='paid'?'付款已核验，权益已保存到“我的账户”。':'暂未匹配到付款。请检查购买留言和金额，或联系管理员核对。');if(state.status==='paid'){sessionStorage.removeItem(storage);await load()}}catch(e){feedback(e.message,true)}finally{check.disabled=false}};box.appendChild(check);feedback('购买核对码已生成，尚未付款。');box.scrollIntoView({behavior:'smooth'})}catch(e){sessionStorage.removeItem('afdian:'+uid+':'+p.code);feedback(e.message,true)}finally{busy=false;af.disabled=false}};el.appendChild(af)}
    if(alipayProducts.includes(p.code)){var ap=document.createElement('button');ap.textContent='支付宝购买 · ¥'+p.price_cny;ap.dataset.alipay=p.code;ap.onclick=async function(){if(busy||!guard())return;busy=true;ap.disabled=true;var storage='alipay:'+account.account_id+':'+p.code;try{var ref=sessionStorage.getItem(storage)||newPaymentReference();sessionStorage.setItem(storage,ref);var d=await request('/payments/alipay/intents',{product:p.code,reference:ref});sessionStorage.setItem('alipay-return-order',d.order_no);var container=document.createElement('div');container.innerHTML=d.payment_html;var form=container.querySelector('form');if(!form||form.method.toLowerCase()!=='post'||!['https://openapi.alipay.com/gateway.do','https://openapi-sandbox.dl.alipaydev.com/gateway.do'].includes(form.action.split('?')[0]))throw new Error('支付表单无效');container.querySelectorAll('script').forEach(function(s){s.remove()});document.body.appendChild(container);form.submit()}catch(e){sessionStorage.removeItem(storage);feedback(e.message,true)}finally{busy=false;ap.disabled=false}};el.appendChild(ap)}var target=p.code.startsWith('proxy_')?$('#subscriptionProducts'):p.code.startsWith('music_')?$('#musicProducts'):box;(target||box).appendChild(el);
  });document.dispatchEvent(new Event('store:catalogready'))}
  async function loadOrders(append){var data=await request('/account/orders'+(append&&nextBefore?'?before='+nextBefore:''));if(!append)$('#orders').innerHTML='';data.items.forEach(function(o){var el=document.createElement('article');el.className='record';el.innerHTML='<header><b>'+esc(name(o.product))+'</b><span>'+esc(labels[o.status]||o.status)+'</span></header><p>'+esc(o.order_no)+' · '+esc(fmtDate(o.created_at))+'</p><small>'+esc(o.payment_method==='points'?Math.abs(o.points_delta)+' 积分':o.payment_method==='card'?'卡密兑换':o.payment_method==='afdian'||o.payment_method==='alipay'?'¥'+Number(o.amount_cny).toFixed(2)+' · '+(o.payment_method==='afdian'?'爱发电':'支付宝'):o.amount_usdt+' USDT')+'</small>';if(o.status==='pending'&&o.payment_method==='usdt'){var notice=document.createElement('p');notice.className='warning';notice.textContent=Date.now()-new Date(o.created_at).getTime()>7200000?'该订单已过自动对账窗口，请先联系人工核对，不要继续转账。':'TRC20 转账精确金额 '+o.amount_usdt+' USDT，确认前不会到账。收款地址：'+wallet;el.appendChild(notice);}$('#orders').appendChild(el)});if(!data.items.length&&!append)$('#orders').textContent='还没有订单';nextBefore=data.next_before;$('#moreOrders').hidden=!nextBefore}
  function renderAccount(){if(!$('#accountData'))return;$('#accountData').hidden=false;$('#balance').textContent=account.points.balance+' 分';$('#entitlements').innerHTML='';account.entitlements.slice().reverse().forEach(function(e){var el=document.createElement('article');el.className='record';el.innerHTML='<header><b>'+esc(entitlementName(e))+'</b><span class="status">'+esc(status(e))+'</span></header><p>到期：'+esc(fmtDate(e.expires_at))+'</p>';
    if(e.status==='active'){
      if(e.meta&&e.meta.download_artifact){
        var a=e.meta.download_artifact, info=document.createElement('p');info.textContent=(a.delivery_kind==='desktop_download'?'完整桌面工具 ZIP（'+a.platform+'）':'固定版本源码 ZIP')+' · '+a.size+' 字节 · SHA-256: '+a.sha256;info.style.overflowWrap='anywhere';el.appendChild(info);
        var action=document.createElement('button');action.textContent='生成下载链接';var link=document.createElement('a');link.className='button';link.textContent='下载 ZIP';link.hidden=true;el.appendChild(action);el.appendChild(link);
        action.onclick=async function(){this.disabled=true;link.hidden=true;try{var d=await request('/project-downloads/'+encodeURIComponent(e.license_key)),u=new URL(d.url);if(u.protocol!=='https:'||!(u.hostname.endsWith('.workers.dev')||u.hostname==='files.lain42.top'))throw new Error('下载地址校验失败');link.href=u.href;link.referrerPolicy='no-referrer';link.hidden=false;feedback('下载链接已生成，2 分钟内有效。过期后可再次生成，不重复扣积分。')}catch(err){feedback(err.message,true)}finally{this.disabled=false}};
        $('#entitlements').appendChild(el);return;
      }
      var sub=safeSubscription(e.meta&&e.meta.sub_url);var music=musicSubUrl(e);
      var value=music||sub||e.license_key;var ta=document.createElement('textarea');ta.readOnly=true;ta.value=value;ta.setAttribute('aria-label',sub?'代理订阅链接':music?'音乐订阅链接':'授权 / 激活信息');el.appendChild(ta);var acts=document.createElement('div');acts.className='actions';var copy=document.createElement('button');copy.textContent=(sub||music)?'复制订阅链接':'复制授权';copy.onclick=function(){cp(value,'',copy)};acts.appendChild(copy);
      if(music){var mh=document.createElement('p');mh.className='intro';mh.textContent='在 LX Music 客户端「会员」页粘贴此链接并激活，即可一键补全全部第三方音源；会员到期后订阅自动失效。';el.appendChild(mh);var mg=document.createElement('a');mg.className='button';mg.href='/downloads/';mg.textContent='下载 LX Music 客户端';acts.appendChild(mg);}
      if(sub){
        var label=document.createElement('label');label.textContent='选择代理客户端';
        var select=document.createElement('select');select.setAttribute('aria-label','代理客户端');
        [['clash','🖥️ Windows / Mac · Clash Verge Rev'],['base64','📱 iPhone · Karing 通用订阅'],['clashjp','🇯🇵 日本节点 · Clash Verge'],['base64jp','🇯🇵 日本节点 · Karing']].forEach(function(item){var option=document.createElement('option');option.value=item[0];option.textContent=item[1];select.appendChild(option)});
        label.appendChild(select);el.insertBefore(label,ta);
        var launch=document.createElement('a');launch.className='button';launch.textContent='导入 Clash Verge';launch.dataset.subscriptionImport='clash';launch.referrerPolicy='no-referrer';acts.appendChild(launch);
        var help=document.createElement('p');help.className='intro';el.appendChild(help);
        var guide=document.createElement('a');guide.className='button';guide.href='/proxy-guide/';guide.textContent='Mac / Windows 安装与使用说明';acts.appendChild(guide);
        function chooseSubscription(){
          if(e.product==='proxy_kr_shared_1m'){
            value=sub;ta.value=value;
            select.innerHTML='<option value="clash">韩国游戏 · Clash Verge Rev</option>';
            select.disabled=true;
            copy.textContent='复制韩国 Clash 订阅';
            launch.hidden=false;
            launch.href='clash://install-config?url='+encodeURIComponent(value);
            help.textContent='韩国固定 VLESS 节点。游戏需要代理时请启用 TUN 模式；月卡到期后订阅将停止更新。';
            return;
          }
          var token=new URL(sub).pathname.split('/').pop(),format=select.value;
          value='https://lain42.top/studio/api/sub/'+encodeURIComponent(token)+'/'+format;ta.value=value;
          copy.textContent=format==='clash'||format==='clashjp'?'复制 Clash 订阅':'复制 Karing / 通用订阅';
          launch.hidden=!format.startsWith('clash');launch.href='clash://install-config?url='+encodeURIComponent(value);
          help.textContent=format.endsWith('jp')?'日本线路：可手动选择节点。建议使用自动选择获得更稳定体验。':format==='clash'?'在 Clash Verge Rev 导入 URL，选择 PROXY → 自动选择。':'iPhone 用 Karing：配置 → 添加远程配置 → 粘贴通用订阅链接 → 更新 → 选择具体节点。';
        }
        select.onchange=chooseSubscription;chooseSubscription();
      }
      if(e.product.startsWith('rembg_')){var save=document.createElement('button');save.textContent='保存授权文件';save.onclick=function(){var u=URL.createObjectURL(new Blob([value],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=e.product+'-license.txt';a.click();setTimeout(function(){URL.revokeObjectURL(u)},5000)};acts.appendChild(save);var dl=document.createElement('a');dl.className='button';dl.href='https://github.com/lilyco-42/rembg-ui/releases/latest';dl.textContent='桌面版下载';acts.appendChild(dl)}el.appendChild(acts)
    }$('#entitlements').appendChild(el)
  });if(!account.entitlements.length)$('#entitlements').textContent='还没有权益，去商城购买或兑换卡密。';$('#ledger').innerHTML=account.points.entries.map(function(e){return '<div class="record"><b>'+(e.delta>0?'+':'')+esc(e.delta)+' 分</b> · '+esc(e.reason)+'<br><small>'+esc(fmtDate(e.created_at))+' · 余额 '+esc(e.balance_after)+'</small></div>'}).join('')||'暂无流水'}
  async function load(){try{if(tok()){var next=await request('/me');if(account&&account.account_id!==next.account_id){clearInterval(afTimer);afEpoch++;var ext=$('#externalPayment');if(ext){ext.hidden=true;ext.textContent=''}}account=next;$('#login').hidden=true;$('#identity').textContent='账号：'+account.username+' · '+account.points.balance+' 积分';if(window.renderAvatar)window.renderAvatar(account);$('#logout').hidden=false;renderAccount();updateTopupSummary();setAlipayButton();if($('#orders'))await loadOrders(false)}else signedOut()}catch(e){feedback(e.message,true)}}
  if($('#topupRegister'))$('#topupRegister').onclick=function(){showAuth(true)};
  if($('#topupLogin'))$('#topupLogin').onclick=function(){showAuth(false)};
  $('#logout').onclick=function(){clearInterval(afTimer);clearTok();signedOut();feedback('已退出账户')};
  if($('#refresh'))$('#refresh').onclick=load;
  if($('#moreOrders'))$('#moreOrders').onclick=async function(){this.disabled=true;try{await loadOrders(true)}catch(e){feedback(e.message,true)}finally{this.disabled=false}};
  if($('#redeemForm'))$('#redeemForm').onsubmit=async function(e){e.preventDefault();if(busy||!guard())return;busy=true;$('#redeemButton').disabled=true;feedback('正在兑换，请稍等…');try{var result=await request('/redeem',{code:$('#code').value});feedback(result.delivery_status==='pending_delivery'?'兑换已记录，代理开通中。请稍后刷新权益。':'兑换成功，授权已保存在“我的权益”。');$('#code').value='';await load()}catch(err){feedback(err.message,true)}finally{busy=false;$('#redeemButton').disabled=false}};
  if($('#confirm')){
    $('#cancel').onclick=function(){$('#confirm').close()};$('#pay').onclick=async function(){if(busy||!guard())return;busy=true;this.disabled=true;var p=selected,storageKey='shop-purchase:'+account.account_id+':'+p.code,ref=null;
      try{var old=JSON.parse(sessionStorage.getItem(storageKey)||'null');ref=old&&Date.now()-old.time<300000?old.ref:null;if(!ref){ref=newPaymentReference();sessionStorage.setItem(storageKey,JSON.stringify({ref:ref,time:Date.now()}))}$('#confirm').close();feedback('正在购买，请不要重复点击…');var result=await request('/points/purchase',{product:p.code,reference:ref});feedback('购买已确认，订单 '+result.order.order_no+'。请在“我的账户”查看授权与交付状态。');var btn=document.querySelector('[data-product="'+p.code+'"]');btn.disabled=true;btn.textContent='已购买 · 查看我的账户';await load()}catch(err){feedback(err.message+'。可以重试或在我的账户查看订单。',true)}finally{busy=false;$('#pay').disabled=false}
    };
    $('#topupButton').onclick=async function(){if(busy||!guard())return;busy=true;this.disabled=true;try{var v=$('#amount').value,result=await request('/points/topup',{usdt:v});var box=$('#payment');box.hidden=false;box.innerHTML='<p>订单 '+esc(result.order_no)+'</p><p>转账 <b>'+esc(result.amount_usdt)+' USDT（TRC20）</b></p><textarea readonly aria-label="收款地址">'+esc(result.wallet)+'</textarea><p>精确金额含对账尾数，请在创建后两小时内支付。未确认前不会增加积分。</p><button id="checkPayment">查询到账状态</button>';$('#checkPayment').onclick=async function(){try{var state=await request('/orders/'+encodeURIComponent(result.order_no));feedback('订单状态：'+(labels[state.order.status]||state.order.status));await load()}catch(err){feedback(err.message,true)}};feedback('充值订单已创建，尚未付款。')}catch(err){feedback(err.message,true)}finally{busy=false;this.disabled=false}};
  }
  function scrollShopSection(){
    if(!$('#products'))return;
    var id=location.hash.slice(1);
    if(id==='register'||id==='login'){if(!account)showAuth(id==='register');return}
    if(!['topup','catalogTitle','aiServices','projectDownloads','desktopTools','miragePreview','storyStudio','visionStudio','rembgPreview'].includes(id)&&!Object.prototype.hasOwnProperty.call(products,id))return;
    var target=document.getElementById(id);if(target)requestAnimationFrame(function(){target.scrollIntoView({block:'start',behavior:'instant'})});
  }
  window.addEventListener('hashchange',scrollShopSection);
  request('/products').then(async function(data){wallet=data.wallet;data.products.forEach(function(p){products[p.code]=p});if($('#rate'))$('#rate').textContent='1 USDT = '+data.points_exchange.points_per_usdt+' 积分。现有积分余额保持不变。';try{var af=await request('/payments/afdian');afdianProducts=af.products||[]}catch(_){}try{var ap=await request('/payments/alipay');alipayProducts=ap.products||[];alipayReady=ap.configured===true&&ap.environment==='production';alipayTiers=Array.isArray(ap.topup_tiers_cny)?ap.topup_tiers_cny.filter(function(x){return Number.isSafeInteger(x)&&x>0}):[]}catch(_){alipayReady=false;alipayTiers=[]}try{var st=await request('/payments/stripe');stripeProducts=st.packs||[]}catch(_){}renderProducts();renderTopups();renderStripeTopup();renderAlipayTopups();await load();scrollShopSection()}).catch(function(e){feedback(e.message,true);if($('#products'))$('#products').textContent='商品加载失败，请刷新重试。'});
  window.addEventListener('storage',function(e){if(e.key==='wb-token')load()});
})();
