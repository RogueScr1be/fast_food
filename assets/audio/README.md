# Audio Tracks for Fast Food Lite

This directory should contain the following `.m4a` (AAC) audio files:

## Required Tracks (Phase 1)

1. **calm-piano.m4a** (Free base track)
   - Duration: ~8 minutes
   - Format: AAC (.m4a)
   - Size: ~1 MB
   - Theme: calm-piano
   - Description: Soft, meditative piano music for evening cooking

2. **acoustic-folk.m4a** (Free base track)
   - Duration: ~7 minutes
   - Format: AAC (.m4a)
   - Size: ~1 MB
   - Theme: acoustic-folk
   - Description: Gentle acoustic guitar and vocals

3. **midnight-lounge.m4a** (Premium pack exclusive)
   - Duration: ~5 minutes
   - Format: AAC (.m4a)
   - Size: ~1.5 MB
   - Theme: midnight-lounge
   - Description: Sophisticated jazz for date nights

## Notes

- All tracks must be in AAC format (.m4a) for cross-platform compatibility
- Tracks should loop seamlessly (no abrupt endings)
- Files are referenced in `lib/seeds/audio.ts`
- Total budget: ≤ 5 MB for v1 audio

## Setup

1. Source or license the tracks
2. Convert to .m4a format if necessary
3. Place files in this directory
4. Update `lib/seeds/audio.ts` if URIs change
5. Test playback with `npm start`

## Current Status

⚠️ **BLOCKING PHASE 1**: Audio files are not yet bundled.
- AudioContext is implemented and ready to load tracks
- App will launch but audio playback will fail until tracks are added
