import os
import json
import re
import base64
import sqlite3
import secrets
import datetime as dt

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    session,
    redirect,
    url_for,
    send_file,
    abort,
    Response,
)
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename

import stripe
from authlib.integrations.flask_client import OAuth
from openai import OpenAI

load_dotenv()


# =========================================================
# Helpers
# =========================================================
def env_bool(name: str, default: bool = False) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return str(val).strip().lower() in ("1", "true", "yes", "on")


def resolve_path(base_root: str, path_value: str, default_name: str) -> str:
    raw = (path_value or default_name or "").strip()
    if not raw:
        raw = default_name
    if os.path.isabs(raw):
        return raw
    return os.path.join(base_root, raw)


def utcnow() -> dt.datetime:
    return dt.datetime.utcnow()


def utcnow_z() -> str:
    return utcnow().isoformat() + "Z"


def allowed_image(filename: str) -> bool:
    if not filename:
        return False
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in {"png", "jpg", "jpeg", "webp", "gif"}


def sanitize_key(text: str) -> str:
    raw = str(text or "").strip().lower()
    out = []
    prev_underscore = False
    for ch in raw:
        if ch.isalnum():
            out.append(ch)
            prev_underscore = False
        else:
            if not prev_underscore:
                out.append("_")
                prev_underscore = True
    return "".join(out).strip("_")


def slugify(text: str) -> str:
    raw = str(text or "").strip().lower()
    out = []
    prev_dash = False

    for ch in raw:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        else:
            if not prev_dash:
                out.append("-")
                prev_dash = True

    slug = "".join(out).strip("-")
    return slug[:80] or "simo-build"


def is_hosted_model_url(url: str) -> bool:
    if not url:
        return False
    lowered = url.strip().lower()
    return (
        (lowered.startswith("http://") or lowered.startswith("https://"))
        and (".glb" in lowered or ".gltf" in lowered)
    )


def is_local_model_url(url: str) -> bool:
    if not url:
        return False
    lowered = url.strip().lower()
    return lowered.startswith("/static/models/") and (".glb" in lowered or ".gltf" in lowered)


def is_any_model_url(url: str) -> bool:
    return is_hosted_model_url(url) or is_local_model_url(url)


def normalize_model_url(url: str) -> str:
    raw = str(url or "").strip().rstrip("),.; ")
    if not raw:
        return ""

    lowered = raw.lower()
    if lowered.startswith("http://") or lowered.startswith("https://"):
        return raw
    if lowered.startswith("/static/models/"):
        return raw
    if lowered.startswith("static/models/"):
        return "/" + raw.lstrip("/")

    if lowered.endswith(".glb") or lowered.endswith(".gltf"):
        filename = os.path.basename(raw.replace("\\", "/"))
        return f"/static/models/{filename}"

    return raw


def prettify_model_name(name: str) -> str:
    raw = str(name or "").strip()
    if not raw:
        return "3D model"
    return raw.replace("_", " ").replace("-", " ").strip().title()


def safe_json_loads(raw: str, fallback):
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def clean_choice_label(label: str, object_name: str = "") -> str:
    text = prettify_model_name(label or "")
    obj = prettify_model_name(object_name or "")

    if not text:
        return obj or "3D Model"

    low = text.lower()
    obj_low = obj.lower()

    if obj and low == obj_low:
        return obj

    if "fallback" in low:
        return f"{obj} Fallback" if obj else "Fallback"

    return text


def parse_labeled_env_choices(value: str, object_name: str):
    raw = str(value or "").strip()
    if not raw:
        return []

    out = []
    parts = [p.strip() for p in raw.split("|") if p.strip()]
    pretty_obj = prettify_model_name(object_name)

    for idx, part in enumerate(parts, start=1):
        label = f"{pretty_obj} Option {idx}"
        url = part

        if "::" in part:
            maybe_label, maybe_url = part.split("::", 1)
            maybe_label = str(maybe_label or "").strip()
            maybe_url = normalize_model_url(maybe_url)
            if maybe_label:
                label = maybe_label
            url = maybe_url

        url = normalize_model_url(url)
        if url and is_any_model_url(url):
            out.append(
                {
                    "label": clean_choice_label(label, object_name),
                    "url": url,
                    "source": "candidate",
                    "verified": False,
                    "tier": "candidate",
                    "style": "default",
                }
            )

    return out


def parse_phase39_multi_env_choices(object_name: str):
    key = sanitize_key(object_name).upper()
    env_name = f"SIMO_3D_MULTI_{key}"
    raw = str(os.getenv(env_name, "") or "").strip()
    if not raw:
        return []

    out = []
    chunks = [c.strip() for c in raw.split(",") if c.strip()]
    pretty_obj = prettify_model_name(object_name)

    for idx, chunk in enumerate(chunks, start=1):
        parts = [str(p or "").strip() for p in chunk.split("|")]

        file_or_url = parts[0] if len(parts) > 0 else ""
        label = parts[1] if len(parts) > 1 and parts[1] else f"{pretty_obj} Option {idx}"
        tier = (parts[2] if len(parts) > 2 and parts[2] else "verified").strip().lower()
        style = (parts[3] if len(parts) > 3 and parts[3] else "default").strip().lower()

        url = normalize_model_url(file_or_url)
        if not url or not is_any_model_url(url):
            continue

        source = tier if tier in {"verified", "candidate", "fallback", "concept"} else "candidate"
        verified = source == "verified"

        out.append(
            {
                "label": clean_choice_label(label, object_name),
                "url": url,
                "source": source,
                "verified": verified,
                "tier": source,
                "style": style,
            }
        )

    return out


def extract_html_document(text: str) -> str:
    raw = str(text or "").strip()
    if not raw:
        return ""

    lowered = raw.lower()
    doctype_index = lowered.find("<!doctype html")
    html_index = lowered.find("<html")

    if doctype_index != -1:
        return raw[doctype_index:].strip()

    if html_index != -1:
        return raw[html_index:].strip()

    return ""


def title_from_prompt(user_text: str) -> str:
    text = str(user_text or "").strip()
    if not text:
        return "Simo Website"

    cleaned = text.replace("\n", " ").strip()
    if len(cleaned) > 60:
        cleaned = cleaned[:60].rstrip() + "..."
    return cleaned.title()


def detect_business_type(user_text: str) -> str:
    text = str(user_text or "").strip().lower()
    if not text:
        return "general"

    mapping = [
        ("bakery", ["bakery", "bread", "pastry", "cake", "dessert", "croissant", "sourdough"]),
        ("portfolio", ["portfolio", "personal brand", "designer portfolio", "developer portfolio", "creative portfolio", "resume site"]),
        ("saas", ["saas", "software", "startup", "app", "platform", "ai tool", "dashboard"]),
        ("agency", ["agency", "marketing agency", "creative agency", "studio", "consulting"]),
        ("restaurant", ["restaurant", "cafe", "coffee", "bistro", "food truck", "menu"]),
        ("real_estate", ["real estate", "realtor", "property", "listing"]),
        ("fitness", ["fitness", "gym", "coach", "trainer", "wellness"]),
        ("ecommerce", ["shop", "store", "ecommerce", "product page", "brand"]),
    ]

    for label, keywords in mapping:
        if any(k in text for k in keywords):
            return label

    return "general"


