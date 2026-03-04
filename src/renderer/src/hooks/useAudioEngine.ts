import { useState, useEffect, useRef, useCallback } from 'react';
import type { StemConfig } from '../types';

interface AudioEngineProps {
    onPositionUpdate: (position: number) => void;
    onDurationUpdate: (duration: number) => void;
    onPlaybackStatusUpdate: (playing: boolean) => void;
    onRecordingComplete?: (blobUrl: string) => void;

    // Configurable help settings
    vocalHelpEnabled: boolean;
    vocalHelpDuration: number;
    vocalSoloThreshold: number;
}

interface StemPlayer {
    buffer: AudioBuffer;
    gainNode: GainNode;
    source: AudioBufferSourceNode | null;
}

export const useAudioEngine = ({
    onPositionUpdate,
    onDurationUpdate,
    onPlaybackStatusUpdate,
    onRecordingComplete,
    vocalHelpEnabled,
    vocalHelpDuration,
    vocalSoloThreshold: _vocalSoloThreshold,
}: AudioEngineProps) => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const stemsRef = useRef<Record<string, StemPlayer>>({});
    const [isLoaded, setIsLoaded] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSinging, setIsSinging] = useState(false);
    const [micLevel, setMicLevel] = useState(0);
    const [_vocalMode, setVocalMode] = useState<'help' | 'solo'>('help');

    const startTimeRef = useRef<number>(0);
    const pauseTimeRef = useRef<number>(0);
    const intervalRef = useRef<any>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const masterDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

    const vocalHelpEnabledRef = useRef(vocalHelpEnabled);
    const vocalHelpDurationRef = useRef(vocalHelpDuration);
    const isSingingRef = useRef(false);
    const singingTimerRef = useRef<number>(0);
    const userMutedRef = useRef<Record<string, boolean>>({});

    useEffect(() => { vocalHelpEnabledRef.current = vocalHelpEnabled; }, [vocalHelpEnabled]);
    useEffect(() => { vocalHelpDurationRef.current = vocalHelpDuration; }, [vocalHelpDuration]);

    const initAudioContext = () => {
        if (!audioContextRef.current) {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = ctx;
            masterDestinationRef.current = ctx.createMediaStreamDestination();
        }
        return audioContextRef.current;
    };

    const loadStems = useCallback(async (baseUrl: string, stemsConfig: Record<string, StemConfig>) => {
        setIsLoaded(false);
        setIsPlaying(false);
        const ctx = initAudioContext();

        // Cleanup existing
        Object.values(stemsRef.current).forEach(s => s.source?.stop());
        stemsRef.current = {};
        pauseTimeRef.current = 0;

        const stemKeys = Object.keys(stemsConfig).filter(k => k !== 'guide');
        console.log('[AudioEngine] Loading stems:', stemKeys, 'from', baseUrl);

        const loadPromises = stemKeys.map(async (key) => {
            const url = `${baseUrl.replace(/\/$/, '')}/${key}.wav`;
            console.log(`[AudioEngine] Fetching stem: ${key} from ${url}`);
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${key}.wav: ${response.status} ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

                const gainNode = ctx.createGain();
                gainNode.gain.value = stemsConfig[key].enabled ? stemsConfig[key].volume : 0;
                gainNode.connect(ctx.destination);
                if (masterDestinationRef.current) {
                    gainNode.connect(masterDestinationRef.current);
                }

                userMutedRef.current[key] = !stemsConfig[key].enabled;

                stemsRef.current[key] = {
                    buffer: audioBuffer,
                    gainNode,
                    source: null
                };

                if (key === 'song' || key === stemKeys[0]) {
                    onDurationUpdate(audioBuffer.duration * 1000);
                }
                console.log(`[AudioEngine] Loaded stem: ${key}`);
            } catch (err) {
                console.error(`[AudioEngine] Error loading stem ${key}:`, err);
                throw err;
            }
        });

        try {
            await Promise.all(loadPromises);
            setIsLoaded(true);
            console.log('[AudioEngine] All stems loaded successfully');
        } catch (err) {
            console.error('[AudioEngine] Failed to load one or more stems:', err);
            // We still set loaded false via initial state, but explicit here for clarity
            setIsLoaded(false);
        }
    }, [onDurationUpdate]);

    const play = useCallback(async () => {
        const ctx = initAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();

        // Ensure mic is connected to master destination if active
        if (micStreamRef.current && masterDestinationRef.current) {
            const micSource = ctx.createMediaStreamSource(micStreamRef.current);
            micSource.connect(masterDestinationRef.current);
        }

        const offset = pauseTimeRef.current;
        const startTime = ctx.currentTime;
        startTimeRef.current = startTime - offset;

        Object.entries(stemsRef.current).forEach(([_key, stem]) => {
            const source = ctx.createBufferSource();
            source.buffer = stem.buffer;
            source.connect(stem.gainNode);
            source.start(startTime, offset);
            stem.source = source;
        });

        setIsPlaying(true);
        onPlaybackStatusUpdate(true);

        // Start Mic & Recording
        startMic();

        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            const currentPos = ctx.currentTime - startTimeRef.current;
            onPositionUpdate(currentPos * 1000);

            // Vocal Help Logic
            if (vocalHelpEnabledRef.current && isSingingRef.current) {
                singingTimerRef.current += 100;
                if (singingTimerRef.current > vocalHelpDurationRef.current) {
                    setVocalMode('solo');
                    setStemEnabled('song', false, 1.0);
                }
            } else if (vocalHelpEnabledRef.current) {
                singingTimerRef.current = 0;
                setVocalMode('help');
                if (!userMutedRef.current['song']) {
                    setStemEnabled('song', true, 1.0);
                }
            }

            // End tracking
            const masterKey = stemsRef.current['song'] ? 'song' : Object.keys(stemsRef.current)[0];
            if (stemsRef.current[masterKey] && currentPos >= stemsRef.current[masterKey].buffer.duration) {
                pause();
            }
        }, 100);
    }, [onPlaybackStatusUpdate, onPositionUpdate]);

    const pause = useCallback(() => {
        if (!isPlaying) return;
        const ctx = audioContextRef.current;
        if (ctx) {
            pauseTimeRef.current = ctx.currentTime - startTimeRef.current;
        }

        Object.values(stemsRef.current).forEach(s => {
            s.source?.stop();
            s.source = null;
        });

        stopMic();
        setIsPlaying(false);
        onPlaybackStatusUpdate(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
    }, [isPlaying, onPlaybackStatusUpdate]);

    const seek = useCallback((positionMs: number) => {
        const wasPlaying = isPlaying;
        if (wasPlaying) pause();
        pauseTimeRef.current = positionMs / 1000;
        if (wasPlaying) play();
        onPositionUpdate(positionMs);
    }, [isPlaying, pause, play, onPositionUpdate]);

    const setStemVolume = useCallback((key: string, volume: number) => {
        const stem = stemsRef.current[key];
        if (stem) {
            stem.gainNode.gain.setTargetAtTime(volume, audioContextRef.current?.currentTime || 0, 0.1);
        }
    }, []);

    const setStemEnabled = useCallback((key: string, enabled: boolean, defaultVolume: number) => {
        const stem = stemsRef.current[key];
        if (stem) {
            userMutedRef.current[key] = !enabled;
            const vol = enabled ? defaultVolume : 0;
            stem.gainNode.gain.setTargetAtTime(vol, audioContextRef.current?.currentTime || 0, 0.1);
        }
    }, []);

    const startMic = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;

            const ctx = initAudioContext();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const updateMicLevel = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const avg = sum / bufferLength;
                const normalized = Math.min(1, avg / 128);
                setMicLevel(normalized);
                const isLoud = normalized > 0.15; // Threshold
                setIsSinging(isLoud);
                isSingingRef.current = isLoud;
                if (micStreamRef.current) requestAnimationFrame(updateMicLevel);
            };
            updateMicLevel();

            // Recording
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            recordedChunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                onRecordingComplete?.(url);
            };
            recorder.start();

        } catch (err) {
            console.error('Failed to access microphone', err);
        }
    };

    const stopMic = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }
        analyserRef.current = null;
        setMicLevel(0);
        setIsSinging(false);
        isSingingRef.current = false;
    };

    return {
        isLoaded,
        isPlaying,
        loadStems,
        play,
        pause,
        seek,
        setStemVolume,
        setStemEnabled,
        isSinging,
        micLevel,
        getMixedAudioStream: () => masterDestinationRef.current?.stream || null,
        requestPermission: async () => true // Browser handles this
    };
};
