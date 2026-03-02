export interface LyricLine {
    time: number; // In milliseconds
    text: string;
}

export const parseLRC = (lrcContent: string): LyricLine[] => {
    if (!lrcContent || !lrcContent.trim()) {
        return [];
    }

    const lines = lrcContent.split('\n');
    const timeRegex = /\[(\d{2}):(\d{2})(?:[:.:](\d{2,3}))?\]/;

    interface RawEntry {
        minutes: number;
        seconds: number;
        subsecRaw: string;
        time: number;
        text: string;
    }

    const rawEntries: RawEntry[] = [];

    for (const line of lines) {
        const match = timeRegex.exec(line);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const subsecRaw = match[3] || '0';
            let ms = 0;
            if (match[3]) {
                ms = parseInt(match[3].padEnd(3, '0').slice(0, 3), 10);
            }

            const timeInMs = (minutes * 60 + seconds) * 1000 + ms;
            const text = line.replace(/\[\d{2}:\d{2}[:.]\d{2,3}\]/g, '').trim();

            if (text) {
                rawEntries.push({ minutes, seconds, subsecRaw, time: timeInMs, text });
            }
        }
    }

    if (rawEntries.length === 0) {
        const plainLines = lines
            .map(l => l.replace(/\[\d{2}:\d{2}[:.]\d{2,3}\]/g, '').trim())
            .filter(l => l.length > 0);

        return plainLines.map((text, i) => ({
            time: i * 4000,
            text
        }));
    }

    rawEntries.sort((a, b) => a.time - b.time);

    let earlyCount = 0;
    for (const entry of rawEntries) {
        if (entry.minutes === 0 && entry.seconds === 0 && entry.time < 1000) {
            earlyCount++;
        } else {
            break;
        }
    }

    if (earlyCount >= 3 && earlyCount < rawEntries.length) {
        const nextTime = rawEntries[earlyCount].time;
        if (nextTime > 30000) {
            for (let i = 0; i < earlyCount; i++) {
                rawEntries[i].time = parseInt(rawEntries[i].subsecRaw, 10) * 1000;
            }
            rawEntries.sort((a, b) => a.time - b.time);
        }
    }

    return rawEntries.map(e => ({ time: e.time, text: e.text }));
};
