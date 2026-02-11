// Colors aligned with SuperEngineer_WebApp/frontend/src/theme.js (light theme)
// HSL values converted to hex for React Native compatibility
export const COLORS = {
	// Core — exact matches to SE COLORS
	background: "#FFFFFF", // hsl(0, 0%, 100%)
	backgroundSecondary: "#FAFAFA", // hsl(0, 0%, 98%) — SE sidebarBackground
	foreground: "#0A0A0A", // hsl(0, 0%, 3.9%)
	card: "#FFFFFF", // hsl(0, 0%, 100%)
	cardForeground: "#0A0A0A", // hsl(0, 0%, 3.9%)
	primary: "#171717", // hsl(0, 0%, 9%)
	primaryForeground: "#FAFAFA", // hsl(0, 0%, 98%)
	secondary: "#F5F5F5", // hsl(0, 0%, 96.1%)
	secondaryForeground: "#171717", // hsl(0, 0%, 9%)
	muted: "#F5F5F5", // hsl(0, 0%, 96.1%)
	mutedForeground: "#737373", // hsl(0, 0%, 45.1%)
	accent: "#F5F5F5", // hsl(0, 0%, 96.1%)
	accentForeground: "#171717", // hsl(0, 0%, 9%)
	destructive: "#EF4444", // hsl(0, 84.2%, 60.2%)
	destructiveForeground: "#FAFAFA", // hsl(0, 0%, 98%)
	border: "#E5E5E5", // hsl(0, 0%, 89.8%)
	borderLight: "#F5F5F5", // hsl(0, 0%, 96.1%)
	input: "#E5E5E5", // hsl(0, 0%, 89.8%)
	ring: "#0A0A0A", // hsl(0, 0%, 3.9%)

	// Sidebar — exact matches to SE sidebar tokens
	sidebarBg: "#FAFAFA", // hsl(0, 0%, 98%)
	sidebarBorder: "#E5E7EB", // hsl(220, 13%, 91%)
	sidebarItemActive: "#F4F4F5", // hsl(240, 4.8%, 95.9%)
	sidebarText: "#3F3F46", // hsl(240, 5.3%, 26.1%)
	sidebarTextActive: "#18181B", // hsl(240, 5.9%, 10%)

	// Text — derived from SE foreground/muted values
	textPrimary: "#0A0A0A", // hsl(0, 0%, 3.9%) — SE foreground
	textSecondary: "#737373", // hsl(0, 0%, 45.1%) — SE mutedForeground
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
