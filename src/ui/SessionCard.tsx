import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SessionInfo } from '../sessions/sessionTypes';
import { C } from '../../App';

interface SessionCardProps {
  session: SessionInfo;
  onPress: () => void;
  showAttendanceCounts?: boolean;
  presentCount?: number;
  absentCount?: number;
  lateCount?: number;
  invalidCount?: number;
}

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onPress,
  showAttendanceCounts = false,
  presentCount = 0,
  absentCount = 0,
  lateCount = 0,
  invalidCount = 0,
}) => {
  const statusColors = {
    active: C.teal,
    completed: C.purple,
    cancelled: C.red,
  };

  const statusLabels = {
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.header}>
        <View style={styles.courseInfo}>
          <Text style={styles.courseName}>{session.courseName || session.courseId}</Text>
          <Text style={styles.courseId}>{session.courseId}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColors[session.status] }]}>
          <Text style={styles.statusBadgeText}>{statusLabels[session.status]}</Text>
        </View>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Date</Text>
          <Text style={styles.metaValue}>
            {new Date(session.startTime).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Time</Text>
          <Text style={styles.metaValue}>
            {new Date(session.startTime).toLocaleTimeString()}
            {session.endTime && ` - ${new Date(session.endTime).toLocaleTimeString()}`}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>PIN Rotation</Text>
          <Text style={styles.metaValue}>{session.pinRotationSec}s</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Roster</Text>
          <Text style={styles.metaValue}>{session.roster.length} students</Text>
        </View>
      </View>

      {showAttendanceCounts && (
        <View style={styles.attendanceCounts}>
          <View style={styles.countItem}>
            <Text style={[styles.countNumber, { color: C.green }]}>{presentCount}</Text>
            <Text style={styles.countLabel}>Present</Text>
          </View>
          <View style={styles.countItem}>
            <Text style={[styles.countNumber, { color: C.red }]}>{absentCount}</Text>
            <Text style={styles.countLabel}>Absent</Text>
          </View>
          <View style={styles.countItem}>
            <Text style={[styles.countNumber, { color: C.purple }]}>{lateCount}</Text>
            <Text style={styles.countLabel}>Late</Text>
          </View>
          <View style={styles.countItem}>
            <Text style={[styles.countNumber, { color: C.red }]}>{invalidCount}</Text>
            <Text style={styles.countLabel}>Invalid</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.bgCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  courseInfo: {
    flex: 1,
    marginRight: 12,
  },
  courseName: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
    marginBottom: 2,
  },
  courseId: {
    fontSize: 13,
    color: C.lightGray,
    fontFamily: 'monospace',
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flex: 1,
    minWidth: '40%',
  },
  metaLabel: {
    fontSize: 11,
    color: C.midGray,
    fontWeight: '500',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    color: C.offWhite,
    fontWeight: '500',
  },
  attendanceCounts: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  countItem: {
    alignItems: 'center',
  },
  countNumber: {
    fontSize: 24,
    fontWeight: '800',
  },
  countLabel: {
    fontSize: 11,
    color: C.lightGray,
    marginTop: 2,
  },
});