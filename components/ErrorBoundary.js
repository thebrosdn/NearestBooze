import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

import { captureError } from '../lib/reporting';

export default class ErrorBoundary extends React.Component {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    captureError(error, { boundary: 'root', componentStack: info?.componentStack?.slice(0, 500) });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <View style={s.screen}>
        <Text style={s.emoji}>🍺</Text>
        <Text style={s.title}>Something went wrong</Text>
        <Text style={s.body}>
          NearestBooze hit an unexpected error. Restarting usually clears it.
        </Text>
        <TouchableOpacity
          style={s.btn}
          onPress={() => this.setState({ crashed: false })}
          accessibilityRole="button"
          accessibilityLabel="Restart the app"
        >
          <Text style={s.btnTxt}>Restart</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const BG = '#0d0d1a';
const GOLD = '#f5a623';

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 56, marginBottom: 14 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  body: {
    color: '#ccccdd',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 28,
    lineHeight: 22,
  },
  btn: { backgroundColor: GOLD, paddingHorizontal: 36, paddingVertical: 13, borderRadius: 30 },
  btnTxt: { color: BG, fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },
});
