from http.server import BaseHTTPRequestHandler
import json
import csv
import io
import os
import urllib.request
import urllib.parse
import math
import time
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── 篩選結果暫存（非同步任務：伺服器算完存起來，前端切回來再領）──
# 用 anon key：screen_cache 的 RLS 已開放 anon 全操作，且 anon key 必為當前專案（不受
# service key 是否過期影響）
SUPABASE_URL     = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY     = os.environ.get("SUPABASE_ANON_KEY", "")

# code→公司名（內嵌；供 price_window 雲端備援時填股名。放 api/*.py 的獨立模組會被 Vercel 當函式而 build 失敗，故內嵌）
_STOCK_NAMES = {"1101": "台泥", "1102": "亞泥", "1103": "嘉泥", "1104": "環泥", "1108": "幸福", "1109": "信大", "1110": "東泥", "1201": "味全", "1203": "味王", "1210": "大成", "1213": "大飲", "1215": "卜蜂", "1216": "統一", "1217": "愛之味", "1218": "泰山", "1219": "福壽", "1220": "台榮", "1225": "福懋油", "1227": "佳格", "1229": "聯華", "1231": "聯華食", "1232": "大統益", "1233": "天仁", "1234": "黑松", "1235": "興泰", "1236": "宏亞", "1256": "鮮活果汁-KY", "1301": "台塑", "1303": "南亞", "1304": "台聚", "1305": "華夏", "1307": "三芳", "1308": "亞聚", "1309": "台達化", "1310": "台苯", "1312": "國喬", "1313": "聯成", "1314": "中石化", "1315": "達新", "1316": "上曜", "1319": "東陽", "1321": "大洋", "1323": "永裕", "1324": "地球", "1325": "恆大", "1326": "台化", "1337": "再生-KY", "1338": "廣華-KY", "1339": "昭輝", "1340": "勝悅-KY", "1341": "富林-KY", "1342": "八貫", "1402": "遠東新", "1409": "新纖", "1410": "南染", "1413": "宏洲", "1414": "東和", "1416": "廣豐", "1417": "嘉裕", "1418": "東華", "1419": "新紡", "1423": "利華", "1432": "大魯閣", "1434": "福懋", "1435": "中福", "1436": "華友聯", "1437": "勤益控", "1438": "三地開發", "1439": "雋揚", "1440": "南紡", "1441": "大東", "1442": "名軒", "1443": "立益物流", "1444": "力麗", "1445": "大宇", "1446": "宏和", "1447": "力鵬", "1449": "佳和", "1451": "年興", "1452": "宏益", "1453": "大將", "1454": "台富", "1455": "集盛", "1456": "怡華", "1457": "宜進", "1459": "聯發", "1460": "宏遠", "1463": "強盛新", "1464": "得力", "1465": "偉全", "1466": "聚隆", "1467": "南緯", "1468": "昶和", "1470": "大統新創", "1471": "首利", "1472": "三洋實業", "1473": "台南", "1474": "弘裕", "1475": "業旺", "1476": "儒鴻", "1477": "聚陽", "1503": "士電", "1504": "東元", "1506": "正道", "1512": "瑞利", "1513": "中興電", "1514": "亞力", "1515": "力山", "1516": "川飛", "1517": "利奇", "1519": "華城", "1521": "大億", "1522": "堤維西", "1524": "耿鼎", "1525": "江申", "1526": "日馳", "1527": "鑽全", "1528": "恩德", "1529": "樂事綠能", "1530": "亞崴", "1531": "高林股", "1532": "勤美", "1533": "車王電", "1535": "中宇", "1536": "和大", "1537": "廣隆", "1538": "正峰", "1539": "巨庭", "1540": "喬福", "1541": "錩泰", "1558": "伸興", "1560": "中砂", "1563": "巧新", "1568": "倉佑", "1582": "信錦", "1583": "程泰", "1587": "吉茂", "1589": "永冠-KY", "1590": "亞德客-KY", "1597": "直得", "1598": "岱宇", "1603": "華電", "1604": "聲寶", "1605": "華新", "1608": "華榮", "1609": "大亞", "1611": "中電", "1612": "宏泰", "1614": "三洋電", "1615": "大山", "1616": "億泰", "1617": "榮星", "1618": "合機", "1623": "大東電", "1626": "艾美特-KY", "1702": "南僑", "1707": "葡萄王", "1708": "東鹼", "1709": "和益", "1710": "東聯", "1711": "永光", "1712": "興農", "1713": "國化", "1714": "和桐", "1717": "長興", "1718": "中纖", "1720": "生達", "1721": "三晃", "1722": "台肥", "1723": "中碳", "1725": "元禎", "1726": "永記", "1727": "中華化", "1730": "花仙子", "1731": "美吾華", "1732": "毛寶", "1733": "五鼎", "1734": "杏輝", "1735": "日勝化", "1736": "喬山", "1737": "臺鹽", "1752": "南光", "1760": "寶齡富錦", "1762": "中化生", "1773": "勝一", "1776": "展宇", "1783": "和康生", "1786": "科妍", "1789": "神隆", "1795": "美時", "1802": "台玻", "1805": "寶徠", "1806": "冠軍", "1808": "潤隆", "1809": "中釉", "1810": "和成", "1817": "凱撒衛", "1903": "士紙", "1904": "正隆", "1905": "華紙", "1906": "寶隆", "1907": "永豐餘", "1909": "榮成", "2002": "中鋼", "2006": "東和鋼鐵", "2007": "燁興", "2008": "高興昌", "2009": "第一銅", "2010": "春源", "2012": "春雨", "2013": "中鋼構", "2014": "中鴻", "2015": "豐興", "2017": "官田鋼", "2020": "美亞", "2022": "聚亨", "2023": "燁輝", "2024": "志聯", "2025": "千興", "2027": "大成鋼", "2028": "威致", "2029": "盛餘", "2030": "彰源", "2031": "新光鋼", "2032": "新鋼", "2033": "佳大", "2034": "允強", "2038": "海光", "2049": "上銀", "2059": "川湖", "2062": "橋椿", "2069": "運錩", "2072": "世紀風電", "2101": "南港", "2102": "泰豐", "2103": "台橡", "2104": "國際中橡", "2105": "正新", "2106": "建大", "2107": "厚生", "2108": "南帝", "2109": "華豐", "2114": "鑫永銓", "2115": "六暉-KY", "2201": "裕隆", "2204": "中華", "2206": "三陽工業", "2207": "和泰車", "2208": "台船", "2211": "長榮鋼", "2227": "裕日車", "2228": "劍麟", "2231": "為升", "2233": "宇隆", "2236": "百達-KY", "2237": "華德動能-創", "2239": "英利-KY", "2241": "艾姆勒", "2243": "宏旭-KY", "2247": "汎德永業", "2248": "華勝-KY", "2250": "IKKA-KY", "2254": "巨鎧精密-創", "2258": "鴻華先進-創", "2301": "光寶科", "2302": "麗正", "2303": "聯電", "2305": "全友", "2308": "台達電", "2312": "金寶", "2313": "華通", "2314": "台揚", "2316": "楠梓電", "2317": "鴻海", "2321": "東訊", "2323": "中環", "2324": "仁寶", "2327": "國巨*", "2328": "廣宇", "2329": "華泰", "2330": "台積電", "2331": "精英", "2332": "友訊", "2337": "旺宏", "2338": "光罩", "2340": "台亞", "2342": "茂矽", "2344": "華邦電", "2345": "智邦", "2347": "聯強", "2348": "海悅", "2349": "錸德", "2351": "順德", "2352": "佳世達", "2353": "宏碁", "2354": "鴻準", "2355": "敬鵬", "2356": "英業達", "2357": "華碩", "2359": "所羅門", "2360": "致茂", "2362": "藍天", "2363": "矽統", "2364": "倫飛", "2365": "昆盈", "2367": "燿華", "2368": "金像電", "2369": "菱生", "2371": "大同", "2373": "震旦行", "2374": "佳能", "2375": "凱美", "2376": "技嘉", "2377": "微星", "2379": "瑞昱", "2380": "虹光", "2382": "廣達", "2383": "台光電", "2385": "群光", "2387": "精元", "2388": "威盛", "2390": "云辰", "2392": "正崴", "2393": "億光", "2395": "研華", "2397": "友通", "2399": "映泰", "2401": "凌陽", "2402": "毅嘉", "2404": "漢唐", "2405": "輔信", "2406": "國碩", "2408": "南亞科", "2409": "友達", "2412": "中華電", "2413": "環科", "2414": "精技", "2415": "錩新", "2417": "圓剛", "2419": "仲琦", "2420": "新巨", "2421": "建準", "2423": "固緯", "2424": "隴華", "2425": "承啟", "2426": "鼎元", "2427": "三商電", "2428": "興勤", "2429": "銘旺科", "2430": "燦坤", "2431": "聯昌", "2432": "倚天酷碁-創", "2433": "互盛電", "2434": "統懋", "2436": "偉詮電", "2438": "翔耀", "2439": "美律", "2440": "太空梭", "2441": "超豐", "2442": "新美齊", "2444": "兆勁", "2449": "京元電子", "2450": "神腦", "2451": "創見", "2453": "凌群", "2454": "聯發科", "2455": "全新", "2457": "飛宏", "2458": "義隆", "2459": "敦吉", "2460": "建通", "2461": "光群雷", "2462": "良得電", "2464": "盟立", "2465": "麗臺", "2466": "冠西電", "2467": "志聖", "2468": "華經", "2471": "資通", "2472": "立隆電", "2474": "可成", "2476": "鉅祥", "2477": "美隆電", "2478": "大毅", "2480": "敦陽科", "2481": "強茂", "2482": "連宇", "2483": "百容", "2484": "希華", "2485": "兆赫", "2486": "一詮", "2488": "漢平", "2489": "瑞軒", "2491": "吉祥全", "2492": "華新科", "2493": "揚博", "2495": "普安", "2496": "卓越", "2497": "怡利電", "2498": "宏達電", "2501": "國建", "2504": "國產", "2505": "國揚", "2506": "太設", "2509": "全坤建", "2511": "太子", "2514": "龍邦", "2515": "中工", "2516": "新建", "2520": "冠德", "2524": "京城", "2527": "宏璟", "2528": "皇普", "2530": "華建", "2534": "宏盛", "2535": "達欣工", "2536": "宏普", "2537": "聯上發", "2538": "基泰", "2539": "櫻花建", "2540": "愛山林", "2542": "興富發", "2543": "皇昌", "2545": "皇翔", "2546": "根基", "2547": "日勝生", "2548": "華固", "2597": "潤弘", "2601": "益航", "2603": "長榮", "2605": "新興", "2606": "裕民", "2607": "榮運", "2608": "嘉里大榮", "2609": "陽明", "2610": "華航", "2611": "志信", "2612": "中航", "2613": "中櫃", "2614": "東森", "2615": "萬海", "2616": "山隆", "2617": "台航", "2618": "長榮航", "2630": "亞航", "2633": "台灣高鐵", "2634": "漢翔", "2636": "台驊控股", "2637": "慧洋-KY", "2642": "宅配通", "2645": "長榮航太", "2646": "星宇航空", "2701": "萬企", "2702": "華園", "2704": "國賓", "2705": "六福", "2706": "第一店", "2707": "晶華", "2712": "遠雄來", "2722": "夏都", "2723": "美食-KY", "2727": "王品", "2731": "雄獅", "2739": "寒舍", "2748": "雲品", "2753": "八方雲集", "2762": "世界健身-KY", "2801": "彰銀", "2812": "台中銀", "2816": "旺旺保", "2820": "華票", "2832": "台產", "2834": "臺企銀", "2836": "高雄銀", "2838": "聯邦銀", "2845": "遠東銀", "2849": "安泰銀", "2850": "新產", "2851": "中再保", "2852": "第一保", "2855": "統一證", "2880": "華南金", "2881": "富邦金", "2882": "國泰金", "2883": "凱基金", "2884": "玉山金", "2885": "元大金", "2886": "兆豐金", "2887": "台新新光金", "2889": "國票金", "2890": "永豐金", "2891": "中信金", "2892": "第一金", "2897": "王道銀行", "2901": "欣欣", "2903": "遠百", "2904": "匯僑", "2905": "三商", "2906": "高林", "2908": "特力", "2910": "統領", "2911": "麗嬰房", "2912": "統一超", "2913": "農林", "2915": "潤泰全", "2923": "鼎固-KY", "2929": "淘帝-KY", "2939": "永邑-KY", "2945": "三商家購", "3002": "歐格", "3003": "健和興", "3004": "豐達科", "3005": "神基", "3006": "晶豪科", "3008": "大立光", "3010": "華立", "3011": "今皓", "3013": "晟銘電", "3014": "聯陽", "3015": "全漢", "3016": "嘉晶", "3017": "奇鋐", "3018": "隆銘綠能", "3019": "亞光", "3021": "鴻名", "3022": "威強電", "3023": "信邦", "3024": "憶聲", "3025": "星通", "3026": "禾伸堂", "3027": "盛達", "3028": "增你強", "3029": "零壹", "3030": "德律", "3031": "佰鴻", "3032": "偉訓", "3033": "威健", "3034": "聯詠", "3035": "智原", "3036": "文曄", "3037": "欣興", "3038": "全台", "3040": "遠見", "3041": "揚智", "3042": "晶技", "3043": "科風", "3044": "健鼎", "3045": "台灣大", "3046": "建碁", "3047": "訊舟", "3048": "益登", "3049": "精金", "3050": "鈺德", "3051": "力特", "3052": "夆典", "3054": "立萬利", "3055": "蔚華科", "3056": "富華新", "3057": "喬鼎", "3058": "立德", "3059": "華晶科", "3060": "銘異", "3062": "建漢", "3090": "日電貿", "3092": "鴻碩", "3094": "聯傑", "3130": "一零四", "3135": "凌航", "3138": "耀登", "3149": "正達", "3150": "鈺寶-創", "3164": "景岳", "3167": "大量", "3168": "眾福科", "3189": "景碩", "3209": "全科", "3229": "晟鈦", "3231": "緯創", "3257": "虹冠電", "3266": "昇陽", "3296": "勝德", "3305": "昇貿", "3308": "聯德", "3311": "閎暉", "3312": "弘憶股", "3321": "同泰", "3338": "泰碩", "3346": "麗清", "3356": "奇偶", "3376": "新日興", "3380": "明泰", "3406": "玉晶光", "3413": "京鼎", "3416": "融程電", "3419": "譁裕", "3432": "台端", "3437": "榮創", "3443": "創意", "3447": "展達", "3450": "聯鈞", "3481": "群創", "3494": "誠研", "3501": "維熹", "3504": "揚明光", "3515": "華擎", "3518": "柏騰", "3528": "安馳", "3530": "晶相光", "3532": "台勝科", "3533": "嘉澤", "3535": "晶彩科", "3543": "州巧", "3545": "敦泰", "3550": "聯穎", "3557": "嘉威", "3563": "牧德", "3576": "聯合再生", "3583": "辛耘", "3588": "通嘉", "3591": "艾笛森", "3592": "瑞鼎", "3593": "力銘", "3596": "智易", "3605": "宏致", "3607": "谷崧", "3617": "碩天", "3622": "洋華", "3645": "達邁", "3652": "精聯", "3653": "健策", "3661": "世芯-KY", "3665": "貿聯-KY", "3669": "圓展", "3673": "TPK-KY", "3679": "新至陞", "3686": "達能", "3694": "海華", "3701": "大眾控", "3702": "大聯大", "3703": "欣陸", "3704": "合勤控", "3705": "永信", "3706": "神達", "3708": "上緯投控", "3711": "日月光投控", "3712": "永崴投控", "3714": "富采", "3715": "定穎投控", "3716": "中化控股", "3717": "聯嘉投控", "4104": "佳醫", "4106": "雃博", "4108": "懷特", "4119": "旭富", "4133": "亞諾法", "4137": "麗豐-KY", "4142": "國光生", "4148": "全宇生技-KY", "4155": "訊映", "4164": "承業醫", "4169": "泰宗", "4178": "永笙-KY", "4190": "佐登-KY", "4195": "基米-創", "4306": "炎洲", "4414": "如興", "4426": "利勤", "4438": "廣越", "4439": "冠星-KY", "4440": "宜新實業", "4441": "振大環球", "4526": "東台", "4532": "瑞智", "4536": "拓凱", "4540": "全球傳動", "4545": "銘鈺", "4551": "智伸科", "4552": "力達-KY", "4555": "氣立", "4557": "永新-KY", "4560": "強信-KY", "4562": "穎漢", "4564": "元翎", "4566": "時碩工業", "4569": "六方科-KY", "4571": "鈞興-KY", "4572": "駐龍", "4576": "大銀微系統", "4581": "光隆精密-KY", "4582": "聚恆-創", "4583": "台灣精銳", "4585": "達明", "4588": "玖鼎電力", "4590": "富田-創", "4720": "德淵", "4722": "國精化", "4736": "泰博", "4737": "華廣", "4739": "康普", "4746": "台耀", "4755": "三福化", "4763": "材料*-KY", "4764": "雙鍵", "4766": "南寶", "4770": "上品", "4771": "望隼", "4807": "日成-KY", "4904": "遠傳", "4906": "正文", "4912": "聯德控股-KY", "4915": "致伸", "4916": "事欣科", "4919": "新唐", "4927": "泰鼎-KY", "4930": "燦星網", "4934": "太極", "4935": "茂林-KY", "4938": "和碩", "4942": "嘉彰", "4943": "康控-KY", "4949": "有成精密", "4952": "凌通", "4956": "光鋐", "4958": "臻鼎-KY", "4960": "誠美材", "4961": "天鈺", "4967": "十銓", "4968": "立積", "4976": "佳凌", "4977": "眾達-KY", "4989": "榮科", "4994": "傳奇", "4999": "鑫禾", "5007": "三星", "5203": "訊連", "5215": "科嘉-KY", "5222": "全訊", "5225": "東科-KY", "5234": "達興材料", "5236": "凌陽創新", "5243": "乙盛-KY", "5244": "弘凱", "5258": "虹堡", "5269": "祥碩", "5283": "禾聯碩", "5284": "jpp-KY", "5285": "界霖", "5288": "豐祥-KY", "5292": "華懋", "5306": "桂盟", "5388": "中磊", "5434": "崇越", "5469": "瀚宇博", "5471": "松翰", "5484": "慧友", "5515": "建國", "5519": "隆大", "5521": "工信", "5522": "遠雄", "5525": "順天", "5531": "鄉林", "5533": "皇鼎", "5534": "長虹", "5538": "東明-KY", "5546": "永固-KY", "5607": "遠雄港", "5608": "四維航", "5706": "鳳凰", "5871": "中租-KY", "5876": "上海商銀", "5880": "合庫金", "5906": "台南-KY", "5907": "大洋-KY", "6005": "群益證", "6024": "群益期", "6108": "競國", "6112": "邁達特", "6115": "鎰勝", "6116": "彩晶", "6117": "迎廣", "6120": "達運", "6128": "上福", "6133": "金橋", "6136": "富爾特", "6139": "亞翔", "6141": "柏承", "6142": "友勁", "6152": "百一", "6153": "嘉聯益", "6155": "鈞寶", "6164": "華興", "6165": "浪凡", "6166": "凌華", "6168": "宏齊", "6176": "瑞儀", "6177": "達麗", "6183": "關貿", "6184": "大豐電", "6189": "豐藝", "6191": "精成科", "6192": "巨路", "6196": "帆宣", "6197": "佳必琪", "6201": "亞弘電", "6202": "盛群", "6205": "詮欣", "6206": "飛捷", "6209": "今國光", "6213": "聯茂", "6214": "精誠", "6215": "和椿", "6216": "居易", "6224": "聚鼎", "6225": "天瀚", "6226": "光鼎", "6230": "尼得科超眾", "6235": "華孚", "6239": "力成", "6243": "迅杰", "6257": "矽格", "6269": "台郡", "6271": "同欣電", "6272": "驊陞", "6277": "宏正", "6278": "台表科", "6281": "全國電", "6282": "康舒", "6283": "淳安", "6285": "啟碁", "6405": "悅城", "6409": "旭隼", "6412": "群電", "6414": "樺漢", "6415": "矽力*-KY", "6416": "瑞祺電通", "6426": "統新", "6431": "光麗-KY", "6438": "迅得", "6442": "光聖", "6443": "元晶", "6446": "藥華藥", "6449": "鈺邦", "6451": "訊芯-KY", "6456": "GIS-KY", "6464": "台數科", "6472": "保瑞", "6477": "安集", "6491": "晶碩", "6504": "南六", "6505": "台塑化", "6515": "穎崴", "6525": "捷敏-KY", "6526": "達發", "6531": "愛普*", "6533": "晶心科", "6534": "正瀚-創", "6541": "泰福-KY", "6550": "北極星藥業-KY", "6552": "易華電", "6558": "興能高", "6573": "虹揚-KY", "6579": "研揚", "6581": "鋼聯", "6582": "申豐", "6585": "鼎基", "6589": "台康生技", "6591": "動力-KY", "6592": "和潤企業", "6598": "ABC-KY", "6605": "帝寶", "6606": "建德工業", "6614": "資拓宏宇", "6625": "必應", "6641": "基士德-KY", "6645": "金萬林-創", "6655": "科定", "6657": "華安", "6658": "聯策", "6666": "羅麗芬-KY", "6668": "中揚光", "6669": "緯穎", "6670": "復盛應用", "6671": "三能-KY", "6672": "騰輝電子-KY", "6674": "鋐寶科技", "6689": "伊雲谷", "6691": "洋基工程", "6695": "芯鼎", "6698": "旭暉應材", "6706": "惠特", "6715": "嘉基", "6719": "力智", "6722": "輝創", "6742": "澤米", "6743": "安普新", "6753": "龍德造船", "6754": "匯僑設計", "6756": "威鋒電子", "6757": "台灣虎航", "6768": "志強-KY", "6770": "力積電", "6771": "平和環保-創", "6776": "展碁國際", "6781": "AES-KY", "6782": "視陽", "6789": "采鈺", "6790": "永豐實", "6792": "詠業", "6794": "向榮生技", "6796": "晉弘", "6799": "來頡", "6805": "富世達", "6807": "峰源-KY", "6830": "汎銓", "6831": "邁科", "6834": "天二科技", "6835": "圓裕", "6838": "台新藥", "6854": "錼創科技-KY創", "6861": "睿生光電", "6862": "三集瑞-KY", "6863": "永道-KY", "6869": "雲豹能源", "6873": "泓德能源", "6885": "全福生技", "6887": "寶綠特-KY", "6890": "來億-KY", "6901": "鑽石投資", "6902": "GOGOLOOK", "6906": "現觀科", "6908": "宏碁遊戲-創", "6909": "創控", "6914": "阜爾運通", "6916": "華凌", "6918": "愛派司", "6919": "康霈*", "6921": "嘉雨思-創", "6923": "中台", "6924": "榮惠-KY創", "6928": "攸泰科技", "6931": "青松健康", "6933": "AMAX-KY", "6934": "心誠鎂", "6936": "永鴻生技", "6937": "天虹", "6944": "兆聯實業", "6947": "台鎔科技", "6949": "沛爾生醫-創", "6951": "青新-創", "6952": "大武山", "6955": "邦睿生技-創", "6957": "裕慶-KY", "6958": "日盛台駿", "6962": "奕力-KY", "6965": "中傑-KY", "6969": "成信實業*-創", "6988": "威力暘-創", "6994": "富威電力", "7610": "聯友金屬-創", "7631": "聚賢研發-創", "7689": "大鵬科CLMX", "7705": "三商餐飲", "7711": "永擎", "7721": "微程式", "7722": "LINEPAY", "7730": "暉盛-創", "7732": "金興精密", "7736": "虎山", "7740": "熙特爾-創", "7749": "意騰-KY", "7750": "新代", "7760": "享溫馨", "7765": "中華資安", "7768": "頌勝科技", "7769": "鴻勁", "7780": "大研生醫*", "7786": "東方風能", "7788": "松川精密", "7791": "皇家可口", "7795": "長廣", "7799": "禾榮科", "7803": "雲象科技-創", "7818": "溢泰實業", "7821": "神數", "7822": "倍利科", "7823": "奧義賽博-KY創", "7827": "漢康-KY創", "7835": "永悅健康-創", "7855": "和運租車", "8011": "台通", "8016": "矽創", "8021": "尖點", "8028": "昇陽半導體", "8033": "雷虎", "8039": "台虹", "8045": "達運光電", "8046": "南電", "8070": "長華*", "8072": "陞泰", "8081": "致新", "8101": "華冠", "8103": "瀚荃", "8104": "錸寶", "8105": "凌巨", "8110": "華東", "8112": "至上", "8114": "振樺電", "8131": "福懋科", "8150": "南茂", "8162": "微矽電子-創", "8163": "達方", "8201": "無敵", "8210": "勤誠", "8213": "志超", "8215": "明基材", "8222": "寶一", "8249": "菱光", "8261": "富鼎", "8271": "宇瞻", "8341": "日友", "8367": "建新國際", "8374": "羅昇", "8404": "百和興業-KY", "8411": "福貞-KY", "8422": "可寧衛*", "8429": "金麗-KY", "8438": "昶昕", "8442": "威宏-KY", "8443": "阿瘦", "8454": "富邦媒", "8462": "柏文", "8463": "潤泰材", "8464": "億豐", "8466": "美吉吉-KY", "8467": "波力-KY", "8473": "山林水", "8476": "台境*", "8478": "東哥遊艇", "8481": "政伸", "8482": "商億-KY", "8487": "愛爾達-創", "8488": "吉源-KY", "8499": "鼎炫-KY", "8926": "台汽電", "8940": "新天地", "8996": "高力", "9103": "美德醫療-DR", "910322": "康師傅-DR", "9105": "泰金寶-DR", "910861": "神州-DR", "9110": "越南控-DR", "911608": "明輝-DR", "911622": "泰聚亨-DR", "911868": "同方友友-DR", "912000": "晨訊科-DR", "9136": "巨騰-DR", "9802": "鈺齊-KY", "9902": "台火", "9904": "寶成", "9905": "大華", "9906": "欣巴巴", "9907": "統一實", "9908": "大台北", "9910": "豐泰", "9911": "櫻花", "9912": "偉聯", "9914": "美利達", "9917": "中保科", "9918": "欣天然", "9919": "康那香", "9921": "巨大", "9924": "福興", "9925": "新保", "9926": "新海", "9927": "泰銘", "9928": "中視", "9929": "秋雨", "9930": "中聯資源", "9931": "欣高", "9933": "中鼎", "9934": "成霖", "9935": "慶豐富", "9937": "全國", "9938": "百和", "9939": "宏全", "9940": "信義", "9941": "裕融", "9942": "茂順", "9943": "好樂迪", "9944": "新麗", "9945": "潤泰新", "9946": "三發地產", "9955": "佳龍", "9958": "世紀鋼"}


