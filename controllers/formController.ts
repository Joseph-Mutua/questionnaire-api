import { Request, Response } from "express";
import { pool } from "../config/db";

export const getForms = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM forms WHERE owner_id = $1",
      [req.body.user.id]
    );
    res.json(rows);
  } catch (error) {
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};

export const createForm = async (req: Request, res: Response) => {
  const { title, description, ownerId } = req.body;
  try {
    const { rows } = await pool.query(
      "INSERT INTO forms (title, description, owner_id) VALUES ($1, $2, $3) RETURNING *",
      [title, description, ownerId]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};

export const updateForm = async (req: Request, res: Response) => {
  const { title, description } = req.body;
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      "UPDATE forms SET title = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      [title, description, id]
    );

    res.json(rows[0]);
  } catch (error) {
    const errorMessage = (error as Error).message;

    res.status(500).send(errorMessage);
  }
};

export const deleteForm = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await pool.query("DELETE FROM forms WHERE id = $1", [id]);
    res.status(204).send();
  } catch (error) {
    const errorMessage = (error as Error).message;
    res.status(500).send(errorMessage);
  }
};
