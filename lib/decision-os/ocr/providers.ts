/**
 * OCR Provider System
 * 
 * Provides OCR text extraction with multiple provider backends:
 * - RealOcrProvider: Google Cloud Vision API (production)
 * - MockOcrProvider: Deterministic mock for tests
 * - StubOcrProvider: Fallback that returns controlled error
 * 
 * Provider selection:
 * - Test env (NODE_ENV=test): MockOcrProvider
 * - Production with OCR_PROVIDER=google_vision + OCR_API_KEY: RealOcrProvider
 * - Otherwise: StubOcrProvider (returns status='failed')
 */

/**
 * OCR extraction result
 */
export interface OcrResult {
  rawText: string;
  error?: string;
}

/**
 * Base OCR provider interface
 */
export interface OcrProvider {
  name: string;
  extractText(imageBase64: string): Promise<OcrResult>;
}

/**
 * Maximum raw text length (50k chars) to prevent DB blowups
 */
export const MAX_RAW_TEXT_LENGTH = 50000;

/**
 * Sanitize raw text - ensure string, trim, limit length
 */
export function sanitizeRawText(text: unknown): string {
  if (typeof text !== 'string') {
    return '';
  }
  const trimmed = text.trim();
  if (trimmed.length > MAX_RAW_TEXT_LENGTH) {
    return trimmed.substring(0, MAX_RAW_TEXT_LENGTH);
  }
  return trimmed;
}

// =============================================================================
// MOCK OCR PROVIDER (Test environment)
// =============================================================================

/**
 * Mock keys for deterministic test behavior
 */
export const MOCK_KEYS = {
  /**
   * Full receipt with multiple items, high confidence
   */
  FULL: 'MOCK_KEY_FULL',
  
  /**
   * Partial receipt with some items, medium confidence
   */
  PARTIAL: 'MOCK_KEY_PARTIAL',
  
  /**
   * Empty/unreadable receipt
   */
  EMPTY: 'MOCK_KEY_EMPTY',
  
  /**
   * Duplicate receipt (same items as FULL)
   */
  DUPLICATE: 'MOCK_KEY_DUPLICATE',
  
  /**
   * Receipt that causes OCR failure
   */
  ERROR: 'MOCK_KEY_ERROR',
} as const;

/**
 * Mock OCR responses for deterministic testing
 */
const MOCK_RESPONSES: Record<string, OcrResult> = {
  [MOCK_KEYS.FULL]: {
    rawText: `GROCERY MART
123 Main Street
Date: 01/20/2026

Chicken Breast    $8.99
Pasta             $1.99
Tomatoes          $2.49
Garlic            $0.99
Olive Oil         $4.99
Parmesan Cheese   $5.99

SUBTOTAL         $25.44
TAX               $2.04
TOTAL            $27.48

Thank you for shopping!`,
  },
  [MOCK_KEYS.PARTIAL]: {
    rawText: `STORE RECEIPT
Date: 01/20/2026

Rice              $3.99
Beans             $1.49
... (partially obscured)

TOTAL            $5.48`,
  },
  [MOCK_KEYS.EMPTY]: {
    rawText: '',
  },
  [MOCK_KEYS.DUPLICATE]: {
    rawText: `GROCERY MART
123 Main Street
Date: 01/20/2026

Chicken Breast    $8.99
Pasta             $1.99
Tomatoes          $2.49
Garlic            $0.99
Olive Oil         $4.99
Parmesan Cheese   $5.99

SUBTOTAL         $25.44
TAX               $2.04
TOTAL            $27.48

Thank you for shopping!`,
  },
  [MOCK_KEYS.ERROR]: {
    rawText: '',
    error: 'Mock OCR error for testing',
  },
};

/**
 * Mock OCR provider for deterministic testing.
 * Uses mock keys embedded in base64 data to return consistent results.
 */
export class MockOcrProvider implements OcrProvider {
  name = 'mock';
  
  async extractText(imageBase64: string): Promise<OcrResult> {
    // Check for mock keys in the input
    for (const [key, response] of Object.entries(MOCK_RESPONSES)) {
      if (imageBase64.includes(key)) {
        if (response.error) {
          return { rawText: '', error: response.error };
        }
        return { rawText: sanitizeRawText(response.rawText) };
      }
    }
    
    // Default response for unknown inputs
    return {
      rawText: `DEFAULT MOCK RECEIPT
Date: 01/20/2026
Item 1            $1.99
TOTAL             $1.99`,
    };
  }
}

// =============================================================================
// STUB OCR PROVIDER (Fallback when real provider unavailable)
// =============================================================================

