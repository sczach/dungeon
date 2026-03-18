import { useState, useEffect, useRef } from "react";

const SCREENS = ["Landing", "Calibration", "Gameplay", "Victory", "Defeat", "PvP Arena"];

const C = {
  bg: "#0a0a1a",
  panel: "#111128",
  card: "#1a1a3e",
  accent: "#e94560",
  accentDim: "#b83550",
  green: "#2ecc71",
  yellow: "#f1c40f",
  blue: "#3498db",
  purple: "#9b59b6",
  text: "#e8e8f0",
  muted: "#6a6a8a",
  dark: "#080816",
  border: "#2a2a4a",
  hp: "#e74c3c",
  shield: "#3498db",
};

const glow = (color, r = 20) => `0 0 ${r}px ${color}40, 0 0 ${r * 2}px ${color}20`;

function BrowserChrome({ url, children }) {
  return (
    <div style={{ background: C.dark, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, boxShadow: `0 8px 32px #00000080` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#0d0d20", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff5f57", "#ffbd2e", "#28c840"].map((c, i) => (
            <div key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <div style={{ flex: 1, background: C.card, borderRadius: 6, padding: "5px 14px", marginLeft: 8, fontSize: 12, color: C.muted, fontFamily: "monospace" }}>
          {url}
        </div>
      </div>
      <div style={{ minHeight: 500 }}>{children}</div>
    </div>
  );
}

function Badge({ children, color = C.accent }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, background: `${color}30`, color, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
      {children}
    </span>
  );
}

function Btn({ children, primary, small, style: s, ...rest }) {
  return (
    <button
      style={{
        padding: small ? "8px 18px" : "14px 32px",
        borderRadius: 8,
        border: primary ? "none" : `1px solid ${C.border}`,
        background: primary ? `linear-gradient(135deg, ${C.accent}, ${C.accentDim})` : "transparent",
        color: C.text,
        fontSize: small ? 13 : 16,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: 0.5,
        boxShadow: primary ? glow(C.accent, 12) : "none",
        transition: "all 0.2s",
        ...s,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── LANDING PAGE ── */
function LandingScreen() {
  return (
    <BrowserChrome url="https://chordwars.com">
      <div style={{ background: `linear-gradient(180deg, ${C.bg} 0%, #12122e 100%)`, padding: "48px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, fontWeight: 700, marginBottom: 12 }}>PLAY YOUR GUITAR. DEFEND YOUR BASE.</div>
        <h1 style={{ fontSize: 56, fontWeight: 900, color: C.text, margin: "0 0 8px", letterSpacing: -1, textShadow: glow(C.accent, 30) }}>
          CHORD<span style={{ color: C.accent }}> WARS</span>
        </h1>
        <p style={{ color: C.muted, fontSize: 17, maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6 }}>
          The tower defense game you play with a real guitar. Strum chords to spawn units. Defend your base. Level up your playing.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 40 }}>
          <Btn primary>Play Free — No Download</Btn>
          <Btn>Watch Trailer</Btn>
        </div>
        <div style={{ display: "flex", gap: 32, justifyContent: "center", marginBottom: 48 }}>
          {[["1,247", "Players"], ["89%", "Detection Rate"], ["4.8★", "Rating"]].map(([n, l], i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: C.text }}>{n}</div>
              <div style={{ fontSize: 12, color: C.muted, letterSpacing: 1 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: "24px 32px", maxWidth: 420, margin: "0 auto 32px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Get notified when new maps drop</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="your@email.com"
              style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 14, outline: "none" }}
            />
            <Btn primary small>Subscribe</Btn>
          </div>
        </div>
        <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
          {["𝕏 Twitter", "Discord", "YouTube"].map((s, i) => (
            <span key={i} style={{ color: C.muted, fontSize: 13, cursor: "pointer" }}>{s}</span>
          ))}
        </div>
      </div>
    </BrowserChrome>
  );
}

/* ── CALIBRATION ── */
function CalibrationScreen() {
  const [detected, setDetected] = useState(null);
  const [hits, setHits] = useState({});
  const chords = ["G", "C", "D", "Em", "Am", "E"];
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let frame;
    const draw = () => {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const t = Date.now() / 1000;
      ctx.strokeStyle = C.accent + "80";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const y = canvas.height / 2 + Math.sin(x * 0.03 + t * 3) * 20 * Math.sin(t * 0.7) + Math.sin(x * 0.07 + t * 5) * 10;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = C.blue + "40";
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const y = canvas.height / 2 + Math.cos(x * 0.05 + t * 2) * 15 + Math.sin(x * 0.02 + t * 4) * 8;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  const simDetect = (chord) => {
    setDetected(chord);
    setHits((h) => ({ ...h, [chord]: true }));
    setTimeout(() => setDetected(null), 1500);
  };

  const allDone = chords.every((c) => hits[c]);

  return (
    <BrowserChrome url="https://chordwars.com/calibrate">
      <div style={{ background: C.bg, padding: "24px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ color: C.text, fontSize: 22, margin: 0 }}>🎸 Calibration & Practice</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.green, boxShadow: glow(C.green, 8) }} />
            <span style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>Microphone Active</span>
          </div>
        </div>

        <canvas ref={canvasRef} width={600} height={80} style={{ width: "100%", height: 80, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 20 }} />

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>DETECTED CHORD</div>
          <div style={{ fontSize: 72, fontWeight: 900, color: detected ? C.green : C.muted + "40", textShadow: detected ? glow(C.green, 20) : "none", minHeight: 90, lineHeight: 1 }}>
            {detected || "—"}
          </div>
          {detected && (
            <div style={{ marginTop: 4 }}>
              <Badge color={C.green}>94% confidence</Badge>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 24 }}>
          {chords.map((c) => (
            <button
              key={c}
              onClick={() => simDetect(c)}
              style={{
                padding: "20px 0",
                borderRadius: 10,
                border: `2px solid ${hits[c] ? C.green : C.border}`,
                background: hits[c] ? `${C.green}15` : C.card,
                color: hits[c] ? C.green : C.text,
                fontSize: 22,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: hits[c] ? glow(C.green, 8) : "none",
                transition: "all 0.3s",
              }}
            >
              {c}
              {hits[c] && <span style={{ display: "block", fontSize: 11, fontWeight: 600, marginTop: 4 }}>✓ Detected</span>}
            </button>
          ))}
        </div>

        <div style={{ background: C.card, borderRadius: 8, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>Noise Floor</span>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.bg }}>
            <div style={{ width: "15%", height: "100%", borderRadius: 3, background: C.green }} />
          </div>
          <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Low ✓</span>
        </div>

        <div style={{ textAlign: "center" }}>
          <Btn primary style={{ opacity: allDone ? 1 : 0.4, pointerEvents: allDone ? "auto" : "none", width: "100%" }}>
            {allDone ? "⚔️ Ready to Fight!" : `Play all 6 chords to continue (${Object.keys(hits).length}/6)`}
          </Btn>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Click chord buttons above to simulate detection</div>
        </div>
      </div>
    </BrowserChrome>
  );
}

/* ── GAMEPLAY ── */
function GameplayScreen() {
  const canvasRef = useRef(null);
  const [confidence, setConfidence] = useState(78);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let frame;
    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = "#0b1a0b";
      ctx.fillRect(0, 0, W, H);

      // ground gradient
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, "#0a1a0a");
      grd.addColorStop(1, "#142814");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      // path
      const path = [[40, H - 40], [120, H - 80], [220, H - 60], [320, H / 2], [420, H / 2 - 20], [520, H / 2 + 10], [W - 40, 60]];
      ctx.strokeStyle = "#3a2a1a";
      ctx.lineWidth = 28;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.strokeStyle = "#4a3a2a";
      ctx.lineWidth = 22;
      ctx.stroke();

      // campfire glow at end
      const cf = path[path.length - 1];
      const t = Date.now() / 1000;
      const glowR = 40 + Math.sin(t * 3) * 8;
      const grad = ctx.createRadialGradient(cf[0], cf[1], 0, cf[0], cf[1], glowR);
      grad.addColorStop(0, "#ff660060");
      grad.addColorStop(0.5, "#ff330030");
      grad.addColorStop(1, "#ff000000");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cf[0], cf[1], glowR, 0, Math.PI * 2);
      ctx.fill();

      // campfire icon
      ctx.fillStyle = "#ff8844";
      ctx.beginPath();
      ctx.arc(cf[0], cf[1], 8, 0, Math.PI * 2);
      ctx.fill();

      // enemies on path
      const enemies = [
        { pos: 0.15, hp: 1, color: "#e74c3c" },
        { pos: 0.25, hp: 0.7, color: "#e74c3c" },
        { pos: 0.4, hp: 0.5, color: "#c0392b" },
        { pos: 0.55, hp: 0.9, color: "#e74c3c" },
      ];
      enemies.forEach((e) => {
        const idx = Math.floor(e.pos * (path.length - 1));
        const frac = (e.pos * (path.length - 1)) - idx;
        const [x1, y1] = path[Math.min(idx, path.length - 1)];
        const [x2, y2] = path[Math.min(idx + 1, path.length - 1)];
        const ex = x1 + (x2 - x1) * frac;
        const ey = y1 + (y2 - y1) * frac;

        // enemy body
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(ex, ey, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // hp bar
        ctx.fillStyle = "#333";
        ctx.fillRect(ex - 12, ey - 18, 24, 4);
        ctx.fillStyle = e.hp > 0.5 ? C.green : C.yellow;
        ctx.fillRect(ex - 12, ey - 18, 24 * e.hp, 4);
      });

      // defender units
      const defenders = [
        { x: 180, y: H - 120, color: C.blue, type: "▲" },
        { x: 350, y: H / 2 - 50, color: C.green, type: "●" },
        { x: 460, y: H / 2 + 50, color: C.purple, type: "◆" },
      ];
      defenders.forEach((d) => {
        ctx.fillStyle = d.color + "30";
        ctx.beginPath();
        ctx.arc(d.x, d.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 8, 0, Math.PI * 2);
        ctx.fill();
        // range circle
        ctx.strokeStyle = d.color + "25";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(d.x, d.y, 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const i = setInterval(() => setConfidence(60 + Math.floor(Math.random() * 35)), 800);
    return () => clearInterval(i);
  }, []);

  return (
    <BrowserChrome url="https://chordwars.com/play">
      <div style={{ background: C.bg }}>
        {/* HUD top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "#0005", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: C.muted }}>BASE HP</span>
            <div style={{ width: 120, height: 10, borderRadius: 5, background: C.dark, overflow: "hidden" }}>
              <div style={{ width: "72%", height: "100%", borderRadius: 5, background: `linear-gradient(90deg, ${C.hp}, #ff6b6b)` }} />
            </div>
            <span style={{ fontSize: 13, color: C.hp, fontWeight: 700 }}>72/100</span>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <div><span style={{ fontSize: 11, color: C.muted }}>WAVE</span> <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>4</span><span style={{ color: C.muted, fontSize: 13 }}>/10</span></div>
            <div><span style={{ fontSize: 11, color: C.muted }}>SCORE</span> <span style={{ fontSize: 16, fontWeight: 800, color: C.yellow }}>2,450</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, boxShadow: glow(C.green, 4) }} />
              <span style={{ fontSize: 11, color: C.green }}>MIC</span>
            </div>
          </div>
        </div>

        {/* Game Canvas */}
        <canvas ref={canvasRef} width={600} height={300} style={{ width: "100%", height: 300, display: "block" }} />

        {/* Chord Prompt Area */}
        <div style={{ padding: "16px 16px 20px", background: `linear-gradient(180deg, ${C.bg}, ${C.panel})`, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>PLAY THIS CHORD</div>
              <div style={{ fontSize: 64, fontWeight: 900, color: C.accent, textShadow: glow(C.accent, 16), lineHeight: 1 }}>Am</div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: C.muted, marginTop: 6, letterSpacing: 2 }}>x 0 2 2 1 0</div>
            </div>
            <div style={{ width: 1, height: 80, background: C.border }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>MIC CONFIDENCE</div>
              <div style={{ height: 12, borderRadius: 6, background: C.dark, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ width: `${confidence}%`, height: "100%", borderRadius: 6, background: confidence > 70 ? C.green : confidence > 50 ? C.yellow : C.hp, transition: "width 0.3s" }} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: confidence > 70 ? C.green : C.muted }}>{confidence}%</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Badge color={C.green}>×3 Combo</Badge>
                <Badge color={C.yellow}>+150 pts</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

/* ── VICTORY ── */
function VictoryScreen() {
  return (
    <BrowserChrome url="https://chordwars.com/play">
      <div style={{ background: `linear-gradient(180deg, #0a1a0a 0%, ${C.bg} 100%)`, padding: "40px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 4 }}>⭐⭐⭐</div>
        <h1 style={{ fontSize: 42, fontWeight: 900, color: C.green, margin: "0 0 8px", textShadow: glow(C.green, 20) }}>VICTORY!</h1>
        <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>The Campfire — Wave 10 Complete</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 400, margin: "0 auto 28px" }}>
          {[
            ["Score", "4,850", null],
            ["Accuracy", "87%", "Personal Best!"],
            ["Enemies Defeated", "38/42", null],
            ["Best Combo", "×7", "Personal Best!"],
            ["Chords Played", "64", null],
            ["Time", "4:32", null],
          ].map(([label, val, badge], i) => (
            <div key={i} style={{ background: C.card, borderRadius: 8, padding: "12px 16px", border: `1px solid ${C.border}`, textAlign: "left" }}>
              <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>
                {val}
                {badge && <span style={{ marginLeft: 8 }}><Badge color={C.yellow}>{badge}</Badge></span>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: C.card, borderRadius: 10, padding: "16px 20px", marginBottom: 24, border: `1px solid ${C.border}`, textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Chord Breakdown</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["G", 95], ["C", 88], ["D", 91], ["Em", 82], ["Am", 79], ["E", 86]].map(([ch, pct]) => (
              <div key={ch} style={{ background: C.bg, borderRadius: 6, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, color: C.text, fontSize: 15 }}>{ch}</span>
                <span style={{ fontSize: 12, color: pct >= 85 ? C.green : pct >= 75 ? C.yellow : C.hp, fontWeight: 600 }}>{pct}%</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Btn primary>Next Level →</Btn>
          <Btn>Share to 𝕏</Btn>
          <Btn>Retry</Btn>
        </div>
      </div>
    </BrowserChrome>
  );
}

/* ── DEFEAT ── */
function DefeatScreen() {
  return (
    <BrowserChrome url="https://chordwars.com/play">
      <div style={{ background: `linear-gradient(180deg, #1a0a0a 0%, ${C.bg} 100%)`, padding: "40px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 4 }}>💀</div>
        <h1 style={{ fontSize: 42, fontWeight: 900, color: C.hp, margin: "0 0 8px", textShadow: glow(C.hp, 16) }}>DEFEATED</h1>
        <p style={{ color: C.muted, fontSize: 14, marginBottom: 28 }}>The Campfire — Fell at Wave 7</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 400, margin: "0 auto 24px" }}>
          {[
            ["Score", "2,180"],
            ["Accuracy", "62%"],
            ["Enemies Defeated", "21/30"],
            ["Waves Survived", "6/10"],
          ].map(([label, val], i) => (
            <div key={i} style={{ background: C.card, borderRadius: 8, padding: "12px 16px", border: `1px solid ${C.border}`, textAlign: "left" }}>
              <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ background: `${C.yellow}10`, borderRadius: 10, padding: "16px 20px", marginBottom: 28, border: `1px solid ${C.yellow}30`, textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.yellow, marginBottom: 6 }}>💡 Tip: Strengthen Your Am Chord</div>
          <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.6 }}>
            Your Am accuracy was 48% — the lowest of your 6 chords. Try placing your index finger closer to the fret wire on the 1st fret of the B string. Practice the transition from C → Am in Practice Mode — it shares two finger positions.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Btn primary>⚔️ Retry Wave 7</Btn>
          <Btn>🎸 Practice Am</Btn>
          <Btn>Menu</Btn>
        </div>
      </div>
    </BrowserChrome>
  );
}

/* ── PVP ARENA ── */
function PvPScreen() {
  return (
    <BrowserChrome url="https://chordwars.com/pvp">
      <div style={{ background: C.bg }}>
        {/* Opponent bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: `${C.hp}15`, borderBottom: `1px solid ${C.hp}30` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.card, border: `2px solid ${C.hp}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎸</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>ShreddMaster42</div>
              <div style={{ fontSize: 11, color: C.muted }}>Elo 1,340</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>BASE HP</span>
            <div style={{ width: 100, height: 8, borderRadius: 4, background: C.dark }}>
              <div style={{ width: "58%", height: "100%", borderRadius: 4, background: C.hp }} />
            </div>
            <span style={{ fontSize: 12, color: C.hp, fontWeight: 700 }}>58%</span>
          </div>
        </div>

        {/* Arena - 3 lanes */}
        <div style={{ padding: "12px 16px", minHeight: 240 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {["Top Lane", "Mid Lane", "Bot Lane"].map((lane, li) => (
              <div key={li} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: C.muted, width: 60, textAlign: "right" }}>{lane}</span>
                <div style={{ flex: 1, height: 48, borderRadius: 6, background: C.card, border: `1px solid ${C.border}`, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: `${C.muted}40` }} />
                  {/* Your units (blue, left side) */}
                  {[0.15, 0.25, 0.35].slice(0, li === 1 ? 3 : 2).map((p, i) => (
                    <div key={`y${i}`} style={{ position: "absolute", left: `${p * 100}%`, top: "50%", transform: "translate(-50%, -50%)", width: 12, height: 12, borderRadius: "50%", background: C.blue, boxShadow: glow(C.blue, 4) }} />
                  ))}
                  {/* Enemy units (red, right side) */}
                  {[0.7, 0.8].slice(0, li === 1 ? 2 : 1).map((p, i) => (
                    <div key={`e${i}`} style={{ position: "absolute", left: `${p * 100}%`, top: "50%", transform: "translate(-50%, -50%)", width: 12, height: 12, borderRadius: "50%", background: C.hp, boxShadow: glow(C.hp, 4) }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <Badge color={C.muted}>PHASE 3 PREVIEW — Symmetric 3-Lane MOBA Format</Badge>
          </div>
        </div>

        {/* Your bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: `${C.blue}15`, borderTop: `1px solid ${C.blue}30`, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.card, border: `2px solid ${C.blue}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎶</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>You (Duncan)</div>
              <div style={{ fontSize: 11, color: C.muted }}>Elo 1,285</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>BASE HP</span>
            <div style={{ width: 100, height: 8, borderRadius: 4, background: C.dark }}>
              <div style={{ width: "81%", height: "100%", borderRadius: 4, background: C.blue }} />
            </div>
            <span style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}>81%</span>
          </div>
        </div>

        {/* Input area */}
        <div style={{ padding: "16px", background: C.panel }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[["⚔️ Attack", C.hp], ["🛡️ Defend", C.blue], ["⚡ Ultimate", C.yellow]].map(([label, color], i) => (
              <button
                key={i}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8,
                  border: i === 0 ? `2px solid ${color}` : `1px solid ${C.border}`,
                  background: i === 0 ? `${color}20` : "transparent",
                  color: i === 0 ? color : C.muted,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>FREE PLAY — STRUM TO ATTACK</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: C.accent, textShadow: glow(C.accent, 10) }}>Play any chord!</div>
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

/* ── USER FLOW DIAGRAM ── */
function UserFlowDiagram() {
  const nodes = [
    { id: "landing", label: "Landing Page", x: 300, y: 40, color: C.accent },
    { id: "calibrate", label: "Calibration", x: 300, y: 120, color: C.blue },
    { id: "gameplay", label: "Gameplay", x: 300, y: 200, color: C.green },
    { id: "victory", label: "Victory", x: 160, y: 290, color: C.green },
    { id: "defeat", label: "Defeat", x: 440, y: 290, color: C.hp },
    { id: "pvp", label: "PvP Arena", x: 540, y: 120, color: C.purple },
  ];
  const edges = [
    ["landing", "calibrate"],
    ["calibrate", "gameplay"],
    ["gameplay", "victory"],
    ["gameplay", "defeat"],
    ["defeat", "calibrate"],
    ["defeat", "gameplay"],
    ["victory", "gameplay"],
    ["landing", "pvp"],
  ];

  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
      <h3 style={{ color: C.text, fontSize: 16, margin: "0 0 16px", fontWeight: 700 }}>User Flow Diagram</h3>
      <svg viewBox="0 0 620 340" style={{ width: "100%" }}>
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={C.muted} />
          </marker>
        </defs>
        {edges.map(([from, to], i) => {
          const a = nodes.find((n) => n.id === from);
          const b = nodes.find((n) => n.id === to);
          return <line key={i} x1={a.x} y1={a.y + 14} x2={b.x} y2={b.y - 14} stroke={C.muted} strokeWidth={1.5} markerEnd="url(#arrowhead)" strokeDasharray={from === "landing" && to === "pvp" ? "4,4" : "none"} />;
        })}
        {nodes.map((n) => (
          <g key={n.id}>
            <rect x={n.x - 55} y={n.y - 14} width={110} height={28} rx={6} fill={C.card} stroke={n.color} strokeWidth={2} />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fill={C.text} fontSize={11} fontWeight="700" fontFamily="Arial">{n.label}</text>
          </g>
        ))}
        <text x={555} y={160} textAnchor="middle" fill={C.muted} fontSize={9} fontFamily="Arial">Phase 3</text>
      </svg>
    </div>
  );
}

/* ── MAIN APP ── */
export default function ChordWarsWireframes() {
  const [active, setActive] = useState(0);
  const screens = [LandingScreen, CalibrationScreen, GameplayScreen, VictoryScreen, DefeatScreen, PvPScreen];
  const Screen = screens[active];

  return (
    <div style={{ background: "#060612", minHeight: "100vh", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: C.text }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 0", maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>
            CHORD<span style={{ color: C.accent }}> WARS</span>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 400, marginLeft: 8 }}>MVP Wireframes</span>
          </h1>
          <Badge>v1.0</Badge>
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: "0 0 16px", lineHeight: 1.5 }}>
          Interactive screen mockups — Vanilla JS + Canvas + Web Audio API
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
          {SCREENS.map((s, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                background: i === active ? C.card : "transparent",
                color: i === active ? C.text : C.muted,
                fontSize: 12,
                fontWeight: i === active ? 700 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                borderBottom: i === active ? `2px solid ${C.accent}` : "2px solid transparent",
                transition: "all 0.2s",
              }}
            >
              {i === 5 && "🔮 "}{s}
            </button>
          ))}
        </div>
      </div>

      {/* Screen Content */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 24px 24px" }}>
        <Screen />
      </div>

      {/* User Flow + Tech Note */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 24px 32px" }}>
        <UserFlowDiagram />
        <div style={{ marginTop: 16, background: C.card, borderRadius: 10, padding: "14px 18px", border: `1px solid ${C.border}`, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          <strong style={{ color: C.text }}>Tech Stack:</strong> Vanilla JavaScript (ES Modules) · HTML5 Canvas 2D · Web Audio API · YIN Pitch Detection · Firebase (Phase 2) · Vercel Hosting
        </div>
      </div>
    </div>
  );
}
