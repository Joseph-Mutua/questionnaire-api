// export type QuizSettings = {
//   is_quiz: boolean;
//   update_window_hours: number | null;
//   wants_email_updates: boolean;
//   quiz_settings_id?: number;
// };

// export interface QuestionOptions {
//   type: "RADIO" | "CHECKBOX" | "DROP_DOWN" | "CHOICE_TYPE_UNSPECIFIED";
//   shuffle: boolean;
//   choices: Option[];
// }

// export interface Question {
//   required: boolean;
//   kind:
//     | "choice_question"
//     | "text_question"
//     | "scale_question"
//     | "date_question"
//     | "time_question"
//     | "file_upload_question"
//     | "row_question";
//   grading?: Grading;
//   options?: QuestionOptions;
// }

// export interface Grading {
//   point_value: number;
//   when_right: number;
//   when_wrong: number;
//   general_feedback: number;
//   answer_key: string;
//   auto_feedback: boolean;
// }

// export interface Item {
//   item_id: number;
//   title: string;
//   description: string;
//   kind: string;
//   question?: Question;
//   questions?: Question[];
// }

// export interface Section {
//   section_id?: number;
//   title: string;
//   description: string;
//   seq_order: number;
//   items: Item[];
// }

// export interface FeedbackIds {
//   when_right: number | null;
//   when_wrong: number | null;
//   general_feedback: number | null;
// }

// export interface Grade {
//   score: number;
//   feedback: string;
// }

// export interface AnswerDetails {
//   grade?: Grade;
//   text_answers?: {
//     // answers: string[];
//     answers: { value: string }[];
//   };
// }

// export interface FormDetailsRequestBody {
//   answers: AnswerDetails[];
//   respondent_email: string;
// }

// export interface FormResponseBody {
//   answers: { [questionId: string]: AnswerDetails };
//   respondent_email: string;
// }

// interface Option {
//   option_id: number;
//   value: string;
//   image_id: number | null;
//   is_other: boolean;
//   goto_action:
//     | "NEXT_SECTION"
//     | "RESTART_FORM"
//     | "SUBMIT_FORM"
//     | "GO_TO_ACTION_UNSPECIFIED"
//     | null;
// }

// export interface FormDetails {
//   form_id: number;
//   revision_id: string;
//   title: string;
//   description: string | null;
//   settings_id: number;
//   is_quiz: boolean | null;
//   quiz_settings_id: number | null;
//   update_window_hours: number;
//   wants_email_updates: boolean;
//   sections: Section[];
// }

// export interface EmailTemplateData {
//   responseLink?: string;
//   formTitle?: string;
//   responderEmail?: string;
//   loginUrl?: string;
//   password?: string;
// }


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
  kind:
    | "question_item"
    | "question_group_item"
    | "page_break_item"
    | "text_item"
    | "image_item";
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
  revision_id: string;
  title: string;
  description: string | null;
  settings_id: number;
  is_quiz: boolean | null;
  quiz_settings_id: number | null;
  update_window_hours: number;
  wants_email_updates: boolean;
  sections: Section[];
}

export interface EmailTemplateData {
  responseLink?: string;
  formTitle?: string;
  responderEmail?: string;
  loginUrl?: string;
  password?: string;
}
