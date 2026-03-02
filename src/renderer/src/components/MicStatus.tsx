import React from 'react';
import { Mic, MicOff, AlertCircle, Settings } from 'lucide-react';

interface MicStatusProps {
    isSinging: boolean;
    micLevel?: number; // 0 to 1
    permissionStatus: 'granted' | 'denied' | 'undetermined' | string;
    canAskAgain?: boolean;
    onRetry?: () => void;
}

export const MicStatus: React.FC<MicStatusProps> = ({
    isSinging,
    micLevel = 0,
    permissionStatus,
    canAskAgain = true,
    onRetry
}) => {
    const handlePress = () => {
        if (onRetry) onRetry();
    };

    if (permissionStatus === 'denied') {
        return (
            <button
                onClick={handlePress}
                className="flex items-center gap-4 px-4 py-2.5 rounded-3xl bg-black/80 border-3 border-red-500/50 outline-none focus:border-white focus:bg-white/30 transition-all hover:opacity-70 group"
            >
                {canAskAgain ? (
                    <MicOff className="text-red-600" size={18} />
                ) : (
                    <Settings className="text-red-600" size={18} />
                )}
                <div className="text-left">
                    <p className="text-white/90 text-sm font-bold tracking-widest font-mono">
                        {canAskAgain ? 'MIC DENIED' : 'BLOCKED'}
                    </p>
                    <p className="text-[10px] font-bold mt-0.5 group-focus:text-white text-red-600 uppercase">
                        {canAskAgain ? 'Click TO RETRY' : 'CHECK BROWSER SETTINGS'}
                    </p>
                </div>
            </button>
        );
    }

    if (permissionStatus === 'undetermined') {
        return (
            <div className="flex items-center gap-4 px-4 py-2.5 rounded-3xl bg-black/80 border-3 border-yellow-500/50">
                <AlertCircle className="text-yellow-500" size={16} />
                <p className="text-white/90 text-sm font-bold tracking-widest font-mono">MIC REQ...</p>
            </div>
        );
    }

    return (
        <div className={`
      flex items-center gap-4 px-4 py-2.5 rounded-3xl bg-black/80 border-3 transition-all duration-300
      ${isSinging ? 'border-green-500/50 bg-green-500/10' : 'border-white/10 opacity-80 animate-pulse'}
    `}>
            <div className="flex items-center gap-2">
                <Mic className={isSinging ? "text-green-500" : "text-white/50"} size={16} />
                <div className="flex items-end gap-0.5 h-4 w-6">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className="w-1 rounded-sm transition-all"
                            style={{
                                height: `${30 + (i * 15)}%`,
                                backgroundColor: micLevel > (i / 6)
                                    ? (isSinging ? "#22c55e" : "#fff")
                                    : "rgba(255,255,255,0.1)"
                            }}
                        />
                    ))}
                </div>
            </div>
            <p className={`text-sm font-bold tracking-widest font-mono ${isSinging ? 'text-green-500' : 'text-white/90'}`}>
                {isSinging ? 'SINGING!' : 'MIC READY'}
            </p>
        </div>
    );
};
