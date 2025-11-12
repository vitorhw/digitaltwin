from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, resample_poly
import soundfile as sf


@dataclass(slots=True)
class TV90sFilterConfig:
    """Configuration for the 90's TV style voice filter."""

    lowcut_hz: float = 200.0
    highcut_hz: float = 3800.0
    filter_order: int = 4
    hum_frequency: float = 60.0
    hum_level: float = 0.008
    noise_level: float = 0.004
    drive: float = 2.2
    bit_depth: int = 8
    downsample_rate: int = 8000
    reverb_delay_ms: Iterable[float] = (35.0, 62.0)
    reverb_decay: Iterable[float] = (0.35, 0.18)
    output_gain: float = 0.9


def _ensure_mono(signal: np.ndarray) -> np.ndarray:
    if signal.ndim == 1:
        return signal
    return np.mean(signal, axis=1)


def _bandpass(signal: np.ndarray, sample_rate: int, cfg: TV90sFilterConfig) -> np.ndarray:
    nyquist = 0.5 * sample_rate
    low = cfg.lowcut_hz / nyquist
    high = cfg.highcut_hz / nyquist

    # Clamp to sane range
    low = max(low, 1e-4)
    high = min(high, 0.999)

    if low >= high:
        # Bad configuration / sample rate; just return unfiltered signal
        return signal

    b, a = butter(cfg.filter_order, [low, high], btype="band")
    return lfilter(b, a, signal)


def _downsample_and_up(sample: np.ndarray, sample_rate: int, target_rate: int) -> np.ndarray:
    if sample_rate <= target_rate:
        return sample
    reduced = resample_poly(sample, target_rate, sample_rate)
    return resample_poly(reduced, sample_rate, target_rate)


def _quantize(sample: np.ndarray, bit_depth: int) -> np.ndarray:
    levels = max(2, 2**bit_depth)
    max_val = levels / 2 - 1
    quantised = np.round(np.clip(sample, -1.0, 1.0) * max_val) / max_val
    return quantised


def _add_hum_and_noise(sample: np.ndarray, sample_rate: int, cfg: TV90sFilterConfig) -> np.ndarray:
    if cfg.hum_level <= 0 and cfg.noise_level <= 0:
        return sample

    t = np.arange(len(sample)) / sample_rate
    hum = cfg.hum_level * np.sin(2 * np.pi * cfg.hum_frequency * t)
    noise = cfg.noise_level * np.random.randn(len(sample))
    return sample + hum + noise


def _apply_reverb(sample: np.ndarray, sample_rate: int, cfg: TV90sFilterConfig) -> np.ndarray:
    delays = list(cfg.reverb_delay_ms)
    decays = list(cfg.reverb_decay)
    if not delays or not decays:
        return sample

    taps = int(max(delays) / 1000 * sample_rate) + 1
    impulse = np.zeros(taps + 1, dtype=np.float32)
    impulse[0] = 1.0

    for delay_ms, decay in zip(delays, decays):
        delay_samples = int(delay_ms / 1000 * sample_rate)
        if 0 <= delay_samples < impulse.size:
            impulse[delay_samples] += decay

    convolved = fftconvolve(sample, impulse, mode="full")[: len(sample)]
    return convolved


def apply_90s_tv_filter(
    samples: np.ndarray,
    sample_rate: int,
    config: Optional[TV90sFilterConfig] = None,
) -> np.ndarray:
    """
    Apply a "90's television" style effect to an audio array.

    Parameters
    ----------
    samples:
        Audio samples in float32/float64 or int format. Can be mono or stereo.
    sample_rate:
        Sample rate of the audio.
    config:
        Optional configuration object.

    Returns
    -------
    np.ndarray
        Processed mono audio as float32 in range [-1, 1].
    """

    if samples.size == 0:
        return samples.astype(np.float32)

    cfg = config or TV90sFilterConfig()
    mono = _ensure_mono(samples)

    if np.issubdtype(mono.dtype, np.integer):
        max_val = float(np.iinfo(mono.dtype).max)
        mono = mono.astype(np.float32) / max_val
    else:
        mono = mono.astype(np.float32)

    # Core effect chain
    processed = _bandpass(mono, sample_rate, cfg)
    processed = np.tanh(cfg.drive * processed)
    processed = _downsample_and_up(processed, sample_rate, cfg.downsample_rate)
    processed = _quantize(processed, cfg.bit_depth)
    processed = _add_hum_and_noise(processed, sample_rate, cfg)
    processed = _apply_reverb(processed, sample_rate, cfg)

    max_abs = np.max(np.abs(processed))
    if max_abs > 0:
        processed = processed / max_abs * cfg.output_gain
    else:
        processed *= cfg.output_gain

    return np.clip(processed, -1.0, 1.0).astype(np.float32)


def apply_90s_tv_filter_to_file(
    path: str | Path,
    config: Optional[TV90sFilterConfig] = None,
) -> Path:
    """
    Load an audio file, apply the 90's TV filter, and overwrite it as a WAV.

    This uses `soundfile` to read, so it supports AIFF / WAV / FLAC / OGG, etc.
    The output is written as a mono 16-bit PCM WAV file, avoiding the
    SciPy `wavfile` "FORM vs RIFF" issue.

    Parameters
    ----------
    path:
        Path to the input audio file.
    config:
        Optional configuration object.

    Returns
    -------
    Path
        The (same) path that was passed in, for convenience.
    """
    wav_path = Path(path)

    # soundfile.read returns (data, samplerate)
    data, sample_rate = sf.read(wav_path, always_2d=False)

    filtered = apply_90s_tv_filter(data, sample_rate, config=config)

    # Write back as *real* WAV with a RIFF header (16-bit PCM)
    sf.write(
        wav_path,
        filtered,
        sample_rate,
        format="WAV",
        subtype="PCM_16",
    )

    return wav_path


__all__ = [
    "TV90sFilterConfig",
    "apply_90s_tv_filter",
    "apply_90s_tv_filter_to_file",
]
