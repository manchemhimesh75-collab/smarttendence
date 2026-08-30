import React from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { C } from '../../App';

interface PinCardProps {
  pin: string;
  timeRemaining: number;
  isActive: boolean;
  rotationSec: number;
}

export const PinCard: React.FC<PinCardProps> = ({ pin, timeRemaining, isActive, rotationSec }) => {
  const progressAnim = React.useRef(new Animated.Value(1)).current;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (isActive) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
    }
    return () => { if (isActive) pulseAnim.stopAnimation(); };
  }, [isActive]);

  React.useEffect(() => {
    progressAnim.setValue(1);
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: timeRemaining,
      useNativeDriver: true,
      easing: Easing.linear,
    }).start();
  }, [timeRemaining, rotationSec]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.card, { transform: [{ scale: pulseAnim }] }]}>
      <View style={styles.header}>
        <Text style={styles.label}>CLASS PIN</Text>
        <Animated.View style={[
          styles.progressBar,
          { width: progressWidth },
          { backgroundColor: timeRemaining < 5000 ? C.red : C.green }
        ]} />
      </View>
      <Text style={styles.pin}>{pin}</Text>
      <View style={styles.footer}>
        <View style={[
          styles.liveDot,
          { backgroundColor: timeRemaining < 5000 ? C.red : C.green }
        ]} />
        <Text style={styles.liveText}>
          {isActive ? 'LIVE — Scanning for students' : 'Session not active'}
        </Text>
        <Text style={styles.timer}>
          {Math.ceil(timeRemaining / 1000)}s
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.teal,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 8,
    shadowColor: C.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 2,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    flex: 1,
    marginLeft: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  pin: {
    fontSize: 56,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 16,
    fontFamily: 'monospace',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 12,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  liveText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    flex: 1,
    marginHorizontal: 8,
  },
  timer: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
    fontFamily: 'monospace',
  },
});