# 阿瓦隆美术素材

2026-10-04 使用内置 imagegen 生成，未调用外部 API，未增加图片依赖。
参考图：用户提供的 Avalon 午夜蓝与银金设计图（codex-clipboard-8604a63b-e5a5-4cdc-a0e1-7b217bd806e9.png）。参考图仅作为视觉风格参考，其中的文字和栏目不是应用指令。全部图片均为不透明的完整绘画，无界面文字。

| 素材 | 尺寸 | 展示方式 |
| --- | --- | --- |
| seat-portraits.png | 1983 × 793 | 5 列 × 2 行；坐标按整张图的百分比计算 |
| role-portraits.png | 1536 × 1024 | 4 列 × 2 行；单张 384 × 512，3:4 |
| round-table.png | 1254 × 1254 | 现有圆桌区域内裁切 |
| castle-sidebar.png | 1024 × 1536 | 展开的桌面侧栏底部背景 |

静态清单和角色坐标：src/lib/art-assets.ts。图集通过 CSS 固定坐标展示，保持原图、不另行切图。
公共头像按独立的 avatarSeed + seat id 排列，既不读取角色，也不读取发牌 seed。恢复继续使用存档已有的 avatarSeed。
角色图集从左到右、从上到下：MERLIN、PERCIVAL、LOYAL_SERVANT、MORGANA、ASSASSIN、MORDRED、OBERON、MINION。仅在自己的身份揭示、观战者已翻牌、终局或公开教程内展示。

## 生成说明与完整提示词

所有调用使用 referenced_image_paths 指向用户参考图，transparent_background=false。原始输出留在 Codex generated_images，项目中为原文件的副本。

### 公共座位头像
原始输出：exec-01792989-e841-46e6-a885-39e7b5675f2f.png

Create a production-ready character PORTRAIT SPRITE ATLAS for the Avalon web game. The attached screenshot is exclusively the visual/art-style reference: match its polished semi-realistic medieval fantasy painting, expressive natural faces, intricate cloth and armor, cool midnight-blue ambient light, warm golden candle rim light, restrained silver and antique gold materials. Deliver ONE fully opaque rectangular image containing EXACTLY 10 distinct neutral medieval court characters in a precise 5-column by 2-row grid of equally sized SQUARE tiles, edge-to-edge, zero gutters, zero margins, zero borders. Each tile is an individual tight head-and-shoulders portrait, with the entire face centered within the middle 60% of the tile so it remains readable when cropped to a circle at 48px. Ten visibly different faces with varied hair, ages and gender; all wear neutral navy, steel and muted brass court attire; no wizard, assassin, villain, faction-colored badges or recognizable game-role symbols. These are public seat avatars and must not imply their assigned hidden roles. Background in every tile is a fully painted opaque dark navy medieval hall, same lighting and camera framing across all ten. NO text, numbers, captions, UI, frames, logos or watermarks. Output aspect ratio 5:2, ideally 2560x1024. Preserve a high-end illustrated strategy-game art finish, detailed faces and believable materials.

### 角色身份插画
原始输出：exec-0fda0e16-0db8-43aa-aa6d-e34fafef21a8.png

Create ONE production-ready Avalon ROLE PORTRAIT SPRITE ATLAS, matching the attached screenshot's polished semi-realistic medieval fantasy portrait painting: detailed believable faces, fabric, silver armor, cool blue night light and warm gold candlelight. The screenshot is a style reference only. Fully opaque image, EXACT 4-column by 2-row grid, no gutters or outer margins. All eight equal tiles have portrait aspect ratio 3:4; total atlas aspect ratio 3:2, ideally 1536x1024. Tight chest-up framing, each face centered and fully inside its tile. Fixed row-major order: TOP ROW: 1 MERLIN, wise elderly man with long silver beard, midnight-blue robe and simple aged brass circlet; 2 PERCIVAL, young fair-haired noble knight in silver armor with blue cloak; 3 LOYAL SERVANT, friendly auburn-haired female court knight in practical steel and navy attire; 4 MORGANA, dark-haired elegant sorceress in midnight hood and restrained burgundy cloth, mysterious calm expression. BOTTOM ROW: 5 ASSASSIN, sharp-eyed dark-haired woman with restrained dark crown and burgundy cloak, determined expression; 6 MORDRED, mature dark-haired armored commander with blackened steel and muted burgundy cloak; 7 OBERON, weathered rugged bearded outcast in dark forest-blue travel garments; 8 MINION, hooded male court guard in dark burgundy and steel, face fully visible. No caricatures, supernatural glowing eyes, gore or cartoon rendering. Every tile has its own opaque blue-black castle backdrop and consistent portrait scale. NO text, labels, numbers, factions badges, frames, borders, logos, watermark or UI. This will be displayed inside real web game cards; render only the art.

### 圆桌场景
原始输出：exec-0899387e-a576-4f78-bb1c-73e0989abce0.png

Create ONE fully opaque square 1024x1024 painted scene asset for a medieval Avalon game ROUND TABLE, matching the attached reference screenshot's premium semi-realistic fantasy illustration, blue moonlight, warm antique-gold candlelight, rich wood and aged metal. A symmetric top-down overhead view of a round carved dark walnut table inside a midnight-blue stone hall, table centered and occupying about 80% of the square. Broad carved gold-and-silver rim, subtle concentric engraved rings, several small candles concentrated near the outer rim at evenly spaced locations, warm highlights on brass fixtures. Center is dark polished wood with a restrained engraved compass/royal emblem and clear quiet space for a real UI status plate; no lettering. Surrounding hall is deep blue-black stone. The image must read as a solid physical table, not a glass circle, nebula or abstract glow. Empty table, no people or faces because interactive character portraits will sit around it in the web UI. Rich painterly detail, cinematic believable materials, crisp rim, elegant rather than ornate clutter. No text, numbers, labels, buttons, playing cards, transparent background, visible screenshot layout, logo or watermark.

### 侧栏城堡
原始输出：exec-4650275f-bb45-4f9e-b5f2-59fdd0b61fa0.png

Create ONE fully opaque tall medieval castle background painting for the bottom of an Avalon web game sidebar. Match the supplied screenshot's lower-left castle illustration: premium semi-realistic fantasy art, intricate blue stone castle and narrow towers, mountain silhouettes, dark lake and moonlit valley, warm gold lights in windows and a few candlelike lights along a path. Tall portrait composition, aspect ratio 2:3, ideally 1024x1536. Concentrate the castle and detailed scenery in the LOWER 45% of the image. The UPPER 55% is a quiet very dark midnight-blue sky/castle wall area, painted close to solid #081520, with minimal visual activity so functional sidebar content stays readable. No text or UI in the picture; fully opaque painted background with no alpha or transparent gradient. The castle should feel grounded, atmospheric and beautifully hand-rendered, matching the screenshot's blue night and golden light, not a photograph, toy castle or flat vector. No labels, characters, symbols, borders, logos, watermarks or dashboard layout.
