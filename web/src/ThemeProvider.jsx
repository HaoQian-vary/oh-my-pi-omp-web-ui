// 主题系统提供者
import { createContext, useContext, useEffect, useState, useCallback } from "react";

const THEMES = [
  { id: "dim", label: "Dim", desc: "柔和深色 · 冷调护眼" },
  { id: "dark", label: "Dark", desc: "黑色背景 + 白色文字" },
  { id: "light", label: "Light", desc: "白色背景 + 黑色文字" },
  { id: "system", label: "System", desc: "跟随系统设置" },
  { id: "midnight", label: "Midnight", desc: "深蓝黑" },
  { id: "github-dark", label: "GitHub Dark", desc: "GitHub 暗色主题" },
  { id: "github-light", label: "GitHub Light", desc: "GitHub 亮色主题" },
];

const ThemeCtx = createContext(null);

export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem("omp-theme") || "dim";
    } catch {
      return "dim";
    }
  });

  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("omp-theme", newTheme);
    } catch {
      /* 忽略 localStorage 错误 */
    }
    document.documentElement.setAttribute("data-theme", newTheme);
  }, []);

  // 应用主题到 DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 监听系统主题变化（当选择 system 时）
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // 强制重新渲染以应用系统主题
      setThemeState((prev) => prev);
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  const value = {
    theme,
    themes: THEMES,
    setTheme,
    isDark: theme === "dim" || theme === "dark" || theme === "midnight" || theme === "github-dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches),
  };

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
