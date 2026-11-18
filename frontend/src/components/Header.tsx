import type { ServerState } from "../hooks/useServerStatus";
import { InstallButton } from "./InstallButton";
import { Logo } from "./Logo";

interface Props {
  status: ServerState;
  statusLabel: string;
}

export function Header({ status, statusLabel }: Props) {
  return (
    <header className="top">
      <a className="brand" href="./">
        <span className="brand-mark" aria-hidden="true">
          <Logo />
        </span>
        Stickify
      </a>
      <div className="top-right">
        <InstallButton />
        <span className="status" data-state={status}>
          <span className="dot" />
          <span id="status-text">{statusLabel}</span>
        </span>
      </div>
    </header>
  );
}
