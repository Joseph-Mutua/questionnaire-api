import { Router } from "express";

import createFormFromTemplate from "./createFormFromTemplate";
import createNewTemplate from "./createNewTemplate";
import createTemplateCategory from "./createTemplateCategory";
import deleteTemplate from "./deleteTemplate";
import getTemplate from "./getSpecificTemplate";
import getUserTemplates from "./getUserSpecificTemplates";
import getAllTemplates from "./getAllTemplates";
import updateTemplate from "./updateTemplate";
import getAllTemplateCategories from "./getAllTemplateCategories";

const router = Router();

router.use(createFormFromTemplate);
router.use(createNewTemplate);
router.use(createTemplateCategory);
router.use(deleteTemplate);
router.use(getTemplate);
router.use(getAllTemplates);
router.use(getUserTemplates);
router.use(updateTemplate);
router.use(getAllTemplateCategories);


export default router;