def build_fallback_html(user_text: str) -> str:
    kind = detect_business_type(user_text)
    page_title = title_from_prompt(user_text)

    if kind == "bakery":
        brand = "Golden Crust Bakery"
        sub = "Freshly baked breads, pastries, cakes, and sweet moments made daily."
        cards = [
            ("Artisan Bread", "Crusty, warm, handcrafted loaves baked each morning."),
            ("Signature Cakes", "Beautiful custom cakes for birthdays, weddings, and celebrations."),
            ("Butter Pastries", "Croissants, danishes, muffins, and flaky favorites."),
            ("Warm Cookies", "Soft, chewy, small-batch treats everyone remembers."),
        ]
        section_two_title = "Why People Come Back"
        section_two_text = "We blend old-world baking traditions with modern presentation and warm neighborhood service."
        cta = "Order Fresh Today"
    elif kind == "portfolio":
        brand = "Ava Carter Portfolio"
        sub = "A polished digital portfolio for showcasing work, services, case studies, and contact."
        cards = [
            ("Featured Work", "Highlight signature projects with visuals and clear results."),
            ("About", "Tell your story with confidence and personality."),
            ("Services", "Present what you do in a clean, premium way."),
            ("Contact", "Make it easy for clients or collaborators to reach out."),
        ]
        section_two_title = "Built To Impress"
        section_two_text = "This layout is designed to look premium, clear, and professional on desktop and mobile."
        cta = "View Projects"
    elif kind == "saas":
        brand = "NovaFlow"
        sub = "A modern SaaS landing page designed to explain value fast and drive signups."
        cards = [
            ("Fast Setup", "Get started in minutes with an onboarding flow users can follow."),
            ("Smart Automation", "Reduce repetitive work with powerful workflow logic."),
            ("Live Insights", "See trends, activity, and growth from one dashboard."),
            ("Team Ready", "Collaborate across teams with a polished workspace."),
        ]
        section_two_title = "Why It Converts"
        section_two_text = "Clear hierarchy, premium styling, and a confident call-to-action help turn visitors into users."
        cta = "Start Free"
    elif kind == "agency":
        brand = "Northline Creative"
        sub = "A premium agency landing page built to showcase services, case studies, and confidence."
        cards = [
            ("Brand Strategy", "Sharper positioning for products and businesses."),
            ("Web Design", "Beautiful websites built for clarity and conversion."),
            ("Content Systems", "Messaging and assets that support growth."),
            ("Launch Support", "Practical rollout help from concept to live site."),
        ]
        section_two_title = "Creative With Direction"
        section_two_text = "This page structure helps visitors understand your offer quickly and trust your brand faster."
        cta = "Book A Call"
    elif kind == "restaurant":
        brand = "Luna Table"
        sub = "A stylish restaurant page for reservations, menu highlights, and atmosphere."
        cards = [
            ("Chef Specials", "Feature the dishes people talk about first."),
            ("Reservations", "Help guests book quickly and confidently."),
            ("Events", "Promote private dining, tastings, and special nights."),
            ("Atmosphere", "Use elegant visuals and copy to set the tone."),
        ]
        section_two_title = "Designed To Feel Inviting"
        section_two_text = "The layout balances warmth, confidence, and easy navigation so guests know exactly where to go next."
        cta = "Reserve A Table"
    elif kind == "fitness":
        brand = "Elevate Fitness"
        sub = "A strong, clean fitness page for coaches, gyms, programs, and member signups."
        cards = [
            ("Programs", "Show structured training paths people can understand fast."),
            ("Coaching", "Present your expertise and one-on-one guidance."),
            ("Results", "Highlight momentum, transformations, and testimonials."),
            ("Membership", "Drive simple action with strong CTA placement."),
        ]
        section_two_title = "Built For Action"
        section_two_text = "The structure is made to motivate, guide, and convert visitors without clutter."
        cta = "Join Now"
    elif kind == "ecommerce":
        brand = "Velora Studio"
        sub = "A clean ecommerce-style landing page built to feature products and drive sales."
        cards = [
            ("Best Sellers", "Spotlight the products visitors should see first."),
            ("Brand Story", "Give the store a stronger identity and emotional pull."),
            ("Fast Shipping", "Reassure buyers with clear service messaging."),
            ("Easy Checkout", "Guide customers from interest to purchase smoothly."),
        ]
        section_two_title = "Built To Sell Cleanly"
        section_two_text = "A polished hierarchy and clean card layout help products feel more premium and easier to trust."
        cta = "Shop Now"
    else:
        brand = "Simo Studio"
        sub = "A modern responsive website generated inside Simo with clean sections, strong layout, and premium styling."
        cards = [
            ("Modern Layout", "A polished structure that feels clean and intentional."),
            ("Responsive Design", "Built to adapt smoothly across desktop and mobile."),
            ("Clear Messaging", "Simple hierarchy that helps visitors understand the offer."),
            ("Strong CTA", "A focused call-to-action that gives the page momentum."),
        ]
        section_two_title = "A Better Starting Point"
        section_two_text = "When AI output is inconsistent, Simo can still deliver a clean, preview-ready page instead of a blank result."
        cta = "Get Started"

    card_html = "\n".join(
        [
            f"""
        <div class=\"card\">
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
        """.strip()
            for title, desc in cards
        ]
    )

    return f"""<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>{brand}</title>
  <style>
    :root {{
      --bg: #0b1020;
      --bg2: #121a31;
      --text: #eef4ff;
      --muted: #b8c6e3;
      --line: rgba(255,255,255,.10);
      --card: rgba(255,255,255,.06);
      --blue: #6ea8ff;
      --purple: #b982ff;
      --pink: #ff9acb;
      --shadow: 0 20px 60px rgba(0,0,0,.30);
    }}
    * {{ box-sizing: border-box; }}
    html, body {{ margin: 0; padding: 0; }}
    body {{
      font-family: Arial, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(110,168,255,.18), transparent 30%),
        radial-gradient(circle at top right, rgba(185,130,255,.16), transparent 28%),
        linear-gradient(180deg, var(--bg), var(--bg2));
      color: var(--text);
      line-height: 1.5;
    }}
    .wrap {{
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
    }}
    header {{
      position: sticky;
      top: 0;
      z-index: 20;
      backdrop-filter: blur(10px);
      background: rgba(7,12,24,.60);
      border-bottom: 1px solid var(--line);
    }}
    .nav {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 0;
    }}
    .brand {{
      font-size: 22px;
      font-weight: 700;
      letter-spacing: .2px;
    }}
    .nav-links {{
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
    }}
    .nav-links a {{
      color: var(--muted);
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
    }}
    .hero {{
      padding: 82px 0 58px;
    }}
    .hero-grid {{
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 26px;
      align-items: center;
    }}
    .eyebrow {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,.06);
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 18px;
    }}
    h1 {{
      font-size: clamp(40px, 7vw, 68px);
      line-height: 1.03;
      margin: 0 0 16px;
      letter-spacing: -1.4px;
    }}
    .hero p {{
      margin: 0 0 28px;
      color: var(--muted);
      font-size: 18px;
      max-width: 700px;
    }}
    .actions {{
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }}
    .btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 0 18px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 700;
      border: 1px solid var(--line);
    }}
    .btn-primary {{
      color: white;
      background: linear-gradient(135deg, var(--blue), var(--purple));
      box-shadow: var(--shadow);
    }}
    .btn-secondary {{
      color: var(--text);
      background: rgba(255,255,255,.05);
    }}
    .hero-card {{
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 22px;
      box-shadow: var(--shadow);
    }}
    .hero-card-top {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
      color: var(--muted);
      font-size: 13px;
    }}
    .stat-grid {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0,1fr));
      gap: 14px;
    }}
    .stat {{
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 16px;
    }}
    .stat strong {{
      display: block;
      font-size: 24px;
      margin-bottom: 6px;
    }}
    .section {{
      padding: 24px 0 64px;
    }}
    .section h2 {{
      font-size: 34px;
      margin: 0 0 10px;
      letter-spacing: -.5px;
    }}
    .section-intro {{
      color: var(--muted);
      margin: 0 0 26px;
      max-width: 780px;
    }}
    .cards {{
      display: grid;
      grid-template-columns: repeat(4, minmax(0,1fr));
      gap: 18px;
    }}
    .card {{
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 22px;
      box-shadow: var(--shadow);
    }}
    .card h3 {{
      margin: 0 0 10px;
      font-size: 20px;
    }}
    .card p {{
      margin: 0;
      color: var(--muted);
    }}
    .feature-band {{
      margin-top: 10px;
      background: linear-gradient(135deg, rgba(110,168,255,.12), rgba(185,130,255,.12));
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 26px;
      box-shadow: var(--shadow);
    }}
    .feature-band p {{
      color: var(--muted);
      margin: 10px 0 0;
      max-width: 760px;
    }}
    footer {{
      padding: 28px 0 42px;
      color: var(--muted);
      border-top: 1px solid var(--line);
      margin-top: 18px;
    }}
    @media (max-width: 940px) {{
      .hero-grid {{
        grid-template-columns: 1fr;
      }}
      .cards {{
        grid-template-columns: repeat(2, minmax(0,1fr));
      }}
    }}
    @media (max-width: 640px) {{
      .nav {{
        align-items: flex-start;
        flex-direction: column;
      }}
      .cards {{
        grid-template-columns: 1fr;
      }}
      .hero {{
        padding-top: 56px;
      }}
    }}
  </style>
</head>
<body>
  <header>
    <div class=\"wrap nav\">
      <div class=\"brand\">{brand}</div>
      <nav class=\"nav-links\">
        <a href=\"#features\">Features</a>
        <a href=\"#about\">About</a>
        <a href=\"#contact\">Contact</a>
      </nav>
    </div>
  </header>

  <main class=\"wrap\">
    <section class=\"hero\">
      <div class=\"hero-grid\">
        <div>
          <div class=\"eyebrow\">Built inside Simo • Preview-ready HTML</div>
          <h1>{brand}</h1>
          <p>{sub}</p>
          <div class=\"actions\">
            <a class=\"btn btn-primary\" href=\"#contact\">{cta}</a>
            <a class=\"btn btn-secondary\" href=\"#features\">Explore More</a>
          </div>
        </div>

        <aside class=\"hero-card\">
          <div class=\"hero-card-top\">
            <span>Project</span>
            <span>{page_title}</span>
          </div>
          <div class=\"stat-grid\">
            <div class=\"stat\">
              <strong>Modern</strong>
              <span>Polished premium visual style</span>
            </div>
            <div class=\"stat\">
              <strong>Responsive</strong>
              <span>Designed for desktop and mobile</span>
            </div>
            <div class=\"stat\">
              <strong>Clear</strong>
              <span>Simple hierarchy and strong sections</span>
            </div>
            <div class=\"stat\">
              <strong>Ready</strong>
              <span>Safe fallback when AI output fails</span>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section id=\"features\" class=\"section\">
      <h2>Highlights</h2>
      <p class=\"section-intro\">A strong homepage starts with clean layout, confident messaging, and sections that feel intentional.</p>
      <div class=\"cards\">
        {card_html}
      </div>
    </section>

    <section id=\"about\" class=\"section\">
      <div class=\"feature-band\">
        <h2>{section_two_title}</h2>
        <p>{section_two_text}</p>
      </div>
    </section>

    <section id=\"contact\" class=\"section\">
      <h2>Let’s Connect</h2>
      <p class=\"section-intro\">This section gives your visitors a clear next step and keeps the page feeling complete and trustworthy.</p>
      <div class=\"actions\">
        <a class=\"btn btn-primary\" href=\"mailto:hello@example.com\">hello@example.com</a>
        <a class=\"btn btn-secondary\" href=\"tel:+15551234567\">(555) 123-4567</a>
      </div>
    </section>
  </main>

  <footer>
    <div class=\"wrap\">© 2026 {brand} — Generated by Simo.</div>
  </footer>
</body>
</html>"""


def normalize_builder_html(html: str, fallback_prompt: str = "") -> str:
    extracted = extract_html_document(html)
    if extracted:
        return extracted
    return build_fallback_html(fallback_prompt or html or "Simo Website")


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def safe_text_list(value):
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        text = normalize_whitespace(item)
        if text:
            out.append(text)
    return out[:24]


def unique_text_list(items):
    out = []
    seen = set()
    for item in items or []:
        text = normalize_whitespace(item)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    return out


def detect_html_sections(html: str):
    raw = str(html or "").lower()
    found = []

    section_patterns = [
        ("hero", [r"class=[\"'][^\"']*hero", r"id=[\"']hero[\"']", r"<hero"]),
        ("features", [r"id=[\"']features[\"']", r"class=[\"'][^\"']*features", r"highlights"]),
        ("about", [r"id=[\"']about[\"']", r"class=[\"'][^\"']*about"]),
        ("services", [r"id=[\"']services[\"']", r"class=[\"'][^\"']*services"]),
        ("pricing", [r"id=[\"']pricing[\"']", r"class=[\"'][^\"']*pricing"]),
        ("testimonials", [r"id=[\"']testimonials[\"']", r"class=[\"'][^\"']*testimonials", r"testimonial"]),
        ("faq", [r"id=[\"']faq[\"']", r"class=[\"'][^\"']*faq"]),
        ("contact", [r"id=[\"']contact[\"']", r"class=[\"'][^\"']*contact", r"mailto:"]),
        ("footer", [r"<footer", r"class=[\"'][^\"']*footer"]),
        ("navbar", [r"<nav", r"class=[\"'][^\"']*nav"]),
        ("gallery", [r"id=[\"']gallery[\"']", r"class=[\"'][^\"']*gallery"]),
        ("cta", [r"class=[\"'][^\"']*cta", r"call to action"]),
    ]

    for section_name, patterns in section_patterns:
        if any(re.search(pattern, raw) for pattern in patterns):
            found.append(section_name)

    return unique_text_list(found)


def detect_builder_edit_intents(user_text: str):
    text = normalize_whitespace(user_text).lower()
    intents = []

    intent_keywords = {
        "style": [
            "darker", "lighter", "luxury", "luxurious", "premium", "modern", "minimal",
            "bold", "cleaner", "sleeker", "softer", "warmer", "cooler", "elegant",
            "futuristic", "glow", "gradient", "dark mode", "light mode"
        ],
        "layout": [
            "layout", "spacing", "align", "center", "left align", "right align",
            "wider", "narrower", "bigger", "smaller", "rearrange", "balance",
            "more breathing room", "more padding", "tighten", "compact"
        ],
        "structure": [
            "add section", "new section", "remove section", "remove", "add a", "add an",
            "hero", "pricing", "testimonials", "faq", "contact form", "footer",
            "navbar", "header", "cards", "gallery", "features", "services"
        ],
        "content": [
            "rewrite", "copy", "headline", "subheadline", "text", "content",
            "wording", "messaging", "tagline", "cta text", "button text"
        ],
        "cta": [
            "cta", "call to action", "button", "buttons", "conversion", "signup",
            "book a call", "reserve", "start free", "shop now"
        ],
        "animation": [
            "animate", "animation", "animations", "motion", "hover", "microinteraction",
            "transition", "parallax"
        ],
        "enhancement": [
            "enhance", "upgrade", "improve", "polish", "refine", "take it further",
            "push it further", "make it better", "full upgrade"
        ],
        "theme": [
            "color", "colors", "palette", "font", "fonts", "typography", "theme"
        ],
    }

    for intent_name, keywords in intent_keywords.items():
        if any(keyword in text for keyword in keywords):
            intents.append(intent_name)

    if not intents and text:
        if len(text.split()) <= 16:
            intents.append("edit")

    return unique_text_list(intents)


def compact_builder_html_for_history(html: str) -> str:
    normalized = normalize_builder_html(html or "", "")
    title_match = re.search(r"<title>(.*?)</title>", normalized, flags=re.IGNORECASE | re.DOTALL)
    title = normalize_whitespace(title_match.group(1)) if title_match else "Untitled"
    sections = detect_html_sections(normalized)
    section_text = ", ".join(sections[:8]) if sections else "none detected"
    return f"[Builder HTML generated: {title}; sections: {section_text}]"


def compact_history_content(role: str, content: str) -> str:
    text = str(content or "").strip()
    if not text:
        return ""
    if role == "assistant":
        extracted = extract_html_document(text)
        if extracted:
            return compact_builder_html_for_history(extracted)
    return text


