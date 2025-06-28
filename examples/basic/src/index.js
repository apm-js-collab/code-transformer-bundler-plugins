import { HttpClient, makeRequest } from 'http-client';

console.log('Starting HTTP client example...');

const client = new HttpClient();

async function runExample() {
  try {
    // Test class method instrumentation
    const response1 = await client.fetch('https://api.example.com/users');
    console.log('Fetch response:', response1);
    
    // Test another class method
    const response2 = await client.post('https://api.example.com/users', { name: 'John' });
    console.log('Post response:', response2);
    
    // Test function instrumentation
    const response3 = await makeRequest('https://api.example.com/posts');
    console.log('Function response:', response3);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

runExample();
