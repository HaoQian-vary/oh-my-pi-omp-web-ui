// 外观设置页面：主题切换 + 界面语言切换。
import { useTheme } from "../ThemeProvider";
import { useLang } from "../i18n";
import { PageShell } from "./PageShell";
import { IconCheck, IconSun, IconMoon, IconMonitor, IconGlobe } from "../icons";

const THEME_ICONS = {
  dark: IconMoon,
  light: IconSun,
  system: IconMonitor,
  midnight: IconMoon,
  "github-dark": IconMoon,
  "github-light": IconSun,
};

export function AppearanceView() {
  const { theme, themes, setTheme } = useTheme();
  const { lang, setLang, t } = useLang();

  return (
    <PageShell
      title={t("外观设置")}
      desc={t("自定义界面主题和视觉风格。切换主题后立即生效。")}
    >
      <div className="space-y-6">
        {/* 语言切换 */}
        <div>
          <h2 className="text-[13.5px] font-semibold mb-3">{t("界面语言")}</h2>
          <div className="flex gap-3">
            {[
              { id: "zh", label: "中文", sub: "简体中文" },
              { id: "en", label: "English", sub: "English" },
            ].map((l) => (
              <button
                key={l.id}
                className={`card px-4 py-3 flex items-center gap-3 transition-all duration-150 ${
                  lang === l.id ? "border-accent ring-1 ring-accent" : ""
                }`}
                onClick={() => setLang(l.id)}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lang === l.id ? "bg-accent text-white" : "text-secondary"}`} style={lang !== l.id ? { background: 'var(--color-bg-elevated)' } : undefined}>
                  <IconGlobe size={16} />
                </div>
                <div className="text-left">
                  <div className="text-[13.5px] font-medium">{l.label}</div>
                  <div className="text-[11.5px] text-secondary">{l.sub}</div>
                </div>
                {lang === l.id && (
                  <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                    <IconCheck size={12} className="text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-secondary mt-2">{t("语言设置会保存在浏览器本地存储中")}</p>
        </div>

        {/* 主题选择 */}
        <div>
          <h2 className="text-[13.5px] font-semibold mb-3">{t("主题")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {themes.map((tm) => {
              const Icon = THEME_ICONS[tm.id] || IconMoon;
              const isActive = theme === tm.id;
              return (
                <button
                  key={tm.id}
                  className={`card p-4 text-left transition-all duration-150 ${
                    isActive ? "border-accent ring-1 ring-accent" : ""
                  }`}
                  onClick={() => setTheme(tm.id)}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isActive ? "bg-accent text-white" : "text-secondary"
                    }`} style={!isActive ? { background: 'var(--color-bg-elevated)' } : undefined}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium">{t(tm.label)}</div>
                      <div className="text-[11.5px] text-secondary">{t(tm.desc)}</div>
                    </div>
                    {isActive && (
                      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                        <IconCheck size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                  {/* 主题预览 */}
                  <ThemePreview themeId={tm.id} />
                </button>
              );
            })}
          </div>
        </div>

        {/* 说明 */}
        <div className="card p-4">
          <h3 className="text-[12.5px] font-medium mb-2">{t("关于主题")}</h3>
          <ul className="text-[12px] text-secondary space-y-1.5 list-disc pl-4">
            <li>{t("主题切换立即生效，无需刷新页面")}</li>
            <li>{t("选择 \"System\" 会自动跟随系统暗色/亮色设置")}</li>
            <li>{t("主题设置会保存在浏览器本地存储中")}</li>
            <li>{t("主题覆盖所有界面元素：侧边栏、消息区、Inspector、终端、代码块、Diff 视图等")}</li>
          </ul>
        </div>
      </div>
    </PageShell>
  );
}

function ThemePreview({ themeId }) {
  // 主题预览色块
  const colors = {
    dim: { bg: "#1e1e2e", sidebar: "#232334", accent: "#89b4fa", text: "#cdd6f4" },
    dark: { bg: "#0D1117", sidebar: "#161B22", accent: "#2F81F7", text: "#E6EDF3" },
    light: { bg: "#ffffff", sidebar: "#f6f8fa", accent: "#0969da", text: "#1f2328" },
    system: { bg: "linear-gradient(135deg, #0D1117 50%, #ffffff 50%)", sidebar: "linear-gradient(135deg, #161B22 50%, #f6f8fa 50%)", accent: "#2F81F7", text: "#E6EDF3" },
    midnight: { bg: "#0a0e14", sidebar: "#0f1318", accent: "#539bf5", text: "#c5cdd9" },
    "github-dark": { bg: "#0d1117", sidebar: "#161b22", accent: "#2f81f7", text: "#e6edf3" },
    "github-light": { bg: "#ffffff", sidebar: "#f6f8fa", accent: "#0969da", text: "#1f2328" },
  };

  const c = colors[themeId] || colors.dark;

  return (
    <div className="flex gap-1 h-8 rounded-md overflow-hidden border border-border">
      <div className="w-1/4" style={{ background: c.sidebar }} />
      <div className="flex-1" style={{ background: c.bg }}>
        <div className="flex gap-1 p-1 h-full">
          <div className="w-1/3 rounded-sm" style={{ background: c.accent, opacity: 0.3 }} />
          <div className="flex-1 rounded-sm border border-border" style={{ background: c.bg }} />
        </div>
      </div>
    </div>
  );
}
