import React, { useMemo, useState } from "react";

/**
 * 2WW Colorectal Pathway Selector (MVP)
 * 
 * 
 *
 *
 * UI note:
 * This version uses simple inline/CSS-in-JS styling so it looks good even WITHOUT Tailwind.
 */

const pathways = [
  { key: "abdominal_mass", label: "Abdominal mass" },
  { key: "anal_rectal_lesion", label: "Anal or rectal lesion" },
  { key: "cibh_50_85", label: "Change in bowel habit (age 50–85)" },
  { key: "cibh_gt_85", label: "Change in bowel habit (age >85)" },
  { key: "ida_gt_50", label: "Iron deficiency anaemia (age >50)" },
  { key: "ida_lt_50", label: "Iron deficiency anaemia (age <50)" },
  {
    key: "rb_cibh_lt_50_anaemia",
    label: "Rectal bleeding + CIBH (age <50) WITH anaemia",
  },
  {
    key: "rb_cibh_lt_50_no_anaemia",
    label: "Rectal bleeding + CIBH (age <50) WITHOUT anaemia",
  },
  { key: "wl_50_85", label: "Weight loss (age 50–85)" },
  { key: "wl_lt_50_or_gt_85", label: "Weight loss (age <50 OR >85)" },
];

// FIT bands: align to common interpretation “<10, 10–100, >100”
// (Your rules use “<9.9” but in practice users will type 9.9 or 10. We treat <10 as the low band.)
function fitBand(fit) {
  if (fit === null || Number.isNaN(fit)) return null;
  if (fit < 10) return "lt_10";
  if (fit >= 10 && fit <= 100) return "10_100";
  return "gt_100";
}

function bandLabel(band) {
  if (!band) return "—";
  if (band === "lt_10") return "<10";
  if (band === "10_100") return "10–100";
  if (band === "gt_100") return ">100";
  return band;
}

