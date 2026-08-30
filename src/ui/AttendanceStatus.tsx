import React from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { C } from '../../App';

type StatusType = 'idle' | 'broadcasting' | 'success' | 'error' | 'verified';

interface AttendanceStatusProps {
  type: StatusType;
  message: string;
  pinTimeRemaining?: number;
  onRetry?: () => void;
}

export const AttendanceStatus: React.FC<AttendanceStatusProps> = ({
  type,
  message,
  pinTimeRemaining,
  onRetry,
}) => {
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (type === 'broadcasting') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
      return () => pulse.stopAnimation();
    }
  }, [type]);

  const getStyles = () => {
    switch (type) {
      case 'broadcasting':
        return { container: styles.broadcasting, text: styles.broadcastingText, icon: '📡' };
      case 'success':
        return { container: styles.success, text: styles.successText, icon: '✅' };
      case 'error':
        return { container: styles.error, text: styles.errorText, icon: '❌' };
      case 'verified':
        return { container: styles.verified, text: styles.verifiedText, icon: '✓' };
      default:
        return { container: styles.idle, text: styles.idleText, icon: '📋' };
    }
  };

  const { container, text, icon } = getStyles();

  return (
    <Animated.View style={[styles.container, container, type === 'broadcasting' && { transform: [{ scale: pulseAnim }] }]}>
      <View style={styles.content}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={[styles.message, text]}>{message}</Text>
      </View>
      {pinTimeRemaining !== undefined && type === 'broadcasting' && (
        <View style={styles.timerContainer}>
          <Text style={styles.timerLabel}>PIN expires in</Text>
          <Text style={styles.timerValue}>{Math.ceil(pinTimeRemaining / 1000)}s</Text>
          <Animated.View style={[
            styles.timerProgress,
            { width: `${(pinTimeRemaining / 30000) * 100}%` }
          ]} />
        </View>
      )}
      {type === 'error' && onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    fontSize: 24,
  },
  message: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  idle: {
    backgroundColor: C.inputBg,
    borderColor: C.inputBorder,
  },
  idleText: {
    color: C.lightGray,
  },
  broadcasting: {
    backgroundColor: '#1e3a8a',
    borderColor: '#3b82f6',
  },
  broadcastingText: {
    color: '#93c5fd',
  },
  success: {
    backgroundColor: C.greenBg,
    borderColor: C.green,
  },
  successText: {
    color: '#86efac',
  },
  error: {
    backgroundColor: C.redBg,
    borderColor: C.red,
  },
  errorText: {
    color: '#fca5a5',
  },
  verified: {
    backgroundColor: C.greenBg,
    borderColor: C.green,
  },
  verifiedText: {
    color: '#86efac',
  },
  timerContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  timerLabel: {
    fontSize: 12,
    color: C.lightGray,
    marginBottom: 4,
  },
  timerValue: {
    fontSize: 28,
    fontWeight: '800',
    color: C.white,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  timerProgress: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.teal,
    marginTop: 8,
  },
  retryButton: {
    backgroundColor: C.teal,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  retryButtonText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
  },
});