def _cache_sb(path, method="GET", body=None, params=None):
    if not (SUPABASE_URL and SUPABASE_KEY):
        return 0, None
    url = f"{SUPABASE_URL}/rest/v1{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Content-Type": "application/json", "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}", "Prefer": "return=minimal",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except Exception:
        return 0, None


def _cache_save(job_id, result):
    """存篩選結果並順手清除 15 分鐘前的舊暫存。"""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    _cache_sb("/screen_cache", "DELETE", params=[("created_at", f"lt.{cutoff}")])
    _cache_sb("/screen_cache", "DELETE", params=[("job_id", f"eq.{job_id}")])
    _cache_sb("/screen_cache", "POST", body={"job_id": job_id, "result": result})


def _cache_get(job_id):
    st, rows = _cache_sb("/screen_cache", "GET",
                         params=[("job_id", f"eq.{job_id}"), ("select", "result")])
    if st == 200 and rows:
        return rows[0]["result"]
    return None

TWSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.twse.com.tw/",
}
YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

# ── 產業別快取（TTL 24h，幾乎不變） ──────────────────────────────────────────
_INDUSTRY_CODE_MAP = {
    "01":"水泥工業","02":"食品工業","03":"塑膠工業","04":"紡織纖維",
    "05":"電機機械","06":"電器電纜","07":"化學生技醫療","08":"玻璃陶瓷",
    "09":"造紙工業","10":"鋼鐵工業","11":"橡膠工業","12":"汽車工業",
    "13":"電子工業","14":"建材營造","15":"航運業","16":"觀光餐旅",
    "17":"金融保險","18":"貿易百貨","19":"綜合","20":"其他",
    "21":"化學工業","22":"生技醫療業","23":"油電燃氣業","24":"半導體業",
    "25":"電腦及週邊設備業","26":"光電業","27":"通信網路業","28":"電子零組件業",
    "29":"電子通路業","30":"資訊服務業","31":"其他電子業","32":"文化創意業",
    "33":"農業科技業","34":"電子商務業","35":"綠能環保","36":"數位雲端",
    "37":"運動休閒","38":"居家生活","39":"金融業",
}

