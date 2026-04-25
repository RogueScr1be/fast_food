export type AudioCategory = 'ambient' | 'jazz' | 'lo-fi' | 'acoustic' | 'piano';
export type AudioTheme = 'calm-piano' | 'midnight-lounge' | 'acoustic-folk';

export interface AudioTrack {
  id: string;
  name: string;
  category: AudioCategory;
  theme: AudioTheme;
  packId?: string | null;
  uri: string;
  duration?: number;
  fadeInDuration?: number;
}

export const audioTracks: AudioTrack[] = [
  // Free base tracks
  {
    id: 'ambient-calm-piano-01',
    name: 'Calm Piano',
    category: 'piano',
    theme: 'calm-piano',
    packId: null,
    uri: require('../../assets/audio/bensound-smallguitar.mp3'),
    duration: 202, // ~3m 22s
    fadeInDuration: 500,
  },
  {
    id: 'ambient-acoustic-folk-01',
    name: 'Acoustic Folk',
    category: 'acoustic',
    theme: 'acoustic-folk',
    packId: null,
    uri: require('../../assets/audio/bensound-sunny.mp3'),
    duration: 140, // ~2m 20s
    fadeInDuration: 500,
  },
  // Premium pack exclusive
  {
    id: 'audio-midnight-lounge-01',
    name: 'Midnight Lounge',
    category: 'jazz',
    theme: 'midnight-lounge',
    packId: 'date-night',
    uri: require('../../assets/audio/bensound-jazzyfrenchy.mp3'),
    duration: 104, // ~1m 44s
    fadeInDuration: 1000,
  },
  // Additional free tracks for variety
  {
    id: 'ambient-upbeat-jazz-01',
    name: 'Upbeat Jazz',
    category: 'jazz',
    theme: 'calm-piano',
    packId: null,
    uri: require('../../assets/audio/bensound-brazilsamba.mp3'),
    duration: 240, // ~4m
    fadeInDuration: 500,
  },
  {
    id: 'ambient-hearty-01',
    name: 'Hearty & Cozy',
    category: 'ambient',
    theme: 'acoustic-folk',
    packId: null,
    uri: require('../../assets/audio/bensound-hearty.mp3'),
    duration: 153, // ~2m 33s
    fadeInDuration: 500,
  },
];

export const defaultTheme: AudioTheme = 'calm-piano';

export function getTracksByTheme(theme: AudioTheme): AudioTrack[] {
  return audioTracks.filter(track => track.theme === theme);
}

export function getTrackById(id: string): AudioTrack | undefined {
  return audioTracks.find(track => track.id === id);
}

export function getNextTrackInTheme(
  currentTrackId: string,
  theme: AudioTheme
): AudioTrack | null {
  const tracksInTheme = getTracksByTheme(theme);
  const currentIndex = tracksInTheme.findIndex(t => t.id === currentTrackId);

  if (currentIndex < 0 || currentIndex >= tracksInTheme.length - 1) {
    return null;
  }

  return tracksInTheme[currentIndex + 1];
}
