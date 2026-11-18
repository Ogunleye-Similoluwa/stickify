import { REPO_URL } from "../lib/config";

export function Hero() {
  return (
    <section className="hero">
      <h1>
        Turn any GIF into a<br />
        <span className="accent">WhatsApp sticker</span>.
      </h1>
      <p className="lede">
        Paste a link to an X post or upload a GIF, video or image, trim the part you want, and get a 512×512 sticker
        that fits WhatsApp's size limits.
      </p>
    </section>
  );
}

export function HowTo() {
  return (
    <section className="howto" aria-labelledby="howto-title">
      <h2 id="howto-title">Getting it into WhatsApp</h2>
      <ol className="steps">
        <li>
          <h3>On a computer</h3>
          <p>
            Open WhatsApp Web or the desktop app, open any chat (a chat with yourself works), and drag the downloaded{" "}
            <code>.webp</code> file in. It sends as a sticker.
          </p>
        </li>
        <li>
          <h3>Save it on your phone</h3>
          <p>
            Open that chat on your phone, tap the sticker, and choose <strong>Add to Favorites</strong>. It's now in your
            sticker tray.
          </p>
        </li>
        <li>
          <h3>Install it</h3>
          <p>
            Tap <strong>Install app</strong> (or <strong>Add to Home Screen</strong> on iPhone). On Android you can then share an
            X post straight to Stickify from the X app.
          </p>
        </li>
      </ol>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <p>Only convert media you have the right to use. Stickers are made on your device; files go to our server only if your browser can't convert them, and are deleted right after.</p>
      <p><a href={REPO_URL}>Source on GitHub</a></p>
    </footer>
  );
}
