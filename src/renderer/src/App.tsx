import { useState, useEffect, useCallback, useRef } from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import { LyricRenderer } from './components/LyricRenderer';
import { parseLRC } from './utils/lrcParser';
import type { LyricLine } from './utils/lrcParser';
import { WebSocketService } from './services/websocket';
import type { SongConfig } from './types';
import { BackgroundVideo } from './components/BackgroundVideo';
import { ScoringBar } from './components/ScoringBar';
import { MicStatus } from './components/MicStatus';
import { SessionOverlay } from './components/SessionOverlay';
import { API_BASE_URL, WS_BASE_URL, ROOM_ID } from './constants';

const WS_BASE = `${WS_BASE_URL}/tv/${ROOM_ID}`;

const resolveUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE_URL.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
};

export default function App() {
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [position, setPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [secLyrics, setSecLyrics] = useState<LyricLine[]>([]);
  const [terLyrics, setTerLyrics] = useState<LyricLine[]>([]);
  const [currentSong, setCurrentSong] = useState<SongConfig | null>(null);

  const [score, setScore] = useState(0);
  const [players, setPlayers] = useState<string[]>([]);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [accentColor, setAccentColor] = useState('#00ffff');
  const [playCommandQueued, setPlayCommandQueued] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const positionRef = useRef(0);
  const isPlayingRef = useRef(false);
  const currentSongRef = useRef<SongConfig | null>(null);
  const scoreRef = useRef(0);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { scoreRef.current = score; }, [score]);

  const handleRecordingComplete = useCallback(async (blobUrl: string) => {
    if (!currentSong) return;

    console.log('[TV] Recording complete, uploading for scoring:', blobUrl);

    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const file = new File([blob], 'recording.webm', { type: 'audio/webm' });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('song_id', currentSong.id);
      formData.append('is_multiplayer', isMultiplayer.toString());
      formData.append('player_names', JSON.stringify(players));
      if (sessionId) formData.append('session_id', sessionId.toString());

      const res = await fetch(`${API_BASE_URL}/sessions/score`, {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (result.score !== undefined) {
        setScore(Math.round(result.score));
      }
    } catch (err) {
      console.error('[TV] Failed to upload recording for scoring:', err);
    }
  }, [currentSong, isMultiplayer, players, sessionId]);

  const [audioSettings, setAudioSettings] = useState({
    vocalHelpEnabled: true,
    vocalHelpDuration: 3000,
    vocalSoloThreshold: 20000,
  });

  const {
    isLoaded,
    loadStems,
    play,
    pause,
    seek,
    setStemVolume,
    setStemEnabled,
    isSinging,
    micLevel,
    requestPermission
  } = useAudioEngine({
    onPositionUpdate: setPosition,
    onDurationUpdate: () => { }, // Not used in UI yet
    onPlaybackStatusUpdate: setIsPlaying,
    onRecordingComplete: handleRecordingComplete,
    ...audioSettings,
  });

  const wsRef = useRef<WebSocketService | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLoaded || !wsRef.current) return;

      const song = currentSongRef.current;
      wsRef.current.send({
        type: 'STATE',
        position: positionRef.current / 1000,
        playing: isPlayingRef.current,
        stems: song?.stems,
        song_id: song?.id,
        title: song?.title,
        artist: song?.artist,
        score: scoreRef.current,
      });
    }, 200);

    return () => clearInterval(interval);
  }, [isLoaded]);

  const handleMessage = useCallback(async (data: any) => {
    console.log(`[TV] handleMessage: type=${data.type}`);
    switch (data.type) {
      case 'LOAD_SONG':
        const song: SongConfig = data.song;
        setCurrentSong(song);
        setScore(0);
        setPlayers(data.players || []);
        setIsMultiplayer(data.is_multiplayer || false);

        const rawSelection = data.song.lyricSelection || {};
        const primaryLang = rawSelection.primary || song.language || 'en';
        const secondaryLang = rawSelection.secondary || null;
        const tertiaryLang = rawSelection.tertiary || null;

        const fetchLyrics = async (lang: string | null, isPrimary = false): Promise<LyricLine[]> => {
          if (!lang) return [];

          if (data.song.lyrics) {
            const match = data.song.lyrics.find((l: any) => l.language === lang && l.content);
            if (match) return parseLRC(match.content);
          }

          if (isPrimary && data.song.lrc_content) return parseLRC(data.song.lrc_content);

          const url = isPrimary ? resolveUrl(song.lrc_url) : resolveUrl(`${song.base_url}/lyrics_${lang}.lrc`);
          try {
            const resp = await fetch(url);
            if (resp.ok) return parseLRC(await resp.text());
          } catch (e) { }
          return [];
        };

        const [pLrc, sLrc, tLrc] = await Promise.all([
          fetchLyrics(primaryLang, true),
          fetchLyrics(secondaryLang),
          fetchLyrics(tertiaryLang)
        ]);

        setLyrics(pLrc);
        setSecLyrics(sLrc);
        setTerLyrics(tLrc);

        const resolvedBaseUrl = resolveUrl(song.base_url);
        await loadStems(resolvedBaseUrl, song.stems);

        if (playCommandQueued) {
          await play();
          setPlayCommandQueued(false);
        }
        break;

      case 'PLAY':
        if (!isLoaded) setPlayCommandQueued(true);
        else await play();
        break;

      case 'PAUSE':
        await pause();
        break;

      case 'SEEK':
        await seek(data.position * 1000);
        break;

      case 'SET_STEM_VOLUME':
        await setStemVolume(data.stem, data.volume);
        break;

      case 'SET_STEM_ENABLED':
        await setStemEnabled(data.stem, data.enabled, 1.0);
        break;

      case 'SET_VIDEO_ENABLED':
        setVideoEnabled(data.enabled);
        break;

      case 'SET_ACCENT_COLOR':
        setAccentColor(data.color);
        break;

      case 'UPDATE_AUDIO_SETTINGS':
        setAudioSettings(prev => ({ ...prev, ...data }));
        break;

      case 'SESSION_RESET':
        await pause();
        setCurrentSong(null);
        setLyrics([]);
        setSecLyrics([]);
        setTerLyrics([]);
        setScore(0);
        setPlayers([]);
        setIsMultiplayer(false);
        break;
    }
  }, [isLoaded, playCommandQueued, loadStems, play, pause, seek, setStemVolume, setStemEnabled]);

  useEffect(() => {
    if (!deviceId) return;

    const WS_URL = `${WS_BASE}?device_id=${encodeURIComponent(deviceId)}`;
    console.log('[TV] Initializing WebSocket:', WS_URL);

    // Initialize with a dummy handler, it will be updated by the next useEffect
    const ws = new WebSocketService(WS_URL, () => { }, setWsStatus);
    wsRef.current = ws;
    ws.connect();

    return () => {
      console.log('[TV] Disconnecting WebSocket due to cleanup');
      ws.disconnect();
      wsRef.current = null;
    };
  }, [deviceId]);

  useEffect(() => {
    if (wsRef.current) {
      console.log('[TV] Updating WebSocket message handler');
      wsRef.current.setMessageHandler(handleMessage);
    }
  }, [handleMessage]);

  const handleDeviceReady = (id: string) => {
    setDeviceId(id);
  };

  return (
    <div className="relative w-full h-full overflow-hidden text-white font-sans selection:bg-cyan-500/30">
      <SessionOverlay onSessionActive={setSessionId} onDeviceReady={handleDeviceReady} />

      <BackgroundVideo
        apiUrl={API_BASE_URL}
        playing={isPlaying}
        videoId={currentSong?.video_id}
        videoEnabled={videoEnabled}
        songTitle={currentSong?.title}
        songArtist={currentSong?.artist}
        accentColor={accentColor}
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-10 transition-all duration-500">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 px-3 py-1 bg-white/5 rounded-2xl border border-white/10">
            <div className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : wsStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
            <span className="text-[10px] font-black font-orbitron tracking-tighter text-sky-400">{ROOM_ID}</span>
            {wsStatus !== 'connected' && <span className="text-[10px] text-yellow-500 font-bold ml-2">RECONNECTING...</span>}
          </div>

          <div className="flex flex-col">
            <h1 className="text-2xl font-black font-orbitron uppercase tracking-widest text-white shadow-black drop-shadow-lg leading-tight">
              {currentSong?.title || 'Waiting for song...'}
            </h1>
            <p className="text-sm font-medium font-orbitron text-white/40 tracking-wide mt-0.5">
              {currentSong?.artist || ''}
            </p>
          </div>

          {isMultiplayer && players.length > 0 && (
            <div className="ml-4 px-3 py-1 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
              <span className="text-xs font-black font-orbitron text-cyan-400 uppercase tracking-wider">{players.join(' & ')}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          <MicStatus
            isSinging={isSinging}
            micLevel={micLevel}
            permissionStatus="granted" // Browser handles this
            onRetry={requestPermission}
          />
          <div className="flex flex-col items-end px-4 py-2 bg-black/40 rounded-2xl border-2 transition-all duration-500" style={{ borderColor: accentColor }}>
            <span className="text-[10px] font-black font-orbitron tracking-widest" style={{ color: accentColor }}>SCORE</span>
            <span className="text-4xl font-black font-orbitron leading-none mt-1" style={{ color: accentColor, textShadow: `0 0 12px ${accentColor}80` }}>{score}</span>
          </div>
        </div>
      </div>

      {/* Main Content (Lyrics) */}
      <div className="flex-1 flex flex-col justify-center items-center h-full">
        <LyricRenderer
          primaryLyrics={lyrics}
          secondaryLyrics={secLyrics}
          tertiaryLyrics={terLyrics}
          currentPosition={position}
        />
      </div>

      {/* Right Sidebar (Scoring Bar) */}
      <div className="absolute right-6 top-[20%] bottom-[20%] flex items-center justify-center opacity-90 z-10 transition-all duration-700">
        <ScoringBar score={score} accentColor={accentColor} />
      </div>
    </div>
  );
}
