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
  const [duration, setDuration] = useState(0);

  const [score, setScore] = useState(0);
  const [players, setPlayers] = useState<string[]>([]);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [accentColor, setAccentColor] = useState('#00ffff');
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const positionRef = useRef(0);
  const isPlayingRef = useRef(false);
  const currentSongRef = useRef<SongConfig | null>(null);
  const durationRef = useRef(0);
  const isLoadedRef = useRef(false);
  const scoreRef = useRef(0);
  const playCommandQueuedRef = useRef(false);

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
    onDurationUpdate: setDuration,
    onPlaybackStatusUpdate: setIsPlaying,
    onRecordingComplete: handleRecordingComplete,
    ...audioSettings,
  });

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { isLoadedRef.current = isLoaded; }, [isLoaded]);
  useEffect(() => { scoreRef.current = score; }, [score]);

  const wsRef = useRef<WebSocketService | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!wsRef.current) return;

      const song = currentSongRef.current;
      wsRef.current.send({
        type: 'STATE',
        is_loaded: isLoadedRef.current,
        position: positionRef.current / 1000,
        duration: durationRef.current / 1000,
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
    try {
      console.log(`[TV] handleMessage: type=${data.type}`, data);
      switch (data.type) {
        case 'JOIN_SUCCESS':
          console.log(`[TV] Successfully joined room: ${data.roomId}`);
          break;

        case 'ERROR':
          console.error(`[TV] Backend error: ${data.message}`);
          break;

        case 'LOAD_SONG':
          const song: SongConfig = data.song;
          console.log(`[TV] Loading song: ${song.title} (${song.id})`);
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
              const contentType = resp.headers.get('content-type') || '';
              if (resp.ok && !contentType.includes('text/html')) {
                return parseLRC(await resp.text());
              }
            } catch (e) {
              console.warn(`[TV] Failed to fetch lyrics for ${lang}:`, e);
            }
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
          console.log(`[TV] Loading audio stems from: ${resolvedBaseUrl}`);
          await loadStems(resolvedBaseUrl, song.stems);

          if (playCommandQueuedRef.current) {
            console.log('[TV] Executing queued PLAY command after load');
            await play();
            playCommandQueuedRef.current = false;
          }
          break;

        case 'PLAY':
          if (!isLoadedRef.current) {
            console.log('[TV] PLAY command received while loading, queueing...');
            playCommandQueuedRef.current = true;
          } else {
            console.log('[TV] Playing...');
            await play();
          }
          break;

        case 'PAUSE':
          console.log('[TV] Pausing...');
          await pause();
          break;

        case 'SEEK':
          console.log(`[TV] Seeking to: ${data.position}s`);
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
          console.log('[TV] Session reset');
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
    } catch (err) {
      console.error('[TV] Error in handleMessage:', err);
    }
  }, [loadStems, play, pause, seek, setStemVolume, setStemEnabled]);

  useEffect(() => {
    if (!deviceId) return;

    const WS_URL = `${WS_BASE}?device_id=${encodeURIComponent(deviceId)}`;
    console.log('[TV] Initializing WebSocket:', WS_URL);

    // Initialize with a dummy handler, it will be updated by the next useEffect
    const ws = new WebSocketService(WS_URL, handleMessage, setWsStatus);
    wsRef.current = ws;
    ws.connect();

    return () => {
      console.log('[TV] Disconnecting WebSocket due to cleanup');
      ws.disconnect();
      wsRef.current = null;
    };
  }, [deviceId, handleMessage]);


  const handleDeviceReady = (id: string) => {
    setDeviceId(id);
  };

  return (
    <div className="w-full h-full overflow-hidden text-white font-sans flex flex-col">
      {/* Background (fills full screen behind everything) */}
      <BackgroundVideo
        apiUrl={API_BASE_URL}
        playing={isPlaying}
        videoId={currentSong?.video_id}
        videoEnabled={videoEnabled}
        songTitle={currentSong?.title}
        songArtist={currentSong?.artist}
        accentColor={accentColor}
      />

      {/* Session overlay (QR code, fixed top-left) */}
      <SessionOverlay onSessionActive={setSessionId} onDeviceReady={handleDeviceReady} />

      {/* ── TOP HEADER BAR ── */}
      <div className="relative z-10 grid grid-cols-3 items-center px-6 py-4 bg-gradient-to-b from-black/80 to-transparent">
        {/* LEFT: Room status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10 backdrop-blur-md">
            <div className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-green-400 shadow-[0_0_8px_#4ade80]' : wsStatus === 'error' ? 'bg-red-500' : 'bg-yellow-400 animate-pulse'}`} />
            <span className="text-[11px] font-black font-orbitron tracking-wider text-sky-400 uppercase">{ROOM_ID}</span>
          </div>
          {wsStatus !== 'connected' && (
            <span className="text-[10px] text-yellow-400 font-bold animate-pulse tracking-tighter">RECONNECTING...</span>
          )}
        </div>

        {/* CENTER: Song info (Prominent) */}
        <div className="flex flex-col items-center text-center">
          {currentSong ? (
            <>
              <h1 className="text-[28px] font-black font-orbitron uppercase tracking-[0.2em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] leading-tight max-w-[600px] truncate">
                {currentSong.title}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm font-semibold text-white/60 tracking-[0.15em] uppercase border-r border-white/20 pr-3">
                  {currentSong.artist}
                </p>
                {isMultiplayer && players.length > 0 && (
                  <span className="text-[10px] font-black font-orbitron text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    {players.join(' & ')}
                  </span>
                )}
              </div>
            </>
          ) : (
            <h1 className="text-xl font-black font-orbitron uppercase tracking-[0.3em] text-white/30 animate-pulse">
              Waiting for song...
            </h1>
          )}
        </div>

        {/* RIGHT: Score */}
        <div className="flex justify-end">
          <div className="flex flex-col items-end px-5 py-2 bg-black/40 rounded-2xl border border-white/10 backdrop-blur-md transition-all duration-500" style={{ borderColor: accentColor + '40' }}>
            <span className="text-[9px] font-black font-orbitron tracking-[3px] mb-0.5" style={{ color: accentColor }}>SCORE</span>
            <span className="text-5xl font-black font-orbitron leading-none tabular-nums" style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}80` }}>
              {score}
            </span>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      {/* Side-by-side: lyrics (takes up all available width minus scoring bar) */}
      <div className="relative z-10 flex flex-1 min-h-0">
        {/* Lyrics — centered in main area */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-0">
          <LyricRenderer
            primaryLyrics={lyrics}
            secondaryLyrics={secLyrics}
            tertiaryLyrics={terLyrics}
            currentPosition={position}
          />
        </div>

        {/* Scoring bar — fixed right strip, does NOT overlap lyrics */}
        <div className="flex flex-col items-center justify-center w-16 px-1 py-8 flex-shrink-0">
          <ScoringBar score={score} accentColor={accentColor} />
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="relative z-10 flex items-center justify-end px-6 py-3 bg-gradient-to-t from-black/70 to-transparent">
        <MicStatus
          isSinging={isSinging}
          micLevel={micLevel}
          permissionStatus="granted"
          onRetry={requestPermission}
        />
      </div>
    </div>
  );
}
