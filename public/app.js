import { initDB, put, all, remove, clear, blobUrl, releaseUrls, download, pause, cleanMime, durationOf, createVideoThumbnail, detectSceneFrames, toBase64, extractSpeechChunks, composeAlignedSpeech, trimSpeechAudio, replaceVideoAudio, composeNarratedVideo, Recorder } from './media.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = n => {
  const p = {
    video:'<rect x="2" y="5" width="14" height="14" rx="3"/><path d="M16 10l6-3v10l-6-3z"/>',
    pen:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/>',
    settings:'<path d="M12 3l2 3 4-1 1 4 3 3-3 2-1 4-4-1-2 3-2-3-4 1-1-4-3-2 3-3 1-4 4 1z"/><circle cx="12" cy="12" r="3"/>',
    upload:'<path d="M12 16V3M7 8l5-5 5 5M3 15v5a1 1 0 001 1h16a1 1 0 001-1v-5"/>',
    down:'<path d="M12 3v13M7 11l5 5 5-5M3 16v4h18v-4"/>',
    play:'<path d="M7 3l14 9-14 9z"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
    trash:'<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    logout:'<path d="M9 3H3v18h6M9 12h13M17 7l5 5-5 5"/>',
    magic:'<path d="M4 20L17 7M14 4l6 6M5 2v4M3 4h4M19 15v6M16 18h6"/>',
    shield:'<path d="M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/><path d="M8 12l3 3 5-6"/>',
    refresh:'<path d="M20 7a9 9 0 10.5 10M20 2v6h-6"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${p[n]||p.magic}</svg>`;
};
const logo='<img class="logo-icon" src="/favicon.svg" alt="">';
const clock=s=>`${String(Math.floor((s||0)/60)).padStart(2,'0')}:${String(Math.floor((s||0)%60)).padStart(2,'0')}`;
const size=b=>(b/1024/1024).toFixed(1)+' MB';
const S={session:null,page:'media',assets:[],selectedVideo:null,camera:new Recorder(),progress:new Set(),latestAudio:null,latestScriptSourceVideoId:null,voiceMediaOverride:null,adminState:null,cloneJob:null,scriptStyles:{defaults:[],custom:[]}};
const pages={media:'Tư liệu video',script:'Viết kịch bản',voice:'Giọng Của Tôi',clone:'Clon giọng Video',settings:'Thiết lập'};
const canOpenPage=page=>!['settings','clone'].includes(page)||S.session?.role==='admin';
let toastTimer;

