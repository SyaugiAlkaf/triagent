/* ============================================================================
 * LoginScreen — full-canvas overlay that fades out into the war room.
 *  - ASCII wave background (multi-sine field, rAF tick on textContent only,
 *    CSS background-clip gradient — wave runs on GPU, not per-character DOM).
 *  - Center form: operator/key inputs, LOGIN button. The form is decorative;
 *    no credentials are sent or validated — this is a presentation gate.
 *  - On submit: parent flips `dismissed=true`, the overlay blurs + fades out
 *    over 700ms, then unmounts.
 * ========================================================================== */
import { useEffect, useRef, useState } from "react";

const WAVE_CHARS = " .:-=+*#%@";

function renderWave(
  t: number,
  cols: number,
  rows: number,
  speed: number,
  density: number
): string {
  const cutoff = 1 - density;
  let out = "";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = Math.sin(x * 0.18 + t * 0.0045 * speed);
      const b = Math.sin(y * 0.3 + t * 0.0033 * speed + 1.4);
      const v = (a + b) * 0.5;
      const norm = (v + 1) / 2;
      if (norm < cutoff) {
        out += " ";
        continue;
      }
      const local = (norm - cutoff) / (1 - cutoff);
      const idx = Math.floor(local * (WAVE_CHARS.length - 1));
      out += WAVE_CHARS[idx];
    }
    out += "\n";
  }
  return out;
}

function AsciiWave({
  useGradient = true,
  speed = 1,
  density = 0.6,
}: {
  useGradient?: boolean;
  speed?: number;
  density?: number;
}) {
  const preRef = useRef<HTMLPreElement | null>(null);
  const speedRef = useRef(speed);
  const densityRef = useRef(density);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    densityRef.current = density;
  }, [density]);

  useEffect(() => {
    let raf = 0;
    const COLS = 180;
    const ROWS = 60;
    const tick = (t: number) => {
      const el = preRef.current;
      if (el)
        el.textContent = renderWave(
          t,
          COLS,
          ROWS,
          speedRef.current,
          densityRef.current
        );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const gradientStyle: React.CSSProperties = useGradient
    ? {
        background:
          "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-soft) 40%, var(--color-text-mid) 75%, var(--color-text-dim) 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        color: "transparent",
      }
    : { color: "var(--color-accent)" };

  return (
    <pre
      ref={preRef}
      style={{
        position: "absolute",
        inset: 0,
        margin: 0,
        fontFamily: "var(--font-mono)",
        fontSize: 14,
        lineHeight: "17px",
        letterSpacing: 0,
        userSelect: "none",
        pointerEvents: "none",
        whiteSpace: "pre",
        overflow: "hidden",
        textAlign: "center",
        opacity: 0.6,
        ...gradientStyle,
      }}
    />
  );
}

export interface LoginScreenProps {
  onLogin: () => void;
  dismissed?: boolean;
  waveSpeed?: number;
  waveGradient?: boolean;
  waveDensity?: number;
}

export default function LoginScreen({
  onLogin,
  dismissed = false,
  waveSpeed = 1,
  waveGradient = true,
  waveDensity = 0.6,
}: LoginScreenProps) {
  const [user, setUser] = useState("operator");
  const [key, setKey] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setKey("••••••••••••"), 600);
    return () => clearTimeout(id);
  }, []);

  const submit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onLogin();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-bg)",
        zIndex: 200,
        overflow: "hidden",
        opacity: dismissed ? 0 : 1,
        transform: dismissed ? "scale(1.02)" : "scale(1)",
        filter: dismissed ? "blur(8px)" : "blur(0)",
        transition:
          "opacity 700ms cubic-bezier(.4,0,.2,1), transform 800ms cubic-bezier(.4,0,.2,1), filter 700ms cubic-bezier(.4,0,.2,1)",
        pointerEvents: dismissed ? "none" : "auto",
      }}
    >
      <AsciiWave
        useGradient={waveGradient}
        speed={waveSpeed}
        density={waveDensity}
      />

      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 620,
          height: 460,
          background:
            "radial-gradient(ellipse at center, color-mix(in oklch, var(--color-bg) 78%, transparent) 30%, transparent 75%)",
        }}
      />

      <div className="absolute top-4 left-5 font-mono text-[11px] tracking-[0.16em] text-text-dim">
        TRIAGENT v0.4.2 · BUILD 8c2f1a
      </div>
      <div className="absolute top-4 right-5 font-mono text-[11px] tracking-[0.16em] text-text-dim">
        SECURE TERMINAL · TLS 1.3
      </div>
      <div className="absolute bottom-4 left-5 font-mono text-[11px] tracking-[0.16em] text-text-dim">
        SRE WAR ROOM
      </div>
      <div className="absolute bottom-4 right-5 font-mono text-[11px] tracking-[0.16em] text-text-dim">
        AUTHORIZED PERSONNEL ONLY
      </div>

      <form
        onSubmit={submit}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 420,
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: 8,
          padding: "28px 32px",
          boxShadow:
            "0 30px 90px -30px rgba(0,0,0,0.85), 0 0 0 1px color-mix(in oklch, var(--color-accent) 18%, transparent)",
        }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div
            className="relative w-9 h-9 rounded-md flex items-center justify-center"
            style={{
              background: "var(--color-bg-sunken)",
              border:
                "1px solid color-mix(in oklch, var(--color-accent) 45%, transparent)",
            }}
          >
            <svg width="17" height="17" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 11 L7 2 L12 11"
                stroke="var(--color-accent)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="7" cy="8.5" r="1.4" fill="var(--color-accent)" />
            </svg>
          </div>
          <div>
            <div className="font-mono text-[15px] font-bold tracking-[0.16em] text-text-strong leading-none">
              TRIAGENT
            </div>
            <div className="font-mono text-[11px] tracking-[0.14em] text-text-dim mt-1">
              SRE WAR ROOM · LOGIN
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label
            className="block mb-1.5 font-mono uppercase font-medium"
            style={{
              letterSpacing: "0.12em",
              fontSize: 10.5,
              color: "var(--color-text-mid)",
            }}
          >
            Operator
          </label>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="w-full font-mono text-[13px] text-text-strong tabular"
            style={{
              background: "var(--color-bg-sunken)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "8px 10px",
              outline: "none",
            }}
          />
        </div>

        <div className="mb-5">
          <label
            className="block mb-1.5 font-mono uppercase font-medium"
            style={{
              letterSpacing: "0.12em",
              fontSize: 10.5,
              color: "var(--color-text-mid)",
            }}
          >
            Access Key
          </label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            className="w-full font-mono text-[13px] text-text-strong tabular"
            style={{
              background: "var(--color-bg-sunken)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "8px 10px",
              outline: "none",
            }}
          />
        </div>

        <button
          type="submit"
          className="w-full font-mono text-[12px] tracking-[0.14em] font-bold text-white"
          style={{
            background: "var(--color-accent)",
            border:
              "1px solid color-mix(in oklch, var(--color-accent) 80%, white)",
            borderRadius: 4,
            padding: "10px 0",
            cursor: "pointer",
          }}
        >
          LOGIN · ENTER WAR ROOM →
        </button>

        <div className="mt-4 flex items-center justify-between font-mono text-[10.5px] text-text-dim">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full pulse-dot"
              style={{ background: "var(--color-success)" }}
            />
            mTLS · ed25519 · verified
          </span>
          <span>session-id 8c2f1a</span>
        </div>
      </form>
    </div>
  );
}
