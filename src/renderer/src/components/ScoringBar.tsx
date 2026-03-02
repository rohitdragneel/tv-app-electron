import React from 'react';

interface ScoringBarProps {
    score: number;
    accentColor?: string;
}

export const ScoringBar: React.FC<ScoringBarProps> = ({ score, accentColor = '#00ffff' }) => {
    const normalizedScore = Math.min(Math.max(score, 0), 100);

    return (
        <div className="flex flex-row items-start w-16 h-[350px]">
            {/* Labels */}
            <div className="flex flex-col justify-between h-full pr-1.5 items-end py-0">
                {[100, 90, 80, 70, 60, 50].map((val) => (
                    <span key={val} className="text-white/80 text-[10px] font-bold font-sans">
                        {val}
                    </span>
                ))}
            </div>

            {/* Track */}
            <div className="relative w-4 h-full bg-white/10 rounded-sm border border-white/30">
                {/* Score Fill */}
                <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out rounded-sm"
                    style={{
                        height: `${normalizedScore}%`,
                        backgroundColor: accentColor,
                        boxShadow: `0 0 10px ${accentColor}`
                    }}
                />

                {/* Marker lines */}
                {[...Array(11)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute left-[-2px] right-[-2px] h-[1px] bg-white/50"
                        style={{ bottom: `${i * 10}%` }}
                    />
                ))}

                {/* Triangle indicator */}
                <div
                    className="absolute right-[-25px] w-[25px] h-5 flex justify-center items-center transition-all duration-500 ease-out"
                    style={{ bottom: `calc(${normalizedScore}% - 10px)` }}
                >
                    <div
                        className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] -rotate-90"
                        style={{ borderBottomColor: accentColor }}
                    />
                </div>
            </div>
        </div>
    );
};