function decision({ pathway, age, fit, frailElderly, anaemia, whoStatus }) {
  const missing = [];
  if (!pathway) missing.push("pathway selection");
  if (pathway && pathway !== "anal_rectal_lesion") {
    if (age === null || Number.isNaN(age)) missing.push("age");
    if (fit === null || Number.isNaN(fit)) missing.push("FIT test result");
  }

  // We flag these as missing when relevant, but we still attempt a best-effort outcome.
  if (pathway === "abdominal_mass" && frailElderly === null) missing.push("frail/elderly status");
  if (
    (pathway === "rb_cibh_lt_50_anaemia" || pathway === "rb_cibh_lt_50_no_anaemia") &&
    anaemia === null
  ) {
    missing.push("anaemia status");
  }

  const band = fitBand(fit);

  const res = {
    missing,
    band,
    outcome: "—",
    step: pathway ? "" : "Choose a pathway",
    mapping: [],
    supplementary: [],
  };

  function finalize(result) {
    if (whoStatus === 3 || whoStatus === 4) {
      result.outcome = "Face-to-face assessment";
      result.mapping.push("WHO status 3–4 → face-to-face assessment.");
    }
    return result;
  }

  if (!pathway) return finalize(res);

  switch (pathway) {
    // Rule set A
    case "abdominal_mass": {
      res.step = "Rule set A: Abdominal mass";
      if (frailElderly === true) {
        res.outcome = "CT abdomen & pelvis (CT AP)";
        res.mapping.push("Abdominal mass + frail/elderly → CT AP.");
        return finalize(res);
      }
      // If frailElderly is false OR unknown, fall back to FIT-band logic (best effort).
      if (band === "10_100") {
        res.outcome = "CT colonography (CTC)";
        res.mapping.push("Abdominal mass + FIT 10–100 → CTC.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.mapping.push("Abdominal mass + FIT >100 → colonoscopy.");
      } else if (band === "lt_10") {
        res.outcome = "CT abdomen & pelvis (CT AP)";
        res.mapping.push("Abdominal mass + FIT <10 → CT AP.");
      } else {
        res.outcome = "Needs FIT result";
      }
      if (frailElderly === null) {
        res.supplementary.push(
          "Frail/elderly status missing: if frail/elderly, pathway specifies CT AP regardless of FIT band." 
        );
      }
      return finalize(res);
    }
    case "anal_rectal_lesion": {
      res.step = "Rule set: Anal or rectal lesion";
      res.outcome = "Face-to-face assessment";
      res.mapping.push("Anal or rectal lesion → face-to-face assessment.");
      return finalize(res);
    }

    // Rule set B
    case "cibh_50_85": {
      res.step = "Rule set B: CIBH age 50–85";
      if (band === "10_100") {
        res.outcome = "CT colonography (CTC)";
        res.mapping.push("CIBH 50–85 + FIT 10–100 → CTC.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.mapping.push("CIBH 50–85 + FIT >100 → colonoscopy.");
      } else if (band === "lt_10") {
        res.outcome = "Follow pathway guidance for FIT <10 (not provided in your rules yet)";
        res.mapping.push("CIBH 50–85 + FIT <10 → follow FIT <10 guidance.");
      } else {
        res.outcome = "Needs FIT result";
      }
      if (age !== null && !Number.isNaN(age) && (age < 50 || age > 85)) {
        res.supplementary.push("Age entered is outside 50–85 for this pathway selection.");
      }
      return finalize(res);
    }

    // Rule set C
    case "cibh_gt_85": {
      res.step = "Rule set C: CIBH age >85";
      if (band === "10_100") {
        res.outcome = "Tagged CT scan";
        res.mapping.push("CIBH >85 + FIT 10–100 → tagged CT scan.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.mapping.push("CIBH >85 + FIT >100 → colonoscopy.");
      } else if (band === "lt_10") {
        res.outcome = "Follow pathway guidance for FIT <10 (not provided in your rules yet)";
        res.mapping.push("CIBH >85 + FIT <10 → follow FIT <10 guidance.");
      } else {
        res.outcome = "Needs FIT result";
      }
      if (age !== null && !Number.isNaN(age) && age <= 85) {
        res.supplementary.push("Age entered is not >85 for this pathway selection.");
      }
      return finalize(res);
    }

    // Rule set D
    case "ida_gt_50": {
      res.step = "Rule set D: IDA age >50";
      if (band === "gt_100") {
        res.outcome = "Colonoscopy + OGD";
        res.mapping.push("IDA >50 + FIT >100 → colonoscopy + OGD.");
      } else if (band === "10_100") {
        res.outcome = "CTC + OGD";
        res.mapping.push("IDA >50 + FIT 10–100 → CTC + OGD.");
      } else if (band === "lt_10") {
        res.outcome = "CTC + OGD";
        res.mapping.push("IDA >50 + FIT <10 → CTC + OGD.");
      } else {
        res.outcome = "Needs FIT result";
      }
      if (age !== null && !Number.isNaN(age) && age <= 50) {
        res.supplementary.push("Age entered is not >50 for this pathway selection.");
      }
      return finalize(res);
    }

    // Rule set E
    case "ida_lt_50": {
      res.step = "Rule set E: IDA age <50";
      res.outcome = "Colonoscopy + OGD";
      res.mapping.push("IDA <50 → colonoscopy + OGD (regardless of FIT band in your rules).");
      if (age !== null && !Number.isNaN(age) && age >= 50) {
        res.supplementary.push("Age entered is not <50 for this pathway selection.");
      }
      return finalize(res);
    }

    // Rule set F
    case "rb_cibh_lt_50_anaemia": {
      res.step = "Rule set F: Rectal bleeding + CIBH <50 with anaemia";
      if (anaemia === true) {
        res.outcome = "Colonoscopy";
        res.mapping.push("RB + CIBH <50 + anaemia → colonoscopy regardless of FIT.");
      } else if (anaemia === false) {
        res.outcome = "Anaemia not present — select the 'WITHOUT anaemia' pathway";
        res.mapping.push("This pathway applies only if anaemia is present.");
      } else {
        res.outcome = "Needs anaemia status";
        res.mapping.push("If anaemia is present → colonoscopy regardless of FIT.");
      }
      if (age !== null && !Number.isNaN(age) && age >= 50) {
        res.supplementary.push("Age entered is not <50 for this pathway selection.");
      }
      return finalize(res);
    }

    // Rule set G
    case "rb_cibh_lt_50_no_anaemia": {
      res.step = "Rule set G: Rectal bleeding + CIBH <50 without anaemia";
      if (anaemia === true) {
        res.outcome = "Anaemia present — select the 'WITH anaemia' pathway (colonoscopy regardless of FIT)";
        res.mapping.push("With anaemia, rule set F overrides FIT band.");
        return finalize(res);
      }
      if (band === "10_100" || band === "gt_100") {
        res.outcome = "Flexible sigmoidoscopy (FOS) → if NAD, proceed to colonoscopy";
        res.mapping.push("RB + CIBH <50 no anaemia + FIT ≥10 → FOS then if NAD proceed to colonoscopy.");
      } else if (band === "lt_10") {
        res.outcome = "Flexible sigmoidoscopy";
        res.mapping.push("RB + CIBH <50 no anaemia + FIT <10 → flexible sigmoidoscopy.");
      } else {
        res.outcome = "Needs FIT result";
      }
      if (anaemia === null) {
        res.supplementary.push("Anaemia status missing: if anaemia present → colonoscopy regardless of FIT.");
      }
      if (age !== null && !Number.isNaN(age) && age >= 50) {
        res.supplementary.push("Age entered is not <50 for this pathway selection.");
      }
      return finalize(res);
    }

    // Rule set H
    case "wl_50_85": {
      res.step = "Rule set H: Weight loss age 50–85";
      if (band === "10_100") {
        res.outcome = "CTC + CT thorax";
        res.mapping.push("Weight loss 50–85 + FIT 10–100 → CTC + CT thorax.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.mapping.push("Weight loss 50–85 + FIT >100 → colonoscopy.");
      } else if (band === "lt_10") {
        res.outcome = "Follow pathway guidance for FIT <10 (not provided in your rules yet)";
        res.mapping.push("Weight loss 50–85 + FIT <10 → follow FIT <10 guidance.");
      } else {
        res.outcome = "Needs FIT result";
      }
      if (age !== null && !Number.isNaN(age) && (age < 50 || age > 85)) {
        res.supplementary.push("Age entered is outside 50–85 for this pathway selection.");
      }
      return finalize(res);
    }

    // Rule set I
    case "wl_lt_50_or_gt_85": {
      res.step = "Rule set I: Weight loss age <50 OR >85";
      if (band === "10_100") {
        res.outcome = "CT thorax/abdomen/pelvis (CT TAP)";
        res.mapping.push("Weight loss <50 or >85 + FIT 10–100 → CT TAP.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.mapping.push("Weight loss <50 or >85 + FIT >100 → colonoscopy.");
      } else if (band === "lt_10") {
        res.outcome = "Follow pathway guidance for FIT <10 (not provided in your rules yet)";
        res.mapping.push("Weight loss <50 or >85 + FIT <10 → follow FIT <10 guidance.");
      } else {
        res.outcome = "Needs FIT result";
      }
      if (age !== null && !Number.isNaN(age) && age >= 50 && age <= 85) {
        res.supplementary.push("Age entered is 50–85; consider selecting the 50–85 weight loss pathway.");
      }
      return finalize(res);
    }

    default:
      res.step = "Not covered";
      res.outcome = "This selection is not covered by the provided flowchart rules.";
      return finalize(res);
  }
}

function toClipboard(text) {
  if (!navigator?.clipboard?.writeText) return Promise.reject();
  return navigator.clipboard.writeText(text);
}

const S = {
  page: {
    minHeight: "100vh",
    padding: 20,
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
    background: "#0b1220",
    color: "#eaf0ff",
  },
  container: {
    maxWidth: 1050,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  h1: { fontSize: 32, margin: 0, letterSpacing: -0.3 },
  sub: { marginTop: 8, color: "#b9c6e6", maxWidth: 800, lineHeight: 1.4 },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 16,
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1.1fr 0.9fr",
    gap: 16,
  },
  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  cardTitle: { fontSize: 14, textTransform: "uppercase", letterSpacing: 1, color: "#b9c6e6" },
  label: { fontSize: 13, color: "#d7e2ff", marginBottom: 6 },
  input: {
    width: "100%",
    maxWidth: 180,
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "#eaf0ff",
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(234,240,255,0.06)",
    background: "#0b1220",
    color: "#eaf0ff",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    paddingRight: 36,
  },
  option: {
    background: "#0b1220",
    color: "#eaf0ff",
  },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  pillRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  pill: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eaf0ff",
  },
  btnRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  btn: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "#eaf0ff",
    cursor: "pointer",
  },
  btnPrimary: {
    background: "linear-gradient(90deg, #3b82f6, #22c55e)",
    border: "none",
    color: "#07101f",
    fontWeight: 700,
  },
  segmented: { display: "flex", gap: 6 },
  segBtn: (active) => ({
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
    color: "#eaf0ff",
    cursor: "pointer",
    minWidth: 46,
  }),
  outcomeBox: {
    borderRadius: 16,
    padding: 14,
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  outcomeBig: { fontSize: 22, fontWeight: 800, marginTop: 6 },
  warn: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    background: "rgba(245,158,11,0.14)",
    border: "1px solid rgba(245,158,11,0.35)",
    color: "#ffe7bf",
  },
  ok: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.35)",
    color: "#d7ffe6",
  },
  list: { margin: "8px 0 0 0", paddingLeft: 18, color: "#d7e2ff", lineHeight: 1.5 },
  hint: { fontSize: 12, color: "#b9c6e6", marginTop: 6, lineHeight: 1.35 },
};

export default function App() {
  const [pathway, setPathway] = useState("");
  const [ageStr, setAgeStr] = useState("");
  const [fitStr, setFitStr] = useState("");
  const [frailElderly, setFrailElderly] = useState(null); // null | boolean
  const [anaemia, setAnaemia] = useState(null); // null | boolean
  const [whoStatus, setWhoStatus] = useState(null); // null | 0-4
  const [copied, setCopied] = useState(false);

  const age = ageStr.trim() === "" ? null : Number(ageStr);
  const fit = fitStr.trim() === "" ? null : Number(fitStr);

  const result = useMemo(
    () => decision({ pathway, age, fit, frailElderly, anaemia, whoStatus }),
    [pathway, age, fit, frailElderly, anaemia, whoStatus]
  );

  const summaryText = useMemo(() => {
    const lines = [];
    lines.push("2WW Colorectal Pathway Selector — Summary");
    lines.push(`Pathway: ${pathways.find((p) => p.key === pathway)?.label ?? "—"}`);
    lines.push(`Age: ${age ?? "—"}`);
    lines.push(`FIT: ${fit ?? "—"} (band ${bandLabel(result.band)})`);
    if (pathway === "abdominal_mass") lines.push(`Frail/elderly: ${frailElderly ?? "—"}`);
    if (pathway?.startsWith("rb_cibh")) lines.push(`Anaemia: ${anaemia ?? "—"}`);
    lines.push(`WHO status: ${whoStatus ?? "—"}`);
    lines.push("");
    lines.push(`Outcome: ${result.outcome}`);
    lines.push(`Rule: ${result.step}`);
    if (result.missing?.length) lines.push(`Needs: ${result.missing.join(", ")}`);
    if (result.mapping?.length) {
      lines.push("");
      lines.push("Rule mapping:");
      result.mapping.forEach((m) => lines.push(`- ${m}`));
    }
    return lines.join("\n");
  }, [pathway, age, fit, frailElderly, anaemia, whoStatus, result]);

  function reset() {
    setPathway("");
    setAgeStr("");
    setFitStr("");
    setFrailElderly(null);
    setAnaemia(null);
    setWhoStatus(null);
    setCopied(false);
  }

  async function copySummary() {
    try {
      await toClipboard(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  const showFrail = pathway === "abdominal_mass";
  const showAnaemia =
    pathway === "rb_cibh_lt_50_anaemia" || pathway === "rb_cibh_lt_50_no_anaemia";

  return (
    <div style={S.page}>
      <div style={S.container}>
        <div style={S.header}>
          <div>
            <h1 style={S.h1}>2WW Colorectal Triage — Pathway Selector</h1>
            <div style={S.sub}>
              A tool for assisting in colorectal 2ww referrals. Please supply the required information, and the relevant management
              will be supplied according to the UHNM colorectal referral flowchart.
            </div>
          </div>
          <div style={S.btnRow}>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={copySummary}>
              {copied ? "Copied" : "Copy summary"}
            </button>
            <button style={S.btn} onClick={reset}>Reset</button>
          </div>
        </div>

        <div style={window.innerWidth >= 900 ? S.twoCol : S.grid}>
          {/* Inputs */}
          <section style={S.card}>
            <div style={S.cardTitle}>Inputs</div>

            <div style={{ marginTop: 12 }}>
              <div style={S.label}>Pathway</div>
              <select style={S.select} value={pathway} onChange={(e) => setPathway(e.target.value)}>
                <option value="" style={S.option}>Select…</option>
                {pathways.map((p) => (
                  <option key={p.key} value={p.key} style={S.option}>
                    {p.label}
                  </option>
                ))}
              </select>
              <div style={S.hint}>Tip: start by selecting a pathway; the outcome panel updates instantly.</div>
            </div>

            <div style={{ marginTop: 12, ...S.row }}>
              <div>
                <div style={S.label}>Age (years)</div>
                <input
                  style={S.input}
                  inputMode="numeric"
                  placeholder="e.g. 72"
                  value={ageStr}
                  onChange={(e) => setAgeStr(e.target.value)}
                />
              </div>
              <div>
                <div style={S.label}>FIT (µg Hb/g)</div>
                <input
                  style={S.input}
                  inputMode="decimal"
                  placeholder="e.g. 34"
                  value={fitStr}
                  onChange={(e) => setFitStr(e.target.value)}
                />
                <div style={S.hint}>
                  Bands used: <b>&lt;10</b>, <b>10–100</b>, <b>&gt;100</b>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#b9c6e6", textTransform: "uppercase", letterSpacing: 1 }}>
                Conditional flags
              </div>

              {showFrail ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Frail / elderly</div>
                      <div style={S.hint}>Used for Rule set A (abdominal mass).</div>
                    </div>
                    <div style={S.segmented}>
                      <button style={S.segBtn(frailElderly === true)} onClick={() => setFrailElderly(true)}>
                        Yes
                      </button>
                      <button style={S.segBtn(frailElderly === false)} onClick={() => setFrailElderly(false)}>
                        No
                      </button>
                      <button style={S.segBtn(frailElderly === null)} onClick={() => setFrailElderly(null)}>
                        —
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={S.hint}>
                  Frail/elderly only applies to <b>Abdominal mass</b>.
                </div>
              )}

              {showAnaemia ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Anaemia present</div>
                      <div style={S.hint}>Used for rectal bleeding + CIBH &lt;50 pathways.</div>
                    </div>
                    <div style={S.segmented}>
                      <button style={S.segBtn(anaemia === true)} onClick={() => setAnaemia(true)}>
                        Yes
                      </button>
                      <button style={S.segBtn(anaemia === false)} onClick={() => setAnaemia(false)}>
                        No
                      </button>
                      <button style={S.segBtn(anaemia === null)} onClick={() => setAnaemia(null)}>
                        —
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10, ...S.hint }}>
                  Anaemia flag only applies to <b>Rectal bleeding + CIBH &lt;50</b>.
                </div>
              )}
            </div>

            <div style={{ marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#b9c6e6", textTransform: "uppercase", letterSpacing: 1 }}>
                WHO performance status
              </div>
              <div style={{ marginTop: 10 }}>
                <select
                  style={S.select}
                  value={whoStatus === null ? "" : String(whoStatus)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setWhoStatus(value === "" ? null : Number(value));
                  }}
                >
                  <option value="" style={S.option}>Select status…</option>
                  <option value="0" style={S.option}>0: Fully active, no restrictions.</option>
                  <option value="1" style={S.option}>1: Restricted in strenuous activity but can do light work.</option>
                  <option value="2" style={S.option}>2: Ambulatory, capable of self-care but unable to work.</option>
                  <option value="3" style={S.option}>3: Limited self-care, mostly in bed/chair.</option>
                  <option value="4" style={S.option}>4: Completely disabled, requires total care.</option>
                </select>
                <div style={S.hint}>
                  If WHO status is <b>3</b> or <b>4</b>, recommendation changes to face-to-face assessment.
                </div>
              </div>
            </div>
          </section>

          {/* Outcome */}
          <section style={S.card}>
            <div style={S.cardTitle}>Outcome</div>

            <div style={{ marginTop: 12, ...S.outcomeBox }}>
              <div style={S.pillRow}>
                <span style={S.pill}>{result.step || "—"}</span>
                <span style={S.pill}>FIT band: {bandLabel(result.band)}</span>
                <span style={S.pill}>Age: {age ?? "—"}</span>
              </div>

              <div style={{ marginTop: 10, fontSize: 13, color: "#b9c6e6", textTransform: "uppercase", letterSpacing: 1 }}>
                Recommended next step
              </div>
              <div style={S.outcomeBig}>{result.outcome}</div>

              {result.missing?.length ? (
                <div style={S.warn}>
                  <div style={{ fontWeight: 800 }}>Needs to make proper decision:</div>
                  <ul style={S.list}>
                    {result.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div style={S.ok}>
                  <div style={{ fontWeight: 800 }}>Inputs complete for this rule set.</div>
                  <div style={{ marginTop: 6, color: "#d7ffe6" }}>You can copy the summary for notes/referral documentation.</div>
                </div>
              )}

              {result.mapping?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#b9c6e6", textTransform: "uppercase", letterSpacing: 1 }}>
                    Flowchart mapping
                  </div>
                  <ul style={S.list}>
                    {result.mapping.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.supplementary?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#b9c6e6", textTransform: "uppercase", letterSpacing: 1 }}>
                    Supplementary considerations
                  </div>
                  <ul style={S.list}>
                    {result.supplementary.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            
          </section>
        </div>
      </div>
    </div>
  );
}
