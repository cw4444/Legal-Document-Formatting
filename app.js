const sampleBrief = `Accountabilities

Lead benefits procurement, administration, and renewal cycles for EMEA, including health, retirement, and supplemental benefit programs
Manage relationships with vendors, brokers, and external partners, including negotiations on pricing, SLAs, and renewals
Design and launch locally relevant supplemental benefits such as wellness, mental health, and family support programs
Serve as a regional subject matter expert, supporting internal teams and responding to client and employee benefits inquiries
Ensure accuracy of benefits data, including eligibility, enrollment, billing, and ongoing administration
Collaborate with product, legal, and operations teams to maintain alignment with statutory requirements and EOR frameworks
Develop clear country-level benefits documentation, communications, and enrollment guides to improve employee understanding
Support global benefits operations teams to ensure efficient enrollment and administration of EOR employee benefits

Requirements

4+ years of experience in benefits management, preferably with EMEA regional exposure
Experience managing end-to-end benefits renewals and vendor/broker relationships
Strong knowledge of statutory and supplemental benefits structures in at least one major EMEA market
Ability to design and implement scalable, compliant, and employee-centric benefits programs
Strong communication skills with the ability to simplify complex benefits topics for diverse audiences
Experience working in fast-paced, high-growth, or international environments
Strong problem-solving skills with a consultative, solution-oriented approach
Ability to manage complexity, ensure accuracy, and maintain strong attention to detail
Nice to have: experience in EOR/PEO environments, familiarity with HRIS or benefits platforms, and multilingual capabilities`;

const els = {
  input: document.querySelector("#input-text"),
  fileInput: document.querySelector("#file-input"),
  fileName: document.querySelector("#file-name"),
  provider: document.querySelector("#provider"),
  apiKey: document.querySelector("#api-key"),
  modelName: document.querySelector("#model-name"),
  statusPill: document.querySelector("#status-pill"),
  run: document.querySelector("#run-demo"),
  sample: document.querySelector("#load-sample"),
  renewal: document.querySelector("#renewal-text"),
  vendor: document.querySelector("#vendor-text"),
  compliance: document.querySelector("#compliance-text"),
  scale: document.querySelector("#scale-text"),
  rScore: document.querySelector("#score-renewal"),
  vScore: document.querySelector("#score-vendor"),
  cScore: document.querySelector("#score-compliance"),
  exportReport: document.querySelector("#export-report"),
  copyReport: document.querySelector("#copy-report"),
  shareReport: document.querySelector("#share-report"),
  modeClient: document.querySelector("#mode-client"),
  modeInternal: document.querySelector("#mode-internal"),
  reportMeta: document.querySelector("#report-meta"),
  modeLabel: document.querySelector("#mode-label"),
  executiveSummary: document.querySelector("#executive-summary"),
  nextStepsList: document.querySelector("#next-steps-list"),
};

const storageKeys = {
  provider: "benefits-demo-provider",
  apiKey: "benefits-demo-api-key",
  modelName: "benefits-demo-model",
  input: "benefits-demo-input",
  mode: "benefits-demo-mode",
};

function loadState() {
  els.provider.value = localStorage.getItem(storageKeys.provider) || "local";
  els.apiKey.value = localStorage.getItem(storageKeys.apiKey) || "";
  els.modelName.value = localStorage.getItem(storageKeys.modelName) || "";
  els.input.value = localStorage.getItem(storageKeys.input) || sampleBrief;
  setMode(localStorage.getItem(storageKeys.mode) || "client");
}

function saveState() {
  localStorage.setItem(storageKeys.provider, els.provider.value);
  localStorage.setItem(storageKeys.apiKey, els.apiKey.value);
  localStorage.setItem(storageKeys.modelName, els.modelName.value);
  localStorage.setItem(storageKeys.input, els.input.value);
  localStorage.setItem(storageKeys.mode, currentMode);
}

function scoreFrom(text, patterns) {
  const lower = text.toLowerCase();
  return Math.min(
    100,
    patterns.reduce((sum, pattern) => sum + (lower.includes(pattern) ? 1 : 0), 0) * 20
  );
}

function bullets(text, items) {
  return items.filter(Boolean).join(" ");
}

