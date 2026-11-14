"use client";
import { useEffect, useRef, useState } from "react";

export function Toast() {
  const [text, setText] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const on = (e: Event) => {
      setText((e as CustomEvent<string>).detail);
      setShow(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setShow(false), 1800);
    };
    window.addEventListener("respool-toast", on);
    return () => { window.removeEventListener("respool-toast", on); clearTimeout(timer.current); };
  }, []);
  return <div className={`toast${show ? " show" : ""}`} role="status" aria-live="polite">{text}</div>;
}
