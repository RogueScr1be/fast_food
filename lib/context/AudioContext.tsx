import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import type { AudioTrack, AudioTheme } from '../seeds/audio';
import {
  getAudioMutedState,
  setAudioMutedState,
  getAudioTheme,
  setAudioTheme,
} from '../utils/storage';
import { getTracksByTheme, getNextTrackInTheme, defaultTheme } from '../seeds/audio';

export type AudioSourceContext = 'mood' | 'pack' | 'manual' | 'default';

export interface AudioContextType {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  isMuted: boolean;
  currentTheme: AudioTheme;
  sourceContext: AudioSourceContext;

  play(): Promise<void>;
  pause(): Promise<void>;
  skip(): Promise<void>;
  mute(): Promise<void>;
  unmute(): Promise<void>;
  toggleMute(): Promise<void>;
  changeTheme(theme: AudioTheme): Promise<void>;
  setTrack(track: AudioTrack, source: AudioSourceContext): Promise<void>;
}

export const AudioContext = createContext<AudioContextType | null>(null);

interface AudioProviderProps {
  children: React.ReactNode;
}

export function AudioProvider({ children }: AudioProviderProps) {
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<AudioTheme>(defaultTheme);
  const [sourceContext, setSourceContext] = useState<AudioSourceContext>('default');

  const soundRef = useRef<Audio.Sound | null>(null);
  const initializingRef = useRef(false);

  // Initialize persistent state on mount
  useEffect(() => {
    const initializeState = async () => {
      try {
        const [mutedState, theme] = await Promise.all([
          getAudioMutedState(),
          getAudioTheme(),
        ]);
        setIsMuted(mutedState);
        setCurrentTheme((theme as AudioTheme) || defaultTheme);
      } catch (error) {
        console.error('Error initializing audio state:', error);
      }
    };

    initializeState();
  }, []);

  // Configure audio session on mount
  useEffect(() => {
    const configureAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          staysActiveInBackground: true,
          interruptionHandlingMode: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
          shouldDuckAndroid: true,
          playThroughEarpieceByDefault: false,
        });
      } catch (error) {
        console.error('Error configuring audio:', error);
      }
    };

    configureAudio();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(console.error);
        soundRef.current = null;
      }
    };
  }, []);

  const loadAndPlayTrack = useCallback(
    async (track: AudioTrack, startPlaying: boolean = true) => {
      try {
        // Unload existing sound
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }

        // Load new track
        const sound = new Audio.Sound();

        // Handle status updates
        const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            if (status.didJustFinish) {
              // Track finished: loop or advance
              handleTrackEnd();
            }
          }
        };

        sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
        await sound.loadAsync(track.uri);

        soundRef.current = sound;
        setCurrentTrack(track);

        if (startPlaying && !isMuted) {
          await sound.playAsync();
          setIsPlaying(true);

          // Fade in if specified
          if (track.fadeInDuration) {
            const fadeSteps = 10;
            const stepDuration = track.fadeInDuration / fadeSteps;
            for (let i = 1; i <= fadeSteps; i++) {
              await new Promise(resolve => setTimeout(resolve, stepDuration));
              const volume = (i / fadeSteps) * 0.3; // Fade to 0.3 max
              await sound.setVolumeAsync(volume);
            }
          }
        }
      } catch (error) {
        console.error('Error loading/playing track:', error);
      }
    },
    [isMuted]
  );

  const handleTrackEnd = useCallback(async () => {
    if (!currentTrack) return;

    // Try to advance to next track in theme
    const nextTrack = getNextTrackInTheme(currentTrack.id, currentTheme);

    if (nextTrack) {
      await loadAndPlayTrack(nextTrack, true);
    } else {
      // Loop current track
      if (soundRef.current) {
        await soundRef.current.replayAsync();
      }
    }
  }, [currentTrack, currentTheme, loadAndPlayTrack]);

  const play = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error('Error pausing audio:', error);
    }
  }, []);

  const skip = useCallback(async () => {
    if (!currentTrack) return;

    const nextTrack = getNextTrackInTheme(currentTrack.id, currentTheme);
    if (nextTrack) {
      await loadAndPlayTrack(nextTrack, isPlaying);
    }
  }, [currentTrack, currentTheme, isPlaying, loadAndPlayTrack]);

  const mute = useCallback(async () => {
    try {
      setIsMuted(true);
      await setAudioMutedState(true);
      if (soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error('Error muting audio:', error);
    }
  }, []);

  const unmute = useCallback(async () => {
    try {
      setIsMuted(false);
      await setAudioMutedState(false);
      // Don't auto-play on unmute; user should explicitly play
    } catch (error) {
      console.error('Error unmuting audio:', error);
    }
  }, []);

  const toggleMute = useCallback(async () => {
    if (isMuted) {
      await unmute();
    } else {
      await mute();
    }
  }, [isMuted, mute, unmute]);

  const changeTheme = useCallback(
    async (newTheme: AudioTheme) => {
      try {
        // Guard: Do not override pack audio when pack is active
        if (sourceContext === 'pack') {
          return;
        }

        setCurrentTheme(newTheme);
        await setAudioTheme(newTheme);

        // Switch to first track of new theme if audio is playing
        if (isPlaying || currentTrack) {
          const tracksInTheme = getTracksByTheme(newTheme);
          if (tracksInTheme.length > 0) {
            await loadAndPlayTrack(tracksInTheme[0], isPlaying);
          }
        }
      } catch (error) {
        console.error('Error changing theme:', error);
      }
    },
    [isPlaying, currentTrack, loadAndPlayTrack, sourceContext]
  );

  const setTrack = useCallback(
    async (track: AudioTrack, source: AudioSourceContext) => {
      setSourceContext(source);
      await loadAndPlayTrack(track, isPlaying || source !== 'default');
    },
    [isPlaying, loadAndPlayTrack]
  );

  const value: AudioContextType = {
    currentTrack,
    isPlaying,
    isMuted,
    currentTheme,
    sourceContext,
    play,
    pause,
    skip,
    mute,
    unmute,
    toggleMute,
    changeTheme,
    setTrack,
  };

  return (
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
}
