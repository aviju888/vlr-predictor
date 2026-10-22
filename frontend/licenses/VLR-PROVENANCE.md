# VLR frontend extraction

The refreshed frontend, model implementation, deterministic tests, dataset audit and historical CSV/JSON fixtures were extracted from avijuan-lab's VLR implementation into this existing vlr-predictor repository. The original implementation remains available at `/classic`.

The bundled data originates from this project's VCT 2025 data files. Training uses Masters Bangkok (February 20–March 2, 2025); evaluation uses Masters Toronto (June 7–22, 2025). It is a historical snapshot, with source label conflicts and recycled statistics exposed by the in-app audit. The extraction does not confer additional rights to third-party tournament data or imply current rosters/live feeds.

Shared token styles derive from Beautiful UI (MIT); its license is retained here. Inter, JetBrains Mono, Geist and Geist Mono font licenses accompany their bundled assets in public/fonts. Phosphor icons, Motion, Liveline, Web Kits Audio, Zod and existing dependencies retain their upstream package licenses in installed distributions. Small Button, GlideMenu, ScrollFade and RollingNumber helpers were extracted with the VLR screen; no shared lab navigation or filesystem dependency is retained.