/**
 * Stub OCR provider that returns a controlled error.
 * Used when:
 * - OCR_PROVIDER is set but OCR_API_KEY is missing
 * - Unknown OCR_PROVIDER value
 */
export class StubOcrProvider implements OcrProvider {
  name = 'stub';
  
  constructor(private reason: string = 'OCR provider not configured') {}
  
  async extractText(_imageBase64: string): Promise<OcrResult> {
    return {
      rawText: '',
      error: this.reason,
    };
  }
}

// =============================================================================
// REAL OCR PROVIDER (Google Cloud Vision)
// =============================================================================

/**
 * Google Cloud Vision API response types
 */
interface GoogleVisionResponse {
  responses?: Array<{
    textAnnotations?: Array<{
      description?: string;
    }>;
    fullTextAnnotation?: {
      text?: string;
    };
    error?: {
      message?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

/**
 * Real OCR provider using Google Cloud Vision API.
 * 
 * Requires:
 * - OCR_API_KEY environment variable
 * - Optional OCR_ENDPOINT for custom endpoint
 */
export class GoogleVisionProvider implements OcrProvider {
  name = 'google_vision';
  
  private apiKey: string;
  private endpoint: string;
  
  constructor(apiKey: string, endpoint?: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint || 'https://vision.googleapis.com/v1/images:annotate';
  }
  
  async extractText(imageBase64: string): Promise<OcrResult> {
    try {
      // Build request body
      const requestBody = {
        requests: [
          {
            image: {
              content: imageBase64,
            },
            features: [
              {
                type: 'TEXT_DETECTION',
                maxResults: 1,
              },
            ],
          },
        ],
      };
      
      // Make API call
      const url = `${this.endpoint}?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        // Dev-only log (single line, no text contents)
        if (process.env.NODE_ENV === 'development') {
          console.log(`[OCR] Google Vision API error: ${response.status}`);
        }
        return {
          rawText: '',
          error: `Google Vision API error: ${response.status}`,
        };
      }
      
      const data: GoogleVisionResponse = await response.json();
      
      // Check for API-level error
      if (data.error) {
        return {
          rawText: '',
          error: data.error.message || 'Unknown Google Vision error',
        };
      }
      
      // Check for response-level error
      if (data.responses?.[0]?.error) {
        return {
          rawText: '',
          error: data.responses[0].error.message || 'Unknown error in response',
        };
      }
      
      // Extract text from response
      const fullText = data.responses?.[0]?.fullTextAnnotation?.text || 
                       data.responses?.[0]?.textAnnotations?.[0]?.description || '';
      
      return {
        rawText: sanitizeRawText(fullText),
      };
    } catch (error) {
      // Best-effort: return error, don't throw
      const message = error instanceof Error ? error.message : 'Unknown OCR error';
      
      // Dev-only log
      if (process.env.NODE_ENV === 'development') {
        console.log(`[OCR] Exception: ${message.substring(0, 100)}`);
      }
      
      return {
        rawText: '',
        error: message,
      };
    }
  }
}

// =============================================================================
// PROVIDER SELECTION
// =============================================================================

/**
 * Supported OCR provider names
 */
export type OcrProviderName = 'google_vision' | 'none';

/**
 * Get the configured OCR provider based on environment variables.
 * 
 * Selection logic:
 * 1. Test env (NODE_ENV=test): MockOcrProvider
 * 2. OCR_PROVIDER=google_vision + OCR_API_KEY present: GoogleVisionProvider
 * 3. OCR_PROVIDER=none: StubOcrProvider
 * 4. Otherwise: StubOcrProvider with appropriate error message
 */
export function getOcrProvider(): OcrProvider {
  // Test environment always uses mock
  if (process.env.NODE_ENV === 'test') {
    return new MockOcrProvider();
  }
  
  const providerName = process.env.OCR_PROVIDER;
  const apiKey = process.env.OCR_API_KEY;
  const endpoint = process.env.OCR_ENDPOINT;
  
  // Google Vision provider
  if (providerName === 'google_vision') {
    if (!apiKey) {
      return new StubOcrProvider('OCR_API_KEY not configured for google_vision');
    }
    return new GoogleVisionProvider(apiKey, endpoint);
  }
  
  // Explicitly disabled
  if (providerName === 'none') {
    return new StubOcrProvider('OCR is disabled');
  }
  
  // Default: stub provider
  return new StubOcrProvider('OCR_PROVIDER not configured');
}

/**
 * Extract text from a base64-encoded image using the configured provider.
 * 
 * This is the main entry point for OCR operations.
 * Never throws - returns error in result object.
 */
export async function ocrExtractTextFromImageBase64(imageBase64: string): Promise<OcrResult> {
  const provider = getOcrProvider();
  return provider.extractText(imageBase64);
}
