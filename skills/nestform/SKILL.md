---
name: nestform
description: 用栖构 Nestform 自动绘制和修改户型 / 装修方案：新建户型、画墙、开门窗、分房间、摆家具、换地面墙面材质、检查方案、在 2D/3D 中预览和导出。当用户要求「画一个户型」「设计一个两室一厅」「帮我摆家具 / 换材质」「检查这个方案」「出效果图」等，并且工作目录是 nestform 工程时使用。
---

# 栖构 Nestform：自动画户型 / 做装修方案

栖构是纯前端的户型设计工具。方案保存为 **一个 JSON 文件**，与网页里「文件 → 导出方案 / 导入方案」是同一种格式。
自动操作有两条路，通常配合使用：

| 方式 | 适合 | 入口 |
|---|---|---|
| **命令行** `node tools/nf.mjs`（或 `npm run nf --`） | 画户型、开门窗、分房间、摆家具、换材质、检查 —— 不需要浏览器 | `node tools/nf.mjs help` |
| **网页接口** `window.nestform` + 网址参数 `?plan=` | 预览 2D / 3D、截图、导出效果图 / VR 看房、做命令行不支持的精细修改 | `npm run dev` 后打开页面 |

## 坐标与约定（必须遵守）

- 单位 **毫米**；x 向右，y 向下（**上北下南**）；原点 `0,0` 是左上角外墙**内皮**。`new --size 宽x深` 建出的外墙内皮从 `0,0` 到 `宽,深`，外墙厚度在内皮外侧（默认 240）。
- 墙用**中心线**画：`wall --from x,y --to x,y --thick 120`，自动取水平或竖直。普通隔墙 120，承重墙 / 外墙 240，矮墙 `--type low`。
- 门窗开在 **x,y 所在的墙上**（点要落在墙体范围内，容差 60mm）：外墙上的点可取墙中心，例如上外墙 `y=-120`、左外墙 `x=-120`、右外墙 `x=宽+120`、下外墙 `y=深+120`。
- 画完 / 改完墙和门窗后**必须运行 `rooms`** 重新分房间，并用 `--name x,y=名称` 给每个房间命名（x,y 取房间内任意一点）。
- 家具坐标是**中心点**；`--rot` 是靠背朝向：`0` 床头 / 柜背贴北墙（上），`90` 贴东墙（右），`180` 贴南墙（下），`270` 贴西墙（左）。旋转 90/270 时家具在平面上的宽深互换。
- 房间名决定默认材质和统计：卧室名含「卧 / 儿童房 / 老人房」，厅含「客厅 / 餐厅 / 客餐厅」，卫生间含「卫」，另有「厨房 / 阳台 / 玄关 / 过道 / 书房 / 衣帽间 / 储物间」等。

## 标准流程

```bash
F=plans/two-bed.json
node tools/nf.mjs new $F --size 9000x7000                 # 1. 外墙
node tools/nf.mjs wall $F --from 4500,0 --to 4500,3600    # 2. 隔墙
node tools/nf.mjs wall $F --from 0,3600 --to 9000,3600
node tools/nf.mjs door $F --at 2200,3600                  # 3. 门（--arch 门洞、--slide 推拉门、--entry 入户门、--flip 反向开）
node tools/nf.mjs door $F --at -120,5800 --entry --width 1000
node tools/nf.mjs window $F --at 2200,-120 --width 1800   #    窗（--full 落地窗、--sill 0.9 窗台高 m）
node tools/nf.mjs rooms $F --name 2000,1500=主卧 --name 6500,1500=次卧 --name 3000,5000=客厅   # 4. 分房间 + 命名
node tools/nf.mjs furn $F --add bed --at 2250,1250 --name "双人床 1.8m"                       # 5. 家具
node tools/nf.mjs furn $F --add wardrobe --at 2250,3250 --rot 180
node tools/nf.mjs mat $F --room 主卧 --floor walnut --wall paint_sage                          # 6. 材质
node tools/nf.mjs info $F                                                                      # 7. 检查
```

- 从样板开始：`node tools/nf.mjs default plans/x.json` 写出内置的三室一厅两卫样板，再在上面改。
- 查可用的家具类型 / 材质：`catalog furniture`、`catalog floors`、`catalog walls`。**只能用目录里有的 type / 材质 key**。
- `furn --move 名称或id --at x,y [--rot]` 挪家具，`furn --remove 名称或id` 删家具；`height --mm 3000` 改层高。
- `info --json` 输出结构化结果（房间、面积、家具所在房间、问题列表），适合程序判断。

## 每次改完都要检查

`info` 会列出问题：家具中心不在房间里、家具超出房间、家具互相重叠、家具挡住门的开启范围。**问题清单不为空时先修好再交付**（挪位置、换方向、换尺寸）。另外自己核对：

