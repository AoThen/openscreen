import { fixWebmDuration } from "@fix-webm-duration/fix";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useScopedT } from "@/contexts/I18nContext";
import { desktopApi } from "@/lib/desktopApi";
import { requestCameraAccess } from "@/lib/requestCameraAccess";

const TARGET_FRAME_RATE = 60;
const MIN_FRAME_RATE = 30;
const TARGET_WIDTH = 3840;
const TARGET_HEIGHT = 2160;
const FOUR_K_PIXELS = TARGET_WIDTH * TARGET_HEIGHT;
const QHD_WIDTH = 2560;
const QHD_HEIGHT = 1440;
const QHD_PIXELS = QHD_WIDTH * QHD_HEIGHT;

const BITRATE_4K = 45_000_000;
const BITRATE_QHD = 28_000_000;
const BITRATE_BASE = 18_000_000;
const HIGH_FRAME_RATE_THRESHOLD = 60;
const HIGH_FRAME_RATE_BOOST = 1.7;

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

const CODEC_ALIGNMENT = 2;

const RECORDER_TIMESLICE_MS = 1000;
const BITS_PER_MEGABIT = 1_000_000;
const CHROME_MEDIA_SOURCE = "desktop";
const RECORDING_FILE_PREFIX = "recording-";
const VIDEO_FILE_EXTENSION = ".webm";
const WEBCAM_FILE_SUFFIX = "-webcam";

const AUDIO_BITRATE_VOICE = 128_000;
const AUDIO_BITRATE_SYSTEM = 192_000;

const MIC_GAIN_BOOST = 1.4;
const WEBCAM_TARGET_WIDTH = 1280;
const WEBCAM_TARGET_HEIGHT = 720;
const WEBCAM_TARGET_FRAME_RATE = 30;

type UseScreenRecorderReturn = {
	recording: boolean;
	paused: boolean;
	elapsedTime: number;
	toggleRecording: () => void;
	pauseRecording: () => void;
	resumeRecording: () => void;
	restartRecording: () => void;
	microphoneEnabled: boolean;
	setMicrophoneEnabled: (enabled: boolean) => void;
	microphoneDeviceId: string | undefined;
	setMicrophoneDeviceId: (deviceId: string | undefined) => void;
	systemAudioEnabled: boolean;
	setSystemAudioEnabled: (enabled: boolean) => void;
	webcamEnabled: boolean;
	setWebcamEnabled: (enabled: boolean) => Promise<boolean>;
};

type RecorderHandle = {
	recorder: MediaRecorder;
	recordedBlobPromise: Promise<Blob>;
};

type RecordingSegment = {
	screenBlob: Blob;
	webcamBlob: Blob | null;
	duration: number;
};

function createRecorderHandle(stream: MediaStream, options: MediaRecorderOptions): RecorderHandle {
	const recorder = new MediaRecorder(stream, options);
	const chunks: Blob[] = [];
	const mimeType = options.mimeType || "video/webm";
	const recordedBlobPromise = new Promise<Blob>((resolve, reject) => {
		recorder.ondataavailable = (event: BlobEvent) => {
			if (event.data && event.data.size > 0) {
				chunks.push(event.data);
			}
		};
		recorder.onerror = () => {
			reject(new Error("Recording failed"));
		};
		recorder.onstop = () => {
			resolve(new Blob(chunks, { type: mimeType }));
		};
	});

	recorder.start(RECORDER_TIMESLICE_MS);
	return { recorder, recordedBlobPromise };
}

