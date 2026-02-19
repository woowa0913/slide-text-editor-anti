import { describe, expect, it } from 'vitest';
import { getKtCloudLogoByMode, getThemeByMode, toggleThemeMode } from './theme';

describe('theme mode helpers', () => {
  it('returns Stripe theme as default light mode', () => {
    const theme = getThemeByMode('stripe');
    expect(theme.mode).toBe('stripe');
    expect(theme.isDark).toBe(false);
    expect(theme.headerBg).toBe('#ffffff');
  });

  it('returns Linear dark theme in dark mode', () => {
    const theme = getThemeByMode('linearDark');
    expect(theme.mode).toBe('linearDark');
    expect(theme.isDark).toBe(true);
    expect(theme.headerBg).toBe('#11151d');
  });

  it('toggles between Stripe and Linear dark modes', () => {
    expect(toggleThemeMode('stripe')).toBe('linearDark');
    expect(toggleThemeMode('linearDark')).toBe('stripe');
  });

  it('uses positive logo for light mode and negative logo for dark mode', () => {
    const lightLogo = getKtCloudLogoByMode('stripe');
    const darkLogo = getKtCloudLogoByMode('linearDark');

    expect(lightLogo).toContain('1SBE1xX6Hym5e_FuVeDsWRZyIhlCh_iuD');
    expect(darkLogo).toContain('1SRulx9AmknWoL8TlXbpFMOQOI85JtHgb');
  });
});