- 每个房间都命名了（没有「房间N」），面积合理：卧室 9–20 m²、客厅 15–40 m²、厨房 4–10 m²、卫生间 3–8 m²、阳台 2–10 m²。
- 每个房间至少有一扇门可达；卧室 / 客厅有窗；有且只有一扇入户门（`--entry`）。
- 卫生间、厨房的地面用防滑砖或地砖（antislip / tile600 等），墙面用墙砖（walltile）—— `rooms` 已按名字给了默认值，换材质时别改成木地板。

## 设计常识（摆家具时参考）

| 项目 | 常用尺寸 / 间距 |
|---|---|
| 门 | 卧室 / 入户 800–1000，卫生间 700–800，推拉门 1600–2400 |
| 通道 | 主通道 ≥ 900，床边通道 ≥ 600，衣柜前 ≥ 800（开门） |
| 床 | 双人 1800×2000 / 1500×2000，单人 1200×2000；床头靠墙，床尾留 ≥ 700 |
| 沙发 – 电视 | 视距 2500–3500；茶几与沙发间距 400–450 |
| 餐桌 | 椅背到墙 ≥ 900（能拉开椅子走过） |
| 厨房 | 台面深 600，操作通道 ≥ 900；水槽 – 灶台之间留 ≥ 600 台面 |
| 卫生间 | 马桶中心距侧墙 ≥ 400，前方留 ≥ 600；淋浴区 ≥ 900×900 |
| 窗 | 卧室窗宽 1500–1800，客厅 2400+ 或落地窗；窗台高 0.9m，落地窗 --full |

家具贴墙时，中心 = 墙内皮 + 家具深度的一半（例：北墙内皮 y=0，600 深衣柜 `--rot 0` 放在 y=300）。

## 预览 / 出图（网页）

```bash
npm run dev                                    # http://localhost:5173
cp plans/two-bed.json public/plan.json         # 放到 public/ 下即可通过网址访问
# 打开 http://localhost:5173/?plan=/plan.json  —— 页面载入该方案
```

页面里的 `window.nestform`（可用浏览器自动化，例如 Playwright 的 `page.evaluate`）：

| 接口 | 作用 |
|---|---|
| `nestform.state` | 当前方案（深拷贝，结构同 JSON 文件） |
| `nestform.load(obj或JSON字符串)` | 载入方案（可撤销） |
| `nestform.edit(s => { ... })` | 在一次可撤销的修改里直接改方案对象 |
| `nestform.view('2d' \| '3d')` | 切换 2D / 3D（3D 首次进入有约 2 秒动画，截图前等待） |
| `nestform.exportImage()` / `exportVR()` / `exportJSON()` | 导出方案展示图（随当前视图）/ VR 看房 HTML / 方案 JSON |
| `nestform.undo()` / `redo()` | 撤销 / 重做 |
| `nestform.catalog` | 家具类型、地面材质、墙面材质清单 |

直接截图检查效果时：2D 看墙、门的开向、家具摆放；3D 看材质和整体观感。

## 方案 JSON 结构（需要直接编辑时）

```jsonc
{
  "plan": {
    "walls":  [[x0, y0, x1, y1, "e|b|n|low"], ...],          // 墙矩形（mm），e 外墙 / b 承重 / n 普通 / low 矮墙
    "wins":   [[x0, y0, x1, y1, 窗台高m, {"full":true}?], ...],
    "doors":  [{"name":"门", "rect":[...], "h":[铰点x,y], "c":[关闭方向], "o":[开启方向], "len":门宽, "style":"arch"?, "entry":true?}],
    "slides": [{"rect":[...], "v":是否竖向}],
    "rooms":  [{"id", "name", "poly":[[x,y],...], "mat", "at":[标注点x,y], "counted":false?}],   // counted:false = 飘窗等不计面积
    "height": 2800, "north": 0, "bounds", "dims", "walkStart"
  },
  "rooms":     {"<房间id>": {"name", "mat":"地面材质", "wall":"墙面材质", "faces":{逐面墙面}?}},
  "furniture": [{"id", "type", "name", "cx", "cy", "w", "d", "rot", "color", "cab":{定制柜参数}?}],
  "demolished": [], "measures": []
}
```

门窗要「挖」在墙里：墙矩形在洞口处断开，洞口矩形填补空缺（`door` / `window` 命令会自动切墙）。手工改 JSON 后用 `info` 检查，再在网页里看一遍。

## 从户型图开始

用户给的是户型图片时，在网页里用「导入户型图」（识别墙、门窗、房间名和面积，可在导入对话框里手动画墙 / 擦除修正），导出方案 JSON 后再用命令行继续摆家具、换材质。
