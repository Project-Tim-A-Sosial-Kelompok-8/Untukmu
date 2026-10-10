"""Canonical labels shared by message validation and public filters."""
from unicodedata import normalize

MOOD_ALIASES = {
    "longing": "rindu", "gratitude": "syukur", "regret": "sesal", "anger": "marah",
    "calm": "tenang", "tender": "haru", "proud": "bangga", "grief": "kehilangan",
}


def normalize_mood(value):
    value = normalize("NFKC", value or "").strip().lower()
    return MOOD_ALIASES.get(value, value) or None


def mood_values(value):
    canonical = normalize_mood(value)
    return [canonical, *(alias for alias, mood in MOOD_ALIASES.items() if mood == canonical)]


def normalize_tag(value):
    return normalize("NFKC", value).strip().lstrip("#").strip().lower()


def normalize_tags(values):
    return list(dict.fromkeys(normalize_tag(value) for value in values))
