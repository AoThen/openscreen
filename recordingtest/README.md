# 本地录制导出测试

此目录包含用于 E2E 测试的录制文件。

## 文件说明

- `*.webm` - 录制的屏幕视频
- `*.session.json` - 录制会话元数据
- `*.openscreen` - OpenScreen 项目文件
- `*.webm.cursor.json` - 光标轨迹数据

## 运行测试

### 前提条件

1. 确保已构建 Electron Legacy 应用：
```bash
npm run build:legacy:linux
```

2. 确保 `recordingtest` 目录中有 `.webm` 文件

### 运行测试

```bash
# 运行本地录制导出测试
npm run test:e2e:local

# 或使用 Playwright 直接运行
npx playwright test tests/e2e/local-recording-export.spec.ts
```

### 测试流程

测试会执行以下操作：

1. 启动 Electron 应用
2. 加载 `recordingtest` 目录中的录制文件
3. 进入编辑界面
4. 添加标注（Annotation）
5. 导出为 MP4 视频
6. 验证导出的 MP4 文件有效性

### 输出

测试成功后，导出的视频会保存在 `recordingtest` 目录：
```
recordingtest/exported-<timestamp>.mp4
```

## 更新录制文件

如果要使用新的录制文件进行测试：

1. 删除旧的录制文件：
```bash
rm recordingtest/*
```

2. 使用 OpenScreen 应用录制新的视频，保存到 `recordingtest` 目录

3. 确保至少有一个 `.webm` 文件

## 故障排查

### 视频加载失败

如果在 CI 或无 GPU 环境中运行，视频可能无法加载。这是正常的渲染限制。

### 导出失败

检查：
- 是否有 `.webm` 文件
- Electron 是否正确构建
- 系统是否安装了必要的编解码器

### Headless 模式

默认情况下，测试会以可见模式运行（非 headless），方便调试。

如需启用 headless 模式：
```bash
HEADLESS=true npm run test:e2e:local
```
