/* WordSprout core: pure state transitions, no DOM, network or browser storage. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WSCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const INTERVALS = [1, 3, 7, 14, 30];
  const TYPES = ['learn','recall','spell','listen','context'];
  const BAD = new Set(['__proto__','prototype','constructor',...Object.getOwnPropertyNames(Object.prototype)]);
  const fail = text => { throw new Error(text); };
  const norm = value => String(value ?? '').normalize('NFKC').replace(/[’‘]/g,"'").trim().replace(/\s+/g,' ').toLowerCase();
  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function isDay(s) {
    if (typeof s !== 'string' || !/^20\d\d-\d{2}-\d{2}$/.test(s)) return false;
    const [y,m,d]=s.split('-').map(Number), date=new Date(y,m-1,d,12);
    return dayKey(date)===s;
  }
  function addDays(day, amount) {
    if (!isDay(day) || !Number.isInteger(amount)) fail('日期无效');
    const [y,m,d]=day.split('-').map(Number), date=new Date(y,m-1,d,12);
    date.setDate(date.getDate()+amount); return dayKey(date);
  }
  function assertSafe(value, depth=0) {
    if(depth>30) fail('数据层级过深');
    if(!value || typeof value!=='object') return;
    for(const k of Object.keys(value)) { if(BAD.has(k)) fail('数据含不安全字段'); assertSafe(value[k],depth+1); }
  }
  function hash(s) {let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
  function text(v,max,required=false) {
    if(v==null && !required) return '';
    if(typeof v!=='string' || v.length>max || (required&&!v.trim())) fail('词条字段缺失或过长');
    return v.trim();
  }
  function validateWords(input) {
    assertSafe(input);
    if(!Array.isArray(input)||!input.length||input.length>2000) fail('请提供 1～2000 条词条');
    const keys=new Set(),ids=new Set();
    return input.map((r,index)=>{
      if(!r||typeof r!=='object'||Array.isArray(r)) fail(`第 ${index+1} 条词条格式不正确`);
      const unit=text(r.unit??'自定义单元',80,true),word=text(r.word,80,true),meaning=text(r.meaning,300,true);
      if(!/^[A-Za-z][A-Za-z .'\-]*$/.test(word)) fail(`第 ${index+1} 条：英文单词格式不正确`);
      const key=norm(unit)+'|'+norm(word), id=r.id==null?'w-'+hash(key):text(r.id,100,true);
      if(!/^[a-zA-Z0-9_-]+$/.test(id)||BAD.has(id)) fail('词条 ID 无效');
      if(ids.has(id)||keys.has(key)) fail(`词条重复：${unit} / ${word}`);
      ids.add(id);keys.add(key);
      const w={id,unit,word,pos:text(r.pos,30),meaning,example:text(r.example,600),exampleZh:text(r.exampleZh,600),tip:text(r.tip,500),cloze:text(r.cloze,600),answer:text(r.answer,100)};
      if(Boolean(w.cloze)!==Boolean(w.answer)|| (w.cloze&&!w.cloze.includes('____'))) fail(`${word} 的句中练习需同时填写 cloze（含 ____）和 answer`);
      return w;
    });
  }
  function createState(words) {
    const deck=validateWords(words);
    return {version:1,words:deck,settings:{unit:deck[0].unit,newPerDay:6,reviewLimit:12,accent:'en-GB',voiceURI:'',listening:true},progress:{},days:{},events:[],session:null,updatedAt:null};
  }
  function dayRecord(s,day) {
    if(!s.days[day]) s.days[day]={newIds:[],reviewedIds:[],spellingTotal:0,spellingCorrect:0,contextTotal:0,contextCorrect:0,completed:0};
    return s.days[day];
  }
  function introduce(s,id,day) {
    if(s.progress[id]) return s.progress[id];
    if(!s.words.some(w=>w.id===id)||!isDay(day)) fail('词条或日期无效');
    const p={introduced:day,stage:0,due:addDays(day,1),lastScheduled:day,lastTested:null,lastWrong:null,unresolved:false,errors:{meaning:0,spelling:0,listening:0,form:0},attempts:0};
    s.progress[id]=p; const d=dayRecord(s,day);if(!d.newIds.includes(id))d.newIds.push(id);return p;
  }
  function dailyPlan(s,day) {
    const d=s.days[day], unitWords=s.words.filter(w=>w.unit===s.settings.unit);
    const dueAll=s.words.filter(w=>s.progress[w.id]&&(s.progress[w.id].due<=day||(s.progress[w.id].introduced===day&&!s.progress[w.id].lastTested))).sort((a,b)=>s.progress[a.id].due.localeCompare(s.progress[b.id].due));
    const remaining=Math.max(0,s.settings.newPerDay-(d?.newIds.length||0));
    const paused=dueAll.length>s.settings.reviewLimit;
    return {due:dueAll.slice(0,s.settings.reviewLimit).map(w=>w.id),fresh:paused?[]:unitWords.filter(w=>!s.progress[w.id]).slice(0,remaining).map(w=>w.id),backlog:dueAll.length,paused};
  }
  function grade(w,type,value) {return norm(value)===norm(type==='context'?w.answer:w.word);}
  function record(s,id,type,correct,day,opts={}) {
    const existed=Boolean(s.progress[id]),p=introduce(s,id,day),d=dayRecord(s,day);
    const assisted=Boolean(opts.assisted), retry=opts.retry||0, objective=['spell','listen','context'].includes(type);
    const independent=Boolean(correct)&&!assisted;
    p.attempts++;
    if(objective)p.lastTested=day;
    if(objective&&!retry) {
      if(type==='context'){d.contextTotal++;if(independent)d.contextCorrect++;}
      else{d.spellingTotal++;if(independent)d.spellingCorrect++;}
    }
    if(objective&&existed&&p.introduced<day&&!d.reviewedIds.includes(id))d.reviewedIds.push(id);
    if(!independent) {
      p.stage=0;p.due=addDays(day,1);p.lastScheduled=day;p.lastWrong=day;p.unresolved=true;
      const error={recall:'meaning',spell:'spelling',listen:'listening',context:'form'}[type]||'spelling';
      if(!retry)p.errors[error]++;
    } else if(objective&&!retry) {
      if(p.lastWrong&&day>p.lastWrong)p.unresolved=false;
      if(day>p.lastScheduled && day>=p.due){p.stage=Math.min(p.stage+1,INTERVALS.length-1);p.due=addDays(day,INTERVALS[p.stage]);p.lastScheduled=day;}
    }
    s.events.push({date:day,wordId:id,type,correct:Boolean(correct),assisted,retry,sessionId:s.session?.id||''});
    if(s.events.length>3000)s.events.splice(0,s.events.length-3000);
  }
  function makeSession(s,day,kind='daily') {
    rollDay(s,day);
    if(s.session&&s.session.index<s.session.queue.length)return s.session;
    const uid=`s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;let queue=[],n=0;
    const add=(id,type,phase)=>queue.push({key:uid+'-'+n++,wordId:id,type,phase,retry:0,assisted:false,revealed:type==='learn',feedback:null});
    if(kind==='daily') {
      const p=dailyPlan(s,day);
      p.due.forEach(id=>add(id,'recall','review'));
      p.fresh.forEach(id=>add(id,'learn','learn'));
      const ids=[...p.due,...p.fresh];
      ids.forEach((id,i)=>add(id,s.settings.listening&&i%3===2?'listen':'spell','practice'));
      ids.slice(0,5).forEach(id=>add(id,s.words.find(w=>w.id===id).cloze?'context':'spell','quiz'));
    } else if(kind==='mistakes') {
      s.words.filter(w=>s.progress[w.id]?.unresolved).slice(0,12).forEach(w=>add(w.id,'spell','practice'));
    } else if(['spell','listen','context'].includes(kind)) {
      let selected=s.words.filter(w=>w.unit===s.settings.unit);
      if(kind==='context')selected=selected.filter(w=>w.cloze);
      selected.slice(0,12).forEach(w=>add(w.id,kind,'practice'));
    } else fail('练习类型不正确');
    if(!queue.length){s.session=null;return null;}
    s.session={id:uid,date:day,kind,queue,index:0,completed:false};return s.session;
  }
  function submit(s,value,opts={}) {
    const session=s.session,t=session?.queue[session.index];
    if(!t||t.feedback||t.type==='learn')return false;
    const w=s.words.find(w=>w.id===t.wordId),correct=t.type==='recall'?Boolean(opts.recalled):grade(w,t.type,value);
    if(t.type!=='recall'&&!String(value??'').trim()&&!opts.giveUp)return false;
    t.feedback={correct,independent:correct&&!t.assisted,input:String(value??'').slice(0,160)};
    record(s,t.wordId,t.type,correct,session.date,{assisted:t.assisted,retry:t.retry});
    if((!correct||t.assisted)&&t.type!=='recall'&&t.retry<2){
      const retry={key:t.key+'-r',wordId:t.wordId,type:t.type==='listen'?'spell':t.type,phase:'retry',retry:t.retry+1,assisted:false,revealed:false,feedback:null};
      const pos=Math.min(session.index+4,session.queue.length);session.queue.splice(pos,0,retry);
    }
    return true;
  }
  function next(s) {
    const session=s.session,t=session?.queue[session.index];if(!t)return false;
    if(t.type==='learn')introduce(s,t.wordId,session.date);
    else if(!t.feedback)return false;
    session.index++;
    if(session.index===session.queue.length&&!session.completed){session.completed=true;dayRecord(s,session.date).completed++;}
    return true;
  }
  function rollDay(s,day) {if(s.session&&s.session.date!==day)s.session=null;}
  function convertListening(s) {const t=s.session?.queue[s.session.index];if(t&&t.type==='listen'&&!t.feedback){t.type='spell';return true;}return false;}
  function parseCSV(input) {
    if(typeof input!=='string'||input.length>2000000)fail('CSV 文件过大');
    input=input.replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,closed=false;
    for(let i=0;i<input.length;i++){
      const c=input[i];
      if(quoted){if(c==='"'){if(input[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
      if(c==='"'){if(field.length||closed)fail('CSV 引号格式不正确');quoted=true;continue;}
      if(c===','||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(c!==','){if(row.some(x=>x.trim()))rows.push(row);row=[];if(c==='\r'&&input[i+1]==='\n')i++;}continue;}
      if(closed&&c.trim())fail('CSV 引号后有多余字符');
      if(!closed)field+=c;
    }
    if(quoted)fail('CSV 引号未闭合');
    row.push(field);if(row.some(x=>x.trim()))rows.push(row);
    if(rows.length<2)fail('CSV 需要表头和至少一条词条');
    const header=rows.shift().map(h=>h.trim());
    if(new Set(header).size!==header.length)fail('CSV 表头重复');
    if(!header.includes('word')||!header.includes('meaning'))fail('CSV 表头必须含 word 和 meaning');
    const allowed=new Set(['id','unit','word','pos','meaning','example','exampleZh','tip','cloze','answer']);
    if(header.some(h=>!allowed.has(h)))fail('CSV 含不支持的表头，请使用模板');
    return rows.map((r,i)=>{if(r.length!==header.length)fail(`CSV 第 ${i+2} 行列数不正确`);const obj={};header.forEach((h,j)=>obj[h]=r[j]);return obj;});
  }
  function mergeWords(s,input) {if(s.session&&!s.session.completed)fail('请先完成或结束当前练习，再导入词库');const added=validateWords(input),all=validateWords([...s.words,...added]);s.words=all;return added.length;}
  function integer(n,min,max) {return Number.isInteger(n)&&n>=min&&n<=max;}
  function validateState(input) {
    assertSafe(input);
    if(!input||input.version!==1)fail('不支持的备份版本');
    const s=JSON.parse(JSON.stringify(input));
    const validated=validateWords(s.words);s.words=validated;const ids=new Set(s.words.map(w=>w.id));
    const st=s.settings;
    if(!st||!s.words.some(w=>w.unit===st.unit)||!integer(st.newPerDay,1,20)||!integer(st.reviewLimit,1,30)||!['en-GB','en-US'].includes(st.accent)||typeof st.voiceURI!=='string'||st.voiceURI.length>500||typeof st.listening!=='boolean')fail('备份的设置无效');
    if(!s.progress||Array.isArray(s.progress)||typeof s.progress!=='object'||!s.days||Array.isArray(s.days)||typeof s.days!=='object')fail('备份的记录无效');
    for(const [id,p] of Object.entries(s.progress)) {
      if(!ids.has(id)||!p||!isDay(p.introduced)||!isDay(p.due)||!isDay(p.lastScheduled)||!(p.lastTested===null||isDay(p.lastTested))||!(p.lastWrong===null||isDay(p.lastWrong))||!integer(p.stage,0,4)||typeof p.unresolved!=='boolean'||!integer(p.attempts,0,10000000)||!p.errors)fail('备份中的单词进度无效');
      for(const k of ['meaning','spelling','listening','form'])if(!integer(p.errors[k],0,10000000))fail('错词计数无效');
    }
    if(Object.keys(s.days).length>37000)fail('记录过多');
    for(const [day,d] of Object.entries(s.days)) {
      if(!isDay(day)||!d)fail('学习日期无效');
      for(const k of ['newIds','reviewedIds'])if(!Array.isArray(d[k])||d[k].length>2000||d[k].some(id=>!ids.has(id))||new Set(d[k]).size!==d[k].length)fail('每日词条记录无效');
      for(const k of ['spellingTotal','spellingCorrect','contextTotal','contextCorrect','completed'])if(!integer(d[k],0,10000000))fail('每日统计无效');
      if(d.spellingCorrect>d.spellingTotal||d.contextCorrect>d.contextTotal)fail('每日统计不一致');
    }
    if(!Array.isArray(s.events)||s.events.length>3000)fail('练习历史无效');
    for(const e of s.events)if(!e||!ids.has(e.wordId)||!isDay(e.date)||!TYPES.includes(e.type)||typeof e.correct!=='boolean'||typeof e.assisted!=='boolean'||!integer(e.retry,0,2)||typeof e.sessionId!=='string')fail('练习历史包含无效数据');
    if(s.session!==null) {
      const a=s.session;
      if(!a||typeof a.id!=='string'||a.id.length>120||!isDay(a.date)||!['daily','mistakes','spell','listen','context'].includes(a.kind)||!Array.isArray(a.queue)||!a.queue.length||a.queue.length>1000||!integer(a.index,0,a.queue.length)||typeof a.completed!=='boolean'||a.completed!==(a.index===a.queue.length))fail('备份中的练习进度无效');
      const keys=new Set();
      for(const t of a.queue){
        if(!t||!ids.has(t.wordId)||!TYPES.includes(t.type)||!['learn','review','practice','quiz','retry'].includes(t.phase)||typeof t.key!=='string'||keys.has(t.key)||!integer(t.retry,0,2)||typeof t.assisted!=='boolean'||typeof t.revealed!=='boolean')fail('备份中的练习题无效');
        keys.add(t.key);
        if(t.draft!==undefined&&(typeof t.draft!=='string'||t.draft.length>160))fail('备份中的输入草稿无效');
        if(t.type==='context'&&!s.words.find(w=>w.id===t.wordId).cloze)fail('句中练习缺失答案');
        if(t.feedback!==null&&(!t.feedback||typeof t.feedback.correct!=='boolean'||typeof t.feedback.independent!=='boolean'||typeof t.feedback.input!=='string'||t.feedback.input.length>160))fail('备份中的答题状态无效');
      }
    }
    if(!(s.updatedAt===null||typeof s.updatedAt==='string'))fail('备份时间无效');
    return s;
  }
  return {INTERVALS,norm,dayKey,isDay,addDays,validateWords,createState,introduce,dailyPlan,grade,record,makeSession,submit,next,rollDay,convertListening,parseCSV,mergeWords,validateState};
});
