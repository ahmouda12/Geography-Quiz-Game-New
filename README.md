# Geography Quiz Game

A browser-based quiz game for identifying the 50 U.S. states on a map. The game includes a timer, score tracking, hints after two incorrect guesses, and a locally saved leaderboard.

## Run locally

Open `index.html` in a browser. For more representative testing, serve the project through a local HTTP server and open its URL; browsers can restrict local media when a page is opened with `file://`.

## Publish

This is a static website and does not require a build step. Publish the project files together, keeping the directory structure intact:

- `index.html`
- `style.css` and `script.js`
- `audio/` and `images/`

The game references its audio and images with relative paths. In particular, keep `audio/game-play.mp3` and `audio/applause10.mp3` at those paths so gameplay and completion audio can load. If media playback is unavailable, the game has a Web Audio fallback.

The page loads Bootstrap, emoji styles, and animation styles from CDNs, so players need an internet connection for those external stylesheets. After deployment, test the game at its HTTPS URL, including audio playback and map interaction.
