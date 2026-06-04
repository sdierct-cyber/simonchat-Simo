import os
import json
import re
import base64
import sqlite3
import secrets
import datetime as dt
import shutil
import urllib.request

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
from werkzeug.security import generate_password_hash, check_password_hash

import stripe
from authlib.integrations.flask_client import OAuth
from openai import OpenAI

load_dotenv()
print("RUNNING APP FILE:", os.path.abspath(__file__))
print("SIMO PHASE 14M-R10.45G / V1.3.22 SERVER IMAGE CREDIT GATE")

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
        eyebrow = "Artisan bakery • Fresh every morning"
        cards = [
            ("Artisan Bread", "Crusty, warm, handcrafted loaves baked each morning."),
            ("Signature Cakes", "Beautiful custom cakes for birthdays, weddings, and celebrations."),
            ("Butter Pastries", "Croissants, danishes, muffins, and flaky favorites."),
            ("Warm Cookies", "Soft, chewy, small-batch treats everyone remembers."),
        ]
        stats = [("Daily", "Fresh batches"), ("Custom", "Cake orders"), ("Local", "Neighborhood favorite")]
        section_two_title = "Why People Come Back"
        section_two_text = "We blend old-world baking traditions with polished presentation and warm neighborhood service."
        cta = "Order Fresh Today"
        secondary_cta = "View Menu"
    elif kind == "portfolio":
        brand = "Ava Carter Portfolio"
        sub = "A polished digital portfolio for showcasing work, services, case studies, and contact."
        eyebrow = "Creative portfolio • Premium presentation"
        cards = [
            ("Featured Work", "Highlight signature projects with visuals and clear results."),
            ("About", "Tell your story with confidence and personality."),
            ("Services", "Present what you do in a clean, premium way."),
            ("Contact", "Make it easy for clients or collaborators to reach out."),
        ]
        stats = [("Selected", "Case studies"), ("Premium", "Visual direction"), ("Clear", "Client pathway")]
        section_two_title = "Built To Impress"
        section_two_text = "This layout is designed to feel premium, clear, and professional on desktop and mobile."
        cta = "View Projects"
        secondary_cta = "Get In Touch"
    elif kind == "saas":
        brand = "NovaFlow"
        sub = "A modern SaaS landing page designed to explain value fast and drive signups."
        eyebrow = "SaaS platform • Modern growth system"
        cards = [
            ("Fast Setup", "Get started in minutes with an onboarding flow users can follow."),
            ("Smart Automation", "Reduce repetitive work with powerful workflow logic."),
            ("Live Insights", "See trends, activity, and growth from one dashboard."),
            ("Team Ready", "Collaborate across teams with a polished workspace."),
        ]
        stats = [("Minutes", "To get started"), ("Live", "Team visibility"), ("Modern", "Conversion flow")]
        section_two_title = "Why It Converts"
        section_two_text = "Clear hierarchy, premium styling, and confident call-to-action placement help turn visitors into users."
        cta = "Start Free"
        secondary_cta = "See Demo"
    elif kind == "agency":
        brand = "Northline Creative"
        sub = "A premium agency landing page built to showcase services, case studies, and confidence."
        eyebrow = "Creative agency • Strategy and execution"
        cards = [
            ("Brand Strategy", "Sharper positioning for products and businesses."),
            ("Web Design", "Beautiful websites built for clarity and conversion."),
            ("Content Systems", "Messaging and assets that support growth."),
            ("Launch Support", "Practical rollout help from concept to live site."),
        ]
        stats = [("Strategy", "Built in"), ("Premium", "Presentation"), ("Clear", "Service structure")]
        section_two_title = "Creative With Direction"
        section_two_text = "This page structure helps visitors understand your offer quickly and trust your brand faster."
        cta = "Book A Call"
        secondary_cta = "View Services"
    elif kind == "restaurant":
        brand = "Luna Table"
        sub = "A stylish restaurant page for reservations, menu highlights, and atmosphere."
        eyebrow = "Dining experience • Modern atmosphere"
        cards = [
            ("Chef Specials", "Feature the dishes people talk about first."),
            ("Reservations", "Help guests book quickly and confidently."),
            ("Events", "Promote private dining, tastings, and special nights."),
            ("Atmosphere", "Use elegant visuals and copy to set the tone."),
        ]
        stats = [("Private", "Dining options"), ("Seasonal", "Menu highlights"), ("Elegant", "Guest experience")]
        section_two_title = "Designed To Feel Inviting"
        section_two_text = "The layout balances warmth, confidence, and easy navigation so guests know exactly where to go next."
        cta = "Reserve A Table"
        secondary_cta = "Explore Menu"
    elif kind == "fitness":
        brand = "Elevate Fitness"
        sub = "A strong, clean fitness page for coaches, gyms, programs, and member signups."
        eyebrow = "Fitness brand • Momentum and clarity"
        cards = [
            ("Programs", "Show structured training paths people can understand fast."),
            ("Coaching", "Present your expertise and one-on-one guidance."),
            ("Results", "Highlight momentum, transformations, and testimonials."),
            ("Membership", "Drive simple action with strong CTA placement."),
        ]
        stats = [("Strong", "Program flow"), ("Clear", "Membership path"), ("Focused", "Conversion design")]
        section_two_title = "Built For Action"
        section_two_text = "The structure is made to motivate, guide, and convert visitors without clutter."
        cta = "Join Now"
        secondary_cta = "View Programs"
    elif kind == "ecommerce":
        brand = "Velora Studio"
        sub = "A clean ecommerce-style landing page built to feature products and drive sales."
        eyebrow = "Product brand • Premium shopping experience"
        cards = [
            ("Best Sellers", "Spotlight the products visitors should see first."),
            ("Brand Story", "Give the store a stronger identity and emotional pull."),
            ("Fast Shipping", "Reassure buyers with clear service messaging."),
            ("Easy Checkout", "Guide customers from interest to purchase smoothly."),
        ]
        stats = [("Fast", "Customer flow"), ("Premium", "Brand feel"), ("Clear", "Product hierarchy")]
        section_two_title = "Built To Sell Cleanly"
        section_two_text = "A polished hierarchy and premium card layout help products feel more trustworthy and more desirable."
        cta = "Shop Now"
        secondary_cta = "Browse Collection"
    elif kind == "real_estate":
        brand = "Nova Homes"
        sub = "A premium real estate landing page designed to build trust fast and guide buyers confidently."
        eyebrow = "Real estate • First-impression trust"
        cards = [
            ("Featured Listings", "Highlight the homes and opportunities buyers should see first."),
            ("Guided Support", "Present a clear, professional path from interest to action."),
            ("Market Confidence", "Use strong positioning and trust signals to reduce hesitation."),
            ("Buyer Journey", "Move visitors from curiosity to conversation with clarity."),
        ]
        stats = [("Trusted", "First impression"), ("Clear", "Buyer flow"), ("Premium", "Presentation")]
        section_two_title = "Built To Inspire Confidence"
        section_two_text = "A real estate page should feel elevated, reassuring, and easy to act on from the very first screen."
        cta = "Explore Homes"
        secondary_cta = "Book A Consultation"
    else:
        brand = "Simo Studio"
        sub = "A modern responsive website generated inside Simo with premium sections, strong layout, and cleaner visual polish."
        eyebrow = "Built inside Simo • Premium fallback"
        cards = [
            ("Modern Layout", "A polished structure that feels intentional and presentation-ready."),
            ("Responsive Design", "Built to adapt smoothly across desktop and mobile."),
            ("Clear Messaging", "Simple hierarchy that helps visitors understand the offer quickly."),
            ("Strong CTA", "A focused call-to-action that gives the page momentum."),
        ]
        stats = [("Premium", "Visual baseline"), ("Responsive", "Across devices"), ("Ready", "For preview and saving")]
        section_two_title = "A Better Starting Point"
        section_two_text = "When AI output is thin or inconsistent, Simo can still deliver a stronger premium page instead of a flat fallback."
        cta = "Get Started"
        secondary_cta = "Explore More"

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

    stat_html = "\n".join(
        [
            f"""
        <div class=\"mini-stat\">
          <strong>{label}</strong>
          <span>{value}</span>
        </div>
        """.strip()
            for label, value in stats
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
      --bg: #07111f;
      --bg-soft: #0d1830;
      --panel: rgba(255,255,255,.06);
      --panel-strong: rgba(255,255,255,.09);
      --text: #eef4ff;
      --muted: #b7c6e4;
      --line: rgba(255,255,255,.10);
      --blue: #6ea8ff;
      --purple: #b982ff;
      --cyan: #79e0ff;
      --shadow: 0 20px 70px rgba(0,0,0,.32);
      --radius-xl: 30px;
      --radius-lg: 22px;
      --radius-md: 16px;
      --max: 1180px;
    }}

    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    html, body {{ margin: 0; padding: 0; }}
    body {{
      font-family: Arial, sans-serif;
      color: var(--text);
      line-height: 1.5;
      background:
        radial-gradient(circle at top left, rgba(110,168,255,.18), transparent 26%),
        radial-gradient(circle at top right, rgba(185,130,255,.14), transparent 24%),
        radial-gradient(circle at 50% 0%, rgba(121,224,255,.08), transparent 20%),
        linear-gradient(180deg, #06101d 0%, #081224 45%, #07111f 100%);
    }}

    a {{
      color: inherit;
      text-decoration: none;
    }}

    .wrap {{
      width: min(var(--max), calc(100% - 32px));
      margin: 0 auto;
    }}

    .site-shell {{
      overflow: hidden;
    }}

    header {{
      position: sticky;
      top: 0;
      z-index: 40;
      backdrop-filter: blur(14px);
      background: rgba(7, 14, 27, .68);
      border-bottom: 1px solid var(--line);
    }}

    .nav {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 18px 0;
    }}

    .brand {{
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: .2px;
    }}

    .brand-mark {{
      width: 12px;
      height: 12px;
      border-radius: 999px;
      background: linear-gradient(135deg, var(--blue), var(--purple));
      box-shadow: 0 0 24px rgba(110,168,255,.45);
    }}

    .nav-links {{
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
      align-items: center;
    }}

    .nav-links a {{
      color: var(--muted);
      font-size: 14px;
      font-weight: 600;
    }}

    .nav-links a:hover {{
      color: var(--text);
    }}

    .hero {{
      padding: 78px 0 42px;
    }}

    .hero-grid {{
      display: grid;
      grid-template-columns: 1.08fr .92fr;
      gap: 26px;
      align-items: stretch;
    }}

    .hero-copy,
    .hero-panel {{
      border-radius: var(--radius-xl);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }}

    .hero-copy {{
      padding: 34px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.04)),
        linear-gradient(135deg, rgba(110,168,255,.08), rgba(185,130,255,.06));
    }}

    .eyebrow {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,.06);
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 20px;
    }}

    h1 {{
      margin: 0 0 14px;
      font-size: clamp(42px, 7vw, 72px);
      line-height: 1.02;
      letter-spacing: -1.5px;
      max-width: 9.5ch;
    }}

    .hero-copy p {{
      margin: 0 0 28px;
      color: var(--muted);
      font-size: 18px;
      max-width: 700px;
    }}

    .actions {{
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      align-items: center;
    }}

    .btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 50px;
      padding: 0 20px;
      border-radius: 999px;
      font-weight: 700;
      border: 1px solid var(--line);
      transition: transform .18s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease;
    }}

    .btn:hover {{
      transform: translateY(-1px);
    }}

    .btn-primary {{
      color: white;
      background: linear-gradient(135deg, var(--blue), var(--purple));
      box-shadow: 0 16px 40px rgba(110,168,255,.24);
      border-color: rgba(255,255,255,.14);
    }}

    .btn-secondary {{
      color: var(--text);
      background: rgba(255,255,255,.05);
    }}

    .hero-panel {{
      padding: 24px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04)),
        linear-gradient(135deg, rgba(121,224,255,.06), rgba(185,130,255,.04));
      display: grid;
      gap: 18px;
    }}

    .panel-top {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      color: var(--muted);
      font-size: 13px;
    }}

    .preview-card {{
      min-height: 220px;
      border-radius: 24px;
      border: 1px solid var(--line);
      background:
        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)),
        radial-gradient(circle at top right, rgba(110,168,255,.20), transparent 35%);
      padding: 22px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }}

    .preview-card h3 {{
      margin: 0 0 8px;
      font-size: 26px;
      letter-spacing: -.4px;
    }}

    .preview-card p {{
      margin: 0;
      color: var(--muted);
      max-width: 34ch;
    }}

    .mini-stats {{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }}

    .mini-stat {{
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 14px;
    }}

    .mini-stat strong {{
      display: block;
      font-size: 18px;
      margin-bottom: 6px;
    }}

    .mini-stat span {{
      color: var(--muted);
      font-size: 13px;
    }}

    .section {{
      padding: 30px 0 70px;
    }}

    .section-head {{
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 24px;
    }}

    .section h2 {{
      margin: 0 0 8px;
      font-size: 34px;
      letter-spacing: -.6px;
    }}

    .section-intro {{
      margin: 0;
      color: var(--muted);
      max-width: 760px;
    }}

    .cards {{
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
    }}

    .card {{
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 24px;
      box-shadow: var(--shadow);
      transition: transform .18s ease, border-color .18s ease;
    }}

    .card:hover {{
      transform: translateY(-3px);
      border-color: rgba(255,255,255,.18);
    }}

    .card h3 {{
      margin: 0 0 10px;
      font-size: 20px;
      letter-spacing: -.3px;
    }}

    .card p {{
      margin: 0;
      color: var(--muted);
    }}

    .feature-band {{
      background:
        linear-gradient(135deg, rgba(110,168,255,.12), rgba(185,130,255,.12)),
        linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.03));
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 28px;
      box-shadow: var(--shadow);
    }}

    .feature-band p {{
      color: var(--muted);
      margin: 10px 0 0;
      max-width: 780px;
    }}

    .contact-box {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
      border-radius: 28px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
      padding: 26px;
      box-shadow: var(--shadow);
    }}

    .contact-copy {{
      max-width: 640px;
    }}

    .contact-copy h2 {{
      margin: 0 0 10px;
    }}

    .contact-copy p {{
      margin: 0;
      color: var(--muted);
    }}

    footer {{
      padding: 30px 0 44px;
      color: var(--muted);
      border-top: 1px solid var(--line);
      margin-top: 8px;
    }}

    @media (max-width: 980px) {{
      .hero-grid {{
        grid-template-columns: 1fr;
      }}

      .cards {{
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }}
    }}

    @media (max-width: 640px) {{
      .wrap {{
        width: min(var(--max), calc(100% - 20px));
      }}

      .nav {{
        flex-direction: column;
        align-items: flex-start;
      }}

      .hero {{
        padding-top: 56px;
      }}

      .hero-copy,
      .hero-panel,
      .feature-band,
      .contact-box {{
        padding: 20px;
      }}

      .cards {{
        grid-template-columns: 1fr;
      }}

      .mini-stats {{
        grid-template-columns: 1fr;
      }}

      h1 {{
        max-width: none;
      }}
    }}
  </style>
</head>
<body>
  <div class=\"site-shell\">
    <header>
      <div class=\"wrap nav\">
        <div class=\"brand\">
          <span class=\"brand-mark\"></span>
          <span>{brand}</span>
        </div>
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
          <div class=\"hero-copy\">
            <div class=\"eyebrow\">{eyebrow}</div>
            <h1>{brand}</h1>
            <p>{sub}</p>
            <div class=\"actions\">
              <a class=\"btn btn-primary\" href=\"#contact\">{cta}</a>
              <a class=\"btn btn-secondary\" href=\"#features\">{secondary_cta}</a>
            </div>
          </div>

          <aside class=\"hero-panel\">
            <div class=\"panel-top\">
              <span>Project</span>
              <span>{page_title}</span>
            </div>

            <div class=\"preview-card\">
              <div>
                <h3>Premium first impression</h3>
                <p>This fallback version is designed to feel cleaner, stronger, and more polished right out of preview.</p>
              </div>
              <div class=\"mini-stats\">
                {stat_html}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section id=\"features\" class=\"section\">
        <div class=\"section-head\">
          <div>
            <h2>Highlights</h2>
            <p class=\"section-intro\">A stronger premium fallback starts with better hierarchy, better spacing, and sections that already feel intentional.</p>
          </div>
        </div>

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
        <div class=\"contact-box\">
          <div class=\"contact-copy\">
            <h2>Let’s Connect</h2>
            <p>This keeps the page feeling complete, premium, and action-ready even when the fallback path is used.</p>
          </div>
          <div class=\"actions\">
            <a class=\"btn btn-primary\" href=\"mailto:hello@example.com\">hello@example.com</a>
            <a class=\"btn btn-secondary\" href=\"tel:+15551234567\">(555) 123-4567</a>
          </div>
        </div>
      </section>
    </main>

    <footer>
      <div class=\"wrap\">© 2026 {brand} — Generated by Simo.</div>
    </footer>
  </div>
</body>
</html>"""


def normalize_builder_html(html: str, fallback_prompt: str = "") -> str:
    extracted = extract_html_document(html)
    if extracted:
        return extracted
    return build_fallback_html(fallback_prompt or html or "Simo Website")


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def normalize_prompt_typos(text: str) -> str:
    """Small intent-safe typo cleanup before routing."""
    value = str(text or "")
    replacements = {
        r"\bhose\b": "house",
        r"\bhosue\b": "house",
        r"\bhuse\b": "house",
        r"\bhousse\b": "house",
        r"\bhoues\b": "house",
        r"\bluxery\b": "luxury",
        r"\bluxary\b": "luxury",
        r"\bmodle\b": "model",
        r"\bmodele\b": "model",
    }
    for pattern, repl in replacements.items():
        value = re.sub(pattern, repl, value, flags=re.IGNORECASE)
    return value


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
    lower = text.lower()

    intents = detect_builder_edit_intents(text)
    sections = detect_html_sections(html)

    # --- EXISTING ---
    existing_styles = safe_text_list(previous_meta.get("style_tags", []))
    style_additions = []

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
            if label not in existing_styles:
                style_additions.append(label)

    # --- NEW: CHANGE DETECTION LAYER ---
    change_type = []

    if any(k in lower for k in ["color", "dark", "light", "theme", "style"]):
        change_type.append("style")

    if any(k in lower for k in ["layout", "structure", "section", "move", "rearrange"]):
        change_type.append("layout")

    if any(k in lower for k in ["text", "headline", "title", "description", "content"]):
        change_type.append("content")

    if any(k in lower for k in ["button", "cta", "click", "link"]):
        change_type.append("cta")

    # --- NEW: TARGET SECTION DETECTION ---
    target_section = None

    for section in sections:
        if section in lower:
            target_section = section
            break

    # --- FINAL META ---
    return {
        "intents": intents,
        "sections": sections,
        "style_tags": list(set(existing_styles + style_additions)),
        "change_type": change_type,
        "target_section": target_section,
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

    previous_title = str(previous_state.get("title", "") or "").strip()

    builder_meta = infer_builder_meta(clean_prompt, normalized_html, previous_meta=previous_meta)

    revision = previous_revision + 1
    turn_count = previous_turn_count + 1
    now_z = utcnow_z()
    origin_prompt = previous_origin_prompt or clean_prompt

    # 🔥 NEW: safer request kind classification
    safe_request_kind = request_kind or ""

    previous_state_prompt = ""
    if isinstance(previous_state, dict):
        previous_state_prompt = str(previous_state.get("prompt", "") or "")

    design_text = " ".join([
        str(clean_prompt or ""),
        str(origin_prompt or ""),
        previous_state_prompt
    ]).lower()

    design_keywords = [
        "design", "blueprint", "floor plan", "layout", "architecture",
        "architect", "dream home", "house", "home", "room", "kitchen",
        "bathroom", "bedroom", "garage", "pool", "balcony", "stairs",
        "factory", "warehouse", "office building", "building concept",
        "cabinet", "closet", "furniture", "desk", "table", "sofa",
        "chair", "shelving", "woodwork", "interior", "exterior",
        "garden", "landscape", "floral", "flower wall", "display",
        "product concept", "invention", "machine", "device", "prototype",
        "vehicle", "car concept", "truck", "motorcycle", "rocket",
        "spaceship", "drone", "aircraft", "boat",
        "3d", "3d model", "3d concept", "render", "mockup",
        "scene design", "storyboard", "cinematic scene", "animation",
        "short film", "movie scene", "set design"
    ]

    is_design_studio_request = any(keyword in design_text for keyword in design_keywords)

    if not safe_request_kind:
        if is_design_studio_request:
            safe_request_kind = "design_studio"
        elif previous_turn_count == 0:
            safe_request_kind = "build"
        else:
            safe_request_kind = "edit"
    elif safe_request_kind in {"chat", "idea", "concept"} and is_design_studio_request:
        safe_request_kind = "design_studio"

    # 🔥 NEW: stable title behavior
    new_title = title_from_prompt(clean_prompt)
    if previous_title and safe_request_kind not in {"build", "design_studio"}:
        # keep original title unless it's a fresh build/design request
        new_title = previous_title

    # 🔥 meta updates
    builder_meta["revision"] = revision
    builder_meta["turn_count"] = turn_count
    builder_meta["last_request_kind"] = safe_request_kind
    builder_meta["origin_prompt"] = origin_prompt
    builder_meta["updated_at"] = now_z

    history = push_builder_history(
        {
            "revision": revision,
            "turn_count": turn_count,
            "request_kind": safe_request_kind,
            "prompt": clean_prompt,
            "title": new_title,
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
            "title": new_title,
            "mode": mode or extracted_mode,
            "preset": preset or extracted_preset,
            "revision": revision,
            "turn_count": turn_count,
            "last_request_kind": safe_request_kind,
            "updated_at": now_z,
            "meta": builder_meta,
            "history": history,
        }
    )

    session["builder_active"] = True
    session["builder_last_title"] = new_title
    session["builder_last_request_kind"] = safe_request_kind
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
        "enhance it",
        "upgrade it",
        "polish it",
        "refine it",
        "make this",
        "change this",
        "update this",
        "edit this",
        "improve this",
        "enhance this",
        "upgrade this",
        "polish this",
        "refine this",
        "make the",
        "change the",
        "update the",
        "edit the",
        "fix the",
        "improve the",
        "enhance the",
        "upgrade the",
        "keep the",
        "add a",
        "add an",
        "add ",
        "remove ",
        "delete ",
        "use ",
        "switch ",
        "turn it",
        "move ",
        "replace ",
        "swap ",
        "restyle ",
        "rework ",
        "make it more",
        "make it less",
        "make it look",
        "make it feel",
        "instead of",
        "more modern",
        "more premium",
        "more luxurious",
        "more minimal",
        "more bold",
        "more elegant",
        "more clean",
        "more polished",
        "more professional",
        "dark mode",
        "lighter",
        "darker",
        "bigger",
        "smaller",
        "center ",
        "left align",
        "right align",
        "new section",
        "another section",
        "hero",
        "cta",
        "pricing",
        "testimonials",
        "faq",
        "contact form",
        "navbar",
        "footer",
        "button",
        "headline",
        "subheadline",
        "colors",
        "fonts",
        "spacing",
        "layout",
        "background",
    ]

    if any(text.startswith(p) for p in followup_phrases):
        return True

    direct_followup_phrases = [
        "make it better",
        "make it cleaner",
        "make it more premium",
        "make it more modern",
        "make it darker",
        "make it lighter",
        "enhance the whole page",
        "improve the whole page",
        "upgrade the whole page",
        "polish the whole page",
        "refine the whole page",
        "add another section",
        "add a new section",
        "add testimonials",
        "add pricing",
        "add faq",
        "add a faq section",
        "add a pricing section",
        "change the button text",
        "change the headline",
        "change the hero title",
        "update the hero",
        "make the hero",
        "change the colors",
        "change the layout",
        "change the background",
    ]

    if any(p in text for p in direct_followup_phrases):
        return True

    short_edit_verbs = [
        "add",
        "change",
        "update",
        "edit",
        "improve",
        "enhance",
        "upgrade",
        "polish",
        "refine",
        "remove",
        "delete",
        "replace",
        "move",
        "switch",
        "make",
        "fix",
    ]

    if len(text.split()) <= 18 and any(text.startswith(v + " ") or text == v for v in short_edit_verbs):
        return True

    if len(text.split()) <= 28 and any(
        token in text
        for token in [
            "section",
            "hero",
            "cta",
            "pricing",
            "price",
            "testimonial",
            "testimonials",
            "faq",
            "footer",
            "navbar",
            "headline",
            "subheadline",
            "button",
            "buttons",
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
            "darker",
            "lighter",
            "cleaner",
            "section title",
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
    text = (user_text or "").lower()

    upgrade_keywords = [
        "improve", "enhance", "upgrade", "better", "polish",
        "make it nicer", "make it look better", "make it premium",
        "clean it up", "refine", "modernize"
    ]

    is_upgrade = any(k in text for k in upgrade_keywords) or request_kind == "enhance"

    if is_upgrade:
        return (
            "INTENT: SAFE VISUAL UPGRADE\n\n"

            "The user wants the page improved, not rebuilt.\n\n"

            "YOU MUST:\n"
            "- Enhance the EXISTING layout.\n"
            "- Improve spacing, alignment, and visual hierarchy.\n"
            "- Upgrade typography (font sizes, weights, clarity).\n"
            "- Improve button styling and CTA clarity.\n"
            "- Add subtle polish (shadows, gradients, hover states) ONLY if it fits naturally.\n\n"

            "YOU MUST NOT:\n"
            "- Do NOT rebuild the page from scratch.\n"
            "- Do NOT change layout structure.\n"
            "- Do NOT add new sections unless absolutely necessary.\n"
            "- Do NOT remove existing content.\n"
            "- Do NOT modify unrelated sections.\n\n"

            "SECTION RULE:\n"
            "- If a specific section is targeted, ONLY enhance that section.\n"
            "- If no section is specified, apply light polish across the whole page WITHOUT structural changes.\n\n"

            "DESIGN QUALITY:\n"
            "- Ensure clean spacing between sections.\n"
            "- Ensure consistent button styles.\n"
            "- Ensure headings stand out clearly from body text.\n"
            "- Ensure the page feels modern and premium.\n\n"

            "FINAL GOAL:\n"
            "Make the page feel like a refined, production-ready design WITHOUT changing its structure."
        )

    if request_kind == "edit":
        return (
            "INTENT: TARGETED EDIT\n\n"
            "Apply only the requested change.\n"
            "Do not affect unrelated sections.\n"
        )

    if request_kind == "build":
        return (
            "INTENT: FULL BUILD\n\n"
            "Create a complete, polished, production-ready page.\n"
        )

    return ""

def detect_target_section(user_text: str) -> str:
    text = (user_text or "").lower()

    section_map = {
        "hero": ["hero", "top section", "main banner", "header"],
        "pricing": ["pricing", "plans", "packages"],
        "features": ["features", "benefits", "what we offer"],
        "about": ["about", "about us", "company"],
        "contact": ["contact", "contact us", "reach out"],
        "footer": ["footer", "bottom section"],
        "testimonials": ["testimonials", "reviews", "feedback"],
        "gallery": ["gallery", "images", "photos"],
    }

    for section, keywords in section_map.items():
        if any(k in text for k in keywords):
            return section

    return ""


def detect_edit_intent_strength(user_text: str) -> str:
    text = normalize_whitespace(user_text).lower()

    if not text:
        return "section_edit"

    full_keywords = [
        "redesign",
        "start over",
        "completely change",
        "completely redesign",
        "rebuild the page",
        "rebuild this page",
        "new layout",
        "different layout",
        "totally different",
        "from scratch",
        "replace the whole page",
        "make it entirely different",
        "full redesign",
        "full rebuild",
    ]

    feature_keywords = [
        "add section",
        "add a section",
        "add another section",
        "add feature",
        "add features",
        "add testimonials",
        "add testimonial",
        "add faq",
        "add a faq section",
        "add gallery",
        "add pricing",
        "add a pricing section",
        "add a contact form",
        "add contact form",
        "add contact section",
        "add services",
        "add a section for",
        "insert a section",
        "include a section",
    ]

    micro_keywords = [
        "change text",
        "rename",
        "update text",
        "fix typo",
        "fix typos",
        "make button say",
        "change color",
        "adjust color",
        "adjust colours",
        "adjust colors",
        "change button text",
        "fix button text",
        "change headline",
        "change title",
        "update headline",
        "update title",
        "change the button",
        "make the button",
        "change the wording",
        "update the wording",
        "change copy",
        "update copy",
    ]

    style_keywords = [
        "make it look better",
        "improve design",
        "improve the design",
        "modernize",
        "make it premium",
        "make this premium",
        "make it more premium",
        "make it modern",
        "make it more modern",
        "cleaner",
        "make it cleaner",
        "clean this up",
        "better ui",
        "better ux",
        "polish it",
        "refine it",
        "refine this",
        "make it darker",
        "make it lighter",
        "improve styling",
        "improve visual hierarchy",
        "make it more elegant",
        "make it more luxurious",
        "make it feel premium",
        "upgrade the styling",
    ]

    section_keywords = [
        "update hero",
        "change hero",
        "edit hero",
        "fix hero",
        "improve hero",
        "update pricing",
        "edit pricing",
        "change pricing",
        "fix pricing",
        "change features",
        "edit features",
        "improve features",
        "edit section",
        "update section",
        "fix section",
        "update footer",
        "edit footer",
        "fix footer",
        "update contact",
        "edit contact",
        "fix contact",
        "update testimonials",
        "edit testimonials",
        "update gallery",
        "edit gallery",
        "improve the hero",
        "improve the footer",
        "improve the contact section",
    ]

    vague_but_visual = [
        "make it better",
        "improve it",
        "upgrade it",
        "enhance it",
        "polish this",
        "polish it",
        "refine this",
        "make this better",
        "make this look better",
        "take it further",
        "push it further",
    ]

    if any(k in text for k in full_keywords):
        return "full_upgrade"

    if any(k in text for k in feature_keywords):
        return "feature_add"

    if any(k in text for k in micro_keywords):
        return "micro_edit"

    if any(k in text for k in style_keywords):
        return "style_upgrade"

    if any(k in text for k in section_keywords):
        return "section_edit"

    # vague but clearly visual improvement requests
    if any(k in text for k in vague_but_visual):
        return "style_upgrade"

    # if the user explicitly references a known section, treat as section edit
    if detect_target_section(text):
        return "section_edit"

    # very short requests are usually small edits, unless they sound broader
    short_text = len(text.split()) <= 6
    if short_text and any(word in text for word in ["text", "title", "button", "headline", "copy", "color"]):
        return "micro_edit"

    if short_text and any(word in text for word in ["premium", "modern", "cleaner", "darker", "lighter", "better"]):
        return "style_upgrade"

    return "section_edit"


def build_builder_edit_prompt(user_text: str, prior_state: dict, request_kind: str) -> str:
    clean_request = strip_mode_and_preset_lines(user_text)
    prior_prompt = prior_state.get("prompt", "")
    prior_html = normalize_builder_html(prior_state.get("html", ""), prior_prompt or clean_request)
    mode_context = build_builder_mode_context(user_text, prior_state)
    meta_context = build_builder_meta_context(prior_state)
    intent_guidance = build_intent_specific_edit_guidance(user_text, request_kind, prior_state)

    target_section = detect_target_section(user_text)
    intent_strength = detect_edit_intent_strength(user_text)
    lower_request = (user_text or "").lower()

    layout_safety_block = """
