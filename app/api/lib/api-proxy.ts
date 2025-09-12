// Utility for proxying API requests to backend with proper error handling

export async function proxyToBackend(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL;
  
  // If no backend URL is configured, return a helpful error
  if (!backendUrl) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Backend not configured',
        message: 'NEXT_PUBLIC_API_URL environment variable is not set. Please configure your NikCLI backend server URL.',
        config: {
          required: 'NEXT_PUBLIC_API_URL',
          example: 'https://your-nikcli-backend.com/api/v1'
        }
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Ensure the URL has a protocol
  let fullBackendUrl = backendUrl;
  if (!backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
    fullBackendUrl = `https://${backendUrl}`;
  }

  try {
    const response = await fetch(`${fullBackendUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Backend returned non-JSON response',
          message: 'The backend server is not responding with valid JSON. Please check if your NikCLI backend server is running correctly.',
          details: `Expected JSON, got: ${contentType || 'unknown content type'}`
        }),
        { 
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Try to parse JSON
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON response from backend',
          message: 'The backend server returned invalid JSON. Please check if your NikCLI backend server is running correctly.',
          details: jsonError instanceof Error ? jsonError.message : 'JSON parsing failed'
        }),
        { 
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify(data),
      { 
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to connect to backend',
        message: 'Please ensure your NikCLI backend server is running and NEXT_PUBLIC_API_URL is configured correctly.',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}