function analyze(text) {
  const renewalSignals = [
    "renewal", "renewals", "procurement", "pricing", "sla", "slas", "vendor", "broker",
  ];
  const complianceSignals = ["statutory", "eor", "legal", "compliance", "country-level", "emea"];
  const scaleSignals = ["scalable", "fast-paced", "high-growth", "standard", "documentation", "data"];

  const renewalScore = scoreFrom(text, renewalSignals);
  const vendorScore = scoreFrom(text, ["vendor", "broker", "pricing", "sla", "relationship", "external"]);
  const complianceScore = scoreFrom(text, complianceSignals);
  const scaleScore = scoreFrom(text, scaleSignals);

  const renewalText = bullets(
    text,
    [
      renewalScore >= 60
        ? "The role clearly needs end-to-end renewal ownership, with vendor pricing and SLA negotiation built in."
        : "Renewal ownership is present, but the brief would benefit from clearer timelines, approval gates, and decision owners.",
      "A human reviewer should confirm what happens 90, 60, and 30 days before renewal so nothing slips through.",
    ]
  );

  const vendorText = bullets(
    text,
    [
      vendorScore >= 60
        ? "Vendor and broker management is a core requirement, so the tool should audit contracts, SLAs, escalations, and renewal levers."
        : "Vendor touchpoints are light in the brief, so the audit should surface any missing supplier, broker, or service-level detail.",
      "The strongest follow-up question is whether benefits data, billing, and eligibility are owned in one place or split across teams.",
    ]
  );

  const complianceText = bullets(
    text,
    [
      complianceScore >= 60
        ? "This is firmly a statutory-plus-regional benefits role: country-level rules, EOR frameworks, and legal alignment are all in scope."
        : "Compliance expectations are mentioned, but the output should still call out which countries, statutory schemes, and EOR rules apply.",
      "A non-technical user should get a short country-by-country summary instead of a legal dump.",
    ]
  );

  const scaleText = bullets(
    text,
    [
      scaleScore >= 60
        ? "The role is scalable if the process is template-led: one intake, one renewal calendar, one vendor scorecard, and one documentation pack per country."
        : "Scaleability should be judged by whether the process can be repeated across countries without rework or hidden manual steps.",
      "If the same questions need answering twice, the workflow should capture them once and reuse the answer everywhere.",
    ]
  );

  return {
    renewalScore,
    vendorScore,
    complianceScore,
    scaleScore,
    renewalText,
    vendorText,
    complianceText,
    scaleText,
  };
}

function render(results) {
  els.rScore.textContent = `${results.renewalScore}%`;
  els.vScore.textContent = `${results.vendorScore}%`;
  els.cScore.textContent = `${results.complianceScore}%`;
  els.renewal.textContent = results.renewalText;
  els.vendor.textContent = results.vendorText;
  els.compliance.textContent = results.complianceText;
  els.scale.textContent = results.scaleText;
  els.reportMeta.textContent = `${currentMode === "client" ? "Client-facing" : "Internal draft"} · ${els.provider.value === "local" ? "Local analysis" : `${els.provider.value} proxy`} · ${new Date().toLocaleString()}`;
  els.modeLabel.textContent = els.provider.value === "local" || !els.apiKey.value.trim() ? "Local demo" : `${els.provider.value} proxy`;
  els.executiveSummary.textContent = results.executiveSummary || buildExecutiveSummary(results);
  els.nextStepsList.innerHTML = (results.nextSteps || buildNextSteps(results))
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join("");
  document.body.dataset.mode = currentMode;
  els.input.placeholder = currentMode === "client"
    ? "Paste a benefits brief, job spec, or policy note"
    : "Paste the internal working brief with supplier, renewal, and country detail";
}

function runAnalysis() {
  saveState();
  const input = els.input.value.trim();
  if (els.provider.value === "local" || !els.apiKey.value.trim()) {
    els.statusPill.textContent = "Local mode";
    render(enrichResults(analyze(input)));
    return;
  }

  els.statusPill.textContent = "Calling proxy...";
  fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: els.provider.value,
      apiKey: els.apiKey.value.trim(),
      model: els.modelName.value.trim(),
      input,
    }),
  })
    .then((response) => response.json())
    .then((payload) => {
      const text = payload.normalized ? normalizePayload(payload.normalized) : null;
      if (text) {
        render(enrichResults(applyMode(text, currentMode)));
        els.statusPill.textContent = "Proxy run complete";
        return;
      }
      els.statusPill.textContent = "Proxy fallback";
      render(enrichResults(applyMode(analyze(input), currentMode)));
    })
    .catch(() => {
      els.statusPill.textContent = "Local fallback";
      render(enrichResults(applyMode(analyze(input), currentMode)));
    });
}

