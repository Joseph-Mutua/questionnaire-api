import { Response, Request } from "express";
import { pool } from "../config/db";
import { Item, QuizSettings, Section } from "../types";
import { Pool } from "pg";

export type AuthRequest = Request & { user?: { userId: string } };

export const createForm = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.userId;
  const { title, description } = req.body;

  if (!user_id) {
    return res.status(403).json({ error: "User must be logged in." });
  }

  try {
    await pool.query("BEGIN");

    // Insert into form_info table
    const form_info_query =
      "INSERT INTO form_info(title, description) VALUES($1, $2) RETURNING info_id";
    const form_info_values = [title, description || ""];
    const form_info_result = await pool.query(
      form_info_query,
      form_info_values
    );

    // Prepare and insert data into the forms table
    const forms_query =
      "INSERT INTO forms(owner_id, info_id, revision_id, responder_uri, settings_id) VALUES($1, $2, 'v1.0', '', NULL) RETURNING form_id";
    const forms_values = [user_id, form_info_result.rows[0].info_id];
    const forms_result = await pool.query(forms_query, forms_values);

    // Retrieve all details of the newly created form
    const form_details_query = `
      SELECT f.form_id, f.revision_id, f.responder_uri, fi.title, fi.description
      FROM forms f
      JOIN form_info fi ON f.info_id = fi.info_id
      WHERE f.form_id = $1;
    `;
    const form_details = await pool.query(form_details_query, [
      forms_result.rows[0].form_id,
    ]);

    await pool.query("COMMIT");

    // Return the complete details of the newly created form
    res.status(201).json({
      message: "Form created successfully",
      form: form_details.rows[0], // Send back the detailed form data
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error during form creation:", error);
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};

export const updateForm = async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.userId;
  const form_id = parseInt(req.params.id);
  const { sections, settings } = req.body;

  if (!user_id) {
    return res.status(403).json({ error: "User must be logged in." });
  }
  if (!form_id) {
    return res.status(400).json({ error: "Invalid form ID." });
  }

  try {
    await pool.query("BEGIN");

    // Handle quiz settings
    let settings_id = await updateOrCreateSettings(pool, settings, form_id);

    // Process each section and its items
    for (const section of sections) {
      let section_id = await handleSection(pool, form_id, section);

      for (const item of section.items) {
        await handleItem(pool, form_id, section_id, item);
      }
    }

    // Fetch updated form details
    const formDetails = await fetchFormDetails(pool, form_id);

    await pool.query("COMMIT");

    res.status(200).json({
      message: "Form updated successfully",
      formDetails: formDetails,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error during form update:", error);
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};

async function updateOrCreateSettings(
  pool: Pool,
  settings: any,
  form_id: number
) {
  if (settings && settings.hasOwnProperty("is_quiz")) {
    const settingsExist = await pool.query(
      "SELECT settings_id FROM forms WHERE form_id = $1",
      [form_id]
    );
    if (settingsExist.rows.length > 0 && settingsExist.rows[0].settings_id) {
      const updateQuizSettingsQuery =
        "UPDATE quiz_settings SET is_quiz = $1 WHERE quiz_settings_id = (SELECT quiz_settings_id FROM form_settings WHERE settings_id = $2) RETURNING quiz_settings_id";
      await pool.query(updateQuizSettingsQuery, [
        settings.is_quiz,
        settingsExist.rows[0].settings_id,
      ]);
      return settingsExist.rows[0].settings_id;
    } else {
      const quizSettingsResult = await pool.query(
        "INSERT INTO quiz_settings (is_quiz) VALUES ($1) RETURNING quiz_settings_id",
        [settings.is_quiz]
      );
      const formSettingsResult = await pool.query(
        "INSERT INTO form_settings (quiz_settings_id) VALUES ($1) RETURNING settings_id",
        [quizSettingsResult.rows[0].quiz_settings_id]
      );
      await pool.query("UPDATE forms SET settings_id = $1 WHERE form_id = $2", [
        formSettingsResult.rows[0].settings_id,
        form_id,
      ]);
      return formSettingsResult.rows[0].settings_id;
    }
  }
  return null;
}

async function handleSection(pool: Pool, form_id: number, section: Section) {
  const sectionResult = await pool.query(
    "INSERT INTO sections (form_id, title, description, seq_order) VALUES ($1, $2, $3, $4) ON CONFLICT (form_id, seq_order) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description RETURNING section_id",
    [form_id, section.title, section.description, section.seq_order]
  );
  return sectionResult.rows[0].section_id;
}

async function handleItem(pool: Pool, form_id: number, section_id: number, item: Item) {
  const itemResult = await pool.query(
    `INSERT INTO items (form_id, section_id, title, description, kind) 
     VALUES ($1, $2, $3, $4, $5) 
     ON CONFLICT (form_id, title) DO UPDATE SET
     description = EXCLUDED.description, 
     kind = EXCLUDED.kind, 
     section_id = EXCLUDED.section_id 
     RETURNING item_id`,
    [form_id, section_id, item.title, item.description, item.kind]
  );

  if (item.kind === "question_item" && item.question) {
    // Check if the question already exists
    const { required, kind } = item.question;
    const questionResult = await pool.query(
      `SELECT question_id FROM questions 
       WHERE required = $1 AND kind = $2 LIMIT 1`,
      [required, kind]
    );

    let question_id;
    if (questionResult.rows.length === 0) {
      // No existing question matches the criteria, create a new one
      const newQuestionResult = await pool.query(
        `INSERT INTO questions (required, kind) VALUES ($1, $2) RETURNING question_id`,
        [required, kind]
      );
      question_id = newQuestionResult.rows[0].question_id;
    } else {
      // Use the existing question
      question_id = questionResult.rows[0].question_id;
    }

    // Link the item to the question
    await pool.query(
      `INSERT INTO question_items (item_id, question_id) VALUES ($1, $2) 
       ON CONFLICT (item_id, question_id) DO NOTHING`,
      [itemResult.rows[0].item_id, question_id]
    );
  }
}




async function fetchFormDetails(pool: Pool, form_id: number) {
  const query = `
        SELECT 
            f.form_id, fi.title, fi.description, fs.settings_id, qs.is_quiz,
            json_agg(json_build_object(
                'section_id', s.section_id, 
                'title', s.title, 
                'description', s.description,
                'seq_order', s.seq_order,
                'items', (SELECT json_agg(json_build_object(
                    'item_id', i.item_id, 
                    'title', i.title, 
                    'description', i.description, 
                    'kind', i.kind,
                    'questions', (SELECT json_agg(json_build_object(
                        'question_id', q.question_id, 
                        'required', q.required, 
                        'kind', q.kind
                    )) FROM questions q JOIN question_items qi ON q.question_id = qi.question_id WHERE qi.item_id = i.item_id)
                )) FROM items i WHERE i.section_id = s.section_id)
            )) AS sections
        FROM forms f
        LEFT JOIN form_info fi ON f.info_id = fi.info_id
        LEFT JOIN form_settings fs ON f.settings_id = fs.settings_id
        LEFT JOIN quiz_settings qs ON fs.quiz_settings_id = qs.quiz_settings_id
        LEFT JOIN sections s ON f.form_id = s.form_id
        WHERE f.form_id = $1
        GROUP BY f.form_id, fi.title, fi.description, fs.settings_id, qs.is_quiz;
    `;
  const details = await pool.query(query, [form_id]);
  return details.rows[0]; // Assuming there is always at least one form with the given ID
}
