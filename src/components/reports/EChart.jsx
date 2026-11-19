import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

// Only the pieces the report page uses, so the bundle stays small.
echarts.use([BarChart, GridComponent, LineChart, PieChart, SVGRenderer, TooltipComponent]);

// One Apache ECharts chart that fills its box and follows its size.
// The drawing is hidden from screen readers; each chart card renders
// its numbers as a visually hidden table instead.
export default function EChart({ className = "", option, style }) {
  const element = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    const instance = echarts.init(element.current, null, { renderer: "svg" });
    const observer = new ResizeObserver(() => instance.resize());

    chart.current = instance;
    observer.observe(element.current);

    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = chart.current;

    if (!instance) {
      return;
    }

    // Clear first so ECharts draws the new option fresh. Animating from
    // the old option to the new one can crash zrender's animator
    // ("Cannot read properties of undefined (reading 'length')"), and that
    // crash stops its frame loop, so every chart freezes until reload.
    instance.clear();
    instance.setOption(option, { notMerge: true });
  }, [option]);

  return <div aria-hidden="true" className={className} ref={element} style={style} />;
}
