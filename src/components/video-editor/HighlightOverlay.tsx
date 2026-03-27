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
				pointerEvents: "auto",
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