_industry_cache: dict = {}
_industry_cache_ts: float = 0.0

def _get_industry_map() -> dict:
    global _industry_cache, _industry_cache_ts
    if _industry_cache and time.time() - _industry_cache_ts < 86400:
        return _industry_cache
    try:
        url = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as r:
            data = json.loads(r.read())
        m = {}
        for row in data:
            code = str(row.get("公司代號", "")).strip()
            ind  = str(row.get("產業別", "")).strip()
            if code:
                # 若是數字代碼就轉成中文，否則直接用
                m[code] = _INDUSTRY_CODE_MAP.get(ind, ind)
        if m:
            _industry_cache = m
            _industry_cache_ts = time.time()
    except Exception:
        pass
    return _industry_cache


def _get_json(url, headers=TWSE_HEADERS, timeout=20):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except Exception:
        return None
    if not raw or not raw.strip():
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None


def _get_text(url, headers=TWSE_HEADERS, timeout=20):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8-sig", errors="replace")
    except Exception:
        return None


def _parse_roc_date(roc_str):
    """'115/06/02' -> '20260602'"""
    parts = str(roc_str).replace("-", "/").split("/")
    if len(parts) == 3:
        try:
            return f"{int(parts[0]) + 1911}{parts[1].zfill(2)}{parts[2].zfill(2)}"
        except ValueError:
            pass
    return ""


def _pf(s):
    s = str(s).replace(",", "").strip()
    return None if s in ("--", "N/A", "", "除權息", "除息", "除權") else float(s)


# ─────────────────────────────────────────────────────────────────────────────
# TWSE latest day (fast path)
# ─────────────────────────────────────────────────────────────────────────────

def _parse_stocks_legacy(data):
    """Parse old TWSE STOCK_DAY_ALL format → (stocks_dict, date_str)."""
    roc_date = data.get("date", "")
    actual_date = _parse_roc_date(roc_date) if "/" in roc_date else roc_date
    stocks = {}
    for row in data.get("data", []):
        try:
            code = row[0].strip()
            if not code or not code[0].isdigit():
                continue
            close_p = _pf(row[7])
            change_raw = str(row[8]).replace(",", "").strip() if len(row) > 8 else "0"
            for ch in change_raw:
                if ch not in "0123456789.+-":
                    change_raw = change_raw.replace(ch, "")
            try:
                change_val = float(change_raw)
            except (ValueError, TypeError):
                change_val = None
            stocks[code] = {
                "code": code, "name": row[1].strip(),
                "volume": _pf(row[2]) or 0,
                "open": _pf(row[4]), "high": _pf(row[5]),
                "low": _pf(row[6]), "close": close_p,
                "prev_close": round(close_p - change_val, 4) if (close_p and change_val is not None) else None,
            }
        except Exception:
            continue
    return stocks, actual_date


