/**
 * OCR Providers Unit Tests
 */

import {
  MockOcrProvider,
  StubOcrProvider,
  GoogleVisionProvider,
  getOcrProvider,
  ocrExtractTextFromImageBase64,
  sanitizeRawText,
  MOCK_KEYS,
  MAX_RAW_TEXT_LENGTH,
} from '../ocr/providers';

describe('sanitizeRawText', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeRawText(null)).toBe('');
    expect(sanitizeRawText(undefined)).toBe('');
    expect(sanitizeRawText(123)).toBe('');
    expect(sanitizeRawText({})).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeRawText('  hello  ')).toBe('hello');
    expect(sanitizeRawText('\n\ttext\n')).toBe('text');
  });

  it('truncates to MAX_RAW_TEXT_LENGTH', () => {
    const longText = 'a'.repeat(MAX_RAW_TEXT_LENGTH + 1000);
    const result = sanitizeRawText(longText);
    expect(result.length).toBe(MAX_RAW_TEXT_LENGTH);
  });

  it('preserves text under limit', () => {
    const shortText = 'hello world';
    expect(sanitizeRawText(shortText)).toBe(shortText);
  });
});

describe('MockOcrProvider', () => {
  const provider = new MockOcrProvider();

  it('has correct name', () => {
    expect(provider.name).toBe('mock');
  });

  describe('mock key: FULL', () => {
    it('returns full receipt text', async () => {
      const result = await provider.extractText(MOCK_KEYS.FULL);
      
      expect(result.error).toBeUndefined();
      expect(result.rawText).toContain('GROCERY MART');
      expect(result.rawText).toContain('Chicken Breast');
      expect(result.rawText).toContain('$8.99');
      expect(result.rawText).toContain('TOTAL');
    });
  });

  describe('mock key: PARTIAL', () => {
    it('returns partial receipt text', async () => {
      const result = await provider.extractText(MOCK_KEYS.PARTIAL);
      
      expect(result.error).toBeUndefined();
      expect(result.rawText).toContain('Rice');
      expect(result.rawText).toContain('Beans');
      expect(result.rawText).toContain('partially obscured');
    });
  });

  describe('mock key: EMPTY', () => {
    it('returns empty text', async () => {
      const result = await provider.extractText(MOCK_KEYS.EMPTY);
      
      expect(result.error).toBeUndefined();
      expect(result.rawText).toBe('');
    });
  });

  describe('mock key: ERROR', () => {
    it('returns error result', async () => {
      const result = await provider.extractText(MOCK_KEYS.ERROR);
      
      expect(result.rawText).toBe('');
      expect(result.error).toBe('Mock OCR error for testing');
    });
  });

  describe('mock key: DUPLICATE', () => {
    it('returns same text as FULL', async () => {
      const fullResult = await provider.extractText(MOCK_KEYS.FULL);
      const duplicateResult = await provider.extractText(MOCK_KEYS.DUPLICATE);
      
      expect(duplicateResult.rawText).toBe(fullResult.rawText);
    });
  });

  describe('unknown input', () => {
    it('returns default mock receipt', async () => {
      const result = await provider.extractText('random-base64-data');
      
      expect(result.error).toBeUndefined();
      expect(result.rawText).toContain('DEFAULT MOCK RECEIPT');
    });
  });
});

describe('StubOcrProvider', () => {
  it('has correct name', () => {
    const provider = new StubOcrProvider();
    expect(provider.name).toBe('stub');
  });

  it('returns error with default message', async () => {
    const provider = new StubOcrProvider();
    const result = await provider.extractText('any-image');
    
    expect(result.rawText).toBe('');
    expect(result.error).toBe('OCR provider not configured');
  });

  it('returns error with custom message', async () => {
    const provider = new StubOcrProvider('Custom error message');
    const result = await provider.extractText('any-image');
    
    expect(result.rawText).toBe('');
    expect(result.error).toBe('Custom error message');
  });
});

