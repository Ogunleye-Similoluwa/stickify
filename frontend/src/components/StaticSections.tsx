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
          <h3>Phone only?</h3>
          <p>
            Use <strong>Share to WhatsApp</strong>, or save the file and import it with a sticker-pack app such as
            Sticker.ly. WhatsApp needs at least three stickers in a pack.
          </p>
        </li>
      </ol>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <p>Only convert media you have the right to use. Files are processed in memory and deleted right after conversion.</p>
      <p><a href={REPO_URL}>Source on GitHub</a></p>
    </footer>
  );
}
