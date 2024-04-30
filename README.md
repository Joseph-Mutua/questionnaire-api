# Database Schema Documentation

## Entities and Attributes

### **Users**

- `userId` (PK)
- `email`
- `password`

### **Forms**

- `form_id` (PK)
- `ownerId` (FK to Users)
- `infoId` (FK to FormInfo)
- `revisionId`
- `responderUri`
- `settingsId` (FK to FormSettings)
- `createdAt`
- `updatedAt`

### **FormInfo**

- `infoId` (PK)
- `title`
- `description`

### **Sections**

- `sectionId` (PK)
- `form_id` (FK to Forms)
- `title`
- `description`
- `seq_order`

### **NavigationRules**

- `ruleId` (PK)
- `sectionId` (FK to Sections)
- `targetSectionId` (FK to Sections)
- `condition`

### **FormSettings**

- `settingsId` (PK)
- `quizSettingsId` (FK to QuizSettings)

### **QuizSettings**

- `quizSettingsId` (PK)
- `isQuiz`

### **Items**

- `itemId` (PK)
- `form_id` (FK to Forms)
- `title`
- `description`
- `kind` (Check: 'questionItem', 'questionGroupItem', 'pageBreakItem', 'textItem', 'imageItem', 'videoItem')

### **Questions**

- `questionId` (PK)
- `required`
- `kind` (Check: 'choiceQuestion', 'textQuestion', 'scaleQuestion', 'dateQuestion', 'timeQuestion', 'fileUploadQuestion', 'rowQuestion')
- `gradingId` (FK to Gradings)

### **QuestionItems**

- `itemId` (FK to Items, PK)
- `questionId` (FK to Questions)

### **ChoiceQuestions**

- `questionId` (FK to Questions, PK)
- `type` (Check: 'RADIO', 'CHECKBOX', 'DROP_DOWN')
- `shuffle`

### **Options**

- `optionId` (PK)
- `questionId` (FK to ChoiceQuestions)
- `value`
- `imageId` (FK to Images)
- `isOther`
- `gotoAction` (Check: 'NEXT_SECTION', 'RESTART_FORM', 'SUBMIT_FORM')
- `gotoSectionId`

### **Images**

- `imageId` (PK)
- `contentUri`
- `altText`
- `sourceUri`
- `propertiesId` (FK to MediaProperties)

### **Gradings**

- `gradingId` (PK)
- `pointValue`
- `whenRight` (FK to Feedbacks)
- `whenWrong` (FK to Feedbacks)
- `generalFeedback` (FK to Feedbacks)
- `answerKey`
- `autoFeedback`

### **Feedbacks**

- `feedbackId` (PK)
- `text`

### **CorrectAnswers**

- `answerId` (PK)
- `gradingId` (FK to Gradings)
- `value`

### **MediaProperties**

- `propertiesId` (PK)
- `alignment` (Check: 'LEFT', 'RIGHT', 'CENTER')
- `width` (Check: 0 <= width <= 740)

### **FormResponses**

- `responseId` (PK)
- `form_id` (FK to Forms)
- `createdAt`

### **Answers**

- `answerId` (PK)
- `responseId` (FK to FormResponses)
- `questionId` (FK to Questions)
- `value`

## Relationships

- **Users** to **Forms**: One-to-Many (A user can own multiple forms)
- **Forms** to **FormInfo**: Many-to-One (Each form is linked to one form info)
- **Forms** to **Sections**: One-to-Many (A form can have multiple sections)
- **Sections** to **NavigationRules**: One-to-Many (A section can have multiple navigation rules targeting other sections)
- **Forms** to **Items**: One-to-Many (A form can contain multiple items)
- **Items** to **QuestionItems**: One-to-One (Each item can be a question item)
- **Questions** to **ChoiceQuestions**: One-to-One (A question can be a choice question)
- **ChoiceQuestions** to **Options**: One-to-Many (A choice question can have multiple options)
- **Options** to **Images**: Many-to-One (An option can have one image)
- **Images** to **MediaProperties**: Many-to-One (An image can have one set of media properties)
- **Questions** to **Gradings**: One-to-One (Each question can have one grading)
- **Gradings** to **Feedbacks**: Many-to-One (Each grading can link to multiple feedbacks)
- **Gradings** to **CorrectAnswers**: One-to-Many (Each grading can have multiple correct answers)
- **Forms** to **FormResponses**: One-to-Many (A form can have multiple responses)
- **FormResponses** to **Answers**: One-to-Many (Each response can include multiple answers)

## ERD Diagram Sketch

Here is a simplified sketch of how these entities might be represented in an ERD:

[Users] --< [Forms] --< [Sections] --< [NavigationRules]
| | |
| | >-- [Items] --< [QuestionItems] --< [Questions] --< [ChoiceQuestions] --< [Options] --< [Images] --< [MediaProperties]
| | |
| >-- [FormInfo] >-- [Gradings] --< [Feedbacks]
| | | |
| >-- [FormSettings] --< [QuizSettings] >-- [CorrectAnswers]
| |

> -- [FormResponses] --< [Answers]
