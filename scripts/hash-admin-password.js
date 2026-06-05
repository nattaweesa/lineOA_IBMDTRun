const { pbkdf2Sync, randomBytes } = require("node:crypto");
const { createInterface } = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const ITERATIONS = 310000;
const HASH_BYTES = 32;

async function main() {
  const password = process.argv[2];
  let value = password;

  if (!value) {
    const rl = createInterface({ input, output });
    value = await rl.question("Admin password: ");
    rl.close();
  }

  if (!value || value.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }

  const salt = randomBytes(16);
  const hash = pbkdf2Sync(value, salt, ITERATIONS, HASH_BYTES, "sha256");
  console.log(`pbkdf2-sha256$${ITERATIONS}$${salt.toString("base64url")}$${hash.toString("base64url")}`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
