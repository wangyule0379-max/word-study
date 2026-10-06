/* Illustrative, teacher-verifiable practice selection; not an official complete textbook wordlist.
   All example sentences and cloze exercises below are written for this learning tool. */
(function(root){
  const rows = [
    ['u1-mistake','Unit 1 · 新起点','mistake','n.','错误','We all make mistakes sometimes.','我们有时都会犯错。','复数 mistakes；make a mistake = 犯一个错误。','We all make ____ sometimes. (mistake)','mistakes'],
    ['u1-important','Unit 1 · 新起点','important','adj.','重要的','It is important to listen carefully.','认真听讲很重要。','注意拼写 important，结尾是 -ant。','It is ____ to listen carefully. (important)','important'],
    ['u1-remember','Unit 1 · 新起点','remember','v.','记住；记得','I remember my new classmates.','我记得我的新同学。','第三人称单数 remembers。','She ____ these new words well. (remember)','remembers'],
    ['u1-problem','Unit 1 · 新起点','problem','n.','问题；难题','We can solve this problem together.','我们可以一起解决这个问题。','复数 problems；solve a problem = 解决问题。','We can solve these ____. (problem)','problems'],
    ['u1-advice','Unit 1 · 新起点','advice','n.','建议','My teacher gives me some advice.','我的老师给了我一些建议。','advice 通常是不可数名词；some advice，不写 advices。','My teacher gives me some ____. (advice)','advice'],
    ['u1-task','Unit 1 · 新起点','task','n.','任务','I finish my task before dinner.','我在晚饭前完成我的任务。','复数 tasks；注意末尾的 -sk。','We have two ____ today. (task)','tasks'],
    ['u1-polite','Unit 1 · 新起点','polite','adj.','有礼貌的','Please be polite to others.','请对别人有礼貌。','be polite to someone = 对某人有礼貌。','Please be ____ to others. (polite)','polite'],
    ['u1-protect','Unit 1 · 新起点','protect','v.','保护','Trees help protect the soil.','树木有助于保护土壤。','注意结尾 -tect；can 后用动词原形。','Trees can ____ the soil. (protect)','protect'],
    ['u1-together','Unit 1 · 新起点','together','adv.','一起；共同','We often study together.','我们经常一起学习。','注意中间的 -geth-。','We often study ____. (together)','together'],
    ['u1-hope','Unit 1 · 新起点','hope','v.; n.','希望','I hope to make new friends.','我希望交到新朋友。','hope to do something = 希望做某事。','She ____ to join the club. (hope)','hopes'],
    ['st-ready','Starter · 入学准备','ready','adj.','准备好的','I am ready for school.','我已经做好上学的准备。','be ready for = 为……做好准备。','She is ____ for school. (ready)','ready'],
    ['st-introduce','Starter · 入学准备','introduce','v.','介绍','Let me introduce my friend.','让我介绍一下我的朋友。','introduce 的结尾是 -duce。','He ____ his friend to us. (introduce)','introduces'],
    ['st-classmate','Starter · 入学准备','classmate','n.','同班同学','My classmates are friendly.','我的同班同学很友好。','class + mate；复数 classmates。','I help my ____. (classmate，复数)','classmates'],
    ['st-hobby','Starter · 入学准备','hobby','n.','业余爱好','My hobby is reading.','我的爱好是阅读。','hobby 中间有两个 b；复数 hobbies，变 y 为 i 再加 es。','I have two ____. (hobby)','hobbies'],
    ['st-activity','Starter · 入学准备','activity','n.','活动','This activity is fun.','这个活动很有趣。','复数 activities，变 y 为 i 再加 es。','We enjoy these ____. (activity)','activities'],
    ['st-join','Starter · 入学准备','join','v.','加入；参加','I want to join the music club.','我想加入音乐社团。','join the club = 加入社团。','She ____ us every Friday. (join)','joins'],
    ['st-enjoy','Starter · 入学准备','enjoy','v.','喜欢；享受','I enjoy reading books.','我喜欢读书。','enjoy doing something；第三人称单数 enjoys。','He ____ reading books. (enjoy)','enjoys'],
    ['st-nervous','Starter · 入学准备','nervous','adj.','紧张的','I feel nervous before the test.','考试前我感到紧张。','注意 nervous 结尾是 -ous。','I feel ____ before the test. (nervous)','nervous'],
    ['st-holiday','Starter · 入学准备','holiday','n.','假期；节日','We read a lot during the holidays.','我们在假期里读很多书。','复数直接加 s：holidays，不写 holidaies。','We read a lot during the ____. (holiday，复数)','holidays'],
    ['st-uniform','Starter · 入学准备','uniform','n.','制服；校服','I wear my school uniform.','我穿着校服。','a school uniform；uniform 开头读辅音 /j/，单独用时也是 a uniform。','These school ____ are blue. (uniform)','uniforms']
  ];
  const fields=['id','unit','word','pos','meaning','example','exampleZh','tip','cloze','answer'];
  const deck=rows.map(row=>Object.fromEntries(fields.map((f,i)=>[f,row[i]])));
  if(typeof module==='object'&&module.exports) module.exports=deck;else root.WSSeed=deck;
})(typeof globalThis!=='undefined'?globalThis:this);
