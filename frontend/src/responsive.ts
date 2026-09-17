import { useWindowDimensions } from "react-native";

/**
 * Responsive helper. On wide screens (tablet / iPad in landscape, desktop web)
 * we switch dashboards to a centered multi-column "desktop" layout instead of a
 * stretched phone portrait view.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isWide = width >= 900;
  const isLandscape = width > height;
  return { width, height, isWide, isLandscape };
}