describe('GoogleVisionProvider', () => {
  // These tests mock the fetch function to avoid network calls
  
  const originalFetch = global.fetch;
  
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('has correct name', () => {
    const provider = new GoogleVisionProvider('test-key');
    expect(provider.name).toBe('google_vision');
  });

  it('sends correct request format', async () => {
    let capturedRequest: { url: string; body: string } | null = null;
    
    global.fetch = jest.fn().mockImplementation(async (url: string, options: RequestInit) => {
      capturedRequest = { url, body: options.body as string };
      return {
        ok: true,
        json: async () => ({
          responses: [{
            fullTextAnnotation: { text: 'Test text' },
          }],
        }),
      };
    });
    
    const provider = new GoogleVisionProvider('test-api-key', 'https://custom.endpoint.com');
    await provider.extractText('base64-image-data');
    
    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.url).toBe('https://custom.endpoint.com?key=test-api-key');
    
    const body = JSON.parse(capturedRequest!.body);
    expect(body.requests[0].image.content).toBe('base64-image-data');
    expect(body.requests[0].features[0].type).toBe('TEXT_DETECTION');
  });

  it('extracts text from fullTextAnnotation', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responses: [{
          fullTextAnnotation: { text: 'Full annotation text' },
        }],
      }),
    });
    
    const provider = new GoogleVisionProvider('test-key');
    const result = await provider.extractText('image');
    
    expect(result.rawText).toBe('Full annotation text');
    expect(result.error).toBeUndefined();
  });

  it('falls back to textAnnotations[0]', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responses: [{
          textAnnotations: [{ description: 'First annotation' }],
        }],
      }),
    });
    
    const provider = new GoogleVisionProvider('test-key');
    const result = await provider.extractText('image');
    
    expect(result.rawText).toBe('First annotation');
  });

  it('handles API error response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });
    
    const provider = new GoogleVisionProvider('test-key');
    const result = await provider.extractText('image');
    
    expect(result.rawText).toBe('');
    expect(result.error).toContain('403');
  });

  it('handles response-level error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responses: [{
          error: { message: 'Image too large' },
        }],
      }),
    });
    
    const provider = new GoogleVisionProvider('test-key');
    const result = await provider.extractText('image');
    
    expect(result.rawText).toBe('');
    expect(result.error).toBe('Image too large');
  });

  it('handles network exception', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    
    const provider = new GoogleVisionProvider('test-key');
    const result = await provider.extractText('image');
    
    expect(result.rawText).toBe('');
    expect(result.error).toBe('Network error');
  });
});

describe('getOcrProvider', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  
  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns MockOcrProvider in test environment', () => {
    process.env.NODE_ENV = 'test';
    
    const provider = getOcrProvider();
    expect(provider.name).toBe('mock');
  });

  it('returns StubOcrProvider when OCR_PROVIDER not set', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.OCR_PROVIDER;
    
    const provider = getOcrProvider();
    expect(provider.name).toBe('stub');
  });

  it('returns StubOcrProvider when google_vision but no API key', () => {
    process.env.NODE_ENV = 'production';
    process.env.OCR_PROVIDER = 'google_vision';
    delete process.env.OCR_API_KEY;
    
    const provider = getOcrProvider();
    expect(provider.name).toBe('stub');
  });

  it('returns GoogleVisionProvider when properly configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.OCR_PROVIDER = 'google_vision';
    process.env.OCR_API_KEY = 'test-key';
    
    const provider = getOcrProvider();
    expect(provider.name).toBe('google_vision');
  });

  it('returns StubOcrProvider when OCR_PROVIDER is none', () => {
    process.env.NODE_ENV = 'production';
    process.env.OCR_PROVIDER = 'none';
    
    const provider = getOcrProvider();
    expect(provider.name).toBe('stub');
  });
});

describe('ocrExtractTextFromImageBase64', () => {
  it('uses mock provider in test environment and returns deterministic results', async () => {
    // In test env, should use MockOcrProvider
    const result = await ocrExtractTextFromImageBase64(MOCK_KEYS.FULL);
    
    expect(result.rawText).toContain('Chicken Breast');
    expect(result.rawText).toContain('$8.99');
  });
});
