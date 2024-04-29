
export type QuizSettings = {
  is_quiz: boolean;
  update_window_hours: number | null;
  wants_email_updates: boolean,
};

export interface Option {
  value: string;
  image_id?: number;
  is_other?: boolean;
  goto_action?: string;
  goto_section_id?: number;
}

export interface QuestionOptions {
  type: "RADIO" | "CHECKBOX" | "DROP_DOWN" | "CHOICE_TYPE_UNSPECIFIED";
  shuffle: boolean;
  choices: Option[];
}

export interface Question {
  required: boolean;
  kind:
    | "choice_question"
    | "text_question"
    | "scale_question"
    | "date_question"
    | "time_question"
    | "file_upload_question"
    | "row_question";
  grading?: Grading;
  options?: QuestionOptions;
}

export interface Grading {
  point_value: number;
  when_right: number;
  when_wrong: number;
  general_feedback: number;
  answer_key: string;
  auto_feedback: boolean;
}


export interface Item {
  item_id: number; 
  title: string;
  description: string;
  kind: string; 
  question?: Question;  
  questions?: Question[];  
}

export interface Section {
  section_id?: number;
  title: string;
  description: string;
  seq_order: number;
  items: Item[];
}

export interface FeedbackIds {
  when_right: number | null;
  when_wrong: number | null;
  general_feedback: number | null;
}


export interface AnswerDetails {
  grade: unknown;
  textAnswers: unknown;
  score: number;
  feedback: string;
}