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
    key: "rb_cibh_lt_50",
    label: "Rectal bleeding + CIBH (age <50)",
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

function decision({ pathway, age, fit, frailElderly, anaemia, whoStatus, recentImaging }) {
  const missing = [];
  if (!pathway) missing.push("pathway selection");
  if (pathway && pathway !== "anal_rectal_lesion") {
    if (age === null || Number.isNaN(age)) missing.push("age");
    if (fit === null || Number.isNaN(fit)) missing.push("FIT test result");
  }

  // We flag these as missing when relevant, but we still attempt a best-effort outcome.
  if (pathway === "abdominal_mass" && frailElderly === null) missing.push("frail/elderly status");
  if (pathway === "rb_cibh_lt_50" && anaemia === null) {
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

  // Recent imaging or colonoscopy within the past 12 months overrides to face-to-face
  if (recentImaging === true) {
    res.outcome = "Face-to-face appointment";
    res.mapping.push("Recent imaging/colonoscopy within 12 months → face-to-face appointment.");
    return finalize(res);
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

    // Rule set F & G combined
    case "rb_cibh_lt_50": {
      res.step = "Rule set F/G: Rectal bleeding + CIBH <50";
      if (anaemia === true) {
        res.outcome = "Colonoscopy";
        res.mapping.push("RB + CIBH <50 + anaemia → colonoscopy regardless of FIT.");
      } else if (anaemia === false) {
        if (band === "10_100" || band === "gt_100") {
          res.outcome = "Flexible sigmoidoscopy (FOS) → if NAD, proceed to colonoscopy";
          res.mapping.push("RB + CIBH <50 no anaemia + FIT ≥10 → FOS then if NAD proceed to colonoscopy.");
        } else if (band === "lt_10") {
          res.outcome = "Flexible sigmoidoscopy";
          res.mapping.push("RB + CIBH <50 no anaemia + FIT <10 → flexible sigmoidoscopy.");
        } else {
          res.outcome = "Needs FIT result";
        }
      } else {
        res.outcome = "Needs anaemia status";
        res.mapping.push("If anaemia present → colonoscopy regardless of FIT. If absent, follow FIT-band guidance for FOS/colonoscopy.");
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

// Merge multiple pathway outcomes into a single combined outcome object.
function mergeOutcomes(outcomes) {
  if (!outcomes || outcomes.length === 0) return null;
  const union = (arr) => Array.from(new Set((arr || []).flat()));
  const missing = union(outcomes.map((o) => o.missing || []));
  const mapping = union(outcomes.map((o) => o.mapping || []));
  const supplementary = union(outcomes.map((o) => o.supplementary || []));

  // If any outcome mandates face-to-face, prefer that as the merged outcome.
  for (const o of outcomes) {
    if (String(o.outcome || "").toLowerCase().includes("face-to-face")) {
      return {
        per_pathway: outcomes,
        merged_outcome: "Face-to-face assessment",
        merged_step: "Face-to-face (one or more pathways)",
        merged_pathway: null,
        missing,
        mapping,
        supplementary,
      };
    }
  }

  // Helper: canonicalise tokens found in outcome text to known procedure labels + priority
  function canonicaliseToken(t) {
    // Only return canonical procedure tokens we care about for merged outcomes.
    const s = String(t || "").trim();
    const low = s.toLowerCase();
    if (!s) return null;
    if (low.includes("colonoscopy")) return { label: "Colonoscopy", prio: 100 };
    if (low.includes("ogd")) return { label: "OGD", prio: 95 };
    if (low.includes("ct abdomen") || low.includes("ct ap") || low.includes("ct abdomen & pelvis") ) return { label: "CT abdomen & pelvis (CT AP)", prio: 90 };
    if (low.includes("ct colonography") || low.includes("ctc")) return { label: "CT colonography (CTC)", prio: 88 };
    if (low.includes("ct tap") || low.includes("ct thorax/abdomen/pelvis") || low.includes("ct thorax")) return { label: "CT thorax/abdomen/pelvis (CT TAP)", prio: 86 };
    if (low.includes("tagged ct")) return { label: "Tagged CT scan", prio: 80 };
    if (low.includes("flexible sigmoidoscopy") || low.includes("fos")) return { label: "Flexible sigmoidoscopy", prio: 70 };
    // Skip conditional or unhelpful fragments (e.g. 'if NAD', 'follow pathway', 'needs FIT')
    return null;
  }

  const tokenMap = new Map(); // label -> highest prio

  for (const o of outcomes) {
    const text = String(o.outcome || "");
    // split on +, arrow, comma, semicolon
    const parts = text.split(/\s*(?:\+|→|,|;)\s*/).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const canon = canonicaliseToken(p);
      if (!canon) continue;
      const existing = tokenMap.get(canon.label);
      if (!existing || canon.prio > existing) tokenMap.set(canon.label, canon.prio);
    }
  }

  // Suppression rules: when a higher-priority procedure is recommended, remove lower-priority
  // alternatives that would not be performed (e.g., colonoscopy supersedes flexible sigmoidoscopy).
  if (tokenMap.has("Colonoscopy") && tokenMap.has("Flexible sigmoidoscopy")) {
    tokenMap.delete("Flexible sigmoidoscopy");
  }

  // Sort tokens by priority descending, then label
  const mergedTokens = Array.from(tokenMap.entries())
    .map(([label, prio]) => ({ label, prio }))
    .sort((a, b) => b.prio - a.prio || a.label.localeCompare(b.label))
    .map((t) => t.label);

  const mergedOutcomeText = mergedTokens.length ? mergedTokens.join(" + ") : "—";

  const mergedStep = outcomes.map((o) => o.step).filter(Boolean).join(" || ");

  return {
    per_pathway: outcomes,
    merged_outcome: mergedOutcomeText,
    merged_step: mergedStep,
    merged_pathway: null,
    missing,
    mapping,
    supplementary,
  };
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
  btnDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  segmented: { display: "flex", gap: 6 },
  segBtn: (active, kind) => {
    const defaultBg = "rgba(255,255,255,0.06)";
    const defaultActiveBg = "rgba(255,255,255,0.18)";
    let background = active ? defaultActiveBg : defaultBg;
    let border = "1px solid rgba(255,255,255,0.18)";
    if (active && kind === "yes") {
      background = "rgba(16,185,129,0.18)"; // green
      border = "1px solid rgba(16,185,129,0.35)";
    }
    if (active && kind === "no") {
      background = "rgba(239,68,68,0.18)"; // red
      border = "1px solid rgba(239,68,68,0.35)";
    }
    return {
      padding: "8px 10px",
      borderRadius: 12,
      border,
      background,
      color: "#eaf0ff",
      cursor: "pointer",
      minWidth: 46,
    };
  },
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
  mappingBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(11,20,34,0.6), rgba(11,20,34,0.55))",
    border: "1px solid rgba(99,102,241,0.12)",
    boxShadow: "0 6px 18px rgba(2,6,23,0.35)",
    display: "block",
  },
  mappingTitle: { fontSize: 13, fontWeight: 800, color: "#93c5fd", textTransform: "uppercase", letterSpacing: 1 },
  mappingList: { margin: "8px 0 0 0", paddingLeft: 18, color: "#d7e2ff", lineHeight: 1.5 },
  hint: { fontSize: 12, color: "#b9c6e6", marginTop: 6, lineHeight: 1.35 },
  author: {
    marginTop: 40,
    paddingTop: 20,
    borderTop: "1px solid rgba(255,255,255,0.12)",
    textAlign: "center",
    fontSize: 12,
    color: "#b9c6e6",
    lineHeight: 1.6,
  },
  authorHighlight: {
    fontWeight: 600,
    color: "#eaf0ff",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(5, 10, 20, 0.72)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(980px, 96vw)",
    maxHeight: "92vh",
    background: "rgba(15, 23, 42, 0.98)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
    overflow: "auto",
  },
  textarea: {
    width: "100%",
    minHeight: 360,
    resize: "vertical",
    boxSizing: "border-box",
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "#eaf0ff",
    outline: "none",
    lineHeight: 1.45,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
  },
};

export default function App() {
  const [pathway, setPathway] = useState("");
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [ageStr, setAgeStr] = useState("");
  const [fitStr, setFitStr] = useState("");
  const [frailElderly, setFrailElderly] = useState(null); // null | boolean
  const [anaemia, setAnaemia] = useState(null); // null | boolean
  const [recentImaging, setRecentImaging] = useState(null); // null | boolean
  const [whoStatus, setWhoStatus] = useState(null); // null | 0-4
  const [copied, setCopied] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [hospitalNumber, setHospitalNumber] = useState("");
  const [dob, setDob] = useState("");

  const age = ageStr.trim() === "" ? null : Number(ageStr);
  const fit = fitStr.trim() === "" ? null : Number(fitStr);

  const perResults = useMemo(() => {
    const sels = selectedPaths.length ? selectedPaths : (pathway ? [pathway] : []);
    return sels.map((pid) => ({
      ...(decision({ pathway: pid, age, fit, frailElderly, anaemia, whoStatus, recentImaging })),
      pathway: pid,
    }));
  }, [selectedPaths, pathway, age, fit, frailElderly, anaemia, whoStatus, recentImaging]);

  const mergedResult = useMemo(() => mergeOutcomes(perResults), [perResults]);

  const result = useMemo(() => {
    if (!perResults || perResults.length === 0) return decision({ pathway, age, fit, frailElderly, anaemia, whoStatus, recentImaging });
    if (perResults.length === 1) return perResults[0];
    // build a display-like result from mergedResult for compatibility with existing UI
    return {
      missing: mergedResult?.missing || [],
      band: null,
      outcome: mergedResult?.merged_outcome || "—",
      step: mergedResult?.merged_step || "",
      mapping: mergedResult?.mapping || [],
      supplementary: mergedResult?.supplementary || [],
    };
  }, [perResults, mergedResult, pathway, age, fit, frailElderly, anaemia, whoStatus, recentImaging]);

  function togglePathway(key) {
    const next = selectedPaths.includes(key) ? selectedPaths.filter((p) => p !== key) : [...selectedPaths, key];
    setSelectedPaths(next);
    setPathway(next[0] || "");
  }

  const summaryText = useMemo(() => {
    const lines = [];
    lines.push("2WW Colorectal Pathway Selector — Summary");
    const sels = selectedPaths.length ? selectedPaths : (pathway ? [pathway] : []);
    if (sels.length === 0) {
      lines.push("Pathway: —");
    } else if (sels.length === 1) {
      lines.push(`Pathway: ${pathways.find((p) => p.key === sels[0])?.label ?? "—"}`);
    } else {
      lines.push(`Pathways: ${sels.map((k) => pathways.find((p) => p.key === k)?.label ?? k).join(" || ")}`);
    }
    lines.push(`Age: ${age ?? "—"}`);
    lines.push(`FIT: ${fit ?? "—"} (band ${bandLabel(result.band)})`);
    if (pathway === "abdominal_mass") lines.push(`Frail/elderly: ${frailElderly ?? "—"}`);
    if (sels.some((k) => k === "abdominal_mass")) lines.push(`Frail/elderly: ${frailElderly ?? "—"}`);
    if (sels.some((k) => k.startsWith("rb_cibh"))) lines.push(`Anaemia: ${anaemia ?? "—"}`);
    lines.push(`Recent imaging/colonoscopy within 12 months: ${recentImaging ?? "—"}`);
    lines.push(`WHO status: ${whoStatus ?? "—"}`);
    lines.push("");
    if (perResults.length > 1) {
      lines.push("Per-pathway outcomes:");
      perResults.forEach((pr) => {
        const label = pathways.find((p) => p.key === pr.pathway)?.label ?? pr.pathway;
        lines.push(`${label}: ${pr.outcome} (${pr.step})`);
      });
      lines.push("");
      lines.push(`Merged outcome: ${mergedResult?.merged_outcome ?? "—"} (from ${pathways.find((p) => p.key === mergedResult?.merged_pathway)?.label ?? "—"})`);
      lines.push(`Rule: ${mergedResult?.merged_step ?? ""}`);
    } else {
      lines.push(`Outcome: ${result.outcome}`);
      lines.push(`Rule: ${result.step}`);
    }
    if (result.missing?.length) lines.push(`Needs: ${result.missing.join(", ")}`);
    if (result.mapping?.length) {
      lines.push("");
      lines.push("Rule mapping:");
      result.mapping.forEach((m) => lines.push(`- ${m}`));
    }
    return lines.join("\n");
  }, [selectedPaths, pathway, age, fit, frailElderly, anaemia, whoStatus, perResults, mergedResult, result]);

  const emailTemplate = useMemo(() => {
    const splitRecommendation = (text) => {
      if (!text || text === "â€”") return [];
      if (text.includes(" + ")) return text.split(" + ").map((t) => t.trim()).filter(Boolean);
      return [text];
    };

    const lines = [];
    lines.push("2WW Colorectal Referral");
    lines.push("");
    lines.push(`Patient name: ${patientName || "—"}`);
    lines.push(`Hospital number: ${hospitalNumber || "—"}`);
    lines.push(`Date of birth: ${dob || "—"}`);
    lines.push("");
    const sels = selectedPaths.length ? selectedPaths : (pathway ? [pathway] : []);
    if (sels.length === 0) {
      lines.push(`Pathway: â€”`);
    } else if (sels.length === 1) {
      lines.push(`Pathway: ${pathways.find((p) => p.key === sels[0])?.label ?? "â€”"}`);
    } else {
      lines.push(`Pathways: ${sels.map((k) => pathways.find((p) => p.key === k)?.label ?? k).join(" || ")}`);
    }
    lines.push(`Age: ${age ?? "â€”"}`);
    lines.push(`FIT: ${fit ?? "â€”"} (band ${bandLabel(result.band)})`);
    if (pathway === "abdominal_mass") lines.push(`Frail/elderly: ${frailElderly ?? "â€”"}`);
    if (pathway?.startsWith("rb_cibh")) lines.push(`Anaemia: ${anaemia ?? "â€”"}`);
    lines.push(`Recent imaging/colonoscopy within 12 months: ${recentImaging ?? "â€”"}`);
    lines.push(`WHO status: ${whoStatus ?? "â€”"}`);
    lines.push("");
    if (perResults.length > 1) {
      lines.push("Per-pathway recommendation:");
      perResults.forEach((pr) => {
        const label = pathways.find((p) => p.key === pr.pathway)?.label ?? pr.pathway;
        lines.push(`- ${label}: **${pr.outcome}**`);
      });
      lines.push("");
      lines.push(`Merged recommendation: **${mergedResult?.merged_outcome ?? "â€”"}**`);
    } else {
      lines.push("Recommendation:");
      const recs = splitRecommendation(result.outcome);
      recs.forEach((r) => lines.push(`- **${r}**`));
    }
    lines.push("");
    if (perResults.length > 1) {
      lines.push("");
      lines.push("Flowchart logic (per pathway):");
      perResults.forEach((pr) => {
        const label = pathways.find((p) => p.key === pr.pathway)?.label ?? pr.pathway;
        if (pr.mapping?.length) {
          lines.push(`- ${label}:`);
          pr.mapping.forEach((m) => lines.push(`  - **${m}**`));
        }
      });
    } else {
      if (result.mapping?.length) {
        lines.push("Flowchart logic:");
        result.mapping.forEach((m) => lines.push(`- **${m}**`));
      } else {
        lines.push(`Flowchart logic: **${result.step || "â€”"}**`);
      }
    }
    lines.push("");
    lines.push("GP entered information for consideration:");
    lines.push("");
    return lines.join("\n");
  }, [patientName, hospitalNumber, dob, selectedPaths, pathway, age, fit, frailElderly, anaemia, whoStatus, recentImaging, perResults, mergedResult, result]);

  function reset() {
    setPathway("");
    setAgeStr("");
    setFitStr("");
    setFrailElderly(null);
    setAnaemia(null);
    setRecentImaging(null);
    setWhoStatus(null);
    setCopied(false);
    setPatientName("");
    setHospitalNumber("");
    setDob("");
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

  const currentSelection = selectedPaths.length ? selectedPaths : (pathway ? [pathway] : []);
  const showFrail = currentSelection.includes("abdominal_mass");
  const showAnaemia = currentSelection.includes("rb_cibh_lt_50");

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
              {copied ? "Copied" : "Copy Pathway Summary"}
            </button>
            <button style={S.btn} onClick={reset}>Reset</button>
          </div>
        </div>

        <div style={window.innerWidth >= 900 ? S.twoCol : S.grid}>
          {/* Inputs */}
          <section style={S.card}>
            <div style={S.cardTitle}>Inputs</div>

            <div style={{ marginTop: 12 }}>
              <div style={S.label}>Pathway(s)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {pathways.map((p) => {
                  const active = selectedPaths.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => togglePathway(p.key)}
                      style={{
                        ...S.pill,
                        border: active ? "1px solid rgba(59,130,246,0.7)" : S.pill.border,
                        background: active ? "rgba(59,130,246,0.12)" : S.pill.background,
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div style={S.hint}>Tip: select one or more pathways; the outcome panel updates instantly.</div>
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

            {/* Patient identifiers removed from UI (kept in state for easy restoration) */}

            {showFrail && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Frail / elderly</div>
                    <div style={S.hint}>Used for Rule set A (abdominal mass).</div>
                  </div>
                    <div style={S.segmented}>
                      <button style={S.segBtn(frailElderly === true, "yes")} onClick={() => setFrailElderly(true)}>
                        Yes
                      </button>
                      <button style={S.segBtn(frailElderly === false, "no")} onClick={() => setFrailElderly(false)}>
                        No
                      </button>
                      <button style={S.segBtn(frailElderly === null)} onClick={() => setFrailElderly(null)}>
                        —
                      </button>
                    </div>
                </div>
              </div>
            )}

            {showAnaemia && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Anaemia present</div>
                    <div style={S.hint}>Used for rectal bleeding + CIBH &lt;50 pathways.</div>
                  </div>
                    <div style={S.segmented}>
                      <button style={S.segBtn(anaemia === true, "yes")} onClick={() => setAnaemia(true)}>
                        Yes
                      </button>
                      <button style={S.segBtn(anaemia === false, "no")} onClick={() => setAnaemia(false)}>
                        No
                      </button>
                      <button style={S.segBtn(anaemia === null)} onClick={() => setAnaemia(null)}>
                        —
                      </button>
                    </div>
                </div>
              </div>
            )}

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
            <div style={{ marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Recent imaging/colonoscopy in past 12 months</div>
                  <div style={S.hint}>If yes, recommendation becomes face-to-face appointment.</div>
                </div>
                <div style={S.segmented}>
                  <button style={S.segBtn(recentImaging === true, "yes")} onClick={() => setRecentImaging(true)}>Yes</button>
                  <button style={S.segBtn(recentImaging === false, "no")} onClick={() => setRecentImaging(false)}>No</button>
                  <button style={S.segBtn(recentImaging === null)} onClick={() => setRecentImaging(null)}>—</button>
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
              {perResults.length > 1 ? (
                <div>
                  <div style={{ fontSize: 12, color: "#b9c6e6", marginTop: 8, fontWeight: 700 }}>Merged outcome</div>
                  <div style={{ ...S.outcomeBig, fontSize: 20 }}>{mergedResult?.merged_outcome ?? result.outcome}</div>
                  {mergedResult?.merged_pathway ? (
                    <div style={{ fontSize: 12, color: "#b9c6e6", marginTop: 6 }}>From: {pathways.find((p) => p.key === mergedResult.merged_pathway)?.label ?? mergedResult.merged_pathway}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#b9c6e6", marginTop: 6 }}>{mergedResult?.merged_step}</div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <div style={S.warn}>
                      <div style={{ fontWeight: 800 }}>Merged recommendation — use clinical judgement</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={S.outcomeBig}>{result.outcome}</div>
              )}

              {result.missing?.length ? (
              <div style={S.warn}>
                <div style={{ fontWeight: 800 }}>Needs to make proper decision:</div>
                <ul style={S.list}>
                  {result.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                {/* Email referral temporarily removed — patient identifiers still accepted for notes */}
              </div>
            ) : (
              <div style={S.ok}>
                <div style={{ fontWeight: 800 }}>Inputs complete for this rule set.</div>
                <div style={{ marginTop: 6, color: "#d7ffe6" }}>You can copy the summary by clicking "Copy Pathway Summary" above.</div>
                {/* Email referral temporarily removed */}

                </div>
              )}

              {result.mapping?.length ? (
                <div style={S.mappingBox}>
                  <div style={S.mappingTitle}>Flowchart mapping</div>
                  <ul style={S.mappingList}>
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
              {/* Per-pathway outcomes removed (mapping box contains equivalent details) */}
            </div>

            
          </section>
        </div>

        <div style={S.author}>
          <div>Website developed by <span style={S.authorHighlight}>Dr Theo Jackson</span> and <span style={S.authorHighlight}>Mr Vasileios Kalatzis</span> at <span style={S.authorHighlight}>UHNM</span></div>
        </div>
      </div>

      {/* Email referral modal removed temporarily */}
    </div>
  );
}
