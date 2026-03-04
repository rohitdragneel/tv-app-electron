import React, { useEffect, useRef, useState } from 'react';

export type BackgroundMode = 'video' | 'camera' | 'image' | 'none';

interface CameraOverlayProps {
    enabled: boolean;
    backgroundMode: BackgroundMode;
}

/**
 * CameraOverlay renders the user's camera feed.
 *
 * Modes:
 * - backgroundMode='video':   Composite person over the video background using canvas
 *   segmentation (MediaPipe Selfie Segmentation). Falls back to blended camera if unavailable.
 * - backgroundMode='camera':  Full camera feed fills the screen as background.
 * - backgroundMode='none':    Camera hidden (just the dark background shows).
 * - backgroundMode='image':   Person composited over static image — handled separately;
 *   camera overlay shown with mix-blend-mode.
 */
export const CameraOverlay: React.FC<CameraOverlayProps> = ({ enabled, backgroundMode }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const segmentationRef = useRef<any>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [useSegmentation, setUseSegmentation] = useState(false);

    // Start / stop camera stream
    useEffect(() => {
        if (!enabled) {
            stopCamera();
            return;
        }
        startCamera();
        return () => stopCamera();
    }, [enabled]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(console.warn);
            }
            setCameraReady(true);
        } catch (e) {
            console.warn('[CameraOverlay] Failed to access camera:', e);
            setCameraReady(false);
        }
    };

    const stopCamera = () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCameraReady(false);
        setUseSegmentation(false);
    };

    // Load MediaPipe segmentation when mode requires person overlay
    useEffect(() => {
        if (!enabled || !cameraReady) return;
        const needsSeg = backgroundMode === 'video' || backgroundMode === 'image';
        if (!needsSeg) {
            setUseSegmentation(false);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            return;
        }
        loadSegmentation();
    }, [enabled, cameraReady, backgroundMode]);

    const loadSegmentation = async () => {
        try {
            // Dynamic import to avoid hard dependency
            const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation' as any);
            const seg = new SelfieSegmentation({
                locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`,
            });
            seg.setOptions({ modelSelection: 1 });
            seg.onResults((results: any) => drawSegmented(results));
            await seg.initialize();
            segmentationRef.current = seg;
            setUseSegmentation(true);
            runSegmentationLoop();
        } catch (e) {
            console.warn('[CameraOverlay] MediaPipe not available, using fallback:', e);
            setUseSegmentation(false);
        }
    };

    // Segmentation render loop
    const runSegmentationLoop = () => {
        const loop = async () => {
            if (!segmentationRef.current || !videoRef.current || !streamRef.current) return;
            if (videoRef.current.readyState >= 2) {
                await segmentationRef.current.send({ image: videoRef.current });
            }
            animFrameRef.current = requestAnimationFrame(loop);
        };
        animFrameRef.current = requestAnimationFrame(loop);
    };

    const drawSegmented = (results: any) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = results.image.width;
        canvas.height = results.image.height;

        // Draw segmentation mask (white = person)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);

        // Use the mask to cut out the person
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
    };

    if (!enabled) return null;

    // Mode: full camera background (camera or none)
    if (backgroundMode === 'camera') {
        return (
            <div className="fixed inset-0 z-0">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' /* mirror */ }}
                />
            </div>
        );
    }

    // Mode: video or image — overlay person on top via canvas
    if (backgroundMode === 'video' || backgroundMode === 'image') {
        return (
            <>
                {/* Hidden video feed (source for segmentation) */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="hidden"
                />
                {/* Canvas shows only the person, layered above background */}
                <div className="fixed inset-0 z-5 pointer-events-none" style={{ zIndex: 5 }}>
                    {useSegmentation ? (
                        <canvas
                            ref={canvasRef}
                            className="w-full h-full object-cover"
                            style={{ transform: 'scaleX(-1)' }}
                        />
                    ) : (
                        /* Fallback: show blended camera if segmentation unavailable */
                        <video
                            autoPlay
                            playsInline
                            muted
                            ref={(el) => { if (el && streamRef.current) el.srcObject = streamRef.current; }}
                            className="w-full h-full object-cover opacity-60"
                            style={{ transform: 'scaleX(-1)', mixBlendMode: 'screen' }}
                        />
                    )}
                </div>
            </>
        );
    }

    // Mode: none — no camera visible
    return null;
};
