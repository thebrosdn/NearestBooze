import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, Dimensions, StyleSheet } from 'react-native';

const { width } = Dimensions.get('window');
const SIZE = Math.min(width * 0.72, 280);

// Accumulates rotation to avoid spinning the long way round on wrap-around
function nextContinuousAngle(prev, rawTarget) {
  if (isNaN(rawTarget)) return prev;
  const norm = ((rawTarget % 360) + 360) % 360;
  let diff = norm - ((prev % 360) + 360) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return prev + diff;
}

const toRotation = (anim) =>
  anim.interpolate({
    inputRange: [-36000, 36000],
    outputRange: ['-36000deg', '36000deg'],
    extrapolate: 'extend',
  });

export default function Compass({ heading, bearing }) {
  const ringAnim = useRef(new Animated.Value(0)).current;
  const needleAnim = useRef(new Animated.Value(0)).current;
  const prevRing = useRef(0);
  const prevNeedle = useRef(0);

  useEffect(() => {
    const next = nextContinuousAngle(prevRing.current, -heading);
    prevRing.current = next;
    Animated.timing(ringAnim, { toValue: next, duration: 120, useNativeDriver: true }).start();
  }, [heading]);

  useEffect(() => {
    const next = nextContinuousAngle(prevNeedle.current, bearing - heading);
    prevNeedle.current = next;
    Animated.timing(needleAnim, { toValue: next, duration: 120, useNativeDriver: true }).start();
  }, [heading, bearing]);

  return (
    <View style={[st.wrap, { width: SIZE, height: SIZE }]}>
      {/* Outer glow ring (static) */}
      <View style={[st.glowRing, { width: SIZE + 10, height: SIZE + 10, borderRadius: (SIZE + 10) / 2 }]} />

      {/* Compass ring — rotates so N always faces magnetic north */}
      <Animated.View
        style={[
          st.ring,
          { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
          { transform: [{ rotate: toRotation(ringAnim) }] },
        ]}
      >
        <Text style={[st.card, { top: 10, color: '#ff5050' }]}>N</Text>
        <Text style={[st.card, { bottom: 10 }]}>S</Text>
        <Text style={[st.card, { right: 12 }]}>E</Text>
        <Text style={[st.card, { left: 12 }]}>W</Text>
        <Text style={[st.subcardinal, { top: SIZE * 0.16, right: SIZE * 0.09 }]}>NE</Text>
        <Text style={[st.subcardinal, { bottom: SIZE * 0.16, right: SIZE * 0.09 }]}>SE</Text>
        <Text style={[st.subcardinal, { bottom: SIZE * 0.16, left: SIZE * 0.09 }]}>SW</Text>
        <Text style={[st.subcardinal, { top: SIZE * 0.16, left: SIZE * 0.09 }]}>NW</Text>
      </Animated.View>

      {/* Inner ring accent (static) */}
      <View
        style={[st.innerRing, { width: SIZE * 0.8, height: SIZE * 0.8, borderRadius: SIZE * 0.4 }]}
      />

      {/* Needle — points toward the target venue */}
      <Animated.View
        style={[st.needleWrap, { width: SIZE, height: SIZE }, { transform: [{ rotate: toRotation(needleAnim) }] }]}
      >
        {/* Arrowhead (upward-pointing triangle ▲) */}
        <View
          style={[
            st.needleTip,
            { top: SIZE * 0.13, left: SIZE / 2 - 11 },
          ]}
        />
        {/* Bright shaft — head side */}
        <View
          style={[
            st.shaftTop,
            {
              top: SIZE * 0.13 + 22,
              left: SIZE / 2 - 2,
              height: SIZE / 2 - SIZE * 0.13 - 22,
            },
          ]}
        />
        {/* Muted shaft — tail side */}
        <View
          style={[
            st.shaftBot,
            {
              top: SIZE / 2,
              left: SIZE / 2 - 2,
              height: SIZE * 0.26,
            },
          ]}
        />
      </Animated.View>

      {/* Pivot dot */}
      <View style={st.pivot} />
    </View>
  );
}

const GOLD = '#f5a623';
const DARK = '#14142a';

const st = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  glowRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.18)',
    backgroundColor: 'transparent',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#3a3a5c',
    backgroundColor: DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    color: GOLD,
    fontWeight: 'bold',
    fontSize: 17,
  },
  subcardinal: {
    position: 'absolute',
    color: '#555577',
    fontSize: 9,
    fontWeight: '600',
  },
  innerRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(58,58,92,0.45)',
    backgroundColor: 'transparent',
  },
  needleWrap: {
    position: 'absolute',
  },
  needleTip: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 22,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: GOLD,
  },
  shaftTop: {
    position: 'absolute',
    width: 4,
    backgroundColor: GOLD,
  },
  shaftBot: {
    position: 'absolute',
    width: 4,
    backgroundColor: '#4a3a10',
  },
  pivot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: DARK,
  },
});
