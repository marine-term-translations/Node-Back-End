import express from 'express';
import { TranslationService } from '../services/translationService.js';
import { ERROR_MESSAGES, STATUS_CODES } from '../utils/constants.js';
import { validateBodyFields } from '../middleware/validation.js';

const router = express.Router();

/**
 * POST /api/translation/suggestions
 * Get translation suggestions for given text
 * #swagger.tags = ['Translation']
 * #swagger.description = 'Get AI-powered translation suggestions for given text'
 * #swagger.parameters['body'] = {
 *   in: 'body',
 *   description: 'Text to translate and target language',
 *   required: true,
 *   schema: {
 *     type: 'object',
 *     required: ['text', 'target'],
 *     properties: {
 *       text: {
 *         type: 'string',
 *         description: 'Text to be translated'
 *       },
 *       target: {
 *         type: 'string',
 *         description: 'Target language code (e.g., "en", "fr", "es")'
 *       }
 *     }
 *   }
 * }
 * #swagger.responses[200] = {
 *   description: 'Translation suggestions retrieved successfully',
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       suggestion: { type: 'string', description: 'Translated text suggestion' },
 *       confidence: { type: 'number', description: 'Translation confidence score' }
 *     }
 *   }
 * }
 */
router.post("/suggestions", validateBodyFields(['text', 'target']), async (req, res) => {
  // #swagger.tags = ['Translation']
  // #swagger.description = 'Get AI-powered translation suggestions for given text'
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