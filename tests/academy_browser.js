async (page) => {
  const base='http://127.0.0.1:8016/academy.html';
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const go=async hash=>{await page.goto(base+hash);await page.locator('#main').waitFor();};
  await page.setViewportSize({width:1440,height:1080});
  await go('');await page.reload();await page.locator('.module-card').first().waitFor();
  check(await page.locator('.module-card').count()===12,'12 module cards');
  await page.locator('[data-level="advanced"]').click();check(await page.locator('.module-card').count()===7,'advanced filter');
  await page.locator('[data-level="all"]').click();
  await page.screenshot({path:'output/playwright/academy-home.png'});
  // Each authored lesson and each step must render actual geometry and a complete exercise.
  for(let n=1;n<=60;n++){
    const id='lesson-'+String(n).padStart(2,'0');await go('#'+id);await page.locator('#lessonChart svg').waitFor();
    check(await page.locator('.concept-plate svg').count()===1,'concept plate '+id);
    check(await page.locator('#lessonAnswers button').count()===3,'quiz options '+id);
    for(let s=0;s<4;s++){await page.locator('[data-step="'+s+'"]').click();check(await page.locator('#lessonChart svg rect').count()>5,'real schematic candles '+id);}
    check(await page.locator('svg [d*="NaN"], svg [x*="NaN"], svg [y*="NaN"]').count()===0,'finite geometry '+id);
  }
  await go('#lesson-27');await page.locator('#lessonChart svg').waitFor();
  await page.locator('#legHeight').fill('87');check(await page.locator('#legValue').innerText()==='87','second leg slider');
  await page.locator('[data-step="3"]').click();await page.locator('#variant').selectOption('fail');
  await page.locator('summary').first().click();await page.locator('#compareA svg').waitFor();await page.locator('#compareB svg').waitFor();
  await page.locator('#lessonNote').fill('測試筆記：第二支腳仍需頸線確認。');await page.locator('#saveLessonNote').click();
  await page.locator('#lessonAnswers button').first().click();await page.locator('#lessonFeedback').waitFor();
  await page.screenshot({path:'output/playwright/academy-lesson.png',fullPage:true});
  await go('#cases');await page.locator('#caseList .case-card').first().waitFor();check((await page.locator('#caseCount').innerText()).includes('156'),'156 cases');
  await page.locator('#caseFamily').selectOption('cup');check((await page.locator('#caseCount').innerText()).includes('6'),'cup examples');
  await page.locator('#caseSearch').fill('does-not-exist');check(await page.locator('#caseList .case-card').count()===0,'empty search');
  const catalog=await page.evaluate(async()=>await (await fetch('academy-data/catalog.json')).json());
  // Every selected historical window is actually openable in the browser.
  for(const c of catalog.cases){await go('#'+c.id);await page.locator('#historyChart svg').waitFor();check((await page.locator('#replayDate').innerText()).includes(c.date),'date '+c.id);check(await page.locator('#historyChart [d*="NaN"],#historyChart [y*="NaN"]').count()===0,'finite history '+c.id);}
  const c=catalog.cases.find(x=>x.family==='bottom');await go('#'+c.id+'?mode=blind');await page.locator('#historyChart svg').waitFor();
  check(await page.locator('#caseExplanation').isHidden(),'blind explanation hidden');check(await page.locator('#historyAnnotations').isDisabled(),'blind annotations disabled');
  const initial=await page.locator('#historyChart svg').getAttribute('aria-label');
  check(!initial.includes(c.to),'future end date hidden');
  await page.locator('#timeframe').selectOption('weekly');check((await page.locator('#historyChart svg').getAttribute('aria-label')).endsWith(c.date),'weekly stops at observation day');
  await page.locator('#timeframe').selectOption('daily');
  await page.locator('#replayNext').click();check((await page.locator('#replayDate').innerText()).includes('1 / 20'),'one step');
  await page.locator('#replayBack').click();check(await page.locator('#historyChart svg').getAttribute('aria-label')===initial,'reversible prefix');
  await page.locator('#historyRsi').click();await page.locator('[data-overlay="ma20"]').click();await page.locator('#historyLog').click();
  await page.locator('#drawMode').selectOption('support');const box=await page.locator('#historyChart svg').boundingBox();
  await page.mouse.click(box.x+box.width*.2,box.y+box.height*.45);await page.mouse.click(box.x+box.width*.7,box.y+box.height*.45);
  check((await page.evaluate(id=>JSON.parse(localStorage.getItem('chart-academy-v1')).drawings[id].length,c.id))===1,'drawing saved');
  await page.locator('#caseNote').fill('觀察低點與頸線；若收盤跌破前低，撤回止跌假設；未突破則等待。');await page.locator('#saveSnapshot').click();
  await page.locator('#caseAnswers button').nth(1).click();await page.locator('#caseFeedback').waitFor();
  await page.locator('#revealCase').click();await page.locator('#caseResult').waitFor();await page.locator('#oppositeChart svg').waitFor();
  check((await page.locator('#replayDate').innerText()).includes('20 / 20'),'reveal full outcome');
  check(await page.locator('#caseExplanation').isVisible(),'revealed explanation');
  await page.screenshot({path:'output/playwright/academy-history.png',fullPage:true});
  await page.locator('#riskStop').fill('90');check((await page.locator('#riskOutput').innerText()).includes('95'),'risk recompute 95 shares');
  await page.locator('#riskStop').fill('105');check((await page.locator('#riskOutput').innerText()).includes('有效數值'),'invalid risk input');
  for(let n=1;n<=12;n++){await go('#exam-'+n);await page.locator('#historyChart svg').waitFor();check(await page.locator('#caseExplanation').isHidden(),'exam '+n+' blind');}
  await page.locator('#caseNote').fill('先看波段結構；等待收盤確認，跌破已知前低撤回。');await page.locator('.self-check').first().check();await page.locator('#finishExam').click();
  await go('#progress');await page.locator('#exportProgress').waitFor();check((await page.locator('#main').innerText()).includes('第 12 場'),'exam persisted');
  const download=page.waitForEvent('download');await page.locator('#exportProgress').click();await (await download).saveAs('output/playwright/academy-progress.json');
  await go('#lesson-27');await page.locator('#lessonNote').waitFor();check((await page.locator('#lessonNote').inputValue()).includes('第二支腳'),'lesson note persisted');
  // Desktop, tablet and small phone; actual chart interactions remain reachable.
  for(const width of [768,390,360]){
    await page.setViewportSize({width,height:900});
    for(const hash of ['','#lesson-27','#'+c.id+'?mode=blind','#cases','#progress','#method']){
      await go(hash);await page.waitForFunction(()=>!document.querySelector('#main .loading'));
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow '+width+' '+hash);
    }
    await go('#lesson-27');await page.locator('#lessonChart svg').waitFor();await page.locator('[data-step="3"]').click();
    await page.screenshot({path:'output/playwright/academy-mobile-'+width+'.png',fullPage:true});
  }
  // Network failure must be visible, and recovery must work.
  await page.route('**/academy-data/catalog.json*',route=>route.fulfill({status:503,body:'unavailable'}));await go('#cases');await page.reload();await page.locator('#retryAcademy').waitFor();await page.unroute('**/academy-data/catalog.json*');await page.locator('#retryAcademy').click();await page.locator('#caseList .case-card').first().waitFor();
  check(errors.length===0,'browser errors: '+errors.join('; '));
  return {passed:true,lessons:60,diagramSteps:240,historicalCases:156,exams:12,widths:[1440,768,390,360],pageErrors:errors.length};
}
