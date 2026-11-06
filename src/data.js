
/* ============================================================
 *  默认户型（单位 mm，原点 = 左上角外墙内皮；x 向右、y 向下，上北下南）
 *  约 100 m²：三室 + 客餐厅 + 两卫 + 玄关 + 洗衣阳台 + 南向休闲阳台
 *  横向：3300 | 120 | 1980 | 120 | 3960 | 120 | 2400 = 12000
 *  纵向：3600 | 120 | 1200 | 120 | 3480 | 120 | 1260 = 9900（西侧）
 * ============================================================ */
const XW = 240;                                                     // 外墙厚
/** 一段墙去掉洞口后的若干矩形；horiz: 沿 x 方向；[c0, c1] 墙厚方向坐标；holes: 沿墙方向的 [a, b] 洞口 */
function run(horiz, c0, c1, a0, a1, type, holes = []){
  const out = []; let a = a0;
  for (const [h0, h1] of [...holes].sort((p, q) => p[0] - q[0])){ if (h0 > a) out.push([a, h0]); a = h1; }
  if (a1 > a) out.push([a, a1]);
  return out.map(([u, v]) => horiz ? [u, c0, v, c1, type] : [c0, u, c1, v, type]);
}
// 洞口（沿墙方向的区间）
const H = {
  top:[[900, 2400], [4000, 4800], [6600, 8600], [10400, 11400]],    // 儿童房 / 客卫 / 主卧 / 主卫 北窗
  bottom:[[600, 2700], [3800, 11600]],                              // 洗衣阳台 / 休闲阳台 南窗
  left:[[3900, 4800], [5800, 7800]],                                // 入户门 / 老人房西窗
  right:[[4300, 6000], [6900, 8300], [8800, 9700]],                 // 厨房 / 客餐厅 / 阳台 东窗
};
// 墙体：[x0,y0,x1,y1,类型]  b=承重 e=外墙 n=可拆非承重 low=矮墙
export const WALLS = [
  // 外墙
  ...run(true, -XW, 0, -XW, 12000 + XW, 'e', H.top),
  ...run(true, 9900, 9900 + XW, -XW, 12000 + XW, 'e', H.bottom),
  ...run(false, -XW, 0, 0, 9900, 'e', H.left),
  ...run(false, 12000, 12000 + XW, 0, 9900, 'e', H.right),
  // 北侧：儿童房 | 客卫 | 主卧 | 主卫
  [3300, 0, 3420, 3600, 'b'],
  ...run(true, 2400, 2520, 3420, 5400, 'n', [[3900, 4700]]),         // 客卫门
  ...run(false, 5400, 5520, 0, 3720, 'b', [[2640, 3480]]),           // 主卧门
  [9480, 0, 9600, 2400, 'n'],
  ...run(true, 2400, 2520, 9480, 12000, 'n', [[10300, 11100]]),      // 主卫门（主卧衣帽区进）
  ...run(true, 3600, 3720, 0, 3420, 'n', [[2300, 3100]]),            // 儿童房门
  ...run(true, 3600, 3720, 3420, 5400, 'n', [[3700, 5100]]),         // 过道 → 客餐厅 门洞
  [5520, 3600, 12000, 3720, 'n'],
  // 西侧：玄关 / 老人房 / 洗衣阳台
  ...run(false, 3300, 3420, 3720, 4920, 'n', [[3900, 4800]]),        // 玄关 → 客餐厅 门洞
  ...run(true, 4920, 5040, 0, 3420, 'n', [[2300, 3100]]),            // 老人房门
  [3300, 5040, 3420, 8640, 'b'],
  ...run(true, 8520, 8640, 0, 3300, 'n', [[700, 2600]]),             // 洗衣阳台推拉门
  [3300, 8640, 3420, 9900, 'b'],
  // 东侧：厨房 / 阳台
  ...run(false, 9480, 9600, 3720, 6720, 'n', [[4500, 6400]]),        // 厨房推拉门
  [9600, 6600, 12000, 6720, 'n'],
  ...run(true, 8520, 8640, 3420, 12000, 'n', [[4200, 8400]]),        // 阳台推拉门
];
// 窗：[x0,y0,x1,y1, 窗台高 m]
const win = (horiz, c0, c1, [a, b], sill) => horiz ? [a, c0, b, c1, sill] : [c0, a, c1, b, sill];
export const WINS = [
  win(true, -XW, 0, H.top[0], .9), win(true, -XW, 0, H.top[1], 1.4), win(true, -XW, 0, H.top[2], .9), win(true, -XW, 0, H.top[3], 1.4),
  win(true, 9900, 9900 + XW, H.bottom[0], .9), win(true, 9900, 9900 + XW, H.bottom[1], .5),
  win(false, -XW, 0, H.left[1], .9),
  win(false, 12000, 12000 + XW, H.right[0], 1.0), win(false, 12000, 12000 + XW, H.right[1], .9), win(false, 12000, 12000 + XW, H.right[2], .5),
];
// 平开门：洞口、铰点、关闭方向、开启方向、门宽（门洞 style:'arch'）
export const DOORS = [
  {name:'入户门', rect:[-XW, 3900, 0, 4800], h:[0, 3900], c:[0, 1], o:[1, 0], len:900, entry:true},
  {name:'儿童房门', rect:[2300, 3600, 3100, 3720], h:[2300, 3600], c:[1, 0], o:[0, -1], len:800},
  {name:'客卫门', rect:[3900, 2400, 4700, 2520], h:[4700, 2400], c:[-1, 0], o:[0, -1], len:800},
  {name:'主卧门', rect:[5400, 2640, 5520, 3480], h:[5520, 2640], c:[0, 1], o:[1, 0], len:840},
  {name:'主卫门', rect:[10300, 2400, 11100, 2520], h:[10300, 2400], c:[1, 0], o:[0, -1], len:800},
  {name:'老人房门', rect:[2300, 4920, 3100, 5040], h:[2300, 5040], c:[1, 0], o:[0, 1], len:800},
  {name:'拱形门洞', rect:[3700, 3600, 5100, 3720], h:[3700, 3720], c:[1, 0], o:[0, 1], len:1400, style:'arch'},
  {name:'拱形门洞', rect:[3300, 3900, 3420, 4800], h:[3420, 3900], c:[0, 1], o:[1, 0], len:900, style:'arch'},
];
// 推拉门
export const SLIDES = [
  {rect:[700, 8520, 2600, 8640], v:false},
  {rect:[4200, 8520, 8400, 8640], v:false},
  {rect:[9480, 4500, 9600, 6400], v:true},
];
export const R = (x0,y0,x1,y1) => [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
export const ROOMS = [
  {id:'kid', name:'儿童房', poly:R(0, 0, 3300, 3600), mat:'wood', at:[1650, 2300]},
  {id:'gbath', name:'客卫浴', poly:R(3420, 0, 5400, 2400), mat:'antislip', at:[4400, 1300]},
  {id:'master', name:'主卧室', poly:[[5520, 0], [9480, 0], [9480, 2520], [12000, 2520], [12000, 3600], [5520, 3600]], mat:'wood', at:[7500, 2600]},
  {id:'mbath', name:'主卫浴', poly:R(9600, 0, 12000, 2400), mat:'antislip', at:[10800, 1300]},
  {id:'hall', name:'过道', poly:R(3420, 2520, 5400, 3600), mat:'tile800', at:[4400, 3060]},
  {id:'foyer', name:'玄关', poly:R(0, 3720, 3300, 4920), mat:'tile800', at:[1300, 4320]},
  {id:'elder', name:'老人房', poly:R(0, 5040, 3300, 8520), mat:'wood', at:[1650, 5700]},
  {id:'laundry', name:'洗衣阳台', poly:R(0, 8640, 3300, 9900), mat:'antislip', at:[1100, 9270]},
  {id:'living', name:'客餐厅', poly:[[3420, 3720], [9480, 3720], [9480, 6720], [12000, 6720], [12000, 8520], [3420, 8520]], mat:'tile800', at:[6400, 6000]},
  {id:'kitchen', name:'厨房', poly:R(9600, 3720, 12000, 6600), mat:'tile600', at:[10500, 5300]},
  {id:'balcony', name:'休闲阳台', poly:R(3420, 8640, 12000, 9900), mat:'walnut', at:[6400, 9270]},
];
// 地面材料：名称 / 色票 / 贴图一个循环的实际尺寸 sx×sy (m)；贴图画法见 src/materials.js，参考价见 src/pricing.js
export const MATS = {
  wood:      {name:'橡木地板',   sw:'#e2cca8', sx:1.8, sy:.36, rough:.55},
  walnut:    {name:'胡桃木地板', sw:'#8f6a4c', sx:1.8, sy:.36, rough:.5},
  greywood:  {name:'灰橡木地板', sw:'#bdb7ad', sx:1.8, sy:.36, rough:.55},
  bamboo:    {name:'竹地板',     sw:'#d9c38c', sx:1.2, sy:.26, rough:.5},
  chevron:   {name:'鱼骨拼地板', sw:'#d1ad80', sx:.4,  sy:.2,  rough:.5},
  tile800:   {name:'800 地砖',   sw:'#eceff3', sx:.8,  sy:.8,  rough:.3},
  tile600:   {name:'600 地砖',   sw:'#e1e8ec', sx:.6,  sy:.6,  rough:.35},
  slab:      {name:'岩板 900×1800', sw:'#ecebe8', sx:.9, sy:1.8, rough:.15},
  marble:    {name:'大理石',     sw:'#f4f5f7', sx:1.2, sy:1.2, rough:.18},
  antislip:  {name:'300 防滑砖', sw:'#d3dade', sx:.3,  sy:.3,  rough:.8},
  checker:   {name:'黑白棋盘格', sw:'#7d8188', sx:1.2, sy:1.2, rough:.25},
  encaustic: {name:'复古花砖',   sw:'#cdbb9a', sx:.4,  sy:.4,  rough:.4},
  terrazzo:  {name:'水磨石',     sw:'#e7e9ec', sx:.5,  sy:.5,  rough:.4},
  microcement:{name:'微水泥',    sw:'#c8c4bd', sx:2,   sy:2,   rough:.6},
  carpet:    {name:'满铺地毯',   sw:'#c3c9d8', sx:.3,  sy:.3,  rough:1},
};
// 墙面材料（按房间设置；面积 = 周长 × 层高，未扣门窗）
export const WALL_MATS = {
  paint_white:{name:'白色乳胶漆', sw:'#f2f3f5', sx:1,   sy:1},
  paint_warm: {name:'暖白乳胶漆', sw:'#f1eadd', sx:1,   sy:1},
  paint_grey: {name:'高级灰',     sw:'#c4c7cc', sx:1,   sy:1},
  paint_blue: {name:'雾霾蓝',     sw:'#9cb0c2', sx:1,   sy:1},
  paint_sage: {name:'鼠尾草绿',   sw:'#a7b69e', sx:1,   sy:1},
  paint_latte:{name:'奶咖色',     sw:'#cbb59c', sx:1,   sy:1},
  wallpaper:  {name:'条纹墙纸',   sw:'#e4d9c3', sx:.53, sy:1, group:'paper'},
  wp_floral:  {name:'碎花墙纸',   sw:'#efe4d6', sx:.53, sy:.53, group:'paper'},
  wp_geo:     {name:'几何墙纸',   sw:'#d7dde2', sx:.53, sy:.46, group:'paper'},
  wp_damask:  {name:'大马士革墙纸', sw:'#d9c8a6', sx:.53, sy:.7, group:'paper'},
  wp_leaf:    {name:'植物叶子墙纸', sw:'#dfe6d8', sx:.53, sy:.6, group:'paper'},
  wp_plaid:   {name:'格纹墙纸',   sw:'#d8cfc2', sx:.4,  sy:.4, group:'paper'},
  wp_star:    {name:'星空儿童墙纸', sw:'#b9cfe3', sx:.53, sy:.53, group:'paper'},
  wp_linen:   {name:'肌理墙布',   sw:'#ddd6cb', sx:.5,  sy:.5, group:'paper'},
  woodpanel:  {name:'木饰面',     sw:'#b08458', sx:.6,  sy:1},
  walltile:   {name:'300×600 墙砖', sw:'#eef0f2', sx:.6, sy:.3},
  marblewall: {name:'大理石墙砖', sw:'#eeece8', sx:.75, sy:1.5},
  brick:      {name:'文化砖',     sw:'#b0634a', sx:.48, sy:.26},
};
export const defaultWall = (id, mat) => /bath|laundry|kitchen/.test(id) || ['antislip', 'tile600'].includes(mat) ? 'walltile' : 'paint_white';
// 家具库：[类型, 名称, 宽, 深, 颜色]
export const LIB = [
  // 分类原则：按「放在哪个空间」归类；款式特别多的品类（家电、洗衣烘干、冰箱、定制柜、灯具）单独成类，方便挑款式
  {cat:'卧室', items:[
    ['bed','双人床 1.8m',1800,2000,'#9fb4c7'],['bed','双人床 1.5m',1500,2000,'#b8c4d9'],['bed','单人床',1200,2000,'#d9c2a0'],
    ['nightstand','床头柜',450,400,'#e6dfd4'],['wardrobe','衣柜',2000,600,'#eef0f2'],
    ['wardrobe','小衣柜',1200,550,'#eef0f2'],['dresser','梳妆台',1000,450,'#eef0f2'],['desk','书桌',1200,600,'#d8c4a6'],
    ['chair','椅子',450,480,'#cfc6b8'],['bookshelf','书架',800,300,'#d8c4a6'],['baycushion','飘窗垫',520,1800,'#e7dccd'],
    ['benchend','床尾凳',1400,420,'#c9a98a'],['stool','化妆凳',400,400,'#e2d3c0'],['tatami','榻榻米地台',2400,2000,'#d9c9a8']]},
  // 儿童高低床：宽 = 床长方向（含爬梯 / 梯柜 / 滑梯），深 = 床宽方向；靠背一侧（深的 -y 侧）贴墙
  {cat:'儿童房', items:[
    ['bunkbed','上下铺（直梯）',2080,1300,'#d9c2a0'],['bunkstairs','梯柜高低床',2580,1260,'#e3d3bb'],
    ['trundlebed','子母床（拖床）',2080,1700,'#cfdcd2'],['lbunk','错层 L 型高低床',2120,2120,'#d8c4a6'],
    ['loftbed','高架床（下方书桌）',2080,1080,'#e9e4dc'],['slidebed','滑梯城堡床',3240,1100,'#efe6d8'],
    ['crib','婴儿床',1250,700,'#efe3d0'],['kiddesk','儿童书桌椅',1000,900,'#e9e4dc'],['toyshelf','玩具收纳柜',1000,350,'#f1ece4'],
    ['playtent','游戏帐篷',1200,1200,'#f2d3c3'],['playmat','爬行垫',2000,1800,'#bcd7e6']]},
  {cat:'客厅', items:[
    ['sofa','三人沙发',2400,900,'#8396a8'],['sofa','双人沙发',1700,880,'#a9b6c6'],['cornersofa','转角沙发',2800,1700,'#8396a8'],
    ['armchair','单人沙发',850,850,'#d08c60'],['beanbag','懒人沙发',800,800,'#e3a46f'],['coffeetable','茶几',1300,650,'#e6dfd4'],
    ['sidetable','边几',500,500,'#d9c3a3'],['tvstand','电视柜',2400,400,'#d8c4a6'],['soundbar','回音壁音箱',1000,120,'#2b2b2d'],
    ['screen','投影幕布',2600,100,'#f4f4f2'],['rocker','摇椅',700,1000,'#b08458'],['chaise','贵妃椅',1700,700,'#c7b8a6'],
    ['aquarium','鱼缸',1200,450,'#2b2d31'],['cattree','猫爬架',600,600,'#d9c9a8'],['petbed','宠物窝',700,550,'#c9a98a']]},
  {cat:'餐厨', items:[
    ['table','餐桌',1400,800,'#d8c4a6'],['table','六人餐桌',1800,900,'#d8c2a2'],['roundtable','圆桌',1000,1000,'#d8c4a6'],
    ['chair','餐椅',450,480,'#cfc6b8'],['island','岛台',1800,900,'#e9e5de'],['barstool','吧椅',420,420,'#6b5d4c'],
    ['counter','橱柜台面',1600,600,'#e9e5de'],['stove','燃气灶',750,450,'#dcdcdc'],['ksink','水槽',800,450,'#e1e6ea'],
    ['cabinet','餐边柜',1600,400,'#eef0f2'],['dishwasher','洗碗机',600,600,'#c9ced3'],['ovencol','蒸烤箱高柜',600,600,'#eef0f2'],
    ['hood','抽油烟机',900,500,'#c9ced3'],['microwave','微波炉',500,400,'#2b2d31'],['trashbin','垃圾桶',350,300,'#d8dde2']]},
  {cat:'卫浴', items:[
    ['toilet','马桶',400,700,'#ffffff'],['vanity','浴室柜',800,500,'#eef1f3'],['vanity','双盆浴室柜',1200,500,'#eef1f3'],
    ['shower','淋浴房',900,900,'#e4edf2'],['bathtub','浴缸',1600,750,'#eef3f6'],['waterheater','电热水器',800,450,'#f4f4f2'],
    ['smarttoilet','智能马桶',420,720,'#ffffff'],['mirrorcab','浴室镜柜',800,150,'#eef1f3'],['towelrack','毛巾架',600,120,'#c9ced3'],['mopsink','拖把池',450,400,'#ffffff']]},
  {cat:'玄关 · 收纳', items:[
    ['shoecab','鞋柜',1000,350,'#eef0f2'],['shoecab','玄关柜',1400,380,'#e6dccc'],['cabinet','储物柜',1000,400,'#eef0f2'],
    ['shoebench','换鞋凳',1000,350,'#c9a98a'],['coatrack','衣帽架',450,450,'#8d7258'],['fullmirror','穿衣镜',600,80,'#d8c4a6']]},
  {cat:'阳台', items:[
    ['dryrack','升降晾衣架',2000,450,'#d8dde2'],['balconyset','阳台桌椅',1200,700,'#b08458'],['hangchair','吊椅',900,900,'#d9c9a8'],['plantstand','花架',800,350,'#8d7258']]},
  {cat:'软装 · 装饰', items:[
    ['rug','地毯',2400,1700,'#d9cbb8'],['plant','绿植',500,500,'#86b28a'],['plant','大绿植',700,700,'#79a87e'],
    ['painting','挂画',900,40,'#c98f6b'],['decomirror','装饰镜',700,40,'#c9a86a'],['vase','花瓶摆件',250,250,'#e9e2d6']]},
  // 窗帘：放到窗户附近会自动吸附到窗前、按窗宽铺满、朝向房间
  {cat:'窗帘', items:[
    ['drapes','布帘 + 纱帘',2000,180,'#c7b8a6'],['rollerblind','卷帘',1500,80,'#e9e4dc'],['venetian','百叶帘',1500,80,'#d8c4a6']]},
  // 灯具：吸顶 / 吊装类自动挂到顶棚（3D 只在漫游里显示），壁灯贴墙（靠背一侧），台灯放在下方家具的台面上；夜景时会亮
  {cat:'灯具', items:[
    ['ceilround','圆形吸顶灯',600,600,'#d8d4cc'],['ceilsquare','方形吸顶灯',600,600,'#d8d4cc'],['chandelier','客厅主灯（多头）',900,900,'#c9a86a'],
    ['fanlamp','风扇灯',1300,1300,'#b08458'],['pendant','餐厅吊灯（一字）',1200,70,'#2b2b2d'],['pendant3','三头吊灯',900,300,'#e7e1d6'],
    ['downlight','筒灯',100,100,'#f2f1ee'],['tracklight','磁吸轨道灯',1500,50,'#2b2b2d'],['bathheater','浴霸',300,600,'#f4f4f2'],
    ['bedpendant','床头吊灯',250,250,'#c9a86a'],['walllamp','壁灯',260,200,'#c9a86a'],['mirrorlight','镜前灯',600,120,'#eef0f2'],
    ['tablelamp','台灯',300,300,'#c9a86a'],['floorlamp','落地灯',450,450,'#3d3a34'],['archlamp','钓鱼灯',1500,400,'#eef0f2']]},
  {cat:'家电', items:[
    ['tv','65 寸电视',1450,80,'#1d1d1f'],['tv','55 寸电视',1230,80,'#1d1d1f'],
    ['aircon','柜机空调',500,380,'#f6f7f8'],['acwall','挂机空调',900,250,'#f6f7f8'],['purifier','空气净化器',400,300,'#f4f4f2'],
    ['robotvac','扫地机器人基站',400,450,'#f4f4f2'],['dehumid','除湿机',350,250,'#f4f4f2'],['freshair','新风机',700,220,'#f6f7f8'],['radiator','暖气片',1000,100,'#f4f4f2']]},
  {cat:'洗衣 · 烘干', items:[
    ['washer','滚筒洗衣机',600,600,'#e6ebee'],['toploader','波轮洗衣机',560,580,'#eef1f4'],['washdryer','洗烘一体机',600,640,'#c3c8ce'],
    ['tripletub','三筒分区洗衣机',650,700,'#e8eaed'],['twintub','双子分区洗衣机',600,650,'#d9dde2'],['washstack','洗烘叠放套装',600,650,'#e6ebee'],
    ['dryer','烘干机',600,600,'#e6ebee']]},
  {cat:'冰箱', items:[
    ['fridge','双门冰箱',700,700,'#dfe4e8'],['fridge','双开门冰箱（对开）',910,700,'#c9ced3'],['frenchfridge','法式双开门冰箱',830,700,'#d4d7da'],
    ['crossfridge','十字四门冰箱',830,700,'#bfc4ca'],['onedoor','单门冰箱',550,600,'#e3e7ea'],['minifridge','单门小冰箱',500,550,'#e8ebee'],
    ['freezer','卧式冰柜',1000,600,'#f1f3f5'],['winecab','酒柜',600,580,'#2b2d31']]},
  // 定制柜：第 6 项为参数（pk = 参考价条目；h=0 表示顶天，到层高；mount = 离地高度；door = flat 平开门 | glass 玻璃门 | open 开放格）
  {cat:'定制柜', items:[
    ['tvwall','电视墙柜',3200,400,'#e9e4dc',{pk:'cabinet_tv_wall', h:0, tvw:1800, door:'flat'}],
    ['laundrycab','洗衣机嵌入柜',1400,650,'#eef0f2',{pk:'cabinet_balcony', h:0, slots:2, stack:false, sink:false}],
    ['laundrycab','阳台洗衣柜（带水槽）',1700,620,'#e6dfd4',{pk:'cabinet_balcony', h:0, slots:1, stack:true, sink:true}],
    ['customcab','顶天衣柜',2400,600,'#efe9df',{pk:'cabinet_wardrobe', h:0, mount:0, cols:4, rows:1, door:'flat'}],
    ['customcab','玄关柜（中空）',1200,380,'#e6dccc',{pk:'cabinet_entry', h:0, mount:0, cols:2, rows:1, door:'flat', niche:true}],
    ['customcab','书柜墙',2400,350,'#d8c4a6',{pk:'cabinet_bookcase', h:0, mount:0, cols:4, rows:5, door:'open'}],
    ['customcab','玻璃展示柜',1200,420,'#2d3036',{pk:'cabinet_bookcase', h:2000, mount:0, cols:2, rows:4, door:'glass'}],
    ['customcab','吊柜',1600,350,'#eef0f2',{pk:'cabinet_wardrobe', h:700, mount:1500, cols:3, rows:1, door:'flat'}]]},
  {cat:'书房 · 休闲', items:[
    ['desk','长书桌',1600,700,'#d8c2a2'],['officechair','办公椅',620,620,'#4a4f55'],['bookshelf','大书架',1600,350,'#d8c4a6'],
    ['piano','立式钢琴',1500,600,'#1f1d1b'],['treadmill','跑步机',800,1800,'#3a3a3c'],['armchair','阅读椅',750,800,'#c9a98a']]},
];
export const typeColor = t => { for (const c of LIB) for (const i of c.items) if (i[0]===t) return i[4]; return '#eee'; };

export let _n = 1;
/* ---------- 安装方式：不是落地摆放的物件 ----------
 *  ceil 吸顶 / 吊装（3D 挂到顶棚，只在漫游里显示）；wall 壁装（模型自带离地高度，靠背一侧贴墙）；
 *  top 放在下方家具的台面上；flat 平铺在地上（地毯、爬行垫）。不在表里的都是落地家具 */
export const MOUNT = {
  ceilround:'ceil', ceilsquare:'ceil', chandelier:'ceil', pendant:'ceil', pendant3:'ceil', fanlamp:'ceil', downlight:'ceil', tracklight:'ceil', bathheater:'ceil', bedpendant:'ceil',
  screen:'ceil', dryrack:'ceil',
  walllamp:'wall', mirrorlight:'wall', acwall:'wall', hood:'wall', mirrorcab:'wall', towelrack:'wall', freshair:'wall', radiator:'wall', painting:'wall', decomirror:'wall',
  drapes:'wall', rollerblind:'wall', venetian:'wall',
  tablelamp:'top', soundbar:'top', microwave:'top', vase:'top',
  rug:'flat', playmat:'flat',
};
/** 窗帘类：放下时吸附到最近的窗 */
export const WINDOW_DRESSING = ['drapes', 'rollerblind', 'venetian'];
/**
 * 把窗帘对齐到 (x, y) 附近 1.5m 内最近的窗：贴着窗的室内一侧，宽度铺满窗（布帘两边各多出 150），靠背朝窗。
 * inRoom(x, y) 判断一点是否在室内（用来决定窗的哪一侧是房间）；没有合适的窗时不改。返回是否吸附成功
 */
export function fitToWindow(f, wins, inRoom){
  let best = null, bd = 1500;
  for (const w of wins){
    const [x0, y0, x1, y1] = w, dx = Math.max(x0 - f.cx, 0, f.cx - x1), dy = Math.max(y0 - f.cy, 0, f.cy - y1), dd = Math.hypot(dx, dy);
    if (dd < bd){ bd = dd; best = w; }
  }
  if (!best) return false;
  const [x0, y0, x1, y1] = best, hz = x1 - x0 >= y1 - y0, L = hz ? x1 - x0 : y1 - y0, D = f.d, extra = f.type === 'drapes' ? 300 : 0;
  f.w = Math.round(L + extra);
  if (hz){
    const m = (x0 + x1)/2, below = inRoom(m, y1 + 300), above = inRoom(m, y0 - 300);
    const down = below || !above;                                        // 房间在窗的下方（南侧）→ 靠背朝北
    Object.assign(f, {cx:m, cy:down ? y1 + D/2 : y0 - D/2, rot:down ? 0 : 180});
  } else {
    const m = (y0 + y1)/2, right = inRoom(x1 + 300, m), left = inRoom(x0 - 300, m);
    const r = right || !left;
    Object.assign(f, {cx:r ? x1 + D/2 : x0 - D/2, cy:m, rot:r ? 270 : 90});
  }
  return true;
}
export const uid = () => 'f' + Date.now().toString(36) + (_n++);
export const F = (type,name,cx,cy,w,d,rot=0,color) => ({id:uid(),type,name,cx,cy,w,d,rot,color:color||typeColor(type)});

export function defaultFurniture(){ return [
  // 儿童房
  F('bed','单人床',700,1000,1200,2000,0,'#d9c2a0'), F('desk','书桌',3000,1100,1200,600,90), F('chair','椅子',2480,1100,450,480,270),
  F('wardrobe','衣柜',1000,3300,1600,600,180), F('bookshelf','书架',2850,150,800,300),
  // 客卫
  F('shower','淋浴房',3870,450,900,900), F('toilet','马桶',4950,350,400,700), F('vanity','浴室柜',5160,1500,700,480,90),
  // 主卧（含衣帽区）
  F('bed','双人床',7500,1000,1800,2000,0,'#9fb4c7'), F('nightstand','床头柜',6350,220,450,400), F('nightstand','床头柜',8650,220,450,400),
  F('wardrobe','衣柜',10800,3300,2400,600,180), F('desk','梳妆台',7800,3300,1200,600,180), F('chair','椅子',7800,2780,450,480),
  // 主卫
  F('shower','淋浴房',11550,450,900,900), F('toilet','马桶',10200,350,400,700), F('vanity','浴室柜',9850,1600,800,500,270),
  // 过道 / 玄关
  F('plant','绿植',3700,3300,500,500), F('shoecab','鞋柜',1600,4745,1300,350,180),
  // 老人房
  F('bed','双人床',1000,6800,1500,2000,270,'#b8c4d9'), F('wardrobe','衣柜',3000,7300,2000,600,90), F('nightstand','床头柜',250,5800,450,400,270),
  // 洗衣阳台
  F('washer','洗衣机',2900,9600,600,600,180), F('vanity','洗衣池',2200,9650,600,500,180),
  // 厨房
  F('counter','橱柜台面',11700,4860,2280,600,90), F('counter','橱柜台面',10500,4020,1800,600),
  F('stove','燃气灶',10400,3945,750,450), F('ksink','水槽',11775,5000,800,450,90), F('fridge','冰箱',11650,6250,700,700,90),
  // 客餐厅：餐区（东侧，靠厨房）
  F('table','餐桌',8300,4750,1400,800,90), F('cabinet','餐边柜',8300,3895,1600,350),
  F('chair','餐椅',7640,4420,450,480,270), F('chair','餐椅',7640,5080,450,480,270),
  F('chair','餐椅',8960,4420,450,480,90), F('chair','餐椅',8960,5080,450,480,90),
  // 客餐厅：客厅区（西侧电视墙）
  F('rug','地毯',5200,6900,2600,1800,90), F('tvstand','电视柜',3620,6900,2400,400,270), F('sofa','三人沙发',6600,6900,3000,900,90),
  F('coffeetable','茶几',5200,6900,1300,650,90), F('armchair','单人沙发',5200,8050,850,850,180),
  F('plant','绿植',3750,8250,500,500), F('plant','绿植',9200,8250,500,500),
  // 休闲阳台
  F('roundtable','茶桌',10500,9270,600,600), F('armchair','休闲椅',9850,9270,750,750,270,'#d08c60'),
  F('armchair','休闲椅',11150,9270,750,750,90,'#d08c60'), F('plant','绿植',3750,9600,500,500),
];}

/* 户型（plan）：墙 / 窗 / 门 / 推拉门 / 房间 / 尺寸链 / 入户标识 / 过梁 / 漫游起点 / 画布范围。
 * 默认就是上面这套三室两厅；「导入户型图」会生成同结构的新 plan 替换它。 */
export function defaultPlan(){
  return {
    v:1, title:null,
    walls:WALLS.map(w => [...w]), wins:WINS.map(w => [...w]),
    doors:structuredClone(DOORS), slides:structuredClone(SLIDES),
    rooms:structuredClone(ROOMS),
    // 尺寸链：[横向?, 位置, 起点, 各段长度]
    dims:[[true, -750, 0, [3300, 120, 1980, 120, 3960, 120, 2400]], [true, -1250, 0, [12000]],
          [true, 10650, 0, [3300, 120, 8580]], [true, 11150, 0, [12000]],
          [false, -800, 0, [3600, 120, 1200, 120, 3480, 120, 1260]], [false, -1300, 0, [9900]],
          [false, 12750, 0, [2400, 120, 1080, 120, 2880, 120, 1800, 120, 1260]], [false, 13250, 0, [9900]]],
    entryMark:{d:'M-1500 4350H-450M-650 4195L-400 4350L-650 4505', tx:-1480, ty:4195},
    lintels:[],
    walkStart:{x:-700, y:4350, lx:2000, ly:4350},                             // 入户门外
    bounds:{x:-1850, y:-1750, w:15600, h:13400},
  };
}
export function roomDefaults(plan){ const rooms = {}; plan.rooms.forEach(r => rooms[r.id] = {name:r.name, mat:r.mat, wall:r.wall || defaultWall(r.id, r.mat)}); return rooms; }
export function defaultState(){
  const plan = defaultPlan();
  return {plan, furniture:defaultFurniture(), rooms:roomDefaults(plan), demolished:[], measures:[]};
}

