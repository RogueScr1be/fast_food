import { Platform } from 'react-native';

/**
 * API Service with Authentication Support
 * 
 * Authentication:
 * - Set authToken via setAuthToken() method
 * - Or set EXPO_PUBLIC_SUPABASE_ACCESS_TOKEN env var for dev
 * - All requests to /api/decision-os/* will include Authorization header
 */
class ApiService {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor() {
    // Use environment variable or fallback based on platform
    this.baseUrl = process.env.EXPO_PUBLIC_API_URL || this.getDefaultBaseUrl();
    
    // Check for dev auth token in environment
    const envToken = process.env.EXPO_PUBLIC_SUPABASE_ACCESS_TOKEN;
    if (envToken) {
      this.authToken = envToken;
    }
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

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    // For local API routes, use relative paths
    const isApiRoute = endpoint.startsWith('/api/') || endpoint.startsWith('/health');
    const url = isApiRoute ? `${this.baseUrl}${endpoint}` : `${this.baseUrl}/api/v1${endpoint}`;
    
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Add Authorization header for Decision OS endpoints if token is available
    const isDecisionOsEndpoint = endpoint.startsWith('/api/decision-os/');
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