import { StrictMode, lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.tsx";
const Prepare = lazy(() => import("./components/Prepare.tsx"));
export function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => setHash(location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const preparing =
    hash === "#prepare" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  return preparing ? (
    <Suspense fallback={<main className="loading-screen">讀取製包工具</main>}>
      <Prepare />
    </Suspense>
  ) : (
    <App />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
