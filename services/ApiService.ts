import { Platform } from 'react-native';

/**
 * API Service with Authentication Support
 * 
 * Environment Variables (all EXPO_PUBLIC_ prefixed for client bundling):
 * 
 * - EXPO_PUBLIC_DECISION_OS_BASE_URL: Base URL for Decision OS API
 *   - dev: http://localhost:8081 (default)
 *   - preview: Vercel staging URL (set in eas.json secrets)
 *   - production: Vercel staging URL (set in eas.json secrets)
 * 
 * - EXPO_PUBLIC_STAGING_AUTH_TOKEN: Auth token for preview builds ONLY
 *   - NEVER set for production builds
 *   - Used for internal QA testing
 * 
 * - EXPO_PUBLIC_APP_VARIANT: Build variant (development|preview|production)
 *   - Used for conditional behavior
 * 
 * Authentication:
 * - Set authToken via setAuthToken() method
 * - Or set EXPO_PUBLIC_STAGING_AUTH_TOKEN env var for preview builds
 * - All requests to /api/decision-os/* will include Authorization header
 * - Production builds ship without baked-in token (will get 401 until login UI added)
 */
class ApiService {
  private baseUrl: string;
  private decisionOsBaseUrl: string;
  private authToken: string | null = null;
  private appVariant: string;

  constructor() {
    // Determine app variant
    this.appVariant = process.env.EXPO_PUBLIC_APP_VARIANT || 'development';
    
    // Use environment variable or fallback based on platform
    this.baseUrl = process.env.EXPO_PUBLIC_API_URL || this.getDefaultBaseUrl();
    
    // Single source of truth for Decision OS API base URL
    // In preview/production, this should be set via EAS secrets
    this.decisionOsBaseUrl = process.env.EXPO_PUBLIC_DECISION_OS_BASE_URL || this.baseUrl;
    
    // Auth token injection:
    // - EXPO_PUBLIC_STAGING_AUTH_TOKEN: For preview builds ONLY (internal QA)
    // - Production builds must NOT have a baked-in token
    if (this.appVariant === 'preview') {
      const stagingToken = process.env.EXPO_PUBLIC_STAGING_AUTH_TOKEN;
      if (stagingToken) {
        this.authToken = stagingToken;
      }
    }
    // Note: For production, authToken stays null until user logs in (future login UI)
  }

  /**
   * Set the authentication token for API requests
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  /**
   * Get current auth token (for debugging)
   */
  getAuthToken(): string | null {
    return this.authToken;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authToken !== null;
  }

  private getDefaultBaseUrl(): string {
    if (Platform.OS === 'web') {
      // For web development, use current origin for API routes
      if (typeof window !== 'undefined') {
        return window.location.origin;
      }
      return 'http://localhost:8081';
    } else if (Platform.OS === 'android') {
      // Android emulator uses 10.0.2.2 to access host machine
      return 'http://10.0.2.2:8081';
    } else {
      // iOS simulator can use localhost
      return 'http://localhost:8081';
    }
  }

  /**
   * Get the app variant (development, preview, production)
   */
  getAppVariant(): string {
    return this.appVariant;
  }

  /**
   * Get Decision OS base URL (for debugging)
   */
  getDecisionOsBaseUrl(): string {
    return this.decisionOsBaseUrl;
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    // Determine which base URL to use
    const isDecisionOsEndpoint = endpoint.startsWith('/api/decision-os/');
    const isApiRoute = endpoint.startsWith('/api/') || endpoint.startsWith('/health');
    
    let url: string;
    if (isDecisionOsEndpoint) {
      // Use Decision OS specific base URL (single source of truth)
      url = `${this.decisionOsBaseUrl}${endpoint}`;
    } else if (isApiRoute) {
      url = `${this.baseUrl}${endpoint}`;
    } else {
      url = `${this.baseUrl}/api/v1${endpoint}`;
    }
    
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Add Authorization header for Decision OS endpoints if token is available
    if (isDecisionOsEndpoint && this.authToken) {
      defaultHeaders['Authorization'] = `Bearer ${this.authToken}`;
    }

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      // Handle 401 gracefully (expected in production until login UI is added)
      if (response.status === 401 && isDecisionOsEndpoint) {
        const errorData = await response.json().catch(() => ({ error: 'unauthorized' }));
        // Don't crash - just throw a clean error that callers can handle
        throw new Error(errorData.error || 'unauthorized');
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Meal Planning APIs
  async generateMealPlan(userProfile: any): Promise<any> {
    try {
      // Try local API route first
      return await this.request<any>('/api/meal-plan', {
        method: 'POST',
        body: JSON.stringify(userProfile),
      });
    } catch (error) {
      // Fallback to external API if available
      return this.request<any>('/plan/generate', {
        method: 'POST',
        body: JSON.stringify(userProfile),
      });
    }
  }

  async processVoiceIntent(request: any): Promise<any> {
    try {
      // Try local API route first
      const response = await this.request<any>('/api/voice-intent', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      return response;
    } catch (error) {
      // Fallback to external API if available
      return this.request<any>('/plan/voice-intent', {
        method: 'POST',
        body: JSON.stringify(request),
      });
    }
  }

  // Recipe APIs
  async getRecipes(params?: { category?: string; search?: string }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.search) queryParams.append('search', params.search);
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    
    return this.request<any>(`/api/recipes${queryString}`);
  }

  async getRecipeById(id: string): Promise<any> {
    return this.request<any>(`/api/recipes/${id}`);
  }

  async createRecipe(recipeData: any): Promise<any> {
    return this.request<any>('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(recipeData),
    });
  }

  // Grocery APIs
  async getGroceryList(userProfileId: number): Promise<any> {
    try {
      return this.request(`/api/grocery/list?user_id=${userProfileId}`);
    } catch (error) {
      // Return empty list as fallback
      return {
        items: [],
        total_estimated_cost: 0,
        categories: {}
      };
    }
  }

  // Receipt APIs
  async processReceipt(request: any): Promise<any> {
    try {
      return this.request('/api/receipt/process', {
        method: 'POST',
        body: JSON.stringify(request),
      });
    } catch (error) {
      // Return mock receipt processing result
      const totalCost = request.items.reduce((sum: number, item: any) => sum + (item.price * (item.quantity || 1)), 0);
      return {
        suggestions: [
          `📄 Receipt processed: ${request.items.length} items, $${totalCost.toFixed(2)} total`,
          "🍝 Perfect! You can make pasta dishes with these ingredients",
          "💡 Tip: You saved ~$15 vs ordering takeout!"
        ],
        matched_ingredients: request.items.slice(0, 3).map((item: any) => item.name),
        missing_ingredients: ["herbs", "spices"],
        cost_analysis: {
          total_spent: totalCost,
          estimated_restaurant_cost: totalCost * 2.5,
          savings_vs_restaurant: totalCost * 1.5
        }
      };
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.request('/health');
  }

  // Test connection with better error handling
  async testConnection(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch (error) {
      // Log more detailed error information for debugging
      if (error instanceof Error) {
        console.error('API connection test failed:', {
          message: error.message,
          baseUrl: this.baseUrl,
          platform: Platform.OS
        });
      } else {
        console.error('API connection test failed with unknown error:', error);
      }
      return false;
    }
  }
}

export default new ApiService();