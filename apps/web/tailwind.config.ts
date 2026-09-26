import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        aura: {
          bg: "#0a0a0c",
          panel: "#121216",
          border: "#232329",
          gold: "#e8b84b",
          goldDim: "#a9822f",
        },
      },
      fontFamily: {
        display: ["Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