def infer_builder_meta(user_text: str, html: str, previous_meta=None):
    previous_meta = previous_meta if isinstance(previous_meta, dict) else {}
    text = normalize_whitespace(user_text)
    intents = detect_builder_edit_intents(text)
    sections = detect_html_sections(html)

    existing_styles = safe_text_list(previous_meta.get("style_tags", []))
    style_additions = []

    lower = text.lower()
    style_map = {
        "dark": ["dark", "darker", "dark mode"],
        "light": ["light", "lighter", "light mode"],
        "premium": ["premium", "luxury", "luxurious", "high-end", "elegant"],
        "modern": ["modern", "sleek", "clean", "minimal"],
        "bold": ["bold", "dramatic"],
        "animated": ["animation", "animations", "motion", "hover", "microinteraction"],
    }

    for label, keywords in style_map.items():
        if any(keyword in lower for keyword in keywords):
            style_additions.append(label)

    style_tags = unique_text_list(existing_styles + style_additions)

    last_intent = intents[0] if intents else str(previous_meta.get("last_intent", "") or "").strip()
    mode_hint = str(previous_meta.get("mode_hint", "") or "").strip()
    if "style" in intents or "theme" in intents:
        mode_hint = "visual"
    elif "structure" in intents or "layout" in intents:
        mode_hint = "layout"
    elif "content" in intents or "cta" in intents:
        mode_hint = "content"
    elif "enhancement" in intents or "animation" in intents:
        mode_hint = "upgrade"

    return {
        "last_intent": last_intent,
        "intent_tags": intents,
        "sections": sections,
        "style_tags": style_tags,
        "mode_hint": mode_hint,
        "updated_at": utcnow_z(),
    }


def builder_owner_key() -> str:
    email = (session.get("user_email") or "").strip().lower()
    if email:
        return f"user:{email}"

    anon = session.get("anon_id")
    if not anon:
        anon = secrets.token_hex(16)
        session["anon_id"] = anon
        session.modified = True
    return f"anon:{anon}"


