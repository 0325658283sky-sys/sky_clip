# FikaClip clean-room parity specification

This document records observable product behavior from the user-provided FikaClip session. It is an implementation target for SkyClip; it does not copy source code, private assets, or branding.

## Results flow

1. A completed source video opens a results route with the original title and total duration.
2. The results view has a left clip rail and a large selected-clip detail panel.
3. The rail contains many ranked clips, each showing thumbnail, viral score, title, and duration.
4. The detail panel exposes playback, title editing, AI title regeneration, social upload, download, edit, and share actions.
5. Each clip exposes score dimensions: overall, hook/opening, context match, flow connectivity, immersion, and concluding ending.
6. Each clip exposes an AI narrative review and a transcript area with AI subtitle correction.
7. Results support select-all, score sorting, filtering, batch download, and prompt-driven clip creation.
8. Preview quality may be lower than the downloadable render; the UI must distinguish preview from final output.

## Editor flow

1. Editing opens from a selected result clip and preserves its source range, title, transcript, and score metadata.
2. The editor has a top navigation bar with back, undo/redo, download list, notifications, autosave, save, export, credits, and profile.
3. The left panel is a script editor with detail/overview modes and reorderable transcript segments.
4. The center is a video canvas with aspect-ratio, fit/zoom, and fullscreen controls.
5. The right panel is an AI editing toolbox: title, image, video, text, music, sound effects, voice, silence removal, hook intro, automatic layout, subtitle masking, and future tools.
6. The bottom timeline contains captions, main video, clip range, playhead, frame/second stepping, zoom, and add-section controls.
7. Export is an explicit final action and must produce a real downloadable video, not a poster or placeholder.

## SkyClip implementation rules

- Membership, login, upgrade, and payment UI are excluded.
- All result and editor data must come from the active project; fixed demo clips are allowed only in the explicit sample project.
- A project without a playable source must never enter the result view.
- Source, analysis, result, editor, and export are explicit states; navigation must not infer state from stale local storage alone.
- Local analysis is allowed as a fallback until STT/AI credentials are provided, but the UI must label the provider and fallback state.
