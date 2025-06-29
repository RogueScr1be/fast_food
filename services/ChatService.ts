import { Platform } from 'react-native';

interface ChatMessage {
  id: number;
  text: string;
  isUser: boolean;
  type?: string;
  temp?: number;
  condition?: string;
  location?: string;
}

interface ChatResponse {
  text?: string;
  type?: string;
  temp?: number;
  condition?: string;
  location?: string;
}

class ChatService {
  private baseUrl: string;
  private messageId: number = 0;

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

  async sendMessage(message: string): Promise<ChatMessage> {
    try {
      // Create user message
      const userMessage: ChatMessage = {
        id: ++this.messageId,
        text: message,
        isUser: true
      };

      // Send to API
      const response = await this.callChatApi(message);
      
      // Create AI response message
      const aiMessage: ChatMessage = {
        id: ++this.messageId,
        text: response.text || '',
        isUser: false,
        type: response.type,
        temp: response.temp,
        condition: response.condition,
        location: response.location
      };

      return aiMessage;
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Fallback response
      return {
        id: ++this.messageId,
        text: "I'm having trouble connecting right now. Please try again later.",
        isUser: false
      };
    }
  }

  private async callChatApi(message: string): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API call failed:', error);
      
      // Generate fallback response
      if (message.toLowerCase().includes('weather')) {
        return {
          type: 'weather',
          temp: 22,
          condition: 'Rain Showers',
          location: 'San Francisco',
          text: 'It will rain in 1 hour, I recommend taking an umbrella'
        };
      }
      
      return { text: this.generateFallbackResponse(message) };
    }
  }

  private generateFallbackResponse(message: string): string {
    if (message.toLowerCase().includes('tired') || message.toLowerCase().includes('sleep')) {
      return "Getting quality sleep is essential. Try to maintain a consistent sleep schedule and create a relaxing bedtime routine.";
    } else if (message.toLowerCase().includes('stress') || message.toLowerCase().includes('anxious')) {
      return "Deep breathing exercises can help reduce stress. Try inhaling for 4 counts, holding for 4, and exhaling for 6.";
    } else if (message.toLowerCase().includes('food') || message.toLowerCase().includes('eat')) {
      return "Nourishing your body with healthy foods can boost your energy. Try incorporating more fruits, vegetables, and whole grains into your diet.";
    } else if (message.toLowerCase().includes('burned out') || message.toLowerCase().includes('recharging')) {
      return "How about a rejuvenating walk outside? It's a great way to refresh your mind and uplift your spirits.";
    }
    
    return "I'm here to help! What else would you like to know?";
  }

  generateSuggestions(context: string): string[] {
    if (context.toLowerCase().includes('sleep')) {
      return [
        "What foods help with sleep?",
        "How much sleep do I need?",
        "Bedtime routine ideas",
        "Sleep meditation techniques"
      ];
    } else if (context.toLowerCase().includes('stress')) {
      return [
        "Quick stress relief exercises",
        "Stress management apps",
        "How does stress affect health?",
        "Stress-reducing foods"
      ];
    } else if (context.toLowerCase().includes('food') || context.toLowerCase().includes('meal')) {
      return [
        "Healthy breakfast ideas",
        "Quick dinner recipes",
        "Foods for energy",
        "Meal prep tips"
      ];
    } else if (context.toLowerCase().includes('weather')) {
      return [
        "Will it be sunny tomorrow?",
        "Weather forecast for the weekend",
        "Do I need a jacket?",
        "Best time for outdoor activities"
      ];
    } else {
      return [
        "How can I reduce stress?",
        "Give me meditation tips",
        "Healthy meal ideas",
        "Help me sleep better"
      ];
    }
  }
}

export default new ChatService();