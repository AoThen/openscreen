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
export type BlurEffectType = "gaussian" | "solid" | "heavy";

// 模糊数据接口
export interface BlurData {
  effectType: BlurEffectType;    // 模糊效果类型
  intensity: number;             // 模糊强度 (1-30)，30px 已足够模糊
  feathering: number;            // 羽化程度 (0-20px, 0=无羽化)
  solidColor: string;            // 纯色遮挡颜色 (仅 solid 类型使用)
}
```

### 默认值定义

```typescript
// 模糊数据默认值
export const DEFAULT_BLUR_DATA: BlurData = {
  effectType: "gaussian",
  intensity: 15,
  feathering: 0,
  solidColor: "#000000",
};

// 模糊标注的默认尺寸（比普通标注稍大）
export const DEFAULT_BLUR_SIZE: AnnotationSize = {
  width: 25,
  height: 20,
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
| `heavy` | 强力模糊 | intensity, feathering | 极端敏感内容（高强度模糊+低饱和度） |

**效果说明**：
- `gaussian`：柔和的高斯模糊，适合大多数打码场景
- `solid`：使用纯色完全遮挡，默认黑色，可自定义颜色
- `heavy`：高强度模糊（intensity × 1.5）+ 降低饱和度，用于需要更强隐蔽性的场景

## 核心参数

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| `effectType` | BlurEffectType | - | `gaussian` | 模糊效果类型 |
| `intensity` | number | 1-30 | 15 | 模糊强度（像素），30px 已足够模糊大多数内容 |
| `feathering` | number | 0-20 | 0 | 羽化程度，0 表示无羽化，20px 为最大羽化半径 |
| `solidColor` | string | hex color | `#000000` | 纯色遮挡颜色 |

**羽化说明**：
羽化效果通过边缘渐变透明实现，而非简单圆角。具体实现：
- 在模糊区域边缘添加渐变遮罩
- 渐变宽度等于 `feathering` 值
- 从完全不透明渐变到完全透明

## UI 设计

### 标注面板扩展

在 `AnnotationSettingsPanel.tsx` 中新增 "模糊" Tab：

```
┌─────────────────────────────────────┐
│  [文字] [图片] [箭头] [模糊]         │  ← 新增模糊 Tab (图标: EyeOff)
├─────────────────────────────────────┤
│  模糊类型                           │
│  ○ 高斯模糊  ○ 纯色遮挡  ○ 强力模糊 │
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
│  [复制模糊区域]                      │
│  [删除模糊区域]                      │
└─────────────────────────────────────┘
```

### 时间线显示

模糊类型的标注在时间线上显示为带有 `EyeOff` 图标的轨道项，与其他标注类型一致。

## 实现方案

### 1. 预览渲染 (AnnotationOverlay.tsx)

在 `renderContent()` 函数中添加 `blur` case：

```tsx
case "blur":
  if (!annotation.blurData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
        No blur data
      </div>
    );
  }

  return renderBlurOverlay();

// 模糊遮罩渲染函数
const renderBlurOverlay = () => {
  const { effectType, intensity, feathering, solidColor } = annotation.blurData!;
  
  // 羽化遮罩（使用渐变实现边缘柔和效果）
  const featherGradient = feathering > 0
    ? `linear-gradient(to right, transparent, black ${feathering}px, black calc(100% - ${feathering}px), transparent)`
    : undefined;

  switch (effectType) {
    case "gaussian":
      return (
        <div
          className="w-full h-full"
          style={{
            backdropFilter: `blur(${intensity}px)`,
            WebkitBackdropFilter: `blur(${intensity}px)`,
            maskImage: featherGradient,
            WebkitMaskImage: featherGradient,
          }}
        />
      );
    case "solid":
      return (
        <div
          className="w-full h-full"
          style={{
            backgroundColor: solidColor,
            maskImage: featherGradient,
            WebkitMaskImage: featherGradient,
          }}
        />
      );
    case "heavy":
      return (
        <div
          className="w-full h-full"
          style={{
            backdropFilter: `blur(${intensity * 1.5}px) saturate(0.3)`,
            WebkitBackdropFilter: `blur(${intensity * 1.5}px) saturate(0.3)`,
            maskImage: featherGradient,
            WebkitMaskImage: featherGradient,
          }}
        />
      );
  }
};
```

### 2. 导出渲染 (frameRenderer.ts)

模糊遮罩需要在 `frameRenderer.ts` 的 `renderFrame` 方法中处理，因为它需要访问已渲染的视频帧数据。

在 `renderFrame` 方法的 `renderAnnotations` 调用之前添加模糊处理：

```typescript
// 在 renderFrame 方法中，renderAnnotations 调用之前添加：

// Render blur masks (需要在 renderAnnotations 之前，因为需要访问合成后的画布)
if (
  this.config.annotationRegions &&
  this.config.annotationRegions.length > 0 &&
  this.compositeCtx
) {
  const activeBlurAnnotations = this.config.annotationRegions.filter(
    (ann) =>
      ann.type === "blur" &&
      ann.blurData &&
      timeMs >= ann.startMs &&
      timeMs < ann.endMs
  );

  for (const blurAnnotation of activeBlurAnnotations) {
    this.renderBlurMask(
      this.compositeCtx,
      blurAnnotation,
      this.config.width,
      this.config.height
    );
  }
}

// 模糊遮罩渲染方法
private renderBlurMask(
  ctx: CanvasRenderingContext2D,
  annotation: AnnotationRegion,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { position, size, blurData } = annotation;
  if (!blurData) return;

  const x = (position.x / 100) * canvasWidth;
  const y = (position.y / 100) * canvasHeight;
  const width = (size.width / 100) * canvasWidth;
  const height = (size.height / 100) * canvasHeight;

  // 保存当前画布状态
  ctx.save();

  // 创建临时画布用于模糊处理
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvasWidth;
  tempCanvas.height = canvasHeight;
  const tempCtx = tempCanvas.getContext("2d")!;

  // 复制当前画布内容
  tempCtx.drawImage(ctx.canvas, 0, 0);

  // 应用羽化遮罩
  if (blurData.feathering > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    
    // 使用渐变羽化
    const gradient = ctx.createRadialGradient(
      x + width / 2, y + height / 2, Math.min(width, height) / 2 - blurData.feathering,
      x + width / 2, y + height / 2, Math.min(width, height) / 2
    );
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
  }

  // 根据类型应用效果
  switch (blurData.effectType) {
    case "gaussian":
      ctx.filter = `blur(${blurData.intensity}px)`;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = "none";
      // 裁剪到模糊区域
      ctx.globalCompositeOperation = "destination-in";
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      break;

    case "solid":
      ctx.fillStyle = blurData.solidColor;
      ctx.fillRect(x, y, width, height);
      break;

    case "heavy":
      ctx.filter = `blur(${blurData.intensity * 1.5}px) saturate(0.3)`;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = "none";
      // 裁剪到模糊区域
      ctx.globalCompositeOperation = "destination-in";
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      break;
  }

  ctx.restore();
}
```

### 3. 类型切换处理 (VideoEditor.tsx)

扩展 `handleAnnotationTypeChange` 函数：

```typescript
const handleAnnotationTypeChange = useCallback(
  (id: string, type: AnnotationRegion["type"]) => {
    pushState((prev) => ({
      annotationRegions: prev.annotationRegions.map((region) => {
        if (region.id !== id) return region;
        
        const updatedRegion = { ...region, type };
        
        switch (type) {
          case "text":
            updatedRegion.content = region.textContent || "Enter text...";
            // 清理其他类型的数据
            delete updatedRegion.blurData;
            break;
          case "image":
            updatedRegion.content = region.imageContent || "";
            delete updatedRegion.blurData;
            break;
          case "figure":
            updatedRegion.content = "";
            if (!region.figureData) {
              updatedRegion.figureData = { ...DEFAULT_FIGURE_DATA };
            }
            delete updatedRegion.blurData;
            break;
          case "blur":
            updatedRegion.content = "";
            if (!region.blurData) {
              updatedRegion.blurData = { ...DEFAULT_BLUR_DATA };
            }
            // 清理其他类型的数据
            break;
        }
        
        return updatedRegion;
      }),
    }));
  },
  [pushState],
);
```

### 4. 模糊数据处理函数 (VideoEditor.tsx)

```typescript
const handleAnnotationBlurDataChange = useCallback(
  (id: string, blurData: BlurData) => {
    pushState((prev) => ({
      annotationRegions: prev.annotationRegions.map((region) =>
        region.id === id ? { ...region, blurData } : region,
      ),
    }));
  },
  [pushState],
);
```

### 5. 创建模糊标注 (VideoEditor.tsx)

扩展 `handleAnnotationAdded` 函数，支持创建模糊类型的标注：

```typescript
const handleAnnotationAdded = useCallback(
  (span: Span) => {
    const id = `annotation-${nextAnnotationIdRef.current++}`;
    const zIndex = nextAnnotationZIndexRef.current++;
    const newRegion: AnnotationRegion = {
      id,
      startMs: Math.round(span.start),
      endMs: Math.round(span.end),
      type: "text",
      content: "Enter text...",
      position: { ...DEFAULT_ANNOTATION_POSITION },
      size: { ...DEFAULT_ANNOTATION_SIZE },
      style: { ...DEFAULT_ANNOTATION_STYLE },
      zIndex,
    };
    pushState((prev) => ({ annotationRegions: [...prev.annotationRegions, newRegion] }));
    setSelectedAnnotationId(id);
    setSelectedZoomId(null);
    setSelectedTrimId(null);
  },
  [pushState],
);
```

**注意**：模糊标注通过类型切换创建，而非单独的创建方法。用户先创建标注，然后切换到模糊类型。

### 6. 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/components/video-editor/types.ts` | 新增 `BlurEffectType`、`BlurData` 类型定义；新增 `DEFAULT_BLUR_DATA`、`DEFAULT_BLUR_SIZE` 常量 |
| `src/components/video-editor/AnnotationOverlay.tsx` | 添加 `blur` case 渲染逻辑 |
| `src/components/video-editor/AnnotationSettingsPanel.tsx` | 新增模糊类型 Tab 和设置 UI |
| `src/components/video-editor/VideoEditor.tsx` | 添加 `handleAnnotationBlurDataChange` 函数；扩展 `handleAnnotationTypeChange` |
| `src/lib/exporter/frameRenderer.ts` | 添加 `renderBlurMask` 方法；在 `renderFrame` 中调用 |
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
    "blurHeavy": "强力模糊",
    "blurIntensity": "模糊强度",
    "blurFeathering": "羽化程度",
    "blurSolidColor": "遮挡颜色",
    "blurTipIntensity": "值越大越模糊",
    "blurTipFeathering": "边缘柔和过渡"
  }
}
```

## 测试要点

### 预览渲染测试
- [ ] 三种模糊类型在编辑器中正确显示
- [ ] 强度参数实时更新效果
- [ ] 羽化参数正确应用
- [ ] 纯色遮挡的颜色选择器正常工作
- [ ] 拖拽和缩放功能正常

### 导出渲染测试
- [ ] 导出的视频中模糊效果正确应用
- [ ] 不同分辨率下效果一致
- [ ] 羽化效果在导出时正确渲染
- [ ] 三种模糊类型导出效果正确

### 交互测试
- [ ] 类型切换时数据正确处理
- [ ] 保存/加载项目时模糊数据正确保留
- [ ] 撤销/重做功能正常
- [ ] 复制模糊标注功能正常

### 边界情况测试
- [ ] 模糊区域超出视频边界
- [ ] 多个模糊区域重叠
- [ ] 模糊区域与其他标注重叠

## 未来扩展

- 支持椭圆形状
- 支持马赛克效果
- 支持自动追踪（跟随移动物体）
- 支持关键帧动画（区域位置/大小随时间变化）