// Utility: ensure the Prompt API is ready in the extension context
async function getModel() {
    // chrome.aiOriginTrial.languageModel exposes Gemini Nano for extensions in the trial
    const lm = chrome?.aiOriginTrial?.languageModel;
    if (!lm) throw new Error("Prompt API unavailable (languageModel not found).");
  
    const caps = await lm.capabilities();
    // available: "readily" | "after-download" | "no"
    if (caps.available === "no") throw new Error("Gemini Nano not available on this device.");
    if (caps.available === "after-download") {
      // Let the model finish downloading in the background; still attempt a session
      // or you can notify the popup to show a “downloading model” state.
    }
  
    // Create a lightweight session (no streaming here for simplicity)
    const session = await lm.create({ systemPrompt: `
  You are a careful verifier. Given a single claim, estimate how likely it is TRUE.
  Return STRICT JSON:
  {"true_probability": <0-100 integer>, "explanation": "<<=200 chars, plain text>"}
  
  Rules:
  - Don't browse the web. Use general knowledge & reasoning only.
  - Be conservative when uncertain.
  - Never include extra keys.
  `});
    return session;
  }
  
  // Core verification handler
  async function verifyStatement(text) {
    const session = await getModel();
    const prompt = `Claim: ${text}\nReturn STRICT JSON as specified.`;
    const raw = await session.prompt(prompt);
  
    // Parse guarded JSON
    let obj;
    try { obj = JSON.parse(raw); } catch(e) {
      // try to self-correct by reprompting for JSON only
      const raw2 = await session.prompt(
        "Your last output was not strict JSON. Output only the JSON object now."
      );
      obj = JSON.parse(raw2);
    }
  
    // Sanitize
    let p = Math.max(0, Math.min(100, Math.round(obj.true_probability || 0)));
    let expl = String(obj.explanation || "").slice(0, 220);
  
    return { probability: p, explanation: expl };
  }
  
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type === "VERIFY") {
        try {
          const result = await verifyStatement(msg.text);
          sendResponse({ ok: true, result });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
      }
    })();
    return true; // async response
  });
  