import React, { useMemo } from 'react';
import type { LyricLine } from '../utils/lrcParser';

interface LyricRendererProps {
    primaryLyrics: LyricLine[];
    secondaryLyrics?: LyricLine[];
    tertiaryLyrics?: LyricLine[];
    currentPosition: number;
}

const findActiveIndex = (lyrics: LyricLine[], position: number) => {
    for (let i = lyrics.length - 1; i >= 0; i--) {
        if (position >= lyrics[i].time) return i;
    }
    return -1;
};

export const LyricRenderer: React.FC<LyricRendererProps> = ({
    primaryLyrics,
    secondaryLyrics = [],
    tertiaryLyrics = [],
    currentPosition
}) => {
    const primaryIndex = useMemo(
        () => findActiveIndex(primaryLyrics, currentPosition),
        [primaryLyrics, currentPosition]
    );

    const currentPrimary = primaryIndex >= 0 ? primaryLyrics[primaryIndex]?.text : '';
    const currentSecondary = primaryIndex >= 0 && secondaryLyrics[primaryIndex]
        ? secondaryLyrics[primaryIndex]?.text : '';
    const currentTertiary = primaryIndex >= 0 && tertiaryLyrics[primaryIndex]
        ? tertiaryLyrics[primaryIndex]?.text : '';

    const nextPrimary = primaryIndex >= 0 && primaryIndex + 1 < primaryLyrics.length
        ? primaryLyrics[primaryIndex + 1]?.text : '';

    if (primaryLyrics.length === 0) return null;

    return (
        <div className="absolute bottom-[60px] left-0 right-0 flex flex-col items-center px-10">
            <div className="flex flex-col items-center w-[85%] text-center">
                {/* Secondary language */}
                {currentSecondary && (
                    <p className="text-white/70 text-xl font-semibold mb-1.5 font-sans drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
                        {currentSecondary}
                    </p>
                )}

                {/* Tertiary language */}
                {currentTertiary && (
                    <p className="text-white/50 text-base font-medium mb-1 font-sans drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                        {currentTertiary}
                    </p>
                )}

                {/* Primary lyrics */}
                <h1 className="text-white text-[38px] leading-[48px] font-black drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] uppercase">
                    {currentPrimary || '♪'}
                </h1>

                {/* Next line preview */}
                {nextPrimary && (
                    <p className="text-white/30 text-[22px] font-semibold mt-3 font-sans drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                        {nextPrimary}
                    </p>
                )}
            </div>
        </div>
    );
};
