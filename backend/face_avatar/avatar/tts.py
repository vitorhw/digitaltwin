import pyttsx3


def tts_to_wav(text: str, out_path: str, voice_substring: str | None = None, rate: int = 175):
    """
    Synthesize text to a WAV file using pyttsx3 (Windows SAPI).
    If voice_substring is provided, picks a matching installed voice.
    """
    engine = pyttsx3.init()
    engine.setProperty("rate", rate)
    if voice_substring:
        for v in engine.getProperty("voices"):
            name = getattr(v, "name", "") or getattr(v, "id", "")
            if voice_substring.lower() in name.lower():
                engine.setProperty("voice", v.id)
                break
    engine.save_to_file(text, out_path)
    engine.runAndWait()
    return out_path

