export interface FormInfo {
  title: string;
  description?: string;
}

export interface FormSettings {
  isQuiz: boolean;
}

export interface Section {
  title: string;
  description?: string;
  seqOrder: number;
}

export interface Form {
  ownerId: number;
  info: FormInfo;
  settings: FormSettings;
  sections?: Section[];
}