def get_builder_db_state(owner_key: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM builder_state WHERE owner_key = ?", (owner_key,))
    row = cur.fetchone()
    conn.close()
    return row


def get_builder_session_state():
    owner_key = builder_owner_key()
    row = get_builder_db_state(owner_key)

    if not row:
        return {
            "active": False,
            "prompt": "",
            "origin_prompt": "",
            "html": "",
            "title": "",
            "mode": "",
            "preset": "",
            "revision": 0,
            "turn_count": 0,
            "last_request_kind": "",
            "updated_at": "",
            "history": [],
            "meta": {},
        }

    meta = safe_json_loads(row["builder_meta"] or "{}", {})
    if not isinstance(meta, dict):
        meta = {}

    history = safe_json_loads(row["builder_history"] or "[]", [])
    if not isinstance(history, list):
        history = []

    return {
        "active": bool(int(row["builder_active"] or 0)),
        "prompt": str(row["builder_last_prompt"] or "").strip(),
        "origin_prompt": str(row["builder_origin_prompt"] or "").strip(),
        "html": str(row["builder_last_html"] or "").strip(),
        "title": str(row["builder_last_title"] or "").strip(),
        "mode": str(row["builder_last_mode"] or "").strip(),
        "preset": str(row["builder_last_preset"] or "").strip(),
        "revision": int(row["builder_revision"] or 0),
        "turn_count": int(row["builder_turn_count"] or 0),
        "last_request_kind": str(row["builder_last_request_kind"] or "").strip(),
        "updated_at": str(row["builder_updated_at"] or "").strip(),
        "history": history,
        "meta": meta,
    }


def save_builder_db_state(state: dict):
    owner_key = builder_owner_key()
    now = utcnow().isoformat()

    builder_meta = state.get("meta", {})
    if not isinstance(builder_meta, dict):
        builder_meta = {}

    builder_history = state.get("history", [])
    if not isinstance(builder_history, list):
        builder_history = []

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM builder_state WHERE owner_key = ?", (owner_key,))
    row = cur.fetchone()

    payload = (
        owner_key,
        1 if state.get("active") else 0,
        str(state.get("prompt", "") or ""),
        str(state.get("origin_prompt", "") or ""),
        str(state.get("html", "") or ""),
        str(state.get("title", "") or ""),
        str(state.get("mode", "") or ""),
        str(state.get("preset", "") or ""),
        int(state.get("revision", 0) or 0),
        int(state.get("turn_count", 0) or 0),
        str(state.get("last_request_kind", "") or ""),
        str(state.get("updated_at", "") or ""),
        json.dumps(builder_meta),
        json.dumps(builder_history),
        now,
    )

    if row:
        cur.execute(
            """
            UPDATE builder_state
            SET builder_active = ?,
                builder_last_prompt = ?,
                builder_origin_prompt = ?,
                builder_last_html = ?,
                builder_last_title = ?,
                builder_last_mode = ?,
                builder_last_preset = ?,
                builder_revision = ?,
                builder_turn_count = ?,
                builder_last_request_kind = ?,
                builder_updated_at = ?,
                builder_meta = ?,
                builder_history = ?,
                updated_at = ?
            WHERE owner_key = ?
            """,
            (
                payload[1],
                payload[2],
                payload[3],
                payload[4],
                payload[5],
                payload[6],
                payload[7],
                payload[8],
                payload[9],
                payload[10],
                payload[11],
                payload[12],
                payload[13],
                payload[14],
                owner_key,
            ),
        )
    else:
        cur.execute(
            """
            INSERT INTO builder_state (
                owner_key,
                builder_active,
                builder_last_prompt,
                builder_origin_prompt,
                builder_last_html,
                builder_last_title,
                builder_last_mode,
                builder_last_preset,
                builder_revision,
                builder_turn_count,
                builder_last_request_kind,
                builder_updated_at,
                builder_meta,
                builder_history,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            payload + (now,),
        )

    conn.commit()
    conn.close()


def push_builder_history(entry: dict, existing_history=None):
    history = existing_history if isinstance(existing_history, list) else []
    history.append(entry)
    return history[-12:]


def extract_mode_and_preset(user_text: str):
    text = str(user_text or "")
    mode_match = re.search(r"(?im)^mode\s*:\s*(.+?)\s*$", text)
    preset_match = re.search(r"(?im)^style\s*:\s*(.+?)\s*$", text)

    mode = normalize_whitespace(mode_match.group(1)) if mode_match else ""
    preset = normalize_whitespace(preset_match.group(1)) if preset_match else ""
    return mode, preset


def strip_mode_and_preset_lines(user_text: str) -> str:
    text = str(user_text or "")
    text = re.sub(r"(?im)^mode\s*:\s*.+?$", "", text)
    text = re.sub(r"(?im)^style\s*:\s*.+?$", "", text)
    text = text.replace("[[SIMO_PHASE28_AUGMENTED]]", "")
    return text.strip()


def builder_state_summary(prior_state: dict) -> str:
    if not isinstance(prior_state, dict):
        return ""

    parts = []
    if prior_state.get("title"):
        parts.append(f"title={prior_state.get('title')}")
    if prior_state.get("revision"):
        parts.append(f"revision={prior_state.get('revision')}")
    if prior_state.get("turn_count"):
        parts.append(f"turns={prior_state.get('turn_count')}")
    if prior_state.get("last_request_kind"):
        parts.append(f"last_kind={prior_state.get('last_request_kind')}")
    return ", ".join(parts)


def should_reset_builder_context(user_text: str) -> bool:
    text = normalize_whitespace(user_text).lower()
    if not text:
        return False

    reset_phrases = [
        "start over",
        "reset builder",
        "clear builder",
        "new build from scratch",
        "new website from scratch",
        "forget the last website",
        "ignore the previous build",
        "wipe the builder",
        "reset the website",
        "reset this build",
        "scrap this build",
    ]
    return any(p in text for p in reset_phrases)


def save_builder_session_state(user_text: str, html: str, mode: str = "", preset: str = "", request_kind: str = ""):
    previous_state = get_builder_session_state()

    normalized_html = normalize_builder_html(html, user_text)
    clean_prompt = strip_mode_and_preset_lines(user_text)
    extracted_mode, extracted_preset = extract_mode_and_preset(user_text)

    previous_meta = previous_state.get("meta", {})
    if not isinstance(previous_meta, dict):
        previous_meta = {}

    previous_revision = int(previous_state.get("revision", 0) or 0)
    previous_turn_count = int(previous_state.get("turn_count", 0) or 0)
    previous_origin_prompt = str(previous_state.get("origin_prompt", "") or "").strip()
    previous_history = previous_state.get("history", [])
    if not isinstance(previous_history, list):
        previous_history = []

    builder_meta = infer_builder_meta(clean_prompt, normalized_html, previous_meta=previous_meta)
    revision = previous_revision + 1
    turn_count = previous_turn_count + 1
    now_z = utcnow_z()
    origin_prompt = previous_origin_prompt or clean_prompt

    builder_meta["revision"] = revision
    builder_meta["turn_count"] = turn_count
    builder_meta["last_request_kind"] = request_kind or ""
    builder_meta["origin_prompt"] = origin_prompt
    builder_meta["updated_at"] = now_z

    history = push_builder_history(
        {
            "revision": revision,
            "turn_count": turn_count,
            "request_kind": request_kind or "",
            "prompt": clean_prompt,
            "title": title_from_prompt(clean_prompt),
            "mode": mode or extracted_mode,
            "preset": preset or extracted_preset,
            "saved_at": now_z,
            "intent_tags": builder_meta.get("intent_tags", []),
            "sections": builder_meta.get("sections", []),
        },
        existing_history=previous_history,
    )

    save_builder_db_state(
        {
            "active": True,
            "prompt": clean_prompt,
            "origin_prompt": origin_prompt,
            "html": normalized_html,
            "title": title_from_prompt(clean_prompt),
            "mode": mode or extracted_mode,
            "preset": preset or extracted_preset,
            "revision": revision,
            "turn_count": turn_count,
            "last_request_kind": request_kind or "",
            "updated_at": now_z,
            "meta": builder_meta,
            "history": history,
        }
    )

    session["builder_active"] = True
    session["builder_last_title"] = title_from_prompt(clean_prompt)
    session.modified = True

    return normalized_html


def clear_builder_session_state():
    owner_key = builder_owner_key()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM builder_state WHERE owner_key = ?", (owner_key,))
    conn.commit()
    conn.close()

    session.pop("builder_active", None)
    session.pop("builder_last_title", None)
    session.modified = True


def detect_builder_upgrade_request(user_text: str) -> bool:
    text = normalize_whitespace(user_text).lower()
    if not text:
        return False

    phrases = [
        "enhance this",
        "enhance it",
        "upgrade this",
        "upgrade it",
        "make it premium",
        "make this premium",
        "make it more premium",
        "make it more modern",
        "make it luxurious",
        "make it more luxurious",
        "make it cleaner",
        "make it better",
        "improve this",
        "improve it",
        "polish this",
        "polish it",
        "refine this",
        "refine it",
        "take it further",
        "push it further",
        "make it look better",
        "make the design better",
        "full upgrade",
        "upgrade the design",
        "make it darker",
        "make it lighter",
        "add animations",
        "more animations",
    ]
    return any(p in text for p in phrases)


def is_builder_followup_request(user_text: str) -> bool:
    text = (user_text or "").strip().lower()
    if not text:
        return False

    if not get_builder_session_state().get("active"):
        return False

    if should_reset_builder_context(text):
        return False

    if detect_builder_upgrade_request(text):
        return True

    followup_phrases = [
        "make it",
        "change it",
        "update it",
        "edit it",
        "tweak it",
        "revise it",
        "redo it",
        "fix it",
        "improve it",
        "add a",
        "add an",
        "add ",
        "remove ",
        "use ",
        "switch ",
        "turn it",
        "move ",
        "replace ",
        "make the",
        "change the",
        "update the",
        "edit the",
        "fix the",
        "keep the",
        "instead of",
        "more modern",
        "more premium",
        "more luxurious",
        "more minimal",
        "more bold",
        "dark mode",
        "lighter",
        "bigger",
        "smaller",
        "center ",
        "left align",
        "right align",
        "new section",
        "cta",
        "hero",
        "pricing",
        "testimonials",
        "faq",
        "contact form",
        "navbar",
        "footer",
        "button",
        "headline",
        "colors",
        "fonts",
        "spacing",
        "layout",
    ]

    if any(text.startswith(p) for p in followup_phrases):
        return True

    if len(text.split()) <= 22 and any(
        token in text
        for token in [
            "section",
            "hero",
            "cta",
            "pricing",
            "testimonial",
            "testimonials",
            "faq",
            "footer",
            "navbar",
            "headline",
            "subheadline",
            "button",
            "color",
            "colors",
            "font",
            "fonts",
            "layout",
            "spacing",
            "card",
            "cards",
            "background",
            "premium",
            "modern",
            "luxury",
            "animation",
            "animate",
        ]
    ):
        return True

    return False


def builder_request_kind(user_text: str) -> str:
    if detect_builder_upgrade_request(user_text):
        return "enhance"
    if is_builder_followup_request(user_text):
        return "edit"
    return "build"


def build_builder_mode_context(user_text: str, prior_state: dict) -> str:
    mode, preset = extract_mode_and_preset(user_text)
    mode = mode or prior_state.get("mode", "")
    preset = preset or prior_state.get("preset", "")

    parts = []
    if mode:
        parts.append(f"Builder mode preference: {mode}.")
    if preset:
        parts.append(f"Visual preset preference: {preset}.")
    return "\n".join(parts).strip()


def build_builder_meta_context(prior_state: dict) -> str:
    meta = prior_state.get("meta", {})
    if not isinstance(meta, dict):
        meta = {}

    lines = []

    summary = builder_state_summary(prior_state)
    if summary:
        lines.append(f"Current builder state: {summary}.")

    last_intent = str(meta.get("last_intent", "") or "").strip()
    if last_intent:
        lines.append(f"Last detected edit intent: {last_intent}.")

    mode_hint = str(meta.get("mode_hint", "") or "").strip()
    if mode_hint:
        lines.append(f"Current editing mode tendency: {mode_hint}.")

    sections = safe_text_list(meta.get("sections", []))
    if sections:
        lines.append("Current page sections detected: " + ", ".join(sections) + ".")

    style_tags = safe_text_list(meta.get("style_tags", []))
    if style_tags:
        lines.append("Current visual/style direction detected: " + ", ".join(style_tags) + ".")

    return "\n".join(lines).strip()


def build_intent_specific_edit_guidance(user_text: str, request_kind: str, prior_state: dict) -> str:
    intents = detect_builder_edit_intents(user_text)
    meta = prior_state.get("meta", {}) if isinstance(prior_state.get("meta", {}), dict) else {}
    existing_sections = safe_text_list(meta.get("sections", []))

    lines = []

    if request_kind == "enhance":
        lines.append(
            "This is a full enhancement request. Strengthen the design in a meaningful way, not with a tiny cosmetic tweak."
        )
        lines.append(
            "Improve spacing, typography, hierarchy, card treatment, CTA clarity, section rhythm, and overall polish while keeping the same project direction."
        )

    if "style" in intents or "theme" in intents:
        lines.append(
            "Treat visual styling seriously: colors, contrast, typography, surfaces, depth, and polish should feel intentional and premium."
        )

    if "layout" in intents:
        lines.append(
            "You may improve alignment, spacing, section balance, container widths, and visual rhythm to make the page feel more refined."
        )

    if "structure" in intents:
        if existing_sections:
            lines.append(
                "Preserve the useful existing sections unless the requested structural change clearly calls for removing or reshaping one."
            )
        lines.append(
            "You may add, remove, or rearrange sections when that better fulfills the request."
        )

    if "content" in intents:
        lines.append(
            "Upgrade copy quality where helpful: headlines, supporting text, CTA wording, and section messaging should feel cleaner and more convincing."
        )

    if "cta" in intents:
        lines.append(
            "Make the call-to-action treatment stronger and clearer, with better emphasis and more confident wording."
        )

    if "animation" in intents:
        lines.append(
            "Use tasteful motion cues only. Keep them preview-safe, subtle, and compatible with a simple HTML preview."
        )

    if not lines:
        lines.append(
            "Apply the requested edit while preserving the strongest parts of the current page and improving the result where helpful."
        )

    return "\n".join(lines).strip()


def build_builder_edit_prompt(user_text: str, prior_state: dict, request_kind: str) -> str:
    clean_request = strip_mode_and_preset_lines(user_text)
    prior_prompt = prior_state.get("prompt", "")
    prior_html = normalize_builder_html(prior_state.get("html", ""), prior_prompt or clean_request)
    mode_context = build_builder_mode_context(user_text, prior_state)
    meta_context = build_builder_meta_context(prior_state)
    intent_guidance = build_intent_specific_edit_guidance(user_text, request_kind, prior_state)

    if request_kind == "enhance":
        intent_block = (
            "The user wants a full upgrade of the current page.\n"
            "You may improve styles, hierarchy, layout, sections, spacing, CTA treatment, visual polish, and tasteful motion cues if useful.\n"
            "Do not restart with a totally unrelated design. Evolve the current page into a clearly stronger premium version."
        )
    else:
        intent_block = (
            "The user wants changes applied to the current page.\n"
            "Preserve the good parts of the current build unless the requested change clearly benefits from a better section layout or stronger design structure.\n"
            "You are allowed to improve both design and layout when it helps fulfill the request better."
        )

    extra_parts = []
    if mode_context:
        extra_parts.append(mode_context)
    if meta_context:
        extra_parts.append(meta_context)
    if intent_guidance:
        extra_parts.append(intent_guidance)

    extra = "\n".join(extra_parts).strip()

    return (
        f"{intent_block}\n\n"
        f"{extra}\n\n"
        f"Original build request:\n{prior_state.get('origin_prompt') or prior_prompt or '(none)'}\n\n"
        f"Most recent build request:\n{prior_prompt or '(none)'}\n\n"
        f"Current HTML to edit:\n{prior_html}\n\n"
        f"New request:\n{clean_request}"
    )


def generate_builder_html(user_text: str, client, prior_state: dict = None) -> str:
    prior_state = prior_state or {}
    request_kind = builder_request_kind(user_text)
    clean_user_text = strip_mode_and_preset_lines(user_text)
    mode_context = build_builder_mode_context(user_text, prior_state)
    meta_context = build_builder_meta_context(prior_state)
    intent_guidance = build_intent_specific_edit_guidance(user_text, request_kind, prior_state)

    if client:
        system_user_text = clean_user_text
        extra_parts = [part for part in [mode_context, meta_context, intent_guidance] if part]
        if extra_parts:
            system_user_text = "\n\n".join(extra_parts + [clean_user_text])

        messages = [{"role": "system", "content": builder_system_prompt(system_user_text)}]

        if prior_state.get("prompt") or prior_state.get("html"):
            messages.append(
                {
                    "role": "user",
                    "content": build_builder_edit_prompt(user_text, prior_state, request_kind),
                }
            )
        else:
            direct_request = clean_user_text
            if extra_parts:
                direct_request = "\n\n".join(extra_parts + [f"User request:\n{clean_user_text}"])
            messages.append({"role": "user", "content": direct_request})

        raw = ""
        try:
            resp = client.responses.create(
                model=OPENAI_MODEL,
                input=messages,
            )
            raw = extract_first_text_from_openai_response(resp)
        except Exception:
            try:
                resp = client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=messages,
                )
                raw = extract_first_text_from_openai_response(resp)
            except Exception:
                raw = ""

        html = extract_html_document(raw)
        if html:
            return html

    fallback_prompt = clean_user_text
    if prior_state.get("prompt"):
        if request_kind == "enhance":
            fallback_prompt = f"{prior_state.get('prompt', '')}. Full upgrade request: {clean_user_text}"
        else:
            fallback_prompt = f"{prior_state.get('prompt', '')}. Update request: {clean_user_text}"
    return build_fallback_html(fallback_prompt)


# =========================================================
# Paths / env
# =========================================================
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

TEMPLATES_DIR = resolve_path(BASE_DIR, os.getenv("TEMPLATES_DIR"), "templates")
STATIC_DIR = resolve_path(BASE_DIR, os.getenv("STATIC_DIR"), "static")
UPLOAD_DIR = resolve_path(BASE_DIR, os.getenv("UPLOAD_DIR"), "uploads")
PUBLISHED_DIR = resolve_path(BASE_DIR, os.getenv("PUBLISHED_DIR"), "published")
DB_PATH = resolve_path(BASE_DIR, os.getenv("DB_PATH"), "simo.db")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PUBLISHED_DIR, exist_ok=True)

APP_SECRET = os.getenv("FLASK_SECRET_KEY") or os.getenv("SECRET_KEY") or secrets.token_hex(32)
BASE_URL = (os.getenv("BASE_URL") or "").strip().rstrip("/")

OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
OPENAI_MODEL = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()

STRIPE_SECRET_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
STRIPE_PUBLISHABLE_KEY = (os.getenv("STRIPE_PUBLISHABLE_KEY") or "").strip()
STRIPE_PRICE_ID = (os.getenv("STRIPE_PRICE_ID") or "").strip()
STRIPE_WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()

GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
GOOGLE_CLIENT_SECRET = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()

FREE_DAILY_LIMIT = int(os.getenv("FREE_DAILY_LIMIT", "50"))

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


# =========================================================
# App
# =========================================================
app = Flask(
    __name__,
    template_folder=TEMPLATES_DIR,
    static_folder=STATIC_DIR,
    static_url_path="/static",
)

app.secret_key = APP_SECRET
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    MAX_CONTENT_LENGTH=20 * 1024 * 1024,
)

if env_bool("SESSION_COOKIE_SECURE", False):
    app.config["SESSION_COOKIE_SECURE"] = True


# =========================================================
# OAuth
# =========================================================
oauth = OAuth(app)

if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


# =========================================================
# DB
# =========================================================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            name TEXT,
            google_sub TEXT,
            pro INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_key TEXT,
            day_key TEXT,
            count INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT,
            UNIQUE(user_key, day_key)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS published_pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE,
            title TEXT,
            html TEXT,
            source_text TEXT,
            owner_email TEXT,
            created_at TEXT,
            updated_at TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS builder_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_key TEXT UNIQUE,
            builder_active INTEGER DEFAULT 0,
            builder_last_prompt TEXT,
            builder_origin_prompt TEXT,
            builder_last_html TEXT,
            builder_last_title TEXT,
            builder_last_mode TEXT,
            builder_last_preset TEXT,
            builder_revision INTEGER DEFAULT 0,
            builder_turn_count INTEGER DEFAULT 0,
            builder_last_request_kind TEXT,
            builder_updated_at TEXT,
            builder_meta TEXT,
            builder_history TEXT,
            created_at TEXT,
            updated_at TEXT
        )
        """
    )

    conn.commit()
    conn.close()


def upsert_user(email: str, name: str = "", google_sub: str = ""):
    email = (email or "").strip().lower()
    name = (name or "").strip()
    google_sub = (google_sub or "").strip()

    if not email:
        return

    now = utcnow().isoformat()

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM users WHERE email = ?", (email,))
    row = cur.fetchone()

    if row:
        cur.execute(
            """
            UPDATE users
            SET name = ?, google_sub = ?, updated_at = ?
            WHERE email = ?
            """,
            (name, google_sub, now, email),
        )
    else:
        cur.execute(
            """
            INSERT INTO users (email, name, google_sub, pro, created_at, updated_at)
            VALUES (?, ?, ?, 0, ?, ?)
            """,
            (email, name, google_sub, now, now),
        )

    conn.commit()
    conn.close()


def get_user_by_email(email: str):
    email = (email or "").strip().lower()
    if not email:
        return None

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (email,))
    row = cur.fetchone()
    conn.close()
    return row


