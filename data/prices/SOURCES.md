# 市场价格参考表：来源与说明

- 数据文件：`market-prices.json`（56 项，CNY，整理日期 2026-11-03）
- 范围：中国大陆 2025–2026 年零售价，主流中端产品，给出 LOW–HIGH 区间
- 方法：整理自公开网页上的价格信息（品牌官网装修攻略、问答平台、资讯文章、电商促销转述等），每项都记录了来源链接和页面日期。部分品牌官网页面无法正常加载，只取到了搜索结果里的摘要。
- 日期：`sources[].date` 一般是页面日期。摘要只写了“N天前”的，按 2026-11-03 往前推算，是近似日期。写成 `2026-10` 的，只能确定到月份。

## 怎么读这些数字（重要）

1. **投影面积 vs 展开面积**：所有 `m2_projection` 项都按柜体正面的宽×高计价。展开面积是每块板单独计价，单价约 150–500 元/㎡，跟投影单价不能直接比。知乎上有个经验换算：投影单价 ≈ 柜体展开单价 × 3.5 + 门板单价。展开面积报价在本表里没有单列。
2. **投影单价里一般不含的增项**：抽屉（200–400 元/个）、拉篮、裤架、拉直器、灯带（全屋 500–2000 元）、玻璃门（见 `cabinet_glass_door_premium`）、超深（>600mm）或超高的加价、收口条。套餐价格明确不含玻璃门、拉直器和灯带。
3. **促销价 vs 标价**：`package_*` 都是活动价或套餐价，有面积门槛（16/20/22 ㎡ 起），超出部分单价更高（例如博洛尼超出部分 1799 元/㎡）。索菲亚 799 元/㎡ 是 2023 年 9 月的活动价。家电价格都是京东促销期叠加国补（15–20%）和平台券之后的到手价，原价通常高 20–40%。
4. **延米口径不统一**：橱柜“延米”多数指 1 米地柜 + 1 米台面 + 1 米吊柜的组合价，但也有只算地柜加台面、吊柜另计的。估算时建议按 `地柜长度 × kitchen_cabinet_linear` 算。
5. **含不含人工**：地板品牌店的强化地板一般含安装和辅料。多层/三层实木复合多按裸板报价，另加安装包 20–75 元/㎡。瓷砖和石材是纯材料价，铺贴人工看 `tile_labor_*`。
6. **来源质量**：大量来源是百度知道、爱企查（百度 AI 聚合答案）、百家号、新浪看点 SEO 文、土巴兔城市报价指南，以及品牌官网“装修攻略”（索菲亚官网攻略是 SEO 文章，不是价目表）。都不是品牌官方价目表。数字之间互相引用的可能性很高，所以“来源多”不等于“相互独立”。
7. 地区差异：一线城市比二三线高 20–50%，人工差得更多。

## 各项来源强度

**较好**（2 个以上来源，数字相互吻合）：
cabinet_wardrobe、cabinet_tv_wall、cabinet_entry、kitchen_cabinet_linear、package_boloni_custom（26999/16㎡、29999/20㎡、超出 1799/㎡，3 处一致）、floor_laminate、floor_engineered_multilayer、floor_engineered_3layer、floor_herringbone、floor_herringbone_install、tile_800x800、tile_750x1500、tile_300x300_antislip、tile_labor_floor、tile_labor_wall、tile_labor_large_slab、floor_microcement、wall_paint_latex、wall_paint_labor_only、wall_paint_color_premium、wallpaper、wall_fabric_seamless、appliance_*

**一般**（有来源，但口径杂或跨度大）：
cabinet_bookcase、cabinet_glass_door_premium、cabinet_install_separate（其中一条来源是百度资讯搜索页）、kitchen_countertop_quartz（石材店价和品牌橱柜内价差得很多）、package_sofia_whole_house、package_oppein_whole_house、package_boloni_renovation（官网套餐页的数字没取到，也确认不了是按建筑面积还是套内面积算）、floor_solid_wood、floor_terrazzo_cast、stone_marble_natural、tile_labor_marble、wall_microcement、wall_slab_rock、wall_slab_install、wall_marble_install、wall_culture_brick、floor_carpet_wall_to_wall

**弱 / 单一来源**：
cabinet_wardrobe_solid_wood、cabinet_balcony（2023 年加盟平台文章）、package_oppein_kitchen_3m、package_sofia_kitchen、package_shangpin、floor_bamboo、floor_terrazzo_tile、tile_600x600（按 2024 年单片价折算）、tile_slab_900x1800（厂商 AI 问答）、tile_vintage_encaustic（按单片价折算）、wall_wood_veneer_finished、wall_wood_panel_solid

## 没找到（或证据不足，未入表）

- **开放格 / 无门柜单价**：只找到一条 2024 年装饰公司口径（无门衣柜 385 元/㎡，对比有门的 520–530 元/㎡），不是品牌价，没收录。各品牌开放格是否打折、怎么计价，没找到明确规则。
- **阳台柜里洗衣机/烘干机空位**是否计入投影面积：没找到。
- **博洛尼整装官网价**：官网整装页（bjbln.cn）的价格需要交互才显示，没取到数字，表里只有二手转述。
- **金牌橱柜延米价**：只有套餐总价 8000–30000 元，以及“入门 799 元/平米”（单位不明确），没收录。
- **志邦全屋定制投影单价**：没找到可靠数字。
- **立邦/多乐士官方“刷新服务”报价**：没找到（来源还特别说明 30–40 元/㎡ 不是立邦官方价）。
- **地毯品牌价**：没找到家用品牌的满铺价，只有品类区间。
- **竹地板品牌价**：没找到。
- 家电价格未取自京东、天猫商品详情页，来自什么值得买、逛丢、新浪、中关村在线转述的京东到手价。
