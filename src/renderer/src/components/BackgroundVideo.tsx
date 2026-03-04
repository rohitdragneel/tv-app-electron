import React, { useState, useEffect, useRef } from 'react';

interface BackgroundVideoProps {
    apiUrl: string;
    playing: boolean;
    videoId?: string | null;
    videoEnabled?: boolean;
    songTitle?: string;
    songArtist?: string;
    accentColor?: string;
}

export const BackgroundVideo: React.FC<BackgroundVideoProps> = ({
    apiUrl,
    playing,
    videoId,
    videoEnabled = true,
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
            // Match against display_name OR filename
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

    // When videoEnabled turns false, pause; when it turns true, resume if video is ready
    useEffect(() => {
        if (!videoRef.current) return;
        if (!videoEnabled) {
            videoRef.current.pause();
        } else {
            // Resume if the video is already loaded (readyState >= 3 means HAVE_FUTURE_DATA)
            if (videoRef.current.readyState >= 3) {
                videoRef.current.play().catch(e => console.warn('[BackgroundVideo] Play failed:', e));
            }
            // Otherwise onCanPlay will trigger play() when data is ready
        }
    }, [videoEnabled]);

    const handleCanPlay = () => {
        if (videoEnabledRef.current && videoRef.current) {
            videoRef.current.play().catch(e => console.warn('[BackgroundVideo] Play failed:', e));
        }
    };

    if (!videoEnabled) {
        return (
            <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]">
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center"
                    style={{
                        background: `radial-gradient(circle at center, ${accentColor}15 0%, #0a0a0a 70%)`
                    }}
                >
                    {/* Animated glow */}
                    <div
                        className={`w-[350px] h-[350px] rounded-full blur-[80px] transition-opacity duration-1000 ${playing ? 'opacity-40 animate-pulse' : 'opacity-20'}`}
                        style={{ backgroundColor: accentColor }}
                    />

                    {/* Song Info */}
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
        <div className="fixed inset-0 z-0 overflow-hidden bg-black">
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
            {/* Subtle gradient overlay instead of solid dark overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
        </div>
    );
};
