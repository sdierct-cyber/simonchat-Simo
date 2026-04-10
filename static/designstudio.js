(() => {
  if (window.__SIMO_DESIGN_STUDIO__) return;
  window.__SIMO_DESIGN_STUDIO__ = true;

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function copyText(text, success = "Copied.") {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(String(text || ""));
      } else {
        const ta = document.createElement("textarea");
        ta.value = String(text || "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      if (window.toast) window.toast(success, "success", 1600);
    } catch {
      if (window.toast) window.toast("Copy failed.", "error", 1800);
    }
  }

  function setMainChatValue(text) {
    const input =
      $("chatInput") ||
      document.querySelector("textarea") ||
      document.querySelector('textarea[name="prompt"]');

    if (!input) return false;

    input.value = String(text || "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
    return true;
  }

  function setFieldValue(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = String(value ?? "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function cleanValue(value, fallback) {
    const v = String(value || "").trim();
    return v || fallback;
  }

  function section(title, bodyLines = []) {
    return `${title}\n${bodyLines.filter(Boolean).join("\n")}`;
  }

  function bullets(items = []) {
    return items.filter(Boolean).map((x) => `- ${x}`);
  }

  function numbered(items = []) {
    return items.filter(Boolean).map((x, i) => `${i + 1}. ${x}`);
  }

  function normalizeInlineList(value, fallbackList = []) {
    const raw = String(value || "").trim();
    if (!raw) return fallbackList;
    return raw
      .split(/[\n,•,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function buildBuilderPrompt(panelKey, data, mode, output) {
    const base = output?.trim() || "";

    const structured = Object.entries(data || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const content = base.length > 40 ? base : structured;

    return `
Build a high-quality, modern ${panelKey.replace(/-/g, " ")}.

Details:
${content}

Requirements:
- Clean, premium layout
- Strong visual hierarchy
- Responsive design
- Sections appropriate for this concept
- Ready for production-quality preview

Return a complete HTML page.
`.trim();
  }

  function brandProfile(data) {
    return {
      brandName: cleanValue(data.brandName, "Untitled Brand"),
      industry: cleanValue(data.industry, "General"),
      audience: cleanValue(data.audience, "General audience"),
      style: cleanValue(data.style, "Modern premium"),
      colors: cleanValue(data.colors, "Blue, white, charcoal"),
      personality: cleanValue(data.personality, "Confident, clear, polished"),
      offer: cleanValue(data.offer, "Main offer not yet defined"),
      notes: cleanValue(data.notes, "Clean layout, premium hierarchy, sharp CTA sections"),
    };
  }

  function productProfile(data) {
    return {
      product: cleanValue(data.product, "Untitled Product"),
      category: cleanValue(data.category, "General"),
      customer: cleanValue(data.customer, "General consumer"),
      look: cleanValue(data.look, "Premium, modern"),
      materials: cleanValue(data.materials, "Metal, glass, matte surfaces"),
      environment: cleanValue(data.environment, "Studio lighting"),
      useCase: cleanValue(data.useCase, "Main use case not specified"),
      notes: cleanValue(data.notes, "High-end product presentation, clean shadows, realistic angles"),
    };
  }

  function appProfile(data) {
    return {
      appName: cleanValue(data.appName, "Untitled App"),
      appType: cleanValue(data.appType, "General app"),
      audience: cleanValue(data.audience, "General users"),
      goal: cleanValue(data.goal, "Core goal not specified"),
      mainScreen: cleanValue(data.mainScreen, "Dashboard"),
      style: cleanValue(data.style, "Modern premium UI"),
      features: cleanValue(data.features, "Core features not listed"),
      notes: cleanValue(data.notes, "Clean spacing, premium cards, modern dashboard feel"),
    };
  }

  function landingProfile(data) {
    return {
      name: cleanValue(data.name, "Untitled Concept"),
      type: cleanValue(data.type, "General"),
      audience: cleanValue(data.audience, "General visitors"),
      offer: cleanValue(data.offer, "Core offer not specified"),
      cta: cleanValue(data.cta, "Get Started"),
      style: cleanValue(data.style, "Premium modern"),
      sections: cleanValue(data.sections, "Hero, features, CTA, contact"),
      notes: cleanValue(data.notes, "Sharp hierarchy, premium spacing, clean conversion flow"),
    };
  }

  function moodboardProfile(data) {
    return {
      project: cleanValue(data.project, "Untitled Space"),
      spaceType: cleanValue(data.spaceType, "Interior space"),
      style: cleanValue(data.style, "Modern luxury"),
      palette: cleanValue(data.palette, "Warm neutrals, black, glass, wood"),
      materials: cleanValue(data.materials, "Wood, stone, brushed metal"),
      mood: cleanValue(data.mood, "Elegant, calm, premium"),
      reference: cleanValue(data.reference, "Boutique hotel / luxury residential"),
      notes: cleanValue(data.notes, "Layered lighting, rich texture, premium composition"),
    };
  }

  function buildBrandIdentityOutput(data) {
    const p = brandProfile(data);
    return [
      "DESIGN STUDIO — BRAND IDENTITY",
      "",
      section("PROJECT SNAPSHOT", bullets([
        `Brand name: ${p.brandName}`,
        `Industry: ${p.industry}`,
        `Audience: ${p.audience}`,
        `Style direction: ${p.style}`,
        `Color direction: ${p.colors}`,
        `Personality: ${p.personality}`,
      ])),
      "",
      section("CORE OFFER", [p.offer]),
      "",
      section("BRAND POSITIONING", bullets([
        `${p.brandName} should feel like a premium, clearly defined presence in the ${p.industry} space.`,
        `The message should speak directly to ${p.audience} with a tone that feels ${p.personality.toLowerCase()}.`,
        "The overall positioning should balance clarity, desirability, and trust rather than sounding generic or overly corporate.",
      ])),
      "",
      section("VISUAL DIRECTION", bullets([
        `Lead with a ${p.style.toLowerCase()} direction that feels polished and intentionally premium.`,
        `Build the visual palette around ${p.colors}.`,
        "Use strong hierarchy, spacious composition, and controlled contrast so the brand feels elevated immediately.",
      ])),
      "",
      section("COPY DIRECTION", bullets([
        "Headlines should be concise, high-confidence, and benefit-led.",
        "Supporting copy should feel refined, intelligent, and conversion-aware.",
        "Calls to action should sound premium and intentional rather than pushy.",
      ])),
      "",
      section("HOMEPAGE IDEA", numbered([
        "Hero with one strong brand statement, short support copy, and a clean primary CTA.",
        "Trust or positioning strip that quickly reinforces credibility.",
        "Three core value blocks that express why the brand is different.",
        "Deeper offer section that explains the signature product or service.",
        "Confident closing CTA that feels polished and conversion-ready.",
      ])),
      "",
      section("NOTES TO PRESERVE", bullets([p.notes])),
      "",
      section("PROMPT FOR SIMO", [
        `Create a premium brand identity concept for "${p.brandName}" in the ${p.industry} space.`,
        `Target audience: ${p.audience}.`,
        `Style direction: ${p.style}.`,
        `Color direction: ${p.colors}.`,
        `Brand personality: ${p.personality}.`,
        `Core offer: ${p.offer}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. Brand positioning statement",
        "2. Visual direction",
        "3. Homepage concept",
        "4. CTA strategy",
        "5. Premium copy direction",
      ]),
    ].join("\n");
  }

  function buildBrandIdentityVisualOutput(data) {
    const p = brandProfile(data);
    return [
      "DESIGN STUDIO — BRAND IDENTITY VISUAL MODE",
      "",
      section("BRAND FOUNDATION", bullets([
        `Brand name: ${p.brandName}`,
        `Industry: ${p.industry}`,
        `Audience: ${p.audience}`,
        `Personality: ${p.personality}`,
      ])),
      "",
      section("VISUAL MOOD", bullets([
        `Overall style: ${p.style}`,
        `Palette direction: ${p.colors}`,
        `Offer emphasis: ${p.offer}`,
        `Support notes: ${p.notes}`,
      ])),
      "",
      section("VISUAL SYSTEM", bullets([
        "Hero should feel editorial, high-confidence, and immediately premium.",
        "Typography should create a strong focal point first, then guide the eye into offer and CTA.",
        "Section spacing should feel generous and architectural rather than crowded.",
        "The interface or webpage should use subtle glow, clean borders, and refined depth instead of loud decoration.",
      ])),
      "",
      section("LAYOUT MAP", numbered([
        "Hero with large headline, short positioning line, and primary CTA pair",
        "Trust / credibility strip beneath hero",
        "Value trio with clean premium cards or blocks",
        "Signature offer section with deeper visual storytelling",
        "Social proof or endorsement section",
        "Final CTA section with stronger close",
      ])),
      "",
      section("ART DIRECTION", bullets([
        "Use upscale campaign-style imagery or highly controlled abstract support visuals.",
        "Favor clean contrast, premium restraint, and deliberate whitespace.",
        "Let the composition feel expensive before it feels busy.",
      ])),
      "",
      section("PROMPT FOR SIMO", [
        `Create a premium visual brand direction and homepage structure for "${p.brandName}".`,
        `Industry: ${p.industry}.`,
        `Audience: ${p.audience}.`,
        `Personality: ${p.personality}.`,
        `Style: ${p.style}.`,
        `Color direction: ${p.colors}.`,
        `Core offer: ${p.offer}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. Visual art direction",
        "2. Homepage section layout",
        "3. Conversion-focused hierarchy",
        "4. Premium styling guidance",
        "5. Builder-ready structure",
      ]),
    ].join("\n");
  }

  function buildProductMockupOutput(data) {
    const p = productProfile(data);
    return [
      "DESIGN STUDIO — PRODUCT MOCKUP",
      "",
      section("PRODUCT SNAPSHOT", bullets([
        `Product: ${p.product}`,
        `Category: ${p.category}`,
        `Target customer: ${p.customer}`,
        `Look and feel: ${p.look}`,
        `Materials / finish: ${p.materials}`,
        `Environment: ${p.environment}`,
      ])),
      "",
      section("USE CASE", [p.useCase]),
      "",
      section("MOCKUP STRATEGY", bullets([
        `${p.product} should be presented as a premium object first, not just a catalog item.`,
        `The visual language should align with ${p.look.toLowerCase()} styling and appeal directly to ${p.customer.toLowerCase()}.`,
        "The presentation should feel campaign-ready, believable, and polished enough to support marketing use.",
      ])),
      "",
      section("HERO SHOT DIRECTION", bullets([
        "Lead with one signature angle that makes the silhouette and finish feel desirable.",
        "Use lighting to emphasize material quality, edge definition, and perceived value.",
        "Keep the background restrained so the product remains the hero.",
      ])),
      "",
      section("SUPPORTING VISUALS", numbered([
        "Main hero composition",
        "Close-up material / craftsmanship angle",
        "Feature callout or annotated product view",
        "In-context or lifestyle support visual",
        "Premium CTA-ready final campaign frame",
      ])),
      "",
      section("MOCKUP NOTES TO PRESERVE", bullets([p.notes])),
      "",
      section("PROMPT FOR SIMO", [
        `Create a premium product mockup concept for "${p.product}".`,
        `Category: ${p.category}.`,
        `Target customer: ${p.customer}.`,
        `Look and feel: ${p.look}.`,
        `Materials / finish: ${p.materials}.`,
        `Environment: ${p.environment}.`,
        `Use case: ${p.useCase}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. Hero mockup direction",
        "2. Feature callout layout",
        "3. Marketing visual system",
        "4. Packaging / presentation angle ideas",
        "5. Premium landing-page visual direction",
      ]),
    ].join("\n");
  }

  function buildProductMockupVisualOutput(data) {
    const p = productProfile(data);
    return [
      "DESIGN STUDIO — PRODUCT MOCKUP VISUAL MODE",
      "",
      section("PRODUCT PROFILE", bullets([
        `Product: ${p.product}`,
        `Category: ${p.category}`,
        `Target customer: ${p.customer}`,
        `Use case: ${p.useCase}`,
      ])),
      "",
      section("VISUAL DIRECTION", bullets([
        `Look and feel: ${p.look}`,
        `Materials / finish: ${p.materials}`,
        `Environment: ${p.environment}`,
        `Notes: ${p.notes}`,
      ])),
      "",
      section("COMPOSITION PLAN", numbered([
        "Hero shot with the strongest premium angle",
        "Secondary detail crop showing material quality",
        "Feature callout view with elegant annotation",
        "Lifestyle or in-context usage frame",
        "Final conversion-ready product close",
      ])),
      "",
      section("ART DIRECTION", bullets([
        "Use controlled commercial lighting with clean reflections and believable depth.",
        "Make the product feel tangible, premium, and launch-ready.",
        "Avoid clutter so the silhouette and finish stay dominant.",
      ])),
      "",
      section("BUILDER-READY VISUAL BLOCKS", numbered([
        "Hero product showcase",
        "Feature/spec band",
        "Materials detail section",
        "Lifestyle application section",
        "Final CTA",
      ])),
      "",
      section("PROMPT FOR SIMO", [
        `Create a premium visual product mockup system for "${p.product}".`,
        `Category: ${p.category}.`,
        `Customer: ${p.customer}.`,
        `Look and feel: ${p.look}.`,
        `Materials: ${p.materials}.`,
        `Environment: ${p.environment}.`,
        `Use case: ${p.useCase}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. Hero composition",
        "2. Mockup angle system",
        "3. Feature-callout layout",
        "4. Campaign-ready visual direction",
        "5. Builder-ready presentation blocks",
      ]),
    ].join("\n");
  }

  function buildAppScreenOutput(data) {
    const p = appProfile(data);
    const featureList = normalizeInlineList(p.features, [
      "Core feature area",
      "Primary user action",
      "Status / progress visibility",
      "Secondary support tools",
    ]);

    return [
      "DESIGN STUDIO — APP SCREEN CONCEPT",
      "",
      section("APP SNAPSHOT", bullets([
        `App name: ${p.appName}`,
        `App type: ${p.appType}`,
        `Audience: ${p.audience}`,
        `Primary goal: ${p.goal}`,
        `Main screen: ${p.mainScreen}`,
        `Visual style: ${p.style}`,
      ])),
      "",
      section("KEY FEATURES", bullets(featureList)),
      "",
      section("UX DIRECTION", bullets([
        `${p.appName} should make the ${p.mainScreen.toLowerCase()} feel immediately understandable and useful.`,
        `The screen should help ${p.audience.toLowerCase()} achieve the core goal of ${p.goal.toLowerCase()}.`,
        "Hierarchy should be calm, obvious, and premium instead of feeling busy or over-designed.",
      ])),
      "",
      section("SCREEN HIERARCHY", numbered([
        "Strong top area with page identity and high-priority actions",
        "Primary focus block for the main job-to-be-done",
        "Secondary card system for key supporting features",
        "Lower support area for history, insights, or recommendations",
      ])),
      "",
      section("VISUAL DIRECTION", bullets([
        `Use a ${p.style.toLowerCase()} treatment with clean contrast and disciplined spacing.`,
        "Buttons and cards should feel premium and intentional.",
        "The screen should feel production-minded, not just conceptual.",
      ])),
      "",
      section("NOTES TO PRESERVE", bullets([p.notes])),
      "",
      section("PROMPT FOR SIMO", [
        `Create a premium app screen concept for "${p.appName}".`,
        `App type: ${p.appType}.`,
        `Audience: ${p.audience}.`,
        `Primary goal: ${p.goal}.`,
        `Main screen focus: ${p.mainScreen}.`,
        `Visual style: ${p.style}.`,
        `Key features: ${featureList.join(", ")}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. Screen hierarchy",
        "2. Component layout",
        "3. UX emphasis",
        "4. Visual style direction",
        "5. Polished app-screen prompt",
      ]),
    ].join("\n");
  }

  function buildAppScreenVisualOutput(data) {
    const p = appProfile(data);
    const featureList = normalizeInlineList(p.features, [
      "Primary dashboard metric",
      "Action cards",
      "History / insight module",
      "Support actions",
    ]);

    return [
      "DESIGN STUDIO — APP SCREEN VISUAL MODE",
      "",
      section("APP PROFILE", bullets([
        `App name: ${p.appName}`,
        `App type: ${p.appType}`,
        `Audience: ${p.audience}`,
        `Primary goal: ${p.goal}`,
        `Main screen focus: ${p.mainScreen}`,
      ])),
      "",
      section("VISUAL UI DIRECTION", bullets([
        `Style: ${p.style}`,
        `Feature emphasis: ${featureList.join(", ")}`,
        `Notes: ${p.notes}`,
      ])),
      "",
      section("LAYOUT MAP", numbered([
        "Top bar with title, support action, and optional filter / date control",
        "Hero metric or primary content block placed first",
        "Core card grid or stacked feature area",
        "Quick actions or shortcuts zone",
        "Lower insight / history / recommendations section",
      ])),
      "",
      section("COMPONENT DIRECTION", bullets([
        "Cards should feel believable and premium, with one clear primary focal point.",
        "Buttons should make hierarchy obvious between primary and secondary actions.",
        "Any stats or chart areas should look dashboard-ready, not decorative.",
        "Inputs and filters should stay compact, elegant, and clear.",
      ])),
      "",
      section("ART DIRECTION", bullets([
        "Favor clean grouping, spacing, and premium restraint.",
        "Motion should feel subtle and purposeful.",
        "The screen should look like a launch-ready concept for a real app product.",
      ])),
      "",
      section("PROMPT FOR SIMO", [
        `Create a premium app screen layout for "${p.appName}".`,
        `Type: ${p.appType}.`,
        `Audience: ${p.audience}.`,
        `Primary goal: ${p.goal}.`,
        `Main screen: ${p.mainScreen}.`,
        `Style: ${p.style}.`,
        `Features: ${featureList.join(", ")}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. UI hierarchy",
        "2. Layout map",
        "3. Component structure",
        "4. Premium interface direction",
        "5. Builder-ready screen organization",
      ]),
    ].join("\n");
  }

  function buildLandingPageOutput(data) {
    const p = landingProfile(data);
    const sectionList = normalizeInlineList(p.sections, [
      "Hero",
      "Features",
      "Proof",
      "CTA",
      "Footer",
    ]);

    return [
      "DESIGN STUDIO — LANDING PAGE CONCEPT",
      "",
      section("PAGE SNAPSHOT", bullets([
        `Brand / product: ${p.name}`,
        `Type: ${p.type}`,
        `Audience: ${p.audience}`,
        `Main offer: ${p.offer}`,
        `Primary CTA: ${p.cta}`,
        `Style direction: ${p.style}`,
      ])),
      "",
      section("PLANNED SECTIONS", bullets(sectionList)),
      "",
      section("CONVERSION STRATEGY", bullets([
        `The page should make the value of ${p.offer.toLowerCase()} obvious quickly.`,
        `The flow should speak directly to ${p.audience.toLowerCase()} and lead naturally toward "${p.cta}".`,
        "Every section should either build desire, reduce hesitation, or move the visitor closer to action.",
      ])),
      "",
      section("HERO DIRECTION", bullets([
        "Lead with a strong benefit-first headline and one crisp support line.",
        "Use a polished CTA area with one primary action and an optional secondary action.",
        "Support the hero with a visual that reinforces trust and perceived quality.",
      ])),
      "",
      section("SECTION-BY-SECTION FLOW", numbered([
        "Hero",
        "Trust / credibility strip",
        "Feature or value section",
        "Deeper explanation / story / process section",
        "Proof or testimonial section",
        "Final CTA close",
      ])),
      "",
      section("NOTES TO PRESERVE", bullets([p.notes])),
      "",
      section("PROMPT FOR SIMO", [
        `Create a premium landing page concept for "${p.name}".`,
        `Type: ${p.type}.`,
        `Audience: ${p.audience}.`,
        `Main offer: ${p.offer}.`,
        `Primary CTA: ${p.cta}.`,
        `Style direction: ${p.style}.`,
        `Key sections: ${sectionList.join(", ")}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. Homepage structure",
        "2. Hero direction",
        "3. Conversion path",
        "4. Section-by-section breakdown",
        "5. Polished builder-ready prompt",
      ]),
    ].join("\n");
  }

  function buildLandingPageVisualOutput(data) {
    const p = landingProfile(data);
    const sectionList = normalizeInlineList(p.sections, [
      "Hero",
      "Trust strip",
      "Features",
      "Proof",
      "CTA",
      "Footer",
    ]);

    return [
      "DESIGN STUDIO — LANDING PAGE VISUAL MODE",
      "",
      section("PAGE PROFILE", bullets([
        `Brand / product: ${p.name}`,
        `Type: ${p.type}`,
        `Audience: ${p.audience}`,
        `Main offer: ${p.offer}`,
        `Primary CTA: ${p.cta}`,
      ])),
      "",
      section("STYLE DIRECTION", bullets([
        `Style: ${p.style}`,
        `Section plan: ${sectionList.join(", ")}`,
        `Notes: ${p.notes}`,
      ])),
      "",
      section("VISUAL PAGE STRUCTURE", numbered([
        "Hero with strong headline, short value statement, CTA pair, and support visual",
        "Trust or credibility strip directly below hero",
        "Feature grid or stacked benefits section",
        "How-it-works or story section with deeper explanation",
        "Testimonials / proof section",
        "Final CTA close",
        "Footer",
      ])),
      "",
      section("LAYOUT GUIDANCE", bullets([
        "Keep above-the-fold clarity high: headline first, CTA second, visual support third.",
        "Use premium whitespace and consistent section rhythm.",
        "Alternate density so the page feels editorial rather than repetitive.",
      ])),
      "",
      section("ART DIRECTION", bullets([
        "Typography should feel bold and controlled.",
        "Imagery should look polished, credible, and premium.",
        "Cards, framing, and subtle glow should support hierarchy instead of distracting from it.",
      ])),
      "",
      section("PROMPT FOR SIMO", [
        `Create a premium landing page visual structure for "${p.name}".`,
        `Type: ${p.type}.`,
        `Audience: ${p.audience}.`,
        `Offer: ${p.offer}.`,
        `Primary CTA: ${p.cta}.`,
        `Style: ${p.style}.`,
        `Key sections: ${sectionList.join(", ")}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. Page layout map",
        "2. Hero composition",
        "3. Section-by-section visual guidance",
        "4. Premium conversion structure",
        "5. Builder-ready homepage block plan",
      ]),
    ].join("\n");
  }

  function buildMoodboardOutput(data) {
    const p = moodboardProfile(data);
    return [
      "DESIGN STUDIO — INTERIOR MOODBOARD",
      "",
      section("PROJECT SNAPSHOT", bullets([
        `Project name: ${p.project}`,
        `Space type: ${p.spaceType}`,
        `Style: ${p.style}`,
        `Palette: ${p.palette}`,
        `Materials: ${p.materials}`,
        `Mood: ${p.mood}`,
      ])),
      "",
      section("REFERENCE DIRECTION", [p.reference]),
      "",
      section("DESIGN INTENT", bullets([
        `${p.project} should feel ${p.mood.toLowerCase()} from the first visual impression.`,
        `The space should express a ${p.style.toLowerCase()} identity through material layering and restraint.`,
        "The overall composition should feel curated, architectural, and premium rather than overly decorated.",
      ])),
      "",
      section("PALETTE + MATERIAL STRATEGY", bullets([
        `Build the atmosphere around ${p.palette}.`,
        `Let ${p.materials} create depth and tactile richness.`,
        "Use contrast carefully so the space feels refined instead of heavy.",
      ])),
      "",
      section("STYLING GUIDANCE", numbered([
        "Primary focal view or signature feature",
        "Furniture / decor rhythm that supports the space",
        "Lighting strategy that adds softness and depth",
        "Texture layering that keeps the room visually rich",
        "Final styling details that make the concept feel complete",
      ])),
      "",
      section("NOTES TO PRESERVE", bullets([p.notes])),
      "",
      section("PROMPT FOR SIMO", [
        `Create an interior moodboard concept for "${p.project}".`,
        `Space type: ${p.spaceType}.`,
        `Style: ${p.style}.`,
        `Palette: ${p.palette}.`,
        `Materials: ${p.materials}.`,
        `Mood: ${p.mood}.`,
        `Reference direction: ${p.reference}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. Visual direction",
        "2. Material palette",
        "3. Furniture / decor guidance",
        "4. Lighting direction",
        "5. Polished moodboard prompt",
      ]),
    ].join("\n");
  }

  function buildMoodboardVisualOutput(data) {
    const p = moodboardProfile(data);
    return [
      "DESIGN STUDIO — INTERIOR MOODBOARD VISUAL MODE",
      "",
      section("PROJECT PROFILE", bullets([
        `Project name: ${p.project}`,
        `Space type: ${p.spaceType}`,
        `Style: ${p.style}`,
        `Mood: ${p.mood}`,
      ])),
      "",
      section("MATERIAL + COLOR DIRECTION", bullets([
        `Palette: ${p.palette}`,
        `Materials: ${p.materials}`,
        `Reference direction: ${p.reference}`,
        `Notes: ${p.notes}`,
      ])),
      "",
      section("SPATIAL VISUAL PLAN", numbered([
        "Entry impression or first focal view",
        "Main composition anchored by one strong architectural or furniture element",
        "Material layering plan",
        "Lighting strategy",
        "Final styling and decor restraint",
      ])),
      "",
      section("ART DIRECTION", bullets([
        "Combine smooth, matte, tactile, and polished surfaces for depth.",
        "Keep the styling restrained and expensive rather than crowded.",
        "Let one or two focal elements lead while supporting pieces stay quieter.",
      ])),
      "",
      section("MOODBOARD BLOCKS", numbered([
        "Primary palette",
        "Material stack",
        "Hero room direction",
        "Furniture / decor cues",
        "Lighting strategy",
        "Final styling notes",
      ])),
      "",
      section("PROMPT FOR SIMO", [
        `Create a premium interior visual moodboard plan for "${p.project}".`,
        `Space type: ${p.spaceType}.`,
        `Style: ${p.style}.`,
        `Palette: ${p.palette}.`,
        `Materials: ${p.materials}.`,
        `Mood: ${p.mood}.`,
        `Reference direction: ${p.reference}.`,
        `Extra notes: ${p.notes}.`,
        "",
        "Deliver:",
        "1. Room visual direction",
        "2. Palette and material hierarchy",
        "3. Focal-point styling",
        "4. Lighting plan",
        "5. Builder-ready moodboard structure",
      ]),
    ].join("\n");
  }

  const studioDefs = [
    {
      key: "brand",
      title: "Brand Identity",
      copy: "Positioning, colors, personality, premium direction.",
      fields: [
        ["brandName", "Brand Name", "text"],
        ["industry", "Industry", "text"],
        ["audience", "Audience", "text"],
        ["style", "Style Direction", "text"],
        ["colors", "Color Direction", "text"],
        ["personality", "Brand Personality", "text"],
        ["offer", "Core Offer", "textarea"],
        ["notes", "Visual Notes", "textarea"],
      ],
      buildText: buildBrandIdentityOutput,
      buildVisual: buildBrandIdentityVisualOutput,
      presets: [
        {
          label: "Luxury skincare",
          values: {
            brandName: "Veloura",
            industry: "Luxury skincare",
            audience: "Women and men 28–45 who value premium wellness",
            style: "Editorial luxury, clean and modern",
            colors: "Warm ivory, black, muted gold, soft stone",
            personality: "Confident, elegant, refined",
            offer: "High-end skincare built around visible results and elevated ritual",
            notes: "Premium hero section, minimal packaging cues, elegant testimonials, sharp CTA moments",
          },
        },
        {
          label: "Modern real estate",
          values: {
            brandName: "Northline Estates",
            industry: "Real estate",
            audience: "Affluent buyers and sellers seeking modern premium service",
            style: "Architectural, polished, premium corporate",
            colors: "White, charcoal, slate blue, brushed silver",
            personality: "Trustworthy, upscale, intelligent",
            offer: "Boutique real estate service with luxury listings and concierge guidance",
            notes: "Sophisticated grid, large imagery, premium stats band, high-trust CTA structure",
          },
        },
      ],
    },
    {
      key: "mockup",
      title: "Product Mockup",
      copy: "Product concept presentation and marketing visuals.",
      fields: [
        ["product", "Product Name", "text"],
        ["category", "Category", "text"],
        ["customer", "Target Customer", "text"],
        ["look", "Look & Feel", "text"],
        ["materials", "Materials / Finish", "text"],
        ["environment", "Environment", "text"],
        ["useCase", "Use Case", "textarea"],
        ["notes", "Mockup Notes", "textarea"],
      ],
      buildText: buildProductMockupOutput,
      buildVisual: buildProductMockupVisualOutput,
      presets: [
        {
          label: "Premium smartwatch",
          values: {
            product: "Auralink One",
            category: "Smartwatch",
            customer: "Style-conscious professionals",
            look: "Sleek premium tech with luxury cues",
            materials: "Brushed titanium, sapphire glass, matte ceramic",
            environment: "Dark studio lighting with subtle reflections",
            useCase: "High-end wearable for health, business, and daily performance",
            notes: "Exploded feature callouts, realistic wrist angles, premium packaging-ready visuals",
          },
        },
        {
          label: "Fragrance bottle",
          values: {
            product: "Noir Ember",
            category: "Luxury fragrance",
            customer: "Upscale fragrance buyers",
            look: "Elegant cinematic product styling",
            materials: "Smoked glass, polished metal cap, matte label finish",
            environment: "Editorial luxury set with shadow and glow contrast",
            useCase: "Signature scent marketed through premium campaign visuals",
            notes: "Hero bottle composition, ad-ready crop options, refined reflections, boutique presentation",
          },
        },
      ],
    },
    {
      key: "app",
      title: "App Screen Concept",
      copy: "Screens, hierarchy, flow, premium UI direction.",
      fields: [
        ["appName", "App Name", "text"],
        ["appType", "App Type", "text"],
        ["audience", "Audience", "text"],
        ["goal", "Primary Goal", "text"],
        ["mainScreen", "Main Screen Focus", "text"],
        ["style", "Visual Style", "text"],
        ["features", "Key Features", "textarea"],
        ["notes", "Extra Notes", "textarea"],
      ],
      buildText: buildAppScreenOutput,
      buildVisual: buildAppScreenVisualOutput,
      presets: [
        {
          label: "Finance dashboard",
          values: {
            appName: "Atlas Wealth",
            appType: "Personal finance dashboard",
            audience: "Ambitious professionals managing savings, investing, and goals",
            goal: "Make wealth tracking feel simple, premium, and motivating",
            mainScreen: "Portfolio dashboard",
            style: "Dark premium dashboard with glowing metrics and clean cards",
            features: "Net worth summary, portfolio allocation, recurring deposits, goals, watchlist, performance trends",
            notes: "Soft glass panels, excellent spacing, premium KPI hierarchy, believable fintech polish",
          },
        },
        {
          label: "Fitness coaching app",
          values: {
            appName: "Forge Fit",
            appType: "Fitness coaching app",
            audience: "Users who want guided workouts and visible progress",
            goal: "Drive consistency, motivation, and progress clarity",
            mainScreen: "Daily workout overview",
            style: "Energetic premium UI with bold stats and clean structure",
            features: "Workout plan, streaks, coach tips, nutrition highlights, recovery score",
            notes: "Strong hero metric, polished cards, modern activity flow, high-end mobile app feel",
          },
        },
      ],
    },
    {
      key: "landing",
      title: "Landing Page Concept",
      copy: "Builder-ready page structure and conversion direction.",
      fields: [
        ["name", "Brand / Product", "text"],
        ["type", "Type", "text"],
        ["audience", "Audience", "text"],
        ["offer", "Main Offer", "text"],
        ["cta", "Primary CTA", "text"],
        ["style", "Style Direction", "text"],
        ["sections", "Key Sections", "textarea"],
        ["notes", "Extra Notes", "textarea"],
      ],
      buildText: buildLandingPageOutput,
      buildVisual: buildLandingPageVisualOutput,
      presets: [
        {
          label: "AI startup page",
          values: {
            name: "Nimbus AI",
            type: "AI SaaS startup",
            audience: "Teams that want faster workflows and smarter automation",
            offer: "AI workspace that turns ideas into deliverables",
            cta: "Start Free",
            style: "Premium SaaS with strong glow accents and clean conversion flow",
            sections: "Hero, trust logos, feature stack, workflow steps, pricing teaser, FAQ, CTA",
            notes: "Sharp headline, polished hero visual, modern SaaS credibility, premium call-to-action structure",
          },
        },
        {
          label: "Architect portfolio",
          values: {
            name: "Elian Studio",
            type: "Architecture portfolio",
            audience: "Luxury residential and boutique commercial clients",
            offer: "Architectural design with refined modern execution",
            cta: "Book a Consultation",
            style: "Minimal editorial architecture aesthetic",
            sections: "Hero, selected projects, philosophy, process, testimonials, inquiry section",
            notes: "Large imagery, restrained typography, premium whitespace, elevated service feel",
          },
        },
      ],
    },
    {
      key: "moodboard",
      title: "Interior Moodboard",
      copy: "Interior concept direction, materials, palette, mood.",
      fields: [
        ["project", "Project Name", "text"],
        ["spaceType", "Space Type", "text"],
        ["style", "Style", "text"],
        ["palette", "Palette", "text"],
        ["materials", "Materials", "text"],
        ["mood", "Mood", "text"],
        ["reference", "Reference Direction", "textarea"],
        ["notes", "Extra Notes", "textarea"],
      ],
      buildText: buildMoodboardOutput,
      buildVisual: buildMoodboardVisualOutput,
      presets: [
        {
          label: "Luxury kitchen",
          values: {
            project: "Ridgeview Residence",
            spaceType: "Luxury kitchen",
            style: "Modern warm luxury",
            palette: "Cream stone, walnut, black accents, warm brass",
            materials: "Veined stone, natural walnut, brushed brass, fluted glass",
            mood: "Elegant, calm, expensive, welcoming",
            reference: "Boutique hotel meets high-end custom residence",
            notes: "Layered pendants, strong island focal point, premium styling, cinematic material richness",
          },
        },
        {
          label: "Executive office",
          values: {
            project: "North Tower Office",
            spaceType: "Executive office",
            style: "Contemporary masculine luxury",
            palette: "Charcoal, tobacco brown, smoked glass, blackened steel",
            materials: "Wood veneer, leather, black metal, textured stone",
            mood: "Focused, powerful, refined",
            reference: "Modern private club with architectural office detailing",
            notes: "Clean desk composition, warm lighting, statement shelving, premium restraint",
          },
        },
      ],
    },
  ];

  const state = {
    active: "brand",
    outputs: {},
    outputMode: "text",
  };

  function getPanelDef(key) {
    return studioDefs.find((x) => x.key === key) || null;
  }

  function fieldHtml(panelKey, fieldKey, label, type) {
    const inputId = `ds_${panelKey}_${fieldKey}`;
    if (type === "textarea") {
      return `
        <div class="ds-field">
          <label class="ds-label" for="${inputId}">${escapeHtml(label)}</label>
          <textarea class="ds-textarea" id="${inputId}"></textarea>
        </div>
      `;
    }
    return `
        <div class="ds-field">
          <label class="ds-label" for="${inputId}">${escapeHtml(label)}</label>
          <input class="ds-input" id="${inputId}" type="text" />
        </div>
      `;
  }

  function presetButtonsHtml(def) {
    const presets = Array.isArray(def.presets) ? def.presets : [];
    if (!presets.length) return "";

    return `
      <div class="ds-card">
        <div class="ds-card-title">Quick Start Examples</div>
        <div class="ds-card-copy">Load a polished example first, then tweak it however you want.</div>
        <div class="ds-output-actions">
          ${presets.map((preset, index) => `
            <button
              class="ds-btn"
              type="button"
              data-ds-preset="${def.key}"
              data-ds-preset-index="${index}"
            >
              ${escapeHtml(preset.label || `Preset ${index + 1}`)}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function sharedModeToggleHtml() {
    return `
      <div class="ds-card ds-shared-mode-card">
        <div class="ds-card-title">Output Mode</div>
        <div class="ds-card-copy">Choose whether Design Studio writes a concept brief or a visual layout plan.</div>
        <div class="ds-output-actions">
          <button
            class="ds-btn${state.outputMode === "text" ? " ds-btn-primary" : ""}"
            type="button"
            data-ds-mode="text"
            aria-pressed="${state.outputMode === "text" ? "true" : "false"}"
          >
            Text Mode
          </button>
          <button
            class="ds-btn${state.outputMode === "visual" ? " ds-btn-primary" : ""}"
            type="button"
            data-ds-mode="visual"
            aria-pressed="${state.outputMode === "visual" ? "true" : "false"}"
          >
            Visual Mode
          </button>
        </div>
      </div>
    `;
  }

  function sharedOutputHtml() {
    return `
      <div class="ds-card ds-shared-output-card">
        <div class="ds-card-title">Generated Output</div>
        <div class="ds-card-copy">Text Mode gives a polished concept brief. Visual Mode gives layout thinking and builder-ready structure.</div>
        <div class="ds-output-wrap">
          <div class="ds-output-actions">
            <button class="ds-btn" type="button" data-ds-copy-shared="true">Copy Output</button>
            <button class="ds-btn" type="button" data-ds-send-shared="true">Send To Chat</button>
            <button class="ds-btn ds-btn-primary" type="button" data-ds-send-builder="true">Send To Builder</button>
          </div>
          <div class="ds-output ds-empty" id="ds_shared_output">Nothing generated yet.</div>
        </div>
      </div>
    `;
  }

  function panelHtml(def) {
    const fieldsHtml = def.fields
      .map(([key, label, type]) => fieldHtml(def.key, key, label, type))
      .join("");

    return `
      <section class="ds-panel${def.key === state.active ? " active" : ""}" data-ds-panel="${def.key}">
  ${presetButtonsHtml(def)}
  <div class="ds-card">
    <div class="ds-card-title">${escapeHtml(def.title)}</div>
    <div class="ds-card-copy">${escapeHtml(def.copy)}</div>
    <div class="ds-grid-2">
      ${fieldsHtml}
    </div>
    <div class="ds-output-actions">
      <button class="ds-btn ds-btn-primary" type="button" data-ds-generate="${def.key}">
        Generate Concept
      </button>

      <button class="ds-btn" type="button" data-ds-generate-send="${def.key}">
        Generate + Send To Chat
      </button>

      <button class="ds-btn" type="button" data-ds-clear="${def.key}">
        Clear
      </button>
    </div>
  </div>
</section>
`;
  }

  function scrollSharedOutputIntoView() {
    const sharedOut = $("ds_shared_output");
    if (sharedOut) {
      sharedOut.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function fillMainInputAndReveal(text, successMessage) {
    const ok = setMainChatValue(text);
    if (ok) {
      closeStudio();
      const input =
        $("chatInput") ||
        document.querySelector("textarea") ||
        document.querySelector('textarea[name="prompt"]');
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (window.toast) window.toast(successMessage, "success", 1800);
    } else if (window.toast) {
      window.toast("Chat input not found.", "error", 1800);
    }
    return ok;
  }

  function bindPanelActionButtons(modal) {
    if (!modal) return;

    $$("[data-ds-generate]", modal).forEach((btn) => {
      if (btn.dataset.boundGenerate === "true") return;
      btn.dataset.boundGenerate = "true";

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const key = btn.getAttribute("data-ds-generate") || "brand";
        state.active = key;
        syncTabs();

        const output = generateFor(key);
        scrollSharedOutputIntoView();

        if (!output && window.toast) {
          window.toast("Nothing generated.", "error", 1800);
        }
      });
    });

    $$("[data-ds-generate-send]", modal).forEach((btn) => {
      if (btn.dataset.boundGenerateSend === "true") return;
      btn.dataset.boundGenerateSend = "true";

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const key = btn.getAttribute("data-ds-generate-send") || "brand";
        state.active = key;
        syncTabs();

        const output = generateFor(key);
        scrollSharedOutputIntoView();

        if (!output) {
          if (window.toast) window.toast("Nothing generated.", "error", 1800);
          return;
        }

        fillMainInputAndReveal(output, "Concept generated and loaded into chat.");
      });
    });

    $$("[data-ds-clear]", modal).forEach((btn) => {
      if (btn.dataset.boundClear === "true") return;
      btn.dataset.boundClear = "true";

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const key = btn.getAttribute("data-ds-clear") || "brand";
        clearPanel(key);
      });
    });
  }

  function buildModalDom() {
    if ($("designStudioModal")) return;

    const modal = document.createElement("div");
    modal.id = "designStudioModal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="ds-shell">
        <div class="ds-topbar">
          <div class="ds-topbar-left">
            <div class="ds-title">Design Studio</div>
            <div class="ds-subtitle">Concept building inside Simo without touching your core app systems.</div>
          </div>
          <div class="ds-topbar-actions">
            <button class="ds-btn" type="button" id="designStudioCloseBtn">Close</button>
          </div>
        </div>

        <div class="ds-main">
          <aside class="ds-sidebar">
            ${studioDefs.map((def) => `
              <button
                class="ds-tab${def.key === state.active ? " active" : ""}"
                type="button"
                data-ds-tab="${def.key}"
              >
                <div class="ds-tab-title">${escapeHtml(def.title)}</div>
                <div class="ds-tab-copy">${escapeHtml(def.copy)}</div>
              </button>
            `).join("")}
          </aside>

          <div class="ds-content">
            <div class="ds-chip-row">
              ${studioDefs.map((def) => `
                <button
                  class="ds-chip${def.key === state.active ? " active" : ""}"
                  type="button"
                  data-ds-chip="${def.key}"
                  aria-pressed="${def.key === state.active ? "true" : "false"}"
                >
                  ${escapeHtml(def.title)}
                </button>
              `).join("")}
            </div>

            ${sharedModeToggleHtml()}
            ${sharedOutputHtml()}
            ${studioDefs.map(panelHtml).join("")}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    bindPanelActionButtons(modal);

    const closeBtn = $("designStudioCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeStudio);

    modal.addEventListener("click", async (e) => {
      if (e.target === modal) {
        closeStudio();
        return;
      }

      const chipBtn = e.target.closest("[data-ds-chip]");
      if (chipBtn && modal.contains(chipBtn)) {
        e.preventDefault();
        e.stopPropagation();
        state.active = chipBtn.getAttribute("data-ds-chip") || "brand";
        syncTabs();
        return;
      }

      const tabBtn = e.target.closest("[data-ds-tab]");
      if (tabBtn && modal.contains(tabBtn)) {
        e.preventDefault();
        e.stopPropagation();
        state.active = tabBtn.getAttribute("data-ds-tab") || "brand";
        syncTabs();
        return;
      }

      const modeBtn = e.target.closest("[data-ds-mode]");
      if (modeBtn && modal.contains(modeBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const mode = modeBtn.getAttribute("data-ds-mode");
        if (mode === "text" || mode === "visual") {
          state.outputMode = mode;
          syncModeButtons();
          syncSharedOutput();
          if (window.toast) {
            window.toast(mode === "visual" ? "Visual Mode on." : "Text Mode on.", "success", 1400);
          }
        }
        return;
      }

      const presetBtn = e.target.closest("[data-ds-preset]");
      if (presetBtn && modal.contains(presetBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const key = presetBtn.getAttribute("data-ds-preset");
        const index = Number(presetBtn.getAttribute("data-ds-preset-index"));
        applyPreset(key, index);
        return;
      }

      const copyBtn = e.target.closest("[data-ds-copy-shared]");
      if (copyBtn && modal.contains(copyBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const key = state.active;
        const text = state.outputs[key] || "";
        if (!text) {
          if (window.toast) window.toast("Generate output first.", "error", 1800);
          return;
        }
        await copyText(text, "Design Studio output copied.");
        return;
      }

      const sendBtn = e.target.closest("[data-ds-send-shared]");
      if (sendBtn && modal.contains(sendBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const key = state.active;
        const text = state.outputs[key] || "";
        if (!text) {
          if (window.toast) window.toast("Generate output first.", "error", 1800);
          return;
        }
        fillMainInputAndReveal(text, "Output loaded into chat input.");
        return;
      }

      const builderBtn = e.target.closest("[data-ds-send-builder]");
      if (builderBtn && modal.contains(builderBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const key = state.active;
        const text = state.outputs[key] || "";
        if (!text) {
          if (window.toast) window.toast("Generate output first.", "error", 1800);
          return;
        }
        fillMainInputAndReveal(text, "Concept loaded into builder input.");
      }
    });
  }

  function syncModeButtons() {
    const modal = $("designStudioModal");
    if (!modal) return;

    $$("[data-ds-mode]", modal).forEach((btn) => {
      const isActive = btn.getAttribute("data-ds-mode") === state.outputMode;
      btn.classList.toggle("ds-btn-primary", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    const shell = document.querySelector(".ds-shell");
    if (shell) shell.setAttribute("data-ds-mode", state.outputMode);
  }

  function syncSharedOutput() {
    const out = $("ds_shared_output");
    if (!out) return;

    const text = state.outputs[state.active] || "";
    if (!text) {
      out.classList.add("ds-empty");
      out.textContent = "Nothing generated yet.";
      return;
    }

    out.classList.remove("ds-empty");
    out.textContent = text;
  }

  function syncTabs() {
    const modal = $("designStudioModal");
    if (!modal) return;

    $$("[data-ds-tab]", modal).forEach((btn) => {
      const isActive = btn.getAttribute("data-ds-tab") === state.active;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    $$("[data-ds-chip]", modal).forEach((btn) => {
      const isActive = btn.getAttribute("data-ds-chip") === state.active;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      btn.disabled = false;
    });

    $$("[data-ds-panel]", modal).forEach((panel) => {
      panel.classList.toggle("active", panel.getAttribute("data-ds-panel") === state.active);
    });

    syncModeButtons();
    syncSharedOutput();
  }

  function collectPanelData(key) {
    const def = getPanelDef(key);
    const out = {};
    if (!def) return out;

    def.fields.forEach(([fieldKey]) => {
      const el = $(`ds_${key}_${fieldKey}`);
      out[fieldKey] = el ? String(el.value || "").trim() : "";
    });

    return out;
  }

  function writeOutput(key, text) {
    state.outputs[key] = text;
    syncSharedOutput();
  }

  function generateFor(key) {
    const def = getPanelDef(key);
    if (!def) return "";

    const data = collectPanelData(key);
    const output = state.outputMode === "visual"
      ? def.buildVisual(data)
      : def.buildText(data);

    writeOutput(key, output);

    if (window.toast) {
      window.toast(
        `${def.title} ${state.outputMode === "visual" ? "visual" : "text"} output generated.`,
        "success",
        1600
      );
    }

    return output;
  }

  function clearPanel(key) {
    const def = getPanelDef(key);
    if (!def) return;

    def.fields.forEach(([fieldKey]) => {
      const el = $(`ds_${key}_${fieldKey}`);
      if (el) el.value = "";
    });

    state.outputs[key] = "";
    syncSharedOutput();
  }

  function applyPreset(key, index) {
    const def = getPanelDef(key);
    if (!def) return;

    const preset = (def.presets || [])[index];
    if (!preset || !preset.values) return;

    def.fields.forEach(([fieldKey]) => {
      setFieldValue(`ds_${key}_${fieldKey}`, preset.values[fieldKey] || "");
    });

    state.active = key;
    syncTabs();

    if (window.toast) {
      window.toast(`${def.title} example loaded.`, "success", 1600);
    }
  }

  function openStudio() {
    buildModalDom();
    const modal = $("designStudioModal");
    if (!modal) return;
    modal.setAttribute("aria-hidden", "false");
    modal.style.display = "block";
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    syncTabs();
  }

  function closeStudio() {
    const modal = $("designStudioModal");
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    modal.style.display = "";
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
  }

  function injectLaunchButton() {
    if ($("designStudioLaunchBtn")) return;

    const existingByText = Array.from(document.querySelectorAll("button")).find(
      (btn) => (btn.textContent || "").trim() === "Design Studio"
    );
    if (existingByText && existingByText.id !== "designStudioLaunchBtn") return;

    const anchor =
      $("settingsBtn") ||
      $("builderLibraryCard") ||
      $("openLibraryBtn") ||
      document.querySelector(".topbar-actions") ||
      document.body;

    const btn = document.createElement("button");
    btn.id = "designStudioLaunchBtn";
    btn.type = "button";
    btn.textContent = "Design Studio";
    btn.addEventListener("click", openStudio);

    if (anchor === document.body) {
      btn.style.position = "fixed";
      btn.style.right = "18px";
      btn.style.bottom = "18px";
      btn.style.zIndex = "99999";
      document.body.appendChild(btn);
    } else {
      anchor.insertAdjacentElement("afterend", btn);
    }
  }

  function boot() {
    injectLaunchButton();
    buildModalDom();
    syncTabs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

// ===============================
// Simo Design Studio → Chat Bridge
// PHASE 4.0 — Builder Payload Upgrade
// ===============================
function sendToChat(text, options = {}) {
  if (!text) return;

  const input = document.getElementById("chatInput");
  if (!input) return;

  let finalText = text;

  if (options.builder === true) {
    const panelKey = options.panelKey || "concept";
    finalText =
`[SIMO_BUILDER]
Create a polished builder-ready result based on the concept below.

DESIGN_STUDIO_TYPE: ${panelKey}

REQUIREMENTS:
- keep the tone premium and cohesive
- turn the concept into a real usable result
- organize clearly
- make it visually polished
- do not just repeat the notes back

SOURCE_CONCEPT:
${text}`;
  }

  const nativeSetter =
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ||
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

  if (nativeSetter) {
    nativeSetter.call(input, finalText);
  } else {
    input.value = finalText;
  }

  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  const enterOpts = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  };

  input.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
  input.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
  input.dispatchEvent(new KeyboardEvent("keyup", enterOpts));

  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) {
    sendBtn.focus();
    sendBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    sendBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    sendBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return;
  }

  const form = input.closest("form");
  if (form) {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
}

// ===============================
// Simo Design Studio → Chat Bridge
// PHASE 4.0 — Builder Payload Upgrade
// ===============================
document.addEventListener("click", function (e) {
  const btn = e.target.closest("[data-ds-generate-send]");
  if (!btn) return;

  const panel = btn.closest("[data-ds-panel]");
  if (!panel) return;

  const panelKey = panel.getAttribute("data-ds-panel") || "concept";
  const outputEl = panel.querySelector(".ds-output");
  const output = outputEl ? outputEl.innerText.trim() : "";

  if (!output) {
    if (window.toast) window.toast("Nothing generated yet.", "error");
    return;
  }

  sendToChat(output, { builder: true, panelKey });
});