def set_user_pro(email: str, is_pro: bool):
    email = (email or "").strip().lower()
    if not email:
        return

    now = utcnow().isoformat()

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE users
        SET pro = ?, updated_at = ?
        WHERE email = ?
        """,
        (1 if is_pro else 0, now, email),
    )
    conn.commit()
    conn.close()


def current_user_email() -> str:
    return (session.get("user_email") or "").strip().lower()


def current_user_name() -> str:
    return (session.get("user_name") or "").strip()


def is_logged_in() -> bool:
    return bool(current_user_email())


def is_pro_user() -> bool:
    email = current_user_email()
    if not email:
        return False

    row = get_user_by_email(email)
    return bool(row and int(row["pro"]) == 1)


def user_key_for_limits() -> str:
    email = current_user_email()
    if email:
        return f"user:{email}"

    anon = session.get("anon_id")
    if not anon:
        anon = secrets.token_hex(16)
        session["anon_id"] = anon

    return f"anon:{anon}"


def get_today_key() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d")


def get_daily_usage_count(user_key: str, day_key: str) -> int:
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT count FROM usage_log WHERE user_key = ? AND day_key = ?",
        (user_key, day_key),
    )
    row = cur.fetchone()
    conn.close()
    return int(row["count"]) if row else 0


def increment_daily_usage(user_key: str, day_key: str) -> int:
    now = utcnow().isoformat()

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "SELECT count FROM usage_log WHERE user_key = ? AND day_key = ?",
        (user_key, day_key),
    )
    row = cur.fetchone()

    if row:
        new_count = int(row["count"]) + 1
        cur.execute(
            """
            UPDATE usage_log
            SET count = ?, updated_at = ?
            WHERE user_key = ? AND day_key = ?
            """,
            (new_count, now, user_key, day_key),
        )
    else:
        new_count = 1
        cur.execute(
            """
            INSERT INTO usage_log (user_key, day_key, count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_key, day_key, new_count, now, now),
        )

    conn.commit()
    conn.close()
    return new_count


def get_published_page_by_slug(slug: str):
    clean_slug = slugify(slug)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM published_pages WHERE slug = ?", (clean_slug,))
    row = cur.fetchone()
    conn.close()
    return row


