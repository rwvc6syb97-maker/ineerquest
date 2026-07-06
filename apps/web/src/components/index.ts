/**
 * 共享组件统一出口（barrel）
 * -------------------------------------------------------------
 * 供页面重构层直接从 '@/components' 引入原子/分子组件。
 * 分组：ui（基础）/ personality（人格）/ layout（布局）/ charts（可视化）/ system（系统）。
 */

// —— UI 基础原子/分子 ——
export { Card, GlassCard } from './ui/Card';
export type { CardProps, GlassCardProps } from './ui/Card';
export { Tag } from './ui/Tag';
export type { TagProps, TagTone } from './ui/Tag';
export { StatPill } from './ui/StatPill';
export type { StatPillProps, StatPillTone } from './ui/StatPill';
export { Quote } from './ui/Quote';
export type { QuoteProps } from './ui/Quote';
export { SectionHeading } from './ui/SectionHeading';
export type { SectionHeadingProps, HeadingAlign } from './ui/SectionHeading';
export { Reveal, RevealItem } from './ui/Reveal';
export type { RevealProps, RevealItemProps } from './ui/Reveal';
export { EmptyState } from './ui/EmptyState';
export type { EmptyStateProps, EmptyStateIcon } from './ui/EmptyState';
export { BackButton } from './ui/BackButton';
export type { BackButtonProps } from './ui/BackButton';
export { TiltCard } from './ui/TiltCard';
export type { TiltCardProps } from './ui/TiltCard';

// —— 人格类 ——
export { GroupBadge } from './personality/GroupBadge';
export type { GroupBadgeProps } from './personality/GroupBadge';
export { TypeAvatar } from './personality/TypeAvatar';
export type { TypeAvatarProps } from './personality/TypeAvatar';
export { DimensionBar } from './personality/DimensionBar';
export type { DimensionBarProps } from './personality/DimensionBar';

// —— 布局 ——
export { Nav } from './layout/Nav';
export type { NavProps, NavItem } from './layout/Nav';
export { Footer } from './layout/Footer';
export type { FooterProps, FooterColumn, FooterLink } from './layout/Footer';
export { Logo } from './layout/Logo';
export type { LogoProps } from './layout/Logo';

// —— 可视化（既有） ——
export { RadarChart, DimensionBars } from './charts/DimensionCharts';
export type { DimItem } from './charts/DimensionCharts';

// —— 运营后台图表（T4-17 数据看板，纯 SVG） ——
export { LineChart, FunnelChart, PieChart, GaugeChart } from './charts/AdminCharts';
export type {
  LineChartProps,
  FunnelChartProps,
  PieChartProps,
  GaugeChartProps,
} from './charts/AdminCharts';

// —— 系统（既有，交互按钮） ——
export { SpringButton, SpringLink } from './system/SpringButton';