# Third-party sources

The frontend includes adaptations of open-source component patterns:

- **Magic UI Number Ticker**: https://magicui.design/docs/components/number-ticker
  and https://magicui.design/r/number-ticker.json. Project:
  https://github.com/magicuidesign/magicui. Source is MIT licensed. Copyright
  remains with Magic UI and its contributors. Local adaptation removes viewport
  delay, supports changing counts, and respects reduced motion.
- **SmoothUI AnimatedTabs**: https://smoothui.dev/r/animated-tabs.json.
  Copyright (c) 2024 Eduardo Calvo. MIT license. Local adaptation uses filter
  buttons instead of tab-panel semantics, with the shared-layout spring indicator.

MIT permission and warranty terms for these adaptations:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Design references (not copied component implementations):

- RetroUI / NeoBrutalism: https://retroui.dev/ (redirects to https://neobrutalism.com/).
  The official registry could not be fetched. Retro buttons and surfaces in this
  project are custom CSS inspired by the visual reference, not official components.
- Taste Skill: https://github.com/Leonxlnx/taste-skill. Consulted as a design
  reference. No upstream skill file is redistributed, installed, or modified.

React, Motion, Phosphor icons, node-redis, Vite, and Fontsource packages retain
their own license notices in their installed packages. The bundled fonts are
Space Grotesk and IBM Plex Mono, distributed through Fontsource; their font
license texts are provided alongside this file under licenses/.
