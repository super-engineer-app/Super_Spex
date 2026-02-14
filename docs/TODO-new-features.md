# TODO: New Features

Items to implement after the sidebar navigation refactor.

## ~~1. Tea Checker~~ (DONE)
Implemented in `TeaCheckerMode.tsx` and `useTeaChecker.ts`. Uses backend endpoints `/memes/tea-colour-preference` and `/memes/checking-tea` (SSE streaming).

## 2. Notes: Video Recording with Live Camera Preview
Current video recording doesn't show a camera preview feed in the UI (it records via native CameraX). The mockup shows a live camera feed in video mode. This would require a native camera preview surface, which is a larger effort. For now, show a placeholder/last-frame during recording.

## 3. Notes: Voice Commands for Saving/Canceling
The tagging system has keyword detection ("note"/"tag" to start, "done"/"save" to end) but the new Notes UI may need additional voice commands or adjustments.

## 4. Flashing Recording Indicator Animation
Needs `Animated` API implementation for the red dot to flash. Currently static. Cosmetic but improves UX.

## 5. Photo Grid Layout in Notes
Current tagging shows horizontal scroll; mockup shows 2x3 grid with "+" button. UI-only change.

## 6. Config Mode Contents
Need to decide what settings go here beyond parking timer and disconnect (display brightness, audio settings, etc.).
