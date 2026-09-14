# 霖州蒋默 · 数字世界引擎

为《霖州蒋默》角色卡开发的独立弹窗小手机（第一个应用：微信）。详见 [设计文档.md](设计文档.md)。

## 目录

```
loader/lzjm-loader.js   装载器（粘贴到卡片，经酒馆助手运行）
src/                       引擎源码（按模块分文件）
build/build.js             构建：node build/build.js → dist/engine.js
dist/engine.js             发布产物（jsDelivr 分发的就是它）
设计文档.md                 唯一设计依据
```

## 发布流程

1. 改 `src/` 里的代码
2. `node build/build.js`
3. 提交推送 GitHub（dist 一起推）
4. 玩家下次进卡自动拿到新版（装载器取 main 最新提交号）

## 使用前必改

- 世界书按设计文档 §5.1 建三条约定条目（通讯录 / 表情包 / 人设）。
- 装载器已指向本仓库；如改名仓库需同步改 `loader/lzjm-loader.js` 顶部常量。
