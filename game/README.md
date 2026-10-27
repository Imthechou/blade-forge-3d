# 锻刀大赛 · BLADE FORGE

浏览器 3D 锻造与赛事游戏。普通游玩无需账号、无需安装 npm 依赖、无需构建。

## Windows 双击开玩

1. 需要 Node.js 22 或更新版本，以及支持 WebGL 的 Chrome、Edge 等浏览器。本机已安装 Node.js 24。
2. 双击上一级目录的 **开始游戏.cmd**（项目唯一的启动入口）。
3. 启动器自动打开 **http://127.0.0.1:8123/**。首次进入需等待资源和着色器准备。
4. 游玩时保持服务窗口打开；关闭窗口或按 Ctrl+C 停止服务。

重复双击会复用本目录已运行的服务。如果 8123 被其他程序占用，启动器会提示，不会结束其他程序或自动换端口。浏览器没打开时，手动访问上述地址。

不要直接双击 index.html；ES Module 必须通过 HTTP 加载。存档在当前浏览器本地存储中。请保持同一浏览器、浏览器配置和地址；localhost、127.0.0.1、不同端口互不共享存档。隐私窗口、清理站点数据或禁止本地存储会影响保存，游戏会提示失败或仅内存运行。

## 命令行

在本目录运行：

```sh
npm start                 # 开服并打开浏览器
npm run serve             # 只开服
npm run check             # 语法、引用、资源和当前文档链接
npm test                  # 核心存档和 HTTP 回归，无需安装依赖
npm run verify            # check + test
npm run ai:index          # 重建源码与依赖索引
```

macOS / Linux 可使用 `npm start`（本项目没有 .sh 启动脚本，只有一个 Windows 双击入口）。系统自动打开工具不可用时，手动访问游戏地址。

## 开发文档

文档顶层只有 5 篇，每篇一个稳定主题：

- [文档目录](docs/README.md)
- [架构与存档边界](docs/ARCHITECTURE.md)（含**按功能定位源码**速查表）
- [设计规范与决策](docs/DESIGN.md)（设计令牌 / 视觉方向 / 改造决策 / 平衡参数）
- [验收](docs/VALIDATION.md)（自动检查 + 人工清单 + 未验证项）
- [状态与交接](docs/STATUS.md)

`docs/SOURCE_INDEX.md` 与 `docs/dependencies.json` 由 `npm run ai:index` 自动生成，不是业务真源。

浏览器自动验收运行 `npm run test:browser`，先保持本地服务运行。只有开发验收需要 Playwright，详见验收文档，玩家无需安装。部分历史设计文档、诊断证据及模型制作源文件不在本包内，历史性能数字不能作为本轮实测结果。
