/*
  SIMO CLEAN DESIGN WORKSPACE R10.44R2 / V1.3.4
  File: static/simo-live-workspace-isolated.js

  Purpose:
  - Prompt-first ChatGPT/Grok-style workspace behavior.
  - One current image source.
  - Apply edit -> returned image becomes the next current source.
  - Buttons are suggestion chips only; they all feed the same prompt editor.
  - Save saves the latest visible/current version.
*/
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  var PHASE = "SIMO Clean Design Workspace V1.3.17 — prompt rebuild + local save guard";
  var LIB_KEY = "simo_builder_library_v5_1_builder_first";
  var LAST_SAVED_KEY = "simo_workspace_last_saved_item_v4";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clean(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function titleCase(value) {
    return clean(value || "Workspace Design")
      .replace(/^edit only this exact saved product:\s*/i, "")
      .replace(/^saved workspace\s*[—-]\s*/i, "")
      .replace(/\s*[—-]\s*edited workspace version$/i, "")
      .trim()
      .replace(/\b\w/g, function (m) { return m.toUpperCase(); }) || "Workspace Design";
  }

  function uid(prefix) {
    return String(prefix || "simo") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function absUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw;
    if (raw.charAt(0) === "/") return window.location.origin + raw;
    return window.location.origin + "/" + raw.replace(/^\/+/, "");
  }

  function sourceFriendly(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    if (/^data:/i.test(raw)) return raw;
    if (/^blob:/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) {
      try {
        var u = new URL(raw);
        if (u.origin === window.location.origin) return u.pathname + u.search;
      } catch (e) {}
      return raw;
    }
    return raw;
  }

  function bestImage(data) {
    return clean(
      data.currentSourceImage ||
      data.sourceImage ||
      data.currentImage ||
      data.image ||
      data.imageUrl ||
      data.image_url ||
      data.generated_visual_url ||
      data.generatedImageUrl ||
      data.visualUrl ||
      data.thumbnail ||
      data.previewUrl ||
      data.originalImage ||
      data.originalImageUrl ||
      ""
    );
  }

  function subjectFrom(data) {
    data = data && typeof data === "object" ? data : {};

    // V1.3.16: the fresh/opening prompt wins over any stale workspace title.
    // This prevents "Soda Can Workspace" / old prompts from sticking when the image is now
    // a ceiling fan, rim, flashlight, dispenser, or any other new object.
    var freshText = clean([
      data.prompt,
      data.originalPrompt,
      data.latestPrompt,
      data.sourcePrompt,
      data.message,
      data.item,
      data.objectType,
      data.subject
    ].filter(Boolean).join(" ")).toLowerCase();

    var staleText = clean([
      data.workspaceSubject,
      data.projectTitle,
      data.title,
      data.name
    ].filter(Boolean).join(" ")).toLowerCase();

    function pick(text) {
      if (/ceiling fan|fan blade|fan blades|fan light|fan motor|overhead fan/.test(text)) return "ceiling fan";
      if (/toothbrush|tooth brush|electric toothbrush|manual toothbrush/.test(text)) return "toothbrush";
      if (/soap dispenser|dispenser/.test(text)) return "soap dispenser";
      if (/barbecue grill|bbq grill|gas grill|charcoal grill|pellet grill|smoker grill|outdoor grill|barbeque grill|barbecue|bbq|grill|smoker/.test(text)) return "barbecue grill";
      if (/fire extinguisher|extinguisher/.test(text)) return "fire extinguisher";
      if (/led flashlight|flashlight|torch/.test(text)) return "led flashlight";
      if (/(12\s*(oz|ounce)?\s*)?(soda can|beverage can|aluminum can|drink can|pop can)|(12\s*(oz|ounce)\s*can)/.test(text)) return "soda can";
      if (/water bottle|bottle|tumbler|flask/.test(text)) return "water bottle";
      if (/toaster/.test(text)) return "toaster";
      if (/tire\s+rim|wheel\s+rim|alloy\s+wheel|automotive\s+wheel|custom\s+wheel|\brims?\b|\bwheels?\b/.test(text)) return "tire rim";
      if (/guitar/.test(text)) return "guitar";
      if (/book cover|cover/.test(text)) return "book cover";
      if (/toolbox|tool box|tool chest|tool case|carpenter tool box|carpenter toolbox/.test(text)) return "toolbox";
      if (/backpack|back pack|rucksack|school bag|travel bag/.test(text)) return "backpack";
      if (/coffee mug|mug|tea mug|cup/.test(text)) return "coffee mug";
      if (/desk lamp|table lamp|task lamp|lamp/.test(text)) return "desk lamp";
      if (/step ladder|stepladder|ladder/.test(text)) return "step ladder";
      if (/office chair|desk chair|chair/.test(text)) return "office chair";
      if (/bookshelf|book shelf|shelf unit|shelving/.test(text)) return "bookshelf";
      if (/watch|wristwatch|smart watch|smartwatch/.test(text)) return "watch";
      return "";
    }

    function extractFreshSubject(text) {
      var t = clean(text || "").toLowerCase();
      if (!t) return "";
      t = t.replace(/^continue this same active visual\/design project\s*:\s*/i, "");
      t = t.replace(/^(please\s+)?(show me|show|make me|make|create me|create|build me|build|design me|design|generate me|generate|give me|render|visualize)\s+/i, "");
      t = t.replace(/^an?\s+|^the\s+/i, "");
      t = t.replace(/\b(that|which)?\s*i\s+can\s+(customize|design|edit|refine).*$/i, "");
      t = t.replace(/\bfor me to\s+(customize|design|edit|refine).*$/i, "");
      t = t.replace(/\bto\s+(customize|design|edit|refine).*$/i, "");
      t = t.replace(/\b(product concept|workspace|design concept|visual concept)\b/g, "");
      t = t.replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
      var words = t.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
      if (!words || words.length < 3) return "";
      // Do not return plain action/edit words as a subject.
      if (/^(make|add|remove|change|edit|put|place|keep|preserve|create|show)$/.test(words)) return "";
      if (/\b(make|add|remove|change|edit|put|place|keep|preserve)\b/.test(words) && words.split(/\s+/).length < 4) return "";
      return words;
    }

    var pickedFresh = pick(freshText);
    if (pickedFresh) return pickedFresh;

    var extractedFresh = extractFreshSubject(freshText);
    if (extractedFresh) return extractedFresh;

    return pick(staleText) || clean(data.workspaceSubject || data.projectTitle || data.title || "current design") || "current design";
  }

  function suggestionPrompts(subject) {
    var s = subject || "design";
    var matched = false;
    var base = [
      "make the finish brushed nickel and keep the same object shape",
      "add an elegant engraved logo that says Gojcaj without changing the material",
      "make it matte black with subtle blue accents",
      "make it look more premium and realistic while preserving the same design",
      "create three tasteful variations of this same design",
      "remove any unwanted logo or text and keep the design clean"
    ];
    if (/barbecue grill|bbq grill|gas grill|charcoal grill|pellet grill|smoker grill|outdoor grill|barbeque grill|barbecue|bbq|grill|smoker/i.test(s)) {
      matched = true;
      base = [
        "put an elegant etched logo Simon on the left front panel in gold and keep the grill unchanged",
        "make only the front panel brushed stainless steel and preserve the lid, shelves, wheels, and grates",
        "make the cooking grates heavier cast iron and keep everything else unchanged",
        "add premium chrome handles to the lid and firebox only",
        "make the side shelves look thicker and more premium",
        "create three premium barbecue grill variations from this same design"
      ];
    } else if (/toaster/i.test(s)) {
      matched = true;
      base = [
        "make the toaster finish brushed nickel and keep the same shape",
        "add an elegant engraved Gojcaj logo on the front without changing the toaster body",
        "make the bread slots wider and cleaner while preserving the finish",
        "refine only the controls so they look premium and easy to read",
        "make the toaster matte black with subtle chrome trim",
        "create three premium toaster variations from this same design"
      ];
    } else if (/bottle|tumbler|flask/i.test(s)) {
      matched = true;
      base = [
        "make the bottle finish brushed stainless steel and keep the same shape",
        "etch an elegant Gojcaj logo on the bottle without changing the material",
        "curve the engraving naturally with the bottle surface",
        "make the cap and hardware look more premium",
        "make it matte black with blue accent details",
        "create three premium bottle variations from this same design"
      ];
    } else if (/soap dispenser|dispenser/i.test(s)) {
      matched = true;
      base = [
        "make only the pump matte black and keep the bottle body unchanged",
        "make the nozzle brushed stainless steel and preserve the bottle body",
        "make the bottle body ceramic white and keep the pump unchanged",
        "add a small elegant label area on the front without changing the pump",
        "make the base heavier and more premium while preserving the pump and body",
        "create three premium soap dispenser variations from this same design"
      ];
    } else if (/led flashlight|flashlight|torch/i.test(s)) {
      matched = true;
      base = [
        "make only the flashlight body matte black and keep the lens, bezel, and tail cap unchanged",
        "make the bezel brushed aluminum and preserve the flashlight body and grip texture",
        "make the grip knurling deeper and more premium while keeping the same flashlight shape",
        "make only the tail cap more tactical and keep the rest of the flashlight unchanged",
        "add a subtle side clip and preserve the finish and overall shape",
        "create three premium led flashlight variations from this same design"
      ];
    } else if (/soda can|beverage can|aluminum can|drink can|pop can/i.test(s)) {
      matched = true;
      base = [
        "make only the can body matte black and keep the top rim and pull tab unchanged",
        "add a premium front label area for Simon and keep the aluminum can shape unchanged",
        "make the pull tab brushed gold and preserve the can body and rim",
        "make the can body brushed aluminum with subtle blue accents and no extra text",
        "make the top rim cleaner and more premium while preserving the can body",
        "create three premium soda can variations from this same design"
      ];
    } else if (/tire\s+rim|wheel\s+rim|alloy\s+wheel|automotive\s+wheel|custom\s+wheel|\brims?\b|\bwheels?\b/i.test(s)) {
      matched = true;
      base = [
        "make only the outer lip of the rim bright blue and keep the spokes, center cap, and barrel unchanged",
        "make the spokes black chrome and preserve the rim lip, center cap, and barrel",
        "make the center cap brushed aluminum and keep the spokes and outer rim unchanged",
        "add subtle blue accent lighting inside the rim barrel without adding text or logos",
        "make the rim finish darker gunmetal while preserving the same spoke shape",
        "create three premium tire rim variations from this same design"
      ];
    } else if (/ceiling fan|fan blade|fan blades|fan light|fan motor|overhead fan/i.test(s)) {
      matched = true;
      base = [
        "make only the fan blades darker walnut wood and keep the motor housing and light unchanged",
        "add pleasant carved patterns on every blade without changing the fan design",
        "make the motor housing brushed nickel and preserve the blades and light diffuser",
        "make the light diffuser frosted glass and keep the blades and mount unchanged",
        "make the ceiling mount more premium while preserving the same blade shape",
        "create three premium ceiling fan variations from this same design"
      ];
    } else if (/toothbrush|tooth brush|electric toothbrush|manual toothbrush/i.test(s)) {
      matched = true;
      base = [
        "make only the toothbrush handle matte black and keep the bristles and head unchanged",
        "make the bristles bright blue and preserve the handle and neck shape",
        "add a soft rubber grip texture on the handle without changing the toothbrush head",
        "make the toothbrush neck slimmer and more ergonomic while preserving the bristles",
        "add a subtle premium accent detail to the handle with no random text or logos",
        "create three premium toothbrush variations from this same design"
      ];
    } else if (/toolbox|tool box|tool chest|tool case/i.test(s)) {
      matched = true;
      base = [
        "make only the toolbox handle black rubber and keep the toolbox body unchanged",
        "make the latch hardware brushed steel and preserve the toolbox shell and handle",
        "make the main toolbox body matte black with red latch accents and no extra text",
        "make the corner guards more rugged while keeping the same toolbox shape",
        "clean up any unwanted text, logo, label, or watermark and keep the toolbox natural",
        "create three premium toolbox variations from this same design"
      ];
    } else if (/backpack|back pack|rucksack|school bag|travel bag/i.test(s)) {
      matched = true;
      base = [
        "make only the shoulder straps black padded leather and keep the backpack body unchanged",
        "make the front pocket zipper hardware brushed black metal and preserve the fabric body",
        "add a subtle premium accent detail to the front pocket without adding random text or logos",
        "make the fabric material look more realistic and durable while preserving the same backpack shape",
        "clean up any unwanted text, logo, label, or watermark and keep the backpack natural",
        "create three premium backpack variations from this same design"
      ];
    } else if (/coffee mug|tea mug|\bmug\b|\bcup\b/i.test(s)) {
      matched = true;
      base = [
        "make only the mug handle matte black and keep the mug body unchanged",
        "make the mug body matte ceramic white and preserve the handle shape",
        "add a subtle premium accent band near the rim without adding random text or logos",
        "make the ceramic material look more realistic and premium while preserving the same mug shape",
        "clean up any unwanted text, logo, label, or watermark and keep the coffee mug natural",
        "create three tasteful coffee mug variations from this same design"
      ];
    } else if (/desk lamp|table lamp|task lamp|\blamp\b/i.test(s)) {
      matched = true;
      base = [
        "make only the lamp shade matte black and keep the base and stem unchanged",
        "make the lamp base brushed metal and preserve the shade and stem",
        "add a subtle warm glow inside the shade without changing the lamp body",
        "make the adjustable arm more premium while keeping the same desk lamp shape",
        "clean up any unwanted text, logo, label, or watermark and keep the desk lamp natural",
        "create three premium desk lamp variations from this same design"
      ];
    } else if (/step ladder|stepladder|\bladder\b/i.test(s)) {
      matched = true;
      base = [
        "make the steps wider with black anti-slip grip pads and keep the wood frame unchanged",
        "make only the ladder feet black rubber and preserve the frame and steps",
        "make the side braces brushed black metal and keep the wood rails unchanged",
        "make the top platform more durable and premium while preserving the step ladder shape",
        "clean up any unwanted text, logo, label, or watermark and keep the step ladder natural",
        "create three practical step ladder variations from this same design"
      ];
    } else if (/office chair|desk chair|\bchair\b/i.test(s)) {
      matched = true;
      base = [
        "make only the chair seat black leather and keep the base and backrest unchanged",
        "make the armrests brushed metal and preserve the seat and backrest shape",
        "make the backrest more ergonomic while keeping the same office chair design",
        "make the caster base more premium and durable without changing the chair body",
        "clean up any unwanted text, logo, label, or watermark and keep the office chair natural",
        "create three premium office chair variations from this same design"
      ];
    } else if (/bookshelf|book shelf|shelf unit|shelving/i.test(s)) {
      matched = true;
      base = [
        "make only the shelf frame matte black and keep the shelves unchanged",
        "make the shelves walnut wood and preserve the frame shape",
        "add subtle premium edge trim without adding random text or logos",
        "make the material look more realistic and sturdy while preserving the same bookshelf shape",
        "clean up any unwanted text, logo, label, or watermark and keep the bookshelf natural",
        "create three tasteful bookshelf variations from this same design"
      ];
    } else if (/watch|wristwatch|smart watch|smartwatch/i.test(s)) {
      matched = true;
      base = [
        "make only the watch strap matte black leather and keep the watch face unchanged",
        "make the bezel brushed steel and preserve the dial and strap",
        "make the dial face cleaner and more premium without adding random text or logos",
        "add subtle blue accent details to the hands and markers while preserving the watch shape",
        "clean up any unwanted text, logo, label, or watermark and keep the watch natural",
        "create three premium watch variations from this same design"
      ];
    }
    if (!matched) {
      var label = clean(s || "this design");
      base = [
        "make only the main functional part of the " + label + " matte black and keep every other part unchanged",
        "make the primary visible surface of the " + label + " a premium brushed material and preserve the exact shape",
        "add one subtle premium accent detail to the " + label + " without adding random logos or text",
        "make the material of the " + label + " look more realistic and premium while preserving the same design",
        "clean up any unwanted text, logo, label, or watermark and keep the " + label + " natural",
        "create three tasteful variations of this same " + label
      ];
    }
    return base;
  }


  function extractWorkspaceSaveSummary(data) {
    var edits = Array.isArray(data && data.edits) ? data.edits : [];
    var text = edits.map(function (edit) {
      return clean((edit && edit.prompt) || edit || "");
    }).join(" ").toLowerCase();

    var parts = [];
    function add(label, re) {
      if (re.test(text) && parts.indexOf(label) < 0) parts.push(label);
    }

    add("matte black", /\bmatte\s+black\b|\bblack\s+matte\b/);
    add("blue accent", /\bblue\b.*\b(accent|line|trim|stripe|detail)\b|\b(accent|line|trim|stripe|detail)\b.*\bblue\b/);
    add("logo", /\b(logo|brand|branding|badge|gojcaj|name)\b/);
    add("engraving", /\b(engrave|engraved|etch|etched|etching)\b/);
    add("brushed steel", /\b(brushed|stainless|steel|nickel)\b/);
    add("chrome", /\bchrome\b/);
    add("premium", /\b(premium|luxury|polish|refine)\b/);
    add("wider slots", /\b(wider|wide|slot|slots|opening|openings)\b/);

    if (!parts.length && edits.length) {
      var last = clean((edits[edits.length - 1] && edits[edits.length - 1].prompt) || edits[edits.length - 1] || "");
      return titleCase(last.split(/\s+/).slice(0, 7).join(" "));
    }
    return titleCase(parts.slice(0, 5).join(" "));
  }


  function createUniversalIntentLayer() {
    function _clean(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }
    function _lc(value) {
      return _clean(value).toLowerCase();
    }
    function _uniq(list) {
      var seen = {};
      return (list || []).filter(function (x) {
        var k = _lc(x);
        if (!k || seen[k]) return false;
        seen[k] = true;
        return true;
      });
    }
    function subjectFromContext(ctx, prompt) {
      var text = _lc([ctx && ctx.workspaceSubject, ctx && ctx.projectTitle, ctx && ctx.title, prompt].filter(Boolean).join(" "));
      var rules = [
        ["book cover", /\b(book cover|cover art|front cover|novel cover|memoir cover|autobiography cover)\b/],
        ["website", /\b(website|landing page|web page|homepage|hero section|pricing section|navbar|footer)\b/],
        ["app screen", /\b(app screen|mobile app|dashboard|ui screen|bottom nav|tab bar|settings screen)\b/],
        ["barbecue grill", /\b(barbecue grill|bbq grill|gas grill|charcoal grill|pellet grill|smoker grill|outdoor grill|barbeque grill|barbecue|bbq|grill|smoker)\b/],
        ["water bottle", /\b(water bottle|bottle|tumbler|flask|thermos)\b/],
        ["toaster", /\b(toaster|toast)\b/],
        ["ceiling fan", /\b(ceiling fan|fan blade|fan blades|fan light|fan motor|overhead fan)\b/],
        ["tire rim", /\b(tire rim|wheel rim|alloy wheel|automotive wheel|custom wheel|rim|rims|wheel|wheels)\b/],
        ["guitar", /\b(guitar|electric guitar|acoustic guitar)\b/],
        ["soap dispenser", /\b(soap dispenser|dispenser)\b/],
        ["fire extinguisher", /\b(fire extinguisher|extinguisher)\b/],
        ["led flashlight", /\b(led flashlight|flashlight|torch)\b/],
        ["soda can", /\b(12\s*(oz|ounce)?\s*)?(soda can|beverage can|aluminum can|drink can|pop can)\b/],
        ["chair", /\b(chair|stool|seat)\b/],
        ["cabinet", /\b(cabinet|drawer|cupboard)\b/],
        ["logo", /\b(logo|brand mark)\b/]
      ];
      for (var i = 0; i < rules.length; i += 1) {
        if (rules[i][1].test(text)) return rules[i][0];
      }
      return _clean((ctx && (ctx.workspaceSubject || ctx.projectTitle || ctx.title)) || "current design");
    }
    function primaryClause(prompt) {
      var p = _lc(prompt);
      var splitters = [
        /\bbut\s+keep\b/i,
        /\bkeep\b/i,
        /\bpreserve\b/i,
        /\bwithout\s+changing\b/i,
        /\bdo\s+not\s+change\b/i,
        /\bunchanged\b/i,
        /\bwhile\s+preserving\b/i
      ];
      var best = p;
      for (var i = 0; i < splitters.length; i += 1) {
        var parts = best.split(splitters[i]);
        if (parts && parts[0]) best = parts[0];
      }
      return _clean(best || p);
    }
    function detectTarget(subject, prompt) {
      var p = _lc(primaryClause(prompt));
      var full = _lc(prompt);
      var subjectText = _lc(subject);
      var isExtinguisher = /\b(fire extinguisher|extinguisher)\b/.test(subjectText + " " + full);
      var isGrill = /\b(barbecue grill|bbq grill|gas grill|charcoal grill|pellet grill|smoker grill|outdoor grill|barbeque grill|barbecue|bbq|grill|smoker)\b/.test(subjectText + " " + full);
      if (isGrill) {
        if (/\b(logo|name|simon|gojcaj|brand|badge|engrave|engraved|etched|etch|text|label)\b/.test(p)) return "grill logo/front panel";
        if (/\b(front panel|left front panel|door|cabinet front)\b/.test(p)) return "grill front panel";
        if (/\b(grate|grates|rack|racks|cooking surface)\b/.test(p)) return "grill cooking grates";
        if (/\b(burner|burners|firebox|charcoal tray|heat shield)\b/.test(p)) return "grill burners/firebox";
        if (/\b(side shelf|side shelves|shelf|table)\b/.test(p)) return "grill side shelves";
        if (/\b(handle|handles|hardware)\b/.test(p)) return "grill handles/hardware";
        if (/\b(wheel|wheels|cart|base|legs|stand)\b/.test(p)) return "grill cart/base";
        if (/\b(lid|hood|thermometer|gauge|vent|chimney)\b/.test(p)) return "grill lid/hood details";
      }
      var isFlashlight = /\b(led flashlight|flashlight|torch)\b/.test(subjectText + " " + full);
      if (isFlashlight) {
        if (/\b(bezel|head|lens|reflector)\b/.test(p)) return "flashlight head/lens";
        if (/\b(body|barrel|tube)\b/.test(p)) return "flashlight body";
        if (/\b(grip|knurl|knurling|texture)\b/.test(p)) return "flashlight grip texture";
        if (/\b(tail cap|tailcap|rear cap|end cap)\b/.test(p)) return "flashlight tail cap";
        if (/\b(clip|pocket clip)\b/.test(p)) return "flashlight clip";
      }
      var isSodaCan = /\b(12\s*(oz|ounce)?\s*)?(soda can|beverage can|aluminum can|drink can|pop can)\b/.test(subjectText + " " + full);
      var isRimUniversal = /\b(tire rim|wheel rim|alloy wheel|automotive wheel|custom wheel|rim|rims|wheel|wheels)\b/.test(subjectText + " " + full);
      if (isRimUniversal) {
        if (/\b(outer lip|rim lip|edge|outer edge|rim edge|lip|ring|barrel edge)\b/.test(p)) return "rim outer lip/edge";
        if (/\b(spoke|spokes)\b/.test(p)) return "rim spokes";
        if (/\b(center cap|center|hub|cap)\b/.test(p)) return "rim center cap";
        if (/\b(barrel|inner barrel|inside)\b/.test(p)) return "rim barrel";
        if (/\b(finish|chrome|black|gunmetal|brushed|paint|color|blue|accent|led)\b/.test(p)) return "rim finish/color";
      }
      if (isSodaCan) {
        if (/\b(label|logo|name|simon|brand|badge|graphics|artwork|text)\b/.test(p)) return "soda can label/graphics";
        if (/\b(body|can body|wrap|surface|shell)\b/.test(p)) return "soda can body";
        if (/\b(pull tab|tab|top|lid|opening)\b/.test(p)) return "soda can top/pull tab";
        if (/\b(rim|edge|lip)\b/.test(p)) return "soda can rim";
      }
      if (/\b(logo|name|gojcaj|brand|badge|engrave|etched|text)\b/.test(p)) return "branding/logo/text";
      if (isExtinguisher) {
        if (/\b(nozzle|horn|tip|spout)\b/.test(p)) return "extinguisher nozzle";
        if (/\b(hose)\b/.test(p)) return "extinguisher hose";
        if (/\b(handle|lever|grip)\b/.test(p)) return "extinguisher handle";
        if (/\b(pin|safety pin)\b/.test(p)) return "extinguisher pin";
        if (/\b(body|cylinder|tank|canister)\b/.test(p)) return "extinguisher body";
      }
      if (/\b(finish|material|color|paint|texture|brushed|nickel|steel|chrome|matte|gloss|wood|leather|fabric)\b/.test(p)) return "material/finish/color";
      if (/\b(layout|composition|spacing|align|placement|move|center|position)\b/.test(p)) return "layout/placement";
      if (/\b(button|buttons|control|controls|dial|knob|switch|slider|lever|handle|cap|lid|feet|base|hose|nozzle|pin)\b/.test(p)) return "functional detail/control";
      if (/\b(slot|slots|opening|openings)\b/.test(p)) return "opening/slot";
      if (/\b(title|subtitle|author|headline|copy|text)\b/.test(p)) return "text/title area";
      if (/\b(hero|pricing|navbar|footer|section|card|cards|cta)\b/.test(p)) return "website section";
      if (/\b(nav|tab|screen|card|modal|form|input)\b/.test(p)) return "app UI element";
      if (/\b(shape|body|silhouette|proportion|size|width|height)\b/.test(p)) return "shape/proportion";
      if (/\b(variation|variations|versions|options)\b/.test(full)) return "variations";
      if (/toaster/.test(subjectText) && /\bmarking|number|numbers|tick\b/.test(full)) return "functional detail/control";
      return "general design";
    }
    function detectAction(prompt) {
      var p = _lc(prompt);
      var actions = [];
      [
        ["add", /\b(add|place|put|include|insert)\b/],
        ["remove", /\b(remove|delete|erase|get rid of)\b/],
        ["replace", /\b(replace|swap)\b/],
        ["refine", /\b(refine|polish|improve|clean up|make cleaner|premium)\b/],
        ["move", /\b(move|center|align|position)\b/],
        ["resize", /\b(wider|narrower|larger|smaller|shorter|taller|resize)\b/],
        ["recolor", /\b(color|paint|matte|black|blue|gold|copper|chrome|nickel)\b/],
        ["generate variations", /\b(variation|variations|versions|options)\b/]
      ].forEach(function (r) {
        if (r[1].test(p)) actions.push(r[0]);
      });
      return actions.length ? _uniq(actions).join(" + ") : "edit";
    }
    function detectPreserve(prompt, subject) {
      var p = _lc(prompt);
      var preserve = [];
      if (/\bkeep|preserve|unchanged|without changing|do not change|same\b/.test(p)) {
        preserve.push("preserve the current " + subject);
      }
      [
        ["shape/body", /\b(shape|body|form|silhouette|proportion)\b/],
        ["finish/material/color", /\b(finish|material|color|paint|texture|brushed|nickel|steel|chrome|matte|trim)\b/],
        ["logo/text", /\b(logo|name|gojcaj|text|title|author)\b/],
        ["controls/details", /\b(dial|knob|control|buttons|lever|handle|cap|lid|slots|feet|hose|nozzle|pin)\b/],
        ["layout/composition", /\b(layout|composition|camera|angle|background|lighting|spacing)\b/],
        ["header/footer/other sections", /\b(header|footer|navbar|hero|pricing|section)\b/]
      ].forEach(function (r) {
        if (r[1].test(p)) preserve.push("preserve " + r[0] + " unless it is the requested target");
      });
      preserve.push("preserve all previous successful edits unless the user explicitly changes them");
      return _uniq(preserve);
    }
    function detectMode(subject, target, prompt) {
      var s = _lc(subject);
      var p = _lc(prompt);
      if (/\b(website|landing page|hero|pricing|navbar|footer|html|css)\b/.test(s + " " + p)) return "builder_edit";
      if (/\b(app screen|dashboard|ui|ux|mobile app)\b/.test(s + " " + p)) return "visual_ui_edit";
      if (/\b(title|author|exact text|spell|number|numbers)\b/.test(p) && /\b(tiny|small|dial|label|logo|title|author|text)\b/.test(p)) return "precision_detail";
      if (/\b(variation|variations|versions|options)\b/.test(p)) return "variation_generation";
      return "image_edit";
    }
    function ambiguity(prompt, subject, target) {
      var p = _lc(prompt);
      var vague = /\b(make it better|fix it|improve it|make it nice|make it pop|do your thing)\b/.test(p);
      var broad = target === "general design" && p.split(" ").length < 7;
      return {
        needsClarification: !!(vague || broad),
        reason: vague ? "prompt is broad/vague" : (broad ? "target feature is unclear" : ""),
        suggestion: "Tell me the exact part to change, such as finish, logo, layout, controls, shape, or text."
      };
    }
    function buildInstruction(intent) {
      var lines = [
        "UNIVERSAL INTENT LAYER:",
        "Subject: " + intent.subject,
        "Target: " + intent.target,
        "Action: " + intent.action,
        "Mode: " + intent.mode,
        "User request: " + intent.userPrompt,
        "",
        "Edit only the target unless the user explicitly asks for a broader redesign.",
        "Preserve the subject identity and all unrelated details.",
        "Preserve constraints:"
      ];
      intent.preserve.forEach(function (x) { lines.push("- " + x); });
      if (intent.needsClarification) {
        lines.push("If this is too ambiguous to edit safely, make the smallest useful change and preserve everything else.");
      }
      lines.push("Return/show the closest true visual result, then allow continued editing from that result.");
      return lines.join("\n");
    }
    function analyze(prompt, ctx) {
      var subject = subjectFromContext(ctx || {}, prompt);
      var target = detectTarget(subject, prompt);
      var action = detectAction(prompt);
      var preserve = detectPreserve(prompt, subject);
      var mode = detectMode(subject, target, prompt);
      var amb = ambiguity(prompt, subject, target);
      var intent = {
        subject: subject,
        target: target,
        action: action,
        preserve: preserve,
        mode: mode,
        confidence: amb.needsClarification ? 0.58 : 0.86,
        needsClarification: amb.needsClarification,
        ambiguityReason: amb.reason,
        suggestion: amb.suggestion,
        userPrompt: _clean(prompt)
      };
      intent.instruction = buildInstruction(intent);
      return intent;
    }
    return { analyze: analyze, version: "universal-intent-layer-v1" };
  }

  var SimoUniversalIntentLayer = window.SimoUniversalIntentLayer || createUniversalIntentLayer();
  window.SimoUniversalIntentLayer = SimoUniversalIntentLayer;

  function htmlForLibraryItem(item) {
    var img = item.imageUrl || item.generated_visual_url || item.thumbnail || "";
    var title = item.title || "Saved Workspace Design";
    var subject = item.workspaceSubject || item.projectTitle || title;
    var data = item.workspaceData || {
      title: title,
      projectTitle: title,
      workspaceSubject: subject,
      image: img,
      currentImage: img,
      currentSourceImage: item.sourceImageUrl || img,
      sourceImage: item.sourceImageUrl || img,
      originalImage: item.originalImageUrl || img,
      edits: []
    };
    var encoded = esc(JSON.stringify(data));
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + esc(title) + '</title>' +
      '<style>body{margin:0;background:#07101f;color:#eef4ff;font-family:Inter,Arial,sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:28px}.card{border:1px solid rgba(255,255,255,.14);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.035));box-shadow:0 18px 60px rgba(0,0,0,.35);overflow:hidden}.head{padding:20px 22px;border-bottom:1px solid rgba(255,255,255,.12)}.eyebrow{font-size:12px;color:#8ee6ff;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{margin:8px 0 0;font-size:clamp(28px,4vw,46px);line-height:1.05}.muted{color:#c8d5eb;line-height:1.5}.image{background:#050a13;padding:18px;display:flex;justify-content:center}img{display:block;max-width:100%;max-height:720px;object-fit:contain;border-radius:18px}.body{padding:18px 22px;display:grid;gap:12px}.btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(101,228,255,.35);background:rgba(101,228,255,.12);color:#eefcff;padding:11px 14px;border-radius:999px;font-weight:950;text-decoration:none;cursor:pointer}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);border-radius:999px;padding:8px 11px;font-size:12px;font-weight:850;color:#eaf1ff}</style></head><body><main class="wrap"><section class="card"><div class="head"><div class="eyebrow">Simo saved workspace design</div><h1>' + esc(title) + '</h1><p class="muted">Saved from the clean prompt-first Simo Design Workspace. Reopen it to keep editing the latest version.</p></div><div class="image"><img src="' + esc(absUrl(img)) + '" alt="' + esc(title) + '"></div><div class="body"><button class="btn" type="button" data-simo-workspace-open="' + encoded + '">Open Workspace in New Tab</button><div class="chips"><span class="chip">Prompt-first editing</span><span class="chip">Saved version</span><span class="chip">Continue editing</span></div></div></section></main><script>document.addEventListener("click",function(e){var b=e.target.closest("[data-simo-workspace-open]");if(!b)return;try{var d=JSON.parse(b.getAttribute("data-simo-workspace-open")||"{}");if(window.opener&&window.opener.SimoLiveWorkspace&&window.opener.SimoLiveWorkspace.open){window.opener.SimoLiveWorkspace.open(d);}else{alert("Return to the Simo main tab and open the workspace from Library.");}}catch(err){alert("Workspace data could not be opened.");}});<\/script></body></html>';
  }

  function makeLibraryItem(data) {
    var now = new Date().toISOString();
    var img = sourceFriendly(data.currentSourceImage || data.sourceImage || data.currentImage || data.image || data.originalImage || "");
    var original = sourceFriendly(data.originalImage || data.originalImageUrl || img);
    var titleBase = titleCase(data.workspaceSubject || data.projectTitle || data.title || "Workspace Design");
    if (!/workspace/i.test(titleBase)) titleBase += " Workspace";
    var saveSummary = extractWorkspaceSaveSummary(data);
    var visibleTitle = saveSummary ? (titleBase + " — " + saveSummary) : titleBase;
    var lastEdit = data.edits && data.edits.length ? data.edits[data.edits.length - 1].prompt || data.edits[data.edits.length - 1] : "Saved current version";

    var item = {
      id: uid("workspace_saved"),
      simoWorkspaceSaveUid: uid("workspace_save_once"),
      simoWorkspaceSaveSignature: [titleBase, saveSummary, img].join("|"),
      title: visibleTitle,
      name: visibleTitle,
      projectTitle: visibleTitle,
      type: "visual",
      kind: "visual",
      source: "simo_clean_design_workspace_v1",
      category: "product",
      domain: "product",
      tags: ["visual", "design", "workspace", "prompt-first"],
      notes: "Saved from Simo Clean Design Workspace V1. Last edit: " + clean(lastEdit),
      imageUrl: img,
      image_url: img,
      generated_visual_url: img,
      generatedImageUrl: img,
      previewUrl: img,
      thumbnail: img,
      visualUrl: img,
      displayImageUrl: img,
      sourceImageUrl: sourceFriendly(data.currentSourceImage || data.sourceImage || img),
      originalImageUrl: original,
      workspaceOpen: true,
      workspaceSubject: data.workspaceSubject || data.projectTitle || data.title || "Workspace Design",
      workspaceData: {
        title: visibleTitle,
        projectTitle: visibleTitle,
        workspaceSubject: data.workspaceSubject || data.projectTitle || data.title || "Workspace Design",
        image: img,
        currentImage: img,
        currentSourceImage: sourceFriendly(data.currentSourceImage || data.sourceImage || img),
        sourceImage: sourceFriendly(data.currentSourceImage || data.sourceImage || img),
        originalImage: original,
        edits: data.edits || []
      },
      simoWorkspaceVersion: "CleanDesignWorkspaceV1",
      createdAt: now,
      updatedAt: now,
      html: "",
      sourceText: ""
    };
    item.html = htmlForLibraryItem(item);
    item.sourceText = "[SIMO_CLEAN_WORKSPACE_SAVED]\n" + JSON.stringify({
      title: item.title,
      imageUrl: item.imageUrl,
      workspaceSubject: item.workspaceSubject,
      source: item.source,
      createdAt: item.createdAt
    }, null, 2);
    return item;
  }

  function normalizeOpenPayload(raw) {
    var data = raw && typeof raw === "object" ? Object.assign({}, raw) : {};
    if (data.workspaceData && typeof data.workspaceData === "object") {
      data = Object.assign({}, data, data.workspaceData);
    }
    var img = bestImage(data);
    var original = clean(data.originalImage || data.originalImageUrl || data.original || img);
    var subject = subjectFrom(data);
    var title = titleCase(data.title || data.projectTitle || data.name || data.workspaceSubject || subject || "Workspace Design");

    // V1.3.11: if the title came from a stale prior project, refresh it to the new subject.
    var titleLow = title.toLowerCase();
    var subjectLow = String(subject || "").toLowerCase();
    if (subjectLow && /barbecue grill|soap dispenser|fire extinguisher|led flashlight|ceiling fan|toothbrush|soda can|water bottle|toaster|tire rim|guitar|book cover/.test(titleLow + " " + subjectLow)) {
      if (titleLow.indexOf(subjectLow) < 0 || /\bi can\b|product concept|workspace design/.test(titleLow)) {
        title = titleCase(subject + " Workspace");
      }
    }

    return {
      title: title,
      projectTitle: title,
      workspaceSubject: subject,
      image: absUrl(img),
      currentImage: absUrl(data.currentImage || data.image || img),
      currentSourceImage: sourceFriendly(data.currentSourceImage || data.sourceImage || img),
      sourceImage: sourceFriendly(data.currentSourceImage || data.sourceImage || img),
      originalImage: absUrl(original || img),
      originalSourceImage: sourceFriendly(data.originalSourceImage || data.originalImageUrl || original || img),
      edits: Array.isArray(data.edits) ? data.edits.slice() : [],
      apiOrigin: window.location.origin,
      phase: PHASE
    };
  }

  function openWorkspace(raw) {
    var data = normalizeOpenPayload(raw || {});
    if (!data.currentImage && !data.currentSourceImage) {
      alert("Simo could not find an image for this workspace. Reopen the design from Library or create a fresh design first.");
      return false;
    }

    var prompts = suggestionPrompts(data.workspaceSubject);
    var dataJson = JSON.stringify(data).replace(/</g, "\\u003c");
    var promptsJson = JSON.stringify(prompts).replace(/</g, "\\u003c");

    var workspaceRuntime = function () {
      "use strict";

      var DATA = window.__SIMO_WORKSPACE_BOOTSTRAP__ || {};
      var PROMPTS = window.__SIMO_WORKSPACE_PROMPTS__ || [];
      var busy = false;
      var applySeq = 0;
      var zoom = 1;
      var abortTimer = null;

      function $(id) { return document.getElementById(id); }
      function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
      function esc(v) {
        return String(v == null ? "" : v)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }
      function apiUrl(path) {
        var origin = DATA.apiOrigin || (window.opener && window.opener.location ? window.opener.location.origin : "");
        if (!origin) return path;
        return origin.replace(/\/$/, "") + path;
      }
      function absUrl(value) {
        var raw = String(value || "").trim();
        if (!raw) return "";
        if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw;
        if (raw.charAt(0) === "/") return apiUrl(raw);
        return apiUrl("/" + raw.replace(/^\/+/, ""));
      }
      function sourceFriendly(value) {
        var raw = String(value || "").trim();
        if (!raw) return "";
        if (/^https?:\/\//i.test(raw)) {
          try {
            var origin = DATA.apiOrigin || (window.opener && window.opener.location ? window.opener.location.origin : "");
            var u = new URL(raw);
            if (origin && u.origin === origin) return u.pathname + u.search;
          } catch (e) {}
        }
        return raw;
      }
      function setStatus(message, tone) {
        var el = $("status");
        if (!el) return;
        el.className = "status" + (tone ? " " + tone : "");
        el.textContent = message;
      }
      function setProof(key, value, tone) {
        var el = document.querySelector('[data-proof="' + key + '"]');
        if (!el) return;
        el.textContent = value;
        el.className = "proofValue" + (tone ? " " + tone : "");
      }
      function ensureZoomOnTop() {
        var stage = document.querySelector(".stage");
        var zoomBar = document.querySelector(".zoom");
        var img = $("workspaceImage");
        if (stage) {
          stage.style.position = "relative";
          stage.style.isolation = "isolate";
          stage.style.overflow = "hidden";
        }
        if (img) {
          img.style.position = "relative";
          img.style.zIndex = "1";
          img.style.display = "block";
          img.style.pointerEvents = "auto";
        }
        if (zoomBar) {
          zoomBar.style.position = "fixed";
          zoomBar.style.left = "28px";
          zoomBar.style.top = "28px";
          zoomBar.style.zIndex = "2147483647";
          zoomBar.style.pointerEvents = "auto";
          zoomBar.style.transform = "translateZ(0)";
          zoomBar.style.willChange = "transform";
        }
      }
      function reinforceZoomLayer() {
        ensureZoomOnTop();
        try { requestAnimationFrame(ensureZoomOnTop); } catch (e) {}
        setTimeout(ensureZoomOnTop, 40);
        setTimeout(ensureZoomOnTop, 160);
        setTimeout(ensureZoomOnTop, 420);
      }
      function bindZoomLayerObserver() {
        if (document.__simoZoomLayerObserverBound) return;
        document.__simoZoomLayerObserverBound = true;
        if (typeof MutationObserver === "undefined") return;
        try {
          var obs = new MutationObserver(function () { reinforceZoomLayer(); });
          obs.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["src", "style", "class"]
          });
          document.__simoZoomLayerObserver = obs;
        } catch (e) {}
      }
      function updateProof() {
        setProof("phase", DATA.phase || "Clean Workspace V1", "ok");
        setProof("apply", String(applySeq), applySeq > 0 ? "ok" : "");
        setProof("edits", String((DATA.edits || []).length), (DATA.edits || []).length ? "ok" : "");
        setProof("source", String(DATA.currentSourceImage || DATA.sourceImage || DATA.currentImage || "").slice(0, 92) || "missing", DATA.currentSourceImage ? "ok" : "warn");
        setProof("busy", busy ? "yes" : "no", busy ? "warn" : "ok");
      }

      function dedupeOpenerLibraryById(reason) {
        try {
          var storage = window.opener && window.opener.localStorage ? window.opener.localStorage : window.localStorage;
          var raw = storage.getItem("simo_builder_library_v5_1_builder_first") || "[]";
          var list = [];
          try { list = JSON.parse(raw); } catch (e) { list = []; }
          if (!Array.isArray(list)) return { changed: false, before: 0, after: 0 };
          var seen = {};
          var next = [];
          for (var i = 0; i < list.length; i += 1) {
            var item = list[i];
            if (!item) continue;
            var id = String(item.id || "").trim();
            var sig = String(item.simoWorkspaceSaveSignature || "").trim();
            var saveUid = String(item.simoWorkspaceSaveUid || "").trim();
            var key = saveUid ? ("uid:" + saveUid) : (id ? ("id:" + id) : (sig ? ("sig:" + sig) : ""));
            if (key && seen[key]) continue;
            if (key) seen[key] = true;
            next.push(item);
          }
          if (next.length !== list.length) {
            storage.setItem("simo_builder_library_v5_1_builder_first", JSON.stringify(next));
            try { console.warn("SIMO workspace save deduped duplicate library ids after " + (reason || "save") + ":", list.length, "->", next.length); } catch (e2) {}
            return { changed: true, before: list.length, after: next.length };
          }
          return { changed: false, before: list.length, after: next.length };
        } catch (err) {
          try { console.warn("SIMO workspace dedupe skipped:", err); } catch (e3) {}
          return { changed: false, before: 0, after: 0 };
        }
      }
      function setImage(display, source, note) {
        var img = $("workspaceImage");
        var nextDisplay = display || source || DATA.currentImage || DATA.image || "";
        var nextSource = source || display || DATA.currentSourceImage || DATA.sourceImage || "";
        DATA.currentImage = nextDisplay;
        DATA.image = nextDisplay;
        DATA.currentSourceImage = sourceFriendly(nextSource);
        DATA.sourceImage = sourceFriendly(nextSource);
        if (img && nextDisplay) img.src = absUrl(nextDisplay);
        reinforceZoomLayer();
        if (note) DATA.lastNote = note;
        updateHistory();
        updateProof();
      }
      function updateHistory() {
        var box = $("history");
        if (!box) return;
        var edits = DATA.edits || [];
        if (!edits.length) {
          box.innerHTML = '<div class="empty">No edits yet. Type a request or click a suggestion, then Apply.</div>';
          return;
        }
        box.innerHTML = edits.slice().reverse().map(function (edit, idx) {
          var n = edits.length - idx;
          return '<div class="hist"><b>Edit #' + n + '</b><span>' + esc(edit.prompt || edit) + '</span></div>';
        }).join("");
      }
      function setZoom(next) {
        zoom = Math.max(0.4, Math.min(2.8, next));
        var img = $("workspaceImage");
        if (img) img.style.transform = "scale(" + zoom + ")";
        var z = $("zText");
        if (z) z.textContent = Math.round(zoom * 100) + "%";
        reinforceZoomLayer();
      }
      function fillPrompt(prompt) {
        var box = $("prompt");
        if (!box) return;
        box.value = prompt;
        box.focus();
        setStatus("Prompt loaded. Click Apply when ready.", "ok");
      }

      function lc(value) {
        return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
      }
      function primaryIntentText(prompt) {
        var p = lc(prompt);
        // Split away preservation clauses so words like "keep the slot width" do not become the target.
        var splitters = [
          /\bbut\s+keep\b/i,
          /\bkeep\b/i,
          /\bpreserve\b/i,
          /\bwithout\s+changing\b/i,
          /\bdo\s+not\s+change\b/i,
          /\bunchanged\b/i,
          /\baway\s+from\b/i,
          /\bwhile\s+preserving\b/i
        ];
        var best = p;
        for (var i = 0; i < splitters.length; i += 1) {
          var parts = best.split(splitters[i]);
          if (parts && parts[0]) best = parts[0];
        }
        return lc(best || p);
      }
      function mentionedOnlyTarget(prompt) {
        var p = lc(prompt);
        if (/\bonly\s+(the\s+)?(dial|knob|control|controls|numbers?|markings?)\b/.test(p)) return "toaster_controls";
        if (/\bonly\s+(the\s+)?(bread\s+)?slots?\b/.test(p)) return "toaster_slots";
        if (/\bonly\s+(the\s+)?(logo|name|gojcaj|engraving|text)\b/.test(p)) return "logo";
        if (/\bonly\s+(the\s+)?(lever|handle|slider)\b/.test(p)) return "toaster_lever";
        if (/\bonly\s+(the\s+)?(feet|base|bottom)\b/.test(p)) return "toaster_feet";
        if (/\bonly\s+(the\s+)?(nozzle|horn|tip|spout)\b/.test(p)) return "extinguisher_nozzle";
        if (/\bonly\s+(the\s+)?hose\b/.test(p)) return "extinguisher_hose";
        if (/\bonly\s+(the\s+)?(handle|lever|grip)\b/.test(p)) return "extinguisher_handle";
        if (/\bonly\s+(the\s+)?(pin|safety\s+pin)\b/.test(p)) return "extinguisher_pin";
        if (/\bonly\s+(the\s+)?(body|cylinder|tank|canister)\b/.test(p)) return "extinguisher_body";
        return "";
      }
      function wantsExactDialNumbers(prompt) {
        var p = lc(prompt);
        return /\b(numbers?|1\s*(,|through|to|-)\s*6|one\s+(through|to)\s+six|sequence|proper order|clockwise)\b/.test(p) &&
          /\b(dial|knob|control|controls|markings?)\b/.test(p);
      }
      function wantsTickMarks(prompt) {
        var p = lc(prompt);
        return /\b(tick marks?|minimal ticks?|hash marks?|no numbers?|no text)\b/.test(p) &&
          /\b(dial|knob|control|controls|markings?)\b/.test(p);
      }
      function forceExactDialNumbers(prompt) {
        var p = lc(prompt);
        return /\b(force exact numbers|must use numbers|do not use tick marks|numbers only|use numbers no ticks)\b/.test(p);
      }
      function shouldUsePrecisionFallback(prompt) {
        return wantsExactDialNumbers(prompt) && !forceExactDialNumbers(prompt);
      }
      function locationHint(prompt) {
        var p = lc(prompt);
        if (/\bleft front panel|front left panel|left front door|left front body panel\b/.test(p)) return "left front panel";
        if (/\bleft side panel|large left side|large side panel|side panel|left body panel\b/.test(p)) return "large left side panel";
        if (/\baway from (the )?(dial|controls|knob)\b/.test(p)) return "away from dial and controls";
        if (/\bfront panel|front door|front body panel\b/.test(p)) return "front panel";
        if (/\bfront\b/.test(p)) return "front visible body";
        return "";
      }
      function explicitLocalizedPart(prompt) {
        var p = lc(prompt || "");
        var partPatterns = [
          ["nozzle", /\b(nozzle|horn|tip|spout)\b/],
          ["hose", /\bhose\b/],
          ["handle", /\b(handle|grip|lever)\b/],
          ["pin", /\b(pin|safety pin)\b/],
          ["body", /\b(body|cylinder|tank|canister)\b/],
          ["dial", /\b(dial|knob|controls?)\b/],
          ["slot", /\b(slot|slots|opening|openings)\b/],
          ["feet/base", /\b(feet|base|bottom)\b/],
          ["cap/lid", /\b(cap|lid|top)\b/],
          ["strap/handle", /\b(strap|handle)\b/],
          ["spokes", /\b(spoke|spokes)\b/],
          ["center cap", /\b(center cap|center|hub)\b/],
          ["front panel", /\b(front panel|left front panel|front door|cabinet front)\b/],
          ["grates", /\b(grate|grates|rack|racks|cooking surface)\b/],
          ["side shelf", /\b(side shelf|side shelves|shelf|table)\b/],
          ["logo/text", /\b(logo|text|engraving|label|name|badge|simon)\b/]
        ];
        var hasLocalizedIntent = /\b(only|just)\b/.test(p) || /\bkeep everything else the same\b/.test(p) || /\beverything else\b/.test(p) || /\bwithout changing\b/.test(p) || /\bunchanged\b/.test(p);
        if (!hasLocalizedIntent) return "";
        for (var i = 0; i < partPatterns.length; i += 1) {
          if (partPatterns[i][1].test(p)) return partPatterns[i][0];
        }
        return "";
      }
      function detectRequestedAction(prompt) {
        var p = lc(primaryClause(prompt || ""));
        if (/\b(add|include|insert|attach|put on|place|create|give it|with a new)\b/.test(p)) return "add";
        if (/\b(remove|delete|erase|take off|without|strip off|get rid of)\b/.test(p)) return "remove";
        if (/\b(replace|swap|switch out)\b/.test(p)) return "replace";
        if (/\b(move|center|shift|reposition|place it on|align)\b/.test(p)) return "reposition";
        return "edit";
      }

      function genericPartTarget(prompt) {
        var p = primaryIntentText(prompt || "");
        if (/\b(handle|grip|strap|loop)\b/.test(p)) return "generic_handle";
        if (/\b(cap|lid|top|cover)\b/.test(p)) return "generic_cap";
        if (/\b(body|shell|housing|cylinder|tank|canister|main body)\b/.test(p)) return "generic_body";
        if (/\b(base|bottom|feet|foot|stand)\b/.test(p)) return "generic_base";
        if (/\b(button|buttons|dial|knob|control|controls|switch|switches|lever|trigger)\b/.test(p)) return "generic_control";
        if (/\b(slot|slots|opening|openings|spout|mouth|port|vent|vents)\b/.test(p)) return "generic_opening";
        if (/\b(front panel|left front panel|front door|cabinet front|panel)\b/.test(p)) return "generic_body";
        if (/\b(grate|grates|rack|racks|cooking surface)\b/.test(p)) return "generic_opening";
        if (/\b(side shelf|side shelves|shelf|table)\b/.test(p)) return "generic_trim";
        if (/\b(label|badge|plate|sticker|decal|logo|text|engraving|name|simon)\b/.test(p)) return "logo";
        if (/\b(trim|edge|ring|border|accent band|accent)\b/.test(p)) return "generic_trim";
        return "";
      }

      function buildActionGuidance(action, target, rawPrompt) {
        var lines = [];
        if (action === "add") {
          lines.push("ACTION LOCK: This is an add request. If the requested part is missing, add a realistic version of that specific part only.");
          lines.push("Do not redesign the whole object while adding the part.");
        } else if (action === "remove") {
          lines.push("ACTION LOCK: This is a remove request. Remove only the requested feature and preserve the rest of the object.");
        } else if (action === "replace") {
          lines.push("ACTION LOCK: This is a replace request. Replace only the requested part and preserve the surrounding design.");
        } else if (action === "reposition") {
          lines.push("ACTION LOCK: This is a placement request. Move only the requested element and preserve the design otherwise.");
        }
        if (/\b(keep everything else the same|leave everything else unchanged|leave the rest unchanged|without changing the rest|preserve the rest|keep everything else unchanged)\b/.test(lc(rawPrompt || ""))) {
          lines.push("PRESERVE LOCK: The user explicitly asked to keep everything else unchanged, so do not broaden the edit beyond the requested target.");
        }
        if (/^generic_/.test(target || "")) {
          lines.push("GENERIC PART LOCK: Apply the edit only to the requested product part and preserve the object's identity, finish, proportions, and unrelated details.");
        }
        return lines.join("\n");
      }

      function promptTargetsVisibleText(prompt, target) {
        var p = lc(prompt || "");
        var t = lc(target || "");
        return t === "logo" || t === "grill_logo" || t === "text/title area" || /\b(logo|name|word|words|text|letters|lettering|engrave|engraved|etch|etched|etching|brand|badge|label|title|author|subtitle|simon|gojcaj)\b/.test(p);
      }

      function requestedVisibleWordsFromPrompt(prompt) {
        var raw = clean(prompt || "");
        var found = [];
        var quoted = raw.match(/[“"']([^“"']{1,40})[”"']/g) || [];
        quoted.forEach(function (q) {
          var v = clean(q.replace(/^[“"']|[”"']$/g, ""));
          if (v) found.push(v);
        });
        var m;
        var patterns = [
          /\b(?:logo|name|word|text|engraving|etching|badge|label)\s+(?:that\s+says|says|reading|with|of)?\s*([A-Za-z0-9][A-Za-z0-9 .&'-]{0,32})/ig,
          /\b(?:put|add|place|engrave|etch)\s+(?:an?\s+)?(?:elegant\s+)?(?:gold\s+|etched\s+|engraved\s+|logo\s+|text\s+|name\s+|badge\s+|label\s+)*([A-Z][A-Za-z0-9.&'-]{1,24})\b/g
        ];
        patterns.forEach(function (re) {
          while ((m = re.exec(raw)) !== null) {
            var v = clean((m[1] || "").replace(/\b(on|in|to|at|the|left|right|front|panel|gold|silver|black|white|blue|red|and|keep|with|without|unchanged).*$/i, ""));
            if (v && !/^(logo|text|name|badge|label|front|panel|gold|left|right)$/i.test(v)) found.push(v);
          }
        });
        return found.filter(function (item, index, arr) {
          var k = lc(item);
          return k && arr.map(lc).indexOf(k) === index;
        }).slice(0, 6);
      }

      function allowedVisibleWordsMemory(currentPrompt, target) {
        var words = [];
        if (promptTargetsVisibleText(currentPrompt, target)) {
          requestedVisibleWordsFromPrompt(currentPrompt).forEach(function (w) { words.push(w); });
        }
        (Array.isArray(DATA.edits) ? DATA.edits : []).forEach(function (e) {
          requestedVisibleWordsFromPrompt(clean((e && e.prompt) || e || "")).forEach(function (w) { words.push(w); });
        });
        return words.filter(function (item, index, arr) {
          var k = lc(item);
          return k && arr.map(lc).indexOf(k) === index;
        }).slice(-8);
      }

      function buildNoUnrequestedTextLock(currentPrompt, target) {
        var lines = [];
        var asksForText = promptTargetsVisibleText(currentPrompt, target);
        var allowed = allowedVisibleWordsMemory(currentPrompt, target);
        lines.push("NO-UNREQUESTED-TEXT / BRAND GUARD:");
        lines.push("Do not invent or add any visible words, letters, numbers, brand names, wheel/tire lettering, watermarks, badges, labels, signatures, random logos, or maker marks unless the current user request explicitly asks for that exact visible text.");
        lines.push("Do not add lettering to wheels, tires, base, shelves, panels, grates, background, or hardware as decoration.");
        if (allowed.length) {
          lines.push("Allowed existing/requested visible text to preserve: " + allowed.join(", ") + ".");
          lines.push("Preserve those allowed words exactly; do not add new extra words around them.");
        }
        if (!asksForText) {
          lines.push("This current edit is NOT a text/logo request, so preserve existing text/logo exactly and add no new text anywhere.");
        } else {
          lines.push("This is a text/logo request, so use only the exact requested text and no additional text.");
        }
        return lines.join("\n");
      }

      function universalAnalyze(prompt) {
        var ctx = {
          workspaceSubject: DATA.workspaceSubject,
          projectTitle: DATA.projectTitle,
          title: DATA.title
        };
        try {
          if (window.opener && window.opener.SimoUniversalIntentLayer && window.opener.SimoUniversalIntentLayer.analyze) {
            return window.opener.SimoUniversalIntentLayer.analyze(prompt, ctx);
          }
        } catch (e) {}
        var subject = clean(DATA.workspaceSubject || DATA.projectTitle || DATA.title || "current design");
        var p = lc(prompt);
        var action = detectRequestedAction(prompt);
        var detectedTarget = detectTarget(prompt);
        var target = detectedTarget && detectedTarget !== "general" ? detectedTarget : "general design";
        var needsClarification = (target === "general design") && /(make it better|fix it|improve it|make it nice|upgrade it)/.test(p);
        var confidence = target === "general design" ? 0.64 : 0.9;
        var preserve = [
          "preserve the current " + subject,
          "preserve unrelated details",
          "preserve previous successful edits"
        ];
        if (/(only|just|keep everything else the same|leave everything else unchanged|without changing the rest|preserve the rest)/.test(p)) {
          preserve.push("preserve all unrelated areas exactly because the user requested a narrow edit");
          confidence = Math.max(confidence, 0.92);
        }
        var instruction = [
          "UNIVERSAL INTENT LAYER:",
          "Subject: " + subject,
          "Target: " + target,
          "Action: " + action,
          "User request: " + prompt,
          "Edit only the requested target. Preserve unrelated details and previous successful edits."
        ].join("\n");
        return {
          subject: subject,
          target: target,
          action: action,
          preserve: preserve,
          mode: /(website|landing page|hero|pricing|html|css)/.test(p) ? "builder_edit" : "image_edit",
          confidence: confidence,
          needsClarification: needsClarification,
          userPrompt: prompt,
          instruction: instruction
        };
      }

      function detectProtectedEditDetails(prompt) {
        var p = lc(prompt);
        var locks = [];

        if (/\b(logo|brand|branding|name|gojcaj|text|title|author|subtitle|word|letters|engraving|etched|etch)\b/.test(p)) {
          locks.push("existing text/logo/branding must be preserved exactly unless the user explicitly asks to change or remove it");
        }
        if (/\b(material|finish|color|paint|matte|gloss|brushed|steel|chrome|nickel|copper|gold|green|blue|black|white|red|navy|forest)\b/.test(p)) {
          locks.push("current material, finish, and color choices must be preserved unless the current prompt targets them");
        }
        if (/\b(shape|proportion|size|taller|slimmer|wider|shorter|body|silhouette)\b/.test(p)) {
          locks.push("current shape and proportions must be preserved unless the current prompt targets shape/proportion");
        }
        if (/\b(cap|lid|handle|hardware|lever|dial|knob|button|buttons|controls|slots|feet|base|pump|hose|nozzle|pin|valve)\b/.test(p)) {
          locks.push("current functional details and hardware must be preserved unless the current prompt targets them");
        }
        if (/\b(background|lighting|camera|angle|composition|layout)\b/.test(p)) {
          locks.push("current camera angle, lighting, background, and layout must be preserved unless explicitly changed");
        }
        if (/\b(keep|preserve|unchanged|without changing|do not change|same)\b/.test(p)) {
          locks.push("the user explicitly requested preservation in this edit");
        }

        return locks.filter(function (item, index, arr) {
          return item && arr.indexOf(item) === index;
        });
      }

      function buildPreserveMemoryLock(memory, currentPrompt, universal) {
        var currentTarget = lc((universal && universal.target) || detectTarget(currentPrompt) || "");
        var currentPromptLc = lc(currentPrompt);
        var lines = [];
        var protectedFromHistory = memory && memory.protectedDetails ? memory.protectedDetails.slice() : [];

        lines.push("UNIVERSAL PRESERVE MEMORY LOCK:");
        lines.push("Treat the current visible image as the source of truth.");
        lines.push("Every successful prior edit is part of the current design now.");
        lines.push("Do not reset, remove, rewrite, or redesign previous successful edits unless the user explicitly asks for that exact change.");
        lines.push("For this prompt, edit only the requested target: " + (currentTarget || "requested target") + ".");
        lines.push("Preserve all unrelated areas, including subject identity, camera angle, composition, lighting, background, and previous visible design choices.");

        if (protectedFromHistory.length) {
          lines.push("Protected details learned from previous edits:");
          protectedFromHistory.slice(-8).forEach(function (item) {
            lines.push("- " + item);
          });
        }

        if (!/\b(remove|delete|erase|get rid of|replace|change the logo|change logo|change the text|remove text|remove logo)\b/.test(currentPromptLc)) {
          lines.push("If any text, logo, name, title, author, label, or branding is already visible, preserve it exactly unless the current user prompt explicitly asks to modify it.");
        }

        lines.push("Never invent extra visible text, random labels, wheel/tire lettering, watermarks, brand names, signatures, or badges during preservation-focused edits.");

        if (/\b(only|just)\b/.test(currentPromptLc)) {
          lines.push("The user used a narrow edit word like only/just, so do not perform a broad redesign.");
        }

        return lines.join("\n");
      }

      function currentDesignMemory() {
        var edits = Array.isArray(DATA.edits) ? DATA.edits : [];
        var lastPrompts = edits.slice(-6).map(function (e) {
          return clean((e && e.prompt) || e || "");
        }).filter(Boolean);

        var protectedDetails = [];
        edits.forEach(function (e) {
          var prompt = clean((e && e.prompt) || e || "");
          detectProtectedEditDetails(prompt).forEach(function (lock) {
            if (protectedDetails.indexOf(lock) === -1) protectedDetails.push(lock);
          });
          if (e && Array.isArray(e.protectedDetails)) {
            e.protectedDetails.forEach(function (lock) {
              if (lock && protectedDetails.indexOf(lock) === -1) protectedDetails.push(lock);
            });
          }
        });

        var subject = clean(DATA.workspaceSubject || DATA.projectTitle || DATA.title || "current design");
        return {
          subject: subject || "current design",
          editCount: edits.length,
          lastPrompts: lastPrompts,
          protectedDetails: protectedDetails
        };
      }

      function detectTarget(prompt) {
        var pFull = lc(prompt);
        var p = primaryIntentText(prompt);
        var explicitOnly = mentionedOnlyTarget(prompt);
        if (explicitOnly) return explicitOnly;

        var subject = lc(DATA.workspaceSubject || DATA.projectTitle || DATA.title || "");
        var isToaster = /toaster/.test(subject + " " + pFull);
        var isBottle = /bottle|tumbler|flask/.test(subject + " " + pFull);
        var isRim = /tire rim|wheel rim|alloy wheel|automotive wheel|custom wheel|\brims?\b|\bwheels?\b/.test(subject + " " + pFull);
        var isExtinguisher = /fire extinguisher|extinguisher/.test(subject + " " + pFull);
        var isGrill = /barbecue grill|bbq grill|gas grill|charcoal grill|pellet grill|smoker grill|outdoor grill|barbeque grill|barbecue|bbq|grill|smoker/.test(subject + " " + pFull);

        if (isGrill) {
          if (/\b(logo|name|simon|gojcaj|engrave|engraved|etch|etched|brand|badge|text|label)\b/.test(p)) return "grill_logo";
          if (/\b(front panel|left front panel|front door|cabinet front|panel)\b/.test(p)) return "grill_front_panel";
          if (/\b(grate|grates|rack|racks|cooking surface)\b/.test(p)) return "grill_grates";
          if (/\b(burner|burners|firebox|charcoal tray|heat shield)\b/.test(p)) return "grill_firebox";
          if (/\b(side shelf|side shelves|shelf|table)\b/.test(p)) return "grill_side_shelves";
          if (/\b(handle|handles|hardware|pull)\b/.test(p)) return "grill_handles";
          if (/\b(wheel|wheels|cart|base|legs|stand)\b/.test(p)) return "grill_base";
          if (/\b(lid|hood|thermometer|gauge|vent|chimney)\b/.test(p)) return "grill_lid";
          if (/\b(finish|material|brushed|nickel|steel|stainless|chrome|matte|gloss|color|paint|texture|gold)\b/.test(p)) return "finish";
        }

        if (isToaster) {
          // Primary target priority matters. Do not let preserve clauses steal the target.
          if (/\b(dial|knob|control|controls|number|numbers|marking|markings|indicator|button|buttons)\b/.test(p)) return "toaster_controls";
          if (/\b(slot|slots|bread slot|bread slots|opening|openings|toast opening|toast slots)\b/.test(p)) return "toaster_slots";
          if (/\b(logo|name|gojcaj|engrave|engraved|etch|etched|brand|badge|text)\b/.test(p)) return "logo";
          if (/\b(finish|material|brushed|nickel|steel|stainless|chrome|matte|gloss|color|paint)\b/.test(p)) return "finish";
          if (/\b(lever|handle|slider|push down|lift)\b/.test(p)) return "toaster_lever";
          if (/\b(feet|base|bottom)\b/.test(p)) return "toaster_feet";

          // Fallback only if the main clause is vague.
          if (/\b(dial|knob|control|controls|number|numbers|marking|markings|indicator|button|buttons)\b/.test(pFull) &&
              !/\b(slot|slots|bread slot|bread slots)\b/.test(p)) return "toaster_controls";
          if (/\b(logo|name|gojcaj|engrave|engraved|etch|etched|brand|badge|text)\b/.test(pFull) &&
              !/\b(slot|slots|bread slot|bread slots|dial|knob|control|controls|number|numbers)\b/.test(p)) return "logo";
        }
        if (isBottle) {
          if (/\b(logo|name|gojcaj|engrave|engraved|etch|etched|brand|badge|text)\b/.test(p)) return "logo";
          if (/\b(curve|curved|wrap|surface|around)\b/.test(p)) return "surface_placement";
          if (/\b(cap|lid|top|hardware)\b/.test(p)) return "bottle_cap";
          if (/\b(handle|grip|strap)\b/.test(p)) return "bottle_handle";
          if (/\b(finish|material|brushed|steel|stainless|matte|color|paint)\b/.test(p)) return "finish";
        }
        if (isRim) {
          if (/\b(spoke|spokes)\b/.test(p)) return "rim_spokes";
          if (/\b(center|cap|hub)\b/.test(p)) return "rim_center";
          if (/\b(finish|chrome|black|brushed|paint|color|led|accent)\b/.test(p)) return "finish";
        }
        if (isExtinguisher) {
          if (/\b(logo|name|gojcaj|engrave|engraved|etch|etched|brand|badge|text|label)\b/.test(p)) return "logo";
          if (/\b(nozzle|horn|tip|spout)\b/.test(p)) return "extinguisher_nozzle";
          if (/\b(hose)\b/.test(p)) return "extinguisher_hose";
          if (/\b(handle|lever|grip)\b/.test(p)) return "extinguisher_handle";
          if (/\b(pin|safety pin)\b/.test(p)) return "extinguisher_pin";
          if (/\b(body|cylinder|tank|canister)\b/.test(p)) return "extinguisher_body";
          if (/\b(finish|material|brushed|steel|stainless|chrome|matte|gloss|color|paint|texture)\b/.test(p)) return "finish";
        }
        if (/\b(logo|name|gojcaj|engrave|engraved|etch|etched|brand|badge|text)\b/.test(p)) return "logo";
        if (/\b(finish|material|brushed|nickel|steel|chrome|matte|gloss|color|paint|texture)\b/.test(p)) return "finish";
        if (/\b(variation|variations|options|versions|different versions)\b/.test(p)) return "variations";
        return "general";
      }
      function targetInstruction(target, userPrompt) {
        var subject = clean(DATA.workspaceSubject || DATA.projectTitle || DATA.title || "current design");
        var base = [
          "You are editing the exact current image only.",
          "Keep the same main subject: " + subject + ".",
          "Preserve the camera angle, composition, lighting style, object proportions, background, and all successful previous edits unless the user directly asks to change them.",
          "Do not introduce a different product, brand, watermark, extra logo, extra text, random visible letters, wheel/tire lettering, badges, labels, maker marks, or unrelated redesign.",
          "When the user edits a physical part such as grates, shelves, handles, wheels, base, lid, cap, or panel, do not add any decorative words or branding unless the user explicitly asks for that text.",
          "Return a realistic edited image, not a concept board or text-only response."
        ];
        var rules = [];
        if (target === "toaster_slots") {
          rules = [
            "TARGET: only the two top bread slots / toast openings.",
            "Make the bread slots slightly wider, cleaner, and better defined on the top surface.",
            "Do not change the front dial, dial numbers, side logo, body finish, front color panel, lever, feet, shape, perspective, or background.",
            "Preserve the Gojcaj logo exactly if it is visible.",
            "Preserve the existing brushed metal / green front design exactly except for the slot openings."
          ];
        } else if (target === "toaster_controls") {
          rules = [
            "STRICT TARGET LOCK: edit only the front control dial, knob, and dial markings.",
            "PRECISION DETAIL MODE: this is a tiny detail edit. Keep the overall toaster image nearly identical.",
            "If the user asks for exact dial numbers but does not explicitly force numbers, use clean minimal tick marks instead of small text numbers. This avoids scrambled or repeated tiny numbers.",
            "If the user explicitly forces numbers, use exactly one each of 1, 2, 3, 4, 5, 6 around the knob in proper clockwise order.",
            "Do not repeat numbers. Do not use 1,2,3,3,3,4 or any duplicate sequence. Do not add random letters or extra symbols.",
            "Keep markings readable, evenly spaced, and visually attached to the dial ring.",
            "Do not change the Gojcaj logo, logo spelling, logo placement, or logo style. Do not crop, rewrite, shorten, or damage the logo.",
            "Do not change the bread slots, slot width, body shape, finish, side artwork, side logo, lever, feet, camera angle, lighting, or background.",
            "Preserve every previously successful edit exactly. The only visible change should be the dial/controls."
          ];
        } else if (target === "toaster_lever") {
          rules = [
            "TARGET: only the toaster lever/slider.",
            "Refine the lever so it looks premium and integrated.",
            "Do not change dial, bread slots, logo, body finish, feet, shape, or camera angle."
          ];
        } else if (target === "toaster_feet") {
          rules = [
            "TARGET: only the toaster feet/base detail.",
            "Make the feet/base cleaner and more premium.",
            "Do not change dial, slots, logo, lever, finish, body shape, or camera angle."
          ];
        } else if (target === "rim_edge") {
          rules = [
            "STRICT TARGET LOCK: edit only the tire rim outer lip / outer edge ring.",
            "Make that outer edge visibly bright blue as requested.",
            "Do not recolor the spokes, center cap, lug holes, inner barrel, background, or whole wheel.",
            "Do not add text, logos, tire lettering, brand marks, or labels.",
            "Keep the same rim shape, same camera angle, and same metallic material everywhere except the outer lip color."
          ];
        } else if (target === "rim_spokes") {
          rules = [
            "STRICT TARGET LOCK: edit only the wheel spokes.",
            "Keep the center cap, lug holes, outer lip, inner barrel, background, camera angle, and rim shape unchanged.",
            "Do not add text, logos, tire lettering, or brand marks."
          ];
        } else if (target === "rim_center") {
          rules = [
            "STRICT TARGET LOCK: edit only the center cap / hub area.",
            "Keep the spokes, outer lip, inner barrel, lug holes, rim shape, and background unchanged.",
            "Do not add text, logos, tire lettering, or brand marks unless requested."
          ];
        } else if (target === "rim_barrel") {
          rules = [
            "STRICT TARGET LOCK: edit only the inner barrel / inside surface of the rim.",
            "Keep the spokes, center cap, outer lip, rim face, background, and camera angle unchanged.",
            "Do not add text, logos, tire lettering, or brand marks."
          ];
        } else if (target === "rim_finish") {
          rules = [
            "TARGET: rim finish/color only. Keep the same tire rim object and design.",
            "Avoid changing spoke shape, center cap shape, lug holes, camera angle, or background unless the prompt asks.",
            "Do not add text, logos, tire lettering, or brand marks."
          ];
        } else if (target === "extinguisher_nozzle") {
          rules = [
            "STRICT TARGET LOCK: edit only the fire extinguisher nozzle / discharge horn / tip at the end of the hose.",
            "If the user asks for a color change, recolor only the nozzle.",
            "Do not spread the new color onto the extinguisher body, do not create a gradient, and do not recolor the whole product unless the user explicitly asks for that.",
            "Preserve the current cylinder body color/finish, hose, top handle/lever, safety pin, valve assembly, bracket, proportions, lighting, and background.",
            "Keep the extinguisher nearly identical except for the nozzle part requested."
          ];
        } else if (target === "extinguisher_hose") {
          rules = [
            "STRICT TARGET LOCK: edit only the extinguisher hose.",
            "Change only the hose color/detail requested.",
            "Preserve the nozzle, cylinder body, top handle/lever, safety pin, proportions, lighting, and background unchanged."
          ];
        } else if (target === "extinguisher_handle") {
          rules = [
            "STRICT TARGET LOCK: edit only the extinguisher top handle / squeeze lever / grip requested.",
            "Preserve the cylinder body, hose, nozzle, safety pin, finish, proportions, lighting, and background unchanged."
          ];
        } else if (target === "extinguisher_pin") {
          rules = [
            "STRICT TARGET LOCK: edit only the extinguisher safety pin / locking pin.",
            "Preserve the body, hose, nozzle, top handle/lever, finish, proportions, lighting, and background unchanged."
          ];
        } else if (target === "extinguisher_body") {
          rules = [
            "STRICT TARGET LOCK: edit only the extinguisher body / cylinder / tank.",
            "Preserve the hose, nozzle, top handle/lever, safety pin, hardware, proportions, lighting, and background unchanged.",
            "If the user changes body color or finish, keep the edges clean and do not recolor the hose or nozzle unless explicitly requested."
          ];
        } else if (target === "grill_logo") {
          rules = [
            "STRICT TARGET LOCK: edit only the requested grill logo/text/etching on the barbecue grill.",
            "If the user says left front panel, place the text/logo on the grill's left front panel or left front door area, aligned naturally to that flat surface.",
            "If the user requests gold, make only the logo/text gold; do not turn the grill body, grates, shelves, handle, wheels, or background gold.",
            "Make the mark look physically part of the grill surface: etched, engraved, printed, embossed, or metallic as requested.",
            "Use only the requested text. Do not add extra random labels, watermarks, or brand names.",
            "Preserve the lid/hood, cooking grates, side shelves, wheels/cart base, handle, material, camera angle, lighting, and background."
          ];
        } else if (target === "grill_front_panel") {
          rules = [
            "STRICT TARGET LOCK: edit only the barbecue grill front panel / front door area requested.",
            "Preserve the lid, grates, side shelves, wheels/cart base, handles, finish outside that panel, camera angle, lighting, and background."
          ];
        } else if (target === "grill_grates") {
          rules = [
            "STRICT TARGET LOCK: edit only the barbecue grill cooking grates/racks.",
            "Make the grates heavier/thicker only if requested; do not change panels, shelves, handles, wheels, lid, or base.",
            "Preserve any existing requested logo/text exactly, such as a front-panel name, and do not add new text or lettering anywhere else.",
            "Preserve the lid, front panel, side shelves, handles, wheels/cart base, finish, camera angle, lighting, and background."
          ];
        } else if (target === "grill_firebox") {
          rules = [
            "STRICT TARGET LOCK: edit only the burners/firebox/heat area requested.",
            "Preserve the lid, front panel, side shelves, grates unless requested, handles, wheels/cart base, camera angle, lighting, and background."
          ];
        } else if (target === "grill_side_shelves") {
          rules = [
            "STRICT TARGET LOCK: edit only the barbecue grill side shelves/tables.",
            "Preserve the lid, grates, front panel, handle, wheels/cart base, material outside the shelves, camera angle, lighting, and background."
          ];
        } else if (target === "grill_handles") {
          rules = [
            "STRICT TARGET LOCK: edit only the barbecue grill handle or requested hardware.",
            "Preserve the lid shape, front panel, grates, side shelves, wheels/cart base, finish, camera angle, lighting, and background."
          ];
        } else if (target === "grill_base") {
          rules = [
            "STRICT TARGET LOCK: edit only the barbecue grill cart/base/legs/wheels area.",
            "Preserve the lid, front panel, grates, side shelves, handles, finish, camera angle, lighting, and background."
          ];
        } else if (target === "grill_lid") {
          rules = [
            "STRICT TARGET LOCK: edit only the barbecue grill lid/hood/thermometer/vent area requested.",
            "Preserve the front panel, grates, side shelves, handles, wheels/cart base, camera angle, lighting, and background."
          ];
        } else if (target === "logo") {
          rules = [
            "STRICT TARGET LOCK: edit only the requested logo/text/engraving.",
            "If the user mentions a panel or surface, place the logo on that exact panel/surface and keep it aligned naturally to that surface.",
            "Make the logo look physically part of the surface: engraved, etched, printed, embossed, metallic, or curved only if requested.",
            "Do not change the material, body shape, camera angle, controls, handles, openings, trim, shelves, grates, wheels, base, or existing product features.",
            "Use only the requested text. Do not add extra random words, labels, watermarks, or brand names."
          ];
        } else if (target === "finish") {
          rules = [
            "TARGET: only the material, color, texture, or finish requested by the user.",
            "Preserve the same object shape, controls, logo/text, openings, proportions, camera angle, and background.",
            "Do not add new branding or alter small functional details unless directly requested."
          ];
        } else if (target === "surface_placement") {
          rules = [
            "TARGET: only the placement and perspective of the existing graphic/logo/text on the product surface.",
            "Make the graphic follow the surface curvature naturally.",
            "Do not change material, cap, body shape, background, or product identity."
          ];
        } else if (target === "bottle_cap") {
          rules = [
            "TARGET: only the bottle cap/lid/top hardware.",
            "Improve that feature while preserving bottle body, logo, material, background, and camera angle."
          ];
        } else if (target === "bottle_handle") {
          rules = [
            "TARGET: only the handle/grip/strap requested.",
            "Preserve the bottle body, logo, material, cap, background, and camera angle."
          ];
        } else if (target === "rim_spokes") {
          rules = [
            "TARGET: only the wheel/rim spokes.",
            "Change spoke shape/detail while preserving rim center, tire, finish unless requested, perspective, and background."
          ];
        } else if (target === "rim_center") {
          rules = [
            "TARGET: only the center cap/hub area.",
            "Preserve spokes, rim finish, tire, perspective, and background."
          ];
        } else if (target === "generic_handle") {
          rules = [
            "TARGET: only the requested handle, grip, strap, or loop.",
            "If the user asks to add one and it is missing, add a realistic version of that part only.",
            "Preserve the main body, finish, proportions, camera angle, and background."
          ];
        } else if (target === "generic_cap") {
          rules = [
            "TARGET: only the cap, lid, top, or cover area requested.",
            "If the cap/lid is missing and the user requests one, add it realistically without redesigning the object.",
            "Preserve the body, other hardware, proportions, camera angle, and background."
          ];
        } else if (target === "generic_body") {
          rules = [
            "TARGET: only the main body / shell / housing / cylinder of the current object.",
            "Preserve the handles, controls, openings, trim, camera angle, and background unless explicitly changed."
          ];
        } else if (target === "generic_base") {
          rules = [
            "TARGET: only the base / bottom / feet / stand area.",
            "If the user asks to add feet or a base detail, add only that localized feature.",
            "Preserve the rest of the object and background unchanged."
          ];
        } else if (target === "generic_control") {
          rules = [
            "TARGET: only the requested control area such as dial, knob, switch, button, lever, or trigger.",
            "If the user asks to add the part and it is missing, add that specific part only.",
            "Preserve branding, body shape, finish, other hardware, and background unless explicitly changed."
          ];
        } else if (target === "generic_opening") {
          rules = [
            "TARGET: only the requested opening, slot, vent, spout, or port.",
            "If the user asks to add or widen one, do only that localized change.",
            "Preserve the rest of the object, finish, proportions, and background unchanged."
          ];
        } else if (target === "generic_trim") {
          rules = [
            "TARGET: only the requested trim, edge, ring, or accent band.",
            "Preserve the main body, controls, openings, proportions, lighting, and background."
          ];
        } else if (target === "variations") {
          rules = [
            "TARGET: create tasteful variations of the same exact subject.",
            "Keep all variations in the same product category and related to the current image.",
            "Do not switch to unrelated objects or concept boards."
          ];
        } else {
          rules = [
            "TARGET: interpret the user's intent conservatively.",
            "Make the smallest useful visual change that satisfies the request.",
            "When unsure, preserve the current design and improve only the most likely requested feature."
          ];
        }
        return base.concat(rules, [
          "USER REQUEST: " + userPrompt,
          "Final instruction: produce the edited image with the requested change only."
        ]).join("\n");
      }
      function buildIntentPrompt(rawPrompt) {
        var memory = currentDesignMemory();
        var target = detectTarget(rawPrompt);
        var universal = universalAnalyze(rawPrompt);
        var enhanced = targetInstruction(target, rawPrompt);

        enhanced = universal.instruction + "\n\n" + buildPreserveMemoryLock(memory, rawPrompt, universal) + "\n\n" + buildNoUnrequestedTextLock(rawPrompt, target) + "\n\n" + enhanced;

        if (universal.needsClarification) {
          enhanced += "\nAMBIGUITY HANDLING: The request may be broad. Make the smallest safe useful edit and preserve unrelated details. If no safe visual edit is clear, suggest the most likely editable targets.";
        }

        if (target === "toaster_controls" && wantsExactDialNumbers(rawPrompt)) {
          enhanced += "\nDIAL NUMBER PRECISION: Tiny exact numbers can be unreliable. Prefer clean product-style tick marks unless the user explicitly forces exact numbers. Never damage existing logo/text.";
        }
        if (target === "toaster_controls" && wantsTickMarks(rawPrompt)) {
          enhanced += "\nTICK MARK PRECISION: Use clean minimal tick marks only. No numbers, no letters, no repeated text, no extra symbols.";
        }
        if (target === "toaster_controls") {
          enhanced += "\nLOGO PRESERVE LOCK: Preserve the existing logo/text exactly. Do not crop it, misspell it, move it, rewrite it, or place dial markings near it.";
        }
        if (target === "logo" && locationHint(rawPrompt)) {
          enhanced += "\nLOGO LOCATION: Place the logo on the " + locationHint(rawPrompt) + ". Keep it away from dial/controls if requested.";
        }
        var localizedPart = explicitLocalizedPart(rawPrompt);
        if (localizedPart) {
          enhanced += "\nUNIVERSAL LOCALIZED PART LOCK: Treat this as a focused part edit for the " + localizedPart + " only. Keep the rest of the object, finish, shape, proportions, and unrelated hardware unchanged unless the user explicitly asks otherwise.";
        }
        var actionGuidance = buildActionGuidance(universal.action, target, rawPrompt);
        if (actionGuidance) {
          enhanced += "\n" + actionGuidance;
        }

        if (memory.lastPrompts.length) {
          enhanced += "\nPrevious successful edit requests to preserve: " + memory.lastPrompts.join(" | ");
        }
        return { target: target, prompt: enhanced, userPrompt: rawPrompt, universal: universal };
      }

      function buildPayload(prompt) {
        var source = DATA.currentSourceImage || DATA.sourceImage || DATA.currentImage || DATA.image || "";
        var intent = buildIntentPrompt(prompt);
        return {
          edit: intent.prompt,
          prompt: intent.prompt,
          userPrompt: intent.userPrompt || prompt,
          originalUserPrompt: intent.originalUserPrompt || prompt,
          editTarget: intent.target,
          universalIntent: intent.universal || null,
          universalSubject: intent.universal ? intent.universal.subject : "",
          universalTarget: intent.universal ? intent.universal.target : "",
          universalAction: intent.universal ? intent.universal.action : "",
          universalMode: intent.universal ? intent.universal.mode : "",
          preserveConstraints: intent.universal ? intent.universal.preserve : [],
          preserveMemoryLock: buildPreserveMemoryLock(currentDesignMemory(), prompt, intent.universal),
          protectedDetails: currentDesignMemory().protectedDetails || [],
          intentLock: true,
          precisionMode: (intent.target === "toaster_controls" && (wantsExactDialNumbers(prompt) || wantsTickMarks(prompt) || shouldUsePrecisionFallback(prompt))),
          precisionFallback: shouldUsePrecisionFallback(prompt),
          exactDialNumbersRequested: wantsExactDialNumbers(prompt),
          forceExactDialNumbers: forceExactDialNumbers(prompt),
          tickMarksRequested: wantsTickMarks(prompt) || shouldUsePrecisionFallback(prompt),
          locationHint: locationHint(prompt),
          title: DATA.title || "Workspace Design",
          workspaceSubject: DATA.workspaceSubject || DATA.title || "current design",
          currentSourceImage: source,
          sourceImage: source,
          currentImage: source,
          image: source,
          displayImage: DATA.currentImage || DATA.image || source,
          originalImage: DATA.originalSourceImage || DATA.originalImage || "",
          editCount: (DATA.edits || []).length,
          previousSuccessfulEdits: Array.isArray(DATA.edits) ? DATA.edits.map(function (e) { return clean((e && e.prompt) || e || ""); }).filter(Boolean).slice(-4) : [],
          clientApplySeq: applySeq,
          phase: "SIMO Clean Design Workspace V1.3.16 universal subject refresh"
        };
      }
      async function applyEdit() {
        applySeq += 1;
        updateProof();
        var prompt = clean(($("prompt") || {}).value || "");
        setStatus("Apply #" + applySeq + " received. Checking prompt...", "ok");
        setProof("apply", String(applySeq), "ok");

        if (!prompt) {
          setStatus("Apply #" + applySeq + " stopped: type the edit you want first.", "warn");
          return;
        }
        if (busy) {
          setStatus("Apply #" + applySeq + " was received, but the previous edit is still running. Wait for it to finish.", "warn");
          return;
        }
        var source = DATA.currentSourceImage || DATA.sourceImage || DATA.currentImage || DATA.image || "";
        if (!source) {
          setStatus("Apply #" + applySeq + " stopped: no current image source was found.", "bad");
          setProof("source", "missing", "bad");
          return;
        }

        var detectedTarget = detectTarget(prompt);
        var proofIntent = universalAnalyze(prompt);
        var targetLabel = proofIntent.target || detectedTarget.replace(/_/g, " ");
        if (detectedTarget === "toaster_controls" && shouldUsePrecisionFallback(prompt)) targetLabel += " · fallback tick marks";
        else if (detectedTarget === "toaster_controls" && forceExactDialNumbers(prompt)) targetLabel += " · forced numbers";
        else if (detectedTarget === "toaster_controls" && wantsExactDialNumbers(prompt)) targetLabel += " · precision numbers";
        if (detectedTarget === "toaster_controls" && wantsTickMarks(prompt)) targetLabel += " · tick marks";
        if (detectedTarget === "logo" && locationHint(prompt)) targetLabel += " · " + locationHint(prompt);
        setProof("subject", proofIntent.subject || "current design", "ok");
        setProof("target", targetLabel, "ok");
        setProof("mode", proofIntent.mode || "image_edit", "ok");
        busy = true;
        updateProof();
        var statusTarget = detectedTarget.replace(/_/g, " ");
        if (detectedTarget === "toaster_controls" && shouldUsePrecisionFallback(prompt)) {
          statusTarget += " using clean tick-mark fallback instead of unreliable tiny numbers";
        }
        setStatus("Apply #" + applySeq + " intent locked: " + statusTarget + ". Sending to Simo image edit route...", "warn");

        var controller = null;
        var timeoutId = null;
        try {
          if (window.AbortController) {
            controller = new AbortController();
            timeoutId = setTimeout(function () {
              try { controller.abort(); } catch (e) {}
            }, 300000);
          }
          var res = await fetch(apiUrl("/api/workspace-image-edit"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPayload(prompt)),
            signal: controller ? controller.signal : undefined
          });
          var text = await res.text();
          var payload = {};
          try { payload = JSON.parse(text); } catch (parseErr) { payload = { ok: false, error: text || String(parseErr) }; }
          if (!res.ok || !payload.ok) {
            throw new Error(payload.error || payload.message || ("HTTP " + res.status));
          }

          var nextSource = payload.currentSourceImage || payload.sourceImage || payload.image_url || payload.generated_visual_url || payload.url || "";
          var nextDisplay = payload.image_data_url || payload.image || nextSource;
          if (!nextDisplay && !nextSource) throw new Error("Edit returned no image.");

          DATA.edits = Array.isArray(DATA.edits) ? DATA.edits : [];
          DATA.edits.push({
            at: new Date().toISOString(),
            prompt: prompt,
            source: sourceFriendly(nextSource || nextDisplay),
            applySeq: applySeq,
            universalIntent: universalAnalyze(prompt),
            protectedDetails: detectProtectedEditDetails(prompt)
          });
          setImage(nextDisplay, nextSource || nextDisplay, "edit complete");
          var promptBox = $("prompt");
          if (promptBox) promptBox.value = "";
          setStatus("Edit #" + DATA.edits.length + " complete. This result is now the source for the next Apply.", "ok");
        } catch (err) {
          var msg = err && err.name === "AbortError" ? "Image edit timed out after 5 minutes. The current image was preserved; try a shorter feature-specific prompt." : (err && err.message ? err.message : String(err));
          setStatus("Apply #" + applySeq + " failed: " + msg, "bad");
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          busy = false;
          updateProof();
        }
      }
      async function saveCurrent() {
        setStatus("Saving exact current visible version to Library...", "warn");
        var item = null;
        try {
          if (window.opener && window.opener.SimoLiveWorkspaceIsolated && window.opener.SimoLiveWorkspaceIsolated._makeLibraryItem) {
            item = window.opener.SimoLiveWorkspaceIsolated._makeLibraryItem(DATA);
          }
        } catch (e) {}
        if (!item) {
          setStatus("Save failed: save bridge was not available. Keep this window open and return to the main Simo tab.", "bad");
          return;
        }

        var savedLocal = false;
        var syncedServer = false;
        var beforeCount = 0;
        var afterCount = 0;

        try {
          var storage = window.opener && window.opener.localStorage ? window.opener.localStorage : window.localStorage;
          var raw = storage.getItem("simo_builder_library_v5_1_builder_first") || "[]";
          var list = [];
          try { list = JSON.parse(raw); } catch (e2) { list = []; }
          if (!Array.isArray(list)) list = [];
          beforeCount = list.length;

          var itemImage = String(item.imageUrl || item.generated_visual_url || item.thumbnail || "").trim();
          var itemTitle = String(item.title || item.name || "").trim();

          list = list.filter(function (x) {
            if (!x) return false;
            if (x.id === item.id) return false;
            var xImage = String(x.imageUrl || x.generated_visual_url || x.thumbnail || "").trim();
            var xTitle = String(x.title || x.name || "").trim();
            // Remove only the same exact saved card. Keep separate edited versions.
            if (itemImage && xImage && itemImage === xImage && xTitle === itemTitle) return false;
            return true;
          });

          list = [item].concat(list).slice(0, 200);
          afterCount = list.length;
          storage.setItem("simo_builder_library_v5_1_builder_first", JSON.stringify(list));
          storage.setItem("simo_workspace_last_saved_item_v4", JSON.stringify(item));
          var immediateDedupe = dedupeOpenerLibraryById("immediate local save");
          if (immediateDedupe && immediateDedupe.after) afterCount = immediateDedupe.after;
          savedLocal = true;
        } catch (localErr) {
          try { console.warn("SIMO workspace local save failed:", localErr); } catch (e3) {}
        }

        // V1.3.17: local-first save guard.
        // The current local build was creating duplicate cards when the workspace saved locally
        // and then also synced the same item through the server/library path.
        // Keep the exact current workspace version local for now so one click creates one card.
        syncedServer = false;

        try {
          if (window.opener && !window.opener.closed) {
            window.opener.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { source: "clean-workspace-v1-r1044r", item: item, localCountBefore: beforeCount, localCountAfter: afterCount, serverSynced: syncedServer } }));
            if (window.opener.document) {
              window.opener.document.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { source: "clean-workspace-v1-r1044r", item: item, localCountBefore: beforeCount, localCountAfter: afterCount, serverSynced: syncedServer } }));
            }
          }
        } catch (eventErr) {}

        try {
          setTimeout(function () { dedupeOpenerLibraryById("post event refresh 250ms"); }, 250);
          setTimeout(function () { dedupeOpenerLibraryById("post event refresh 1200ms"); }, 1200);
        } catch (postDedupeErr) {}

        if (savedLocal && syncedServer) {
          setStatus("Saved once to local Library with duplicate guard active. Local count " + beforeCount + " → " + afterCount + ". Open Library/Refresh and the newest card should appear first.", "ok");
        } else if (syncedServer) {
          setStatus("Saved to server Library. Local browser count did not confirm, but server save succeeded. Open Library/Refresh and check for the newest card.", "ok");
        } else if (savedLocal) {
          setStatus("Saved to local Library. Server sync did not confirm. Local count " + beforeCount + " → " + afterCount + ". Open Library/Refresh and the newest local card should appear first.", "warn");
        } else {
          setStatus("Save did not confirm locally or on the server. Keep this workspace open and try Save again once before closing.", "bad");
        }
      }
      function restoreOriginal() {
        var src = DATA.originalSourceImage || DATA.originalImage || DATA.currentSourceImage || DATA.currentImage || "";
        DATA.edits = [];
        setImage(src, src, "restored original");
        setStatus("Restored original image in this workspace. Nothing was deleted from Library.", "ok");
      }
      function bind() {
        var apply = $("applyBtn");
        if (apply) {
          apply.addEventListener("click", function (e) { e.preventDefault(); applyEdit(); }, true);
          apply.addEventListener("pointerup", function (e) { e.preventDefault(); }, true);
        }
        var save = $("saveBtn");
        if (save) save.addEventListener("click", function (e) { e.preventDefault(); saveCurrent(); }, true);
        var restore = $("restoreBtn");
        if (restore) restore.addEventListener("click", function (e) { e.preventDefault(); restoreOriginal(); }, true);
        var prompt = $("prompt");
        if (prompt) {
          prompt.addEventListener("keydown", function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              applyEdit();
            }
          });
        }
        Array.prototype.forEach.call(document.querySelectorAll("[data-prompt]"), function (btn) {
          btn.addEventListener("click", function () { fillPrompt(btn.getAttribute("data-prompt") || ""); });
        });
        var zIn = $("zIn"), zOut = $("zOut"), zReset = $("zReset");
        if (zIn) zIn.addEventListener("click", function () { setZoom(zoom + 0.1); });
        if (zOut) zOut.addEventListener("click", function () { setZoom(zoom - 0.1); });
        if (zReset) zReset.addEventListener("click", function () { setZoom(1); });
      }
      function init() {
        var img = $("workspaceImage");
        if (img) img.src = absUrl(DATA.currentImage || DATA.image || DATA.currentSourceImage || DATA.sourceImage || "");
        var chips = $("chips");
        if (chips) {
          chips.innerHTML = PROMPTS.map(function (p) {
            return '<button type="button" class="chip" data-prompt="' + esc(p) + '">' + esc(p) + '</button>';
          }).join("");
        }
        bind();
        updateHistory();
        updateProof();
        try {
          var initialIntent = universalAnalyze(DATA.workspaceSubject || DATA.title || "current design");
          setProof("subject", initialIntent.subject || DATA.workspaceSubject || "current design", "ok");
          setProof("mode", initialIntent.mode || "image_edit", "ok");
        } catch (e) {}
        bindZoomLayerObserver();
        reinforceZoomLayer();
        setStatus("Clean Workspace V1.3.21 ready. Type a plain edit, click Apply, then the result becomes the next edit source.", "ok");
      }
      init();
    };

    var css = '' +
      'html,body{margin:0;min-height:100%;background:#06101f;color:#eef4ff;font-family:Inter,Segoe UI,Arial,sans-serif;}' +
      '*{box-sizing:border-box}' +
      '.shell{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;min-height:100vh;padding:16px;}' +
      '.stage,.side{border:1px solid rgba(255,255,255,.13);background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.035));box-shadow:0 24px 70px rgba(0,0,0,.38);border-radius:24px;overflow:hidden;}' +
      '.stage{position:relative;isolation:isolate;display:flex;align-items:center;justify-content:center;background:#050a14;min-height:calc(100vh - 32px);padding:24px;overflow:hidden;}' +
      '#workspaceImage{position:relative;z-index:1;display:block;max-width:100%;max-height:calc(100vh - 118px);object-fit:contain;border-radius:18px;transition:transform .18s ease;transform-origin:center center;}' +
      '.zoom{position:fixed;left:28px;top:28px;z-index:2147483647;display:flex;gap:8px;align-items:center;background:rgba(0,0,0,.56);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:8px;backdrop-filter:blur(12px);box-shadow:0 12px 40px rgba(0,0,0,.36);pointer-events:auto;}' +
      '.zoom button,.smallBtn{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#eef4ff;border-radius:999px;padding:8px 11px;font-weight:900;cursor:pointer;}' +
      '.zoom span{font-size:12px;color:#cbd8ee;font-weight:900;min-width:46px;text-align:center;}' +
      '.side{padding:18px;display:flex;flex-direction:column;gap:14px;}' +
      '.kicker{font-size:11px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;color:#8ee6ff;}' +
      'h1{font-size:24px;line-height:1.1;margin:0;}' +
      'p{margin:0;color:#c7d4eb;line-height:1.45;font-size:13px;}' +
      '.promptBox{display:grid;gap:9px;}' +
      'textarea{width:100%;min-height:112px;resize:vertical;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.24);border-radius:16px;color:#fff;padding:13px;font:500 14px/1.45 Inter,Segoe UI,Arial,sans-serif;outline:none;}' +
      'textarea:focus{border-color:rgba(96,229,255,.55);box-shadow:0 0 0 4px rgba(96,229,255,.10);}' +
      '.primary{border:0;border-radius:16px;background:linear-gradient(135deg,#5eead4,#60a5fa);color:#03101d;font-weight:1000;padding:13px 14px;cursor:pointer;box-shadow:0 14px 35px rgba(80,190,255,.22);}' +
      '.save{border:1px solid rgba(92,255,172,.35);border-radius:16px;background:rgba(92,255,172,.12);color:#dffff0;font-weight:950;padding:12px 13px;cursor:pointer;}' +
      '.danger{border:1px solid rgba(255,255,255,.16);border-radius:16px;background:rgba(255,255,255,.06);color:#eef4ff;font-weight:900;padding:11px 12px;cursor:pointer;}' +
      '.chips{display:flex;flex-wrap:wrap;gap:8px;}' +
      '.chip{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:#eaf2ff;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:850;cursor:pointer;text-align:left;}' +
      '.status{border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.06);padding:11px 12px;color:#dce8ff;line-height:1.4;font-size:13px;min-height:42px;}' +
      '.status.ok{border-color:rgba(92,255,172,.28);background:rgba(92,255,172,.09);}.status.warn{border-color:rgba(255,218,104,.30);background:rgba(255,218,104,.09);}.status.bad{border-color:rgba(255,107,107,.35);background:rgba(255,107,107,.10);}' +
      '.proof{display:grid;gap:7px;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:11px;background:rgba(0,0,0,.18);}' +
      '.proofRow{display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px;font-size:12px;align-items:start;}.proofKey{color:#9fb1ce;font-weight:900}.proofValue{color:#dce8ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.proofValue.ok{color:#7dffbf}.proofValue.warn{color:#ffdf78}.proofValue.bad{color:#ff9d9d}' +
      '.history{display:grid;gap:8px;max-height:170px;overflow:auto;padding-right:2px;}.empty{color:#8fa3c1;font-size:12px}.hist{border:1px solid rgba(255,255,255,.10);border-radius:13px;padding:9px;background:rgba(255,255,255,.04);display:grid;gap:4px}.hist b{font-size:12px;color:#96edff}.hist span{font-size:12px;color:#d9e5f6;line-height:1.35}' +
      '@media(max-width:980px){.shell{grid-template-columns:1fr}.stage{min-height:54vh}.side{min-height:auto}}';

    var chipsHtml = prompts.map(function (p) {
      return '<button type="button" class="chip" data-prompt="' + esc(p) + '">' + esc(p) + '</button>';
    }).join("");

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + esc(data.title) + ' — Simo Workspace</title><style>' + css + '</style></head><body>' +
      '<div class="shell"><main class="stage"><div class="zoom"><button id="zOut" type="button">−</button><span id="zText">100%</span><button id="zIn" type="button">+</button><button id="zReset" type="button">Reset</button></div><img id="workspaceImage" src="' + esc(data.currentImage || data.image || data.currentSourceImage) + '" alt="' + esc(data.title) + '"></main>' +
      '<aside class="side"><div class="kicker">SIMO CLEAN WORKSPACE R10.44R2 · UNIVERSAL ACTION LOCK LOADED</div><h1>' + esc(data.title) + '</h1><p>Prompt-first editor. Type what you want. Every successful edit becomes the source for the next edit.</p>' +
      '<div class="promptBox"><textarea id="prompt" placeholder="Example: make the finish brushed nickel, then I can keep editing from that result"></textarea><button id="applyBtn" class="primary" type="button">Apply Edit</button></div>' +
      '<button id="saveBtn" class="save" type="button">Save Current Version to Library</button><button id="restoreBtn" class="danger" type="button">Restore Original in This Workspace</button>' +
      '<div><p style="margin-bottom:8px;font-weight:900;color:#dce8ff;">Suggestion prompts</p><div id="chips" class="chips">' + chipsHtml + '</div></div>' +
      '<div id="status" class="status">Loading workspace...</div>' +
      '<div class="proof"><div class="proofRow"><div class="proofKey">Version</div><div class="proofValue" data-proof="phase">loading</div></div><div class="proofRow"><div class="proofKey">Subject</div><div class="proofValue" data-proof="subject">current design</div></div><div class="proofRow"><div class="proofKey">Intent target</div><div class="proofValue" data-proof="target">none yet</div></div><div class="proofRow"><div class="proofKey">Mode</div><div class="proofValue" data-proof="mode">image_edit</div></div><div class="proofRow"><div class="proofKey">Apply clicks</div><div class="proofValue" data-proof="apply">0</div></div><div class="proofRow"><div class="proofKey">Completed edits</div><div class="proofValue" data-proof="edits">0</div></div><div class="proofRow"><div class="proofKey">Current source</div><div class="proofValue" data-proof="source">loading</div></div><div class="proofRow"><div class="proofKey">Busy</div><div class="proofValue" data-proof="busy">no</div></div></div>' +
      '<div id="history" class="history"></div></aside></div>' +
      '<script>window.__SIMO_WORKSPACE_BOOTSTRAP__=' + dataJson + ';window.__SIMO_WORKSPACE_PROMPTS__=' + promptsJson + ';(' + workspaceRuntime.toString() + ')();<\/script></body></html>';

    var blob = new Blob([html], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    var win = window.open(url, "_blank", "width=1440,height=930,menubar=no,toolbar=no,location=no,status=no");
    if (!win) {
      try {
        var a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Open Simo Workspace";
        a.style.position = "fixed";
        a.style.right = "18px";
        a.style.bottom = "18px";
        a.style.zIndex = "2147483647";
        a.style.background = "linear-gradient(135deg,#5eead4,#60a5fa)";
        a.style.color = "#03101d";
        a.style.font = "900 14px/1 Inter,Segoe UI,Arial,sans-serif";
        a.style.padding = "14px 16px";
        a.style.borderRadius = "999px";
        a.style.boxShadow = "0 18px 50px rgba(0,0,0,.35)";
        a.style.textDecoration = "none";
        document.body.appendChild(a);
        setTimeout(function () { try { a.remove(); } catch (e) {} }, 30000);
      } catch (fallbackErr) {}
      alert("Popup blocked. I placed an Open Simo Workspace button at the bottom-right of the main page. You can also allow popups for 127.0.0.1:5000.");
      return false;
    }
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 60000);
    return true;
  }

  function openSavedItem(item) {
    item = item || {};
    if (item.workspaceData && typeof item.workspaceData === "object") {
      return openWorkspace(item.workspaceData);
    }
    return openWorkspace(item);
  }

  function openTab(item) {
    return openSavedItem(item);
  }

  var api = {
    phase: PHASE,
    open: openWorkspace,
    openWorkspace: openWorkspace,
    openSavedItem: openSavedItem,
    openTab: openTab,
    _makeLibraryItem: makeLibraryItem,
    _phase: PHASE
  };

  window.SimoLiveWorkspace = api;
  window.SimoLiveWorkspaceIsolated = api;
  window.SimoWorkspaceBridge = api;

  // Saved-library HTML buttons can call back into the main Simo tab.
  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-simo-workspace-open]") : null;
    if (!btn) return;
    try {
      var payload = JSON.parse(btn.getAttribute("data-simo-workspace-open") || "{}");
      openWorkspace(payload);
    } catch (err) {
      alert("Could not open this saved workspace design.");
    }
  }, true);

  try { console.log("[SIMO] " + PHASE + " loaded."); } catch (e) {}
}());
