"""Real Chromium interaction tests. Speech is separately stubbed only to exercise control/error paths."""
import json, os, shutil, unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
(ROOT/'qa').mkdir(exist_ok=True)
KEY='wordsprout.state.v1'
class UITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw=sync_playwright().start()
        executable=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome')
        options={'headless':True}
        if executable:options['executable_path']=executable
        cls.browser=cls.pw.chromium.launch(**options)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop()
    def setUp(self):
        self.ctx=self.browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True)
        self.ctx.add_init_script("""window.__memStore={};window.Storage=class {getItem(k){return Object.hasOwn(window.__memStore,k)?window.__memStore[k]:null}setItem(k,v){window.__memStore[k]=String(v)}removeItem(k){delete window.__memStore[k]}};Object.defineProperty(window,'localStorage',{value:new Storage(),configurable:true});""")
        self.page=self.ctx.new_page();self.page.set_default_timeout(1800);self.errors=[]
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
    def tearDown(self):
        self.ctx.close()
        self.assertEqual(self.errors,[], 'Uncaught JS errors')
    def start(self, seed=None):
        self.page.close();self.page=self.ctx.new_page();self.page.set_default_timeout(1800)
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        if seed is not None:self.page.evaluate('(seed)=>window.__memStore=seed',seed)
        self.page.set_content(ROOT.joinpath('index.html').read_text())
    def reopen(self):self.start(self.page.evaluate('window.__memStore'))
    def nav(self,text): self.page.get_by_role('button',name=text,exact=True).first.click()
    def current(self):return self.page.evaluate("()=>{const s=JSON.parse(localStorage.getItem('wordsprout.state.v1'));if(!s?.session)return null;return {task:s.session.queue[s.session.index],word:s.words.find(w=>w.id===s.session.queue[s.session.index]?.wordId),index:s.session.index,len:s.session.queue.length}}")
    def test_home_mobile_and_library(self):
        self.start();self.page.get_by_role('button',name='开始今日练习',exact=True).wait_for()
        self.assertIn('示例',self.page.inner_text('body'))
        self.assertLessEqual(self.page.locator('.bar.empty').first.bounding_box()['height'],5)
        self.page.screenshot(path=str(ROOT/'qa/desktop-home.png'),full_page=True)
        self.nav('单元词库');self.page.get_by_placeholder('搜索单词或中文意思').fill('advice')
        self.assertEqual(self.page.locator('.word-item').count(),1)
        self.page.get_by_role('button',name='查看 advice').click()
        self.assertIn('不可数',self.page.locator('dialog').inner_text())
        self.page.get_by_role('button',name='关闭弹窗').click()
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        self.nav('今日练习');self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'));self.page.screenshot(path=str(ROOT/'qa/mobile-home.png'),full_page=True)
    def test_full_session_resume_and_duplicate_submit(self):
        self.start();self.nav('开始今日练习');self.nav('学过了，继续')
        before=self.current()['index'];self.reopen();self.nav('继续上次练习');self.assertEqual(self.current()['index'],before)
        loops=0
        while loops<120:
            c=self.current()
            if not c or c['index']>=c['len']:break
            t,w=c['task'],c['word'];loops+=1
            if t['type']=='learn':self.nav('学过了，继续')
            elif t['type']=='recall':self.nav('想一想，再看意思');self.nav('想起来了')
            else:
                if t['type']=='listen':self.nav('听不到？改为看中文拼写')
                answer=w['answer'] if t['type']=='context' else w['word']
                self.page.get_by_label('输入英文答案').fill(answer)
                self.nav('检查答案')
                self.page.get_by_role('button',name='下一题',exact=True).click() if self.page.get_by_role('button',name='下一题',exact=True).count() else self.nav('查看本次结果')
        self.assertLess(loops,120)
        self.assertIn('这一小步',self.page.inner_text('body'))
        s=self.page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
        self.assertEqual(len(next(iter(s['days'].values()))['newIds']),6)
        self.assertTrue(s['session']['completed'])
        self.page.screenshot(path=str(ROOT/'qa/completed.png'),full_page=True)
    def test_wrong_word_saved_and_html_input_is_safe(self):
        self.start();self.nav('拼写专项')
        self.page.get_by_label('输入英文答案').fill('<img src=x onerror=alert(1)>')
        self.nav('检查答案')
        self.assertEqual(self.page.locator('img[src="x"]').count(),0)
        self.assertIn('正确答案',self.page.inner_text('body'))
        self.nav('暂停，稍后继续');self.nav('错词本')
        self.assertIn('mistake',self.page.inner_text('body'))
    def test_no_speech_graceful_fallback(self):
        self.ctx.add_init_script("Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});")
        self.start();self.nav('听写专项');self.nav('播放本题单词')
        self.assertIn('不支持发音',self.page.inner_text('body'))
        self.nav('听不到？改为看中文拼写')
        self.assertIn('错误',self.page.inner_text('body'))
        s=self.page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
        self.assertEqual(s['events'],[])
    def test_denied_storage_warns_and_keeps_in_memory(self):
        self.ctx.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('denied','QuotaExceededError')}")
        self.start();self.nav('开始今日练习');self.nav('学过了，继续')
        self.assertIn('未能保存',self.page.inner_text('body'))
        self.assertIsNotNone(self.page.get_by_role('button',name='导出当前备份',exact=True).first)
    def test_corrupt_storage_not_overwritten(self):
        self.start();self.page.evaluate(f"localStorage.setItem('{KEY}','broken-json')");self.reopen()
        self.assertIn('损坏',self.page.inner_text('body'))
        self.assertEqual(self.page.evaluate(f"localStorage.getItem('{KEY}')"),'broken-json')
    def test_invalid_import_preserves_state(self):
        self.start();self.nav('设置与备份');old=self.page.evaluate(f"localStorage.getItem('{KEY}')")
        self.page.locator('#restore-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"version":99}'})
        self.assertIn('恢复失败',self.page.inner_text('body'))
        self.assertEqual(self.page.evaluate(f"localStorage.getItem('{KEY}')"),old)
    def test_word_import_text_and_backup_restore(self):
        self.start();self.nav('设置与备份')
        payload=json.dumps([{'unit':'新单元','word':'tree','meaning':'树 <img src=x onerror=alert(1)>','example':'A tree.'}],ensure_ascii=False).encode()
        self.page.locator('#deck-file').set_input_files({'name':'words.json','mimeType':'application/json','buffer':payload})
        self.nav('确认导入');self.nav('单元词库')
        self.page.get_by_placeholder('搜索单词或中文意思').fill('tree')
        self.assertEqual(self.page.locator('.word-item').count(),1)
        self.assertEqual(self.page.locator('img[src="x"]').count(),0)
        self.nav('设置与备份')
        with self.page.expect_download() as download:self.nav('导出当前备份')
        backup=Path(download.value.path()).read_text();data=json.loads(backup)
        self.assertEqual(len(data['state']['words']),21)
        self.page.locator('#restore-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup.encode()})
        self.nav('确认恢复');self.assertIn('恢复成功',self.page.inner_text('body'))
    def test_cross_tab_conflict_blocks_write(self):
        self.start();self.page.evaluate("window.dispatchEvent(new StorageEvent('storage',{key:'wordsprout.state.v1',newValue:'another-tab-version'}))")
        self.assertIn('另一个窗口',self.page.inner_text('body'))
    def test_self_contained_document_can_start_without_network(self):
        self.start()
        self.nav('开始今日练习');self.nav('学过了，继续')
        self.assertIsNotNone(self.current())
    def test_speech_control_calls_english_voice_and_slow_rate(self):
        self.ctx.add_init_script("""window.__spoken=[];window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
        Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{name:'Test English',voiceURI:'test-en',lang:'en-GB',localService:true}],cancel(){},resume(){},addEventListener(){},speak(u){window.__spoken.push({text:u.text,rate:u.rate,lang:u.lang});u.onstart?.();setTimeout(()=>u.onend?.(),20)}}});""")
        self.start();self.nav('开始今日练习');self.nav('听发音');self.nav('慢速播放')
        spoken=self.page.evaluate('window.__spoken');self.assertEqual(spoken[0]['text'],'mistake')
        self.assertEqual(spoken[0]['lang'],'en-GB');self.assertLess(spoken[1]['rate'],spoken[0]['rate'])
    def test_automatic_speech_prefers_local_voice(self):
        self.ctx.add_init_script("""window.__chosen='';window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{name:'Remote GB',voiceURI:'remote',lang:'en-GB',localService:false},{name:'Local US',voiceURI:'local',lang:'en-US',localService:true}],cancel(){},resume(){},addEventListener(){},speak(u){window.__chosen=u.voice.voiceURI;u.onstart?.();u.onend?.()}}});""")
        self.start();self.nav('开始今日练习');self.nav('听发音')
        self.assertEqual(self.page.evaluate('window.__chosen'),'local')
    def test_draft_restores_and_all_views_fit_small_screen(self):
        self.start();self.nav('拼写专项');self.page.get_by_label('输入英文答案').fill('mis')
        self.reopen();self.nav('继续上次练习');self.assertEqual(self.page.get_by_label('输入英文答案').input_value(),'mis')
        self.page.set_viewport_size({'width':360,'height':800});self.page.screenshot(path=str(ROOT/'qa/mobile-study.png'),full_page=True)
        for width in [320,390,768]:
            self.page.set_viewport_size({'width':width,'height':844})
            for view in ['今日练习','单元词库','错词本','学习记录','设置与备份']:
                self.nav(view);self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'{view} at {width}')
if __name__=='__main__': unittest.main(verbosity=2)
