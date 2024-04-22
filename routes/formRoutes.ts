import { Router } from "express";
import { createForm, deleteForm, getForm, getFormsByUser, updateForm } from "../controllers/formController";
import { authenticateUser } from "../middleware/auth";

const router = Router();

router.post("/", authenticateUser, createForm);
router.patch("/:id", authenticateUser, updateForm);

router.get("/:id", authenticateUser, getForm); 
router.delete("/:id", authenticateUser, deleteForm); 


export default router;