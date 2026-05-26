import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import Compass from './components/Compass';

// ── Geo helpers ──────────────────────────────────────────────────────────────

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns bearing in degrees (0 = north, clockwise)
function bearingTo(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ── Overpass API ─────────────────────────────────────────────────────────────

async function fetchNearbyVenues(lat, lon) {
  const r = 5000;
  const q = `
    [out:json][timeout:25];
    (
      node["amenity"="bar"](around:${r},${lat},${lon});
      node["amenity"="pub"](around:${r},${lat},${lon});
      node["amenity"="nightclub"](around:${r},${lat},${lon});
      node["amenity"="biergarten"](around:${r},${lat},${lon});
      node["shop"="alcohol"](around:${r},${lat},${lon});
      node["shop"="wine"](around:${r},${lat},${lon});
      node["shop"="beverages"](around:${r},${lat},${lon});
    );
    out body;
  `;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error('Overpass API error');
  const json = await res.json();
  return (json.elements || []).filter((v) => v.lat != null && v.lon != null);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function venueLabel(tags = {}) {
  if (tags.shop === 'alcohol' || tags.shop === 'wine' || tags.shop === 'beverages')
    return 'Liquor Store';
  if (tags.amenity === 'pub') return 'Pub';
  if (tags.amenity === 'nightclub') return 'Nightclub';
  if (tags.amenity === 'biergarten') return 'Beer Garden';
  return 'Bar';
}

function fmtDist(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errMsg, setErrMsg] = useState('');
  const [venues, setVenues] = useState([]);
  const [target, setTarget] = useState(null);
  const [heading, setHeading] = useState(0);

  const loadData = useCallback(async () => {
    setPhase('loading');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrMsg('Location permission is required to find nearby venues.');
        setPhase('error');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = pos.coords;
      const raw = await fetchNearbyVenues(latitude, longitude);
      if (raw.length === 0) {
        setErrMsg('No bars or liquor stores found within 5 km of your location.');
        setPhase('error');
        return;
      }
      const sorted = raw
        .map((v) => ({
          ...v,
          dist: haversineMeters(latitude, longitude, v.lat, v.lon),
          bearing: bearingTo(latitude, longitude, v.lat, v.lon),
        }))
        .sort((a, b) => a.dist - b.dist);
      setVenues(sorted);
      setTarget(sorted[0]);
      setPhase('ready');
    } catch {
      setErrMsg('Could not load venues. Check your internet connection.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Device compass heading via expo-location (properly calibrated)
  useEffect(() => {
    let sub;
    Location.watchHeadingAsync((data) => {
      setHeading(data.magHeading ?? 0);
    }).then((s) => {
      sub = s;
    });
    return () => sub?.remove();
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View style={s.screen}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#f5a623" />
        <Text style={s.loadText}>Finding the nearest booze…</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={s.screen}>
        <StatusBar style="light" />
        <Text style={s.errEmoji}>🍺</Text>
        <Text style={s.errText}>{errMsg}</Text>
        <TouchableOpacity style={s.btn} onPress={loadData}>
          <Text style={s.btnTxt}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />

      <Text style={s.title}>NearestBooze</Text>

      <Compass heading={heading} bearing={target?.bearing ?? 0} />

      {/* Selected venue card */}
      <View style={s.card}>
        <Text style={s.cardType}>{venueLabel(target?.tags)}</Text>
        <Text style={s.cardName} numberOfLines={2}>
          {target?.tags?.name || 'Unnamed Venue'}
        </Text>
        <Text style={s.cardDist}>{fmtDist(target?.dist ?? 0)}</Text>
      </View>

      {/* Nearby list */}
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
            >
              <View style={s.rowLeft}>
                <Text style={s.rowName} numberOfLines={1}>
                  {v.tags?.name || 'Unnamed'}
                </Text>
                <Text style={s.rowType}>{venueLabel(v.tags)}</Text>
              </View>
              <Text style={s.rowDist}>{fmtDist(v.dist)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity style={[s.btn, s.refreshBtn]} onPress={loadData}>
        <Text style={s.btnTxt}>Refresh</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  refreshBtn: { marginTop: 14, marginBottom: 16 },
  btnTxt: { color: BG, fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },
});