LAYOUT SAFETY RULES:
- Buttons must never overlap text or each other.
- Buttons must always have proper padding and spacing.
- Use button styling that keeps labels on one line when reasonable.
- Use: display inline-flex, align-items center, justify-content center, white-space nowrap, and min-width 160px for primary buttons.
- If multiple buttons exist in one row, ensure clear spacing between them.
- Buttons inside cards such as pricing or feature panels should usually be full width.
- Avoid overlapping layout issues anywhere in the page.
""".strip()

    rebuild_phrases = [
        "redesign",
        "rebuild",
        "start over",
        "from scratch",
        "completely new",
        "totally different",
        "full redesign",
        "make it entirely different",
        "replace the whole page",
        "new layout",
        "new design direction",
    ]

    patch_phrases = [
        "change",
        "update",
        "edit",
        "fix",
        "improve",
        "adjust",
        "refine",
        "polish",
        "make it premium",
        "make it modern",
        "make it darker",
        "make it lighter",
        "clean up",
        "tighten",
        "better spacing",
        "improve button",
        "update text",
        "change copy",
    ]

    additive_phrases = [
        "add a section",
        "add testimonials",
        "add faq",
        "add pricing",
        "add contact",
        "add gallery",
        "add features",
        "insert a section",
    ]

    explicit_rebuild = any(p in lower_request for p in rebuild_phrases)
    likely_patch = any(p in lower_request for p in patch_phrases)
    likely_additive = any(p in lower_request for p in additive_phrases)

    if explicit_rebuild:
        edit_scope = "controlled_rebuild"
    elif target_section:
        edit_scope = "section_patch"
    elif likely_additive:
        edit_scope = "additive_edit"
    elif likely_patch or request_kind in {"edit", "enhance", "upgrade", "polish", "refine"}:
        edit_scope = "targeted_patch"
    else:
        edit_scope = "preserve_first_edit"

    section_context = ""
    if target_section:
        section_context = f"""
TARGET SECTION:
The user is referring to the "{target_section}" section.

You must prioritize editing this section only.
Do NOT rebuild the entire page unless absolutely necessary.
Preserve all other sections.
""".strip()

    if edit_scope == "section_patch":
        edit_scope_context = """
EDIT SCOPE MODE: SECTION PATCH

This is a targeted section edit.
You must preserve the rest of the page.
Do not redesign unrelated sections.
Do not change the global palette, layout direction, or structure outside the targeted area unless absolutely necessary for consistency.
""".strip()
    elif edit_scope == "targeted_patch":
        edit_scope_context = """
EDIT SCOPE MODE: TARGETED PATCH

This is a focused edit, not a full rebuild.
Preserve the existing structure, strongest sections, layout flow, and color direction.
Only change what is needed to satisfy the request clearly and elegantly.
""".strip()
    elif edit_scope == "additive_edit":
        edit_scope_context = """
EDIT SCOPE MODE: ADDITIVE EDIT

The user is asking to add or insert something into the existing page.
Keep the current page intact.
Add the requested section or element in a way that matches the current design system, spacing, and visual identity.
Do not rebuild the whole page.
""".strip()
    elif edit_scope == "controlled_rebuild":
        edit_scope_context = """
EDIT SCOPE MODE: CONTROLLED REBUILD

A broader redesign is allowed here because the request explicitly signals a major rebuild.
Still preserve useful content, brand intent, and any strong existing ideas when possible.
Do not produce a sloppy or unnecessary total reset.
""".strip()
    else:
        edit_scope_context = """
EDIT SCOPE MODE: PRESERVE-FIRST EDIT

Default to editing the current page instead of replacing it.
Keep the strongest parts of the current design.
Make the smallest high-quality change set that fully satisfies the request.
""".strip()

    intent_control_block = f"""
INTENT-AWARE EDITING RULES:

Detected intent: {intent_strength}

CONFIDENCE LAYER:
- Act decisively. Do not hesitate or under-edit.
- Do not produce weak or barely noticeable changes.
- Each edit should feel intentional, visible, and meaningful.
- Avoid half-measures — fully apply the improvement when safe.

EDIT EXECUTION RULES:
- If intent is micro_edit:
  Make a clean, precise change with high clarity.
  Do not alter layout or structure.

- If intent is section_edit:
  Confidently upgrade the targeted section.
  Improve spacing, hierarchy, and visual quality within that section.

- If intent is style_upgrade:
  Apply a strong visual improvement.
  Upgrade colors, contrast, typography, spacing, and polish.
  Do NOT change layout structure or remove sections.

- If intent is feature_add:
  Add the requested section or component cleanly and confidently.
  Ensure it feels like a natural part of the page, not an afterthought.

- If intent is full_upgrade:
  Perform a clear, elevated redesign across the page.
  Maintain usability and structure, but do not hold back on improvement.

FINAL RULE:
- Prefer a confident, polished result over a minimal safe edit.
- The page should always look noticeably better after the change.
""".strip()

    multi_pass_block = """
MULTI-PASS EDITING STRATEGY:

You must internally follow these steps before producing the final HTML:

PASS 1 — Understand:
- Identify the exact user request.
- Identify the target section if any.
- Identify the intent strength: micro, section, style, feature, or full.

PASS 2 — Apply:
- Apply only the required changes.
- Respect section locking and intent-aware rules.
- Do not over-edit unrelated sections.

PASS 3 — Polish:
- Improve spacing, alignment, and visual hierarchy if needed.
- Ensure consistency across the page.
- Ensure the result looks production-ready.

IMPORTANT:
- Do NOT mention these passes in your output.
- Only return the final HTML.
""".strip()

    if request_kind == "enhance":
        intent_block = """
The user wants a full upgrade of the current page.
You may improve styles, hierarchy, layout, sections, spacing, CTA treatment, visual polish, and tasteful motion cues if useful.
Do not restart with a totally unrelated design.
Evolve the current page into a clearly stronger premium version.
Keep the core direction unless the user explicitly asks for a major redesign.
""".strip()
    elif request_kind == "edit":
        intent_block = """
The user wants a focused edit to the current page.
Preserve the existing design where possible.
Change only what is needed to fulfill the request well.
""".strip()
    else:
        intent_block = """
The user is asking for a complete page build.
Create a full premium page from scratch that is polished, responsive, and ready to preview.
""".strip()

    return f"""You are Simo, an expert AI website builder and editor.

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

CURRENT USER REQUEST:
{clean_request}

REQUEST TYPE:
{request_kind}

{intent_block}

{intent_guidance}

{mode_context}

{meta_context}

{section_context}

{edit_scope_context}

{intent_control_block}

{multi_pass_block}

SECTION LOCKING RULES:
- When editing an existing page, treat every major section as locked unless the user explicitly asks to change it.
- Major sections include hero, navbar, features, services, about, gallery, pricing, testimonials, faq, contact, and footer.
- If the user request points to one section, change that section first and leave other sections visually and structurally unchanged.
- Do not rewrite headings, copy, buttons, spacing, colors, or layout in non-targeted sections.
- Do not add, remove, reorder, or redesign sections unless the user explicitly asks for that.
- If a requested improvement can be completed inside one section, you MUST keep all other sections unchanged.
- Preserve the current visual identity of the page outside the targeted section.


CURRENT PAGE HTML:
{prior_html}
"""

def generate_builder_html(user_text: str, client, prior_state: dict = None) -> str:
    prior_state = prior_state or {}
    request_kind = builder_request_kind(user_text)
    clean_user_text = strip_mode_and_preset_lines(user_text)
    mode_context = build_builder_mode_context(user_text, prior_state)
    meta_context = build_builder_meta_context(prior_state)
    intent_guidance = build_intent_specific_edit_guidance(user_text, request_kind, prior_state)

    current_html = ""
    if isinstance(prior_state, dict):
        current_html = str(
            prior_state.get("html")
            or session.get("builder_current_html", "")
            or ""
        ).strip()

    if client:
        system_user_text = clean_user_text
        extra_parts = [part for part in [mode_context, meta_context, intent_guidance] if part]
        if extra_parts:
            system_user_text = "\n\n".join(extra_parts + [clean_user_text])

        prompt = build_builder_edit_prompt(user_text, prior_state, request_kind)
        messages = [{"role": "system", "content": prompt}]

        if prior_state.get("prompt") or current_html:
            edit_parts = []

            if mode_context:
                edit_parts.append(mode_context)
            if meta_context:
                edit_parts.append(meta_context)
            if intent_guidance:
                edit_parts.append(intent_guidance)

            edit_parts.append(f"User edit request:\n{clean_user_text}")

            if current_html:
                edit_parts.append(
                    "Current page HTML to edit:\n"
                    f"{current_html}"
                )

            edit_parts.append(
                "Apply the user's request to the current page HTML above. "
                "Preserve the existing layout, styling direction, and strong sections unless the user explicitly asks for a redesign. "
                "Return one complete updated HTML document only."
            )

            messages.append(
                {
                    "role": "user",
                    "content": "\n\n".join(edit_parts),
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
GENERATED_IMAGE_DIR = resolve_path(BASE_DIR, os.getenv("GENERATED_IMAGE_DIR"), "generated_images")
DB_PATH = resolve_path(BASE_DIR, os.getenv("DB_PATH"), "simo.db")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PUBLISHED_DIR, exist_ok=True)
os.makedirs(GENERATED_IMAGE_DIR, exist_ok=True)

APP_SECRET = os.getenv("FLASK_SECRET_KEY") or os.getenv("SECRET_KEY") or secrets.token_hex(32)
BASE_URL = (os.getenv("BASE_URL") or "").strip().rstrip("/")

OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
OPENAI_MODEL = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()
OPENAI_IMAGE_MODEL = (os.getenv("OPENAI_IMAGE_MODEL") or "gpt-image-1").strip()
OPENAI_IMAGE_SIZE = (os.getenv("OPENAI_IMAGE_SIZE") or "1024x1024").strip()
OPENAI_TIMEOUT_SECONDS = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "45") or "45")

STRIPE_SECRET_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
STRIPE_PUBLISHABLE_KEY = (os.getenv("STRIPE_PUBLISHABLE_KEY") or "").strip()
STRIPE_PRICE_ID = (os.getenv("STRIPE_PRICE_ID") or "").strip()
STRIPE_WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()

GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
GOOGLE_CLIENT_SECRET = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()

FREE_DAILY_LIMIT = int(os.getenv("FREE_DAILY_LIMIT", "50"))

# =========================================================
# Image/design credit gate
# =========================================================
# Stripe Pro already marks a user as pro. This layer prevents paid OpenAI image
# routes from running unless the user has a Simo image/design allowance.
SIMO_IMAGE_CREDIT_GUARD_ENABLED = env_bool("SIMO_IMAGE_CREDIT_GUARD_ENABLED", True)
SIMO_ALLOW_ANON_IMAGE_GENERATION = env_bool("SIMO_ALLOW_ANON_IMAGE_GENERATION", False)
SIMO_FREE_IMAGE_CREDITS_LIFETIME = int(os.getenv("SIMO_FREE_IMAGE_CREDITS_LIFETIME", "0") or "0")
SIMO_PRO_IMAGE_CREDITS_MONTHLY = int(os.getenv("SIMO_PRO_IMAGE_CREDITS_MONTHLY", "100") or "100")
SIMO_TEAM_IMAGE_CREDITS_MONTHLY = int(os.getenv("SIMO_TEAM_IMAGE_CREDITS_MONTHLY", "500") or "500")
SIMO_ADMIN_EMAILS = (os.getenv("SIMO_ADMIN_EMAILS") or os.getenv("SIMO_OWNER_EMAILS") or os.getenv("SIMO_OWNER_EMAIL") or "").strip()

# PHASE 14M V1.3.24 — Live Stripe customer fallback fix.\n# Optional one-time Stripe credit packs for additional image/design usage.
SIMO_CREDIT_PACKS_ENABLED = env_bool("SIMO_CREDIT_PACKS_ENABLED", True)
SIMO_CREDIT_PACK_25_PRICE_ID = (os.getenv("SIMO_CREDIT_PACK_25_PRICE_ID") or "").strip()
SIMO_CREDIT_PACK_100_PRICE_ID = (os.getenv("SIMO_CREDIT_PACK_100_PRICE_ID") or "").strip()
SIMO_CREDIT_PACK_250_PRICE_ID = (os.getenv("SIMO_CREDIT_PACK_250_PRICE_ID") or "").strip()


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


def table_has_column(conn, table_name: str, column_name: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(str(r["name"]).strip().lower() == column_name.strip().lower() for r in rows)


def ensure_column(conn, table_name: str, column_name: str, column_sql: str):
    if not table_has_column(conn, table_name, column_name):
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")


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
            password_hash TEXT,
            auth_provider TEXT DEFAULT 'google',
            pro INTEGER DEFAULT 0,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            stripe_subscription_status TEXT,
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
        CREATE TABLE IF NOT EXISTS design_credit_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_key TEXT,
            period_key TEXT,
            plan TEXT,
            count INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT,
            UNIQUE(user_key, period_key)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS design_credit_purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_key TEXT,
            email TEXT,
            stripe_session_id TEXT UNIQUE,
            credits INTEGER DEFAULT 0,
            used INTEGER DEFAULT 0,
            source TEXT,
            created_at TEXT,
            updated_at TEXT
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

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS saved_builds (
            id TEXT PRIMARY KEY,
            user_email TEXT,
            title TEXT,
            html TEXT,
            source_text TEXT,
            notes TEXT,
            tags_json TEXT,
            pinned INTEGER DEFAULT 0,
            archived INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """
    )

    ensure_column(conn, "users", "password_hash", "TEXT")
    ensure_column(conn, "users", "auth_provider", "TEXT DEFAULT 'google'")
    ensure_column(conn, "users", "stripe_customer_id", "TEXT")
    ensure_column(conn, "users", "stripe_subscription_id", "TEXT")
    ensure_column(conn, "users", "stripe_subscription_status", "TEXT")

    ensure_column(conn, "saved_builds", "source_text", "TEXT")
    ensure_column(conn, "saved_builds", "notes", "TEXT")
    ensure_column(conn, "saved_builds", "tags_json", "TEXT")
    ensure_column(conn, "saved_builds", "pinned", "INTEGER DEFAULT 0")
    ensure_column(conn, "saved_builds", "archived", "INTEGER DEFAULT 0")

    conn.commit()
    conn.close()


def upsert_user(email: str, name: str = "", google_sub: str = "", password_hash: str = "", auth_provider: str = ""):
    email = (email or "").strip().lower()
    name = (name or "").strip()
    google_sub = (google_sub or "").strip()
    password_hash = str(password_hash or "").strip()
    auth_provider = normalize_auth_provider(auth_provider or ("local" if password_hash else "google"))

    if not email:
        return

    now = utcnow().isoformat()

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, name, google_sub, password_hash, auth_provider
        FROM users
        WHERE email = ?
        """,
        (email,),
    )
    row = cur.fetchone()

    if row:
        next_name = name or str(row["name"] or "").strip()
        next_google_sub = google_sub or str(row["google_sub"] or "").strip()
        next_password_hash = password_hash or str(row["password_hash"] or "").strip()
        next_auth_provider = merge_auth_provider(str(row["auth_provider"] or "").strip(), auth_provider)

        cur.execute(
            """
            UPDATE users
            SET name = ?, google_sub = ?, password_hash = ?, auth_provider = ?, updated_at = ?
            WHERE email = ?
            """,
            (next_name, next_google_sub, next_password_hash, next_auth_provider, now, email),
        )
    else:
        cur.execute(
            """
            INSERT INTO users (
                email, name, google_sub, password_hash, auth_provider, pro,
                stripe_customer_id, stripe_subscription_id, stripe_subscription_status,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, 0, '', '', '', ?, ?)
            """,
            (email, name, google_sub, password_hash, auth_provider, now, now),
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


def get_user_by_customer_id(customer_id: str):
    customer_id = str(customer_id or "").strip()
    if not customer_id:
        return None

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE stripe_customer_id = ?", (customer_id,))
    row = cur.fetchone()
    conn.close()
    return row


def get_user_by_subscription_id(subscription_id: str):
    subscription_id = str(subscription_id or "").strip()
    if not subscription_id:
        return None

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE stripe_subscription_id = ?", (subscription_id,))
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


def set_user_subscription_state(
    *,
    email: str = "",
    customer_id: str = "",
    subscription_id: str = "",
    subscription_status: str = "",
    is_pro: bool = None,
):
    email = (email or "").strip().lower()
    customer_id = str(customer_id or "").strip()
    subscription_id = str(subscription_id or "").strip()
    subscription_status = str(subscription_status or "").strip()
    now = utcnow().isoformat()

    conn = get_db()
    cur = conn.cursor()

    row = None
    if email:
        cur.execute("SELECT * FROM users WHERE email = ?", (email,))
        row = cur.fetchone()
    if not row and customer_id:
        cur.execute("SELECT * FROM users WHERE stripe_customer_id = ?", (customer_id,))
        row = cur.fetchone()
    if not row and subscription_id:
        cur.execute("SELECT * FROM users WHERE stripe_subscription_id = ?", (subscription_id,))
        row = cur.fetchone()

    if not row:
        if not email:
            conn.close()
            return

        cur.execute(
            """
            INSERT INTO users (
                email, name, google_sub, pro,
                stripe_customer_id, stripe_subscription_id, stripe_subscription_status,
                created_at, updated_at
            )
            VALUES (?, '', '', ?, ?, ?, ?, ?, ?)
            """,
            (
                email,
                1 if bool(is_pro) else 0,
                customer_id,
                subscription_id,
                subscription_status,
                now,
                now,
            ),
        )
        conn.commit()
        conn.close()
        return

    target_email = str(row["email"] or "").strip().lower()
    next_customer_id = customer_id or str(row["stripe_customer_id"] or "").strip()
    next_subscription_id = subscription_id or str(row["stripe_subscription_id"] or "").strip()
    next_status = subscription_status or str(row["stripe_subscription_status"] or "").strip()

    if is_pro is None:
        next_pro = int(row["pro"] or 0)
    else:
        next_pro = 1 if bool(is_pro) else 0

    cur.execute(
        """
        UPDATE users
        SET stripe_customer_id = ?,
            stripe_subscription_id = ?,
            stripe_subscription_status = ?,
            pro = ?,
            updated_at = ?
        WHERE email = ?
        """,
        (
            next_customer_id,
            next_subscription_id,
            next_status,
            next_pro,
            now,
            target_email,
        ),
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
    return bool(row and int(row["pro"] or 0) == 1)


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



# =========================================================
# Simo image/design credit helpers
# =========================================================
def simo_admin_email_set():
    raw = str(SIMO_ADMIN_EMAILS or "").strip()
    if not raw:
        return set()
    return {part.strip().lower() for part in re.split(r"[,;\s]+", raw) if part.strip()}


def is_simo_admin_email(email: str = "") -> bool:
    email = (email or current_user_email() or "").strip().lower()
    return bool(email and email in simo_admin_email_set())


def simo_design_plan(email: str = "") -> str:
    email = (email or current_user_email() or "").strip().lower()
    if is_simo_admin_email(email):
        return "admin"
    if not email:
        return "anon"
    try:
        row = sync_user_pro_from_stripe(email)
    except Exception:
        row = get_user_by_email(email)
    if row and int(row["pro"] or 0) == 1:
        return "pro"
    return "free"


def simo_design_credit_user_key(email: str = "") -> str:
    email = (email or current_user_email() or "").strip().lower()
    if email:
        return f"user:{email}"
    anon = session.get("anon_id")
    if not anon:
        anon = secrets.token_hex(16)
        session["anon_id"] = anon
        session.modified = True
    return f"anon:{anon}"


def simo_design_credit_period_key(plan: str) -> str:
    clean_plan = str(plan or "free").strip().lower()
    if clean_plan in {"pro", "team"}:
        return f"{clean_plan}:{utcnow().strftime('%Y-%m')}"
    if clean_plan == "admin":
        return "admin:unlimited"
    return f"{clean_plan}:lifetime"


def simo_design_credit_limit(plan: str) -> int:
    clean_plan = str(plan or "free").strip().lower()
    if clean_plan == "admin":
        return -1
    if clean_plan == "team":
        return SIMO_TEAM_IMAGE_CREDITS_MONTHLY
    if clean_plan == "pro":
        return SIMO_PRO_IMAGE_CREDITS_MONTHLY
    if clean_plan == "anon" and not SIMO_ALLOW_ANON_IMAGE_GENERATION:
        return 0
    return SIMO_FREE_IMAGE_CREDITS_LIFETIME


def simo_get_design_credit_usage(user_key: str, period_key: str) -> int:
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT count FROM design_credit_usage WHERE user_key = ? AND period_key = ?",
        (user_key, period_key),
    )
    row = cur.fetchone()
    conn.close()
    return int(row["count"] or 0) if row else 0


def simo_increment_design_credit_usage(user_key: str, period_key: str, plan: str) -> int:
    now = utcnow().isoformat()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT count FROM design_credit_usage WHERE user_key = ? AND period_key = ?",
        (user_key, period_key),
    )
    row = cur.fetchone()
    if row:
        new_count = int(row["count"] or 0) + 1
        cur.execute(
            """
            UPDATE design_credit_usage
            SET count = ?, plan = ?, updated_at = ?
            WHERE user_key = ? AND period_key = ?
            """,
            (new_count, plan, now, user_key, period_key),
        )
    else:
        new_count = 1
        cur.execute(
            """
            INSERT INTO design_credit_usage (user_key, period_key, plan, count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_key, period_key, plan, new_count, now, now),
        )
    conn.commit()
    conn.close()
    return new_count



def simo_credit_pack_options():
    packs = []
    raw = [
        ("25", 25, SIMO_CREDIT_PACK_25_PRICE_ID, "Starter Pack", "Good for small design sessions."),
        ("100", 100, SIMO_CREDIT_PACK_100_PRICE_ID, "Creator Pack", "Best for active personal design work."),
        ("250", 250, SIMO_CREDIT_PACK_250_PRICE_ID, "Builder Pack", "Best for heavier creation sessions."),
    ]
    for key, credits, price_id, label, description in raw:
        if price_id:
            packs.append({
                "key": key,
                "credits": credits,
                "price_id": price_id,
                "label": label,
                "description": description,
            })
    return packs


def simo_credit_pack_by_key(pack_key: str):
    key = str(pack_key or "").strip().lower()
    for pack in simo_credit_pack_options():
        if pack["key"] == key:
            return pack
    return None