def _parse_stocks_openapi(rows):
    """Parse TWSE OpenAPI STOCK_DAY_ALL format → (stocks_dict, date_str)."""
    # 從第一筆資料取真實交易日期（避免硬用 today 造成資料日期錯誤）
    actual_date = ""
    if rows:
        raw_d = str(rows[0].get("Date", rows[0].get("日期", ""))).strip().replace("/", "")
        if len(raw_d) == 7 and raw_d.isdigit():          # ROC 民國 YYYMMDD
            actual_date = str(int(raw_d[:3]) + 1911) + raw_d[3:]
        elif len(raw_d) == 8 and raw_d.isdigit():        # 西元 YYYYMMDD
            actual_date = raw_d
    if not actual_date:
        actual_date = datetime.now(timezone(timedelta(hours=8))).strftime("%Y%m%d")

    stocks = {}
    for row in rows:
        try:
            code = str(row.get("Code", row.get("證券代號", ""))).strip()
            if not code or not code[0].isdigit():
                continue
            close_p  = _pf(row.get("ClosingPrice",  row.get("收盤價", "")))
            open_p   = _pf(row.get("OpeningPrice",  row.get("開盤價", "")))
            high_p   = _pf(row.get("HighestPrice",  row.get("最高價", "")))
            low_p    = _pf(row.get("LowestPrice",   row.get("最低價", "")))
            vol      = _pf(row.get("TradeVolume",   row.get("成交股數", ""))) or 0
            chg      = _pf(row.get("Change",        row.get("漲跌價差", "")))
            prev_c   = round(close_p - chg, 4) if (close_p and chg is not None) else None
            name     = str(row.get("Name", row.get("證券名稱", ""))).strip()
            stocks[code] = {
                "code": code, "name": name,
                "volume": vol, "open": open_p, "high": high_p,
                "low": low_p, "close": close_p, "prev_close": prev_c,
            }
        except Exception:
            continue
    return stocks, actual_date


def _parse_stocks_csv(text):
    """新版 TWSE STOCK_DAY_ALL CSV → (stocks_dict, date_str)。
    2026 起 www.twse.com.tw 不論 response=json 都回傳 CSV，欄位：
    日期,證券代號,證券名稱,成交股數,成交金額,開盤價,最高價,最低價,收盤價,漲跌價差,成交筆數"""
    stocks, date_str = {}, ""
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 10 or not row[1].strip() or not row[1].strip()[0].isdigit():
            continue   # 表頭 / 非數字代號
        try:
            if not date_str:
                raw_d = row[0].strip().replace("/", "")
                if len(raw_d) == 7 and raw_d.isdigit():          # 民國 YYYMMDD
                    date_str = str(int(raw_d[:3]) + 1911) + raw_d[3:]
                elif len(raw_d) == 8 and raw_d.isdigit():        # 西元 YYYYMMDD
                    date_str = raw_d
            close_p = _pf(row[8]); chg = _pf(row[9])
            code = row[1].strip()
            stocks[code] = {
                "code": code, "name": row[2].strip(),
                "volume": _pf(row[3]) or 0,
                "open": _pf(row[5]), "high": _pf(row[6]),
                "low": _pf(row[7]), "close": close_p,
                "prev_close": round(close_p - chg, 4) if (close_p is not None and chg is not None) else None,
            }
        except Exception:
            continue
    return stocks, date_str


def _fetch_stocks_from_price_window():
    """雲端備援：TWSE 兩個端點從 Vercel 都被擋時，改讀 Supabase price_window
    （每日排程上傳的證交所 OHLCV）。無 name（顯示用代號）；prev_close 由前一交易日收盤推得。"""
    if not (SUPABASE_URL and SUPABASE_KEY):
        return {}, ""
    def _rows(params):
        return _cache_sb("/price_window", params=params)[1] or []
    top = _rows([("select", "trade_date"), ("order", "trade_date.desc"), ("limit", "1")])
    if not top:
        return {}, ""
    latest = top[0]["trade_date"]
    prev = _rows([("select", "trade_date"), ("trade_date", f"lt.{latest}"),
                  ("order", "trade_date.desc"), ("limit", "1")])
    prev_date = prev[0]["trade_date"] if prev else None

    def _all(date):
        out, off = [], 0
        while True:                                   # PostgREST 單頁上限 1000，需分頁
            page = _rows([("select", "code,open,high,low,close,volume"),
                          ("trade_date", f"eq.{date}"), ("order", "code.asc"),
                          ("offset", str(off)), ("limit", "1000")])
            out.extend(page)
            if len(page) < 1000:
                break
            off += 1000
        return out

    prev_close = {r["code"]: r.get("close") for r in _all(prev_date)} if prev_date else {}
    stocks = {}
    for r in _all(latest):
        code = str(r.get("code", "")).strip()
        if not code or not code[0].isdigit():
            continue
        stocks[code] = {
            "code": code, "name": _STOCK_NAMES.get(code, code),
            "volume": r.get("volume") or 0,
            "open": r.get("open"), "high": r.get("high"),
            "low": r.get("low"), "close": r.get("close"),
            "prev_close": prev_close.get(code),
        }
    return stocks, latest.replace("-", "")


def fetch_all_stocks_latest():
    """Returns (stocks_dict, YYYYMMDD_str) for the most recent trading day.
    來源順序：TWSE 主站 CSV → TWSE OpenAPI → Supabase price_window（雲端備援）。"""
    # Primary: TWSE 主站全市場（2026 起回傳 CSV）
    txt = _get_text("https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=csv")
    if txt and "," in txt:
        stocks, d = _parse_stocks_csv(txt)
        if stocks:
            return stocks, d

    # Fallback 1: TWSE OpenAPI（Vercel 常被擋/逾時，但本機可用）
    rows = _get_json(
        "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        timeout=20,
    )
    if rows and isinstance(rows, list):
        stocks, d = _parse_stocks_openapi(rows)
        if stocks:
            return stocks, d

    # Fallback 2: Supabase price_window（TWSE 全擋時仍可運作）
    return _fetch_stocks_from_price_window()


_monthly_cache: dict = {}   # key: "{code}_{yyyymm}" -> (timestamp, rows)
_CACHE_TTL = 300            # 5 分鐘 TTL，盤中月資料不會變

def fetch_stock_month(code, yyyymm):
    """Monthly OHLCV rows (sorted asc) for a single stock from TWSE.
    結果 cache 5 分鐘；403/empty 時最多 retry 2 次（處理 rate limit）。
    """
    key = f"{code}_{yyyymm}"
    now = time.time()
    if key in _monthly_cache:
        ts, rows = _monthly_cache[key]
        if now - ts < _CACHE_TTL:
            return rows

    url = f"https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date={yyyymm}01&stockNo={code}"
    rows = []
    for attempt in range(3):
        try:
            data = _get_json(url)
            if not data or data.get("stat") != "OK" or not data.get("data"):
                if attempt < 2:
                    time.sleep(0.3 * (attempt + 1))
                    continue
                break
            for row in data["data"]:
                try:
                    rows.append({
                        "date": _parse_roc_date(row[0]),
                        "volume": _pf(row[1]) or 0,
                        "open": _pf(row[3]),
                        "high": _pf(row[4]),
                        "low": _pf(row[5]),
                        "close": _pf(row[6]),
                    })
                except Exception:
                    continue
            rows = sorted(rows, key=lambda x: x["date"])
            break
        except Exception:
            if attempt < 2:
                time.sleep(0.3 * (attempt + 1))

    _monthly_cache[key] = (time.time(), rows)
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# Yahoo Finance historical batch (slow path for historical dates)
# ─────────────────────────────────────────────────────────────────────────────

def _yyyymmdd_to_ts(date_str):
    """'20260605' -> unix timestamp (midnight UTC+8)"""
    dt = datetime.strptime(date_str, "%Y%m%d").replace(
        hour=0, minute=0, second=0,
        tzinfo=timezone(timedelta(hours=8))
    )
    return int(dt.timestamp())


def fetch_yf_chart(code, date_str):
    """
    Fetch full OHLCV for a single stock via Yahoo Finance v8 chart API.
    Returns dict with open/high/low/close/volume/prev_close/prev_high/prev_vols, or None.
    Also returns adj_prev_high/adj_prev_low/adj_high/adj_low using adjclose ratio
    so callers can detect genuine gap-downs excluding ex-dividend price drops.
    """
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW"
           f"?interval=1d&range=3mo")
    try:
        data = _get_json(url, headers=YF_HEADERS, timeout=8)
        result = data.get("chart", {}).get("result") or []
        if not result:
            return None
        r0 = result[0]
        timestamps = r0.get("timestamp") or []
        quotes = (r0.get("indicators", {}).get("quote") or [{}])[0]
        opens   = quotes.get("open")   or []
        highs   = quotes.get("high")   or []
        lows    = quotes.get("low")    or []
        closes  = quotes.get("close")  or []
        volumes = quotes.get("volume") or []
        adjcloses = ((r0.get("indicators", {}).get("adjclose") or [{}])[0]
                     .get("adjclose") or [])
    except Exception:
        return None

    target_idx = None
    for i, ts in enumerate(timestamps):
        dt = datetime.fromtimestamp(ts, tz=timezone(timedelta(hours=8)))
        if dt.strftime("%Y%m%d") == date_str:
            target_idx = i
            break

    def safe(lst, idx):
        try:
            v = lst[idx]
            return float(v) if v is not None else None
        except (IndexError, TypeError, ValueError):
            return None

    def adj_ratio(idx):
        try:
            ac = adjcloses[idx]
            rc = closes[idx]
            if ac and rc:
                return float(ac) / float(rc)
        except (IndexError, TypeError, ValueError):
            pass
        return 1.0

    # 確認 target_idx 是否有有效 OHLC
    target_has_ohlc = (target_idx is not None
                       and safe(opens, target_idx) and safe(closes, target_idx))

    if not target_has_ohlc:
        # 目標日 YF 尚未更新（OHLC 為 None）或不存在
        # 往 target_idx 前（若有 target_idx）或整個列表中找最後一筆 date < target 的有效資料
        search_end = (target_idx - 1) if target_idx is not None else len(timestamps) - 1
        prev_valid_idx = None
        for i in range(search_end, -1, -1):
            if safe(opens, i) and safe(closes, i):
                prev_valid_idx = i
                break
        if prev_valid_idx is None:
            return None
        prev_dt = datetime.fromtimestamp(timestamps[prev_valid_idx], tz=timezone(timedelta(hours=8)))
        target_dt = datetime.strptime(date_str, "%Y%m%d").replace(tzinfo=timezone(timedelta(hours=8)))
        days_gap = (target_dt - prev_dt).days
        if 0 < days_gap <= 7:
            prev_vols = [
                safe(volumes, i)
                for i in range(prev_valid_idx + 1)
                if safe(volumes, i) and safe(volumes, i) > 0
            ]
            ph = safe(highs, prev_valid_idx)
            pl = safe(lows,  prev_valid_idx)
            r  = adj_ratio(prev_valid_idx)
            return {
                "open": None, "high": None, "low": None, "close": None, "volume": 0,
                "prev_close":    safe(closes, prev_valid_idx),
                "prev_high":     ph,
                "prev_low":      pl,
                "adj_prev_high": ph * r if ph else None,
                "adj_prev_low":  pl * r if pl else None,
                "adj_high": None, "adj_low": None,
                "prev_vols":  prev_vols,
                "all_closes": [],
            }
        return None

    o = safe(opens,   target_idx)
    h = safe(highs,   target_idx)
    l = safe(lows,    target_idx)
    c = safe(closes,  target_idx)
    v = safe(volumes, target_idx)

    prev_vols = [
        safe(volumes, i)
        for i in range(target_idx)
        if safe(volumes, i) and safe(volumes, i) > 0
    ]
    all_closes = [
        safe(closes, i) for i in range(target_idx + 1)
        if safe(closes, i) is not None
    ]

    ph = safe(highs, target_idx - 1) if target_idx > 0 else None
    pl = safe(lows,  target_idx - 1) if target_idx > 0 else None
    r_prev = adj_ratio(target_idx - 1) if target_idx > 0 else 1.0
    r_cur  = adj_ratio(target_idx)

    # D_prev_prev (two days back) — needed for earn_gap_down feature
    pp_l = safe(lows,  target_idx - 2) if target_idx > 1 else None
    r_pp = adj_ratio(target_idx - 2)   if target_idx > 1 else 1.0

    return {
        "open": o, "high": h, "low": l, "close": c,
        "volume": int(v) if v else 0,
        "prev_open":        safe(opens,  target_idx - 1) if target_idx > 0 else None,
        "prev_close":       safe(closes, target_idx - 1) if target_idx > 0 else None,
        "prev_high":        ph,
        "prev_low":         pl,
        "adj_prev_high":    ph * r_prev if ph else None,
        "adj_prev_low":     pl * r_prev if pl else None,
        "adj_high":         h  * r_cur  if h  else None,
        "adj_low":          l  * r_cur  if l  else None,
        "prev_prev_low":    pp_l,
        "prev_prev_adj_low": pp_l * r_pp if pp_l else None,
        "prev_vols":  prev_vols,
        "all_closes": all_closes,
    }


