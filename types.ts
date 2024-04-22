
export type QuizSettings = {
  is_quiz: boolean;
};

// export type Section = {
//   title: string;
//   description: string;
//   seq_order: number;
//   items: Item[];
// };

// export type Item = {
//   title: string;
//   description: string;
//   kind: string;
//   question?: Question;
// };

// export type Question = {
//   question_id: string;
//   required: boolean;
//   kind: string;
// };

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
  options?: QuestionOptions; // Add this line to include options for choice questions
}

// Define the structure for grading details
export interface Grading {
  point_value: number;
  when_right: number;
  when_wrong: number;
  general_feedback: number;
  answer_key: string;
  auto_feedback: boolean;
}

// Adjust the Item interface to include 'questions' for question groups
export interface Item {
  item_id?: number;  // Optional, depends on if it's being returned from the DB
  title: string;
  description: string;
  kind: string;  // 'question_item', 'question_group_item', etc.
  question?: Question;  // Used for single-question items
  questions?: Question[];  // Used for question groups, thus it's an array
}

// Example of a Section interface which uses Item
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
  score: number;
  feedback: string;
}