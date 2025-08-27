import express from 'express';
import { TranslationService } from '../services/translationService.js';
import { ERROR_MESSAGES, STATUS_CODES } from '../utils/constants.js';
import { validateBodyFields } from '../middleware/validation.js';

const router = express.Router();

/**
 * POST /api/translation/suggestions
 * Get translation suggestions for given text
 */
router.post("/suggestions", validateBodyFields(['text', 'target']), async (req, res) => {
  console.log(req.body);
  const { text, target } = req.body;

  try {
    const result = await TranslationService.getSuggestion(text, target);
    console.log(result.suggestion);
    res.json(result);
  } catch (error) {
    console.error("Error during translation:", error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      error: "Translation Error",
      message: ERROR_MESSAGES.TRANSLATION_ERROR,
    });
  }
});

export default router;