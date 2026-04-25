export interface FastPack {
  id: string;
  name: string;
  description: string;
  price: number | null; // null = free
  featuredImageUrl?: string;
  recipeIds: string[]; // refs to recipes by id
  audioTrackIds: string[]; // primary track id + context tracks
  featured?: boolean;
}

export const packs: FastPack[] = [
  {
    id: 'sunday-reset',
    name: 'Sunday Reset',
    description: 'Light, restorative meals for a fresh week',
    price: null,
    recipeIds: [
      'blt-sandwich',
      'pasta-aglio-olio',
      'rice-beans',
      'mac-cheese',
    ],
    audioTrackIds: ['ambient-calm-piano-01'], // free track from audio.ts
    featured: true,
  },
  {
    id: 'game-night',
    name: 'Game Night',
    description: 'Bold flavors & quick assembly for group play',
    price: null,
    recipeIds: [
      'classic-cheeseburger',
      'tacos',
      'french-fries-oven',
      'pizza-sheet-pan-shortcut',
    ],
    audioTrackIds: ['ambient-acoustic-folk-01'], // free alternative
    featured: true,
  },
  {
    id: 'date-night',
    name: 'Date Night',
    description: 'Elegant dinners for two that impress',
    price: 2.99,
    recipeIds: [
      'steak-garlic-butter-potatoes',
      'detroit-style-pizza',
      'buttermilk-fried-chicken',
      'philly-cheesesteak',
    ],
    audioTrackIds: ['audio-midnight-lounge-01'], // premium exclusive
    featured: true,
  },
  {
    id: 'late-shift',
    name: 'Late Shift',
    description: '24/7 logistics: high-protein, quick hits',
    price: 1.99,
    recipeIds: [
      'scrambled-eggs-toast',
      'spaghetti-meatballs',
      'instant-ramen',
      'chili-basic',
    ],
    audioTrackIds: ['ambient-calm-piano-01'], // scaffold: lo-fi-beats-theme not yet available
    featured: false,
  },
];

// Pack-to-audio context mapping
export interface PackAudioTrack {
  packId: string;
  audioTrackId: string;
  context: 'primary' | 'decision' | 'cooking' | 'completion';
  order: number;
}

export const packAudioTracks: PackAudioTrack[] = [
  // Sunday Reset: Calm Piano (primary throughout)
  {
    packId: 'sunday-reset',
    audioTrackId: 'ambient-calm-piano-01',
    context: 'primary',
    order: 1,
  },
  // Game Night: Acoustic Folk (primary throughout)
  {
    packId: 'game-night',
    audioTrackId: 'ambient-acoustic-folk-01',
    context: 'primary',
    order: 1,
  },
  // Date Night: Midnight Lounge (primary throughout)
  {
    packId: 'date-night',
    audioTrackId: 'audio-midnight-lounge-01',
    context: 'primary',
    order: 1,
  },
  // Late Shift: Calm Piano (scaffold: lo-fi not yet available)
  {
    packId: 'late-shift',
    audioTrackId: 'ambient-calm-piano-01',
    context: 'primary',
    order: 1,
  },
];

export function getPackById(packId: string): FastPack | undefined {
  return packs.find(p => p.id === packId);
}

export function getPrimaryAudioTrackForPack(packId: string): string | null {
  const track = packAudioTracks.find(
    pat => pat.packId === packId && pat.context === 'primary'
  );
  return track?.audioTrackId ?? null;
}

export function isPackLocked(pack: FastPack): boolean {
  return pack.price !== null && pack.price > 0;
}

export function getFeaturedPacks(): FastPack[] {
  return packs.filter(p => p.featured !== false);
}
