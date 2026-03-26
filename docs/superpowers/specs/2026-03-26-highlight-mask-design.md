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
  startMs: number;           // 开始时间（毫秒），范围：0 ~ 视频总时长
  endMs: number;             // 结束时间（毫秒），范围：startMs+1 ~ 视频总时长
  position: {                // 高亮区域位置（百分比）
    x: number;               // 范围：0-100
    y: number;               // 范围：0-100
  };
  size: {                    // 高亮区域大小（百分比）
    width: number;           // 范围：1-100
    height: number;          // 范围：1-100
  };
  dimOpacity: number;        // 遮罩透明度，范围：0-100（0=完全遮挡，100=无遮挡）
}

export const DEFAULT_HIGHLIGHT_POSITION = { x: 35, y: 35 };
export const DEFAULT_HIGHLIGHT_SIZE = { width: 30, height: 30 };
export const DEFAULT_DIM_OPACITY = 40;

// 验证约束函数
export function clampHighlightPosition(pos: { x: number; y: number }): { x: number; y: number } {
  return {
    x: clamp(pos.x, 0, 100),
    y: clamp(pos.y, 0, 100),
  };
}

export function clampHighlightSize(size: { width: number; height: number }): { width: number; height: number } {
  return {
    width: clamp(size.width, 1, 100),
    height: clamp(size.height, 1, 100),
  };
}

