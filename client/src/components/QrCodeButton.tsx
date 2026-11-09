import { useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { getSavedTunnelUrl } from "../utils/tunnelUrl";

interface QrCodeButtonProps {
  // Path on your tunneled site students should land on — "/join", "/join-qod",
  // "/live-feedback". Dashboard passes "/" since there's no active session there.
  joinPath: string;
  // The session's current PIN, shown above the QR code. Omit (or pass "") on Dashboard.
  pin?: string;
  pinLabel?: string; // e.g. "Game PIN", "QOD PIN", "Feedback PIN"
}

// Simple scan-frame icon, drawn inline so this doesn't need an icon library.
function QrScanIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M4 7V5a1 1 0 0 1 1-1h2M4 17v2a1 1 0 0 0 1 1h2M20 7V5a1 1 0 0 0-1-1h-2M20 17v2a1 1 0 0 1-1 1h-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="7" y="7" width="4" height="4" rx="0.5" />
      <rect x="13" y="7" width="4" height="4" rx="0.5" />
      <rect x="7" y="13" width="4" height="4" rx="0.5" />
      <rect x="13" y="13" width="2" height="2" rx="0.5" />
    </svg>
  );
}

// Fixed-position floating button, bottom-right, on every page that uses it. Opens
// a near-fullscreen modal with the current PIN and a QR code students can scan to
// land directly on the right join page for this session type, via the host's
// currently-saved Cloudflare Tunnel URL (set on the Dashboard).
export default function QrCodeButton({ joinPath, pin, pinLabel = "PIN" }: QrCodeButtonProps) {
  const [open, setOpen] = useState(false);

  // Re-read fresh every time the modal opens, in case it was just saved/changed.
  const tunnelUrl = open ? getSavedTunnelUrl() : null;
  const fullUrl = tunnelUrl ? `${tunnelUrl.replace(/\/$/, "")}${joinPath}` : null;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Show QR code for students"
        aria-label="Show QR code for students"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-brand-accent hover:bg-brand-accent-hover text-black flex items-center justify-center shadow-2xl shadow-black/50 border-4 border-black/20"
      >
        <QrScanIcon />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-[90vw] h-[90vh] max-w-2xl chrome-surface border border-brand-text/10 rounded-2xl shadow-2xl shadow-black/50 flex flex-col items-center justify-center p-6"
            >
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-lg text-brand-text/60 hover:bg-brand-text/10 hover:text-brand-text text-xl"
              >
                ✕
              </button>

              {fullUrl ? (
                <>
                {pin ? (
                    <>
                        <p className="text-brand-text text-lg md:text-2xl mb-1">{pinLabel}</p>
                        <p className="text-4xl md:text-6xl font-extrabold text-brand-accent tracking-widest mb-8">
                        {pin}
                        </p>
                    </>
                    ) : (
                        <div className="absolute top-6 left-0 right-0 z-10 flex flex-col items-center pointer-events-none">
                            <span className="text-4xl md:text-5xl font-extrabold text-brand-accent tracking-wide mb-3">
                                Senpaii
                            </span>
                            <p className="text-brand-text text-base md:text-lg font-medium">
                                Scan to Join Senpaii
                            </p>
                        </div>
                    )}
                  <div className="bg-white p-4 md:p-6 rounded-2xl">
                    <QRCodeSVG value={fullUrl} size={220} />
                  </div>
                </>
              ) : (
                <p className="text-brand-text/70 text-lg text-center max-w-xs">
                  Set your tunnel URL on the Dashboard first.
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}