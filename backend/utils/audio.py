"""Audio codec utilities for the Twilio media-stream WebSocket pipeline.

Handles mu-law <-> PCM conversion, sample-rate conversion, and WAV creation.
"""

import struct
import array
import math

# ---------------------------------------------------------------------------
# mu-law lookup table (mu-law byte -> signed 16-bit linear PCM)
# ---------------------------------------------------------------------------
_ULAW_TO_LINEAR: list[int] = []
for _i in range(256):
    _mu = ~_i & 0xFF
    _sign = _mu & 0x80
    _exp = (_mu >> 4) & 0x07
    _man = _mu & 0x0F
    _sample = ((_man << 3) + 0x84) << _exp
    _sample -= 0x84
    _ULAW_TO_LINEAR.append(-_sample if _sign else _sample)


def _linear_to_mulaw(sample: int) -> int:
    BIAS = 0x84
    MAX = 32635
    sign = (sample >> 8) & 0x80
    if sign:
        sample = -sample
    if sample > MAX:
        sample = MAX
    sample += BIAS
    exponent = 7
    exp_mask = 0x4000
    while exponent > 0 and (sample & exp_mask) == 0:
        exponent -= 1
        exp_mask >>= 1
    mantissa = (sample >> (exponent + 3)) & 0x0F
    return (~(sign | (exponent << 4) | mantissa)) & 0xFF


# ---------------------------------------------------------------------------
# Public conversion functions
# ---------------------------------------------------------------------------

def mulaw_to_pcm(mulaw_data: bytes) -> bytes:
    """Convert mu-law bytes to signed-16-bit-LE PCM bytes."""
    pcm = array.array("h", [_ULAW_TO_LINEAR[b] for b in mulaw_data])
    return pcm.tobytes()


def pcm_to_mulaw(pcm_data: bytes) -> bytes:
    """Convert signed-16-bit-LE PCM bytes to mu-law bytes."""
    samples = array.array("h")
    samples.frombytes(pcm_data)
    return bytes(_linear_to_mulaw(s) for s in samples)


def resample(pcm_bytes: bytes, from_rate: int, to_rate: int) -> bytes:
    """Linear-interpolation resampler for signed-16-bit-LE PCM."""
    if from_rate == to_rate:
        return pcm_bytes
    src = array.array("h")
    src.frombytes(pcm_bytes)
    ratio = from_rate / to_rate
    out_len = int(len(src) / ratio)
    out = array.array("h", [0] * out_len)
    for i in range(out_len):
        src_idx = i * ratio
        lo = int(src_idx)
        hi = min(lo + 1, len(src) - 1)
        frac = src_idx - lo
        out[i] = int(src[lo] * (1 - frac) + src[hi] * frac)
    return out.tobytes()


def create_wav(pcm_bytes: bytes, sample_rate: int, num_channels: int = 1, bits: int = 16) -> bytes:
    """Wrap raw signed-16-bit-LE PCM bytes in a WAV container."""
    byte_rate = sample_rate * num_channels * (bits // 8)
    block_align = num_channels * (bits // 8)
    data_size = len(pcm_bytes)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,             # chunk size
        1,              # PCM format
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits,
        b"data",
        data_size,
    )
    return header + pcm_bytes
