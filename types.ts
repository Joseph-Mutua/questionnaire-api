// export interface FormInfo {
//   title: string;
//   description?: string;
// }

// export interface FormSettings {
//   isQuiz: boolean;
// }

// export interface Section {
//   title: string;
//   description?: string;
//   seq_order: number;
// }

// export interface Form {
//   ownerId: number;
//   info: FormInfo;
//   settings: FormSettings;
//   sections?: Section[];
// }

// src/types.ts

export type QuizSettings = {
  is_quiz: boolean;
};

export type Section = {
  title: string;
  description: string;
  seq_order: number;
  items: Item[];
};

export type Item = {
  title: string;
  description: string;
  kind: string;
  question?: Question;
};

export type Question = {
  question_id: string;
  required: boolean;
  kind: string;
};
