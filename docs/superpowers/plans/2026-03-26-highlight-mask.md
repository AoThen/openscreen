# 高亮遮罩功能实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现高亮遮罩功能，允许用户在视频的特定时间区间内突出显示矩形区域，同时将其他区域调暗。

**架构：** 新建 `HighlightOverlay` 组件用于渲染遮罩，在 `types.ts` 中定义数据模型，通过 `VideoEditor.tsx` 管理状态，集成到时间轴和设置面板，并在 `frameRenderer.ts` 中实现导出渲染。

**技术栈：** React、TypeScript、SVG mask、react-rnd、PixiJS

---

## 文件结构

### 新建文件
- `src/components/video-editor/HighlightOverlay.tsx` - 高亮遮罩组件

### 修改文件
- `src/components/video-editor/types.ts` - 数据模型和验证函数
- `src/hooks/useEditorHistory.ts` - 添加 highlightRegions 状态
- `src/lib/shortcuts.ts` - 快捷键定义
- `src/components/video-editor/VideoEditor.tsx` - 状态管理和处理函数
- `src/components/video-editor/timeline/TimelineEditor.tsx` - 时间轴集成
- `src/components/video-editor/SettingsPanel.tsx` - 设置面板
- `src/components/video-editor/VideoPlayback.tsx` - 预览渲染
- `src/lib/exporter/frameRenderer.ts` - 导出渲染
- `src/components/video-editor/projectPersistence.ts` - 项目持久化
- `src/i18n/locales/*/timeline.json` - 翻译文件
- `src/i18n/locales/*/settings.json` - 翻译文件

---

## 任务 1：数据模型

**文件：**
- 修改：`src/components/video-editor/types.ts`

- [ ] **步骤 1：添加 HighlightRegion 类型定义**

在 `types.ts` 文件末尾，`clampFocusToDepth` 函数之后添加：

```typescript
// === Highlight Region Types ===

export interface HighlightRegion {
  id: string;
  startMs: number;
  endMs: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  dimOpacity: number;
}

export const DEFAULT_HIGHLIGHT_POSITION = { x: 35, y: 35 };
export const DEFAULT_HIGHLIGHT_SIZE = { width: 30, height: 30 };
export const DEFAULT_DIM_OPACITY = 40;

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
```

- [ ] **步骤 2：验证类型编译通过**

运行：`npx tsc --noEmit`

- [ ] **步骤 3：Commit**

```bash
git add src/components/video-editor/types.ts
git commit -m "feat: add HighlightRegion type definition"
```

---

## 任务 2：状态管理

**文件：**
- 修改：`src/hooks/useEditorHistory.ts`

- [ ] **步骤 1：导入 HighlightRegion 类型**

在 import 语句中添加 `HighlightRegion`：

```typescript
import type {
	AnnotationRegion,
	CropRegion,
	HighlightRegion,
	SpeedRegion,
	TrimRegion,
	WebcamLayoutPreset,
	WebcamPosition,
	ZoomRegion,
} from "@/components/video-editor/types";
```

- [ ] **步骤 2：更新 EditorState 接口**

添加 `highlightRegions: HighlightRegion[];`

- [ ] **步骤 3：更新 INITIAL_EDITOR_STATE**

添加 `highlightRegions: [],`

- [ ] **步骤 4：验证编译通过**

运行：`npx tsc --noEmit`

- [ ] **步骤 5：Commit**

```bash
git add src/hooks/useEditorHistory.ts
git commit -m "feat: add highlightRegions to EditorState"
```

---

## 任务 3：快捷键配置

**文件：**
- 修改：`src/lib/shortcuts.ts`

- [ ] **步骤 1：添加 addHighlight 到 SHORTCUT_ACTIONS 数组**

在 `SHORTCUT_ACTIONS` 数组中，`addAnnotation` 之后添加：

```typescript
export const SHORTCUT_ACTIONS = [
	"addZoom",
	"addTrim",
	"addSpeed",
	"addAnnotation",
	"addHighlight",  // 添加这行
	"addKeyframe",
	"deleteSelected",
	"playPause",
] as const;
```

