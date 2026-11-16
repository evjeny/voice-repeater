# Voice Repeater

A tiny web page that plays your microphone back after a configurable delay, so a vocalist hears each attempt automatically, with no extra buttons to press.

**Live:** https://evjeny.github.io/voice-repeater/

## Usage
1. Set the delay in seconds (default 10, any value ≥ 0).
2. Press **Start** and allow microphone access.
3. Sing. Everything the mic hears comes back out after the delay. The delay can be changed while running.

Headphones are recommended. With speakers, turn on *Echo cancellation* so the playback isn't re-recorded.

Works in current desktop and mobile browsers (Chrome, Firefox, Safari/iOS 14.5+). Audio never leaves your device.

## How it works
Web Audio's `DelayNode` caps out under 180 s, so the delay is a custom `AudioWorklet` (`delay-processor.js`) holding an unbounded FIFO of samples (~192 KB per second of delay at 48 kHz).

## Run locally
```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy
Pushing to `main` deploys via GitHub Actions. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
