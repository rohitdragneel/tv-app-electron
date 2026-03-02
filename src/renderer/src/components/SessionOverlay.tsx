import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { API_BASE_URL, ROOM_ID } from '../constants';

const DEVICE_ID_KEY = '@karaoke_tv_device_id';
const TV_NAME_KEY = '@karaoke_tv_name';

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

interface SessionOverlayProps {
    onSessionActive?: (sessionId: number) => void;
    onDeviceReady?: (deviceId: string) => void;
}

export const SessionOverlay: React.FC<SessionOverlayProps> = ({ onSessionActive, onDeviceReady }) => {
    const [setupDone, setSetupDone] = useState(false);
    const [sessionCode, setSessionCode] = useState<string | null>(null);
    const [isExpired, setIsExpired] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [cooldown, setCooldown] = useState(0);

    const deviceIdRef = useRef<string | null>(null);

    useEffect(() => {
        const initDevice = async () => {
            try {
                let storedId = localStorage.getItem(DEVICE_ID_KEY);
                let storedName = localStorage.getItem(TV_NAME_KEY);

                if (storedId && storedName) {
                    deviceIdRef.current = storedId;
                    onDeviceReady?.(storedId);
                    setSetupDone(true);
                    return;
                }

                let newDeviceId = storedId || generateUUID();
                localStorage.setItem(DEVICE_ID_KEY, newDeviceId);

                const autoName = `Electron TV ${newDeviceId.slice(0, 4).toUpperCase()}`;
                localStorage.setItem(TV_NAME_KEY, autoName);

                await fetch(`${API_BASE_URL}/sessions/register-tv`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device_id: newDeviceId, tv_name: autoName }),
                });

                deviceIdRef.current = newDeviceId;
                onDeviceReady?.(newDeviceId);
                setSetupDone(true);
            } catch (e) {
                console.error('[SessionOverlay] Failed during TV registration:', e);
                const fallbackId = generateUUID();
                deviceIdRef.current = fallbackId;
                onDeviceReady?.(fallbackId);
                setSetupDone(true);
            }
        };
        initDevice();
    }, []);

    const fetchSession = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/sessions/active?room_id=${ROOM_ID}`);
            if (!response.ok) throw new Error('Failed to fetch session');

            const data = await response.json();
            if (data.id) {
                setSessionCode(data.code);
                onSessionActive?.(data.id);

                if (data.status === 'ACTIVE' && data.expires_at) {
                    const expiry = new Date(data.expires_at).getTime();
                    const now = new Date().getTime();
                    const diff = Math.max(0, Math.floor((expiry - now) / 1000));

                    if (diff <= 0) {
                        handleExpiration();
                    } else {
                        setTimeLeft(diff);
                        setIsExpired(false);
                    }
                } else {
                    setTimeLeft(null);
                    setIsExpired(false);
                }
            } else {
                generateNewSession();
            }
        } catch (error) {
            console.error('Failed to fetch session:', error);
        }
    };

    const generateNewSession = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/sessions/generate-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room_id: ROOM_ID })
            });
            const data = await response.json();
            setSessionCode(data.code);
            onSessionActive?.(data.id);
            setTimeLeft(null);
            setIsExpired(false);
        } catch (error) {
            console.error('Failed to generate session:', error);
        }
    };

    const handleExpiration = () => {
        setIsExpired(true);
        setSessionCode(null);
        setCooldown(5 * 60);
    };

    useEffect(() => {
        if (!setupDone) return;
        fetchSession();
        const interval = setInterval(() => {
            if (timeLeft !== null && timeLeft > 0) {
                setTimeLeft(prev => (prev !== null ? prev - 1 : null));
            } else if (timeLeft === 0 && !isExpired) {
                handleExpiration();
            }

            if (cooldown > 0) {
                setCooldown(prev => prev - 1);
            } else if (cooldown === 0 && isExpired) {
                generateNewSession();
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [setupDone, timeLeft, cooldown, isExpired]);

    if (!setupDone || (!sessionCode && !isExpired)) {
        return (
            <div className="fixed top-4 left-4 z-[1000]">
                <div className="bg-black/40 p-2.5 rounded-xl border border-sky-400/30 flex flex-col items-center backdrop-blur-sm">
                    <span className="text-sky-400 text-[10px] font-black mb-1 opacity-80 uppercase tracking-widest">FETCHING CODE...</span>
                    <div className="w-[60px] h-[60px] flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
                    </div>
                </div>
            </div>
        );
    }

    if (isExpired) {
        return (
            <div className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center z-[2000]">
                <h1 className="text-[#ff4b2b] text-6xl font-black mb-5 tracking-tighter">SESSION EXPIRED</h1>
                <p className="text-white text-2xl font-mono">
                    New code in {Math.floor(cooldown / 60)}:{(cooldown % 60).toString().padStart(2, '0')}
                </p>
            </div>
        );
    }

    return (
        <div className="fixed top-4 left-4 z-[1000]">
            <div className="bg-black/40 p-2.5 rounded-xl border border-sky-400/30 flex flex-col items-center backdrop-blur-sm">
                <span className="text-sky-400 text-[10px] font-black mb-1 opacity-80 uppercase tracking-widest">CONNECT</span>
                <div className="p-1 bg-white/5 rounded-md mb-1">
                    <QRCodeSVG value={sessionCode!} size={60} color="white" bgColor="transparent" includeMargin={false} />
                </div>
                <h2 className="text-white text-2xl font-black tracking-[4px] my-1">{sessionCode}</h2>
                {timeLeft !== null && (
                    <span className="text-white/50 text-[10px] font-mono leading-none">
                        {Math.floor(timeLeft / 3600)}:{Math.floor((timeLeft % 3600) / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </span>
                )}
                {timeLeft === null && sessionCode && (
                    <span className="text-sky-400/40 text-[8px] font-black uppercase tracking-tighter">UNLIMITED</span>
                )}
            </div>
        </div>
    );
};
