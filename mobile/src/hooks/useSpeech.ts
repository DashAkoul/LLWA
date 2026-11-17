/**
 * useSpeech — پخش تلفظ واژه/جمله.
 *
 * جریان: متن → `media/speak` → لینک MP3 → پخش.
 * سرور فایل را با هش متن کش می‌کند، پس پخش دوم همان واژه صفر هزینه دارد.
 *
 * ⚠️ ما یک پخش‌کنندهٔ مشترک داریم و فقط منبعش را عوض می‌کنیم. ساختن یک
 * پخش‌کنندهٔ جدید برای هر کلمه در اندروید باعث نشت حافظه و پخش هم‌زمان
 * چند صدا می‌شود.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { speakText } from '../api/client';

const cache = new Map<string, string>();

export function useSpeech() {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // صدای اپ باید حتی وقتی گوشی روی سایلنت است پخش شود (یادگیری زبان)
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      try {
        playerRef.current?.remove();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, []);

  const speak = useCallback(
    async (text: string, language: string, voice = 'default') => {
      const clean = text?.trim();
      if (!clean) return;
      const key = `${language}:${voice}:${clean}`;

      setError(null);
      try {
        let url = cache.get(key);
        if (!url) {
          setLoadingKey(key);
          const res = await speakText(clean, language, voice);
          url = res.url;
          cache.set(key, url);
        }

        if (!playerRef.current) {
          playerRef.current = createAudioPlayer(url);
        } else {
          playerRef.current.replace({ uri: url });
        }
        playerRef.current.seekTo(0);
        playerRef.current.play();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'audio_failed');
      } finally {
        setLoadingKey(null);
      }
    },
    []
  );

  const isLoading = useCallback(
    (text: string, language: string) => loadingKey === `${language}:default:${text?.trim()}`,
    [loadingKey]
  );

  return { speak, isLoading, error };
}
