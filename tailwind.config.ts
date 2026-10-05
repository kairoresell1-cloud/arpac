import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#07080A",
          900: "#0C0D10",
          850: "#111318",
          800: "#161922",
          700: "#20242E",
          600: "#2C313D"
        },
        ink: {
          100: "#F2F3F5",
          300: "#C4C8D1",
          500: "#8A8F9C",
          700: "#565B68"
        },
        accent: {
          DEFAULT: "#6E8CFF",
          soft: "#A9B8FF",
          dim: "#3A4470"
        },
        signal: {
          ok: "#5FD9A4",
          warn: "#E8B45C",
          risk: "#E8705C"
        }
      },
      borderRadius: {
        token: "14px",
        "token-lg": "20px",
        "token-sm": "9px"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"]
      },
      backdropBlur: {
        token: "18px"
      },
      boxShadow: {
        token: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.5)"
      }
    }
  },
  plugins: []
};

export default config;
