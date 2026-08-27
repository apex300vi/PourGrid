const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('database verification applies every checked-in migration', () => {
  const migrationDir = path.join(root, 'supabase', 'migrations');
  const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'phase3-database-verification.yml'),
    'utf8'
  );
  const migrations = fs.readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const missing = migrations.filter((file) => !workflow.includes(`supabase/migrations/${file}`));
  assert.deepEqual(missing, [], `database workflow does not apply: ${missing.join(', ')}`);
});
