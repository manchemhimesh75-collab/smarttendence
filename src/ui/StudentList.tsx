import React from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList } from 'react-native';
import { AttendanceRecord, AttendanceStatus } from '../sessions/sessionTypes';
import { C } from '../../App';

interface StudentListProps {
  records: AttendanceRecord[];
  onRefresh?: () => void;
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: C.green,
  absent: C.red,
  late: C.purple,
  invalid: C.red,
};

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  invalid: 'Invalid',
};

const STATUS_ICONS: Record<AttendanceStatus, string> = {
  present: '✓',
  absent: '✗',
  late: '⏰',
  invalid: '⚠',
};

interface StudentItemProps {
  record: AttendanceRecord;
  index: number;
}

const StudentItem: React.FC<StudentItemProps> = ({ record, index }) => {
  const statusColor = STATUS_COLORS[record.status];
  const signalBars = getSignalBars(record.rssi || -100);

  return (
    <View style={[styles.card, index % 2 === 0 ? styles.cardAlt : null]}>
      <View style={styles.mainInfo}>
        <View style={styles.statusRow}>
          <Text style={[styles.statusIcon, { color: statusColor }]}>
            {STATUS_ICONS[record.status]}
          </Text>
          <Text style={styles.enrollment}>{record.studentId}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusBadgeText}>{STATUS_LABELS[record.status]}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          {record.rssi && (
            <View style={styles.rssiContainer}>
              <Text style={styles.rssiLabel}>Signal</Text>
              <Text style={styles.rssiValue}>{record.rssi} dBm</Text>
              <View style={styles.bars}>
                {[1, 2, 3, 4].map(b => (
                  <View
                    key={b}
                    style={[
                      styles.bar,
                      { height: 6 + b * 4 },
                      b <= signalBars ? styles.barActive : styles.barInactive
                    ]}
                  />
                ))}
              </View>
            </View>
          )}
          {record.timestamp && (
            <Text style={styles.time}>
              {new Date(record.timestamp).toLocaleTimeString()}
            </Text>
          )}
        </View>
      </View>
      {record.proof && (
        <View style={styles.proofInfo}>
          <Text style={styles.proofLabel}>Verified: {record.proof.signature.slice(0, 16)}...</Text>
        </View>
      )}
    </View>
  );
};

function getSignalBars(rssi: number): number {
  if (rssi >= -50) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

export const StudentList: React.FC<StudentListProps> = ({ records, onRefresh }) => {
  if (records.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📡</Text>
        <Text style={styles.emptyText}>Waiting for students…</Text>
        <Text style={styles.emptyHint}>Students should scan QR or enter PIN</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={records}
      renderItem={({ item, index }) => <StudentItem record={item} index={index} />}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={onRefresh ? (
        <React.RefreshControl refreshing={false} onRefresh={onRefresh} />
      ) : null}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    paddingBottom: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardAlt: {
    backgroundColor: '#1a2536',
  },
  mainInfo: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  statusIcon: {
    fontSize: 20,
  },
  enrollment: {
    fontSize: 16,
    fontWeight: '600',
    color: C.white,
    flex: 1,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rssiContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rssiLabel: {
    fontSize: 11,
    color: C.midGray,
    fontWeight: '500',
  },
  rssiValue: {
    fontSize: 12,
    color: C.lightGray,
    fontFamily: 'monospace',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginLeft: 4,
  },
  bar: {
    width: 5,
    borderRadius: 2,
  },
  barActive: {
    backgroundColor: C.green,
  },
  barInactive: {
    backgroundColor: C.border,
  },
  time: {
    fontSize: 12,
    color: C.midGray,
    marginLeft: 'auto',
  },
  proofInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  proofLabel: {
    fontSize: 11,
    color: C.midGray,
    fontFamily: 'monospace',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: C.lightGray,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    color: C.midGray,
    marginTop: 4,
    textAlign: 'center',
  },
});