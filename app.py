import os
import re
import io
import base64
import json
import sqlite3
import datetime as dt
import secrets
from urllib.parse import quote

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

import stripe
from authlib.integrations.flask_client import OAuth
from openai import OpenAI

load_dotenv()


def env_bool(name: str, default: bool = False) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return str(val).strip().lower() in ("1", "true", "yes", "on")


def resolve_path(base_root: str, path_value: str, default_name: str) -> str:
    raw = (path_value or default_name).strip()
    if not raw:
        raw = default_name
    if os.path.isabs(raw):
        return raw
    return os.path.join(base_root, raw)


app = Flask(__name__, static_folder="static", template_folder="templates")

# -----------------------------
# Deployment / runtime config
# -----------------------------
APP_ENV = os.getenv("APP_ENV", os.getenv("FLASK_ENV", "development")).strip().lower()
IS_PRODUCTION = APP_ENV == "production"
TRUST_PROXY = env_bool("TRUST_PROXY", True)

if TRUST_PROXY:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# -----------------------------
# Core config
# -----------------------------
app.secret_key = os.getenv("SECRET_KEY", "may-the-lord-protect-all-who-love-him")

SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", IS_PRODUCTION)
SESSION_COOKIE_SAMESITE = os.getenv(
    "SESSION_COOKIE_SAMESITE",
    "Lax" if not IS_PRODUCTION else "Lax"
).strip()

app.config["SESSION_COOKIE_SAMESITE"] = SESSION_COOKIE_SAMESITE
app.config["SESSION_COOKIE_SECURE"] = SESSION_COOKIE_SECURE
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = dt.timedelta(days=31)

FREE_DAILY_LIMIT = int(os.getenv("FREE_DAILY_LIMIT", "50"))
BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:5000").strip().rstrip("/")

# -----------------------------
# Publish config
# -----------------------------
PUBLISHED_DIR = resolve_path(
    app.root_path,
    os.getenv("PUBLISHED_SITES_DIR", ""),
    "published_sites",
)
os.makedirs(PUBLISHED_DIR, exist_ok=True)

# -----------------------------
# SQLite user storage
# -----------------------------
DB_PATH = resolve_path(
    app.root_path,
    os.getenv("SIMO_DB_PATH", ""),
    "simo.db",
)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def db_connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db():
    conn = db_connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                plan TEXT NOT NULL DEFAULT 'free',
                stripe_customer_id TEXT,
                stripe_subscription_id TEXT,
                created_at_utc TEXT,
                updated_at_utc TEXT
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


# -----------------------------
# Stripe
# -----------------------------
STRIPE_MODE = os.getenv("STRIPE_MODE", "test").strip().lower()
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()

PRICE_SINGLE_MONTHLY = os.getenv("STRIPE_PRICE_SINGLE_MONTHLY", "").strip()
PRICE_SINGLE_YEARLY = os.getenv("STRIPE_PRICE_SINGLE_YEARLY", "").strip()
PRICE_TEAM_MONTHLY = os.getenv("STRIPE_PRICE_TEAM_MONTHLY", "").strip()
PRICE_TEAM_YEARLY = os.getenv("STRIPE_PRICE_TEAM_YEARLY", "").strip()

stripe.api_key = STRIPE_SECRET_KEY

PRICE_MAP = {
    "single_monthly": PRICE_SINGLE_MONTHLY,
    "single_yearly": PRICE_SINGLE_YEARLY,
    "team_monthly": PRICE_TEAM_MONTHLY,
    "team_yearly": PRICE_TEAM_YEARLY,
}

PLAN_AFTER_SUCCESS = {
    "single_monthly": "single",
    "single_yearly": "single",
    "team_monthly": "team",
    "team_yearly": "team",
}

# -----------------------------
# OpenAI
# -----------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()

oa_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# -----------------------------
# OAuth (Google)
# -----------------------------
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()

oauth = OAuth(app)
if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

# -----------------------------
# Helpers
# -----------------------------
def utc_now():
    return dt.datetime.now(dt.timezone.utc)


def utc_day_key() -> str:
    return utc_now().strftime("%Y-%m-%d")


def get_user_record(email: str):
    email = (email or "").strip().lower()
    if not email:
        return None

    conn = db_connect()
    try:
        row = conn.execute(
            """
            SELECT email, plan, stripe_customer_id, stripe_subscription_id, created_at_utc, updated_at_utc
            FROM users
            WHERE email = ?
            """,
            (email,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def ensure_user_record(email: str):
    email = (email or "").strip().lower()
    if not email:
        return

    now = utc_now().isoformat()
    conn = db_connect()
    try:
        existing = conn.execute("SELECT email FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            return
        conn.execute(
            """
            INSERT INTO users (email, plan, stripe_customer_id, stripe_subscription_id, created_at_utc, updated_at_utc)
            VALUES (?, 'free', NULL, NULL, ?, ?)
            """,
            (email, now, now),
        )
        conn.commit()
    finally:
        conn.close()


def save_user_plan(email: str, plan: str, stripe_customer_id: str = None, stripe_subscription_id: str = None):
    email = (email or "").strip().lower()
    if not email:
        return

    if plan not in ("free", "single", "team"):
        plan = "free"

    now = utc_now().isoformat()
    conn = db_connect()
    try:
        existing = conn.execute("SELECT email FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE users
                SET plan = ?,
                    stripe_customer_id = COALESCE(?, stripe_customer_id),
                    stripe_subscription_id = COALESCE(?, stripe_subscription_id),
                    updated_at_utc = ?
                WHERE email = ?
                """,
                (plan, stripe_customer_id, stripe_subscription_id, now, email),
            )
        else:
            conn.execute(
                """
                INSERT INTO users (email, plan, stripe_customer_id, stripe_subscription_id, created_at_utc, updated_at_utc)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (email, plan, stripe_customer_id, stripe_subscription_id, now, now),
            )
        conn.commit()
    finally:
        conn.close()


def get_plan():
    email = (session.get("user_email") or "").strip().lower()

    if email:
        row = get_user_record(email)
        if row and row.get("plan") in ("free", "single", "team"):
            session["plan"] = row["plan"]

    plan = session.get("plan", "free")
    if plan not in ("free", "single", "team"):
        plan = "free"
        session["plan"] = "free"

    is_team = plan == "team"
    is_paid = plan in ("single", "team")
    return plan, is_paid, is_team


def set_plan(plan: str):
    if plan not in ("free", "single", "team"):
        plan = "free"

    session["plan"] = plan

    email = (session.get("user_email") or "").strip().lower()
    if email:
        save_user_plan(email, plan)


def bump_daily_usage():
    day = utc_day_key()
    if session.get("day_utc") != day:
        session["day_utc"] = day
        session["used_today"] = 0
    session["used_today"] = int(session.get("used_today", 0)) + 1


def usage_status():
    day = utc_day_key()
    if session.get("day_utc") != day:
        session["day_utc"] = day
        session["used_today"] = 0

    used = int(session.get("used_today", 0))
    plan, is_paid, is_team = get_plan()
    return {
        "ok": True,
        "day_utc": day,
        "free_daily_limit": FREE_DAILY_LIMIT,
        "used_today": used,
        "stripe_mode": STRIPE_MODE,
        "plan": plan,
        "is_paid": is_paid,
        "is_team": is_team,
        "email": session.get("user_email"),
    }


def friendly_system_prompt(settings: dict):
    style = (settings or {}).get("style", "friendly")
    language = (settings or {}).get("language", "en")

    base = (
        "You are Simo — a non-judgmental, child-friendly best-friend assistant. "
        "Be warm, practical, and emotionally aware, but avoid obvious therapy-speak. "
        "If user asks for step-by-step, provide clear steps. "
        "Ask at most ONE helpful follow-up question if needed."
    )

    if language and language != "en":
        base += f" Respond in language: {language}."
    if style and style != "friendly":
        base += f" Tone style: {style}."
    return base


def safe_history_from_list(history, limit=16):
    safe_hist = []
    if not isinstance(history, list):
        return safe_hist

    for m in history[-limit:]:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and isinstance(content, str):
            safe_hist.append({"role": role, "content": content})
    return safe_hist


def get_last_image_memory():
    mem = session.get("last_image_analysis")
    if not isinstance(mem, dict):
        return None

    image_prompt = (mem.get("prompt") or "").strip()
    image_answer = (mem.get("answer") or "").strip()
    if not image_answer:
        return None

    return {
        "prompt": image_prompt,
        "answer": image_answer,
    }


def store_last_image_memory(prompt: str, answer: str):
    session["last_image_analysis"] = {
        "prompt": (prompt or "").strip(),
        "answer": (answer or "").strip(),
        "saved_at_utc": utc_now().isoformat(),
    }


def clear_last_image_memory():
    session.pop("last_image_analysis", None)


def is_image_followup(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return False

    phrases = [
        "what do you see",
        "what do u see",
        "what do us see",
        "what about the background",
        "tell me more about the image",
        "tell me more about it",
        "describe it more",
        "read the sign",
        "what is in the background",
        "what's in the background",
        "what does the background say",
        "what color is the car",
        "what car is this",
        "what do you notice",
        "analyze it more",
        "look again",
        "what else do you see",
        "what was the image i uploaded earlier",
        "what's the other image before this one",
        "what was the other image before this one",
        "what image did i upload before this one",
    ]

    if t in phrases:
        return True

    keywords = [
        "background",
        "image",
        "picture",
        "photo",
        "sign",
        "car",
        "vehicle",
        "color",
        "read",
        "see",
        "notice",
        "this image",
        "this photo",
        "that image",
        "that photo",
        "uploaded earlier",
        "before this one",
        "other image",
    ]

    short_followup = len(t.split()) <= 12
    return short_followup and any(k in t for k in keywords)


def sanitize_filename(name: str) -> str:
    base = (name or "simo-project").strip().lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    return base or "simo-project"


def make_publish_id(title: str) -> str:
    slug = sanitize_filename(title or "published-page")
    token = secrets.token_hex(3)
    return f"{slug}-{token}"


def published_html_path(site_id: str) -> str:
    safe_id = re.sub(r"[^a-zA-Z0-9\-]", "", site_id or "")
    return os.path.join(PUBLISHED_DIR, f"{safe_id}.html")


def published_meta_path(site_id: str) -> str:
    safe_id = re.sub(r"[^a-zA-Z0-9\-]", "", site_id or "")
    return os.path.join(PUBLISHED_DIR, f"{safe_id}.json")


# -----------------------------
# Builder memory helpers
# -----------------------------
def get_last_builder_memory():
    mem = session.get("last_builder")
    if not isinstance(mem, dict):
        return None

    title = (mem.get("title") or "").strip()
    summary = (mem.get("summary") or "").strip()
    html = mem.get("html") or ""

    if not isinstance(html, str) or not html.strip():
        return None

    return {
        "title": title or "Untitled Build",
        "summary": summary or "Generated by Simo",
        "html": html,
    }


def store_last_builder_memory(builder: dict):
    if not isinstance(builder, dict):
        return

    html = builder.get("html") or ""
    if not isinstance(html, str) or not html.strip():
        return

    session["last_builder"] = {
        "title": (builder.get("title") or "Untitled Build").strip(),
        "summary": (builder.get("summary") or "Generated by Simo").strip(),
        "html": html,
        "saved_at_utc": utc_now().isoformat(),
    }


def clear_last_builder_memory():
    session.pop("last_builder", None)


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def is_builder_followup(text: str) -> bool:
    t = normalize_text(text)
    if not t:
        return False

    phrases = [
        "make the buttons",
        "change the buttons",
        "make it gold",
        "make it darker",
        "make it lighter",
        "change the colors",
        "change the color",
        "use gold",
        "use blue",
        "use purple",
        "add a hero",
        "add testimonials",
        "add pricing",
        "add a contact section",
        "add a footer",
        "add a navbar",
        "make it luxury",
        "make it modern",
        "make it premium",
        "make it elegant",
        "update the page",
        "update the layout",
        "edit the page",
        "edit the layout",
        "change the background",
        "change the headline",
        "change the title",
        "swap the image",
        "replace the image",
        "remove testimonials",
        "remove pricing",
        "remove the footer",
        "make the text bigger",
        "make the buttons rounded",
        "make the buttons more premium",
        "make it more glowing",
        "make it more angelic",
        "make it more celestial",
        "make it more divine",
        "make it more heavenly",
        "make it cleaner",
        "make it more polished",
        "improve the spacing",
        "make the typography better",
        "make it more luxurious",
        "make it more high end",
        "make the hero more premium",
        "make the cta stronger",
        "make it feel more premium",
    ]
    if any(p in t for p in phrases):
        return True

    keywords = [
        "change",
        "update",
        "edit",
        "make",
        "add",
        "remove",
        "replace",
        "swap",
        "use",
        "turn",
        "restyle",
        "redesign",
        "improve",
        "refine",
        "polish",
    ]

    builder_targets = [
        "button",
        "buttons",
        "color",
        "colors",
        "background",
        "layout",
        "page",
        "site",
        "website",
        "hero",
        "headline",
        "title",
        "section",
        "pricing",
        "testimonial",
        "testimonials",
        "footer",
        "navbar",
        "nav",
        "image",
        "font",
        "text",
        "cta",
        "glow",
        "angel",
        "heaven",
        "celestial",
        "divine",
        "spacing",
        "typography",
        "premium",
        "luxury",
        "luxurious",
    ]

    short_text = len(t.split()) <= 20
    return short_text and any(k in t for k in keywords) and any(bt in t for bt in builder_targets)


def extract_json_object(text: str):
    raw = (text or "").strip()
    if not raw:
        return None

    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw, flags=re.DOTALL)
    if fence_match:
        raw = fence_match.group(1).strip()

    try:
        return json.loads(raw)
    except Exception:
        pass

    first = raw.find("{")
    last = raw.rfind("}")
    if first != -1 and last != -1 and last > first:
        candidate = raw[first:last + 1]
        try:
            return json.loads(candidate)
        except Exception:
            return None

    return None


# -----------------------------
# Safe builder style engine
# -----------------------------
def detect_builder_style(prompt: str) -> str:
    text = normalize_text(prompt)

    celestial_words = [
        "heaven", "heavenly", "celestial", "angel", "angelic", "divine",
        "holy", "ethereal", "wings", "wing", "feather", "feathers",
        "glow", "glowing", "light", "golden", "radiant", "cloud", "clouds"
    ]
    bakery_words = [
        "bakery", "bread", "pastry", "pastries", "cake", "dessert",
        "coffee", "cafe", "restaurant", "sourdough", "cookie", "cookies"
    ]
    real_estate_words = [
        "real estate", "realtor", "property", "properties", "luxury home",
        "luxury homes", "home page", "homepage", "listing", "listings"
    ]
    portfolio_words = [
        "portfolio", "designer", "creative", "artist", "creator",
        "photographer", "resume", "personal brand"
    ]
    startup_words = [
        "startup", "saas", "software", "app", "platform", "ai", "tech",
        "landing page", "product", "service", "business"
    ]
    space_words = [
        "space", "planet", "galaxy", "universe", "stars", "cosmic", "nebula"
    ]
    dashboard_words = [
        "dashboard", "portal", "admin", "analytics", "crm", "panel"
    ]

    if any(w in text for w in celestial_words):
        return "celestial"
    if any(w in text for w in bakery_words):
        return "bakery"
    if any(w in text for w in real_estate_words):
        return "real_estate"
    if any(w in text for w in portfolio_words):
        return "portfolio"
    if any(w in text for w in space_words):
        return "space"
    if any(w in text for w in dashboard_words):
        return "dashboard"
    if any(w in text for w in startup_words):
        return "startup"
    return "modern"


def builder_style_guide(style_name: str) -> str:
    guides = {
        "celestial": (
            "Style direction: heavenly, radiant, divine, ethereal, elegant, awe-inspiring. "
            "Use luminous gradients, gold accents, soft white light, deep sky tones, graceful spacing, "
            "premium typography, subtle glow, layered atmosphere, soft highlights, and a peaceful elevated mood. "
            "The hero should feel cinematic, intentional, and emotionally beautiful, not plain."
        ),
        "bakery": (
            "Style direction: warm, premium bakery brand. "
            "Use soft cream, wheat, caramel, cocoa, toasted gold, warm neutrals, tasteful shadows, and refined cards. "
            "Create a luxurious handcrafted feel with stronger visual hierarchy, beautiful product presentation, "
            "more inviting hero treatment, and a boutique premium aesthetic."
        ),
        "real_estate": (
            "Style direction: luxury real estate, polished and trustworthy. "
            "Use elegant spacing, premium imagery layout, rich neutrals, refined gold accents where appropriate, "
            "high-end presentation, strong hero composition, sophisticated typography, elevated cards, and premium CTA treatment."
        ),
        "portfolio": (
            "Style direction: modern creative portfolio with premium presentation. "
            "Use stronger typography, better composition, elegant spacing, polished cards, stylish project presentation, "
            "memorable hero treatment, and a refined designer aesthetic."
        ),
        "space": (
            "Style direction: immersive cosmic experience. "
            "Use deep blues, stars, glow, cinematic layering, dramatic hero presentation, polished cards, "
            "rich sci-fi atmosphere, and visually impressive structure."
        ),
        "dashboard": (
            "Style direction: polished dashboard/product UI. "
            "Use strong hierarchy, premium cards, modern panels, elegant spacing, smoother surfaces, "
            "cleaner typography, and a believable product interface feel."
        ),
        "startup": (
            "Style direction: premium startup / SaaS landing page. "
            "Use a standout hero, strong typography hierarchy, better spacing, polished cards, premium CTA blocks, "
            "feature sections with stronger contrast, testimonials, pricing, and a launch-ready feel."
        ),
        "modern": (
            "Style direction: premium modern website. "
            "Use a visually impressive hero, better section rhythm, stronger cards, cleaner typography, "
            "more layered depth, refined CTA treatment, and avoid plain or bland output."
        ),
    }
    return guides.get(style_name, guides["modern"])


def suggest_builder_title(prompt: str, style_name: str) -> str:
    if style_name == "celestial":
        return "Celestial Experience"
    if style_name == "bakery":
        return "Luxury Bakery"
    if style_name == "real_estate":
        return "Luxury Real Estate"
    if style_name == "portfolio":
        return "Creative Portfolio"
    if style_name == "space":
        return "Explore the Universe"
    if style_name == "dashboard":
        return "Premium Dashboard"
    if style_name == "startup":
        return "Modern SaaS"
    return "Custom Builder Page"


def ai_builder_edit(existing_builder: dict, instruction: str):
    if not oa_client:
        return simple_builder_edit(existing_builder, instruction)

    existing_html = existing_builder.get("html") or ""
    existing_title = existing_builder.get("title") or "Untitled Build"
    existing_summary = existing_builder.get("summary") or "Generated by Simo"

    system_prompt = (
        "You are Simo's website builder engine. "
        "You receive an existing HTML page and a user edit instruction. "
        "Return ONLY valid JSON with keys: title, summary, html. "
        "Do not wrap in markdown fences. "
        "Keep the page as a single complete standalone HTML document. "
        "Preserve as much of the existing layout as possible while applying the requested change. "
        "Do not remove major sections unless the user asked for removal. "
        "Make edits feel polished, premium, visually cohesive, and intentional. "
        "When the user asks for luxury, premium, glow, better spacing, stronger CTA, or better typography, "
        "apply those changes visibly while keeping the structure stable."
    )

    user_prompt = {
        "current_title": existing_title,
        "current_summary": existing_summary,
        "instruction": instruction,
        "current_html": existing_html,
        "premium_quality_goals": [
            "stronger hero presence",
            "cleaner spacing",
            "more polished typography",
            "better CTA styling",
            "more layered visual depth",
            "preserve stable structure"
        ]
    }

    try:
        resp = oa_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_prompt)},
            ],
            temperature=0.2,
        )

        raw = resp.choices[0].message.content or ""
        parsed = extract_json_object(raw)

        if not isinstance(parsed, dict):
            return simple_builder_edit(existing_builder, instruction)

        html = parsed.get("html") or ""
        if not isinstance(html, str) or not html.strip():
            return simple_builder_edit(existing_builder, instruction)

        return {
            "title": (parsed.get("title") or existing_title).strip(),
            "summary": (parsed.get("summary") or f'Updated the previous build: {instruction.strip()}').strip(),
            "html": html,
        }
    except Exception:
        return simple_builder_edit(existing_builder, instruction)


