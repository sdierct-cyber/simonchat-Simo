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


# -----------------------------
# AI Tools SEO Page
# -----------------------------
@app.get("/ai-tools")
def ai_tools():
    return render_template("ai-tools.html")


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


@app.get("/chatgpt-alternative")
def chatgpt_alternative():
    return render_template("chatgpt-alternative.html")


@app.get("/ai-website-builder")
def ai_website_builder():
    return render_template("ai-website-builder.html")


@app.get("/ai-image-analysis")
def ai_image_analysis():
    return render_template("ai-image-analysis.html")

init_db()

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1" if not IS_PRODUCTION else "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    debug = env_bool("FLASK_DEBUG", not IS_PRODUCTION)
    app.run(host=host, port=port, debug=debug)