def simo_get_purchased_design_credit_remaining(user_key: str) -> int:
    if not user_key:
        return 0
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COALESCE(SUM(credits - used), 0) AS remaining
        FROM design_credit_purchases
        WHERE user_key = ? AND credits > used
        """,
        (user_key,),
    )
    row = cur.fetchone()
    conn.close()
    return max(0, int(row["remaining"] or 0)) if row else 0


def simo_grant_purchased_design_credits(email: str, credits: int, stripe_session_id: str = "", source: str = "manual") -> dict:
    email = (email or "").strip().lower()
    credits = int(credits or 0)
    if not email or credits <= 0:
        return {"ok": False, "error": "missing_email_or_credits"}
    user_key = simo_design_credit_user_key(email)
    now = utcnow().isoformat()
    session_id = str(stripe_session_id or "").strip()

    conn = get_db()
    cur = conn.cursor()
    if session_id:
        cur.execute("SELECT * FROM design_credit_purchases WHERE stripe_session_id = ?", (session_id,))
        existing = cur.fetchone()
        if existing:
            conn.close()
            return {"ok": True, "already_granted": True, "credits": int(existing["credits"] or 0)}

    cur.execute(
        """
        INSERT INTO design_credit_purchases (user_key, email, stripe_session_id, credits, used, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        """,
        (user_key, email, session_id or f"manual_{secrets.token_hex(12)}", credits, source, now, now),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "already_granted": False, "credits": credits}


def simo_consume_purchased_design_credit(user_key: str) -> bool:
    if not user_key:
        return False
    now = utcnow().isoformat()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT * FROM design_credit_purchases
        WHERE user_key = ? AND credits > used
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        """,
        (user_key,),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        return False
    cur.execute(
        """
        UPDATE design_credit_purchases
        SET used = used + 1, updated_at = ?
        WHERE id = ? AND credits > used
        """,
        (now, row["id"]),
    )
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return bool(ok)


def simo_design_credit_status(email: str = "") -> dict:
    email = (email or current_user_email() or "").strip().lower()
    plan = simo_design_plan(email)
    user_key = simo_design_credit_user_key(email)
    period_key = simo_design_credit_period_key(plan)
    limit = simo_design_credit_limit(plan)
    included_used = 0 if limit < 0 else simo_get_design_credit_usage(user_key, period_key)
    included_remaining = None if limit < 0 else max(0, limit - included_used)
    purchased_remaining = 0 if limit < 0 else simo_get_purchased_design_credit_remaining(user_key)
    total_remaining = None if limit < 0 else max(0, int(included_remaining or 0) + int(purchased_remaining or 0))
    return {
        "enabled": bool(SIMO_IMAGE_CREDIT_GUARD_ENABLED),
        "loggedIn": bool(email),
        "email": email,
        "plan": plan,
        "user_key": user_key,
        "period_key": period_key,
        "limit": limit,
        "used": included_used,
        "remaining": total_remaining,
        "included_remaining": included_remaining,
        "purchased_remaining": purchased_remaining,
        "unlimited": limit < 0,
        "requires_payment": plan in {"free", "anon"} and int(total_remaining or 0) <= 0,
        "packs_enabled": bool(SIMO_CREDIT_PACKS_ENABLED),
        "pack_options": [
            {k: v for k, v in pack.items() if k != "price_id"}
            for pack in simo_credit_pack_options()
        ],
    }

def simo_image_credit_denied_response(status: dict):
    plan = status.get("plan") or "free"
    if plan == "anon" and not SIMO_ALLOW_ANON_IMAGE_GENERATION:
        return jsonify({
            "ok": False,
            "error": "Please sign in and upgrade to use Simo image/design generation.",
            "code": "login_required_for_image_generation",
            "needs_login": True,
            "needs_upgrade": True,
            "image_credits": status,
        }), 401
    if status.get("requires_payment"):
        return jsonify({
            "ok": False,
            "error": "Image/design generation is a paid Simo feature. Upgrade to Pro to continue.",
            "code": "simo_image_credits_required",
            "needs_upgrade": True,
            "image_credits": status,
        }), 402
    return jsonify({
        "ok": False,
        "error": "You have used all included Simo design credits for this period. Upgrade or add more credits to continue.",
        "code": "simo_image_credits_exhausted",
        "needs_upgrade": plan in {"free", "anon"},
        "image_credits": status,
    }), 402


def simo_check_image_credit_available(action_type: str = "image_generation"):
    if not SIMO_IMAGE_CREDIT_GUARD_ENABLED:
        return True, simo_design_credit_status(), None
    status = simo_design_credit_status()
    if status.get("unlimited"):
        return True, status, None
    if int(status.get("remaining") or 0) > 0:
        return True, status, None
    return False, status, simo_image_credit_denied_response(status)


def simo_consume_image_credit(action_type: str = "image_generation") -> dict:
    if not SIMO_IMAGE_CREDIT_GUARD_ENABLED:
        status = simo_design_credit_status()
        status["consumed"] = False
        status["action_type"] = action_type
        return status
    status = simo_design_credit_status()
    if status.get("unlimited"):
        status["consumed"] = False
        status["action_type"] = action_type
        return status

    # Consume included monthly/lifetime credits first. If those are gone,
    # consume purchased credit-pack credits.
    if int(status.get("included_remaining") or 0) > 0:
        new_used = simo_increment_design_credit_usage(status["user_key"], status["period_key"], status["plan"])
        status = simo_design_credit_status()
        status["consumed_from"] = "included"
    else:
        ok = simo_consume_purchased_design_credit(status["user_key"])
        status = simo_design_credit_status()
        status["consumed_from"] = "purchased" if ok else "none"

    status["consumed"] = status.get("consumed_from") in {"included", "purchased"}
    status["action_type"] = action_type
    return status

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


def normalize_saved_build_item(row):
    tags = safe_json_loads(row["tags_json"] or "[]", [])
    if not isinstance(tags, list):
        tags = []

    return {
        "id": str(row["id"] or ""),
        "title": str(row["title"] or "Untitled Build"),
        "html": str(row["html"] or ""),
        "sourceText": str(row["source_text"] or ""),
        "notes": str(row["notes"] or ""),
        "tags": safe_text_list(tags),
        "pinned": bool(int(row["pinned"] or 0)),
        "archived": bool(int(row["archived"] or 0)),
        "createdAt": str(row["created_at"] or ""),
        "updatedAt": str(row["updated_at"] or ""),
    }

def normalize_auth_provider(value: str) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return "local"
    return raw


def merge_auth_provider(existing: str, incoming: str) -> str:
    existing_clean = normalize_auth_provider(existing)
    incoming_clean = normalize_auth_provider(incoming)

    existing_parts = {p.strip() for p in existing_clean.split(",") if p.strip()}
    incoming_parts = {p.strip() for p in incoming_clean.split(",") if p.strip()}

    merged = existing_parts | incoming_parts
    ordered = []

    for key in ["google", "local"]:
        if key in merged:
            ordered.append(key)

    for item in sorted(merged):
        if item not in ordered:
            ordered.append(item)

    return ",".join(ordered) if ordered else incoming_clean


def valid_email(email: str) -> bool:
    email = str(email or "").strip()
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


def valid_password(password: str) -> bool:
    return len(str(password or "")) >= 6


def set_logged_in_user(email: str, name: str = "", google_sub: str = ""):
    session["user_email"] = str(email or "").strip().lower()
    session["user_name"] = str(name or "").strip()
    session["google_sub"] = str(google_sub or "").strip()


def clear_logged_in_user():
    session.pop("user_email", None)
    session.pop("user_name", None)
    session.pop("google_sub", None)


init_db()


# =========================================================
# OpenAI helpers
# =========================================================
def get_client():
    if not OPENAI_API_KEY:
        return None
    # PHASE 11.3: never let image generation hang forever.
    # If OpenAI/network/billing/model stalls, Simo should return a clear JSON error
    # so the frontend can show the exact problem instead of staying pending.
    return OpenAI(api_key=OPENAI_API_KEY, timeout=OPENAI_TIMEOUT_SECONDS, max_retries=0)


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

    return "Iâm sorry, something went wrong while generating a response."


def public_generated_image_url(filename: str) -> str:
    """Return the browser URL for a generated visual.

    Keep this relative by default so local testing, Render, and the custom
    domain all request the image from the same Flask app instance that saved it.
    Absolute BASE_URL image links caused the frontend to open simonchat.ai while
    the file existed only in the currently running app process.
    """
    safe_name = secure_filename(str(filename or "").strip())
    if not safe_name:
        return ""
    path = f"/generated-images/{safe_name}"
    if env_bool("SIMO_ABSOLUTE_GENERATED_IMAGE_URLS", False) and BASE_URL:
        return f"{BASE_URL}{path}"
    return path


def generated_image_storage_dirs():
    """All places Simo may save or look for generated visual files."""
    candidates = [
        GENERATED_IMAGE_DIR,
        os.path.join(BASE_DIR, "generated_images"),
        os.path.join(STATIC_DIR, "generated_images"),
        os.path.join(STATIC_DIR, "generated-images"),
    ]

    out = []
    seen = set()
    for item in candidates:
        path = os.path.abspath(str(item or ""))
        if not path or path in seen:
            continue
        seen.add(path)
        os.makedirs(path, exist_ok=True)
        out.append(path)
    return out


def save_generated_image_bytes(filename: str, raw: bytes) -> str:
    safe_name = secure_filename(str(filename or "").strip())
    if not safe_name:
        safe_name = f"simo_visual_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.png"

    primary_path = os.path.join(GENERATED_IMAGE_DIR, safe_name)
    os.makedirs(os.path.dirname(primary_path), exist_ok=True)

    with open(primary_path, "wb") as f:
        f.write(raw)

    # Mirror to the other known image folders. This keeps the route resilient
    # across local runs, deploys, and env-folder changes without touching frontend logic.
    for folder in generated_image_storage_dirs():
        mirror_path = os.path.join(folder, safe_name)
        if os.path.abspath(mirror_path) == os.path.abspath(primary_path):
            continue
        try:
            shutil.copyfile(primary_path, mirror_path)
        except Exception:
            pass

    return safe_name


def find_generated_image_path(filename: str) -> str:
    safe_name = secure_filename(str(filename or "").strip())
    if not safe_name:
        return ""

    for folder in generated_image_storage_dirs():
        candidate = os.path.abspath(os.path.join(folder, safe_name))
        folder_abs = os.path.abspath(folder)
        if not candidate.startswith(folder_abs + os.sep) and candidate != folder_abs:
            continue
        if os.path.isfile(candidate):
            return candidate

    return ""


def local_generated_image_path_from_url(image_url: str) -> str:
    raw = str(image_url or "").strip()
    if not raw:
        return ""
    filename = raw.rsplit("/", 1)[-1].split("?", 1)[0].strip()
    if not filename:
        return ""
    return find_generated_image_path(filename)


def generate_visual_image_edit(user_text: str, base_image_url: str, client, explicit_domain: str = "", prebuilt_prompt: bool = False):
    """Attempt an image edit on the active visual first, then let caller fall back.

    PHASE 14J goal:
    - treat follow-up design changes as edits to the active image project
    - keep exact subject continuity tighter than text-only regeneration
    - expose clean debug info when edit mode cannot run
    """
    if not client:
        return {
            "ok": False,
            "url": "",
            "error": "Image generation is not configured yet.",
            "prompt": "",
            "attempts": 0,
            "mode": "edit",
            "base_image_path": "",
        }

    prompt = normalize_whitespace(user_text) if prebuilt_prompt else make_visual_image_prompt(user_text, explicit_domain)
    base_path = local_generated_image_path_from_url(base_image_url)
    if not prompt:
        return {
            "ok": False,
            "url": "",
            "error": "Image prompt is empty.",
            "prompt": "",
            "attempts": 0,
            "mode": "edit",
            "base_image_path": base_path,
        }
    if not base_path or not os.path.isfile(base_path):
        return {
            "ok": False,
            "url": "",
            "error": "Active image for edit was not found on disk.",
            "prompt": prompt,
            "attempts": 0,
            "mode": "edit",
            "base_image_path": base_path,
        }

    last_error = ""
    print(f"[SIMO IMAGE EDIT] start model={OPENAI_IMAGE_MODEL} size={OPENAI_IMAGE_SIZE} domain={explicit_domain} base_image={base_path}", flush=True)

    for attempt in range(1, 3):
        try:
            with open(base_path, "rb") as image_file:
                image_kwargs = {
                    "model": OPENAI_IMAGE_MODEL,
                    "image": image_file,
                    "prompt": prompt,
                    "size": OPENAI_IMAGE_SIZE,
                    "n": 1,
                }
                if str(OPENAI_IMAGE_MODEL or "").lower().startswith("gpt-image"):
                    image_kwargs["output_format"] = os.getenv("OPENAI_IMAGE_OUTPUT_FORMAT", "png").strip() or "png"
                    image_kwargs["quality"] = os.getenv("OPENAI_IMAGE_QUALITY", "medium").strip() or "medium"

                print(f"[SIMO IMAGE EDIT] attempt {attempt}/2 calling OpenAI images.edit", flush=True)
                try:
                    resp = client.images.edit(**image_kwargs)
                except TypeError:
                    image_kwargs.pop("output_format", None)
                    image_kwargs.pop("quality", None)
                    try:
                        resp = client.images.edit(**image_kwargs)
                    except TypeError:
                        image_kwargs.pop("image", None)
                        image_kwargs["image"] = [image_file]
                        resp = client.images.edit(**image_kwargs)

            extracted = extract_image_from_openai_response(resp)
            kind = extracted.get("kind")
            value = extracted.get("value")
            print(f"[SIMO IMAGE EDIT] attempt {attempt}/2 extracted kind={kind or 'none'} has_value={bool(value)}", flush=True)

            if kind == "url" and value:
                try:
                    with urllib.request.urlopen(value, timeout=30) as r:
                        raw = r.read()
                    if raw:
                        filename = f"simo_visual_edit_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.png"
                        saved_name = save_generated_image_bytes(filename, raw)
                        return {
                            "ok": True,
                            "url": public_generated_image_url(saved_name),
                            "error": "",
                            "prompt": prompt,
                            "attempts": attempt,
                            "mode": "edit",
                            "base_image_path": base_path,
                        }
                except Exception:
                    return {
                        "ok": True,
                        "url": value,
                        "error": "",
                        "prompt": prompt,
                        "attempts": attempt,
                        "mode": "edit",
                        "base_image_path": base_path,
                    }

            if kind == "b64" and value:
                raw = base64.b64decode(value)
                filename = f"simo_visual_edit_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.png"
                saved_name = save_generated_image_bytes(filename, raw)
                return {
                    "ok": True,
                    "url": public_generated_image_url(saved_name),
                    "error": "",
                    "prompt": prompt,
                    "attempts": attempt,
                    "mode": "edit",
                    "base_image_path": base_path,
                }

            last_error = "No image data returned from the image edit model."
        except Exception as e:
            last_error = f"{type(e).__name__}: {str(e)}"
            print(f"[SIMO IMAGE EDIT] attempt {attempt}/2 failed: {last_error}", flush=True)

    return {
        "ok": False,
        "url": "",
        "error": last_error or "Image edit did not complete.",
        "prompt": prompt,
        "attempts": 2,
        "mode": "edit",
        "base_image_path": base_path,
    }


# ---------------------------------------------------------
# PHASE 14J — Active Image Edit Lock
# ---------------------------------------------------------
def simo14f_norm(text: str) -> str:
    return normalize_whitespace(str(text or "")).lower()


def simo14f_has_rim(text: str) -> bool:
    return bool(re.search(r"\b(tire\s+rim|wheel\s+rim|alloy\s+wheel|forged\s+wheel|custom\s+wheel|rim|rims)\b", simo14f_norm(text), flags=re.IGNORECASE))


def simo14f_has_guitar(text: str) -> bool:
    return bool(re.search(r"\b(bass\s+guitar|electric\s+guitar|guitar|headstock|fretboard|pickups?|strings?)\b", simo14f_norm(text), flags=re.IGNORECASE))


def simo14f_active_text(active: dict) -> str:
    if not isinstance(active, dict):
        return ""
    active_state = active.get("designState") if isinstance(active.get("designState"), dict) else {}
    parts = []
    for key in (
        "lockedSubject", "exactSubject", "requestedAsset", "item", "title", "alt",
        "prompt", "sourcePrompt", "latestPrompt", "category", "domain", "projectType",
    ):
        val = active.get(key)
        if val:
            parts.append(str(val))
    for key in ("lockedSubject", "exactSubject", "item", "title", "domain"):
        val = active_state.get(key)
        if val:
            parts.append(str(val))
    return normalize_whitespace(" ".join(parts))


def simo14f_lock_from_request(user_prompt: str, original_prompt: str, active: dict) -> dict:
    """Return the authoritative object/domain for exact-object visual edits.

    The user's explicit object wins. For vague edits, the current active exact
    object wins. This prevents wheel/rim edits from becoming full-car renders.
    """
    direct = normalize_whitespace(f"{original_prompt or ''} {user_prompt or ''}")
    active_text = simo14f_active_text(active)

    # Explicit fresh object names in the current request win first.
    if simo14f_has_rim(direct):
        return {
            "kind": "rim",
            "domain": "product",
            "subject": "single standalone custom tire rim / alloy wheel",
            "source": "explicit_prompt",
        }
    if simo14f_has_guitar(direct):
        return {
            "kind": "guitar",
            "domain": "instrument",
            "subject": "single standalone custom guitar / bass guitar",
            "source": "explicit_prompt",
        }

    # Vague edit: use the active project lock.
    vague = bool(re.search(r"\b(make it|change it|refine|continue|edit|add|remove|turn it|more|less|variation|variations|render)\b", simo14f_norm(original_prompt or user_prompt), flags=re.IGNORECASE))
    if vague and simo14f_has_rim(active_text):
        return {
            "kind": "rim",
            "domain": "product",
            "subject": "single standalone custom tire rim / alloy wheel",
            "source": "active_project",
        }
    if vague and simo14f_has_guitar(active_text):
        return {
            "kind": "guitar",
            "domain": "instrument",
            "subject": "single standalone custom guitar / bass guitar",
            "source": "active_project",
        }

    return {"kind": "", "domain": "", "subject": "", "source": ""}


def simo14f_rim_prompt(user_edit: str, lock_source: str = "") -> str:
    """PHASE 14J: complete-wheel hard-lock prompt for rim follow-up edits."""
    edit = strip_visual_meta_instructions(user_edit) or "refine this automotive alloy wheel rim"
    low = edit.lower()

    finish_bits = []
    if re.search(r"\b(black chrome|gloss black|black)\b", low):
        finish_bits.append("glossy black chrome metallic finish applied to the entire complete wheel rim")
    if re.search(r"\b(blue|led|accent|accents|glow|neon)\b", low):
        finish_bits.append("thin electric blue LED accent strips integrated into multiple radial spokes, the outer circular lip, the inner barrel grooves, and the center-cap ring")
    if not finish_bits:
        finish_bits.append("apply the requested edit only to the complete circular automotive alloy wheel rim")

    finish_direction = "; ".join(finish_bits)

    return (
        "PHASE 14J COMPLETE WHEEL HARD LOCK — RENDER A FULL CIRCULAR AUTOMOTIVE ALLOY WHEEL RIM ONLY.\n"
        "The final image must show exactly ONE complete round car wheel rim / alloy wheel, not a partial part and not a generic product.\n"
        "Composition contract: the silhouette must be a full circle; the entire outer circular lip must be visible; the deep inner barrel must be visible; 10 to 12 radial split spokes must connect from the outer lip into a round center hub; a circular center cap and five lug holes must be visible.\n"
        "It must look like a standalone aftermarket automotive alloy wheel rim photographed in a studio, without tire rubber and without any car attached.\n"
        "Do not crop into one spoke. Do not render a single spoke, stand, bracket, handle, pedestal, scanner, speaker, mouse, appliance, container, cube, abstract product, or futuristic device.\n"
        f"User edit/request to apply to this same complete wheel rim only: {edit}.\n"
        f"Required finish/edit on the complete wheel rim only: {finish_direction}.\n"
        f"Object lock source: {lock_source or 'complete-wheel-subject-lock'}.\n"
        "Camera/composition: centered front three-quarter studio product view, complete circular rim fills most of the frame, neutral gray background, realistic shadow below the rim, high-end product photography.\n"
        "Hard exclusions: no full car, no partial car, no car body, no hood, no windshield, no headlights, no road, no racetrack, no garage, no driveway, no house, no architecture, no rectangular gadget, no black device, no random product part, no single-spoke object.\n"
        "No text, labels, watermark, UI, diagram, fake brand marks, or placeholder geometry."
    )
def visual_prompt_domain_from_text(user_text: str, explicit_domain: str = "") -> str:
    """Negation-aware domain detection for visual generation.

    PHASE 10.4A goal:
    - keep fresh prompts in control
    - do not let a home prompt containing "3 car garage" get trapped in vehicle mode
    - still respect explicit domains and negations
    """
    explicit = str(explicit_domain or "").strip().lower()
    lower = normalize_whitespace(user_text).lower()

    # PHASE 14F: explicit frontend domains are respected, except when the
    # text itself clearly names a stricter standalone object such as a rim.
    # This blocks vehicle fallback from swallowing wheel/rim product edits.
    if explicit in {"vehicle", "home", "interior", "instrument", "product", "brand", "digital", "fashion", "character", "object", "industrial", "furniture", "wearable", "marine", "editorial"}:
        if simo14f_has_rim(lower):
            return "product"
        if explicit == "vehicle" and re.search(r"\b(standalone|single|isolated|product render|no car|without car|not a car)\b", lower):
            return "product"
        return explicit


    def remove_negated_terms(text: str) -> str:
        terms = [
            "sports car", "concept car", "supercar", "hypercar", "race car", "car", "vehicle", "truck", "motorcycle",
            "house", "home", "villa", "mansion", "building", "buildings", "architecture", "architectural", "garage", "driveway", "residential", "street",
            "interior", "room", "kitchen", "bathroom", "bedroom", "living room", "logo", "brand", "product", "app", "dashboard", "website",
        ]
        out = text
        for term in sorted(terms, key=len, reverse=True):
            escaped = re.escape(term)
            out = re.sub(rf"\b(no|not|without|exclude|excluding|avoid|remove)\s+(a\s+|an\s+|the\s+)?{escaped}\b", " ", out)
        return normalize_whitespace(out)

    clean = remove_negated_terms(lower)

    def has(pattern: str) -> bool:
        return bool(re.search(pattern, clean))

    if has(r"\b(guitar|electric guitar|bass guitar|instrument|musical instrument|violin|piano|drum kit|synthesizer|keyboard|microphone|amp|amplifier|pickups?|headstock|fretboard|strings?)\b"):
        return "instrument"
    if has(r"\b(interior|kitchen|bathroom|bedroom|living room|office|room|furniture|moodboard|mood board)\b"):
        return "interior"
    if has(r"\b(logo|brand identity|branding|brand mark|wordmark|mascot)\b"):
        return "brand"
    if has(r"\b(app screen|dashboard|ui|interface|mobile app|website mockup|software|saas)\b"):
        return "digital"
    if has(r"\b(yacht|boat|marine|speedboat|catamaran)\b"):
        return "marine"
    if has(r"\b(light fixture|parking lot light|street light|fixture|industrial light|pole light|floodlight|lamp post|outdoor light|industrial product)\b"):
        return "industrial"
    if has(r"\b(chair|gaming chair|desk|table|sofa|couch|bed frame|shelf|cabinet|stool|furniture)\b"):
        return "furniture"
    if has(r"\b(shirt|jacket|shoe|sneaker|fashion|clothing|dress|watch|bag|handbag|helmet|sunglasses|wearable)\b"):
        return "wearable"
    if has(r"\b(book cover|book jacket|dust jacket|paperback cover|hardcover cover)\b"):
        return "editorial"
    if has(r"\b(product|mockup|phone|bottle|flashlight|torch|package|packaging|box|jar|can|rim|rims|wheel|wheels|tire rim|alloy wheel|forged wheel|lamp|appliance|dog leash|leash|collar|pet accessory|toy|tool|device|accessory|poster|flyer|brochure|menu)\b"):
        return "product"

    # Home should beat vehicle when the scene is clearly architecture/home design.
    if has(r"\b(home|house|villa|mansion|estate|architecture|architectural|floor plan|floorplan|blueprint|garage|pool|landscape|exterior|driveway)\b"):
        return "home"
    if has(r"\b(sports car|sportscar|concept car|supercar|hypercar|race car|car|vehicle|automotive|truck|motorcycle|widebody|spoiler|diffuser|carbon fiber|stance)\b"):
        return "vehicle"
    return "object"



def extract_visual_subject_phrase(user_text: str, fallback: str = "visual concept") -> str:
    text = normalize_whitespace(user_text)
    if not text:
        return normalize_whitespace(fallback) or "visual concept"

    text = re.sub(r"^continue this same active visual/design project\s*:\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^user wants\s*:\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(Preserve project identity|Treat this like a ChatGPT/Grok image-first design refinement|Do not switch domains)\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^(please\s+)?(can you\s+|could you\s+|would you\s+|i want\s+|i want you to\s+|i need\s+|show me\s+|show us\s+|build me\s+|build us\s+|build\s+|make me\s+|make us\s+|make\s+|create me\s+|create us\s+|create\s+|design me\s+|design us\s+|design\s+|generate me\s+|generate us\s+|generate\s+|give me\s+|give us\s+|render\s+|visualize\s+|draft\s+|draw\s+)", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^(a|an|the)\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(that|which)\s+i\s+can\s+(edit|design|refine).*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bfor me to\s+(edit|design|refine).*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bto\s+(edit|design|refine).*$", "", text, flags=re.IGNORECASE)
    text = normalize_whitespace(text)
    if not text:
        return normalize_whitespace(fallback) or "visual concept"
    words = text.split()[:12]
    return normalize_whitespace(" ".join(words)) or (normalize_whitespace(fallback) or "visual concept")

def visual_prompt_is_book_cover(user_text: str) -> bool:
    text = normalize_whitespace(user_text).lower()
    return bool(re.search(r"\b(book cover|book jacket|dust jacket|paperback cover|hardcover cover)\b", text))


def strip_visual_meta_instructions(text: str) -> str:
    cleaned = normalize_whitespace(text or "")
    if not cleaned:
        return ""

    # PHASE 12D: keep behavior instructions out of the image prompt.
    cleaned = re.sub(r"(?is)\bactive writing project context\s*:\s*.*$", " ", cleaned).strip()

    meta_patterns = [
        r"\blike chatgpt or grok(?: would show| produced)?\b",
        r"\bconcept visual first\b",
        r"\breal image[- ]first\b",
        r"\bclosest real visual starting point\b",
        r"\bshowing the result first\b",
        r"\bresult first\b",
        r"\bsimo is staying with the user[’']?s exact request\b",
        r"\btreat this as a visual continuation of that writing project\b",
        r"\bdesign this as a visual continuation of that writing project\b",
        r"\bkeep the story theme and subject matter connected\b",
        r"\bmake it feel like the first visual result in a limitless [^.]+\b",
        r"\bmake it feel like simo produced an actual first visual\b",
        r"\bfirst visual output in an end-to-end creative assistant\b",
    ]

    for pattern in meta_patterns:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,-:\n\t")
    return cleaned


def compact_creative_context(context: str, limit: int = 700) -> str:
    text = normalize_whitespace(context or "")
    if not text:
        return ""

    text = re.sub(r"(?is)\bactive writing project context\s*:\s*", "", text).strip()
    text = re.sub(
        r"(?i)\b(?:design this as a visual continuation of that writing project|treat this as a visual continuation of that writing project|keep the story theme and subject matter connected)\b\.?",
        " ",
        text,
    )
    text = strip_visual_meta_instructions(text)
    text = re.sub(r"\s+", " ", text).strip()

    if len(text) > limit:
        clipped = text[:limit]
        if " " in clipped:
            clipped = clipped.rsplit(" ", 1)[0]
        text = clipped.strip()

    return text


def derive_book_cover_title(user_text: str, creative_context: str = "") -> str:
    context = str(creative_context or "")
    text = str(user_text or "")
    combined = normalize_whitespace(f"{context} {text}")
    lower = combined.lower()

    def clean_title_candidate(value: str) -> str:
        candidate = normalize_whitespace(value or "").strip(" .:-\"'“”")
        candidate = re.sub(r"(?i)^(exact book title to display(?: and preserve)?\s*:\s*)", "", candidate).strip(" .:-\"'“”")
        candidate = re.sub(r"(?i)^(title\s*:\s*)", "", candidate).strip(" .:-\"'“”")
        candidate = re.sub(r"(?i)\s*[—-]\s*(book cover concept|visual concept|connected design)$", "", candidate).strip()
        if not candidate:
            return ""
        if len(candidate) > 80:
            candidate = candidate[:80].rsplit(" ", 1)[0].strip()
        banned = [
            r"(?i)^(book cover|book cover concept|cover design|memoir|autobiography|my story)$",
            r"(?i)^requested design edit",
            r"(?i)^user request",
            r"(?i)^story context",
            r"(?i)^active writing project context",
            r"(?i)^here('?s| is) a short autobiography",
            r"(?i)^must reflect",
        ]
        if any(re.search(p, candidate) for p in banned):
            return ""
        return candidate

    title_patterns = [
        r"(?im)^\s*title\s*:\s*([^\n]{2,120})",
        r"(?i)\btitled\s+[\"“']([^\"”']{2,90})[\"”']",
        r"(?i)exact book title to display(?: and preserve)?\s*:\s*'([^']{2,90})'",
        r'(?i)exact book title to display(?: and preserve)?\s*:\s*"([^\"]{2,90})"',
    ]
    for pattern in title_patterns:
        matches = re.findall(pattern, f"{context}\n{text}")
        if not matches:
            continue
        for raw in matches:
            title = clean_title_candidate(raw)
            if title:
                return title

    active_hint_patterns = [
        r"(?i)continue from active design titled\s+'([^']{2,90})'",
        r'(?i)continue from active design titled\s+"([^\"]{2,90})"',
    ]
    for pattern in active_hint_patterns:
        m = re.search(pattern, combined)
        if m:
            title = clean_title_candidate(m.group(1))
            if title:
                return title

    if re.search(r"\b(music|guitar|song|songs|band|soundtrack|instrument)\b", lower):
        if "soundtrack" in lower:
            return "The Soundtrack of My Life"
        return "My Life in Music"

    if "growing up" in lower and "building simo" in lower:
        return "Growing Up and Building Simo"

    if "building simo" in lower:
        return "Building Simo"

    if "autobiography" in lower or "memoir" in lower:
        cleaned = re.sub(r"^.*?(autobiography|memoir)\s*(about|for|of)?\s*", "", normalize_whitespace(text), flags=re.IGNORECASE).strip(" .:-")
        cleaned = re.sub(r"^.*?(book cover|book jacket|cover)\s*(for|about)?\s*", "", cleaned, flags=re.IGNORECASE).strip(" .:-")
        cleaned = strip_visual_meta_instructions(cleaned)
        cleaned = clean_title_candidate(cleaned)
        if cleaned and not re.search(r"(?i)^(it|this|for it|now|book cover)$", cleaned):
            return cleaned[:80].title()
        return "My Story"

    return "Book Cover Concept"


def book_cover_display_title(user_text: str, creative_context: str = "") -> str:
    title = derive_book_cover_title(user_text, creative_context)
    if not title or title.lower() == "book cover concept":
        return "Book Cover Concept"
    if "book cover" in title.lower() or title.lower().endswith("concept"):
        return title
    return f"{title} — Book Cover Concept"


def clean_book_cover_person_name(value: str) -> str:
    raw = normalize_whitespace(value or "").strip(" .,:;\"'“”")
    if not raw:
        return ""
    raw = re.sub(r"(?i)^(author name|author|name)\s*(?:is|to|as)?\s*", "", raw).strip(" .,:;\"'“”")
    raw = re.sub(r"(?i)\b(on the cover|for the cover|please|thanks|thank you)$", "", raw).strip(" .,:;\"'“”")
    if len(raw) > 80 or len(raw.split()) > 5:
        return ""
    if re.search(r"(?i)\b(must reflect|story|memoir|title|subtitle|cover|visual concept|design studio|simo)\b", raw):
        return ""
    if not re.search(r"[A-Za-z]", raw):
        return ""
    return raw


def derive_book_cover_author_name(user_text: str = "", creative_context: str = "", active_author_hint: str = "") -> str:
    sources = [str(user_text or ""), str(creative_context or ""), str(active_author_hint or "")]
    patterns = [
        r"(?i)(?:change|set|make|use|put)\s+(?:the\s+)?author(?:\s+name)?\s+(?:to|as)\s+([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,4})",
        r"(?i)(?:author(?:\s+name)?\s*[:=-]\s*)([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,4})",
        r"(?i)(?:my\s+name\s+(?:is|on the cover is|for the author is|should be))\s+([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,4})",
        r"(?i)(?:put|use)\s+my\s+name(?:\s+as\s+the\s+author)?\s*(?:to|as)?\s*([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,4})",
    ]
    for src in sources:
        if not src:
            continue
        for pattern in patterns:
            m = re.search(pattern, src)
            if m:
                candidate = clean_book_cover_person_name(m.group(1))
                if candidate:
                    return candidate
    hinted = clean_book_cover_person_name(active_author_hint)
    return hinted


def infer_editorial_edit_focus(edit_request: str) -> str:
    t = normalize_whitespace(edit_request or "").lower()
    if re.search(r"\b(author|author name|my name)\b", t):
        return "author"
    if re.search(r"\b(title|typography|font|headline|red|blue|green|gold|white|black)\b", t):
        return "title"
    if re.search(r"\b(subtitle|tagline|copy|memoir)\b", t):
        return "subtitle"
    if re.search(r"\b(spine|back cover|back-cover|jacket)\b", t):
        return "spine"
    if re.search(r"\b(palette|color palette|colorway|mood|tone)\b", t):
        return "palette"
    if re.search(r"\b(texture|finish|foil|emboss|matte|gloss)\b", t):
        return "finish"
    if re.search(r"\b(image|imagery|photo|illustration|picture|scene|background)\b", t):
        return "imagery"
    return "general"


def active_book_cover_edit_prompt(
    user_text: str,
    creative_context: str = "",
    active_title_hint: str = "",
    active_author_hint: str = "",
    prior_edit_notes=None,
) -> str:
    edit_request = strip_visual_meta_instructions(user_text) or "Refine the cover design."
    context = compact_creative_context(creative_context, limit=1200)
    story_title = derive_book_cover_title(edit_request, context)

    hint = normalize_whitespace(active_title_hint or "")
    hint = re.sub(r"(?i)\s*[—-]\s*book cover concept$", "", hint).strip()
    hint = re.sub(r"(?i)\s*[—-]\s*visual concept$", "", hint).strip()
    hint = re.sub(r"(?i)\s*[—-]\s*connected design$", "", hint).strip()
    if hint and not re.search(r"(?i)^(book cover( concept)?|cover design)$", hint):
        if len(hint) <= 80 and not re.search(r"(?i)\bvisual concept\b", hint):
            story_title = hint

    author_name = derive_book_cover_author_name(edit_request, context, active_author_hint)
    focus = infer_editorial_edit_focus(edit_request)

    notes = []
    if isinstance(prior_edit_notes, (list, tuple)):
        for item in prior_edit_notes:
            clean = normalize_whitespace(str(item or ""))
            if clean and clean.lower() != edit_request.lower() and clean not in notes:
                notes.append(clean)
    notes = notes[-5:]
    notes_sentence = ""
    if notes:
        notes_sentence = "Previously accepted edits to preserve unless the user explicitly changes them: " + "; ".join(notes) + ". "

    subject_direction = "Use compelling memoir imagery that reflects the actual story subject matter. "
    combined_lower = f"{edit_request} {context} {hint}".lower()
    if re.search(r"\b(music|guitar|song|band|instrument|vinyl|record)\b", combined_lower):
        subject_direction = (
            "Keep the imagery tied to a coming-of-age music memoir, such as a child or young person, a guitar or other musical cue, warm nostalgic atmosphere, and emotional storytelling. "
        )
    elif re.search(r"\b(technology|computer|startup|builder|city|simo|rocket)\b", combined_lower):
        subject_direction = (
            "Keep the imagery tied to a personal memoir about growth, ambition, and building something meaningful, with story-led editorial imagery rather than generic placeholder art. "
        )

    context_sentence = f"Story context: {context}. " if context else ""
    author_sentence = f"Exact author name to display and preserve unless the user explicitly changes it: '{author_name}'. " if author_name else ""

    focus_sentence = {
        "author": "Apply only the requested author-name wording, size, styling, or placement change while preserving the same title and cover story.",
        "title": "Apply only the requested title wording, color, typography, or hierarchy change while preserving the same story and author name.",
        "subtitle": "Adjust the subtitle or supporting copy only, while preserving the same title, author name, and overall concept.",
        "imagery": "Change the cover imagery while keeping the same title, author name, and memoir story direction.",
        "palette": "Change the palette or mood while preserving the same title, author name, and story identity.",
        "finish": "Change the print finish or texture while preserving the same visible text and story identity.",
        "spine": "Extend the same concept into spine/back-cover treatment while preserving the same title and author.",
        "general": "Preserve the same title, author name, and active memoir project identity while applying the user's requested change.",
    }[focus]

    return (
        "Create one updated polished realistic book-cover render for the same exact book project. "
        f"Requested design edit: {edit_request}. "
        f"Exact book title to display and preserve with the same wording: '{story_title}'. "
        f"{author_sentence}"
        "Optional visible supporting text may include only the subtitle 'A Memoir' and a simple author name. "
        f"{context_sentence}"
        f"{notes_sentence}"
        "Show a single front-facing or slightly angled book cover in a clean editorial studio presentation. "
        f"{subject_direction}"
        f"{focus_sentence} "
        "Keep the same editorial subject matter, same story lane, and same active project identity while applying only the requested design change clearly and visibly. "
        "Do not switch to another earlier project, another title, another author name, or another unrelated memoir concept. "
        "Never display the user's instruction sentence, prompt wording, internal notes, analysis text, or long paragraph text as cover copy. "
        "Never include instruction-like phrases such as 'must reflect that story', 'requested design edit', 'story context', or any other meta wording on the cover. "
        "Do not include placeholder text, UI text, HTML, CSS, code, labels, watermarks, or instruction phrases on the cover. "
        "Avoid blank generic covers and avoid unnecessary extra text. "
        "If the request is about title color or typography, change the styling of the existing title text only rather than inventing new large text. "
        "If the request is about author-name size or placement, adjust the existing author name only. "
        "If the request is about color palette, imagery, or texture, preserve the same title and story while changing only those visual properties. "
    )


def make_book_cover_image_prompt(user_text: str, creative_context: str = "") -> str:
    clean_request = strip_visual_meta_instructions(user_text) or "Create a premium memoir book cover."
    context = compact_creative_context(creative_context, limit=700)
    combined_lower = f"{clean_request} {context}".lower()
    title = derive_book_cover_title(clean_request, context)

    memoir = "autobiography" in combined_lower or "memoir" in combined_lower or "my story" in combined_lower
    simo = "simo" in combined_lower
    growing_up = "growing up" in combined_lower or "childhood" in combined_lower
    music = "music" in combined_lower or "guitar" in combined_lower or "instrument" in combined_lower or "song" in combined_lower or "band" in combined_lower

    theme_bits = []
    if memoir:
        theme_bits.append("memoir")
    if growing_up:
        theme_bits.append("coming-of-age")
    if music:
        theme_bits.append("music-centered personal story")
    if simo:
        theme_bits.append("building Simo / entrepreneurship / technology ambition")
    if not theme_bits:
        theme_bits.append("personal non-fiction / editorial book theme")

    theme_text = ", ".join(theme_bits)
    context_sentence = f"Story context: {context}. " if context else ""
    special_direction = ""
    if growing_up and music:
        special_direction += "Visually hint at youth, growth, and a deep connection to music through imagery such as a child or young person with a guitar, warm nostalgic lighting, and emotional musical atmosphere. "
    elif music:
        special_direction += "Use music imagery such as a guitar, stage light, notes, studio warmth, or a personal musician's journey. "
    if simo:
        special_direction += "Blend personal history with aspiration, creativity, and technology/entrepreneurial energy. "

    return (
        "Create one polished realistic book-cover concept render. "
        f"User request: {clean_request}. "
        f"Exact book title to display: '{title}'. "
        f"Theme direction: {theme_text}. "
        f"{context_sentence}"
        "Show a single front-facing book cover or a slightly angled hardcover/paperback in a clean editorial studio presentation. "
        "Use premium readable typography, strong hierarchy, and a compelling focal image or illustration that reflects the actual story subject matter. "
        f"{special_direction}"
        "Visible text must be limited to the exact title and, only if it improves the cover, the exact subtitle 'A Memoir' plus an optional simple author name. Never replace the title with other invented large text. "
        "Do not include the words autobiography, autiobiography, autobiograh, placeholder, concept visual, ChatGPT, Grok, Simo, workflow, UI labels, watermarks, diagrams, or internal instructions on the cover. "
        "Avoid small text blocks because they often create spelling errors. Avoid a blank white book or generic fake cover."
    )


def make_visual_image_prompt(user_text: str, explicit_domain: str = "") -> str:
    clean = strip_visual_meta_instructions(user_text)
    if not clean:
        clean = "Create a premium visual concept."

    domain = visual_prompt_domain_from_text(clean, explicit_domain)
    lower = clean.lower()

    if visual_prompt_is_book_cover(clean):
        return make_book_cover_image_prompt(clean)

    if domain == "vehicle":
        style = "futuristic luxury" if re.search(r"\b(futuristic|future|sci-fi|sci fi)\b", lower) else "luxury modern"
        paint = "matte black" if "matte black" in lower else "pearl white" if "white" in lower else "liquid silver" if "silver" in lower else "liquid graphite"
        body = "futuristic hypercar" if "hypercar" in lower else "luxury supercar" if "supercar" in lower else "sports car concept coupe"
        scene = "empty race test track" if re.search(r"\b(track|race)\b", lower) else "clean automotive studio with seamless neutral background"
        return (
            "Create one polished realistic 3D-style vehicle concept render. "
            f"Subject: a single {style} {body}. "
            f"User request: {clean}. "
            f"Paint/finish direction: {paint}, carbon fiber details, performance glass, forged wheels, low athletic stance. "
            f"Scene/background: {scene}. "
            "Composition: three-quarter front angle, car fills most of the frame, clean studio/showroom lighting, premium automotive concept presentation. "
            "Hard exclusion: do not include a house, home, villa, mansion, building, garage, driveway, residential street, architecture, landscaping, neighborhood, or real-estate scene. "
            "Do not include text, labels, watermarks, UI panels, diagrams, or placeholder low-poly geometry."
        )

    if domain == "home":
        parsed = parse_house_request(lower)
        stories = parsed.get("stories") or 2
        style = parsed.get("style") or "modern"
        color = parsed.get("color") or "white, charcoal, warm wood accents"
        extras = parsed.get("extras") or []
        extras_text = ", ".join(extras) if extras else "clean landscaping, driveway, realistic proportions"
        garage_size = parsed.get("garage_size")
        garage_text = f", {garage_size}-car garage" if garage_size else ""
        return (
            "Create one polished architectural concept render. "
            f"Subject: a {stories}-story {style} residential house{garage_text}. "
            f"User request: {clean}. "
            f"Exterior palette/material direction: {color}. "
            f"Include: {extras_text}. "
            "Camera/view: three-quarter front exterior view, realistic proportions, clear roofline, visible windows, front entry, driveway, and architectural massing. "
            "Style: premium concept visualization, realistic but clean, useful for a homeowner to react to and request changes. "
            "Do not include text, labels, watermarks, floor-plan symbols, UI panels, or diagrams."
        )

    if domain == "interior":
        return (
            "Create one polished realistic interior design concept render. "
            f"User request: {clean}. "
            "Show a refined interior room scene with strong composition, realistic proportions, premium materials, lighting, furniture, and clear design direction. "
            "Do not include exterior house renderings unless requested. No text, labels, watermarks, UI panels, or diagrams."
        )

    if domain == "brand":
        return (
            "Create one polished brand/logo design concept presentation. "
            f"User request: {clean}. "
            "Show a clean brand identity visual with logo direction, color mood, premium spacing, and professional presentation. "
            "No mock text paragraphs, no watermarks, no clutter."
        )

    if domain == "digital":
        return (
            "Create one polished digital product/interface concept render. "
            f"User request: {clean}. "
            "Show a clean app/dashboard/UI screen concept with modern layout, premium hierarchy, and realistic product presentation. "
            "No unrelated architecture or vehicle scene unless requested."
        )

    if domain == "instrument":
        kind = "electric guitar" if re.search(r"\bguitar\b", lower) else "musical instrument"
        style = "wild aggressive fantasy" if re.search(r"\b(wild|crazy|extreme|monster|dragon|bat|sharp|aggressive)\b", lower) else "premium futuristic" if re.search(r"\b(futuristic|future|sci-fi|sci fi)\b", lower) else "premium custom"
        return (
            "Create one polished realistic 3D-style musical instrument concept render. "
            f"Subject: a single {style} {kind} as the only main object. "
            f"User request: {clean}. "
            "If it is a guitar, make the body shape, headstock, neck, pickups, bridge, hardware, strings, finish, graphics, and electronics visually designable. "
            "Scene/background: clean dark studio or neutral product turntable background. "
            "Composition: instrument fills most of the frame, three-quarter product angle, premium concept-art presentation, realistic materials. "
            "Hard exclusion: do not include a house, home, room, stage crowd, car, driveway, building, architecture, landscape, UI panels, text, labels, or watermark."
        )

    if domain == "marine":
        return (
            "Create one polished realistic marine/yacht concept render. "
            f"User request: {clean}. "
            "Show the requested boat/yacht as the main subject with premium proportions, hull shape, deck layout, materials, lighting, and luxury design details. "
            "Use a clean marina, open water, or neutral product-style presentation. No unrelated house, car, UI panels, text, labels, or watermarks."
        )

    if domain == "industrial":
        return (
            "Create one polished realistic industrial product concept render. "
            f"User request: {clean}. "
            "Show the requested industrial object clearly as the only main subject, with realistic scale cues, mounting details, materials, finish, functional design, lighting hardware, and production-ready proportions. "
            "Use a clean studio or realistic outdoor context only if useful. No unrelated house, car, UI panels, text, labels, or watermarks."
        )

    if domain == "furniture":
        return (
            "Create one polished realistic furniture concept render. "
            f"User request: {clean}. "
            "Show the furniture piece clearly with realistic proportions, ergonomics, materials, frame/base details, cushions or surfaces if applicable, and premium product-design lighting. "
            "Use a clean studio or tasteful room context. No unrelated car, architecture exterior, UI panels, text, labels, or watermarks."
        )

    if domain in {"fashion", "wearable"}:
        return (
            "Create one polished fashion/wearable product concept render. "
            f"User request: {clean}. "
            "Show the requested fashion item as the only main subject in a clean studio scene with premium lighting, clear materials, colorway, fasteners, texture, comfort details, and designable features. "
            "Do not include unrelated house, car, scenery, UI panels, text, or watermarks."
        )

    if domain == "product":
        subject = extract_visual_subject_phrase(clean, "product concept")
        if re.search(r"\b(rim|rims|wheel|wheels|tire rim|alloy wheel|forged wheel)\b", clean, flags=re.IGNORECASE):
            subject = "single standalone custom tire rim / alloy wheel"
            return simo14f_rim_prompt(clean, "direct-product-rim-prompt")
        return (
            "Create one polished product concept render. "
            f"Exact subject/object: {subject}. "
            f"User request: {clean}. "
            "Show the requested product clearly as the only main subject in a clean studio scene with premium lighting, realistic proportions, refined materials, and obvious designable features. "
            "Do not include unrelated house, car, or scenery unless requested. No text or watermarks."
        )

    subject = extract_visual_subject_phrase(clean, "visual concept")
    return (
        "Create one premium visual concept render for the user's idea. "
        f"Exact subject/object: {subject}. "
        f"User request: {clean}. "
        "Show the requested object or scene clearly as the only main subject with strong composition, clean lighting, realistic proportions, and polished presentation. "
        "Do not include text, labels, watermarks, UI panels, or diagrams unless the user explicitly asked for them."
    )


def generate_visual_image(user_text: str, client, explicit_domain: str = "", prebuilt_prompt: bool = False):
    """Generate a visual concept image with one automatic retry.

    Simo should feel visual-first and reliable. If the image service hiccups
    once, retry immediately before returning a clear real-image-required error.
    """
    if not client:
        return {
            "ok": False,
            "url": "",
            "error": "Image generation is not configured yet.",
            "prompt": "",
            "attempts": 0,
        }

    prompt = normalize_whitespace(user_text) if prebuilt_prompt else make_visual_image_prompt(user_text, explicit_domain)
    if not prompt:
        return {
            "ok": False,
            "url": "",
            "error": "Image prompt is empty.",
            "prompt": "",
            "attempts": 0,
        }

    last_error = ""
    print(f"[SIMO IMAGE] start model={OPENAI_IMAGE_MODEL} size={OPENAI_IMAGE_SIZE} timeout={OPENAI_TIMEOUT_SECONDS}s domain={explicit_domain} prebuilt={prebuilt_prompt}", flush=True)

    for attempt in range(1, 3):
        try:
            print(f"[SIMO IMAGE] attempt {attempt}/2 calling OpenAI images.generate", flush=True)
            image_kwargs = {
                "model": OPENAI_IMAGE_MODEL,
                "prompt": prompt,
                "size": OPENAI_IMAGE_SIZE,
                "n": 1,
            }

            if str(OPENAI_IMAGE_MODEL or "").lower().startswith("gpt-image"):
                image_kwargs["output_format"] = os.getenv("OPENAI_IMAGE_OUTPUT_FORMAT", "png").strip() or "png"
                image_kwargs["quality"] = os.getenv("OPENAI_IMAGE_QUALITY", "medium").strip() or "medium"

            try:
                resp = client.images.generate(**image_kwargs)
            except TypeError:
                image_kwargs.pop("output_format", None)
                image_kwargs.pop("quality", None)
                resp = client.images.generate(**image_kwargs)

            print(f"[SIMO IMAGE] attempt {attempt}/2 OpenAI call returned; extracting image data", flush=True)
            extracted = extract_image_from_openai_response(resp)
            kind = extracted.get("kind")
            value = extracted.get("value")
            print(f"[SIMO IMAGE] attempt {attempt}/2 extracted kind={kind or 'none'} has_value={bool(value)}", flush=True)

            if kind == "url" and value:
                try:
                    with urllib.request.urlopen(value, timeout=30) as r:
                        raw = r.read()
                    if raw:
                        filename = f"simo_visual_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.png"
                        saved_name = save_generated_image_bytes(filename, raw)
                        return {
                            "ok": True,
                            "url": public_generated_image_url(saved_name),
                            "error": "",
                            "prompt": prompt,
                            "attempts": attempt,
                        }
                except Exception:
                    return {
                        "ok": True,
                        "url": value,
                        "error": "",
                        "prompt": prompt,
                        "attempts": attempt,
                    }

            if kind == "b64" and value:
                raw = base64.b64decode(value)
                filename = f"simo_visual_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.png"
                saved_name = save_generated_image_bytes(filename, raw)
                return {
                    "ok": True,
                    "url": public_generated_image_url(saved_name),
                    "error": "",
                    "prompt": prompt,
                    "attempts": attempt,
                }

            last_error = "No image data returned from the image model."
        except Exception as e:
            last_error = f"{type(e).__name__}: {str(e)}"
            print(f"[SIMO IMAGE] attempt {attempt}/2 failed: {last_error}", flush=True)

    return {
        "ok": False,
        "url": "",
        "error": last_error or "Image generation did not complete.",
        "prompt": prompt,
        "attempts": 2,
    }


def extract_image_from_openai_response(resp):
    """Extract image data from both new SDK objects and dict-like payloads.

    PHASE 11.2 fix: some OpenAI SDK versions return resp.data as a list of
    dict-like image records, not typed objects. The old extractor only checked
    getattr(first, "b64_json") in that path, so GPT Image could succeed while
    Simo still reported "No image data returned" and showed the real-image
    required card. GPT image models return base64 image data, so this must be
    handled before any fallback.
    """
    def from_first(first):
        if not first:
            return {"kind": "", "value": ""}

        if isinstance(first, dict):
            b64 = first.get("b64_json") or first.get("b64")
            url = first.get("url")
            if b64:
                return {"kind": "b64", "value": b64}
            if url:
                return {"kind": "url", "value": url}

        try:
            # Pydantic/openai model objects often support model_dump().
            if hasattr(first, "model_dump"):
                dumped = first.model_dump() or {}
                b64 = dumped.get("b64_json") or dumped.get("b64")
                url = dumped.get("url")
                if b64:
                    return {"kind": "b64", "value": b64}
                if url:
                    return {"kind": "url", "value": url}
        except Exception:
            pass

        b64 = getattr(first, "b64_json", None) or getattr(first, "b64", None)
        url = getattr(first, "url", None)
        if b64:
            return {"kind": "b64", "value": b64}
        if url:
            return {"kind": "url", "value": url}

        return {"kind": "", "value": ""}

    try:
        data = getattr(resp, "data", None) or []
        if data:
            found = from_first(data[0])
            if found.get("kind") and found.get("value"):
                return found
    except Exception:
        pass

    try:
        if hasattr(resp, "model_dump"):
            dumped = resp.model_dump() or {}
            data = dumped.get("data") or []
            if data:
                found = from_first(data[0])
                if found.get("kind") and found.get("value"):
                    return found
    except Exception:
        pass

    try:
        data = resp.get("data", []) if isinstance(resp, dict) else []
        if data:
            found = from_first(data[0])
            if found.get("kind") and found.get("value"):
                return found
    except Exception:
        pass

    return {"kind": "", "value": ""}


def generate_visual_image(user_text: str, client, explicit_domain: str = "", prebuilt_prompt: bool = False):
    """Generate a visual concept image with one automatic retry.

    Simo should feel visual-first and reliable. If the image service hiccups
    once, retry immediately before falling back to a clean text concept.
    """
    if not client:
        return {
            "ok": False,
            "url": "",
            "error": "Image generation is not configured yet.",
            "prompt": "",
            "attempts": 0,
        }

    prompt = normalize_whitespace(user_text) if prebuilt_prompt else make_visual_image_prompt(user_text, explicit_domain)
    last_error = ""

    print(f"[SIMO IMAGE] start model={OPENAI_IMAGE_MODEL} size={OPENAI_IMAGE_SIZE} timeout={OPENAI_TIMEOUT_SECONDS}s domain={explicit_domain}", flush=True)

    for attempt in range(1, 3):
        try:
            print(f"[SIMO IMAGE] attempt {attempt}/2 calling OpenAI images.generate", flush=True)
            image_kwargs = {
                "model": OPENAI_IMAGE_MODEL,
                "prompt": prompt,
                "size": OPENAI_IMAGE_SIZE,
                "n": 1,
            }

            # GPT image models return base64 image data and support output_format.
            # Keep this guarded so older SDK/model combinations can still retry
            # with the plain minimal payload instead of failing the whole route.
            if str(OPENAI_IMAGE_MODEL or "").lower().startswith("gpt-image"):
                image_kwargs["output_format"] = os.getenv("OPENAI_IMAGE_OUTPUT_FORMAT", "png").strip() or "png"
                image_kwargs["quality"] = os.getenv("OPENAI_IMAGE_QUALITY", "medium").strip() or "medium"

            try:
                resp = client.images.generate(**image_kwargs)
            except TypeError:
                # Older SDK: remove newer optional args and retry once.
                image_kwargs.pop("output_format", None)
                image_kwargs.pop("quality", None)
                resp = client.images.generate(**image_kwargs)
            print(f"[SIMO IMAGE] attempt {attempt}/2 OpenAI call returned; extracting image data", flush=True)
            extracted = extract_image_from_openai_response(resp)
            kind = extracted.get("kind")
            value = extracted.get("value")
            print(f"[SIMO IMAGE] attempt {attempt}/2 extracted kind={kind or 'none'} has_value={bool(value)}", flush=True)

            if kind == "url" and value:
                # Some image APIs return a temporary hosted URL instead of b64.
                # Save a local copy so /generated-images/... keeps working.
                try:
                    with urllib.request.urlopen(value, timeout=30) as r:
                        raw = r.read()
                    if raw:
                        filename = f"simo_visual_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.png"
                        saved_name = save_generated_image_bytes(filename, raw)
                        return {
                            "ok": True,
                            "url": public_generated_image_url(saved_name),
                            "error": "",
                            "prompt": prompt,
                            "attempts": attempt,
                        }
                except Exception:
                    return {
                        "ok": True,
                        "url": value,
                        "error": "",
                        "prompt": prompt,
                        "attempts": attempt,
                    }

            if kind == "b64" and value:
                raw = base64.b64decode(value)
                filename = f"simo_visual_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.png"
                saved_name = save_generated_image_bytes(filename, raw)
                return {
                    "ok": True,
                    "url": public_generated_image_url(saved_name),
                    "error": "",
                    "prompt": prompt,
                    "attempts": attempt,
                }

            last_error = "No image data returned from the image model."
        except Exception as e:
            last_error = f"{type(e).__name__}: {str(e)}"
            print(f"[SIMO IMAGE] attempt {attempt}/2 failed: {last_error}", flush=True)

    return {
        "ok": False,
        "url": "",
        "error": last_error or "Image generation did not complete.",
        "prompt": prompt,
        "attempts": 2,
    }



def clean_visual_subject_request(user_text: str) -> str:
    text = strip_visual_meta_instructions(user_text) or user_text or ""
    text = normalize_whitespace(text)
    if not text:
        return ""

    text = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)[0]
    text = re.sub(
        r"^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+|i want\s+|i need\s+|show me\s+|build me\s+|make me\s+|create me\s+|design me\s+|generate me\s+|give me\s+|now\s+show me\s+|now\s+build me\s+|now\s+make me\s+|show\s+|build\s+|make\s+|create\s+|design\s+|generate\s+|render\s+)",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"^(?:a|an|the)\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:for me to|to|that i can)\s+(?:design|edit|refine)\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bfor it\b$", "", text, flags=re.IGNORECASE)
    text = normalize_whitespace(text).strip(" .,:;-—")
    return text


def friendly_visual_subject_label(user_text: str, explicit_domain: str = "") -> str:
    domain = visual_prompt_domain_from_text(user_text, explicit_domain)
    phrase = clean_visual_subject_request(user_text)
    lower = normalize_whitespace(phrase).lower()

    specials = [
        (r"\bbass guitar\b", "Bass Guitar"),
        (r"\belectric guitar\b", "Electric Guitar"),
        (r"\bguitar\b", "Guitar"),
        (r"\btire rim\b|\balloy wheel\b|\bforged wheel\b|\brim\b", "Tire Rim"),
        (r"\bflashlight\b|\btorch\b", "Flashlight"),
        (r"\blight fixture\b", "Light Fixture"),
        (r"\bparking lot light\b|\bstreet light\b|\blamp post\b", "Outdoor Light Fixture"),
        (r"\bbook cover\b", "Book Cover"),
        (r"\bapp screen\b|\bdashboard\b|\bui\b", "App Interface"),
        (r"\blogo\b", "Logo"),
        (r"\bluxury home\b|\bmodern house\b|\bluxury house\b", "Luxury Home"),
    ]
    for pattern, label in specials:
        if re.search(pattern, lower, re.IGNORECASE):
            return label

    if domain == "editorial":
        return "Book Cover"

    words = [w for w in re.split(r"\s+", phrase) if w][:6]
    cleaned = " ".join(words).strip(" .:-")
    if cleaned:
        cleaned = re.sub(r"\b3d\b", "3D", cleaned, flags=re.IGNORECASE)
        return cleaned.title().replace("3D", "3D")

    defaults = {
        "home": "Luxury Home",
        "vehicle": "Vehicle",
        "interior": "Interior",
        "brand": "Brand",
        "instrument": "Instrument",
        "product": "Product",
        "digital": "Digital Product",
        "fashion": "Fashion Concept",
        "marine": "Marine Concept",
        "industrial": "Industrial Product",
        "furniture": "Furniture Concept",
        "wearable": "Wearable Concept",
        "object": "Visual Concept",
    }
    return defaults.get(domain, "Visual Concept")


def visual_reply_guidance(user_text: str, explicit_domain: str = "") -> str:
    domain = visual_prompt_domain_from_text(user_text, explicit_domain)
    label = friendly_visual_subject_label(user_text, explicit_domain).lower()

    if domain == "editorial":
        return f"Here is the first real {label} starting point. Tell me what to change next — title typography, cover imagery, subtitle/copy, author name, color palette, spine/back cover, or finish/texture."
    if domain == "instrument":
        return f"Here is the first real {label} starting point. Tell me what to change next — body shape, neck/headstock, pickups, hardware, materials/finish, colors/graphics, strings/tuning, electronics, or accessories."
    if domain == "vehicle":
        return f"Here is the first real {label} starting point. Tell me what to change next — body style, front fascia, rear design, wheels/tires, paint/finish, aero package, cockpit, lighting, performance theme, or materials."
    if domain == "home":
        return f"Here is the first real {label} starting point. Tell me what to change next — garage, pool/landscape, exterior materials, interior direction, floor plan, lighting, or futuristic styling."
    if domain == "interior":
        return f"Here is the first real {label} starting point. Tell me what to change next — layout, furniture, materials, lighting, decor, storage, or mood."
    if domain == "brand":
        return f"Here is the first real {label} starting point. Tell me what to change next — logo mark, typography, color palette, mockups, or brand style."
    if domain == "digital":
        return f"Here is the first real {label} starting point. Tell me what to change next — layout, components, color/theme, navigation, mobile version, or UX direction."
    if domain in {"product", "industrial", "furniture", "wearable", "marine"}:
        return f"Here is the first real {label} starting point. Tell me what to change next — shape/form, materials, colors, functional details, scale, or added features."
    return f"Here is the first real {label} starting point. Tell me what to change next — shape, materials, colors, details, or added features."


def visual_alt_from_prompt(user_text: str, explicit_domain: str = "") -> str:
    domain = visual_prompt_domain_from_text(user_text, explicit_domain)
    label = friendly_visual_subject_label(user_text, explicit_domain)
    if domain == "editorial":
        return f"{label} — Editorial Visual Concept"
    if domain == "home":
        return f"{label} — House Visual Concept" if "house visual concept" not in label.lower() else label
    if domain == "vehicle":
        return f"{label} — Vehicle Visual Concept" if "vehicle visual concept" not in label.lower() else label
    if domain == "interior":
        return f"{label} — Interior Visual Concept" if "interior visual concept" not in label.lower() else label
    if domain == "brand":
        return f"{label} — Brand Visual Concept" if "brand visual concept" not in label.lower() else label
    if domain == "instrument":
        return f"{label} — Instrument Visual Concept" if "instrument visual concept" not in label.lower() else label
    if domain == "fashion":
        return f"{label} — Fashion Visual Concept" if "fashion visual concept" not in label.lower() else label
    if domain == "product":
        return f"{label} — Product Visual Concept" if "product visual concept" not in label.lower() else label
    if domain == "digital":
        return f"{label} — Digital Visual Concept" if "digital visual concept" not in label.lower() else label
    return f"{label} — Visual Concept" if not label.lower().endswith("visual concept") else label


def build_visual_generated_reply(user_text: str, image_url: str) -> str:
    alt = visual_alt_from_prompt(user_text)
    visual_line = build_visual_markdown(image_url, alt)

    return (
        f"{visual_line}\n\n"
        f"{visual_reply_guidance(user_text)}"
    ).strip()


def build_domain_visual_svg(user_text: str, explicit_domain: str = "") -> str:
    # Local visual fallback that still looks like a visual result, not the old board.
    # Used only when live image generation does not return a PNG/URL.
    clean = normalize_whitespace(user_text) or "visual design concept"
    domain = visual_prompt_domain_from_text(clean, explicit_domain)
    title = visual_alt_from_prompt(clean, domain)

    def esc(value: str) -> str:
        return (str(value or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#039;"))

    title_safe = esc(title)[:82]
    clean_safe = esc(clean)[:130]

    palettes = {
        "digital": ("#67e8f9", "#60a5fa", "#8b5cf6"),
        "product": ("#34d399", "#2dd4bf", "#60a5fa"),
        "brand": ("#f59e0b", "#f97316", "#fb7185"),
        "interior": ("#fbbf24", "#f59e0b", "#fb7185"),
        "industrial": ("#60a5fa", "#38bdf8", "#22d3ee"),
        "furniture": ("#a78bfa", "#60a5fa", "#34d399"),
        "wearable": ("#fb7185", "#c084fc", "#60a5fa"),
        "object": ("#34d399", "#60a5fa", "#8b5cf6"),
    }
    c1, c2, c3 = palettes.get(domain, palettes["object"])

    if domain == "digital":
        return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06101d"/><stop offset="0.54" stop-color="#0e1a31"/><stop offset="1" stop-color="#020617"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="0.55" stop-color="{c2}"/><stop offset="1" stop-color="{c3}"/></linearGradient>
    <radialGradient id="glow" cx="50%" cy="28%" r="70%"><stop offset="0" stop-color="{c2}" stop-opacity=".25"/><stop offset=".6" stop-color="{c3}" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1400" height="900" fill="url(#bg)"/><rect width="1400" height="900" fill="url(#glow)"/>
  <text x="82" y="92" fill="#a8c4ef" font-family="Arial, sans-serif" font-size="20" font-weight="900" letter-spacing="4">SIMO DIGITAL VISUAL RESULT</text>
  <text x="82" y="150" fill="#eef4ff" font-family="Arial, sans-serif" font-size="46" font-weight="900">{title_safe}</text>
  <text x="82" y="188" fill="#c8d7ef" font-family="Arial, sans-serif" font-size="20">Backend visual fallback - UI/app concept stays visual-first</text>
  <rect x="76" y="226" width="1248" height="598" rx="38" fill="#07101d" stroke="#ffffff" stroke-opacity=".12"/>
  <rect x="120" y="270" width="760" height="506" rx="30" fill="#101a2d" stroke="#ffffff" stroke-opacity=".13"/>
  <rect x="120" y="270" width="760" height="112" rx="30" fill="url(#accent)"/>
  <text x="164" y="336" fill="#ffffff" font-family="Arial, sans-serif" font-size="34" font-weight="900">Modern App Dashboard</text>
  <text x="164" y="366" fill="#eef4ff" font-family="Arial, sans-serif" font-size="18">{clean_safe}</text>
  <rect x="164" y="420" width="300" height="124" rx="24" fill="#0b1322" stroke="#ffffff" stroke-opacity=".12"/>
  <rect x="492" y="420" width="154" height="124" rx="24" fill="#0b1322" stroke="#ffffff" stroke-opacity=".12"/>
  <rect x="676" y="420" width="154" height="124" rx="24" fill="#0b1322" stroke="#ffffff" stroke-opacity=".12"/>
  <rect x="164" y="574" width="666" height="150" rx="24" fill="#0b1322" stroke="#ffffff" stroke-opacity=".12"/>
  <rect x="206" y="618" width="566" height="16" rx="8" fill="#1b2b49"/>
  <rect x="206" y="654" width="505" height="12" rx="6" fill="#172640"/>
  <rect x="206" y="684" width="428" height="12" rx="6" fill="#172640"/>
  <rect x="928" y="272" width="346" height="504" rx="42" fill="#0a1322" stroke="#ffffff" stroke-opacity=".13"/>
  <rect x="962" y="314" width="278" height="58" rx="18" fill="url(#accent)"/>
  <rect x="962" y="404" width="278" height="116" rx="24" fill="#111d33" stroke="#ffffff" stroke-opacity=".12"/>
  <rect x="962" y="548" width="278" height="88" rx="24" fill="#111d33" stroke="#ffffff" stroke-opacity=".12"/>
  <rect x="962" y="668" width="124" height="70" rx="22" fill="#111d33" stroke="#ffffff" stroke-opacity=".12"/>
  <rect x="1116" y="668" width="124" height="70" rx="22" fill="#111d33" stroke="#ffffff" stroke-opacity=".12"/>
</svg>'''

    is_rim = bool(re.search(r"\b(rim|rims|wheel|wheels|tire rim|alloy wheel|forged wheel)\b", clean, flags=re.IGNORECASE))
    is_bottle = bool(re.search(r"\bbottle\b", clean, flags=re.IGNORECASE))
    is_light = bool(re.search(r"\b(light|lamp|fixture)\b", clean, flags=re.IGNORECASE))
    is_chair = bool(re.search(r"\b(chair|sofa|stool|table|desk)\b", clean, flags=re.IGNORECASE))

    if is_rim:
        subject_svg = """<circle cx="630" cy="482" r="175" fill="url(#product)" stroke="#ffffff" stroke-opacity=".20"/>\n  <circle cx="630" cy="482" r="116" fill="#07101d" stroke="#ffffff" stroke-opacity=".15"/>\n  <circle cx="630" cy="482" r="44" fill="#1d2e49" stroke="#ffffff" stroke-opacity=".18"/>\n  <rect x="615" y="306" width="30" height="150" rx="15" fill="#e9fbff" fill-opacity=".70" transform="rotate(0 630 482)"/>\n  <rect x="615" y="306" width="30" height="150" rx="15" fill="#e9fbff" fill-opacity=".70" transform="rotate(45 630 482)"/>\n  <rect x="615" y="306" width="30" height="150" rx="15" fill="#e9fbff" fill-opacity=".70" transform="rotate(90 630 482)"/>\n  <rect x="615" y="306" width="30" height="150" rx="15" fill="#e9fbff" fill-opacity=".70" transform="rotate(135 630 482)"/>\n  <rect x="615" y="306" width="30" height="150" rx="15" fill="#e9fbff" fill-opacity=".70" transform="rotate(180 630 482)"/>\n  <circle cx="702" cy="482" r="12" fill="#050b14"/>\n  <circle cx="652" cy="550" r="12" fill="#050b14"/>\n  <circle cx="570" cy="524" r="12" fill="#050b14"/>\n  <circle cx="570" cy="440" r="12" fill="#050b14"/>\n  <circle cx="652" cy="414" r="12" fill="#050b14"/>"""
    elif is_bottle:
        subject_svg = '''<rect x="536" y="320" width="190" height="350" rx="84" fill="url(#product)" stroke="#ffffff" stroke-opacity=".16"/>
  <rect x="585" y="244" width="92" height="108" rx="28" fill="url(#product)"/>
  <rect x="568" y="224" width="126" height="42" rx="18" fill="#0d1729"/>
  <rect x="566" y="432" width="130" height="96" rx="24" fill="#ffffff" fill-opacity=".18" stroke="#ffffff" stroke-opacity=".16"/>'''
    elif is_light:
        subject_svg = '''<rect x="606" y="302" width="42" height="292" rx="20" fill="url(#product)"/>
  <rect x="520" y="262" width="214" height="82" rx="42" fill="url(#product)"/>
  <ellipse cx="627" cy="626" rx="136" ry="42" fill="#0d1729"/>
  <rect x="548" y="584" width="158" height="32" rx="16" fill="#20324f"/>'''
    elif is_chair:
        subject_svg = '''<rect x="510" y="360" width="238" height="136" rx="44" fill="url(#product)"/>
  <rect x="540" y="280" width="178" height="124" rx="46" fill="url(#product)"/>
  <rect x="548" y="498" width="20" height="132" rx="10" fill="#1d2e49"/>
  <rect x="690" y="498" width="20" height="132" rx="10" fill="#1d2e49"/>'''
    else:
        subject_svg = '''<rect x="500" y="320" width="260" height="270" rx="58" fill="url(#product)" stroke="#ffffff" stroke-opacity=".16"/>
  <rect x="548" y="368" width="164" height="44" rx="20" fill="#0d1729"/>
  <rect x="538" y="448" width="184" height="104" rx="28" fill="#ffffff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".16"/>'''

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06101d"/><stop offset="0.55" stop-color="#101b30"/><stop offset="1" stop-color="#020617"/></linearGradient>
    <radialGradient id="spot" cx="48%" cy="43%" r="42%"><stop offset="0" stop-color="{c2}" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="product" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9fbff"/><stop offset=".48" stop-color="{c2}"/><stop offset="1" stop-color="#20324f"/></linearGradient>
  </defs>
  <rect width="1400" height="900" fill="url(#bg)"/><rect width="1400" height="900" fill="url(#spot)"/>
  <text x="82" y="92" fill="#a8c4ef" font-family="Arial, sans-serif" font-size="20" font-weight="900" letter-spacing="4">SIMO PRODUCT VISUAL RESULT</text>
  <text x="82" y="150" fill="#eef4ff" font-family="Arial, sans-serif" font-size="46" font-weight="900">{title_safe}</text>
  <text x="82" y="188" fill="#c8d7ef" font-family="Arial, sans-serif" font-size="20">Backend visual fallback - product concept stays visual-first</text>
  <rect x="76" y="226" width="1248" height="598" rx="38" fill="#07101d" stroke="#ffffff" stroke-opacity=".12"/>
  <ellipse cx="630" cy="710" rx="330" ry="66" fill="#02060d" opacity=".72"/>
  {subject_svg}
  <rect x="868" y="304" width="362" height="196" rx="30" fill="#0d1729" stroke="#ffffff" stroke-opacity=".12"/>
  <rect x="868" y="530" width="362" height="166" rx="30" fill="#0d1729" stroke="#ffffff" stroke-opacity=".12"/>
  <text x="902" y="356" fill="#eef4ff" font-family="Arial, sans-serif" font-size="28" font-weight="900">Design direction</text>
  <text x="902" y="394" fill="#c7d3ea" font-family="Arial, sans-serif" font-size="18">{clean_safe}</text>
  <text x="902" y="580" fill="#eef4ff" font-family="Arial, sans-serif" font-size="24" font-weight="900">Editable next</text>
  <text x="902" y="620" fill="#c7d3ea" font-family="Arial, sans-serif" font-size="18">materials - shape - finish - details</text>
</svg>'''


def save_domain_visual_fallback(user_text: str, explicit_domain: str = "") -> str:
    domain = visual_prompt_domain_from_text(user_text, explicit_domain)
    svg = build_domain_visual_svg(user_text, domain)
    filename = f"simo_visual_fallback_{domain}_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.svg"
    saved = save_generated_image_bytes(filename, svg.encode("utf-8"))
    return public_generated_image_url(saved)

def seeded_real_image_url(user_text: str, explicit_domain: str = "") -> str:
    """Return a real-photo first fallback URL for any visual design domain.

    PHASE 10.5D: the live OpenAI image route is still the preferred path. When it is
    unavailable, Simo should still show a relevant real image first instead of a blank
    board for generic objects/products. This URL is intentionally domain + prompt
    based so unknown user asks are not limited to a tiny hard-coded demo list.
    """
    clean = normalize_whitespace(user_text)
    domain = visual_prompt_domain_from_text(clean, explicit_domain)

    base_terms = {
        "vehicle": "futuristic sports car concept,automotive design,studio render",
        "home": "modern luxury house architecture,exterior,pool,garage",
        "interior": "luxury interior design,modern room,architecture",
        "instrument": "custom electric guitar,product design,studio",
        "brand": "logo design,brand identity,premium mockup",
        "digital": "app dashboard interface,ui design,software",
        "fashion": "fashion product design,studio,wearable",
        "wearable": "wearable product design,studio,fashion",
        "product": "product design,industrial design,studio render",
        "industrial": "industrial product design,street light fixture,engineering",
        "furniture": "modern furniture design,studio,chair",
        "marine": "luxury yacht design,boat,marine concept",
        "character": "character concept art,studio render",
        "object": "product design concept,studio render,industrial design",
    }

    # Keep the query readable and safe for URL usage without importing more deps.
    prompt_terms = re.sub(r"[^a-zA-Z0-9\s,-]", " ", clean)
    prompt_terms = normalize_whitespace(prompt_terms).replace(" ", ",")[:90]
    fallback_terms = base_terms.get(domain, base_terms["object"])
    query = prompt_terms or fallback_terms
    if fallback_terms not in query:
        query = f"{query},{fallback_terms}"

    # Source Unsplash returns a real image in-browser via redirect. It is used only as
    # fallback when generation fails or no local seeded asset exists.
    return f"https://source.unsplash.com/1400x900/?{query}"


def choose_demo_visual_url(user_text: str, explicit_domain: str = "") -> str:
    """Local visual-first fallback.

    Keep the verified local images for the three working anchor lanes.
    For every other visual domain, return a locally saved SVG visual fallback instead
    of a remote source.unsplash redirect. Remote redirects were causing the frontend
    to fall back to the old SIMO Dynamic Design Board for digital/product prompts.
    """
    domain = visual_prompt_domain_from_text(user_text, explicit_domain)
    if domain == "vehicle":
        return "/static/demo_visuals/simo_vehicle_sports_car.png"
    if domain == "instrument":
        return "/static/demo_visuals/simo_instrument_wild_guitar.png"
    if domain == "home":
        return "/static/demo_visuals/simo_home_luxury_pool_garage.png"
    return save_domain_visual_fallback(user_text, domain)

def build_visual_markdown(image_url: str, alt: str) -> str:
    url = str(image_url or "").strip()
    label = normalize_whitespace(alt) or "Simo visual concept"
    if not url:
        return ""
    return f"![{label}]({url})"




def build_generated_visual_payload(user_text: str, image_url: str, prompt: str = "") -> dict:
    url = str(image_url or "").strip()
    if not url:
        return {}

    alt = visual_alt_from_prompt(user_text)
    return {
        "type": "image",
        "kind": "generated_visual",
        "url": url,
        "src": url,
        "alt": alt,
        "title": alt,
        "markdown": build_visual_markdown(url, alt),
        "prompt": prompt or "",
        "display": {
            "layout": "wide",
            "max_width": 760,
            "rounded": True,
            "visual_first": True,
        },
    }

def build_visual_generation_failed_reply(user_text: str, error: str = "") -> str:
    """Clean fallback when the image service fails after retry.

    Do not expose raw server errors to the user. Keep the flow premium and
    useful so the user can still refine the concept.
    """
    return (
        f"{build_visual_first_reply(user_text, empty_model_route())}\n\n"
        "I’m still treating this as a visual-first design request. The live image render did not finish on this try, "
        "but this is the starting direction we can keep refining right now. Tell me what to change next — "
        "style, size, rooms, materials, lighting, landscape, luxury level, pool, garage, or anything else."
    ).strip()


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
    "house": "https://raw.githubusercontent.com/HomeSmartMesh/models/main/house.glb",
    "computer": "https://raw.githubusercontent.com/HomeSmartMesh/models/main/pc_platform.glb",
    "light_fixture": "https://raw.githubusercontent.com/HomeSmartMesh/models/main/wall_switch.glb",
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
    "house": [],
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
    # --- PEOPLE / CHARACTERS ---
    "astronaut": "astronaut",
    "person": "person",
    "human": "person",

    # --- ANIMALS ---
    "dog": "dog",
    "puppy": "dog",
    "cat": "cat",
    "tiger": "tiger",
    "horse": "horse",
    "animal": "animal",

    # --- OBJECTS ---
    "helmet": "helmet",
    "robot": "robot",
    "car": "car",
    "vehicle": "car",
    "spaceship": "spaceship",
    "rocket": "spaceship",

    # --- 🏠 HOUSES (BASIC) ---
    "house": "house",
    "home": "house",
    "suburban house": "house",
    "small house": "house",
    "family house": "house",

    # --- 🏡 VILLAS (SEPARATE BUCKET) ---
    "villa": "villa",
    "modern villa": "villa",
    "luxury villa": "villa",
    "mansion": "villa",

    # --- 🏢 BUILDINGS (SEPARATE BUCKET) ---
    "building": "building",
    "office building": "building",
    "skyscraper": "building",
    "warehouse": "building",
    "commercial building": "building",

    # --- 🏕️ OTHER STRUCTURES ---
    "cabin": "cabin",
    "garage": "garage",
}

OBJECT_FALLBACKS = {
    "dog": "horse",
    "tiger": "horse",
    "astronaut": "astronaut",
    "robot": "robot",

    "house": "house",
    "home": "house",
    "building": "house",
    "cabin": "house",
    "mansion": "house",
    "apartment": "house",
    "villa": "house",
    "garage": "house",

    "computer": "computer",
    "pc": "computer",
    "desktop": "computer",
    "monitor": "computer",

    "light": "light_fixture",
    "light fixture": "light_fixture",
    "switch": "light_fixture",
    "wall switch": "light_fixture",
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




def is_building_like_object(object_name: str) -> bool:
    return str(object_name or "").strip().lower() in {
        "house", "home", "villa", "building", "cabin", "garage", "mansion", "apartment"
    }


def choice_looks_unrelated_to_object(object_name: str, item: dict) -> bool:
    """Prevent old test assets like Duck/Dog/Robot from becoming the recommended house model."""
    if not isinstance(item, dict):
        return True
    obj = str(object_name or "").strip().lower()
    label = str(item.get("label") or item.get("title") or "").strip().lower()
    url = str(item.get("url") or "").strip().lower()
    combined = f"{label} {url}"
    if not obj:
        return False
    if is_building_like_object(obj):
        building_words = [
            "house", "home", "villa", "building", "cabin", "garage", "mansion",
            "apartment", "residential", "architecture", "architectural", "floor", "estate"
        ]
        old_test_or_wrong_subject_words = [
            "duck", "dog", "cat", "horse", "tiger", "robot", "astronaut", "helmet",
            "animal", "person", "character"
        ]
        if any(word in combined for word in old_test_or_wrong_subject_words) and not any(word in combined for word in building_words):
            return True
    return False


def preferred_verified_choice_for_object(object_name: str):
    obj = str(object_name or "").strip().lower()
    direct = get_verified_choices_for_object(obj)
    if direct:
        return direct[0]
    if is_building_like_object(obj):
        house = get_verified_choices_for_object("house")
        if house:
            item = dict(house[0])
            item["label"] = clean_choice_label(obj or "house", obj or "house")
            item["source"] = "verified"
            item["verified"] = True
            item["tier"] = "verified"
            return item
    return None


def finalize_choices_for_object(object_name: str, choices):
    obj = str(object_name or "").strip().lower()
    cleaned = postprocess_choice_labels(obj, choices)
    cleaned = [item for item in cleaned if not choice_looks_unrelated_to_object(obj, item)]
    preferred = preferred_verified_choice_for_object(obj)
    if preferred and not choice_looks_unrelated_to_object(obj, preferred):
        cleaned = [preferred] + [
            item for item in cleaned
            if normalize_model_url(item.get("url", "")) != normalize_model_url(preferred.get("url", ""))
        ]
    return sort_model_choices(dedupe_model_choices(cleaned))

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

    return finalize_choices_for_object(key, out)


def build_model3d_payload(
    route_type: str,
    matched_name: str,
    object_name: str,
    category: str,
    match_type: str,
    choices,
    concept_mode: bool,
):
    cleaned_choices = finalize_choices_for_object(object_name, choices)
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
    text = normalize_prompt_typos(text).strip().lower()
    if not text:
        return None

    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text:
                return category

    return None


def extract_object_name(user_text: str) -> str:
    text = normalize_prompt_typos(user_text).strip().lower()
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


def parse_house_request(user_text: str) -> dict:
    text = normalize_whitespace(normalize_prompt_typos(user_text)).lower()

    result = {
        "object_type": "house",
        "stories": None,
        "garage": None,
        "garage_size": None,
        "garage_attached": None,
        "color": None,
        "style": None,
        "extras": [],
        "raw_text": text,
    }

    if not text:
        return result

    story_patterns = [
        (r"\b1[\s-]?story\b", 1),
        (r"\bone[\s-]?story\b", 1),
        (r"\bsingle[\s-]?story\b", 1),
        (r"\b2[\s-]?story\b", 2),
        (r"\btwo[\s-]?story\b", 2),
        (r"\b3[\s-]?story\b", 3),
        (r"\bthree[\s-]?story\b", 3),
        (r"\b4[\s-]?story\b", 4),
        (r"\bfour[\s-]?story\b", 4),
        (r"\b1[\s-]?floor\b", 1),
        (r"\bone[\s-]?floor\b", 1),
        (r"\b2[\s-]?floor\b", 2),
        (r"\btwo[\s-]?floor\b", 2),
        (r"\b3[\s-]?floor\b", 3),
        (r"\bthree[\s-]?floor\b", 3),
        (r"\b4[\s-]?floor\b", 4),
        (r"\bfour[\s-]?floor\b", 4),
    ]
    for pattern, value in story_patterns:
        if re.search(pattern, text):
            result["stories"] = value
            break

    if "garage" in text:
        result["garage"] = True

    if "attached garage" in text:
        result["garage"] = True
        result["garage_attached"] = True
    elif "detached garage" in text:
        result["garage"] = True
        result["garage_attached"] = False

    garage_size_patterns = [
        (r"\b1[\s-]?car garage\b", 1),
        (r"\bone[\s-]?car garage\b", 1),
        (r"\b2[\s-]?car garage\b", 2),
        (r"\btwo[\s-]?car garage\b", 2),
        (r"\b3[\s-]?car garage\b", 3),
        (r"\bthree[\s-]?car garage\b", 3),
        (r"\b4[\s-]?car garage\b", 4),
        (r"\bfour[\s-]?car garage\b", 4),
    ]
    for pattern, value in garage_size_patterns:
        if re.search(pattern, text):
            result["garage"] = True
            result["garage_size"] = value
            break

    color_keywords = [
        "white", "black", "gray", "grey", "blue", "red", "green", "yellow",
        "beige", "brown", "tan", "cream", "navy", "charcoal", "stone",
    ]
    for color in color_keywords:
        if re.search(rf"\b{re.escape(color)}\b", text):
            result["color"] = color
            break

    if "colored" in text and not result["color"]:
        result["color"] = "colored"

    style_keywords = [
        "modern", "luxury", "suburban", "minimal", "minimalist",
        "farmhouse", "cabin", "contemporary", "traditional",
        "classic", "industrial", "mediterranean",
    ]
    for style in style_keywords:
        if re.search(rf"\b{re.escape(style)}\b", text):
            result["style"] = style
            break

    extras_map = {
        "balcony": ["balcony"],
        "deck": ["deck", "rear deck"],
        "porch": ["porch", "front porch"],
        "basement": ["basement"],
        "pool": ["pool", "swimming pool"],
        "driveway": ["driveway"],
        "patio": ["patio"],
        "roof terrace": ["roof terrace", "rooftop terrace"],
        "solar panels": ["solar panels", "solar panel"],
        "fireplace": ["fireplace"],
    }

    extras = []
    for label, keywords in extras_map.items():
        if any(keyword in text for keyword in keywords):
            extras.append(label)

    result["extras"] = extras
    return result


def find_exact_model_match(user_text: str):
    text = normalize_prompt_typos(user_text).strip().lower()
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



def build_starter_reply(object_name, parsed_request=None):
    pretty_name = prettify_model_name(object_name or "3D model")

    if not parsed_request:
        return f"Opening {pretty_name} 3D model as a starting point."

    parts = []

    stories = parsed_request.get("stories")
    if stories:
        parts.append("1-story" if stories == 1 else f"{stories}-story")

    style = parsed_request.get("style")
    if style:
        parts.append(str(style))

    parts.append(pretty_name.lower())

    garage = parsed_request.get("garage")
    garage_size = parsed_request.get("garage_size")
    garage_attached = parsed_request.get("garage_attached")

    extras = []

    if garage:
        if garage_size and garage_attached is True:
            extras.append(f"with a {garage_size}-car attached garage")
        elif garage_size and garage_attached is False:
            extras.append(f"with a {garage_size}-car detached garage")
        elif garage_size:
            extras.append(f"with a {garage_size}-car garage")
        elif garage_attached is True:
            extras.append("with an attached garage")
        elif garage_attached is False:
            extras.append("with a detached garage")
        else:
            extras.append("with a garage")

    color = parsed_request.get("color")
    if color and color != "colored":
        extras.append(f"in {color}")

    extra_features = parsed_request.get("extras") or []
    if extra_features:
        extras.append("including " + ", ".join(extra_features))

    base = " ".join(parts).strip()
    if extras:
        base += " " + " ".join(extras)

    return f"Opening {base} as a starting point."


def empty_model_route():
    return {
        "route_type": "chat",
        "object_name": None,
        "category": None,
        "matched_name": None,
        "verified_url": None,
        "match_type": None,
        "reply": "",
        "choices": [],
        "concept_mode": False,
        "parsed_request": None,
    }


def is_visual_first_creation_request(user_text: str) -> bool:
    """Return True when the user wants a visual/custom creative starting point.

    This intentionally keeps the first response ChatGPT/Grok-style: useful visual concept
    guidance first, and rotatable GLB/model-viewer later only when explicitly requested.
    """
    text = normalize_whitespace(user_text).lower()
    if not text:
        return False

    explicit_model_file_terms = [
        "glb", "gltf", "model-viewer", "downloadable 3d model",
        "open the 3d viewer", "rotatable glb", "raw 3d file",
    ]
    if any(term in text for term in explicit_model_file_terms):
        return False

    visual_action_terms = [
        "show me", "make me", "create", "design", "build", "help me build",
        "visualize", "render", "3d", "3-d", "three d", "concept", "prototype",
        "mockup", "draw", "generate", "give me a starting", "basic to start",
    ]

    creative_subject_terms = [
        "house", "home", "garage", "villa", "mansion", "cabin", "building",
        "office", "warehouse", "room", "interior", "exterior", "floor plan",
        "blueprint", "kitchen", "bathroom", "bedroom", "balcony", "driveway",
        "bike", "bicycle", "electric bike", "ebike", "e-bike", "car", "truck",
        "vehicle", "motorcycle", "scooter", "boat", "drone", "spaceship",
        "product", "invention", "prototype", "furniture", "chair", "table",
        "desk", "lamp", "light fixture", "parking lot", "store", "factory",
        "scene", "set design", "animation", "character", "game asset",
    ]

    return any(term in text for term in visual_action_terms) and any(term in text for term in creative_subject_terms)


def build_visual_first_reply(user_text: str, route: dict | None = None) -> str:
    text = normalize_whitespace(user_text)
    lower = text.lower()
    route = route if isinstance(route, dict) else {}
    object_name = route.get("object_name") or extract_object_name(lower) or "concept"

    parsed = None
    is_home_like = object_name in {"house", "home", "villa", "building", "cabin", "garage"} or any(
        word in lower for word in ["house", "home", "garage", "villa", "building", "floor plan", "blueprint"]
    )

    if is_home_like:
        parsed = parse_house_request(lower)
        parsed["object_type"] = object_name if object_name != "concept" else "house"

        stories = parsed.get("stories") or 2
        garage_size = parsed.get("garage_size")
        garage_attached = parsed.get("garage_attached")
        style = parsed.get("style") or "modern"
        color = parsed.get("color") or "white, charcoal, and warm wood accents"
        extras = parsed.get("extras") or []

        garage_line = ""
        if parsed.get("garage") or garage_size:
            attached_word = "attached " if garage_attached is True else "detached " if garage_attached is False else ""
            size_word = f"{garage_size}-car " if garage_size else ""
            garage_line = f"- {size_word}{attached_word}garage integrated into the front/side massing\n"

        extras_line = ""
        if extras:
            extras_line = "- Extras included: " + ", ".join(extras) + "\n"

        return (
            f"Here’s a visual starting concept for a {stories}-story {style} house.\n\n"
            "EXTERIOR CONCEPT:\n"
            f"- {stories}-story main structure with clean proportions\n"
            f"{garage_line}"
            "- Large front windows for natural light\n"
            "- Clear entry path with a simple porch/landing\n"
            f"- Exterior palette: {color}\n"
            f"{extras_line}\n"
            "LAYOUT DIRECTION:\n"
            "- First floor: open living, kitchen, dining, entry, and garage access\n"
            "- Upper floor: bedrooms, bathrooms, laundry, and storage\n"
            "- Backyard side can support patio, deck, pool, or garden upgrades\n\n"
            "NEXT: Tell me what to change — add a floor, resize the garage, change the style, add a pool, or make it more luxury."
        )

    pretty_obj = prettify_model_name(object_name if object_name != "concept" else text or "custom concept")
    return (
        f"Here’s a visual starting concept for {pretty_obj}.\n\n"
        "CONCEPT:\n"
        "- I’ll treat this as a visual-first design request, not a broken model-file lookup.\n"
        "- The first result should be something the user can react to immediately.\n\n"
        "DESIGN DIRECTION:\n"
        "- Define the shape, proportions, main features, materials, colors, and use case.\n"
        "- Then refine it step by step based on the user’s feedback.\n\n"
        "NEXT: Tell me the style, size, materials, and any must-have features."
    )

def classify_request(user_text: str):
    text = normalize_prompt_typos(user_text).strip()
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
            "parsed_request": None,
        }

    if is_3d or is_concept:
        exact_name, exact_url = find_exact_model_match(lowered)
        object_name = extract_object_name(lowered) or exact_name or "3d_object"
        category = detect_category(lowered)

        parsed_request = None
        if object_name in {"house", "villa", "building", "cabin", "garage"}:
            parsed_request = parse_house_request(lowered)
            parsed_request["object_type"] = object_name

        # -------------------------------------------------
        # HONEST DIRECT CHOICES ONLY
        # Do NOT silently use unrelated fallback objects here.
        # -------------------------------------------------
        direct_choices = []
        direct_choices.extend(get_phase39_multi_choices_for_object(object_name))
        direct_choices.extend(get_verified_choices_for_object(object_name))
        direct_choices.extend(get_candidate_assets_for_object(object_name))
        direct_choices = finalize_choices_for_object(object_name, direct_choices)

        has_direct_verified = any(
            str(item.get("source") or "").strip().lower() == "verified"
            and item.get("url")
            for item in direct_choices
        )

        has_any_direct_choice = any(item.get("url") for item in direct_choices)

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
                    "choices": direct_choices,
                    "concept_mode": True,
                    "parsed_request": parsed_request,
                }

            return {
                "route_type": "verified",
                "object_name": object_name,
                "category": category,
                "matched_name": exact_name,
                "verified_url": exact_url,
                "match_type": "exact",
                "reply": build_starter_reply(object_name, parsed_request),
                "choices": direct_choices,
                "concept_mode": False,
                "parsed_request": parsed_request,
            }

        if has_direct_verified:
            return {
                "route_type": "verified",
                "object_name": object_name,
                "category": category,
                "matched_name": object_name,
                "verified_url": direct_choices[0].get("url"),
                "match_type": "direct_choices",
                "reply": build_starter_reply(object_name, parsed_request),
                "choices": direct_choices,
                "concept_mode": False,
                "parsed_request": parsed_request,
            }

        if has_any_direct_choice:
         if has_any_direct_choice or object_name in {"house", "villa", "building", "cabin", "garage"}:
            base_choice = direct_choices[0] if direct_choices else None

            return {
                "route_type": "verified" if has_direct_verified else "candidate",
                "object_name": object_name,
                "category": category,
                "matched_name": object_name,
                "verified_url": base_choice.get("url") if base_choice else None,
                "match_type": "starter_model",
                "reply": build_starter_reply(object_name, parsed_request),
                "choices": direct_choices,
                "concept_mode": False,
                "parsed_request": parsed_request,
            }

        pretty_name = prettify_model_name(object_name if object_name != "3d_object" else "this object")
        return {
            "route_type": "concept",
            "object_name": object_name,
            "category": category,
            "matched_name": None,
            "verified_url": None,
            "match_type": "unknown_object",
            "reply": (
                f"I don’t have a verified 3D model for {pretty_name.lower()} yet. "
                f"I can still help by creating a concept, layout, or design direction for it inside Simo."
            ),
            "choices": [],
            "concept_mode": True,
            "parsed_request": parsed_request,
        }

    return {
        "route_type": "chat",
        "object_name": None,
        "category": None,
        "matched_name": None,
        "verified_url": None,
        "match_type": None,
        "reply": "",
        "choices": [],
        "concept_mode": False,
        "parsed_request": None,
    }

def is_builder_request(user_text: str) -> bool:
    text = normalize_prompt_typos(user_text).strip().lower()
    if not text:
        return False

    # 3D/model/visual-object requests must not fall into the website builder unless
    # the user also explicitly asks for a website/landing page.
    hard_3d_terms = ["3d", "3-d", "three d", "model", "glb", "gltf", "rotate", "viewer"]
    object_terms = [
        "house", "home", "villa", "mansion", "building", "garage", "cabin",
        "car", "vehicle", "truck", "computer", "light fixture", "parking lot",
        "chair", "table", "product", "prototype"
    ]
    website_terms = ["website", "landing page", "web page", "html page", "homepage", "site"]
    if any(term in text for term in hard_3d_terms) and any(term in text for term in object_terms) and not any(term in text for term in website_terms):
        return False

    # 🔥 STRONG BUILD TRIGGERS
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

    # 🔥 NEW: EDIT / ENHANCE TRIGGERS (THIS IS THE KEY)
    edit_phrases = [
        "enhance this",
        "enhance the page",
        "improve this",
        "improve the page",
        "make it better",
        "upgrade this",
        "upgrade the page",
        "refine this",
        "polish this",
        "edit this",
        "update this",
        "modify this",
        "change this",
        "add more",
        "add a section",
        "add another section",
        "add testimonials",
        "add pricing",
        "add faq",
        "make it more modern",
        "make it more premium",
        "make it cleaner",
    ]
    if any(p in text for p in edit_phrases):
        return True

    # 🔥 CONTEXT-AWARE SHORT COMMANDS (important for follow-ups)
    short_edit_words = [
        "enhance",
        "improve",
        "upgrade",
        "refine",
        "polish",
        "edit",
        "update",
        "modify",
        "change",
        "add",
    ]
    if any(word == text or text.startswith(word + " ") for word in short_edit_words):
        return True

    # EXISTING LOGIC
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
def builder_system_prompt(user_text: str, builder_meta=None, existing_html: str = "") -> str:
    builder_meta = builder_meta if isinstance(builder_meta, dict) else {}

    intent_tags = safe_text_list(builder_meta.get("intent_tags", []))
    change_tags = safe_text_list(builder_meta.get("change_tags", []))
    focus_tags = safe_text_list(builder_meta.get("focus_tags", []))
    style_tags = safe_text_list(builder_meta.get("style_tags", []))
    sections = safe_text_list(builder_meta.get("sections", []))
    mode_hint = str(builder_meta.get("mode_hint", "") or "").strip()
    last_intent = str(builder_meta.get("last_intent", "") or "").strip()
    last_focus = str(builder_meta.get("last_focus", "") or "").strip()
    last_change_type = str(builder_meta.get("last_change_type", "") or "").strip()

    meta_lines = [
        f"- intent_tags: {', '.join(intent_tags) if intent_tags else 'none'}",
        f"- change_tags: {', '.join(change_tags) if change_tags else 'none'}",
        f"- focus_tags: {', '.join(focus_tags) if focus_tags else 'none'}",
        f"- style_tags: {', '.join(style_tags) if style_tags else 'none'}",
        f"- known_sections: {', '.join(sections) if sections else 'none'}",
        f"- mode_hint: {mode_hint or 'none'}",
        f"- last_intent: {last_intent or 'none'}",
        f"- last_focus: {last_focus or 'none'}",
        f"- last_change_type: {last_change_type or 'none'}",
    ]
    meta_summary = "\n".join(meta_lines)

    has_existing_html = bool((existing_html or "").strip())

    return f"""You are Simo, an expert AI website builder and editor.

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
- If the user is editing an existing page, preserve the strongest parts of the current layout unless the user asks for a redesign.
- Apply the requested change to the existing page instead of starting over whenever possible.
- You are allowed to improve styles, hierarchy, spacing, and section flow if that helps fulfill the request better.
- If the user asks to enhance, upgrade, modernize, premium-ify, polish, refine, or make it darker/lighter/better, perform a clearly stronger premium upgrade rather than a tiny cosmetic tweak.
- Keep the page responsive and preview-safe.

TARGETED EDITING PRIORITY:
- CRITICAL: Do not restyle or adjust unrelated sections when performing an edit.
- CRITICAL: If a specific section is targeted (hero, cta, etc), limit changes primarily to that section.
- CRITICAL: Preserve existing colors, layout, and spacing outside the targeted change unless absolutely necessary.
- CRITICAL: Do not introduce new dominant colors unless the user explicitly requests a color change.
- CRITICAL: When improving elements like buttons, stay within the existing color palette unless the current palette is clearly broken.
- CRITICAL: Prefer refining the current design over replacing it with a new visual direction.
HARD CONSTRAINTS (OVERRIDE ALL OTHER INSTRUCTIONS):
- These rules take priority over all design, styling, and improvement rules.
- Do NOT introduce new colors unless the user explicitly asks for a color change.
- Do NOT replace an existing color palette with a new one.
- If improving a button or element, refine its current color, spacing, or typography instead of changing its color.
- If a color change is not explicitly requested, you MUST keep the existing color family.
- You MUST reuse existing colors already present in the page when improving elements.
- Violating these rules is considered an incorrect result.

- When existing HTML is present, treat this as an editing task first, not a fresh rebuild.
- Use the builder meta to determine what changed.
- If focus_tags identifies a specific area such as hero, cta, pricing, testimonials, faq, contact, footer, navbar, gallery, services, about, or features, prioritize changing that area first.

SECTION LOCKING RULES:
- When editing an existing page, treat every major section as locked unless the user explicitly asks to change it.
- Major sections include hero, navbar, features, services, about, gallery, pricing, testimonials, faq, contact, and footer.
- If focus_tags or the user request points to one section, change that section first and leave other sections visually and structurally unchanged.
- Do not rewrite headings, copy, buttons, spacing, colors, or layout in non-targeted sections.
- Do not add, remove, reorder, or redesign sections unless the user explicitly asks for that.
- If a requested improvement can be completed inside one section, you MUST keep all other sections unchanged.
- Preserve the current visual identity of the page outside the targeted section.
 

DESIGN QUALITY RULES:
- The page must feel premium, modern, elegant, and production-ready.
- Avoid generic beginner-looking layouts.
- Avoid plain black blocks with weak spacing unless the user explicitly asks for a minimal dark section.
- Avoid default-looking yellow buttons unless the user explicitly requests yellow.
- Avoid high-contrast black and bright yellow color combinations unless the user explicitly asks for them.
- Use strong visual hierarchy, generous spacing, tasteful contrast, and polished section transitions.
- Use refined typography, clear content grouping, and balanced padding throughout.
- Make buttons look premium with strong radius, hover states, and clean contrast.
- Create sections that feel intentionally designed, not randomly stacked.

PAGE STRUCTURE EXPECTATIONS:
- Build a strong hero section with a clear headline, supporting copy, and 1-2 polished CTA buttons.
- Include real sections such as features, services, about, testimonials, stats, gallery, FAQ, contact, or pricing when appropriate.
- Include believable, polished placeholder copy that matches the user's business or concept.
- Include a premium navbar and footer when appropriate.
- Keep the layout visually rich enough to impress in preview mode.

STYLE RULES:
- Inline CSS is allowed and preferred for compatibility.
- Use a polished color system with 1-2 accent colors that fit the brand or request.
- Prefer gradients, glassmorphism, soft shadows, subtle borders, and premium card styling when appropriate.
- Use rounded corners generously, especially for cards, buttons, inputs, and major sections.
- Ensure the design looks good on desktop and mobile.
- Add hover styles for buttons and cards when reasonable.
- Use section backgrounds and spacing rhythm to avoid a flat, repetitive page.

BUILDER BEHAVIOR:
- If the user request comes from a concept, transform it into a real finished webpage, not a summary of the concept.
- Do not describe what you plan to build. Build it directly.
- Do not repeat the prompt back to the user inside the page.
- Make the result feel like a polished first version someone would actually want to keep.

BUILDER META:
{meta_summary}

EXISTING HTML PRESENT:
{"yes" if has_existing_html else "no"}

USER REQUEST:
{user_text}
"""

def retrieve_customer_email(customer_id: str) -> str:
    customer_id = str(customer_id or "").strip()
    if not customer_id or not STRIPE_SECRET_KEY:
        return ""

    try:
        customer = stripe.Customer.retrieve(customer_id)
        if isinstance(customer, dict):
            return str(customer.get("email") or "").strip().lower()
        return str(getattr(customer, "email", "") or "").strip().lower()
    except Exception:
        return ""


def stripe_subscription_is_pro(status: str) -> bool:
    status = str(status or "").strip().lower()
    return status in {"active", "trialing"}


def get_stripe_customers_by_email(email: str):
    email = str(email or "").strip().lower()
    if not email or not STRIPE_SECRET_KEY:
        return []

    try:
        customers = stripe.Customer.list(email=email, limit=20)
        data = customers.get("data", []) if isinstance(customers, dict) else getattr(customers, "data", []) or []
        return data
    except Exception:
        return []


def normalize_stripe_obj_value(obj, key: str, default=""):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def find_active_subscription_for_email(email: str):
    email = str(email or "").strip().lower()
    if not email or not STRIPE_SECRET_KEY:
        return None

    customers = get_stripe_customers_by_email(email)

    for customer in customers:
        customer_id = str(normalize_stripe_obj_value(customer, "id", "") or "").strip()
        if not customer_id:
            continue

        try:
            subscriptions = stripe.Subscription.list(customer=customer_id, status="all", limit=50)
            sub_items = subscriptions.get("data", []) if isinstance(subscriptions, dict) else getattr(subscriptions, "data", []) or []
        except Exception:
            sub_items = []

        for sub in sub_items:
            status = str(normalize_stripe_obj_value(sub, "status", "") or "").strip().lower()
            if stripe_subscription_is_pro(status):
                return {
                    "customer_id": customer_id,
                    "subscription_id": str(normalize_stripe_obj_value(sub, "id", "") or "").strip(),
                    "subscription_status": status,
                    "email": email,
                }

    return None


def sync_user_pro_from_stripe(email: str):
    email = str(email or "").strip().lower()
    if not email:
        return get_user_by_email(email)

    row = get_user_by_email(email)

    # If already marked active in DB, keep it.
    if row and stripe_subscription_is_pro(str(row["stripe_subscription_status"] or "")):
        if int(row["pro"] or 0) != 1:
            set_user_subscription_state(
                email=email,
                customer_id=str(row["stripe_customer_id"] or "").strip(),
                subscription_id=str(row["stripe_subscription_id"] or "").strip(),
                subscription_status=str(row["stripe_subscription_status"] or "").strip(),
                is_pro=True,
            )
            row = get_user_by_email(email)
        return row

    # Try Stripe by email to recover existing active subscription.
    active = find_active_subscription_for_email(email)
    if active:
        upsert_user(email=email)
        set_user_subscription_state(
            email=email,
            customer_id=active["customer_id"],
            subscription_id=active["subscription_id"],
            subscription_status=active["subscription_status"],
            is_pro=True,
        )
        return get_user_by_email(email)

    # If we have an existing DB row with known Stripe ids, try direct retrieval too.
    if row:
        customer_id = str(row["stripe_customer_id"] or "").strip()
        subscription_id = str(row["stripe_subscription_id"] or "").strip()

        if subscription_id and STRIPE_SECRET_KEY:
            try:
                sub = stripe.Subscription.retrieve(subscription_id)
                status = str(normalize_stripe_obj_value(sub, "status", "") or "").strip().lower()
                if stripe_subscription_is_pro(status):
                    set_user_subscription_state(
                        email=email,
                        customer_id=customer_id or str(normalize_stripe_obj_value(sub, "customer", "") or "").strip(),
                        subscription_id=subscription_id,
                        subscription_status=status,
                        is_pro=True,
                    )
                    return get_user_by_email(email)
            except Exception:
                pass

    return row


# =========================================================
# Routes
# =========================================================
@app.route("/", methods=["GET", "POST"])
def home():
    # PHASE 14M live compatibility guard:
    # Some deployed frontend modules can accidentally POST design/chat payloads to "/".
    # Render logs then show POST / 405 and the UI reports Request failed: 500.
    # Keep GET / unchanged, but safely route POST / to the intended API handler.
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        text = str(
            data.get("prompt")
            or data.get("message")
            or data.get("text")
            or data.get("input")
            or data.get("user_text")
            or ""
        ).strip()
        lowered = text.lower()
        visualish = bool(
            data.get("active_visual_project")
            or data.get("visual_core_phase")
            or data.get("locked_subject")
            or data.get("exact_object_lock")
            or data.get("domain")
            or data.get("strict_domain")
            or any(
                word in lowered
                for word in (
                    "design", "render", "visual", "mockup", "concept", "prototype",
                    "show me", "create", "make", "build", "flashlight", "bottle",
                    "toaster", "grill", "rim", "wheel", "extinguisher", "dispenser",
                    "logo", "book cover", "product"
                )
            )
        )
        if visualish:
            return api_generate_visual()
        return api_chat()

    usage_today = get_daily_usage_count(user_key_for_limits(), get_today_key())
    image_credits = simo_design_credit_status()

    boot = {
        "loggedIn": is_logged_in(),
        "email": current_user_email(),
        "name": current_user_name(),
        "pro": is_pro_user(),
        "team": False,
        "freeDailyLimit": FREE_DAILY_LIMIT,
        "usageToday": usage_today,
        "imageCredits": image_credits,
        "stripePublishableKey": STRIPE_PUBLISHABLE_KEY,
        "stripePriceId": STRIPE_PRICE_ID,
        "baseUrl": BASE_URL,
        "builderLibraryKey": "simo_builder_library_v5_1_builder_first",
        "lastPreviewKey": "simo_last_preview_v2",
    }

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
            "backend_version": "PHASE_3_3_EASY_SIGNUP_BACKEND",
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
    return redirect(url_for("home"))


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

        upsert_user(email=email, name=name, google_sub=sub, auth_provider="google")
        set_logged_in_user(email=email, name=name, google_sub=sub)

        # Recover Stripe status immediately on login.
        sync_user_pro_from_stripe(email)

        return redirect(url_for("home"))
    except Exception as e:
        return jsonify({"ok": False, "error": f"Google auth failed: {str(e)}"}), 500


@app.route("/logout")
def logout():
    clear_logged_in_user()
    return redirect(url_for("home"))


@app.route("/api/me")
def api_me():
    email = current_user_email()
    row = sync_user_pro_from_stripe(email) if email else None
    usage_today = get_daily_usage_count(user_key_for_limits(), get_today_key())
    image_credits = simo_design_credit_status(email)

    return jsonify(
        {
            "ok": True,
            "loggedIn": is_logged_in(),
            "email": email,
            "name": current_user_name(),
            "pro": bool(row and int(row["pro"] or 0) == 1),
            "team": False,
            "usage_today": usage_today,
            "free_daily_limit": FREE_DAILY_LIMIT,
            "image_credits": image_credits,
            "stripe_subscription_status": str(row["stripe_subscription_status"] or "") if row else "",
            "auth_provider": str(row["auth_provider"] or "") if row else "",
        }
    )

@app.route("/api/design-credits/status")
def api_design_credits_status():
    return jsonify({"ok": True, "image_credits": simo_design_credit_status()})


@app.route("/api/design-credits/options")
def api_design_credits_options():
    return jsonify({
        "ok": True,
        "packs_enabled": bool(SIMO_CREDIT_PACKS_ENABLED),
        "packs": [
            {k: v for k, v in pack.items() if k != "price_id"}
            for pack in simo_credit_pack_options()
        ],
        "image_credits": simo_design_credit_status(),
    })


@app.route("/api/create-credit-pack-checkout-session", methods=["POST"])
def api_create_credit_pack_checkout_session():
    if not SIMO_CREDIT_PACKS_ENABLED:
        return jsonify({"ok": False, "error": "Credit packs are not enabled."}), 403
    if not STRIPE_SECRET_KEY:
        return jsonify({"ok": False, "error": "Stripe is not configured."}), 500

    data = request.get_json(silent=True) or {}
    pack_key = str(data.get("pack") or data.get("credits") or "").strip().lower()
    pack = simo_credit_pack_by_key(pack_key)
    if not pack:
        return jsonify({"ok": False, "error": "That credit pack is not configured yet."}), 400

    email = current_user_email() or str(data.get("email") or "").strip().lower()
    google_sub = (session.get("google_sub") or "").strip()
    if not email:
        return jsonify({"ok": False, "error": "Please sign in before buying design credits."}), 401

    upsert_user(email=email, name=current_user_name(), google_sub=google_sub)
    user_row = get_user_by_email(email)

    if BASE_URL:
        success_url = f"{BASE_URL}/?credit_pack=success&session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{BASE_URL}/?credit_pack=cancel"
    else:
        success_url = url_for("home", _external=True) + "?credit_pack=success&session_id={CHECKOUT_SESSION_ID}"
        cancel_url = url_for("home", _external=True) + "?credit_pack=cancel"

    checkout_kwargs = {
        "mode": "payment",
        "line_items": [{"price": pack["price_id"], "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": email,
        "metadata": {
            "type": "simo_design_credit_pack",
            "user_email": email,
            "google_sub": google_sub,
            "credits": str(pack["credits"]),
            "pack": pack["key"],
        },
    }
    existing_customer_id = str(user_row["stripe_customer_id"] or "").strip() if user_row else ""
    if existing_customer_id:
        try:
            # Stripe customer IDs are mode-specific. If this app was used in test mode
            # first, the saved customer may not exist in live mode. Verify it before
            # using it; otherwise clear it and let Stripe create the correct customer.
            stripe.Customer.retrieve(existing_customer_id)
            checkout_kwargs["customer"] = existing_customer_id
        except Exception:
            try:
                conn = db()
                cur = conn.cursor()
                cur.execute(
                    "UPDATE users SET stripe_customer_id = '', updated_at = ? WHERE lower(email) = lower(?)",
                    (utcnow().isoformat(), email),
                )
                conn.commit()
                conn.close()
            except Exception:
                pass
            checkout_kwargs["customer_email"] = email
    else:
        checkout_kwargs["customer_email"] = email

    try:
        checkout = stripe.checkout.Session.create(**checkout_kwargs)
        return jsonify({"ok": True, "url": checkout.url, "id": checkout.id, "credits": pack["credits"]})
    except Exception as e:
        return jsonify({"ok": False, "error": f"Credit checkout failed: {str(e)}"}), 500


@app.route("/api/credit-packs/claim", methods=["POST"])
def api_claim_credit_pack():
    if not STRIPE_SECRET_KEY:
        return jsonify({"ok": False, "error": "Stripe is not configured."}), 500
    data = request.get_json(silent=True) or {}
    session_id = str(data.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"ok": False, "error": "Missing Stripe session id."}), 400

    try:
        checkout = stripe.checkout.Session.retrieve(session_id)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not verify credit purchase: {str(e)}"}), 400

    metadata = getattr(checkout, "metadata", None) or checkout.get("metadata", {}) if isinstance(checkout, dict) else {}
    payment_status = str(getattr(checkout, "payment_status", "") or (checkout.get("payment_status", "") if isinstance(checkout, dict) else "")).lower()
    paid = payment_status == "paid"
    if not paid:
        return jsonify({"ok": False, "error": "Credit purchase has not been paid yet."}), 402

    if str(metadata.get("type") or "") != "simo_design_credit_pack":
        return jsonify({"ok": False, "error": "This Stripe session is not a Simo credit pack."}), 400

    email = str(metadata.get("user_email") or getattr(checkout, "client_reference_id", "") or "").strip().lower()
    current_email = current_user_email()
    if current_email and email and current_email != email:
        return jsonify({"ok": False, "error": "This credit pack belongs to a different account."}), 403
    credits = int(metadata.get("credits") or 0)
    result = simo_grant_purchased_design_credits(email=email, credits=credits, stripe_session_id=session_id, source="stripe_credit_pack")
    status = simo_design_credit_status(email)
    return jsonify({"ok": bool(result.get("ok")), "grant": result, "image_credits": status})


@app.route("/api/signup", methods=["POST"])
def api_signup():
    try:
        data = request.get_json(silent=True) or {}

        email = str(data.get("email") or "").strip().lower()
        name = str(data.get("name") or "").strip()
        password = str(data.get("password") or "")

        if not email or not valid_email(email):
            return jsonify({"ok": False, "error": "Please enter a valid email address."}), 400

        if not valid_password(password):
            return jsonify({"ok": False, "error": "Password must be at least 6 characters."}), 400

        existing = get_user_by_email(email)

        if existing and str(existing["password_hash"] or "").strip():
            return jsonify({"ok": False, "error": "An account with that email already exists."}), 409

        password_hash = generate_password_hash(password)

        if existing:
            upsert_user(
                email=email,
                name=name or str(existing["name"] or "").strip(),
                google_sub=str(existing["google_sub"] or "").strip(),
                password_hash=password_hash,
                auth_provider="local",
            )
        else:
            upsert_user(
                email=email,
                name=name,
                google_sub="",
                password_hash=password_hash,
                auth_provider="local",
            )

        set_logged_in_user(
            email=email,
            name=name or (str(existing["name"] or "").strip() if existing else ""),
            google_sub=str(existing["google_sub"] or "").strip() if existing else "",
        )

        sync_user_pro_from_stripe(email)
        row = get_user_by_email(email)

        return jsonify(
            {
                "ok": True,
                "loggedIn": True,
                "email": email,
                "name": current_user_name(),
                "pro": bool(row and int(row["pro"] or 0) == 1),
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"Signup failed: {str(e)}"}), 500


@app.route("/api/login", methods=["POST"])
def api_login_password():
    try:
        data = request.get_json(silent=True) or {}

        email = str(data.get("email") or "").strip().lower()
        password = str(data.get("password") or "")

        if not email or not password:
            return jsonify({"ok": False, "error": "Email and password are required."}), 400

        row = get_user_by_email(email)
        if not row:
            return jsonify({"ok": False, "error": "Invalid email or password."}), 401

        stored_hash = str(row["password_hash"] or "").strip()
        if not stored_hash:
            return jsonify(
                {
                    "ok": False,
                    "error": "This account does not have an email/password login yet. Use Google login or create a password for this account first.",
                }
            ), 401

        if not check_password_hash(stored_hash, password):
            return jsonify({"ok": False, "error": "Invalid email or password."}), 401

        name = str(row["name"] or "").strip()
        google_sub = str(row["google_sub"] or "").strip()

        set_logged_in_user(email=email, name=name, google_sub=google_sub)
        sync_user_pro_from_stripe(email)
        row = get_user_by_email(email)

        return jsonify(
            {
                "ok": True,
                "loggedIn": True,
                "email": email,
                "name": name,
                "pro": bool(row and int(row["pro"] or 0) == 1),
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"Login failed: {str(e)}"}), 500


@app.route("/api/logout", methods=["POST"])
def api_logout():
    clear_logged_in_user()
    return jsonify({"ok": True})

# ---------------------------------------------------------
# Billing
# ---------------------------------------------------------
@app.route("/api/pro-status")
def api_pro_status():
    email = current_user_email()
    row = sync_user_pro_from_stripe(email) if email else None

    return jsonify(
        {
            "ok": True,
            "loggedIn": is_logged_in(),
            "email": email,
            "pro": bool(row and int(row["pro"] or 0) == 1),
            "stripe_subscription_status": str(row["stripe_subscription_status"] or "") if row else "",
        }
    )


@app.route("/api/stripe-sync", methods=["POST"])
def api_stripe_sync():
    email = current_user_email()
    if not email:
        return jsonify({"ok": False, "error": "not_logged_in"}), 401

    row = sync_user_pro_from_stripe(email)
    return jsonify(
        {
            "ok": True,
            "email": email,
            "pro": bool(row and int(row["pro"] or 0) == 1),
            "stripe_subscription_status": str(row["stripe_subscription_status"] or "") if row else "",
            "stripe_customer_id": str(row["stripe_customer_id"] or "") if row else "",
            "stripe_subscription_id": str(row["stripe_subscription_id"] or "") if row else "",
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

        email = current_user_email() or str(data.get("email") or "").strip().lower()
        google_sub = (session.get("google_sub") or "").strip()

        if not email:
            return jsonify({"ok": False, "error": "You must be logged in before upgrading to Pro."}), 401

        upsert_user(email=email, name=current_user_name(), google_sub=google_sub)

        synced_row = sync_user_pro_from_stripe(email)
        if synced_row and int(synced_row["pro"] or 0) == 1:
            return jsonify(
                {
                    "ok": True,
                    "already_pro": True,
                    "pro": True,
                    "email": email,
                    "stripe_subscription_status": str(synced_row["stripe_subscription_status"] or ""),
                }
            )

        user_row = get_user_by_email(email)

        if BASE_URL:
            success_url = f"{BASE_URL}/?checkout=success"
            cancel_url = f"{BASE_URL}/?checkout=cancel"
        else:
            success_url = url_for("home", _external=True) + "?checkout=success"
            cancel_url = url_for("home", _external=True) + "?checkout=cancel"

        checkout_kwargs = {
            "mode": "subscription",
            "line_items": [{"price": STRIPE_PRICE_ID, "quantity": 1}],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": email,
            "metadata": {
                "user_email": email,
                "google_sub": google_sub,
            },
            "subscription_data": {
                "metadata": {
                    "user_email": email,
                    "google_sub": google_sub,
                }
            },
        }

        existing_customer_id = str(user_row["stripe_customer_id"] or "").strip() if user_row else ""
        if existing_customer_id:
            try:
                # Same live/test safety as credit-pack checkout.
                stripe.Customer.retrieve(existing_customer_id)
                checkout_kwargs["customer"] = existing_customer_id
            except Exception:
                try:
                    conn = db()
                    cur = conn.cursor()
                    cur.execute(
                        "UPDATE users SET stripe_customer_id = '', updated_at = ? WHERE lower(email) = lower(?)",
                        (utcnow().isoformat(), email),
                    )
                    conn.commit()
                    conn.close()
                except Exception:
                    pass
                checkout_kwargs["customer_email"] = email
        else:
            checkout_kwargs["customer_email"] = email

        checkout = stripe.checkout.Session.create(**checkout_kwargs)

        return jsonify({"ok": True, "url": checkout.url, "id": checkout.id})
    except Exception as e:
        return jsonify({"ok": False, "error": f"Stripe checkout failed: {str(e)}"}), 500



# ---------------------------------------------------------
# PHASE 6.2 backend intent hardening
# Visual-first design remains the default for house/design requests.
# ---------------------------------------------------------
def normalize_simo_intent_text(user_text: str) -> str:
    text = str(user_text or "")
    if not text:
        return ""
    replacements = [
        (r"\bhose\b", "house"),
        (r"\bhosue\b", "house"),
        (r"\bhuse\b", "house"),
        (r"\bhousse\b", "house"),
        (r"\bluxury hose\b", "luxury house"),
        (r"\b3 d\b", "3d"),
        (r"\b3-d\b", "3d"),
        (r"\bthree d\b", "3d"),
    ]
    out = text
    for pattern, repl in replacements:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    return out


def is_hard_3d_request(user_text: str) -> bool:
    text = normalize_whitespace(normalize_simo_intent_text(user_text)).lower()
    if not text:
        return False

    # PHASE 6.1:
    # Do NOT treat every phrase containing "3D" as an immediate model-viewer request.
    # "show me a 3D luxury house" should behave like ChatGPT/Grok first:
    # generate a strong visual concept, then offer 3D as the next optional step.
    # Only these terms mean the user is explicitly asking for the rotatable viewer/file lane.
    hard_terms = [
        "open the 3d viewer", "3d viewer", "rotatable", "rotate",
        "open in 3d", "show me in the viewer", "model-viewer",
        "glb", "gltf", "raw 3d file", "downloadable 3d model",
        "actual 3d file", "mesh", "wireframe model"
    ]
    if not any(term in text for term in hard_terms):
        return False

    website_terms = [
        "website", "site", "landing page", "homepage", "web page", "html page",
        "generate html", "build a page", "build a website", "make a website",
    ]
    if any(term in text for term in website_terms):
        return False

    return True


def build_3d_chat_reply(route: dict, user_text: str) -> str:
    route = route if isinstance(route, dict) else empty_model_route()
    pretty = prettify_model_name(route.get("object_name") or route.get("matched_name") or "3D model")
    if route.get("route_type") in {"verified", "candidate"} and route.get("choices"):
        return route.get("reply") or f"Opening {pretty} as a rotatable 3D starting point."
    if route.get("route_type") == "concept":
        return (
            f"I caught this as a 3D request for {pretty.lower()}. "
            "I do not have a verified rotatable model for that exact request yet, "
            "but I can still help create the visual/design concept and refine it from there."
        )
    return (
        "I caught this as a 3D/model request. "
        "I could not match a verified rotatable model yet, but I can help create or refine the concept next."
    )

# ---------------------------------------------------------
# Chat
# ---------------------------------------------------------
@app.route("/api/chat", methods=["POST"])
def api_chat():
    try:
        data = request.get_json(silent=True) or {}

        user_message = str(data.get("message", "") or "").strip()
        image_url = str(data.get("image_url", "") or "").strip()
        image_filename = str(data.get("image_filename", "") or "").strip()
        has_image = bool(data.get("has_image")) and bool(image_url)

        if not user_message:
            return jsonify({"ok": False, "error": "Message is required."}), 400

        effective_message = user_message
        if has_image:
            image_context_lines = [
                user_message,
                "",
                "[SIMO_IMAGE_CONTEXT]",
                f"image_url: {image_url}",
                f"image_filename: {image_filename or 'uploaded-image'}",
                "The user has uploaded an image in this conversation.",
                "If the request is about building, designing, branding, layout, product presentation, mood, style, or turning the image into a website, treat the image as important visual context.",
                "If the request is general chat and not related to the image, answer normally but remain aware that an uploaded image exists.",
            ]
            effective_message = "\n".join(image_context_lines).strip()

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

        clean_user_text = strip_mode_and_preset_lines(normalize_simo_intent_text(user_message)).strip() or normalize_simo_intent_text(user_message)
        lower_clean = clean_user_text.lower()
        hard_3d_request = is_hard_3d_request(clean_user_text)

        explicit_builder_request = is_builder_request(clean_user_text)
        followup_builder_request = is_builder_followup_request(clean_user_text)
        builder_request = explicit_builder_request or followup_builder_request

        if hard_3d_request:
            builder_request = False

        # --- BLOCK builder for design studio / 3D cases ---
        if hard_3d_request:
            builder_request = False
        elif any(term in lower_clean for term in [
            "house", "home", "floor plan", "blueprint", "layout",
            "bedroom", "bathroom", "kitchen", "garage"
        ]) and not any(term in lower_clean for term in [
            "website", "site", "page", "landing"
        ]):
            builder_request = False

        builder_kind = builder_request_kind(clean_user_text) if builder_request else ""
        route = classify_request(clean_user_text)
        website_terms = [
            "website", "site", "landing page", "homepage", "web page",
            "build me a site", "build a site", "build a website",
            "real estate page", "listing page", "property page",
            "showcase page", "promo page"
        ]

        direct_3d_terms = [
            "3d", "3-d", "model", "glb", "gltf", "viewer", "rotate",
            "show me in 3d", "walkthrough", "render", "3d model",
            "3d view", "visualize in 3d"
        ]

        design_studio_terms = [
            "house", "home", "floor plan", "blueprint", "architecture",
            "architectural", "interior", "exterior", "room layout",
            "bedroom", "bathroom", "kitchen", "garage", "balcony",
            "stairs", "warehouse", "office building", "building concept",
            "product concept", "prototype", "vehicle concept", "scene design",
            "storyboard", "set design"
        ]

        has_website_signal = any(term in lower_clean for term in website_terms)
        has_3d_signal = any(term in lower_clean for term in direct_3d_terms)
        has_design_signal = any(term in lower_clean for term in design_studio_terms)
        visual_first_request = is_visual_first_creation_request(clean_user_text) and not has_website_signal

        if hard_3d_request:
            builder_request = False
            builder_kind = ""

        if visual_first_request and not hard_3d_request:
            # PHASE 6.1:
            # Visual-first means: do not return model3d payload that can trigger the 3D viewer.
            # Give the user a useful ChatGPT/Grok-style concept first, then let them choose 3D later.
            route = empty_model_route()
            builder_request = False
            builder_kind = ""

        house_route = "general"
        if visual_first_request and not hard_3d_request:
            house_route = "design_studio"
        elif hard_3d_request:
            house_route = "3d"
        elif has_website_signal:
            house_route = "builder"
        elif has_design_signal:
            house_route = "design_studio"

        design_studio_request = house_route == "design_studio"

        if house_route == "3d":
            builder_request = False
            builder_kind = ""
        elif house_route == "design_studio":
            builder_request = False
            builder_kind = ""
        elif house_route == "builder":
            builder_request = True
            builder_kind = builder_request_kind(user_message) or "build"

        history = session.get("chat_history", [])
        if not isinstance(history, list):
            history = []

        compact_user = compact_history_content("user", effective_message)
        if compact_user:
            history.append({"role": "user", "content": compact_user})
        history = history[-8:]
        session["chat_history"] = history

        assistant_text = ""
        client = get_client()


        generated_visual_url = ""
        generated_visual_error = ""
        generated_visual_prompt = ""
        generated_visual_payload = {}

        if hard_3d_request or house_route == "3d":
            assistant_text = build_3d_chat_reply(route, clean_user_text)

        elif design_studio_request:
            if visual_first_request:
                generated = generate_visual_image(clean_user_text, client)
                generated_visual_prompt = generated.get("prompt", "")
                if generated.get("ok") and generated.get("url"):
                    generated_visual_url = generated.get("url", "")
                    generated_visual_payload = build_generated_visual_payload(
                        clean_user_text,
                        generated_visual_url,
                        generated_visual_prompt,
                    )
                    assistant_text = build_visual_generated_reply(clean_user_text, generated_visual_url)
                else:
                    generated_visual_error = generated.get("error", "")
                    assistant_text = build_visual_generation_failed_reply(clean_user_text, generated_visual_error)
            else:
                assistant_text = (
                    "TITLE: Design Concept\n\n"
                    "CONCEPT: I can help shape this into a clear design concept.\n\n"
                    "LAYOUT: Tell me the main size, style, rooms, features, or purpose.\n\n"
                    "FEATURES: I can organize the idea into practical next steps.\n\n"
                    "STYLE: I can refine the look, materials, colors, and direction.\n\n"
                    "ENHANCEMENTS: We can keep improving it step by step."
                )

        elif builder_request:
            has_image = bool(data.get("has_image"))
            image_url = str(data.get("image_url", "") or "").strip()

            enhanced_prompt = user_message

            if has_image and image_url:
                image_analysis = ""

                image_path = session.get("last_uploaded_image")
                if image_path and os.path.isfile(image_path) and client:
                    try:
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

                        vision_prompt = """
Analyze this image for website-building purposes.

Return a concise visual breakdown covering:
- what the image depicts
- likely subject/category
- visual style and mood
- dominant colors
- layout/composition
- any branding, product, environment, or industry clues
- what kind of landing page or website this image would best inspire

Keep it practical and builder-friendly.
""".strip()

                        resp = client.responses.create(
                            model=OPENAI_MODEL,
                            input=[
                                {
                                    "role": "user",
                                    "content": [
                                        {"type": "input_text", "text": vision_prompt},
                                        {
                                            "type": "input_image",
                                            "image_url": f"data:{mime};base64,{b64}",
                                        },
                                    ],
                                }
                            ],
                        )
                        image_analysis = extract_first_text_from_openai_response(resp).strip()
                    except Exception:
                        image_analysis = ""

                if image_analysis:
                    enhanced_prompt = f"""
[VISUAL_ANALYSIS]
{image_analysis}

[IMAGE_URL]
{image_url}

[BUILDER_INSTRUCTION]
Use the visual analysis above as real design context for the build.
Match the subject matter, mood, structure, and palette from the image.
Prioritize the image’s visual identity over generic design patterns.
Avoid default templates if the image suggests a specific style.
Do not default to an unrelated generic business type.

[USER_REQUEST]
{user_message}
""".strip()
                else:
                    enhanced_prompt = f"""
[IMAGE_CONTEXT]
User uploaded an image: {image_url}

Treat the uploaded image as important visual context for this build.
Do not default to an unrelated generic business type.

[USER_REQUEST]
{user_message}
""".strip()

            assistant_text = generate_builder_html(
                enhanced_prompt,
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
            session["builder_current_html"] = assistant_text

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
        session["chat_history"] = history[-8:]

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
                "image_attached": has_image,
                "image_filename": image_filename or None,
                "image_url": image_url or None,
                "generated_visual_url": generated_visual_url or None,
                "generated_visual_error": generated_visual_error or None,
                "generated_visual_prompt": generated_visual_prompt or None,
                "generated_visual": generated_visual_payload or None,
                "visuals": [generated_visual_payload] if generated_visual_payload else [],
                "reply_format": "visual" if generated_visual_payload else "text",
            }
        )

    except Exception as e:
        return jsonify({"ok": False, "error": f"Chat failed: {str(e)}"}), 500





# =========================================================
# PHASE 7 OPTION A — Real online 3D asset layer
# =========================================================
REAL_3D_ASSETS = [
    {
        "id": "luxury_home_reference",
        "title": "Luxury Home 3D Reference",
        "category": "architecture",
        "keywords": ["home", "house", "villa", "mansion", "estate", "garage", "pool", "architecture", "luxury"],
        "model_url": "https://modelviewer.dev/shared-assets/models/House.glb",
        "fallback_model_url": "",
        "url": "https://modelviewer.dev/shared-assets/models/House.glb",
        "source_label": "Simo procedural house workspace preferred; GLB backup",
        "note": "Use as the live rotate/zoom design reference. The visual render remains the style source of truth.",
    },
    {
        "id": "interior_reference",
        "title": "Interior / Room 3D Reference",
        "category": "interior",
        "keywords": ["interior", "room", "kitchen", "living", "bedroom", "bathroom", "floor plan"],
        "model_url": "https://modelviewer.dev/shared-assets/models/Chair.glb",
        "url": "https://modelviewer.dev/shared-assets/models/Chair.glb",
        "fallback_model_url": "https://modelviewer.dev/shared-assets/models/Astronaut.glb",
        "source_label": "real online GLB reference",
        "note": "Use as an interior reference layer while Simo generates matching visual passes.",
    },
    {
        "id": "vehicle_reference",
        "title": "Vehicle 3D Reference",
        "category": "vehicle",
        "keywords": ["car", "truck", "vehicle", "supercar", "concept car", "motorcycle"],
        "model_url": "",
        "url": "",
        "fallback_model_url": "",
        "source_label": "connected workspace only",
        "note": "No unrelated astronaut/robot fallback. Use the connected visual workspace until an exact vehicle GLB is attached.",
    },
    {
        "id": "instrument_reference",
        "title": "Instrument 3D Reference",
        "category": "instrument",
        "keywords": ["guitar", "electric guitar", "bass", "instrument", "pickups", "strings", "fretboard", "headstock"],
        "model_url": "",
        "url": "",
        "fallback_model_url": "",
        "source_label": "connected workspace only",
        "note": "No unrelated robot fallback. Use the connected visual workspace until an exact instrument GLB is attached.",
    },
    {
        "id": "industrial_reference",
        "title": "Industrial Product 3D Reference",
        "category": "industrial",
        "keywords": ["light fixture", "parking lot light", "street light", "fixture", "lamp", "pole light", "industrial", "floodlight"],
        "model_url": "",
        "url": "",
        "fallback_model_url": "",
        "source_label": "connected workspace only",
        "note": "No unrelated robot fallback. Use the connected visual workspace until an exact industrial/product GLB is attached.",
    },
    {
        "id": "product_reference",
        "title": "Product 3D Reference",
        "category": "product",
        "keywords": ["product", "mockup", "object", "device", "lamp", "fixture", "furniture"],
        "model_url": "",
        "url": "",
        "fallback_model_url": "",
        "source_label": "connected workspace only",
        "note": "No unrelated robot fallback. Use the connected visual workspace until an exact product GLB is attached.",
    },
]


def choose_real_3d_asset(user_text: str, active=None) -> dict:
    active = active if isinstance(active, dict) else {}
    active_category = str(active.get("category") or active.get("domain") or active.get("projectType") or "").strip().lower()
    text = f"{user_text or ''} {json.dumps(active or {}, default=str)}".lower()

    best = None
    best_score = -1
    for asset in REAL_3D_ASSETS:
        score = sum(1 for k in asset.get("keywords", []) if k in text)
        if active_category and str(asset.get("category") or "").lower() == active_category:
            score += 5
        if score > best_score:
            best = asset
            best_score = score

    if not best or best_score <= 0:
        best = next((a for a in REAL_3D_ASSETS if str(a.get("category") or "").lower() == active_category), None) or REAL_3D_ASSETS[-1]

    out = dict(best)
    model_url = out.get("model_url") or out.get("url") or ""
    fallback_url = out.get("fallback_model_url") or ""

    # PHASE 10.5F: never substitute robot/astronaut/person/horse placeholders for
    # unrelated design domains like guitar, light fixture, vehicle, or generic product.
    # If no exact model is available, the frontend opens a connected visual workspace.
    active_or_asset_category = str(out.get("category") or active_category or "").lower()
    wrong_placeholder = any(word in (model_url or "").lower() for word in ["robotexpressive", "astronaut", "neilarmstrong", "horse", "damagedhelmet"])
    if active_or_asset_category in {"instrument", "industrial", "product", "vehicle", "marine", "wearable", "furniture"} and wrong_placeholder:
        model_url = ""
        fallback_url = ""

    out["url"] = model_url
    out["model_url"] = model_url
    out["fallback_model_url"] = fallback_url if model_url else ""
    out["ok"] = bool(model_url)
    out["available"] = bool(model_url)
    out["editable"] = True
    out["viewer"] = "model-viewer" if model_url else "connected-workspace"
    out["phase"] = "PHASE 10.5F — no wrong 3D fallback"
    return out


@app.route("/api/real-3d-assets", methods=["POST"])
def api_real_3d_assets():
    data = request.get_json(silent=True) or {}
    prompt = str(data.get("prompt") or data.get("message") or "").strip()
    active = data.get("active_visual_project") or {}
    if not isinstance(active, dict):
        active = {}
    asset = choose_real_3d_asset(prompt, active)
    return jsonify({
        "ok": True,
        "asset": asset,
        "assets": [choose_real_3d_asset(prompt, active)],
        "phase": "PHASE 10.5F — exact-or-connected 3D layer",
    })



def build_show_first_svg(prompt: str, title: str = "Simo visual concept") -> str:
    """Offline-safe visual fallback used only when image generation does not return a URL.
    It intentionally stays domain-neutral and does not force house/architecture context.
    """
    safe_title = str(title or "Simo visual concept")[:90]
    safe_prompt = str(prompt or "visual design concept")[:180]

    def esc(value: str) -> str:
        return (str(value or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#039;"))

    return f"""<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1400\" height=\"900\" viewBox=\"0 0 1400 900\">
  <defs>
    <linearGradient id=\"bg\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\">
      <stop offset=\"0\" stop-color=\"#07111f\"/>
      <stop offset=\"0.45\" stop-color=\"#111827\"/>
      <stop offset=\"1\" stop-color=\"#050713\"/>
    </linearGradient>
    <radialGradient id=\"glow\" cx=\"50%\" cy=\"42%\" r=\"60%\">
      <stop offset=\"0\" stop-color=\"#6ea8ff\" stop-opacity=\"0.26\"/>
      <stop offset=\"0.55\" stop-color=\"#b982ff\" stop-opacity=\"0.12\"/>
      <stop offset=\"1\" stop-color=\"#000\" stop-opacity=\"0\"/>
    </radialGradient>
  </defs>
  <rect width=\"1400\" height=\"900\" fill=\"url(#bg)\"/>
  <rect width=\"1400\" height=\"900\" fill=\"url(#glow)\"/>
  <rect x=\"120\" y=\"110\" width=\"1160\" height=\"680\" rx=\"42\" fill=\"#111827\" fill-opacity=\"0.82\" stroke=\"#ffffff\" stroke-opacity=\"0.16\"/>
  <text x=\"170\" y=\"190\" fill=\"#9fb4dd\" font-family=\"Arial, sans-serif\" font-size=\"22\" font-weight=\"800\" letter-spacing=\"4\">SIMO VISUAL FALLBACK</text>
  <text x=\"170\" y=\"260\" fill=\"#eef4ff\" font-family=\"Arial, sans-serif\" font-size=\"50\" font-weight=\"900\">{esc(safe_title)}</text>
  <text x=\"170\" y=\"330\" fill=\"#c7d3ea\" font-family=\"Arial, sans-serif\" font-size=\"24\">Image generation did not return a URL, but the design domain stayed connected.</text>
  <rect x=\"170\" y=\"395\" width=\"1060\" height=\"150\" rx=\"24\" fill=\"#050b14\" fill-opacity=\"0.72\" stroke=\"#ffffff\" stroke-opacity=\"0.12\"/>
  <text x=\"205\" y=\"455\" fill=\"#eaf1ff\" font-family=\"Arial, sans-serif\" font-size=\"26\" font-weight=\"700\">Prompt:</text>
  <text x=\"205\" y=\"505\" fill=\"#c7d3ea\" font-family=\"Arial, sans-serif\" font-size=\"22\">{esc(safe_prompt)}</text>
  <text x=\"170\" y=\"690\" fill=\"#9fb4dd\" font-family=\"Arial, sans-serif\" font-size=\"22\">Try Generate realistic render again when the image service is ready.</text>
</svg>"""

@app.route("/api/generate-visual-diagnostics", methods=["GET"])
def api_generate_visual_diagnostics():
    return jsonify({
        "ok": True,
        "phase": "PHASE 11.3 - Image Timeout + Diagnostics",
        "openai_api_key_present": bool(OPENAI_API_KEY),
        "openai_model": OPENAI_MODEL,
        "openai_image_model": OPENAI_IMAGE_MODEL,
        "openai_image_size": OPENAI_IMAGE_SIZE,
        "openai_timeout_seconds": OPENAI_TIMEOUT_SECONDS,
        "generated_image_dir": GENERATED_IMAGE_DIR,
        "generated_image_dir_exists": os.path.isdir(GENERATED_IMAGE_DIR),
    })



def simo14l_is_vague_followup(text: str) -> bool:
    t = simo14f_norm(text)
    if not t:
        return False
    return bool(re.search(
        r"\b(make it|change it|refine|continue|edit|add|remove|turn it|more|less|variation|variations|render|matte|gloss|black|blue|gold|red|white|chrome|finish|color|material|lighting|accent|accents|futuristic|modern|luxury|premium)\b",
        t,
        flags=re.IGNORECASE,
    ))


def simo14l_subject_from_active(active: dict) -> str:
    if not isinstance(active, dict):
        return ""
    active_state = active.get("designState") if isinstance(active.get("designState"), dict) else {}
    for key in (
        "lockedSubject", "exactSubject", "requestedAsset", "item", "title",
        "prompt", "sourcePrompt",
    ):
        val = active.get(key)
        if val:
            cleaned = strip_visual_meta_instructions(str(val))
            if cleaned:
                return cleaned
    for key in ("lockedSubject", "exactSubject", "item", "title"):
        val = active_state.get(key)
        if val:
            cleaned = strip_visual_meta_instructions(str(val))
            if cleaned:
                return cleaned
    return ""


def simo14l_generic_followup_lock(user_prompt: str, original_prompt: str, active: dict, domain: str) -> dict:
    """Universal subject lock for vague follow-up edits.

    If the user says "make it matte black" after creating a flashlight, the
    backend must not invent a new product such as a drill. It must preserve the
    active subject and only apply the user's style/material/action request.
    """
    request_text = normalize_whitespace(f"{original_prompt or ''} {user_prompt or ''}")
    if not simo14l_is_vague_followup(request_text):
        return {"enabled": False}

    subject = simo14l_subject_from_active(active)
    if not subject:
        return {"enabled": False}

    active_text = simo14f_active_text(active)
    active_domain = str(
        active.get("domain")
        or active.get("projectType")
        or active.get("category")
        or ""
    ).strip().lower()

    locked_domain = (domain or active_domain or "object").strip().lower()
    if locked_domain in {"", "object"} and active_domain:
        locked_domain = active_domain

    return {
        "enabled": True,
        "domain": locked_domain or "object",
        "subject": subject,
        "request": strip_visual_meta_instructions(original_prompt or user_prompt),
        "active_text": active_text,
        "source": "active_project_universal_followup",
    }


def simo14l_subject_locked_prompt(domain: str, subject: str, user_edit: str, controls_hint: str = "") -> str:
    clean_subject = strip_visual_meta_instructions(subject) or "the current active design concept"
    clean_edit = strip_visual_meta_instructions(user_edit) or "refine the current active design"
    d = (domain or "object").strip().lower()
    subject_low = clean_subject.lower()

    # Avoid listing every possible product. This is a universal rule:
    # keep the active object, change only requested visual attributes.
    extra_exclusions = ""
    if d in {"product", "object", "industrial", "furniture", "wearable"}:
        extra_exclusions = (
            "Do not change the object family. Do not transform it into a different tool, appliance, router, drill, box, cube, car, house, or unrelated product. "
            "If the active subject is a flashlight, it must stay a flashlight. If it is a rim, it must stay a rim. If it is a bottle, chair, cabinet, helmet, lamp, or other object, it must stay that exact object type. "
        )
    elif d == "instrument":
        extra_exclusions = "Do not change the instrument family. Keep the same guitar/instrument object, not a car, house, or random product. "
    elif d == "home":
        extra_exclusions = "Keep the same architecture/home project. Do not change it into a product, vehicle, or unrelated scene. "
    elif d == "editorial":
        extra_exclusions = "Keep the same book-cover/editorial project. Do not change into a product render, house, or unrelated scene. "

    return (
        f"PHASE 14L UNIVERSAL FOLLOW-UP SUBJECT LOCK.\n"
        f"Active locked subject/object: {clean_subject}.\n"
        f"Domain: {d}.\n"
        f"User follow-up edit/request: {clean_edit}.\n\n"
        "Task: create one new realistic visual that preserves the exact same active subject/object type and applies only the user's requested changes. "
        "This is a continuation/edit of the active project, not a fresh subject selection. "
        f"{extra_exclusions}"
        "Preserve the recognizable silhouette, structure, purpose, and object identity of the active subject. "
        "Only update the requested style, color, material, finish, lighting, feature, size, or design detail. "
        "Use a clean premium studio/design presentation. "
        "No labels, no UI, no watermark, no text, no placeholder geometry. "
        f"{controls_hint}"
    )


@app.route("/api/generate-visual", methods=["POST"])
def api_generate_visual():
    try:
        data = request.get_json(silent=True) or {}
        user_prompt = str(data.get("prompt") or data.get("message") or "").strip()
        original_prompt = str(data.get("original_prompt") or "").strip()
        active_creative_context = str(data.get("active_creative_context") or data.get("writing_context") or "").strip()
        action = str(data.get("action") or "base").strip().lower()
        requested_domain = str(data.get("domain") or data.get("strict_domain") or "").strip().lower()
        followup_edit_lock = False  # PHASE 14K: disable unreliable active-image-edit branch
        request_active_image_url = str(data.get("active_image_url") or "").strip()

        active = data.get("active_visual_project") or {}
        if not isinstance(active, dict):
            active = {}

        active_state = active.get("designState") if isinstance(active.get("designState"), dict) else {}
        active_domain = str(
            active.get("domain")
            or active.get("projectType")
            or active_state.get("domain")
            or ""
        ).strip().lower()
        active_image_url = str(
            request_active_image_url
            or active.get("imageUrl")
            or active.get("generated_visual_url")
            or active.get("url")
            or active_state.get("imageUrl")
            or ""
        ).strip()
        active_image_path = local_generated_image_path_from_url(active_image_url)

        clean_original_prompt = strip_visual_meta_instructions(original_prompt)
        clean_user_prompt = strip_visual_meta_instructions(user_prompt)
        clean_creative_context = compact_creative_context(active_creative_context, limit=700)
        exact_lock = simo14f_lock_from_request(clean_user_prompt, clean_original_prompt, active)

        prompt_domain = visual_prompt_domain_from_text(clean_original_prompt or clean_user_prompt, "")

        if requested_domain:
            domain = visual_prompt_domain_from_text(clean_original_prompt or clean_user_prompt, requested_domain)
        elif prompt_domain and prompt_domain != "object":
            domain = prompt_domain
        elif active_domain:
            domain = active_domain
        else:
            domain = prompt_domain or "object"

        # PHASE 14F: exact object lock beats broad requested domains.
        if exact_lock.get("domain"):
            domain = exact_lock.get("domain")
            requested_domain = domain

        universal_followup_lock = simo14l_generic_followup_lock(clean_user_prompt, clean_original_prompt, active, domain)
        if not exact_lock.get("kind") and universal_followup_lock.get("enabled"):
            domain = universal_followup_lock.get("domain") or domain
            requested_domain = domain

        if not clean_user_prompt:
            fallback_prompt = str(
                active.get("prompt")
                or active.get("sourcePrompt")
                or active.get("title")
                or "premium visual design"
            ).strip()
            clean_user_prompt = strip_visual_meta_instructions(fallback_prompt)

        if not clean_user_prompt:
            return jsonify({"ok": False, "error": "Prompt is required."}), 400

        credit_ok, credit_status, credit_response = simo_check_image_credit_available("generate_visual")
        if not credit_ok:
            return credit_response

        active_title = strip_visual_meta_instructions(str(active.get("title") or active.get("alt") or "").strip())
        base_description = clean_user_prompt
        if exact_lock.get("kind") == "rim":
            base_description = f"Exact locked subject: {exact_lock.get('subject')}. User edit/request: {clean_original_prompt or clean_user_prompt}."
        elif universal_followup_lock.get("enabled"):
            base_description = (
                f"Exact locked active subject/object: {universal_followup_lock.get('subject')}. "
                f"User edit/request: {universal_followup_lock.get('request') or clean_original_prompt or clean_user_prompt}. "
                "This is a follow-up edit. Preserve the same object type and only apply the requested changes."
            )
        elif active_title and action != "base":
            base_description = f"{base_description}. Continue from active design titled '{active_title}'."

        vehicle_edit_map = {
            "widebody": "Add a widebody kit with flared fenders, aggressive aero, splitter, and rear diffuser.",
            "carbon": "Add visible carbon fiber trim, carbon splitter, carbon side skirts, and premium performance details.",
            "stance": "Lower the stance, upgrade the wheels, sharpen the performance proportions, and keep it realistic.",
            "blackgold": "Change the finish to matte black with subtle gold accents, gold brake calipers, and premium contrast details.",
            "futuristic": "Make the vehicle more futuristic with sharper surfacing, slim LED lighting, aerodynamic sculpting, and electric hypercar energy.",
            "refine": "Refine this into a more realistic premium automotive studio render.",
            "base": "Create the strongest realistic vehicle concept result for this design request.",
            "render": "Create the strongest realistic vehicle concept result for this design request.",
        }

        home_edit_map = {
            "garage": "Add a clearly visible attached 3-car garage that matches the architecture. Keep it high-end, realistic, and proportional.",
            "add-garage": "Add a clearly visible attached 3-car garage that matches the architecture. Keep it high-end, realistic, and proportional.",
            "pool": "Add a luxury infinity pool, terrace, premium landscaping, and resort-style exterior lighting.",
            "futuristic": "Make the design more futuristic with sleek glass, cantilevered forms, soft architectural lighting, and premium materials.",
            "interior": "Show a luxury interior/exterior design direction with open floor plan clues, warm lighting, glass walls, and refined materials.",
            "materials": "Refine the materials with glass, stone, concrete, warm wood accents, premium lighting, and realistic architectural depth.",
            "variation": "Create a stronger design variation while preserving the original luxury modern direction.",
            "refine": "Refine this into a more realistic, premium architecture-studio quality render.",
            "base": "Create the strongest realistic visual result for this design request.",
            "render": "Create the strongest realistic visual result for this design request.",
        }

        instrument_edit_map = {
            "body": "Change the instrument body shape and silhouette while keeping it realistic and playable.",
            "neck": "Refine the neck, fretboard, inlays, headstock, scale feel, and tuning-machine design.",
            "pickups": "Change pickup layout, pickup styling, pickup rings, and electronics plate design.",
            "hardware": "Upgrade bridge, tuners, knobs, switchgear, tremolo system, and metal hardware.",
            "materials": "Upgrade materials and finish with premium woods, carbon fiber, metal, transparent resin, gloss/matte paint, or custom textures.",
            "graphics": "Change colors, paint graphics, inlays, carved details, and visual theme.",
            "strings": "Refine string setup, gauge impression, tuning system, and performance hardware.",
            "accessories": "Add matching case, stand, strap, cable, pedal, or amplifier accessory direction.",
            "futuristic": "Make the instrument more futuristic, sculptural, aggressive, and high-end while preserving the user’s concept.",
            "refine": "Refine this into a more realistic premium instrument product render.",
            "base": "Create the strongest realistic instrument/product concept result for this design request.",
            "render": "Create the strongest realistic instrument/product concept result for this design request.",
        }

        generic_edit_map = {
            "futuristic": "Make the design more futuristic, premium, and visually refined.",
            "materials": "Refine the materials, color palette, lighting, and presentation quality.",
            "variation": "Create a stronger design variation while preserving the core idea.",
            "refine": "Refine this into a more realistic, premium, production-ready visual render.",
            "base": "Create the strongest realistic visual result for this design request.",
            "render": "Create the strongest realistic visual result for this design request.",
        }

        if exact_lock.get("kind") == "rim":
            action_direction = generic_edit_map.get(action, generic_edit_map.get("refine"))
            visual_prompt = simo14f_rim_prompt(clean_original_prompt or clean_user_prompt, exact_lock.get("source"))
            if action_direction:
                visual_prompt = f"{visual_prompt}\nDesign action: {action_direction}"

        elif domain == "instrument":
            action_direction = instrument_edit_map.get(action, instrument_edit_map.get("refine"))
            visual_prompt = (
                "STRICT DOMAIN: INSTRUMENT_PRODUCT_DESIGN_ONLY.\n"
                f"{base_description}\n\n"
                f"Design action: {action_direction}\n\n"
                "Create one polished realistic musical instrument concept render. "
                "The instrument must be the only main subject in a clean studio/product turntable scene. "
                "If the request is for a guitar, make the guitar body, neck, headstock, pickups, bridge, knobs, strings, finish, color graphics, materials, and electronics clearly designable. "
                "Hard exclusion: no house, no home, no room as the main scene, no car, no driveway, no building, no architecture, no crowd, no stage unless requested. "
                "No labels, no text, no watermark, no UI, no diagram, no low-poly placeholder."
            )

        elif domain == "vehicle":
            action_direction = vehicle_edit_map.get(action, vehicle_edit_map.get("refine"))
            visual_prompt = (
                "STRICT DOMAIN: VEHICLE_CONCEPT_ONLY.\n"
                f"{base_description}\n\n"
                f"Design action: {action_direction}\n\n"
                "Create one polished realistic sports car / supercar concept render. "
                "The car must be the only main subject in a clean automotive studio, seamless neutral background, dark showroom, turntable setup, or empty test track. "
                "Hard exclusion: no house, no home, no villa, no mansion, no building, no garage, no driveway, no residential street, no architecture, no landscaping as the main scene. "
                "No labels, no text, no watermark, no UI, no diagram, no low-poly placeholder."
            )

        elif domain == "home":
            action_direction = home_edit_map.get(action, home_edit_map.get("refine"))
            visual_prompt = (
                "STRICT DOMAIN: ARCHITECTURE_HOME_DESIGN.\n"
                f"{base_description}\n\n"
                f"Design action: {action_direction}\n\n"
                "Create one polished realistic architectural visualization. "
                "Make it feel like a premium render the user can react to and continue editing. "
                "No labels, no text, no watermark."
            )

        elif domain == "editorial":
            action_direction = generic_edit_map.get(action, generic_edit_map.get("refine"))
            editorial_request = clean_original_prompt or clean_user_prompt or base_description
            active_title_for_cover = strip_visual_meta_instructions(str(active.get("storyTitle") or active.get("title") or active.get("alt") or active.get("concept") or "").strip())
            active_author_for_cover = clean_book_cover_person_name(str(active.get("authorName") or active.get("author_name") or "").strip())
            prior_cover_notes = active.get("editHistory") or active.get("acceptedEdits") or []
            editorial_display_title = book_cover_display_title(editorial_request, clean_creative_context)
            editorial_author_name = derive_book_cover_author_name(editorial_request, clean_creative_context, active_author_for_cover)

            if action not in {"base", "render"}:
                visual_prompt = active_book_cover_edit_prompt(
                    editorial_request,
                    creative_context=clean_creative_context,
                    active_title_hint=active_title_for_cover,
                    active_author_hint=editorial_author_name or active_author_for_cover,
                    prior_edit_notes=prior_cover_notes,
                )
            else:
                visual_prompt = make_book_cover_image_prompt(editorial_request, creative_context=clean_creative_context)
                if action_direction:
                    visual_prompt = f"{visual_prompt} Refinement direction: {action_direction}"

        else:
            action_direction = generic_edit_map.get(action, generic_edit_map.get("refine"))
            if universal_followup_lock.get("enabled"):
                visual_prompt = simo14l_subject_locked_prompt(
                    domain,
                    universal_followup_lock.get("subject") or base_description,
                    universal_followup_lock.get("request") or clean_original_prompt or clean_user_prompt,
                    controls_hint=f"Design action: {action_direction}.",
                )
            else:
                visual_prompt = (
                    f"STRICT DOMAIN: {domain.upper()}_DESIGN_ONLY.\n"
                    f"{base_description}\n\n"
                    f"Design action: {action_direction}\n\n"
                    "Create one polished realistic visual result that matches this domain only. "
                    "Use a clean scene appropriate to the subject. "
                    "Do not reuse house/home/architecture context unless the domain is home. "
                    "No labels, no text, no watermark."
                )

        client = get_client()
        use_active_image_edit = False  # PHASE 14K: generate-only recovery; no active image edit
        edit_attempt = None
        if use_active_image_edit:
            print(f"[SIMO IMAGE EDIT] requested follow-up edit lock action={action} subject={exact_lock.get('subject') or active.get('exactSubject') or ''} url={active_image_url}", flush=True)
            edit_attempt = generate_visual_image_edit(visual_prompt, active_image_url, client, domain, prebuilt_prompt=True)
        generated = edit_attempt if edit_attempt and edit_attempt.get("ok") else generate_visual_image(visual_prompt, client, domain, prebuilt_prompt=True)

        request_for_title = clean_original_prompt or clean_user_prompt
        request_for_3d = request_for_title or base_description
        display_title = (
            editorial_display_title
            if domain == "editorial" and "editorial_display_title" in locals()
            else visual_alt_from_prompt(request_for_title, domain)
        )

        if generated.get("ok") and generated.get("url"):
            credit_receipt = simo_consume_image_credit("generate_visual")
            payload = build_generated_visual_payload(visual_prompt, generated.get("url"), generated.get("prompt", ""))
            payload["title"] = display_title
            payload["display_title"] = display_title
            payload["alt"] = payload["title"]

            project_state = {
                "domain": domain,
                "exact_object_lock": exact_lock,
                "locked_subject": exact_lock.get("subject") or "",
                "story_title": active_title_for_cover if domain == "editorial" and active_title_for_cover else (derive_book_cover_title(request_for_title, clean_creative_context) if domain == "editorial" else ""),
                "author_name": editorial_author_name if domain == "editorial" else "",
                "last_action": action,
                "updated_at": utcnow().isoformat() + "Z",
            }

            return jsonify({
                "ok": True,
                "image_url": generated.get("url"),
                "generated_visual_url": generated.get("url"),
                "generated_visual": payload,
                "visuals": [payload],
                "reply": build_visual_generated_reply(request_for_title, generated.get("url")),
                "prompt": generated.get("prompt", ""),
                "title": display_title,
                "display_title": display_title,
                "domain": domain,
                "action": action,
                "project_state": project_state,
                "real3d": choose_real_3d_asset(request_for_3d, active),
                "model3d": choose_real_3d_asset(request_for_3d, active),
                "phase": "PHASE 14L — Universal Follow-Up Subject Lock",
                "debug_image_mode": generated.get("mode", "generate"),
                "debug_active_image_url": active_image_url,
                "debug_active_image_found": bool(active_image_path),
                "debug_edit_requested": use_active_image_edit,
                "debug_prompt": generated.get("prompt", ""),
                "debug_exact_lock": exact_lock,
                "debug_universal_followup_lock": universal_followup_lock,
                "image_credits": credit_receipt,
            })

        error_text = generated.get("error") or "Real image generation did not return an image."
        return jsonify({
            "ok": False,
            "error": f"Real image generation failed: {error_text}",
            "image_url": "",
            "generated_visual_url": "",
            "generated_visual": None,
            "visuals": [],
            "reply": "Real image required. Simo blocked the SVG/demo fallback so we can fix the live image route instead of pretending this is a real render.",
            "prompt": generated.get("prompt", ""),
            "domain": domain,
            "action": action,
            "real3d": choose_real_3d_asset(request_for_3d, active),
            "model3d": choose_real_3d_asset(request_for_3d, active),
            "phase": "PHASE 14L — Universal Follow-Up Subject Lock / No SVG Fallback",
            "debug_image_mode": generated.get("mode", "generate"),
            "debug_active_image_url": active_image_url,
            "debug_active_image_found": bool(active_image_path),
            "debug_edit_requested": use_active_image_edit,
            "debug_prompt": generated.get("prompt", ""),
            "debug_exact_lock": exact_lock,
                "debug_universal_followup_lock": universal_followup_lock,
        }), 502

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500




# ---------------------------------------------------------
# Workspace image edit route
# PHASE 14M-R10.16 — real workspace image editing connection
# ---------------------------------------------------------
def simo_workspace_clean_text(value: str) -> str:
    return normalize_whitespace(str(value or ""))


def simo_workspace_data_url_to_file(image_value: str) -> str:
    raw = str(image_value or "").strip()
    if not raw:
        return ""

    # data:image/png;base64,...
    if raw.startswith("data:image/") and ";base64," in raw:
        header, payload = raw.split(";base64,", 1)
        mime = header.replace("data:", "").strip().lower()
        ext = "png"
        if "jpeg" in mime or "jpg" in mime:
            ext = "jpg"
        elif "webp" in mime:
            ext = "webp"

        try:
            decoded = base64.b64decode(payload)
        except Exception:
            return ""

        filename = f"simo_workspace_base_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.{ext}"
        saved_name = save_generated_image_bytes(filename, decoded)
        return find_generated_image_path(saved_name)

    # Relative/generated URLs already saved by Simo.
    path = local_generated_image_path_from_url(raw)
    if path and os.path.isfile(path):
        return path

    # Absolute local URLs can still resolve by filename.
    if "/generated-images/" in raw or "/generated_images/" in raw:
        filename = raw.rsplit("/", 1)[-1].split("?", 1)[0].strip()
        path = find_generated_image_path(filename)
        if path and os.path.isfile(path):
            return path

    return ""


def simo_workspace_detect_subject(title: str, prompt: str) -> str:
    text = f"{title} {prompt}".lower()

    subject_map = [
        ("water bottle", ["water bottle", "bottle", "tumbler", "flask"]),
        ("tire rim", ["tire rim", "rim", "wheel", "alloy wheel"]),
        ("guitar", ["guitar", "bass guitar", "electric guitar"]),
        ("fire extinguisher", ["fire extinguisher", "extinguisher"]),
        ("toaster", ["toaster"]),
        ("soap dispenser", ["soap dispenser", "dispenser"]),
        ("book cover", ["book cover", "cover design"]),
        ("product", ["product", "item", "object"]),
    ]

    for label, words in subject_map:
        if any(w in text for w in words):
            return label

    cleaned_title = simo_workspace_clean_text(title)
    if cleaned_title:
        cleaned_title = re.sub(r"(?i)^edit only this exact saved product:\s*", "", cleaned_title).strip(" .")
        if cleaned_title:
            return cleaned_title[:80]

    return "the exact product/object shown in the provided image"


def simo_workspace_detect_intent(prompt: str, action: str = "") -> str:
    text = f"{prompt} {action}".lower()

    # PHASE 14M-R10.23:
    # Detect local feature edits before broad words like black/steel/finish/material
    # so button prompts stay feature-locked and visibly relevant.
    if any(k in text for k in ["toaster controls", "browning dial", "dial", "lever", "control knob", "knob", "button cluster", "buttons", "indicator"]):
        return "controls"
    if any(k in text for k in ["toaster feet", "feet/base", "feet", "base trim", "lower trim", "anti-slip", "nonslip", "non-slip"]):
        return "feet_base"
    if any(k in text for k in ["toaster slots", "bread slots", "slot trim", "wide slots", "wider slots"]):
        return "slots"
    if any(k in text for k in ["crumb tray", "heat vents", "vent", "seam", "trim detail", "indicator mark"]):
        return "details"

    if any(k in text for k in ["packaging", "package", "box", "retail", "carton"]):
        return "packaging"
    if any(k in text for k in ["variation", "variations", "3 options", "three options", "three premium", "alternate", "different versions"]):
        return "variations"
    if any(k in text for k in ["premium finish", "luxury render", "hero render", "hero shot", "studio render"]):
        return "premium_finish"
    if any(k in text for k in ["brand", "tag", "logo", "text", "engrave", "etch", "label", "sticker", "decal", "word", "name"]):
        return "branding"
    if any(k in text for k in ["comfort", "ergonomic", "feel", "use feel", "cool-touch", "cool touch", "safe touch", "safer", "insulated"]):
        return "comfort"
    if any(k in text for k in ["functional", "feature", "add-on", "addon"]):
        return "functional"
    if any(k in text for k in ["handle", "grip"]):
        return "handle"
    if any(k in text for k in ["hardware", "cap", "lid", "hinge", "clip"]):
        return "hardware"
    if any(k in text for k in ["size", "proportion", "taller", "shorter", "wider", "slimmer", "shape"]):
        return "proportions"
    if any(k in text for k in ["material", "brushed", "steel", "metal", "chrome", "glass", "wood", "plastic", "rubber", "matte", "finish"]):
        return "material"
    if any(k in text for k in ["color", "colour", "pattern", "accent", "paint", "black", "blue", "red", "orange", "green", "white", "gold", "cream", "copper"]):
        return "color"
    if any(k in text for k in ["transform", "turn into", "make it into", "convert"]):
        return "transform"
    return "preserve_edit"


def simo_workspace_action_direction(intent: str, prompt: str, subject: str) -> str:
    user = simo_workspace_clean_text(prompt)

    defaults = {
        "material": f"Change only the visible material/finish of the {subject} into a premium brushed stainless steel or brushed metal finish. Keep the exact same silhouette, angle, cap/handle placement, lighting, background, and composition. Do not add text, logos, SIMO lettering, labels, or random branding.",
        "color": f"Change only the color or surface pattern of the {subject} using a tasteful premium accent colorway. Keep the same material behavior, shape, camera angle, background, and composition. Do not add text or random logos.",
        "proportions": f"Refine only the size/proportions of the {subject} so it feels cleaner and better balanced. Preserve identity, function, material family, camera angle, lighting, and composition.",
        "handle": f"Improve only the handle/grip design of the {subject} in a useful ergonomic way. Keep the same product identity, material family, camera angle, lighting, and composition.",
        "hardware": f"Upgrade only the small hardware/details of the {subject}, such as cap, lid, edge, seams, or fittings, without changing the main object identity, material family, camera angle, or composition.",
        "controls": f"Change only the control interface of the {subject}, such as dial, lever, button, markings, or indicator details. Make the control update clearly visible and easy to notice. Preserve the body material/color, main shape, camera angle, background, and composition.",
        "feet_base": f"Change only the feet/base/trim area of the {subject}. Make the base/foot update clearly visible and easy to notice. Preserve the main body material/color, upper object, controls, camera angle, background, and composition.",
        "slots": f"Change only the slot/opening area of the {subject}. Preserve body material/color, controls, base, camera angle, background, and composition.",
        "details": f"Change only small seam/vent/detail areas of the {subject}. Make the detail change noticeable but keep the same main body material/color, shape, camera angle, background, and composition.",
        "comfort": f"Improve the comfort/use feel cues of the {subject}, such as grip, touch points, softened edges, insulated side treatment, or ergonomic details, while preserving the same product identity and composition. Make the comfort cue visually noticeable.",
        "functional": f"Add or refine one practical functional detail on the {subject}. Keep the main product, material family, camera angle, lighting, and composition unchanged, and make the new functional detail visible.",
        "packaging": f"Show matching premium product packaging next to or behind the {subject} while keeping the original product as the main subject. The packaging should read clearly as a real retail box. Do not replace the product.",
        "variations": f"Create ONE single image showing EXACTLY THREE strong design variations of the same {subject}. Arrange the three options in a clean 3-up presentation or concept board. Keep all three clearly the same product type and in the same design family, but make each option visibly different from the others. Do not return only one refined item.",
        "branding": f"Apply only tasteful branding/label/text treatment requested by the user to the {subject}. Preserve the product material, shape, camera angle, lighting, and composition. Do not redesign the product.",
        "transform": f"Transform the current object only if the user explicitly requested a transformation. Keep the result realistic, premium, and clearly based on the user's intent.",
        "premium_finish": f"Render the same {subject} as a premium studio-quality hero product image with refined finish, crisp realism, better lighting, and a more polished presentation while preserving the same object identity and composition.",
        "preserve_edit": f"Apply only the user's requested edit to the {subject}. Preserve object identity, material, shape, camera angle, lighting, background, and composition unless the user explicitly requested a change.",
    }

    subj = str(subject or "").lower()
    if "toaster" in subj:
        defaults.update({
            "material": "Change only the toaster material/finish into a clearly visible premium appliance finish such as brushed black stainless steel, satin steel, matte ceramic, or polished chrome. Keep the same toaster identity, slots, lever, dial, feet, angle, studio background, and composition. Do not add SIMO text or random logos.",
            "color": "Change only the toaster color/accent design. Keep it recognizably the same toaster with the same slots, lever, dial, feet, camera angle, and studio background. Make the color change obvious and premium.",
            "proportions": "Refine only the toaster proportions: cleaner body, balanced slot spacing, sleeker corners, and a more premium appliance silhouette. Preserve the toaster identity, camera angle, material family, and composition.",
            "handle": "Improve only the toaster lever/handle interaction area and small grip detail. Keep the same toaster body, slots, dial, angle, and background.",
            "hardware": "Upgrade only tiny toaster hardware details, without changing the body finish: small screws, trim edge, slot rim, feet pads, or dial markings. Preserve the main toaster body color/material, lever, dial location, slots, feet placement, angle, and background.",
            "controls": "FEATURE-LOCKED EDIT: change only the toaster controls area. Make the control upgrade obvious at a glance: redesign the browning dial with a stronger premium form, clearer numbered browning ring, sharper tick marks, and a more intentional finish; refine the lever shape so it feels more premium; and if helpful add a subtle related button or indicator near the dial. Preserve the toaster body color/material, slots, top surface, feet/base, camera angle, lighting, background, and composition. Do not repaint the toaster body.",
            "feet_base": "FEATURE-LOCKED EDIT: change only the toaster feet/base area. Make the feet/base update obvious: use more premium black feet, a stronger anti-slip lower base, and cleaner darker lower trim with slightly more definition. Preserve the toaster body color/material, slots, lever, dial, top surface, camera angle, lighting, background, and composition. Do not repaint the main toaster body.",
            "slots": "FEATURE-LOCKED EDIT: change only the toaster bread-slot area. Make the slots wider, premium, cleaner, or better trimmed as requested. Preserve the toaster body color/material, lever, dial, feet/base, camera angle, lighting, background, and composition. Do not repaint the toaster body.",
            "details": "FEATURE-LOCKED EDIT: change only toaster detail areas such as crumb tray seam, heat vents, slot trim, tiny markings, indicator details, or edge seams. Make the detail updates noticeable while preserving the toaster body color/material, slots, lever, dial, feet/base, camera angle, lighting, background, and composition.",
            "comfort": "FEATURE-LOCKED EDIT: improve only comfort/safety cues on the toaster. Show visible cool-touch side treatment, subtle insulated side-panel cues, softened side-edge detail, clearer safe-touch grip areas, or a smoother lever touchpoint. Preserve the body color/material, slots, dial, lever location, feet/base, camera angle, lighting, background, and composition. Do not repaint the whole toaster.",
            "functional": "Add one practical toaster feature such as clearer browning markings, crumb tray seam, heat vents, bagel/defrost buttons, or cord wrap detail. Keep the same toaster identity and camera angle.",
            "packaging": "Show matching premium toaster retail packaging beside or behind the toaster while keeping the toaster as the main subject. Make the packaging clearly read as a real retail box. Do not replace the toaster.",
            "variations": "Create ONE single image showing EXACTLY THREE premium toaster design variations in a clean 3-up presentation or concept board. Each option must clearly remain a toaster, with visible slots, lever/dial, feet, and appliance proportions, but each option must be visibly different from the others in at least two areas such as material/color, controls, base, or slot trim. Do not return only one toaster.",
            "branding": "Apply only tasteful toaster branding or a small appliance badge if requested. Preserve toaster material, slots, lever, dial, angle, and composition. Do not redesign the toaster.",
            "preserve_edit": "Apply only the requested edit to the toaster. Preserve toaster identity, slots, lever, dial, feet, camera angle, lighting, studio background, and composition unless explicitly asked otherwise.",
        })
    elif "fire extinguisher" in subj or "extinguisher" in subj:
        defaults.update({
            "material": "Change only the fire extinguisher canister material/finish. Preserve the extinguisher body, hose/nozzle, handle, safety pin, pressure gauge, label area, camera angle, and composition.",
            "color": "Change only the fire extinguisher color/accent design while preserving its safety-product identity, handle, hose/nozzle, gauge, label area, angle, and studio composition.",
            "hardware": "Upgrade only the fire extinguisher hardware: trigger handle, pin, hose/nozzle, gauge, mounting bracket, and base details. Keep the same extinguisher identity.",
            "functional": "Add or refine one practical fire extinguisher feature such as clearer gauge, hose clip, wall mount, label area, pin detail, or nozzle holder. Keep the product realistic.",
            "packaging": "Show matching safety-product retail packaging or wall-mount kit beside the extinguisher while keeping the extinguisher as the main subject.",
            "variations": "Create three premium fire extinguisher design variations that all remain realistic extinguishers with handle, nozzle/hose, gauge, and canister.",
            "preserve_edit": "Apply only the requested edit to the fire extinguisher. Preserve extinguisher identity, handle, hose/nozzle, gauge, canister shape, camera angle, and composition.",
        })
    elif "soap dispenser" in subj or "dispenser" in subj:
        defaults.update({
            "material": "Change only the soap dispenser material/finish, such as frosted glass, ceramic, brushed metal, or matte plastic. Preserve pump, bottle shape, angle, and composition.",
            "color": "Change only the soap dispenser color/accent treatment while preserving the pump, body, angle, and clean product composition.",
            "hardware": "Upgrade only the dispenser pump, nozzle, collar, base, and small hardware details. Keep the dispenser identity and angle.",
            "functional": "Add or refine one practical dispenser feature such as pump lock, fill-level window, non-slip base, or refill opening. Keep the same dispenser.",
            "packaging": "Show matching soap dispenser packaging beside or behind the dispenser while keeping the dispenser as the main subject.",
            "variations": "Create three premium soap dispenser design variations that all remain clearly soap dispensers with pump and bottle body.",
            "preserve_edit": "Apply only the requested edit to the soap dispenser. Preserve dispenser identity, pump, body shape, camera angle, lighting, and composition.",
        })


    explicit = user
    # When the button sent a generic guided prompt with only "Material" or "Color / Pattern",
    # use a strong real edit direction instead of letting vague words create stale/no-op output.
    if len(explicit.split()) <= 8 or re.search(r"(?i)apply only this edit:\s*(material|color|colour|size|proportions|handle|hardware|comfort|functional|packaging|generate variations|premium finish)\b", explicit):
        return defaults.get(intent, defaults["preserve_edit"])

    return f"{defaults.get(intent, defaults['preserve_edit'])}\n\nUser's exact edit request: {explicit}"


def simo_workspace_build_edit_prompt(subject: str, prompt: str, title: str = "", action: str = "") -> str:
    intent = simo_workspace_detect_intent(prompt, action)
    direction = simo_workspace_action_direction(intent, prompt, subject)

    return f"""
You are editing the provided image directly.

ACTIVE SUBJECT LOCK:
- Exact subject/object: {subject}
- Saved workspace title/context: {simo_workspace_clean_text(title) or subject}
- This is an edit of the supplied image, not a new unrelated generation.

EDIT INTENT:
- Intent category: {intent}
- Direction: {direction}

STRICT PRESERVATION RULES:
- Keep the same object identity unless the user explicitly asked to transform it.
- Keep the same camera angle, crop, lighting direction, studio background, and overall composition unless explicitly asked.
- Do not switch to a house, website, UI, book, logo mockup, poster, car, or unrelated subject.
- Do not add random text, SIMO lettering, logos, labels, watermarks, or UI unless the edit specifically asks for branding/text.
- For feature-specific edits such as controls, feet/base, slots, details, or comfort, change ONLY that named feature area and preserve the rest of the object.
- Do not repaint or restyle the entire object when the edit is about a local feature.
- For material/color/shape/detail changes, remove accidental/unrequested text or branding if it appears.
- Make the requested feature edit visually obvious enough for the user to see the change, while preserving everything else.
- If the intent is variations, the output must be a SINGLE image that clearly shows exactly three distinct options in one presentation. Do not return only one refined item.

Return one realistic premium image edit result.
""".strip()


def simo_workspace_run_image_edit(base_path: str, edit_prompt: str, client):
    if not client:
        return {"ok": False, "url": "", "error": "OPENAI_API_KEY is missing.", "prompt": edit_prompt, "mode": "workspace-edit"}

    if not base_path or not os.path.isfile(base_path):
        return {"ok": False, "url": "", "error": "Workspace base image was not found on disk.", "prompt": edit_prompt, "mode": "workspace-edit"}

    last_error = ""
    for attempt in range(1, 3):
        try:
            with open(base_path, "rb") as image_file:
                image_kwargs = {
                    "model": OPENAI_IMAGE_MODEL,
                    "image": image_file,
                    "prompt": edit_prompt,
                    "size": OPENAI_IMAGE_SIZE,
                    "n": 1,
                }
                if str(OPENAI_IMAGE_MODEL or "").lower().startswith("gpt-image"):
                    image_kwargs["output_format"] = os.getenv("OPENAI_IMAGE_OUTPUT_FORMAT", "png").strip() or "png"
                    image_kwargs["quality"] = os.getenv("OPENAI_IMAGE_QUALITY", "medium").strip() or "medium"

                try:
                    resp = client.images.edit(**image_kwargs)
                except TypeError:
                    image_kwargs.pop("output_format", None)
                    image_kwargs.pop("quality", None)
                    try:
                        resp = client.images.edit(**image_kwargs)
                    except TypeError:
                        image_file.seek(0)
                        image_kwargs["image"] = [image_file]
                        resp = client.images.edit(**image_kwargs)

            extracted = extract_image_from_openai_response(resp)
            kind = extracted.get("kind")
            value = extracted.get("value")

            if kind == "url" and value:
                try:
                    with urllib.request.urlopen(value, timeout=30) as r:
                        raw = r.read()
                    if raw:
                        filename = f"simo_workspace_edit_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.png"
                        saved_name = save_generated_image_bytes(filename, raw)
                        return {"ok": True, "url": public_generated_image_url(saved_name), "error": "", "prompt": edit_prompt, "attempts": attempt, "mode": "workspace-edit"}
                except Exception:
                    return {"ok": True, "url": value, "error": "", "prompt": edit_prompt, "attempts": attempt, "mode": "workspace-edit"}

            if kind == "b64" and value:
                raw = base64.b64decode(value)
                filename = f"simo_workspace_edit_{utcnow().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(6)}.png"
                saved_name = save_generated_image_bytes(filename, raw)
                return {"ok": True, "url": public_generated_image_url(saved_name), "error": "", "prompt": edit_prompt, "attempts": attempt, "mode": "workspace-edit"}

            last_error = "No image data returned."
        except Exception as e:
            last_error = str(e)
            print(f"[SIMO WORKSPACE EDIT] attempt {attempt}/2 failed: {last_error}", flush=True)

    return {"ok": False, "url": "", "error": last_error or "Workspace image edit failed.", "prompt": edit_prompt, "mode": "workspace-edit"}



def simo_workspace_file_to_data_url(url_or_path: str) -> str:
    """Return a data:image URL for a generated image URL/path so blob workspace tabs can display it reliably."""
    raw = str(url_or_path or "").strip()
    if not raw:
        return ""

    if raw.startswith("data:image/"):
        return raw

    path = ""
    try:
        path = local_generated_image_path_from_url(raw)
    except Exception:
        path = ""

    if not path and ("/generated-images/" in raw or "/generated_images/" in raw):
        try:
            filename = raw.rsplit("/", 1)[-1].split("?", 1)[0].strip()
            path = find_generated_image_path(filename)
        except Exception:
            path = ""

    if not path and os.path.isfile(raw):
        path = raw

    if not path or not os.path.isfile(path):
        return ""

    ext = os.path.splitext(path)[1].lower()
    mime = "image/png"
    if ext in [".jpg", ".jpeg"]:
        mime = "image/jpeg"
    elif ext == ".webp":
        mime = "image/webp"
    elif ext == ".gif":
        mime = "image/gif"

    try:
        with open(path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("ascii")
        return f"data:{mime};base64,{encoded}"
    except Exception:
        return ""



@app.route("/api/workspace-image-edit", methods=["POST"])
def api_workspace_image_edit():
    """Clean Simo workspace image edit route.

    This route is intentionally simple for the clean prompt-first workspace:
    latest source image + plain language edit -> edited image URL/data -> latest source image.
    """
    try:
        data = request.get_json(silent=True) or {}

        edit_prompt_raw = simo_workspace_clean_text(
            data.get("edit")
            or data.get("prompt")
            or data.get("message")
            or data.get("instruction")
            or ""
        )
        title = simo_workspace_clean_text(data.get("title") or data.get("workspaceSubject") or data.get("subject") or "")
        action = simo_workspace_clean_text(data.get("action") or "")

        # Clean Workspace V1 rule:
        # The latest edited source must win. Older display/original fields are fallback only.
        image_value = str(
            data.get("currentSourceImage")
            or data.get("sourceImage")
            or data.get("currentImage")
            or data.get("image")
            or data.get("image_url")
            or data.get("generated_visual_url")
            or data.get("originalImage")
            or ""
        ).strip()

        client_apply_seq = data.get("clientApplySeq")
        edit_count = data.get("editCount")

        if not edit_prompt_raw:
            return jsonify({"ok": False, "error": "Edit prompt is required."}), 400

        base_path = simo_workspace_data_url_to_file(image_value)
        if not base_path:
            return jsonify({
                "ok": False,
                "error": "Workspace image was not usable. Reopen the workspace from the saved design, then try again.",
                "debug_has_image_value": bool(image_value),
                "debug_image_prefix": image_value[:120],
                "debug_client_apply_seq": client_apply_seq,
                "debug_edit_count": edit_count,
            }), 400

        credit_ok, credit_status, credit_response = simo_check_image_credit_available("workspace_image_edit")
        if not credit_ok:
            return credit_response

        subject = simo_workspace_detect_subject(title, edit_prompt_raw)

        # Keep the model instruction prompt-first and preserve-first.
        # The helper still adds subject-aware guidance, but the user's exact plain prompt remains the center.
        edit_prompt = simo_workspace_build_edit_prompt(subject, edit_prompt_raw, title, action)

        client = get_client()
        result = simo_workspace_run_image_edit(base_path, edit_prompt, client)

        if not result.get("ok") or not result.get("url"):
            return jsonify({
                "ok": False,
                "error": result.get("error") or "Workspace image edit failed.",
                "message": "The image-edit route ran, but no edited image was returned.",
                "prompt": edit_prompt,
                "phase": "SIMO Clean Design Workspace V1",
                "debug_base_path_found": bool(base_path and os.path.isfile(base_path)),
                "debug_base_path": base_path,
                "debug_client_apply_seq": client_apply_seq,
                "debug_edit_count": edit_count,
            }), 502

        credit_receipt = simo_consume_image_credit("workspace_image_edit")
        edited_url = result.get("url") or ""
        edited_data_url = simo_workspace_file_to_data_url(edited_url)

        return jsonify({
            "ok": True,
            "image": edited_data_url or edited_url,
            "image_data_url": edited_data_url,
            "image_url": edited_url,
            "generated_visual_url": edited_url,
            "sourceImage": edited_url,
            "currentSourceImage": edited_url,
            "message": "Workspace edit complete. This edited image is now the source for the next edit.",
            "prompt": result.get("prompt", edit_prompt),
            "user_prompt": edit_prompt_raw,
            "mode": "simo-clean-workspace-edit",
            "phase": "SIMO Clean Design Workspace V1",
            "subject": subject,
            "intent": simo_workspace_detect_intent(edit_prompt_raw, action),
            "debug_returned_data_url": bool(edited_data_url),
            "debug_returned_url": edited_url,
            "debug_source_prefix": image_value[:120],
            "debug_client_apply_seq": client_apply_seq,
            "debug_edit_count": edit_count,
            "image_credits": credit_receipt,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": f"Workspace image edit failed: {str(e)}"}), 500


@app.route("/generated-images/<path:filename>")
def generated_images(filename):
    safe_name = secure_filename(filename)
    if not safe_name:
        abort(404)

    full = find_generated_image_path(safe_name)
    if not full:
        return jsonify({
            "ok": False,
            "error": "Generated image file not found.",
            "filename": safe_name,
            "checked_dirs": generated_image_storage_dirs(),
        }), 404

    mimetype = "image/png"
    lower = safe_name.lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        mimetype = "image/jpeg"
    elif lower.endswith(".webp"):
        mimetype = "image/webp"
    elif lower.endswith(".gif"):
        mimetype = "image/gif"
    elif lower.endswith(".svg"):
        mimetype = "image/svg+xml"

    return send_file(full, mimetype=mimetype, conditional=True, max_age=3600)

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
# Persistent Library
# ---------------------------------------------------------
@app.route("/api/library", methods=["GET"])
def api_get_library():
    email = current_user_email()
    if not email:
        return jsonify({"ok": True, "items": []})

    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM saved_builds WHERE user_email = ? ORDER BY updated_at DESC",
        (email,),
    ).fetchall()
    conn.close()

    items = [normalize_saved_build_item(r) for r in rows]
    return jsonify({"ok": True, "items": items})


@app.route("/api/library/save", methods=["POST"])
def api_save_build():
    email = current_user_email()
    if not email:
        return jsonify({"ok": False, "error": "not_logged_in"}), 401

    data = request.get_json(silent=True) or {}

    build_id = str(data.get("id") or secrets.token_hex(8)).strip()
    title = str(data.get("title") or "Untitled Build").strip() or "Untitled Build"
    html = str(data.get("html") or "").strip()
    source_text = str(data.get("sourceText") or data.get("source_text") or "").strip()
    notes = str(data.get("notes") or "").strip()
    tags = safe_text_list(data.get("tags", []))
    pinned = 1 if bool(data.get("pinned", False)) else 0
    archived = 1 if bool(data.get("archived", False)) else 0

    now = dt.datetime.utcnow().isoformat()

    conn = get_db()
    conn.execute(
        """
        INSERT INTO saved_builds (
            id, user_email, title, html, source_text, notes, tags_json,
            pinned, archived, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            user_email = excluded.user_email,
            title = excluded.title,
            html = excluded.html,
            source_text = excluded.source_text,
            notes = excluded.notes,
            tags_json = excluded.tags_json,
            pinned = excluded.pinned,
            archived = excluded.archived,
            updated_at = excluded.updated_at
        """,
        (
            build_id,
            email,
            title,
            html,
            source_text,
            notes,
            json.dumps(tags),
            pinned,
            archived,
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "id": build_id})


@app.route("/api/library/delete", methods=["POST"])
def api_delete_build():
    email = current_user_email()
    if not email:
        return jsonify({"ok": False, "error": "not_logged_in"}), 401

    data = request.get_json(silent=True) or {}
    build_id = str(data.get("id") or "").strip()
    if not build_id:
        return jsonify({"ok": False, "error": "missing_id"}), 400

    conn = get_db()
    conn.execute(
        "DELETE FROM saved_builds WHERE id = ? AND user_email = ?",
        (build_id, email),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True})


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
# Main
# =========================================================
if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    debug = env_bool("FLASK_DEBUG", True)
    app.run(host=host, port=port, debug=debug)
