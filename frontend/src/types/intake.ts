// Types for smart intake system

export interface IntakeField {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'textarea';
  options?: string[];
  required: boolean;
}

export interface IntakeAnalysisResult {
  category: 'medical' | 'dental' | 'automotive' | 'salon' | 'restaurant' | 'general';
  extractedInfo: Record<string, string>;
  missingFields: IntakeField[];
  optionalFields: IntakeField[];
  allFields: IntakeField[];
}

export interface IntakeFormData {
  [key: string]: string;
}