def upsert_published_page(slug: str, title: str, html: str, source_text: str = "", owner_email: str = ""):
    clean_slug = slugify(slug)
    title = str(title or "Untitled Build").strip() or "Untitled Build"
    html = str(html or "")
    source_text = str(source_text or "")
    owner_email = str(owner_email or "").strip().lower()
    now = utcnow().isoformat()

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM published_pages WHERE slug = ?", (clean_slug,))
    row = cur.fetchone()

    if row:
        cur.execute(
            """
            UPDATE published_pages
            SET title = ?, html = ?, source_text = ?, owner_email = ?, updated_at = ?
            WHERE slug = ?
            """,
            (title, html, source_text, owner_email, now, clean_slug),
        )
    else:
        cur.execute(
            """
            INSERT INTO published_pages (slug, title, html, source_text, owner_email, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (clean_slug, title, html, source_text, owner_email, now, now),
        )

    conn.commit()
    conn.close()
    return clean_slug


init_db()


# =========================================================
# OpenAI helpers
# =========================================================
def get_client():
    if not OPENAI_API_KEY:
        return None
    return OpenAI(api_key=OPENAI_API_KEY)


def extract_first_text_from_openai_response(resp) -> str:
    try:
        if hasattr(resp, "output_text") and resp.output_text:
            return str(resp.output_text).strip()
    except Exception:
        pass

    try:
        if hasattr(resp, "choices") and resp.choices:
            msg = resp.choices[0].message
            if hasattr(msg, "content") and msg.content:
                return str(msg.content).strip()
    except Exception:
        pass

    try:
        parts = []
        for item in getattr(resp, "output", []) or []:
            for content in getattr(item, "content", []) or []:
                if getattr(content, "type", "") == "output_text":
                    parts.append(getattr(content, "text", ""))
        text = "\n".join([p for p in parts if p]).strip()
        if text:
            return text
    except Exception:
        pass

    return "I’m sorry, something went wrong while generating a response."


# =========================================================
# System prompt
# =========================================================
SYSTEM_PROMPT = """You are Simo, a warm, smart, non-judgmental best-friend style AI assistant.
You are helpful, emotionally aware, direct, and practical.
Avoid robotic filler.
When users ask for build, design, app, website, startup, game, 3D, music, creator, or visual help, be capable and concrete.
Keep answers useful and grounded.
Only mention a 3D model URL if it is actually verified and provided to you.
Do not claim that a model exists unless it is truly available.
If no verified 3D model exists, be honest and say so clearly.
When a verified 3D model exists, keep the reply very short and natural.
"""


# =========================================================
# Verified 3D catalog
# =========================================================
def load_verified_3d_models():
    raw = (os.getenv("VERIFIED_3D_MODELS") or "").strip()
    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return {}

        cleaned = {}
        for key, value in parsed.items():
            k = str(key or "").strip().lower()
            v = normalize_model_url(value)
            if k and is_any_model_url(v):
                cleaned[k] = v
        return cleaned
    except Exception:
        return {}


DEFAULT_VERIFIED_3D_MODELS = {
    "astronaut": "https://raw.githubusercontent.com/google/model-viewer/master/packages/shared-assets/models/Astronaut.glb",
    "robot": "https://raw.githubusercontent.com/google/model-viewer/master/packages/shared-assets/models/RobotExpressive.glb",
    "horse": "https://raw.githubusercontent.com/google/model-viewer/master/packages/shared-assets/models/Horse.glb",
    "helmet": "https://raw.githubusercontent.com/google/model-viewer/master/packages/shared-assets/models/DamagedHelmet.glb",
}

VERIFIED_3D_MODELS = {
    **DEFAULT_VERIFIED_3D_MODELS,
    **load_verified_3d_models(),
}


# =========================================================
# Candidate source lane
# =========================================================
DEFAULT_CANDIDATE_ASSETS = {
    "dog": [
        {
            "title": "Dog Fallback",
            "url": VERIFIED_3D_MODELS.get("horse", ""),
            "source": "fallback",
            "verified": False,
            "tier": "fallback",
            "style": "fallback",
        }
    ],
    "tiger": [
        {
            "title": "Tiger Fallback",
            "url": VERIFIED_3D_MODELS.get("horse", ""),
            "source": "fallback",
            "verified": False,
            "tier": "fallback",
            "style": "fallback",
        }
    ],
    "house": [
        {
            "title": "House Fallback",
            "url": VERIFIED_3D_MODELS.get("helmet", ""),
            "source": "fallback",
            "verified": False,
            "tier": "fallback",
            "style": "fallback",
        }
    ],
    "car": [],
    "spaceship": [],
}

CANDIDATE_ASSETS = DEFAULT_CANDIDATE_ASSETS.copy()
env_candidate_assets = safe_json_loads(os.getenv("CANDIDATE_3D_ASSETS", "").strip(), {})
if isinstance(env_candidate_assets, dict):
    for key, value in env_candidate_assets.items():
        if isinstance(value, list):
            CANDIDATE_ASSETS[str(key).strip().lower()] = value


# =========================================================
# Routing maps
# =========================================================
EXACT_MATCHES = {
    "astronaut": "astronaut",
    "space suit": "astronaut",
    "spacesuit": "astronaut",
    "spaceman": "astronaut",
    "space man": "astronaut",
    "cosmonaut": "astronaut",
    "robot": "robot",
    "android": "robot",
    "bot": "robot",
    "mech": "robot",
    "humanoid robot": "robot",
    "horse": "horse",
    "pony": "horse",
    "stallion": "horse",
    "mare": "horse",
    "dog": "dog",
    "puppy": "dog",
    "canine": "dog",
    "tiger": "tiger",
    "big cat": "tiger",
    "helmet": "helmet",
    "house": "house",
    "home": "house",
    "building": "house",
    "cabin": "house",
    "mansion": "house",
    "villa": "house",
    "spaceship": "spaceship",
    "space ship": "spaceship",
    "spacecraft": "spaceship",
    "rocket": "spaceship",
    "car": "car",
    "vehicle": "car",
    "truck": "truck",
    "plane": "plane",
    "airplane": "plane",
    "jet": "plane",
}

OBJECT_FALLBACKS = {
    "dog": "horse",
    "tiger": "horse",
    "house": "helmet",
    "astronaut": "astronaut",
    "robot": "robot",
}

CATEGORY_FALLBACKS = {
    "human": "astronaut",
    "character": "robot",
    "animal": "horse",
}

CATEGORY_KEYWORDS = {
    "human": [
        "human", "person", "man", "woman", "boy", "girl", "people", "worker", "human model"
    ],
    "character": [
        "character", "robotic", "android", "humanoid", "cyborg", "game character"
    ],
    "animal": [
        "animal", "dog", "cat", "wolf", "tiger", "lion", "bear", "deer", "creature"
    ],
    "building": [
        "house", "home", "building", "cabin", "mansion", "apartment", "villa", "garage"
    ],
    "vehicle": [
        "car", "vehicle", "truck", "van", "plane", "airplane", "jet", "fighter", "spaceship", "rocket"
    ],
    "furniture": [
        "chair", "table", "desk", "couch", "sofa", "bed", "lamp", "shelf"
    ],
}

CONCEPT_KEYWORDS = [
    "design me",
    "create me",
    "make me",
    "build me",
    "custom",
    "concept",
    "editable",
    "edit the 3d",
    "edit this 3d",
    "3 bedroom",
    "4 bedroom",
    "garage",
    "floor plan",
    "floorplan",
    "modern home",
    "sports car",
    "music video",
    "record my music",
    "record audio",
    "music creator",
    "make a song",
    "create a beat",
    "music production",
]


# =========================================================
# Model choice helpers
# =========================================================
SOURCE_PRIORITY = {
    "verified": 0,
    "candidate": 1,
    "fallback": 2,
    "concept": 3,
}


def make_model_choice(
    label: str,
    url: str,
    source: str = "candidate",
    verified: bool = False,
    tier: str = None,
    style: str = "default",
):
    clean_url = normalize_model_url(url)
    clean_source = str(source or "candidate").strip().lower()
    clean_tier = str(tier or clean_source or "candidate").strip().lower()
    clean_style = str(style or "default").strip().lower()

    return {
        "label": prettify_model_name(label),
        "url": clean_url,
        "source": clean_source,
        "verified": bool(verified) and clean_source == "verified" and is_any_model_url(clean_url),
        "tier": clean_tier,
        "style": clean_style,
    }


def dedupe_model_choices(choices):
    seen = set()
    out = []

    if not isinstance(choices, list):
        return out

    for item in choices:
        if not isinstance(item, dict):
            continue

        url = normalize_model_url(item.get("url", ""))
        if not url or not is_any_model_url(url):
            continue
        if url in seen:
            continue

        source = str(item.get("source") or "candidate").strip().lower()
        verified = bool(item.get("verified", False)) and source == "verified"

        seen.add(url)
        out.append(
            {
                "label": prettify_model_name(item.get("label") or item.get("title") or "3D model"),
                "url": url,
                "source": source,
                "verified": verified,
                "tier": str(item.get("tier") or source or "candidate").strip().lower(),
                "style": str(item.get("style") or "default").strip().lower(),
            }
        )

    return out


def sort_model_choices(choices):
    return sorted(
        choices,
        key=lambda item: (
            SOURCE_PRIORITY.get(str(item.get("source") or "candidate"), 9),
            0 if bool(item.get("verified", False)) else 1,
            str(item.get("label") or ""),
        ),
    )


def postprocess_choice_labels(object_name: str, choices):
    out = []
    for item in choices or []:
        source = str(item.get("source") or "candidate").strip().lower()
        out.append(
            {
                **item,
                "label": clean_choice_label(item.get("label") or "", object_name),
                "source": source,
                "verified": bool(item.get("verified", False)) and source == "verified",
                "tier": str(item.get("tier") or source or "candidate").strip().lower(),
                "style": str(item.get("style") or "default").strip().lower(),
            }
        )
    return sort_model_choices(dedupe_model_choices(out))


def get_phase39_multi_choices_for_object(object_name: str):
    key = str(object_name or "").strip().lower()
    if not key:
        return []
    return postprocess_choice_labels(key, parse_phase39_multi_env_choices(key))


def get_verified_choices_for_object(object_name: str):
    key = str(object_name or "").strip().lower()
    if not key:
        return []

    url = normalize_model_url(VERIFIED_3D_MODELS.get(key, ""))
    if not url or not is_any_model_url(url):
        return []

    return [
        make_model_choice(
            label=prettify_model_name(key),
            url=url,
            source="verified",
            verified=True,
            tier="verified",
            style="default",
        )
    ]


def normalize_candidate_item(object_name: str, item):
    if not isinstance(item, dict):
        return None

    url = normalize_model_url(item.get("url", ""))
    title = str(item.get("title") or item.get("label") or prettify_model_name(object_name))
    source = str(item.get("source") or "candidate").strip().lower()
    tier = str(item.get("tier") or source or "candidate").strip().lower()
    style = str(item.get("style") or "default").strip().lower()

    if not url or not is_any_model_url(url):
        return None

    verified = bool(item.get("verified", False)) and source == "verified"

    return {
        "label": prettify_model_name(title),
        "url": url,
        "source": source,
        "verified": verified,
        "tier": tier,
        "style": style,
    }


def get_candidate_assets_for_object(object_name: str):
    key = str(object_name or "").strip().lower()
    if not key:
        return []

    out = []

    env_key = f"MODEL3D_CANDIDATE_{key.upper()}"
    labeled_env_choices = parse_labeled_env_choices(os.getenv(env_key, ""), key)
    out.extend(labeled_env_choices)

    raw = CANDIDATE_ASSETS.get(key, [])
    if isinstance(raw, list):
        for item in raw:
            normalized = normalize_candidate_item(key, item)
            if normalized:
                out.append(normalized)

    return sort_model_choices(dedupe_model_choices(out))


def relabel_choices_for_object(object_name: str, choices, source: str):
    relabeled = []
    pretty_obj = prettify_model_name(object_name)

    for idx, item in enumerate(choices or [], start=1):
        relabeled.append(
            {
                "label": f"{pretty_obj} Fallback" if idx == 1 else f"{pretty_obj} Fallback {idx}",
                "url": item.get("url", ""),
                "source": source,
                "verified": False,
                "tier": "fallback",
                "style": "fallback",
            }
        )
    return sort_model_choices(dedupe_model_choices(relabeled))


def get_object_fallback_choices(object_name: str):
    key = str(object_name or "").strip().lower()
    fallback_key = OBJECT_FALLBACKS.get(key)
    if not fallback_key:
        return []

    multi_choices = get_phase39_multi_choices_for_object(fallback_key)
    preferred_multi = [c for c in multi_choices if c.get("source") == "verified"]
    if preferred_multi:
        return relabel_choices_for_object(key, preferred_multi, "fallback")

    verified_choices = get_verified_choices_for_object(fallback_key)
    if verified_choices:
        return relabel_choices_for_object(key, verified_choices, "fallback")

    candidate_choices = get_candidate_assets_for_object(fallback_key)
    if candidate_choices:
        return relabel_choices_for_object(key, candidate_choices, "fallback")

    return []


def get_category_fallback_choices(object_name: str, category: str):
    fallback_key = CATEGORY_FALLBACKS.get(category or "")
    if not fallback_key:
        return []

    multi_choices = get_phase39_multi_choices_for_object(fallback_key)
    preferred_multi = [c for c in multi_choices if c.get("source") == "verified"]
    if preferred_multi:
        return relabel_choices_for_object(object_name, preferred_multi, "fallback")

    verified_choices = get_verified_choices_for_object(fallback_key)
    if verified_choices:
        return relabel_choices_for_object(object_name, verified_choices, "fallback")

    candidate_choices = get_candidate_assets_for_object(fallback_key)
    if candidate_choices:
        return relabel_choices_for_object(object_name, candidate_choices, "fallback")

    return []


def build_best_choices_for_object(object_name: str, category: str = None):
    key = str(object_name or "").strip().lower()
    out = []

    out.extend(get_phase39_multi_choices_for_object(key))
    out.extend(get_verified_choices_for_object(key))
    out.extend(get_candidate_assets_for_object(key))
    out.extend(get_object_fallback_choices(key))
    out.extend(get_category_fallback_choices(key, category))

    return postprocess_choice_labels(key, out)


def build_model3d_payload(
    route_type: str,
    matched_name: str,
    object_name: str,
    category: str,
    match_type: str,
    choices,
    concept_mode: bool,
):
    cleaned_choices = postprocess_choice_labels(object_name, choices)
    selected_index = 0
    primary = cleaned_choices[0] if cleaned_choices else {}
    primary_url = primary.get("url", "")

    display_name = matched_name or object_name or ""
    if route_type != "verified" and display_name:
        display_name = object_name or matched_name

    return {
        "route_type": route_type,
        "matched": bool(matched_name),
        "match_type": match_type,
        "name": prettify_model_name(display_name) if display_name else None,
        "label": primary.get("label") or (prettify_model_name(display_name) if display_name else None),
        "object_name": object_name,
        "category": category,
        "url": primary_url,
        "available": bool(primary_url),
        "verified_only": route_type == "verified",
        "choices": cleaned_choices,
        "model3d_options": cleaned_choices,
        "selected_index": selected_index,
        "concept_mode": concept_mode,
        "tier": primary.get("tier") or route_type,
        "style": primary.get("style") or "default",
    }


# =========================================================
# Router helpers
# =========================================================
def detect_3d_intent(user_text: str) -> bool:
    text = (user_text or "").strip().lower()
    if not text:
        return False

    keywords = [
        "3d",
        "three d",
        "model",
        "glb",
        "gltf",
        "render",
        "viewer",
        "show me",
        "open",
        "preview",
        "object",
        "mesh",
    ]
    return any(word in text for word in keywords)


def detect_music_creator_intent(user_text: str) -> bool:
    text = (user_text or "").strip().lower()
    if not text:
        return False

    keywords = [
        "music video",
        "record my music",
        "record audio",
        "record vocals",
        "music creator",
        "make a song",
        "create a beat",
        "music production",
        "audio creator",
        "studio",
    ]
    return any(k in text for k in keywords)


def detect_concept_request(user_text: str) -> bool:
    text = (user_text or "").strip().lower()
    if not text:
        return False
    return any(k in text for k in CONCEPT_KEYWORDS)


def detect_category(text: str):
    text = (text or "").strip().lower()
    if not text:
        return None

    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text:
                return category

    return None


def extract_object_name(user_text: str) -> str:
    text = (user_text or "").strip().lower()
    if not text:
        return ""

    exact_items = sorted(EXACT_MATCHES.items(), key=lambda kv: len(kv[0]), reverse=True)
    for phrase, canonical in exact_items:
        if phrase in text:
            return canonical

    category = detect_category(text)
    if category == "human":
        return "person"
    if category == "character":
        return "character"
    if category == "animal":
        for token in ["dog", "cat", "wolf", "tiger", "lion", "bear", "deer"]:
            if token in text:
                return token
        return "animal"
    if category == "building":
        for token in ["house", "home", "cabin", "mansion", "villa", "garage"]:
            if token in text:
                return token
        return "building"
    if category == "vehicle":
        for token in ["car", "truck", "plane", "jet", "spaceship", "rocket"]:
            if token in text:
                return token
        return "vehicle"

    return ""


def find_exact_model_match(user_text: str):
    text = (user_text or "").strip().lower()
    if not text:
        return None, None

    exact_items = sorted(EXACT_MATCHES.items(), key=lambda kv: len(kv[0]), reverse=True)
    for phrase, canonical in exact_items:
        if phrase in text:
            verified_url = normalize_model_url(VERIFIED_3D_MODELS.get(canonical))
            if verified_url and is_any_model_url(verified_url):
                return canonical, verified_url
            return canonical, None

    return None, None


def classify_request(user_text: str):
    text = (user_text or "").strip()
    lowered = text.lower()

    is_3d = detect_3d_intent(lowered)
    is_music = detect_music_creator_intent(lowered)
    is_concept = detect_concept_request(lowered)

    if is_music:
        return {
            "route_type": "concept",
            "object_name": "music_creator",
            "category": "creator_audio",
            "matched_name": None,
            "verified_url": None,
            "match_type": None,
            "reply": (
                "This sounds like a creator workflow. I can help plan a music or audio project inside Simo. "
                "Tell me the style, mood, vocals or instrumental, and whether you want a music video concept too."
            ),
            "choices": [],
            "concept_mode": True,
        }

    if is_3d or is_concept:
        exact_name, exact_url = find_exact_model_match(lowered)
        object_name = extract_object_name(lowered) or exact_name or "3d_object"
        category = detect_category(lowered)

        best_choices = build_best_choices_for_object(object_name, category)

        if exact_name and exact_url and exact_name == object_name:
            if is_concept and object_name not in {"astronaut", "robot", "horse", "helmet"}:
                return {
                    "route_type": "concept",
                    "object_name": object_name,
                    "category": category,
                    "matched_name": exact_name,
                    "verified_url": exact_url,
                    "match_type": "exact",
                    "reply": (
                        f"I can show a related verified {prettify_model_name(exact_name).lower()} model and help design a custom {object_name} after that."
                    ),
                    "choices": best_choices,
                    "concept_mode": True,
                }

            return {
                "route_type": "verified",
                "object_name": object_name,
                "category": category,
                "matched_name": exact_name,
                "verified_url": exact_url,
                "match_type": "exact",
                "reply": f"Opening {prettify_model_name(exact_name)} 3D model...",
                "choices": best_choices,
                "concept_mode": False,
            }

        if best_choices:
            primary = best_choices[0]
            primary_source = str(primary.get("source") or "candidate").strip().lower()
            primary_url = primary.get("url", "")

            if is_concept:
                return {
                    "route_type": "concept",
                    "object_name": object_name,
                    "category": category,
                    "matched_name": exact_name,
                    "verified_url": primary_url,
                    "match_type": "fallback" if not exact_name else "exact",
                    "reply": f"I can show a related 3D option for {object_name} and help design a custom version after that.",
                    "choices": best_choices,
                    "concept_mode": True,
                }

            if primary_source == "verified":
                return {
                    "route_type": "verified",
                    "object_name": object_name,
                    "category": category,
                    "matched_name": exact_name or object_name,
                    "verified_url": primary_url,
                    "match_type": "exact" if exact_name else "fallback",
                    "reply": f"Opening {prettify_model_name(object_name)} 3D model...",
                    "choices": best_choices,
                    "concept_mode": False,
                }

            if primary_source in {"candidate", "fallback"}:
                reply_name = prettify_model_name(object_name).lower()
                if primary_source == "fallback":
                    reply = f"I found a related fallback 3D option for {reply_name} inside Simo."
                else:
                    reply = f"I found 3D options for {reply_name} inside Simo."

                return {
                    "route_type": "candidate",
                    "object_name": object_name,
                    "category": category,
                    "matched_name": exact_name,
                    "verified_url": primary_url,
                    "match_type": "fallback" if not exact_name else "exact",
                    "reply": reply,
                    "choices": best_choices,
                    "concept_mode": False,
                }

        if is_concept:
            return {
                "route_type": "concept",
                "object_name": object_name,
                "category": category,
                "matched_name": None,
                "verified_url": None,
                "match_type": None,
                "reply": (
                    f"I don’t have a verified {object_name} 3D model yet, but I can help design a custom {object_name}. "
                    "Tell me the style, dimensions, and main features you want."
                ),
                "choices": [],
                "concept_mode": True,
            }

        return {
            "route_type": "unsupported",
            "object_name": object_name,
            "category": category,
            "matched_name": None,
            "verified_url": None,
            "match_type": None,
            "reply": f"I don’t have a verified 3D model for {object_name or 'that'} yet.",
            "choices": [],
            "concept_mode": False,
        }

    return {
        "route_type": None,
        "object_name": None,
        "category": None,
        "matched_name": None,
        "verified_url": None,
        "match_type": None,
        "reply": "",
        "choices": [],
        "concept_mode": False,
    }


def is_builder_request(user_text: str) -> bool:
    text = (user_text or "").strip().lower()
    if not text:
        return False

    strong_phrases = [
        "build a website",
        "build me a website",
        "build a landing page",
        "create a website",
        "make a website",
        "make me a website",
        "landing page",
        "web page",
        "homepage",
        "home page",
        "portfolio site",
        "portfolio website",
        "sales page",
        "html page",
        "generate html",
        "build a page",
        "create a landing page",
        "make a landing page",
        "design a website",
        "design me a website",
        "build me a site",
        "make me a page",
        "create a page",
    ]
    if any(p in text for p in strong_phrases):
        return True

    business_words = [
        "website",
        "site",
        "landing",
        "page",
        "homepage",
        "home page",
        "portfolio",
        "startup",
        "bakery",
        "restaurant",
        "cafe",
        "store",
        "shop",
        "brand",
        "agency",
        "saas",
        "app",
        "product page",
        "business page",
        "bike shop",
    ]

    action_words = [
        "build",
        "create",
        "make",
        "design",
        "generate",
    ]

    has_business_word = any(word in text for word in business_words)
    has_action_word = any(word in text for word in action_words)

    if has_business_word and has_action_word:
        return True

    if "bakery website" in text or "bakery landing page" in text or "bakery page" in text:
        return True

    return False


def builder_system_prompt(user_text: str) -> str:
    return f"""You are Simo, an expert AI website builder.

The user is asking you to build or update a webpage.

CRITICAL RULES:
- Return a complete, ready-to-preview HTML document only.
- Start with <!DOCTYPE html>
- Include <html>, <head>, <body>, CSS, and content.
- Never return a partial patch.
- Never return an explanation or outline.
- Do not wrap the answer in markdown fences.
- Do not say "here is the HTML".
- Output only the raw HTML document.

EDITING RULES:
- If the user is editing an existing page, preserve good parts of the current layout unless the user asks for a redesign.
- Apply the requested change to the existing page instead of starting over whenever possible.
- You are allowed to improve styles and layout if that helps fulfill the request better.
- If the user asks to enhance, upgrade, modernize, premium-ify, polish, refine, or make it darker/lighter/better, do a clearly stronger premium upgrade of the current page rather than a tiny cosmetic tweak.
- Keep the page responsive and preview-safe.

Design goals:
- Premium modern UI
- Visually polished
- Responsive
- Clear hierarchy
- Nice hero section
- Strong CTA buttons
- Real sections and content
- Inline CSS is allowed and preferred for compatibility

User request:
{user_text}
"""


# =========================================================
# Routes
# =========================================================

def build_simo_boot():
    usage_today = get_daily_usage_count(user_key_for_limits(), get_today_key())

    return {
        "loggedIn": is_logged_in(),
        "email": current_user_email(),
        "name": current_user_name(),
        "pro": is_pro_user(),
        "team": False,
        "freeDailyLimit": FREE_DAILY_LIMIT,
        "usageToday": usage_today,
        "stripePublishableKey": STRIPE_PUBLISHABLE_KEY,
        "stripePriceId": STRIPE_PRICE_ID,
        "baseUrl": BASE_URL,
        "builderLibraryKey": "simo_builder_library_v5_1_builder_first",
        "lastPreviewKey": "simo_last_preview_v2",
    }


@app.route("/")
def landing():
    return render_template("landing.html")


@app.route("/app")
def app_home():
    boot = build_simo_boot()
    return render_template(
        "index.html",
        simo_boot=boot,
        simo_boot_json=json.dumps(boot),
    )


@app.route("/health")
def health():
    builder_state = get_builder_session_state()
    builder_meta = builder_state.get("meta", {})
    if not isinstance(builder_meta, dict):
        builder_meta = {}

    return jsonify(
        {
            "ok": True,
            "app": "simo",
            "backend_version": "PHASE_2_9B_INTELLIGENT_BUILDER_DB_PERSISTENCE",
            "time": utcnow_z(),
            "logged_in": is_logged_in(),
            "pro": is_pro_user(),
            "verified_3d_models_count": len(VERIFIED_3D_MODELS),
            "verified_3d_model_names": sorted(list(VERIFIED_3D_MODELS.keys())),
            "candidate_objects": sorted(list(CANDIDATE_ASSETS.keys())),
            "object_fallbacks": OBJECT_FALLBACKS,
            "builder_active": bool(builder_state.get("active")),
            "builder_revision": builder_state.get("revision"),
            "builder_turn_count": builder_state.get("turn_count"),
            "builder_last_request_kind": builder_state.get("last_request_kind"),
            "builder_title": builder_state.get("title"),
            "builder_meta": builder_meta,
        }
    )


@app.route("/debug-routes")
def debug_routes():
    routes = []
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule):
        routes.append(
            {
                "rule": rule.rule,
                "endpoint": rule.endpoint,
                "methods": sorted([m for m in rule.methods if m not in {"HEAD", "OPTIONS"}]),
            }
        )
    return jsonify({"ok": True, "count": len(routes), "routes": routes})


# ---------------------------------------------------------
# Auth
# ---------------------------------------------------------
@app.route("/login")
def login():
    if "google" in oauth._clients:
        return redirect(url_for("login_google"))
    return redirect(url_for("app_home"))


@app.route("/login/google")
def login_google():
    if "google" not in oauth._clients:
        return jsonify({"ok": False, "error": "Google OAuth is not configured."}), 500

    redirect_uri = url_for("auth_google_callback", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@app.route("/auth/google/callback")
def auth_google_callback():
    if "google" not in oauth._clients:
        return jsonify({"ok": False, "error": "Google OAuth is not configured."}), 500

    try:
        token = oauth.google.authorize_access_token()
        user_info = token.get("userinfo", {})

        email = (user_info.get("email") or "").strip().lower()
        name = (user_info.get("name") or "").strip()
        sub = (user_info.get("sub") or "").strip()

        if not email:
            return jsonify({"ok": False, "error": "Google login did not return an email."}), 400

        upsert_user(email=email, name=name, google_sub=sub)

        session["user_email"] = email
        session["user_name"] = name
        session["google_sub"] = sub

        return redirect(url_for("app_home"))
    except Exception as e:
        return jsonify({"ok": False, "error": f"Google auth failed: {str(e)}"}), 500


@app.route("/logout")
def logout():
    session.pop("user_email", None)
    session.pop("user_name", None)
    session.pop("google_sub", None)
    return redirect(url_for("app_home"))


@app.route("/api/me")
def api_me():
    usage_today = get_daily_usage_count(user_key_for_limits(), get_today_key())
    return jsonify(
        {
            "ok": True,
            "loggedIn": is_logged_in(),
            "email": current_user_email(),
            "name": current_user_name(),
            "pro": is_pro_user(),
            "team": False,
            "usage_today": usage_today,
            "free_daily_limit": FREE_DAILY_LIMIT,
        }
    )


# ---------------------------------------------------------
# Billing
# ---------------------------------------------------------
@app.route("/api/pro-status")
def api_pro_status():
    return jsonify(
        {
            "ok": True,
            "loggedIn": is_logged_in(),
            "email": current_user_email(),
            "pro": is_pro_user(),
        }
    )


@app.route("/api/create-checkout-session", methods=["POST"])
def api_create_checkout_session():
    if not STRIPE_SECRET_KEY:
        return jsonify({"ok": False, "error": "Stripe is not configured."}), 500

    if not STRIPE_PRICE_ID:
        return jsonify({"ok": False, "error": "Missing STRIPE_PRICE_ID."}), 500

    try:
        data = request.get_json(silent=True) or {}
        email = current_user_email() or str(data.get("email") or "").strip().lower() or None

        if BASE_URL:
            success_url = f"{BASE_URL}/app?checkout=success"
            cancel_url = f"{BASE_URL}/app?checkout=cancel"
        else:
            success_url = url_for("app_home", _external=True) + "?checkout=success"
            cancel_url = url_for("app_home", _external=True) + "?checkout=cancel"

        checkout = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=email,
            metadata={"user_email": email or ""},
        )

        return jsonify({"ok": True, "url": checkout.url, "id": checkout.id})
    except Exception as e:
        return jsonify({"ok": False, "error": f"Stripe checkout failed: {str(e)}"}), 500


@app.route("/stripe-webhook", methods=["POST"])
def stripe_webhook():
    payload = request.get_data(as_text=False)
    sig_header = request.headers.get("Stripe-Signature", "")

    if not STRIPE_WEBHOOK_SECRET:
        return jsonify({"ok": False, "error": "Missing STRIPE_WEBHOOK_SECRET"}), 500

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Webhook verification failed: {str(e)}"}), 400

    event_type = event.get("type", "")
    data_object = event.get("data", {}).get("object", {})

    try:
        if event_type == "checkout.session.completed":
            email = (
                data_object.get("customer_details", {}).get("email")
                or data_object.get("customer_email")
                or data_object.get("metadata", {}).get("user_email")
                or ""
            ).strip().lower()

            if email:
                upsert_user(email=email)
                set_user_pro(email, True)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Webhook handling failed: {str(e)}"}), 500

    return jsonify({"ok": True})


# ---------------------------------------------------------
# Chat
# ---------------------------------------------------------
@app.route("/api/chat", methods=["POST"])
def api_chat():
    try:
        data = request.get_json(silent=True) or {}
        user_message = str(data.get("message", "") or "").strip()

        if not user_message:
            return jsonify({"ok": False, "error": "Message is required."}), 400

        if should_reset_builder_context(user_message):
            clear_builder_session_state()

        if not is_pro_user():
            ukey = user_key_for_limits()
            dkey = get_today_key()
            current_count = get_daily_usage_count(ukey, dkey)
            if current_count >= FREE_DAILY_LIMIT:
                return jsonify(
                    {
                        "ok": False,
                        "limitReached": True,
                        "error": f"Free daily limit reached ({FREE_DAILY_LIMIT}/day). Upgrade to Pro for unlimited chat.",
                    }
                ), 403

        builder_state = get_builder_session_state()
        explicit_builder_request = is_builder_request(user_message)
        followup_builder_request = is_builder_followup_request(user_message)
        builder_request = explicit_builder_request or followup_builder_request
        builder_kind = builder_request_kind(user_message) if builder_request else ""
        route = classify_request(user_message)

        history = session.get("chat_history", [])
        if not isinstance(history, list):
            history = []

        compact_user = compact_history_content("user", user_message)
        if compact_user:
            history.append({"role": "user", "content": compact_user})
        history = history[-12:]
        session["chat_history"] = history

        assistant_text = ""
        client = get_client()

        if builder_request:
            assistant_text = generate_builder_html(
                user_message,
                client,
                prior_state=builder_state,
            )
            mode, preset = extract_mode_and_preset(user_message)
            assistant_text = save_builder_session_state(
                user_message,
                assistant_text,
                mode=mode,
                preset=preset,
                request_kind=builder_kind,
            )

        elif route["route_type"] in {"verified", "candidate", "concept", "unsupported"}:
            assistant_text = route["reply"]

        elif client:
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            for item in history:
                role = str(item.get("role", "")).strip()
                content = str(item.get("content", "")).strip()
                if role in {"user", "assistant", "system"} and content:
                    messages.append({"role": role, "content": content})

            try:
                resp = client.responses.create(
                    model=OPENAI_MODEL,
                    input=messages,
                )
                assistant_text = extract_first_text_from_openai_response(resp)
            except Exception:
                resp = client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=messages,
                )
                assistant_text = extract_first_text_from_openai_response(resp)
        else:
            assistant_text = "Simo is running, but OPENAI_API_KEY is missing, so chat generation is unavailable right now."

        compact_assistant = compact_history_content("assistant", assistant_text)
        if compact_assistant:
            history.append({"role": "assistant", "content": compact_assistant})
        session["chat_history"] = history[-12:]

        usage_today = get_daily_usage_count(user_key_for_limits(), get_today_key())
        if not is_pro_user():
            usage_today = increment_daily_usage(user_key_for_limits(), get_today_key())

        model3d = build_model3d_payload(
            route_type=route["route_type"],
            matched_name=route["matched_name"],
            object_name=route["object_name"],
            category=route["category"],
            match_type=route["match_type"],
            choices=route["choices"],
            concept_mode=route["concept_mode"],
        )

        builder_state_after = get_builder_session_state()
        builder_meta = builder_state_after.get("meta", {})
        if not isinstance(builder_meta, dict):
            builder_meta = {}

        return jsonify(
            {
                "ok": True,
                "reply": assistant_text,
                "pro": is_pro_user(),
                "usage_today": usage_today,
                "free_daily_limit": FREE_DAILY_LIMIT,
                "model3d": model3d,
                "model3d_options": model3d.get("model3d_options", []),
                "builder_active": bool(builder_state_after.get("active")),
                "builder_kind": builder_kind or None,
                "builder_revision": int(builder_state_after.get("revision", 0) or 0),
                "builder_turn_count": int(builder_state_after.get("turn_count", 0) or 0),
                "builder_last_request_kind": str(builder_state_after.get("last_request_kind", "") or "").strip() or None,
                "builder_meta": builder_meta,
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"Chat failed: {str(e)}"}), 500


# ---------------------------------------------------------
# Image upload / analyze
# ---------------------------------------------------------
@app.route("/api/upload-image", methods=["POST"])
def api_upload_image():
    try:
        if "image" not in request.files:
            return jsonify({"ok": False, "error": "No image file uploaded."}), 400

        file = request.files["image"]
        if not file or not file.filename:
            return jsonify({"ok": False, "error": "Invalid image upload."}), 400

        if not allowed_image(file.filename):
            return jsonify({"ok": False, "error": "Unsupported image type."}), 400

        safe_name = secure_filename(file.filename)
        ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        final_name = f"{ts}_{safe_name}"
        save_path = os.path.join(UPLOAD_DIR, final_name)

        file.save(save_path)
        session["last_uploaded_image"] = save_path

        return jsonify(
            {
                "ok": True,
                "filename": final_name,
                "url": url_for("uploaded_file", filename=final_name),
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"Image upload failed: {str(e)}"}), 500


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    safe_filename = os.path.basename(filename)
    path = os.path.join(UPLOAD_DIR, safe_filename)
    if not os.path.isfile(path):
        abort(404)
    return send_file(path)


@app.route("/api/analyze-image", methods=["POST"])
def api_analyze_image():
    try:
        data = request.get_json(silent=True) or {}
        prompt = str(data.get("prompt", "") or "Analyze this image.").strip()

        image_path = session.get("last_uploaded_image")
        if not image_path or not os.path.isfile(image_path):
            return jsonify({"ok": False, "error": "No uploaded image found in session."}), 400

        client = get_client()
        if not client:
            return jsonify({"ok": False, "error": "OPENAI_API_KEY is missing."}), 500

        with open(image_path, "rb") as f:
            img_bytes = f.read()

        b64 = base64.b64encode(img_bytes).decode("utf-8")

        mime = "image/png"
        lower = image_path.lower()
        if lower.endswith(".jpg") or lower.endswith(".jpeg"):
            mime = "image/jpeg"
        elif lower.endswith(".webp"):
            mime = "image/webp"
        elif lower.endswith(".gif"):
            mime = "image/gif"

        try:
            resp = client.responses.create(
                model=OPENAI_MODEL,
                input=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": prompt},
                            {
                                "type": "input_image",
                                "image_url": f"data:{mime};base64,{b64}",
                            },
                        ],
                    }
                ],
            )
            text = extract_first_text_from_openai_response(resp)
            return jsonify({"ok": True, "reply": text})
        except Exception:
            return jsonify(
                {
                    "ok": True,
                    "reply": "Image analysis is not available with the current OpenAI SDK version on this machine yet. Chat is fixed first.",
                }
            )
    except Exception as e:
        return jsonify({"ok": False, "error": f"Image analysis failed: {str(e)}"}), 500


# ---------------------------------------------------------
# 3D matching
# ---------------------------------------------------------
@app.route("/api/3d-match", methods=["POST"])
def api_3d_match():
    try:
        data = request.get_json(silent=True) or {}
        user_text = str(data.get("message", "") or "").strip()

        route = classify_request(user_text)

        model3d = build_model3d_payload(
            route_type=route["route_type"],
            matched_name=route["matched_name"],
            object_name=route["object_name"],
            category=route["category"],
            match_type=route["match_type"],
            choices=route["choices"],
            concept_mode=route["concept_mode"],
        )

        return jsonify(
            {
                "ok": True,
                **model3d,
                "message": route["reply"],
                "model3d_options": model3d.get("model3d_options", []),
            }
        )
    except Exception as e:
        return jsonify(
            {
                "ok": False,
                "matched": False,
                "match_type": None,
                "route_type": None,
                "available": False,
                "name": None,
                "label": None,
                "object_name": None,
                "category": None,
                "url": None,
                "choices": [],
                "model3d_options": [],
                "selected_index": 0,
                "message": f"3D match failed: {str(e)}",
                "concept_mode": False,
                "tier": None,
                "style": None,
            }
        ), 500


# ---------------------------------------------------------
# HTML export helper
# ---------------------------------------------------------
@app.route("/api/download-html", methods=["POST"])
def api_download_html():
    try:
        data = request.get_json(silent=True) or {}
        html = str(data.get("html", "") or "")
        filename = str(data.get("filename", "") or "simo-build.html").strip()

        if not filename.lower().endswith(".html"):
            filename += ".html"

        return Response(
            html,
            mimetype="text/html",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"Download failed: {str(e)}"}), 500


# ---------------------------------------------------------
# Publish
# ---------------------------------------------------------
def _publish_from_request():
    data = request.get_json(silent=True) or {}

    html = str(
        data.get("html")
        or data.get("code")
        or data.get("content")
        or data.get("markup")
        or ""
    ).strip()
    builder_state = get_builder_session_state()
    title = str(data.get("title", "") or builder_state.get("title") or "Untitled Build").strip() or "Untitled Build"
    source_text = str(data.get("sourceText", "") or data.get("source_text", "") or "").strip()
    requested_slug = str(data.get("slug", "") or data.get("requestedSlug", "") or "").strip()

    if not html:
        html = str(builder_state.get("html", "") or "").strip()

    if not html:
        return jsonify({"ok": False, "error": "HTML is required for publish."}), 400

    html = normalize_builder_html(html, source_text or title)

    slug = slugify(requested_slug or title)

    owner_email = current_user_email()
    final_slug = upsert_published_page(
        slug=slug,
        title=title,
        html=html,
        source_text=source_text,
        owner_email=owner_email,
    )

    file_path = os.path.join(PUBLISHED_DIR, f"{final_slug}.html")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(html)

    if BASE_URL:
        public_url = f"{BASE_URL}/p/{final_slug}"
    else:
        public_url = url_for("published_page", slug=final_slug, _external=True)

    return jsonify(
        {
            "ok": True,
            "slug": final_slug,
            "url": public_url,
            "published_url": public_url,
            "title": title,
        }
    )


@app.route("/api/publish", methods=["POST"])
@app.route("/api/publish-build", methods=["POST"])
@app.route("/api/builder/publish", methods=["POST"])
def api_publish():
    try:
        return _publish_from_request()
    except Exception as e:
        return jsonify({"ok": False, "error": f"Publish failed: {str(e)}"}), 500


@app.route("/p/<slug>")
def published_page(slug):
    clean_slug = slugify(slug)

    row = get_published_page_by_slug(clean_slug)
    if row and row["html"]:
        return Response(str(row["html"]), mimetype="text/html")

    file_path = os.path.join(PUBLISHED_DIR, f"{clean_slug}.html")
    if os.path.isfile(file_path):
        return send_file(file_path, mimetype="text/html")

    abort(404)


# ---------------------------------------------------------
# Session helper
# ---------------------------------------------------------
@app.route("/api/session/clear", methods=["POST"])
def api_session_clear():
    keep = {"user_email", "user_name", "google_sub", "anon_id"}
    for key in list(session.keys()):
        if key not in keep:
            session.pop(key, None)
    clear_builder_session_state()
    return jsonify({"ok": True})


# =========================================================
# Error handlers
# =========================================================
@app.errorhandler(404)
def not_found(_e):
    return jsonify({"ok": False, "error": "Not found"}), 404


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"ok": False, "error": "Uploaded file is too large."}), 413


@app.errorhandler(500)
def server_error(_e):
    return jsonify({"ok": False, "error": "Internal server error"}), 500


# =========================================================
# Persistent Library (Phase 3.0A)
# =========================================================

def ensure_saved_builds_table():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS saved_builds (
            id TEXT PRIMARY KEY,
            user_email TEXT,
            title TEXT,
            html TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    """)
    conn.commit()


