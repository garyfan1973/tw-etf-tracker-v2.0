#!/usr/bin/env python3
"""Freeze reproducible teaching snapshots; selection quotas are NOT a strategy backtest.

Run --fetch once to obtain source snapshots, then run offline to reproduce cases.
Prices: Yahoo quote OHLC (provider split-adjusted; not dividend-adjusted here).
Cases are structural observations under documented rules, not certified classic patterns.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fetch_price_history import fetch_chart, parse_rows

OUT = ROOT / 'webapp' / 'academy-data'
ASSETS = [
    ('TW','2330','台積電'),('TW','2317','鴻海'),('TW','2454','聯發科'),
    ('TW','2308','台達電'),('TW','2303','聯電'),('TW','2881','富邦金'),
    ('TW','2882','國泰金'),('TW','2603','長榮'),('TW','2609','陽明'),
    ('TW','2002','中鋼'),('TW','1301','台塑'),('TW','1101','台泥'),
    ('TW','0050','元大台灣50'),('TW','0056','元大高股息'),
    ('US','AAPL','Apple'),('US','MSFT','Microsoft'),('US','NVDA','NVIDIA'),
    ('US','AMZN','Amazon'),('US','INTC','Intel'),('US','AMD','AMD'),
    ('US','SPY','S&P 500 ETF'),('US','QQQ','Nasdaq 100 ETF'),
    ('US','GLD','黃金 ETF'),('US','XLE','能源類股 ETF')
]
FAMILIES = {
    'trend':['高低點抬升',3], 'downtrend':['高低點下移',3],
    'support':['前低區再測試',4], 'volume':['放量事件',5],
    'bottom':['雙低點候選',6], 'top':['雙高點候選',7],
    'hsb':['三低點・頭肩底候選',6], 'hst':['三高點・頭肩頂候選',7],
    'range':['收斂區間觀察',8], 'breakout':['前高收盤突破',9],
    'failed':['突破後收回區間',9], 'divergence':['價格與動能背離候選',10],
    'triangle':['三角收斂候選',8], 'wedge':['楔形收斂候選',8],
    'flag':['推進後旗形整理候選',8], 'cup':['杯柄結構候選',8],
    'roundbottom':['圓弧底結構觀察',6], 'roundtop':['圓弧頂結構觀察',7]
}

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',',':'))+'\n', encoding='utf-8')

def fetch_asset(asset):
    market,symbol,name=asset
    ticker=symbol+('.TW' if market=='TW' else '')
    source=fetch_chart(ticker,'20y')
    # Only finished historical years are used for this edition, independent of live updates.
    rows=[r for r in parse_rows(source) if r['date']<='2025-12-31' and
          all(isinstance(r[k],(int,float)) and r[k]>0 for k in ['open','high','low','close']) and
          r['low']<=min(r['open'],r['close'])<=max(r['open'],r['close'])<=r['high'] and
          isinstance(r['volume'],(int,float)) and r['volume']>=0]
    if len(rows)<600: raise ValueError(f'{ticker}: insufficient history')
    compact=[[r[k] for k in ['date','open','high','low','close','volume']] for r in rows]
    result={'market':market,'symbol':symbol,'name':name,'source':'Yahoo Finance chart API',
            'sourceUrl':f'https://finance.yahoo.com/quote/{ticker}/history/',
            'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
            'adjustment':'來源 quote OHLC；來源已按拆併股調整價格，本教材未另作股息還原。成交量沿用來源。價格報酬非含息報酬。',
            'columns':['date','open','high','low','close','volume'],'rows':compact}
    result['sha256']=hashlib.sha256(json.dumps(compact,separators=(',',':')).encode()).hexdigest()
    dump(OUT/'history'/f'{market}-{symbol}.json',result)
    return f'{ticker}: {len(rows)} rows, {rows[0]["date"]} → {rows[-1]["date"]}'

def rsi_series(rows):
    out=[None]*len(rows)
    if len(rows)<15:return out
    changes=[rows[i][4]-rows[i-1][4] for i in range(1,len(rows))]
    gain=sum(max(v,0) for v in changes[:14])/14
    loss=sum(max(-v,0) for v in changes[:14])/14
    for i in range(14,len(rows)):
        if i>14:
            v=changes[i-1];gain=(gain*13+max(v,0))/14;loss=(loss*13+max(-v,0))/14
        out[i]=100-100/(1+gain/loss) if loss else (100 if gain else 50)
    return out

def candidates(asset):
    rows=asset['rows']; rsi=rsi_series(rows); pivots=[]; pending=[]; result=[]
    def add(family,t,level,anchors,rule,start=None):
        if t+20>=len(rows) or t<120:return
        begin=max(0,(start if start is not None else t-90))
        if begin>t-30:begin=max(0,t-60)
        c=rows[t][4];future=rows[t+20][4]
        upper=max(x[2] for x in rows[t-40:t]);lower=min(x[3] for x in rows[t-40:t])
        ret=(future/c-1)*100
        result.append({'family':family,'at':t,'start':begin,'end':t+20,'level':round(level,4),
            'anchors':anchors,'rule':rule,'return20':round(ret,2),
            'outcome':'上行' if ret>3 else '下行' if ret < -3 else '區間',
            'priorHigh':upper,'priorLow':lower,
            'volumeRatio':round(rows[t][5]/max(1,sum(x[5] for x in rows[t-20:t])/20),2),
            'firstReturn':next((i for i in range(t+1,t+21) if rows[i][4]<level),None)})
    for t in range(100,len(rows)-20):
        p=t-3
        if rows[p][2]==max(r[2] for r in rows[p-3:p+4]):kind='H';price=rows[p][2]
        elif rows[p][3]==min(r[3] for r in rows[p-3:p+4]):kind='L';price=rows[p][3]
        else:kind=None
        if kind:
            point={'i':p,'price':price,'kind':kind,'knownAt':t}
            if pivots and pivots[-1]['kind']==kind:
                if (price-pivots[-1]['price'])*(1 if kind=='H' else -1)>0:pivots[-1]=point
            else:pivots.append(point)
            last=pivots[-5:]
            if len(last)>=3:
                a,b,c=last[-3:]
                span=c['i']-a['i'];sym=abs(c['price']/a['price']-1)
                pre=rows[max(0,a['i']-35)][4]
                if 15<=span<=100 and sym<=.06:
                    if a['kind']=='L' and b['price']/max(a['price'],c['price'])>1.07 and pre>a['price']*1.04:
                        add('bottom',t,b['price'],[a,b,c], '左右各 3 根確認局部低點；兩低間隔 15–100 日、價差 ≤6%，中間反彈 ≥7%，前段有下降。僅為雙低候選；非經典中長期 W 底認證。',a['i']-35)
                    if a['kind']=='H' and min(a['price'],c['price'])/b['price']>1.07 and pre<a['price']*.96:
                        add('top',t,b['price'],[a,b,c], '左右各 3 根確認局部高點；兩高間隔 15–100 日、價差 ≤6%，中間回撤幅度 ≥約6.5%，前段有上升。僅為雙高候選。',a['i']-35)
                    if a['kind']=='H' and c['price']>a['price'] and rsi[a['i']] and rsi[c['i']]<rsi[a['i']]-5:
                        add('divergence',t,b['price'],[a,b,c], '同尺度兩個已確認高點：價格創高，RSI14 降低至少 5 點。動能背離不是反轉確認。',a['i']-35)
            if len(last)==5:
                a,b,c,d,e=last
                if e['i']-a['i']<130:
                    hi=[x for x in last if x['kind']=='H'];lo=[x for x in last if x['kind']=='L']
                    if len(hi)>=2 and len(lo)>=2:
                        if e['i']-a['i']>=20:
                            h0,h1=hi[-2:];l0,l1=lo[-2:]
                            width0=h0['price']-l0['price'];width1=h1['price']-l1['price']
                            if width0>0 and 0<width1<width0*.75:
                                if h1['price']<h0['price'] and l1['price']>l0['price']:
                                    add('triangle',t,h1['price'],last,'同尺度已確認高點降低、低點抬升，前後高低差收斂至少 25%，五個轉折跨度至少 20 日。以斜邊界檢查脫離，不保證方向。',a['i']-35)
                                if (h1['price']<h0['price'] and l1['price']<l0['price']) or (h1['price']>h0['price'] and l1['price']>l0['price']):
                                    add('wedge',t,h1['price'],last,'同尺度高低點同向移動，前後高低差收斂至少 25%，五個轉折跨度至少 20 日。楔形為候選，須核對斜率與大背景。',a['i']-35)
                        if hi[-1]['price']>hi[-2]['price']*1.01 and lo[-1]['price']>lo[-2]['price']*1.01:
                            add('trend',t,lo[-1]['price'],last,'相同局部轉折尺度：最近兩個高點與兩個低點各抬升超過 1%。',a['i']-25)
                        if hi[-1]['price']<hi[-2]['price']*.99 and lo[-1]['price']<lo[-2]['price']*.99:
                            add('downtrend',t,hi[-1]['price'],last,'相同局部轉折尺度：最近兩個高點與兩個低點各下降超過 1%。',a['i']-25)
                    if 25<=e['i']-a['i']<=120 and abs(e['price']/a['price']-1)<.10:
                        level=b['price']+(d['price']-b['price'])*(t-b['i'])/(d['i']-b['i'])
                        if a['kind']=='L' and c['price']<min(a['price'],e['price'])*.96 and rows[max(0,a['i']-30)][4]>a['price']*1.04 and level>max(a['price'],e['price']):
                            add('hsb',t,level,last,'三個低谷，中間至少較兩肩低 4%、兩肩價差 <10%、跨度 25–120 日且有前下降；頸線連中間兩高點。這是結構候選，仍需檢查突破。',a['i']-35)
                        if a['kind']=='H' and c['price']>max(a['price'],e['price'])*1.04 and rows[max(0,a['i']-30)][4]<a['price']*.96 and level<min(a['price'],e['price']):
                            add('hst',t,level,last,'三個高峰，中間至少較兩肩高 4%、兩肩價差 <10%、跨度 25–120 日且有前上升；頸線連中間兩低點。這是結構候選，仍需檢查跌破。',a['i']-35)
        close=rows[t][4];high=max(r[2] for r in rows[t-40:t]);low=min(r[3] for r in rows[t-40:t])
        if close>high*1.003 and rows[t-1][4]<=high:
            add('breakout',t,high,[], '收盤高於先前 40 日最高價至少 0.3%。前高不含當日；不保證後續延續。')
            pending.append((t,high))
        for old,level in pending[:]:
            if t-old>10:pending.remove((old,level))
            elif t>old and close<level*.997:
                add('failed',t,level,[{'i':old,'price':rows[old][4],'kind':'B','knownAt':old}], '先收盤突破前 40 日高點，隨後 10 根內收盤回到原突破位下方至少 0.3%。標籤在收回日才成立。')
                pending.remove((old,level))
        if rows[t][3]<low*1.012 and close>low and rows[t][3]>low*.97 and t%4==0:
            add('support',t,low,[], '當日低點接近前 40 日低點（−3% 至 +1.2%），收盤在前低之上；支撐作用仍待後續驗證。')
        vr=rows[t][5]/max(1,sum(r[5] for r in rows[t-20:t])/20)
        if vr>2.5 and abs(close/rows[t-1][4]-1)>.02:
            add('volume',t,rows[t-1][4],[], '當日量超過前 20 日均量 2.5 倍且收盤日變動絕對值 >2%。方向不能只由量能推論。')
        width10=(max(r[2] for r in rows[t-9:t+1])-min(r[3] for r in rows[t-9:t+1]))/close
        width40=(high-low)/close
        if t%10==0 and width10<width40*.40 and width10<.06:
            add('range',t,max(r[2] for r in rows[t-9:t+1]),[], '近 10 日高低幅 <6%，且不到前 40 日高低幅的 40%；這是收斂觀察，不自動命名三角形或旗形。')
        if t>=140 and t%5==0:
            pole0=t-40;pole1=t-15;pole=rows[pole1][4]-rows[pole0][4]
            recent=rows[t-14:t+1];rhigh=max(x[2] for x in recent);rlow=min(x[3] for x in recent)
            if pole>rows[pole0][4]*.15 and (rhigh-rlow)/close<.12 and .08<(rows[pole1][4]-rlow)/pole<.5 and close>rows[pole1][4]-.4*pole:
                add('flag',t,rhigh,[{'i':pole0,'price':rows[pole0][4],'kind':'P','knownAt':pole0},{'i':pole1,'price':rows[pole1][4],'kind':'P','knownAt':pole1}], '前 25 日收盤推進 >15%，接著 15 日整理幅 <12%、回撤旗桿 8%–50%。候選旗形還要檢查整理邊界與突破；不是旗桿投射獲利保證。',pole0-35)
            # Bowl/rounding observations use explicit 90-day thirds, avoiding drawn-to-fit curves.
            section=rows[t-89:t+1];parts=[sum(x[4] for x in section[k:k+30])/30 for k in [0,30,60]]
            if min(parts[0],parts[2])>parts[1]*1.08 and abs(parts[0]/parts[2]-1)<.12 and rows[t-110][4]>parts[1]*1.15:
                add('roundbottom',t,max(x[2] for x in section[:15]),[], '90 日分為三段各 30 日：中段平均收盤較兩側低至少約 7.4%、兩侧平均價差 <12%，更早背景較中段高 >15%。圓弧結構需再核對平滑程度與杯緣突破。',t-125)
            if max(parts[0],parts[2])<parts[1]*.92 and abs(parts[0]/parts[2]-1)<.12 and rows[t-110][4]<parts[1]*.85:
                add('roundtop',t,min(x[3] for x in section[:15]),[], '90 日分為三段各 30 日：中段平均收盤較兩側高至少約 8.7%、兩侧平均價差 <12%，更早背景較中段低 >15%。圓弧候選仍需支撐破位與反抽檢查。',t-125)
            bowl=rows[t-100:t-10];rimleft=max(range(t-100,t-80),key=lambda i:rows[i][2]);rimright=max(range(t-30,t-10),key=lambda i:rows[i][2]);bottom=min(range(rimleft+1,rimright),key=lambda i:rows[i][3]);rim=(rows[rimleft][2]+rows[rimright][2])/2
            handlelow=min(x[3] for x in rows[rimright+1:t+1]);depth=rim-rows[bottom][3]
            if depth>0 and .10<depth/rim<.40 and abs(rows[rimleft][2]/rows[rimright][2]-1)<.06 and rimleft+15<bottom<rimright-15 and .08<(rim-handlelow)/depth<.45 and rows[max(0,rimleft-30)][4]<rim*.95:
                # Window maxima/minima are known only once their search windows close.
                points=[{'i':i,'price':rows[i][3 if i==bottom else 2],'kind':'L' if i==bottom else 'H','knownAt':known} for i,known in [(rimleft,t-81),(bottom,rimright),(rimright,t-11)]]
                add('cup',t,rim,points,'約 90 日杯部：兩杯緣價差 <6%、杯深 10%–40%、低點距兩緣各 >15 日；其後柄部回撤杯深 8%–45%，前段有推進。這是候選，杯緣未突破不視為完成。',rimleft-35)
    for c in result:
        c.update({k:asset[k] for k in ['market','symbol','name']})
        c['date']=rows[c['at']][0];c['from']=rows[c['start']][0];c['to']=rows[c['end']][0]
        c['history']=f"academy-data/history/{asset['market']}-{asset['symbol']}.json"
    return result

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--fetch',action='store_true');args=parser.parse_args()
    if args.fetch:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for line in pool.map(fetch_asset,ASSETS):print(line,flush=True)
    assets=[json.loads((OUT/'history'/f'{m}-{s}.json').read_text()) for m,s,_ in ASSETS]
    pool=[]
    for asset in assets:pool.extend(candidates(asset))
    selected=[];used={};counts={}
    # Sparse families first. Deterministic hash mixes dates, then quotas balance market/outcome.
    for family in sorted(FAMILIES,key=lambda f:sum(c['family']==f for c in pool)):
        available=sorted([c for c in pool if c['family']==family],key=lambda c:hashlib.sha256(f'{c["symbol"]}:{c["date"]}:{family}'.encode()).hexdigest())
        chosen=[]
        quota=6 if family in ['triangle','wedge','flag','cup','roundbottom','roundtop'] else 10
        for n in range(quota):
            def penalty(c):
                return (sum(x['symbol']==c['symbol'] for x in chosen)*10 +
                        sum(x['outcome']==c['outcome'] for x in chosen)*3 +
                        sum(x['date'][:4]==c['date'][:4] for x in chosen)*2 +
                        (0 if c['market']=='TW' and sum(x['market']=='TW' for x in chosen)<6 else 2))
            eligible=[c for c in available if all(c['end']<a or c['start']>b for a,b in used.get((c['market'],c['symbol']),[]))]
            if not eligible:raise RuntimeError(f'Insufficient non-overlapping cases for {family}')
            c=min(eligible,key=penalty);chosen.append(c);available.remove(c)
            used.setdefault((c['market'],c['symbol']),[]).append((c['start'],c['end']))
        selected.extend(chosen);counts[family]=len(chosen)
    selected.sort(key=lambda c:(list(FAMILIES).index(c['family']),c['date']))
    for i,c in enumerate(selected):
        c['id']=f'case-{i+1:03}';c['title']=FAMILIES[c['family']][0];c['module']=FAMILIES[c['family']][1]
    catalog={'version':'2026-09-08.1','families':FAMILIES,'cases':selected,
        'method':'教學配額選樣：12 個核心分類各 10 組，另 6 個進階型態各 6 組，共 156 組，平衡漲跌與市場；不是全市場回測，不能用分布估算勝率。同標的案例視窗互不重疊。',
        'outcomeRule':'從觀察日收盤至第 20 個後續交易日收盤：>3% 上行、<−3% 下行，其餘區間。不是交易獲利或型態成功率。',
        'assets':[{k:a[k] for k in ['market','symbol','name','sha256','adjustment','sourceUrl']}|{'firstDate':a['rows'][0][0],'lastDate':a['rows'][-1][0],'count':len(a['rows'])} for a in assets]}
    dump(OUT/'catalog.json',catalog)
    print(f'{len(selected)} cases; {len(pool)} candidates; {counts}')
    print(f"TW cases: {sum(c['market']=='TW' for c in selected)}; outcomes: "+str({o:sum(c['outcome']==o for c in selected) for o in ['上行','下行','區間']}))

if __name__=='__main__':main()
