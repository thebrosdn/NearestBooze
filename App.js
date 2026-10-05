import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';

import Compass from './components/Compass';
import ErrorBoundary from './components/ErrorBoundary';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import { fetchNearbyVenues } from './lib/overpass';
import { haversineMeters, bearingTo, compassPoint, formatDistance } from './lib/geo';
import { captureError } from './lib/reporting';

SplashScreen.preventAutoHideAsync().catch(() => {});

const LOCATION_TIMEOUT_MS = 15000;
const LAST_KNOWN_MAX_AGE_MS = 120000;
const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

// ── Data helpers ─────────────────────────────────────────────────────────────

function venueLabel(tags = {}) {
  if (tags.shop === 'alcohol' || tags.shop === 'wine' || tags.shop === 'beverages')
    return 'Liquor Store';
  if (tags.amenity === 'pub') return 'Pub';
  if (tags.amenity === 'nightclub') return 'Nightclub';
  if (tags.amenity === 'biergarten') return 'Beer Garden';
  return 'Bar';
}

async function ensureForegroundPermission() {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted || !current.canAskAgain) return current;
  return Location.requestForegroundPermissionsAsync();
}

// A GPS fix can hang indefinitely indoors, so bound the wait and fall back to
// the last known fix rather than leaving the user on a spinner forever.
async function getPositionWithTimeout() {
  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: LAST_KNOWN_MAX_AGE_MS,
  }).catch(() => null);

  let timer;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), LOCATION_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    if (lastKnown) return lastKnown;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function describeFailure(err) {
  if (err?.message === 'LOCATION_TIMEOUT') {
    return "Couldn't get a GPS fix. Try again somewhere with a clearer view of the sky.";
  }
  if (err?.kind === 'rate-limited') {
    return 'The OpenStreetMap servers are busy right now. Give it a moment and try again.';
  }
  if (err?.kind === 'timeout' || err?.kind === 'network') {
    return "Couldn't reach the venue database. Check your internet connection.";
  }
  return 'Something went wrong loading nearby venues. Please try again.';
}

// ── App ──────────────────────────────────────────────────────────────────────

