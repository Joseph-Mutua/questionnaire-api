export type QuizSettings = {
  is_quiz: boolean;
  update_window_hours: number | null;
  wants_email_updates: boolean;
  quiz_settings_id?: number;
};

export interface QuestionOptions {
  type: "RADIO" | "CHECKBOX" | "DROP_DOWN" | "CHOICE_TYPE_UNSPECIFIED";
  shuffle: boolean;
  choices: Option[];
}

export interface Grading {
  grading_id: number;
  point_value: number;
  when_right: string;
  when_wrong: string;
  general_feedback: string;
  answer_key: string;
  auto_feedback: boolean;
}


export interface Question {
  question_id: number;
  required: boolean;
  kind:
    | "CHOICE_QUESTION"
    | "TEXT_QUESTION"
    | "SCALE_QUESTION"
    | "DATE_QUESTION"
    | "TIME_QUESTION"
    | "FILE_UPLOAD_QUESTION"
    | "ROW_QUESTION";
  grading_id: number | null;
  grading?: Grading;
  options?: QuestionOptions;
}


export interface QuestionOptions {
  type: "RADIO" | "CHECKBOX" | "DROP_DOWN" | "CHOICE_TYPE_UNSPECIFIED";
  shuffle: boolean;
  choices: {
    option_id: number;
    value: string;
    image_id: number | null;
    is_other: boolean;
    goto_action:
      | "NEXT_SECTION"
      | "RESTART_FORM"
      | "SUBMIT_FORM"
      | "GO_TO_ACTION_UNSPECIFIED"
      | null;
  }[];
}

export interface Item {
  item_id: number;
  title: string;
  description: string;
  kind:
    | "QUESTION_ITEM"
    | "QUESTION_GROUP_ITEM"
    | "PAGE_BREAK_ITEM"
    | "TEXT_ITEM"
    | "IMAGE_ITEM";
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
  when_right: string | null;
  when_wrong: string | null;
  general_feedback: string | null;
}

export interface Grade {
  score: number;
  feedback: string;
}

export interface AnswerDetails {
  grade?: Grade;
  text_answers?: {
    answers: { value: string }[];
  };
}

export interface FormDetailsRequestBody {
  answers: AnswerDetails[];
  respondent_email: string;
}

export interface FormResponseBody {
  answers: { [questionId: string]: AnswerDetails };
  respondent_email: string;
}

interface Option {
  option_id: number;
  value: string;
  image_id: number | null;
  is_other: boolean;
  goto_action:
    | "NEXT_SECTION"
    | "RESTART_FORM"
    | "SUBMIT_FORM"
    | "GO_TO_ACTION_UNSPECIFIED"
    | null;
}

export interface FormDetails {
  form_id: number;
  title: string;
  description: string;
  settings: {
    is_quiz: boolean;
    update_window_hours: number;
    wants_email_updates: boolean;
  };
  revision_id: string;
  sections: Section[];
  feedbacks: Feedback[];
  navigation_rules: NavigationRule[];
}

export interface EmailTemplateData {
  responseLink?: string;
  formTitle?: string;
  responderEmail?: string;
  loginUrl?: string;
  password?: string;
}

export interface Feedback {
  feedback_id?: number;
  text: string;
}

export interface NavigationRule {
  rule_id?: number;
  section_id: number;
  target_section_id: number;
  condition: string;
}