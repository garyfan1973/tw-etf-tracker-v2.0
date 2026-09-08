(function(root){
  'use strict';
  const {fmt,indicators}=root.AcademyChart;
  function explain(c,rows){
    const r=rows[c.at],a=c.anchors,points=a.map(p=>p.price),days=a.length?a.at(-1).i-a[0].i:0;
    const note=[],pct=(x,y)=>fmt((x/y-1)*100)+'%',type=c.family;
    if(['bottom','top'].includes(type)){
      note.push(`① ${rows[a[0].i].date} ${type==='bottom'?'第一低點':'第一高點'} ${fmt(points[0])} → ② ${rows[a[1].i].date} 中間反應 ${fmt(points[1])} → ③ ${rows[a[2].i].date} 第二次測試 ${fmt(points[2])}。`);
      note.push(`兩次測試相隔 ${days} 個交易日；第二點相對第一點 ${pct(points[2],points[0])}。請比較回撤與反彈的成交量，不以等高或等低作唯一判準。`);
      const complete=type==='bottom'?r.close>c.level:r.close<c.level;
      note.push(`觀察日收 ${fmt(r.close)}，${complete?'已在':'仍未跨過'}中間價位 ${fmt(c.level)}${complete?(type==='bottom'?'上方':'下方'):''}。${complete?'這增加突破證據，但後續延續未知。':'此時應保留候選說法，不能先宣稱反轉完成。'}`);
    }else if(['hsb','hst'].includes(type)){
      note.push(`左肩 ${fmt(points[0])}、頭部 ${fmt(points[2])}、右肩 ${fmt(points[4])}；兩肩相差 ${pct(points[4],points[0])}。五個轉折共跨 ${days} 個交易日。`);
      note.push(`頸線兩個錨點：${rows[a[1].i].date} ${fmt(points[1])}，以及 ${rows[a[3].i].date} ${fmt(points[3])}。由兩點延伸，觀察日線值為 ${fmt(c.level)}，不能用任意水平線代替。`);
      note.push(`目前收盤 ${fmt(r.close)} ${r.close>c.level?'高於':'低於或等於'}頸線。先確認穿越方向是否符合此型態，再看前趨勢、成交量與後續回測。`);
    }else if(['triangle','wedge'].includes(type)){
      const highs=a.filter(p=>p.kind==='H').slice(-2),lows=a.filter(p=>p.kind==='L').slice(-2);
      note.push(`高點 ${fmt(highs[0].price)} → ${fmt(highs[1].price)}；低點 ${fmt(lows[0].price)} → ${fmt(lows[1].price)}。使用同一個左右 3 根的局部轉折尺度。`);
      note.push(`前後波段的高低差 ${fmt(highs[0].price-lows[0].price)} → ${fmt(highs[1].price-lows[1].price)}。請打開標記，分別沿兩個高點與兩個低點延伸邊界。`);
      note.push('這是收斂的價格證據，並未預告方向。先寫上破、下破與仍在區內三種條件，回放時只使用當日已知的邊界。');
    }else if(type==='cup'){
      const rim=(points[0]+points[2])/2,depth=rim-points[1],low=Math.min(...rows.slice(a[2].i+1,c.at+1).map(x=>x.low));
      note.push(`左杯緣 ${rows[a[0].i].date} ${fmt(points[0])}；杯底 ${rows[a[1].i].date} ${fmt(points[1])}；右杯緣 ${rows[a[2].i].date} ${fmt(points[2])}。`);
      note.push(`相對平均杯緣 ${fmt(rim)}，杯深約 ${fmt(depth/rim*100)}%；右杯緣之後的柄部低點 ${fmt(low)}，回撤約杯深的 ${fmt((rim-low)/depth*100)}%。`);
      note.push(`觀察日收 ${fmt(r.close)}。杯緣平均值只是參考區中心，也要檢查兩側各自高點；外形近似並不保證已完成突破。`);
    }else if(type==='flag'){
      const pole=points[1]-points[0],low=Math.min(...rows.slice(a[1].i+1,c.at+1).map(x=>x.low));
      note.push(`旗桿參考段 ${rows[a[0].i].date} 收 ${fmt(points[0])} → ${rows[a[1].i].date} 收 ${fmt(points[1])}，推進 ${pct(points[1],points[0])}。`);
      note.push(`其後整理最低 ${fmt(low)}，相對旗桿回撤 ${fmt((points[1]-low)/pole*100)}%；整理高點 ${fmt(c.level)}。先判讀原推進是否仍保留，再檢查邊界脫離。`);
      note.push('請以斜線或價格帶圈出實際整理，判斷它較接近平行旗形、三角旗或一般整理。形狀名稱不能取代量價與失效規則。');
    }else if(['roundbottom','roundtop'].includes(type)){
      const q=rows.slice(c.at-89,c.at+1),av=[0,30,60].map(n=>q.slice(n,n+30).reduce((s,x)=>s+x.close,0)/30);
      note.push(`90 日分成三段，每段 30 個交易日，平均收盤依序 ${av.map(fmt).join(' → ')}。這呈現${type==='roundbottom'?'中段較低':'中段較高'}的長區間特徵。`);
      note.push('切換週線檢查過程是平滑減速，還是幾次急跌急彈。數值形狀相似不等於每段都同樣典型，缺口與事件應另外註記。');
      note.push(`前段邊緣參考 ${fmt(c.level)}；目前收 ${fmt(r.close)}。畫出回收或失守的條件，再回放檢驗。`);
    }else if(type==='divergence'){
      const rs=indicators(rows.slice(0,c.at+1)).rsi;
      note.push(`對齊兩個價格高點 ${rows[a[0].i].date} 與 ${rows[a[2].i].date}：價格 ${fmt(points[0])} → ${fmt(points[2])}，RSI14 ${fmt(rs[a[0].i])} → ${fmt(rs[a[2].i])}。`);
      note.push(`中間回落參考 ${fmt(c.level)}；觀察日收 ${fmt(r.close)}。背離提示動能改變，但價格是否破壞結構是另一個問題。`);
      note.push('打開 RSI 後再比對峰谷日期，不拿不同波段的峰值湊成背離；強趨勢中背離可能連續出現。');
    }else if(type==='volume'){
      const average=rows.slice(c.at-20,c.at).reduce((s,x)=>s+x.volume,0)/20,previous=rows[c.at-1];
      note.push(`當日量 ${fmt(r.volume)}，前 20 日均量 ${fmt(average)}，量比 ${fmt(c.volumeRatio)}。當日收盤相對前收變動 ${pct(r.close,previous.close)}。`);
      note.push(`當日高低區間 ${fmt(r.low)}～${fmt(r.high)}，收盤位於全幅的 ${fmt((r.close-r.low)/(r.high-r.low||1)*100)}% 處。量大之後價格停在哪裡，比量柱顏色更值得觀察。`);
      note.push('以事件日高低範圍追蹤後續；沒有買方身分資料，不能把量比直接說成主力買進。');
    }else if(type==='range'){
      const recent=rows.slice(c.at-9,c.at+1),hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low));
      note.push(`近 10 日區間 ${fmt(lo)}～${fmt(hi)}，以目前收盤計高低幅約 ${fmt((hi-lo)/r.close*100)}%；此前 40 日區間 ${fmt(c.priorLow)}～${fmt(c.priorHigh)}。`);
      note.push('先分別畫出整理上下邊界，再看高低點是否傾斜。此處確認的是區間收窄，三角形、旗形等名稱需要額外結構。');
      note.push('突破前不指定單一方向；假設在區外無法保持，要保留回到整理的解釋。');
    }else if(type==='failed'){
      note.push(`${rows[a[0].i].date} 收 ${fmt(points[0])}，曾突破當時前 40 日高點；${c.at-a[0].i} 個交易日後，${c.date} 收 ${fmt(r.close)}，回到固定突破參考 ${fmt(c.level)} 下方。`);
      note.push('這個案例從「收回發生的當天」開始判讀；之前的突破日尚不知道會失敗。把收回日與後續是否再跌分開。');
      note.push('原區間再次被接受，會削弱向上突破假設。若後續快速收復，仍需照新證據更新，不能把失敗標籤當成永久空頭。');
    }else if(type==='breakout'){
      note.push(`觀察日之前 40 日最高價 ${fmt(c.priorHigh)}；${c.date} 收 ${fmt(r.close)}，超出約 ${pct(r.close,c.priorHigh)}。當日高點不包含在壓力的計算裡。`);
      note.push(`量比 ${fmt(c.volumeRatio)}，是參與程度的輔助證據。此時符合本教材的收盤突破門檻，並沒有保證回測一定守住。`);
      note.push(`把 ${fmt(c.level)} 畫成參考區，另註明容忍範圍與收回規則。是否等回測、是否成交，都要依實際後續價格。`);
    }else if(type==='support'){
      note.push(`前 40 日最低 ${fmt(c.priorLow)}；觀察日最低 ${fmt(r.low)}，收盤 ${fmt(r.close)}。低點相對前低 ${pct(r.low,c.priorLow)}，收盤回到前低之上。`);
      note.push('這是一個前低再測試，不保證已經完成底部。需查看反彈高點能否改善、是否形成更多確認的高低點。');
      note.push('沿前低畫窄帶，再以波動衡量合理容忍；不要為了讓支撐永遠有效而無限加寬。');
    }else{
      const hs=a.filter(x=>x.kind==='H').slice(-2),ls=a.filter(x=>x.kind==='L').slice(-2);
      note.push(`最近兩個同尺度高點 ${hs.map(x=>fmt(x.price)).join(' → ')}；低點 ${ls.map(x=>fmt(x.price)).join(' → ')}。結構${type==='trend'?'同步抬升':'同步下移'}。`);
      note.push(`此視窗以局部波段判讀，並未自動判定月線趨勢。將日線切成週線，檢查這段是否只是更大波段中的一部分。`);
      note.push(`原結構參考 ${fmt(c.level)}。標出它的失守或收復條件，觀察下一個反應點是否迫使你改判。`);
    }
    return note;
  }
  root.AcademyCaseNotes={explain};
})(window);