- [ ] **步骤 2：添加 addHighlight 到 DEFAULT_SHORTCUTS**

在 `DEFAULT_SHORTCUTS` 对象中添加：

```typescript
export const DEFAULT_SHORTCUTS: ShortcutsConfig = {
	addZoom: { key: "z" },
	addTrim: { key: "t" },
	addSpeed: { key: "s" },
	addAnnotation: { key: "a" },
	addHighlight: { key: "h" },  // 添加这行
	addKeyframe: { key: "f" },
	deleteSelected: { key: "d", ctrl: true },
	playPause: { key: " " },
};
```

- [ ] **步骤 3：添加 addHighlight 到 SHORTCUT_LABELS**

在 `SHORTCUT_LABELS` 对象中添加：

```typescript
export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
	addZoom: "Add Zoom",
	addTrim: "Add Trim",
	addSpeed: "Add Speed",
	addAnnotation: "Add Annotation",
	addHighlight: "Add Highlight",  // 添加这行
	addKeyframe: "Add Keyframe",
	deleteSelected: "Delete Selected",
	playPause: "Play / Pause",
};
```

- [ ] **步骤 4：验证编译通过**

运行：`npx tsc --noEmit`

- [ ] **步骤 5：Commit**

```bash
git add src/lib/shortcuts.ts
git commit -m "feat: add highlight keyboard shortcut"
```

---

## 任务 4：HighlightOverlay 组件

**文件：**
- 创建：`src/components/video-editor/HighlightOverlay.tsx`

- [ ] **步骤 1：创建 HighlightOverlay 组件**

