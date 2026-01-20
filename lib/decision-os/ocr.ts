/**
 * FAST FOOD: OCR Adapter
 * 
 * Extracts text from receipt images using OCR.
 * 
 * DESIGN:
 * - Injectable provider for testing (no network calls in tests)
 * - Deterministic mock for tests
 * - Integration stub for real providers (no keys in repo)
 * 
 * INVARIANTS:
 * - OCR failures are best-effort; do not break decision flow
 * - Raw text stored for audit
 */

// =============================================================================
// TYPES
// =============================================================================

export interface OcrResult {
  provider: string;
  rawText: string;
}

export interface OcrProvider {
  extractText(imageBase64: string): Promise<OcrResult>;
}

// =============================================================================
// MOCK OCR PROVIDER (for tests - deterministic)
// =============================================================================

/**
 * Deterministic mock OCR provider for testing.
 * Returns predictable output based on input patterns.
 */
export class MockOcrProvider implements OcrProvider {
  private mockResponses: Map<string, string> = new Map();
  
  constructor() {
    // Default mock responses based on input patterns
    this.setupDefaultMocks();
  }
  
  private setupDefaultMocks(): void {
    // These will be matched by prefix or contain checks
  }
  
  /**
   * Set a specific mock response for testing
   */
  setMockResponse(inputPattern: string, rawText: string): void {
    this.mockResponses.set(inputPattern, rawText);
  }
  
  /**
   * Clear all mock responses
   */
  clearMocks(): void {
    this.mockResponses.clear();
  }
  
  async extractText(imageBase64: string): Promise<OcrResult> {
    // Check for specific mock responses
    for (const [pattern, response] of this.mockResponses) {
      if (imageBase64.includes(pattern) || imageBase64 === pattern) {
        return { provider: 'mock', rawText: response };
      }
    }
    
    // Default deterministic response based on base64 length
    // This ensures tests are predictable
    const length = imageBase64.length;
    
    if (length < 100) {
      // Small/invalid image - return minimal receipt
      return {
        provider: 'mock',
        rawText: `GROCERY STORE
123 Main St
-----------
MILK 2% GAL     $3.99
BREAD WHL WHT   $2.49
-----------
SUBTOTAL        $6.48
TAX             $0.52
TOTAL           $7.00
VISA ****1234`,
      };
    }
    
    // Standard test receipt
    return {
      provider: 'mock',
      rawText: `SAFEWAY #1234
456 Oak Avenue
San Francisco, CA 94102
01/15/2026 5:32 PM

BANANAS 2.5 LB @ $0.59/LB    $1.48
ORG EGGS LRG DZ              $5.99
CHK BRST BNLS 1.2 LB         $7.49
GRND BF 80/20 1 LB           $6.99
TOM ROMA 3 CT                $2.99
MILK 2% GAL                  $4.29
BRD WHL WHT                  $3.49
BUTTER UNSLTED               $4.99
CHEESE CHDR SHRD             $3.99
PASTA SPGTI 16OZ             $1.89
MARINARA SCE 24OZ            $3.49
OLIVE OIL EVOO               $8.99
SALT IODIZED                 $1.29
BLACK PEPPER GRD             $3.49

SUBTOTAL                    $60.80
TAX                          $4.87
------------------------
TOTAL                       $65.67

VISA ************1234
AUTH: 123456
THANK YOU FOR SHOPPING!`,
    };
  }
}

// =============================================================================
// STUB OCR PROVIDER (for real integration - NO KEYS IN REPO)
// =============================================================================

/**
 * Stub for real OCR provider integration.
 * 
 * TODO: Implement with actual provider (Google Vision, AWS Textract, etc.)
 * 
 * REQUIREMENTS:
 * - API key must come from environment variable
 * - Never commit keys to repository
 * - Handle rate limits gracefully
 * - Return error result (not throw) on API failures
 */
export class StubOcrProvider implements OcrProvider {
  private apiKey: string | undefined;
  private providerName: string;
  
  constructor(providerName: string = 'google_vision') {
    this.providerName = providerName;
    // API key from environment - NEVER hardcode
    this.apiKey = process.env.OCR_API_KEY;
  }
  
  async extractText(imageBase64: string): Promise<OcrResult> {
    // Check if API key is configured
    if (!this.apiKey) {
      console.warn(`OCR provider ${this.providerName} not configured - using empty result`);
      return {
        provider: this.providerName,
        rawText: '',
      };
    }
    
    // TODO: Implement actual API call
    // Example for Google Vision:
    // const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${this.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     requests: [{
    //       image: { content: imageBase64 },
    //       features: [{ type: 'TEXT_DETECTION' }],
    //     }],
    //   }),
    // });
    
    // For now, return empty result (integration not implemented)
    console.warn(`OCR provider ${this.providerName} integration not yet implemented`);
    return {
      provider: this.providerName,
      rawText: '',
    };
  }
}

// =============================================================================
// FACTORY + INJECTION
// =============================================================================

/**
 * Current OCR provider instance (injectable for testing)
 */
let currentProvider: OcrProvider = new MockOcrProvider();

/**
 * Set the OCR provider (for dependency injection in tests)
 */
export function setOcrProvider(provider: OcrProvider): void {
  currentProvider = provider;
}

/**
 * Get the current OCR provider
 */
export function getOcrProvider(): OcrProvider {
  return currentProvider;
}

/**
 * Reset to default mock provider (for test cleanup)
 */
export function resetOcrProvider(): void {
  currentProvider = new MockOcrProvider();
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Extract text from a base64-encoded receipt image.
 * 
 * @param imageBase64 - Base64-encoded image data
 * @returns OCR result with provider name and raw text
 */
export async function ocrExtractTextFromImageBase64(
  imageBase64: string
): Promise<OcrResult> {
  try {
    return await currentProvider.extractText(imageBase64);
  } catch (error) {
    // OCR failures should not break the flow
    console.error('OCR extraction failed:', error);
    return {
      provider: 'error',
      rawText: '',
    };
  }
}

/**
 * Create a mock provider with a specific response (test helper)
 */
export function createMockOcrProviderWithResponse(rawText: string): MockOcrProvider {
  const provider = new MockOcrProvider();
  provider.setMockResponse('', rawText); // Match any input
  return provider;
}
