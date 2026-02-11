// Colors aligned with SuperEngineer_WebApp/frontend/src/theme.js (light theme)
// HSL values converted to hex for React Native compatibility
export const COLORS = {
	// Core — exact matches to SE COLORS
	background: "#FFFFFF", // hsl(0, 0%, 100%)
	backgroundSecondary: "#FAFAFA", // hsl(0, 0%, 98%) — SE sidebarBackground
	foreground: "#0A0A0A", // hsl(0, 0%, 3.9%)
	card: "#FFFFFF", // hsl(0, 0%, 100%)
	cardForeground: "#0A0A0A", // hsl(0, 0%, 3.9%)
	primary: "#000000", // SE primary buttons use pure black
	primaryForeground: "#FAFAFA", // hsl(0, 0%, 98%)
	secondary: "#F9FAFB", // SE secondary button background
	secondaryForeground: "#374151", // SE secondary button text
	muted: "#F5F5F5", // hsl(0, 0%, 96.1%)
	mutedForeground: "#737373", // hsl(0, 0%, 45.1%)
	accent: "#F5F5F5", // hsl(0, 0%, 96.1%)
	accentForeground: "#171717", // hsl(0, 0%, 9%)
	destructive: "#EF4444", // hsl(0, 84.2%, 60.2%)
	destructiveForeground: "#FAFAFA", // hsl(0, 0%, 98%)
	border: "#E5E7EB", // SE uses #E5E7EB consistently
	borderLight: "#F3F4F6", // SE lighter border
	input: "#E5E7EB", // hsl(0, 0%, 89.8%)
	ring: "#0A0A0A", // hsl(0, 0%, 3.9%)

	// Sidebar — exact matches to SE sidebar tokens
	sidebarBg: "#FAFAFA", // hsl(0, 0%, 98%)
	sidebarBorder: "#E5E7EB", // hsl(220, 13%, 91%)
	sidebarItemActive: "#000000", // SE active sidebar item — black bg
	sidebarItemActiveText: "#FFFFFF", // SE active sidebar item — white text
	sidebarItemHover: "#F9FAFB", // SE nav item hover
	sidebarText: "#374151", // SE nav text color
	sidebarTextActive: "#FFFFFF", // SE active — white on black

	// Text — matching SE component text colors
	textPrimary: "#111827", // SE primary text (headings, body)
	textSecondary: "#374151", // SE secondary text (labels, descriptions)
	textTertiary: "#6B7280", // SE tertiary text (subtle descriptions)
	textMuted: "#9CA3AF", // placeholder/disabled text
	textDisabled: "#D1D5DB", // disabled state

	// Semantic — used inline in SE components
	info: "#3B82F6", // hsl(217.2, 91.2%, 59.8%) — SE sidebarRing
	success: "#10B981",
	successForeground: "#FFFFFF",
	successBg: "#F0FDF4",
	warning: "#F59E0B",
	overlay: "rgba(0,0,0,0.5)",
	shadow: "#000000",
};
