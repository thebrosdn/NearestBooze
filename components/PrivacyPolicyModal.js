import React from 'react';
import { StyleSheet, View, Text, Modal, ScrollView, TouchableOpacity } from 'react-native';

export const LAST_UPDATED = '2026-10-05';

const SECTIONS = [
  {
    heading: 'What we collect',
    body:
      'Nothing. NearestBooze has no accounts, no sign-in, and no analytics. We do not ' +
      'operate a server and we never receive, store, or sell your personal data.',
  },
  {
    heading: 'How your location is used',
    body:
      'Your device location is read only while the app is open and is used entirely on ' +
      'your device to sort nearby venues and aim the compass needle. It is never stored ' +
      'and never leaves the app except as described below.',
  },
  {
    heading: 'Third-party venue lookups',
    body:
      'To find nearby venues the app sends your approximate coordinates to the public ' +
      'OpenStreetMap Overpass API. Those volunteer-run servers may log the request and ' +
      'your IP address under their own privacy policies. No identifier of you or your ' +
      'device is attached to the request.',
  },
  {
    heading: 'Compass data',
    body: 'Magnetometer and heading readings are used on-device only and are never transmitted.',
  },
  {
    heading: 'Crash reports',
    body:
      'If crash reporting is enabled in a release, anonymous crash diagnostics (device ' +
      'model, OS version, stack trace) are sent to Sentry. Location data and personally ' +
      'identifying information are explicitly excluded.',
  },
  {
    heading: 'Children and alcohol',
    body:
      'NearestBooze surfaces alcohol-related venues and is intended for users who are of ' +
      'legal drinking age in their country. Please drink responsibly and never drink and drive.',
  },
  {
    heading: 'Contact',
    body: 'Questions about this policy: thebrosdn@gmail.com',
  },
];

export default function PrivacyPolicyModal({ visible, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={s.screen}>
        <Text style={s.title}>Privacy Policy</Text>
        <Text style={s.updated}>Last updated {LAST_UPDATED}</Text>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {SECTIONS.map((sec) => (
            <View key={sec.heading} style={s.section}>
              <Text style={s.heading}>{sec.heading}</Text>
              <Text style={s.body}>{sec.body}</Text>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={s.btn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close privacy policy"
        >
          <Text style={s.btnTxt}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const BG = '#0d0d1a';
const GOLD = '#f5a623';

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingTop: 64, paddingHorizontal: 24, paddingBottom: 28 },
  title: { color: GOLD, fontSize: 22, fontWeight: 'bold', letterSpacing: 1 },
  updated: { color: '#555577', fontSize: 12, marginTop: 4, marginBottom: 16 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  section: { marginBottom: 18 },
  heading: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  body: { color: '#ccccdd', fontSize: 14, lineHeight: 21 },
  btn: {
    backgroundColor: GOLD,
    paddingVertical: 13,
    borderRadius: 30,
    alignItems: 'center',
  },
  btnTxt: { color: BG, fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },
});