export function useScreenRecorder(): UseScreenRecorderReturn {
	const t = useScopedT("editor");
	const [recording, setRecording] = useState(false);
	const [paused, setPaused] = useState(false);
	const [elapsedTime, setElapsedTime] = useState(0);
	const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
	const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string | undefined>(undefined);
	const [systemAudioEnabled, setSystemAudioEnabled] = useState(false);
	const [webcamEnabled, setWebcamEnabledState] = useState(false);
	const screenRecorder = useRef<RecorderHandle | null>(null);
	const webcamRecorder = useRef<RecorderHandle | null>(null);
	const stream = useRef<MediaStream | null>(null);
	const screenStream = useRef<MediaStream | null>(null);
	const microphoneStream = useRef<MediaStream | null>(null);
	const webcamStream = useRef<MediaStream | null>(null);
	const mixingContext = useRef<AudioContext | null>(null);
	const startTime = useRef<number>(0);
	const segmentStartTime = useRef<number>(0);
	const totalRecordedTime = useRef<number>(0);
	const recordingSegments = useRef<RecordingSegment[]>([]);
	const recordingId = useRef<number>(0);
	const finalizingRecordingId = useRef<number | null>(null);
	const allowAutoFinalize = useRef(false);
	const discardRecordingId = useRef<number | null>(null);
	const restarting = useRef(false);
	const recorderOptions = useRef<MediaRecorderOptions | null>(null);

	const selectMimeType = () => {
		const preferred = [
			"video/webm;codecs=av1",
			"video/webm;codecs=h264",
			"video/webm;codecs=vp9",
			"video/webm;codecs=vp8",
			"video/webm",
		];

		return preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
	};

	const computeBitrate = (width: number, height: number) => {
		const pixels = width * height;
		const highFrameRateBoost =
			TARGET_FRAME_RATE >= HIGH_FRAME_RATE_THRESHOLD ? HIGH_FRAME_RATE_BOOST : 1;

		if (pixels >= FOUR_K_PIXELS) {
			return Math.round(BITRATE_4K * highFrameRateBoost);
		}

		if (pixels >= QHD_PIXELS) {
			return Math.round(BITRATE_QHD * highFrameRateBoost);
		}

		return Math.round(BITRATE_BASE * highFrameRateBoost);
	};

	// 更新实际录制时间
	useEffect(() => {
		if (!recording) {
			setElapsedTime(0);
			return;
		}

		const updateElapsed = () => {
			if (paused) {
				// 暂停中：显示已录制的总时间
				setElapsedTime(Math.max(0, Math.floor(totalRecordedTime.current / 1000)));
			} else {
				// 录制中：已录制时间 + 当前片段时间
				const currentSegmentTime = Date.now() - segmentStartTime.current;
				const total = totalRecordedTime.current + currentSegmentTime;
				setElapsedTime(Math.max(0, Math.floor(total / 1000)));
			}
		};

		updateElapsed();
		const timer = setInterval(updateElapsed, 1000);

		return () => clearInterval(timer);
	}, [recording, paused]);

	const teardownMedia = useCallback(() => {
		if (stream.current) {
			stream.current.getTracks().forEach((track) => track.stop());
			stream.current = null;
		}
		if (screenStream.current) {
			screenStream.current.getTracks().forEach((track) => track.stop());
			screenStream.current = null;
		}
		if (microphoneStream.current) {
			microphoneStream.current.getTracks().forEach((track) => track.stop());
			microphoneStream.current = null;
		}
		if (webcamStream.current) {
			webcamStream.current.getTracks().forEach((track) => track.stop());
			webcamStream.current = null;
		}
		if (mixingContext.current) {
			mixingContext.current.close().catch(() => {
				// Ignore close errors during recorder teardown.
			});
			mixingContext.current = null;
		}
	}, []);

	const setWebcamEnabled = useCallback(
		async (enabled: boolean) => {
			if (!enabled) {
				setWebcamEnabledState(false);
				return true;
			}

			const accessResult = await requestCameraAccess();
			if (!accessResult.success) {
				toast.error(t("recording.failedCameraAccess"));
				return false;
			}

			if (!accessResult.granted) {
				toast.error(t("recording.cameraBlocked"));
				return false;
			}

			setWebcamEnabledState(true);
			return true;
		},
		[t],
	);

	// 合并多个 WebM 片段
	const mergeSegments = useCallback(async (segments: RecordingSegment[]): Promise<Blob> => {
		if (segments.length === 0) {
			throw new Error("No segments to merge");
		}
		if (segments.length === 1) {
			return segments[0].screenBlob;
		}

		// WebM 文件可以直接拼接（每个片段都是完整的 WebM 文件）
		// 但我们需要重新封装以确保时间戳正确
		// 这里我们使用简单拼接，然后让 fixWebmDuration 修复时长
		const blobs = segments.map((s) => s.screenBlob);
		const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

		// 使用 Blob 序列化方式合并
		const combinedBlob = new Blob(blobs, { type: blobs[0].type || "video/webm" });

		// 修复合并后的时长
		return await fixWebmDuration(combinedBlob, totalDuration);
	}, []);

	const finalizeRecording = useCallback(
		async (segments: RecordingSegment[], activeRecordingId: number) => {
			if (finalizingRecordingId.current === activeRecordingId) {
				return;
			}
			finalizingRecordingId.current = activeRecordingId;

			teardownMedia();
			setRecording(false);
			setPaused(false);
			await desktopApi.setRecordingState(false);

			void (async () => {
				try {
					if (discardRecordingId.current === activeRecordingId) {
						return;
					}

					if (segments.length === 0 || segments.every((s) => s.screenBlob.size === 0)) {
						return;
					}

					// 合并所有片段
					const mergedScreenBlob = await mergeSegments(segments);

					// 合并 webcam 片段
					let mergedWebcamBlob: Blob | null = null;
					const webcamSegments = segments.filter((s) => s.webcamBlob && s.webcamBlob.size > 0);
					if (webcamSegments.length > 0) {
						const webcamBlobs = webcamSegments.map((s) => s.webcamBlob!);
						const totalDuration = webcamSegments.reduce((sum, s) => sum + s.duration, 0);
						const combinedWebcamBlob = new Blob(webcamBlobs, {
							type: webcamBlobs[0].type || "video/webm",
						});
						mergedWebcamBlob = await fixWebmDuration(combinedWebcamBlob, totalDuration);
					}

					const screenFileName = `${RECORDING_FILE_PREFIX}${activeRecordingId}${VIDEO_FILE_EXTENSION}`;
					const webcamFileName = `${RECORDING_FILE_PREFIX}${activeRecordingId}${WEBCAM_FILE_SUFFIX}${VIDEO_FILE_EXTENSION}`;
					const result = await desktopApi.storeRecordedSession({
						screen: {
							videoData: await mergedScreenBlob.arrayBuffer(),
							fileName: screenFileName,
						},
						webcam: mergedWebcamBlob
							? {
									videoData: await mergedWebcamBlob.arrayBuffer(),
									fileName: webcamFileName,
								}
							: undefined,
						createdAt: activeRecordingId,
					});

					if (!result.success) {
						console.error("Failed to store recording session:", result.message);
						return;
					}

					if (result.session) {
						await desktopApi.setCurrentRecordingSession(result.session);
					} else if (result.path) {
						await desktopApi.setCurrentVideoPath(result.path);
					}

					await desktopApi.switchToEditor();
				} catch (error) {
					console.error("Error saving recording:", error);
				} finally {
					if (finalizingRecordingId.current === activeRecordingId) {
						finalizingRecordingId.current = null;
					}
					if (discardRecordingId.current === activeRecordingId) {
						discardRecordingId.current = null;
					}
				}
			})();
		},
		[teardownMedia, mergeSegments],
	);

	const stopRecording = useRef(() => {
		const activeScreenRecorder = screenRecorder.current;
		if (!activeScreenRecorder) {
			return;
		}

		const activeWebcamRecorder = webcamRecorder.current;
		const currentDuration = Date.now() - segmentStartTime.current;
		const activeRecordingId = recordingId.current;

		// 停止当前录制器
		if (activeScreenRecorder.recorder.state === "recording") {
			try {
				activeScreenRecorder.recorder.stop();
			} catch {
				// Recorder may already be stopping.
			}
		}
		if (activeWebcamRecorder) {
			if (activeWebcamRecorder.recorder.state === "recording") {
				try {
					activeWebcamRecorder.recorder.stop();
				} catch {
					// Recorder may already be stopping.
				}
			}
		}

		// 保存当前片段并合并
		void (async () => {
			try {
				const screenBlob = await activeScreenRecorder.recordedBlobPromise;
				let webcamBlob: Blob | null = null;
				if (activeWebcamRecorder) {
					webcamBlob = await activeWebcamRecorder.recordedBlobPromise.catch(() => null);
				}

				if (screenBlob.size > 0) {
					recordingSegments.current.push({
						screenBlob,
						webcamBlob,
						duration: currentDuration,
					});
				}

				// 合并并保存所有片段
				await finalizeRecording([...recordingSegments.current], activeRecordingId);
			} catch (error) {
				console.error("Error finalizing recording:", error);
			}
		})();
	});

	useEffect(() => {
		let cleanup: (() => void) | undefined;

		cleanup = desktopApi.onStopRecordingFromTray(() => {
			stopRecording.current();
		});

		return () => {
			if (cleanup) cleanup();
			allowAutoFinalize.current = false;
			restarting.current = false;
			discardRecordingId.current = null;

			if (screenRecorder.current?.recorder.state === "recording") {
				try {
					screenRecorder.current.recorder.stop();
				} catch {
					// Ignore recorder teardown errors during cleanup.
				}
			}
			if (webcamRecorder.current?.recorder.state === "recording") {
				try {
					webcamRecorder.current.recorder.stop();
				} catch {
					// Ignore recorder teardown errors during cleanup.
				}
			}
			screenRecorder.current = null;
			webcamRecorder.current = null;
			teardownMedia();
		};
	}, [teardownMedia]);

	const createNewRecorder = useCallback(async () => {
		if (!stream.current || !recorderOptions.current) return;

		screenRecorder.current = createRecorderHandle(stream.current, recorderOptions.current);
		screenRecorder.current.recorder.addEventListener(
			"error",
			() => {
				setRecording(false);
			},
			{ once: true },
		);

		if (webcamStream.current) {
			webcamRecorder.current = createRecorderHandle(webcamStream.current, {
				...recorderOptions.current,
				videoBitsPerSecond: Math.min(
					recorderOptions.current.videoBitsPerSecond || BITRATE_BASE,
					BITRATE_BASE,
				),
			});
		}

		segmentStartTime.current = Date.now();
	}, []);

	const startRecording = async () => {
		try {
			const selectedSource = await desktopApi.getSelectedSource();
			if (!selectedSource) {
				alert(t("recording.selectSource"));
				return;
			}

			let screenMediaStream: MediaStream;

			const videoConstraints = {
				mandatory: {
					chromeMediaSource: CHROME_MEDIA_SOURCE,
					chromeMediaSourceId: selectedSource.id,
					maxWidth: TARGET_WIDTH,
					maxHeight: TARGET_HEIGHT,
					maxFrameRate: TARGET_FRAME_RATE,
					minFrameRate: MIN_FRAME_RATE,
				},
			};

			if (systemAudioEnabled) {
				try {
					screenMediaStream = await navigator.mediaDevices.getUserMedia({
						audio: {
							mandatory: {
								chromeMediaSource: CHROME_MEDIA_SOURCE,
								chromeMediaSourceId: selectedSource.id,
							},
						},
						video: videoConstraints,
					} as unknown as MediaStreamConstraints);
				} catch (audioErr) {
					console.warn("System audio capture failed, falling back to video-only:", audioErr);
					toast.error(t("recording.systemAudioUnavailable"));
					screenMediaStream = await navigator.mediaDevices.getUserMedia({
						audio: false,
						video: videoConstraints,
					} as unknown as MediaStreamConstraints);
				}
			} else {
				screenMediaStream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: videoConstraints,
				} as unknown as MediaStreamConstraints);
			}
			screenStream.current = screenMediaStream;

			if (microphoneEnabled) {
				try {
					microphoneStream.current = await navigator.mediaDevices.getUserMedia({
						audio: microphoneDeviceId
							? {
									deviceId: { exact: microphoneDeviceId },
									echoCancellation: true,
									noiseSuppression: true,
									autoGainControl: true,
								}
							: {
									echoCancellation: true,
									noiseSuppression: true,
									autoGainControl: true,
								},
						video: false,
					});
				} catch (audioError) {
					console.warn("Failed to get microphone access:", audioError);
					toast.error(t("recording.microphoneDenied"));
					setMicrophoneEnabled(false);
				}
			}

			if (webcamEnabled) {
				try {
					webcamStream.current = await navigator.mediaDevices.getUserMedia({
						audio: false,
						video: {
							width: { ideal: WEBCAM_TARGET_WIDTH },
							height: { ideal: WEBCAM_TARGET_HEIGHT },
							frameRate: { ideal: WEBCAM_TARGET_FRAME_RATE, max: WEBCAM_TARGET_FRAME_RATE },
						},
					});
				} catch (cameraError) {
					console.warn("Failed to get webcam access:", cameraError);
					if (webcamStream.current) {
						webcamStream.current.getTracks().forEach((track) => track.stop());
						webcamStream.current = null;
					}
					setWebcamEnabledState(false);
					toast.error(t("recording.cameraDenied"));
				}
			}

			stream.current = new MediaStream();
			const videoTrack = screenMediaStream.getVideoTracks()[0];
			if (!videoTrack) {
				throw new Error("Video track is not available.");
			}
			stream.current.addTrack(videoTrack);

			const systemAudioTrack = screenMediaStream.getAudioTracks()[0];
			const micAudioTrack = microphoneStream.current?.getAudioTracks()[0];

			if (systemAudioTrack && micAudioTrack) {
				const ctx = new AudioContext();
				mixingContext.current = ctx;
				const systemSource = ctx.createMediaStreamSource(new MediaStream([systemAudioTrack]));
				const micSource = ctx.createMediaStreamSource(new MediaStream([micAudioTrack]));
				const micGain = ctx.createGain();
				micGain.gain.value = MIC_GAIN_BOOST;
				const destination = ctx.createMediaStreamDestination();
				systemSource.connect(destination);
				micSource.connect(micGain).connect(destination);
				stream.current.addTrack(destination.stream.getAudioTracks()[0]);
			} else if (systemAudioTrack) {
				stream.current.addTrack(systemAudioTrack);
			} else if (micAudioTrack) {
				stream.current.addTrack(micAudioTrack);
			}

			try {
				await videoTrack.applyConstraints({
					frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
					width: { ideal: TARGET_WIDTH, max: TARGET_WIDTH },
					height: { ideal: TARGET_HEIGHT, max: TARGET_HEIGHT },
				});
			} catch (constraintError) {
				console.warn(
					"Unable to lock 4K/60fps constraints, using best available track settings.",
					constraintError,
				);
			}

			let {
				width = DEFAULT_WIDTH,
				height = DEFAULT_HEIGHT,
				frameRate = TARGET_FRAME_RATE,
			} = videoTrack.getSettings();

			width = Math.floor(width / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;
			height = Math.floor(height / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;

			const videoBitsPerSecond = computeBitrate(width, height);
			const mimeType = selectMimeType();

			console.log(
				`Recording at ${width}x${height} @ ${frameRate ?? TARGET_FRAME_RATE}fps using ${mimeType} / ${Math.round(
					videoBitsPerSecond / BITS_PER_MEGABIT,
				)} Mbps`,
			);

			const hasAudio = stream.current.getAudioTracks().length > 0;
			recorderOptions.current = {
				mimeType,
				videoBitsPerSecond,
				...(hasAudio
					? { audioBitsPerSecond: systemAudioTrack ? AUDIO_BITRATE_SYSTEM : AUDIO_BITRATE_VOICE }
					: {}),
			};

			// 初始化录制状态
			recordingId.current = Date.now();
			startTime.current = recordingId.current;
			segmentStartTime.current = recordingId.current;
			totalRecordedTime.current = 0;
			recordingSegments.current = [];
			allowAutoFinalize.current = true;

			await createNewRecorder();

			setRecording(true);
			setPaused(false);
			await desktopApi.setRecordingState(true);
		} catch (error) {
			console.error("Failed to start recording:", error);
			const errorMsg = error instanceof Error ? error.message : "Failed to start recording";
			if (errorMsg.includes("Permission denied") || errorMsg.includes("NotAllowedError")) {
				toast.error(t("recording.permissionDenied"));
			} else {
				toast.error(errorMsg);
			}
			setRecording(false);
			screenRecorder.current = null;
			webcamRecorder.current = null;
			teardownMedia();
		}
	};

	const toggleRecording = () => {
		recording ? stopRecording.current() : startRecording();
	};

	const pauseRecording = useCallback(async () => {
		if (!recording || paused) return;

		const activeScreenRecorder = screenRecorder.current;
		const activeWebcamRecorder = webcamRecorder.current;

		if (!activeScreenRecorder || activeScreenRecorder.recorder.state !== "recording") return;

		// 停止当前录制器
		const currentDuration = Date.now() - segmentStartTime.current;
		activeScreenRecorder.recorder.stop();

		if (activeWebcamRecorder?.recorder.state === "recording") {
			activeWebcamRecorder.recorder.stop();
		}

		// 等待并保存当前片段
		try {
			const screenBlob = await activeScreenRecorder.recordedBlobPromise;
			let webcamBlob: Blob | null = null;
			if (activeWebcamRecorder) {
				webcamBlob = await activeWebcamRecorder.recordedBlobPromise.catch(() => null);
			}

			if (screenBlob.size > 0) {
				recordingSegments.current.push({
					screenBlob,
					webcamBlob,
					duration: currentDuration,
				});
			}

			// 更新总录制时间
			totalRecordedTime.current += currentDuration;
		} catch (error) {
			console.error("Error saving segment during pause:", error);
		}

		// 清空当前录制器引用
		screenRecorder.current = null;
		webcamRecorder.current = null;

		setPaused(true);
	}, [recording, paused]);

	const resumeRecording = useCallback(async () => {
		if (!recording || !paused) return;

		// 创建新的录制器
		await createNewRecorder();

		setPaused(false);
	}, [recording, paused, createNewRecorder]);

	const restartRecording = async () => {
		if (restarting.current) return;

		const activeScreenRecorder = screenRecorder.current;
		if (
			!activeScreenRecorder ||
			(activeScreenRecorder.recorder.state !== "recording" &&
				activeScreenRecorder.recorder.state !== "paused")
		)
			return;

		const activeRecordingId = recordingId.current;

		restarting.current = true;
		discardRecordingId.current = activeRecordingId;

		const stopPromises = [
			new Promise<void>((resolve) => {
				activeScreenRecorder.recorder.addEventListener("stop", () => resolve(), { once: true });
			}),
		];

		if (
			webcamRecorder.current?.recorder.state === "recording" ||
			webcamRecorder.current?.recorder.state === "paused"
		) {
			stopPromises.push(
				new Promise<void>((resolve) => {
					webcamRecorder.current!.recorder.addEventListener("stop", () => resolve(), {
						once: true,
					});
				}),
			);
		}

		stopRecording.current();
		await Promise.all(stopPromises);

		try {
			await startRecording();
		} finally {
			restarting.current = false;
		}
	};

	return {
		recording,
		paused,
		elapsedTime,
		toggleRecording,
		pauseRecording,
		resumeRecording,
		restartRecording,
		microphoneEnabled,
		setMicrophoneEnabled,
		microphoneDeviceId,
		setMicrophoneDeviceId,
		systemAudioEnabled,
		setSystemAudioEnabled,
		webcamEnabled,
		setWebcamEnabled,
	};
}
