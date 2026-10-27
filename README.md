# 锻刀大赛 / Blade Forge 3D

当前 `main` 分支存放 V3 发布压缩包 `锻刀大赛_v3.0.zip`。这是**发布包**，不是已经展开的、便于逐文件修改的游戏源码仓库。

## 自动预览部署

已配置 GitHub Pages 工作流 `.github/workflows/pages.yml`：当 V3 ZIP 更新后，GitHub Actions 会自动解压压缩包，识别 `index.html`，并将网站发布至 GitHub Pages。原始 ZIP 不会被修改。可在仓库 **Actions** 页面查看提取与部署结果。

- 部署站点（以仓库 GitHub Pages 实际配置为准）：https://imthechou.github.io/blade-forge-3d/
- 本地提取：`python3 scripts/prepare_site.py '锻刀大赛_v3.0.zip' dist`
- 本地预览：在 `dist` 目录运行 `python3 -m http.server 8000`，访问 `http://localhost:8000`。

## 后续开发建议

为了让 AI 代理直接进行逐文件修改、代码审查和 UI 测试，建议把发布包内的可编辑工程文件解压后按实际结构加入仓库，并保留发布包作为历史备份。未检查压缩包内部前，不假定其具体技术栈，也不自动重构游戏代码。
