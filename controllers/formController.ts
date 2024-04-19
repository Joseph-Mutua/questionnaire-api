import { Response, Request } from "express";
import { pool } from "../config/db";
import { QuizSettings, Section } from "../types";
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

// export const updateForm = async (req: AuthRequest, res: Response) => {
//   const user_id = req.user?.userId;
//   const form_id = parseInt(req.params.id);
//   const {
//     sections,
//     settings,
//   }: { sections: Section[]; settings?: QuizSettings } = req.body;

//   if (!user_id) {
//     return res.status(403).json({ error: "User must be logged in." });
//   }
//   if (!form_id) {
//     return res.status(400).json({ error: "Invalid form ID." });
//   }

//   try {
//     await pool.query("BEGIN");

//     if (settings) {
//       const quiz_settings_query =
//         "INSERT INTO quiz_settings(is_quiz) VALUES ($1) RETURNING quiz_settings_id";
//       const quiz_settings_result = await pool.query(quiz_settings_query, [
//         settings.is_quiz,
//       ]);

//       const form_settings_query =
//         "UPDATE form_settings SET quiz_settings_id = $1 WHERE settings_id = (SELECT settings_id FROM forms WHERE form_id = $2)";
//       await pool.query(form_settings_query, [
//         quiz_settings_result.rows[0].quiz_settings_id,
//         form_id,
//       ]);
//     }

//     for (const section of sections) {
//       const section_query =
//         "INSERT INTO sections(form_id, title, description, seq_order) VALUES($1, $2, $3, $4) RETURNING section_id";
//       const section_values = [
//         form_id,
//         section.title,
//         section.description,
//         section.seq_order,
//       ];
//       const section_result = await pool.query(section_query, section_values);

//       const section_id = section_result.rows[0].section_id;

//       for (const item of section.items) {
//         const item_query =
//           "INSERT INTO items(form_id, title, description, kind) VALUES($1, $2, $3, $4) RETURNING item_id";
//         const item_values = [form_id, item.title, item.description, item.kind];
//         const item_result = await pool.query(item_query, item_values);

//         if (item.kind === "questionItem" && item.question) {
//           const question_query =
//             "INSERT INTO questions(required, kind) VALUES($1, $2) RETURNING question_id";
//           const question_values = [item.question.required, item.question.kind];
//           const question_result = await pool.query(
//             question_query,
//             question_values
//           );

//           const question_item_query =
//             "INSERT INTO question_items(item_id, question_id) VALUES($1, $2)";
//           await pool.query(question_item_query, [
//             item_result.rows[0].item_id,
//             question_result.rows[0].question_id,
//           ]);

//         }
//       }
//     }

//     await pool.query("COMMIT");
//     res.status(200).json({
//       message: "Form updated successfully",
//       formId: form_id,
//     });

//   } catch (error) {
//     await pool.query("ROLLBACK");
//     console.error("Error during form update:", error);
//     const errorMessage = (error as Error).message;
//     res.status(500).send(errorMessage);
//   }
// };

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

    let settings_id = null;
    // Handling quiz settings
    if (settings && settings.hasOwnProperty("is_quiz")) {
      // Check if form_settings already exists for this form
      const settingsExistQuery =
        "SELECT settings_id FROM forms WHERE form_id = $1";
      const settingsExist = await pool.query(settingsExistQuery, [form_id]);

      if (settingsExist.rows.length > 0) {
        settings_id = settingsExist.rows[0].settings_id;
        // Update existing quiz_settings linked through form_settings
        const updateQuizSettingsQuery = `
          UPDATE quiz_settings SET is_quiz = $1 
          WHERE quiz_settings_id = (SELECT quiz_settings_id FROM form_settings WHERE settings_id = $2)
          RETURNING quiz_settings_id`;
        const updatedSettings = await pool.query(updateQuizSettingsQuery, [
          settings.is_quiz,
          settings_id,
        ]);
      } else {
        // Create new quiz_settings and link it through new form_settings
        const newQuizSettingsQuery =
          "INSERT INTO quiz_settings (is_quiz) VALUES ($1) RETURNING quiz_settings_id";
        const quizSettingsResult = await pool.query(newQuizSettingsQuery, [
          settings.is_quiz,
        ]);

        const newFormSettingsQuery =
          "INSERT INTO form_settings (quiz_settings_id) VALUES ($1) RETURNING settings_id";
        const formSettingsResult = await pool.query(newFormSettingsQuery, [
          quizSettingsResult.rows[0].quiz_settings_id,
        ]);
        settings_id = formSettingsResult.rows[0].settings_id;

        // Link the new form_settings to the form
        const updateFormQuery =
          "UPDATE forms SET settings_id = $1 WHERE form_id = $2";
        await pool.query(updateFormQuery, [settings_id, form_id]);
      }
    }

    // Process sections and items
    for (const section of sections) {
      const sectionResult = await pool.query(
        "INSERT INTO sections (form_id, title, description, seq_order) VALUES ($1, $2, $3, $4) ON CONFLICT (form_id, seq_order) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description RETURNING section_id",
        [form_id, section.title, section.description, section.seq_order]
      );

      for (const item of section.items) {
        const itemResult = await pool.query(
          "INSERT INTO items (form_id, title, description, kind) VALUES ($1, $2, $3, $4) ON CONFLICT (form_id, title) DO UPDATE SET description = EXCLUDED.description, kind = EXCLUDED.kind RETURNING item_id",
          [form_id, item.title, item.description, item.kind]
        );
      }
    }

    // Fetch updated form details
    const detailedFormQuery = `
      SELECT 
        f.form_id, fi.title, fi.description, fs.settings_id, qs.is_quiz,
        json_agg(json_build_object(
          'section_id', s.section_id, 'title', s.title, 'description', s.description
        )) AS sections
      FROM forms f
      LEFT JOIN form_info fi ON f.info_id = fi.info_id
      LEFT JOIN form_settings fs ON f.settings_id = fs.settings_id
      LEFT JOIN quiz_settings qs ON fs.quiz_settings_id = qs.quiz_settings_id
      LEFT JOIN sections s ON f.form_id = s.form_id
      WHERE f.form_id = $1
      GROUP BY f.form_id, fi.title, fi.description, fs.settings_id, qs.is_quiz;
    `;
    const formDetails = await pool.query(detailedFormQuery, [form_id]);

    await pool.query("COMMIT");

    res.status(200).json({
      message: "Form updated successfully",
      formDetails: formDetails.rows.length > 0 ? formDetails.rows[0] : {},
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error during form update:", error);
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};
