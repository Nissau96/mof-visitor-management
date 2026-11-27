import { formatShortDate } from "./reportPeriods.js";

// Apache ECharts options for the Analytics & Reports charts. colors
// comes from useChartColors, so every option follows the theme.

function tooltip(colors, extra = {}) {
  // richText draws the tooltip inside the chart instead of as HTML,
  // whose inline styles the Content-Security-Policy would block.
  return {
    backgroundColor: colors.tooltipBackground,
    borderColor: colors.tooltipBorder,
    borderWidth: 1,
    padding: [8, 12],
    renderMode: "richText",
    textStyle: {
      color: colors.tooltipText,
      fontFamily: colors.fontFamily,
      fontSize: 12,
    },
    ...extra,
  };
}

function axisLabel(colors, extra = {}) {
  return {
    color: colors.text,
    fontFamily: colors.fontFamily,
    fontSize: 11,
    fontWeight: 600,
    ...extra,
  };
}

function verticalGradient(top, bottom) {
  return {
    colorStops: [
      { color: top, offset: 0 },
      { color: bottom, offset: 1 },
    ],
    type: "linear",
    x: 0,
    x2: 0,
    y: 0,
    y2: 1,
  };
}

const VALUE_AXIS = (colors) => ({
  axisLabel: axisLabel(colors),
  minInterval: 1,
  splitLine: { lineStyle: { color: colors.grid, type: [4, 4] } },
  type: "value",
});

export function trendOption(colors, daily) {
  return {
    animationDuration: 500,
    grid: { bottom: 28, containLabel: false, left: 40, right: 12, top: 12 },
    series: [
      {
        data: daily.map((day) => day.previous),
        lineStyle: { color: colors.previous, type: [5, 5], width: 1.5 },
        name: "Previous period",
        showSymbol: false,
        smooth: true,
        type: "line",
      },
      {
        areaStyle: { color: verticalGradient(colors.area, "rgba(0,0,0,0)") },
        data: daily.map((day) => day.visits),
        emphasis: { focus: "none" },
        itemStyle: { borderColor: colors.primary, borderWidth: 2, color: colors.tooltipBackground },
        lineStyle: { color: colors.primary, width: 2.5 },
        name: "Visits",
        showSymbol: daily.length <= 31,
        smooth: true,
        symbolSize: 7,
        type: "line",
      },
    ],
    tooltip: tooltip(colors, {
      axisPointer: { lineStyle: { color: colors.grid, width: 2 }, type: "line" },
      trigger: "axis",
    }),
    xAxis: {
      axisLabel: axisLabel(colors, { hideOverlap: true }),
      axisLine: { show: false },
      axisTick: { show: false },
      boundaryGap: false,
      data: daily.map((day) => formatShortDate(day.date)),
      type: "category",
    },
    yAxis: VALUE_AXIS(colors),
  };
}

export function agencyOption(colors, agencies) {
  return {
    animationDuration: 500,
    grid: { bottom: 0, containLabel: true, left: 0, right: 36, top: 0 },
    series: [
      {
        backgroundStyle: { borderRadius: 6, color: colors.heat0 },
        barWidth: 10,
        data: agencies.map((row) => row.visits),
        itemStyle: { borderRadius: 6, color: colors.primary },
        label: {
          color: colors.text,
          fontFamily: colors.fontFamily,
          fontSize: 12,
          fontWeight: 800,
          position: "right",
          show: true,
        },
        name: "Visits",
        showBackground: true,
        type: "bar",
      },
    ],
    tooltip: tooltip(colors, {
      formatter: (item) => `${agencies[item.dataIndex]?.agency}: ${item.value} visits`,
      trigger: "item",
    }),
    xAxis: { show: false, type: "value" },
    yAxis: {
      axisLabel: axisLabel(colors, { fontWeight: 800, margin: 12 }),
      axisLine: { show: false },
      axisTick: { show: false },
      data: agencies.map((row) => row.label),
      inverse: true,
      type: "category",
    },
  };
}

export function purposeOption(colors, purposes) {
  const top = purposes[0]?.visits || 0;

  return {
    animationDuration: 500,
    grid: { bottom: 40, left: 40, right: 8, top: 24 },
    series: [
      {
        barMaxWidth: 44,
        data: purposes.map((row) => ({
          itemStyle: {
            color:
              row.visits === top
                ? verticalGradient(colors.heat3, colors.primaryStrong)
                : colors.secondary,
          },
          value: row.visits,
        })),
        itemStyle: { borderRadius: [8, 8, 0, 0] },
        label: {
          color: colors.text,
          fontFamily: colors.fontFamily,
          fontSize: 12,
          fontWeight: 800,
          position: "top",
          show: true,
        },
        name: "Visits",
        type: "bar",
      },
    ],
    tooltip: tooltip(colors, { trigger: "item" }),
    xAxis: {
      axisLabel: axisLabel(colors, { fontSize: 10, interval: 0, overflow: "break", width: 64 }),
      axisLine: { show: false },
      axisTick: { show: false },
      data: purposes.map((row) => row.purpose),
      type: "category",
    },
    yAxis: VALUE_AXIS(colors),
  };
}

export function mixOption(colors, slices) {
  const both = slices.every((slice) => slice.value > 0);

  return {
    animationDuration: 500,
    series: [
      {
        data: slices.map((slice) => ({
          itemStyle: { color: colors[slice.colorKey] },
          name: slice.name,
          value: slice.value,
        })),
        emphasis: { scale: true, scaleSize: 4 },
        itemStyle: { borderRadius: 4 },
        label: { show: false },
        labelLine: { show: false },
        padAngle: both ? 3 : 0,
        radius: ["66%", "94%"],
        type: "pie",
      },
    ],
    // richText tooltips are drawn inside the chart, so confine keeps
    // them within the donut's box instead of being clipped at its edge.
    tooltip: tooltip(colors, {
      confine: true,
      formatter: "{b}: {c} ({d}%)",
      trigger: "item",
    }),
  };
}