ensure_saved_builds_table()


@app.route("/api/library", methods=["GET"])
def api_get_library():
    email = session.get("user_email")
    if not email:
        return jsonify({"ok": True, "items": []})

    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM saved_builds WHERE user_email=? ORDER BY updated_at DESC",
        (email,)
    ).fetchall()

    items = [dict(r) for r in rows]
    return jsonify({"ok": True, "items": items})


@app.route("/api/library/save", methods=["POST"])
def api_save_build():
    email = session.get("user_email")
    if not email:
        return jsonify({"ok": False, "error": "not_logged_in"}), 401

    data = request.get_json() or {}

    build_id = data.get("id") or secrets.token_hex(8)
    title = data.get("title") or "Untitled Build"
    html = data.get("html") or ""

    now = dt.datetime.utcnow().isoformat()

    conn = get_db()
    conn.execute("""
        INSERT INTO saved_builds (id, user_email, title, html, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title=excluded.title,
            html=excluded.html,
            updated_at=excluded.updated_at
    """, (build_id, email, title, html, now, now))
    conn.commit()

    return jsonify({"ok": True, "id": build_id})


@app.route("/api/library/delete", methods=["POST"])
def api_delete_build():
    email = session.get("user_email")
    if not email:
        return jsonify({"ok": False}), 401

    data = request.get_json() or {}
    build_id = data.get("id")

    conn = get_db()
    conn.execute(
        "DELETE FROM saved_builds WHERE id=? AND user_email=?",
        (build_id, email)
    )
    conn.commit()

    return jsonify({"ok": True})


# =========================================================
# Main
# =========================================================
if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    debug = env_bool("FLASK_DEBUG", True)
    app.run(host=host, port=port, debug=debug)
