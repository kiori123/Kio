"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface FinalChunk {
  text: string;
  at: number;
}

/**
 * Browser speech recognition.
 *
 * This is the zero-infrastructure default: no API key, no audio pipeline, works
 * in Chrome and Edge. It is not the right production answer for a client
 * meeting — Chrome streams the audio to Google's servers, and accuracy on
 * mixed Vietnamese/English business speech is mediocre. See README for the
 * Deepgram swap, which is a drop-in replacement for this hook.
 */
export function useTranscription(lang: string) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const bufferRef = useRef<FinalChunk[]>([]);
  // Chrome ends the session on silence; we restart it unless the user stopped.
  const wantListeningRef = useRef(false);

  useEffect(() => {
    const Ctor =
      typeof window !== "undefined"
        ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
        : undefined;

    if (!Ctor) {
      setSupported(false);
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (result.isFinal) {
          bufferRef.current.push({ text, at: Date.now() });
        } else {
          pending += ` ${text}`;
        }
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are routine in a long meeting; surfacing them
      // as errors would make the UI look broken during every pause.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(event.error);
      }
    };

    recognition.onend = () => {
      if (wantListeningRef.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      wantListeningRef.current = false;
      recognition.stop();
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    wantListeningRef.current = true;
    setError(null);
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // start() throws if already running — harmless.
      setListening(true);
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  /** Hand over everything finalised since the last call. */
  const drain = useCallback((): string => {
    const chunks = bufferRef.current;
    bufferRef.current = [];
    return chunks.map((c) => c.text).join(" ").trim();
  }, []);

  return { listening, interim, supported, error, start, stop, drain };
}
