/** @type {import('tailwindcss').Config} */
export default {
  content: ["./web/index.html", "./web/src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // 使用 CSS 变量，主题切换时自动响应
        bg: "var(--color-bg)",
        sidebar: "var(--color-sidebar)",
        card: "var(--color-card)",
        border: "var(--color-border)",
        primary: "var(--color-text-primary)",
        secondary: "var(--color-text-secondary)",
        accent: "var(--color-accent)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error: "var(--color-error)",
        diffadd: "var(--color-diff-add-bg)",
        diffdel: "var(--color-diff-del-bg)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Microsoft YaHei",
          "PingFang SC",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SFMono-Regular",
          "Consolas",
          "Cascadia Code",
          "Liberation Mono",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["11px", "15px"],
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
};
