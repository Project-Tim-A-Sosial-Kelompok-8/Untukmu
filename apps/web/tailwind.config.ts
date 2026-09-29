import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: { extend: {
    colors: { "um-panel": "rgba(10,14,24,.94)", "um-accent": "#6366f1", "um-gold": "#f4d58d", "um-text": "#e5e7eb", "um-muted": "#9ca3af" },
    borderRadius: { um: "12px", "um-sm": "8px" },
  } },
  plugins: [],
} satisfies Config;
