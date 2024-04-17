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
//   seqOrder: number;
// }

// export interface Form {
//   ownerId: number;
//   info: FormInfo;
//   settings: FormSettings;
//   sections?: Section[];
// }

// src/types.ts

export type QuizSettings = {
    isQuiz: boolean;
};

export type Section = {
    title: string;
    description: string;
    seqOrder: number;
    items: Item[];
};

export type Item = {
    title: string;
    description: string;
    kind: string;
    question?: Question;
};

export type Question = {
    questionId: string;
    required: boolean;
    kind: string;
};
