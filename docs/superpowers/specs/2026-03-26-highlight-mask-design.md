# 高亮遮罩功能设计规格

## 概述

高亮遮罩功能允许用户在视频的特定时间区间内，突出显示一个矩形区域，同时将该区域外的内容调暗。该功能与现有的缩放、标注功能并列，用于引导观众注意力。

## 功能需求

### 核心功能
- 在时间轴上创建高亮区间（基于时间区间）
- 定义一个矩形高亮区域（位置和大小可调）
- 调节高亮区域外的遮罩透明度（0%-100%）
- 高亮遮罩效果在预览和导出时均生效

### 用户交互
- 通过时间轴工具栏添加高亮区间
- 在视频画面上直接拖拽调整高亮区域的位置和大小
- 在设置面板中精确调整参数

## 技术设计

### 数据模型

在 `src/components/video-editor/types.ts` 中添加：

```typescript
export interface HighlightRegion {
  id: string;
  startMs: number;           // 开始时间（毫秒）
  endMs: number;             // 结束时间（毫秒）
  position: {                // 高亮区域位置（百分比，0-100）
    x: number;
    y: number;
  };
  size: {                    // 高亮区域大小（百分比，0-100）
    width: number;
    height: number;
  };
  dimOpacity: number;        // 遮罩透明度（0-100，0=完全遮挡，100=无遮挡）
}

export const DEFAULT_HIGHLIGHT_POSITION = { x: 35, y: 35 };
export const DEFAULT_HIGHLIGHT_SIZE = { width: 30, height: 30 };
export const DEFAULT_DIM_OPACITY = 40;
```

### 组件设计

#### HighlightOverlay 组件

新建 `src/components/video-editor/HighlightOverlay.tsx`：

```typescript
interface HighlightOverlayProps {
  highlight: HighlightRegion;
  isSelected: boolean;
  containerWidth: number;
  containerHeight: number;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onSizeChange: (id: string, size: { width: number; height: number }) => void;
  onClick: (id: string) => void;
  zIndex: number;
}
```

**渲染逻辑：**
1. 使用 SVG `<mask>` 元素创建遮罩
2. 遮罩区域填充半透明黑色（透明度由 `dimOpacity` 控制）
3. 高亮区域在遮罩中为透明（不显示遮罩层）
4. 选中时显示绿色边框和缩放手柄
5. 使用 `react-rnd` 库实现拖拽和缩放

**渲染层级：**
```
VideoPlayback (视频画面)
  ↓
HighlightOverlay (高亮遮罩)
  ↓
AnnotationOverlay (标注内容)
```

### 时间轴集成

修改 `src/components/video-editor/timeline/TimelineEditor.tsx`：

1. **工具栏**：在 Zoom 和 Annotation 之间添加 Highlight 按钮
2. **时间轴轨道**：添加 Highlight 轨道，与 Zoom、Annotation 轨道并列
3. **交互处理**：
   - 添加 `handleHighlightAdded` 函数
   - 添加 `handleHighlightSpanChange` 函数
   - 添加 `handleHighlightDelete` 函数
   - 添加 `selectedHighlightId` 状态

### 设置面板集成

修改 `src/components/video-editor/SettingsPanel.tsx`：

当选中高亮区间时，显示以下设置选项：
- **Dim Opacity**：滑块控制遮罩透明度（0%-100%）
- **Position**：X/Y 位置滑块（也可在视频画面直接拖拽）
- **Size**：宽度/高度滑块（也可在视频画面直接调整）
- **Delete**：删除高亮区间按钮

### 导出集成

修改 `src/lib/exporter/frameRenderer.ts`：

在渲染每一帧时，检测当前时间点是否有活跃的高亮区间，如果有则绘制遮罩效果：

```typescript
// 伪代码
if (activeHighlight) {
  const opacity = (100 - activeHighlight.dimOpacity) / 100;
  
  // 绘制遮罩层
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // 清除高亮区域的遮罩
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(highlightX, highlightY, highlightWidth, highlightHeight);
  ctx.globalCompositeOperation = 'source-over';
}
```

### 状态管理

修改 `src/hooks/useEditorHistory.ts`：

在 `EditorState` 接口中添加：
```typescript
highlightRegions: HighlightRegion[];
```

在 `INITIAL_EDITOR_STATE` 中添加：
```typescript
highlightRegions: [];
```

修改 `src/components/video-editor/VideoEditor.tsx`：

1. 添加 `highlightRegions` 状态
2. 添加 `selectedHighlightId` 状态
3. 添加 `nextHighlightIdRef` 引用
4. 添加高亮相关的处理函数：
   - `handleSelectHighlight`
   - `handleHighlightAdded`
   - `handleHighlightSpanChange`
   - `handleHighlightDelete`
   - `handleHighlightPositionChange`
   - `handleHighlightSizeChange`
   - `handleHighlightDimOpacityChange`

### 项目持久化

修改 `src/components/video-editor/projectPersistence.ts`：

在项目数据结构中添加 `highlightRegions` 字段，支持保存和加载高亮区间。

## 文件变更清单

### 新建文件
- `src/components/video-editor/HighlightOverlay.tsx` - 高亮遮罩组件

### 修改文件
- `src/components/video-editor/types.ts` - 添加 HighlightRegion 类型
- `src/components/video-editor/VideoEditor.tsx` - 添加高亮状态和处理函数
- `src/components/video-editor/timeline/TimelineEditor.tsx` - 添加高亮工具和轨道
- `src/components/video-editor/SettingsPanel.tsx` - 添加高亮设置面板
- `src/components/video-editor/VideoPlayback.tsx` - 渲染高亮遮罩组件
- `src/lib/exporter/frameRenderer.ts` - 添加高亮遮罩导出渲染
- `src/hooks/useEditorHistory.ts` - 添加 highlightRegions 状态
- `src/components/video-editor/projectPersistence.ts` - 支持高亮区间持久化

## 国际化

需要在 `src/i18n/locales/*/editor.json` 中添加以下翻译键：
- `toolbar.highlight` - 高亮工具按钮
- `settings.highlight.title` - 高亮设置标题
- `settings.highlight.dimOpacity` - 遮罩透明度
- `settings.highlight.position` - 位置
- `settings.highlight.size` - 大小
- `settings.highlight.delete` - 删除高亮

## 测试计划

### 单元测试
- HighlightRegion 类型验证
- 高亮区域位置/大小计算逻辑
- 遮罩透明度计算逻辑

### 集成测试
- 添加/删除高亮区间
- 时间轴交互
- 设置面板交互
- 项目保存/加载

### E2E 测试
- 完整的高亮遮罩创建和编辑流程
- 高亮遮罩在导出视频中正确渲染

## 实现顺序

1. 数据模型（types.ts）
2. 状态管理（useEditorHistory.ts）
3. HighlightOverlay 组件
4. VideoEditor 集成
5. 时间轴集成（TimelineEditor.tsx）
6. 设置面板集成（SettingsPanel.tsx）
7. VideoPlayback 集成
8. 导出集成（frameRenderer.ts）
9. 项目持久化（projectPersistence.ts）
10. 国际化
11. 测试

## 风险与缓解

### 性能风险
- **风险**：遮罩层渲染可能影响预览性能
- **缓解**：使用 SVG mask 而非 Canvas，利用 GPU 加速

### 交互冲突
- **风险**：高亮遮罩可能干扰标注的交互
- **缓解**：遮罩层设置 `pointer-events: none`，交互通过独立的控制层处理

### 导出兼容性
- **风险**：遮罩效果在导出时可能与其他效果冲突
- **缓解**：明确渲染顺序，确保遮罩在标注之前渲染
