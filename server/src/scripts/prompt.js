import readline from 'node:readline';

/** Asks a question in the terminal. With `hidden`, what is typed is not shown (for passwords). */
export function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo only the prompt itself, never the characters typed.
      rl._writeToOutput = (text) => {
        if (text.includes(question)) process.stdout.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

/** Everything piped to stdin, for running a script without a terminal (e.g. `printf '%s\n' "$NEW" | ...`). */
export async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

/** "mongodb+srv://user:secret@host/db" -> "mongodb+srv://***@host/db", safe to print. */
export const safeUri = (uri) => uri.replace(/\/\/[^@/]+@/, '//***@');
