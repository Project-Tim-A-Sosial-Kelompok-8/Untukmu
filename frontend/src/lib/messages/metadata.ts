const aliases: Record<string, string> = {longing:"rindu",gratitude:"syukur",regret:"sesal",anger:"marah",calm:"tenang",tender:"haru",proud:"bangga",grief:"kehilangan"};

export function normalizeTag(value: string) {
  return value.normalize("NFKC").trim().replace(/^#+/, "").trim().toLowerCase();
}
export function normalizeTags(values: string[]) { return [...new Set(values.map(normalizeTag).filter(Boolean))]; }
export function normalizeMood(value?: string | null) {
  const mood = (value || "").normalize("NFKC").trim().toLowerCase();
  return aliases[mood] || mood;
}