let currentMode = "client";

function setMode(mode) {
  currentMode = mode === "internal" ? "internal" : "client";
  els.modeClient.classList.toggle("is-active", currentMode === "client");
  els.modeInternal.classList.toggle("is-active", currentMode === "internal");
}

function applyMode(results, mode) {
  if (mode === "internal") {
    return {
      ...results,
      executiveSummary: `${results.executiveSummary || buildExecutiveSummary(results)} Internal draft: pressure-test assumptions, supplier detail, and implementation risk before sharing outside the team.`,
      nextSteps: [
        "Stress-test the renewal calendar against your internal dependencies and approval gates.",
        "Cross-check vendor SLAs, billing, and country data against the source documents.",
        "Keep this as a working draft until legal and operations have signed off on the country list.",
        ...(results.nextSteps || buildNextSteps(results)),
      ],
    };
  }

  return {
    ...results,
    executiveSummary: results.executiveSummary || buildExecutiveSummary(results),
    nextSteps: results.nextSteps || buildNextSteps(results),
  };
}

function enrichResults(results) {
  return {
    ...results,
    executiveSummary: results.executiveSummary || buildExecutiveSummary(results),
    nextSteps: results.nextSteps || buildNextSteps(results),
  };
}

function normalizePayload(payload) {
  return {
    title: payload.title || "Benefits Brief",
    renewalScore: Number(payload.renewalScore) || 0,
    vendorScore: Number(payload.vendorScore) || 0,
    complianceScore: Number(payload.complianceScore) || 0,
    renewalText: payload.renewal || "",
    vendorText: payload.vendor || "",
    complianceText: payload.compliance || "",
    scaleText: payload.scaleability || "",
    executiveSummary: payload.executiveSummary || "",
    nextSteps: Array.isArray(payload.nextSteps) ? payload.nextSteps : [],
  };
}

function buildExecutiveSummary(results) {
  return [
    `Renewal risk sits at ${results.renewalScore}%, with the most obvious pressure coming from timing, approvals, and vendor leverage.`,
    `Vendor audit coverage sits at ${results.vendorScore}%, so the workflow should focus on contracts, SLAs, and data ownership.`,
    `Compliance coverage sits at ${results.complianceScore}%, which is enough for a plain-English country summary but still needs a human sanity check.`,
  ].join(" ");
}

