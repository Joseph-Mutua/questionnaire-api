import { Router } from "express";
import { createForm } from "../controllers/formController";
import { authenticateUser } from "../middleware/auth";

const router = Router();


router.post("/", authenticateUser, createForm);

export default router;