```typescript
import { useRef } from "react";
import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import type { HighlightRegion } from "./types";

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

export function HighlightOverlay({
	highlight,
	isSelected,
	containerWidth,
	containerHeight,
	onPositionChange,
	onSizeChange,
	onClick,
	zIndex,
}: HighlightOverlayProps) {
	const x = (highlight.position.x / 100) * containerWidth;
	const y = (highlight.position.y / 100) * containerHeight;
	const width = (highlight.size.width / 100) * containerWidth;
	const height = (highlight.size.height / 100) * containerHeight;

	const isDraggingRef = useRef(false);

	return (
		<Rnd
			position={{ x, y }}
			size={{ width, height }}
			onDragStart={() => {
				isDraggingRef.current = true;
			}}
			onDragStop={(_e, d) => {
				const xPercent = (d.x / containerWidth) * 100;
				const yPercent = (d.y / containerHeight) * 100;
				onPositionChange(highlight.id, { x: xPercent, y: yPercent });
				setTimeout(() => {
					isDraggingRef.current = false;
				}, 100);
			}}
			onResizeStop={(_e, _direction, ref, _delta, position) => {
				const xPercent = (position.x / containerWidth) * 100;
				const yPercent = (position.y / containerHeight) * 100;
				const widthPercent = (ref.offsetWidth / containerWidth) * 100;
				const heightPercent = (ref.offsetHeight / containerHeight) * 100;
				onPositionChange(highlight.id, { x: xPercent, y: yPercent });
				onSizeChange(highlight.id, { width: widthPercent, height: heightPercent });
			}}
			onClick={() => {
				if (isDraggingRef.current) return;
				onClick(highlight.id);
			}}
			bounds="parent"
			className={cn(
				"cursor-move transition-all",
				isSelected && "ring-2 ring-[#34B27B] ring-offset-2 ring-offset-transparent",
			)}
			style={{
				zIndex: zIndex + 1000,
				pointerEvents: isSelected ? "auto" : "none",
				border: isSelected ? "2px solid rgba(52, 178, 123, 0.8)" : "none",
				backgroundColor: isSelected ? "rgba(52, 178, 123, 0.1)" : "transparent",
				boxShadow: isSelected ? "0 0 0 1px rgba(52, 178, 123, 0.35)" : "none",
			}}
			enableResizing={isSelected}
			disableDragging={!isSelected}
			resizeHandleStyles={{
				topLeft: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #34B27B" : "none",
					borderRadius: "50%",
					left: "-6px",
					top: "-6px",
					cursor: "nwse-resize",
				},
				topRight: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #34B27B" : "none",
					borderRadius: "50%",
					right: "-6px",
					top: "-6px",
					cursor: "nesw-resize",
				},
				bottomLeft: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #34B27B" : "none",
					borderRadius: "50%",
					left: "-6px",
					bottom: "-6px",
					cursor: "nesw-resize",
				},
				bottomRight: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #34B27B" : "none",
					borderRadius: "50%",
					right: "-6px",
					bottom: "-6px",
					cursor: "nwse-resize",
				},
			}}
		>
			<div className="w-full h-full" />
		</Rnd>
	);
}

interface HighlightMaskProps {
	highlight: HighlightRegion;
	containerWidth: number;
	containerHeight: number;
}

export function HighlightMask({ highlight, containerWidth, containerHeight }: HighlightMaskProps) {
	const x = (highlight.position.x / 100) * containerWidth;
	const y = (highlight.position.y / 100) * containerHeight;
	const width = (highlight.size.width / 100) * containerWidth;
	const height = (highlight.size.height / 100) * containerHeight;
	const opacity = (100 - highlight.dimOpacity) / 100;
	const maskId = `highlight-mask-${highlight.id}`;

	return (
		<div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
			<svg width="100%" height="100%" className="absolute inset-0">
				<defs>
					<mask id={maskId}>
						<rect width="100%" height="100%" fill="white" />
						<rect x={x} y={y} width={width} height={height} fill="black" />
					</mask>
				</defs>
				<rect
					width="100%"
					height="100%"
					fill={`rgba(0, 0, 0, ${opacity})`}
					mask={`url(#${maskId})`}
				/>
			</svg>
		</div>
	);
}
```

- [ ] **步骤 2：验证编译通过**

运行：`npx tsc --noEmit`

- [ ] **步骤 3：Commit**

```bash
git add src/components/video-editor/HighlightOverlay.tsx
git commit -m "feat: create HighlightOverlay and HighlightMask components"
```

---

## 任务 5：VideoEditor 状态集成

**文件：**
- 修改：`src/components/video-editor/VideoEditor.tsx`

- [ ] **步骤 1：导入 HighlightRegion 相关类型**

在 `import { ... } from "./types";` 中添加：

```typescript
import {
	type AnnotationRegion,
	type CursorTelemetryPoint,
	clampHighlightPosition,
	clampHighlightSize,
	clampDimOpacity,
	DEFAULT_DIM_OPACITY,
	DEFAULT_HIGHLIGHT_POSITION,
	DEFAULT_HIGHLIGHT_SIZE,
	DEFAULT_PLAYBACK_SPEED,
	DEFAULT_ZOOM_DEPTH,
	type FigureData,
	type HighlightRegion,
	type PlaybackSpeed,
	type SpeedRegion,
	type TrimRegion,
	type ZoomDepth,
	type ZoomFocus,
	type ZoomRegion,
} from "./types";
```

- [ ] **步骤 2：从 editorState 解构 highlightRegions**

- [ ] **步骤 3：添加 selectedHighlightId 状态**

- [ ] **步骤 4：添加 nextHighlightIdRef**

- [ ] **步骤 5：添加高亮处理函数（handleSelectHighlight、handleHighlightAdded、handleHighlightSpanChange、handleHighlightDelete、handleHighlightPositionChange、handleHighlightSizeChange、handleHighlightDimOpacityChange）**

- [ ] **步骤 6：更新 applyLoadedProject 中的 pushState 和 nextHighlightIdRef 初始化**

- [ ] **步骤 7：更新 currentProjectSnapshot 和 saveProject 依赖**

- [ ] **步骤 8：添加 selectedHighlightId 清理 effect**

- [ ] **步骤 9：验证编译通过**

运行：`npx tsc --noEmit`

- [ ] **步骤 10：Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx
git commit -m "feat: integrate highlight state management in VideoEditor"
```

---

## 任务 6：时间轴集成

**文件：**
- 修改：`src/components/video-editor/timeline/TimelineEditor.tsx`