def simple_builder_edit(existing_builder: dict, instruction: str):
    title = existing_builder.get("title") or "Untitled Build"
    html = existing_builder.get("html") or ""
    t = normalize_text(instruction)

    summary = f'Updated the previous build: {instruction.strip() or "refined layout"}.'

    color_map = {
        "gold": "#d4af37",
        "purple": "#7c3aed",
        "blue": "#2563eb",
        "pink": "#ec4899",
        "green": "#16a34a",
        "black": "#111827",
        "white": "#ffffff",
        "brown": "#8b6a46",
    }

    for word, color in color_map.items():
        if f"buttons {word}" in t or f"button {word}" in t or f"use {word}" in t or f"make it {word}" in t:
            html = re.sub(
                r"(\.btn\s*\{[^}]*background:\s*)([^;]+)(;)",
                rf"\g<1>{color}\3",
                html,
                count=1,
                flags=re.DOTALL,
            )
            html = re.sub(
                r"(\.cta-btn\s*\{[^}]*background:\s*)([^;]+)(;)",
                rf"\g<1>{color}\3",
                html,
                count=1,
                flags=re.DOTALL,
            )

    if "rounded" in t and "button" in t:
        html = re.sub(
            r"(border-radius:\s*)10px;",
            r"\g<1>999px;",
            html,
            count=4,
            flags=re.DOTALL,
        )

    if "darker" in t or "dark mode" in t:
        html = html.replace("#fffaf5", "#0f172a")
        html = html.replace("#f5f7fb", "#0b1020")
        html = html.replace("color: #3f2a20;", "color: #eef2ff;")
        html = html.replace("background: white;", "background: rgba(255,255,255,.06);")

    if "lighter" in t:
        html = html.replace("#0b1020", "#f8fafc")
        html = html.replace("color:white;", "color:#111827;")
        html = html.replace("color: white;", "color: #111827;")

    if "testimonials" in t and "add" in t and "Client Testimonials" not in html and "What Customers Love" not in html and '<div class="testimonials">' not in html:
        section = """
<section>
  <div class="section-title">Testimonials</div>
  <div class="testimonials">
    <div class="testimonial">
      <strong>“Beautiful result and a premium feel.”</strong>
      <p>The page feels polished, clear, and ready to launch.</p>
      <div>— Happy Client</div>
    </div>
    <div class="testimonial">
      <strong>“Fast, clean, and surprisingly elegant.”</strong>
      <p>This gave us a strong starting point right away.</p>
      <div>— Founder</div>
    </div>
    <div class="testimonial">
      <strong>“Exactly the direction we wanted.”</strong>
      <p>The updated styling feels more refined and intentional.</p>
      <div>— Business Owner</div>
    </div>
  </div>
</section>
"""
        html = html.replace("<footer", f"{section}\n<footer", 1)

    if "pricing" in t and "add" in t and 'id="pricing"' not in html:
        section = """
<section id="pricing">
  <div class="section-title">Pricing</div>
  <div class="grid">
    <div class="card"><div class="card-body"><h3>Starter</h3><p>Good for getting started.</p><div class="price">$9.99/mo</div></div></div>
    <div class="card"><div class="card-body"><h3>Pro</h3><p>Great for growing brands.</p><div class="price">$29/mo</div></div></div>
    <div class="card"><div class="card-body"><h3>Team Pro</h3><p>Best for collaboration.</p><div class="price">$299/yr</div></div></div>
  </div>
</section>
"""
        html = html.replace("<footer", f"{section}\n<footer", 1)

    if "contact" in t and "add" in t and 'id="contact"' not in html:
        section = """
<section id="contact">
  <div class="section-title">Contact</div>
  <div style="max-width:760px;margin:0 auto;text-align:center;line-height:1.8;">
    Ready to get started? Reach out for a consultation or custom project discussion.
  </div>
</section>
"""
        html = html.replace("<footer", f"{section}\n<footer", 1)

    if "headline" in t or "title" in t:
        m = re.search(r'(?:headline|title)\s+(?:to|as)\s+["“]?([^"”]+)["”]?', instruction, flags=re.IGNORECASE)
        if m:
            new_headline = m.group(1).strip()
            html = re.sub(r"(<h1>)(.*?)(</h1>)", rf"\1{new_headline}\3", html, count=1, flags=re.DOTALL)
            title = new_headline

    return {
        "title": title,
        "summary": summary,
        "html": html,
    }


def ai_generate_builder_html(prompt: str):
    if not oa_client:
        return generate_builder_html(prompt)

    style_name = detect_builder_style(prompt)
    style_guide = builder_style_guide(style_name)
    suggested_title = suggest_builder_title(prompt, style_name)

    system_prompt = (
        "You are Simo's premium website builder engine. "
        "Generate a complete standalone HTML page based on the user's prompt. "
        "Return ONLY valid JSON with keys: title, summary, html. "
        "Do not wrap the response in markdown fences. "
        "The html value must be a full standalone HTML document including <!DOCTYPE html>, "
        "<html>, <head>, <meta charset>, <meta name='viewport'>, <title>, styles, and <body>. "
        "The output should feel intentionally designed, polished, premium, modern, and launch-ready. "
        "Avoid plain, weak, flat, or generic layouts. "
        "Do not make every page look like the same startup landing page. "
        "Honor the requested subject matter and style closely. "
        "Use stronger hero sections, cleaner hierarchy, richer spacing, polished CTAs, layered depth, tasteful shadows, "
        "refined gradients, elegant cards, and a cohesive visual system. "
        "Create pages that feel more expensive, more beautiful, and more intentional than a basic mockup. "
        "Do not return explanations outside the JSON."
    )

    user_prompt = {
        "builder_request": prompt,
        "detected_style": style_name,
        "suggested_title": suggested_title,
        "style_direction": style_guide,
        "premium_visual_requirements": [
            "full standalone HTML document",
            "responsive layout",
            "visually impressive above-the-fold hero",
            "clean premium spacing",
            "strong typography hierarchy",
            "refined CTA buttons",
            "layered cards or sections where appropriate",
            "beautiful section rhythm",
            "cohesive color palette",
            "3-6 meaningful sections when appropriate",
            "avoid bland or template-feeling output"
        ],
        "design_preferences": {
            "hero": "cinematic, polished, strong first impression",
            "spacing": "clean, premium, breathable",
            "typography": "elevated hierarchy and readable scale",
            "cards": "refined with tasteful depth",
            "cta": "high-conviction and visually appealing",
            "overall_feel": "premium product or brand presentation"
        }
    }

    try:
        resp = oa_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_prompt)},
            ],
            temperature=0.8,
        )

        raw = resp.choices[0].message.content or ""
        parsed = extract_json_object(raw)

        if not isinstance(parsed, dict):
            return generate_builder_html(prompt)

        html = parsed.get("html") or ""
        title = (parsed.get("title") or "").strip()
        summary = (parsed.get("summary") or "").strip()

        if not isinstance(html, str) or not html.strip():
            return generate_builder_html(prompt)

        if "<html" not in html.lower() or "</html>" not in html.lower():
            return generate_builder_html(prompt)

        return {
            "title": title or suggested_title,
            "summary": summary or f"Custom AI-generated {style_name.replace('_', ' ')} premium page",
            "html": html,
        }
    except Exception:
        return generate_builder_html(prompt)


