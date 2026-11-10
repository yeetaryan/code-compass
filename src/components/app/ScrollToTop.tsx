import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // newer browsers return a Promise from scrollTo; never return it from an effect
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}
