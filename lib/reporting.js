import * as Sentry from '@sentry/react-native';

// Set EXPO_PUBLIC_SENTRY_DSN (see .env.example / eas.json) to turn reporting on.
// With no DSN the app runs exactly as before and nothing leaves the device.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const reportingEnabled = Boolean(dsn);

export function initReporting() {
  if (!reportingEnabled) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    // This app handles location data. Never let the SDK attach user identifiers
    // or request bodies — the privacy policy promises coordinates stay local.
    sendDefaultPii: false,
  });
}

export function wrapRoot(RootComponent) {
  return reportingEnabled ? Sentry.wrap(RootComponent) : RootComponent;
}

export function captureError(error, tags) {
  if (reportingEnabled) {
    Sentry.captureException(error, tags ? { tags } : undefined);
  } else if (__DEV__) {
    console.warn('[NearestBooze]', tags ?? '', error);
  }
}
