import { Response, Request } from "express";
import { pool } from "../config/db";
import { QuizSettings, Section } from "../types";

export type AuthRequest = Request & { user?: { userId: string } };

export const createForm = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.userId;
  const { title } = req.body;

  if (!user_id) {
    return res.status(403).json({ error: "User must be logged in." });
  }

  try {
    await pool.query("BEGIN");

    const form_info_query =
      "INSERT INTO form_info(title, description) VALUES($1, $2) RETURNING info_id";
    const form_info_values = [title, ""];
    const form_info_result = await pool.query(
      form_info_query,
      form_info_values
    );

    const forms_query =
      "INSERT INTO forms(owner_id, info_id, revision_id, responder_uri, settings_id) VALUES($1, $2, 'v1.0', '', NULL) RETURNING form_id";
    const forms_values = [user_id, form_info_result.rows[0].info_id];
    const form_result = await pool.query(forms_query, forms_values);

    await pool.query("COMMIT");
    res.status(201).json({
      message: "Form created successfully",
      formId: form_result.rows[0].form_id,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};

export const updateForm = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.userId;
  const form_id = parseInt(req.params.id);
  const {
    sections,
    settings,
  }: { sections: Section[]; settings?: QuizSettings } = req.body;

  if (!user_id) {
    return res.status(403).json({ error: "User must be logged in." });
  }
  if (!form_id) {
    return res.status(400).json({ error: "Invalid form ID." });
  }

  try {
    await pool.query("BEGIN");


    if (settings) {
      const quiz_settings_query =
        "INSERT INTO quiz_settings(is_quiz) VALUES ($1) RETURNING quiz_settings_id";
      const quiz_settings_result = await pool.query(quiz_settings_query, [
        settings.is_quiz,
      ]);

      const form_settings_query =
        "UPDATE form_settings SET quiz_settings_id = $1 WHERE settings_id = (SELECT settings_id FROM forms WHERE form_id = $2)";
      await pool.query(form_settings_query, [
        quiz_settings_result.rows[0].quiz_settings_id,
        form_id,
      ]);
    }


    
    for (const section of sections) {
      const section_query =
        "INSERT INTO sections(form_id, title, description, seq_order) VALUES($1, $2, $3, $4) RETURNING section_id";
      const section_values = [
        form_id,
        section.title,
        section.description,
        section.seq_order,
      ];
      const section_result = await pool.query(section_query, section_values);

      const section_id = section_result.rows[0].section_id;

      for (const item of section.items) {
        const item_query =
          "INSERT INTO items(form_id, title, description, kind) VALUES($1, $2, $3, $4) RETURNING item_id";
        const item_values = [form_id, item.title, item.description, item.kind];
        const item_result = await pool.query(item_query, item_values);

        if (item.kind === "questionItem" && item.question) {
          const question_query =
            "INSERT INTO questions(required, kind) VALUES($1, $2) RETURNING question_id";
          const question_values = [item.question.required, item.question.kind];
          const question_result = await pool.query(
            question_query,
            question_values
          );

          const question_item_query =
            "INSERT INTO question_items(item_id, question_id) VALUES($1, $2)";
          await pool.query(question_item_query, [
            item_result.rows[0].item_id,
            question_result.rows[0].question_id,
          ]);
        }
      }
    }

    await pool.query("COMMIT");
    res.status(200).json({
      message: "Form updated successfully",
      formId: form_id,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error during form update:", error);
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }

};

