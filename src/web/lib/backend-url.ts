// Utility for handling backend URL configuration

export function getBackendUrl(): string | null {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL;
  
  if (!backendUrl) {
    return null;
  }

  // Ensure the URL has a protocol
  if (!backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
    return `https://${backendUrl}`;
  }

  return backendUrl;
}

export function validateBackendUrl(): { isValid: boolean; url: string | null; error?: string } {
  const url = getBackendUrl();
  
  if (!url) {
    return {
      isValid: false,
      url: null,
      error: 'NEXT_PUBLIC_API_URL environment variable is not set'
    };
  }

  try {
    new URL(url);
    return {
      isValid: true,
      url
    };
  } catch (error) {
    return {
      isValid: false,
      url,
      error: 'Invalid URL format'
    };
  }
}