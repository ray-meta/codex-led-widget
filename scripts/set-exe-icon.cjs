const path = require('node:path');

async function main() {
  const { rcedit } = await import('rcedit');
  const root = path.resolve(__dirname, '..');
  const executable = path.join(root, 'dist', 'win-unpacked', 'Codex Quota Widget.exe');
  const icon = path.join(root, 'src', 'assets', 'icon.ico');
  await rcedit(executable, {
    icon,
    'file-version': '0.1.0.0',
    'product-version': '0.1.0.0',
    'version-string': {
      FileDescription: 'Codex Quota Widget',
      ProductName: 'Codex Quota Widget'
    }
  });
  console.log(`Updated executable icon: ${executable}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
