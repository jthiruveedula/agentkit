// echarts-gl ships no types; only the registrables used by components/Bars3D.tsx.
declare module "echarts-gl/charts" { import type { EChartsExtensionInstaller } from "echarts/core"; export const Bar3DChart: EChartsExtensionInstaller; export const Line3DChart: EChartsExtensionInstaller }
declare module "echarts-gl/components" { import type { EChartsExtensionInstaller } from "echarts/core"; export const Grid3DComponent: EChartsExtensionInstaller }