- [ ] **步骤 1：添加图标导入**

```typescript
import {
	Check,
	ChevronDown,
	Gauge,
	Highlighter,
	MessageSquare,
	Plus,
	Scissors,
	WandSparkles,
	ZoomIn,
} from "lucide-react";
```

注意：如果 `Highlighter` 图标不存在，使用 `Sun` 或 `Focus` 替代。

- [ ] **步骤 2：添加 HIGHLIGHT_ROW_ID 常量和类型导入**

- [ ] **步骤 3：添加 Highlight Props 到 TimelineEditorProps 接口**

- [ ] **步骤 4：更新 TimelineRenderItem 的 variant 类型**

- [ ] **步骤 5：更新 activeMode 状态类型**

- [ ] **步骤 6：添加 Highlight 工具栏按钮**

- [ ] **步骤 7：添加 Highlight 轨道渲染**

- [ ] **步骤 8：更新 handleItemClick、handleItemSpanChange、handleItemDelete**

- [ ] **步骤 9：添加快捷键处理（使用 shortcuts.addHighlight）**

- [ ] **步骤 10：验证编译通过**

- [ ] **步骤 11：Commit**

```bash
git add src/components/video-editor/timeline/TimelineEditor.tsx
git commit -m "feat: integrate highlight track in TimelineEditor"
```

---

## 任务 7：设置面板集成

**文件：**
- 修改：`src/components/video-editor/SettingsPanel.tsx`

- [ ] **步骤 1：添加 HighlightRegion 类型导入**

- [ ] **步骤 2：添加 Highlight Props 到 SettingsPanelProps 接口**

- [ ] **步骤 3：更新 SettingsPanel 函数参数**

- [ ] **步骤 4：添加高亮设置面板 UI（在 Zoom 设置之后）**

- [ ] **步骤 5：验证编译通过**

- [ ] **步骤 6：Commit**

```bash
git add src/components/video-editor/SettingsPanel.tsx
git commit -m "feat: add highlight settings panel"
```

---

## 任务 8：VideoPlayback 集成

**文件：**
- 修改：`src/components/video-editor/VideoPlayback.tsx`

- [ ] **步骤 1：导入 HighlightMask、HighlightOverlay 和 HighlightRegion 类型**

- [ ] **步骤 2：添加 Highlight Props 到 VideoPlaybackProps 接口**

- [ ] **步骤 3：更新组件参数解构**

- [ ] **步骤 4：添加 activeHighlight 计算逻辑**

- [ ] **步骤 5：在 return 中渲染 HighlightMask（在 AnnotationOverlay 之前）**

- [ ] **步骤 6：渲染 HighlightOverlay（用于编辑）**

- [ ] **步骤 7：验证编译通过**

- [ ] **步骤 8：Commit**

```bash
git add src/components/video-editor/VideoPlayback.tsx
git commit -m "feat: render highlight mask and overlay in VideoPlayback"
```

---

## 任务 9：导出集成

**文件：**
- 修改：`src/lib/exporter/frameRenderer.ts`

- [ ] **步骤 1：导入 HighlightRegion 类型**

- [ ] **步骤 2：添加 highlightRegions 到 FrameRenderConfig 接口**

- [ ] **步骤 3：添加 renderHighlightMask 私有方法**

- [ ] **步骤 4：在 renderFrame 中调用高亮渲染（标注渲染之前）**

- [ ] **步骤 5：验证编译通过**

- [ ] **步骤 6：Commit**

```bash
git add src/lib/exporter/frameRenderer.ts
git commit -m "feat: add highlight mask rendering in video export"
```

---

## 任务 10：项目持久化

**文件：**
- 修改：`src/components/video-editor/projectPersistence.ts`

- [ ] **步骤 1：导入 HighlightRegion 相关类型和函数**

- [ ] **步骤 2：添加 highlightRegions 到 ProjectEditorState 接口**

- [ ] **步骤 3：添加 normalizedHighlightRegions 归一化逻辑**

- [ ] **步骤 4：更新 normalizeProjectEditor 返回值**

