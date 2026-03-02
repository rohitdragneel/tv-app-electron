export interface StemConfig {
    enabled: boolean;
    volume: number;
}

export type StemType = 'song' | 'music' | string;

export interface LyricSelection {
    primary: string | null;
    secondary: string | null;
    tertiary: string | null;
}

export interface SongConfig {
    id: string;
    title: string;
    artist?: string;
    base_url: string;
    stems: Record<string, StemConfig>;
    lrc_url: string;
    language?: string;
    lyricSelection?: LyricSelection;
    video_id?: string | null;
}

export interface AppState {
    playing: boolean;
    position: number;
    duration: number;
    currentLyricIndex: number;
    songLoaded: boolean;
    stems: Record<string, StemConfig>;
}