export function clampDimOpacity(opacity: number): number {
  return clamp(opacity, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}
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
1. 使用 Canvas 2D 绘制遮罩层（与现有标注渲染方式一致）
2. 遮罩区域填充半透明黑色（透明度由 `dimOpacity` 控制）
3. 高亮区域不绘制遮罩（保持原视频亮度）
4. 选中时显示绿色边框和缩放手柄
5. 使用 `react-rnd` 库实现拖拽和缩放

**预览渲染实现：**
```typescript
// 在 HighlightOverlay 组件中
// 使用 Canvas 绘制遮罩，通过路径的 evenodd 填充规则实现挖洞效果
const drawMask = (ctx: CanvasRenderingContext2D) => {
  const opacity = (100 - highlight.dimOpacity) / 100;
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.beginPath();
  // 外部矩形（整个画面）
  ctx.rect(0, 0, containerWidth, containerHeight);
  // 内部矩形（高亮区域，反向绘制形成挖洞）
  ctx.rect(highlightX, highlightY, highlightWidth, highlightHeight);
  ctx.fill('evenodd');
};
```

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

1. **常量定义**：
   ```typescript
   export const HIGHLIGHT_ROW_ID = "row-highlight";
   ```

2. **工具栏**：在 Zoom 和 Annotation 之间添加 Highlight 按钮
   - 键盘快捷键：`H` 键

3. **时间轴轨道**：添加 Highlight 轨道
   - 位置顺序：Zoom → Highlight → Trim → Annotation → Speed
   - 轨道 ID：`HIGHLIGHT_ROW_ID`

4. **交互处理**：
   - 添加 `handleHighlightAdded` 函数
   - 添加 `handleHighlightSpanChange` 函数
   - 添加 `handleHighlightDelete` 函数
   - 添加 `selectedHighlightId` 状态

5. **重叠行为**：
   - 多个高亮区间允许重叠（与 Zoom 不同，Zoom 区间不允许重叠）
   - 重叠区域取最后添加的高亮区间设置

### 设置面板集成

修改 `src/components/video-editor/SettingsPanel.tsx`：

当选中高亮区间时，显示以下设置选项：
- **Dim Opacity**：滑块控制遮罩透明度（0%-100%）
- **Position**：X/Y 位置滑块（也可在视频画面直接拖拽）
- **Size**：宽度/高度滑块（也可在视频画面直接调整）
- **Delete**：删除高亮区间按钮

### 导出集成

修改 `src/lib/exporter/frameRenderer.ts`：

**渲染顺序**：
1. 渲染背景
2. 渲染视频帧（包含缩放效果）
3. 渲染高亮遮罩
4. 渲染标注内容

**实现方式**：

在渲染每一帧时，检测当前时间点是否有活跃的高亮区间，如果有则绘制遮罩效果：

```typescript
// 在 renderFrame 函数中添加
function renderHighlightMask(
  ctx: CanvasRenderingContext2D,
  highlight: HighlightRegion,
  canvasWidth: number,
  canvasHeight: number
) {
  const opacity = (100 - highlight.dimOpacity) / 100;
  
  // 计算高亮区域的像素位置
  const x = (highlight.position.x / 100) * canvasWidth;
  const y = (highlight.position.y / 100) * canvasHeight;
  const width = (highlight.size.width / 100) * canvasWidth;
  const height = (highlight.size.height / 100) * canvasHeight;
  
  // 使用 evenodd 填充规则绘制带洞的遮罩
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.beginPath();
  // 外部矩形（整个画面）
  ctx.rect(0, 0, canvasWidth, canvasHeight);
  // 内部矩形（高亮区域，反向绘制形成挖洞）
  ctx.rect(x, y, width, height);
  ctx.fill('evenodd');
}
```

**与缩放的交互**：
- 高亮区域的位置和大小基于原始视频坐标系（不受缩放影响）
- 缩放效果在高亮遮罩之前应用
- 高亮区域的视觉效果会随缩放一起放大/缩小

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
3. 添加 `nextHighlightIdRef` 引用：
   ```typescript
   const nextHighlightIdRef = useRef(1);
   ```
4. 在 `applyLoadedProject` 中初始化 ID 引用：
   ```typescript
   nextHighlightIdRef.current = deriveNextId(
     "highlight",
     normalizedEditor.highlightRegions.map((region) => region.id),
   );
   ```
5. 添加高亮相关的处理函数：
   - `handleSelectHighlight`
   - `handleHighlightAdded`
   - `handleHighlightSpanChange`
   - `handleHighlightDelete`
   - `handleHighlightPositionChange`
   - `handleHighlightSizeChange`
   - `handleHighlightDimOpacityChange`

### 项目持久化

修改 `src/components/video-editor/projectPersistence.ts`：

**项目数据结构**：在项目数据中添加 `highlightRegions` 字段。

**归一化函数**：

```typescript
const normalizedHighlightRegions: HighlightRegion[] = Array.isArray(editor.highlightRegions)
  ? editor.highlightRegions
      .filter((region): region is HighlightRegion => 
        Boolean(region && typeof region.id === "string")
      )
      .map((region) => ({
        id: region.id,
        startMs: clamp(
          isFiniteNumber(region.startMs) ? region.startMs : 0, 
          0, 
          totalMs
        ),
        endMs: clamp(
          isFiniteNumber(region.endMs) ? region.endMs : 1000, 
          (region.startMs ?? 0) + 1, 
          totalMs
        ),
        position: clampHighlightPosition(region.position ?? DEFAULT_HIGHLIGHT_POSITION),
        size: clampHighlightSize(region.size ?? DEFAULT_HIGHLIGHT_SIZE),
        dimOpacity: clampDimOpacity(region.dimOpacity ?? DEFAULT_DIM_OPACITY),
      }))
  : [];

// 辅助函数
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}
```

**ID 派生函数**：

```typescript
// 在 deriveNextId 函数中添加对 highlight 的支持
export function deriveNextId(prefix: string, existingIds: string[]): number {
  let maxId = 0;
  for (const id of existingIds) {
    const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      maxId = Math.max(maxId, parseInt(match[1], 10));
    }
  }
  return maxId + 1;
}
```

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

需要在以下翻译文件中添加翻译键：

### `src/i18n/locales/*/timeline.json`
```json
{
  "buttons": {
    "addHighlight": "添加高亮"
  },
  "hints": {
    "pressHighlight": "按 H 添加高亮区间"
  },
  "labels": {
    "highlightItem": "高亮"
  }
}
```

### `src/i18n/locales/*/settings.json`
```json
{
  "highlight": {
    "title": "高亮设置",
    "dimOpacity": "遮罩透明度",
    "position": "位置",
    "size": "大小",
    "delete": "删除高亮"
  }
}
```

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
- **缓解**：使用 Canvas 2D 与现有标注渲染方式一致，利用 GPU 加速

### 交互冲突
- **风险**：高亮遮罩可能干扰标注的交互
- **缓解**：遮罩层设置 `pointer-events: none`，交互通过独立的控制层处理

### 导出兼容性
- **风险**：遮罩效果在导出时可能与其他效果冲突
- **缓解**：明确渲染顺序（视频帧 → 高亮遮罩 → 标注），确保遮罩在标注之前渲染

### 内存使用
- **风险**：多个高亮区间同时存在时，Canvas 渲染可能占用较多内存
- **缓解**：高亮区间数量通常有限，且 Canvas 渲染已在项目中广泛使用，内存影响可控

### 缩放交互
- **风险**：高亮区域与缩放同时作用时，视觉效果可能不直观
- **缓解**：高亮区域基于原始视频坐标，随缩放一起放大/缩小，保持视觉一致性

### 预览与导出一致性
- **风险**：预览和导出的渲染方式可能有细微差异
- **缓解**：统一使用 Canvas 2D 渲染方式，确保预览和导出效果一致
