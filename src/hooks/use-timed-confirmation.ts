import { useEffect, useRef, useState } from "react";

export function useTimedConfirmation(timeoutMs: number) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearConfirmationTimer = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const clearPendingConfirmation = () => {
    clearConfirmationTimer();
    setPendingKey(null);
  };

  useEffect(() => clearConfirmationTimer, []);

  function requestConfirmation(key: string) {
    if (pendingKey === key) {
      clearPendingConfirmation();
      return true;
    }

    clearConfirmationTimer();
    setPendingKey(key);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setPendingKey((current) => (current === key ? null : current));
    }, timeoutMs);

    return false;
  }

  return { pendingKey, requestConfirmation, clearPendingConfirmation };
}
