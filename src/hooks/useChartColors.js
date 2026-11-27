import { useMemo } from "react";
import { useTheme } from "../lib/theme.js";

const TOKENS = {
  area: "--chart-area",
  grid: "--chart-grid",
  heat0: "--chart-heat-0",
  heat3: "--chart-heat-3",
  previous: "--chart-previous",
  primary: "--chart-primary",
  primaryStrong: "--chart-primary-strong",
  secondary: "--chart-secondary",
  soft: "--chart-soft",
  text: "--chart-text",
  tooltipBackground: "--chart-tooltip-bg",
  tooltipBorder: "--chart-tooltip-border",
  tooltipText: "--color-slate-950",
};

let canvasContext = null;

// zrender (under ECharts) only parses hex and comma-separated rgb()/rgba().
// Tailwind v4 tokens are oklch() and some of ours use "rgb(r g b / a)";
// zrender reads those as undefined, and animating to an undefined colour
// throws on every frame and locks the page. Painting one pixel with the
// browser's own parser turns any CSS colour into plain rgba().
function toRgba(value) {
  if (!value) {
    return "rgba(0, 0, 0, 0)";
  }

  canvasContext ??= document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });

  if (!canvasContext) {
    return value;
  }

  canvasContext.clearRect(0, 0, 1, 1);
  canvasContext.fillStyle = "rgba(0, 0, 0, 0)";
  canvasContext.fillStyle = value;
  canvasContext.fillRect(0, 0, 1, 1);

  const [red, green, blue, alpha] = canvasContext.getImageData(0, 0, 1, 1).data;

  return `rgba(${red}, ${green}, ${blue}, ${Math.round((alpha / 255) * 1000) / 1000})`;
}

// ECharts needs real colour values, not var(), so the --chart-* tokens
// (index.css, dark-theme.css) are read here and read again whenever the
// theme changes.
export default function useChartColors() {
  const theme = useTheme();

  return useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    const colors = Object.fromEntries(
      Object.entries(TOKENS).map(([name, token]) => [
        name,
        toRgba(styles.getPropertyValue(token).trim()),
      ]),
    );

    return {
      ...colors,
      fontFamily: getComputedStyle(document.body).fontFamily,
      theme,
    };
  }, [theme]);
}
