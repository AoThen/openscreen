# 模糊打码遮罩功能设计规格

## 概述

为 OpenScreen 视频编辑器添加模糊打码遮罩功能，用于隐藏视频中的敏感信息（如人脸、账号、密码等）。

## 功能定位

模糊遮罩作为 `AnnotationRegion` 的一种新类型，与现有的 `text`、`image`、`figure` 类型并列。复用现有的：
- 时间线交互逻辑
- 拖拽/缩放组件 (Rnd)
- 设置面板框架
- 撤销/重做机制
- 项目持久化逻辑

## 类型定义

### 新增类型

```typescript
// 扩展标注类型
export type AnnotationType = "text" | "image" | "figure" | "blur";

// 模糊效果类型
export type BlurEffectType = "gaussian" | "solid" | "motion";

// 模糊数据接口
export interface BlurData {
  effectType: BlurEffectType;    // 模糊效果类型
  intensity: number;             // 模糊强度 (1-50)
  feathering: number;            // 羽化程度 (0-20px, 0=无羽化)
  solidColor: string;            // 纯色遮挡颜色 (仅 solid 类型使用)
}

// 默认值
export const DEFAULT_BLUR_DATA: BlurData = {
  effectType: "gaussian",
  intensity: 15,
  feathering: 0,
  solidColor: "#000000",
};
```

### 扩展 AnnotationRegion

```typescript
export interface AnnotationRegion {
  id: string;
  startMs: number;
  endMs: number;
  type: AnnotationType;
  content: string;
  textContent?: string;
  imageContent?: string;
  position: AnnotationPosition;
  size: AnnotationSize;
  style: AnnotationTextStyle;
  zIndex: number;
  figureData?: FigureData;
  blurData?: BlurData;  // 新增
}
```

## 模糊效果类型

| 类型 | 效果 | 参数 | 适用场景 |
|------|------|------|----------|
| `gaussian` | 高斯模糊 | intensity, feathering | 人脸、敏感文字 |
| `solid` | 纯色遮挡 | solidColor, feathering | 完全隐藏内容 |
| `motion` | 动态模糊 | intensity, feathering | 极端敏感内容 |

## 核心参数

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| `effectType` | BlurEffectType | - | `gaussian` | 模糊效果类型 |
| `intensity` | number | 1-50 | 15 | 模糊强度，值越大越模糊 |
| `feathering` | number | 0-20 | 0 | 羽化程度，0 表示无羽化 |
| `solidColor` | string | hex color | `#000000` | 纯色遮挡颜色 |

## UI 设计

### 标注面板扩展

在 `AnnotationSettingsPanel.tsx` 中新增 "模糊" Tab：

```
┌─────────────────────────────────────┐
│  [文字] [图片] [箭头] [模糊]         │  ← 新增模糊 Tab
├─────────────────────────────────────┤
│  模糊类型                           │
│  ○ 高斯模糊  ○ 纯色遮挡  ○ 动态模糊 │
│                                     │
│  模糊强度                           │
│  ├─────────●─────────────┤ 15      │
│                                     │
│  羽化程度                           │
│  ├─────────────────●─────┤ 0       │
│                                     │
│  遮挡颜色 (仅纯色遮挡时显示)         │
│  [■ #000000 ▼]                      │
│                                     │
│  [删除模糊区域]                      │
└─────────────────────────────────────┘
```

### 时间线显示

模糊类型的标注在时间线上显示为带有模糊图标的轨道项，与其他标注类型一致。

## 实现方案

### 1. 预览渲染 (AnnotationOverlay.tsx)

```tsx
// 模糊遮罩渲染
const renderBlurOverlay = () => {
  if (!annotation.blurData) return null;
  
  const { effectType, intensity, feathering, solidColor } = annotation.blurData;
  
  switch (effectType) {
    case "gaussian":
      return (
        <div
          className="w-full h-full"
          style={{
            backdropFilter: `blur(${intensity}px)`,
            borderRadius: `${feathering}px`,
          }}
        />
      );
    case "solid":
      return (
        <div
          className="w-full h-full"
          style={{
            backgroundColor: solidColor,
            borderRadius: `${feathering}px`,
          }}
        />
      );
    case "motion":
      return (
        <div
          className="w-full h-full"
          style={{
            backdropFilter: `blur(${intensity * 1.5}px) saturate(0.5)`,
            borderRadius: `${feathering}px`,
          }}
        />
      );
  }
};
```

### 2. 导出渲染 (frameRenderer.ts)

在 `renderAnnotations` 函数中添加模糊遮罩的渲染逻辑：

```typescript
// 模糊遮罩导出渲染
function renderBlurMask(
  ctx: CanvasRenderingContext2D,
  annotation: AnnotationRegion,
  canvasWidth: number,
  canvasHeight: number,
  videoCanvas: HTMLCanvasElement
): void {
  const { position, size, blurData } = annotation;
  if (!blurData) return;
  
  const x = (position.x / 100) * canvasWidth;
  const y = (position.y / 100) * canvasHeight;
  const width = (size.width / 100) * canvasWidth;
  const height = (size.height / 100) * canvasHeight;
  
  switch (blurData.effectType) {
    case "gaussian":
      // 使用 StackBlur 或 Canvas 模糊
      ctx.filter = `blur(${blurData.intensity}px)`;
      ctx.drawImage(videoCanvas, x, y, width, height, x, y, width, height);
      ctx.filter = "none";
      break;
      
    case "solid":
      ctx.fillStyle = blurData.solidColor;
      ctx.fillRect(x, y, width, height);
      break;
      
    case "motion":
      ctx.filter = `blur(${blurData.intensity * 1.5}px)`;
      ctx.drawImage(videoCanvas, x, y, width, height, x, y, width, height);
      ctx.filter = "none";
      break;
  }
}
```

### 3. 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/components/video-editor/types.ts` | 新增 `BlurEffectType`、`BlurData` 类型定义 |
| `src/components/video-editor/AnnotationOverlay.tsx` | 添加模糊遮罩预览渲染 |
| `src/components/video-editor/AnnotationSettingsPanel.tsx` | 新增模糊类型 Tab 和设置 UI |
| `src/components/video-editor/VideoEditor.tsx` | 添加模糊数据处理函数 |
| `src/lib/exporter/annotationRenderer.ts` | 添加模糊遮罩导出渲染 |
| `src/i18n/locales/en/editor.json` | 添加英文翻译 |
| `src/i18n/locales/zh-CN/editor.json` | 添加中文翻译 |
| `src/i18n/locales/es/editor.json` | 添加西班牙语翻译 |

## 国际化

### 新增翻译键

```json
{
  "annotation": {
    "typeBlur": "模糊",
    "blurType": "模糊类型",
    "blurGaussian": "高斯模糊",
    "blurSolid": "纯色遮挡",
    "blurMotion": "动态模糊",
    "blurIntensity": "模糊强度",
    "blurFeathering": "羽化程度",
    "blurSolidColor": "遮挡颜色"
  }
}
```

## 测试要点

1. **预览渲染测试**
   - 三种模糊类型在编辑器中正确显示
   - 强度和羽化参数实时更新
   - 拖拽和缩放功能正常

2. **导出渲染测试**
   - 导出的视频中模糊效果正确应用
   - 不同分辨率下效果一致

3. **持久化测试**
   - 保存/加载项目时模糊数据正确保留
   - 撤销/重做功能正常

## 未来扩展

- 支持椭圆形状
- 支持马赛克效果
- 支持自动追踪（跟随移动物体）