function NearestBooze() {
  const [phase, setPhase] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errMsg, setErrMsg] = useState('');
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [banner, setBanner] = useState('');
  const [venues, setVenues] = useState([]);
  const [target, setTarget] = useState(null);
  const [heading, setHeading] = useState(0);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const abortRef = useRef(null);
  const hasVenuesRef = useRef(false);

  useEffect(() => {
    hasVenuesRef.current = venues.length > 0;
  }, [venues]);

  const loadData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setBanner('');
    // Keep existing results on screen while refreshing instead of flashing a spinner.
    if (hasVenuesRef.current) setRefreshing(true);
    else setPhase('loading');

    try {
      const permission = await ensureForegroundPermission();
      if (ac.signal.aborted) return;
      setHasLocationPermission(permission.granted);
      if (!permission.granted) {
        setPermissionBlocked(!permission.canAskAgain);
        setErrMsg(
          permission.canAskAgain
            ? 'NearestBooze needs your location to find nearby venues.'
            : 'Location access is turned off for NearestBooze. Enable it in Settings to find nearby venues.',
        );
        setPhase('error');
        return;
      }
      setPermissionBlocked(false);

      const pos = await getPositionWithTimeout();
      if (ac.signal.aborted) return;

      const { latitude, longitude } = pos.coords;
      const raw = await fetchNearbyVenues(latitude, longitude, { signal: ac.signal });
      if (ac.signal.aborted) return;

      const sorted = raw
        .map((v) => ({
          ...v,
          dist: haversineMeters(latitude, longitude, v.lat, v.lon),
          bearing: bearingTo(latitude, longitude, v.lat, v.lon),
        }))
        .sort((a, b) => a.dist - b.dist);

      if (sorted.length === 0) {
        setErrMsg('No bars or liquor stores found within 5 km of your location.');
        setPhase('error');
        return;
      }

      setVenues(sorted);
      setTarget((prev) => sorted.find((v) => v.id === prev?.id) ?? sorted[0]);
      setPhase('ready');
    } catch (err) {
      if (ac.signal.aborted) return;
      captureError(err, { stage: 'load-venues' });
      const message = describeFailure(err);
      // A failed refresh shouldn't wipe results that are still on screen.
      if (hasVenuesRef.current) {
        setBanner(message);
        setPhase('ready');
      } else {
        setErrMsg(message);
        setPhase('error');
      }
    } finally {
      if (!ac.signal.aborted) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => abortRef.current?.abort();
  }, [loadData]);

  // Compass heading. iOS gates heading updates behind location permission, so
  // only subscribe once it is granted.
  useEffect(() => {
    if (!hasLocationPermission) return undefined;
    let sub;
    let cancelled = false;

    Location.watchHeadingAsync((data) => {
      // bearingTo() returns a TRUE bearing, so the heading must be true north
      // too. magHeading is magnetic and is off by the local declination —
      // more than 20° in some regions. trueHeading is -1 when unavailable.
      const trueHeading = data.trueHeading;
      setHeading(trueHeading != null && trueHeading >= 0 ? trueHeading : data.magHeading ?? 0);
    })
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch((err) => captureError(err, { stage: 'watch-heading' }));

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [hasLocationPermission]);

  const onRootLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch((err) => captureError(err, { stage: 'open-settings' }));
  }, []);

  const footer = (
    <View style={s.footer}>
      <TouchableOpacity
        onPress={() => Linking.openURL(OSM_COPYRIGHT_URL).catch(() => {})}
        accessibilityRole="link"
        accessibilityLabel="Venue data from OpenStreetMap contributors. Opens the OpenStreetMap copyright page."
      >
        <Text style={s.footerTxt}>Venue data © OpenStreetMap contributors</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setPolicyOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open privacy policy"
      >
        <Text style={[s.footerTxt, s.footerLink]}>Privacy Policy</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View style={s.screen} onLayout={onRootLayout}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={s.loadText}>Finding the nearest booze…</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={s.screen} onLayout={onRootLayout}>
        <StatusBar style="light" />
        <Text style={s.errEmoji}>🍺</Text>
        <Text style={s.errText}>{errMsg}</Text>
        <TouchableOpacity
          style={s.btn}
          onPress={permissionBlocked ? openSettings : loadData}
          accessibilityRole="button"
          accessibilityLabel={permissionBlocked ? 'Open app settings' : 'Try again'}
        >
          <Text style={s.btnTxt}>{permissionBlocked ? 'Open Settings' : 'Try Again'}</Text>
        </TouchableOpacity>
        {permissionBlocked && (
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={loadData}
            accessibilityRole="button"
            accessibilityLabel="Check permission again"
          >
            <Text style={s.secondaryBtnTxt}>I've enabled it — retry</Text>
          </TouchableOpacity>
        )}
        {footer}
        <PrivacyPolicyModal visible={policyOpen} onClose={() => setPolicyOpen(false)} />
      </View>
    );
  }

  const compassLabel = target
    ? `${venueLabel(target.tags)}${target.tags?.name ? `, ${target.tags.name}` : ''}, ` +
      `${formatDistance(target.dist)} away, to the ${compassPoint(target.bearing)}`
    : 'No venue selected';

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} onLayout={onRootLayout}>
      <StatusBar style="light" />

      <Text style={s.title} accessibilityRole="header">
        NearestBooze
      </Text>

      {banner !== '' && (
        <View style={s.banner} accessibilityLiveRegion="polite">
          <Text style={s.bannerTxt}>{banner}</Text>
        </View>
      )}

      <Compass heading={heading} bearing={target?.bearing ?? 0} accessibilityLabel={compassLabel} />

      <View style={s.card}>
        <Text style={s.cardType}>{venueLabel(target?.tags)}</Text>
        <Text style={s.cardName} numberOfLines={2}>
          {target?.tags?.name || 'Unnamed Venue'}
        </Text>
        <Text style={s.cardDist}>{formatDistance(target?.dist ?? 0)}</Text>
      </View>

      {venues.length > 1 && (
        <ScrollView
          style={s.list}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {venues.slice(0, 10).map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[s.row, v.id === target?.id && s.rowActive]}
              onPress={() => setTarget(v)}
              accessibilityRole="button"
              accessibilityState={{ selected: v.id === target?.id }}
              accessibilityLabel={`${v.tags?.name || 'Unnamed'}, ${venueLabel(v.tags)}, ${formatDistance(v.dist)} away`}
            >
              <View style={s.rowLeft}>
                <Text style={s.rowName} numberOfLines={1}>
                  {v.tags?.name || 'Unnamed'}
                </Text>
                <Text style={s.rowType}>{venueLabel(v.tags)}</Text>
              </View>
              <Text style={s.rowDist}>{formatDistance(v.dist)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity
        style={[s.btn, s.refreshBtn, refreshing && s.btnDisabled]}
        onPress={loadData}
        disabled={refreshing}
        accessibilityRole="button"
        accessibilityState={{ disabled: refreshing, busy: refreshing }}
        accessibilityLabel="Refresh nearby venues"
      >
        <Text style={s.btnTxt}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
      </TouchableOpacity>

      {footer}

      <PrivacyPolicyModal visible={policyOpen} onClose={() => setPolicyOpen(false)} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NearestBooze />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const BG = '#0d0d1a';
const GOLD = '#f5a623';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, alignItems: 'center' },
  screen: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: GOLD,
    marginTop: 12,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  loadText: { color: '#8888aa', marginTop: 16, fontSize: 15 },
  errEmoji: { fontSize: 64, marginBottom: 16 },
  errText: {
    color: '#ccccdd',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 28,
    lineHeight: 22,
  },

  banner: {
    width: '88%',
    backgroundColor: '#2a1f12',
    borderColor: '#5a4a1a',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  bannerTxt: { color: '#e8c48a', fontSize: 12, textAlign: 'center' },

  card: {
    width: '88%',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#3a3a5c',
    marginBottom: 12,
  },
  cardType: {
    color: GOLD,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  cardName: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  cardDist: { color: '#8888aa', fontSize: 15 },

  list: { width: '88%', maxHeight: 190 },
  listContent: { paddingBottom: 4 },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#13132a',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowActive: { borderColor: GOLD },
  rowLeft: { flex: 1, marginRight: 10 },
  rowName: { color: '#ccccdd', fontSize: 14, fontWeight: '600' },
  rowType: { color: '#555577', fontSize: 11, marginTop: 1 },
  rowDist: { color: GOLD, fontSize: 13, fontWeight: '600' },

  btn: {
    backgroundColor: GOLD,
    paddingHorizontal: 36,
    paddingVertical: 13,
    borderRadius: 30,
  },
  refreshBtn: { marginTop: 14 },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: BG, fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },

  secondaryBtn: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 20 },
  secondaryBtnTxt: { color: '#8888aa', fontSize: 13, textDecorationLine: 'underline' },

  footer: { alignItems: 'center', paddingVertical: 10, gap: 3 },
  footerTxt: { color: '#555577', fontSize: 10 },
  footerLink: { textDecorationLine: 'underline' },
});
