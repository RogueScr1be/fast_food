export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;
    
    if (!message) {
      return new Response('Message is required', { status: 400 });
    }

    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate a response based on the message
    let response = "I'm here to help! What else would you like to know?";
    
    if (message.toLowerCase().includes('weather')) {
      return Response.json({
        type: 'weather',
        temp: 22,
        condition: 'Rain Showers',
        location: 'San Francisco',
        text: 'It will rain in 1 hour, I recommend taking an umbrella'
      });
    } else if (message.toLowerCase().includes('tired') || message.toLowerCase().includes('sleep')) {
      response = "Getting quality sleep is essential. Try to maintain a consistent sleep schedule and create a relaxing bedtime routine.";
    } else if (message.toLowerCase().includes('stress') || message.toLowerCase().includes('anxious')) {
      response = "Deep breathing exercises can help reduce stress. Try inhaling for 4 counts, holding for 4, and exhaling for 6.";
    } else if (message.toLowerCase().includes('food') || message.toLowerCase().includes('eat')) {
      response = "Nourishing your body with healthy foods can boost your energy. Try incorporating more fruits, vegetables, and whole grains into your diet.";
    } else if (message.toLowerCase().includes('burned out') || message.toLowerCase().includes('recharging')) {
      response = "How about a rejuvenating walk outside? It's a great way to refresh your mind and uplift your spirits.";
    }
    
    return Response.json({ text: response });
  } catch (error) {
    console.error('Error processing chat message:', error);
    return new Response('Internal server error', { status: 500 });
  }
}