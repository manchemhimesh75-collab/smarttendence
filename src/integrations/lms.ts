export interface LmsConfig {
  baseUrl: string;
  apiKey: string;
  courseIdMapping: Record<string, string>;
}

export interface LmsAttendancePayload {
  sessionId: string;
  courseId: string;
  studentId: string;
  status: 'present' | 'absent' | 'late';
  timestamp: number;
  verificationProof?: string;
}

export interface LmsSyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: string[];
}

export class LmsIntegration {
  private config: LmsConfig;

  constructor(config: LmsConfig) {
    this.config = config;
  }

  async syncAttendance(records: LmsAttendancePayload[]): Promise<LmsSyncResult> {
    const results: LmsSyncResult = {
      success: false,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    };

    for (const record of records) {
      try {
        await this.sendAttendanceRecord(record);
        results.syncedCount++;
      } catch (error) {
        results.failedCount++;
        results.errors.push(`${record.studentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    results.success = results.failedCount === 0;
    return results;
  }

  private async sendAttendanceRecord(record: LmsAttendancePayload): Promise<void> {
    const lmsCourseId = this.config.courseIdMapping[record.courseId];
    if (!lmsCourseId) {
      throw new Error(`No LMS course mapping for ${record.courseId}`);
    }

    const response = await fetch(`${this.config.baseUrl}/api/v1/courses/${lmsCourseId}/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        session_id: record.sessionId,
        student_id: record.studentId,
        status: record.status,
        timestamp: new Date(record.timestamp).toISOString(),
        verification_proof: record.verificationProof,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LMS API error: ${response.status} ${error}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/v1/health`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createLmsIntegrationFromEnv(): LmsIntegration | null {
  const baseUrl = process.env.LMS_BASE_URL;
  const apiKey = process.env.LMS_API_KEY;
  
  if (!baseUrl || !apiKey) {
    return null;
  }

  return new LmsIntegration({
    baseUrl,
    apiKey,
    courseIdMapping: {},
  });
}