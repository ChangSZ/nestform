
/* ======================= 多语言（中文 / English，默认中文） ======================= */
export const LANG_KEY = 'nestform-lang';
export const LANGS = ['zh', 'zht', 'en'];             // 简体 / 繁體（台湾用字）/ English
export let LANG = (() => { try { const l = localStorage.getItem(LANG_KEY); return LANGS.includes(l) ? l : 'zh'; } catch(e) { return 'zh'; } })();
// 简 → 繁：先按词替换一字多义的字，再逐字查表（表由 OpenCC s2tw 按本页用到的字生成）
export const S2T_PHRASES = [['布置','佈置'],['布局','佈局'],['台面','檯面'],['复制','複製']];
export const S2T = new Map(('错錯与與两兩个個为為书書于於仅僅从從价價会會传傳体體余餘侧側倾傾储儲儿兒关關内內写寫净淨准準击擊则則刚剛删刪制製办辦动動势勢区區单單占佔卧臥卫衛厅廳历歷压壓厨廚双雙发發变變叶葉后後吗嗎听聽启啟哑啞围圍图圖圆圓场場坐座块塊垫墊墙牆处處备備复復头頭妆妝婴嬰实實宽寬对對导導层層屉屜属屬岛島带帶干乾并並库庫应應开開当當径徑态態总總悬懸懒懶户戶护護拟擬择擇挂掛挡擋挤擠损損换換据據摆擺摇搖撑撐数數无無时時显顯暂暫机機杂雜杆桿条條来來松鬆构構柜櫃标標栈棧栏欄样樣梁樑棱稜椭橢横橫橱櫥气氣没沒注註浅淺测測浏瀏游遊滚滾满滿灯燈灵靈点點热熱状狀独獨环環现現电電画畫监監盖蓋盘盤砖磚确確离離积積称稱竖豎筑築签籤类類约約级級线線结結绕繞绘繪给給统統继繼绿綠缀綴编編缝縫缩縮网網联聯脚腳获獲虚虛装裝见見视視览覽触觸计計认認让讓议議记記设設识識译譯该該语語请請读讀调調负負败敗质質贴貼赶趕转轉轮輪软軟轴軸轻輕载載较較辅輔辑輯边邊过過这這进進远遠适適选選邻鄰里裡针針钢鋼钮鈕铰鉸铺鋪销銷锁鎖键鍵镜鏡长長门門闭閉闲閒间間阅閱阳陽阴陰阶階随隨隐隱静靜页頁顶頂项項顺順颜顏飘飄飞飛马馬鸟鳥齐齊龙龍义義众眾优優划劃别別参參叠疊号號国國壳殼检檢湾灣爱愛码碼种種笔筆简簡纹紋细細绝絕缘緣胀脹范範词詞试試话話误誤贝貝赖賴输輸采採链鏈问問阈閾际際预預题題黄黃').match(/../gu).map(p => [...p]));
export const s2t = s => S2T_PHRASES.reduce((a, [f, t]) => a.replaceAll(f, t), s).replace(/[\u3400-\u9fff]/g, c => S2T.get(c) || c);
export const tr = (zh, en) => LANG === 'en' ? en : LANG === 'zht' ? s2t(zh) : zh;
// 内置的房间 / 材料 / 家具名称存的是中文；英文界面下显示译名，用户自己改过的名称原样显示
export const NAMES_EN = {
  '主卧室':'Master Bedroom', '主卫浴':'Master Bath', '儿童房':"Kids' Room", '客卫浴':'Guest Bath', '洗衣阳台':'Laundry Balcony',
  '老人房':"Elders' Room", '厨房':'Kitchen', '餐厅':'Dining', '过道':'Hallway', '玄关':'Foyer', '客餐厅':'Living & Dining', '客厅':'Living Room', '休闲阳台':'Leisure Balcony',
  '主卧飘窗':'Master Bay Window', '老人房飘窗':"Elders' Bay Window",
  '橡木地板':'Oak Flooring', '胡桃木地板':'Walnut Flooring', '800 地砖':'800 Tile', '600 地砖':'600 Tile', '大理石':'Marble',
  '300 防滑砖':'300 Anti-slip Tile', '水磨石':'Terrazzo', '满铺地毯':'Wall-to-wall Carpet',
  '卧室':'Bedroom', '餐厨':'Dining & Kitchen', '卫浴':'Bathroom', '家电':'Appliances', '书房 · 休闲':'Study & Leisure',
  '双人床 1.8m':'Double Bed 1.8m', '双人床 1.5m':'Double Bed 1.5m', '双人床':'Double Bed', '单人床':'Single Bed', '婴儿床':'Crib',
  '儿童床':"Kids' Beds", '上下铺（直梯）':'Bunk Bed (Ladder)', '梯柜高低床':'Bunk Bed with Stair Drawers', '子母床（拖床）':'Bed with Trundle', '错层 L 型高低床':'L-shaped Bunk Bed', '高架床（下方书桌）':'Loft Bed with Desk', '滑梯城堡床':'Castle Bed with Slide',
  '床头柜':'Nightstand', '衣柜':'Wardrobe', '小衣柜':'Small Wardrobe', '梳妆台':'Dresser', '书桌':'Desk', '椅子':'Chair',
  '书架':'Bookshelf', '飘窗垫':'Bay Cushion', '三人沙发':'3-Seat Sofa', '双人沙发':'Loveseat', '转角沙发':'Corner Sofa',
  '单人沙发':'Armchair', '懒人沙发':'Beanbag', '茶几':'Coffee Table', '边几':'Side Table', '电视柜':'TV Stand', '地毯':'Rug',
  '鞋柜':'Shoe Cabinet', '玄关柜':'Entry Cabinet', '落地灯':'Floor Lamp', '绿植':'Plant', '大绿植':'Large Plant',
  '餐桌':'Dining Table', '六人餐桌':'6-Seat Dining Table', '圆桌':'Round Table', '餐椅':'Dining Chair', '岛台':'Kitchen Island',
  '吧椅':'Bar Stool', '橱柜台面':'Kitchen Counter', '燃气灶':'Gas Stove', '水槽':'Sink', '冰箱':'Fridge', '餐边柜':'Sideboard',
  '马桶':'Toilet', '浴室柜':'Vanity', '双盆浴室柜':'Double Vanity', '淋浴房':'Shower', '淋浴区':'Shower Area', '浴缸':'Bathtub',
  '洗衣机':'Washer', '洗衣池':'Laundry Sink', '电热水器':'Water Heater', '储物柜':'Storage Cabinet', '65 寸电视':'65" TV',
  '洗衣 · 烘干':'Laundry', '滚筒洗衣机':'Front-load Washer', '波轮洗衣机':'Top-load Washer', '洗烘一体机':'Washer-Dryer Combo',
  '三筒分区洗衣机':'Triple-drum Washer', '双子分区洗衣机':'Twin-drum Washer', '洗烘叠放套装':'Stacked Washer & Dryer',
  '双门冰箱':'Top-freezer Fridge', '双开门冰箱（对开）':'Side-by-side Fridge', '法式双开门冰箱':'French-door Fridge', '十字四门冰箱':'4-door Cross Fridge', '单门小冰箱':'Mini Fridge', '定制柜':'Custom Cabinets', '电视墙柜':'TV Wall Unit', '洗衣机嵌入柜':'Built-in Laundry Cabinet', '阳台洗衣柜（带水槽）':'Laundry Cabinet with Sink', '顶天衣柜':'Floor-to-ceiling Wardrobe', '玄关柜（中空）':'Entry Cabinet with Niche', '书柜墙':'Bookcase Wall', '玻璃展示柜':'Glass Display Cabinet', '吊柜':'Wall Cabinet', '单门冰箱':'Single-door Fridge', '卧式冰柜':'Chest Freezer', '酒柜':'Wine Cabinet',
  '灰橡木地板':'Grey Oak Flooring', '竹地板':'Bamboo Flooring', '鱼骨拼地板':'Chevron Parquet', '岩板 900×1800':'Sintered Slab 900×1800',
  '黑白棋盘格':'Checkerboard Tile', '复古花砖':'Encaustic Tile', '微水泥':'Microcement',
  '白色乳胶漆':'White Paint', '暖白乳胶漆':'Warm White Paint', '高级灰':'Greige Paint', '雾霾蓝':'Haze Blue Paint', '鼠尾草绿':'Sage Green Paint', '奶咖色':'Latte Paint',
  '条纹墙纸':'Striped Wallpaper', '碎花墙纸':'Floral Wallpaper', '几何墙纸':'Geometric Wallpaper', '大马士革墙纸':'Damask Wallpaper', '植物叶子墙纸':'Botanical Wallpaper', '格纹墙纸':'Plaid Wallpaper', '星空儿童墙纸':'Starry Kids Wallpaper', '肌理墙布':'Textured Wall Fabric', '木饰面':'Wood Paneling', '300×600 墙砖':'300×600 Wall Tile', '大理石墙砖':'Marble Wall Tile', '文化砖':'Brick Veneer',
  '地面材料':'Flooring', '墙面材料':'Wall Finish',
  '55 寸电视':'55" TV', '对开门冰箱':'Side-by-side Fridge', '柜机空调':'Floor AC', '挂机空调':'Wall AC', '洗碗机':'Dishwasher',
  '蒸烤箱高柜':'Oven Tower', '烘干机':'Dryer', '空气净化器':'Air Purifier', '长书桌':'Long Desk', '办公椅':'Office Chair',
  '大书架':'Large Bookshelf', '立式钢琴':'Upright Piano', '跑步机':'Treadmill', '阅读椅':'Reading Chair', '茶桌':'Tea Table', '休闲椅':'Lounge Chair',
};
export const nm = s => LANG === 'en' ? (NAMES_EN[s] ?? s) : LANG === 'zht' ? s2t(s) : s;
// 静态文案：元素上写 data-en / data-en-title，中文原文首次切换时存进 dataset
export function applyStaticLang(){
  document.documentElement.lang = {zh:'zh-CN', zht:'zh-TW', en:'en'}[LANG];
  document.title = tr('栖构 Nestform · 户型设计', 'Nestform · Floor Plan Designer');
  document.querySelectorAll('[data-en]').forEach(el => { el.dataset.zh ??= el.textContent; el.textContent = tr(el.dataset.zh, el.dataset.en); });
  document.querySelectorAll('[data-en-ph]').forEach(el => { el.dataset.zhPh ??= el.placeholder; el.placeholder = tr(el.dataset.zhPh, el.dataset.enPh); });
  document.querySelectorAll('[data-en-title]').forEach(el => { el.dataset.zhTitle ??= el.title; el.title = tr(el.dataset.zhTitle, el.dataset.enTitle); });
  const lb = document.querySelector('#langBtn'); if (lb) lb.textContent = {zh:'简', zht:'繁', en:'EN'}[LANG];
  document.querySelectorAll('#langSel [data-lang]').forEach(b => { const on = b.dataset.lang === LANG; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
}

export function setLangVar(l){ LANG = l; }

