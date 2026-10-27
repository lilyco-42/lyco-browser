(function(){
  'use strict';
  var section=document.getElementById('rembgPreview');if(!section)return;
  var video=section.querySelector('video'),button=document.getElementById('rembgVideoToggle');
  var note=document.getElementById('rembgVideoState'),motion=matchMedia('(prefers-reduced-motion: reduce)');
  var visible=false,manualPause=false,manualPlay=false,playing=false,failed=false,pending=false,documentReady=false;
  // Observer callbacks arrive asynchronously; a motion/network event may run
  // after the hero has scrolled out but before the cached flag is refreshed.
  function inViewport(){var r=section.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth}
  function automatic(){return false} // Bandwidth-saving: only load media after explicit user tap
  function reflect(){playing=!video.paused;button.textContent=playing?'暂停背景':'播放背景';button.setAttribute('aria-pressed',String(playing));section.dataset.playing=String(playing)}
  async function play(){
    if(!documentReady||pending||failed||!visible||!inViewport()||document.hidden)return;
    pending=true;
    video.muted=true;
    if(video.dataset.poster&&!video.poster)video.poster=video.dataset.poster;
    if(!video.getAttribute('src')){video.src=video.canPlayType('video/webm; codecs="vp9"')?video.dataset.webm:video.dataset.src;video.load()}
    try{await video.play();if(!visible||!inViewport()||document.hidden||manualPause)video.pause();note.textContent='宣传片 · 静音循环';reflect()}
    catch(_){if(!failed)note.textContent='点击播放背景，查看宣传片';reflect()}
    finally{pending=false}
  }
  function sync(){if(visible&&inViewport()&&!document.hidden&&!manualPause&&(manualPlay||automatic()))play();else{video.pause();reflect()}}
  button.onclick=function(){manualPause=playing;manualPlay=!playing;sync()};
  video.addEventListener('play',reflect);video.addEventListener('pause',reflect);
  video.addEventListener('error',function(){
    // Retry the other supported codec once; a poster remains visible on failure.
    if(video.getAttribute('src')===video.dataset.webm&&video.canPlayType('video/mp4')){
      video.src=video.dataset.src;video.load();pending=false;sync();return;
    }
    failed=true;note.textContent='宣传片暂未加载，可直接试用抠图';video.pause();reflect();button.disabled=true;
  });
  document.addEventListener('visibilitychange',sync);motion.addEventListener('change',function(){manualPlay=false;sync()});
  navigator.connection?.addEventListener('change',sync);
  if('IntersectionObserver' in window){new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;sync()},{threshold:0.15}).observe(section)}else{visible=true;sync()}
  // An unreachable poster delays window.load and, even with no web fonts,
  // FontFaceSet.ready. Keep optional media out of the document's load barrier.
  function startMedia(){documentReady=true;sync()}
  if(document.readyState==='complete')startMedia();else window.addEventListener('load',startMedia,{once:true});
})();
