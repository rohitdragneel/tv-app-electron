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
        <div className="w-full flex flex-col items-center px-16 pb-8 text-center">
            <div className="flex flex-col items-center w-[90%]">
                {/* Secondary language */}
                {currentSecondary && (
                    <p className="text-white/70 text-xl font-semibold mb-2 font-sans drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
                        {currentSecondary}
                    </p>
                )}

                {/* Tertiary language */}
                {currentTertiary && (
                    <p className="text-white/50 text-base font-medium mb-1.5 font-sans drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                        {currentTertiary}
                    </p>
                )}

                {/* Primary lyrics */}
                <h1 className="text-white text-[42px] leading-[52px] font-black drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] uppercase tracking-wide">
                    {currentPrimary || '♪'}
                </h1>

                {/* Next line preview */}
                {nextPrimary && (
                    <p className="text-white/30 text-2xl font-semibold mt-4 font-sans drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                        {nextPrimary}
                    </p>
                )}
            </div>
        </div>
    );
};
