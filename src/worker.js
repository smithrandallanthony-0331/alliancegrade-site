// AllianceGrade mini-assessment scoring — runs on the server so the weights
// and tier thresholds are never shipped to the visitor's browser.
const WEIGHTS = { q1: 15, q2: 15, q3: 20, q4: 20, q5: 15, q6: 15 };

function tierFor(score) {
  if (score >= 80) return { label: "OPTIMIZED", color: "#1E8449" };
  if (score >= 60) return { label: "ESTABLISHED", color: "#00A896" };
  if (score >= 40) return { label: "DEVELOPING", color: "#D68910" };
  return { label: "CRITICAL", color: "#C0392B" };
}

const MESSAGES = {
  OPTIMIZED: "Your fundamentals sound strong. The full assessment can help confirm what's working and find the smaller gaps that separate a good program from a great one.",
  ESTABLISHED: "You've got a solid foundation with some real gaps. The full assessment pinpoints exactly which ones are costing you the most pipeline.",
  DEVELOPING: "The basics exist but execution is inconsistent — a very common and very fixable place to be. The full assessment shows you what to fix first.",
  CRITICAL: "There are foundational gaps limiting your program's revenue impact right now. The good news: these are the fastest to fix once you know exactly where they are.",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/score") {
      if (request.method !== "POST") return json({ error: "POST only" }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const answers = (body && body.answers) || {};
      let sum = 0;
      for (const q of Object.keys(WEIGHTS)) {
        const v = Number(answers[q]);
        if (!Number.isInteger(v) || v < 1 || v > 5) return json({ error: "Invalid answers" }, 400);
        sum += (v / 5) * WEIGHTS[q];
      }
      const score = Math.round(sum);
      const tier = tierFor(score);

      // Instant phone alert (push via ntfy). Contains only the score — no
      // visitor personal data. Only fires for requests from our own site.
      const origin = request.headers.get("origin") || "";
      const fromSite = /^https:\/\/(www\.)?alliancegrade\.com$/.test(origin);
      if (env.NTFY_TOPIC && fromSite) {
        ctx.waitUntil(
          fetch("https://ntfy.sh/" + encodeURIComponent(env.NTFY_TOPIC), {
            method: "POST",
            headers: {
              Title: "New AllianceGrade assessment",
              Tags: "chart_with_upwards_trend",
              Priority: "high",
            },
            body: "Someone just completed the mini-assessment: " + score + " (" + tier.label + "). Check your email / Formspree for their contact details.",
          }).catch(() => {})
        );
      }
      return json({ score, label: tier.label, color: tier.color, message: MESSAGES[tier.label] });
    }
    return env.ASSETS.fetch(request);
  },
};