def _fetch_exdiv_codes(date_str):
    """Return set of stock codes going ex-dividend/ex-right on date_str (YYYYMMDD).
    Prevents gap-down false positives caused by ex-dividend price adjustment."""
    codes = set()
    # TWSE 除權除息資料
    url = f"https://www.twse.com.tw/rwd/zh/exRight/TWS1B?startDate={date_str}&endDate={date_str}&response=json"
    try:
        data = _get_json(url)
        if data and data.get("stat") == "OK":
            for row in (data.get("data") or []):
                c = str(row[0]).strip()
                if c and c[0].isdigit():
                    codes.add(c)
    except Exception:
        pass
    return codes


# ── price_window（Supabase）取代 YF 逐股歷史（真名/MACD/放量用）──────────────
# 資料由本機每日 upload_price_window.py 上傳(TWSE 官方、不落後),逐股讀 ≤60 列不撞 1000 上限。
# 注意:adj_*(還原)此版暫等於原始價 → 只給「不用還原」的真名/MACD/放量用;跳空仍走 YF。
def fetch_pw_one(code, date_str, s):
    tgt = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    st, rows = _cache_sb("/price_window", "GET", params=[
        ("select", "trade_date,open,high,low,close,volume"),
        ("code", f"eq.{code}"), ("trade_date", f"lte.{tgt}"),
        ("order", "trade_date.asc"), ("limit", "1000")])
    rows = rows or []
    # 目標日不在窗內(今天尚未上傳)→ 用 s(STOCK_DAY_ALL/MI_INDEX 的當日)縫上
    if s and (not rows or rows[-1]["trade_date"] < tgt):
        rows = rows + [{"trade_date": tgt, "open": s.get("open"), "high": s.get("high"),
                        "low": s.get("low"), "close": s.get("close"), "volume": s.get("volume")}]
    if not rows or rows[-1]["trade_date"] != tgt or rows[-1].get("close") is None:
        return None
    n = len(rows)

    def g(i, k):
        return rows[i][k] if 0 <= i < n else None
    ti = n - 1
    o, h, l, c = g(ti, "open"), g(ti, "high"), g(ti, "low"), g(ti, "close")
    v = g(ti, "volume") or 0
    ph, pl = g(ti - 1, "high"), g(ti - 1, "low")
    pp_l = g(ti - 2, "low")
    prev_vols = [r["volume"] for r in rows[:-1] if r.get("volume")]
    all_closes = [r["close"] for r in rows if r.get("close") is not None]
    all_dates = [r["trade_date"] for r in rows if r.get("close") is not None]
    return {
        "open": o, "high": h, "low": l, "close": c, "volume": int(v) if v else 0,
        "prev_open": g(ti - 1, "open"), "prev_close": g(ti - 1, "close"),
        "prev_high": ph, "prev_low": pl,
        "adj_prev_high": ph, "adj_prev_low": pl,   # 還原暫=原始價(真名/MACD/放量不用還原)
        "adj_high": h, "adj_low": l,
        "prev_prev_low": pp_l, "prev_prev_adj_low": pp_l,
        "prev_vols": prev_vols, "all_closes": all_closes, "all_dates": all_dates,
    }


def _parse_mi_index_rows(rows, code_name_map, col_o, col_h, col_l, col_c, col_v, col_sign, col_diff):
    """Parse stock rows from MI_INDEX into a dict. Supports old and new column layouts."""
    stocks = {}
    for row in rows:
        try:
            code = str(row[0]).strip()
            if not code or not code[0].isdigit():
                continue
            o = _pf(row[col_o]); h = _pf(row[col_h])
            l = _pf(row[col_l]); c = _pf(row[col_c])
            v = _pf(row[col_v])
            if not all([o, c, h, l, v]) or c <= 0:
                continue
            prev_close = None
            try:
                sign = str(row[col_sign]).strip()
                diff = _pf(row[col_diff])
                if diff is not None:
                    # 新格式：color:green = 下跌；舊格式：▼ or "-" = 下跌
                    is_down = ("color:green" in sign.lower() or "▼" in sign or sign == "-")
                    prev_close = round(c + diff if is_down else c - diff, 4)
            except Exception:
                pass
            stocks[code] = {
                "code": code,
                "name": code_name_map.get(code, str(row[1]).strip()),
                "open": o, "high": h, "low": l, "close": c,
                "volume": int(v),
                "prev_close": prev_close,
                "prev_high": None, "prev_low": None,
                "prev_vols": [], "all_closes": [],
            }
        except Exception:
            continue
    return stocks


def fetch_all_stocks_mi_index(code_name_map, date_str):
    """Fetch all stocks' OHLCV for a specific date via TWSE MI_INDEX.
    支援舊格式(data9/data8)和新格式(tables陣列)。
    Returns same-format dict as fetch_all_stocks_historical, or {} on failure.
    """
    url = f"https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={date_str}&type=ALLBUT0999"
    try:
        data = _get_json(url)
        if not data:
            return {}
        # 舊格式有 stat 欄位，明確失敗時才 return {}
        # 新格式（2025+ tables 陣列）沒有 stat 欄位，不能用 stat != "OK" 擋掉
        if data.get("stat") and data.get("stat") != "OK":
            return {}
        # TWSE MI_INDEX 有時對特定日期回傳錯誤日期的資料（e.g. 查 06/16 卻給 06/12）
        # 若回傳日期與請求日期不符，放棄此路徑改走 YF historical
        resp_date = str(data.get("date") or "")
        if resp_date and resp_date != date_str:
            return {}

        # ── 新格式：tables 陣列（stat 欄位不存在）──────────────────────────────
        # tables[N] 中找個股交易表（data 筆數最多、含股票代號的那張）
        # 新欄位順序：[0]code [1]name [2]volume [3]txn [4]turnover
        #             [5]open [6]high [7]low [8]close [9]sign_html [10]diff
        if data.get("tables"):
            stock_rows = []
            for t in data.get("tables", []):
                if not isinstance(t, dict):
                    continue
                rows = t.get("data", [])
                # 個股交易表有 1000+ 筆，且第一欄是股票代號（純數字或含字母）
                if len(rows) > 100 and rows and isinstance(rows[0], list) and str(rows[0][0]).strip()[:1].isalnum():
                    stock_rows = rows
                    break
            if stock_rows:
                return _parse_mi_index_rows(
                    stock_rows, code_name_map,
                    col_o=5, col_h=6, col_l=7, col_c=8,
                    col_v=2, col_sign=9, col_diff=10
                )

        # ── 舊格式：data9 / data8 ────────────────────────────────────────────────
        # 舊欄位順序：[0]code [1]name [2]volume [4]open [5]high [6]low [7]close [8]sign [9]diff
        stocks = {}
        for key in ("data9", "data8"):
            rows = data.get(key, [])
            if rows:
                stocks.update(_parse_mi_index_rows(
                    rows, code_name_map,
                    col_o=4, col_h=5, col_l=6, col_c=7,
                    col_v=2, col_sign=8, col_diff=9
                ))
        return stocks
    except Exception:
        return {}


def fetch_all_stocks_historical(code_name_map, date_str):
    """
    Fetch all stocks' OHLCV for a specific historical date via Yahoo Finance v8 chart.
    1365 stocks × 1 request each, 30 workers → ~46 rounds × 0.1s = ~5s total.
    """
    codes = list(code_name_map.keys())

    all_data = {}
    with ThreadPoolExecutor(max_workers=30) as ex:
        futures = {ex.submit(fetch_yf_chart, code, date_str): code for code in codes}
        for f in as_completed(futures):
            code = futures[f]
            result = f.result()
            if result:
                name = code_name_map.get(code, code)
                all_data[code] = {**result, "code": code, "name": name}

    return all_data


# ─────────────────────────────────────────────────────────────────────────────
# MACD helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ema(values, period):
    if len(values) < period:
        return []
    result = [sum(values[:period]) / period]
    k = 2 / (period + 1)
    for v in values[period:]:
        result.append(result[-1] * (1 - k) + v * k)
    return result

def is_macd_golden_cross(closes):
    """True if MACD(12,26,9) crossed above Signal on the last bar."""
    if len(closes) < 35:
        return False
    e12 = _ema(closes, 12)
    e26 = _ema(closes, 26)
    # align: e26 is shorter by 14 positions
    macd = [a - b for a, b in zip(e12[len(e12) - len(e26):], e26)]
    sig = _ema(macd, 9)
    if len(sig) < 2:
        return False
    offset = len(macd) - len(sig)
    return (macd[offset + len(sig) - 2] <= sig[-2] and
            macd[offset + len(sig) - 1] >  sig[-1])


