import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** "Install app": Chrome/Edge/Android show their own prompt; iPhone gets the Add to Home Screen steps. */
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(standalone());
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!prompt && !isIos())) return null;

  async function install() {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setPrompt(null);
    } else {
      setIosHelp((v) => !v);
    }
  }

  return (
    <div className="install">
      <button type="button" className="install-button" id="install" onClick={install}>
        Install app
      </button>
      {iosHelp && (
        <p className="install-help" role="status">
          In Safari, tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </div>
  );
}
