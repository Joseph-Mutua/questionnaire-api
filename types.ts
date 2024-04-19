
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




// Define the basic structure for a question
export interface Question {
  required: boolean;
  kind: string;  // 'choice_question', 'text_question', etc.
  grading?: Grading;  // Optional grading info
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

