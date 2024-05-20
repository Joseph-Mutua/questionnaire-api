import { Router } from "express";
import createNewTemplate from "./createNewTemplate";
import createTemplateCategory from "./createTemplateCategory";
import deleteTemplate from "./deleteTemplate";
import getTemplate from "./getSpecificTemplate";
import getUserTemplates from "./getUserSpecificTemplates";
import getAllTemplates from "./getAllTemplates";
import updateTemplate from "./updateTemplate";
import getAllTemplateCategories from "./getAllTemplateCategories";
import editTemplateCategory from "./editTemplateCategory";
import deleteTemplateCategory from "./deleteTemplateCategory";

const router = Router();

router.use(createNewTemplate);
router.use(createTemplateCategory);
router.use(deleteTemplate);
router.use(getTemplate);
router.use(getAllTemplates);
router.use(getUserTemplates);
router.use(updateTemplate);
router.use(getAllTemplateCategories);
router.use(editTemplateCategory);
router.use(deleteTemplateCategory); 


export default router;