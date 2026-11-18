"use client";
// Light / dark switch. The choice is kept in localStorage; with no choice the system setting applies (see layout.tsx).
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(currentTheme());
    const on = () => setTheme(currentTheme());
    window.addEventListener("respool-theme", on);
    return () => window.removeEventListener("respool-theme", on);
  }, []);

  function flip() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("respool-theme", next); } catch { /* private mode: the choice just will not persist */ }
    window.dispatchEvent(new Event("respool-theme"));
  }

  return (
    <button type="button" className="icon-btn theme-toggle" onClick={flip} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
      {theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" /></svg>
      )}
    </button>
  );
}
