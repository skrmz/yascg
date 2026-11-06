import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 1200px)";

function supportsMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    supportsMatchMedia() ? window.matchMedia(DESKTOP_QUERY).matches : true,
  );

  useEffect(() => {
    if (!supportsMatchMedia()) return;
    const mediaQuery = window.matchMedia(DESKTOP_QUERY);
    const update = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