function buildNextSteps(results) {
  const steps = [
    "Confirm renewal dates, decision owners, and escalation routes for each country or vendor.",
    "Review vendor contracts, broker arrangements, SLAs, and billing ownership in one pass.",
    "Map statutory and EOR requirements into a country-level checklist that a non-technical user can follow.",
  ];
  if (results.scaleScore >= 60) {
    steps.unshift("Reuse one template for each country so the process scales without rework.");
  }
  return steps;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function exportReport() {
  const results = enrichResults(applyMode(analyze(els.input.value.trim()), currentMode));
  const report = toHtmlReport(results);
  const blob = new Blob([report], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "benefits-specialist-report.html";
  link.click();
  URL.revokeObjectURL(url);
}

async function copyReport() {
  const results = enrichResults(applyMode(analyze(els.input.value.trim()), currentMode));
  const report = toTextReport(results);
  await navigator.clipboard.writeText(report);
  els.statusPill.textContent = "Summary copied";
}

function shareReport() {
  const results = enrichResults(applyMode(analyze(els.input.value.trim()), currentMode));
  const text = toTextReport(results);
  if (navigator.share) {
    navigator.share({
      title: "Benefits Specialist Executive Summary",
      text,
    });
    els.statusPill.textContent = "Share sheet opened";
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    els.statusPill.textContent = "Share text copied";
  });
}

function toTextReport(results) {
  return `Benefits Specialist Executive Report

Mode: ${currentMode === "client" ? "Client-facing" : "Internal draft"}

Executive summary
${results.executiveSummary}

Renewal logic
${results.renewalText}

Vendor audit
${results.vendorText}

Statutory summary
${results.complianceText}

Scaleability logic
${results.scaleText}

Next steps
${results.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}
`;
}

function toHtmlReport(results) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Benefits Specialist Executive Report</title>
  <style>
    body { margin: 0; padding: 40px; font-family: Arial, sans-serif; color: #10202f; background: #f4f5f7; }
    .page { max-width: 900px; margin: 0 auto; background: #fff; padding: 36px; border-radius: 22px; box-shadow: 0 20px 60px rgba(0,0,0,.08); }
    .kicker { text-transform: uppercase; letter-spacing: .18em; color: #2b7a69; font-weight: 700; font-size: 12px; }
    h1 { margin: 10px 0 16px; font-size: 40px; line-height: 1; }
    h2 { margin: 28px 0 10px; font-size: 20px; }
    p, li { line-height: 1.7; font-size: 15px; }
    .meta { display: flex; gap: 14px; flex-wrap: wrap; color: #5b6570; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 22px 0; }
    .metric { padding: 16px; border: 1px solid #d7dde4; border-radius: 16px; background: #fafbfc; }
    .metric strong { display: block; font-size: 28px; margin-bottom: 6px; }
    .section { margin-top: 22px; padding-top: 22px; border-top: 1px solid #e5e8ec; }
    ol { padding-left: 20px; }
    .footer { margin-top: 34px; color: #6b7280; font-size: 12px; }
    @page { margin: 18mm; }
    @media print { body { background: #fff; padding: 0; } .page { box-shadow: none; border-radius: 0; padding: 0; } }
  </style>
</head>
<body>
  <article class="page">
    <div class="kicker">Client-ready report</div>
    <h1>Benefits Specialist Executive Report</h1>
    <div class="meta">
      <span>Mode: ${currentMode === "client" ? "Client-facing" : "Internal draft"}</span>
      <span>Provider: ${escapeHtml(els.provider.value)}</span>
      <span>Generated: ${escapeHtml(new Date().toLocaleString())}</span>
    </div>
    <div class="grid">
      <div class="metric"><strong>${results.renewalScore}%</strong><span>Renewal risk</span></div>
      <div class="metric"><strong>${results.vendorScore}%</strong><span>Vendor audit</span></div>
      <div class="metric"><strong>${results.complianceScore}%</strong><span>Compliance coverage</span></div>
    </div>
    <div class="section">
      <h2>Executive summary</h2>
      <p>${escapeHtml(results.executiveSummary)}</p>
    </div>
    <div class="section">
      <h2>Renewal logic</h2>
      <p>${escapeHtml(results.renewalText)}</p>
    </div>
    <div class="section">
      <h2>Vendor audit</h2>
      <p>${escapeHtml(results.vendorText)}</p>
    </div>
    <div class="section">
      <h2>Statutory summary</h2>
      <p>${escapeHtml(results.complianceText)}</p>
    </div>
    <div class="section">
      <h2>Scaleability logic</h2>
      <p>${escapeHtml(results.scaleText)}</p>
    </div>
    <div class="section">
      <h2>Next steps</h2>
      <ol>
        ${results.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </div>
    <div class="footer">Built with Codex from OpenAI.</div>
  </article>
</body>
</html>`;
}

els.sample.addEventListener("click", () => {
  els.input.value = sampleBrief;
  els.fileName.textContent = "Sample brief loaded";
  runAnalysis();
});

els.run.addEventListener("click", runAnalysis);
els.exportReport.addEventListener("click", exportReport);
els.copyReport.addEventListener("click", () => {
  copyReport().catch(() => {
    els.statusPill.textContent = "Copy unavailable";
  });
});
els.shareReport.addEventListener("click", () => {
  shareReport();
});
els.modeClient.addEventListener("click", () => {
  setMode("client");
  saveState();
  runAnalysis();
});
els.modeInternal.addEventListener("click", () => {
  setMode("internal");
  saveState();
  runAnalysis();
});

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  els.input.value = text;
  els.fileName.textContent = file.name;
  runAnalysis();
});

[els.provider, els.apiKey, els.modelName, els.input].forEach((field) => {
  field.addEventListener("input", saveState);
  field.addEventListener("change", saveState);
});

loadState();
render(enrichResults(applyMode(analyze(els.input.value.trim()), currentMode)));
