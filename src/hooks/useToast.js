// src/hooks/useToast.js
import { useState, useCallback } from "react";

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, tipo = "info") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const ToastUI = toast ? (
    <div className="toast-wrap">
      <div className={`toast ${toast.tipo}`}>{toast.msg}</div>
    </div>
  ) : null;

  return { showToast, ToastUI };
}
