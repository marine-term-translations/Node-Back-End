import { translate } from "@vitalets/google-translate-api";
import { ERROR_MESSAGES } from '../utils/constants.js';

/**
 * Translation service for handling Google Translate API operations
 */
export class TranslationService {
  /**
   * Get translation suggestion for given text and target language
   */
  static async getSuggestion(text, target) {
    if (!text || !target) {
      throw new Error(ERROR_MESSAGES.TRANSLATION_FIELDS_REQUIRED);
    }

    try {
      const result = await translate(text, { to: target });
      return { suggestion: result.text };
    } catch (error) {
      console.error("Translation error:", error);
      throw new Error(ERROR_MESSAGES.TRANSLATION_ERROR);
    }
  }
}