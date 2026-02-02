import React, { useMemo, useState } from "react";

/**
 * MVP single-page app to operationalise the flowchart rules provided in chat.
 * NOTE: This implements ONLY the rules you supplied.
 * It does not add clinical judgement or external guidance.
 */

const pathways = [
  { key: "abdominal_mass", label: "Abdominal mass" },
  { key: "cibh_50_85", label: "Change in bowel habit (age 50–85)" },
  { key: "cibh_gt_85", label: "Change in bowel habit (age >85)" },
  { key: "ida_gt_50", label: "Iron deficiency anaemia (age >50)" },
  { key: "ida_lt_50", label: "Iron deficiency anaemia (age <50)" },
  { key: "rb_cibh_lt_50_anaemia", label: "Rectal bleeding + CIBH (age <50) WITH anaemia" },
  { key: "rb_cibh_lt_50_no_anaemia", label: "Rectal bleeding + CIBH (age <50) WITHOUT anaemia" },
  { key: "wl_50_85", label: "Weight loss (age 50–85)" },
  { key: "wl_lt_50_or_gt_85", label: "Weight loss (age <50 OR >85)" },
];

function fitBand(fit) {
  if (fit === null || Number.isNaN(fit)) return null;
  if (fit < 9.9) return "lt_9_9";
  if (fit >= 10 && fit <= 100) return "10_100";
  if (fit > 100) return "gt_100";
  // Edge cases between 9.9 and 10
  return "borderline";
}

