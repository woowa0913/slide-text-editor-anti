export type ThemeMode = 'stripe' | 'linearDark';

export interface ThemePalette {
  mode: ThemeMode;
  isDark: boolean;
  appBg: string;
  headerBg: string;
  headerBorder: string;
  textPrimary: string;
  textSecondary: string;
  sidePanelBg: string;
  sidePanelBorder: string;
  toolbarBg: string;
  mainCanvasBg: string;
  rightPanelBg: string;
  rightPanelBorder: string;
  primaryButtonBg: string;
  primaryButtonText: string;
  neutralButtonBg: string;
  neutralButtonText: string;
}

const STRIPE_THEME: ThemePalette = {
  mode: 'stripe',
  isDark: false,
  appBg: '#f6f7fb',
  headerBg: '#ffffff',
  headerBorder: '#e5e7eb',
  textPrimary: '#1f2937',
  textSecondary: '#6b7280',
  sidePanelBg: '#ffffff',
  sidePanelBorder: '#e5e7eb',
  toolbarBg: '#ffffff',
  mainCanvasBg: '#eef2ff',
  rightPanelBg: '#ffffff',
  rightPanelBorder: '#e5e7eb',
  primaryButtonBg: '#635bff',
  primaryButtonText: '#ffffff',
  neutralButtonBg: '#eef0ff',
  neutralButtonText: '#1f2937',
};

const LINEAR_DARK_THEME: ThemePalette = {
  mode: 'linearDark',
  isDark: true,
  appBg: '#0D0F14',
  headerBg: '#11151d',
  headerBorder: '#1f2430',
  textPrimary: '#d1d5db',
  textSecondary: '#9ca3af',
  sidePanelBg: '#0f131a',
  sidePanelBorder: '#1f2430',
  toolbarBg: '#10141b',
  mainCanvasBg: '#0b1017',
  rightPanelBg: '#0f131a',
  rightPanelBorder: '#1f2430',
  primaryButtonBg: '#5e6ad2',
  primaryButtonText: '#e5e7eb',
  neutralButtonBg: '#1a1f2a',
  neutralButtonText: '#d1d5db',
};

export const getThemeByMode = (mode: ThemeMode): ThemePalette =>
  mode === 'linearDark' ? LINEAR_DARK_THEME : STRIPE_THEME;

export const toggleThemeMode = (mode: ThemeMode): ThemeMode =>
  mode === 'stripe' ? 'linearDark' : 'stripe';

const KT_CLOUD_LOGO_IDS = {
  positive: '1SBE1xX6Hym5e_FuVeDsWRZyIhlCh_iuD',
  negative: '1SRulx9AmknWoL8TlXbpFMOQOI85JtHgb',
} as const;

const toDriveImageUrl = (fileId: string): string =>
  `https://drive.google.com/uc?export=view&id=${fileId}`;

export const getKtCloudLogoByMode = (mode: ThemeMode): string =>
  mode === 'linearDark'
    ? toDriveImageUrl(KT_CLOUD_LOGO_IDS.negative)
    : toDriveImageUrl(KT_CLOUD_LOGO_IDS.positive);
