import pkg from '../../package.json' with { type: 'json' };

export const APP_VERSION = pkg.version;
export const DISPLAY_VERSION = `Beta ${pkg.version.replace(/-beta$/, '')}`;
