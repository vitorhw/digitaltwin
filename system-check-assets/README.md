# System Check Assets

Drop the media that powers the "Check Functions" diagnostics here so the automated flow can upload them.

## Required files

- `voice-sample.wav` – at least 30 seconds of clean speech. Use 16-bit PCM WAV (mono, 16 kHz or higher) for best compatibility with the Coqui XTTS server.
- `face-sample.jpg` – a clear, front-facing portrait photo (JPG/PNG/WebP all work; JPG keeps file sizes small).

You can point the system checker to different filenames or folders by setting the following environment variables:

| Environment variable           | Description                                    | Default value              |
| ------------------------------ | ---------------------------------------------- | -------------------------- |
| `SYSTEM_CHECK_SAMPLE_DIR`      | Folder that stores the test media files        | `system-check-assets/`     |
| `SYSTEM_CHECK_VOICE_FILE`      | Voice filename relative to the folder above    | `voice-sample.wav`         |
| `SYSTEM_CHECK_FACE_FILE`       | Image filename relative to the folder above    | `face-sample.jpg`          |
| `SYSTEM_CHECK_BASE_URL`        | Base URL used to hit your Next.js API routes   | Auto-detected / localhost  |

Once both files are present, click **Check Functions** in the Debug panel to run the end-to-end voice + avatar diagnostics.