- [ ] **步骤 5：验证编译通过**

- [ ] **步骤 6：Commit**

```bash
git add src/components/video-editor/projectPersistence.ts
git commit -m "feat: add highlight regions persistence support"
```

---

## 任务 11：国际化

**文件：**
- 修改：`src/i18n/locales/en/timeline.json`
- 修改：`src/i18n/locales/en/settings.json`
- 修改：`src/i18n/locales/zh-CN/timeline.json`
- 修改：`src/i18n/locales/zh-CN/settings.json`
- 修改：`src/i18n/locales/es/timeline.json`
- 修改：`src/i18n/locales/es/settings.json`

- [ ] **步骤 1：更新英文 timeline.json**

在 `buttons` 对象中添加 `"addHighlight": "Highlight"`
在 `hints` 对象中添加 `"pressHighlight": "Press H to add highlight region"`
在 `labels` 对象中添加 `"highlightItem": "Highlight"`

- [ ] **步骤 2：更新英文 settings.json**

添加 `highlight` 对象：
```json
"highlight": {
  "title": "Highlight Settings",
  "dimOpacity": "Dim Opacity",
  "position": "Position",
  "size": "Size",
  "delete": "Delete Highlight"
}
```

- [ ] **步骤 3：更新中文 timeline.json**

添加对应中文翻译

- [ ] **步骤 4：更新中文 settings.json**

添加对应中文翻译

- [ ] **步骤 5：更新西班牙语 timeline.json 和 settings.json**

添加对应西班牙语翻译

- [ ] **步骤 6：验证编译通过**

- [ ] **步骤 7：Commit**

```bash
git add src/i18n/locales/*/timeline.json src/i18n/locales/*/settings.json
git commit -m "feat: add i18n translations for highlight feature"
```

---

## 任务 12：VideoEditor Props 传递

**文件：**
- 修改：`src/components/video-editor/VideoEditor.tsx`

- [ ] **步骤 1：传递 highlight props 到 TimelineEditor**

- [ ] **步骤 2：传递 highlight props 到 SettingsPanel**

- [ ] **步骤 3：传递 highlight props 到 VideoPlayback**

- [ ] **步骤 4：传递 highlightRegions 到导出配置**

- [ ] **步骤 5：验证编译通过**

- [ ] **步骤 6：Commit**

```bash
git add src/components/video-editor/VideoEditor.tsx
git commit -m "feat: wire up highlight props to child components"
```

---

## 任务 13：最终验证

- [ ] **步骤 1：运行类型检查**

运行：`npx tsc --noEmit`

- [ ] **步骤 2：运行 lint 检查**

运行：`npm run lint`

- [ ] **步骤 3：运行测试**

运行：`npm test`

- [ ] **步骤 4：手动测试 - 添加高亮**

1. 启动应用
2. 按 H 键或点击高亮按钮
3. 在时间轴上拖拽创建高亮区间

- [ ] **步骤 5：手动测试 - 编辑高亮**

1. 选中高亮区间
2. 调整遮罩透明度
3. 拖拽调整位置和大小

- [ ] **步骤 6：手动测试 - 导出视频**

验证导出视频中高亮遮罩效果正确

- [ ] **步骤 7：手动测试 - 项目保存/加载**

验证项目保存和加载后高亮区间正确恢复

- [ ] **步骤 8：Final Commit**

```bash
git add -A
git commit -m "feat: complete highlight mask feature implementation"
```

---

## 实现完成检查清单

- [ ] 数据模型已添加到 `types.ts`
- [ ] 状态管理已集成到 `useEditorHistory.ts`
- [ ] 快捷键已配置
- [ ] HighlightOverlay 组件已创建
- [ ] VideoEditor 状态管理已完成
- [ ] 时间轴集成已完成
- [ ] 设置面板集成已完成
- [ ] VideoPlayback 渲染已完成
- [ ] 导出渲染已完成
- [ ] 项目持久化已完成
- [ ] 国际化翻译已添加
- [ ] 所有类型检查通过
- [ ] 所有 lint 检查通过
- [ ] 手动测试全部通过