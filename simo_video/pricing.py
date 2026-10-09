from dataclasses import dataclass, asdict
from math import ceil
from .config import VideoConfig


class PricingError(ValueError):
    pass


@dataclass(frozen=True)
class VideoQuote:
    duration_seconds: int
    quality: str
    audio: bool
    music: bool
    voiceover: bool
    required_credits: int
    public_label: str
    # Cost fields stay server-side and must never be returned by public routes.
    provider_cost_usd: float
    total_estimated_cost_usd: float
    estimated_net_revenue_usd: float
    estimated_margin_usd: float
    estimated_margin_ratio: float

    def public_dict(self):
        return {
            "duration_seconds": self.duration_seconds,
            "quality": self.quality,
            "audio": self.audio,
            "music": self.music,
            "voiceover": self.voiceover,
            "required_credits": self.required_credits,
            "public_label": self.public_label,
        }


class VideoPricingEngine:
    def __init__(self, config: VideoConfig):
        self.config = config

    def quote(self, *, duration_seconds: int, quality: str, audio: bool, music: bool, voiceover: bool) -> VideoQuote:
        duration = int(duration_seconds or self.config.default_duration_seconds)
        if duration < 1 or duration > self.config.max_duration_seconds:
            raise PricingError(f"Choose a duration from 1 to {self.config.max_duration_seconds} seconds.")

        quality = (quality or "hd").strip().lower()
        multipliers = {
            "hd": self.config.hd_multiplier,
            "full_hd": self.config.full_hd_multiplier,
            "cinematic": self.config.cinematic_multiplier,
        }
        if quality not in multipliers:
            raise PricingError("Unsupported video quality.")

        provider_cost = duration * self.config.provider_cost_per_second_usd * multipliers[quality]
        if audio:
            provider_cost += self.config.audio_surcharge_usd
        if music:
            provider_cost += self.config.music_surcharge_usd
        if voiceover:
            provider_cost += self.config.voiceover_surcharge_usd

        if provider_cost > self.config.max_provider_cost_usd:
            raise PricingError("This request exceeds Simo's configured provider-cost safety ceiling.")

        total_cost = provider_cost + self.config.infra_reserve_usd
        if self.config.minimum_margin_ratio >= 1.0:
            raise PricingError("Invalid margin configuration.")
        required_revenue = total_cost / max(0.001, 1.0 - self.config.minimum_margin_ratio)
        credits = max(1, ceil(required_revenue / self.config.net_usd_per_credit))
        revenue = credits * self.config.net_usd_per_credit
        margin = revenue - total_cost
        ratio = margin / revenue if revenue else 0.0
        if ratio + 1e-9 < self.config.minimum_margin_ratio:
            raise PricingError("Simo's minimum profit-margin requirement could not be satisfied.")

        label = f"{duration}s · {quality.replace('_', ' ').title()}"
        return VideoQuote(duration, quality, bool(audio), bool(music), bool(voiceover), credits, label,
                          provider_cost, total_cost, revenue, margin, ratio)
