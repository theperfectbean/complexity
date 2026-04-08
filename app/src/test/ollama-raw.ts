import { Ollama } from 'ollama';

async function main() {
  const ollama = new Ollama({ host: 'http://192.168.0.114:11434' });
  try {
    console.log('Sending request for gemma4:e2b (this may take a while)...');
    const start = Date.now();
    const response = await ollama.chat({
      model: 'gemma4:e2b',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    });
    const duration = (Date.now() - start) / 1000;
    console.log(`Gemma success in ${duration}s:`, JSON.stringify(response.message.content));
  } catch (err) {
    console.error('Gemma raw failed:', err);
    process.exit(1);
  }
}
main();