function toast(message,error=false){
  const box=$('#toast'); if(!box)return;
  box.textContent=message; box.classList.toggle('error',error); box.hidden=false;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>box.hidden=true,error?9000:4500);
}
async function api(action,body){
  const init={method:body===undefined?'GET':'POST',credentials:'same-origin',signal:AbortSignal.timeout(65000)};
  if(body!==undefined){init.headers={'Content-Type':'application/json'};init.body=JSON.stringify(body);}
  const r=await fetch(`/api/index?action=${encodeURIComponent(action)}`,init);
  if(!r.ok){let d={};try{d=await r.json()}catch{} const e=new Error(d.error||`HTTP ${r.status}`);e.status=r.status;e.code=d.code;throw e;}
  return r.headers.get('content-type')?.startsWith('audio/')?r.blob():r.json();
}
async function busy(button,fn,statusSel){
  if(!button||S.progress.has(button))return;
  S.progress.add(button);const old=button.innerHTML;button.disabled=true;button.innerHTML='<span class="spinner"></span> Đang xử lý';
  try{await fn()}catch(e){toast(e.message||'Không thể xử lý.',true);if(statusSel&&$(statusSel))$(statusSel).textContent=e.message||'Lỗi';}
  finally{S.progress.delete(button);button.disabled=false;button.innerHTML=old;}
}
function draftKey(){return `cliplab-draft-${S.session.username}`;}
function saveDraft(){
  try{localStorage.setItem(draftKey(),JSON.stringify({script:$('#script-editor')?.value||'',voice:$('#voice-text')?.value||'',duration:$('#script-duration')?.value||'60',styleId:$('#script-style')?.value||'',includeAnalysis:$('#include-analysis')?.checked??true,title:$('#script-title')?.value||''}))}catch{}
}
function loginScreen(){
  $('#app').hidden=true;$('#login-screen').hidden=false;
  $('#login-screen').innerHTML=`<div class="login-wrap"><div class="login-intro"><div class="brand">${logo}<div><strong>cliplab<span class="hero-accent">.</span></strong><small>AI CREATOR STUDIO</small></div></div><span class="eyebrow">IBEE MULTI-USER</span><h1>Tạo nội dung và<br><span class="hero-accent">giọng nói được phân quyền.</span></h1><p>Admin quản lý giọng Ibee cho từng tài khoản; tài khoản con chỉ dùng giọng được cấp.</p><div class="row"><span class="pill green">${icon('shield')} API key ở máy chủ</span><span class="pill purple">Ibee AIVoice</span></div></div><form class="login-card" id="login-form"><h2>Đăng nhập</h2><div class="field"><label>Tên đăng nhập</label><input id="username" autocomplete="username" required maxlength="50"></div><div class="field"><label>Mật khẩu</label><input id="password" type="password" autocomplete="current-password" required maxlength="500"></div><button id="login-btn" class="primary full">Vào studio</button><p id="login-error" class="login-error"></p></form></div>`;
  $('#login-form').onsubmit=e=>{e.preventDefault();busy($('#login-btn'),async()=>{await api('login',{username:$('#username').value,password:$('#password').value});await boot()},'#login-error')};
}
function workflowMarkup(current){
 const steps=[['media','Video','Quay hoặc tải video','video'],['script','Kịch bản','Viết nội dung AI','pen'],['voice','Giọng nói','Tạo audio Ibee','mic'],['clone','Video hoàn chỉnh','Ghép và xuất video','magic']].filter(step=>step[0]!=='clone'||canOpenPage('clone'));
 return `<div class="workflow" aria-label="Quy trình tạo video">${steps.map(([id,label,description,ico],index)=>`<button type="button" data-page="${id}" class="${id===current?'current':''}" aria-current="${id===current?'step':undefined}"><span class="step-icon">${icon(ico)}</span><span><strong>Bước ${index+1} · ${label}</strong><small>${description}</small></span></button>`).join('')}</div>`;
}
function mediaMarkup(){
 return `<div class="hero"><div><span class="eyebrow">VIDEO MATERIAL</span><h1>Quay hoặc tải <span class="hero-accent">video tư liệu.</span></h1><p>Chuẩn bị video, phân tích nội dung rồi tiếp tục sang bước viết kịch bản.</p></div><span class="pill">${icon('video')} Lưu trên thiết bị</span></div>${workflowMarkup('media')}
 <div class="media-columns"><section class="panel"><div class="panel-head"><h2>Studio ghi hình</h2><span class="pill green">Tối đa 3 phút</span></div>
 <div class="camera-controls"><select id="camera-facing"><option value="user">Camera trước</option><option value="environment">Camera sau</option></select><select id="camera-ratio"><option value="landscape">Ngang 16:9</option><option value="portrait">Dọc 9:16</option></select><label class="check"><input id="camera-audio" type="checkbox" checked> Micro</label></div>
 <div class="camera-box landscape" id="camera-box"><video id="camera-video" playsinline muted></video><div class="camera-empty" id="camera-empty"><span class="camera-symbol">${icon('video')}</span><strong>Quay tư liệu mới</strong><p>Hoặc tải video có sẵn bên dưới.</p></div><span id="record-time" class="rec-badge" hidden>REC 00:00</span></div>
 <div class="camera-primary-actions"><button id="open-camera" class="camera-cta camera-open">${icon('video')} Mở camera</button><button id="start-record" class="camera-cta camera-record" disabled><span class="record-dot"></span> Bắt đầu quay</button></div><div class="camera-secondary-actions"><button id="stop-record" class="camera-stop" hidden>${icon('stop')} Dừng quay</button><button id="close-camera" class="small" hidden>Đóng camera</button></div>
 <div class="dropzone"><div><strong>Tải video từ máy</strong><p>MP4, WebM, MOV · tối đa 80 MB / 3 phút</p></div><button id="choose-video" class="small">${icon('upload')} Chọn file</button><input id="video-file" type="file" accept="video/mp4,video/webm,video/quicktime,.m4v" hidden></div><p id="camera-status" class="status-line"></p></section>
 <section class="panel"><div class="panel-head"><h2>Phân tích kịch bản</h2>${icon('magic')}</div><div id="analysis-source" class="source-label">Chưa chọn video.</div>
 <label class="check"><input id="analysis-consent" type="checkbox">Tôi có quyền sử dụng video và đồng ý gửi các hình ảnh cần thiết để AI phân tích.</label><div class="field"><label>Thông tin chính xác cho AI <span class="tiny muted">(không bắt buộc)</span></label><input id="analysis-brief" maxlength="300" placeholder="Ví dụ: Đây là cây nho giống Hạ Đen, chậu trồng nho, dịch vụ chăm sóc cây..."><small>Nhập ngắn gọn tên sản phẩm, dịch vụ, giống, model hoặc thông tin AI khó tự nhận biết từ hình ảnh.</small></div><button id="analyze-btn" class="purple full">Phân tích video</button><p id="analysis-status" class="status-line"></p><div class="progress" id="analysis-progress" hidden><div></div></div></section></div>
 <section class="panel analysis-complete" id="analysis-complete" hidden><div class="analysis-complete-inner"><div><span class="complete-mark">✓</span><strong>Phân tích hoàn tất</strong><p>Kết quả đã được lưu cho video này và sẽ được dùng ở bước viết kịch bản.</p></div><button id="analysis-go-script" class="primary">${icon('pen')} Tiếp tục sang Viết kịch bản</button></div></section>
 <div class="library-heading"><h2>Thư viện video <span id="video-count" class="pill">0</span></h2></div><div id="video-library" class="asset-grid"></div>`;
}
function scriptMarkup(){
 const defaults=S.scriptStyles?.defaults||[],custom=S.scriptStyles?.custom||[],styles=[...defaults,...custom];
 const options=styles.map((style,index)=>'<option value="'+esc(style.id)+'" '+(index===0?'selected':'')+'>'+esc(style.name)+'</option>').join('');
 const customList=custom.length?'<section class="custom-style-list" aria-label="Phong cách riêng của tôi"><div class="custom-style-list-head"><div><strong>Phong cách của tôi</strong><small>Chỉ bạn có thể sửa hoặc xóa những phong cách đã tạo.</small></div><span class="pill">'+custom.length+'</span></div>'+custom.map(style=>'<div class="custom-style-item"><span title="'+esc(style.name)+'">'+esc(style.name)+'</span><div class="row"><button type="button" class="small" data-edit-script-style="'+esc(style.id)+'" aria-label="Sửa '+esc(style.name)+'">Sửa</button><button type="button" class="small danger" data-delete-script-style="'+esc(style.id)+'" aria-label="Xóa '+esc(style.name)+'">Xóa</button></div></div>').join('')+'</section>':'';
  return '<div class="hero"><div><span class="eyebrow">SCRIPT WRITER</span><h1>Viết kịch bản <span class="hero-accent">theo phong cách của bạn.</span></h1><p>Chọn thời lượng và phong cách phù hợp với video.</p></div></div>'+workflowMarkup('script')+'<div class="grid2">'+
 '<section class="panel"><div class="field"><label>Thời lượng</label><select id="script-duration"><option value="30">30 giây</option><option value="40">40 giây</option><option value="60" selected>60 giây</option><option value="90">90 giây</option><option value="120">120 giây</option></select></div>'+
 '<div class="field"><label>Phong cách</label><div class="script-style-select-row"><select id="script-style">'+options+'</select><button type="button" id="view-style-prompt" class="small">Xem Prompt</button></div></div>'+
 '<div id="style-prompt-viewer" class="notice" hidden><div class="row between"><strong id="style-prompt-title">Prompt phong cách</strong><button type="button" id="close-style-prompt" class="small">Đóng</button></div><div id="style-prompt-text" class="prompt-preview"></div></div>'+
 '<details class="custom-style-builder"><summary>+ Tạo phong cách riêng</summary><input id="custom-style-id" type="hidden"><div class="field"><label>Tên phong cách</label><input id="custom-style-name" maxlength="80" placeholder="Ví dụ: Review chân thật"></div><div class="field"><label>Prompt</label><textarea id="custom-style-prompt" rows="6" maxlength="6000" placeholder="Mô tả cách viết, giọng điệu, cấu trúc mở đầu, cách kết thúc..."></textarea></div><div class="row"><button type="button" id="create-script-style" class="primary">Lưu phong cách</button><button type="button" id="cancel-edit-script-style" class="small" hidden>Hủy sửa</button></div><p id="custom-style-status" class="status-line"></p></details>'+customList+
 '<label class="check"><input id="include-analysis" type="checkbox" checked>Dùng kết quả phân tích video đang chọn.</label><div class="field" id="script-title-field" hidden><label>Tiêu đề / chủ đề mong muốn</label><input id="script-title" maxlength="300" placeholder="Ví dụ: 3 lý do nên trồng nho trên sân thượng"></div><button id="generate-script" class="primary full">Tạo kịch bản</button><p id="script-status" class="status-line"></p></section>'+
 '<section class="panel"><div class="field"><label>Bản thảo</label><textarea id="script-editor" class="script-area" rows="17"></textarea></div><div class="row between"><span id="script-count" class="char-count">0 ký tự</span><button id="export-script" class="small">'+icon('down')+' TXT</button></div><div class="divider"></div><button id="script-to-voice" class="purple full">Đưa sang tạo giọng Ibee</button></section></div>';
}
async function loadScriptStyles(){S.scriptStyles=await api('script-styles')}
function allScriptStyles(){return [...(S.scriptStyles?.defaults||[]),...(S.scriptStyles?.custom||[])]}
function currentScriptStyle(){const id=$('#script-style')?.value;return allScriptStyles().find(style=>style.id===id)||null}
function showStylePrompt(style){
 if(!style)return;
 const title=$('#style-prompt-title'),textBox=$('#style-prompt-text'),viewer=$('#style-prompt-viewer');
 if(!title||!textBox||!viewer)return;
 title.textContent=style.name;textBox.textContent=style.prompt;viewer.hidden=false;
}
function syncScriptSourceMode(){const useAnalysis=$('#include-analysis')?.checked??true;const field=$('#script-title-field'),input=$('#script-title');if(field)field.hidden=useAnalysis;if(input)input.required=!useAnalysis}
function renderScriptPage(){
 const page=$('#page-script');if(!page)return;
 const prev={script:$('#script-editor')?.value||'',duration:$('#script-duration')?.value||'60',styleId:$('#script-style')?.value||'',includeAnalysis:$('#include-analysis')?.checked??true,title:$('#script-title')?.value||''};
 page.innerHTML=scriptMarkup();
 if($('#script-editor'))$('#script-editor').value=prev.script;
 if($('#script-duration'))$('#script-duration').value=prev.duration;
 if(prev.styleId&&$('#script-style')&&allScriptStyles().some(style=>style.id===prev.styleId))$('#script-style').value=prev.styleId;
 if($('#include-analysis'))$('#include-analysis').checked=prev.includeAnalysis;
 if($('#script-title'))$('#script-title').value=prev.title;
 syncScriptSourceMode();bindScriptEvents();updateCounts();
}
function bindScriptEvents(){
 if(!$('#generate-script'))return;
 syncScriptSourceMode();
 $('#view-style-prompt').onclick=()=>showStylePrompt(currentScriptStyle());
 const resetCustomStyleForm=()=>{$('#custom-style-id').value='';$('#custom-style-name').value='';$('#custom-style-prompt').value='';$('#create-script-style').textContent='Lưu phong cách';$('#cancel-edit-script-style').hidden=true};
 $$('[data-edit-script-style]').forEach(b=>b.onclick=()=>{const style=(S.scriptStyles.custom||[]).find(x=>x.id===b.dataset.editScriptStyle);if(!style)return;const details=$('.custom-style-builder');details.open=true;$('#custom-style-id').value=style.id;$('#custom-style-name').value=style.name;$('#custom-style-prompt').value=style.prompt;$('#create-script-style').textContent='Cập nhật phong cách';$('#cancel-edit-script-style').hidden=false;$('#custom-style-name').focus()});
 $$('[data-delete-script-style]').forEach(b=>b.onclick=()=>busy(b,async()=>{if(!confirm('Xóa phong cách riêng này?'))return;await api('script-style-delete',{styleId:b.dataset.deleteScriptStyle});await loadScriptStyles();renderScriptPage();toast('Đã xóa phong cách riêng.')},'#custom-style-status'));
 $('#cancel-edit-script-style').onclick=resetCustomStyleForm;
 $('#close-style-prompt').onclick=()=>$('#style-prompt-viewer').hidden=true;
 $('#create-script-style').onclick=()=>busy($('#create-script-style'),async()=>{const styleId=$('#custom-style-id').value,name=$('#custom-style-name').value,prompt=$('#custom-style-prompt').value;if(styleId)await api('script-style-update',{styleId,name,prompt});else await api('script-style-create',{name,prompt});await loadScriptStyles();renderScriptPage();toast(styleId?'Đã cập nhật phong cách riêng.':'Đã tạo phong cách riêng.')},'#custom-style-status');
 $('#generate-script').onclick=()=>busy($('#generate-script'),async()=>{if(!S.session.providers.deepseek)throw new Error('Chức năng viết kịch bản chưa được cấu hình.');const style=currentScriptStyle();if(!style)throw new Error('Hãy chọn phong cách.');const useAnalysis=$('#include-analysis').checked;const selected=videoAsset();const context=useAnalysis&&selected?.analysis?JSON.stringify(selected.analysis):'';const title=useAnalysis?'':($('#script-title')?.value||'').trim();if(useAnalysis&&!context)throw new Error('Hãy phân tích video đang chọn trước khi tạo kịch bản.');if(!useAnalysis&&!title){$('#script-title')?.focus();throw new Error('Hãy nhập tiêu đề hoặc chủ đề mong muốn.')}const result=await api('text',{styleId:style.id,duration:Number($('#script-duration').value),context,title});S.latestScriptSourceVideoId=useAnalysis&&selected?.id?selected.id:null;S.voiceMediaOverride=null;$('#script-editor').value=result.text;saveDraft();updateCounts();$('#script-status').textContent='Đã tạo kịch bản.'},'#script-status');
 $('#script-duration').onchange=saveDraft;
 $('#include-analysis').onchange=()=>{syncScriptSourceMode();saveDraft()};
 $('#script-title').oninput=saveDraft;
 $('#script-style').onchange=()=>{saveDraft();$('#style-prompt-viewer').hidden=true};
 $('#script-editor').oninput=()=>{saveDraft();updateCounts()};
 $('#export-script').onclick=()=>download(new Blob([$('#script-editor').value],{type:'text/plain;charset=utf-8'}),'kich-ban.txt');
 $('#script-to-voice').onclick=()=>{const value=$('#script-editor').value;if(!value.trim()||value.length>5000)return toast('Kịch bản cần 1-5.000 ký tự.',true);$('#voice-text').value=value;saveDraft();updateCounts();navigate('voice')};
}
function voiceMarkup(){
 const choices=Array.isArray(S.session.voiceChoices)?S.session.voiceChoices:[];
 const personal=choices.find(v=>v.kind==='personal');
 const trend=choices.filter(v=>v.kind==='trend');
 const options=[
  ...(personal?[{...personal,display:'Giọng của Tôi'+(personal.label&&personal.label!=='Giọng của Tôi'?' · '+personal.label:'')}]:[]),
  ...trend.map(v=>({...v,display:v.label}))
 ];
  return `<div class="hero"><div><span class="eyebrow">IBEE AIVOICE</span><h1>Chọn <span class="hero-accent">giọng phù hợp.</span></h1><p>Dùng giọng riêng được admin gán hoặc chọn một giọng Trend dùng chung.</p></div><span class="pill green">IBEE</span></div>${workflowMarkup('voice')}<div class="grid2">
 <section class="panel"><div class="panel-head"><h2>Chọn giọng</h2>${icon('mic')}</div><div class="field"><label>Giọng đọc</label><select id="voice-choice" ${options.length?'':'disabled'}>${options.length?options.map((v,i)=>`<option value="${esc(v.id)}" ${i===0?'selected':''}>${esc(v.display)}</option>`).join(''):'<option>Chưa có giọng khả dụng</option>'}</select></div>${personal?'<div class="notice success"><strong>Giọng của Tôi</strong><br>'+esc(personal.label)+'</div>':'<div class="notice warning">Admin chưa gán Giọng của Tôi cho tài khoản này. Bạn vẫn có thể dùng Giọng Trend nếu có.</div>'}<div class="divider"></div><div class="field"><label>Văn bản cần đọc</label><textarea id="voice-text" rows="12" maxlength="5000"></textarea><small id="voice-count">0 / 5.000 ký tự</small></div><div class="field"><label>Tốc độ</label><select id="voice-speed"><option value="0.85">0,85x</option><option value="1" selected>1x tự nhiên</option><option value="1.15">1,15x</option></select></div><label class="check"><input id="tts-consent" type="checkbox">Tôi đồng ý gửi văn bản cho Ibee để tạo audio.</label><button id="generate-voice" class="purple full" ${options.length?'':'disabled'}>Tạo MP3 bằng Ibee</button><p id="voice-status" class="status-line"></p></section>
 <section class="panel"><div class="panel-head"><h2>Audio kết quả</h2><span class="pill">MP3</span></div><div id="audio-output" hidden class="audio-output"><audio id="tts-preview" controls></audio><div class="row between"><span id="audio-duration" class="pill green"></span><button id="download-audio" class="small">${icon('down')} Tải MP3</button></div><div class="divider"></div><div id="voice-video-source-info" class="source-label">Chưa xác định media ghép video.</div><div id="voice-media-upload-wrap" hidden class="field"><label>Tải ảnh hoặc video để ghép</label><input id="voice-media-file" type="file" accept="video/mp4,video/webm,video/quicktime,.m4v,image/jpeg,image/png,image/webp"><small>Dùng khi kịch bản được tạo từ tiêu đề/chủ đề hoặc khi muốn thay media ghép.</small></div><button id="compose-video" class="primary full">Ghép và Tạo Video</button><p id="compose-video-status" class="status-line"></p><div class="progress" id="compose-video-progress" hidden><div></div></div></div></section></div>`;
}
function voiceVideoSource(){
 const sourceId=S.latestScriptSourceVideoId;
 const source=sourceId?S.assets.find(a=>a.id===sourceId&&a.kind==='video'):null;
 return source||S.voiceMediaOverride||null;
}
function refreshVoiceVideoSourceUI(){
 const info=$('#voice-video-source-info'),upload=$('#voice-media-upload-wrap'),source=voiceVideoSource();
 if(!info||!upload)return;
 if(source){info.textContent=(source.kind==='video'?'Video':'Ảnh')+' ghép: '+(source.name||'Media đã chọn');upload.hidden=!!S.latestScriptSourceVideoId;}
 else{info.textContent='Kịch bản này không có video nguồn. Hãy tải ảnh hoặc video để ghép.';upload.hidden=false;}
}
function renderVoicePage(){const page=$('#page-voice');if(!page)return;const prev=$('#voice-text')?.value||'';page.innerHTML=voiceMarkup();if($('#voice-text'))$('#voice-text').value=prev;bindVoiceEvents();updateCounts();refreshVoiceVideoSourceUI()}
function cloneVideoMarkup(){
 const videos=S.assets.filter(a=>a.kind==='video');
 const selected=S.cloneJob?.sourceVideoId||S.selectedVideo||'';
 const voice=S.session.assignedVoice;
  return `<div class="hero"><div><span class="eyebrow">VIDEO VOICE CLONE</span><h1>Clon giọng <span class="hero-accent">Video.</span></h1><p>Giữ nguyên video gốc, thay phần lời nói bằng giọng Ibee đã được cấp và căn sát timeline nguồn.</p></div><span class="pill purple">${icon('magic')} Xử lý tại máy · ≤ 3 phút</span></div>${workflowMarkup('clone')}
 <div class="grid2"><section class="panel"><div class="panel-head"><h2>1. Video nguồn</h2>${icon('video')}</div>
 <div class="field"><label>Chọn video trong thư viện</label><select id="clone-source-video"><option value="">-- Chọn video --</option>${videos.map(v=>`<option value="${esc(v.id)}" ${v.id===selected?'selected':''}>${esc(v.name)} · ${clock(v.duration)}</option>`).join('')}</select></div>
 <div id="clone-source-preview" class="camera-box small-preview">${selected&&videos.some(v=>v.id===selected)?`<video controls playsinline src="${esc(blobUrl(videos.find(v=>v.id===selected)))}"></video>`:'<div class="camera-empty"><strong>Chưa chọn video</strong><p>Thêm video ở mục Tư liệu video trước.</p></div>'}</div>
 <div class="notice warning"><strong>Điều kiện tốt nhất:</strong> một người nói chính, tiếng Việt, không hát, không chồng tiếng. Hình ảnh và khẩu hình video gốc được giữ nguyên; độ khớp miệng phụ thuộc mức độ audio Ibee bám sát timeline và nhịp nói nguồn.</div>
 <label class="check"><input id="clone-consent" type="checkbox">Tôi có quyền sử dụng video, hình ảnh và giọng nói này; đồng ý gửi audio cần thiết cho OpenAI và Ibee. Bước ghép video chạy ngay trên trình duyệt.</label>
 <button id="clone-transcribe" class="primary full" ${selected&&voice?'':'disabled'}>Phân tích lời thoại & timeline</button><p id="clone-status" class="status-line"></p></section>
 <section class="panel"><div class="panel-head"><h2>2. Giọng đích</h2>${icon('mic')}</div>
 <div class="field"><label>Giọng Của Tôi</label><select id="clone-target-voice" ${voice?'':'disabled'}>${voice?`<option value="personal">${esc(voice.label)}</option>`:'<option>Admin chưa cấp giọng</option>'}</select></div>
 <div class="notice">Video clone dùng Giọng của Tôi đã được admin gán. Mã giọng được giữ ở máy chủ.</div>
 <div class="divider"></div><div class="row between"><strong>Tiến trình</strong><span id="clone-stage" class="pill">${esc(S.cloneJob?.stage||'Chưa bắt đầu')}</span></div>
 <div class="progress"><div id="clone-progress" style="width:${Number(S.cloneJob?.progress||0)}%"></div></div></section></div>
 <section class="panel" id="clone-transcript-panel" ${S.cloneJob?.segments?.length?'':'hidden'}><div class="panel-head"><div><h2>3. Kiểm tra lời thoại</h2><p class="tiny muted status-line">Sửa sai chính tả nếu cần. Mốc thời gian được khóa để giữ timeline video.</p></div><span class="pill green" id="clone-segment-count">${S.cloneJob?.segments?.length||0} đoạn</span></div>
 <div id="clone-transcript-list" class="stack"></div><div class="row between"><span class="tiny muted">Không đổi nội dung nếu mục tiêu là giữ nguyên lời nguồn.</span><button id="clone-synthesize" class="purple">Tạo giọng theo timeline</button></div></section>
 <section class="panel" id="clone-render-panel" ${S.cloneJob?.alignedAudio?'':'hidden'}><div class="panel-head"><div><h2>4. Ghép giọng vào video</h2><p class="tiny muted status-line">Không chỉnh khuôn mặt hoặc khẩu hình. Video gốc được phát lại và thay track tiếng bằng audio Ibee đã căn timeline.</p></div><span class="pill">Local</span></div>
 <audio id="clone-audio-preview" controls></audio><div class="notice">Bước xuất video chạy theo thời gian thực trên máy. Ví dụ video 60 giây sẽ mất khoảng 60 giây để ghép. Trình duyệt có thể mã hóa lại file nên dung lượng/codec có thể thay đổi, nhưng nội dung hình ảnh không bị AI chỉnh sửa.</div><div class="divider"></div><button id="clone-render-video" class="primary full">Ghép video hoàn chỉnh</button><p id="clone-render-status" class="status-line"></p></section>
 <section class="panel result" id="clone-result-panel" ${S.cloneJob?.resultVideo?.blob?'':'hidden'}><div class="panel-head"><h2>Video kết quả</h2><button id="clone-download-result" class="small">${icon('down')} Tải video</button></div><video id="clone-result-video" controls playsinline></video></section>`;
}
function settingsMarkup(){
 const admin=S.session.role==='admin';
 return `<div class="hero"><div><span class="eyebrow">CONTROL CENTER</span><h1>Thiết lập & <span class="hero-accent">phân quyền.</span></h1></div><button id="refresh-settings" class="small">${icon('refresh')} Làm mới</button></div><div class="grid2">
 <section class="panel"><div class="panel-head"><h2>Kết nối API</h2>${icon('settings')}</div><div id="provider-list" class="provider-grid"></div><div class="divider"></div><div id="limiter-notice" class="notice"></div></section>
 <section class="panel"><div class="panel-head"><h2>An toàn</h2>${icon('shield')}</div><table class="settings-table"><tbody><tr><td>Ibee</td><td>Chỉ dùng giọng admin đã cấp.</td></tr><tr><td>Tài khoản con</td><td>Không thấy API key và không tự đổi voice code.</td></tr><tr><td>Redis</td><td>Cần cho phân quyền nhiều tài khoản trên Vercel.</td></tr></tbody></table><div class="divider"></div><button id="clear-local" class="danger small">${icon('trash')} Xóa media cục bộ</button></section></div>
 ${admin?`<section class="panel admin-panel"><div class="panel-head"><h2>Admin · quản lý prompt phong cách</h2><span class="pill purple">ADMIN ONLY</span></div><div class="grid2"><div><h3>5 phong cách mặc định</h3><p class="tiny muted status-line">Admin chỉnh prompt tại đây. User chỉ được xem prompt và không thể xóa phong cách mặc định.</p><div id="admin-default-script-styles" class="stack"></div></div><div><h3>Phong cách riêng theo tài khoản</h3><p class="tiny muted status-line">Admin có thể xem phong cách riêng của từng user.</p><div id="admin-user-script-styles" class="stack"></div></div></div></section><section class="panel admin-panel"><div class="panel-head"><h2>Admin · quản lý giọng và tài khoản</h2><span class="pill purple">ADMIN ONLY</span></div><div id="openai-key-diagnostic" class="notice"></div><div class="grid2"><div><h3>Giọng Trend dùng chung</h3><p class="tiny muted status-line">Các giọng này xuất hiện cho tất cả tài khoản ở trang Giọng Của Tôi.</p><div class="field"><label>Tên hiển thị</label><input id="admin-trend-label" maxlength="80" placeholder="Ví dụ: Nữ trẻ trung"></div><div class="field"><label>Voice code Ibee</label><input id="admin-trend-code" maxlength="180" placeholder="Mã giọng từ Ibee"></div><button id="admin-add-trend-voice" class="primary">Thêm giọng Trend</button><div class="divider"></div><div id="admin-trend-voices" class="stack"></div></div><div><h3>Danh sách giọng Nhân bản chuyên nghiệp</h3><p class="tiny muted status-line">Copy mã giọng từ mục Giọng của tôi trên Ibee. Chỉ thêm các giọng Nhân bản chuyên nghiệp mà tài khoản Ibee của anh có quyền sử dụng.</p><div class="field"><label>Tên hiển thị</label><input id="admin-voice-label" maxlength="80" placeholder="Giọng Nhung Pro"></div><div class="field"><label>Voice code Ibee</label><input id="admin-voice-code" maxlength="180" placeholder="Mã giọng đã copy từ Ibee"></div><button id="admin-add-voice" class="primary">Thêm giọng</button><div class="divider"></div><div id="admin-voices" class="stack"></div></div><div><h3>Gán giọng theo tài khoản</h3><p class="tiny muted status-line">Mỗi tài khoản chỉ thấy và dùng giọng được chọn ở đây.</p><div id="admin-users" class="stack"></div></div></div></section>`:''}`;
}
function renderApp(){
 $('#login-screen').hidden=true;$('#app').hidden=false;
 const navItems=[['media',pages.media,'video'],['script',pages.script,'pen'],['voice','Tạo Lời Thoại & Video','mic'],['clone',pages.clone,'magic'],['settings',pages.settings,'settings']].filter(([p])=>canOpenPage(p));
 const nav=navItems.map(([p,label,ico])=>`<button data-page="${p}" class="${p==='media'?'active':''}">${icon(ico)}<span>${label}</span></button>`).join('');
 $('#app').innerHTML=`<aside class="sidebar"><div class="brand">${logo}<div><strong>cliplab<span class="hero-accent">.</span></strong><small>IBEE CREATOR STUDIO</small></div></div><div class="workspace"><span class="avatar">${esc(S.session.username.slice(0,2).toUpperCase())}</span><div><strong>${esc(S.session.username)}</strong><p class="tiny muted">${esc(S.session.role)}</p></div></div><p class="nav-label">CHỨC NĂNG</p><nav class="nav">${nav}</nav><div class="sidebar-bottom"><div class="free-card"><span class="pill green">IBEE API</span><h3>Giọng theo phân quyền</h3><p>Admin cấp giọng cho từng tài khoản con.</p></div></div></aside><main class="main"><header class="topbar"><div class="crumb"><strong id="breadcrumb">Tư liệu video</strong></div><div class="user-badge"><span class="pill ${S.session.role==='admin'?'purple':'green'}">${esc(S.session.role)}</span><strong>${esc(S.session.username)}</strong><button id="logout" class="small">${icon('logout')}</button></div></header><div class="content"><div id="page-media">${mediaMarkup()}</div><div id="page-script" hidden>${scriptMarkup()}</div><div id="page-voice" hidden>${voiceMarkup()}</div><div id="page-clone" hidden>${canOpenPage('clone')?cloneVideoMarkup():''}</div><div id="page-settings" hidden>${settingsMarkup()}</div></div></main>`;
}
function navigate(page){
 if(!pages[page]||!canOpenPage(page)||S.camera.recording)return;
 S.page=page;if(page!=='media'&&S.camera.stream)closeCamera();
 for(const p of Object.keys(pages))$('#page-'+p).hidden=p!==page;
 $$('.nav [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 $('#breadcrumb').textContent=pages[page];window.scrollTo({top:0});
 if(page==='settings')renderSettings();if(page==='clone')renderCloneState();if(page==='voice'){api('session').then(s=>{S.session=s;renderVoicePage()}).catch(()=>{})}
}
function videoAsset(){return S.assets.find(a=>a.id===S.selectedVideo&&a.kind==='video')}
function requireConsent(sel){if(!$(sel).checked)throw new Error('Hãy xác nhận quyền sử dụng dữ liệu.')}
function ensureProvider(p){if(!S.session.providers[p])throw new Error('Chưa cấu hình API '+p+'.')}
function updateCounts(){
 const s=$('#script-editor')?.value||'',v=$('#voice-text')?.value||'';
 if($('#script-count'))$('#script-count').textContent=`${s.length.toLocaleString('vi-VN')} ký tự`;
 if($('#voice-count'))$('#voice-count').textContent=`${v.length.toLocaleString('vi-VN')} / 5.000 ký tự`;
}
function videoThumbUrl(v){
 return v?.thumbnail instanceof Blob ? blobUrl({id:v.id+'-thumbnail',blob:v.thumbnail}) : '';
}
function renderVideoLibrary(){
 const videos=S.assets.filter(a=>a.kind==='video');$('#video-count').textContent=videos.length;
 $('#video-library').innerHTML=videos.length?videos.map(v=>{const thumb=videoThumbUrl(v);return `<article class="asset-card ${v.id===S.selectedVideo?'selected':''}"><div class="asset-thumb">${thumb?`<img src="${esc(thumb)}" alt="Ảnh đại diện ${esc(v.name)}">`:`<video src="${esc(blobUrl(v))}" muted preload="metadata"></video>`}<span class="duration">${clock(v.duration)}</span></div><div class="asset-body"><div class="asset-title">${esc(v.name)}</div><div class="asset-meta">${size(v.blob.size)}</div><div class="asset-actions"><button class="small" data-select-video="${v.id}">Chọn</button><button class="small danger" data-delete-asset="${v.id}">Xóa</button></div></div></article>`}).join(''):'<div class="empty">Chưa có video.</div>';
}
function selectVideo(id){
 S.selectedVideo=id;const v=videoAsset(),player=$('#camera-video');
 if(v){player.srcObject=null;player.src=blobUrl(v);player.controls=true;player.muted=false;$('#camera-empty').hidden=true;$('#analysis-source').textContent=`${v.name} · ${clock(v.duration)} · ${size(v.blob.size)}`;}
 else{player.removeAttribute('src');player.load();player.controls=false;$('#camera-empty').hidden=false;$('#analysis-source').textContent='Chưa chọn video.';}
 renderVideoLibrary();showAnalysis(v?.analysis);
}
async function ensureVideoThumbnails(){
 let changed=false;
 for(const v of S.assets.filter(a=>a.kind==='video'&&!(a.thumbnail instanceof Blob))){
  try{v.thumbnail=await createVideoThumbnail(v.blob,v.duration);await put('assets',v);changed=true}catch{}
 }
 if(changed)S.assets=await all('assets');
}
async function ingestVideo(file,hint=0){
 if(file.size>80*1024*1024)throw new Error('Video vượt 80 MB.');
 const mime=cleanMime(file);if(!['video/mp4','video/webm','video/quicktime','video/x-m4v'].includes(mime))throw new Error('Chỉ hỗ trợ MP4, WebM, MOV.');
 const duration=hint||await durationOf(file,'video');if(duration<0.1||duration>180)throw new Error('Video cần dài 0,1-180 giây.');
 const videoBlob=new Blob([file],{type:mime});
 let thumbnail=null;try{thumbnail=await createVideoThumbnail(videoBlob,duration)}catch{}
 const rec={id:crypto.randomUUID(),name:file.name,kind:'video',blob:videoBlob,thumbnail,duration,createdAt:Date.now()};
 await put('assets',rec);S.assets=await all('assets');selectVideo(rec.id);toast('Đã thêm video.');
}
function showAnalysis(r){
 const done=$('#analysis-complete');if(done)done.hidden=!r;
}
async function runAnalysis(){
 ensureProvider('deepseek');requireConsent('#analysis-consent');const v=videoAsset();if(!v)throw new Error('Chọn video trước.');
 const progress=(n,msg)=>{$('#analysis-progress').hidden=false;$('#analysis-progress>div').style.width=Math.max(0,Math.min(100,n))+'%';$('#analysis-status').textContent=msg};
 try{
  showAnalysis(null);
  progress(3,'Đang chuẩn bị video...');
  const detected=await detectSceneFrames(v.blob,v.duration,(n,m,phase)=>{
    if(phase==='scan')progress(5+Math.round(n/m*45),`Đang phân tích chuyển cảnh ${n}/${m}...`);
    else progress(52+Math.round(n/m*18),`Đang chuẩn bị hình ảnh ${n}/${m}...`);
  },{sensitivity:'auto',maxFrames:28});
  if(!detected.frames.length)throw new Error('Không lấy được hình ảnh từ video.');
  progress(72,`Đã nhận diện ${detected.frames.length} cảnh. AI đang phân tích...`);
  const result=await api('analysis',{mode:'scene_frames',duration:v.duration,brief:($('#analysis-brief')?.value||'').trim(),frames:detected.frames,sceneMeta:{scanned:detected.scanned,interval:detected.interval,threshold:detected.threshold},consent:true});
  v.analysis={...result,sceneDetection:{frames:detected.frames.length,scanned:detected.scanned,interval:detected.interval,threshold:detected.threshold}};
  await put('assets',v);showAnalysis(v.analysis);renderVideoLibrary();$('#analysis-status').textContent='Phân tích hoàn tất.';toast('Phân tích video hoàn tất.');
 }finally{$('#analysis-progress').hidden=true}
}
function showAudio(rec){S.latestAudio=rec;$('#audio-output').hidden=false;const player=$('#tts-preview');player.pause();player.removeAttribute('src');player.src=rec.playUrl||rec.remoteUrl||blobUrl(rec);player.load();$('#audio-duration').textContent=rec.playUrl?'Sẵn sàng nghe':rec.remoteUrl?'Link Ibee tạm thời':clock(rec.duration);player.onloadedmetadata=()=>{if(Number.isFinite(player.duration)&&player.duration>0)$('#audio-duration').textContent=clock(player.duration)};player.onerror=()=>{$('#audio-duration').textContent='Không tải được audio';$('#voice-status').textContent='Không phát được audio trực tiếp. Hãy thử lại hoặc tải MP3.'}}

function cloneSourceVideo(){
 const id=S.cloneJob?.sourceVideoId||$('#clone-source-video')?.value||S.selectedVideo;
 return S.assets.find(a=>a.id===id&&a.kind==='video')||null;
}
function newCloneJob(sourceVideoId=''){
 return {id:'video-voice-clone-current',type:'video-voice-clone',sourceVideoId,stage:'Chưa bắt đầu',progress:0,segments:[],alignedAudio:null,resultVideo:null,createdAt:Date.now(),updatedAt:Date.now()};
}
async function saveCloneJob(){
 if(!S.cloneJob)return;
 S.cloneJob.updatedAt=Date.now();
 await put('jobs',S.cloneJob);
}
function setCloneProgress(stage,progress,status=''){
 if(!S.cloneJob)S.cloneJob=newCloneJob();
 S.cloneJob.stage=stage;S.cloneJob.progress=Math.max(0,Math.min(100,Math.round(progress)));
 if($('#clone-stage'))$('#clone-stage').textContent=stage;
 if($('#clone-progress'))$('#clone-progress').style.width=S.cloneJob.progress+'%';
 if(status&&$('#clone-status'))$('#clone-status').textContent=status;
}
function normalizeWordText(words){
 return words.map(w=>String(w.word||'').trim()).filter(Boolean).join(' ')
  .replace(/\s+([,.;:!?…])/g,'$1').replace(/([“"'(\[])\s+/g,'$1').replace(/\s+([”"')\]])/g,'$1').trim();
}
function splitLongCloneSegment(segment,words){
 if(segment.end-segment.start<=5.2)return [segment];
 const inside=words.filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.word&&w.start>=segment.start-.12&&w.end<=segment.end+.12).sort((a,b)=>a.start-b.start);
 if(inside.length<3)return [segment];
 const groups=[];let group=[];let groupStart=inside[0].start;
 for(let i=0;i<inside.length;i++){
  const word=inside[i];group.push(word);
  const next=inside[i+1];
  const span=word.end-groupStart;
  const pause=next?next.start-word.end:0;
  const punct=/[.!?…,:;]$/.test(String(word.word||'').trim());
  const shouldBreak=!next||span>=4.2||(span>=1.8&&(pause>=.22||punct));
  if(shouldBreak){
   const text=normalizeWordText(group);
   if(text)groups.push({id:segment.id+'-'+groups.length,start:group[0].start,end:group.at(-1).end,text});
   group=[];if(next)groupStart=next.start;
  }
 }
 return groups.length>1?groups:[segment];
}
function normalizeCloneSegments(rows,words,duration){
 const cleanWords=(words||[]).filter(w=>w&&typeof w.word==='string'&&w.word.trim()&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start)
  .map(w=>({start:Math.max(0,Number(w.start)),end:Math.min(duration,Number(w.end)),word:w.word.trim()})).filter(w=>w.end>w.start);
 const base=rows.filter(x=>x&&typeof x.text==='string'&&x.text.trim()&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start)
  .map((x,i)=>({id:x.id||String(i),start:Math.max(0,Number(x.start)),end:Math.min(duration,Number(x.end)),text:x.text.trim()}))
  .filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
 const segments=base.flatMap(s=>splitLongCloneSegment(s,cleanWords)).sort((a,b)=>a.start-b.start);
 while(segments.length>60){
  let best=0,bestGap=Infinity;
  for(let i=0;i<segments.length-1;i++){const gap=Math.max(0,segments[i+1].start-segments[i].end);if(gap<bestGap){bestGap=gap;best=i}}
  const a=segments[best],b=segments[best+1];
  segments.splice(best,2,{id:a.id,start:a.start,end:b.end,text:(a.text+' '+b.text).trim()});
 }
 return segments.map((x,i)=>({...x,id:'seg-'+i,start:Number(x.start.toFixed(3)),end:Number(x.end.toFixed(3))}));
}
function renderCloneState(){
 const job=S.cloneJob;
 if(!$('#page-clone'))return;
 if($('#clone-stage'))$('#clone-stage').textContent=job?.stage||'Chưa bắt đầu';
 if($('#clone-progress'))$('#clone-progress').style.width=Number(job?.progress||0)+'%';
 const list=$('#clone-transcript-list');
 if(list){
  const segs=job?.segments||[];
  $('#clone-transcript-panel').hidden=!segs.length;
  $('#clone-segment-count').textContent=segs.length+' đoạn';
  list.innerHTML=segs.map((s,i)=>`<div class="voice-card clone-segment"><div class="row between"><strong>Đoạn ${i+1}</strong><span class="pill">${clock(s.start)} → ${clock(s.end)} · ${Math.max(.1,s.end-s.start).toFixed(1)}s</span></div><textarea data-clone-segment="${i}" rows="2" maxlength="1000">${esc(s.text)}</textarea></div>`).join('');
 }
 const panel=$('#clone-render-panel');
 if(panel){
  panel.hidden=!job?.alignedAudio?.blob;
  const player=$('#clone-audio-preview');
  if(job?.alignedAudio?.blob&&player){player.src=blobUrl(job.alignedAudio);player.load()}
 }
 const result=$('#clone-result-panel');
 if(result){
  result.hidden=!job?.resultVideo?.blob;
  if(job?.resultVideo?.blob){const u=blobUrl(job.resultVideo);$('#clone-result-video').src=u;$('#clone-result-video').load()}
 }
}
async function transcribeCloneVideo(){
 ensureProvider('openai');requireConsent('#clone-consent');
 const source=cloneSourceVideo();if(!source)throw new Error('Hãy chọn video nguồn.');
 if(!S.session.assignedVoice)throw new Error('Admin chưa cấp giọng cho tài khoản này.');
 S.cloneJob=newCloneJob(source.id);setCloneProgress('Tách lời thoại',5,'Đang tách audio khỏi video...');
 const extracted=await extractSpeechChunks(source.blob,40,(n,total)=>setCloneProgress('Tách lời thoại',5+Math.round(n/total*10)));
 const rows=[],words=[];
 for(let i=0;i<extracted.chunks.length;i++){
  const chunk=extracted.chunks[i];
  setCloneProgress('Nhận dạng lời thoại',15+Math.round(i/extracted.chunks.length*35),`Đang nhận dạng đoạn ${i+1}/${extracted.chunks.length}...`);
  const data=await api('clone-transcribe',{audioBase64:await toBase64(chunk.blob),offset:chunk.offset,duration:chunk.duration,consent:true});
  rows.push(...(data.segments||[]));words.push(...(data.words||[]));
 }
 const segments=normalizeCloneSegments(rows,words,source.duration);
 if(!segments.length)throw new Error('Không nhận thấy lời thoại tiếng Việt rõ ràng trong video.');
 S.cloneJob.segments=segments;S.cloneJob.sourceDuration=source.duration;S.cloneJob.alignedAudio=null;S.cloneJob.resultVideo=null;
 setCloneProgress('Chờ kiểm tra lời thoại',50,`Đã nhận dạng ${segments.length} đoạn. Hãy kiểm tra nội dung trước khi tạo giọng.`);
 await saveCloneJob();renderCloneState();
}
async function waitIbee(token,label){
 let state=null;
 for(let i=0;i<100;i++){
  await pause(i<10?1200:2000);
  state=await api('tts-status',{token});
  if(state.failed)throw new Error(state.error||'Ibee tạo audio thất bại.');
  if(state.ready)return state;
  if($('#clone-status'))$('#clone-status').textContent=`${label}: Ibee đang xử lý...`;
 }
 throw new Error('Ibee xử lý quá lâu. Hãy thử lại tác vụ sau.');
}
async function fetchIbeeAudio(token){
 const r=await fetch(`/api/index?action=tts-audio&token=${encodeURIComponent(token)}`,{credentials:'same-origin',signal:AbortSignal.timeout(65000)});
 if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(d.error||'Không tải được audio Ibee.')}
 return r.blob();
}
async function synthesizeCloneSegment(seg,index,total,initialSpeed=1){
 const target=Math.max(.45,seg.end-seg.start);
 let speed=Math.max(.25,Math.min(1.9,Number(initialSpeed)||1));
 let best=null;
 const tolerance=Math.max(.07,target*.025);
 for(let attempt=0;attempt<3;attempt++){
  setCloneProgress('Tạo giọng Ibee',52+Math.round((index+(attempt*.22))/total*30),`Đoạn ${index+1}/${total}: căn thời lượng ${speed.toFixed(2)}x...`);
  const sub=await api('tts-submit',{text:seg.text,speed,voiceChoice:'personal',consent:true});
  await waitIbee(sub.token,`Đoạn ${index+1}/${total}`);
  const raw=await fetchIbeeAudio(sub.token);
  const speech=await trimSpeechAudio(raw);
  const duration=speech.duration;
  const error=duration-target;
  const absError=Math.abs(error);
  const candidate={blob:speech.blob,duration,speed,error,trimmed:speech.trimmed,leading:speech.leading,trailing:speech.trailing};
  if(!best||absError<Math.abs(best.error))best=candidate;
  if(absError<=tolerance)break;

  const ratio=duration/target;
  const next=Math.max(.25,Math.min(1.9,speed*ratio));
  if(Math.abs(next-speed)<.015)break;
  speed=Number(next.toFixed(3));
 }
 if(!best)throw new Error(`Không tạo được audio cho đoạn ${index+1}.`);
 const maxAllowed=Math.max(.16,target*.045);
 if(Math.abs(best.error)>maxAllowed){
  const direction=best.error<0?'nhanh':'chậm';
  throw new Error(`Đoạn ${index+1} vẫn ${direction} lệch ${Math.abs(best.error).toFixed(2)}s sau khi tự căn tốc độ. Hãy kiểm tra lời thoại đoạn này.`);
 }
 return {start:seg.start,end:seg.end,text:seg.text,blob:best.blob,duration:best.duration,speed:best.speed,timingError:best.error};
}
async function synthesizeCloneTimeline(){
 ensureProvider('vbee');requireConsent('#clone-consent');
 if(!S.cloneJob?.segments?.length)throw new Error('Hãy phân tích lời thoại trước.');
 const source=cloneSourceVideo();if(!source)throw new Error('Video nguồn không còn trong thư viện.');
 $$('#clone-transcript-list [data-clone-segment]').forEach(el=>{const i=Number(el.dataset.cloneSegment);if(S.cloneJob.segments[i])S.cloneJob.segments[i].text=el.value.trim()});
 if(S.cloneJob.segments.some(s=>!s.text))throw new Error('Không được để trống lời thoại.');
 await saveCloneJob();
 const audio=[];let calibratedSpeed=1;
 for(let i=0;i<S.cloneJob.segments.length;i++){
  const fitted=await synthesizeCloneSegment(S.cloneJob.segments[i],i,S.cloneJob.segments.length,calibratedSpeed);
  audio.push(fitted);
  calibratedSpeed=Math.max(.25,Math.min(1.9,calibratedSpeed*.35+fitted.speed*.65));
 }
 setCloneProgress('Dựng timeline audio',84,'Đang đặt từng câu vào đúng mốc thời gian...');
 const aligned=await composeAlignedSpeech(audio,source.duration,(n,total)=>setCloneProgress('Dựng timeline audio',84+Math.round(n/total*6)));
 const maxError=Math.max(...audio.map(x=>Math.abs(x.timingError||0)));
 const avgError=audio.reduce((sum,x)=>sum+Math.abs(x.timingError||0),0)/audio.length;
 S.cloneJob.alignedAudio={id:'clone-aligned-'+Date.now(),kind:'audio',blob:aligned.blob,duration:aligned.duration,createdAt:Date.now(),maxTimingError:maxError,avgTimingError:avgError,calibratedSpeed};
 S.cloneJob.segmentAudio=[];S.cloneJob.resultVideo=null;
 setCloneProgress('Sẵn sàng ghép video',90,`Đã khóa timeline. Sai lệch lớn nhất ${maxError.toFixed(2)}s · trung bình ${avgError.toFixed(2)}s. Nghe thử trước khi ghép.`);
 await saveCloneJob();renderCloneState();
}
async function renderCloneVideo(){
 requireConsent('#clone-consent');
 const source=cloneSourceVideo();if(!source||!S.cloneJob?.alignedAudio?.blob)throw new Error('Cần video nguồn và audio timeline.');
 setCloneProgress('Ghép video',91,'Đang giữ nguyên hình ảnh video và thay track tiếng. Không đóng tab trong lúc xử lý...');
 const result=await replaceVideoAudio(source.blob,S.cloneJob.alignedAudio.blob,source.duration,(current,total)=>{
   const pct=91+Math.round(Math.min(1,current/Math.max(.1,total))*8);
   setCloneProgress('Ghép video',pct,`Đang xuất video... ${clock(current)} / ${clock(total)}`);
 });
 const rec={id:'clone-result-'+Date.now(),kind:'clone-result',name:`video-clon-giong-${Date.now()}.${result.extension}`,blob:result.blob,duration:result.duration,mime:result.mime,createdAt:Date.now()};
 S.cloneJob.resultVideo=rec;
 setCloneProgress('Hoàn tất',100,`Đã ghép giọng vào video. Định dạng: ${result.extension.toUpperCase()}.`);
 await saveCloneJob();renderCloneState();
}

function renderSettings(){
 const cfg=S.session;if(!cfg)return;
 const providerBox=$('#provider-list'),limiter=$('#limiter-notice');if(!providerBox||!limiter)return;
 const defs=[['vbee','Ibee AIVoice','Cấu hình API phía máy chủ'],['deepseek','DeepSeek Vision + Text','DEEPSEEK_API_KEY'],['openai','OpenAI','OPENAI_API_KEY']];
 providerBox.innerHTML=defs.map(([id,n,e])=>`<div class="provider"><h3>${n}</h3><span class="pill ${cfg.providers[id]?'green':''}">${cfg.providers[id]?'Đã cấu hình':'Chưa cấu hình'}</span><code>${e}</code></div>`).join('');
 limiter.textContent=cfg.limiter==='redis'?'Redis đã kết nối: có thể lưu phân quyền giọng cho nhiều tài khoản.':'Chưa có Upstash Redis: tạo nội dung đa tài khoản và gán giọng sẽ bị chặn để tránh vượt hạn mức.';
 limiter.className=`notice ${cfg.limiter==='redis'?'success':'warning'}`;
 if(cfg.role==='admin')loadAdminState();
}
async function loadAdminState(){
 try{S.adminState=await api('admin-state',{});renderAdmin()}catch(e){toast(e.message,true)}
}
function renderAdmin(){
 if(!S.adminState)return;
 const voices=Array.isArray(S.adminState.voices)?S.adminState.voices:[];
 const trendVoices=Array.isArray(S.adminState.trendVoices)?S.adminState.trendVoices:[];
 const users=Array.isArray(S.adminState.users)?S.adminState.users:[];
 const oa=S.adminState.diagnostics?.openai;
 const voiceBox=$('#admin-voices'),userBox=$('#admin-users');
 if(!voiceBox||!userBox)return;
 const diagnostic=$('#openai-key-diagnostic');
 if(diagnostic){diagnostic.className='notice '+(oa?.configured?'success':'warning');diagnostic.textContent=oa?.configured?'Khóa dịch vụ phụ trợ đã được cấu hình.':'Khóa dịch vụ phụ trợ chưa được cấu hình.'}
 voiceBox.innerHTML=voices.length?voices.map(v=>'<div class="voice-card"><div class="row between"><div><strong>'+esc(v?.label||'Giọng')+'</strong><br><code>'+esc(v?.code||'')+'</code></div><button class="small danger" data-remove-pro-voice="'+esc(v?.code||'')+'">Xóa</button></div></div>').join(''):'<div class="empty">Chưa thêm giọng chuyên nghiệp.</div>';
 const trendBox=$('#admin-trend-voices');
 if(trendBox)trendBox.innerHTML=trendVoices.length?trendVoices.map(v=>'<div class="voice-card"><div class="row between"><div><strong>'+esc(v?.label||'Giọng Trend')+'</strong><br><code>'+esc(v?.code||'')+'</code></div><button class="small danger" data-remove-trend-voice="'+esc(v?.id||'')+'">Xóa</button></div></div>').join(''):'<div class="empty">Chưa có giọng Trend.</div>';
 userBox.innerHTML=users.map(u=>'<div class="voice-card"><div class="row between"><strong>'+esc(u?.username||'')+'</strong><span class="pill">'+esc(u?.role||'member')+'</span></div><div class="field"><select data-assign-user="'+esc(u?.username||'')+'"><option value="">-- Chưa cấp giọng --</option>'+voices.map(v=>'<option value="'+esc(v?.code||'')+'" '+(u?.voiceCode===v?.code?'selected':'')+'>'+esc(v?.label||'Giọng')+'</option>').join('')+'</select></div></div>').join('');
 const rawStyleState=S.adminState.scriptStyles;
 const styleState=rawStyleState&&typeof rawStyleState==='object'?rawStyleState:{};
 const defaults=Array.isArray(styleState.defaults)?styleState.defaults:[];
 const styleUsers=Array.isArray(styleState.users)?styleState.users:[];
 const defaultBox=$('#admin-default-script-styles'),userStyleBox=$('#admin-user-script-styles');
 if(defaultBox)defaultBox.innerHTML=defaults.map(style=>'<div class="voice-card"><strong>'+esc(style?.name||'Phong cách')+'</strong><div class="field"><textarea rows="6" maxlength="6000" data-admin-default-prompt="'+esc(style?.id||'')+'">'+esc(style?.prompt||'')+'</textarea></div><button class="small primary" data-save-default-prompt="'+esc(style?.id||'')+'">Lưu Prompt</button></div>').join('');
 if(userStyleBox)userStyleBox.innerHTML=styleUsers.map(u=>{const list=Array.isArray(u?.styles)?u.styles:[];return '<div class="voice-card"><div class="row between"><strong>'+esc(u?.username||'')+'</strong><span class="pill">'+list.length+' phong cách</span></div>'+(list.length?list.map(style=>'<details class="admin-style-detail"><summary>'+esc(style?.name||'Phong cách')+'</summary><div class="prompt-preview">'+esc(style?.prompt||'')+'</div></details>').join(''):'<p class="tiny muted">Chưa tạo phong cách riêng.</p>')+'</div>'}).join('');
 $$('[data-save-default-prompt]').forEach(button=>button.onclick=()=>busy(button,async()=>{
   const area=$('[data-admin-default-prompt="'+button.dataset.saveDefaultPrompt+'"]');
   if(!area)throw new Error('Không tìm thấy ô Prompt cần lưu.');
   await api('admin-save-script-prompt',{styleId:button.dataset.saveDefaultPrompt,prompt:area.value});
   await loadAdminState();await loadScriptStyles();renderScriptPage();toast('Đã lưu prompt mặc định.');
 }));
}
function applyCameraRatioUI(){
 const box=$('#camera-box'),ratio=$('#camera-ratio');if(!box||!ratio)return;
 const portrait=ratio.value==='portrait';
 box.classList.toggle('portrait',portrait);box.classList.toggle('landscape',!portrait);
}
function closeCamera(){S.camera.close();const p=$('#camera-video');if(!p)return;p.srcObject=null;$('#open-camera').disabled=false;$('#start-record').disabled=true;$('#close-camera').hidden=true;if($('#camera-facing'))$('#camera-facing').disabled=false;if($('#camera-ratio'))$('#camera-ratio').disabled=false;if(!videoAsset())$('#camera-empty').hidden=false}
function bindCloneEvents(){
 const transcribe=$('#clone-transcribe');if(transcribe)transcribe.onclick=()=>busy(transcribe,transcribeCloneVideo,'#clone-status');
 const synth=$('#clone-synthesize');if(synth)synth.onclick=()=>busy(synth,synthesizeCloneTimeline,'#clone-status');
 const render=$('#clone-render-video');if(render)render.onclick=()=>busy(render,renderCloneVideo,'#clone-render-status');
 const dl=$('#clone-download-result');if(dl)dl.onclick=()=>{const v=S.cloneJob?.resultVideo;if(v?.blob)download(v.blob,v.name||'video-clon-giong.webm')};
 const source=$('#clone-source-video');if(source)source.onchange=async e=>{const id=e.target.value;if(!S.cloneJob||S.cloneJob.sourceVideoId!==id){S.cloneJob=newCloneJob(id);await saveCloneJob();const page=$('#page-clone');page.innerHTML=cloneVideoMarkup();bindCloneEvents();renderCloneState()}};
}
function bindVoiceEvents(){
 const textBox=$('#voice-text'),generate=$('#generate-voice'),downloadButton=$('#download-audio');
 if(textBox)textBox.oninput=()=>{saveDraft();updateCounts()};
 if(generate)generate.onclick=()=>busy(generate,async()=>{ensureProvider('vbee');requireConsent('#tts-consent');$('#voice-status').textContent='Đang gửi nội dung sang Ibee...';const sub=await api('tts-submit',{text:textBox.value,speed:Number($('#voice-speed').value),voiceChoice:$('#voice-choice')?.value||'personal',consent:true});let state=null;for(let i=0;i<120;i++){await pause(i<8?1500:2500);state=await api('tts-status',{token:sub.token});if(state.failed)throw new Error(state.error||'Ibee tạo audio thất bại.');if(state.ready)break;$('#voice-status').textContent=`Ibee đang xử lý... ${i+1}/120`}if(!state?.ready||!state.audioLink)throw new Error('Ibee xử lý lâu hơn dự kiến. Hãy thử lại sau ít phút.');const playUrl=`/api/index?action=tts-audio&token=${encodeURIComponent(sub.token)}`;const rec={id:crypto.randomUUID(),name:`ibee-${Date.now()}.mp3`,kind:'audio',playUrl,remoteUrl:state.audioLink,source:'ibee',createdAt:Date.now()};showAudio(rec);refreshVoiceVideoSourceUI();$('#voice-status').textContent=`Đã tạo bằng ${sub.voice.label}. Bấm Play để nghe trực tiếp hoặc Tải MP3.`},'#voice-status');
 if(downloadButton)downloadButton.onclick=()=>{if(!S.latestAudio)return;if(S.latestAudio.remoteUrl){const a=document.createElement('a');a.href=S.latestAudio.remoteUrl;a.target='_blank';a.rel='noopener noreferrer';a.download=S.latestAudio.name||'vbee-audio.mp3';document.body.appendChild(a);a.click();a.remove()}else if(S.latestAudio.blob)download(S.latestAudio.blob,S.latestAudio.name)};
 const mediaInput=$('#voice-media-file');
 if(mediaInput)mediaInput.onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const mime=cleanMime(file);if(mime.startsWith('video/')){if(file.size>180*1024*1024)return toast('Video ghép vượt 180 MB.',true);const duration=await durationOf(file,'video');S.voiceMediaOverride={id:'voice-media-'+Date.now(),name:file.name,kind:'video',blob:new Blob([file],{type:mime}),duration};}else if(['image/jpeg','image/png','image/webp'].includes(mime)){if(file.size>25*1024*1024)return toast('Ảnh ghép vượt 25 MB.',true);S.voiceMediaOverride={id:'voice-media-'+Date.now(),name:file.name,kind:'image',blob:new Blob([file],{type:mime})};}else return toast('Chỉ hỗ trợ ảnh JPG/PNG/WebP hoặc video MP4/WebM/MOV.',true);refreshVoiceVideoSourceUI();};
 const compose=$('#compose-video');
 if(compose)compose.onclick=()=>busy(compose,async()=>{if(!S.latestAudio)throw new Error('Hãy tạo MP3 trước.');const source=voiceVideoSource();if(!source)throw new Error('Hãy tải ảnh hoặc video để ghép.');$('#compose-video-progress').hidden=false;$('#compose-video-status').textContent='Đang tải MP3...';let audioBlob=S.latestAudio.blob;if(!audioBlob){const r=await fetch(S.latestAudio.playUrl||S.latestAudio.remoteUrl,{credentials:'same-origin',signal:AbortSignal.timeout(65000)});if(!r.ok)throw new Error('Không tải được MP3 để ghép.');audioBlob=await r.blob();}const result=await composeNarratedVideo(source,audioBlob,(current,total,message)=>{const pct=Math.max(0,Math.min(100,Math.round(current/Math.max(.1,total)*100)));$('#compose-video-progress>div').style.width=pct+'%';$('#compose-video-status').textContent=(message||'Đang ghép video...')+' '+pct+'%';});download(result.blob,`video-hoan-thien-${Date.now()}.${result.extension}`);$('#compose-video-status').textContent='Đã ghép hoàn tất và bắt đầu tải video về máy.';toast('Đã tạo video hoàn chỉnh.');},'#compose-video-status');
}

function bindEvents(){
 $('#app').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.page)return navigate(b.dataset.page);
  if(b.dataset.selectVideo)return selectVideo(b.dataset.selectVideo);
  if(b.dataset.deleteAsset)return busy(b,async()=>{await remove('assets',b.dataset.deleteAsset);S.assets=await all('assets');if(S.selectedVideo===b.dataset.deleteAsset)S.selectedVideo=S.assets.find(a=>a.kind==='video')?.id||null;selectVideo(S.selectedVideo)});
  if(b.dataset.removeProVoice)return busy(b,async()=>{await api('admin-remove-voice',{code:b.dataset.removeProVoice});await loadAdminState();toast('Đã xóa giọng khỏi danh sách.')});
  if(b.dataset.removeTrendVoice)return busy(b,async()=>{await api('admin-remove-trend-voice',{id:b.dataset.removeTrendVoice});await loadAdminState();S.session=await api('session');renderVoicePage();toast('Đã xóa giọng Trend.')});
 };
 $('#app').onchange=e=>{const el=e.target.closest('[data-assign-user]');if(!el)return;const username=el.dataset.assignUser,voiceCode=el.value;el.disabled=true;(async()=>{try{await api('admin-assign-voice',{username,voiceCode});await loadAdminState();if(username===S.session.username)S.session=await api('session');toast('Đã cập nhật giọng cho '+username)}catch(err){toast(err.message||'Không thể cập nhật giọng.',true);await loadAdminState()}finally{if(document.body.contains(el))el.disabled=false}})()};
 $('#open-camera').onclick=()=>busy($('#open-camera'),async()=>{const portrait=$('#camera-ratio').value==='portrait';applyCameraRatioUI();const stream=await S.camera.open({facing:$('#camera-facing').value,portrait,audio:$('#camera-audio').checked});const p=$('#camera-video');p.removeAttribute('src');p.srcObject=stream;p.controls=false;p.muted=true;await p.play();$('#camera-empty').hidden=true;$('#start-record').disabled=false;$('#close-camera').hidden=false;$('#camera-status').textContent=portrait?'Camera dọc 9:16 đã sẵn sàng với khung hình tự nhiên.':'Camera đã sẵn sàng.'});
 $('#start-record').onclick=()=>busy($('#start-record'),async()=>{$('#stop-record').hidden=false;$('#record-time').hidden=false;$('#camera-ratio').disabled=true;$('#camera-facing').disabled=true;try{const rr=await S.camera.start(179,t=>$('#record-time').textContent='REC '+clock(t));const ext=rr.blob.type.includes('mp4')?'mp4':'webm';await ingestVideo(new File([rr.blob],`tu-lieu-${Date.now()}.${ext}`,{type:rr.blob.type}),rr.duration);$('#camera-status').textContent=rr.portrait?'Đã lưu video dọc 9:16.':'Đã lưu video.'}finally{$('#camera-ratio').disabled=false;$('#camera-facing').disabled=false;$('#stop-record').hidden=true;$('#record-time').hidden=true;closeCamera()}});
 $('#camera-facing').onchange=()=>{if(S.camera.recording)return;if(S.camera.stream){closeCamera();$('#camera-status').textContent='Đã chọn '+($('#camera-facing').value==='environment'?'camera sau':'camera trước')+'. Bấm Mở camera để áp dụng.'}};
 $('#stop-record').onclick=()=>S.camera.stop();$('#close-camera').onclick=()=>{closeCamera();selectVideo(S.selectedVideo)};$('#camera-ratio').onchange=()=>{if(S.camera.recording){$('#camera-ratio').value=S.camera.portrait?'portrait':'landscape';return toast('Hãy dừng quay trước khi đổi tỷ lệ khung hình.',true)}const wasOpen=!!S.camera.stream;applyCameraRatioUI();if(wasOpen){closeCamera();$('#camera-status').textContent='Đã đổi tỷ lệ khung hình. Bấm Mở camera để áp dụng '+($('#camera-ratio').value==='portrait'?'9:16':'16:9')+'.'}};
 $('#choose-video').onclick=()=>$('#video-file').click();$('#video-file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)busy($('#choose-video'),()=>ingestVideo(f),'#camera-status')};
 applyCameraRatioUI();
 bindCloneEvents();
 $('#analyze-btn').onclick=()=>busy($('#analyze-btn'),runAnalysis,'#analysis-status');
 $('#analysis-go-script').onclick=()=>navigate('script');
 bindScriptEvents();
 bindVoiceEvents();
 $('#refresh-settings').onclick=()=>busy($('#refresh-settings'),async()=>{S.session=await api('session');renderSettings();toast('Đã làm mới cấu hình.')});
 $('#clear-local').onclick=()=>busy($('#clear-local'),async()=>{if(!confirm('Xóa toàn bộ video/audio/job lưu trên trình duyệt của tài khoản này?'))return;await clear('assets');await clear('jobs');S.assets=[];S.selectedVideo=null;S.latestAudio=null;S.cloneJob=newCloneJob();renderVideoLibrary();selectVideo(null);renderCloneState();$('#audio-output')?.setAttribute('hidden','')});
 if($('#admin-add-trend-voice'))$('#admin-add-trend-voice').onclick=()=>busy($('#admin-add-trend-voice'),async()=>{await api('admin-add-trend-voice',{label:$('#admin-trend-label').value,code:$('#admin-trend-code').value});$('#admin-trend-label').value='';$('#admin-trend-code').value='';await loadAdminState();S.session=await api('session');renderVoicePage();toast('Đã thêm giọng Trend cho tất cả tài khoản.')});
 if($('#admin-add-voice'))$('#admin-add-voice').onclick=()=>busy($('#admin-add-voice'),async()=>{await api('admin-add-voice',{label:$('#admin-voice-label').value,code:$('#admin-voice-code').value});$('#admin-voice-label').value='';$('#admin-voice-code').value='';await loadAdminState();toast('Đã thêm giọng Ibee chuyên nghiệp.')});
 $('#logout').onclick=()=>busy($('#logout'),async()=>{closeCamera();await api('logout',{});releaseUrls();S.session=null;$('#app').innerHTML='';loginScreen()});
}
async function boot(){
 S.session=await api('session');await loadScriptStyles();await initDB(S.session.username);S.assets=await all('assets');S.selectedVideo=S.assets.find(a=>a.kind==='video')?.id||null;const jobs=await all('jobs');S.cloneJob=jobs.find(j=>j.type==='video-voice-clone')||newCloneJob(S.selectedVideo||'');S.page='media';
 renderApp();bindEvents();
 try{const d=JSON.parse(localStorage.getItem(draftKey())||'{}');$('#script-editor').value=d.script||'';$('#voice-text').value=d.voice||'';if(d.duration&&$('#script-duration'))$('#script-duration').value=d.duration;if(d.styleId&&$('#script-style'))$('#script-style').value=d.styleId;if(typeof d.includeAnalysis==='boolean'&&$('#include-analysis'))$('#include-analysis').checked=d.includeAnalysis;if($('#script-title'))$('#script-title').value=d.title||'';syncScriptSourceMode()}catch{}
 renderVideoLibrary();selectVideo(S.selectedVideo);if(canOpenPage('clone'))renderCloneState();if(S.session.role==='admin')renderSettings();updateCounts();
 const latest=S.assets.filter(a=>a.kind==='audio').sort((a,b)=>b.createdAt-a.createdAt)[0];if(latest)showAudio(latest);
 ensureVideoThumbnails().then(()=>renderVideoLibrary()).catch(()=>{});
}
loginScreen();
boot().catch(e=>{S.session=null;if(e.status!==401){loginScreen();$('#login-error').textContent=e.message}});
window.addEventListener('beforeunload',e=>{if(S.camera.recording||S.progress.size){e.preventDefault();e.returnValue=''}});
