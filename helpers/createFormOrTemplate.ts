import { Pool } from "pg";
import { fetchFormDetails } from "../helpers/forms/formControllerHelpers";
import HttpError from "../utils/httpError";

interface CreateFormDetails {
  title: string;
  description: string;
  category_id?: number;
  is_public?: boolean;
  is_quiz?: boolean;
}

interface CreateFormDetails {
  title: string;
  description: string;
  category_id?: number;
  is_public?: boolean;
  is_quiz?: boolean;
  media_properties?: Array<{
    media_type: string;
    url: string;
    description?: string;
  }>;
}

export const createFormOrTemplate = async (
  pool: Pool,
  user_id: number,
  formDetails: CreateFormDetails
) => {
  const {
    title,
    description,
    category_id,
    is_public,
    is_quiz,
    media_properties,
  } = formDetails;

  if (!user_id) throw new HttpError("User must be logged in.", 403);

  const isTemplate = category_id !== undefined;

  await pool.query("BEGIN");
  try {
    const formResult = await pool.query<{ form_id: number }>(
      `INSERT INTO forms (owner_id, title, description, category_id, is_public, is_quiz) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING form_id`,
      [
        user_id,
        title,
        description,
        category_id ?? null,
        is_public ?? true,
        is_quiz ?? false,
      ]
    );
    const form_id = formResult.rows[0].form_id;

    const ownerRole = "OWNER";

    const formUserRoleExist = await pool.query(
      "SELECT * FROM form_user_roles WHERE form_id = $1 AND user_id = $2 AND role = $3",
      [form_id, user_id, ownerRole]
    );

    if (formUserRoleExist.rows.length === 0) {
      await pool.query(
        "INSERT INTO form_user_roles (form_id, user_id, role) VALUES ($1, $2, $3)",
        [form_id, user_id, ownerRole]
      );
    }

    if (!isTemplate) {
      const versionResult = await pool.query<{ version_id: number }>(
        "INSERT INTO form_versions (form_id, revision_id, content, is_active) VALUES ($1, 'v1.0', $2::jsonb, TRUE) RETURNING version_id",
        [form_id, JSON.stringify(formDetails)]
      );
      const version_id = versionResult.rows[0].version_id;

      await pool.query(
        "UPDATE forms SET active_version_id = $1 WHERE form_id = $2",
        [version_id, form_id]
      );
    }

    if (media_properties) {
      for (const media of media_properties) {
        await pool.query(
          "INSERT INTO media_properties (form_id, media_type, url, description) VALUES ($1, $2, $3, $4)",
          [form_id, media.media_type, media.url, media.description ?? null]
        );
      }
    }

    await pool.query("COMMIT");

    const form = await fetchFormDetails(pool, form_id);

    return {
      message: isTemplate
        ? "Template created successfully"
        : "Form created successfully and version initialized.",
      form: form,
    };
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};