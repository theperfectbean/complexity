import { createOllama } from 'ai-sdk-ollama';
import { generateText } from 'ai';

async function main() {
  // ai-sdk-ollama usually appends /api itself or expects the base URL.
  const ollama = createOllama({ baseURL: 'http://192.168.0.114:11434/api' });
  try {
    const { text } = await generateText({
      model: ollama('llama3.2'),
      prompt: 'hi',
    });
    console.log('Ollama probe success:', text);
  } catch (err) {
    console.error('Ollama probe failed:', err);
    // Try without /api
    console.log('Retrying without /api suffix...');
    const ollama2 = createOllama({ baseURL: 'http://192.168.0.114:11434' });
    try {
        const { text } = await generateText({
            model: ollama2('llama3.2'),
            prompt: 'hi',
        });
        console.log('Ollama probe (no /api) success:', text);
    } catch (err2) {
        console.error('Ollama probe (no /api) failed:', err2);
        process.exit(1);
    }
  }
}
main();
