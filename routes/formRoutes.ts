import { Router } from "express";
import { createForm, updateForm } from "../controllers/formController";
import { authenticateUser } from "../middleware/auth";

const router = Router();


router.post("/", authenticateUser, createForm);
router.patch("/forms/:id", authenticateUser, updateForm);

export default router;