# -----------------------------
# Builder templates
# -----------------------------
def generate_builder_html(prompt: str):
    text = (prompt or "").lower()

    if "heaven" in text or "angel" in text or "divine" in text or "celestial" in text:
        title = "Welcome to Heaven"
        summary = "Heaven-themed celestial landing page"
        html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Welcome to Heaven</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      color: #fffdf7;
      background:
        radial-gradient(circle at 20% 10%, rgba(255,255,255,.22), transparent 18%),
        radial-gradient(circle at 80% 18%, rgba(255,245,200,.18), transparent 20%),
        linear-gradient(180deg, #7aa6ff 0%, #c8dcff 35%, #f9f3d7 72%, #fffdf7 100%);
    }
    .hero {
      min-height: 84vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 90px 24px 70px;
      position: relative;
      overflow: hidden;
    }
    .hero::before,
    .hero::after {
      content: "";
      position: absolute;
      inset: auto;
      width: 340px;
      height: 340px;
      border-radius: 999px;
      filter: blur(40px);
      opacity: .35;
      pointer-events: none;
    }
    .hero::before {
      top: 70px;
      left: -40px;
      background: rgba(255,255,255,.65);
    }
    .hero::after {
      top: 110px;
      right: -30px;
      background: rgba(255,220,150,.50);
    }
    .hero-inner {
      max-width: 920px;
      position: relative;
      z-index: 1;
    }
    .hero h1 {
      margin: 0 0 18px;
      font-size: clamp(52px, 8vw, 94px);
      line-height: .96;
      color: #fffefb;
      text-shadow: 0 10px 35px rgba(90, 110, 180, .25);
    }
    .hero p {
      margin: 0 auto;
      max-width: 760px;
      font-size: 22px;
      line-height: 1.8;
      color: #fff7df;
      text-shadow: 0 6px 20px rgba(80, 90, 130, .18);
    }
    .btn {
      display: inline-block;
      margin-top: 30px;
      padding: 15px 28px;
      background: linear-gradient(135deg, #f2d57e, #fff6c9);
      color: #6b4e14;
      text-decoration: none;
      font-weight: 800;
      border-radius: 999px;
      box-shadow: 0 18px 40px rgba(191, 145, 30, .22);
    }
    section {
      padding: 70px 24px;
    }
    .section-title {
      text-align: center;
      font-size: 36px;
      margin-bottom: 28px;
      color: #6e571e;
    }
    .grid {
      max-width: 1150px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 24px;
    }
    .card {
      background: rgba(255,255,255,.55);
      border: 1px solid rgba(255,255,255,.6);
      border-radius: 22px;
      padding: 28px;
      box-shadow: 0 16px 42px rgba(70, 90, 140, .10);
      backdrop-filter: blur(10px);
      color: #5b4b22;
    }
    .card h3 {
      margin-top: 0;
      font-size: 24px;
      color: #6b5418;
    }
    .card p {
      line-height: 1.75;
    }
    .story {
      max-width: 900px;
      margin: 0 auto;
      text-align: center;
      font-size: 19px;
      line-height: 1.9;
      color: #5f512a;
    }
    .cloud-band {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 22px;
    }
    .cloud {
      min-height: 180px;
      border-radius: 28px;
      background:
        radial-gradient(circle at 30% 30%, rgba(255,255,255,.92), rgba(255,255,255,.45) 45%, transparent 65%),
        radial-gradient(circle at 70% 35%, rgba(255,255,255,.85), rgba(255,255,255,.38) 45%, transparent 65%),
        linear-gradient(180deg, rgba(255,255,255,.45), rgba(255,255,255,.20));
      border: 1px solid rgba(255,255,255,.55);
      box-shadow: 0 14px 34px rgba(120, 140, 180, .10);
      display: flex;
      align-items: end;
      padding: 22px;
      color: #6d5922;
      font-weight: 700;
    }
    .cta-section {
      text-align: center;
      background: rgba(255,255,255,.35);
      border-top: 1px solid rgba(255,255,255,.55);
      border-bottom: 1px solid rgba(255,255,255,.55);
    }
    .cta-section h2 {
      font-size: 38px;
      margin: 0 0 12px;
      color: #6b5418;
    }
    .cta-section p {
      max-width: 760px;
      margin: 0 auto 18px;
      font-size: 19px;
      line-height: 1.8;
      color: #655625;
    }
    footer {
      text-align: center;
      padding: 36px 20px 50px;
      color: #7a6630;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <section class="hero">
    <div class="hero-inner">
      <h1>Welcome to Heaven</h1>
      <p>Step into a radiant place of peace, golden light, and celestial beauty where grace, warmth, and wonder meet.</p>
      <a class="btn" href="#welcome">Enter the Gates</a>
    </div>
  </section>

  <section id="welcome">
    <div class="section-title">A Divine Welcome</div>
    <div class="story">
      This page is designed to feel uplifting, luminous, and sacred — a soft heavenly atmosphere filled with clouds,
      warmth, elegance, and the promise of peace.
    </div>
  </section>

  <section>
    <div class="section-title">Celestial Highlights</div>
    <div class="grid">
      <div class="card"><h3>Golden Light</h3><p>Radiant tones and soft illumination create a peaceful, elevated feeling across the page.</p></div>
      <div class="card"><h3>Cloudlike Beauty</h3><p>Layered airy visuals and gentle gradients evoke a floating, serene heavenly atmosphere.</p></div>
      <div class="card"><h3>Angelic Calm</h3><p>Balanced spacing, uplifting language, and graceful styling give the page a divine presence.</p></div>
    </div>
  </section>

  <section>
    <div class="section-title">Heavenly Atmosphere</div>
    <div class="cloud-band">
      <div class="cloud">Peace that feels weightless and pure.</div>
      <div class="cloud">A place of welcome, beauty, and grace.</div>
      <div class="cloud">Golden calm rising through luminous clouds.</div>
    </div>
  </section>

  <section class="cta-section">
    <h2>Welcome to Eternal Light</h2>
    <p>Bring your heavenly concept to life with a page that feels radiant, gentle, elegant, and unforgettable.</p>
    <a class="btn" href="#welcome">Begin the Journey</a>
  </section>

  <footer>Heaven Page • Celestial beauty • Light, peace, and grace</footer>
</body>
</html>"""
        return {"title": title, "summary": summary, "html": html}

    if "startup" in text or "saas" in text or "software" in text or "app" in text:
        title = "Modern SaaS"
        summary = "Modern startup landing page"
        html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Modern SaaS</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(59,130,246,.20), transparent 35%),
        radial-gradient(circle at top right, rgba(139,92,246,.20), transparent 30%),
        #0b1020;
      color: #eef2ff;
    }
    .hero {
      padding: 110px 24px 80px;
      text-align: center;
    }
    .hero h1 {
      margin: 0;
      font-size: 58px;
      line-height: 1.1;
    }
    .hero p {
      max-width: 760px;
      margin: 20px auto 0;
      font-size: 20px;
      line-height: 1.7;
      color: #cbd5e1;
    }
    .hero-actions {
      margin-top: 28px;
      display: flex;
      justify-content: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 14px 24px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: bold;
    }
    .btn-primary {
      background: #4f46e5;
      color: white;
    }
    .btn-secondary {
      background: rgba(255,255,255,.08);
      color: white;
      border: 1px solid rgba(255,255,255,.12);
    }
    .features {
      max-width: 1150px;
      margin: 0 auto;
      padding: 20px 24px 80px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 24px;
    }
    .feature {
      background: rgba(15,23,42,.88);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 18px;
      padding: 28px;
    }
    footer {
      text-align: center;
      padding: 30px 20px 50px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <section class="hero">
    <h1>Modern SaaS</h1>
    <p>Launch faster with a sleek, high-converting platform designed to help your business scale with confidence.</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="#features">Start Free</a>
      <a class="btn btn-secondary" href="#features">See Features</a>
    </div>
  </section>
  <section id="features" class="features">
    <div class="feature"><h3>Fast Setup</h3><p>Get started in minutes with clean onboarding and simple workflows.</p></div>
    <div class="feature"><h3>Team Collaboration</h3><p>Invite your team, share progress, and keep everything aligned.</p></div>
    <div class="feature"><h3>Powerful Insights</h3><p>Track growth, monitor usage, and make better decisions with clarity.</p></div>
  </section>
  <footer>Modern SaaS • Smart workflows • Built for growth</footer>
</body>
</html>"""
        return {"title": title, "summary": summary, "html": html}

    title = "Modern Landing Page"
    summary = "Modern landing page"
    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Modern Landing Page</title>
<style>
* { box-sizing:border-box; }
body {
  margin:0;
  font-family:Arial, sans-serif;
  background:
    radial-gradient(circle at top left, rgba(79,70,229,.22), transparent 35%),
    radial-gradient(circle at top right, rgba(236,72,153,.18), transparent 30%),
    #0b1020;
  color:white;
}
.hero {
  min-height:80vh;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:80px 20px;
}
.hero-inner { max-width:800px; }
.hero h1 { font-size:56px; margin-bottom:20px; }
.hero p { font-size:20px; line-height:1.7; color:#dbe4ff; }
.cta-btn {
  margin-top:30px;
  display:inline-block;
  padding:14px 26px;
  background:#4f46e5;
  border-radius:10px;
  color:white;
  text-decoration:none;
  font-weight:bold;
}
</style>
</head>
<body>
<section class="hero">
  <div class="hero-inner">
    <h1>Modern Landing Page</h1>
    <p>Launch something beautiful and powerful using Simo’s AI builder.</p>
    <a class="cta-btn" href="#">Get Started</a>
  </div>
</section>
</body>
</html>"""
    return {"title": title, "summary": summary, "html": html}


# -----------------------------
# Debug routes
# -----------------------------
@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "message": "Simo is alive",
        "base_url": BASE_URL,
    })


@app.get("/debug-routes")
def debug_routes():
    return jsonify({
        "ok": True,
        "message": "This is the live app.py",
        "base_url": BASE_URL,
        "google_callback": f"{BASE_URL}/auth/google/callback",
        "request_host_url": request.host_url,
        "request_url_root": request.url_root,
        "google_configured": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET),
    })


if not IS_PRODUCTION:
    @app.get("/debug-force-pro")
    def debug_force_pro():
        email = (session.get("user_email") or "").strip().lower()
        if not email:
            return jsonify({"ok": False, "error": "No logged in user."}), 400

        save_user_plan(email, "single")
        session["plan"] = "single"

        return jsonify({
            "ok": True,
            "message": "User upgraded to Pro.",
            "email": email,
            "plan": "single",
        })

# -----------------------------
# UI
# -----------------------------
@app.get("/")
def home():
    return render_template("landing.html")


@app.get("/app")
def simo_app():
    plan, _, is_team = get_plan()
    return render_template(
        "index.html",
        stripe_pk=STRIPE_PUBLISHABLE_KEY,
        stripe_mode=STRIPE_MODE,
        free_limit=FREE_DAILY_LIMIT,
        plan=plan,
        is_team=is_team,
        user_email=session.get("user_email"),
    )


# -----------------------------
# API: status / me
# -----------------------------
@app.get("/api/status")
def api_status():
    return jsonify(usage_status())


@app.get("/api/me")
def api_me():
    plan, _, is_team = get_plan()
    return jsonify(
        {
            "ok": True,
            "logged_in": bool(session.get("user_email")),
            "email": session.get("user_email"),
            "plan": plan,
            "is_team": is_team,
        }
    )


# -----------------------------
# API: publish
# -----------------------------
@app.post("/api/publish")
def api_publish():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "published-page").strip()
    html = data.get("html") or ""

    if not isinstance(html, str) or not html.strip():
        return jsonify({"ok": False, "error": "No HTML provided."}), 400

    site_id = make_publish_id(title)
    html_path = published_html_path(site_id)
    meta_path = published_meta_path(site_id)

    try:
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)

        meta = {
            "site_id": site_id,
            "title": title,
            "published_at_utc": utc_now().isoformat(),
            "published_by": session.get("user_email"),
            "plan": session.get("plan", "free"),
        }
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        public_url = f"{BASE_URL}/p/{site_id}"
        return jsonify(
            {
                "ok": True,
                "site_id": site_id,
                "url": public_url,
                "title": title,
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"Publish error: {str(e)}"}), 500


@app.get("/p/<site_id>")
def view_published_site(site_id):
    html_path = published_html_path(site_id)
    if not os.path.exists(html_path):
        abort(404)

    try:
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()
        return Response(html, mimetype="text/html")
    except Exception:
        abort(404)


# -----------------------------
# API: chat
# -----------------------------
@app.post("/api/chat")
def api_chat():
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    history = data.get("history") or []
    settings = data.get("settings") or {}
    mode = (data.get("mode") or "").strip().lower()

    if not text:
        return jsonify({"ok": False, "error": "Empty message."}), 400

    st = usage_status()
    plan = st["plan"]
    used = st["used_today"]

    if plan == "free" and used >= FREE_DAILY_LIMIT:
        return jsonify({"ok": False, "error": "Daily limit reached. Upgrade to continue."}), 402

    bump_daily_usage()

    last_builder = get_last_builder_memory()
    should_continue_builder = bool(last_builder and is_builder_followup(text))
    explicit_builder_mode = mode == "builder"

    if explicit_builder_mode:
        if last_builder and is_builder_followup(text):
            builder = ai_builder_edit(last_builder, text)
        else:
            builder = ai_generate_builder_html(text)

        store_last_builder_memory(builder)

        return jsonify(
            {
                "ok": True,
                "answer": builder["summary"],
                "mode": "builder",
                "builder": builder,
            }
        )

    if should_continue_builder:
        builder = ai_builder_edit(last_builder, text)
        store_last_builder_memory(builder)

        return jsonify(
            {
                "ok": True,
                "answer": builder["summary"],
                "mode": "builder",
                "builder": builder,
            }
        )

    if not oa_client:
        return jsonify(
            {
                "ok": True,
                "answer": "It looks like you're testing things out! How can I assist you today?",
            }
        )

    msgs = [{"role": "system", "content": friendly_system_prompt(settings)}]

    last_image_mem = get_last_image_memory()
    if last_image_mem and is_image_followup(text):
        msgs.append(
            {
                "role": "system",
                "content": (
                    "Use this recent image-analysis memory for follow-up questions.\n"
                    f"User's last image prompt: {last_image_mem['prompt'] or '[none]'}\n"
                    f"Last image analysis: {last_image_mem['answer']}\n"
                    "If the user asks about the image, answer from this memory directly and naturally."
                ),
            }
        )

    msgs.extend(safe_history_from_list(history, limit=16))
    msgs.append({"role": "user", "content": text})

    try:
        resp = oa_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=msgs,
            temperature=0.7,
        )
        answer = resp.choices[0].message.content or ""
        return jsonify({"ok": True, "answer": answer})
    except Exception as e:
        return jsonify({"ok": False, "error": f"AI error: {str(e)}"}), 500


# -----------------------------
# API: HTML download
# -----------------------------
@app.post("/api/download-html")
def api_download_html():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "simo-project").strip()
    html = data.get("html") or ""

    if not isinstance(html, str) or not html.strip():
        return jsonify({"ok": False, "error": "No HTML provided."}), 400

    filename = f"{sanitize_filename(title)}.html"
    mem = io.BytesIO(html.encode("utf-8"))
    mem.seek(0)

    return send_file(
        mem,
        mimetype="text/html; charset=utf-8",
        as_attachment=True,
        download_name=filename,
    )


# -----------------------------
# Stripe checkout
# -----------------------------
@app.post("/api/create-checkout-session")
def create_checkout_session():
    data = request.get_json(force=True, silent=True) or {}
    plan_key = (data.get("plan") or "").strip()
    price_id = PRICE_MAP.get(plan_key, "")

    if not STRIPE_SECRET_KEY:
        return jsonify({"ok": False, "error": "Stripe is not configured (missing STRIPE_SECRET_KEY)."}), 500

    if not price_id:
        return jsonify({"ok": False, "error": "Invalid plan."}), 400

    try:
        success = f"{BASE_URL}/billing/success?plan={quote(plan_key)}"
        cancel = f"{BASE_URL}/billing/cancel"

        checkout = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success,
            cancel_url=cancel,
            customer_email=(session.get("user_email") or None),
        )
        return jsonify({"ok": True, "url": checkout.url})
    except Exception as e:
        return jsonify({"ok": False, "error": f"Stripe error: {str(e)}"}), 500


@app.get("/billing/success")
def billing_success():
    plan_key = request.args.get("plan", "")
    plan = PLAN_AFTER_SUCCESS.get(plan_key, "free")
    set_plan(plan)
    return redirect(url_for("simo_app"))


@app.get("/billing/cancel")
def billing_cancel():
    return redirect(url_for("simo_app"))


# -----------------------------
# Google login
# -----------------------------
@app.get("/login")
def login():
    if "google" not in oauth._clients:
        return redirect(url_for("home"))

    redirect_uri = f"{BASE_URL}/auth/google/callback"
    nonce = secrets.token_urlsafe(24)
    session["oauth_nonce"] = nonce

    return oauth.google.authorize_redirect(redirect_uri, nonce=nonce)


@app.get("/auth/google/callback")
def google_callback():
    if "google" not in oauth._clients:
        return redirect(url_for("simo_app"))

    token = oauth.google.authorize_access_token()

    nonce = session.get("oauth_nonce")
    if not nonce:
        return redirect(url_for("login"))

    userinfo = oauth.google.parse_id_token(token, nonce=nonce)
    email = (userinfo.get("email") or "").strip().lower()

    if email:
        session["user_email"] = email
        ensure_user_record(email)

        pro_active = False
        try:
            customers = stripe.Customer.list(email=email).data
            if customers:
                customer_id = customers[0].id
                subs = stripe.Subscription.list(
                    customer=customer_id,
                    status="active"
                ).data
                if subs:
                    pro_active = True
        except Exception as e:
            print("Stripe check failed:", e)

        if pro_active:
            session["plan"] = "single"
            save_user_plan(email, "single")
        else:
            row = get_user_record(email)
            if row and row.get("plan") in ("free", "single", "team"):
                session["plan"] = row["plan"]
            else:
                session["plan"] = "free"

    session.pop("oauth_nonce", None)
    return redirect(url_for("home"))


@app.get("/logout")
def logout():
    session.pop("user_email", None)
    session.pop("plan", None)
    session.pop("oauth_nonce", None)
    clear_last_image_memory()
    clear_last_builder_memory()
    return redirect(url_for("home"))


# -----------------------------
# Image upload (vision + history + memory)
# -----------------------------
@app.post("/api/image")
def api_image():
    if "image" not in request.files:
        return jsonify({"ok": False, "error": "No image uploaded."}), 400

    f = request.files["image"]
    if not f or not f.filename:
        return jsonify({"ok": False, "error": "Invalid image."}), 400

    user_text = (request.form.get("text") or "").strip()

    raw_history = request.form.get("history", "[]")
    raw_settings = request.form.get("settings", "{}")

    try:
        history = json.loads(raw_history)
    except Exception:
        history = []

    try:
        settings = json.loads(raw_settings)
    except Exception:
        settings = {}

    st = usage_status()
    plan = st["plan"]
    used = st["used_today"]

    if plan == "free" and used >= FREE_DAILY_LIMIT:
        return jsonify({"ok": False, "error": "Daily limit reached. Upgrade to continue."}), 402

    img_bytes = f.read()
    if not img_bytes:
        return jsonify({"ok": False, "error": "Empty image."}), 400

    bump_daily_usage()

    if not oa_client:
        fallback_text = user_text or "I received your image."
        fallback_answer = f"{fallback_text} (Vision isn’t configured yet — add OPENAI_API_KEY to enable full image analysis.)"
        store_last_image_memory(user_text, fallback_answer)
        return jsonify({"ok": True, "answer": fallback_answer})

    b64 = base64.b64encode(img_bytes).decode("utf-8")
    mime = f.mimetype or "image/png"
    data_url = f"data:{mime};base64,{b64}"

    user_prompt = user_text or "Describe this image clearly and helpfully."

    msgs = [
        {
            "role": "system",
            "content": (
                friendly_system_prompt(settings)
                + " When the user uploads an image, analyze it carefully. "
                + "Use recent conversation context when it is relevant. "
                + "If the user asked a specific question about the image, answer that directly. "
                + "If there is visible text in the image, include it when relevant."
            ),
        }
    ]

    msgs.extend(safe_history_from_list(history, limit=12))

    msgs.append(
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }
    )

    try:
        resp = oa_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=msgs,
            temperature=0.3,
        )
        answer = resp.choices[0].message.content or ""
        store_last_image_memory(user_prompt, answer)
        return jsonify({"ok": True, "answer": answer})
    except Exception as e:
        return jsonify({"ok": False, "error": f"Vision error: {str(e)}"}), 500


# -----------------------------
# SEO / marketing pages
# -----------------------------
@app.get("/ai-tools")
def ai_tools():
    return render_template("ai-tools.html")


init_db()

SEO_PAGES = {
    "ai-website-builder": {
        "meta_title": "Free AI Website Builder | Simo",
        "meta_description": "Create websites faster with Simo, an AI assistant that chats naturally and helps generate websites, pages, and ideas in seconds.",
        "eyebrow": "AI Website Builder",
        "hero_title": "Free AI Website Builder",
        "hero_description": "Simo helps you generate website ideas, landing page copy, layouts, and starter content faster so you can go from blank page to working concept in minutes.",
        "example_prompt": "Build me a modern bakery landing page with a hero section, menu highlights, testimonials, and a strong call to action.",
        "example_output": "Simo can help you structure the page, write persuasive copy, suggest sections, improve messaging, and support your build workflow so your site comes together much faster.",
        "benefits_title": "Why use Simo as your AI website builder",
        "benefits_lead": "Simo is built to help creators, founders, and builders move faster with websites, landing pages, and project ideas.",
        "pills": [
            "Landing pages",
            "Site copy help",
            "Fast brainstorming",
            "Simple workflow"
        ],
        "features": [
            {
                "title": "Generate website ideas faster",
                "text": "Use Simo to brainstorm page layouts, headlines, sections, offers, and calls to action when you do not want to start from scratch."
            },
            {
                "title": "Improve your website messaging",
                "text": "Simo can help refine wording, positioning, and structure so your site is clearer, stronger, and easier for visitors to understand."
            },
            {
                "title": "Go from concept to launch faster",
                "text": "Whether you are building a startup page, portfolio, business site, or niche tool page, Simo helps speed up the creative process."
            }
        ],
        "how_it_works_lead": "Use Simo to describe what you want, refine the result, and continue shaping your page or concept step by step.",
        "steps": [
            {
                "title": "Describe your website idea",
                "text": "Tell Simo what kind of website you want to create, who it is for, and what style or sections you need."
            },
            {
                "title": "Refine the content",
                "text": "Ask for stronger headlines, clearer copy, better structure, or additional sections until the concept feels right."
            },
            {
                "title": "Keep building with confidence",
                "text": "Use the output as your launch pad for website creation, iteration, and polishing."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo help with landing pages?",
                "a": "Yes. Simo can help you brainstorm, structure, and improve landing pages for businesses, startups, portfolios, and creative projects."
            },
            {
                "q": "Is Simo only for developers?",
                "a": "No. Simo is designed to be useful for non-technical founders, creators, students, and anyone who wants help shaping a website idea."
            },
            {
                "q": "Can I use Simo for different types of sites?",
                "a": "Yes. You can use Simo for business pages, portfolios, personal brands, startup sites, niche offers, and more."
            }
        ],
        "cta_title": "Start building your website idea with Simo",
        "cta_text": "Use Simo to brainstorm, refine, and move faster on your next website or landing page.",
        "cta_button": "Try Simo Free",
        "footer_text": "AI chat, image analysis, and website help in one place."
    },

    "image-analyzer": {
        "meta_title": "AI Image Analyzer | Simo",
        "meta_description": "Analyze images with Simo. Get help understanding visuals, screenshots, design ideas, and image-based questions in one place.",
        "eyebrow": "AI Image Analysis",
        "hero_title": "AI Image Analyzer",
        "hero_description": "Simo helps you understand images, screenshots, visuals, and design references so you can ask questions and get useful guidance faster.",
        "example_prompt": "Analyze this screenshot and tell me what is going wrong with the form submission.",
        "example_output": "Simo can help identify visible issues, explain what the screen shows, point out likely causes, and help you decide the best next step.",
        "benefits_title": "Why use Simo for image analysis",
        "benefits_lead": "Simo combines natural conversation with image understanding, so you can ask follow-up questions instead of using a one-step tool.",
        "pills": [
            "Screenshot help",
            "Visual understanding",
            "Design feedback",
            "Follow-up questions"
        ],
        "features": [
            {
                "title": "Understand screenshots faster",
                "text": "Use Simo to review UI screenshots, form errors, layouts, and visual states so you can quickly understand what is happening."
            },
            {
                "title": "Ask follow-up questions naturally",
                "text": "Instead of receiving a single flat result, you can keep asking questions and digging deeper into the same image or context."
            },
            {
                "title": "Useful for creators and builders",
                "text": "Simo can help with designs, interfaces, mockups, references, diagrams, and everyday visual troubleshooting."
            }
        ],
        "how_it_works_lead": "Upload or share an image, ask what you want to know, and continue the conversation naturally.",
        "steps": [
            {
                "title": "Share an image or screenshot",
                "text": "Bring in a screenshot, visual, design reference, or other image you want help understanding."
            },
            {
                "title": "Ask a direct question",
                "text": "Ask what is happening, what stands out, what may be wrong, or what changes might help."
            },
            {
                "title": "Go deeper with follow-ups",
                "text": "Keep refining the discussion with additional questions based on the image and prior answers."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo analyze screenshots?",
                "a": "Yes. Simo can help you interpret screenshots, interface states, visible messages, and other on-screen details."
            },
            {
                "q": "Can I ask follow-up questions about the same image?",
                "a": "Yes. That is one of the strengths of using Simo instead of a one-shot tool."
            },
            {
                "q": "Is Simo useful for design feedback too?",
                "a": "Yes. You can use Simo to discuss layouts, visuals, style direction, and what might improve a design."
            }
        ],
        "cta_title": "Use Simo to understand images faster",
        "cta_text": "Analyze screenshots, ask questions, and keep the conversation going with Simo.",
        "cta_button": "Try Simo Free",
        "footer_text": "AI chat, image analysis, and creative help in one place."
    },

    "chatgpt-alternative": {
        "meta_title": "ChatGPT Alternative | Simo",
        "meta_description": "Looking for a ChatGPT alternative? Simo combines AI chat, image analysis, and website help in one platform.",
        "eyebrow": "AI Chat Alternative",
        "hero_title": "A ChatGPT Alternative with More Creative Utility",
        "hero_description": "Simo is an AI assistant built for people who want natural conversation plus help with images, websites, ideas, and projects all in one place.",
        "example_prompt": "Help me come up with a launch tagline, improve my product description, and then help me build the landing page.",
        "example_output": "Simo is designed to support a fuller workflow, not just isolated answers, so you can continue from ideas into execution more smoothly.",
        "benefits_title": "Why people explore Simo as an AI alternative",
        "benefits_lead": "Simo is designed for users who want a best-friend style AI experience combined with practical creative assistance.",
        "pills": [
            "Natural chat",
            "Image help",
            "Website support",
            "Project guidance"
        ],
        "features": [
            {
                "title": "More than conversation",
                "text": "Simo supports natural AI chat while also helping with images, website ideas, positioning, and project thinking."
            },
            {
                "title": "Built for creators and founders",
                "text": "Whether you are launching a product, improving a page, or exploring an idea, Simo is built to be useful across real workflows."
            },
            {
                "title": "Simple all-in-one experience",
                "text": "Instead of jumping between separate tools, Simo brings several useful AI capabilities together in one place."
            }
        ],
        "how_it_works_lead": "Start with a question, keep refining the conversation, and use Simo across multiple types of tasks.",
        "steps": [
            {
                "title": "Ask naturally",
                "text": "Start with a question, task, idea, or challenge in plain language."
            },
            {
                "title": "Expand the workflow",
                "text": "Move from brainstorming into editing, image analysis, or website-related help without switching tools."
            },
            {
                "title": "Keep building momentum",
                "text": "Continue the conversation until your idea, content, or project is stronger and clearer."
            }
        ],
        "faqs": [
            {
                "q": "What makes Simo different?",
                "a": "Simo combines conversational AI with image understanding and website-related creative help in one platform."
            },
            {
                "q": "Can Simo help with more than simple chat?",
                "a": "Yes. Simo is meant to support broader creative and practical tasks, including image discussion and website workflow help."
            },
            {
                "q": "Who is Simo for?",
                "a": "Simo is useful for founders, creators, students, builders, and curious users who want an AI assistant that feels more versatile."
            }
        ],
        "cta_title": "Try a more versatile AI experience",
        "cta_text": "Use Simo for conversation, creative help, image understanding, and project support.",
        "cta_button": "Try Simo Free",
        "footer_text": "A flexible AI assistant for chat, images, and creative work."
    },

    "resume-builder": {
        "meta_title": "AI Resume Builder | Simo",
        "meta_description": "Use Simo to improve resume wording, structure, and presentation so you can create a stronger resume faster.",
        "eyebrow": "AI Resume Help",
        "hero_title": "AI Resume Builder",
        "hero_description": "Simo helps you improve resume wording, organize experience, refine bullet points, and present your skills more clearly.",
        "example_prompt": "Rewrite my resume bullet points to sound stronger and more results-focused for a customer service role.",
        "example_output": "Simo can help sharpen wording, strengthen descriptions, and improve how your experience is presented so your resume reads more clearly and professionally.",
        "benefits_title": "Why use Simo for resume help",
        "benefits_lead": "A stronger resume often comes down to clearer wording, better structure, and more confident positioning.",
        "pills": [
            "Resume wording",
            "Bullet point help",
            "Clearer structure",
            "Stronger presentation"
        ],
        "features": [
            {
                "title": "Improve wording and clarity",
                "text": "Use Simo to rewrite vague resume lines into clearer, stronger descriptions that communicate your value better."
            },
            {
                "title": "Organize your experience",
                "text": "Simo can help you group experience, refine sections, and improve the overall structure of your resume."
            },
            {
                "title": "Adapt for different opportunities",
                "text": "You can ask Simo to help tailor your resume language for different roles, industries, or goals."
            }
        ],
        "how_it_works_lead": "Share your resume content, ask what kind of role you want, and refine the wording step by step.",
        "steps": [
            {
                "title": "Paste your resume details",
                "text": "Share your current bullet points, experience, or summary so Simo has a starting point."
            },
            {
                "title": "Ask for improvements",
                "text": "Request stronger wording, clearer structure, better tone, or more professional phrasing."
            },
            {
                "title": "Refine for your target role",
                "text": "Continue adjusting the content so it fits the role or direction you want to pursue."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo rewrite resume bullet points?",
                "a": "Yes. Simo can help make resume bullet points clearer, stronger, and easier for employers to understand."
            },
            {
                "q": "Can Simo help with resume summaries too?",
                "a": "Yes. You can ask Simo to improve your summary, skills presentation, and overall resume language."
            },
            {
                "q": "Is Simo useful if I am changing careers?",
                "a": "Yes. Simo can help you reposition your experience so it speaks more clearly to a new direction."
            }
        ],
        "cta_title": "Strengthen your resume with Simo",
        "cta_text": "Use Simo to rewrite, refine, and improve your resume content faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Resume help, AI chat, and practical writing support in one place."
    },

            "ai-landing-page-generator": {
        "meta_title": "AI Landing Page Generator | Simo",
        "meta_description": "Use Simo to brainstorm, write, and improve landing pages faster with AI-powered website and copy help.",
        "eyebrow": "AI Landing Page Help",
        "hero_title": "AI Landing Page Generator",
        "hero_description": "Simo helps you create landing page ideas, headlines, sections, offers, and calls to action faster so you can move from concept to launch with less friction.",
        "example_prompt": "Create a landing page for an AI app that helps users analyze images and build websites.",
        "example_output": "Simo can help structure the page, sharpen the messaging, improve the hero section, and guide the overall landing page flow so it feels more polished and launch-ready.",
        "benefits_title": "Why use Simo for landing pages",
        "benefits_lead": "Strong landing pages usually need clear positioning, persuasive copy, and better structure. Simo helps with all three.",
        "pills": [
            "Hero sections",
            "Landing page copy",
            "CTA ideas",
            "Page structure"
        ],
        "features": [
            {
                "title": "Write stronger landing page copy",
                "text": "Use Simo to improve headlines, subheadings, value propositions, and calls to action so your landing page is clearer and more persuasive."
            },
            {
                "title": "Structure the page faster",
                "text": "Simo can help organize the hero, features, testimonials, pricing, and CTA sections so you are not starting from a blank page."
            },
            {
                "title": "Refine your positioning",
                "text": "Use Simo to clarify who the page is for, what problem it solves, and why visitors should care."
            }
        ],
        "how_it_works_lead": "Describe your product or idea, ask for a landing page direction, and keep refining until the page feels stronger.",
        "steps": [
            {
                "title": "Describe the offer",
                "text": "Tell Simo what your product, service, or business does and who it is for."
            },
            {
                "title": "Generate the landing page direction",
                "text": "Ask for sections, headlines, messaging, and offers that fit the audience and goal."
            },
            {
                "title": "Refine and improve",
                "text": "Keep improving the copy and structure until the page feels launch-ready."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo help write landing page headlines?",
                "a": "Yes. Simo can help generate and improve headlines, supporting text, and calls to action."
            },
            {
                "q": "Can Simo help with landing page structure too?",
                "a": "Yes. Simo can suggest the best order of sections and improve overall page flow."
            },
            {
                "q": "Is this useful for startups and small businesses?",
                "a": "Yes. Simo is especially useful for founders and creators who need help shaping landing pages quickly."
            }
        ],
        "cta_title": "Build your landing page faster with Simo",
        "cta_text": "Use Simo to improve your landing page copy, structure, and positioning in one place.",
        "cta_button": "Try Simo Free",
        "footer_text": "AI chat, image analysis, and landing page support in one place."
    },

    "ai-product-description-generator": {
        "meta_title": "AI Product Description Generator | Simo",
        "meta_description": "Use Simo to write and improve product descriptions for websites, offers, and online products faster.",
        "eyebrow": "AI Product Writing",
        "hero_title": "AI Product Description Generator",
        "hero_description": "Simo helps you write stronger product descriptions by improving clarity, benefits, positioning, and overall presentation.",
        "example_prompt": "Write a product description for an AI assistant that chats, analyzes images, and helps build websites.",
        "example_output": "Simo can help create clear product descriptions that explain what the offer does, who it helps, and why it matters without sounding flat or generic.",
        "benefits_title": "Why use Simo for product descriptions",
        "benefits_lead": "A strong product description can improve understanding, conversions, and how polished your offer feels.",
        "pills": [
            "Clear benefits",
            "Better product copy",
            "Stronger positioning",
            "Faster writing"
        ],
        "features": [
            {
                "title": "Turn features into benefits",
                "text": "Simo helps rewrite feature-heavy product text into benefit-driven language that is easier for customers to understand."
            },
            {
                "title": "Improve clarity and polish",
                "text": "Use Simo to make product descriptions smoother, clearer, and more persuasive."
            },
            {
                "title": "Adapt for different audiences",
                "text": "You can ask Simo to make the description more premium, casual, direct, technical, or creator-focused depending on your needs."
            }
        ],
        "how_it_works_lead": "Share what your product does, who it helps, and the tone you want, then refine the result step by step.",
        "steps": [
            {
                "title": "Describe the product",
                "text": "Tell Simo what your product is, what it does, and what makes it useful."
            },
            {
                "title": "Generate product copy",
                "text": "Ask for a product description in the style or tone you want."
            },
            {
                "title": "Refine the wording",
                "text": "Improve clarity, strength, emotion, or positioning until it feels right."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo write descriptions for digital products?",
                "a": "Yes. Simo works well for apps, tools, software, websites, and online offers."
            },
            {
                "q": "Can Simo rewrite existing product descriptions?",
                "a": "Yes. You can paste an existing description and ask Simo to improve it."
            },
            {
                "q": "Can Simo help with tone too?",
                "a": "Yes. You can ask for more premium, friendly, direct, or conversion-focused wording."
            }
        ],
        "cta_title": "Write stronger product descriptions with Simo",
        "cta_text": "Use Simo to create clearer, better-positioned product copy faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Product copy, AI chat, and creative help in one place."
    },

    "ai-marketing-copy-generator": {
        "meta_title": "AI Marketing Copy Generator | Simo",
        "meta_description": "Generate marketing copy with Simo for websites, product pages, launches, and campaigns.",
        "eyebrow": "AI Marketing Copy",
        "hero_title": "AI Marketing Copy Generator",
        "hero_description": "Simo helps you brainstorm and write stronger marketing copy for websites, launches, social posts, and product messaging.",
        "example_prompt": "Write launch copy for an AI platform called Simo that chats naturally, analyzes images, and builds websites.",
        "example_output": "Simo can help create stronger launch messaging, promotional language, feature framing, and campaign direction so your marketing feels more focused and compelling.",
        "benefits_title": "Why use Simo for marketing copy",
        "benefits_lead": "Good marketing copy needs clarity, rhythm, positioning, and persuasion. Simo helps you shape all of it faster.",
        "pills": [
            "Launch copy",
            "Ad angles",
            "Website messaging",
            "Promo writing"
        ],
        "features": [
            {
                "title": "Write clearer promotional messaging",
                "text": "Use Simo to improve how your offer is explained and promoted across websites, posts, and campaigns."
            },
            {
                "title": "Find better marketing angles",
                "text": "Simo can help brainstorm different ways to frame the same product depending on your audience and goals."
            },
            {
                "title": "Move faster on campaigns",
                "text": "Instead of struggling with blank-page syndrome, use Simo to generate a starting point and refine from there."
            }
        ],
        "how_it_works_lead": "Describe what you are promoting, what audience you want to reach, and the style you want to use.",
        "steps": [
            {
                "title": "Define the offer",
                "text": "Explain what you are launching or promoting and what outcome you want from the copy."
            },
            {
                "title": "Generate the marketing direction",
                "text": "Ask Simo for taglines, ads, launch copy, email copy, or promotional text."
            },
            {
                "title": "Refine the final message",
                "text": "Improve tone, strength, clarity, and positioning until the copy feels right."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo help with launch copy?",
                "a": "Yes. Simo can help write and improve launch copy for products, websites, and announcements."
            },
            {
                "q": "Can Simo help with ad copy too?",
                "a": "Yes. Simo can help brainstorm shorter promotional angles and ad-style messaging."
            },
            {
                "q": "Can I use Simo for different tones?",
                "a": "Yes. You can ask for premium, direct, playful, professional, or more emotional marketing copy."
            }
        ],
        "cta_title": "Create stronger marketing copy with Simo",
        "cta_text": "Use Simo to brainstorm, write, and improve your promotional messaging faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "AI marketing help, copy generation, and creative support in one place."
    },

    "ai-pitch-generator": {
        "meta_title": "AI Pitch Generator | Simo",
        "meta_description": "Use Simo to shape pitches for startups, products, ideas, and offers with clearer messaging and structure.",
        "eyebrow": "AI Pitch Help",
        "hero_title": "AI Pitch Generator",
        "hero_description": "Simo helps you explain your idea more clearly by improving your pitch, sharpening the message, and organizing the structure.",
        "example_prompt": "Help me pitch Simo as an all-in-one AI that chats, analyzes images, and builds websites.",
        "example_output": "Simo can help simplify your idea, strengthen the value proposition, and make the pitch more memorable for users, customers, or investors.",
        "benefits_title": "Why use Simo for pitching ideas",
        "benefits_lead": "The strongest pitches are usually simple, clear, and easy to repeat. Simo helps you get there faster.",
        "pills": [
            "Startup pitches",
            "Product positioning",
            "Clear messaging",
            "Stronger framing"
        ],
        "features": [
            {
                "title": "Clarify the idea quickly",
                "text": "Simo helps reduce confusion by shaping your pitch into a clearer, easier-to-understand explanation."
            },
            {
                "title": "Improve the value proposition",
                "text": "Use Simo to explain what makes your idea useful, different, and worth attention."
            },
            {
                "title": "Adapt the pitch by audience",
                "text": "Ask Simo to shape your pitch for users, investors, partners, or general audiences."
            }
        ],
        "how_it_works_lead": "Share your idea, explain your audience, and refine the pitch until it feels confident and strong.",
        "steps": [
            {
                "title": "Describe the idea",
                "text": "Tell Simo what you are building and why it matters."
            },
            {
                "title": "Generate a pitch direction",
                "text": "Ask for a short pitch, longer pitch, one-liner, or positioning statement."
            },
            {
                "title": "Refine for impact",
                "text": "Make the pitch simpler, stronger, cleaner, or more memorable depending on your goal."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo help write startup pitches?",
                "a": "Yes. Simo can help shape startup and product pitches for many different audiences."
            },
            {
                "q": "Can Simo make my pitch more concise?",
                "a": "Yes. You can ask Simo to make it shorter, sharper, and easier to repeat."
            },
            {
                "q": "Can I use Simo for investor-style pitches too?",
                "a": "Yes. Simo can help improve framing, structure, and explanation for early-stage business ideas."
            }
        ],
        "cta_title": "Shape a stronger pitch with Simo",
        "cta_text": "Use Simo to clarify, organize, and improve the way you explain your idea.",
        "cta_button": "Try Simo Free",
        "footer_text": "Pitch help, AI chat, and practical idea support in one place."
    },

    "ai-brainstorming-tool": {
        "meta_title": "AI Brainstorming Tool | Simo",
        "meta_description": "Brainstorm ideas faster with Simo for products, websites, startups, content, and creative projects.",
        "eyebrow": "AI Brainstorming",
        "hero_title": "AI Brainstorming Tool",
        "hero_description": "Simo helps you break through blank-page moments by generating ideas, directions, names, angles, and next steps faster.",
        "example_prompt": "Help me brainstorm ideas for growing an AI startup that can chat, analyze images, and build websites.",
        "example_output": "Simo can help generate options, compare directions, expand ideas, and continue the discussion so your thinking gains momentum instead of stalling.",
        "benefits_title": "Why use Simo for brainstorming",
        "benefits_lead": "Great brainstorming often comes from momentum and follow-up questions, not just one answer. Simo helps keep that momentum going.",
        "pills": [
            "Idea generation",
            "Creative thinking",
            "Startup brainstorming",
            "Project planning"
        ],
        "features": [
            {
                "title": "Generate more ideas faster",
                "text": "Use Simo to brainstorm names, product angles, website ideas, messaging directions, features, and growth concepts."
            },
            {
                "title": "Ask follow-up questions naturally",
                "text": "Instead of a one-shot tool, Simo lets you keep refining the same idea and go deeper in conversation."
            },
            {
                "title": "Useful across many projects",
                "text": "Simo can help with business ideas, creative work, branding, product strategy, writing, and more."
            }
        ],
        "how_it_works_lead": "Start with a rough thought, ask for more directions, and keep refining until the idea becomes clearer.",
        "steps": [
            {
                "title": "Start with the seed idea",
                "text": "Share the rough concept, problem, or area you want to brainstorm."
            },
            {
                "title": "Generate possibilities",
                "text": "Ask Simo for options, categories, styles, or different ways to think about the same thing."
            },
            {
                "title": "Refine the strongest path",
                "text": "Pick the best direction and keep expanding it until it becomes more real and actionable."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo help brainstorm startup ideas?",
                "a": "Yes. Simo is useful for brainstorming startup ideas, features, branding angles, and launch paths."
            },
            {
                "q": "Can Simo help with creative projects too?",
                "a": "Yes. Simo can help brainstorm writing, websites, branding, visual concepts, and project direction."
            },
            {
                "q": "What makes Simo good for brainstorming?",
                "a": "Simo supports natural follow-up conversation, which helps ideas evolve instead of ending after one answer."
            }
        ],
        "cta_title": "Break through blank-page moments with Simo",
        "cta_text": "Use Simo to generate ideas, directions, and next steps faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Brainstorming help, AI chat, and creative support in one place."
    },

    "ai-startup-idea-generator": {
        "meta_title": "AI Startup Idea Generator | Simo",
        "meta_description": "Generate startup ideas and refine business concepts with Simo using conversational AI and practical planning help.",
        "eyebrow": "AI Startup Ideas",
        "hero_title": "AI Startup Idea Generator",
        "hero_description": "Simo helps you brainstorm startup ideas, shape business concepts, and turn rough thoughts into clearer opportunities.",
        "example_prompt": "Give me startup ideas around AI, real estate, and productivity that could become real businesses.",
        "example_output": "Simo can help generate startup concepts, compare opportunities, shape positioning, and guide the thinking toward ideas that feel more real and useful.",
        "benefits_title": "Why use Simo for startup ideas",
        "benefits_lead": "The best startup ideas usually need more than inspiration. They need clearer structure, audience thinking, and follow-up refinement.",
        "pills": [
            "Startup concepts",
            "Business ideas",
            "Audience thinking",
            "Positioning help"
        ],
        "features": [
            {
                "title": "Generate business ideas faster",
                "text": "Use Simo to brainstorm startup opportunities across AI, software, services, marketplaces, and creative businesses."
            },
            {
                "title": "Evaluate ideas more clearly",
                "text": "Simo can help compare different startup concepts and think through who they help and why they matter."
            },
            {
                "title": "Refine into something stronger",
                "text": "Go from rough idea to more structured concept by discussing value proposition, audience, and launch path."
            }
        ],
        "how_it_works_lead": "Share the types of industries, problems, or interests you care about, then refine the best idea step by step.",
        "steps": [
            {
                "title": "Choose a direction",
                "text": "Tell Simo what topics, industries, or types of problems interest you."
            },
            {
                "title": "Generate startup ideas",
                "text": "Ask for different concepts, variations, and possible business models."
            },
            {
                "title": "Develop the strongest one",
                "text": "Take the best concept and keep refining it until it feels worth pursuing."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo generate startup ideas in specific industries?",
                "a": "Yes. You can ask for startup ideas in AI, real estate, productivity, education, creator tools, and many more categories."
            },
            {
                "q": "Can Simo help evaluate which idea is strongest?",
                "a": "Yes. Simo can help compare ideas based on audience, practicality, and positioning."
            },
            {
                "q": "Can Simo help after the idea stage too?",
                "a": "Yes. Simo can also help with business plans, pitches, messaging, and landing page thinking."
            }
        ],
        "cta_title": "Generate startup ideas with Simo",
        "cta_text": "Use Simo to brainstorm, compare, and refine business concepts faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Startup ideas, planning help, and AI support in one place."
    },

    "ai-writing-assistant": {
        "meta_title": "AI Writing Assistant | Simo",
        "meta_description": "Use Simo as an AI writing assistant for clearer wording, stronger structure, and faster idea-to-draft progress.",
        "eyebrow": "AI Writing Help",
        "hero_title": "AI Writing Assistant",
        "hero_description": "Simo helps with writing tasks by improving wording, structure, flow, and clarity across many types of content.",
        "example_prompt": "Help me rewrite this paragraph so it sounds more polished, clear, and professional.",
        "example_output": "Simo can help improve sentence flow, reduce awkward phrasing, strengthen tone, and make your writing easier to read and understand.",
        "benefits_title": "Why use Simo as a writing assistant",
        "benefits_lead": "Writing gets easier when you can refine ideas in conversation instead of struggling alone with every sentence.",
        "pills": [
            "Rewrite help",
            "Clarity improvements",
            "Stronger structure",
            "Better flow"
        ],
        "features": [
            {
                "title": "Improve wording quickly",
                "text": "Use Simo to rewrite weak, awkward, or unclear sentences into stronger and smoother writing."
            },
            {
                "title": "Refine tone and structure",
                "text": "Simo can help make writing sound more polished, professional, warm, direct, or creative depending on your goal."
            },
            {
                "title": "Use it across many writing tasks",
                "text": "Simo is helpful for emails, product copy, resumes, ideas, website text, and many other writing situations."
            }
        ],
        "how_it_works_lead": "Paste what you have, ask how you want it improved, and refine the writing step by step.",
        "steps": [
            {
                "title": "Paste your draft",
                "text": "Share the paragraph, sentence, message, or text you want help improving."
            },
            {
                "title": "Ask for the style you want",
                "text": "Tell Simo whether you want it clearer, stronger, more polished, more concise, or more persuasive."
            },
            {
                "title": "Refine the final result",
                "text": "Keep adjusting tone and clarity until the writing feels right."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo rewrite paragraphs?",
                "a": "Yes. Simo can help rewrite short and long pieces of text for clarity, strength, and better flow."
            },
            {
                "q": "Can Simo help with professional writing?",
                "a": "Yes. Simo can help make writing sound more polished and professional."
            },
            {
                "q": "Can Simo help with creative writing too?",
                "a": "Yes. Simo can also help brainstorm and refine more creative styles of writing."
            }
        ],
        "cta_title": "Improve your writing with Simo",
        "cta_text": "Use Simo to rewrite, polish, and strengthen your writing faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "AI writing help, conversation, and practical support in one place."
    },

        "ai-email-writer": {
        "meta_title": "AI Email Writer | Simo",
        "meta_description": "Use Simo to write clearer, stronger emails for work, business, follow-ups, and everyday communication.",
        "eyebrow": "AI Email Help",
        "hero_title": "AI Email Writer",
        "hero_description": "Simo helps you write emails faster by improving tone, structure, clarity, and overall wording for many different situations.",
        "example_prompt": "Write a professional follow-up email after a product demo.",
        "example_output": "Simo can help draft emails that feel clearer, more polished, and more effective without sounding robotic or awkward.",
        "benefits_title": "Why use Simo for emails",
        "benefits_lead": "Emails are easier when you can quickly improve tone, clarity, and structure in conversation.",
        "pills": [
            "Professional emails",
            "Follow-up messages",
            "Clear wording",
            "Better tone"
        ],
        "features": [
            {
                "title": "Write emails faster",
                "text": "Use Simo to draft emails for work, business, customer follow-ups, and personal communication without staring at a blank screen."
            },
            {
                "title": "Improve clarity and tone",
                "text": "Simo can make emails sound more professional, warm, direct, confident, or polished depending on what you need."
            },
            {
                "title": "Useful for many situations",
                "text": "Use Simo for outreach, follow-ups, thank-you emails, scheduling messages, and customer communication."
            }
        ],
        "how_it_works_lead": "Describe the situation, say what tone you want, and refine the email until it feels right.",
        "steps": [
            {
                "title": "Describe the situation",
                "text": "Tell Simo who the email is for and what you want to say."
            },
            {
                "title": "Generate the draft",
                "text": "Ask for the email in a professional, friendly, direct, or persuasive style."
            },
            {
                "title": "Refine the wording",
                "text": "Adjust the tone and details until the email sounds exactly how you want."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo write professional emails?",
                "a": "Yes. Simo can help draft professional emails for work, outreach, and follow-up situations."
            },
            {
                "q": "Can Simo improve an email I already wrote?",
                "a": "Yes. You can paste your draft and ask Simo to rewrite or polish it."
            },
            {
                "q": "Can Simo make an email more concise?",
                "a": "Yes. Simo can shorten, simplify, or strengthen email wording."
            }
        ],
        "cta_title": "Write better emails with Simo",
        "cta_text": "Use Simo to draft, rewrite, and improve emails faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Email writing, AI chat, and practical wording help in one place."
    },

    "ai-bio-generator": {
        "meta_title": "AI Bio Generator | Simo",
        "meta_description": "Generate bios for social profiles, personal brands, businesses, and websites with Simo.",
        "eyebrow": "AI Bio Writing",
        "hero_title": "AI Bio Generator",
        "hero_description": "Simo helps you write stronger bios for personal brands, websites, businesses, and profiles by improving clarity, tone, and positioning.",
        "example_prompt": "Write a short bio for a founder building an AI platform called Simo.",
        "example_output": "Simo can help create bios that sound more polished, memorable, and aligned with how you want to present yourself or your brand.",
        "benefits_title": "Why use Simo for bios",
        "benefits_lead": "A strong bio can shape first impressions quickly. Simo helps make that easier.",
        "pills": [
            "Personal bios",
            "Founder bios",
            "Brand bios",
            "Profile writing"
        ],
        "features": [
            {
                "title": "Write bios for many uses",
                "text": "Use Simo for website bios, social bios, founder bios, and brand introductions."
            },
            {
                "title": "Adjust tone and length",
                "text": "Simo can make bios shorter, warmer, more premium, more professional, or more creator-focused."
            },
            {
                "title": "Improve positioning",
                "text": "Use Simo to make your bio clearer about who you are, what you do, and why people should care."
            }
        ],
        "how_it_works_lead": "Describe yourself or your brand, choose a tone, and refine the bio until it feels right.",
        "steps": [
            {
                "title": "Share the basics",
                "text": "Tell Simo who the bio is about and what you want it to communicate."
            },
            {
                "title": "Generate the bio",
                "text": "Ask for a short, medium, or more polished version depending on where you will use it."
            },
            {
                "title": "Refine the final version",
                "text": "Adjust tone, confidence, warmth, and style until the bio fits."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo write bios for founders and creators?",
                "a": "Yes. Simo works well for founder bios, creator bios, and personal brand bios."
            },
            {
                "q": "Can Simo make a bio shorter?",
                "a": "Yes. Simo can shorten bios for social profiles or one-line intros."
            },
            {
                "q": "Can Simo make a bio sound more professional?",
                "a": "Yes. Simo can refine bios to sound more polished and intentional."
            }
        ],
        "cta_title": "Create a stronger bio with Simo",
        "cta_text": "Use Simo to write bios that feel clearer, stronger, and more polished.",
        "cta_button": "Try Simo Free",
        "footer_text": "Bio writing, AI chat, and personal brand help in one place."
    },

    "ai-slogan-generator": {
        "meta_title": "AI Slogan Generator | Simo",
        "meta_description": "Generate slogans, taglines, and brand lines with Simo for products, businesses, and websites.",
        "eyebrow": "AI Slogan Help",
        "hero_title": "AI Slogan Generator",
        "hero_description": "Simo helps you generate slogans and taglines that are clearer, stronger, and more memorable for brands, products, and launches.",
        "example_prompt": "Give me tagline ideas for an AI platform that chats, analyzes images, and builds websites.",
        "example_output": "Simo can help brainstorm short and memorable slogans while refining tone, clarity, and brand direction.",
        "benefits_title": "Why use Simo for slogans",
        "benefits_lead": "A great slogan is simple, memorable, and aligned with your offer. Simo helps you get there faster.",
        "pills": [
            "Taglines",
            "Brand slogans",
            "Launch messaging",
            "Creative naming help"
        ],
        "features": [
            {
                "title": "Generate many options quickly",
                "text": "Use Simo to brainstorm multiple tagline directions instead of getting stuck on one idea."
            },
            {
                "title": "Refine by tone",
                "text": "Ask Simo for slogans that feel premium, playful, modern, minimal, or bold."
            },
            {
                "title": "Fit slogans to your brand",
                "text": "Simo can help shape taglines that connect more clearly with your audience and positioning."
            }
        ],
        "how_it_works_lead": "Share what your product or brand does, then ask for slogan ideas in the tone you want.",
        "steps": [
            {
                "title": "Describe the brand or offer",
                "text": "Tell Simo what the product does and how you want it to feel."
            },
            {
                "title": "Generate slogan ideas",
                "text": "Ask for multiple short and memorable options."
            },
            {
                "title": "Refine the strongest ones",
                "text": "Keep shaping the best options until one stands out."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo generate taglines for startups?",
                "a": "Yes. Simo is useful for startup taglines, product slogans, and brand lines."
            },
            {
                "q": "Can Simo make slogans shorter and punchier?",
                "a": "Yes. Simo can make slogan ideas cleaner, simpler, and more memorable."
            },
            {
                "q": "Can I ask for different tones?",
                "a": "Yes. You can ask for premium, fun, serious, bold, or modern slogan ideas."
            }
        ],
        "cta_title": "Generate better taglines with Simo",
        "cta_text": "Use Simo to create slogans and brand lines that feel stronger and more memorable.",
        "cta_button": "Try Simo Free",
        "footer_text": "Slogan generation, AI chat, and branding help in one place."
    },

    "ai-tagline-generator": {
        "meta_title": "AI Tagline Generator | Simo",
        "meta_description": "Generate taglines for brands, products, AI tools, and businesses with Simo.",
        "eyebrow": "AI Tagline Writing",
        "hero_title": "AI Tagline Generator",
        "hero_description": "Simo helps you create stronger taglines by clarifying what your product does and turning that into short, memorable phrasing.",
        "example_prompt": "Create tagline ideas for Simo, an all-in-one AI assistant.",
        "example_output": "Simo can help turn complex product ideas into short taglines that feel clearer and more marketable.",
        "benefits_title": "Why use Simo for taglines",
        "benefits_lead": "A strong tagline can make your product easier to understand and easier to remember.",
        "pills": [
            "Product taglines",
            "Brand lines",
            "Clear messaging",
            "Fast idea generation"
        ],
        "features": [
            {
                "title": "Turn complex ideas into simple lines",
                "text": "Simo helps condense what your product does into short and memorable wording."
            },
            {
                "title": "Explore different directions",
                "text": "Ask for minimalist, premium, direct, emotional, or category-focused tagline ideas."
            },
            {
                "title": "Useful for launches and directories",
                "text": "Simo is especially useful when you need a tagline for product pages, directories, profiles, or brand assets."
            }
        ],
        "how_it_works_lead": "Describe your product, choose a tone, and refine the best tagline ideas.",
        "steps": [
            {
                "title": "Explain the product",
                "text": "Tell Simo what your business, product, or website does."
            },
            {
                "title": "Generate tagline options",
                "text": "Ask for multiple short lines in the tone you want."
            },
            {
                "title": "Refine the winner",
                "text": "Keep improving the best option until it feels clear and memorable."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo write taglines for AI tools?",
                "a": "Yes. Simo is useful for AI tools, startups, creators, and online businesses."
            },
            {
                "q": "Can Simo generate multiple tagline styles?",
                "a": "Yes. You can ask for different tones and brand directions."
            },
            {
                "q": "Can Simo help with short directory taglines too?",
                "a": "Yes. Simo can help create shorter tagline versions for product submissions and listings."
            }
        ],
        "cta_title": "Create stronger taglines with Simo",
        "cta_text": "Use Simo to generate and refine tagline ideas faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Tagline writing, AI chat, and brand messaging help in one place."
    },

    "ai-name-generator": {
        "meta_title": "AI Name Generator | Simo",
        "meta_description": "Brainstorm names for startups, apps, websites, brands, and projects with Simo.",
        "eyebrow": "AI Naming Help",
        "hero_title": "AI Name Generator",
        "hero_description": "Simo helps you brainstorm names for products, startups, brands, websites, and projects by generating ideas and refining the strongest ones.",
        "example_prompt": "Give me name ideas for an AI platform that helps people chat, analyze images, and build websites.",
        "example_output": "Simo can help generate names across different styles, then narrow them down based on tone, memorability, and positioning.",
        "benefits_title": "Why use Simo for naming",
        "benefits_lead": "Naming gets easier when you can brainstorm multiple directions and refine them in conversation.",
        "pills": [
            "Startup names",
            "App names",
            "Brand names",
            "Project naming"
        ],
        "features": [
            {
                "title": "Generate many naming directions",
                "text": "Use Simo to brainstorm modern, premium, playful, simple, or category-based naming ideas."
            },
            {
                "title": "Refine the strongest names",
                "text": "Simo can help compare names and improve the ones with the most potential."
            },
            {
                "title": "Useful for many projects",
                "text": "Use Simo for startup names, app names, website names, product names, and personal brand ideas."
            }
        ],
        "how_it_works_lead": "Describe what you are naming, say how you want it to feel, and refine the strongest ideas.",
        "steps": [
            {
                "title": "Describe the project",
                "text": "Tell Simo what the product, startup, or brand is about."
            },
            {
                "title": "Generate name ideas",
                "text": "Ask for naming directions based on the tone and style you want."
            },
            {
                "title": "Refine the best ones",
                "text": "Keep narrowing and improving until the right name starts to stand out."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo generate startup names?",
                "a": "Yes. Simo is useful for startup names, app names, product names, and brand ideas."
            },
            {
                "q": "Can Simo make names sound more premium or modern?",
                "a": "Yes. You can ask for different tones and naming styles."
            },
            {
                "q": "Can Simo help compare name options?",
                "a": "Yes. Simo can help weigh memorability, fit, and overall direction."
            }
        ],
        "cta_title": "Find better names with Simo",
        "cta_text": "Use Simo to brainstorm and refine naming ideas faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Naming help, AI chat, and brand idea support in one place."
    },

    "ai-website-copy-generator": {
        "meta_title": "AI Website Copy Generator | Simo",
        "meta_description": "Generate website copy for homepages, landing pages, and product sites with Simo.",
        "eyebrow": "AI Website Copy",
        "hero_title": "AI Website Copy Generator",
        "hero_description": "Simo helps you write clearer website copy for homepages, feature sections, product pages, and calls to action.",
        "example_prompt": "Write homepage copy for Simo, an AI that chats naturally, analyzes images, and helps build websites.",
        "example_output": "Simo can help write website copy that is clearer, better structured, and more aligned with what visitors care about.",
        "benefits_title": "Why use Simo for website copy",
        "benefits_lead": "Website copy often determines whether visitors understand your offer quickly. Simo helps improve that.",
        "pills": [
            "Homepage copy",
            "Feature sections",
            "CTA wording",
            "Stronger messaging"
        ],
        "features": [
            {
                "title": "Write clearer homepage copy",
                "text": "Use Simo to improve headings, value propositions, supporting text, and calls to action."
            },
            {
                "title": "Improve conversion-focused wording",
                "text": "Simo can help make website messaging stronger, simpler, and easier to understand."
            },
            {
                "title": "Useful for many website types",
                "text": "Use Simo for startup sites, portfolios, product sites, service pages, and niche landing pages."
            }
        ],
        "how_it_works_lead": "Describe the page you need, generate the copy, and keep refining until it feels stronger.",
        "steps": [
            {
                "title": "Describe the website or page",
                "text": "Tell Simo what kind of site or page you are writing."
            },
            {
                "title": "Generate website copy",
                "text": "Ask for a homepage, features section, CTA block, or page messaging."
            },
            {
                "title": "Refine for impact",
                "text": "Adjust tone, clarity, and structure until the copy feels right."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo write homepage copy?",
                "a": "Yes. Simo is useful for homepage and landing page copywriting."
            },
            {
                "q": "Can Simo improve website messaging I already have?",
                "a": "Yes. You can paste existing text and ask Simo to rewrite it."
            },
            {
                "q": "Can Simo help with CTA wording too?",
                "a": "Yes. Simo can help improve calls to action and visitor-facing messaging."
            }
        ],
        "cta_title": "Write stronger website copy with Simo",
        "cta_text": "Use Simo to generate and improve website messaging faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Website copy, AI chat, and launch support in one place."
    },

    "ai-social-media-caption-generator": {
        "meta_title": "AI Social Media Caption Generator | Simo",
        "meta_description": "Generate captions for social media posts, launches, promotions, and personal brand content with Simo.",
        "eyebrow": "AI Caption Writing",
        "hero_title": "AI Social Media Caption Generator",
        "hero_description": "Simo helps you write captions for social posts by improving tone, hooks, clarity, and overall messaging.",
        "example_prompt": "Write a caption announcing the launch of Simo on social media.",
        "example_output": "Simo can help create captions that feel more polished, engaging, and aligned with the message you want to share.",
        "benefits_title": "Why use Simo for captions",
        "benefits_lead": "A strong caption can make social posts more engaging and more effective. Simo helps you get there faster.",
        "pills": [
            "Launch captions",
            "Promo posts",
            "Brand content",
            "Stronger hooks"
        ],
        "features": [
            {
                "title": "Write better social captions",
                "text": "Use Simo to create captions for launches, promotions, updates, and everyday posting."
            },
            {
                "title": "Adjust tone for different platforms",
                "text": "Simo can make captions more professional, more casual, more founder-focused, or more promotional."
            },
            {
                "title": "Improve hooks and clarity",
                "text": "Use Simo to make captions more attention-grabbing without making them feel forced."
            }
        ],
        "how_it_works_lead": "Describe the post, choose the tone, and refine the caption until it feels right.",
        "steps": [
            {
                "title": "Describe the post",
                "text": "Tell Simo what the post is about and what kind of reaction you want."
            },
            {
                "title": "Generate caption options",
                "text": "Ask for one caption or multiple versions in different styles."
            },
            {
                "title": "Refine the best version",
                "text": "Keep adjusting clarity, tone, and length until the caption works."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo write launch captions?",
                "a": "Yes. Simo is useful for launch announcements, product updates, and promotional posts."
            },
            {
                "q": "Can Simo make captions shorter?",
                "a": "Yes. Simo can shorten, simplify, or tighten captions for different platforms."
            },
            {
                "q": "Can Simo generate multiple caption styles?",
                "a": "Yes. You can ask for founder-style, casual, direct, or hype-style captions."
            }
        ],
        "cta_title": "Write better captions with Simo",
        "cta_text": "Use Simo to generate social media captions that feel clearer and more engaging.",
        "cta_button": "Try Simo Free",
        "footer_text": "Caption writing, AI chat, and launch messaging help in one place."
    },

    "ai-ad-copy-generator": {
        "meta_title": "AI Ad Copy Generator | Simo",
        "meta_description": "Generate ad copy and promotional messaging with Simo for launches, products, and campaigns.",
        "eyebrow": "AI Ad Writing",
        "hero_title": "AI Ad Copy Generator",
        "hero_description": "Simo helps you create stronger ad copy by improving hooks, clarity, and messaging for products, offers, and promotions.",
        "example_prompt": "Write ad copy for Simo, an AI assistant that chats, analyzes images, and builds websites.",
        "example_output": "Simo can help brainstorm ad angles and turn them into clearer, more useful promotional copy.",
        "benefits_title": "Why use Simo for ad copy",
        "benefits_lead": "Good ad copy needs clarity, hooks, and audience fit. Simo helps shape all three faster.",
        "pills": [
            "Ad angles",
            "Promo copy",
            "Product ads",
            "Stronger hooks"
        ],
        "features": [
            {
                "title": "Generate ad ideas quickly",
                "text": "Use Simo to brainstorm multiple ad directions instead of relying on one single idea."
            },
            {
                "title": "Improve clarity and audience fit",
                "text": "Simo can help make ad messaging simpler, stronger, and better aligned with what the audience cares about."
            },
            {
                "title": "Use it across campaigns",
                "text": "Simo is useful for launches, products, paid ads, promotional tests, and growth experiments."
            }
        ],
        "how_it_works_lead": "Describe the offer, say what audience you want to reach, and refine the strongest copy ideas.",
        "steps": [
            {
                "title": "Describe the product or campaign",
                "text": "Tell Simo what you are advertising and who the audience is."
            },
            {
                "title": "Generate ad copy",
                "text": "Ask for short or longer ad-style copy in the tone you want."
            },
            {
                "title": "Refine the strongest version",
                "text": "Improve the hook, angle, and clarity until it feels more effective."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo help write product ads?",
                "a": "Yes. Simo is useful for product and promotional ad copy."
            },
            {
                "q": "Can Simo create different ad angles?",
                "a": "Yes. You can ask for multiple hooks and promotional directions."
            },
            {
                "q": "Can Simo make ad copy shorter?",
                "a": "Yes. Simo can tighten and simplify ad text."
            }
        ],
        "cta_title": "Generate stronger ad copy with Simo",
        "cta_text": "Use Simo to create clearer and more effective promotional messaging faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Ad copy, AI chat, and promotional writing support in one place."
    },

    "ai-about-us-generator": {
        "meta_title": "AI About Us Generator | Simo",
        "meta_description": "Write About Us page content for websites, businesses, and brands with Simo.",
        "eyebrow": "AI About Page Help",
        "hero_title": "AI About Us Generator",
        "hero_description": "Simo helps you write stronger About Us page content by improving story, clarity, positioning, and brand voice.",
        "example_prompt": "Write About Us page content for Simo, an AI platform designed to chat, analyze images, and build websites.",
        "example_output": "Simo can help shape About page content that sounds more human, polished, and aligned with your brand direction.",
        "benefits_title": "Why use Simo for About pages",
        "benefits_lead": "An About page helps people understand who you are and why you built what you built. Simo helps you tell that story better.",
        "pills": [
            "About page writing",
            "Brand story",
            "Founder story",
            "Website messaging"
        ],
        "features": [
            {
                "title": "Write a clearer brand story",
                "text": "Use Simo to explain your mission, your direction, and the reason behind your business or project."
            },
            {
                "title": "Improve tone and flow",
                "text": "Simo can make About page writing feel warmer, clearer, more premium, or more personal."
            },
            {
                "title": "Useful for many websites",
                "text": "Use Simo for startup sites, business sites, creator pages, and brand pages."
            }
        ],
        "how_it_works_lead": "Describe your brand or project, share the story, and refine the writing until it feels right.",
        "steps": [
            {
                "title": "Share the background",
                "text": "Tell Simo what the brand or website is about and why it exists."
            },
            {
                "title": "Generate About page content",
                "text": "Ask for a polished About Us section in the tone you want."
            },
            {
                "title": "Refine the final story",
                "text": "Adjust the writing until it sounds clearer and more aligned with your brand."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo write About Us page copy?",
                "a": "Yes. Simo is useful for About pages, founder stories, and brand story writing."
            },
            {
                "q": "Can Simo make my About page sound more professional?",
                "a": "Yes. Simo can improve tone, clarity, and polish."
            },
            {
                "q": "Can Simo make About page text more personal?",
                "a": "Yes. You can ask Simo for a warmer or more story-driven style."
            }
        ],
        "cta_title": "Write a better About page with Simo",
        "cta_text": "Use Simo to create clearer and more compelling About Us content.",
        "cta_button": "Try Simo Free",
        "footer_text": "About page writing, AI chat, and brand storytelling help in one place."
    },

    "ai-mission-statement-generator": {
        "meta_title": "AI Mission Statement Generator | Simo",
        "meta_description": "Generate mission statements for brands, businesses, startups, and websites with Simo.",
        "eyebrow": "AI Mission Writing",
        "hero_title": "AI Mission Statement Generator",
        "hero_description": "Simo helps you create mission statements that are clearer, more purposeful, and better aligned with your brand or business direction.",
        "example_prompt": "Write a mission statement for Simo, an AI that helps people chat, analyze images, and build websites.",
        "example_output": "Simo can help turn broad ideas into mission statements that sound more focused, meaningful, and intentional.",
        "benefits_title": "Why use Simo for mission statements",
        "benefits_lead": "A good mission statement should be clear, grounded, and easy to understand. Simo helps make that easier.",
        "pills": [
            "Mission statements",
            "Brand clarity",
            "Business positioning",
            "Stronger purpose language"
        ],
        "features": [
            {
                "title": "Clarify your purpose",
                "text": "Use Simo to define what your brand or business is trying to do and why it matters."
            },
            {
                "title": "Improve wording and focus",
                "text": "Simo can help make mission statements simpler, stronger, and easier to communicate."
            },
            {
                "title": "Useful for many brands and projects",
                "text": "Use Simo for startups, small businesses, creator brands, personal projects, and websites."
            }
        ],
        "how_it_works_lead": "Describe your brand, explain the purpose, and refine the mission statement until it feels right.",
        "steps": [
            {
                "title": "Describe the mission",
                "text": "Tell Simo what your business or project is trying to accomplish."
            },
            {
                "title": "Generate mission statement options",
                "text": "Ask for short, medium, or more polished versions."
            },
            {
                "title": "Refine the final wording",
                "text": "Adjust the statement until it feels clear, authentic, and useful."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo write mission statements for startups?",
                "a": "Yes. Simo is useful for startup, business, and brand mission statement writing."
            },
            {
                "q": "Can Simo make a mission statement shorter?",
                "a": "Yes. Simo can simplify and tighten the wording."
            },
            {
                "q": "Can Simo make it sound more premium or inspiring?",
                "a": "Yes. You can ask for different tones and levels of polish."
            }
        ],
        "cta_title": "Create a clearer mission statement with Simo",
        "cta_text": "Use Simo to write mission statements that feel stronger and more intentional.",
        "cta_button": "Try Simo Free",
        "footer_text": "Mission statements, AI chat, and brand writing help in one place."
    },

    "ai-headline-generator": {
        "meta_title": "AI Headline Generator | Simo",
        "meta_description": "Generate headlines for websites, landing pages, launches, and marketing content with Simo.",
        "eyebrow": "AI Headline Writing",
        "hero_title": "AI Headline Generator",
        "hero_description": "Simo helps you write stronger headlines for websites, product pages, launches, and marketing content by improving clarity and impact.",
        "example_prompt": "Give me homepage headline ideas for Simo, an AI that chats, analyzes images, and builds websites.",
        "example_output": "Simo can help brainstorm clearer and more compelling headlines that make the offer easier to understand.",
        "benefits_title": "Why use Simo for headlines",
        "benefits_lead": "A strong headline can change how quickly people understand your offer. Simo helps you improve that fast.",
        "pills": [
            "Homepage headlines",
            "Launch headings",
            "Marketing hooks",
            "Stronger clarity"
        ],
        "features": [
            {
                "title": "Generate many headline options",
                "text": "Use Simo to brainstorm multiple headline directions instead of settling too early."
            },
            {
                "title": "Improve clarity and impact",
                "text": "Simo can make headlines simpler, sharper, and more aligned with your audience."
            },
            {
                "title": "Useful for many pages",
                "text": "Use Simo for homepages, landing pages, ads, launches, and marketing content."
            }
        ],
        "how_it_works_lead": "Describe the offer, ask for headline directions, and refine the strongest one.",
        "steps": [
            {
                "title": "Describe the page or offer",
                "text": "Tell Simo what the headline is for and what message it should communicate."
            },
            {
                "title": "Generate headline ideas",
                "text": "Ask for multiple options in the style you want."
            },
            {
                "title": "Refine the best headline",
                "text": "Keep shaping the best one until it feels clearer and stronger."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo generate homepage headlines?",
                "a": "Yes. Simo is useful for homepage and landing page headline writing."
            },
            {
                "q": "Can Simo make headlines shorter and stronger?",
                "a": "Yes. Simo can simplify and tighten headline wording."
            },
            {
                "q": "Can I ask for different styles of headlines?",
                "a": "Yes. You can ask for premium, bold, direct, simple, or more emotional headlines."
            }
        ],
        "cta_title": "Generate stronger headlines with Simo",
        "cta_text": "Use Simo to brainstorm and improve headlines faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Headline writing, AI chat, and website messaging help in one place."
    },

    "ai-value-proposition-generator": {
        "meta_title": "AI Value Proposition Generator | Simo",
        "meta_description": "Create stronger value propositions for products, startups, and websites with Simo.",
        "eyebrow": "AI Value Proposition Help",
        "hero_title": "AI Value Proposition Generator",
        "hero_description": "Simo helps you clarify what your product does, who it helps, and why it matters so your value proposition becomes stronger.",
        "example_prompt": "Help me define the value proposition for Simo, an all-in-one AI platform.",
        "example_output": "Simo can help turn broad product ideas into clearer value propositions that feel easier to explain and market.",
        "benefits_title": "Why use Simo for value propositions",
        "benefits_lead": "A strong value proposition helps people understand your offer quickly. Simo helps you shape that faster.",
        "pills": [
            "Product clarity",
            "Positioning help",
            "Startup messaging",
            "Stronger offers"
        ],
        "features": [
            {
                "title": "Clarify what your product does",
                "text": "Use Simo to define the main value of your offer in simpler and more understandable language."
            },
            {
                "title": "Improve market positioning",
                "text": "Simo can help explain why your product is useful and who it is really for."
            },
            {
                "title": "Useful across launches and pages",
                "text": "Use Simo for homepage messaging, product descriptions, investor pitches, and startup positioning."
            }
        ],
        "how_it_works_lead": "Describe the product, define the audience, and refine the value proposition until it feels clear and strong.",
        "steps": [
            {
                "title": "Explain the product",
                "text": "Tell Simo what the offer does and what problem it solves."
            },
            {
                "title": "Generate value proposition directions",
                "text": "Ask for concise positioning statements or clearer product framing."
            },
            {
                "title": "Refine the strongest version",
                "text": "Keep improving the wording until it feels sharper and more useful."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo help define a startup value proposition?",
                "a": "Yes. Simo is useful for startup and product positioning work."
            },
            {
                "q": "Can Simo make my value proposition clearer?",
                "a": "Yes. Simo can simplify and sharpen the explanation."
            },
            {
                "q": "Can Simo help with homepage positioning too?",
                "a": "Yes. Value proposition work is especially useful for homepage and landing page messaging."
            }
        ],
        "cta_title": "Clarify your value proposition with Simo",
        "cta_text": "Use Simo to create product messaging that feels clearer and stronger.",
        "cta_button": "Try Simo Free",
        "footer_text": "Value proposition help, AI chat, and startup messaging support in one place."
    },

    "ai-brand-voice-generator": {
        "meta_title": "AI Brand Voice Generator | Simo",
        "meta_description": "Define and refine brand voice for websites, startups, and businesses with Simo.",
        "eyebrow": "AI Brand Voice Help",
        "hero_title": "AI Brand Voice Generator",
        "hero_description": "Simo helps you shape a clearer brand voice by refining tone, style, personality, and messaging direction.",
        "example_prompt": "Help me define the brand voice for Simo as a best-friend AI that is warm, practical, and non-judgmental.",
        "example_output": "Simo can help turn broad brand ideas into clearer voice directions that can be applied across your website and messaging.",
        "benefits_title": "Why use Simo for brand voice",
        "benefits_lead": "A consistent brand voice helps everything feel more coherent. Simo helps define that faster.",
        "pills": [
            "Tone direction",
            "Brand style",
            "Messaging consistency",
            "Voice clarity"
        ],
        "features": [
            {
                "title": "Define the voice clearly",
                "text": "Use Simo to describe how your brand should sound and what emotional tone it should carry."
            },
            {
                "title": "Make messaging more consistent",
                "text": "Simo can help align your homepage, copy, and content with the same brand voice."
            },
            {
                "title": "Useful for many brands and products",
                "text": "Use Simo for startups, products, creator brands, and business websites."
            }
        ],
        "how_it_works_lead": "Describe how you want the brand to feel, then refine the voice until it becomes more usable and clear.",
        "steps": [
            {
                "title": "Describe the intended feel",
                "text": "Tell Simo how you want your brand to sound and what audience it should connect with."
            },
            {
                "title": "Generate voice directions",
                "text": "Ask for a brand voice description, tone guide, or messaging direction."
            },
            {
                "title": "Refine for consistency",
                "text": "Adjust the wording until the voice feels distinct and usable."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo help define a startup brand voice?",
                "a": "Yes. Simo is useful for startup and product voice direction."
            },
            {
                "q": "Can Simo make a brand voice more premium or warm?",
                "a": "Yes. You can ask for different tones and brand personalities."
            },
            {
                "q": "Can Simo help apply brand voice to website copy too?",
                "a": "Yes. Brand voice work can support homepage and broader messaging improvements."
            }
        ],
        "cta_title": "Define your brand voice with Simo",
        "cta_text": "Use Simo to shape brand messaging that feels more coherent and intentional.",
        "cta_button": "Try Simo Free",
        "footer_text": "Brand voice help, AI chat, and messaging support in one place."
    },

          "ai-business-name-generator": {
        "meta_title": "AI Business Name Generator | Simo",
        "meta_description": "Generate business name ideas for startups, brands, apps, and projects with Simo.",
        "eyebrow": "AI Business Naming",
        "hero_title": "AI Business Name Generator",
        "hero_description": "Simo helps you brainstorm business names by generating ideas, exploring styles, and refining the strongest directions.",
        "example_prompt": "Give me business name ideas for an AI company that chats naturally, analyzes images, and builds websites.",
        "example_output": "Simo can help generate naming directions across different tones, then refine the strongest options into something more distinctive.",
        "benefits_title": "Why use Simo for business naming",
        "benefits_lead": "A strong business name should fit the brand, feel memorable, and support the direction of the company. Simo helps with that.",
        "pills": [
            "Business names",
            "Startup naming",
            "Brand ideas",
            "Naming directions"
        ],
        "features": [
            {
                "title": "Generate many business name options",
                "text": "Use Simo to brainstorm naming ideas for startups, websites, products, and brands."
            },
            {
                "title": "Explore different naming tones",
                "text": "Ask for premium, modern, simple, creative, or category-based name directions."
            },
            {
                "title": "Refine the strongest options",
                "text": "Simo can help narrow ideas down into clearer and more memorable final choices."
            }
        ],
        "how_it_works_lead": "Describe the business, choose a tone, and keep refining until the strongest names stand out.",
        "steps": [
            {
                "title": "Describe the business",
                "text": "Tell Simo what the company or product does."
            },
            {
                "title": "Generate name ideas",
                "text": "Ask for multiple directions and different naming styles."
            },
            {
                "title": "Refine the best options",
                "text": "Compare the strongest names and keep improving them."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo generate startup and business names?",
                "a": "Yes. Simo is useful for startup, app, product, and business naming."
            },
            {
                "q": "Can Simo create more premium-sounding business names?",
                "a": "Yes. You can ask for different brand tones and naming styles."
            },
            {
                "q": "Can Simo help compare the strongest names?",
                "a": "Yes. Simo can help narrow options down and improve them."
            }
        ],
        "cta_title": "Generate better business names with Simo",
        "cta_text": "Use Simo to brainstorm and refine naming ideas faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "Business naming, AI chat, and brand direction help in one place."
    },

    "ai-copywriter": {
        "meta_title": "AI Copywriter | Simo",
        "meta_description": "Use Simo as an AI copywriter for website copy, marketing messaging, product descriptions, and launch content.",
        "eyebrow": "AI Copywriting",
        "hero_title": "AI Copywriter",
        "hero_description": "Simo helps you write stronger copy for websites, launches, products, and promotional messaging without starting from scratch.",
        "example_prompt": "Write homepage copy for Simo, an AI that chats, analyzes images, and helps build websites.",
        "example_output": "Simo can help create copy that is clearer, stronger, and more aligned with what users actually care about so the message lands better.",
        "benefits_title": "Why use Simo as an AI copywriter",
        "benefits_lead": "Copywriting often comes down to positioning, tone, structure, and clarity. Simo helps you shape all of that faster.",
        "pills": [
            "Homepage copy",
            "Launch messaging",
            "Product copy",
            "Website writing"
        ],
        "features": [
            {
                "title": "Write better copy for websites",
                "text": "Use Simo to improve homepage messaging, feature explanations, product summaries, and CTA language."
            },
            {
                "title": "Find stronger positioning",
                "text": "Simo can help explain what your offer does and why it matters in a way that feels cleaner and more useful."
            },
            {
                "title": "Refine copy by tone and audience",
                "text": "Ask Simo for more premium, simple, persuasive, founder-friendly, or creator-focused copy depending on your goal."
            }
        ],
        "how_it_works_lead": "Share what you are writing, ask for copy in the tone you want, and keep refining until it feels right.",
        "steps": [
            {
                "title": "Describe the offer or page",
                "text": "Tell Simo what product, website, or message you need help writing."
            },
            {
                "title": "Generate the copy",
                "text": "Ask for homepage copy, feature copy, launch text, or promotional writing."
            },
            {
                "title": "Refine for clarity and impact",
                "text": "Keep improving the copy until it matches your audience and feels more effective."
            }
        ],
        "faqs": [
            {
                "q": "Can Simo help with homepage copy?",
                "a": "Yes. Simo can help write and improve homepage and landing page copy."
            },
            {
                "q": "Can Simo help with product launches too?",
                "a": "Yes. Simo is useful for launch messaging, promotional text, and product positioning."
            },
            {
                "q": "What kinds of copy can Simo help with?",
                "a": "Simo can help with website copy, launch copy, product descriptions, messaging ideas, and other marketing writing."
            }
        ],
        "cta_title": "Write better copy with Simo",
        "cta_text": "Use Simo to create clearer, stronger, and more effective copy faster.",
        "cta_button": "Try Simo Free",
        "footer_text": "AI copywriting, chat, and creative support in one place."
    }
}

@app.route("/<slug>")
def seo_landing_page(slug):
    page = SEO_PAGES.get(slug)
    if not page:
        abort(404)

    base_url = os.getenv("BASE_URL", "https://simonchat.ai").rstrip("/")
    canonical_url = f"{base_url}/{slug}"

    schema = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": page["hero_title"],
        "description": page["meta_description"],
        "url": canonical_url,
        "isPartOf": {
            "@type": "WebSite",
            "name": "Simo",
            "url": base_url
        },
        "about": {
            "@type": "SoftwareApplication",
            "name": "Simo",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web",
            "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
            }
        }
    }

    return render_template(
        "seo_landing.html",
        canonical_url=canonical_url,
        schema_json=json.dumps(schema),
        **page
    )

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1" if not IS_PRODUCTION else "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    debug = env_bool("FLASK_DEBUG", not IS_PRODUCTION)
    app.run(host=host, port=port, debug=debug)
