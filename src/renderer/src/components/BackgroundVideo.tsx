import React, { useState, useEffect, useRef } from 'react';
import type { BackgroundMode } from './CameraOverlay';

interface BackgroundVideoProps {
    apiUrl: string;
    playing: boolean;
    videoId?: string | null;
    videoEnabled?: boolean;
    backgroundMode?: BackgroundMode;
    backgroundImage?: string | null;
    songTitle?: string;
    songArtist?: string;
    accentColor?: string;
}

const BACKGROUND_IMAGES = [
    { id: 'bg_01', label: 'Karaoke Stage', src: '/backgrounds/bg_01.png' },
    { id: 'bg_02', label: 'Neon Bar', src: '/backgrounds/bg_02.png' },
    { id: 'bg_03', label: 'Sound Waves', src: '/backgrounds/bg_03.png' },
    { id: 'bg_04', label: 'Aurora', src: '/backgrounds/bg_04.png' },
    { id: 'bg_05', label: 'Synthwave', src: '/backgrounds/bg_05.png' },
    { id: 'bg_06', label: 'Rock Concert', src: '/backgrounds/bg_06.png' },
    { id: 'bg_07', label: 'Disco Night', src: '/backgrounds/bg_07.jpg' },
    { id: 'bg_08', label: 'Club Lights', src: '/backgrounds/bg_08.jpg' },
    { id: 'bg_09', label: 'Galaxy', src: '/backgrounds/bg_09.jpg' },
    { id: 'bg_10', label: 'Festival', src: '/backgrounds/bg_10.jpg' },
    { id: 'bg_11', label: 'Pop Stage', src: '/backgrounds/bg_11.jpg' },
    { id: 'bg_12', label: 'Live Show', src: '/backgrounds/bg_12.jpg' },
    { id: 'bg_13', label: 'Spotlights', src: '/backgrounds/bg_13.jpg' },
    { id: 'bg_14', label: 'Piano Bar', src: '/backgrounds/bg_14.jpg' },
    { id: 'bg_15', label: 'Night Club', src: '/backgrounds/bg_15.jpg' },
];

// Export for use in tablet settings screen metadata
export { BACKGROUND_IMAGES };

export const BackgroundVideo: React.FC<BackgroundVideoProps> = ({
    apiUrl,
    playing,
    videoId,
    videoEnabled = true,
    backgroundMode = 'video',
    backgroundImage = null,
    songTitle,
    songArtist,
    accentColor = '#00ffff'
}) => {
    const [videos, setVideos] = useState<{ display_name: string, filename: string, url: string }[]>([]);
    const [url, setUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const lastRandomIndex = useRef<number>(-1);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const fetchUrl = `${apiUrl.replace(/\/$/, '')}/videos`;
        console.log('[BackgroundVideo] Fetching videos from:', fetchUrl);
        fetch(fetchUrl)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res.json();
            })
            .then(data => {
                console.log('[BackgroundVideo] Loaded videos count:', data.length);
                setVideos(data);
                setIsLoading(false);
            })
            .catch(e => {
                console.error('[BackgroundVideo] Failed to fetch videos:', e);
                setIsLoading(false);
            });
    }, [apiUrl]);

    const pickRandom = () => {
        if (videos.length === 0) return;
        let index = Math.floor(Math.random() * videos.length);
        if (index === lastRandomIndex.current && videos.length > 1) {
            index = (index + 1) % videos.length;
        }
        lastRandomIndex.current = index;
        const videoUrl = videos[index].url.startsWith('http')
            ? videos[index].url
            : `${apiUrl.replace(/\/$/, '')}${videos[index].url}`;
        setUrl(videoUrl);
    };

    useEffect(() => {
        if (videos.length === 0) return;

        if (videoId) {
            const video = videos.find(v => v.display_name === videoId || v.filename === videoId);
            if (video) {
                const videoUrl = video.url.startsWith('http')
                    ? video.url
                    : `${apiUrl.replace(/\/$/, '')}${video.url}`;
                setUrl(videoUrl);
            } else {
                console.warn(`[BackgroundVideo] Video not found: ${videoId}, picking random.`);
                pickRandom();
            }
        } else {
            pickRandom();
        }
    }, [videoId, videos, apiUrl]);

    const videoEnabledRef = useRef(videoEnabled);
    useEffect(() => { videoEnabledRef.current = videoEnabled; }, [videoEnabled]);

    useEffect(() => {
        if (!videoRef.current) return;
        if (!videoEnabled || backgroundMode !== 'video') {
            videoRef.current.pause();
        } else {
            if (videoRef.current.readyState >= 3) {
                videoRef.current.play().catch(e => console.warn('[BackgroundVideo] Play failed:', e));
            }
        }
    }, [videoEnabled, backgroundMode]);

    const handleCanPlay = () => {
        if (videoEnabledRef.current && backgroundMode === 'video' && videoRef.current) {
            videoRef.current.play().catch(e => console.warn('[BackgroundVideo] Play failed:', e));
        }
    };

    // ── Static image mode ──
    if (backgroundMode === 'image' && backgroundImage) {
        const imgEntry = BACKGROUND_IMAGES.find(b => b.id === backgroundImage);
        const imgSrc = imgEntry?.src || backgroundImage;
        return (
            <div className="fixed inset-0 z-0 overflow-hidden bg-black w-screen h-screen">
                <img
                    src={imgSrc}
                    alt="Background"
                    className="w-full h-full object-cover opacity-85"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
            </div>
        );
    }

    // ── Camera or None mode — dark base (CameraOverlay renders itself) ──
    if (backgroundMode === 'camera' || backgroundMode === 'none') {
        return <div className="fixed inset-0 z-0 bg-[#050505]" />;
    }

    // ── Video disabled fallback ──
    if (!videoEnabled || backgroundMode !== 'video') {
        return (
            <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a] w-screen h-screen">
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center"
                    style={{
                        background: `radial-gradient(circle at center, ${accentColor}15 0%, #0a0a0a 70%)`
                    }}
                >
                    <div
                        className={`w-[350px] h-[350px] rounded-full blur-[80px] transition-opacity duration-1000 ${playing ? 'opacity-40 animate-pulse' : 'opacity-20'}`}
                        style={{ backgroundColor: accentColor }}
                    />

                    <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
                        <h2
                            className="text-[42px] font-black text-white uppercase tracking-wider drop-shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                            style={{ textShadow: `0 0 20px ${accentColor}60` }}
                        >
                            {songTitle || '♪'}
                        </h2>
                        {songArtist && (
                            <p className="text-xl text-white/50 font-medium mt-4 tracking-wide font-sans">
                                {songArtist}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading || videos.length === 0 || !url) {
        return <div className="fixed inset-0 z-0 bg-black" />;
    }

    return (
        <div className="fixed inset-0 z-0 overflow-hidden bg-black w-screen h-screen">
            <video
                ref={videoRef}
                src={url}
                muted
                loop
                playsInline
                autoPlay
                className="w-full h-full object-cover opacity-80"
                onCanPlay={handleCanPlay}
                onEnded={() => !videoId && pickRandom()}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
        </div>
    );
};
