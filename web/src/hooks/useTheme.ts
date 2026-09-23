import { useEffect, useState } from "react";
import { onThemeChange, readTheme, saveTheme, Theme } from "../theme.js";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => onThemeChange(() => setTheme(readTheme())), []);
  return [theme, (next: Theme) => saveTheme(next)] as const;
}
