# Roguent 原型整屋换肤预览工具

生成一套主题(cyber/lofi)的 30 项整屋资产,经覆盖 shim 注入 zip 原型,开 Roguent.html 看整屋换肤。

## 用法
1. 解原型副本(见 plan Task 0):prototype/ 由 Roguent-handoff.zip 解出。
2. 设 `OPENAI_API_KEY`(自动出图)。
3. 基准图:`bun scripts/art/gen.ts --anchor --theme cyber`
4. 人工确认基准图 prototype/project/public/assets/themes/cyber/knight_m.png。
5. 批量:`bun scripts/art/gen.ts --all --theme cyber --ref-anchor`
6. 生成覆盖表:`bun scripts/art/overrides.ts --theme cyber`
7. 装 shim(plan Task 6,改 sprites.jsx + Roguent.html 一次性)。
8. 浏览器开 prototype/project/Roguent.html(或 `cd prototype/project && python3 -m http.server`)。

## 无 API key 的手动回退
- `bun scripts/art/gen.ts --all --theme cyber --dry-run` 打印每张完整提示词与目标路径。
- 手动用 GPT 按提示词出图,按目标路径存为 PNG,再从第 6 步继续。

## 换第二主题
重跑第 3–6 步把 `--theme cyber` 换成 `--theme lofi`,再刷新页面。