def macd_lines(closes):
    """回傳 (dif, dea, base)：dif/dea 等長，dif[k]/dea[k] 對應 closes[base+k]。
    dif=EMA12−EMA26（快線）、dea=EMA9(dif)（慢線）。不足 35 根 → None。"""
    if len(closes) < 35:
        return None
    e12 = _ema(closes, 12)                       # len = N-11，對應 closes[11:]
    e26 = _ema(closes, 26)                        # len = N-25，對應 closes[25:]
    dif = [a - b for a, b in zip(e12[len(e12) - len(e26):], e26)]  # 對應 closes[25:]
    dea = _ema(dif, 9)                            # 對應 dif[8:] → closes[33:]
    off = len(dif) - len(dea)
    dif = dif[off:]                               # 與 dea 對齊 → 皆對應 closes[33:]
    base = len(closes) - len(dea)                 # =33（含足夠 warmup 時）
    return dif, dea, base


def _macd_group_pass(mode, closes, dates, r_start, r_end):
    """MACD 分組單選判定。mode∈{long1,long2,long3,short1,short2,short3}。
    long1/short1：最後一根黃金/死亡交叉且在 0 軸上/下。
    long2/short2：近 5 根內 DIF 與 DEA 皆由下上穿(多)/由上下穿(空)0 軸。
    long3/short3：日期區間 [r_start,r_end] 內，0軸下黃金交叉/0軸上死亡交叉 ≥2 次。"""
    ml = macd_lines(closes)
    if not ml:
        return False
    dif, dea, base = ml
    n = len(dif)
    if n < 2:
        return False

    def gcross(k):   # k 位黃金交叉（DIF 上穿 DEA）
        return dif[k - 1] <= dea[k - 1] and dif[k] > dea[k]

    def dcross(k):   # k 位死亡交叉（DIF 下穿 DEA）
        return dif[k - 1] >= dea[k - 1] and dif[k] < dea[k]

    if mode == "long1":
        k = n - 1
        return gcross(k) and dif[k] > 0
    if mode == "short1":
        k = n - 1
        return dcross(k) and dif[k] < 0
    if mode in ("long2", "short2"):
        win = range(max(1, n - 5), n)            # 近 5 根
        if mode == "long2":
            dif_up = any(dif[k - 1] <= 0 < dif[k] for k in win)
            dea_up = any(dea[k - 1] <= 0 < dea[k] for k in win)
            return dif_up and dea_up
        dif_dn = any(dif[k - 1] >= 0 > dif[k] for k in win)
        dea_dn = any(dea[k - 1] >= 0 > dea[k] for k in win)
        return dif_dn and dea_dn
    if mode in ("long3", "short3"):
        if not (r_start and r_end and dates and len(dates) >= base + n):
            return False
        # 數區間內柱狀體(DIF−DEA)翻面：綠→紅=黃金交叉、紅→綠=死亡交叉。
        # 暖身需夠長(price_window 已上傳 ~250 根)柱狀體才與 K 圖一致，不會有 0 軸附近的假翻面。
        cnt = 0
        for k in range(1, n):
            d = dates[base + k]
            if d < r_start or d > r_end:
                continue
            if mode == "long3" and gcross(k) and dif[k] < 0:      # 0軸下黃金交叉
                cnt += 1
            elif mode == "short3" and dcross(k) and dif[k] > 0:   # 0軸上死亡交叉
                cnt += 1
        return cnt >= 2
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_tick_size(price):
    if price < 10:   return 0.01
    if price < 50:   return 0.05
    if price < 100:  return 0.1
    if price < 500:  return 0.5
    if price < 1000: return 1.0
    return 5.0

def calc_limit_up(prev_close):
    raw = prev_close * 1.1
    tick = get_tick_size(raw)
    return round(math.floor(raw / tick) * tick, 10)

def _ma(closes, n):
    return sum(closes[-n:]) / n if len(closes) >= n else None


def _prev_month(yyyymm):
    y, m = int(yyyymm[:4]), int(yyyymm[4:])
    m -= 1
    if m == 0: m, y = 12, y - 1
    return f"{y}{m:02d}"


_yf_hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
_yf_host_idx = 0

def _fetch_yf_history(code, months):
    """用 Yahoo Finance 抓個股 N 個月每日 OHLCV（與 K 線圖同資料源，含上市前 OTC 期間）。
    輪流使用 query1/query2 分散請求，降低 rate-limit 風險。
    回傳 sorted list of {open, close, volume}，失敗回傳 []。"""
    global _yf_host_idx
    # YF 支援的 range：1mo/3mo/6mo/1y/2y/5y/10y
    if months <= 1:    range_str = "1mo"
    elif months <= 3:  range_str = "3mo"
    elif months <= 6:  range_str = "6mo"
    elif months <= 12: range_str = "1y"
    elif months <= 24: range_str = "2y"
    elif months <= 60: range_str = "5y"
    else:              range_str = "10y"
    host = _yf_hosts[_yf_host_idx % 2]
    _yf_host_idx += 1
    url = (f"https://{host}/v8/finance/chart/{code}.TW"
           f"?interval=1d&range={range_str}")
    try:
        data = _get_json(url, headers=YF_HEADERS, timeout=8)
        r0 = (data.get("chart", {}).get("result") or [None])[0]
        if not r0:
            return []
        timestamps = r0.get("timestamp") or []
        q = (r0.get("indicators", {}).get("quote") or [{}])[0]
        opens   = q.get("open")   or []
        closes  = q.get("close")  or []
        volumes = q.get("volume") or []
        rows = []
        for i, ts in enumerate(timestamps):
            try:
                o = opens[i];  c = closes[i];  v = volumes[i]
                if o and c and v and float(o) > 0 and float(c) > 0 and int(v) > 0:
                    rows.append({"open": float(o), "close": float(c), "volume": int(v)})
            except (IndexError, TypeError, ValueError):
                continue
        # 裁切到精確月數（約 21 個交易日 / 月），保留最後 N 個月
        target_days = int(months * 21)
        if len(rows) > target_days:
            rows = rows[-target_days:]
        return rows  # 已按時間升序（YF 預設）
    except Exception:
        return []


def _batch_check_no_black(result_items, months, mult, tolerance=0):
    """
    YF 逐支策略：query1/query2 輪流，100 workers 並發。
    Vercel（美國）→ YF CDN（美國）延遲遠低於 Vercel → TWSE（台灣）。
    """
    codes = [item["code"] for item in result_items]
    target_days = int(months * 21)
    min_days = int(target_days * 0.25)
    workers = min(len(codes), 100)

    def _check_one(code):
        rows = _fetch_yf_history(code, months)
        if not rows:
            return code, True, True   # clean（放行）, no_data
        insufficient = len(rows) < min_days
        count = count_vol_black_events(rows, mult)
        return code, count <= tolerance, insufficient

    clean = set()
    no_data = set()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_check_one, c) for c in codes]
        for f in as_completed(futs):
            code, is_clean, is_insufficient = f.result()
            if is_clean:
                clean.add(code)
            if is_insufficient:
                no_data.add(code)

    return clean, no_data


def count_vol_black_events(rows, mult, count_from=0):
    """計算 rows[count_from:] 中放量黑棒的根數。
    count_from 之前的列僅用於 MA 暖身，不計入違規。"""
    if not rows or mult <= 0:
        return 0
    count = 0
    vols = [r["volume"] for r in rows]
    for i, row in enumerate(rows):
        if row["close"] >= row["open"]:
            continue
        prev = [vols[j] for j in range(max(0, i - 10), i) if vols[j] > 0]
        if len(prev) < 5:
            continue
        ma5  = sum(prev[-5:]) / 5
        ma10 = sum(prev) / len(prev) if len(prev) >= 10 else None
        max_ma = max(x for x in [ma5, ma10] if x is not None)
        if row["volume"] >= max_ma * mult and i >= count_from:
            count += 1
    return count


def has_vol_black_event(rows, mult):
    return count_vol_black_events(rows, mult) > 0


# ─────────────────────────────────────────────────────────────────────────────
# Main screener
# ─────────────────────────────────────────────────────────────────────────────

