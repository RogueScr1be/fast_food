import { Platform } from 'react-native';

interface UserProfile {
  id?: number;
  adults: number;
  kids: number;
  favorites: string[];
  allergies: string[];
  time_preference: string;
  budget_per_serving: number;
  skip_nights: string[];
}

interface MealPlanItem {
  day: string;
  meal: string;
  cook_time: string;
  cost: string;
  ingredients: string[];
}

interface MealPlanResponse {
  meal_plan: MealPlanItem[];
  grocery_list: string[];
  total_cost: number;
  total_servings: number;
  estimated_savings: number;
}

interface VoiceIntentRequest {
  text: string;
  user_profile_id?: number;
  context?: Record<string, any>;
}

class OptimizedApiService {
  private baseUrl: string;
  private requestQueue = new Map<string, Promise<any>>();
  private retryAttempts = 3;
  private retryDelay = 1000;
  private cache = new Map<string, { data: any, timestamp: number, ttl: number }>();

  constructor() {
    this.baseUrl = process.env.EXPO_PUBLIC_API_URL || this.getDefaultBaseUrl();
  }

  private getDefaultBaseUrl(): string {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        return window.location.origin;
      }
      return 'http://localhost:8081';
    } else if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8081';
    } else {
      return 'http://localhost:8081';
    }
  }

  private getCacheKey(endpoint: string, options?: RequestInit): string {
    const method = options?.method || 'GET';
    const body = options?.body || '';
    return `${method}:${endpoint}:${body}`;
  }

  private async requestWithRetry<T>(
    endpoint: string,
    options: RequestInit = {},
    attempt: number = 1
  ): Promise<T> {
    try {
      const startTime = Date.now();
      const response = await this.makeRequest(endpoint, options);
      const duration = Date.now() - startTime;
      
      // Log slow requests
      if (duration > 1000) {
        console.warn(`🐌 Slow request: ${endpoint} took ${duration}ms`);
      }
      
      return response;
    } catch (error) {
      if (attempt < this.retryAttempts) {
        console.log(`🔄 Retrying request ${endpoint} (attempt ${attempt + 1})`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        return this.requestWithRetry(endpoint, options, attempt + 1);
      }
      throw error;
    }
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const isApiRoute = endpoint.startsWith('/api/') || endpoint.startsWith('/health');
    const url = isApiRoute ? `${this.baseUrl}${endpoint}` : `${this.baseUrl}/api/v1${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    useCache: boolean = true
  ): Promise<T> {
    const cacheKey = this.getCacheKey(endpoint, options);
    
    // Check cache for GET requests
    if (options.method === 'GET' || !options.method) {
      if (useCache && this.hasCache(cacheKey)) {
        console.log(`📦 Cache hit: ${endpoint}`);
        return this.getCache<T>(cacheKey)!;
      }
    }

    // Deduplicate identical requests
    if (this.requestQueue.has(cacheKey)) {
      console.log(`🔄 Deduplicating request: ${endpoint}`);
      return this.requestQueue.get(cacheKey);
    }

    const requestPromise = this.requestWithRetry<T>(endpoint, options);
    this.requestQueue.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache successful GET requests
      if ((options.method === 'GET' || !options.method) && useCache) {
        this.setCache(cacheKey, result, 5 * 60 * 1000); // 5 minutes
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Request failed: ${endpoint}`, error);
      throw error;
    } finally {
      this.requestQueue.delete(cacheKey);
    }
  }

  // Cache methods
  private hasCache(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    
    const now = Date.now();
    const isExpired = (now - item.timestamp) > item.ttl;
    
    if (isExpired) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
  
  private getCache<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    const now = Date.now();
    const isExpired = (now - item.timestamp) > item.ttl;
    
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  // Optimized meal plan generation with caching
  async generateMealPlan(userProfile: UserProfile): Promise<MealPlanResponse> {
    const cacheKey = `meal-plan:${JSON.stringify(userProfile)}`;
    
    if (this.hasCache(cacheKey)) {
      console.log('📦 Using cached meal plan');
      return this.getCache<MealPlanResponse>(cacheKey)!;
    }

    try {
      const result = await this.request<MealPlanResponse>('/api/meal-plan', {
        method: 'POST',
        body: JSON.stringify(userProfile),
      });
      
      // Cache for 10 minutes
      this.setCache(cacheKey, result, 10 * 60 * 1000);
      return result;
    } catch (error) {
      // Fallback to local generation
      return this.generateLocalMealPlan(userProfile);
    }
  }

  private generateLocalMealPlan(userProfile: UserProfile): MealPlanResponse {
    const localMeals = [
      {
        day: 'Monday',
        meal: '🌮 Quick Chicken Tacos',
        cook_time: '15 min',
        cost: '$12',
        ingredients: ['chicken breast', 'taco shells', 'lettuce', 'tomatoes']
      },
      {
        day: 'Tuesday',
        meal: '🍝 Creamy Garlic Pasta',
        cook_time: '20 min',
        cost: '$10',
        ingredients: ['pasta', 'garlic', 'cream', 'parmesan']
      },
      {
        day: 'Wednesday',
        meal: '🥗 Asian Stir Fry',
        cook_time: '12 min',
        cost: '$8',
        ingredients: ['mixed vegetables', 'soy sauce', 'rice']
      }
    ];

    const groceryList = Array.from(new Set(
      localMeals.flatMap(meal => meal.ingredients)
    ));

    return {
      meal_plan: localMeals,
      grocery_list: groceryList,
      total_cost: 30,
      total_servings: 12,
      estimated_savings: 24
    };
  }

  async processVoiceIntent(request: VoiceIntentRequest): Promise<MealPlanResponse> {
    try {
      const response = await this.request<any>('/api/voice-intent', {
        method: 'POST',
        body: JSON.stringify(request),
      }, false); // Don't cache voice intents
      
      return {
        meal_plan: response.meal_plan || [],
        grocery_list: response.grocery_list || [],
        total_cost: response.total_cost || 0,
        total_servings: response.total_servings || 0,
        estimated_savings: response.estimated_savings || 0
      };
    } catch (error) {
      // Fallback to basic response
      return this.generateLocalMealPlan({ adults: 2, kids: 0, favorites: [], allergies: [], time_preference: '30', budget_per_serving: 10, skip_nights: [] });
    }
  }

  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.request('/health', {}, false); // Don't cache health checks
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch (error) {
      console.error('API connection test failed:', error);
      return false;
    }
  }

  // Batch requests for better performance
  async batchRequests<T>(requests: Array<() => Promise<T>>): Promise<T[]> {
    const results = await Promise.allSettled(requests.map(req => req()));
    return results.map(result => 
      result.status === 'fulfilled' ? result.value : null
    ).filter(Boolean) as T[];
  }

  // Preload critical data
  async preloadCriticalData(userProfile: UserProfile): Promise<void> {
    const preloadTasks = [
      () => this.generateMealPlan(userProfile),
      () => this.testConnection(),
    ];

    await this.batchRequests(preloadTasks);
    console.log('🚀 Critical data preloaded');
  }

  // Get cache statistics for debugging
  getCacheStats() {
    const now = Date.now();
    let validItems = 0;
    let expiredItems = 0;
    let hits = 0;
    let misses = 0;

    this.cache.forEach((item) => {
      const isExpired = (now - item.timestamp) > item.ttl;
      if (isExpired) {
        expiredItems++;
      } else {
        validItems++;
      }
    });

    return {
      totalItems: this.cache.size,
      validItems,
      expiredItems,
      hitRate: hits / (hits + misses) || 0
    };
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }
}

export default new OptimizedApiService();
export type { UserProfile, MealPlanItem, MealPlanResponse, VoiceIntentRequest };