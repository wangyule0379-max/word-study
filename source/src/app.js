/* Browser adapter: rendering, user-gesture speech, guarded persistence and explicit recovery. */
(function(){
'use strict';
const C=window.WSCore, KEY='wordsprout.state.v1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svgPaths={
 leaf:'<path d="M12 21v-9m0 4C4 17 3 10 3 7c6 0 9 3 9 9Zm0-4c0-6 5-9 10-9 0 6-4 10-10 9Z"/>',
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-8h6v8"/>',
 book:'<path d="M3 4h5c2 0 4 1 4 3 0-2 2-3 4-3h5v16h-5c-2 0-4 1-4 2 0-1-2-2-4-2H3V4Zm9 3v15"/>',
 flag:'<path d="M5 21V3m0 1h14l-3 4 3 4H5"/>',
 chart:'<path d="M4 3v17h17M8 16v-5m5 5V7m5 9V4"/>',
 settings:'<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
 sound:'<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 pencil:'<path d="m14 4 6 6M4 20l5-1L21 7a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L5 15l-1 5Z"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
 headphones:'<path d="M3 13v-1a9 9 0 0 1 18 0v1"/><rect x="2" y="11" width="5" height="9" rx="2"/><rect x="17" y="11" width="5" height="9" rx="2"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>'
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svgPaths[name]||svgPaths.leaf}</svg>`;
const app={state:null,route:'home',query:'',unitFilter:'all',mistakeFilter:'all',storageError:false,corruptRaw:null,conflict:false,lastRaw:null,pending:null};
const names={home:'今日练习',library:'单元词库',mistakes:'错词本',records:'学习记录',settings:'设置与备份',study:'每日训练'};
const today=()=>C.dayKey();
const currentTask=()=>app.state.session?.queue[app.state.session.index];
const findWord=id=>app.state.words.find(w=>w.id===id);
const hasActive=()=>Boolean(app.state.session&&!app.state.session.completed);
function toast(message,error=false){$('toast').textContent=message;$('toast').className='toast show'+(error?' error':'');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').className='toast',5000);$('live').textContent=message;}
function save(){
  if(app.corruptRaw!==null||app.conflict)return false;
  app.state.updatedAt=new Date().toISOString();
  const raw=JSON.stringify(app.state);
  try{localStorage.setItem(KEY,raw);app.lastRaw=raw;app.storageError=false;return true;}
  catch(_){app.storageError=true;return false;}
}
function mutate(fn){
  if(app.conflict){toast('另一个窗口已更新记录，请先加载最新记录。',true);return false;}
  if(app.corruptRaw!==null){toast('请先恢复或处理损坏的记录。',true);return false;}
  try{fn(app.state);save();notices();return true;}catch(e){toast(e.message||'操作失败，原有记录未被替换。',true);return false;}
}
function replaceState(candidate){
  if(app.conflict)throw new Error('请先加载另一个窗口的最新记录。');
  candidate=C.validateState(candidate);candidate.updatedAt=new Date().toISOString();
  const raw=JSON.stringify(candidate);
  try{localStorage.setItem(KEY,raw);}catch(_){app.storageError=true;notices();throw new Error('未能保存新数据，当前数据未被替换。请检查浏览器存储空间或权限。');}
  app.state=candidate;app.lastRaw=raw;app.corruptRaw=null;app.storageError=false;
}
function load(){
  let raw=null;try{raw=localStorage.getItem(KEY);}catch(_){app.storageError=true;}
  app.lastRaw=raw;
  if(raw!==null){try{app.state=C.validateState(JSON.parse(raw));}catch(_){app.corruptRaw=raw;app.state=C.createState(window.WSSeed);}}
  else{app.state=C.createState(window.WSSeed);save();}
  const old=app.state.session;
  C.rollDay(app.state,today());if(old&&!app.state.session&&app.corruptRaw===null)save();
  render();
}
function notices(){
  const badge=$('save-badge');badge.className='save-badge'+(app.storageError||app.conflict||app.corruptRaw!==null?' warn':'');
  badge.textContent=app.conflict?'更新冲突':app.corruptRaw!==null?'需要恢复':app.storageError?'未保存 · 临时模式':'本机保存';
  let html='';
  if(app.conflict)html=`<div class="notice"><span><strong>另一个窗口已更新记录。</strong>本页已暂停写入，避免覆盖进度。可先导出本页记录，再加载最新记录。</span><div class="button-row"><button class="btn small" data-action="export">导出本页记录</button><button class="btn small" data-action="reload">加载最新记录</button></div></div>`;
  else if(app.storageError)html=`<div class="notice"><span><strong>未能保存到浏览器。</strong>现在的练习只保留在当前页面，关闭前请导出备份。请勿使用无痕模式。</span><button class="btn small" data-action="export">导出当前备份</button></div>`;
  else if(location.protocol==='file:'&&app.corruptRaw===null)html=`<div class="notice"><span>正在本地文件模式试用。请保留同一文件路径，并定期导出备份；长期使用建议放到固定网址。</span><button class="btn small" data-action="export">导出备份</button></div>`;
  $('system-notice').innerHTML=html;
}
function navHTML(){return [['home','home'],['library','book'],['mistakes','flag'],['records','chart'],['settings','settings']].map(([route,ico])=>`<button class="nav-btn ${(app.route===route||(app.route==='study'&&route==='home'))?'active':''}" data-action="nav" data-route="${route}" ${app.route===route?'aria-current="page"':''}>${icon(ico)}<span>${names[route]}</span></button>`).join('');}
function sourceNote(){return `<div class="source-note">${icon('info')}<span>内置 20 个示例练习词（Starter / Unit 1），不是完整教材词表；例句为练习编写。请按孩子的课本核对，或在「设置与备份」导入自己的词库。</span></div>`;}
function heading(title,sub,button=''){return `<div class="page-heading"><div><h1>${title}</h1><p>${sub}</p></div>${button}</div>`;}
function empty(title,description,button=''){return `<div class="empty-state"><div class="empty-icon">${icon('leaf')}</div><h2>${title}</h2><p>${description}</p>${button}</div>`;}
function stat(label,value,unit,foot,ico){return `<div class="stat-card"><div class="stat-label">${label}${icon(ico)}</div><div class="stat-value">${value}<small>${unit}</small></div><div class="stat-foot">${foot}</div></div>`;}
function weekBars(){
  const days=Array.from({length:7},(_,i)=>C.addDays(today(),i-6));
  const counts=days.map(day=>(app.state.days[day]?.newIds.length||0)+(app.state.days[day]?.reviewedIds.length||0)),max=Math.max(8,...counts);
  const weekdays=['日','一','二','三','四','五','六'];
  return `<div class="week-bars">${days.map((day,i)=>{const dt=new Date(day+'T12:00:00'),label=i===6?'今天':weekdays[dt.getDay()];return `<div class="week-col"><span class="count">${counts[i]}</span><div class="bar ${counts[i]?'':'empty'}" style="height:${counts[i]?Math.max(9,counts[i]/max*68):4}px" title="${day}：新学 ${app.state.days[day]?.newIds.length||0}，复习 ${app.state.days[day]?.reviewedIds.length||0}"></div><span class="week-day ${i===6?'today':''}">${label}</span></div>`;}).join('')}</div>`;
}
function home(){
  const s=app.state,d=s.days[today()],p=C.dailyPlan(s,today()),known=Object.keys(s.progress).length,weak=Object.values(s.progress).filter(p=>p.unresolved).length;
  const finished=d?.completed>0&&!hasActive(),startLabel=hasActive()?'继续上次练习':p.fresh.length+p.due.length?'开始今日练习':'今日计划已完成';
  const pct=d?.spellingTotal?Math.round(d.spellingCorrect/d.spellingTotal*100)+'%':'—';
  return `${heading('今天，也进步一点。','把单词读出声，再试着独立写出来。',`<span class="tag neutral">七年级 · 家庭练习</span>`)}
  <section class="hero" aria-label="今日学习计划"><div><div class="eyebrow">${icon('leaf')} ONE SMALL STEP, EVERY DAY</div><h1>每天一点，<br><em>记得更牢。</em></h1><p class="intro">先复习，再学新词。<br>听得懂，想得起，也写得对。</p><button class="btn primary large" data-action="${hasActive()?'resume':'start'}" data-kind="daily" ${!hasActive()&&!p.fresh.length&&!p.due.length?'disabled':''}>${icon(hasActive()?'repeat':'arrow')}${startLabel}</button><p class="after-btn">${hasActive()?'上次的进度已经保留，从停下的地方继续。':p.paused?'旧词有些积压，今天先不加新词。':finished?'已经完成一轮。需要时可做下方专项练习。':'每日默认 6 个新词 · 大约 10～15 分钟的学习安排'}</p></div><div class="hero-right" aria-hidden="true"><div class="day-orbit"><span class="label">${hasActive()?'今日已新学':'今天的新词'}</span><span class="num">${String(hasActive()?d?.newIds.length||0:p.fresh.length).padStart(2,'0')}</span><div class="line"></div><span class="sub">让记忆慢慢生根</span></div><span class="hero-unit">${esc(s.settings.unit)}</span></div></section>
  <section class="stats-row" aria-label="真实学习统计">${stat('已接触单词',known,'词','看过不等于掌握','book')}${stat('待复习 / 检验',p.backlog,'词','到期旧词与未测新词','repeat')}${stat('待巩固错词',weak,'词','明天再独立检验','flag')}${stat('今日独立拼写',pct,'',d?.spellingTotal?`${d.spellingCorrect} / ${d.spellingTotal} 题首答正确`:'完成练习后显示','pencil')}</section>
  <div class="dashboard-grid"><section class="panel"><div class="section-top"><h2>今日学习路线</h2><span class="hint">一步一步来</span></div><div class="route-step"><div class="step-badge">01</div><div class="step-info"><h3>先唤醒旧词</h3><p>遮住意思，试着想起来。</p></div><span class="step-count">${p.due.length} 词待复习</span></div><div class="route-step"><div class="step-badge">02</div><div class="step-info"><h3>认识今天的新朋友</h3><p>听发音、看释义，再读一个例句。</p></div><span class="step-count">${p.fresh.length} 个新词</span></div><div class="route-step"><div class="step-badge">03</div><div class="step-info"><h3>把答案独立写出来</h3><p>拼写之后，再用句子检查词形。</p></div><span class="step-count">最多 5 题小测</span></div></section><section class="panel week-panel"><div class="section-top"><h2>这一周的积累</h2><span class="tag neutral">最近 7 天</span></div>${weekBars()}<p class="week-note">${known?'已经迈出了第一步。比起一次记很多，隔天还能写对更值得关注。':'还没有学习记录，也没关系。今天就是一个很好的开始。'}<br>柱形表示每天新学 + 复习的词数。</p></section></div>
  <section class="quick-grid" aria-label="专项练习"><button class="quick-card" aria-label="拼写专项" data-action="start" data-kind="spell"><span class="quick-icon">${icon('pencil')}</span><div><strong>拼写专项</strong><span>看中文，独立写英文</span></div>${icon('arrow')}</button><button class="quick-card" aria-label="听写专项" data-action="start" data-kind="listen"><span class="quick-icon">${icon('headphones')}</span><div><strong>听写专项</strong><span>不看单词，听完再写</span></div>${icon('arrow')}</button></section>${sourceNote()}`;
}
function wordStatus(w){const p=app.state.progress[w.id];return !p?'<span class="tag neutral">还没学过</span>':p.unresolved?'<span class="tag warn">待巩固</span>':p.due<=today()?'<span class="tag">今天复习</span>':`<span class="tag neutral">${esc(p.due.slice(5))} 复习</span>`;}
function wordItem(w,mistake=false){
  const p=app.state.progress[w.id],errors=p?.errors||{};
  return `<article class="word-item"><div class="word-item-top"><button class="word-title" data-action="word" data-id="${esc(w.id)}" aria-label="查看 ${esc(w.word)}" lang="en">${esc(w.word)}</button><button class="icon-btn" data-action="speak" data-id="${esc(w.id)}" aria-label="播放 ${esc(w.word)}">${icon('sound')}</button></div><p><span class="pos">${esc(w.pos)}</span>${esc(w.meaning)}</p>${mistake?`<div class="error-tags">${[['meaning','意思'],['spelling','拼写'],['listening','听音'],['form','词形']].filter(([k])=>errors[k]).map(([k,label])=>`<span class="error-tag">${label} ${errors[k]} 次</span>`).join('')}</div>`:''}<div class="word-item-bottom"><span>${esc(w.unit)}</span>${wordStatus(w)}</div></article>`;
}
function libraryList(){
  const q=C.norm(app.query),words=app.state.words.filter(w=>(app.unitFilter==='all'||w.unit===app.unitFilter)&&(!q||C.norm(w.word+' '+w.meaning).includes(q)));
  return `<div class="word-count">共 ${words.length} 个词 · 点击单词看例句，点击喇叭听发音</div>${words.length?`<div class="word-grid">${words.map(w=>wordItem(w)).join('')}</div>`:empty('没有找到这个词','可以换一个关键词，或导入孩子课本里的词表。')}`;
}
function library(){return `${heading('一本自己的小词库','不急着全背完，先跟上正在学习的单元。',`<button class="btn" data-action="nav" data-route="settings">${icon('download')}导入词库</button>`)}<div class="toolbar"><div class="search-field">${icon('search')}<input type="text" id="word-search" value="${esc(app.query)}" placeholder="搜索单词或中文意思" aria-label="搜索单词或中文意思" autocomplete="off"></div><select id="unit-filter" class="filter-select" aria-label="筛选词库单元"><option value="all">全部单元</option>${units().map(u=>`<option value="${esc(u)}" ${u===app.unitFilter?'selected':''}>${esc(u)}</option>`).join('')}</select></div><div id="word-list">${libraryList()}</div><div style="margin-top:20px">${sourceNote()}</div>`;}
function mistakes(){
  const all=app.state.words.filter(w=>app.state.progress[w.id]?.unresolved),words=all.filter(w=>app.mistakeFilter==='all'||app.state.progress[w.id].errors[app.mistakeFilter]>0);
  return `${heading('不会的词，值得再见。','错一次没关系，明天还能写对才重要。',all.length?`<button class="btn primary" data-action="start" data-kind="mistakes">${icon('repeat')}开始错词复习</button>`:'')}<p class="mistake-explain">这里保留还需巩固的词。同一天改对不立即移除；下一天不看提示独立答对后，才解除标记。空白放弃或看过答案，也会留在这里。</p><div class="toolbar"><div class="chips">${[['all','全部'],['spelling','拼写'],['listening','听音'],['form','词形'],['meaning','意思']].map(([k,label])=>`<button class="chip ${app.mistakeFilter===k?'active':''}" data-action="error-filter" data-filter="${k}" aria-pressed="${app.mistakeFilter===k}">${label}</button>`).join('')}</div><span class="small muted">${words.length} 个待巩固</span></div>${words.length?`<div class="word-grid">${words.map(w=>wordItem(w,true)).join('')}</div>`:empty(all.length?'这一类暂时没有错词':'还没有待巩固的错词','完成练习后，拼写、听音、意思和词形的错误会分别记录。',`<button class="btn soft" data-action="nav" data-route="home">回到今日练习 ${icon('arrow')}</button>`)}`;
}
function records(){
  const s=app.state,days=Object.keys(s.days).sort().reverse().slice(0,30),recent=Object.entries(s.days).filter(([day])=>day>=C.addDays(today(),-6)&&day<=today());
  const total=recent.reduce((v,[,d])=>v+d.spellingTotal,0),correct=recent.reduce((v,[,d])=>v+d.spellingCorrect,0),known=Object.keys(s.progress).length;
  const stage3=Object.values(s.progress).filter(p=>p.stage>=3&&!p.unresolved).length;
  return `${heading('把进步看得见','不比打卡天数，看看隔天是否还能独立写对。')}<div class="records-top"><section class="panel"><div class="section-top"><h2>最近 7 天</h2><span class="tag neutral">新学 + 复习</span></div>${weekBars()}<p class="data-note">没有记录的日子显示为 0，不补记，也不惩罚。</p></section><section class="panel"><h2>更值得关注的数字</h2><div class="record-numbers"><div><div class="record-number">${total?Math.round(correct/total*100)+'%':'—'}</div><div class="record-label">7 天独立拼写 · ${correct}/${total} 题</div></div><div><div class="record-number">${stage3}<small> / ${known}</small></div><div class="record-label">进入 14 天以上复习间隔</div></div></div><p class="data-note">后者只是复习阶段，不等于已经永久掌握。仍会按计划回来检验。</p></section></div><div class="section-top"><h2>每日记录</h2><span class="small muted">最近 30 个有记录的日期</span></div>${days.length?`<div class="table-scroll"><table><thead><tr><th>日期</th><th>新学</th><th>复习</th><th>独立拼写</th><th>句中练习</th></tr></thead><tbody>${days.map(day=>{const d=s.days[day];return `<tr><td>${day}${day===today()?' · 今天':''}</td><td>${d.newIds.length} 词</td><td>${d.reviewedIds.length} 词</td><td>${d.spellingCorrect} / ${d.spellingTotal}</td><td>${d.contextCorrect} / ${d.contextTotal}</td></tr>`;}).join('')}</tbody></table></div>`:empty('从第一次练习开始记录','完成今天的一小步，这里就会出现真实的学习数据。')}<p class="data-note">统计口径：新学、旧词复习按当天词条去重；独立拼写包含看中文拼写和听写的首答，未答出和借助提示算未独立答对，重试不计入分母。认义自评不计入拼写成绩。专项练习也会产生学习记录；「句中练习」包括词形和语境基础题。</p>`;
}
function units(){return [...new Set(app.state.words.map(w=>w.unit))];}
function optionUnits(){return units().map(u=>`<option value="${esc(u)}" ${u===app.state.settings.unit?'selected':''}>${esc(u)}</option>`).join('');}
function voiceList(){try{return window.speechSynthesis?.getVoices().filter(v=>/^en[-_]/i.test(v.lang)||v.lang==='en')||[];}catch(_){return [];}}
function voiceOptions(selected=app.state.settings.voiceURI){return '<option value="">自动选择（优先本地英语声音）</option>'+voiceList().map(v=>`<option value="${esc(v.voiceURI)}" ${v.voiceURI===selected?'selected':''}>${esc(v.name)} · ${esc(v.lang)} · ${v.localService?'本地':'可能联网'}</option>`).join('');}
function fileButton(id,action,label,accept,cls='btn'){return `<label class="${cls} file-label">${icon(action==='restore'?'repeat':'download')}${label}<input class="file-input" type="file" id="${id}" data-file="${action}" accept="${accept}" aria-label="${label}"></label>`;}
function settings(){const s=app.state.settings;return `${heading('按孩子的节奏来','少量新词，优先复习。设置只影响下一轮新建的训练。')}<div class="settings-grid"><div><section class="panel settings-card"><h2>每日学习量</h2><p class="card-intro">旧词超过复习上限时，暂停添加新词，先把欠下的复习补上。</p><form id="learning-settings"><div class="form-row"><label for="learning-unit">正在学习的单元</label><select id="learning-unit" name="unit">${optionUnits()}</select></div><div class="field-pair"><div class="form-row"><label for="new-limit">每天最多新学</label><input id="new-limit" name="newPerDay" type="number" min="1" max="20" value="${s.newPerDay}" required><p class="form-note">1～20 词，先从 6 词开始</p></div><div class="form-row"><label for="review-limit">每轮最多复习</label><input id="review-limit" name="reviewLimit" type="number" min="1" max="30" value="${s.reviewLimit}" required><p class="form-note">1～30 词，默认 12 词</p></div></div><label class="check-row"><input name="listening" type="checkbox" ${s.listening?'checked':''}><span>今日练习中穿插听写。<br><span class="muted">设备没有英语声音时，可关闭此项。</span></span></label><button class="btn primary" type="submit">保存学习设置</button></form>${hasActive()?`<p class="form-note" style="margin-top:15px">还有未完成的训练。导入词库前请完成它，或结束这一轮；已产生的记录仍保留。</p><button class="link-btn" data-action="end-session">结束本次练习</button>`:''}</section>
  <section class="panel settings-card"><h2>英语发音</h2><p class="card-intro">使用设备或浏览器提供的英语合成语音。先测试，确认孩子听得到。</p><form id="voice-settings"><div class="form-row"><label for="voice-accent">优先口音</label><select id="voice-accent" name="accent"><option value="en-GB" ${s.accent==='en-GB'?'selected':''}>英式英语 · en-GB</option><option value="en-US" ${s.accent==='en-US'?'selected':''}>美式英语 · en-US</option></select></div><div class="form-row"><label for="voice-choice">发音声音</label><select id="voice-choice" name="voiceURI">${voiceOptions()}</select><p class="form-note" id="voice-count">检测到 ${voiceList().length} 个英语声音。系统的默认声音可能稍后载入。</p></div><div class="button-row"><button class="btn" type="button" data-action="voice-test">${icon('sound')}测试发音</button><button class="btn soft" type="submit">保存发音设置</button></div></form><p class="form-note" style="margin-top:15px">测试内容：Hello. My hobby is reading.<br>无声时检查设备音量、英语语音包，或换用浏览器。没有内置真人音频，不保证离线发音。</p></section></div>
  <div><section class="panel settings-card"><h2>词库与进度备份</h2><p class="card-intro">不会自动跨设备同步。导出一份 JSON 文件，才能在另一台设备手动恢复。</p><div class="storage-status">当前词库：${app.state.words.length} 词 · ${units().length} 个单元<br>已接触：${Object.keys(app.state.progress).length} 词 · 记录日期：${Object.keys(app.state.days).length} 天</div><div class="backup-row"><h3>完整学习备份</h3><p>包含词库、设置、错词、学习记录和进行中的练习。</p><div class="button-row"><button class="btn primary" data-action="export">${icon('download')}导出当前备份</button>${fileButton('restore-file','restore','恢复备份','.json,application/json')}</div></div><div class="backup-row"><h3>导入自己的课本词表</h3><p>支持 UTF-8 CSV 或 JSON 词条数组。单次最多 2,000 词、文件最大 3 MB。同单元同单词不重复导入。</p><div class="button-row">${fileButton('deck-file','deck','选择词库文件','.csv,.json,text/csv,application/json')}<button class="btn" data-action="template">下载 CSV 模板</button></div><p>必需字段：<code>word</code>、<code>meaning</code>。其余字段见模板；不自动生成未经核实的教材内容。</p></div><div class="backup-row"><h3>清空练习进度</h3><p class="warning-copy">保留词库与设置，清空错词、每日记录和当前练习。操作前请先备份。</p><button class="btn danger" data-action="reset">清空学习记录</button></div></section>
  <section class="panel settings-card"><h2>关于数据与使用方式</h2><div class="privacy-list"><p>本页不主动上传词库、答案或学习记录，也不请求麦克风权限。在线系统声音可能联网合成所选单词或例句，优先选择标为「本地」的英语声音。</p><p>本地文件适合先试用。长期使用建议部署到固定网址，再始终用同一个浏览器打开。清理浏览器、使用无痕模式、移动本地文件，均可能影响记录；请定期备份。</p><p>复习间隔为 1 / 3 / 7 / 14 / 30 天的简易规则，按设备本地日期计算，不是对个人记忆的精确预测。近期逐题明细最多保留 3,000 条，每日汇总和错词进度持续保留。</p></div></section></div></div>${sourceNote()}`;}
function audioButtons(w,question=false){return `<div class="audio-row"><button class="btn" data-action="speak" data-id="${esc(w.id)}" aria-label="${question?'播放本题单词':'听发音'}">${icon('sound')}${question?'播放单词':'听发音'}</button><button class="btn" data-action="speak" data-id="${esc(w.id)}" data-slow="true">${icon('clock')}慢速播放</button></div>`;}
function examples(w){return `${w.example?`<div class="example-block has-audio"><button class="example-audio" data-action="speak-example" data-id="${esc(w.id)}" aria-label="朗读例句">${icon('sound')}</button><p lang="en">${esc(w.example)}</p>${w.exampleZh?`<p class="translation">${esc(w.exampleZh)}</p>`:''}</div>`:''}${w.tip?`<div class="tip-box"><strong>记忆小提醒</strong>${esc(w.tip)}</div>`:''}`;}
function study(){
  const session=app.state.session;if(!session)return empty('这轮暂时没有需要练习的词','可以选择一个单元，或回到首页查看今天的安排。',`<button class="btn primary" data-action="nav" data-route="home">回到今日练习</button>`);
  if(session.completed)return finish();
  const t=currentTask(),w=findWord(t.wordId),phase={learn:'认识新词',review:'唤醒旧词',practice:'独立练习',quiz:'收尾小测',retry:'错词再见'}[t.phase];
  let card='';
  if(t.type==='learn')card=`<div class="english-word" lang="en">${esc(w.word)}</div>${audioButtons(w)}<div class="meaning-line"><span class="pos">${esc(w.pos)}</span>${esc(w.meaning)}</div>${examples(w)}<div class="study-bottom"><button class="btn primary wide large" data-action="next">学过了，继续 ${icon('arrow')}</button><p class="muted">这里只记为学过，后面的独立拼写才是检验。</p></div>`;
  else if(t.type==='recall')card=`<p class="question-hint">先在心里想一想：这个词是什么意思？</p><div class="english-word" lang="en">${esc(w.word)}</div>${audioButtons(w)}${t.revealed?`<div class="meaning-line"><span class="pos">${esc(w.pos)}</span>${esc(w.meaning)}</div>${examples(w)}<div class="recall-buttons"><button class="btn" data-action="recall" data-value="false">没想起来</button><button class="btn primary" data-action="recall" data-value="true">想起来了</button></div><p class="answer-note">这是自我检查，不计入独立拼写成绩。</p>`:`<div class="reveal-placeholder">答案先藏起来，给大脑一点回忆的空间。</div><button class="btn primary wide large" data-action="reveal">想一想，再看意思</button>`}`;
  else{
    const prompt=t.type==='listen'?`<div class="listening-orb" aria-hidden="true">${icon('headphones')}</div><h2>听一听，这是哪个词？</h2><p class="question-hint">先播放，再把听到的单词写下来。</p>${audioButtons(w,true)}${!t.feedback?'<button class="link-btn" data-action="convert-listen">听不到？改为看中文拼写</button>':''}`:t.type==='context'?`<p class="question-hint">用括号中单词的正确形式填空。</p><div class="question-cloze" lang="en">${esc(w.cloze).replace('____','<span class="blank">&nbsp;&nbsp;?&nbsp;&nbsp;</span>')}</div>`:`<p class="question-hint">看中文，把本单元对应的英文写出来。</p><div class="question-meaning">${esc(w.meaning)}</div><span class="pos">${esc(w.pos)}</span>`;
    let taskBody='';
    if(t.feedback){
      const f=t.feedback,success=f.independent,assisted=f.correct&&!f.independent;
      taskBody=`<div class="feedback-box ${success?'':assisted?'assisted':'wrong'}"><div class="feedback-title">${icon(success?'check':'repeat')}${success?'独立写对了！':assisted?'借助提示完成，明天再检验。':'发现一个需要再练的地方。'}</div>${!f.correct&&f.input?`<p>你写的是：<span class="incorrect" lang="en">${esc(f.input)}</span></p>`:''}<p>${success?'本题答案':'正确答案'}</p><div class="answer-word" lang="en">${esc(t.type==='context'?w.answer:w.word)}</div><p>${success?'继续保持，不需要急着往下刷。':t.retry<2?'已留在错词本，隔几题再见；明天继续复习。':'今天先记住正确写法，明天再回来独立试一次。'}</p></div>${t.type!=='listen'?audioButtons(w):''}${examples(w)}<div class="study-bottom"><button class="btn primary wide large" data-action="next">${session.index===session.queue.length-1?'查看本次结果':'下一题'} ${icon('arrow')}</button></div>`;
    }else if(t.assisted&&t.revealed){
      taskBody=`<div class="hint-answer">本题答案：<strong lang="en">${esc(t.type==='context'?w.answer:w.word)}</strong><p class="tiny">这题已使用提示，不计为独立答对。</p></div>${audioButtons(w)}${examples(w)}<div class="study-bottom"><button class="btn primary wide" data-action="after-hint">记住答案，稍后再试 ${icon('arrow')}</button></div>`;
    }else taskBody=`<form id="answer-form" class="answer-form"><label class="sr-only" for="answer-input">输入英文答案</label><input id="answer-input" class="answer-input" type="text" value="${esc(t.draft||'')}" lang="en" placeholder="在这里输入英文" maxlength="160" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="text" aria-describedby="answer-note"><div class="answer-actions"><button class="btn primary large" type="submit">检查答案 ${icon('check')}</button><button class="btn" type="button" data-action="give-up">暂时不会</button></div><p class="answer-note" id="answer-note">不区分大小写 · Enter 提交 · 拼写与词形都要准确</p></form><button class="link-btn" data-action="hint">看答案（不计独立答对）</button>`;
    card=prompt+taskBody;
  }
  return `<div class="study-wrap"><div class="study-toolbar"><span class="phase-name">${icon('leaf')} ${phase}</span><button class="btn ghost" data-action="pause">暂停，稍后继续</button></div><div class="progress-meta"><span>${esc(session.kind==='daily'?'今日计划':session.kind==='mistakes'?'错词复习':'专项练习')} · ${t.retry?'错词重试 '+t.retry+' / 2':'一步一步来'}</span><span>${session.index+1} / ${session.queue.length} 步</span></div><div class="progress-track" role="progressbar" aria-label="训练进度" aria-valuemin="0" aria-valuemax="${session.queue.length}" aria-valuenow="${session.index}"><div class="progress-fill" style="width:${session.index/session.queue.length*100}%"></div></div><section class="study-card"><span class="unit-tag">${esc(w.unit)}</span>${card}</section><p class="session-footnote">${icon('lock')}${app.storageError?'本次进度暂未保存，离开前请导出。':'每一步都会尝试保存，中途停下也没关系。'}</p></div>`;
}
function finish(){
  const s=app.state.session,events=app.state.events.filter(e=>e.sessionId===s.id),first=events.filter(e=>['spell','listen'].includes(e.type)&&!e.retry),right=first.filter(e=>e.correct&&!e.assisted).length,weak=[...new Set(events.filter(e=>!e.correct||e.assisted).map(e=>e.wordId))],words=[...new Set(events.map(e=>e.wordId))];
  return `<section class="panel finish-card"><div class="finish-icon">${icon('leaf')}</div><div class="eyebrow" style="justify-content:center">A LITTLE BETTER, EVERY DAY</div><h1>今天这一小步，完成了。</h1><p>不需要一下记住所有。明天还能想起、写对，就在进步。</p><div class="finish-stats"><div class="finish-stat"><strong>${words.length}</strong><span>本轮练到的词</span></div><div class="finish-stat"><strong>${first.length?Math.round(right/first.length*100)+'%':'—'}</strong><span>独立拼写 · ${right}/${first.length}</span></div><div class="finish-stat"><strong>${weak.length}</strong><span>本轮需要再巩固</span></div></div><div class="tip-box"><strong>接下来怎么做？</strong>${weak.length?'错词已经留在错词本。隔天再来，不看提示重新写一次。':'今天先到这里。明天会安排到期的旧词，再添加少量新词。'} 同一天反复答对不会提前跳过复习阶段。</div><div class="button-row"><button class="btn primary" data-action="nav" data-route="home">回到今日练习 ${icon('arrow')}</button><button class="btn" data-action="nav" data-route="mistakes">查看错词本</button></div></section>`;
}
function recovery(){return `<section class="panel recovery-card"><div class="empty-icon">${icon('info')}</div><h1>发现损坏或不兼容的学习记录</h1><p>为保护原数据，程序没有覆盖它，也暂停了新记录写入。先导出原始内容留存，再从之前保存的完整备份恢复。</p><div class="button-row"><button class="btn" data-action="export-raw">${icon('download')}导出损坏的原始记录</button>${fileButton('restore-file','restore','恢复备份','.json,application/json')}</div><p>没有可用备份时，可以明确清空损坏记录后重新开始。未备份的旧进度将无法恢复。</p><button class="btn danger" data-action="reset-corrupt">清空损坏记录并重新开始</button></section>`;}
function render(focus=false){
  $('nav').innerHTML=navHTML();$('view-name').textContent=names[app.route]||'今日练习';
  $('date-display').textContent=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
  notices();
  const views={home,library,mistakes,records,settings,study};$('main').innerHTML=app.corruptRaw!==null?recovery():(views[app.route]||home)();
  if(focus){$('main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  if(app.route==='study'&&$('answer-input')&&window.innerWidth>820)$('answer-input').focus({preventScroll:true});
}
// Speech calls remain user initiated. A watchdog turns silent service failures into visible recovery.
let speechToken=0,speechTimer=null,utteranceRef=null;
function stopSpeech(){speechToken++;clearTimeout(speechTimer);try{window.speechSynthesis?.cancel();}catch(_){}utteranceRef=null;}
function speechMessage(message){$('speech-notice').hidden=false;$('speech-notice').innerHTML=`<div><span>${esc(message)}</span><button class="icon-btn" data-action="close-speech" aria-label="关闭发音提示">${icon('close')}</button></div>`;}
function speak(text,slow=false,overrides=null){
  stopSpeech();const token=speechToken;$('speech-notice').hidden=true;
  try{
    const synth=window.speechSynthesis;
    if(!synth||typeof window.SpeechSynthesisUtterance!=='function'){speechMessage('当前浏览器不支持发音。请换用支持系统语音的浏览器；听写可切换成看中文拼写。');return;}
    const settings=overrides||app.state.settings,voices=voiceList();
    const chosen=voices.find(v=>v.voiceURI===settings.voiceURI)||voices.find(v=>v.localService&&v.lang.toLowerCase()===settings.accent.toLowerCase())||voices.find(v=>v.localService)||voices.find(v=>v.lang.toLowerCase()===settings.accent.toLowerCase())||voices[0];
    const u=new SpeechSynthesisUtterance(String(text).slice(0,600));utteranceRef=u;
    u.lang=chosen?.lang||settings.accent;u.rate=slow ? 0.68 : 0.92;u.pitch=1;u.volume=1;if(chosen)u.voice=chosen;
    const fail=message=>{if(token!==speechToken)return;clearTimeout(speechTimer);speechMessage(message);utteranceRef=null;};
    u.onstart=()=>{if(token!==speechToken)return;clearTimeout(speechTimer);$('live').textContent=slow?'正在慢速朗读。':'正在朗读。';speechTimer=setTimeout(()=>fail('语音服务响应超时。请重试，或切换成看中文拼写。'),90000);};
    u.onend=()=>{if(token!==speechToken)return;clearTimeout(speechTimer);utteranceRef=null;$('live').textContent='朗读结束。';};
    u.onerror=e=>{if(token!==speechToken||['interrupted','canceled'].includes(e.error))return;fail('发音失败。请检查音量、网络或设备英语语音包，在「设置与备份」测试其他声音。听写可改为看中文拼写，不会因此扣分。');};
    speechTimer=setTimeout(()=>fail('发音没有启动。请检查设备音量和英语语音包，在「设置与备份」测试发音；也可切换成看中文拼写。'),7000);
    synth.resume();synth.speak(u);
  }catch(_){clearTimeout(speechTimer);speechMessage('无法启动发音。请换一个英语声音或浏览器；听写可切换成看中文拼写。');}
}
function showDialog(title,body,actions=''){
  const d=$('modal');if(d.open)d.close();
  d.innerHTML=`<div class="dialog-top"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="关闭弹窗">${icon('close')}</button></div>${body}${actions?`<div class="dialog-actions">${actions}</div>`:''}`;
  d.showModal();
}
function closeModal(){if($('modal').open)$('modal').close();app.pending=null;}
function showWord(id){const w=findWord(id);if(!w)return;showDialog('单词卡片',`<div class="dialog-word"><span class="tag neutral">${esc(w.unit)}</span><div class="english-word" lang="en">${esc(w.word)}</div>${audioButtons(w)}<div class="meaning-line"><span class="pos">${esc(w.pos)}</span>${esc(w.meaning)}</div>${examples(w)}<p class="form-note">词库浏览不记作独立答对；要检验记忆，请进入专项或每日训练。</p></div>`);}
function download(filename,content,type='application/json'){
  try{
    const blob=new Blob([content],{type:type+';charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    toast('已交给浏览器下载，请确认文件已保存。');
  }catch(_){toast('未能导出文件。请换用浏览器打开本页，再重试。',true);}
}
function exportBackup(){download(`词芽-完整备份-${today()}.json`,JSON.stringify({format:'wordsprout-backup',version:1,exportedAt:new Date().toISOString(),state:app.state},null,2));}
const template='\ufeffunit,word,pos,meaning,example,exampleZh,tip,cloze,answer\r\n自定义单元,tree,n.,树,A tree grows in our garden.,一棵树长在我们的花园里。,复数 trees,There are two ____ in the garden. (tree),trees\r\n自定义单元,book,n.,书,I read a book every day.,我每天读一本书。,复数 books,I have three ____. (book),books\r\n';
async function readFile(file,kind){
  if(!file)return;
  try{
    if(file.size>3*1024*1024)throw new Error('文件超过 3 MB，请减少内容后再试。');
    if(app.conflict)throw new Error('请先加载另一个窗口的最新记录。');
    const content=(await file.text()).replace(/^\uFEFF/,'');
    if(kind==='restore'){
      const parsed=JSON.parse(content);
      if(parsed?.format!=='wordsprout-backup'||parsed.version!==1)throw new Error('这不是词芽 v1 的完整备份，请使用「导出当前备份」生成的 JSON 文件。');
      const candidate=C.validateState(parsed.state);app.pending={kind:'restore',state:candidate};
      showDialog('恢复之前，先核对一下',`<div class="dialog-copy">文件中有 <strong>${candidate.words.length} 个词</strong>，已接触 <strong>${Object.keys(candidate.progress).length} 个词</strong>，共 ${Object.keys(candidate.days).length} 天学习记录。<br><br><strong>恢复会替换当前浏览器的词库和进度。</strong>建议先导出当前记录，恢复前不会修改现有数据。</div>`,`<button class="btn" data-action="export">先导出当前记录</button><button class="btn primary" data-action="confirm-restore">确认恢复</button>`);
    }else{
      if(hasActive())throw new Error('还有未完成的练习。请先完成它，或在学习设置中结束本轮，再导入词库。');
      let input;if(file.name.toLowerCase().endsWith('.csv'))input=C.parseCSV(content);else{const parsed=JSON.parse(content);input=Array.isArray(parsed)?parsed:parsed.words;}
      const words=C.validateWords(input);C.validateWords([...app.state.words,...words]);app.pending={kind:'deck',words};
      showDialog('确认导入词库',`<div class="dialog-copy">将新增 <strong>${words.length} 个词</strong>，不会修改现有学习记录。请先核对中文意思和单元；导入的内容不会自动被认定为官方教材。</div><div class="preview-list">${words.slice(0,8).map(w=>`<p><strong lang="en">${esc(w.word)}</strong> · ${esc(w.meaning)}<br><span class="tiny">${esc(w.unit)}</span></p>`).join('')}${words.length>8?`<p>还有 ${words.length-8} 条……</p>`:''}</div>`,`<button class="btn" data-action="close-modal">取消</button><button class="btn primary" data-action="confirm-deck">确认导入</button>`);
    }
  }catch(e){toast(`${kind==='restore'?'恢复失败':'导入失败'}：${e.message||'文件内容无效'}`,true);}
}
function startSession(kind,replace=false){
  if(hasActive()&&app.state.session.date===today()&&app.state.session.kind!==kind&&!replace){
    app.pending={kind:'switch',mode:kind};
    showDialog('先处理上次的练习',`<div class="dialog-copy">上一轮还没做完。可以继续，也可以结束上一轮后开始新训练。已经产生的学习记录会保留，没做的题不会算完成。</div>`,`<button class="btn" data-action="resume">继续上次练习</button><button class="btn primary" data-action="confirm-switch">结束本轮，开始新训练</button>`);return;
  }
  stopSpeech();if(mutate(s=>{if(replace)s.session=null;C.makeSession(s,today(),kind);})){
    app.route=app.state.session?'study':'home';render(true);if(!app.state.session)toast('目前没有需要做的题。可以换个单元或导入新词。');
  }
}
function ensureCurrentDay(){if(app.state.session&&app.state.session.date!==today()){mutate(s=>C.rollDay(s,today()));app.route='home';render(true);toast('已经是新的一天，已保留旧记录，请开始今天的计划。');return false;}return true;}
function answer(value,opts={}){
  if(!ensureCurrentDay())return;
  const t=currentTask();if(!t||t.feedback)return;
  if(!String(value??'').trim()&&!opts.giveUp&&t.type!=='recall'){toast('先写出答案，或者选择「暂时不会」。');$('answer-input')?.focus();return;}
  stopSpeech();if(mutate(s=>C.submit(s,value,opts)))render();
}
function nextQuestion(){if(!ensureCurrentDay())return;stopSpeech();if(mutate(s=>C.next(s)))render(true);}
function act(action,el){
  switch(action){
    case 'nav':stopSpeech();app.route=el.dataset.route;render(true);break;
    case 'start':startSession(el.dataset.kind);break;
    case 'resume':closeModal();app.route='study';render(true);break;
    case 'confirm-switch':{const kind=app.pending?.mode;if(!kind)return;closeModal();startSession(kind,true);break;}
    case 'pause':stopSpeech();app.route='home';render(true);break;
    case 'next':nextQuestion();break;
    case 'reveal':if(ensureCurrentDay()&&mutate(()=>{const t=currentTask();if(t)t.revealed=true;}))render();break;
    case 'recall':if(!ensureCurrentDay())break;if(!currentTask()?.revealed)break;if(mutate(s=>{C.submit(s,'',{recalled:el.dataset.value==='true'});C.next(s);}))render(true);break;
    case 'hint':if(ensureCurrentDay()&&mutate(()=>{const t=currentTask();if(t&&!t.feedback){t.assisted=true;t.revealed=true;}}))render();break;
    case 'after-hint':{const t=currentTask();if(!t)return;const w=findWord(t.wordId);answer(t.type==='context'?w.answer:w.word);break;}
    case 'give-up':answer('',{giveUp:true});break;
    case 'convert-listen':stopSpeech();if(ensureCurrentDay()&&mutate(s=>C.convertListening(s)))render();break;
    case 'speak':{const w=findWord(el.dataset.id);if(w)speak(w.word,el.dataset.slow==='true');break;}
    case 'speak-example':{const w=findWord(el.dataset.id);if(w&&w.example)speak(w.example);break;}
    case 'voice-test':speak('Hello. My hobby is reading.',false,{accent:$('voice-accent')?.value||app.state.settings.accent,voiceURI:$('voice-choice')?.value||''});break;
    case 'close-speech':$('speech-notice').hidden=true;break;
    case 'word':showWord(el.dataset.id);break;
    case 'error-filter':app.mistakeFilter=el.dataset.filter;render();break;
    case 'close-modal':closeModal();break;
    case 'export':exportBackup();break;
    case 'export-raw':download(`词芽-原始记录-${today()}.txt`,app.corruptRaw||'','text/plain');break;
    case 'template':download('词芽-词库导入模板.csv',template,'text/csv');break;
    case 'confirm-deck':{
      if(app.pending?.kind!=='deck')return;
      const candidate=C.validateState(app.state),count=C.mergeWords(candidate,app.pending.words);replaceState(candidate);closeModal();render();toast(`成功导入 ${count} 个词。可在学习设置中选择新单元。`);break;
    }
    case 'confirm-restore':{
      if(app.pending?.kind!=='restore')return;
      const candidate=app.pending.state;C.rollDay(candidate,today());replaceState(candidate);closeModal();app.route='home';render(true);toast('恢复成功。词库和学习记录已载入。');break;
    }
    case 'reset':showDialog('确认清空学习记录？',`<div class="dialog-copy">词库与设置会保留，错词、每日记录和当前练习将全部清空。这不能撤销，除非你已经导出备份。<br><br>请输入 <strong>清空</strong>，然后确认。</div><div class="form-row" style="margin-top:15px"><input id="reset-word" type="text" placeholder="输入：清空" aria-label="输入清空以确认"></div>`,`<button class="btn" data-action="export">先导出备份</button><button class="btn danger" data-action="confirm-reset">确认清空</button>`);break;
    case 'reset-corrupt':showDialog('确认重新开始？',`<div class="dialog-copy">损坏记录将被新的示例词库和空白进度替换。请先导出原始内容留存。请输入 <strong>清空</strong> 后确认。</div><div class="form-row" style="margin-top:15px"><input id="reset-word" type="text" placeholder="输入：清空" aria-label="输入清空以确认"></div>`,`<button class="btn" data-action="export-raw">先导出原始记录</button><button class="btn danger" data-action="confirm-reset-corrupt">确认重新开始</button>`);break;
    case 'confirm-reset':case 'confirm-reset-corrupt':{
      if($('reset-word')?.value.trim()!=='清空'){toast('请输入「清空」，避免误操作。',true);return;}
      const reset=C.createState(action==='confirm-reset'?app.state.words:window.WSSeed);if(action==='confirm-reset')reset.settings={...app.state.settings};
      replaceState(reset);closeModal();app.route='home';render(true);toast('已重新开始。');break;
    }
    case 'end-session':showDialog('结束当前这一轮？','<div class="dialog-copy">已学过、已答过的记录会保留，尚未完成的题不会算作完成。下次会根据当前进度重新安排。</div>','<button class="btn" data-action="close-modal">继续保留</button><button class="btn primary" data-action="confirm-end">确认结束本轮</button>');break;
    case 'confirm-end':if(mutate(s=>s.session=null)){closeModal();render();toast('本轮已结束，已产生的记录已保留。');}break;
    case 'reload':location.reload();break;
  }
}
document.addEventListener('click',e=>{const el=e.target.closest('button[data-action]');if(!el||el.disabled)return;try{act(el.dataset.action,el);}catch(error){toast(error.message||'操作未完成，请重试。',true);}});
document.addEventListener('submit',e=>{
  if(e.target.id==='answer-form'){e.preventDefault();answer($('answer-input').value);}
  else if(e.target.id==='learning-settings'){
    e.preventDefault();const form=e.target;if(!form.reportValidity())return;
    const setting={...app.state.settings,unit:form.elements.unit.value,newPerDay:Number(form.elements.newPerDay.value),reviewLimit:Number(form.elements.reviewLimit.value),listening:form.elements.listening.checked};
    if(mutate(s=>{const candidate={...s,settings:setting};C.validateState(candidate);s.settings=setting;})){render();toast(app.storageError?'设置已更新，但未能保存。请导出备份。':'学习设置已保存，下一轮训练生效。');}
  }else if(e.target.id==='voice-settings'){
    e.preventDefault();const form=e.target;if(mutate(s=>{s.settings.accent=form.elements.accent.value;s.settings.voiceURI=form.elements.voiceURI.value;})){render();toast(app.storageError?'发音设置暂未保存。':'发音设置已保存。');}
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='word-search'){app.query=e.target.value;$('word-list').innerHTML=libraryList();}
  if(e.target.id==='answer-input'&&currentTask()&&!currentTask().feedback){currentTask().draft=e.target.value;save();notices();}
});
document.addEventListener('change',e=>{
  if(e.target.id==='unit-filter'){app.unitFilter=e.target.value;$('word-list').innerHTML=libraryList();}
  if(e.target.dataset.file){const file=e.target.files?.[0],kind=e.target.dataset.file;e.target.value='';readFile(file,kind);}
  if(e.target.id==='voice-accent'&&$('voice-choice'))$('voice-choice').value='';
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&app.route==='study'&&!$('modal').open&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName)){
    const t=currentTask();if(t&&(t.feedback||t.type==='learn')){e.preventDefault();nextQuestion();}
  }
});
$('modal').addEventListener('click',e=>{if(e.target!==$('modal'))return;const b=$('modal').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeModal();});
$('modal').addEventListener('cancel',()=>{app.pending=null;});
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue!==app.lastRaw){app.conflict=true;notices();}});
window.addEventListener('pagehide',()=>{stopSpeech();if(app.state&&!app.conflict&&app.corruptRaw===null)save();});
try{window.speechSynthesis?.addEventListener('voiceschanged',()=>{if($('voice-choice')){const selected=$('voice-choice').value;$('voice-choice').innerHTML=voiceOptions(selected);$('voice-count').textContent=`检测到 ${voiceList().length} 个英语声音。优先选择本地声音。`;}});}catch(_){}
load();
})();
