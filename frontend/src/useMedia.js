import { useEffect, useState } from 'react';

/** Följer en media query och uppdaterar när den slår om. */
export function useMedia(query) {
  const [traffar, setTraffar] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const lyssnare = (e) => setTraffar(e.matches);
    setTraffar(mq.matches);
    mq.addEventListener('change', lyssnare);
    return () => mq.removeEventListener('change', lyssnare);
  }, [query]);

  return traffar;
}
