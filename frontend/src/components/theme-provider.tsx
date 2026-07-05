import * as React from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: "class";
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
};

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getSystemTheme() {
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function getStoredTheme(storageKey: string, defaultTheme: Theme) {
  if (typeof window === "undefined") {
    return defaultTheme;
  }

  const storedTheme = window.localStorage.getItem(storageKey);
  return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
    ? storedTheme
    : defaultTheme;
}

function withTransitionsDisabled() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important;animation:none!important}",
    ),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    window.requestAnimationFrame(() => {
      document.head.removeChild(style);
    });
  };
}

function applyTheme(
  theme: Theme,
  enableSystem: boolean,
  disableTransitionOnChange: boolean,
): "light" | "dark" {
  const resolvedTheme =
    theme === "system" && enableSystem ? getSystemTheme() : (theme as "light" | "dark");
  const cleanupTransitions = disableTransitionOnChange ? withTransitionsDisabled() : undefined;

  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;

  cleanupTransitions?.();

  return resolvedTheme;
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = false,
  storageKey = "theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => getStoredTheme(storageKey, defaultTheme));
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(() => {
    if (typeof window === "undefined") {
      return defaultTheme === "dark" ? "dark" : "light";
    }

    return (theme === "system" && enableSystem ? getSystemTheme() : theme) as "light" | "dark";
  });

  React.useEffect(() => {
    if (attribute !== "class") {
      return;
    }

    setResolvedTheme(applyTheme(theme, enableSystem, disableTransitionOnChange));
  }, [attribute, disableTransitionOnChange, enableSystem, theme]);

  React.useEffect(() => {
    if (!enableSystem || theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia(MEDIA_QUERY);
    const onChange = () => setResolvedTheme(applyTheme("system", true, disableTransitionOnChange));

    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, [disableTransitionOnChange, enableSystem, theme]);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);
  };

  const value = {
    theme,
    resolvedTheme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