function decision({ pathway, age, fit, frailElderly, anaemia }) {
  const missing = [];
  if (!pathway) missing.push("pathway selection");
  if (age === null || Number.isNaN(age)) missing.push("age");
  if (fit === null || Number.isNaN(fit)) missing.push("FIT test result");

  // If the chosen pathway depends on a flag, require it explicitly (even if user can infer)
  if (pathway === "abdominal_mass" && frailElderly === null) missing.push("frail/elderly status");
  if (pathway === "rb_cibh_lt_50_anaemia" && anaemia === null) missing.push("anaemia status");
  if (pathway === "rb_cibh_lt_50_no_anaemia" && anaemia === null) missing.push("anaemia status");

  const band = fitBand(fit);

  // Base response object
  const res = {
    missing,
    outcome: null,
    step: null,
    notes: [],
  };

  // If missing critical info, still provide best-effort guidance where possible
  // (kept minimal; the UI will display both missing info + partial rule hints).

  if (!pathway) return res;

  switch (pathway) {
    // Rule set A
    case "abdominal_mass": {
      res.step = "Rule set A: Abdominal mass";
      if (frailElderly === true) {
        res.outcome = "CT abdomen & pelvis (CT AP)";
        res.notes.push("If abdominal mass AND patient is frail or elderly → CT AP.");
        return res;
      }
      if (band === "10_100") {
        res.outcome = "CT colonography (CTC)";
        res.notes.push("If abdominal mass AND FIT 10–100 → CTC.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.notes.push("If abdominal mass AND FIT >100 → colonoscopy.");
      } else if (band === "lt_9_9") {
        res.outcome = "CT abdomen & pelvis (CT AP)";
        res.notes.push("If abdominal mass AND FIT <9.9 → CT AP.");
      } else {
        res.outcome = "Needs FIT band clarified";
        res.notes.push("FIT value falls into a borderline/unhandled band.");
      }
      return res;
    }

    // Rule set B
    case "cibh_50_85": {
      res.step = "Rule set B: CIBH age 50–85";
      if (band === "10_100") {
        res.outcome = "CT colonography (CTC)";
        res.notes.push("CIBH 50–85 + FIT 10–100 → CTC.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.notes.push("CIBH 50–85 + FIT >100 → colonoscopy.");
      } else if (band === "lt_9_9") {
        res.outcome = "Follow pathway guidance for FIT <10 (not provided in ruleset)";
        res.notes.push("CIBH 50–85 + FIT <9.9 → follow FIT <10 guidance.");
      } else {
        res.outcome = "Needs FIT band clarified";
      }
      // Optional check against age
      if (age !== null && !Number.isNaN(age) && (age < 50 || age > 85)) {
        res.notes.push("Supplementary: age entered is outside 50–85 for this pathway selection.");
      }
      return res;
    }

    // Rule set C
    case "cibh_gt_85": {
      res.step = "Rule set C: CIBH age >85";
      if (band === "10_100") {
        res.outcome = "Tagged CT scan";
        res.notes.push("CIBH >85 + FIT 10–100 → tagged CT scan.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.notes.push("CIBH >85 + FIT >100 → colonoscopy.");
      } else if (band === "lt_9_9") {
        res.outcome = "Follow pathway guidance for FIT <10 (not provided in ruleset)";
        res.notes.push("CIBH >85 + FIT <9.9 → follow FIT <10 guidance.");
      } else {
        res.outcome = "Needs FIT band clarified";
      }
      if (age !== null && !Number.isNaN(age) && age <= 85) {
        res.notes.push("Supplementary: age entered is not >85 for this pathway selection.");
      }
      return res;
    }

    // Rule set D
    case "ida_gt_50": {
      res.step = "Rule set D: IDA age >50";
      if (band === "gt_100") {
        res.outcome = "Colonoscopy + OGD";
        res.notes.push("IDA >50 + FIT >100 → colonoscopy + OGD.");
      } else if (band === "10_100") {
        res.outcome = "CTC + OGD";
        res.notes.push("IDA >50 + FIT 10–100 → CTC + OGD.");
      } else if (band === "lt_9_9") {
        res.outcome = "CTC + OGD";
        res.notes.push("IDA >50 + FIT <9.9 → CTC + OGD.");
      } else {
        res.outcome = "Needs FIT band clarified";
      }
      if (age !== null && !Number.isNaN(age) && age <= 50) {
        res.notes.push("Supplementary: age entered is not >50 for this pathway selection.");
      }
      return res;
    }

    // Rule set E
    case "ida_lt_50": {
      res.step = "Rule set E: IDA age <50";
      res.outcome = "Colonoscopy + OGD";
      res.notes.push("IDA <50 → colonoscopy + OGD (regardless of FIT band in the provided rules).");
      if (age !== null && !Number.isNaN(age) && age >= 50) {
        res.notes.push("Supplementary: age entered is not <50 for this pathway selection.");
      }
      return res;
    }

    // Rule set F
    case "rb_cibh_lt_50_anaemia": {
      res.step = "Rule set F: Rectal bleeding + CIBH <50 with anaemia";
      if (anaemia === true) {
        res.outcome = "Colonoscopy";
        res.notes.push("RB + CIBH <50 with anaemia → colonoscopy regardless of FIT.");
      } else if (anaemia === false) {
        res.outcome = "Anaemia not present — consider selecting the 'without anaemia' pathway";
      } else {
        res.outcome = "Needs anaemia status";
      }
      if (age !== null && !Number.isNaN(age) && age >= 50) {
        res.notes.push("Supplementary: age entered is not <50 for this pathway selection.");
      }
      return res;
    }

    // Rule set G
    case "rb_cibh_lt_50_no_anaemia": {
      res.step = "Rule set G: Rectal bleeding + CIBH <50 without anaemia";
      if (anaemia === true) {
        res.outcome = "Anaemia present — select the 'WITH anaemia' pathway (colonoscopy regardless of FIT)";
        return res;
      }
      if (band === "10_100" || band === "gt_100") {
        res.outcome = "Flexible sigmoidoscopy (FOS) → if NAD, proceed to colonoscopy";
        res.notes.push("RB + CIBH <50 no anaemia + FIT ≥10 → FOS then if NAD proceed to colonoscopy.");
      } else if (band === "lt_9_9") {
        res.outcome = "Flexible sigmoidoscopy";
        res.notes.push("RB + CIBH <50 no anaemia + FIT <9.9 → flexible sigmoidoscopy.");
      } else {
        res.outcome = "Needs FIT band clarified";
      }
      if (age !== null && !Number.isNaN(age) && age >= 50) {
        res.notes.push("Supplementary: age entered is not <50 for this pathway selection.");
      }
      return res;
    }

    // Rule set H
    case "wl_50_85": {
      res.step = "Rule set H: Weight loss age 50–85";
      if (band === "10_100") {
        res.outcome = "CTC + CT thorax";
        res.notes.push("Weight loss 50–85 + FIT 10–100 → CTC + CT thorax.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.notes.push("Weight loss 50–85 + FIT >100 → colonoscopy.");
      } else if (band === "lt_9_9") {
        res.outcome = "Follow pathway guidance for FIT <10 (not provided in ruleset)";
        res.notes.push("Weight loss 50–85 + FIT <9.9 → follow FIT <10 guidance.");
      } else {
        res.outcome = "Needs FIT band clarified";
      }
      if (age !== null && !Number.isNaN(age) && (age < 50 || age > 85)) {
        res.notes.push("Supplementary: age entered is outside 50–85 for this pathway selection.");
      }
      return res;
    }

    // Rule set I
    case "wl_lt_50_or_gt_85": {
      res.step = "Rule set I: Weight loss age <50 OR >85";
      if (band === "10_100") {
        res.outcome = "CT thorax/abdomen/pelvis (CT TAP)";
        res.notes.push("Weight loss <50 or >85 + FIT 10–100 → CT TAP.");
      } else if (band === "gt_100") {
        res.outcome = "Colonoscopy";
        res.notes.push("Weight loss <50 or >85 + FIT >100 → colonoscopy.");
      } else if (band === "lt_9_9") {
        res.outcome = "Follow pathway guidance for FIT <10 (not provided in ruleset)";
        res.notes.push("Weight loss <50 or >85 + FIT <9.9 → follow FIT <10 guidance.");
      } else {
        res.outcome = "Needs FIT band clarified";
      }
      if (age !== null && !Number.isNaN(age) && age >= 50 && age <= 85) {
        res.notes.push("Supplementary: age entered is 50–85; consider selecting the 50–85 weight loss pathway.");
      }
      return res;
    }

    default:
      res.step = "Not covered";
      res.outcome = "This selection is not covered by the provided flowchart rules.";
      return res;
  }
}

function Pill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
      {children}
    </span>
  );
}

export default function App() {
  const [pathway, setPathway] = useState("");
  const [ageStr, setAgeStr] = useState("");
  const [fitStr, setFitStr] = useState("");
  const [frailElderly, setFrailElderly] = useState(null); // null | boolean
  const [anaemia, setAnaemia] = useState(null); // null | boolean

  const age = ageStr.trim() === "" ? null : Number(ageStr);
  const fit = fitStr.trim() === "" ? null : Number(fitStr);

  const result = useMemo(
    () => decision({ pathway, age, fit, frailElderly, anaemia }),
    [pathway, age, fit, frailElderly, anaemia]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            2WW Colorectal Triage — Pathway Selector (MVP)
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            This tool implements only the explicit rules you supplied in the flowchart rewrite. It is a
            decision support aid and should not replace local policy/clinical judgement.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Inputs</h2>

            <div className="mt-4 grid gap-4">
              <label className="grid gap-1">
                <span className="text-sm font-medium text-slate-700">Pathway</span>
                <select
                  value={pathway}
                  onChange={(e) => setPathway(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">Select…</option>
                  {pathways.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-sm font-medium text-slate-700">Age (years)</span>
                  <input
                    inputMode="numeric"
                    value={ageStr}
                    onChange={(e) => setAgeStr(e.target.value)}
                    placeholder="e.g. 72"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium text-slate-700">FIT (µg Hb/g)</span>
                  <input
                    inputMode="decimal"
                    value={fitStr}
                    onChange={(e) => setFitStr(e.target.value)}
                    placeholder="e.g. 34"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">Conditional flags</div>

                <div className="mt-2 grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-800">Frail / elderly</div>
                      <div className="text-xs text-slate-600">Used only for Abdominal mass rule.</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFrailElderly(true)}
                        className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${
                          frailElderly === true
                            ? "bg-slate-900 text-white ring-slate-900"
                            : "bg-white text-slate-700 ring-slate-300"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setFrailElderly(false)}
                        className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${
                          frailElderly === false
                            ? "bg-slate-900 text-white ring-slate-900"
                            : "bg-white text-slate-700 ring-slate-300"
                        }`}
                      >
                        No
                      </button>
                      <button
                        onClick={() => setFrailElderly(null)}
                        className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${
                          frailElderly === null
                            ? "bg-slate-200 text-slate-800 ring-slate-200"
                            : "bg-white text-slate-700 ring-slate-300"
                        }`}
                      >
                        —
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-800">Anaemia present</div>
                      <div className="text-xs text-slate-600">
                        Used only for Rectal bleeding + CIBH &lt;50 pathways.
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAnaemia(true)}
                        className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${
                          anaemia === true
                            ? "bg-slate-900 text-white ring-slate-900"
                            : "bg-white text-slate-700 ring-slate-300"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setAnaemia(false)}
                        className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${
                          anaemia === false
                            ? "bg-slate-900 text-white ring-slate-900"
                            : "bg-white text-slate-700 ring-slate-300"
                        }`}
                      >
                        No
                      </button>
                      <button
                        onClick={() => setAnaemia(null)}
                        className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${
                          anaemia === null
                            ? "bg-slate-200 text-slate-800 ring-slate-200"
                            : "bg-white text-slate-700 ring-slate-300"
                        }`}
                      >
                        —
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Outcome</h2>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                {result.step ? <Pill>{result.step}</Pill> : <Pill>Choose a pathway</Pill>}
                {fit !== null && !Number.isNaN(fit) ? <Pill>FIT band: {fitBand(fit)}</Pill> : null}
                {age !== null && !Number.isNaN(age) ? <Pill>Age: {age}</Pill> : null}
              </div>

              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-600">Recommended next step</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {result.outcome ?? "—"}
                </div>
              </div>

              {result.missing?.length ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-semibold">Needs to make proper decision:</div>
                  <ul className="mt-1 list-disc pl-5">
                    {result.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.notes?.length ? (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-600">Rule mapping / notes</div>
                  <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                    {result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <div className="font-semibold text-slate-700">What to add next</div>
              <ul className="mt-1 list-disc pl-5">
                <li>Implement the missing “FIT &lt;10 guidance” section once you provide it.</li>
                <li>Add the “After test results” stage (cancer vs no cancer → MDT/CNS etc.) as a second screen.</li>
                <li>Add printable output for GP notes / referral letter.</li>
                <li>Add audit logging (who used it, when, what inputs) if required locally.</li>
              </ul>
            </div>
          </section>
        </div>

        <footer className="mt-8 text-xs text-slate-500">
          MVP UI only. For clinical deployment you’ll want governance: versioning, sign-off, validation tests, and
          clear disclaimer text.
        </footer>
      </div>
    </div>
  );
}
