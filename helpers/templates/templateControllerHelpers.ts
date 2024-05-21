import { Pool } from "pg";

export async function fetchTemplateDetails(
  pool: Pool,
  template_id: number,
) {
  const query = `SELECT t.template_id, t.category_id, t.owner_id, t.info_id, t.settings_id, t.is_public,
                fi.title AS form_title, fi.description AS form_description, 
                fs.update_window_hours, fs.wants_email_updates, 
                c.name AS category_name
         FROM templates t
         JOIN form_info fi ON t.info_id = fi.info_id
         JOIN form_settings fs ON t.settings_id = fs.settings_id
         JOIN template_categories c ON t.category_id = c.category_id
         WHERE t.template_id = $1`;

  const details = await pool.query<{ template_id: number }>(query, [template_id]);
  return details.rows.length ? details.rows[0] : null;
}