def screen(params):
    requested_date   = params.get("date", "").replace("-", "")  # YYYYMMDD or ""
    min_price        = float(params.get("min_price") or 0)
    red_pct          = float(params.get("red_candle_pct") or 0)
    black_pct        = float(params.get("black_candle_pct") or 0)
    vol_mult         = float(params.get("volume_multiplier") or 0)
    shrink_mult      = float(params.get("shrink_multiplier") or 0)
    check_limit_up   = bool(params.get("limit_up", False))
    check_doji       = bool(params.get("doji", False))
    doji_range_min   = float(params.get("doji_range_min") or 1.0)  # 十字線最小振幅 %
    check_hanging    = bool(params.get("hanging_man", False))  # 吊人線：收=開=高、低<收
    check_engulf_bull = bool(params.get("engulf_bull", False))  # 陽吞噬
    check_engulf_bear = bool(params.get("engulf_bear", False))  # 陰吞噬
    check_harami_bull = bool(params.get("harami_bull", False))  # 多頭母子孕育線
    check_harami_bear = bool(params.get("harami_bear", False))  # 空頭母子孕育線
    check_gap_up     = bool(params.get("gap_up", False))
    check_gap_down   = bool(params.get("gap_down", False))
    gap_down_min     = float(params.get("gap_down_min") or 0)
    gap_up_min       = float(params.get("gap_up_min") or 0)
    # MACD 分組（單選）：long1/long2/long3/short1/short2/short3 或 ""
    macd_mode        = str(params.get("macd_mode") or "").strip()
    macd_start       = (params.get("macd_start") or "").replace("-", "")   # long3/short3 用
    macd_end         = (params.get("macd_end") or "").replace("-", "")
    macd_start_iso   = f"{macd_start[:4]}-{macd_start[4:6]}-{macd_start[6:]}" if len(macd_start) == 8 else ""
    macd_end_iso     = f"{macd_end[:4]}-{macd_end[4:6]}-{macd_end[6:]}" if len(macd_end) == 8 else ""
    is_macd_range    = macd_mode in ("long3", "short3")
    # 區間模式：以「訖日」當快照基準日（撈當日全市場清單，再逐股數區間內交叉）
    if is_macd_range and len(macd_end) == 8:
        requested_date = macd_end
    check_earn_gap_down = bool(params.get("earn_gap_down", False))
    check_zhenming1  = bool(params.get("zhenming1", False))
    check_zhenming2  = bool(params.get("zhenming2", False))
    no_black_months  = min(int(params.get("no_black_months") or 0), 120)
    no_black_years   = no_black_months / 12  # 轉換為年（可為小數）傳給 YF API
    no_black_mult    = float(params.get("no_black_mult") or 0)
    no_black_tol     = max(0, int(params.get("no_black_tolerance") or 0))

    import sys
    _t0 = time.time()
    # ── Step 1: 先抓產業別（快取後幾乎零延遲），再抓 TWSE 股票清單 ──────────
    try:    _industry_map = _get_industry_map()
    except Exception: _industry_map = {}
    latest_stocks, latest_date = fetch_all_stocks_latest()
    print(f"[TIMING] step1_twse: {time.time()-_t0:.2f}s  stocks={len(latest_stocks)}", file=sys.stderr)
    if not latest_stocks:
        return {"error": "無法取得證交所資料，請稍後再試", "results": []}

    # Determine if we need historical path
    use_historical = (requested_date and len(requested_date) == 8
                      and requested_date != latest_date)

    if use_historical:
        # ── Historical path: 先試 TWSE MI_INDEX（快），失敗再走 YF（慢）────────
        code_name_map = {code: s["name"] for code, s in latest_stocks.items()}
        hist_stocks = fetch_all_stocks_mi_index(code_name_map, requested_date)
        used_mi_index = bool(hist_stocks)
        if not hist_stocks:
            hist_stocks = fetch_all_stocks_historical(code_name_map, requested_date)

        if not hist_stocks:
            return {"error": f"{requested_date[:4]}/{requested_date[4:6]}/{requested_date[6:]} 查無資料（可能為非交易日）", "results": []}

        actual_date   = requested_date
        display_date  = f"{actual_date[:4]}/{actual_date[4:6]}/{actual_date[6:]}"
        all_stocks    = hist_stocks
        # MI_INDEX 成功時視同最新路徑，可再抓月資料做量能/跳空篩選
        is_historical = not used_mi_index
    else:
        # ── Latest path: TWSE ────────────────────────────────────────────────
        actual_date   = latest_date
        display_date  = f"{actual_date[:4]}/{actual_date[4:6]}/{actual_date[6:]}" if len(actual_date) == 8 else actual_date
        all_stocks    = latest_stocks
        is_historical = False

    # ── Step 2: Fast price-based filters ─────────────────────────────────────
    candidates = {}
    for code, s in all_stocks.items():
        if not all([s.get("open"), s.get("close"), s.get("high"), s.get("low")]):
            continue
        o, c = s["open"], s["close"]
        if o <= 0 or c <= 0:
            continue

        # 最低股價
        if min_price > 0 and c < min_price:
            continue

        # 長紅棒
        if red_pct > 0:
            if c <= o: continue
            if (c - o) / c * 100 < red_pct: continue

        # 漲停板
        if check_limit_up:
            pc = s.get("prev_close")
            if not pc or pc <= 0: continue
            if c < calc_limit_up(pc) * 0.999: continue

        # 十字線：開盤 = 收盤（零誤差），且當日振幅 ≥ doji_range_min%（排除一字線/冷門股）
        if check_doji:
            if abs(c - o) > 1e-9: continue
            if (s["high"] - s["low"]) / o * 100 < doji_range_min: continue

        # 吊人線：收盤=開盤=最高（無上影），且最低<收盤（有下影）
        if check_hanging:
            if abs(c - o) > 1e-9 or abs(s["high"] - c) > 1e-9: continue
            if s["low"] >= c: continue

        # 吞噬/母子（快篩部分）：多頭形態當日必須紅K；空頭形態當日必須黑K
        # （與前一日的包覆判斷需要前日 OHLC，在 Step 4 進行）
        if (check_engulf_bull or check_harami_bull) and not (check_engulf_bear or check_harami_bear) and c <= o:
            continue
        if (check_engulf_bear or check_harami_bear) and not (check_engulf_bull or check_harami_bull) and c >= o:
            continue

        candidates[code] = s

    if not candidates:
        return {"date": display_date, "total": len(all_stocks), "count": 0, "results": []}

    # ── Step 3a: 跳空篩選 → 只試「前一個非週末日曆日」MI_INDEX（天條：跳空只跟前一交易日比）
    prev_mi_gap: dict = {}
    prev_dt_for_gap: str = ""
    exdiv_codes: set = set()
    if (check_gap_up or check_gap_down):
        exdiv_codes = _fetch_exdiv_codes(actual_date)
    need_engulf = (check_engulf_bull or check_engulf_bear
                   or check_harami_bull or check_harami_bear)  # 需要前一日 OHLC 的形態
    if (check_gap_up or check_gap_down or check_earn_gap_down or need_engulf) and not is_historical:
        # 只找「前一個非週末日曆日」——不因 MI_INDEX 失敗而往前多抓
        # 假日（非週末）由 YF per-stock fallback 處理，不在這裡跳過
        expected_prev_dt = None
        for delta in range(1, 8):
            prev_dt_obj = datetime.strptime(actual_date, "%Y%m%d") - timedelta(days=delta)
            if prev_dt_obj.weekday() < 5:   # 第一個非週六日的日曆日
                expected_prev_dt = prev_dt_obj.strftime("%Y%m%d")
                break
        if expected_prev_dt:
            tmp = fetch_all_stocks_mi_index({}, expected_prev_dt)
            if tmp:
                prev_mi_gap = tmp
                prev_dt_for_gap = expected_prev_dt
            # MI_INDEX 失敗（rate limit / 假日）→ prev_mi_gap 維持 {}
            # 每支股票將 fallback 到 monthly_yf 的 per-stock prev_low（YF 自動定位前一交易日）

    # ── Step 3b: 量能/MACD/真名/跳空 → 用 YF 逐支抓
    # 跳空有啟用時一定要抓 YF（不管 prev_mi_gap 是否成功），確保 per-stock fallback 有資料
    need_gap_monthly = (check_gap_up or check_gap_down or check_earn_gap_down or need_engulf)
    # 只有「跳空族」(需高低價+還原)還走 YF;真名/MACD/放量改讀 price_window(下方 pw_data)
    need_monthly = need_gap_monthly and not is_historical

    monthly_yf = {}
    if need_monthly:
        def fetch_yf_only(code):
            return code, fetch_yf_chart(code, actual_date)

        with ThreadPoolExecutor(max_workers=min(len(candidates), 50)) as ex:
            futures = [ex.submit(fetch_yf_only, c) for c in candidates]
            for f in as_completed(futures):
                code, yf = f.result()
                if yf:
                    monthly_yf[code] = yf

    # ── price_window 逐股讀（真名/MACD/放量;涵蓋歷史日 → 修正「回搜近期日期漏股」如 3443/8-11）──
    need_pw = (vol_mult > 0 or shrink_mult > 0 or bool(macd_mode)
               or check_zhenming1 or check_zhenming2)
    pw_data = {}
    if need_pw:
        def fetch_pw_only(code):
            return code, fetch_pw_one(code, actual_date, candidates.get(code))

        with ThreadPoolExecutor(max_workers=min(len(candidates), 50)) as ex:
            pfuts = [ex.submit(fetch_pw_only, c) for c in candidates]
            for f in as_completed(pfuts):
                code, pw = f.result()
                if pw:
                    pw_data[code] = pw

    # ── Step 3c: 補抓 prev_mi_gap 未涵蓋的個股 → TWSE STOCK_DAY（不依賴 YF）──
    if (check_gap_up or check_gap_down or need_engulf) and prev_mi_gap and not is_historical:
        missing = [c for c in candidates if c not in prev_mi_gap and c not in monthly_yf]
        if missing and prev_dt_for_gap:
            yyyymm = prev_dt_for_gap[:6]

            def fetch_twse_prev(code):
                rows = fetch_stock_month(code, yyyymm)
                for row in reversed(rows):
                    if row["date"] == prev_dt_for_gap:
                        return code, {"prev_high": row["high"], "prev_low": row["low"],
                                      "prev_close": row["close"], "prev_open": row["open"]}
                return code, None

            with ThreadPoolExecutor(max_workers=30) as ex:
                futs = [ex.submit(fetch_twse_prev, c) for c in missing]
                for f in as_completed(futs):
                    code, twse_prev = f.result()
                    if twse_prev:
                        monthly_yf[code] = twse_prev

    # ── Step 4: Apply gap_up and volume MA filters ────────────────────────────
    _gap_unverified: set = set()  # 前一日資料缺失、放行但標記需手動排查
    results = []
    for code, s in candidates.items():
        o, c, h, l, v = s["open"], s["close"], s["high"], s["low"], s["volume"]

        # prev_high/prev_low/prev_vols: historical path from YF in all_stocks,
        # non-historical path from monthly_yf (also YF, fetched above with 30 workers)
        if is_historical:
            prev_high  = s.get("prev_high")
            prev_low   = s.get("prev_low")
            prev_close_gap = s.get("prev_close")
            prev_open_gap  = s.get("prev_open")
            prev_vols  = (pw_data.get(code) or {}).get("prev_vols") or s.get("prev_vols", [])
            # Historical path always uses YF adj prices to exclude ex-div false gaps
            _eff_h         = s.get("adj_high")  or h
            _eff_l         = s.get("adj_low")   or l
            _eff_prev_high = s.get("adj_prev_high") or prev_high
            _eff_prev_low  = s.get("adj_prev_low")  or prev_low
        else:
            yf_data = monthly_yf.get(code) or {}
            if code in prev_mi_gap:
                prev_high = prev_mi_gap[code].get("high")
                prev_low  = prev_mi_gap[code].get("low")
                prev_close_gap = prev_mi_gap[code].get("close") or yf_data.get("prev_close")
                prev_open_gap  = prev_mi_gap[code].get("open")  or yf_data.get("prev_open")
            else:
                prev_high = yf_data.get("prev_high")
                prev_low  = yf_data.get("prev_low")
                prev_close_gap = yf_data.get("prev_close")
                prev_open_gap  = yf_data.get("prev_open")
            prev_vols = (pw_data.get(code) or {}).get("prev_vols") or yf_data.get("prev_vols", [])
            # For ex-div stocks: fetch YF adjusted prices to verify genuine gap
            if (check_gap_up or check_gap_down) and code in exdiv_codes:
                _yf_adj = fetch_yf_chart(code, actual_date)
                _eff_h         = (_yf_adj or {}).get("adj_high")  or h
                _eff_l         = (_yf_adj or {}).get("adj_low")   or l
                _eff_prev_high = (_yf_adj or {}).get("adj_prev_high") or prev_high
                _eff_prev_low  = (_yf_adj or {}).get("adj_prev_low")  or prev_low
            else:
                _eff_h, _eff_l, _eff_prev_high, _eff_prev_low = h, l, prev_high, prev_low

        # 跳空向上（2026-07 定義）：今日開盤 > 昨日實體上緣
        # 昨紅K（收>開）比昨收、昨黑K（收<開）比昨開 → 即 max(昨開, 昨收)
        if check_gap_up:
            _body_vals = [v for v in (prev_open_gap, prev_close_gap) if v is not None]
            if not _body_vals:
                # 前一日資料缺失，無法確認 → 放行並標記
                _gap_unverified.add(code)
            else:
                _body_top = max(_body_vals)
                if round(o, 4) <= round(_body_top, 4):
                    continue
                if gap_up_min > 0 and round(o - _body_top, 4) < round(gap_up_min, 4):
                    continue

        # 跳空向下：今日最高 < 前日最低（用還原日K價格排除除息假跳空）
        if check_gap_down:
            if _eff_prev_low is None:
                # 前一日資料缺失，無法確認跳空 → 放行並標記
                _gap_unverified.add(code)
            else:
                if round(_eff_h, 4) >= round(_eff_prev_low, 4):
                    continue
                if gap_down_min > 0 and round(_eff_prev_low - _eff_h, 4) < round(gap_down_min, 4):
                    continue

        # 陽吞噬/陰吞噬：當日K棒「實體」完整吃掉前一日整根K棒（含影線）
        # 陽吞：今紅K + 昨黑K + 今收≥昨高 + 今開≤昨低
        # 陰吞：今黑K + 昨紅K + 今開≥昨高 + 今收≤昨低
        if check_engulf_bull or check_engulf_bear:
            if any(v is None for v in (prev_open_gap, prev_close_gap, prev_high, prev_low)):
                _gap_unverified.add(code)  # 前一日資料缺失 → 放行並標記
            else:
                _bull_ok = (check_engulf_bull and c > o
                            and prev_close_gap < prev_open_gap
                            and round(c, 4) >= round(prev_high, 4)
                            and round(o, 4) <= round(prev_low, 4))
                _bear_ok = (check_engulf_bear and c < o
                            and prev_close_gap > prev_open_gap
                            and round(o, 4) >= round(prev_high, 4)
                            and round(c, 4) <= round(prev_low, 4))
                if not (_bull_ok or _bear_ok):
                    continue

        # 母子孕育線：當日K棒「實體」藏在前一日反向K棒「實體」內（當日影線不考慮）
        # 多頭：昨黑K + 今紅K，今開≥昨收 且 今收≤昨開
        # 空頭：昨紅K + 今黑K，今收≥昨開 且 今開≤昨收
        if check_harami_bull or check_harami_bear:
            if prev_open_gap is None or prev_close_gap is None:
                _gap_unverified.add(code)  # 前一日資料缺失 → 放行並標記
            else:
                _hbull_ok = (check_harami_bull and c > o
                             and prev_close_gap < prev_open_gap
                             and round(o, 4) >= round(prev_close_gap, 4)
                             and round(c, 4) <= round(prev_open_gap, 4))
                _hbear_ok = (check_harami_bear and c < o
                             and prev_close_gap > prev_open_gap
                             and round(c, 4) >= round(prev_open_gap, 4)
                             and round(o, 4) <= round(prev_close_gap, 4))
                if not (_hbull_ok or _hbear_ok):
                    continue

        # 賺向下跳空價差（選定日期D，篩選D_prev跳空向下 + D當天突破 + 跳空≥1 + D_prev縮量）
        if check_earn_gap_down:
            yf_ref = s if is_historical else (monthly_yf.get(code) or {})
            prev_o       = yf_ref.get("prev_open")
            prev_c       = yf_ref.get("prev_close")
            eff_prev_h   = yf_ref.get("adj_prev_high") or yf_ref.get("prev_high")
            eff_pp_l     = yf_ref.get("prev_prev_adj_low") or yf_ref.get("prev_prev_low")
            pvols        = yf_ref.get("prev_vols") or []

            if not all([prev_o, prev_c, eff_prev_h, eff_pp_l, h]):
                continue
            # 條件1: D_prev向下跳空（D_prev最高 < D_prev_prev最低）
            if eff_prev_h >= eff_pp_l:
                continue
            # 條件3: 跳空價差 ≥ 1元
            if eff_pp_l - eff_prev_h < 1.0:
                continue
            # 條件2: D最高 > 回補目標（紅K→收盤價，黑K→開盤價）
            recovery = prev_c if prev_c > prev_o else prev_o
            if h <= recovery:
                continue
            # 條件4: D_prev縮量（量 < 1.2 × MAX(MA5, MA10)，含當日，與券商顯示邏輯一致）
            # D_prev 量優先用 MI_INDEX（TWSE 官方張數），其次 YF
            if len(pvols) < 5:
                continue
            mi_prev_vol = prev_mi_gap.get(code, {}).get("volume") if not is_historical else None
            prev_vol  = mi_prev_vol if mi_prev_vol else pvols[-1]
            # MA 窗口替換最後一筆為準確值
            window = list(pvols[-10:]) if len(pvols) >= 10 else list(pvols[-5:])
            if mi_prev_vol:
                window[-1] = mi_prev_vol
            ma5  = sum(window[-5:]) / 5
            ma10 = sum(window) / len(window)
            ref_vol = max(ma5, ma10)
            if prev_vol >= 1.2 * ref_vol:
                continue

        # MACD 分組（單選）
        if macd_mode:
            _pw = pw_data.get(code) or {}
            closes_for_macd = (_pw.get("all_closes")
                               or (s.get("all_closes") if is_historical
                                   else (monthly_yf.get(code) or {}).get("all_closes")) or [])
            dates_for_macd = _pw.get("all_dates") or []
            if not _macd_group_pass(macd_mode, closes_for_macd, dates_for_macd,
                                    macd_start_iso, macd_end_iso):
                continue

        # 長黑棒幅度
        if black_pct > 0:
            if c <= 0 or (o - c) / c * 100 < black_pct:
                continue

        # 放量 / 縮量（共用 MA 計算）
        ma5 = ma10 = vol_ratio = None
        if vol_mult > 0 or shrink_mult > 0:
            if len(prev_vols) >= 5:
                ma5 = sum(prev_vols[-5:]) / 5
            if len(prev_vols) >= 10:
                ma10 = sum(prev_vols[-10:]) / 10

            if ma5 is None and ma10 is None:
                continue

            max_ma = max(x for x in [ma5, ma10] if x is not None)
            vol_ratio = v / max_ma if max_ma > 0 else 0

            if vol_mult > 0 and v < max_ma * vol_mult:
                continue
            if shrink_mult > 0 and v > max_ma * shrink_mult:
                continue

        # 真名一式 / 真名二式
        if check_zhenming1 or check_zhenming2:
            # 長紅棒 3%（兩者共用）
            if c <= o or (c - o) / c * 100 < 3:
                continue
            # 放量 1.5x（兩者共用）
            zm_ma5v  = sum(prev_vols[-5:])  / 5  if len(prev_vols) >= 5  else None
            zm_ma10v = sum(prev_vols[-10:]) / 10 if len(prev_vols) >= 10 else None
            zm_max_ma = max(x for x in [zm_ma5v, zm_ma10v] if x is not None) if any(x is not None for x in [zm_ma5v, zm_ma10v]) else None
            if not zm_max_ma or v < zm_max_ma * 1.5:
                continue
            # 計算收盤均線：優先用 price_window(TWSE、不落後),否則退回舊來源
            all_cls = ((pw_data.get(code) or {}).get("all_closes")
                       or (s.get("all_closes") if is_historical
                           else (monthly_yf.get(code) or {}).get("all_closes")) or [])
            prev_cls = all_cls[:-1]

            t_ma5  = _ma(all_cls, 5)
            t_ma10 = _ma(all_cls, 10)
            t_ma20 = _ma(all_cls, 20)

            if check_zhenming1:
                # 收盤站上 MA5 > MA10 > MA20 且三線順序排列
                if not all([t_ma5, t_ma10, t_ma20]):
                    continue
                if not (c > t_ma5 > t_ma10 > t_ma20):
                    continue

            if check_zhenming2:
                # 任一「較短均線當日新上穿較長均線」即可（5/10/20/60 全部配對）：
                # 昨日 短≤長、今日 短>長。某均線資料不足(如未滿 60 日)則略過含它的配對。
                periods = [5, 10, 20, 60, 120, 240]
                t_ma = {p: _ma(all_cls, p)  for p in periods}
                y_ma = {p: _ma(prev_cls, p) for p in periods}
                crossed = False
                for a in range(len(periods)):
                    for b in range(a + 1, len(periods)):
                        sp, lp = periods[a], periods[b]        # sp 短 < lp 長
                        if None in (t_ma[sp], t_ma[lp], y_ma[sp], y_ma[lp]):
                            continue
                        if t_ma[sp] > t_ma[lp] and y_ma[sp] <= y_ma[lp]:
                            crossed = True
                            break
                    if crossed:
                        break
                if not crossed:
                    continue

        pc = s.get("prev_close")
        change_pct = round((c - pc) / pc * 100, 2) if pc and pc > 0 else None

        item = {
            "code": code,
            "name": s["name"],
            "industry": _industry_map.get(code, ""),
            "open": round(o, 2), "high": round(h, 2),
            "low": round(l, 2),  "close": round(c, 2),
            "volume_lots": round(v / 1000, 1),
            "candle_pct": round((c - o) / c * 100, 2),  # 紅棒=(收-開)/收, 黑棒=(開-收)/收取負值
            "change_pct": change_pct,
        }
        if ma5  is not None: item["ma5_vol"]  = round(ma5  / 1000, 0)
        if ma10 is not None: item["ma10_vol"] = round(ma10 / 1000, 0)
        if vol_ratio is not None: item["vol_ratio"] = round(vol_ratio, 2)
        if code in _gap_unverified:
            item.setdefault("data_missing", []).append("gap_unverified")

        results.append(item)

    # ── Step 5: 無放量黑棒篩選（Yahoo Finance 每日 OHLCV，與 K 線同源）─────────
    print(f"[TIMING] before_step5: {time.time()-_t0:.2f}s  candidates_for_noBlack={len(results)}", file=sys.stderr)
    if no_black_months > 0 and no_black_mult > 0 and results:
        _t5 = time.time()
        clean, no_data = _batch_check_no_black(results, no_black_months, no_black_mult, no_black_tol)
        print(f"[TIMING] step5_noBlack: {time.time()-_t5:.2f}s  total={time.time()-_t0:.2f}s", file=sys.stderr)
        results = [item for item in results if item["code"] in clean]
        for item in results:
            if item["code"] in no_data:
                item.setdefault("data_missing", []).append("no_black")

    results.sort(key=lambda x: abs(x.get("candle_pct", 0)), reverse=True)  # 紅棒/黑棒都以幅度大小排序

    return {
        "date": display_date,
        "total": len(all_stocks),
        "count": len(results),
        "results": results,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Vercel handler
# ─────────────────────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def _send_json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        # 領取非同步篩選結果：?job_id=xxx → 有結果回結果，沒好回 {pending:true}
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        job_id = (qs.get("job_id") or [""])[0].strip()
        if job_id:
            cached = _cache_get(job_id)
            if cached is not None:
                return self._send_json(200, cached)
            return self._send_json(200, {"pending": True})
        self._send_json(200, {"status": "ok"})

    def do_POST(self):
        import traceback
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            job_id = body.pop("job_id", None)
            result = screen(body)
            # 先存暫存（即使前端因切背景斷線，結果也已保留可供領取），再回傳
            if job_id:
                try: _cache_save(job_id, result)
                except Exception: pass
            self._send_json(200, result)
        except Exception as e:
            self._send_json(500, {"error": str(e), "traceback": traceback.format_exc(), "results": []})
