# 锻刀大赛 / Blade Forge 3D

浏览器端 3D 锻造、Roguelike 和竞技赛事游戏。

## 仓库结构

- `game/`：**可直接修改的 V3 工程源码**，包含 `index.html`、`src/`、`css/`、`assets/`、`tests/` 和设计文档；日常开发以这里为准。
- `锻刀大赛_v3.0.zip`：原版发布包备份。编辑 `game/` 后**不需要重新压缩 ZIP**。
- `.github/workflows/pages.yml`：自动运行检查/测试并把 `game/` 部署到 GitHub Pages。
- `scripts/prepare_site.py`：旧 ZIP 解压工具，仅用作备用部署路径。

## 运行、验证

需要 Node.js 22+，建议 Node.js 24。项目无需安装依赖、无需打包。

```sh
cd game
npm run serve         # 开服：http://127.0.0.1:8123/
npm run check         # 语法、静态引用、资源检查
npm test              # 核心测试
npm run verify        # check + test
```

也可以在 `game/` 目录下运行 `npm start`。不要直接双击 `index.html`；ES Module 需要通过 HTTP 访问。游戏内开发规范请参见 [game/AGENTS.md](game/AGENTS.md) 和 [game/README.md](game/README.md)。

## GitHub Pages 自动预览

推送 `main` 分支的 `game/` 文件后，Actions 先运行 `npm run verify`，检查通过才会部署。预览网址通常为：

https://imthechou.github.io/blade-forge-3d/

以仓库 Settings → Pages 中确认的地址为准。浏览器端的视觉和操作体验还需要人工或 Playwright 实际验证；CI 的静态检查不能替代试玩。

## 编辑注意事项

读懂 `game/AGENTS.md`、`game/docs/ARCHITECTURE.md` 后再改代码；维护 Three.js 经典脚本加载顺序、渲染资产路径及存档兼容性。建议通过分支和 PR 提交较大的 UI/渲染修改。
